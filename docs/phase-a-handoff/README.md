# Phase A handoff bundle — start here

**You are a Claude Code session working inside a client SITE repo** (e.g.
`sochudao`, `ngaylanhthangtot`). Your job is **Phase A**: turn SEO strategy into
(1) a few real demo pages in this repo and (2) a `seeds/<client>/` folder that a
separate content **engine** will generate from at scale. You do **not** call any
LLM to write article bodies — the engine does that later. You design the page
shape, the guardrails, and the prompts; you prove the shape renders.

This bundle is self-contained — everything you need is in this folder. Read it in
this order:

| File | What it's for |
|---|---|
| **`README.md`** (this file) | Orientation, engine facts, definition of done, kickoff prompt |
| **`01-engine-contract.md`** | **The contract you must follow** — field-by-field, gate-by-gate what the engine accepts. Authoritative. |
| **`02-authoring-method.md`** | The method — how a strategist decides the axis, hub&spoke, schema, guards, prompts |
| **`example-seed/`** | A **real** reference seed — the live `sochumenh` tenant (`site.json` + the combo template). Copy its shape; **adapt, don't clone** (your client's axis, queries, and voice differ). It uses the built-in combo-grid enumerator, so it ships no explicit `worklist.golden.json` — for that shape see `01` §3. |
| **`example-pull-script.mjs`** | Reference build-time pull script (Phase C) — shows the envelope your demo pages must imitate |

When `01` and `02` disagree with anything here, **`01` wins on the contract**;
this README wins on the project-specific facts (URLs, slug, where to send the
folder).

---

## The flow you are part of

```
A. THIS SITE REPO (you)            B. ENGINE REPO (the human runs)      C. THIS SITE REPO (CI)
 strategy + 3–5 demo pages    →    validate-seed → load-seed → jobs →   webhook/prebuild pull →
 + seeds/<client>/ folder          generate → human review → publish    build renders real pages
```

You produce A. You hand the `seeds/<client>/` folder back to the human, who drops
it into the engine repo and runs the validator. If your folder follows `01`, the
validator passes and generation runs without surprises.

## Working across the two repos — what you give, what you get back

This is a **two-repo, HTTP-only** setup. The engine never touches this repo's code
or database; you never touch the engine's. Work crosses the boundary as a few
explicit handoffs — think of them as batons, and note they travel in **different
directions**:

**1. You → engine (one-time — a folder, not access).**
When Phase A is done you hand the engine-repo session **one thing**: the
`seeds/<client>/` folder + a one-line note (see "What to hand back"). You do not
get, or need, any engine credentials. The engine session drops the folder into
`seeds/<client>/`, runs `validate-seed` → `load-seed`, generates, and **a human
reviews and publishes**.

**2. Engine → you (what comes back).**
- **A site-scoped API key** — printed once by `load-seed`. Read-only, sees only
  your own tenant. Put it in this repo's build secrets (e.g. `<CLIENT>_CONTENT_KEY`).
- **Published content** over `content-api`, live the moment the engine publishes:
  `…/v1/sites/<slug>/published?template=<key>`. Each row is
  `{ item_key, template_key, template_version, output, updated_at, facts }`.
- **`facts` — engine-computed deterministic values** (the numbers/labels a page
  stands on) delivered on every row alongside `output`. **Render them; do NOT
  recompute** — re-deriving them site-side just reintroduces a fork. Merge as
  `{ ...output, ...facts }`.
- **The publish webhook** — your go-live signal. Register a rebuild URL once
  (`POST …/v1/sites/<slug>/webhooks` with your key + a host *deploy hook* URL).
  The response returns a **`webhook_secret` shown ONCE** (store it) plus a
  `verify` block. Every publish then POSTs
  `{site, template, template_version, item_key, item_count}`, HMAC-SHA256
  signed as `x-signature: sha256=<hex>` over the raw body — deploy-hook URLs
  can ignore the header; your own endpoint should verify it (the integration
  kit ships `scripts/verify-webhook.mjs`). First go-live is still one
  deliberate flip (enable the pull); the webhook automates every publish after
  that.
