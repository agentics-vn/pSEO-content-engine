#!/usr/bin/env node
/**
 * K1 — turn a strategist's keywords.csv into a demand-ranked job body.
 *
 * The engine never invents search volumes (contract §1). A human supplies real
 * query data as `seeds/<client>/keywords.csv` with columns:
 *
 *     query,volume_mo,maps_to,source
 *     "số chủ đạo 7 sứ mệnh 3",480,so-chu-dao-7-su-menh-3,"Google Keyword Planner 2026-07"
 *
 * `maps_to` is the engine item_key. This script reads that CSV and emits the
 * `priorities` map (item_key → volume) plus the item_keys ordered by demand,
 * ready to splice into a POST /jobs body so the drain builds high-volume pages
 * first. It does NOT call the engine and does NOT fabricate anything — rows with
 * an empty/zero volume keep priority 0.
 *
 * Usage:  node scripts/keywords-to-worklist.mjs seeds/sochumenh/keywords.csv
 * Output: JSON { priorities, item_keys_by_demand } on stdout.
 */
import { readFileSync } from 'node:fs';

const path = process.argv[2];
if (!path) {
  console.error('usage: node scripts/keywords-to-worklist.mjs <keywords.csv>');
  process.exit(2);
}

/** Minimal CSV parse (quoted fields, commas inside quotes). Header row required. */
function parseCsv(text) {
  const rows = [];
  let field = '', row = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      if (field !== '' || row.length) { row.push(field); rows.push(row); row = []; field = ''; }
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const rows = parseCsv(readFileSync(path, 'utf8'));
if (rows.length < 2) { console.error('keywords.csv has no data rows'); process.exit(1); }
const header = rows[0].map((h) => h.trim());
const col = (name) => header.indexOf(name);
for (const req of ['query', 'volume_mo', 'maps_to', 'source']) {
  if (col(req) === -1) { console.error(`keywords.csv missing column "${req}"`); process.exit(1); }
}

// Aggregate volume per item_key (several queries can map to one page).
const priorities = {};
for (const r of rows.slice(1)) {
  const itemKey = (r[col('maps_to')] ?? '').trim();
  if (!itemKey) continue;
  const vol = Number((r[col('volume_mo')] ?? '').trim()) || 0;
  priorities[itemKey] = (priorities[itemKey] ?? 0) + vol;
}

const item_keys_by_demand = Object.keys(priorities).sort(
  (a, b) => priorities[b] - priorities[a] || a.localeCompare(b),
);

process.stdout.write(JSON.stringify({ priorities, item_keys_by_demand }, null, 2) + '\n');
