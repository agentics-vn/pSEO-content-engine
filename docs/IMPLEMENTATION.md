# pSEO Content Engine — Implementation Guide

**Audience:** the coding agent (Claude Code) building this repo out from the Phase 0 scaffold.
**Prereq reading:** `docs/architecture.md` (the design) and `README.md` (repo map + build order). This doc is the *how* — ordered work packages, exact contracts, acceptance criteria, and the traps that already burned the reference project.

**Ground rules (do not violate — each maps to a real past incident):**
1. **Approve refuses on a red `fail`-gate.** The block lives on the approve handler, not just on editing published items. Two broken pages reached prod last time because it didn't.
2. **`@pseo/numerology-core` is the ONLY math implementation.** Engine and every consuming site import it. If two sides compute differently, every page throws at build.
3. **Cache key = `(site_id, template_key, template_version, item_key, data_hash)`.** Never drop `site_id` (tenant collision) or `template_version` (stale-output reuse).
4. **`prose-generate` is the only holder of the LLM API key.** No other function, no site, ever sees it.
5. **Strict tool use REQUIRES constraint notes.** Stripping `minItems`/`maxLength`/… for strict mode removes them from the model's view; you must re-issue them as prose or ~⅓ of items fail the schema gate.

---

## What already exists (Phase 0 scaffold)

| Path | State | Action |
|---|---|---|
| `supabase/migrations/0001_engine_schema.sql` | ✅ real | review, then run |
| `packages/numerology-core/` | ✅ real, typechecks | use as-is; add unit tests |
| `supabase/functions/_shared/gates/index.ts` | 🟡 per-item gates done | implement batch gates (WP3) |
| `supabase/functions/prose-generate/index.ts` | 🟡 stub + TODOs | implement (WP2) |
| `supabase/functions/prose-admin/index.ts` | 🟡 stub + TODOs | implement (WP4) |
| `supabase/functions/content-api/index.ts` | 🟡 stub + TODOs | implement (WP5) |
| `seeds/sochumenh/` | ✅ real | load (WP6) |
| Admin UI | ⬜ none | WP4 exposes the API; UI is optional/after |

Target runtime: **Supabase Edge Functions (Deno)**. LLM: **Anthropic Claude** (Messages API, forced tool use, `strict: true`).

---

## WP1 — Engine Supabase project + schema

**Goal:** a running engine DB with the tenancy + pipeline tables.

**Steps**
1. Create a dedicated Supabase project (engine-only; never shares a DB with any consuming app).
2. Review `0001_engine_schema.sql`, then `supabase db push` (or run via `apply_migration`).
3. Add a second migration `0002_seed_notes.sql` only if you need enum/CHECK constraints on `status` fields — optional; the app layer enforces the state machine.

**Env (function secrets):** `ANTHROPIC_API_KEY` (prose-generate only), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

**Acceptance**
- All tables + the `prose_published` view exist.
- Inserting two items differing only in `site_id` succeeds (cache key includes tenant).
- Inserting two items identical except `template_version` succeeds; identical on all five key columns **fails** the unique constraint.

---

## WP2 — `prose-generate` (build FIRST; sharpest edges)

**Goal:** generate exactly ONE item per invocation and persist it with gate results. Called in a loop by `prose-admin` until no `pending` items remain — keeps every call under the serverless wall-clock cap.

**Input (POST body):** `{ item_id }` (an existing `prose_items` row in `pending`), or `{ job_id, item_key }` to create-then-generate.

**Per-item flow**
1. Load the item's template (`system_prompt`, `user_template`, `output_schema`, `guards`, `model`, `temperature`, `max_tokens`).
2. `import { computeComboFacts } from '@pseo/numerology-core'` → build `input_data` (the `ComboFacts`). Compute `data_hash = sha256(stableStringify(input_data))`.
3. Build the prompt:
   - Fill `user_template` placeholders from `input_data` (`{lifePath}`, `{lp.archetype}`, `{linking}`, `{maturity}`, `{harmony}`, …).
   - Append `constraintNotes(output_schema, guards)` — **required** (ground rule 5).
