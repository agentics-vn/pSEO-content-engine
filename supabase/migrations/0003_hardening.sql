-- Production hardening: state-machine CHECKs, RLS on every tenancy table,
-- and the indexes the run-loop/review queue actually hit.

-- 1. Status state machines enforced at the schema layer (the app enforces the
--    transitions; the DB refuses garbage states outright).
alter table prose_items add constraint prose_items_status_chk check (
  status in ('pending','generated','flagged','failed_validation',
             'approved','rejected','published')
);
alter table prose_jobs add constraint prose_jobs_status_chk check (
  status in ('pending','running','done','failed')
);
alter table prose_jobs add constraint prose_jobs_mode_chk check (
  mode in ('generate','regenerate')
);
alter table site_admins add constraint site_admins_role_chk check (
  role in ('editor','reviewer','owner')
);
alter table prose_jobs add constraint prose_jobs_sample_pct_chk check (
  review_sample_pct between 0 and 100
);
alter table site_webhooks add constraint site_webhooks_https_chk check (
  url like 'https://%'
);

-- 2. RLS on the tenancy tables. 0001 enabled it only on the three content
--    tables; sites/site_admins/site_api_keys/site_webhooks were reachable by
--    any authenticated PostgREST caller. Edge functions use the service role
--    (which bypasses RLS), so locking these down costs nothing.
alter table sites         enable row level security;
alter table site_admins   enable row level security;
alter table site_api_keys enable row level security;
alter table site_webhooks enable row level security;

-- Members can read their own sites and memberships; nothing else. Keys and
-- webhooks have NO policies: service-role-only by construction (key hashes
-- and webhook targets never belong in a browser session).
create policy member_read_sites on sites for select
  using (id in (select site_id from site_admins where user_id = auth.uid()));
create policy self_read_memberships on site_admins for select
  using (user_id = auth.uid());

-- 3. Hot-path indexes: the run loop polls (job_id, status); the published
--    view resolves per (site, template, item) ordered by updated_at.
create index if not exists prose_items_job_status_idx on prose_items (job_id, status);
create index if not exists prose_items_pub_idx
  on prose_items (site_id, template_key, item_key, updated_at desc)
  where status = 'published';
