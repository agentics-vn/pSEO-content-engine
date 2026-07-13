# Programmatic SEO Content Engine — Multi-Tenant Architecture & Design Plan

**Status:** design plan, derived from a working single-tenant implementation
(ngaylanhthangtot.vn — Vietnamese lunar-calendar SEO pages). This document
generalizes that implementation into a standalone service capable of serving
multiple independent apps, each with its own Supabase project and its own
backend.

---

## 1. Goal & scope

Build a **content generation and distribution service** that:

- Turns structured data (dates, cities, products, comparisons — any
  repeatable unit) into validated, on-brand prose at scale via LLMs.
- Serves **multiple tenant apps**, each fully independent infrastructurally
  (own database, own backend, own domain, own deploy pipeline).
- Never touches a consuming app's database or holds its credentials —
  the only surface between engine and app is a versioned HTTP API contract.
- Enforces content quality through automated gates so a human reviewer only
  looks at content that's actually ambiguous, not every generated item.

**Non-goals:** the engine does not build pages, does not manage SEO
indexing/sitemaps for any app, does not host analytics, does not know what
a "domain" or "deploy" is. Those stay entirely inside each app.

---

## 2. Core principles (read before designing a new tenant)

1. **Find the scaling axis first.** Programmatic SEO only works when there's
   a real, enumerable data axis behind the pages (a day, a city, a product
   pair, an FAQ per industry vertical). If there's no data axis, this isn't
   the right tool — don't force it.
2. **Real data behind every page, prose is a layer on top.** The line
   between a legitimate page and a penalized "doorway page" is whether each
   page answers a real query with real computed facts. Prose personalizes
   the presentation; it is not what makes pages distinct from each other —
   the underlying data is.
3. **Price the batch before writing code.** Cheap model (Haiku-class) with a
   tight prompt ≈ $0.015–0.02/page; expensive model (Sonnet-class) ≈
   $0.05–0.08/page. At 20,000 pages that's a few hundred dollars vs a few
   thousand — know which one you're signing up for before building.
4. **Build-time safety over runtime hope.** Any missing or drifted content
   must fail the *build*, not silently ship a blank or wrong page. This is a
   consuming-app responsibility (see §9) but it is a first-class design
   constraint, not an afterthought.

---

## 3. Repo topology

```
seo-engine/                      ← NEW, standalone repo
├── Supabase project (own)       ← content generation + admin, isolated
│   ├── migrations                  from every consuming app's infra
│   ├── edge functions:
│   │     prose-admin        (CRUD: templates, jobs, review, publish)
│   │     prose-generate     (the ONLY place holding the LLM API key)
│   │     content-api        (external distribution API — see §8)
│   └── RLS policies scoped by site_id
└── Admin UI (multi-tenant)      ← pick a site, then operate its
                                    templates/jobs/review queue

app-a/  (e.g. ngaylanhthangtot)   ├── OWN Supabase project
app-b/  (future tenant)          ├── OWN backend/API layer
app-c/  (future tenant)          ┘  ├── calls seo-engine's content-api
                                     ├── stores the result in its own DB
                                     └── owns its own build/deploy/SEO/analytics
```

The engine never appears in an app's dependency tree as a database
connection — only as an external API it calls from its own backend.

---

## 4. Data model (engine-side, in the engine's own Supabase project)

```sql
-- Tenancy
sites            (id, slug, name, created_at)
site_admins      (user_id, site_id, role)          -- human admin auth
site_api_keys    (id, site_id, key_hash, scope, created_at, revoked_at)

-- Content pipeline (each row now scoped to a site)
prose_templates  (id, site_id, key, version, name, system_prompt,
                   user_template, output_schema, few_shots, guards,
                   model, temperature, max_tokens, created_by, created_at)

prose_jobs       (id, site_id, template_id, status, mode, item_count,
                   review_sample_pct, tokens_in, tokens_out, cost_usd,
                   created_by, created_at, finished_at)

prose_items      (id, site_id, job_id, template_key, template_version,
                   item_key, data_hash, input_data, output, edited_output,
                   status, validation, similarity, regen_count, reviewer,
                   review_note, updated_at)

prose_published  -- view: distinct on (site_id, template_key, item_key)
                 -- order by updated_at desc, status = 'published'
```

