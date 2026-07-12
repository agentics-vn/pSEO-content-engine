# Phase A hand-off contract

> **Bundle snapshot** (site-repo handoff, 2026-07). Canonical source:
> `docs/PHASE-A-HANDOFF.md` in the pSEO content-engine repo. This is the
> **contract you must follow** — read `README.md` in this bundle first.

**Audience: the Claude Code session working in a CLIENT SITE repo** (sochudao,
ngaylanhthangtot, …) doing SEO strategy + template authoring. This document
is the complete specification of (1) what you must produce, and (2) exactly
what the engine accepts — field by field, gate by gate, as implemented. If
you follow this doc, `scripts/validate-seed.ts` passes and the engine
generates without surprises. Give this doc to the session verbatim (copy it
into the site repo or paste the raw URL).

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
| A1 | **Shared math/facts dependency.** If pages stand on computed values, the site imports `@pseo/numerology-core` (or the domain's shared package). **No local copy of the math** — a local fork WILL diverge from the engine (this happened: the site's `comboHarmony` kept an old heuristic and the flagship page's harmony badge would have silently flipped at integration). | grep finds no duplicated implementation |
| A2 | **3–5 demo pages rendered from engine-shaped data**: hand-write sample rows in the exact published envelope (§4) into a `*.generated.json`-style file and render them through the real page component. These double as the future few-shots. | `npm run build` renders them; every schema field visibly used |
| A3 | **Build-time safety gate** on the programmatic route: recompute the facts, throw on slug/data drift; scope declared by data (`getStaticPaths` over the content file). | hand-editing a number in the data file breaks the build |
| A4 | **Hub & spoke in place**: hub page(s) for the head term linking down with keyword-rich anchors; spoke-to-spoke related links computed from data (never hardcoded hrefs). | hubs exist; related links can't 404 |
| A5 | **On-page baseline**: `seoTitle` (≤~60 chars) distinct from the long H1, metaDescription, FAQPage JSON-LD from the `faqs` field, self-canonical, UTM-tagged CTA links, OG-card plan, sitemap includes the cluster. | present on the demo pages |

### The seed folder (the hand-off artifact, dropped into the engine repo)

```
seeds/<client>/
  site.json               # {slug, name, domain}
  template.<key>.json     # §2 — the contract's core
  worklist.golden.json    # §3 — golden-set job body (or rely on a built-in enumerator)
  keywords.csv            # query,volume_mo,maps_to,source — REAL tool data, source named
  ROLLOUT.md              # phases by demand, sampling %, refresh cadence
```

Acceptance = this passes in the engine repo:

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
| `model` | string | a REAL model id: `claude-sonnet-5` (golden) / `claude-haiku-4-5` (batch) are the defaults. Invented ids 404 at generation |
| `temperature` | number | sent only to models that accept sampling (haiku-4-5, sonnet-4.x); silently omitted for sonnet-5/opus-4.7+ families |
| `max_tokens` | int | per-item output budget |
| `output_schema` | JSON Schema | see §2.1 |
| `guards` | object | see §2.2 — every key must reference real schema fields (validated) |
| `system_prompt` | string | voice, persona, DO-NOTs, anti-stamp instruction ("vary openings"), facts-only rule |
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
| `length` | item | `{fields: {field: [min,max]}}` | Unicode **code points** (correct for Vietnamese); a missing field counts as a violation |
| `required_mentions` | item | `{rules: [{field, must_contain: ["{token}", …]}]}` | substring match AFTER `{token}` resolution from input_data — e.g. `"{price_buy_fmt}"` → `"8.450.000"` must appear in the field |
| `banned_phrases` | item | `{list: […]}` | case-insensitive substring across ALL string fields |
| `numeric_consistency` | item | `{computed: [inputDataFields]}` | ⚠️ matches 1–2 digit integers **0–33** in prose and requires each to appear among the named input_data values. Built for small-integer domains (numerology). **For prices/dates/big numbers: OMIT this gate** and enforce fidelity via `required_mentions` on pre-formatted strings carried in input_data |
| `faq_shape` | item | `{count, answers_must_contain: ["{token}"]}` | exactly `count` faqs, each with string q/a; every token must appear in ≥1 answer |
| `entity_consistency` | item | `{note}` | reserved: currently reviewer guidance shown in the queue, not auto-checked |
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
  ]
}
```

- `item_key`: `^[a-z0-9][a-z0-9-]*$`, unique per list, stable forever (it is
  the page's identity and URL slug).
- `input_data` is hashed (sorted-key JSON → sha256) into the cache key
  `(site, template_key, version, item_key, data_hash)`: re-posting identical
  rows is free (deduped); changed facts regenerate exactly the changed pages.
- Include **hub and sibling slugs inside input_data** (`hub`, `siblings`) —
  internal linking is data the prose/pages consume, not an afterthought.
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
    "updated_at": "2026-07-11T09:00:00Z"
  }
]
```

Your A2 demo file mirrors this envelope so the Phase C swap (hand-written →
pulled) is a one-line loader change. Computed display values (harmony class,
derived numbers) should be recomputed page-side from the shared package, not
stored — that's what the drift throw checks.

## 5. Known traps (each burned a real project)

1. **Constraint notes are load-bearing** — never instruct the engine team to
   drop them; ~⅓ of items fail the schema gate without them.
2. **`title` ≠ `seoTitle`** — the SERP truncates ~60 chars; author both.
3. **Local math copies diverge** — depend on the shared package (A1).
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
