/**
 * Load a tenant seed into the engine DB: site record + template + one
 * read-only, site-scoped API key (WP6 step 1).
 *
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
 *     deno run --allow-net --allow-env --allow-read scripts/load-seed.ts seeds/sochumenh
 *
 * The raw API key is printed ONCE and never stored — only its sha256 lands in
 * site_api_keys. Put the raw value in the consuming site's build secrets
 * (e.g. SOCHUMENH_CONTENT_KEY for the sochudao pull step, WP7).
 *
 * Idempotent: re-running upserts the site, refuses to overwrite an existing
 * template version (versions are immutable), and always mints a NEW key
 * (revoke old ones in site_api_keys if rotating).
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  Deno.exit(1);
}

const seedDir = Deno.args[0];
if (!seedDir) {
  console.error('usage: load-seed.ts <seed dir, e.g. seeds/sochumenh>');
  Deno.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const site = JSON.parse(await Deno.readTextFile(`${seedDir}/site.json`));
const templates: Array<Record<string, unknown>> = [];
for await (const entry of Deno.readDir(seedDir)) {
  if (entry.isFile && entry.name.startsWith('template.') && entry.name.endsWith('.json')) {
    templates.push(JSON.parse(await Deno.readTextFile(`${seedDir}/${entry.name}`)));
  }
}
if (templates.length === 0) {
  console.error(`no template.*.json found in ${seedDir}`);
  Deno.exit(1);
}

// 1. Site (upsert on slug).
const { data: siteRow, error: siteErr } = await supabase
  .from('sites')
  .upsert({ slug: site.slug, name: site.name }, { onConflict: 'slug' })
  .select('id, slug')
  .single();
if (siteErr) throw siteErr;
console.log(`site ${siteRow.slug} → ${siteRow.id}`);

// 2. Templates (immutable per version — skip if the version already exists).
for (const t of templates) {
  const { data: existing } = await supabase
    .from('prose_templates')
    .select('id')
    .eq('site_id', siteRow.id).eq('key', t.key as string).eq('version', t.version as number)
    .maybeSingle();
  if (existing) {
    console.log(`template ${t.key} v${t.version} already loaded — skipped (versions are immutable)`);
    continue;
  }
  const { error } = await supabase.from('prose_templates').insert({
    site_id: siteRow.id,
    key: t.key,
    version: t.version,
    name: t.name,
    system_prompt: t.system_prompt,
    user_template: t.user_template,
    output_schema: t.output_schema,
    few_shots: t.few_shots ?? [],
    guards: t.guards ?? {},
    model: t.model,
    temperature: t.temperature ?? 0.7,
    max_tokens: t.max_tokens ?? 2600,
  });
  if (error) throw error;
  console.log(`template ${t.key} v${t.version} loaded`);
}

// 3. Read-only, site-scoped API key. Raw value printed once; only the hash
//    is stored (schema comment on site_api_keys).
const rawKey = `pseo_${siteRow.slug}_` + [...crypto.getRandomValues(new Uint8Array(24))]
  .map((b) => b.toString(16).padStart(2, '0')).join('');
const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawKey));
const keyHash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');

const { error: keyErr } = await supabase.from('site_api_keys').insert({
  site_id: siteRow.id,
  key_hash: keyHash,
  scope: 'read',
  template_key: templates.length === 1 ? templates[0].key : null,
});
if (keyErr) throw keyErr;

console.log('\n── API key (shown ONCE — store it in the consuming site\'s build secrets) ──');
console.log(rawKey);
console.log('────────────────────────────────────────────────────────────────────────────');
