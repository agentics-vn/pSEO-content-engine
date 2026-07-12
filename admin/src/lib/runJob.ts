import type { DataSource } from '../types';

/** Drain a job by re-invoking /run until remaining=0 or progress stalls. */
export async function drainJob(
  source: DataSource,
  jobId: string,
  onProgress?: (msg: string, err?: boolean) => void,
): Promise<boolean> {
  let last = Infinity;
  for (let round = 0; round < 30; round++) {
    const res = await source.runJob(jobId);
    if (!res.ok) {
      onProgress?.(res.error ?? 'run failed', true);
      return false;
    }
    const remaining = res.remaining ?? 0;
    if (remaining === 0) {
      onProgress?.('Job drained — batch gates ran');
      return true;
    }
    if (remaining >= last) {
      onProgress?.(`${remaining} items keep failing — see job log`, true);
      return false;
    }
    last = remaining;
    onProgress?.(`${remaining} items remaining…`);
  }
  onProgress?.('Run budget exhausted — try again', true);
  return false;
}
