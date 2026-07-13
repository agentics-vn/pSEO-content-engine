# Phase A hand-off contract

**Audience: the Claude Code session working in a CLIENT SITE repo** (sochudao,
ngaylanhthangtot, …) doing SEO strategy + template authoring. This document
is the complete specification of (1) what you must produce, and (2) exactly
what the engine accepts — field by field, gate by gate, as implemented. If
you follow this doc, `scripts/validate-seed.ts` passes and the engine
generates without surprises.

> This is the **contract** file of the Phase A handoff package (this folder).
> Read [`README.md`](./README.md) first for the engine facts (live URL,
> tenant-slug rule) and the self-check; the authoring *method* is
> [`02-authoring-method.md`](./02-authoring-method.md).

The flow you are Phase A of:

```
A. SITE REPO (you)          B. ENGINE                 C. SITE REPO (CI)
strategy + demo pages   →   validate → load → jobs →  webhook → pull →
+ seed folder               generate → review →       build renders
                            publish                   published pages
```

---

## 1. Deliverables — definition of done

### In the site repo (merged as PRs)

| # | Deliverable | Acceptance |
|---|---|---|
| A1 | **No local copy of the math.** If pages stand on computed values, render them from `row.facts` — the engine computes every deterministic value once and delivers it with each published row (§4). Do NOT re-implement or import the engine's math package (it is intentionally unpublished; a local fork WILL diverge — this happened: the site's `comboHarmony` kept an old heuristic and the flagship page's harmony badge would have silently flipped at integration). A runtime calculator for user input (e.g. `@csessh/sochumenh`) is fine — it's parity-guarded against the engine in CI. | grep finds no duplicated implementation; pages read `row.facts` |
| A2 | **3–5 demo pages rendered from engine-shaped data**: hand-write sample rows in the exact published envelope (§4) into a `*.generated.json`-style file and render them through the real page component. These double as the future few-shots. | `npm run build` renders them; every schema field visibly used |
| A3 | **Build-time safety gate** on the programmatic route: structural throw — slug ↔ `facts` must agree and every declared page must be present; scope declared by data (`getStaticPaths` over the content file). No math re-run (A1). | hand-editing the data file so slug and facts disagree breaks the build |
| A4 | **Hub & spoke in place**: hub page(s) for the head term linking down with keyword-rich anchors; spoke-to-spoke related links computed from data (never hardcoded hrefs). | hubs exist; related links can't 404 |
| A5 | **On-page baseline**: `seoTitle` (≤~60 chars) distinct from the long H1, metaDescription, FAQPage JSON-LD from the `faqs` field, self-canonical, UTM-tagged CTA links, OG-card plan, sitemap includes the cluster. | present on the demo pages |

### The seed folder (the hand-off artifact, dropped into the engine repo)

```
seeds/<client>/
  # ── the engine INGESTS these (validate-seed / load-seed read them) ──
  site.json               # {slug, name, domain}
  persona.md              # OPTIONAL — site-level doctrine (see below)
  template.<key>.json     # §2 — the contract's core
  worklist.golden.json    # §3 — golden-set job body (or rely on a built-in enumerator)
  # ── demand INPUT (drives generation & review order — see below) ──
  keywords.csv            # query,volume_mo,maps_to,source — REAL tool data, source named
  # ── strategy COMPANION (travels for human review; engine never reads it) ──
  ROLLOUT.md              # phases by demand, sampling %, refresh cadence
```