**Cache key (critical):** unique constraint on
`(site_id, template_key, template_version, item_key, data_hash)`.
Without `site_id` in the key, two tenants that happen to name a template
the same thing (`"product-page"`) collide. Without `template_version`,
generating the same item under a new prompt/model version silently reuses
the old cached output instead of regenerating.

**Two separate auth layers — do not conflate:**

| | Who | Mechanism | Scope |
|---|---|---|---|
| Human admin auth | Content editors/reviewers | `site_admins` role check | One site at a time, per login |
| Machine API auth | A consuming app's own backend | `site_api_keys` bearer token | Read-only, one site, optionally one template |

---

## 5. Content pipeline

```
Template (immutable per version)
  → Job (batch of N inputs, e.g. "every day in September")
    → Items (status: pending → generated/flagged/failed_validation
              → approved/rejected → published)
      → Validation gates (automatic, run right after generation)
        → Human review (only for flagged items, or a sample %)
          → Publish (immutable snapshot; the ONLY thing distributed
                      externally via the content-api)
```

- **Jobs run through Anthropic Message Batches by default** (submit → poll →
  collect; ~50% token cost), with a per-item sync channel as the escape hatch
  (regen, dry-run). Truncated/degenerate results auto-retry once with a bumped
  budget; output budgets are auto-sized from the template's own length bounds;
  the static prompt prefix is cache_control-cached. Every invocation stays
  under the serverless wall-clock cap regardless of batch size.
- **Publishing is one-way.** A published item is never mutated in place; a
  content refresh creates a new template version and republishes, and
  `prose_published` always serves the newest published row per item key.

---

## 6. LLM call design (the part with the sharpest edges)

### 6.1 Forced, strict tool use

