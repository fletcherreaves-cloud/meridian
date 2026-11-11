-- ═══════════════════════════════════════════════════════════════════════════════
-- Raise VP to DO's level on payroll.view (owner-authorized 2026-11-11, fresh-eyes role audit)
--
-- memory/finding-fresh-eyes-role-audit-2026-11-11.md flagged a real inconsistency: VP (level 2,
-- outranks DO's level 3 on the review ladder) had LESS access than DO on `payroll.view` --
-- src/engine/permissions.js's VP_PERMS had it false, DO_PERMS overrode it true. Owner: "They
-- should be equal in settings > Role up to DO level" -- i.e. raise VP, don't lower DO.
--
-- The UI-layer permission key (permissions.js) was fixed in the same pass as this file. That key
-- alone is cosmetic without this migration -- the REAL enforcement boundary for payroll.view is
-- Supabase RLS, and all 4 tables gated by it hardcode `get_my_role() = any(array['admin','owner',
-- 'do'])` with no 'vp'. Without this, a VP would see the Pay Rate History nav entry (the UI key
-- now allows it) and get ZERO rows back -- a worse outcome than not showing the entry at all, a
-- panel that looks broken rather than correctly absent. Confirmed live (pg_policies) before
-- writing this, not assumed from the one table permissions.js's own comment names -- there are
-- actually 4, not 2: employee_pay_rate_changes, lifelenz_shift_pay (the two the comment names),
-- plus lifelenz_employee_roster and qsr_employee_pay_period_history (same wage-adjacent tier,
-- same role check, not previously cross-referenced from permissions.js's comment).
--
-- security.auditLog was NOT touched -- it was already `false` for both VP and DO (a wrong claim
-- in the audit doc's first draft, corrected before any code changed) -- so there is no
-- corresponding RLS change for that key.
--
-- Full qual text preserved verbatim from live pg_policies, 'vp' added to the array, nothing else
-- changed. Idempotent: safe to re-run (full replacement, not a merge).
-- ═══════════════════════════════════════════════════════════════════════════════

drop policy if exists "employee_pay_rate_changes: role" on public.employee_pay_rate_changes;
create policy "employee_pay_rate_changes: role" on public.employee_pay_rate_changes
  for select to authenticated
  using (get_my_role() = any (array['admin','owner','vp','do']));

drop policy if exists "lifelenz_employee_roster: role" on public.lifelenz_employee_roster;
create policy "lifelenz_employee_roster: role" on public.lifelenz_employee_roster
  for select to authenticated
  using (get_my_role() = any (array['admin','owner','vp','do']));

drop policy if exists "lifelenz_shift_pay: role" on public.lifelenz_shift_pay;
create policy "lifelenz_shift_pay: role" on public.lifelenz_shift_pay
  for select to authenticated
  using (get_my_role() = any (array['admin','owner','vp','do']));

drop policy if exists "qsr_employee_pay_period_history: role" on public.qsr_employee_pay_period_history;
create policy "qsr_employee_pay_period_history: role" on public.qsr_employee_pay_period_history
  for select to authenticated
  using (get_my_role() = any (array['admin','owner','vp','do']));
