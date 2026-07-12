-- Track when a job's pipeline status last changed (pending → running → done, etc.).
alter table prose_jobs
  add column if not exists status_updated_at timestamptz not null default now();

update prose_jobs
   set status_updated_at = coalesce(finished_at, created_at);

create or replace function prose_jobs_touch_status_updated_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    new.status_updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists prose_jobs_status_updated_at_trg on prose_jobs;

create trigger prose_jobs_status_updated_at_trg
  before insert or update on prose_jobs
  for each row
  execute function prose_jobs_touch_status_updated_at();
