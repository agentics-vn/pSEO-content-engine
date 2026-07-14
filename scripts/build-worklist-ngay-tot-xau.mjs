#!/usr/bin/env node
/**
 * Build the ngay-tot-xau golden worklist for the ngaylanhthangtot tenant:
 * enumerate a date range, fetch tu-tru-api day-detail (GENERIC mode — no
 * birth data, lịch chung) per date, map to input_data facts, and write a
 * complete POST /jobs body. Mirrors the original single-tenant precedent
 * (architecture.md §15: 31 days of calendar content).
 *
 * Usage:
 *   node scripts/build-worklist-ngay-tot-xau.mjs --from=2026-08-01 [--days=31]
 *     [--out=seeds/ngaylanhthangtot/worklist.golden.ngay-tot-xau.json]
 *     [--base-url=https://tu-tru-api.fly.dev]
 *
 * --from is REQUIRED (no implicit "today" — the operator picks the anchor,
 * the script never reads the clock to choose a range). --base-url exists so
 * the range can be generated against a locally-run tu-tru-api when the
 * hosted URL is unreachable from the operator's environment.
 */
import { writeFileSync } from 'node:fs';
import { fetchDayDetailGeneric, DEFAULT_BASE_URL } from '../packages/tu-tru-client/src/client.ts';
import { mapToInputData } from '../packages/tu-tru-client/src/mapToInputData.ts';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...rest] = a.replace(/^--/, '').split('=');
  return [k, rest.length ? rest.join('=') : true];
}));

if (!args.from || !/^\d{4}-\d{2}-\d{2}$/.test(String(args.from))) {
  console.error('usage: node scripts/build-worklist-ngay-tot-xau.mjs --from=YYYY-MM-DD [--days=31] [--out=...] [--base-url=...]');
  process.exit(2);
}

const days = Number(args.days ?? 31);
const out = String(args.out ?? 'seeds/ngaylanhthangtot/worklist.golden.ngay-tot-xau.json');
const baseUrl = String(args['base-url'] ?? DEFAULT_BASE_URL);
const HUB = 'ngay-tot-xau'; // hub slug — PROVISIONAL, confirm against site IA
const SIBLING_SPAN = 3; //     link ±3 adjacent days (calendar prev/next cluster)

const dates = Array.from({ length: days }, (_, i) => {
  const d = new Date(`${args.from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + i);
  return d.toISOString().slice(0, 10);
});

const items = [];
for (const [i, date] of dates.entries()) {
  const raw = await fetchDayDetailGeneric(date, { baseUrl });
  const facts = mapToInputData(raw);
  // Siblings: adjacent days only (±SIBLING_SPAN). A calendar axis reads
  // prev/next-day navigation naturally; whole-batch sibling lists would not
  // scale past the golden month (365-day rollout).
  const siblings = dates
    .filter((_, j) => j !== i && Math.abs(j - i) <= SIBLING_SPAN)
    .map((d) => `ngay-${d}`);
  items.push({ item_key: `ngay-${date}`, input_data: { ...facts, hub: HUB, siblings } });
  process.stdout.write(`\r${i + 1}/${dates.length} ${date} (${facts.hoangDaoLabel}, ${facts.grade})   `);
  // 300 req/min per-IP budget on the hosted API — stay far under it.
  if (i < dates.length - 1) await new Promise((r) => setTimeout(r, 250));
}
console.log();

writeFileSync(out, JSON.stringify({
  template_key: 'ngay-tot-xau',
  review_sample_pct: 100,
  items,
}, null, 2) + '\n');

const grades = items.reduce((acc, it) => {
  acc[it.input_data.grade] = (acc[it.input_data.grade] ?? 0) + 1;
  return acc;
}, {});
console.log(`wrote ${items.length} items to ${out} — grades: ${JSON.stringify(grades)}`);
