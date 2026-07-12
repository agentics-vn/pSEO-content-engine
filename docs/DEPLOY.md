# Go-live runbook — engine project `mafqvoahltslxwttmvkn`

The authoritative, project-specific checklist for standing the engine up on the
live Supabase project at `https://mafqvoahltslxwttmvkn.supabase.co`. Every step
that could be done from a headless CI-style environment **is already done** (see
"Already live" below). What remains needs the Supabase CLI plus two secrets that
must never leave your machine — the service-role key and the Anthropic API key —
so it is deliberately a local runbook.

---

## Already live on this project (no action needed)

- **Schema** — migrations `0001`–`0005` applied. 8 tables, all RLS-enabled.
- **Security** — advisor clean. `prose_published` is `security_invoker`; the
  `add_job_usage` / `item_metrics_summary` RPCs are `service_role`-only; no
  cross-tenant read path. (Only 3 intentional INFO notes remain.)
- **`content-api`** edge function — deployed, `ACTIVE`, `verify_jwt=false`
  (it authenticates with per-site API keys, not JWTs).

## What's left (this runbook) — all local

1. Deploy `prose-generate` + `prose-admin`.
2. Set the one secret that isn't auto-injected: `ANTHROPIC_API_KEY`.
3. Create your admin login and grant it site membership.
4. Load tenant #1 (`sochumenh`) and mint its read key.
5. Point the Admin UI at the project and smoke-test end to end.

---

## 0. Prerequisites (once)

```sh
# Supabase CLI (macOS)   brew install supabase/tap/supabase
# or via npm:            npm i -g supabase
supabase --version        # need a recent v1/v2

# From the repo root:
supabase login
supabase link --project-ref mafqvoahltslxwttmvkn
```

You'll need, from **Dashboard → Project Settings → API**:
- **Project URL** — `https://mafqvoahltslxwttmvkn.supabase.co`
- **`service_role` key** — secret. Used by `load-seed.ts` and admin SQL only.
- **`anon` key** — public. Used by the Admin UI in the browser.

---

## 1. Deploy the two remaining edge functions

Both resolve `@pseo/numerology-core` through `supabase/functions/deno.json`
(import map → `packages/numerology-core/src`), and the CLI bundler follows that
from the repo root — no manual bundling needed. Verified locally:
`deno check` passes on all three, 67 tests green.

```sh
# --import-map required when Docker isn't running (CLI falls back to --use-api
# server-side bundling, which won't see supabase/functions/deno.json otherwise).
npx supabase functions deploy prose-generate \
  --project-ref mafqvoahltslxwttmvkn \
  --import-map supabase/functions/deno.json   # verify_jwt ON (default)

# prose-admin validates the operator JWT + site_admins itself; gateway JWT
# must be OFF so browser OPTIONS preflight (CORS) can reach the function.
npx supabase functions deploy prose-admin \
  --project-ref mafqvoahltslxwttmvkn \
  --import-map supabase/functions/deno.json \
  --no-verify-jwt
```

- `prose-generate` — called only by the steward / prose-admin with the
  service-role bearer; keep `verify_jwt` **on**.
- `prose-admin` — called by the Admin UI with the operator's Supabase-Auth JWT;
  keep `verify_jwt` **off** (function checks JWT + `site_admins` itself; gateway
  JWT would block browser CORS preflight).

> Do **not** re-deploy `content-api` with `verify_jwt` on — it must stay off so
> consuming sites can call it with an API key instead of a JWT.

---

## 2. Secrets

Supabase **auto-injects** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` into every edge function. You cannot (and must not)
set those yourself — the `SUPABASE_` prefix is reserved. The **only** secret to
set manually is the Anthropic key, and only `prose-generate` calls the model:

```sh
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...        # applies to all funcs
```

(Setting it project-wide is fine; only `prose-generate` reads it. If it's
missing, `prose-generate` returns a clean `500 ANTHROPIC_API_KEY is not
configured` rather than generating.)

---

## 3. Create your admin login + grant membership

`prose-admin` trusts a Supabase-Auth user only if it has a `site_admins` row for
the target site. Create the login (Dashboard → **Authentication → Users → Add
user**, email + password, e.g. `tad@agentics.vn`), copy its user UUID, then in
the **SQL Editor**:

```sql
insert into site_admins (user_id, site_id, role)
values (
  '<your-auth-user-uuid>',
  (select id from sites where slug = 'sochumenh'),
  'owner'
)
on conflict (user_id, site_id) do update set role = excluded.role;
```

Roles: `editor` < `reviewer` (can approve/reject) < `owner` (also publishes).
Run this **after** step 4 creates the `sochumenh` site row (or reorder — the
subquery just needs the site to exist).

---

## 4. Load tenant #1 (`sochumenh`)

Loads the site record, the immutable template, and mints one read-only,
site-scoped API key. Run against the **exact seed files** (don't hand-copy the
Vietnamese prompts):

```sh
SUPABASE_URL=https://mafqvoahltslxwttmvkn.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service_role key> \
  deno run --allow-net --allow-env --allow-read \
  --config supabase/functions/deno.json \
  scripts/load-seed.ts seeds/sochumenh
