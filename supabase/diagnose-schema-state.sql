-- ============================================================================
-- Meridian — WHICH SCHEMA FILES HAVE ACTUALLY BEEN APPLIED?
-- ============================================================================
-- READ-ONLY. Selects from catalog views only. Creates nothing, changes nothing,
-- writes nothing. Safe to run any time, on production.
--
-- Paste into Supabase → SQL Editor → Run, then send back the result grid.
--
-- WHY THIS EXISTS: schema files in supabase/ are applied by hand, so the repo says
-- what COULD be applied, never what IS. That gap has already caused real confusion —
-- four tables sat on a "pending user action" list for weeks before turning out to
-- already exist. Guessing about whether a security policy is live is worse.
-- ============================================================================

select * from (
  values
    ('--- OBJECTS ---', '')
) as t(check_name, result)

union all select 'can_see_loc() function  [schema-rls-phase2-loc.sql]',
  coalesce((select 'APPLIED' from pg_proc where proname = 'can_see_loc' limit 1), 'not applied')

union all select 'qsr_daily_activity_daily view  [schema-qsr-daily-summary.sql]',
  coalesce((select 'APPLIED' from pg_views where schemaname = 'public'
              and viewname = 'qsr_daily_activity_daily' limit 1), 'not applied')

union all select 'set_tenant_id() trigger fn  [schema-multitenant-phase1.sql]',
  coalesce((select 'APPLIED' from pg_proc where proname = 'set_tenant_id' limit 1), 'not applied')

union all select 'current_tenant_id() fn  [schema-multitenant-phase1.sql]',
  coalesce((select 'APPLIED' from pg_proc where proname = 'current_tenant_id' limit 1), 'not applied')

union all select 'tenant_id column on qsr_fob  [multitenant phase1]',
  coalesce((select 'APPLIED' from information_schema.columns
             where table_schema='public' and table_name='qsr_fob'
               and column_name='tenant_id' limit 1), 'not applied')

union all select '--- RLS POSTURE ---', ''

-- The decisive one. schema-rls-phase1.sql replaces every world-open `using (true)`
-- with an auth check. If this count is > 0, anonymous access is STILL OPEN on that
-- many policies and Phase 1 has not been run (or not fully).
union all select 'policies still world-open  using(true)  → want 0',
  (select count(*)::text from pg_policies
    where schemaname='public' and (qual = 'true' or qual is null))

union all select 'policies requiring a logged-in user  [rls-phase1]',
  (select count(*)::text from pg_policies
    where schemaname='public' and qual ilike '%uid()%')

union all select 'policies scoped by tenant_id  [multitenant phase2]',
  (select count(*)::text from pg_policies
    where schemaname='public' and qual ilike '%tenant%')

union all select 'RESTRICTIVE per-loc policies  [rls-phase2-loc]  → want 51',
  (select count(*)::text from pg_policies
    where schemaname='public' and permissive = 'RESTRICTIVE')

union all select 'total policies in public',
  (select count(*)::text from pg_policies where schemaname='public')

union all select 'tables with RLS enabled',
  (select count(*)::text from pg_tables t
    where t.schemaname='public'
      and exists (select 1 from pg_class c
                   join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname='public' and c.relname = t.tablename and c.relrowsecurity))

union all select '--- SIZE (capacity review) ---', ''

union all select 'rows: qsr_daily_activity (hourly, the big one)',
  (select count(*)::text from public.qsr_daily_activity)

union all select 'rows: labor_rows',  (select count(*)::text from public.labor_rows)
union all select 'rows: ops_rows',    (select count(*)::text from public.ops_rows)
union all select 'rows: ctrl_rows',   (select count(*)::text from public.ctrl_rows)
union all select 'rows: audit_rows',  (select count(*)::text from public.audit_rows)

union all select 'total database size',
  (select pg_size_pretty(pg_database_size(current_database())))
;
