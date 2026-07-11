-- Security lockdown surfaced by the Supabase advisor after 0001–0004.

-- 1. prose_published was a SECURITY DEFINER view → it bypassed prose_items RLS,
--    so any anon/authenticated caller hitting /rest/v1/prose_published could
--    read EVERY site's published content cross-tenant. Make it honor the
--    caller's RLS: content-api uses the service role (BYPASSRLS) so it still
--    reads all rows and applies its own site_id filter; direct API callers now
--    get RLS-filtered (nothing for anon, own-site for an admin).
alter view prose_published set (security_invoker = true);
revoke all on prose_published from anon, authenticated;

-- 2. The engine RPCs are called only by the edge functions (service role).
--    Default grants expose them to PUBLIC via /rest/v1/rpc — anon could read
--    any site's metrics or corrupt job token counts. Restrict to service_role.
revoke execute on function add_job_usage(uuid, bigint, bigint) from public, anon, authenticated;
grant  execute on function add_job_usage(uuid, bigint, bigint) to service_role;
revoke execute on function item_metrics_summary(uuid, date) from public, anon, authenticated;
grant  execute on function item_metrics_summary(uuid, date) to service_role;

-- 3. rls_auto_enable is a project event-trigger function (auto-enables RLS on
--    new public tables); it is invoked by the trigger system, never as an RPC.
--    Revoke the default PUBLIC execute so it can't be probed via /rest/v1/rpc.
--    (Guarded: the function only exists on projects that provision it.)
do $$
begin
  if exists (select 1 from pg_proc where proname = 'rls_auto_enable') then
    execute 'revoke execute on function rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;