```

The raw API key is **printed once and never stored** (only its sha256 lands in
`site_api_keys`). Put that raw value in the consuming site's build secrets
(e.g. `SOCHUMENH_CONTENT_KEY`). Re-running upserts the site, refuses to overwrite
an existing template version, and mints a fresh key each time.

---

## 5. Admin UI + end-to-end smoke test

### Local

```sh
cd admin
cp .env.example .env   # bakes engine URL + anon key (already filled for mafqvoahltslxwttmvkn)
npm install && npm run dev
```

Login asks only for **site slug**, **email**, and **password**. The engine
Supabase URL / anon key / `prose-admin` URL are fixed at build time — one DB
for every tenant.

### Fly.io (production Admin UI)

App: `pseo-content-engine` → `https://pseo-content-engine.fly.dev`  
Org: `agentics-vn` · region: `sin` · static SPA via Caddy.

**Auto-deploy:** push to `main` that touches `admin/**` runs
[`.github/workflows/deploy-fly.yml`](../.github/workflows/deploy-fly.yml)
(gate → `flyctl deploy ./admin`). Needs repo secret `FLY_API_TOKEN`
(`fly tokens create deploy -a pseo-content-engine`). Manual:

```sh
# From repo root (build context = admin/; VITE_* come from admin/fly.toml [build.args])
fly deploy ./admin
```

Config files live under `admin/` (`Dockerfile`, `Caddyfile`, `fly.toml`).
Operators never paste engine credentials — only site + login.

Log in with the admin user from step 3, then walk the loop:

1. **Templates** (`#/templates`) — list versions, edit prompts, dry-run test panel (`POST /templates/test`).
2. **Create job** (`#/jobs`) on `combo-so-chu-dao-su-menh` (combo grid, master = exclude,
   review_sample_pct = 100 for the golden set).
3. **Run job** — default path submits an **Anthropic Message Batch** (~50% token
   cost), then collects results on subsequent Run clicks (Admin polls every ~20s
   while `batch_status` is `in_progress`). Escape hatch: `POST /jobs/:id/run`
   with `{ "channel": "sync" }` for the old per-item loop (debugging).
4. **Review** (`#/jobs/:id/review`) — dual pane, edit JSON, regen (cap 3), approve/reject+note.
5. **Publish** (`#/publish`) — bulk publish approved items.
6. Confirm it's served:

```sh
curl -s -H "Authorization: Bearer <raw key from step 4>" \
  "https://mafqvoahltslxwttmvkn.supabase.co/functions/v1/content-api/v1/sites/sochumenh/published?template=combo-so-chu-dao-su-menh" | jq .
```

A published item comes back as JSON. That round trip — generate → gate → review
→ publish → served over the API — is the true go-live proof.

### prose-admin API (operator UI)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/templates` | List site templates (newest version per key) |
| GET | `/templates/:key` | Full row; `?version=` optional |
| POST | `/templates` | Create immutable new version |
| POST | `/templates/test` | Dry-run via `prose-generate` (`dry_run: true`) |
| GET | `/jobs`, `/jobs/:id` | Job list + single job |
| POST | `/jobs` | Create (`items`, `item_keys`, or `enumerate: combo-grid`) |
| POST | `/jobs/:id/run` | Submit batch (first call) or collect results; optional `{ channel: "sync" }` |
| GET | `/items` | `?status=&job_id=&template=&limit=` |
| POST | `/items/:id/{approve,reject,edit,publish,regen}` | Regen capped at 3 |

`prose-generate` also accepts `{ dry_run, template, input_data }` (service-role only),
and batch actions `{ action: "submit_batch" | "collect_batch", job_id }`.

### Migration `0009_channel_tokens`

```sh
supabase db query --linked < supabase/migrations/0009_channel_tokens.sql
```

Splits job token totals into `tokens_*_batch` / `tokens_*_sync` so Actual Cost
can price mixed regen (sync) + batch spend correctly on job lists.

---

## 6. Golden set, then switch to batch

Once ~15 combos spanning all three harmony classes + a master number are
human-approved, distill the approved outputs into the template's `few_shots`,
switch the template `model` from `claude-sonnet-5` to `claude-haiku-4-5`, and
generate the rest at batch cost. (See README "Build order" §6.)

## 7. Scheduled Routines (after go-live)

Enable the two Routines once the engine is live and their env vars are set:
- **pipeline-steward** — every 1–2 days, health + search-performance sweep,
  proposes refreshes (never auto-publishes). See `.claude` skill `pipeline-steward`.
- **GSC collector** — pulls Search Console metrics per project into `page_metrics`.
  See `docs/GSC-SETUP.md`.

---

## Notes / gotchas

- **`content-api` stays `verify_jwt=false`.** It's the one public function; it
  gates on API keys. **`prose-admin` is also `verify_jwt=false`** (custom JWT +
  membership check; needed for browser CORS). `prose-generate` stays
  `verify_jwt=true`.
- **`SUPABASE_*` secrets are automatic.** The README's older line about setting
  them "on all three" is superseded — only `ANTHROPIC_API_KEY` is manual.
- **Template versions are immutable.** To change a template, bump its version;
  `load-seed.ts` refuses to overwrite an existing `(key, version)`.
- **Deploying from this repo's CI environment isn't possible** — outbound to
  `*.supabase.co` is blocked by the agent egress policy, and the two secrets
  shouldn't live there anyway. This runbook is intentionally local.
