/**
 * prose-generate — THE ONLY place that holds the LLM API key (doc §3, §6).
 *
 * Sync: one item per invocation (regen, dry-run).
 * Batch: submit_batch / collect_batch for bulk job runs (~50% token cost).
 * Internal-only: callable with the service-role key, never exposed to browsers.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import {
  collectBatchJob,
  dryRunTemplate,
  generateItem,
  submitBatchJob,
  type AnthropicBatchApi,
  type BatchDeps,
  type GenerateDeps,
  type ItemRow,
  type LlmRequest,
  type LlmResult,
  type TemplateRow,
} from './lib.ts';

const LLM_API_KEY = Deno.env.get('ANTHROPIC_API_KEY'); // never leaves this function
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const anthropic = LLM_API_KEY
  ? new Anthropic({ apiKey: LLM_API_KEY, maxRetries: 4, timeout: 90_000 })
  : null;

/** Sampling params are rejected (400) on these model families — omit them. */
export function modelAcceptsTemperature(model: string): boolean {
  return !/^claude-(fable|mythos|sonnet-5|opus-4-[78])/.test(model);
}

/** Shared params for sync messages.create and batch request params. */
export function toAnthropicMessageParams(req: LlmRequest): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: req.model,
    max_tokens: req.maxTokens,
    ...(modelAcceptsTemperature(req.model) ? { temperature: req.temperature } : {}),
    // T1 prompt caching: system + tools are byte-identical across every item of
    // a template, so cache them once and re-read (~90% off the prefix). The
    // per-item userPrompt below is the uncached suffix. Marking the last of the
    // ordered prefix blocks (tools, then system) covers both.
    system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: req.userPrompt }],
    tools: [{
      name: 'emit_content',
      description: 'Nộp bài viết hoàn chỉnh theo đúng schema.',
      input_schema: req.toolSchema as Anthropic.Tool['input_schema'],
      strict: true,
      cache_control: { type: 'ephemeral' },
    } as Anthropic.Tool & { strict: true }],
    tool_choice: { type: 'tool', name: 'emit_content' },
  };
}

async function callAnthropic(req: LlmRequest): Promise<LlmResult> {
  if (!anthropic) throw new Error('ANTHROPIC_API_KEY is not set');
  const response = await anthropic.messages.create(toAnthropicMessageParams(req));

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'emit_content',
  );
  if (!toolUse) {
    throw new Error(`no emit_content tool_use in response (stop_reason=${response.stop_reason})`);
  }
  return {
    output: toolUse.input,
    tokensIn: response.usage.input_tokens,
    tokensOut: response.usage.output_tokens,
    stopReason: response.stop_reason ?? undefined,
  };
}

const batchApi: AnthropicBatchApi = {
  async create(requests) {
    if (!anthropic) throw new Error('ANTHROPIC_API_KEY is not set');
    const batch = await anthropic.messages.batches.create({
      requests: requests.map((r) => ({
        custom_id: r.custom_id,
        params: r.params as unknown as Anthropic.MessageCreateParamsNonStreaming,
      })),
    });
    return { id: batch.id };
  },
  async retrieve(batchId) {
    if (!anthropic) throw new Error('ANTHROPIC_API_KEY is not set');
    const batch = await anthropic.messages.batches.retrieve(batchId);
    return {
      processing_status: batch.processing_status,
      request_counts: batch.request_counts,
    };
  },
  async *results(batchId) {
    if (!anthropic) throw new Error('ANTHROPIC_API_KEY is not set');
    for await (const row of await anthropic.messages.batches.results(batchId)) {
      yield {
        custom_id: row.custom_id,
        result: row.result as {
          type: string;
          message?: {
            content: Array<{ type: string; name?: string; input?: unknown }>;
            usage: { input_tokens: number; output_tokens: number };
            stop_reason?: string | null;
          };
          error?: { message?: string };
        },
      };
    }
  },
};

