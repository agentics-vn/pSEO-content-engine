# pSEO Content Engine

A standalone, multi-tenant content generation + distribution service. Turns
structured data (any repeatable unit — a day, a city, a number pair) into
validated, on-brand prose at scale via LLMs, and serves it to independent
consuming apps over one versioned HTTP contract. The engine never touches a
consuming app's database and never holds its credentials.

Full design: [`docs/architecture.md`](docs/architecture.md). This README is the
build order.

## Repo map

```
packages/numerology-core/   Shared deterministic math — SINGLE source of truth,
                              imported by the engine AND every numerology tenant.
supabase/
  migrations/0001_…sql       Tenancy + content pipeline. Locks the critical cache
                              key (site_id, template_key, version, item_key, hash).
  functions/
    prose-generate/          The ONLY holder of the LLM API key. Anthropic
                              Message Batches by default (sync escape hatch),
                              auto-retry on truncated/degenerate output,
                              auto-sized max_tokens, prompt caching. Strict
                              tool use + constraint-notes + gates. Prepends the
                              site PERSONA (sites.persona) to every template's
                              system_prompt.
    prose-admin/             Templates, jobs (demand-priority ordering), review,
                              approve (fail-gate block), one-way publish
                              (HMAC-signed webhook ping).
    content-api/             The only external surface: GET /published
                              (output + engine-computed `facts`) + webhook
                              registration, site-scoped bearer keys, read-only.
    _shared/gates/           GENERIC validation gates — all domain rules arrive as
                              data via each template's `guards` JSON.
seeds/sochumenh/             Tenant #1: site record, combo template, ROLLOUT plan,
                              persona + v3 drafts awaiting site approval.
docs/phase-a-handoff/        THE handoff package a site-repo session works from.
```

## Boundary (why this is a separate repo)

The engine's entire contract with the outside world is: **one API, one webhook,
one API-key system.** Everything downstream — page building, deploy, sitemaps,
indexing, analytics — stays inside each consuming app. That HTTP boundary is what
lets one engine serve apps on completely different stacks (react-router/Vercel,
astro/Fly) without caring which.

## Status

**Live.** The engine project (`mafqvoahltslxwttmvkn`) is deployed and serving:
migrations `0001`–`0014` applied; all three edge functions ACTIVE; edge
functions auto-deploy from `main` via `.github/workflows/deploy-functions.yml`.
Tenant #1 (`sochumenh`) has its golden set (5 pages) **published and pulled by
the live site**. See [`docs/DEPLOY.md`](docs/DEPLOY.md) for the runbook.

| Piece | State |
|---|---|
| Schema (tenancy, cache-key, security, batch, persona — `0001`–`0014`) | ✅ applied live |
| `prose-generate` (batches, auto-retry, sizing, caching, persona, gates) | ✅ deployed (CI auto-deploy) |
| `prose-admin` (templates, jobs + priorities, review, publish + signed webhook) | ✅ deployed (CI auto-deploy) |
| `content-api` (published rows incl. `facts`, webhook registration + secret) | ✅ deployed |
| Per-site persona layer (`persona.md` → every template's prompt) | ✅ live · sochumenh adoption pending (drafts in seed) |
| sochumenh golden set | ✅ published (5 pages, live on the site) |
| Central GSC collector + per-project performance ingestion | ✅ implemented · ⬜ Google-side setup (`docs/GSC-SETUP.md`) |
| Admin UI (mobile-optimized; persona card, priorities, actual cost) | ✅ · Fly: `pseo-content-engine` |
| Scheduled Routines (steward + GSC collector) | ⬜ enable after env/secrets config |
| Full 144-combo run | ⬜ after persona + template v3 adoption (`seeds/sochumenh/ROLLOUT.md`) |

## Admin UI

`admin/` is a Vite + React SPA over the `prose-admin` API (design per the
Be.run-style reference: cream canvas, white cards, charcoal panels,
yellow/coral accents). Sign in with a Supabase admin account (`site_admins`
membership) — it shows only live engine data. Dashboard: generation bubbles,
job-runs calendar, gate-pass-rate gauge (goal 90%, WP6 acceptance), 144-combo
grid coverage, and the review queue with per-gate pill strips —
approve/publish/reject inline (approve surfaces the 409 when a fail-severity
gate is red). Engine URL + anon key are baked at build time (`admin/.env.example`
/ Fly `[build.args]`); login is site slug + email + password. Production:
`https://pseo-content-engine.fly.dev`.

```sh
cd admin && cp .env.example .env && npm install && npm run dev
fly deploy ./admin                         # from repo root → Fly.io
```

## Running tests

```sh
# numerology-core (Node 22+, native type stripping)
cd packages/numerology-core && npm test && npx tsc --noEmit -p .

# edge functions (Deno 2)
cd supabase/functions && deno test --allow-read tests/
deno check prose-generate/index.ts prose-admin/index.ts content-api/index.ts
```

## Deploying

Functions resolve `@pseo/numerology-core` through `supabase/functions/deno.json`
(import map → `packages/numerology-core/src`), keeping one math implementation
engine-side (sites consume engine-computed `row.facts`, they don't import it).
**Merging to `main` auto-deploys** `prose-generate` + `prose-admin` via
`.github/workflows/deploy-functions.yml` (correct `verify_jwt` flags baked in);
manual fallback: `supabase functions deploy <name>`. The only
secret you set by hand is `ANTHROPIC_API_KEY` (on **prose-generate**, the one
function that calls the model) — `SUPABASE_URL` / `SUPABASE_ANON_KEY` /
`SUPABASE_SERVICE_ROLE_KEY` are auto-injected into every edge function and the
`SUPABASE_` prefix is reserved. Run migrations with `supabase db push`, then
load tenant #1:

```sh
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
  deno run --allow-net --allow-env --allow-read scripts/load-seed.ts seeds/sochumenh
```

**Live go-live checklist:** for the concrete steps against the current engine
project (deploy the two remaining functions, secrets, admin login, seed load,
end-to-end smoke test) see [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Build order

1. **Stand up the engine Supabase project**, run `0001_engine_schema.sql`.
2. **Implement `prose-generate`** — strict tool use against
   `stripForStrict(output_schema)` + `constraintNotes()` (do NOT skip the notes —
   §6.2), then `runItemGates()`. This is the sharpest-edged file; build it first.
3. **Implement `prose-admin`** approve/publish — enforce the fail-gate block on
   approve (§7).
4. **Implement `content-api`** `GET /published` + key auth.
5. **Load tenant #1** from `seeds/sochumenh/`: create the site, the template, issue
   a read-only API key.
6. **Golden set:** generate ~15 combos on a Sonnet-class model spanning all three
   harmony classes + a master number; human-review to publish; distill approved
   outputs into `few_shots`; switch the template `model` to Haiku for the rest.
7. **Wire the site** to pull from `content-api` at build time
   (`consumers/sochudao/pull-combos.mjs` is the live reference): render prose
   from `output` and deterministic values from engine-computed `facts` — no
   site-side math — and throw if any declared grid combo is missing.

## Non-negotiables (learned the hard way — §7, §14)

- **Approve refuses on a red fail-gate.** The block is on the approve step, not
  just on editing published items.
- **One math implementation, engine-side.** Deterministic values are computed
  once by the engine and delivered per row as `facts`; sites render them, never
  recompute (runtime visitor calculators like `@csessh/sochumenh` are
  parity-guarded in CI).
- **Cache key includes `site_id` and `template_version`.** Without the former,
  two tenants naming a template alike collide; without the latter, a new
  prompt/model silently reuses stale output.
