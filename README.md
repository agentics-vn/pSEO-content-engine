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
    prose-generate/          The ONLY holder of the LLM API key. One item/call.
                              Strict tool use + constraint-notes + gates.
    prose-admin/             Templates, jobs, review, approve (fail-gate block),
                              one-way publish.
    content-api/             The only external surface: GET /published + webhook,
                              site-scoped bearer keys, read-only.
    _shared/gates/           GENERIC validation gates — all domain rules arrive as
                              data via each template's `guards` JSON.
seeds/sochumenh/             Tenant #1: site record + the combo template
                              (output_schema, guards, prompts) ready to load.
```

## Boundary (why this is a separate repo)

The engine's entire contract with the outside world is: **one API, one webhook,
one API-key system.** Everything downstream — page building, deploy, sitemaps,
indexing, analytics — stays inside each consuming app. That HTTP boundary is what
lets one engine serve apps on completely different stacks (react-router/Vercel,
astro/Fly) without caring which.

## Status

| Piece | State |
|---|---|
| Tenancy + cache-key migrations (`0001`, `0002` webhooks + usage RPC) | ✅ implemented |
| `@pseo/numerology-core` (vetted harmony matrix, unit + golden tests) | ✅ implemented |
| Generic gate runner (per-item + `similarity`/`phrase_frequency` batch gates) | ✅ implemented |
| `prose-generate` (strict tool use, constraint notes, cache, gates) | ✅ implemented |
| `prose-admin` (templates, jobs, run-loop, approve-blocks-on-fail, publish) | ✅ implemented |
| `content-api` (published + webhooks, site-scoped keys) | ✅ implemented |
| sochumenh seed + `scripts/load-seed.ts` | ✅ loadable |
| Engine Supabase project provisioned + golden set generated | ⬜ ops step (WP1/WP6) |
| Admin UI (`admin/` — dashboard, review queue, jobs) | ✅ implemented |

## Admin UI

`admin/` is a Vite + React SPA over the `prose-admin` API (design per the
Be.run-style reference: cream canvas, white cards, charcoal panels,
yellow/coral accents). Sign in with a Supabase admin account
(`site_admins` membership) or click **Explore the demo world** to browse it
with no engine deployed. Dashboard: generation bubbles, job-runs calendar,
gate-pass-rate gauge (goal 90%, WP6 acceptance), 144-combo grid coverage, and
the review queue with per-gate pill strips — approve/publish/reject inline
(approve surfaces the 409 when a fail-severity gate is red).

```sh
cd admin && npm install && npm run dev     # or npm run build → dist/
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
for engine and sites. Deploy with `supabase functions deploy <name>`. The only
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
7. **Wire sochudao** to pull from `content-api` at build time (replaces its static
   `COMBO_CONTENT` import) and keep its compile-time drift throw; extend it to
   throw if any declared grid combo is missing from the pull.

## Non-negotiables (learned the hard way — §7, §14)

- **Approve refuses on a red fail-gate.** The block is on the approve step, not
  just on editing published items.
- **Same `numerology-core` on both sides.** Engine and site must compute identical
  values or every page throws at build. This package is the only implementation.
- **Cache key includes `site_id` and `template_version`.** Without the former,
  two tenants naming a template alike collide; without the latter, a new
  prompt/model silently reuses stale output.
