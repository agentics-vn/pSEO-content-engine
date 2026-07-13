# Onboarding a new client (tenant) — zero engine code

## The recommended flow: strategy lives in the SITE repo

Seat 1 works best where the pages will actually render — run Claude Code in
the client's site repo (sochudao, ngaylanhthangtot, …), where the design
system, existing pages, and real GSC data are at hand:

```
A. SITE REPO (Claude Code + human strategist)
   keyword research → axis → hub & spoke → output_schema designed AGAINST
   real components → demo pages rendered from 2–3 hand-written sample
   `output` rows → template + work-list authored
        │  hand-off = one folder: seeds/<client>/
        │    site.json · persona.md · template.<key>.json · worklist.golden.json · ROLLOUT.md
        ▼
B. ENGINE REPO (drop the folder — three commands)
   deno run --allow-read --config supabase/functions/deno.json \
     scripts/validate-seed.ts seeds/<client>        # same fill/guard code the
                                                    # engine runs — must pass
   deno run … scripts/load-seed.ts seeds/<client>   # site + template + key
   POST /jobs with worklist.golden.json             # (or the admin UI)
   → generate → review → approve → publish
        │  publish webhook → site CI
        ▼
C. SITE REPO (already integrated — the demo pages became the components)
   pull-and-throw script re-pulls → build renders published pages
```

**The full Phase A specification — what to produce and exactly what the engine
accepts — lives in the self-contained package
[`phase-a-handoff/`](./phase-a-handoff/) (orientation README + the engine
contract + the authoring method + a worked example + a copy-paste kickoff
prompt). Upload that whole folder to the Claude Code session in the client site
repo.**

The critical trick in phase A: **write the 2–3 demo pages against
engine-shaped data** (a hand-authored `output` row matching the schema, in a
`*.generated.json` file). That proves the schema is renderable before a
single token is spent, and it means Seat 2 barely exists as a separate step —
by the time the engine publishes, the components and pull script are already
merged. The [`phase-a-handoff/`](./phase-a-handoff/) package is the complete
reference — contract, method, a real example seed, and a kickoff prompt.

## Run it in ONE session — add both repos, don't relay

The A→B→C above spans two repos, but that does **not** mean two Claude sessions
passing notes through you. That relay is the single biggest source of friction —
avoid it. Start **one** session and add both repos to it (`add_repo` the site
repo into the engine session, or vice-versa); one agent then does the site-side
authoring **and** the engine-side load/generate/job (via the Supabase MCP) with
no copy-paste hand-off. The seed folder, the API key, and the "published" signal
stop being chat messages and become in-session steps.

Only two things genuinely need a human, by design:
- **Review + Publish** — the quality gate. Keep a person here.
- **One-time secrets** — the service-role / Anthropic keys stay on your machine;
  the site's read key is handed over once. These are single events, not a loop.

Everything else — validate, load, create the golden job, wire the pull — one
session does end to end. (Cross-org note: the engine lives in `agentics-vn` and
sites often in another org; the session needs GitHub scope for both.)

---

The engine is multi-tenant by construction: every row is scoped by `site_id`,
the item cache key includes the tenant, API keys are site-scoped, and admin
logins see one site at a time. Onboarding a client is **data entry, not
development** — with one prerequisite that is strategy, not code.

## Step 0 — find the scaling axis (or refuse the deal)

Programmatic SEO only works when there is a real, enumerable data axis behind
the pages (architecture §2): a city, a product pair, a date, a spec sheet, a
price point. "Mass articles" without an axis is a doorway-page penalty waiting
to happen — the prose personalizes the presentation of real facts; it is not
what makes pages distinct. If the client cannot name the axis and the
structured facts behind each page, this engine is the wrong tool for them.

## Step 1 — create the site + key

```sh
# seeds/<client>/site.json + template.<key>.json, then:
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
  deno run --allow-net --allow-env --allow-read scripts/load-seed.ts seeds/<client>
```

Prints a read-only, site-scoped API key once → goes into the client site's
build secrets. Add their reviewers to `site_admins` (`editor` builds
templates/jobs, `reviewer` approves/publishes, `owner` = both).

> For the concrete, project-specific version of these commands against the live
> engine (deploy, secrets, admin login, seed load, smoke test) see
> [`DEPLOY.md`](./DEPLOY.md). **Note on names:** the `site.json` `slug` is the
> engine tenant id and is independent of the client's repo name — e.g. the
> `sochudao` repo (`consumers/sochudao/`) powers the `sochumenh` tenant
> (`sochumenh.vn`). Keep the slug stable; it's baked into every API key and URL.

> **Productized path:** collect `seeds/<client>/brief.json` (copy
> `seeds/_intake/brief.example.json`), then run the `author-template` skill —
> it executes steps 2–3 as a reviewable PR (schema, guards, prompts, golden
> work-list, rollout plan). For step 5, `node scripts/generate-integration-kit.mjs
> seeds/<client> <out>` emits the site-repo starter kit (pull-and-throw
> script, page stub per schema field, FAQPage JSON-LD, checklist).

