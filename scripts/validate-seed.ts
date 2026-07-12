/**
 * validate-seed — the drop-in gate for the hand-off contract.
 *
 *   deno run --allow-read --config supabase/functions/deno.json \
 *     scripts/validate-seed.ts seeds/<client>
 *
 * A site-repo Claude Code session hands over a seed folder (site.json,
 * template.*.json, worklist*.json). This validator proves the drop is safe
 * BEFORE anything touches the engine DB, using the exact same functions the
 * engine runs at generation time (fillTemplate / constraintNotes /
 * resolveGuards) — so "validates here" means "generates there".
 */

import {
  constraintNotes,
  fillTemplate,
  resolveGuards,
  type Guards,
} from '../supabase/functions/prose-generate/lib.ts';
import { buildComboInput } from '../supabase/functions/_shared/inputs.ts';

const seedDir = Deno.args[0];
if (!seedDir) {
  console.error('usage: validate-seed.ts seeds/<client>');
  Deno.exit(2);
}

const errors: string[] = [];
const warnings: string[] = [];
const err = (m: string) => errors.push(m);
const warn = (m: string) => warnings.push(m);

const readJson = async (name: string) => JSON.parse(await Deno.readTextFile(`${seedDir}/${name}`));

// ── site.json ────────────────────────────────────────────────────────────────
let site: Record<string, unknown> = {};
try {
  site = await readJson('site.json');
  if (typeof site.slug !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(site.slug)) err('site.json: slug must be a lowercase slug');
  if (typeof site.name !== 'string' || !site.name) err('site.json: name required');
} catch (e) {
  err(`site.json: ${e instanceof Error ? e.message : e}`);
}

// ── templates ────────────────────────────────────────────────────────────────
const KNOWN_MODELS = ['claude-sonnet-5', 'claude-haiku-4-5', 'claude-opus-4-8', 'claude-sonnet-4-6', 'claude-sonnet-4-5', 'claude-opus-4-5'];
const templates: Array<Record<string, any>> = [];
for await (const f of Deno.readDir(seedDir)) {
  if (!f.isFile || !f.name.startsWith('template.') || !f.name.endsWith('.json')) continue;
  try {
    const t = await readJson(f.name);
    templates.push(t);
    const where = f.name;
    for (const field of ['key', 'version', 'name', 'system_prompt', 'user_template', 'output_schema', 'guards', 'model']) {
      if (t[field] === undefined) err(`${where}: missing "${field}"`);
    }
    if (t.version !== undefined && !Number.isInteger(t.version)) err(`${where}: version must be an integer`);
    if (t.model && !KNOWN_MODELS.includes(t.model)) warn(`${where}: model "${t.model}" is not in the known list (${KNOWN_MODELS.slice(0, 2).join(', ')}, …) — verify it exists`);
    const props: Record<string, any> = t.output_schema?.properties ?? {};
    if (t.output_schema?.type !== 'object' || Object.keys(props).length === 0) {
      err(`${where}: output_schema must be an object with properties`);
    }
    if (!props.metaDescription) warn(`${where}: no metaDescription field — pages will have no guarded meta`);
    if (typeof t.user_template === 'string' && !t.user_template.includes('{constraint_notes}')) {
      warn(`${where}: user_template has no {constraint_notes} — notes will be appended at the end instead`);
    }
    // Guards must reference real schema fields. A length key may be
    // "field.N" to bound element N of an array-of-strings field.
    for (const field of Object.keys(t.guards?.length?.fields ?? {})) {
      const el = /^(.+)\.(\d+)$/.exec(field);
      if (el) {
        const base = props[el[1]];
        if (!base) err(`${where}: guards.length.fields.${field} — "${el[1]}" is not in output_schema`);
        else if (base.type !== 'array') err(`${where}: guards.length.fields.${field} — "${el[1]}" is not an array field (index bound only valid on arrays)`);
        else if (base.maxItems !== undefined && Number(el[2]) >= base.maxItems) err(`${where}: guards.length.fields.${field} — index ${el[2]} is beyond maxItems ${base.maxItems}`);
      } else if (!props[field]) {
        err(`${where}: guards.length.fields.${field} is not in output_schema`);
      }
    }
    // entity_consistency: if it auto-checks (has a pattern), the regex must
    // compile and the allowed[] entity list must be non-empty.
    const ent = t.guards?.entity_consistency;
    if (ent?.pattern !== undefined) {
      try { new RegExp(String(ent.pattern), 'gu'); }
      catch (e) { err(`${where}: entity_consistency.pattern is not a valid regex: ${e instanceof Error ? e.message : e}`); }
      if (!Array.isArray(ent.allowed) || ent.allowed.length === 0) {
        err(`${where}: entity_consistency has a pattern but no allowed[] — the check would flag every entity`);
      }
    }
    for (const rule of t.guards?.required_mentions?.rules ?? []) {
      if (!props[rule.field]) err(`${where}: guards.required_mentions field "${rule.field}" is not in output_schema`);
    }
    if (t.guards?.faq_shape && !props.faqs) err(`${where}: guards.faq_shape configured but schema has no faqs field`);
    if (t.guards?.similarity?.max_pairwise > 0.6) warn(`${where}: similarity.max_pairwise ${t.guards.similarity.max_pairwise} is loose (reference healthy max ≈ 0.55)`);
    if (t.guards?.numeric_consistency) {
      warn(`${where}: numeric_consistency is tuned for small integers (0–33) — for prices/dates use required_mentions on pre-formatted strings instead`);
    }
  } catch (e) {
    err(`${f.name}: ${e instanceof Error ? e.message : e}`);
  }
}
if (templates.length === 0) err('no template.*.json found');