Every generation call forces a tool call against the template's
`output_schema` and enables strict server-side schema validation (e.g.
Anthropic's `strict: true` on the tool definition). This eliminates entire
classes of malformed output (stringified arrays, stray tags mid-JSON)
*before* it ever reaches application code.

### 6.2 The strict-mode trap — constraint notes

Strict validators typically **reject** count/length constraint keywords
(`minItems`, `maxLength`, `pattern`, `minimum`, `maximum`, …) inside the
schema. To enable strict mode, these keys must be stripped from the schema
sent to the API — which means **the model no longer sees those
constraints** and output quality/shape will drift (fewer/more items than
required, wrong length) even though the *type* validates.

**Prompt layering (site → template → item):** a per-site `persona`
(sites.persona — voice, persuasion doctrine, guardrails, authored as
`seeds/<client>/persona.md`) is prepended to EVERY template's `system_prompt`
at generation, so all of a site's templates inherit one doctrine with nothing
copy-pasted. The template's own `system_prompt` carries only template-specific
rules; `user_template` carries only facts + `{constraint_notes}`.

**Required companion technique:** walk the *original* (un-stripped) schema,
render every dropped constraint as a plain-language instruction, and append
it to the system prompt. Skipping this step is not a minor gap — in this
project's own first full-scale batch, it caused roughly a third of all
generated items to fail the schema gate.

```
stripForStrict(schema)      → schema sent to the API (constraints removed)
constraintNotes(schema, guards)
                            → text appended to system_prompt, e.g.:
  "RÀNG BUỘC BẮT BUỘC — tuân thủ tuyệt đối:
   - phanTich: mảng có ĐÚNG 2 phần tử
   - phanTich.0: chuỗi dài 120–700 ký tự"
```

### 6.3 Model tiering

- Cheap model + tightly-scoped few-shots (scrubbed of any cross-item
  leakage — models imitate examples over instructions) + full constraint
  notes → acceptable quality for **formulaic** templates (structured facts
  → fixed-shape prose).
- Expensive model → templates requiring genuine synthesis/interpretation.
- **Distillation loop:** promote human-approved expensive-model outputs
  into the cheap model's few-shot set over time, narrowing the quality gap.
- Per-tenant model choice is already free: `model` lives on the template
  row, so different sites (or different templates within a site) can pick
  independently with zero engine changes.

### 6.4 Coercion as a second line of defense

Even with strict mode, keep a `coerceToSchema()` pass (e.g. re-parsing a
stringified array back into a real array) as a cheap safety net — strict
mode plus constraint notes should make this a no-op in practice, but it's
inexpensive insurance.

---

## 7. Validation gates (generic engine, per-tenant configuration)

The gates module must know **nothing** about any tenant's domain. Every
domain-specific rule is data, configured per template in the `guards` JSON
column — never hardcoded in the shared module.

| Gate | Severity | What it catches |
|---|---|---|
| `schema` | fail (blocks publish) | structural shape mismatch |
| `required_mentions` | fail | a mandatory entity/field isn't referenced in the prose |
| `banned_phrases` | fail | forbidden wording |
| `length` | asymmetric: under-min/missing = fail, over-max = flag | per-field code-point bounds (overflow routes to review, never blocks) |
| `unicode` | fail | non-normalized text, stray combining marks (critical for diacritic-heavy languages) |
| `numeric_consistency` | flag | a number in the prose has no basis in the input data |
| `entity_consistency` | flag | *(generalized from a calendar-specific "canchi_consistency")* — any regex-matched entity in the prose must appear in the input data; regex is per-template config, not hardcoded |
| `phrase_frequency` | flag, batch-level | one phrase over-used across the whole batch ("stamped" openings) |
| `similarity` | flag, batch-level | n-gram TF-IDF cosine between all pairs — catches near-duplicate content cheaply, no second LLM call needed |

**Hard rule, non-negotiable:** the *approve* action must refuse when any
`fail`-severity gate is still red. (A real regression: reviewers could
previously approve a structurally broken item because the review endpoint
only blocked edits to *already-published* items, not the approve step
itself — two bad items reached production before this was caught and
fixed.)

---

## 8. Distribution contract — the engine/app boundary

The engine exposes an HTTP API; **each app's own backend** calls it and
persists the result into its own database. The engine never sees an app's
database and never issues Supabase credentials externally.

```
GET  /v1/sites/{site_slug}/published
     ?template={template_key}&since={template_version|updated_at}
     Header: Authorization: Bearer <site-scoped API key>
     → [{ item_key, template_key, template_version, output, facts, updated_at }, ...]
       (`facts` = the item's input_data: engine-computed deterministic values
        the page renders — numbers, hub/sibling link slugs — never recomputed)

POST /v1/sites/{site_slug}/webhooks           (registered with the site key)
     Body: { url: "https://api.app-a.example/internal/seo-content-updated" }
     → returns a per-site webhook_secret ONCE. On publish the engine POSTs
       { site, template, template_version, item_key, item_count }, HMAC-SHA256
       signed over the raw body as `x-signature: sha256=<hex>`. Still a signal,
       not the payload — the app's backend calls GET /published afterward
       (the item_key enables `?since=` incremental pulls).
```

**Schema evolution policy** (so a content update never silently breaks an
app's build):

- Non-breaking content refresh → bump `template_version` under the same
  `template_key`. Apps consuming "latest published" pick it up transparently.
- Breaking shape change (renamed/retyped field) → **new `template_key`**.
  Forces the app to deliberately migrate rather than silently failing type
  checks at build time.

---

## 9. Responsibility matrix

| Responsibility | Engine repo | Consuming app's own backend | Consuming app's frontend/build |
|---|---|---|---|
| Generate & review content, hold the LLM API key | ✅ | — | — |
| Expose the distribution API per site | ✅ | — | — |
| Call the API, persist into its own DB | — | ✅ | — |
| Build-time gate: fail if content missing/drifted from computed facts | — | (optional) | ✅ |
| Static page generation, deploy | — | — | ✅ |
| Sitemap, GSC/IndexNow submission | — | — | ✅ |
| Analytics (pageviews, CTA clicks, revenue) | — | — | ✅ |

The engine's contract surface with the outside world is exactly: one API,
one webhook, one API-key system. Everything to the right of that is each
app's own concern and the engine has no opinion on it.

---

## 10. Consuming-app pattern: build-time safety gate (recommended, not enforced)

Every app integrating with the engine should replicate this pattern in its
own generator/build step:

- Declare, in the app's own config, exactly which content units are
  expected to exist (e.g. "every day in this date range", "every city in
  this list").
- At build time, for each declared unit: if the corresponding content is
  missing from the pulled snapshot, **throw** — never emit a blank or
  fallback page silently.
- Where feasible, cross-check that the prose actually references the fact
  the app itself computed for that unit (e.g. the correct date, the correct
  price) — catches silent data/content drift between the two systems.

This logic is intentionally *not* part of the engine, because "what facts
must this content agree with" is different per app domain — but it should
be documented as a required integration pattern, not left to chance.

---

## 11. On-page SEO checklist for hub/landing pages (per tenant)

Applies to whichever page in each tenant app is meant to rank for the head
keyword (usually the homepage) — commonly under-optimized because it's
designed to convert, not to rank:

- H1 and `<title>` actually contain the target head keyword phrase.
- Canonical tag present and self-referencing.
- The strongest page on the site links internally to the programmatic
  content cluster in more than a token footer mention — ideally a
  dedicated on-page section with keyword-rich anchors to key hub pages.
- Structured data includes `WebSite`/`Organization`, not just the
  product's own schema type.
- `og:image` is a branded card, not a raw app icon.
- Balance: keep the conversion-focused hero as-is; add an SEO section
  *beneath* it rather than replacing the sales narrative.

---

## 12. Auto-indexing pipeline (per app, not per engine)

Each app should run its own CI job, triggered when its sitemap changes:

1. Re-submit the sitemap via the Search Console API (prefer OIDC/Workload
   Identity Federation over long-lived key files).
2. Push the same URL list to IndexNow (covers Bing/Yandex — Google does not
   support IndexNow).
3. A weekly scheduled job that inspects every sitemap URL via the URL
   Inspection API and reports index-coverage percentage — this is the
   number that should gate the decision to run the next content batch, not
   a guess.

**Common infra trap:** check whether the domain serves both `www.` and apex
without a redirect — if so, Google indexes both hosts and splits ranking
signal even when canonicals are correct. Fix with a permanent host-level
redirect.

---

## 13. Measurement layer (per app)

Search Console answers "does Google send people here." A lightweight,
privacy-friendly analytics layer answers "what do they do next" — pick a
script size proportional to how many static pages exist (a heavy script
tax on thousands of static pages defeats the point).

Minimum event set:
- CTA click into the core product (tagged with source page).
- Signup/registration complete.
- **Purchase, with revenue value** — this is the one that actually answers
  which content cluster is worth scaling further; without it, traffic
  numbers alone can't drive the next batch's prioritization.
- Consistent UTM/source parameters on every content→product link, so
  purchases can be attributed back to the originating page.

Read bounce rate carefully for lookup-style content: a high bounce rate
paired with a *long* visit duration is the normal signature of "the page
fully answered the query in one view" — not a problem. High bounce paired
with a *short* duration is the actual warning sign (title/snippet mismatch,
slow load, broken layout).

---

## 14. Migration path from an existing single-tenant deployment

If a working single-tenant version already exists (as it does here), don't
big-bang the rewrite:

1. Add the `sites` table and a `site_id` column to the three content
   tables; backfill the one existing tenant. No behavior change yet.
2. Generalize any domain-specific gate (e.g. a hardcoded regex check) into
   the generic `entity_consistency` config shape; migrate the existing
   template's config to use it; verify output is unchanged.
3. Build the `content-api` edge function and API-key table; point the
   existing app's pull script at it over HTTPS instead of direct
   service-role DB access.
4. Extract the engine into its own repo. Keep it on the *same* Supabase
   project initially to avoid a risky infra cutover; the app now talks to
   it purely over the API regardless of where the DB physically lives.
5. Only split onto a fully separate Supabase project once the API boundary
   is proven stable — not a prerequisite for tenancy to work correctly.
6. Onboarding tenant #2: create a site record, define its templates/schema/
   guards via the admin UI, issue it an API key. Zero engine code changes
   required.

---

## 15. What's already proven (reference implementation notes)

The following was built and validated against a real production batch
(31 days of calendar content, ~$0.50 total generation cost, live and
indexed) and should be treated as validated, not speculative:

- Template → Job → Item → Review → Publish flow, end to end.
- Strict tool use + constraint notes eliminating both malformation classes
  observed (stringified arrays from a small model, stray tags from a
  larger one).
- Version-scoped item cache preventing A/B test cross-contamination.
- Approve-blocked-on-failing-gate fix, after a real incident where two
  broken items reached production.
- n-gram TF-IDF similarity gate, measured in production: average pairwise
  cosine 0.434, max 0.715 across a 31-page batch — confirms the batch is
  not near-duplicate content by the same metric Google-adjacent tooling
  would use.
- Build-time throw-on-missing-content gate in the static generator.
- Automated GSC resubmit + IndexNow push on every sitemap change, plus a
  weekly automated index-coverage report.
