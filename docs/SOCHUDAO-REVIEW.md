# Review — wiring the `sochudao` repo to the live engine

**Reviewed:** the engine-side integration contract for the sochudao consumer
(`consumers/sochudao/pull-combos.mjs` + `README.md`), the `sochumenh` seed, and
the shared `@pseo/numerology-core` — checked against the **deployed** engine on
`mafqvoahltslxwttmvkn`.
**Not in scope of this pass:** the live sochudao Astro codebase itself (not in
this session — see [§6](#6-what-a-live-repo-pass-would-add)). Findings below are
about integration readiness, not sochudao's internal page code.

**Verdict:** the contract is sound and the reference pull script matches the
deployed `content-api` byte-for-byte on the route it calls. One naming ambiguity
and a couple of doc nits are worth fixing before a non-author wires this up.
Nothing blocks go-live.

---

## 1. Identity — read this first

| Thing | Value | Where it's set |
|---|---|---|
| Client **repo / codebase** name | `sochudao` | the Astro site repo; origin of `numerology-core` |
| Engine **tenant slug** | `sochumenh` | `seeds/sochumenh/site.json` → every API URL |
| Public domain | `sochumenh.vn` | `site.json` |
| Template key | `combo-so-chu-dao-su-menh` | the one page shape |
| Build secret (read key) | `SOCHUMENH_CONTENT_KEY` | minted by `load-seed.ts` |

**The repo name and the tenant slug differ on purpose but are documented
nowhere.** The site codebase is `sochudao`; the engine tenant it feeds is
`sochumenh`. Anyone who greps for "sochudao" in the engine and then calls
`/v1/sites/sochudao/published` gets a `404 unknown site`. This is the highest-value
fix in this review — I added a clarifying note to `ONBOARDING-A-TENANT.md §1`;
consider also either renaming `consumers/sochudao/` → `consumers/sochumenh/` (matches
the slug and every other artifact) or adding a one-line banner to its README.

## 2. Contract check — pull ↔ deployed content-api ✅

- `pull-combos.mjs` calls `GET {ENGINE_URL}/v1/sites/sochumenh/published?template=combo-so-chu-dao-su-menh`.
- Deployed `content-api` route regex accepts exactly `/v1/sites/<slug>/(published|webhooks|metrics)` after the function prefix, filters by `template`, and enforces the site-scoped bearer key. **Match confirmed.**
- `content-api` is live with `verify_jwt=false`, which is *required* for the
  API-key pull (a JWT gate would reject the build's bearer key). Correct as
  deployed — do not "harden" it to `verify_jwt=true`.
- The read key is scoped to the site (and optionally the template); the pull
  sends it as `Authorization: Bearer`. Matches `load-seed.ts` output.

## 3. Build-time safety — correct and load-bearing ✅

`pull-combos.mjs` throws (never ships a partial site) on three conditions, all
of which mirror engine guarantees:
1. **Declared-grid completeness** — any combo in `combo-grid.config.json` missing
   from the pull fails the build. This is the "no silently-fewer-pages" rule.
2. **NFC mirror** — re-asserts the engine's `unicode` gate site-side.
3. **Fact drift** — recomputes `computeComboFacts` from the *same*
   `@pseo/numerology-core` and asserts slug agreement; `[combo].astro` keeps the
   per-page number throw as the second line of defense.

This is exactly the two-tier drift defense the architecture calls for. No change.

## 4. Findings

| # | Severity | Finding | Action |
|---|---|---|---|
| 1 | **Medium** | Repo name `sochudao` ≠ tenant slug `sochumenh`, undocumented; invites a `404 unknown site`. | Documented in ONBOARDING §1 (done). Optionally rename `consumers/sochudao/` → `consumers/sochumenh/`. |
| 2 | Low | `ENGINE_URL` example uses `https://<ref>.functions.supabase.co/content-api`; `DEPLOY.md`/smoke-test use `https://<ref>.supabase.co/functions/v1/content-api`. Both are valid Supabase routes, but the inconsistency reads like a bug. | Pick one form across docs. For `mafqvoahltslxwttmvkn`, either `https://mafqvoahltslxwttmvkn.functions.supabase.co/content-api` or `https://mafqvoahltslxwttmvkn.supabase.co/functions/v1/content-api`. |
| 3 | Low (expected) | `pull-combos.mjs` imports numerology-core by relative path `../../packages/...` because it lives in the engine repo. In the real sochudao repo it must be `@pseo/numerology-core`. | Already called out in the file header comment; make it the first line of the copy-paste checklist so it isn't missed. |
| 4 | Info | Webhook registration is optional and manual until sochudao's CI has a rebuild endpoint. | Fine. Scheduled/manual rebuild is an acceptable interim. |
| 5 | Info | The `sochumenh` seed template hasn't been generated/reviewed yet (golden set pending — `DEPLOY.md §5–6`). The pull returns `[]` until items are published, and the grid-completeness throw will (correctly) fail a build that declares combos before any are published. | Wire the pull only after the first golden batch is published, or start `combo-grid.config.json` with `{ "item_keys": [...] }` limited to what's live. |

## 5. Go-live wiring checklist (in the sochudao repo)

1. Confirm the tenant is live: `load-seed.ts seeds/sochumenh` has run and at least
   the golden combos are **published** (`DEPLOY.md §4–5`).
2. Copy `consumers/sochudao/pull-combos.mjs` → sochudao `scripts/`; **change the
   import** to `@pseo/numerology-core` (finding #3).
3. Set build secrets: `ENGINE_URL` (one canonical form, finding #2) and
   `SOCHUMENH_CONTENT_KEY` (the raw key printed by `load-seed.ts`).
4. Add `"prebuild": "node scripts/pull-combos.mjs combo-grid.config.json"`.
5. Start `combo-grid.config.json` at `{ "master": "exclude" }` **only once the
   81 non-master combos are published**; widen to the 11/22/33 batch in Phase 2.
6. Keep the `[combo].astro` per-page drift throw.
7. Acceptance: `npm run build` pulls N combos → N pages; removing one published
   combo engine-side makes the build **throw**, not ship fewer pages; hand-editing
   a number in `combos.generated.json` makes `[combo].astro` throw.

## 6. What a live-repo pass would add

This review covers the *contract*. To review the sochudao **codebase** itself I'd
need it added to the session (`add_repo`), then I'd check:
- `[combo].astro` recomputes and throws on the same fields the engine gates on;
- `combos.ts` is a thin loader over `combos.generated.json` (no lingering static
  `COMBO_CONTENT`);
- `getStaticPaths` is driven by the pulled data (scope-by-data), not a hardcoded list;
- hub/spoke internal links come from data, can't 404;
- on-page baseline (`seoTitle` ≠ H1, FAQPage JSON-LD from `faqs`, self-canonical,
  UTM CTAs, sitemap includes the cluster) — the Phase A §A5 acceptance.

Say the word and I'll add the repo and extend this doc with that pass.