## Step 2 — author the template (the actual craft)

One template = one page shape. Fill in:

| Field | What it encodes |
|---|---|
| `output_schema` | the exact JSON shape their site renders |
| `guards` | lengths, required mentions, banned phrases, numeric/entity consistency, similarity threshold — all data, no engine code |
| `persona.md` (site level) | the doctrine on EVERY page — voice, persuasion arc, guardrails; engine prepends it to every template's prompt |
| `system_prompt` / `user_template` | TEMPLATE-specific rules only + the structured facts, with `{placeholders}` and `{constraint_notes}` (doctrine lives in persona.md, never duplicated) |
| `model` | Sonnet-class for the golden set, Haiku-class after distillation |

## Step 3 — supply the work-list (the tenant-generic path)

`POST /jobs` accepts explicit rows — any vertical, any data source:

```jsonc
{
  "template_key": "<template-key>",
  "items": [
    { "item_key": "<slug-1>", "input_data": { "city": "Hà Nội",  "value": 8450000, "unit": "VND" } },
    { "item_key": "<slug-2>", "input_data": { "city": "Đà Nẵng", "value": 8430000, "unit": "VND" } }
  ],
  "review_sample_pct": 100
}
```

`input_data` is hashed into the cache key, so re-posting the same rows is free
(dedupe) and changed facts regenerate automatically. Built-in enumerators
(like `enumerate: "combo-grid"` for the numerology axis) are conveniences on
top of this, not requirements.

## Step 4 — golden set → distill → batch

Same playbook as WP6, every tenant: ~15 hand-reviewed items on the expensive
model spanning the axis's variety (set `review_sample_pct: 100`), promote the
best approved outputs into `few_shots`, switch the template `model` to
Haiku-class, then run the full batch phased by search demand with 25%
sampling on top of auto-flags.

## Step 5 — wire their site

Their backend/build pulls `GET /v1/sites/<slug>/published` with their key and
replicates the build-time safety gate (declare the expected page list, throw
on missing/drifted content — see `consumers/sochudao/` for the reference).
Optionally register a webhook so publishes trigger their CI rebuild — the
registration returns a `webhook_secret` once, and every ping is HMAC-signed
(`x-signature`) with an enriched payload (`item_key`, `template_version`).

**What the engine never does for a tenant:** page building, deploys, sitemaps,
GSC/IndexNow submission, analytics. Those live in the client's stack (§9) —
budget them in the engagement.

## Phase B storage model — where articles live (one answer)

**The engine's Supabase is the single system of record for every tenant's
articles.** `prose_items`/`prose_published` are tenant-generic (`site_id`
scope + JSONB `output`), so a new project is new ROWS, never a new table or
schema. Do not create SEO-content tables in any project's database.

Per-tenant, the only site-side artifact is the **pulled snapshot**
(`*.generated.json`) written at build time — a cache, not a store; the engine
can regenerate it entirely. This also isolates availability: engine downtime
can only fail a *build*, never production traffic, because the static site
serves the last good snapshot.

The one legitimate exception: an app that renders content **at runtime**
(SSR, in-app feeds, its own search over articles). Then its backend may
mirror published rows into its own DB via `GET /published` + the webhook —
still over HTTP with its site key, still a disposable replica of the engine's
record. Architecture §8's "persists into its own database" describes this
optional pattern only; it is not part of the standard static-tenant flow.

Never grant a project direct access to the engine DB (keys, connection
strings, or PostgREST) — the API + site-scoped key is the entire contract.

## The performance loop (what makes this optimization, not publishing)

Per tenant, weekly and automatic once the kit's workflow is wired:

```
site CI: report-performance.mjs (GSC, per page) ─┐
site backend: analytics rollups (utm_content =   ├→ POST /v1/sites/<slug>/metrics
              item_key → conversions, revenue) ──┘        (site-scoped key)
                                                              │
engine: page_metrics → GET /metrics → admin "Search Performance" card
                                                              │
decisions: refresh bottom performers (new template_version), expand winners
(new spokes), rank the next batch by revenue per cluster — not by volume
```

Adaptive sampling closes the other loop: jobs created without an explicit
`review_sample_pct` derive one from the template's recent first-pass gate
rate (<15 items → 100%; ≥95% → 10%; ≥99% → 5%; else 25%). Auto-flagged items
always reach review regardless — this only tunes the random sample on clean
items. Reviewer hours are the unit economics; spend them where the model
still fails and where the money is.

Answer-engine distribution ships from the same atoms: the kit's
`generate-feeds.mjs` emits `public/llms.txt` + `public/feeds/<template>.json`
at build time — extractable, fact-backed Q&A for AI Overviews/Perplexity-class
engines, and the structural hedge against pure blue-link dependence.
