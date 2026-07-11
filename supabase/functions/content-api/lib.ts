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
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export function makeContentApiHandler(deps: ContentApiDeps) {
  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^.*?\/content-api/, '');
    const m = path.match(/^\/v1\/sites\/([a-z0-9-]+)\/(published|webhooks)$/);
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
      if (!body.url || !/^https:\/\//.test(body.url)) {
        return json({ error: 'url (https) required' }, 400);
      }
      const hook = await deps.registerWebhook(site.id, body.url);
      return json({ ok: true, webhook_id: hook.id }, 201);
    }

    return json({ error: 'method not allowed' }, 405);
  };
}
