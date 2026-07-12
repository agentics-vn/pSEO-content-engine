-- Channel-aware token accounting for mixed batch + sync (regen) spend on a job.

alter table prose_jobs
  add column if not exists tokens_in_batch bigint not null default 0,
  add column if not exists tokens_out_batch bigint not null default 0,
  add column if not exists tokens_in_sync bigint not null default 0,
  add column if not exists tokens_out_sync bigint not null default 0;

-- Replace 3-arg RPC with channel-aware 4-arg (default 'sync' keeps old callers safe in SQL).
drop function if exists add_job_usage(uuid, bigint, bigint);

create or replace function add_job_usage(
  p_job_id uuid,
  p_tokens_in bigint,
  p_tokens_out bigint,
  p_channel text default 'sync'
) returns void
language sql
security definer
as $$
  update prose_jobs
     set tokens_in  = tokens_in  + p_tokens_in,
         tokens_out = tokens_out + p_tokens_out,
         tokens_in_batch  = tokens_in_batch  + case when p_channel = 'batch' then p_tokens_in  else 0 end,
         tokens_out_batch = tokens_out_batch + case when p_channel = 'batch' then p_tokens_out else 0 end,
         tokens_in_sync   = tokens_in_sync   + case when p_channel = 'batch' then 0 else p_tokens_in  end,
         tokens_out_sync  = tokens_out_sync  + case when p_channel = 'batch' then 0 else p_tokens_out end,
         status     = case when status = 'pending' then 'running' else status end
   where id = p_job_id;
$$;

revoke execute on function add_job_usage(uuid, bigint, bigint, text) from public, anon, authenticated;
grant  execute on function add_job_usage(uuid, bigint, bigint, text) to service_role;

-- Best-effort backfill: existing totals treated as sync (conservative; pre-batch era).
update prose_jobs
   set tokens_in_sync  = tokens_in,
       tokens_out_sync = tokens_out
 where tokens_in_sync = 0 and tokens_out_sync = 0
   and (tokens_in > 0 or tokens_out > 0)
   and coalesce(run_channel, 'batch') <> 'batch';

update prose_jobs
   set tokens_in_batch  = tokens_in,
       tokens_out_batch = tokens_out
 where tokens_in_batch = 0 and tokens_out_batch = 0
   and (tokens_in > 0 or tokens_out > 0)
   and coalesce(run_channel, 'batch') = 'batch'
   and batch_status is not null;

-- Jobs that ran before batch feature (no batch_status) but have tokens → sync.
update prose_jobs
   set tokens_in_sync  = tokens_in,
       tokens_out_sync = tokens_out
 where tokens_in_sync = 0 and tokens_out_sync = 0
   and tokens_in_batch = 0 and tokens_out_batch = 0
   and (tokens_in > 0 or tokens_out > 0)
   and batch_status is null;
