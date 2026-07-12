import type { DataSource } from '../types';

const BATCH_POLL_MS = 20_000;
const BATCH_MAX_WAIT_MS = 60 * 60_000;
const SYNC_MAX_ROUNDS = 30;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isBatchActive(batchStatus?: string): boolean {
  return batchStatus === 'in_progress' || batchStatus === 'canceling';
}

/** Drain a job by re-invoking /run until remaining=0 or progress stalls. */
export async function drainJob(
  source: DataSource,
  jobId: string,
  onProgress?: (msg: string, err?: boolean) => void,
): Promise<boolean> {
  const started = Date.now();
  let last = Infinity;
  let syncRounds = 0;

  // Batch polls are wall-clock bounded (up to ~60m); sync keeps a round cap.
  while (true) {
    if (Date.now() - started > BATCH_MAX_WAIT_MS) {
      onProgress?.('Batch still running — click Run later to collect', true);
      return false;
    }

    const res = await source.runJob(jobId);
    if (!res.ok) {
      onProgress?.(res.error ?? 'run failed', true);
      return false;
    }

    const remaining = res.remaining ?? 0;
    if (remaining === 0 && !isBatchActive(res.batch_status)) {
      onProgress?.('Job drained — batch gates ran');
      return true;
    }

    const batchMode = res.channel === 'batch' || isBatchActive(res.batch_status);
    if (batchMode) {
      const counts = res.request_counts;
      const prog = counts
        ? `Batch ${counts.succeeded ?? 0}/${(counts.succeeded ?? 0) + (counts.processing ?? 0) + (counts.errored ?? 0)}`
        : 'Batch submitted';
      onProgress?.(`${prog} · ${remaining} pending…`);
      // Still waiting on Anthropic, or leftovers need a follow-up submit.
      if (isBatchActive(res.batch_status) || remaining > 0) {
        await sleep(BATCH_POLL_MS);
        continue;
      }
      onProgress?.('Job drained — batch gates ran');
      return true;
    }

    // Sync path: stall when remaining does not decrease.
    syncRounds++;
    if (syncRounds > SYNC_MAX_ROUNDS) {
      onProgress?.('Run budget exhausted — try again', true);
      return false;
    }
    if (remaining >= last) {
      onProgress?.(`${remaining} items keep failing — see job log`, true);
      return false;
    }
    last = remaining;
    onProgress?.(`${remaining} items remaining…`);
  }
}
