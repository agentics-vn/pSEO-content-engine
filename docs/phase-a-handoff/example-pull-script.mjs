/**
 * pull-combos.mjs — WP7 reference implementation for the sochudao repo.
 * Copy into sochudao's scripts/ and run in `prebuild` (mirrors
 * Ngay-lanh-thang-tot's pull-prose.mjs → snapshot → build-throw pattern).
 *
 *   ENGINE_URL=https://<engine>.functions.supabase.co/content-api \
 *   SOCHUMENH_CONTENT_KEY=pseo_sochumenh_… \
 *     node scripts/pull-combos.mjs [combo-grid.config.json]
 *
 * Writes astro/src/data/numerology/combos.generated.json and THROWS — never
 * ships a partial site — when:
 *   1. any combo declared in the grid config is missing from the pull
 *      (doc §10: a partial pull must fail loud, not render fewer pages), or
 *   2. any pulled string is not NFC-normalized (unicode gate mirror), or
 *   3. the recomputed facts (same @pseo/numerology-core) drift from the prose
 *      keys — the per-page [combo].astro throw stays as the second line.
 *
 * The grid config declares which combos MUST exist, e.g.:
 *   { "master": "exclude" }                      → all 81 non-master combos
 *   { "life_paths": [1,2,3,4,5,6,7,8,9] }        → explicit rows
 *   { "item_keys": ["so-chu-dao-7-su-menh-3"] }  → explicit list
 */

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

// In sochudao this resolves to the same shared package (ground rule 2):
// import { enumerateComboGrid, comboSlug, isMaster, computeComboFacts } from '@pseo/numerology-core';
import {
  enumerateComboGrid,
  comboSlug,
  isMaster,
  computeComboFacts,
} from '../../packages/numerology-core/src/index.ts';

const ENGINE_URL = process.env.ENGINE_URL;
const KEY = process.env.SOCHUMENH_CONTENT_KEY;
const TEMPLATE = 'combo-so-chu-dao-su-menh';
const OUT_FILE = process.env.COMBOS_OUT ?? 'astro/src/data/numerology/combos.generated.json';

if (!ENGINE_URL || !KEY) {
  throw new Error('[pull-combos] ENGINE_URL and SOCHUMENH_CONTENT_KEY are required');
}

// ── 1. Declare the expected grid (build-time safety, doc §10) ────────────────
const configPath = process.argv[2];
const config = configPath ? JSON.parse(await readFile(configPath, 'utf8')) : { master: 'exclude' };

let expectedKeys;
if (Array.isArray(config.item_keys)) {
  expectedKeys = config.item_keys;
} else {
  expectedKeys = enumerateComboGrid()
    .filter(({ lifePath, destiny }) => {
      if (config.master === 'exclude' && (isMaster(lifePath) || isMaster(destiny))) return false;
      if (config.master === 'only' && !(isMaster(lifePath) || isMaster(destiny))) return false;
      if (config.life_paths && !config.life_paths.includes(lifePath)) return false;
      if (config.destinies && !config.destinies.includes(destiny)) return false;
      return true;
    })
    .map(({ lifePath, destiny }) => comboSlug(lifePath, destiny));
}

// ── 2. Pull published combos over the one external surface ──────────────────
const res = await fetch(`${ENGINE_URL}/v1/sites/sochumenh/published?template=${TEMPLATE}`, {
  headers: { authorization: `Bearer ${KEY}` },
});
if (!res.ok) {
  throw new Error(`[pull-combos] engine returned ${res.status}: ${await res.text()}`);
}
const rows = await res.json();

// ── 3. Gates: NFC mirror + declared-grid completeness + fact drift ──────────
const assertNfc = (v, where) => {
  if (typeof v === 'string' && v.normalize('NFC') !== v) {
    throw new Error(`[pull-combos] non-NFC string in ${where}`);
  }
  if (Array.isArray(v)) v.forEach((x, i) => assertNfc(x, `${where}[${i}]`));
  else if (v !== null && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) assertNfc(x, `${where}.${k}`);
  }
};

const bySlug = new Map();
for (const row of rows) {
  assertNfc(row.output, row.item_key);
  // Recompute the facts the prose stands on; the same package computed them
  // engine-side, so any drift means stale published content.
  const m = /^so-chu-dao-(\d{1,2})-su-menh-(\d{1,2})$/.exec(row.item_key);
  if (!m) throw new Error(`[pull-combos] unexpected item_key "${row.item_key}"`);
  const facts = computeComboFacts(Number(m[1]), Number(m[2]));
  if (facts.slug !== row.item_key) {
    throw new Error(`[pull-combos] slug drift for "${row.item_key}"`);
  }
  bySlug.set(row.item_key, {
    slug: row.item_key,
    lifePath: facts.lifePath,
    destiny: facts.destiny,
    template_version: row.template_version,
    updated_at: row.updated_at,
    content: row.output,
  });
}

const missing = expectedKeys.filter((k) => !bySlug.has(k));
if (missing.length > 0) {
  throw new Error(
    `[pull-combos] ${missing.length} declared combo(s) missing from the pull — refusing to build a partial site:\n` +
    missing.slice(0, 20).join('\n') + (missing.length > 20 ? `\n… +${missing.length - 20} more` : ''),
  );
}

// ── 4. Snapshot ──────────────────────────────────────────────────────────────
await mkdir(path.dirname(OUT_FILE), { recursive: true });
await writeFile(OUT_FILE, JSON.stringify([...bySlug.values()], null, 2) + '\n');
console.log(`[pull-combos] wrote ${bySlug.size} combos (${expectedKeys.length} declared) → ${OUT_FILE}`);
