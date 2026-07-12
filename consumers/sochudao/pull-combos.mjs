/**
 * pull-combos.mjs — WP7 reference for the sochudao repo (tenant `sochumenh`).
 * Copy into sochudao's scripts/ and run in `prebuild` (mirrors the
 * pull → snapshot → build-throw pattern).
 *
 *   ENGINE_URL=https://mafqvoahltslxwttmvkn.supabase.co/functions/v1/content-api \
 *   SOCHUMENH_CONTENT_KEY=pseo_sochumenh_… \
 *     node scripts/pull-combos.mjs [combo-grid.config.json]
 *
 * Writes astro/src/data/numerology/combos.generated.json and THROWS — never
 * ships a partial site — when:
 *   1. any combo declared in the grid config is missing from the pull
 *      (a partial pull must fail loud, not render fewer pages), or
 *   2. any pulled string is not NFC-normalized (unicode gate mirror).
 *
 * Numerology math lives in ONE place per side and is NOT recomputed here:
 *   - person → (số chủ đạo, số sứ mệnh): use @csessh/sochumenh at RUNTIME
 *     (when a visitor enters name + dob), not in this build script;
 *   - a combo page's slug is the literal `so-chu-dao-{lp}-su-menh-{dt}`;
 *   - harmony / linking / maturity are DETERMINISTIC and engine-computed —
 *     they arrive in each row's `facts` (from the engine's computeComboFacts)
 *     and are merged into the rendered content. Do NOT recompute them here and
 *     do NOT import @pseo/numerology-core (it is intentionally unpublished; the
 *     engine mirrors @csessh/sochumenh and is parity-guarded in CI).
 *
 * The grid config declares which combos MUST exist, e.g.:
 *   { "item_keys": ["so-chu-dao-7-su-menh-3", …] }  → explicit (start here)
 *   { "master": "exclude" }                          → all 81 non-master combos
 *   { "life_paths": [1,2,3,4,5,6,7,8,9] }            → filter the grid
 */

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ENGINE_URL = process.env.ENGINE_URL;
const KEY = process.env.SOCHUMENH_CONTENT_KEY;
const TEMPLATE = 'combo-so-chu-dao-su-menh';
const OUT_FILE = process.env.COMBOS_OUT ?? 'astro/src/data/numerology/combos.generated.json';

if (!ENGINE_URL || !KEY) {
  throw new Error('[pull-combos] ENGINE_URL and SOCHUMENH_CONTENT_KEY are required');
}

// The core-number SPACE and the slug shape — data, not math (no reduction or
// harmony logic here). The engine owns all computation; these just enumerate
// which pages are expected and how their slugs read.
const CORE_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 22, 33];
const MASTER = new Set([11, 22, 33]);
const isMaster = (n) => MASTER.has(n);
const comboSlug = (lp, dt) => `so-chu-dao-${lp}-su-menh-${dt}`;
const ITEM_KEY_RE = /^so-chu-dao-(\d{1,2})-su-menh-(\d{1,2})$/;

// ── 1. Declare the expected grid (build-time safety) ────────────────────────
const configPath = process.argv[2];
const config = configPath ? JSON.parse(await readFile(configPath, 'utf8')) : { master: 'exclude' };

let expectedKeys;
if (Array.isArray(config.item_keys)) {
  expectedKeys = config.item_keys;
} else {
  expectedKeys = CORE_NUMBERS.flatMap((lp) => CORE_NUMBERS.map((dt) => ({ lp, dt })))
    .filter(({ lp, dt }) => {
      if (config.master === 'exclude' && (isMaster(lp) || isMaster(dt))) return false;
      if (config.master === 'only' && !(isMaster(lp) || isMaster(dt))) return false;
      if (config.life_paths && !config.life_paths.includes(lp)) return false;
      if (config.destinies && !config.destinies.includes(dt)) return false;
      return true;
    })
    .map(({ lp, dt }) => comboSlug(lp, dt));
}

// ── 2. Pull published combos over the one external surface ──────────────────
const res = await fetch(`${ENGINE_URL}/v1/sites/sochumenh/published?template=${TEMPLATE}`, {
  headers: { authorization: `Bearer ${KEY}` },
});
if (!res.ok) {
  throw new Error(`[pull-combos] engine returned ${res.status}: ${await res.text()}`);
}
const rows = await res.json();

// ── 3. Gates: NFC mirror + declared-grid completeness ───────────────────────
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
  const m = ITEM_KEY_RE.exec(row.item_key);
  if (!m) throw new Error(`[pull-combos] unexpected item_key "${row.item_key}"`);
  const lp = Number(m[1]);
  const dt = Number(m[2]);
  assertNfc(row.output, row.item_key);
  assertNfc(row.facts ?? {}, `${row.item_key}.facts`);
  bySlug.set(row.item_key, {
    slug: row.item_key,
    lifePath: lp,
    destiny: dt,
    template_version: row.template_version,
    updated_at: row.updated_at,
    // Model-written prose + engine-computed deterministic facts (harmony,
    // linking, maturity, …). facts win on any key collision — they are the
    // source of truth for the numbers the page displays.
    content: { ...row.output, ...(row.facts ?? {}) },
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
