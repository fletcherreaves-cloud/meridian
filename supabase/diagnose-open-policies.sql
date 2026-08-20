-- ============================================================================
-- Meridian — WHICH 70 POLICIES ARE STILL WORLD-OPEN (using(true) or null qual)?
-- ============================================================================
-- READ-ONLY. Selects from catalog views only. Creates nothing, changes nothing,
-- writes nothing. Safe to run any time, on production.
--
-- Follow-up to diagnose-schema-state.sql's headline number ("policies still
-- world-open using(true) -> 70"). That count alone doesn't say what's exposed --
-- this lists the actual table + policy + command, so we know precisely what's
-- open before touching anything.
--
-- Paste into Supabase -> SQL Editor -> Run, then send back the result grid.
-- ============================================================================

select
  tablename,
  policyname,
  cmd,                                            -- SELECT / INSERT / UPDATE / DELETE / ALL
  permissive,                                      -- PERMISSIVE / RESTRICTIVE
  roles,
  case when qual is null then '(null -- no USING clause at all)' else qual end as using_clause,
  case when with_check is null then '(none)' else with_check end as with_check_clause,
  exists (
    select 1 from pg_tables t
    where t.schemaname = 'public' and t.tablename = pg_policies.tablename
      and exists (
        select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = t.tablename and c.relrowsecurity
      )
  ) as rls_enabled_on_table
from pg_policies
where schemaname = 'public'
  and (qual = 'true' or qual is null)
order by tablename, cmd;
