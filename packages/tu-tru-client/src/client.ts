/**
 * The ONLY file in this package that touches the network. Used exclusively
 * by offline worklist-building scripts (scripts/build-worklist-*.mjs) —
 * never imported by supabase/functions, so the engine itself keeps its
 * no-live-network-calls guarantee for tenant input data.
 *
 * tu-tru-api is open (no API key) with a 300 req/min per-IP rate limit;
 * callers enumerating a date range should space requests (the worklist
 * script sleeps between calls).
 */
import type { DayDetailGeneric } from './types.ts';

export const DEFAULT_BASE_URL = 'https://tu-tru-api.fly.dev';

export async function fetchDayDetailGeneric(
  date: string,
  opts?: { baseUrl?: string; tz?: string },
): Promise<DayDetailGeneric> {
  const url = new URL('/v1/day-detail', opts?.baseUrl ?? DEFAULT_BASE_URL);
  url.searchParams.set('date', date);
  url.searchParams.set('mode', 'generic');
  if (opts?.tz) url.searchParams.set('tz', opts.tz);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`tu-tru-api ${res.status} for ${date}: ${(await res.text()).slice(0, 300)}`);
  }
  const body = (await res.json()) as DayDetailGeneric;
  if (body.status !== 'success') {
    throw new Error(`tu-tru-api non-success for ${date}: ${JSON.stringify(body).slice(0, 300)}`);
  }
  return body;
}
