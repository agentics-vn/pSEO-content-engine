/**
 * prose-admin — Deno.serve wiring. All business rules (incl. the
 * approve-blocks-on-red-fail hard rule) live in lib.ts with injected deps.
 */

import { createClient } from '@supabase/supabase-js';
import { makeAdminHandler, type AdminDeps, type AdminItemRow } from './lib.ts';
import { hmacSha256Hex } from '../_shared/hash.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const ITEM_COLS = 'id, site_id, job_id, template_key, template_version, item_key, status, input_data, output, edited_output, validation, similarity, regen_count, tokens_in, tokens_out, usage_channel';

const deps: AdminDeps = {
  async getUserId(jwt) {
    const { data, error } = await supabase.auth.getUser(jwt);
    return error ? null : data.user?.id ?? null;
  },
  async getMemberships(userId) {
    const { data, error } = await supabase
      .from('site_admins')
      .select('site_id, role, sites ( slug )')
      .eq('user_id', userId);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      site_id: r.site_id as string,
      role: r.role as string,
      slug: (r.sites as unknown as { slug: string }).slug,
    }));
  },

  async getLatestTemplateVersion(siteId, key) {
    const { data, error } = await supabase.from('prose_templates')
      .select('version').eq('site_id', siteId).eq('key', key)
      .order('version', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data?.version ?? null;
  },
  async getTemplate(siteId, key, version) {
    const { data, error } = await supabase.from('prose_templates')
      .select('id, key, version, guards, output_schema')
      .eq('site_id', siteId).eq('key', key).eq('version', version).maybeSingle();
    if (error) throw error;
    return data;
  },
  async listTemplates(siteId) {
    const { data, error } = await supabase.from('prose_templates')
      .select('id, key, version, name, model, created_at')
      .eq('site_id', siteId)
      .order('key').order('version', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
  async getTemplateFull(siteId, key, version) {
    const { data, error } = await supabase.from('prose_templates')
      .select('*')
      .eq('site_id', siteId).eq('key', key).eq('version', version).maybeSingle();
    if (error) throw error;
    return data;
  },
  async invokeDryRun(_siteId, template, inputData, itemKey) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/prose-generate`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ dry_run: true, template, input_data: inputData, item_key: itemKey }),
    });
    return await res.json();
  },
  async insertTemplate(siteId, userId, row) {
    const { data, error } = await supabase.from('prose_templates').insert({
      site_id: siteId,
      key: row.key,
      version: row.version,
      name: row.name,
      system_prompt: row.system_prompt,
      user_template: row.user_template,
      output_schema: row.output_schema,
      few_shots: row.few_shots ?? [],
      guards: row.guards ?? {},
      model: row.model,
      temperature: row.temperature ?? 0.7,
      max_tokens: row.max_tokens ?? 2600,
      created_by: userId,
    }).select('id, version').single();
    if (error) throw error;
    return data;
  },

  async getPublishedItemKeys(siteId, templateKey) {
    const { data, error } = await supabase.from('prose_published')
      .select('item_key').eq('site_id', siteId).eq('template_key', templateKey);
    if (error) throw error;
    return new Set((data ?? []).map((r) => r.item_key as string));
  },
  async insertJob(row) {
    const { data, error } = await supabase.from('prose_jobs')
      .insert({ ...row, status: 'pending' }).select('id').single();
    if (error) throw error;
    return data;
  },
  async insertItems(rows) {
    // ON CONFLICT (cache key) DO NOTHING → idempotent job re-creation.
    const { data, error } = await supabase.from('prose_items')
      .upsert(rows, {
        onConflict: 'site_id,template_key,template_version,item_key,data_hash',
        ignoreDuplicates: true,
      }).select('id');
    if (error) throw error;
    return data?.length ?? 0;
  },
  async resetItemsForRegenerate(siteId, templateKey, version, itemKeys, jobId) {
    if (itemKeys.length === 0) return { reset: [], published: [] };
    // Published rows at this version cannot be redone in place — that would
    // un-publish live content. Identify them first, exclude, and report back.
    const { data: pub, error: pErr } = await supabase.from('prose_items')
      .select('item_key')
      .eq('site_id', siteId).eq('template_key', templateKey).eq('template_version', version)
      .in('item_key', itemKeys).eq('status', 'published');
    if (pErr) throw pErr;
    const published = (pub ?? []).map((r) => r.item_key as string);
    const { data: reset, error: rErr } = await supabase.from('prose_items')
      .update({ status: 'pending', job_id: jobId, updated_at: new Date().toISOString() })
      .eq('site_id', siteId).eq('template_key', templateKey).eq('template_version', version)
      .in('item_key', itemKeys).neq('status', 'published')
      .select('item_key');
    if (rErr) throw rErr;
    return { reset: (reset ?? []).map((r) => r.item_key as string), published };
  },

  async getJob(siteId, jobId) {
    const { data, error } = await supabase.from('prose_jobs')
      .select('id, site_id, template_id, status, mode, review_sample_pct, item_count, tokens_in, tokens_out, tokens_in_batch, tokens_out_batch, tokens_in_sync, tokens_out_sync, created_at, finished_at, status_updated_at, anthropic_batch_id, batch_status, run_channel, prose_templates ( key, version, model )')
      .eq('site_id', siteId).eq('id', jobId).maybeSingle();
    if (error) throw error;
    return data;
  },
  async getTemplateById(templateId) {
    const { data, error } = await supabase.from('prose_templates')
      .select('key, version, guards').eq('id', templateId).maybeSingle();
    if (error) throw error;
    return data;
  },
  async getPendingItemIds(jobId, limit) {
    const { data, error } = await supabase.from('prose_items')
      .select('id').eq('job_id', jobId).eq('status', 'pending').limit(limit);
    if (error) throw error;
    return (data ?? []).map((r) => r.id as string);
  },
  async countPending(jobId) {
    const { count, error } = await supabase.from('prose_items')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', jobId).eq('status', 'pending');
    if (error) throw error;
    return count ?? 0;
  },
  async getJobItemsWithOutput(jobId) {
    const { data, error } = await supabase.from('prose_items')
      .select(ITEM_COLS).eq('job_id', jobId).not('output', 'is', null);
    if (error) throw error;
    return (data ?? []) as AdminItemRow[];
  },
  async saveBatchResults(itemId, similarity, batchGates) {
    const { data, error } = await supabase.from('prose_items')
      .select('validation').eq('id', itemId).single();
    if (error) throw error;
    const validation = { ...(data.validation ?? {}), batch_gates: batchGates };
    const { error: upErr } = await supabase.from('prose_items')
      .update({ similarity, validation }).eq('id', itemId);
    if (upErr) throw upErr;
  },
  async markJobDone(jobId) {
    const { error } = await supabase.from('prose_jobs')
      .update({ status: 'done', finished_at: new Date().toISOString() }).eq('id', jobId);
    if (error) throw error;
  },
  async updateJob(jobId, patch) {
    const { error } = await supabase.from('prose_jobs')
      .update(patch).eq('id', jobId);
    if (error) throw error;
  },

  async listItems(siteId, filter) {
    let q = supabase.from('prose_items').select(ITEM_COLS).eq('site_id', siteId);
    if (filter.status) q = q.eq('status', filter.status);
    if (filter.job_id) q = q.eq('job_id', filter.job_id);
    if (filter.template_key) q = q.eq('template_key', filter.template_key);
    const { data, error } = await q.order('updated_at', { ascending: false }).limit(filter.limit);
    if (error) throw error;
    return (data ?? []) as AdminItemRow[];
  },
  async getItem(siteId, itemId) {
    const { data, error } = await supabase.from('prose_items')
      .select(ITEM_COLS).eq('site_id', siteId).eq('id', itemId).maybeSingle();
    if (error) throw error;
    return data as AdminItemRow | null;
  },
  async updateItem(itemId, patch) {
    const { error } = await supabase.from('prose_items')
      .update({ updated_at: new Date().toISOString(), ...patch }).eq('id', itemId);
    if (error) throw error;
  },

  async generate(itemId, mode) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/prose-generate`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ item_id: itemId, mode }),
    });
    return await res.json();
  },

  async submitBatch(jobId) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/prose-generate`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ action: 'submit_batch', job_id: jobId }),
    });
    return await res.json();
  },

  async collectBatch(jobId) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/prose-generate`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ action: 'collect_batch', job_id: jobId }),
    });
    return await res.json();
  },

  async getWebhooks(siteId) {
    const { data, error } = await supabase.from('site_webhooks')
      .select('url, secret').eq('site_id', siteId).is('revoked_at', null);
    if (error) throw error;
    return data ?? [];
  },
  async fireWebhook(url, payload, secret) {
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (secret) headers['x-signature'] = `sha256=${await hmacSha256Hex(secret, body)}`;
    await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(5000), // a slow consumer never blocks a publish
    }).catch(() => undefined); // nor does a failing one
  },

  async getMetricsSummary(siteId, sinceDate) {
    const { data, error } = await supabase.rpc('item_metrics_summary', {
      p_site_id: siteId, p_since: sinceDate,
    });
    if (error) throw error;
    return (data ?? []).map((r: Record<string, unknown>) => ({
      item_key: r.item_key as string,
      clicks: Number(r.clicks ?? 0),
      impressions: Number(r.impressions ?? 0),
      avg_position: r.avg_position === null ? null : Number(r.avg_position),
      conversions: Number(r.conversions ?? 0),
      revenue: Number(r.revenue ?? 0),
    }));
  },
  async getItemKeysForTemplate(siteId, templateKey) {
    const { data, error } = await supabase.from('prose_items')
      .select('item_key').eq('site_id', siteId).eq('template_key', templateKey);
    if (error) throw error;
    return new Set((data ?? []).map((r) => r.item_key as string));
  },
  async getRecentItemOutcomes(siteId, templateKey, limit) {
    const { data, error } = await supabase.from('prose_items')
      .select('status, validation')
      .eq('site_id', siteId).eq('template_key', templateKey).neq('status', 'pending')
      .order('updated_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return (data ?? []) as Array<{ status: string; validation: { gates?: [] } }>;
  },

  async listJobs(siteId, limit) {
    const { data, error } = await supabase.from('prose_jobs')
      .select('id, status, mode, item_count, review_sample_pct, tokens_in, tokens_out, tokens_in_batch, tokens_out_batch, tokens_in_sync, tokens_out_sync, created_at, finished_at, status_updated_at, anthropic_batch_id, batch_status, run_channel, prose_templates ( key, version, model )')
      .eq('site_id', siteId).order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return data ?? [];
  },
  async getStats(siteId) {
    const byStatus: Record<string, number> = {};
    for (const status of ['pending', 'generated', 'flagged', 'failed_validation', 'approved', 'rejected', 'published']) {
      const { count, error } = await supabase.from('prose_items')
        .select('id', { count: 'exact', head: true })
        .eq('site_id', siteId).eq('status', status);
      if (error) throw error;
      byStatus[status] = count ?? 0;
    }
    const { data: tokens, error: tErr } = await supabase.from('prose_jobs')
      .select('tokens_in, tokens_out, tokens_in_batch, tokens_out_batch, tokens_in_sync, tokens_out_sync')
      .eq('site_id', siteId);
    if (tErr) throw tErr;
    const { count: liveCount, error: pErr } = await supabase.from('prose_published')
      .select('item_key', { count: 'exact', head: true }).eq('site_id', siteId);
    if (pErr) throw pErr;
    return {
      items_by_status: byStatus,
      published_total: liveCount ?? 0,
      tokens_in: (tokens ?? []).reduce((s, j) => s + Number(j.tokens_in), 0),
      tokens_out: (tokens ?? []).reduce((s, j) => s + Number(j.tokens_out), 0),
      tokens_in_batch: (tokens ?? []).reduce((s, j) => s + Number(j.tokens_in_batch ?? 0), 0),
      tokens_out_batch: (tokens ?? []).reduce((s, j) => s + Number(j.tokens_out_batch ?? 0), 0),
      tokens_in_sync: (tokens ?? []).reduce((s, j) => s + Number(j.tokens_in_sync ?? 0), 0),
      tokens_out_sync: (tokens ?? []).reduce((s, j) => s + Number(j.tokens_out_sync ?? 0), 0),
    };
  },

  now: () => Date.now(),
};

Deno.serve(makeAdminHandler(deps));
