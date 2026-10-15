-- ── LifeLenz per-shift pay data (owner request 2026-10-15, pay-rate history) ───────────────────
-- earnings/seconds per shift, already fetched by scripts/lifelenz-pull.mjs's SHIFTS_QUERY and
-- consumed by src/engine/lifelenz-shift-jobs.js's cost-rollup functions, but never persisted at
-- the per-shift grain -- see shiftsForEmployeeSchedule's own header for the full story.
--
-- DELIBERATELY A SEPARATE TABLE from lifelenz_shift_assignments, not two more columns on it:
-- Postgres RLS restricts ROWS, not columns. lifelenz_shift_assignments' existing RLS is
-- intentionally broad (tenant+loc only, dispatch #125: "there is no reason to hide names for
-- scheduling and punch times") because employee NAME and SCHEDULE were judged safe to show
-- broadly. Pay data was never covered by that decision and is a different sensitivity tier
-- (owner, 2026-10-15: pay-rate history should be Owner/Admin/DO only) -- a role-gated RLS
-- policy on THIS table keeps that restriction without touching lifelenz_shift_assignments'
-- existing, intentionally broad visibility at all.
--
-- Joined to lifelenz_shift_assignments by (loc, shift_id) -- the same conflict key, so every
-- shift-pay row has exactly one matching schedule row (or none yet, if the pay-rate-history
-- feature's own pull step failed independently -- best-effort, never blocks the schedule save).
create table if not exists public.lifelenz_shift_pay (
  loc         text             not null,
  shift_id    text             not null,
  earnings    double precision not null default 0,
  seconds     integer          not null default 0,
  tenant_id   uuid             not null default '00000000-0000-0000-0000-000000000001',
  updated_at  timestamptz      not null default now(),
  primary key (loc, shift_id)
);

create index if not exists lifelenz_shift_pay_loc_idx on public.lifelenz_shift_pay (loc, updated_at desc);

alter table public.lifelenz_shift_pay enable row level security;

-- Tenant isolation, matching the pattern used across every other operational table.
drop policy if exists "lifelenz_shift_pay: tenant" on public.lifelenz_shift_pay;
create policy "lifelenz_shift_pay: tenant" on public.lifelenz_shift_pay
  for all to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid)
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- Role gate (RESTRICTIVE, ANDed with the tenant policy above) -- the actual enforcement
-- boundary for "wage data is Owner/Admin/DO only" (owner decision, 2026-10-15). Mirrors
-- schema-identity-vault.sql's established get_my_role()-based pattern for sensitive data, with
-- the CURRENT (not that file's stale comment) role ids per schema.sql's live CHECK constraint:
-- 'admin' | 'owner' | 'vp' | 'do' | 'om' | 'area_supervisor' | 'gm' | 'sm_am_dm' | 'manager'.
drop policy if exists "lifelenz_shift_pay: role" on public.lifelenz_shift_pay;
create policy "lifelenz_shift_pay: role" on public.lifelenz_shift_pay
  as restrictive for select to authenticated
  using (get_my_role() in ('admin', 'owner', 'do'));

-- Per-location restriction for 'do' (district-scoped) -- 'admin'/'owner' are level-1 and bypass
-- every permission check per src/engine/permissions.js, but RLS has no concept of "level," so
-- this mirrors that bypass explicitly: my_locs() reads NULL for an unrestricted profile
-- (the only kind that has ever existed in production, per CLAUDE.md) and a real location list
-- for a scoped one, same as every other loc-scoped RESTRICTIVE policy in this schema.
drop policy if exists "lifelenz_shift_pay: loc" on public.lifelenz_shift_pay;
create policy "lifelenz_shift_pay: loc" on public.lifelenz_shift_pay
  as restrictive for select to authenticated
  using ( (select public.my_locs()) is null
          or ltrim(loc, '0') in (select unnest((select public.my_locs()))) );

comment on table public.lifelenz_shift_pay is
  'Per-shift earnings/seconds, keyed (loc, shift_id) to lifelenz_shift_assignments -- a SEPARATE table so its role-gated RLS (Owner/Admin/DO only, owner decision 2026-10-15) never touches that table''s existing, intentionally broad visibility. Written only by scripts/lifelenz-pull.mjs''s service-role key.';
