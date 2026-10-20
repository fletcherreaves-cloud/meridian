-- ── Widen org_assignment_audit beyond 'supervisor'/'gm' ───────────────────────────────────────
-- Owner request 2026-10-20: "for anytime I make notations such as this let's mark the change
-- somehow so that we can also determine strengths and weaknesses of who our people are when
-- assigned to specific roles such as accounting manager or the scheduling manager to kind of
-- coincide with notating when GM's change or Supervisor patches change." Same effective-dated +
-- permanent-audit-log model GM/Supervisor assignments already use (schema-org-assignment-
-- audit.sql), generalized to any role the owner names -- Accounting Manager, Scheduling Manager,
-- whatever comes up next. The owner's own two examples are the point: the set of role types is
-- open-ended by design and grows as he thinks of them, unlike `action` (add/edit/remove/
-- snapshot), which stays a fixed state machine. So this widens the CHECK rather than enumerating
-- roles -- a lightweight format guard (lowercase snake_case, 2-40 chars) replaces the old
-- `in ('supervisor','gm')` enum. Existing rows are unaffected ('supervisor'/'gm' both already
-- satisfy the new pattern); this only changes what's ALLOWED going forward.
--
-- Run this file in the Supabase SQL editor once to activate the widened constraint -- it is not
-- applied automatically. Until it runs, RoleAssignmentsEditor (src/views/management.js) still
-- works exactly as before (the settings blob itself isn't gated on this table at all) -- only
-- the permanent audit-log write for a NON-gm/supervisor role silently fails
-- (logOrgAssignmentChange's existing best-effort .catch(()=>{}) at every call site), same
-- "editor works, audit trail just isn't recording yet" interim state schema-org-assignment-
-- audit.sql's own header already established for this exact table.
alter table public.org_assignment_audit drop constraint if exists org_assignment_audit_assignment_type_check;
alter table public.org_assignment_audit add constraint org_assignment_audit_assignment_type_check
  check (assignment_type ~ '^[a-z0-9_]{2,40}$');

comment on column public.org_assignment_audit.assignment_type is
  'Lowercase snake_case role key (e.g. ''gm'', ''supervisor'', ''accounting_manager''). Open-ended by design -- see this migration''s own header (schema-role-assignment-audit-widen.sql).';
