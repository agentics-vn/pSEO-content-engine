-- pSEO Content Engine — core multi-tenant schema
-- Derived from architecture doc §4. Every content row is scoped by site_id.
-- The unique cache key (site_id, template_key, template_version, item_key,
-- data_hash) is the single most important constraint here — see §4 note.

-- ─────────────────────────────────────────────────────────────────────────────
-- Tenancy
-- ─────────────────────────────────────────────────────────────────────────────
create table sites (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,          -- e.g. 'sochumenh'
  name        text not null,
  created_at  timestamptz not null default now()
);

-- Human admin auth: content editors/reviewers, one site at a time per login.
create table site_admins (
  user_id  uuid not null references auth.users(id) on delete cascade,
  site_id  uuid not null references sites(id) on delete cascade,
  role     text not null default 'editor',   -- editor | reviewer | owner
  primary key (user_id, site_id)
);

-- Machine API auth: a consuming app's backend. Read-only, one site, optionally
-- scoped to one template. Store only the hash; the raw key is shown once.
create table site_api_keys (
  id           uuid primary key default gen_random_uuid(),
  site_id      uuid not null references sites(id) on delete cascade,
  key_hash     text not null,                -- sha256 of the bearer token
  scope        text not null default 'read', -- read (published only)
  template_key text,                         -- null = all templates on the site
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz
);
create index on site_api_keys (site_id) where revoked_at is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- Content pipeline (each row scoped to a site)
-- ─────────────────────────────────────────────────────────────────────────────

-- Templates are immutable per version. A content refresh = new version row.
create table prose_templates (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references sites(id) on delete cascade,
  key           text not null,               -- e.g. 'combo-so-chu-dao-su-menh'
  version       int  not null default 1,
  name          text not null,
  system_prompt text not null,
  user_template text not null,
  output_schema jsonb not null,              -- §1 (un-stripped; engine strips for strict mode)
  few_shots     jsonb not null default '[]'::jsonb,
  guards        jsonb not null default '{}'::jsonb,  -- §5 data-driven gate config
  model         text not null,               -- per-template model tiering lives HERE
  temperature   numeric not null default 0.7,
  max_tokens    int not null default 2600,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  unique (site_id, key, version)
);

create table prose_jobs (
  id                uuid primary key default gen_random_uuid(),
  site_id           uuid not null references sites(id) on delete cascade,
  template_id       uuid not null references prose_templates(id),
  status            text not null default 'pending',  -- pending|running|done|failed
  mode              text not null default 'generate', -- generate|regenerate
  item_count        int  not null default 0,
  review_sample_pct int  not null default 25,
  tokens_in         bigint not null default 0,
  tokens_out        bigint not null default 0,
  cost_usd          numeric not null default 0,
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  finished_at       timestamptz
);

create table prose_items (
  id               uuid primary key default gen_random_uuid(),
  site_id          uuid not null references sites(id) on delete cascade,
  job_id           uuid not null references prose_jobs(id) on delete cascade,
  template_key     text not null,
  template_version int  not null,
  item_key         text not null,            -- e.g. 'so-chu-dao-7-su-menh-3'
  data_hash        text not null,            -- hash of input_data → cache invalidation
  input_data       jsonb not null,           -- the ComboFacts fed to the LLM
  output           jsonb,                    -- raw generated item
  edited_output    jsonb,                    -- reviewer edits (wins over output)
  status           text not null default 'pending',
    -- pending → generated | flagged | failed_validation → approved | rejected → published
  validation       jsonb not null default '{}'::jsonb,  -- per-gate results
  similarity       numeric,                  -- max pairwise cosine vs batch
  regen_count      int not null default 0,
  reviewer         uuid references auth.users(id),
  review_note      text,
  updated_at       timestamptz not null default now(),
  -- CRITICAL CACHE KEY (doc §4): without site_id two tenants naming a template
  -- the same collide; without template_version a new prompt/model silently
  -- reuses stale output instead of regenerating.
  unique (site_id, template_key, template_version, item_key, data_hash)
);
create index on prose_items (site_id, status);

-- Published view: newest published row per (site, template, item).
create view prose_published as
  select distinct on (site_id, template_key, item_key)
    site_id, template_key, template_version, item_key,
    coalesce(edited_output, output) as output,
    updated_at
  from prose_items
  where status = 'published'
  order by site_id, template_key, item_key, updated_at desc;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — scope everything by site membership. content-api uses a separate,
-- key-checked path (service role in the edge function), never these policies.
-- ─────────────────────────────────────────────────────────────────────────────
alter table prose_templates enable row level security;
alter table prose_jobs      enable row level security;
alter table prose_items     enable row level security;

create policy site_scoped_templates on prose_templates
  using (site_id in (select site_id from site_admins where user_id = auth.uid()));
create policy site_scoped_jobs on prose_jobs
  using (site_id in (select site_id from site_admins where user_id = auth.uid()));
create policy site_scoped_items on prose_items
  using (site_id in (select site_id from site_admins where user_id = auth.uid()));
