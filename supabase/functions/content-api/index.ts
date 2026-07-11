/**
 * content-api — the ONLY external surface between engine and consuming apps
 * (doc §8). Site-scoped bearer-key auth. Read-only. Serves published items.
 * Never issues Supabase credentials; never touches a consuming app's DB.
 *
 *   GET /v1/sites/{site_slug}/published?template={key}&since={version|updated_at}
 *     Authorization: Bearer <site-scoped API key>
 *     → [{ item_key, template_key, template_version, output, updated_at }, ...]
 *
 *   POST /v1/sites/{site_slug}/webhooks   (registered via admin UI)
 *     Body: { url: "https://…/internal/seo-content-updated" }
 *     → engine POSTs a small signal (site, template, item count) on publish;
 *       the app then calls GET /published itself. Keeps webhook payload tiny.
 *
 * Schema evolution (§8): non-breaking refresh → bump template_version under the
 * same key; breaking shape change → NEW template_key (forces deliberate migration
 * instead of a silent build-time type break downstream).
 */

// import { createClient } from '@supabase/supabase-js'  // service role, server-side only

async function authSiteKey(_req: Request, _siteSlug: string): Promise<{ ok: boolean; templateScope?: string }> {
  // TODO: sha256 the bearer token, match an unrevoked row in site_api_keys for
  // this site; return its template_key scope (null = all templates).
  return { ok: false };
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const m = url.pathname.match(/^\/v1\/sites\/([^/]+)\/published$/);
  if (req.method === 'GET' && m) {
    const auth = await authSiteKey(req, m[1]);
    if (!auth.ok) return new Response('Unauthorized', { status: 401 });
    // TODO: select from prose_published where site_id = (slug→id) and
    // template_key = query.template (respect key scope); filter by `since`.
    return new Response(JSON.stringify({ todo: 'content-api /published not yet implemented' }), {
      status: 501, headers: { 'content-type': 'application/json' },
    });
  }
  return new Response('Not found', { status: 404 });
});
