-- ── App access log (owner request 2026-10-17, "usage logs/reports for auditing") ──────────────
-- Scoped deliberately narrow for a first cut (explicit owner latitude: "whatever you feel is
-- best for now, we can always pivot later"). Two event types only:
--   'login'      — written by AuthGate.js on a real SIGNED_IN auth event (credential-based
--                  entry; NOT fired on every page load with an already-persisted session —
--                  that's INITIAL_SESSION, a different Supabase auth event, deliberately not
--                  logged here since it isn't a new credential check).
--   'panel_view' — written by the two existing Owner/Admin/DO-only panels (Pay Rate History,
--                  Security) on mount. Not instrumented on every panel in the app — that's
--                  blanket usage telemetry, which this dispatch's own research found low-value
--                  for a 2-operator tool and deliberately out of scope; pivot later if a real
--                  need shows up for a specific sensitive panel.
-- Same append-only, admin-oversight-of-everyone (including admins/owners themselves) pattern as
-- identity_reveal_log/org_assignment_audit — no update/delete policy at all, by design.
create table if not exists public.app_access_log (
  id          uuid        not null default gen_random_uuid() primary key,
  tenant_id   uuid        not null default '00000000-0000-0000-0000-000000000001',
  actor_id    uuid        not null references auth.users(id),
  event_type  text        not null check (event_type in ('login', 'panel_view')),
  panel_id    text,                          -- null for 'login'; the panel id (e.g. 'security') for 'panel_view'
  created_at  timestamptz not null default now()
);

create index if not exists app_access_log_actor_idx on public.app_access_log (actor_id, created_at desc);
create index if not exists app_access_log_created_idx on public.app_access_log (created_at desc);

alter table public.app_access_log enable row level security;

-- Tenant isolation, matching the pattern used across every other operational table.
drop policy if exists "app_access_log: tenant" on public.app_access_log;
create policy "app_access_log: tenant" on public.app_access_log
  for all to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid)
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- Self-insert only — any authenticated user may write a row for THEMSELVES (so the client can
-- log its own login/panel-view events without a service-role key), never for anyone else.
drop policy if exists "app_access_log: self insert" on public.app_access_log;
create policy "app_access_log: self insert" on public.app_access_log
  as restrictive for insert to authenticated
  with check (actor_id = auth.uid());

-- Read gate (RESTRICTIVE, ANDed with the tenant policy above) — admin/owner only. Deliberately
-- tighter than payroll.view's ('admin','owner','do') precedent (schema-employee-pay-rate-
-- changes.sql): this log is oversight OF a DO's own logins/panel views too, not just something a
-- DO reviews for others, so DO is not included here. Same real, CURRENT role ids as every other
-- get_my_role()-based policy in this schema — see schema-employee-pay-rate-changes.sql's own
-- comment for why schema-identity-vault.sql's 3-role comment is stale and not what to copy.
drop policy if exists "app_access_log: role" on public.app_access_log;
create policy "app_access_log: role" on public.app_access_log
  as restrictive for select to authenticated
  using (get_my_role() in ('admin', 'owner'));

-- No update/delete policy at all — tamper-evident, same as identity_reveal_log/
-- org_assignment_audit. Retention is indefinite by the same reasoning those tables use (the
-- value is in cross-session/cross-user history); do not add a cleanup job or TTL without an
-- explicit owner decision.

comment on table public.app_access_log is
  'Append-only login + sensitive-panel-view log (owner request 2026-10-17). Admin/owner-read only; no update/delete policy exists at all, by design. Deliberately narrow scope — only SIGNED_IN auth events and the two Owner/Admin/DO-only panels, not blanket usage telemetry.';
