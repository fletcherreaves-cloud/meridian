-- ============================================================================
-- Meridian — ANY TABLE WITH RLS NOT ENABLED AT ALL? (the one remaining question)
-- ============================================================================
-- READ-ONLY. Selects from catalog views only. Creates nothing, changes nothing,
-- writes nothing. Safe to run any time, on production.
--
-- Follow-up to diagnose-schema-state.sql + diagnose-open-policies.sql (2026-08-20).
-- Those two showed the anonymous-access problem is already closed at the POLICY level
-- (tenant_id = current_tenant_id() correctly rejects anon callers). But a policy only
-- matters if RLS is actually turned ON for that table -- a table with RLS disabled
-- bypasses every policy question entirely and is fully open via the anon key,
-- regardless of what policies exist on paper. This is the one thing neither prior
-- diagnostic checked directly.
--
-- Paste into Supabase -> SQL Editor -> Run, then send back the result grid.
-- ============================================================================

select
  c.relname as tablename,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced_on_owner,   -- if false, the table owner (and service role
                                                    -- via some grants) can still bypass RLS --
                                                    -- expected/fine for our service-role pulls,
                                                    -- just noting it for completeness
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname) as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'          -- ordinary tables only, not views/sequences
order by c.relrowsecurity asc, c.relname;   -- RLS-disabled tables (the real risk) sort first