4. **LLM call — forced strict tool use.** Anthropic Messages API:
   ```
   tools: [{ name: "emit_content",
             input_schema: stripForStrict(output_schema),
             strict: true }]
   tool_choice: { type: "tool", name: "emit_content" }
   ```
   `stripForStrict` deep-clones and removes `minItems`/`maxItems`/`minLength`/`maxLength`/`pattern`/`minimum`/`maximum` (strict mode rejects them). Read `tool_use.input` as the item.
5. `coerceToSchema(raw)` — cheap second line of defense (re-parse stringified arrays, etc.). Should be a no-op once 3–4 are right, but keep it.
6. Run gates: `runItemGates({ output, guards: resolveGuards(guards, input_data), computed })` from `_shared/gates`. `resolveGuards` fills placeholder tokens (`{linking}` → the number) so the generic gates stay domain-blind. Also merge the strict-tool-use schema pass and the `faq_shape` check.
7. Set `status`: any `fail` red → `failed_validation`; any `flag` red (or a review sample hit) → `flagged`; else `generated`. Store per-gate results in `validation`.
8. **Upsert** on the cache key. On `data_hash` match with same `template_version`, return cached (no LLM call) unless `mode = regenerate`.

**Implement in the stub:** `stripForStrict`, `constraintNotes`, `coerceToSchema`, plus the `Deno.serve` handler. Guard: return 500 if `ANTHROPIC_API_KEY` is unset (never proceed keyless).

**`constraintNotes` output (Vietnamese), example:**
```
RÀNG BUỘC ĐỘ DÀI & SỐ LƯỢNG — tuân thủ tuyệt đối:
- metaDescription: 120–165 ký tự, phải chứa số {lifePath} và {destiny}
- intro: 400–750 ký tự
- faqs: ĐÚNG 4 phần tử; mỗi câu trả lời 200–500 ký tự
```
Generate these by walking `guards.length.fields` + `guards.required_mentions` + `guards.faq_shape`, not by hardcoding.

**Acceptance**
- Generating combo 7×3 with an empty few-shot set returns a schema-valid item with all 10 fields.
- Deleting `constraintNotes` and regenerating a batch of 20 visibly raises length/faq-count failures (proves the note is load-bearing — then restore it).
- A second call with unchanged `input_data` returns the cached row with **zero** LLM tokens spent.
- `numeric_consistency` rejects an item that mentions a number not in `{lifePath, destiny, linking, maturity, lpReduced, dtReduced}`.

---

## WP3 — Batch gates (`similarity`, `phrase_frequency`)

**Goal:** the doorway-cluster defense. This axis repeats a number across a whole row (all `lifePath=7` combos discuss "số 7"), so near-duplication is the structural risk.

**`gateSimilarity`** (`_shared/gates/index.ts`): TF-IDF over character 3-grams of each item's concatenated prose; compute pairwise cosine across the batch; set each item's `similarity` = its max pairwise; **flag** any item over `guards.similarity.max_pairwise` (0.55). No second LLM call. Target parity with the reference metric (a healthy batch ran avg pairwise ≈ 0.43, max ≈ 0.72).

**`gatePhraseFrequency`:** tokenize each `intro`'s first sentence; flag opening n-grams shared by more than N items — specifically the stamped `"Người mang số chủ đạo … và số sứ mệnh …"` opening that both seed examples use.

**Where they run:** after a job's items are generated, before publish — `prose-admin` calls a `runBatchGates(items)` pass and writes results back to each item's `validation` + `similarity`.

**Acceptance**
- Feeding 12 same-`lifePath` combos flags the pair with the highest overlap.
- Feeding items that all open with the stamped sentence flags them under `phrase_frequency`.

---

## WP4 — `prose-admin` (jobs, review, publish)

