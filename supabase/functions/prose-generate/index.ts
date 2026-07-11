/**
 * prose-generate — THE ONLY place that holds the LLM API key (doc §3, §6).
 *
 * Generates ONE item per invocation (driven in a loop by prose-admin until no
 * items are pending) so each call stays under the serverless wall-clock cap
 * regardless of batch size.
 *
 * Flow per item:
 *   1. Load template (system_prompt, user_template, output_schema, guards, model).
 *   2. Compute facts via @pseo/numerology-core → input_data (the real data the
 *      prose stands on). Hash it → data_hash (cache key).
 *   3. Build the prompt: fill user_template placeholders from input_data, and
 *      append constraintNotes(schema, guards) — REQUIRED companion to strict
 *      mode (§6.2): stripForStrict removes count/length keywords the API rejects,
 *      so the model no longer sees them unless we re-issue them as plain text.
 *      Skipping this failed ~⅓ of items in the reference project.
 *   4. Call the model with forced, strict tool use against stripForStrict(schema).
 *   5. coerceToSchema() as a cheap second line of defense (§6.4).
 *   6. runItemGates() → set status generated|flagged|failed_validation.
 *   7. Upsert prose_items on the cache key (site_id, template_key,
 *      template_version, item_key, data_hash).
 */

// import { computeComboFacts } from '@pseo/numerology-core'
// import { runItemGates, hasFailingGate } from '../_shared/gates/index.ts'

const LLM_API_KEY = Deno.env.get('ANTHROPIC_API_KEY'); // never leaves this function

export function stripForStrict(schema: unknown): unknown {
  // TODO: deep-clone schema, drop minItems/maxItems/minLength/maxLength/pattern/
  // minimum/maximum so the API accepts strict:true on the tool definition.
  return schema;
}

export function constraintNotes(_schema: unknown, _guards: unknown): string {
  // TODO: walk the ORIGINAL schema + guards.length; render every dropped bound
  // as a plain-language RÀNG BUỘC line appended to the system/user prompt.
  return '';
}

export function coerceToSchema(raw: unknown): unknown {
  // TODO: re-parse stringified arrays back to arrays, etc. No-op in practice
  // once strict mode + constraint notes are in place, but cheap insurance.
  return raw;
}

Deno.serve(async (_req: Request) => {
  // TODO: implement the per-item flow above. Guard: refuse if LLM_API_KEY unset.
  return new Response(JSON.stringify({ ok: false, todo: 'prose-generate not yet implemented' }), {
    status: 501, headers: { 'content-type': 'application/json' },
  });
});
