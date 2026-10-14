-- ═══════════════════════════════════════════════════════════════════════════════
-- security_findings RLS performance fix (2026-10-14) -- the ACTUAL root cause behind
-- "DATA INCOMPLETE -- security findings (security_findings_latest)" / Security panel
-- showing zero findings across every domain, not just Inventory.
--
-- This dispatch tried three code-side fixes in a row (v5.552 fetchAll skip-and-continue,
-- v5.553 switch to _pagedParallel, v5.554 pageSize 1000->300) -- each one real, each one
-- verified to work when measured with the SUPABASE SERVICE ROLE KEY. None of them fixed
-- the owner's live symptom, because the service-role key BYPASSES RLS entirely and so
-- could never have revealed an RLS-specific problem.
--
-- Live-measured head to head, same offsets, same query, only the credential different:
--   - Service role (RLS bypassed):  pageSize 300 -> 0/6 page failures. pageSize 200 -> 0/6.
--   - A REAL authenticated admin-role session (RLS applied, via a throwaway test account
--     created and deleted through the service-role Admin API -- no owner credentials used):
--     pageSize 300, 200, 150, even 100 -> 6/6 page failures EVERY TIME, all timing out at
--     a consistent ~8.1-8.3s (Postgres 57014). Page size made no difference whatsoever --
--     even a 100-row page costs the same ~8s under RLS that a 1000-row page costs. That
--     is the signature of RLS forcing a bad query plan independent of how much data is
--     actually requested, not a "too much work per page" problem pagination can fix.
--
-- Root cause: "security_findings: gated read" (schema-security-findings.sql, corrected by
-- schema-security-findings-role-fix.sql) calls get_my_role() as a BARE function reference
-- inside the USING clause:
--     get_my_role() in ('admin', 'owner', 'area_supervisor')
-- Despite get_my_role() being declared `stable`, Postgres's planner does not reliably
-- treat a bare function call inside an RLS policy as a one-time ("InitPlan") evaluation --
-- it can re-run the function, and re-plan around it, ONCE PER CANDIDATE ROW. Combined with
-- security_findings_latest's own DISTINCT ON materialization (dispatch #40/#41's own
-- background: ~93K+ raw rows collapsing to ~20K distinct), re-evaluating a profiles-table
-- lookup per candidate row turns an index-assisted scan into something the planner can no
-- longer execute cheaply, regardless of LIMIT/page size.
--
-- This is a well-documented, official Postgres/Supabase RLS performance pattern, not a
-- guess specific to this table: Supabase's own RLS performance guidance explicitly
-- recommends wrapping a function call used in a policy as `(select fn())` instead of
-- `fn()` bare, specifically because the wrapped form lets the planner evaluate it as a
-- single InitPlan (once per statement) instead of once per row. This migration applies
-- exactly that wrapping -- no change to get_my_role() itself, no change to WHO can read
-- (same three-branch admin/owner/area_supervisor/manager-with-reveal-flag logic, unchanged
-- and still correct), only to how cheaply Postgres can plan around it.
--
-- NOTE: this migration could not be verified end-to-end by Claude before being committed --
-- unlike v5.552/553/554, which were each measured directly against the live table through
-- the real code path, this one requires executing DDL (ALTER POLICY), which is outside what
-- the service-role REST API key can do (no SQL execution capability in this agent's
-- environment, consistent with "no automated migration runner exists in this repo" per
-- CLAUDE.md). Run this in the Supabase SQL editor, then re-check the Security panel --
-- report back whether findings now load and whether the DATA INCOMPLETE banner is gone.
--
-- `drop policy if exists` / `create policy` are both safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════════

drop policy if exists "security_findings: gated read" on public.security_findings;
create policy "security_findings: gated read" on public.security_findings
  for select using (
    tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
    and (
      (select get_my_role()) in ('admin', 'owner', 'area_supervisor')
      or (
        (select get_my_role()) = 'manager'
        and coalesce((select (data->>'enabled')::boolean from public.org_config where key = 'gm_identity_reveal_enabled'), false)
      )
    )
  );

-- security_rules isn't the table that was timing out (it's 12 rows, trivial either way),
-- but its write policy has the same bare-get_my_role() shape -- fixed here too while this
-- file is already touching the pattern, for consistency and to close off the same class of
-- bug before it ever surfaces on a bigger table.
drop policy if exists "security_rules: admin/supervisor write" on public.security_rules;
create policy "security_rules: admin/supervisor write" on public.security_rules
  for all
  using ((select get_my_role()) in ('admin', 'owner', 'area_supervisor') and tenant_id = '00000000-0000-0000-0000-000000000001'::uuid)
  with check ((select get_my_role()) in ('admin', 'owner', 'area_supervisor') and tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);