**`persona.md` — the site-level doctrine layer.** One markdown file holding the
doctrine that must hold on EVERY page of the site regardless of template: brand
voice, the persuasion arc (e.g. "name the reader's real problem → position this
site as the resolution"), ethical guardrails. The engine prepends it to every
template's `system_prompt` at generation, so N templates inherit one doctrine by
construction. Rules:

- **Never duplicate**: doctrine lives in `persona.md`; a template's
  `system_prompt` carries ONLY template-specific rules (fact rules, arithmetic,
  anti-stamp, `{constraint_notes}` mechanics). Duplicated doctrine makes the
  model split the difference unpredictably.
- **Mutability asymmetry**: template versions are immutable; the persona is
  deliberately mutable site config. Re-running `load-seed` with a changed
  `persona.md` updates it for ALL future generations (published pages are
  immutable) — load-seed prints a loud diff when this happens. An absent file
  leaves the stored persona untouched; an empty file explicitly clears it.
- **Material persona change ⇒ template version bump + few-shot refresh.**
  Few-shots are concrete examples and dominate style; stale few-shots exemplifying
  the old doctrine will defeat a new persona. Re-golden (100% review) after
  adopting or materially changing a persona.
- Each item records the `persona_hash` it was generated under (in `validation`),
  so "which doctrine produced this page" stays answerable.

Only the files in the INGESTS block are read by the engine; `validate-seed` requires
`site.json` + at least one `template.*.json` (a `worklist*.json` is checked when
present). `ROLLOUT.md` is the strategist's plan for humans. `keywords.csv` is
more than evidence: it is the **demand input** — the operator runs
`scripts/keywords-to-worklist.mjs` over it to produce the job's `priorities`
map (§3), which sets generation/review order (`priority DESC`) and the rollout
phases (P1/P2/tail, gated on index coverage). Semantics: `maps_to` = the page's
`item_key`; multiple queries mapping to one page have their volumes summed;
`source` names the tool + pull date (invented volumes = refuse, see below).
Absence won't fail validation — but without it there is no demand-phased
rollout. Acceptance = this passes in the engine repo:

```sh
deno run --allow-read --config supabase/functions/deno.json \
  scripts/validate-seed.ts seeds/<client>
```

The validator runs the engine's own `fillTemplate`/`constraintNotes`/
`resolveGuards` — if it passes, generation will not hit placeholder or guard
resolution errors. It does not judge strategy; humans do.

**Refuse to proceed** (tell the human, don't improvise) if: there is no
enumerable data axis with real facts per page, or keyword volumes would have
to be invented. Doorway clusters are declined in Phase A, not caught in
review.

---

## 2. The template contract (`template.<key>.json`)

| Field | Type | Rules the engine enforces |
|---|---|---|
| `key` | string | slug; template identity. Breaking shape change later = NEW key (§8 architecture) |
| `version` | int | immutable once loaded; refresh = new version |
| `name` | string | human label |
| `model` | string | a REAL model id: `claude-sonnet-5` (golden) / `claude-haiku-4-5` (batch) are the defaults. Unknown ids are REJECTED at template creation |
| `temperature` | number | sent only to models that accept sampling (haiku-4-5, sonnet-4.x); silently omitted for sonnet-5/opus-4.7+ families |
| `max_tokens` | int | per-item output budget |
| `output_schema` | JSON Schema | see §2.1 |
| `guards` | object | see §2.2 — every key must reference real schema fields (validated) |
| `system_prompt` | string | TEMPLATE-SPECIFIC rules only (fact rules, anti-stamp "vary openings", facts-only rule) — site doctrine/voice lives in `persona.md` (§1), never duplicated here |
| `user_template` | string | facts + `{constraint_notes}` ONLY — no voice. See §2.3 |
| `few_shots` | array | `[{ "item_key": "...", "output": {…} }]` — start `[]`; distill ≤3 approved outputs later; the engine auto-excludes a few-shot matching the item being generated |

### 2.1 output_schema — what the LLM is forced to emit

- Subset honored structurally: `type`, `properties`, `required`, `items`,
  `enum`, `additionalProperties`. Objects should carry
  `additionalProperties: false` and full `required` (the engine adds them for
  strict mode if missing).
- **String length bounds do NOT go in the schema** (`minLength`/`maxLength`
  are stripped for strict mode). Put them in `guards.length` — they are
  re-issued to the model as prose automatically.
- Array count bounds (`minItems`/`maxItems`) MAY go in the schema — stripped
  before the API call but read for the constraint notes.
- Always include: a long-H1 field (`title`), a short SERP field (`seoTitle`
  — these two are DISTINCT; forgetting them was a real drift bug),
  `metaDescription`, `faqs` (array of `{q, a}`, 3–5 items).
- Every field must be renderable by the A2 demo component. Over-include
  slightly; adding a field later is a version bump, renaming is a new key.

### 2.2 guards — exact semantics as implemented

Severity: `"fail"` blocks approve/publish (hard, non-overridable in review);
`"flag"` routes to the human queue. Each gate runs only if its key exists in
`guards`; `guards.<gate>.severity` overrides the default.

| Gate | Scope | Config | Implemented behavior |
|---|---|---|---|
| `schema` | item | `{severity}` | structural mirror of strict mode (missing/extra/mistyped fields) |
| `unicode` | item | `{form: "NFC"}` | every string must equal its NFC normalization |
| `length` | item | `{fields: {field: [min,max]}}` | Unicode **code points** (correct for Vietnamese). **Asymmetric severity:** under-`min` or a missing field is a hard **`fail`** (thin/absent content blocks approve); over-`max` alone is a soft **`flag`** (non-blocking overflow that still routes to review — set `max` for the SERP-truncation fields like `seoTitle`/`metaDescription` you actually want a reviewer to trim). A key may be `field.N` to bound **element N** of an array-of-strings field (e.g. `"phanTich.0": [120,700]`) |
| `required_mentions` | item | `{rules: [{field, must_contain: ["{token}", …]}]}` | substring match AFTER `{token}` resolution from input_data — e.g. `"{price_buy_fmt}"` → `"8.450.000"` must appear in the field |
| `banned_phrases` | item | `{list: […]}` | case-insensitive substring across ALL string fields |
| `numeric_consistency` | item | `{computed: [inputDataFields]}` | ⚠️ matches 1–2 digit integers **0–33** in prose and requires each to appear among the named input_data values. Built for small-integer domains (numerology). **For prices/dates/big numbers: OMIT this gate** and enforce fidelity via `required_mentions` on pre-formatted strings carried in input_data |
| `faq_shape` | item | `{count, answers_must_contain: ["{token}"]}` | exactly `count` faqs, each with string q/a; every token must appear in ≥1 answer |
| `entity_consistency` | item | `{pattern, allowed, severity?}` | **auto-checks** invented entities: every match of `pattern` (a regex, e.g. a Can+Chi pair) in the prose must appear in `allowed` — the entity strings legit for this item, resolved from input_data like `required_mentions` (e.g. `["{dayCanChi}","{monthCanChi}","{yearCanChi}"]`). Any match not in `allowed` → violation. A config with only `{note}` (no `pattern`) stays a passive reviewer note. Regex `pattern` should avoid `{n}` quantifiers (guard-token resolution) |
| `similarity` | batch | `{max_pairwise: 0.55}` | TF-IDF char-3-gram cosine across the job; items over threshold flagged (healthy batch: max ≈ 0.55, avg ≈ 0.43) |
| `phrase_frequency` | batch | `{max_shared: 2}` | first-sentence opening n-gram, digits collapsed (so "số 7…" and "số 4…" stamp alike); openings shared by more items get flagged |

### 2.3 user_template placeholders

- `{name}` and dot paths `{lp.archetype}` resolve from `input_data`. Arrays
  render joined with `", "`. **An unknown placeholder throws at generation**
  — never ships literally.
- Must contain `{constraint_notes}` where the length/count/mention rules
  should be injected (otherwise they're appended at the end).
- The same `{token}` syntax works inside guard configs (§2.2).
- Everything the prose must state comes in through input_data — the model is
  instructed to never compute or invent. Pre-format display values
  (`"8.450.000"`, `"11/07/2026"`) in input_data; `fillTemplate` does not
  format numbers.

## 3. The work-list contract (`worklist.golden.json`)

The literal `POST /jobs` body:

```jsonc
{
  "template_key": "<key>",
  "review_sample_pct": 100,           // golden set = 100; batches = 25
  "items": [
    { "item_key": "<slug>", "input_data": { /* every fact + every {token} the template/guards reference */ } }
  ],
  // OPTIONAL demand ordering: item_key → search volume; the engine generates
  // (and therefore reaches review) highest-priority first. Derive it from
  // keywords.csv with scripts/keywords-to-worklist.mjs — never invent volumes.
  "priorities": { "<slug>": 480 }
}
```

- `item_key`: `^[a-z0-9][a-z0-9-]*$`, unique per list, stable forever (it is
  the page's identity and URL slug).
- `input_data` is hashed (sorted-key JSON → sha256) into the cache key
  `(site, template_key, version, item_key, data_hash)`: re-posting identical
  rows is free (deduped); changed facts regenerate exactly the changed pages.
- Include **hub and sibling slugs inside input_data** (`hub`, `siblings`) —
  internal linking is data the prose/pages consume, not an afterthought. For the
  built-in **combo axis the engine now injects these automatically** (`hub` =
  `so-chu-dao-<lifePath>` pillar slug; `siblings` = same-life-path combos): the
  site renders links from `row.facts.hub`/`row.facts.siblings` and must not
  re-derive them (see the integration kit's `ContentPage.astro`). Ensure the hub
  pillar page exists. Other verticals still pass their own `hub`/`siblings`.
- Golden set: 8–15 items spanning the axis's variety (regions, classes,
  edge values like master numbers or falling markets) so review sees the
  voice under every condition.

## 4. What comes back (what your demo rows must imitate)

The site pulls `GET /v1/sites/<slug>/published?template=<key>` (site-scoped
bearer key) and receives:

```jsonc
[
  {
    "item_key": "so-chu-dao-7-su-menh-3",
    "template_key": "combo-so-chu-dao-su-menh",
    "template_version": 1,
    "output": { /* exactly output_schema; reviewer edits already merged */ },
    "facts":  { /* the item's input_data: every engine-computed value the page
                   stands on — numbers, harmony, and (combo axis) the
                   internal-link data `hub` + `siblings` (§3) */ },
    "updated_at": "2026-07-11T09:00:00Z"
  }
]
```

Your A2 demo file mirrors this envelope so the Phase C swap (hand-written →
pulled) is a one-line loader change. Computed display values (harmony class,
derived numbers, hub/sibling links) are rendered **from `row.facts`** — never
recomputed site-side (A1). The page-level throw checks that `facts` and the
slug agree structurally, not that re-run math matches.

**Publish webhook (optional go-live signal).** Register with your site key —
`POST /v1/sites/<slug>/webhooks {url}` (public https only). The response
returns a **`webhook_secret` ONCE** plus a `verify` block. On every publish the
engine POSTs `{site, template, template_version, item_key, item_count}` to the
URL, HMAC-SHA256 signed over the exact raw body as
`x-signature: sha256=<hex>`. Deploy-hook URLs can ignore the header; your own
endpoint should verify it (constant-time compare — the integration kit ships a
ready `scripts/verify-webhook.mjs`). Then re-pull; the payload tells you which
item changed, so `?since=` incremental pulls work.

## 5. Known traps (each burned a real project)

1. **Constraint notes are load-bearing** — never instruct the engine team to
   drop them; ~⅓ of items fail the schema gate without them.
2. **`title` ≠ `seoTitle`** — the SERP truncates ~60 chars; author both.
3. **Local math copies diverge** — render engine-computed values from `row.facts`, never re-run the math site-side (A1).
4. **`numeric_consistency` on big numbers** — false positives; use formatted
   strings + `required_mentions` (§2.2).
5. **Stamped openings** — if your example rows all start "«Entity X» hôm
   nay…", the batch will too, and `phrase_frequency` will flag it. Vary your
   own demo rows; the system prompt must demand varied openings.
6. **Don't put voice in `user_template`** — few-shots + system prompt carry
   voice; the user template carries facts. Mixing them makes distillation
   regress.
7. **Published is immutable** — fixes after publish are a version bump, so
   the golden review is the cheap place to be picky.
