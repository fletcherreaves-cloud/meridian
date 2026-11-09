-- ── security_finding_actions — case-tracking audit trail (dispatch 2026-11-09) ──────────────────
-- memory/design-security-events-risk-rules-2026-11-09.md's own "Phase 2" list named this the
-- highest-value follow-on: today a flagged finding is read-only -- nothing records whether anyone
-- ever looked at it, let alone what they decided. This table is that record.
--
-- Append-only, same discipline identity_reveal_log already established for this panel (schema-
-- security-findings.sql's own comment: "writes are backend-only... append-only"). A correction is
-- a NEW row, never an edit of an old one -- no update/delete policy for any role, matching that
-- precedent exactly. Unlike identity_reveal_log (service-role only), these writes come from the
-- BROWSER -- a GM clicking "mark investigated" -- so the INSERT policy is real, gated to the
-- EXACT SAME tier security_findings' own SELECT policy enforces (mirrored verbatim from
-- schema-security-gm-role-fix-2026-10-28.sql's "security_findings: gated read", the current,
-- measured-correct predicate -- not the original schema-security-findings.sql text, which earlier
-- fixes have already superseded).
--
-- finding_id references security_findings.id directly (already selected/mapped by
-- src/lib/supabase.js's loadSecurityFindings() as `id` -- confirmed by reading that loader before
-- writing this, not assumed) -- one action attaches to one specific (rule, subject, window)
-- finding row, never to a subject in the abstract.

create table if not exists public.security_finding_actions (
  id              uuid        not null default gen_random_uuid() primary key,
  tenant_id       uuid        not null default '00000000-0000-0000-0000-000000000001',
  finding_id      uuid        not null references public.security_findings(id) on delete cascade,
  action          text        not null check (action in ('investigated_cleared', 'escalated', 'noted')),
  note            text,
  created_by      uuid        references public.profiles(id),
  created_by_role text,
  created_at      timestamptz not null default now()
);

create index if not exists security_finding_actions_finding_idx
  on public.security_finding_actions (finding_id, created_at desc);

alter table public.security_finding_actions enable row level security;

-- Gated read: identical predicate to security_findings' own current policy (admin/owner/
-- area_supervisor always; manager/gm only when org_config.gm_identity_reveal_enabled). A reader
-- who cannot see the finding itself must not be able to see that an action was logged on it.
drop policy if exists "security_finding_actions: gated select" on public.security_finding_actions;
create policy "security_finding_actions: gated select" on public.security_finding_actions
  for select using (
    tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
    and (
      (select get_my_role()) in ('admin', 'owner', 'area_supervisor')
      or (
        (select get_my_role()) in ('manager', 'gm')
        and coalesce((select (data->>'enabled')::boolean from public.org_config where key = 'gm_identity_reveal_enabled'), false)
      )
    )
  );

-- Gated insert: same tier, plus created_by must be the caller's own auth.uid() -- nobody can log
-- an action as someone else. No update/delete policy for any role: a mistaken action is corrected
-- by adding a new row (e.g. a 'noted' row explaining the correction), never by editing history.
drop policy if exists "security_finding_actions: gated insert" on public.security_finding_actions;
create policy "security_finding_actions: gated insert" on public.security_finding_actions
  for insert with check (
    tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
    and created_by = auth.uid()
    and (
      (select get_my_role()) in ('admin', 'owner', 'area_supervisor')
      or (
        (select get_my_role()) in ('manager', 'gm')
        and coalesce((select (data->>'enabled')::boolean from public.org_config where key = 'gm_identity_reveal_enabled'), false)
      )
    )
  );

comment on table public.security_finding_actions is
  'Case-tracking audit trail for security_findings -- investigated/escalated/noted, append-only, written from the browser under RLS. Read/write gated to the exact tier security_findings itself uses. See memory/design-security-events-risk-rules-2026-11-09.md.';
