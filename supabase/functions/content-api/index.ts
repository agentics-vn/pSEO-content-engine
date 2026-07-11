/**
 * content-api — Deno.serve wiring over the prose_published view. Read-only;
 * uses the service role internally but every read is scoped by the site the
 * bearer key resolved to (see lib.ts).
 */

import { createClient } from '@supabase/supabase-js';
import { makeContentApiHandler, type ContentApiDeps, type MetricsRow, type PublishedRow } from './lib.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

const deps: ContentApiDeps = {
  async getSiteBySlug(slug) {
    const { data, error } = await supabase.from('sites').select('id, slug').eq('slug', slug).maybeSingle();
    if (error) throw error;
    return data;
  },
  async findKey(siteId, keyHash) {
    const { data, error } = await supabase.from('site_api_keys')
      .select('template_key, scope')
      .eq('site_id', siteId).eq('key_hash', keyHash).is('revoked_at', null)
      .maybeSingle();
    if (error) throw error;
    return data;
  },
  async listPublished(siteId, filter) {
    let q = supabase.from('prose_published')
      .select('item_key, template_key, template_version, output, updated_at')
      .eq('site_id', siteId);
    if (filter.template) q = q.eq('template_key', filter.template);
    if (filter.sinceVersion !== undefined) q = q.gt('template_version', filter.sinceVersion);
    if (filter.sinceUpdatedAt !== undefined) q = q.gt('updated_at', filter.sinceUpdatedAt);
    const { data, error } = await q.order('item_key');
    if (error) throw error;
    return (data ?? []) as PublishedRow[];
  },
  async upsertMetrics(siteId, source, rows: MetricsRow[]) {
    const { data, error } = await supabase.from('page_metrics')
      .upsert(rows.map((r) => ({
        site_id: siteId,
        source,
        item_key: r.item_key,
        date: r.date,
        clicks: r.clicks ?? null,
        impressions: r.impressions ?? null,
        position: r.position ?? null,
        conversions: r.conversions ?? null,
        revenue: r.revenue ?? null,
      })), { onConflict: 'site_id,item_key,date,source' })
      .select('id');
    if (error) throw error;
    return data?.length ?? 0;
  },
  async registerWebhook(siteId, url) {
    const { data, error } = await supabase.from('site_webhooks')
      .upsert({ site_id: siteId, url, revoked_at: null }, { onConflict: 'site_id,url' })
      .select('id').single();
    if (error) throw error;
    return data;
  },
};

Deno.serve(makeContentApiHandler(deps));
