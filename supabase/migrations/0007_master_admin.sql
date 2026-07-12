-- Master admin: tad@agentics.vn gets owner on every site (existing + future).
-- The auth user must already exist (created via Dashboard / Auth Admin API).

create or replace function public.grant_master_admin_on_site()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  master_id uuid;
begin
  select id into master_id from auth.users where email = 'tad@agentics.vn' limit 1;
  if master_id is not null then
    insert into site_admins (user_id, site_id, role)
    values (master_id, new.id, 'owner')
    on conflict (user_id, site_id) do update set role = excluded.role;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sites_grant_master_admin on sites;
create trigger trg_sites_grant_master_admin
  after insert on sites
  for each row execute function public.grant_master_admin_on_site();

-- Backfill existing sites
insert into site_admins (user_id, site_id, role)
select u.id, s.id, 'owner'
from auth.users u
cross join sites s
where u.email = 'tad@agentics.vn'
on conflict (user_id, site_id) do update set role = excluded.role;
