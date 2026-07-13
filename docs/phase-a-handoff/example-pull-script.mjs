/**
 * example-pull-script.mjs — the Phase-C reference pull for ANY tenant.
 * Shows the envelope your A2 demo rows must imitate and the pattern your real
 * pull script follows: pull → gates → snapshot → build renders from the file.
 * (The live sochumenh version of this pattern is consumers/sochudao/
 * pull-combos.mjs in the engine repo; the integration kit generates a
 * schema-matched one for you.)
 *
 *   ENGINE_URL=https://<project-ref>.supabase.co/functions/v1/content-api \
 *   CONTENT_KEY=pseo_<slug>_… \
 *     node scripts/pull-content.mjs expected-pages.json
 *
 * THROWS — never ships a partial site — when:
 *   1. any page declared in expected-pages.json is missing from the pull
 *      (a partial pull must fail loud, not render fewer pages), or
 *   2. any pulled prose string is not NFC-normalized (unicode gate mirror).
 *
 * THE ONE RULE THAT SAVES YOU A FORK (A1): deterministic values — numbers,
 * labels, hub/sibling link slugs — arrive ENGINE-COMPUTED in each row's
 * `facts`. Render them; do NOT recompute them and do NOT import the engine's
 * math package (it is intentionally unpublished). Merge `{ ...output,
 * ...facts }` — facts win on collision; they are the source of truth for what
 * the page displays.
 */

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ENGINE_URL = process.env.ENGINE_URL;
const KEY = process.env.CONTENT_KEY;              // your <CLIENT>_CONTENT_KEY
const SLUG = process.env.SITE_SLUG ?? '<slug>';   // the tenant slug from site.json
const TEMPLATE = process.env.TEMPLATE_KEY ?? '<template-key>';
const OUT_FILE = process.env.CONTENT_OUT ?? `src/data/${TEMPLATE}.generated.json`;

if (!ENGINE_URL || !KEY) throw new Error('[pull] ENGINE_URL and CONTENT_KEY are required');

// ── 1. Declare exactly which pages MUST exist (build-time safety) ───────────
// expected-pages.json: { "item_keys": ["<slug-1>", "<slug-2>", …] } — widen per
// rollout phase. Declaring the grid is what makes a partial pull a RED build.
const expected = JSON.parse(await readFile(process.argv[2] ?? 'expected-pages.json', 'utf8'));

// ── 2. Pull published rows over the one external surface ────────────────────
const res = await fetch(`${ENGINE_URL}/v1/sites/${SLUG}/published?template=${TEMPLATE}`, {
  headers: { authorization: `Bearer ${KEY}` },
});
if (!res.ok) throw new Error(`[pull] engine returned ${res.status}: ${await res.text()}`);
const rows = await res.json();
// Each row: { item_key, template_key, template_version, output, facts, updated_at }
//   output — the reviewed prose, exactly your template's output_schema
//   facts  — engine-computed deterministic values (numbers, hub/siblings, …)

// ── 3. Gates: NFC mirror on prose + declared-grid completeness ──────────────
const assertNfc = (v, where) => {
  if (typeof v === 'string' && v.normalize('NFC') !== v) {
    throw new Error(`[pull] non-NFC string in ${where}`);
  }
  if (Array.isArray(v)) v.forEach((x, i) => assertNfc(x, `${where}[${i}]`));
  else if (v !== null && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) assertNfc(x, `${where}.${k}`);
  }
};

const byKey = new Map();
for (const row of rows) {
  assertNfc(row.output, row.item_key); // prose renders as text → NFC-police it
  byKey.set(row.item_key, {
    slug: row.item_key,
    template_version: row.template_version,
    updated_at: row.updated_at,
    // facts win on collision — source of truth for displayed numbers/links.
    content: { ...row.output, ...(row.facts ?? {}) },
  });
}

const missing = expected.item_keys.filter((k) => !byKey.has(k));
if (missing.length > 0) {
  throw new Error(
    `[pull] ${missing.length} declared page(s) missing — refusing to build a partial site:\n` +
    missing.slice(0, 20).join('\n') + (missing.length > 20 ? `\n… +${missing.length - 20} more` : ''),
  );
}

// ── 4. Snapshot → the build renders from this file ──────────────────────────
await mkdir(path.dirname(OUT_FILE), { recursive: true });
await writeFile(OUT_FILE, JSON.stringify([...byKey.values()], null, 2) + '\n');
console.log(`[pull] wrote ${byKey.size} pages (${expected.item_keys.length} declared) → ${OUT_FILE}`);