const deps: BatchDeps = {
  async getItem(itemId) {
    const { data, error } = await supabase.from('prose_items').select('*').eq('id', itemId).maybeSingle();
    if (error) throw error;
    return data as ItemRow | null;
  },
  async getTemplate(siteId, key, version) {
    const { data, error } = await supabase.from('prose_templates').select('*')
      .eq('site_id', siteId).eq('key', key).eq('version', version).maybeSingle();
    if (error) throw error;
    return data as TemplateRow | null;
  },
  async saveResult(item, patch) {
    const { error } = await supabase.from('prose_items')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', item.id);
    if (error) throw error;
  },
  async addJobUsage(jobId, tokensIn, tokensOut, channel = 'sync') {
    const { error } = await supabase.rpc('add_job_usage', {
      p_job_id: jobId,
      p_tokens_in: tokensIn,
      p_tokens_out: tokensOut,
      p_channel: channel,
    });
    if (error) throw error;
  },
  async getJobReviewPct(jobId) {
    const { data, error } = await supabase.from('prose_jobs')
      .select('review_sample_pct').eq('id', jobId).maybeSingle();
    if (error) throw error;
    return data?.review_sample_pct ?? 25;
  },
  async getJob(jobId) {
    const { data, error } = await supabase.from('prose_jobs')
      .select('id, mode, anthropic_batch_id, batch_status')
      .eq('id', jobId).maybeSingle();
    if (error) throw error;
    return data;
  },
  async listPendingItems(jobId) {
    const { data, error } = await supabase.from('prose_items')
      .select('*').eq('job_id', jobId).eq('status', 'pending');
    if (error) throw error;
    return (data ?? []) as ItemRow[];
  },
  async countPending(jobId) {
    const { count, error } = await supabase.from('prose_items')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', jobId).eq('status', 'pending');
    if (error) throw error;
    return count ?? 0;
  },
  async updateJobBatch(jobId, patch) {
    const { error } = await supabase.from('prose_jobs').update(patch).eq('id', jobId);
    if (error) throw error;
  },
  async noteBatchFailure(item, errorMsg) {
    const validation = {
      ...(item.validation ?? {}),
      batch_error: errorMsg,
    };
    const { error } = await supabase.from('prose_items')
      .update({ validation, updated_at: new Date().toISOString() })
      .eq('id', item.id);
    if (error) throw error;
  },
  async noteBatchRetry(item, detail) {
    const prev = Number((item.validation as { gen_retry?: unknown } | null)?.gen_retry ?? 0);
    const validation = {
      ...(item.validation ?? {}),
      gen_retry: prev + 1,
      retry_note: detail,
    };
    // Stays pending: the next submit re-issues it with a bumped budget.
    const { error } = await supabase.from('prose_items')
      .update({ validation, updated_at: new Date().toISOString() })
      .eq('id', item.id);
    if (error) throw error;
  },
  llm: callAnthropic,
};

const generateDeps: GenerateDeps = deps;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);
  if (!LLM_API_KEY) return json({ ok: false, error: 'ANTHROPIC_API_KEY is not configured' }, 500);
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!SERVICE_ROLE_KEY || bearer !== SERVICE_ROLE_KEY) return json({ ok: false, error: 'forbidden' }, 403);

  let body: {
    action?: 'submit_batch' | 'collect_batch';
    job_id?: string;
    item_id?: string;
    mode?: 'generate' | 'regenerate';
    dry_run?: boolean;
    template?: TemplateRow;
    input_data?: Record<string, unknown>;
    item_key?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'invalid JSON body' }, 400);
  }

  if (body.action === 'submit_batch') {
    if (!body.job_id) return json({ ok: false, error: 'job_id required' }, 400);
    try {
      const result = await submitBatchJob(deps, batchApi, toAnthropicMessageParams, body.job_id);
      return json(result, result.ok ? 200 : 422);
    } catch (err) {
      return json({ ok: false, error: String(err instanceof Error ? err.message : err) }, 500);
    }
  }

  if (body.action === 'collect_batch') {
    if (!body.job_id) return json({ ok: false, error: 'job_id required' }, 400);
    try {
      const result = await collectBatchJob(deps, batchApi, body.job_id);
      return json(result, result.ok ? 200 : 422);
    } catch (err) {
      return json({ ok: false, error: String(err instanceof Error ? err.message : err) }, 500);
    }
  }

  if (body.dry_run) {
    if (!body.template || !body.input_data || typeof body.input_data !== 'object') {
      return json({ ok: false, error: 'dry_run requires template and input_data' }, 400);
    }
    try {
      const result = await dryRunTemplate(generateDeps, {
        template: body.template,
        input_data: body.input_data,
        item_key: body.item_key,
      });
      return json(result, result.ok ? 200 : 422);
    } catch (err) {
      return json({ ok: false, error: String(err instanceof Error ? err.message : err) }, 500);
    }
  }

  if (!body.item_id) return json({ ok: false, error: 'item_id required' }, 400);

  try {
    const result = await generateItem(generateDeps, { item_id: body.item_id, mode: body.mode });
    return json(result, result.ok ? 200 : 422);
  } catch (err) {
    return json({ ok: false, error: String(err instanceof Error ? err.message : err) }, 500);
  }
});
