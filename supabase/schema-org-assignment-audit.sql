-- ── org_assignment_audit — append-only history of Supervisor/GM assignment changes ──────────
-- Owner asked (2026-10-06): update OK Supervisor assignments, and "I want to ensure the
-- effective dates for changes are retained so if I remove a supervisor from a location
-- assignment, I need to know that we have a stored record somewhere of the time they were
-- responsible for each location." settings.orgAssignments (org_config key 'app_settings')
-- already resolves attribution by tenure (constants.js's whoRan()/groupsAt(), "latest start ≤
-- date wins") and already preserves history AS LONG AS a row is never deleted -- but
-- SupervisorAssignmentsEditor's remove() (management.js) does delete a row outright, with no
-- trace left anywhere. This table closes that gap: every add/edit/remove through the editor
-- writes a row here FIRST, so even a corrective deletion stays permanently recoverable --
-- modeled on this repo's own identity_reveal_log append-only pattern
-- (schema-identity-vault.sql), scaled down from that table's SECURITY-DEFINER-only write path
-- (built for PII reveal auditing, a much higher sensitivity bar) to a plain RLS insert policy
-- matching staff_assignments' existing "admin/area_supervisor" convention -- org-structure
-- data, not personal information.
--
-- Run this file in the Supabase SQL editor once to activate the table -- it is not applied
-- automatically. Until it exists, logOrgAssignmentChange() (src/lib/supabase.js) fails
-- silently (best-effort, .catch(()=>{}) at every call site) and the editor still works exactly
-- as before; the audit trail simply isn't being written yet.
create table if not exists public.org_assignment_audit (
  id              uuid        not null default gen_random_uuid() primary key,
  tenant_id       uuid        not null default '00000000-0000-0000-0000-000000000001',
  assignment_type text        not null check (assignment_type in ('supervisor','gm')),
  loc             text        not null,
  action          text        not null check (action in ('add','edit','remove','snapshot')),
  old_value       jsonb,
  new_value       jsonb,
  actor_id        uuid        references public.profiles(id),
  changed_at      timestamptz not null default now()
);

create index if not exists org_assignment_audit_loc_idx on public.org_assignment_audit (loc, changed_at desc);
create index if not exists org_assignment_audit_type_idx on public.org_assignment_audit (assignment_type, changed_at desc);

alter table public.org_assignment_audit enable row level security;

drop policy if exists "org_assignment_audit: admin/supervisor read" on public.org_assignment_audit;
create policy "org_assignment_audit: admin/supervisor read" on public.org_assignment_audit
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('area_supervisor', 'admin')
    )
  );

-- INSERT only -- no update/delete policy at all, by design, matching identity_reveal_log's
-- "nobody can edit or remove an entry" rule. Append-only is the entire point: a row recorded
-- here must survive even a later editor action that undoes it.
drop policy if exists "org_assignment_audit: admin/supervisor insert" on public.org_assignment_audit;
create policy "org_assignment_audit: admin/supervisor insert" on public.org_assignment_audit
  for insert with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('area_supervisor', 'admin')
    )
  );

comment on table public.org_assignment_audit is
  'Append-only log of every Supervisor/GM assignment change (add/edit/remove), 2026-10-06. No update/delete policy at all -- a corrective deletion in the editor still leaves a permanent trace here. Indefinite retention, same convention as identity_reveal_log.';
