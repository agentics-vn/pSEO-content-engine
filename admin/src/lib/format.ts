import type { GateResult, ReviewItem } from '../types';

export const fmt = (n: number) => n.toLocaleString('en-US');
export const fmtK = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1000 ? `${Math.round(n / 1000)}k`
  : String(n);

export function prettyKey(itemKey: string): string {
  const m = /^so-chu-dao-(\d+)-su-menh-(\d+)$/.exec(itemKey);
  return m ? `Chủ đạo ${m[1]} × Sứ mệnh ${m[2]}` : itemKey;
}

export function gatesOf(it: ReviewItem): GateResult[] {
  return [...(it.validation.gates ?? []), ...(it.validation.batch_gates ?? [])];
}

/** Client-side cost estimate (no LLM call). */
export function estimateJobCost(itemCount: number, maxTokens: number, model: string): {
  items: number; estTokens: number; estUsd: number;
} {
  const perItem = maxTokens * 1.4;
  const estTokens = Math.round(itemCount * perItem);
  const isHaiku = /haiku/i.test(model);
  const inRate = isHaiku ? 1 : 3;
  const outRate = isHaiku ? 5 : 15;
  const estUsd = (estTokens * 0.6 * inRate + estTokens * 0.4 * outRate) / 1_000_000;
  return { items: itemCount, estTokens, estUsd: Math.round(estUsd * 100) / 100 };
}
