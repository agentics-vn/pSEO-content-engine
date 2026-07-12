/**
 * content-api — pure routing + handlers with injected deps (doc §8, WP5).
 * The ONLY external surface between engine and consuming apps. Site-scoped
 * bearer keys, read-only, never touches a consuming app's DB.
 *
 *   GET  /v1/sites/{slug}/published?template={key}&since={version|updated_at}
 *   POST /v1/sites/{slug}/webhooks   { url }
 *
 * Auth: sha256(bearer) must match an unrevoked site_api_keys row FOR THE
 * RESOLVED SITE — cross-site access is rejected hard, before any data reads.
 * A key optionally carries a template_key scope (null = all templates).
 */

import { sha256Hex } from '../_shared/hash.ts';

export interface PublishedRow {
  item_key: string;
  template_key: string;
  template_version: number;
  output: Record<string, unknown>;
  updated_at: string;
  /** The item's stored input_data — deterministic facts the prose stands on
   *  (harmony/linking/maturity/…). Engine-computed, never model-emitted; the
   *  consuming site renders these instead of recomputing. */
  facts?: Record<string, unknown>;
}

export interface MetricsRow {
  item_key: string;
  date: string;          // YYYY-MM-DD
  clicks?: number;
  impressions?: number;
  position?: number;
  conversions?: number;
  revenue?: number;
}

export interface ContentApiDeps {
  getSiteBySlug(slug: string): Promise<{ id: string; slug: string } | null>;
  /** Unrevoked key rows for a site, matched by key_hash. */
  findKey(siteId: string, keyHash: string): Promise<{ template_key: string | null; scope: string } | null>;
  listPublished(siteId: string, filter: {
    template?: string;
    sinceVersion?: number;
    sinceUpdatedAt?: string;
  }): Promise<PublishedRow[]>;
  registerWebhook(siteId: string, url: string): Promise<{ id: string }>;
  /** Upsert on (site_id, item_key, date, source); returns rows written. */
  upsertMetrics(siteId: string, source: 'gsc' | 'analytics', rows: MetricsRow[]): Promise<number>;
}

const MAX_METRIC_ROWS = 5000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

function validateMetricsRow(r: MetricsRow): string | null {
  if (!r.item_key || !SLUG_RE.test(r.item_key)) return `bad item_key ${JSON.stringify(r.item_key)}`;
  if (!r.date || !DATE_RE.test(r.date)) return `bad date for ${r.item_key}`;
  for (const f of ['clicks', 'impressions', 'position', 'conversions', 'revenue'] as const) {
    const v = r[f];
    if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v) || v < 0)) {
      return `bad ${f} for ${r.item_key}`;
    }
  }
  if (r.clicks === undefined && r.impressions === undefined && r.conversions === undefined && r.revenue === undefined) {
    return `row for ${r.item_key} carries no metrics`;
  }
  return null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/**
 * Webhook URLs must be public https endpoints. The engine POSTs to them from
 * inside its own infrastructure, so a key holder must not be able to point a
 * hook at localhost, the metadata service, or private ranges (SSRF).
 */
export function isPublicWebhookUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
      host.endsWith('.internal') || host === 'metadata.google.internal') return false;
  // IPv6 literal (URL keeps brackets off hostname) — reject wholesale.
  if (host.includes(':')) return false;
  const ip = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ip) {
    const [a, b] = [Number(ip[1]), Number(ip[2])];
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;         // this-net, private, loopback, multicast+
    if (a === 169 && b === 254) return false;                               // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return false;                      // private
    if (a === 192 && b === 168) return false;                               // private
    if (a === 100 && b >= 64 && b <= 127) return false;                     // CGNAT
  }
  return host.includes('.') || ip !== null; // require a real hostname
}

export function makeContentApiHandler(deps: ContentApiDeps) {
  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^.*?\/content-api/, '');
    const m = path.match(/^\/v1\/sites\/([a-z0-9-]+)\/(published|webhooks|metrics)$/);
    if (!m) return json({ error: 'not found' }, 404);
    const [, slug, resource] = m;

    // Resolve the site FIRST, then require the key to belong to that exact
    // site — a valid key for site A must never resolve anything on site B.
    const site = await deps.getSiteBySlug(slug);
    if (!site) return json({ error: 'unknown site' }, 404);

    const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!bearer) return json({ error: 'missing bearer token' }, 401);
    const key = await deps.findKey(site.id, await sha256Hex(bearer));
    if (!key) return json({ error: 'invalid or revoked key' }, 401);

    if (resource === 'published' && req.method === 'GET') {
      const requested = url.searchParams.get('template') ?? undefined;
      // Honor the key's template scope (null = all templates on the site).
      if (key.template_key && requested && requested !== key.template_key) {
        return json({ error: `key is scoped to template "${key.template_key}"` }, 403);
      }
      const template = requested ?? key.template_key ?? undefined;

      const since = url.searchParams.get('since') ?? undefined;
      let sinceVersion: number | undefined;
      let sinceUpdatedAt: string | undefined;
      if (since !== undefined) {
        if (/^\d+$/.test(since)) sinceVersion = Number(since);
        else if (!Number.isNaN(Date.parse(since))) sinceUpdatedAt = since;
        else return json({ error: 'since must be a template_version integer or an ISO timestamp' }, 400);
      }

      const rows = await deps.listPublished(site.id, { template, sinceVersion, sinceUpdatedAt });
      return json(rows);
    }

    if (resource === 'webhooks' && req.method === 'POST') {
      let body: { url?: string };
      try {
        body = await req.json();
      } catch {
        return json({ error: 'invalid JSON body' }, 400);
      }
      if (!body.url || !isPublicWebhookUrl(body.url)) {
        return json({ error: 'url must be a public https endpoint' }, 400);
      }
      const hook = await deps.registerWebhook(site.id, body.url);
      return json({ ok: true, webhook_id: hook.id }, 201);
    }

    // The performance loop's write path: the SITE (which holds the GSC and
    // analytics credentials) posts per-page rows; the engine never talks to
    // Google or the site's analytics itself.
    if (resource === 'metrics' && req.method === 'POST') {
      let body: { source?: string; rows?: MetricsRow[] };
      try {
        body = await req.json();
      } catch {
        return json({ error: 'invalid JSON body' }, 400);
      }
      if (body.source !== 'gsc' && body.source !== 'analytics') {
        return json({ error: 'source must be "gsc" or "analytics"' }, 400);
      }
      if (!Array.isArray(body.rows) || body.rows.length === 0) {
        return json({ error: 'rows[] required' }, 400);
      }
      if (body.rows.length > MAX_METRIC_ROWS) {
        return json({ error: `max ${MAX_METRIC_ROWS} rows per call — chunk the upload` }, 413);
      }
      for (const r of body.rows) {
        const problem = validateMetricsRow(r);
        if (problem) return json({ error: problem }, 400);
      }
      const written = await deps.upsertMetrics(site.id, body.source, body.rows);
      return json({ ok: true, written }, 200);
    }

    return json({ error: 'method not allowed' }, 405);
  };
}