**Goal:** the operator surface. Human admin auth via `site_admins` (one site per login). Endpoints (all site-scoped by the caller's membership):

| Method + path | Does |
|---|---|
| `POST /templates` | create/version a template (immutable per version) |
| `POST /jobs` | create a job over a work-list of `item_key`s |
| `POST /jobs/{id}/run` | loop `prose-generate` until no `pending` items; then `runBatchGates` |
| `GET /items?status=flagged` | review queue |
| `POST /items/{id}/approve` | **REFUSE (409) if `hasFailingGate(item.validation)`** |
| `POST /items/{id}/reject` | mark rejected |
| `POST /items/{id}/publish` | one-way snapshot; sets `status=published`, bumps `updated_at` |
| `POST /items/{id}/edit` | reviewer edits → `edited_output` (wins over `output`) |

**Publishing is one-way (§5):** never mutate a published item in place. A refresh = new `template_version` + republish; `prose_published` serves the newest published row per key.

**The build-the-work-list step:** `POST /jobs` for sochumenh should call `enumerateComboGrid()` from `@pseo/numerology-core`, filter out already-published `item_key`s, and (for phasing) accept a `filter` like "non-master only" or "life-path in [1..9]".

**Acceptance**
- `approve` on an item with a red `fail` gate returns 409 and does NOT change status. (This is ground rule 1 — write an explicit test.)
- `run` a 5-item job end-to-end: pending → generated/flagged → (review) → approved → published, and the rows appear in `prose_published`.
- Re-running `run` on an already-published job is idempotent (cached, no new LLM spend).

---

## WP5 — `content-api` (the only external surface)

**Goal:** serve published items to consuming sites over HTTP. Site-scoped bearer keys. Read-only. Never touches a consuming app's DB.

**Endpoints**
```
GET /v1/sites/{site_slug}/published?template={key}&since={version|updated_at}
    Authorization: Bearer <site-scoped key>
    → [{ item_key, template_key, template_version, output, updated_at }, ...]

POST /v1/sites/{site_slug}/webhooks
    Body: { url }   → engine POSTs {site, template, item_count} on publish;
                      the site then calls GET /published itself.
```

**Auth:** `sha256(bearer)` must match an unrevoked `site_api_keys` row for the resolved site; honor its `template_key` scope (null = all). Reject cross-site access hard.

**Schema evolution (§8):** non-breaking refresh → bump `template_version` under the same key; breaking shape change → **new `template_key`** (forces deliberate downstream migration instead of a silent build-time type break).

**Acceptance**
- A key scoped to `sochumenh` cannot read another site's published rows.
- `GET /published?template=combo-so-chu-dao-su-menh` returns only published items, newest version per key.
- A revoked key returns 401.

---

## WP6 — Load tenant #1 (sochumenh) + golden set + distillation

1. **Create the site + template** from `seeds/sochumenh/` (`site.json`, `template.combo-so-chu-dao-su-menh.json`). Issue a read-only, `sochumenh`-scoped API key (store it in the site's build secrets, WP7).
2. **Fix the harmony matrix FIRST (blocking risk).** `comboHarmony` in `numerology-core` is a self-described *demo heuristic* (planes grouping). Do not scale 139 pages of prose on top of an unvetted compatibility read. Replace it with a reviewed matrix — keep the function signature and the site's compile-time check identical (per the code comment), so nothing downstream changes.
3. **Golden set (~15, Sonnet-class):** hand-pick combos spanning all three harmony classes (`cộng hưởng`/`bổ sung`/`thử thách`), ≥1 master-number combo (11/22/33 — the likely `numeric_consistency` failure class), and both a high and low `linking`. Set the template `model` to a Sonnet-class model, generate, **human-review all 15 to publish.**
4. **Distill:** promote the best approved outputs into the template's `few_shots` (max 3, from *different* harmony classes, scrubbed of cross-item leakage; never a few-shot for the combo being generated). Switch the template `model` to Haiku-class.
5. **Batch the rest, phased by search demand:** Phase 1b = non-master 1–9 × 1–9 remainder (~76); Phase 2 = any combo with 11/22/33 (63). `review_sample_pct` = 100 for the golden set, then 25 for 1b/2 on top of every auto-flagged item.

**Cost check:** whole grid < $10 in tokens. Budget by reviewer hours, not dollars.

**Acceptance**
- 15 golden items published, all passing gates, voice signed off.
- After distillation, Haiku first-pass gate-pass rate ≥ 90% on a 20-item sample.
- Max pairwise similarity across any published row ≤ 0.55.

---

## WP7 — Wire the sochudao consumer

**Goal:** sochudao pulls published combos from `content-api` at build time instead of importing the static `COMBO_CONTENT`, and still throws on drift. Mirrors Ngay-lanh-thang-tot's `pull-prose.mjs` → snapshot → build-throw pattern.

1. **`scripts/pull-combos.mjs`** (in the sochudao repo):
   ```
   GET {ENGINE_URL}/v1/sites/sochumenh/published?template=combo-so-chu-dao-su-menh
   Authorization: Bearer ${SOCHUMENH_CONTENT_KEY}
   → write astro/src/data/numerology/combos.generated.json
   ```
   Run it in `prebuild`. Assert NFC on pulled strings (unicode gate mirror).
2. **`combos.ts`** becomes a thin loader over `combos.generated.json`, preserving the `ComboContent` type. No page changes.
3. **Extend the build throw:** declare the expected grid in config; **throw if any declared combo is missing from the pull** (doc §10 build-time safety). Today the grid is "whatever's in the file" — make it explicit so a partial pull fails loud.
4. **Keep** the existing `[combo].astro` slug/data-drift throw and the shared `@pseo/numerology-core` import (recompute `linking`/`maturity`/`harmony`, assert vs prose).
5. **Webhook (optional):** register the site's CI endpoint via `content-api`; on publish the engine pings it → CI re-pulls + rebuilds. Until then, scheduled/manual rebuild is fine.

**Acceptance**
- `npm run build` in sochudao pulls N published combos and renders N pages; removing one published combo from the engine makes the build **throw**, not ship fewer pages silently.
- A prose/number mismatch (hand-edit the generated JSON) makes `[combo].astro` throw.

---

## Testing strategy (per package, not just at the end)

- **`numerology-core`:** unit tests — `reduceNumber(38)=2`, masters preserved (`reduceNumber(11)=11`), `linkingNumber(11,3)=|2−3|=1`, `maturityNumber(7,3)=1`, `comboSlug(7,3)='so-chu-dao-7-su-menh-3'`. Golden-file the full `computeComboFacts` for 3 combos.
- **gates:** table-driven — a passing item and one crafted to trip each gate.
- **prose-generate:** integration test with a mocked Anthropic response; assert cache-hit path spends zero tokens.
- **prose-admin:** the approve-blocks-on-red-fail test is mandatory.
- **content-api:** cross-site isolation + revoked-key tests.
- **End-to-end smoke:** load sochumenh → generate 3 combos → publish → `content-api` returns them → sochudao build renders 3 pages and throws when one is missing.

---

## Env vars reference

| Var | Where | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | prose-generate only | LLM calls — never exposed elsewhere |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | all engine functions | DB access (server-side) |
| `ENGINE_URL` | sochudao build | base URL of `content-api` |
| `SOCHUMENH_CONTENT_KEY` | sochudao build secret | site-scoped read key issued in WP6 |

---

## Suggested commit sequence

1. `test(core): unit tests for numerology-core`
2. `fix(core): replace comboHarmony demo heuristic with vetted matrix`
3. `feat(generate): strict tool use + stripForStrict + constraintNotes + gates`
4. `feat(gates): similarity + phrase_frequency batch gates`
5. `feat(admin): jobs, run-loop, review, approve-blocks-on-fail, publish`
6. `feat(content-api): published endpoint + key auth + webhook`
7. `chore(seed): load sochumenh site + template; golden set`
8. `feat(sochudao): pull-combos build step + extended drift throw`

Build order is deliberate: `prose-generate` first (everything downstream depends on its output shape), the fail-gate block before any real generation, batch gates before the full batch runs.
