import type { GateResult, JobRow, ReviewItem } from '../types';

export const fmt = (n: number) => n.toLocaleString('en-US');
export const fmtK = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1000 ? `${Math.round(n / 1000)}k`
  : String(n);

export function prettyKey(itemKey: string): string {
  const m = /^so-chu-dao-(\d+)-su-menh-(\d+)$/.exec(itemKey);
  return m ? `Chủ đạo ${m[1]} × Sứ mệnh ${m[2]}` : itemKey;
}

/** Compact combo label for tight lists, e.g. "7×3". */
export function comboShortKey(itemKey: string): string {
  const m = /^so-chu-dao-(\d+)-su-menh-(\d+)$/.exec(itemKey);
  return m ? `${m[1]}×${m[2]}` : itemKey;
}

/** Life-path digit for the avatar circle in queue UIs. */
export function comboFace(itemKey: string): string {
  const m = /^so-chu-dao-(\d+)/.exec(itemKey);
  return m?.[1] ?? '•';
}

const SHORT_STATUS: Record<string, string> = {
  pending: 'Pending',
  generated: 'Generated',
  flagged: 'Flagged',
  failed_validation: 'Failed',
  approved: 'Approved',
  rejected: 'Rejected',
  published: 'Published',
};

export function shortStatus(status: string): string {
  return SHORT_STATUS[status] ?? status.replace(/_/g, ' ');
}

export function gatesOf(it: ReviewItem): GateResult[] {
  return [...(it.validation.gates ?? []), ...(it.validation.batch_gates ?? [])];
}

/** Anthropic list prices ($ / MTok). Haiku vs Sonnet-class. */
export function modelRates(model: string): { inPerM: number; outPerM: number } {
  if (/haiku/i.test(model)) return { inPerM: 1, outPerM: 5 };
  return { inPerM: 3, outPerM: 15 };
}

export type UsageChannel = 'batch' | 'sync';

/** Actual USD from recorded token usage. Batch channel uses half rates. */
export function actualCostUsd(
  tokensIn: number,
  tokensOut: number,
  model = 'claude-sonnet',
  channel: UsageChannel = 'sync',
): number {
  if (tokensIn <= 0 && tokensOut <= 0) return 0;
  const { inPerM, outPerM } = modelRates(model);
  const rateMul = channel === 'batch' ? 0.5 : 1;
  return (tokensIn * inPerM + tokensOut * outPerM) * rateMul / 1_000_000;
}

export function fmtUsd(n: number): string {
  if (n <= 0) return '—';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

/** Item-level actual cost using usage_channel when set. */
export function itemActualCostUsd(
  item: Pick<ReviewItem, 'tokens_in' | 'tokens_out' | 'usage_channel'>,
  model?: string,
): number {
  return actualCostUsd(
    item.tokens_in ?? 0,
    item.tokens_out ?? 0,
    model,
    (item.usage_channel as UsageChannel | undefined) ?? 'sync',
  );
}

/** Job actual cost: prefer channel token splits; else items; else run_channel × totals. */
export function jobActualCostUsd(
  job: Pick<JobRow, 'tokens_in' | 'tokens_out' | 'run_channel' | 'model'
    | 'tokens_in_batch' | 'tokens_out_batch' | 'tokens_in_sync' | 'tokens_out_sync'>,
  items?: Array<Pick<ReviewItem, 'tokens_in' | 'tokens_out' | 'usage_channel'>>,
): number {
  const bin = job.tokens_in_batch ?? 0;
  const bout = job.tokens_out_batch ?? 0;
  const sin = job.tokens_in_sync ?? 0;
  const sout = job.tokens_out_sync ?? 0;
  if (bin > 0 || bout > 0 || sin > 0 || sout > 0) {
    return actualCostUsd(bin, bout, job.model, 'batch')
      + actualCostUsd(sin, sout, job.model, 'sync');
  }
  if (items?.some((it) => (it.tokens_in ?? 0) > 0 || (it.tokens_out ?? 0) > 0)) {
    return items.reduce((s, it) => s + itemActualCostUsd(it, job.model), 0);
  }
  const ch = (job.run_channel as UsageChannel | undefined) ?? 'batch';
  return actualCostUsd(job.tokens_in, job.tokens_out, job.model, ch);
}

/** Client-side cost estimate (no LLM call). Batch uses half rates. */
export function estimateJobCost(
  itemCount: number,
  maxTokens: number,
  model: string,
  channel: UsageChannel = 'batch',
): {
  items: number; estTokens: number; estUsd: number; channel: UsageChannel;
} {
  const perItem = maxTokens * 1.4;
  const estTokens = Math.round(itemCount * perItem);
  const { inPerM, outPerM } = modelRates(model);
  const rateMul = channel === 'batch' ? 0.5 : 1;
  const estUsd = (estTokens * 0.6 * inPerM + estTokens * 0.4 * outPerM) * rateMul / 1_000_000;
  return { items: itemCount, estTokens, estUsd: Math.round(estUsd * 100) / 100, channel };
}

export function batchStatusLabel(job: Pick<JobRow, 'batch_status' | 'anthropic_batch_id'>): string | null {
  if (!job.anthropic_batch_id && !job.batch_status) return null;
  if (job.batch_status === 'in_progress' || job.batch_status === 'canceling') return 'Batch…';
  if (job.batch_status === 'ended') return 'Collected';
  return job.batch_status ?? 'Batch';
}
