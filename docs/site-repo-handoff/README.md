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
| **`example-seed/`** | A complete, valid worked example (`giavang24h` — gold-price-by-province). Copy its shape. |
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
  golden set, `claude-haiku-4-5` for the batch. Invented ids fail at generation.
- **You never get engine DB access.** The entire contract is the seed folder in +
  the HTTP pull out. Don't ask for connection strings.

## Your deliverables (definition of done)

### In this site repo (as PRs) — see `01` §1 for acceptance

- **A1** Depend on the shared math/facts package if pages stand on computed values
  (no local fork — it will diverge from the engine).
- **A2** 3–5 **demo pages rendered from engine-shaped data**: hand-write sample
  `output` rows in the exact published envelope (`01` §4) and render them through
  the *real* page component. These become the future few-shots.
- **A3** Build-time drift throw on the programmatic route (recompute facts; throw
  on slug/data drift; `getStaticPaths`/route scope driven by the data file).
- **A4** Hub & spoke: hub page(s) for the head term; spoke↔spoke related links
  computed from data, never hardcoded hrefs.
- **A5** On-page baseline: `seoTitle` (≤~60 chars, distinct from the long H1),
  `metaDescription`, FAQPage JSON-LD from `faqs`, self-canonical, UTM CTA links,
  OG-card plan, sitemap includes the cluster.

### The seed folder (the handoff artifact) — see `01` §2–§3

```
seeds/<client>/
  site.json              # {slug, name, domain}
  template.<key>.json    # output_schema + guards + prompts + model  (the core)
  worklist.golden.json   # the golden-set job body (8–15 items spanning the axis)
  keywords.csv           # query,volume_mo,maps_to,source  — REAL tool data
  ROLLOUT.md             # phases by demand, sampling %, refresh cadence
```

Mirror `example-seed/` exactly for shape. Fill it with THIS client's real axis,
real keyword volumes, and real facts.

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
docs/site-repo-handoff/README.md, then 01-engine-contract.md and
02-authoring-method.md, then study example-seed/ as a template.

Produce: (1) 3–5 demo pages rendered from hand-written engine-shaped data
through the real page component, with a build-time drift throw; (2) a
seeds/<client>/ folder (site.json, template.<key>.json, worklist.golden.json,
keywords.csv, ROLLOUT.md) for THIS client's axis.

Constraints: no local copy of shared math; keep title and seoTitle distinct;
put length bounds in guards.length not the schema; user_template carries only
facts + {constraint_notes}; use claude-sonnet-5 for the golden set. Run the
self-check in README.md before handing back. If there is no real enumerable
data axis, refuse and explain — do not invent keyword volumes.

Start by proposing the axis and the hub & spoke map for my review before
writing any schema.
```
