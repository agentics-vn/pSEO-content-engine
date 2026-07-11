-- Webhook registrations (doc §8): the engine POSTs a lightweight signal
-- {site, template, item_count} here on publish; the consuming app's backend
-- then calls GET /published itself. Registered via content-api with the
-- site's own bearer key, so a key can only ever register hooks for its site.
create table site_webhooks (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references sites(id) on delete cascade,
  url         text not null,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  unique (site_id, url)
);
create index on site_webhooks (site_id) where revoked_at is null;

-- Atomic token accounting for the generate loop: many prose-generate
-- invocations may write the same job concurrently; read-modify-write from the
-- function would race. cost_usd stays 0 here — pricing is a reporting concern
-- computed from tokens at read time, not baked in per call.
create or replace function add_job_usage(
  p_job_id uuid,
  p_tokens_in bigint,
  p_tokens_out bigint
) returns void
language sql
security definer
as $$
  update prose_jobs
     set tokens_in  = tokens_in  + p_tokens_in,
         tokens_out = tokens_out + p_tokens_out,
         status     = case when status = 'pending' then 'running' else status end
   where id = p_job_id;
$$;
