-- ═══════════════════════════════════════════════════════════════════════════════
-- Meridian — Multi-tenant ISOLATION TEST (run AFTER Phase 2, BEFORE any 2nd operator)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Proves the RLS flip actually isolates: a caller who is NOT in the owner tenant must
-- see ZERO of the owner's rows. This script makes NO permanent changes — the negative
-- test touches nothing, and the (optional) real-tenant variant rolls itself back.
--
-- Run this ONLY after schema-multitenant-phase2-rls.sql. Before Phase 2 every table is
-- wide-open, so the counts below would be NON-zero — which is itself a useful check that
-- Phase 2 changed something.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── TEST 1 (primary): a caller with no owner-tenant membership sees nothing ──────
-- Impersonate an authenticated user whose profile is NOT in the owner tenant (here,
-- a sub with no profile row at all → current_tenant_id() = NULL → tenant_id = NULL is
-- never true → 0 rows). This is logically identical to a real 2nd-tenant user, whose
-- current_tenant_id() would be a DIFFERENT uuid (also 0 owner rows). No writes at all.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000fe","role":"authenticated"}';

  -- EVERY count below MUST be 0 after Phase 2:
  select 'labor_rows'         as table, count(*) as visible_rows from public.labor_rows
  union all select 'qsr_daily_activity',  count(*) from public.qsr_daily_activity
  union all select 'qsr_fob',             count(*) from public.qsr_fob
  union all select 'sales_ledger_daily',  count(*) from public.sales_ledger_daily
  union all select 'monthly_targets',     count(*) from public.monthly_targets
  union all select 'reviews',             count(*) from public.reviews
  union all select 'feature_requests',    count(*) from public.feature_requests
  union all select 'store_vlh_config',    count(*) from public.store_vlh_config
  order by 1;
rollback;

-- ── TEST 2 (positive control): the owner still sees their data ───────────────────
-- Impersonate the REAL owner user (their profile has tenant_id = owner tenant).
-- These counts MUST be > 0 — proves the flip didn't lock the owner out.
-- IMPORTANT: fetch the owner's id BEFORE `set local role authenticated`. Once RLS is on
-- and the role is authenticated with no JWT yet, a `select … from profiles` returns
-- nothing (own-read needs auth.uid(); tenant-read needs current_tenant_id()) — so fetching
-- the id after the role switch yields NULL and the test silently impersonates a null user
-- (every count comes back 0). We stash the id in a GUC as postgres first, then build the JWT.
begin;
  -- as postgres (bypasses RLS): capture the owner's auth id into a transaction-local GUC
  select set_config('meridian.test_sub',
    (select id::text from public.profiles where email = 'fletcher.reaves@mcreaves.com'), true);
  set local role authenticated;
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', current_setting('meridian.test_sub'), 'role', 'authenticated')::text,
    true    -- transaction-local
  );

  select 'labor_rows'        as table, count(*) as visible_rows from public.labor_rows
  union all select 'qsr_daily_activity', count(*) from public.qsr_daily_activity
  order by 1;
rollback;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PASS  = Test 1 all zeros  AND  Test 2 both > 0.
-- FAIL  = any Test-1 count > 0 (a non-tenant caller can read owner data — do NOT
--         onboard anyone; re-check the table is in the Phase-2 flip list) OR any
--         Test-2 count = 0 (owner locked out — check your profile.tenant_id, then the
--         Phase-2 rollback block).
--
-- OPTIONAL — test against a REAL 2nd tenant (only if profiles.id does NOT FK to
-- auth.users, or you first create a throwaway auth user in the dashboard and paste its
-- id below). Rolls back, so nothing persists:
--   begin;
--     insert into public.tenants (id, name) values ('ffffffff-ffff-ffff-ffff-ffffffffffff','ISO TEST OP');
--     insert into public.profiles (id, tenant_id)     -- <id> = a real auth.users id you created
--       values ('<throwaway-auth-user-id>','ffffffff-ffff-ffff-ffff-ffffffffffff');
--     set local role authenticated;
--     set local request.jwt.claims = '{"sub":"<throwaway-auth-user-id>","role":"authenticated"}';
--     select count(*) from public.labor_rows;   -- MUST be 0
--   rollback;
-- ═══════════════════════════════════════════════════════════════════════════════
