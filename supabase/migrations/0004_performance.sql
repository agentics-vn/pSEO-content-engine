-- The performance loop: per-page search + revenue metrics, posted by each
-- site's CI/backend over content-api with its site-scoped key. This is what
-- turns the engine from a publishing machine into an optimization loop —
-- batch and refresh decisions rank by these numbers, not by volume.

create table page_metrics (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references sites(id) on delete cascade,
  item_key    text not null,
  date        date not null,
  source      text not null check (source in ('gsc', 'analytics')),
  -- search performance (source = 'gsc')
  clicks      integer,
  impressions integer,
  position    numeric,        -- average position that day
  -- attribution (source = 'analytics'; joined via UTM content = item_key)
  conversions integer,
  revenue     numeric,        -- in the site's reporting currency
  inserted_at timestamptz not null default now(),
  unique (site_id, item_key, date, source)
);
create index on page_metrics (site_id, date desc);
create index on page_metrics (site_id, item_key, date desc);

-- Service-role only (written via content-api key auth, read via prose-admin).
alter table page_metrics enable row level security;

-- Aggregated read the admin dashboard uses: per-item totals over a window,
-- position weighted by impressions (a plain AVG over days lies).
create or replace function item_metrics_summary(p_site_id uuid, p_since date)
returns table (
  item_key text,
  clicks bigint,
  impressions bigint,
  avg_position numeric,
  conversions bigint,
  revenue numeric
)
language sql
stable
as $$
  select
    item_key,
    coalesce(sum(clicks), 0)::bigint,
    coalesce(sum(impressions), 0)::bigint,
    case when coalesce(sum(impressions), 0) > 0
         then round((sum(position * impressions) / sum(impressions))::numeric, 1) end,
    coalesce(sum(conversions), 0)::bigint,
    coalesce(sum(revenue), 0)
  from page_metrics
  where site_id = p_site_id and date >= p_since
  group by item_key;
$$;
