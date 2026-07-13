-- Per-site persona/doctrine layer: a site-level prompt fragment the engine
-- prepends to EVERY template's system_prompt at generation, so the site's
-- doctrine (voice, persuasion arc, ethical guardrails) stays consistent across
-- all of its templates instead of being copy-pasted into each one.
--
-- Ownership: the SITE authors it (seeds/<client>/persona.md → load-seed);
-- the engine only applies it. NULL = no persona → generation is byte-identical
-- to pre-persona behavior. Unlike templates (immutable per version), persona is
-- deliberately mutable site config — changes affect all FUTURE generations
-- (published items are immutable); load-seed prints a loud diff on change.

alter table sites
  add column if not exists persona text,
  add column if not exists persona_updated_at timestamptz;

comment on column sites.persona is
  'Site-level doctrine prepended to every template system_prompt at generation; authored via seeds/<client>/persona.md + load-seed. NULL = none.';
comment on column sites.persona_updated_at is
  'Last time persona was set/changed/cleared by load-seed.';
