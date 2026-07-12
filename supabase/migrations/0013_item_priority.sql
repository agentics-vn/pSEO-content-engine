-- K1: search-demand priority per item. The drain (batch submit + sync loop)
-- orders by priority DESC so high-volume pages are generated/reviewed first when
-- a run is phased. 0 = unranked (full-grid runs, where order is immaterial).

alter table prose_items
  add column if not exists priority int not null default 0;

comment on column prose_items.priority is
  'Search-demand rank (higher first); set from a job''s priorities map (K1). 0 = unranked.';
