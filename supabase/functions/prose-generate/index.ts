/**
 * prose-generate — THE ONLY place that holds the LLM API key (doc §3, §6).
 *
 * Generates ONE item per invocation (driven in a loop by prose-admin until no
 * items are pending) so each call stays under the serverless wall-clock cap
 * regardless of batch size. Internal-only: callable with the service-role key,
 * never exposed to sites or browsers.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import {
  generateItem,
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
const anthropic = LLM_API_KEY ? new Anthropic({ apiKey: LLM_API_KEY }) : null;

/** Sampling params are rejected (400) on these model families — omit them. */
function modelAcceptsTemperature(model: string): boolean {
  return !/^claude-(fable|mythos|sonnet-5|opus-4-[78])/.test(model);
}

async function callAnthropic(req: LlmRequest): Promise<LlmResult> {
  if (!anthropic) throw new Error('ANTHROPIC_API_KEY is not set');
  const response = await anthropic.messages.create({
    model: req.model,
    max_tokens: req.maxTokens,
    ...(modelAcceptsTemperature(req.model) ? { temperature: req.temperature } : {}),
    system: req.system,
    messages: [{ role: 'user', content: req.userPrompt }],
    // Forced, strict tool use (§6.1): the schema was pre-stripped of the
    // bound keywords strict mode rejects; constraintNotes re-issued them.
    tools: [{
      name: 'emit_content',
      description: 'Nộp bài viết hoàn chỉnh theo đúng schema.',
      input_schema: req.toolSchema as Anthropic.Tool['input_schema'],
      strict: true,
    }],
    tool_choice: { type: 'tool', name: 'emit_content' },
  });

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
  };
}

const deps: GenerateDeps = {
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
  async addJobUsage(jobId, tokensIn, tokensOut) {
    const { error } = await supabase.rpc('add_job_usage', {
      p_job_id: jobId, p_tokens_in: tokensIn, p_tokens_out: tokensOut,
    });
    if (error) throw error;
  },
  async getJobReviewPct(jobId) {
    const { data, error } = await supabase.from('prose_jobs')
      .select('review_sample_pct').eq('id', jobId).maybeSingle();
    if (error) throw error;
    return data?.review_sample_pct ?? 25;
  },
  llm: callAnthropic,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);
  // Never proceed keyless (WP2 guard).
  if (!LLM_API_KEY) return json({ ok: false, error: 'ANTHROPIC_API_KEY is not configured' }, 500);
  // Internal surface: require the service-role key, not just any anon JWT.
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!SERVICE_ROLE_KEY || bearer !== SERVICE_ROLE_KEY) return json({ ok: false, error: 'forbidden' }, 403);

  let body: { item_id?: string; mode?: 'generate' | 'regenerate' };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'invalid JSON body' }, 400);
  }
  if (!body.item_id) return json({ ok: false, error: 'item_id required' }, 400);

  try {
    const result = await generateItem(deps, { item_id: body.item_id, mode: body.mode });
    return json(result, result.ok ? 200 : 422);
  } catch (err) {
    return json({ ok: false, error: String(err instanceof Error ? err.message : err) }, 500);
  }
});