- **An integration starter kit** (on request): the engine side can run
  `scripts/generate-integration-kit.mjs` over your seed and hand you generated
  pull/verify/page-stub/JSON-LD/sitemap-submit files matching your schema — so
  Phase C is wiring, not writing.

**3. You again (Phase C — in this repo).**
Wire `pull-combos.mjs` (see `example-pull-script.mjs`) into `prebuild` with that
key → it pulls the published rows into a snapshot JSON → your pages render → the
build-time drift throw guards it.

**Two timing rules that save a broken build:**
- Don't enable the `prebuild` pull until the engine has published **at least the
  golden set** — an empty pull against a declared grid is a red build *by design*.
- Don't remove any existing content source in this repo until that pull is green.

> Deterministic values (numbers, labels, hub/sibling link slugs) arrive
> **engine-computed in `row.facts`** — render them, never re-run the math
> site-side (a local fork silently drifts from the engine; that's the A1 rule).
> The engine's math package is intentionally unpublished. A runtime calculator
> for *visitor input* (e.g. `@csessh/sochumenh`) is fine — it is parity-guarded
> against the engine in CI.

## Engine facts you need

- **Engine base URL (content-api):**
  `https://mafqvoahltslxwttmvkn.supabase.co/functions/v1/content-api`
  Your Phase-C pull (later) hits
  `…/content-api/v1/sites/<slug>/published?template=<key>` with a site-scoped
  bearer key the human mints for you.
- **Tenant slug ≠ repo name.** The engine identifies the tenant by the `slug` in
  `site.json`, which is independent of this repo's name. (Example: the `sochudao`
  repo feeds the `sochumenh` tenant.) **Pick the slug once and keep it stable** —
  it's baked into every API key and URL. Put the real public domain in `domain`.
- **Model ids** (for `template.<key>.json` `model`): `claude-sonnet-5` for the
  golden set, `claude-haiku-4-5` for the batch. Unknown ids are **rejected** at
  template creation.
- **Generation is batched.** Jobs run through Anthropic Message Batches
  (≈50% token cost; results typically land within minutes to a few hours, not
  instantly), with automatic retry of truncated/degenerate items and auto-sized
  output budgets. Plan review turnaround accordingly.
- **You never get engine DB access.** The entire contract is the seed folder in +
  the HTTP pull out. Don't ask for connection strings.

## Your deliverables (definition of done)

### In this site repo (as PRs) — see `01` §1 for acceptance

- **A1** No local copy of the math: computed values render from `row.facts`
  (engine-delivered per row) — never re-implemented site-side.
- **A2** 3–5 **demo pages rendered from engine-shaped data**: hand-write sample
  rows in the exact published envelope (`01` §4 — `output` **and** `facts`) and
  render them through the *real* page component. These become the future few-shots.
- **A3** Build-time drift throw on the programmatic route (structural: slug ↔
  facts agree, declared pages all present; `getStaticPaths`/route scope driven
  by the data file — no math re-run).
- **A4** Hub & spoke: hub page(s) for the head term; spoke↔spoke related links
  computed from data, never hardcoded hrefs.
- **A5** On-page baseline: `seoTitle` (≤~60 chars, distinct from the long H1),
  `metaDescription`, FAQPage JSON-LD from `faqs`, self-canonical, UTM CTA links,
  OG-card plan, sitemap includes the cluster.

### The seed folder (the handoff artifact) — see `01` §2–§3

```
seeds/<client>/
  # engine INGESTS these:
  site.json              # {slug, name, domain}
  persona.md             # OPTIONAL site-level doctrine — prepended to EVERY template's
                         # system_prompt at generation (voice, persuasion arc, guardrails)
  template.<key>.json    # output_schema + guards + prompts + model  (the core)
  worklist.golden.json   # the golden-set job body (8–15 items spanning the axis)
  # demand INPUT — feeds the job's `priorities` (generation & review order,
  # rollout phases; maps_to = item_key, volumes per page are summed):
  keywords.csv           # query,volume_mo,maps_to,source  — REAL tool data
  # strategy COMPANION (for human review; engine never reads it):
  ROLLOUT.md             # phases by demand, sampling %, refresh cadence
```

