# GSC setup — wiring every project's Search Console into the engine

One service account reads all properties; each project is added to it once.
This powers the central collector Routine (and the same account works for the
per-site CI path in the integration kits).

## Part 1 — one-time Google setup (~10 minutes, done once ever)

1. **GCP project** (or reuse an existing one): console.cloud.google.com →
   create project, e.g. `agentics-seo`.
2. **Enable the API**: APIs & Services → Enable APIs → search
   **"Google Search Console API"** → Enable.
3. **Service account**: IAM & Admin → Service Accounts → Create.
   Name: `seo-reporter`. No GCP roles needed (GSC permissions are granted in
   Search Console itself, not IAM).
   Note the email: `seo-reporter@<project>.iam.gserviceaccount.com`.
4. **Key**: open the service account → Keys → Add key → JSON. Download once,
   store in your secrets manager. This JSON string becomes the `GCP_SA_KEY`
   environment secret. (If a project's CI uses the kit's per-site path with
   WIF instead, no key file is needed there — WIF impersonates this same
   account.)

## Part 2 — per project (~3 minutes each, repeat for every property)

Do this in **each** project's Search Console (needs an Owner of that
property):

1. Open search.google.com/search-console → select the property
   (e.g. `sochumenh.vn`).
2. Settings → **Users and permissions** → Add user.
3. Email: the service-account address from Part 1.
   Permission: **Restricted** (read-only is all the collector needs; use
   Full only if this account should also submit sitemaps for the kit's
   `submit-sitemap.mjs`).
4. Note the property identifier exactly as GSC shows it:
   - Domain property → `sc-domain:sochumenh.vn`
   - URL-prefix property → `https://sochumenh.vn/` (trailing slash matters)
5. Add the project to [`config/gsc-collector.sites.json`](../config/gsc-collector.sites.json):

   ```jsonc
   {
     "slug": "sochumenh",                      // engine site slug
     "gsc_property": "sc-domain:sochumenh.vn", // from step 4, verbatim
     "pages_prefix": "/than-so-hoc/",          // path of the programmatic cluster
     "key_env": "SOCHUMENH_CONTENT_KEY"        // env var holding the site's content-api key
   }
   ```

6. Add that site's content-api key (minted by `scripts/load-seed.ts`) to
   this environment's secrets under the `key_env` name.

## Part 3 — environment secrets (this Claude Code environment)

| Secret | Value |
|---|---|
| `GCP_SA_KEY` | the service-account JSON from Part 1, as one string |
| `ENGINE_URL` | the engine's functions base, e.g. `https://<ref>.supabase.co/functions/v1` |
| `<SITE>_CONTENT_KEY` | one per project, matching each `key_env` |

## Part 4 — turn it on

Enable the **"GSC metrics collector (daily)"** Routine. It runs
`node scripts/collect-gsc-metrics.mjs` daily at 00:30 UTC — 30 minutes
before the pipeline steward's window — pulling the last 30 days per
page+date for every configured site and upserting into the engine
(idempotent, so re-runs and the kit's per-site CI path coexist safely).

## Verify

- Manually: fire the Routine once (or run the script locally with the env
  set) — the summary lists `<slug>: N rows (M written)`.
- In the admin dashboard, the **Search Performance** card populates within
  one run (28-day window; GSC data lags ~2 days).

## Troubleshooting

| Symptom | Cause |
|---|---|
| `GSC 403: User does not have sufficient permission` | service account not added to that property (Part 2), or wrong property string |
| `GSC 403: API has not been used` | Search Console API not enabled in the GCP project |
| `0 rows` for a site | `pages_prefix` doesn't match the live URLs, or the property has no data yet (new site: weeks) |
| `engine 401` | wrong/revoked `<SITE>_CONTENT_KEY`, or slug ≠ engine site slug |