// ── work-lists + generation dry-run ──────────────────────────────────────────
const worklists: Array<{ name: string; body: Record<string, any> }> = [];
for await (const f of Deno.readDir(seedDir)) {
  if (f.isFile && f.name.startsWith('worklist') && f.name.endsWith('.json')) {
    try {
      worklists.push({ name: f.name, body: await readJson(f.name) });
    } catch (e) {
      err(`${f.name}: ${e instanceof Error ? e.message : e}`);
    }
  }
}

function dryRun(template: Record<string, any>, inputData: Record<string, unknown>, label: string) {
  const notes = constraintNotes(template.output_schema, template.guards as Guards);
  const withNotes = template.user_template.includes('{constraint_notes}')
    ? template.user_template.replace('{constraint_notes}', notes)
    : `${template.user_template}\n\n${notes}`;
  try {
    const prompt = fillTemplate(withNotes, inputData);
    const leftover = prompt.match(/\{[a-zA-Z_][\w.]*\}/);
    if (leftover) err(`${label}: unresolved placeholder ${leftover[0]} after fill`);
  } catch (e) {
    err(`${label}: ${e instanceof Error ? e.message : e}`);
  }
  const resolved = JSON.stringify(resolveGuards(template.guards as Guards, inputData));
  const unresolved = resolved.match(/\{[a-zA-Z_][\w.]*\}/g)?.filter((tok) => tok !== '{constraint_notes}');
  if (unresolved?.length) err(`${label}: guard token(s) not resolvable from input_data: ${[...new Set(unresolved)].join(', ')}`);
}

for (const { name, body } of worklists) {
  const template = templates.find((t) => t.key === body.template_key);
  if (!template) {
    err(`${name}: template_key "${body.template_key}" has no template.*.json in this seed`);
    continue;
  }
  const items: Array<{ item_key: string; input_data: Record<string, unknown> }> = body.items ?? [];
  if (!Array.isArray(items) || items.length === 0) {
    err(`${name}: items[] required (the POST /jobs body shape)`);
    continue;
  }
  const seen = new Set<string>();
  for (const it of items) {
    if (!it.item_key || !/^[a-z0-9][a-z0-9-]*$/.test(it.item_key)) err(`${name}: bad item_key ${JSON.stringify(it.item_key)}`);
    if (seen.has(it.item_key)) err(`${name}: duplicate item_key "${it.item_key}"`);
    seen.add(it.item_key);
    if (!it.input_data || typeof it.input_data !== 'object') err(`${name}: ${it.item_key}: input_data must be an object`);
  }
  for (const it of items.slice(0, 3)) {
    if (it.input_data && typeof it.input_data === 'object') dryRun(template, it.input_data, `${name}:${it.item_key}`);
  }
}

// No work-list: the combo template can still dry-run via its built-in axis.
if (worklists.length === 0) {
  const combo = templates.find((t) => t.key === 'combo-so-chu-dao-su-menh');
  if (combo) {
    dryRun(combo, buildComboInput('so-chu-dao-7-su-menh-3') as unknown as Record<string, unknown>, 'combo-grid sample 7×3');
  } else {
    warn('no worklist*.json — generation dry-run skipped; add one before creating jobs');
  }
}

// ── verdict ──────────────────────────────────────────────────────────────────
for (const w of warnings) console.log(`  WARN  ${w}`);
for (const e of errors) console.log(`  FAIL  ${e}`);
if (errors.length) {
  console.log(`\n✗ ${seedDir}: ${errors.length} error(s), ${warnings.length} warning(s) — do NOT load this seed`);
  Deno.exit(1);
}
console.log(`\n✓ ${seedDir}: valid (${templates.length} template(s), ${worklists.length} work-list(s), ${warnings.length} warning(s)) — safe to load`);
