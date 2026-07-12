-- Expose each published item's input_data through prose_published so content-api
-- can return it as `facts` — the deterministic values the prose stands on
-- (harmony/linking/maturity/… from computeComboFacts). These are engine-computed,
-- never model-emitted, so the consuming site renders them instead of recomputing
-- (it dropped the combo math). Read-side only: no regeneration, works retroactively.
--
-- CREATE OR REPLACE keeps the column order and only appends input_data at the end,
-- preserving the 0005 security posture; both view options are re-asserted below.
create or replace view prose_published as
  select distinct on (site_id, template_key, item_key)
    site_id, template_key, template_version, item_key,
    coalesce(edited_output, output) as output,
    updated_at,
    input_data
  from prose_items
  where status = 'published'
  order by site_id, template_key, item_key, updated_at desc;

-- Re-assert the 0005 lockdown (defensive; CREATE OR REPLACE preserves these,
-- but input_data now flows through the view so make the intent explicit):
-- honor caller RLS (content-api uses the service role and applies its own
-- site_id filter), and keep direct anon/authenticated REST access revoked.
alter view prose_published set (security_invoker = true);
revoke all on prose_published from anon, authenticated;