Mirror `example-seed/` for the shape of `site.json` and `template.<key>.json`
(the real `sochumenh` template shows a full `output_schema` + `guards` + prompts).
It relies on the combo-grid enumerator, so add your own explicit
`worklist.golden.json` (shape in `01` §3) plus `keywords.csv` and `ROLLOUT.md`.
Only `site.json` + `template.*.json` are strictly required to validate — but
produce the companions too; they're how a human sanity-checks the axis before
spending tokens.

## Self-check before you hand it back

You can't run the engine's `validate-seed.ts` from here (it lives in the engine
repo), so verify these by hand — they are what it checks:

- [ ] Every `{placeholder}` in `user_template` and in every guard resolves from
      some `input_data` key in **every** work-list row (an unknown placeholder
      throws at generation — see `01` §2.3).
- [ ] `user_template` contains `{constraint_notes}` (drop it and ~⅓ of items fail
      the schema gate — `01` §5 trap 1).
- [ ] Every `guards.*` key references a real `output_schema` field.
- [ ] String length bounds live in `guards.length`, **not** in the schema
      (`minLength`/`maxLength` are stripped for strict mode — `01` §2.1).
- [ ] `title` (long H1) and `seoTitle` (≤~60) are **distinct** fields.
- [ ] `faqs` is an array of `{q,a}`, 3–5 items, and `faq_shape` matches its count.
- [ ] For prices/dates/big numbers you did **not** use `numeric_consistency`
      (built for 0–33 integers) — you carried pre-formatted strings in
      `input_data` and enforced them with `required_mentions` (`01` §2.2, trap 4).
- [ ] Your A2 demo rows have **varied openings** (or the batch will stamp and
      `phrase_frequency` will flag it — `01` §5 trap 5).
- [ ] `item_key` matches `^[a-z0-9][a-z0-9-]*$`, is unique, and is the page's
      permanent URL slug.

## When to refuse (say so, don't improvise) — `01` end of §1

Stop and tell the human if: there's no enumerable data axis with real facts per
page, or keyword volumes would have to be invented. "Mass articles" without an
axis is a doorway-page penalty. Decline in Phase A; don't let it reach review.

## What to hand back

1. The site-repo PRs (A1–A5).
2. The `seeds/<client>/` folder (as a folder or a PR to the engine repo — ask the
   human which).
3. One short note: the axis, the head term + hub URL, the golden-set size, and any
   guard you set unusually (and why).

---

## Copy-paste kickoff prompt

Give this to the fresh site-repo session along with this bundle:

```
You are doing Phase A for programmatic SEO in this site repo. Read
docs/phase-a-handoff/README.md, then 01-engine-contract.md and
02-authoring-method.md, then study example-seed/ as a template.

Produce: (1) 3–5 demo pages rendered from hand-written engine-shaped data
through the real page component, with a build-time drift throw; (2) a
seeds/<client>/ folder (site.json, persona.md, template.<key>.json,
worklist.golden.json, keywords.csv, ROLLOUT.md) for THIS client's axis.

Constraints: site-level doctrine (voice, persuasion arc, guardrails) goes in
persona.md, template-specific rules only in system_prompt — never duplicated;
no local copy of shared math (render row.facts); keep title and seoTitle
distinct; put length bounds in guards.length not the schema; user_template
carries only facts + {constraint_notes}; use claude-sonnet-5 for the golden
set. Run the self-check in README.md before handing back. If there is no real
enumerable data axis, refuse and explain — do not invent keyword volumes.

When done, hand back only the seeds/<client>/ folder + a one-line note; in
return you'll get a site-scoped API key + content-api access for Phase C (see
"Working across the two repos"). Do NOT enable the prebuild pull or remove any
existing content source until the engine has published the golden set.

Start by proposing the axis and the hub & spoke map for my review before
writing any schema.
```
