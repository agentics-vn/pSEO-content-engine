/**
 * Central GSC collector — the one-credential alternative to per-site CI
 * reporting (both post to the same engine endpoint; upserts are idempotent,
 * so running both is harmless).
 *
 *   GCP_SA_KEY='<service-account JSON>' ENGINE_URL=… \
 *   SOCHUMENH_CONTENT_KEY=… node scripts/collect-gsc-metrics.mjs [config-path]
 *
 * For every site in config/gsc-collector.sites.json: query Search Console
 * (per page + date, last 30 days minus GSC's ~2-day lag), map page URLs to
 * item_keys via pages_prefix, POST to the engine's site-scoped metrics
 * endpoint. Self-contained: mints the Google access token from the service
 * account key with node:crypto — no npm dependencies, safe for cron sessions.
 *
 * Setup per project: docs/GSC-SETUP.md.
 */

import { readFile } from 'node:fs/promises';
import { createSign } from 'node:crypto';

const CONFIG_PATH = process.argv[2] ?? 'config/gsc-collector.sites.json';
const ENGINE_URL = process.env.ENGINE_URL;
const SA_JSON = process.env.GCP_SA_KEY;

const missing = [];
if (!ENGINE_URL) missing.push('ENGINE_URL');
if (!SA_JSON) missing.push('GCP_SA_KEY (the service-account JSON, as a string)');
if (missing.length) {
  console.error(`[collect] unconfigured — missing: ${missing.join(', ')}\nSee docs/GSC-SETUP.md.`);
  process.exit(1);
}

// ── Google access token via the JWT-bearer flow (no SDK needed) ─────────────
const sa = JSON.parse(SA_JSON);
const b64url = (input) => Buffer.from(input).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({
  iss: sa.client_email,
  scope: 'https://www.googleapis.com/auth/webmasters.readonly',
  aud: 'https://oauth2.googleapis.com/token',
  iat: now,
  exp: now + 3600,
}))}`;
const signature = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url');
const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: `${unsigned}.${signature}`,
  }),
});
if (!tokenRes.ok) throw new Error(`[collect] Google token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`);
const { access_token } = await tokenRes.json();

// ── Per-site: GSC query → item_key rows → engine ─────────────────────────────
const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
const end = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10); // GSC lags ~2 days
const start = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
const summary = [];

for (const site of config.sites) {
  const label = site.slug;
  const key = process.env[site.key_env];
  if (!key) {
    summary.push(`${label}: SKIPPED — env ${site.key_env} not set`);
    continue;
  }
  try {
    const gsc = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site.gsc_property)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ startDate: start, endDate: end, dimensions: ['page', 'date'], rowLimit: 25000 }),
      },
    );
    if (!gsc.ok) throw new Error(`GSC ${gsc.status}: ${(await gsc.text()).slice(0, 200)}`);
    const data = await gsc.json();

    const rows = (data.rows ?? []).flatMap((r) => {
      const path = new URL(r.keys[0]).pathname;
      if (!path.startsWith(site.pages_prefix)) return [];
      const item_key = path.replace(/\/$/, '').split('/').pop();
      if (!/^[a-z0-9][a-z0-9-]*$/.test(item_key)) return [];
      return [{ item_key, date: r.keys[1], clicks: r.clicks, impressions: r.impressions, position: r.position }];
    });

    let written = 0;
    for (let i = 0; i < rows.length; i += 5000) {
      const res = await fetch(`${ENGINE_URL}/v1/sites/${site.slug}/metrics`, {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ source: 'gsc', rows: rows.slice(i, i + 5000) }),
      });
      if (!res.ok) throw new Error(`engine ${res.status}: ${(await res.text()).slice(0, 200)}`);
      written += (await res.json()).written ?? 0;
    }
    summary.push(`${label}: ${rows.length} rows (${written} written) from ${(data.rows ?? []).length} GSC pages·days`);
  } catch (err) {
    summary.push(`${label}: FAILED — ${err instanceof Error ? err.message : err}`);
  }
}

console.log(`[collect] ${start}…${end}\n` + summary.map((s) => `  ${s}`).join('\n'));
if (summary.some((s) => s.includes('FAILED'))) process.exit(1);
