-- ── Coaching cycle notes — progress log (owner, live, 2026-10-14) ──────────────────────────────
-- "why don't we include an area in the panel to check on progress of any and all open coaching
-- issues. To see what is happening and be able to append new notes to it with time stamped and
-- date stamped entries and by whom."
--
-- coaching_cycles.note (schema-coaching-cycles.sql) is a single field set once at startCoachingCycle()
-- and never touched again -- there was no way to record what happened DURING the 30-day review
-- window (a follow-up conversation, a observed change, a reason the coaching needed to be
-- repeated) without overwriting the original note. This is a SEPARATE append-only table, not a
-- column on coaching_cycles, so: (1) every entry is immutable and individually timestamped/
-- attributed, matching the audit-log pattern this repo already uses for exactly this shape
-- (org_assignment_audit, identity_reveal_log) rather than a read-modify-write array column that
-- would risk losing a concurrent append, and (2) the original coached_at/baseline/note on
-- coaching_cycles itself stays untouched -- this is progress tracking ON TOP of a cycle, not a
-- replacement for its own start record.
create table if not exists public.coaching_cycle_notes (
  id          uuid        not null default gen_random_uuid() primary key,
  cycle_id    uuid        not null references public.coaching_cycles(id) on delete cascade,
  loc         text        not null,      -- unpadded, denormalized from the parent cycle for RLS
  note        text        not null,
  author      text,                      -- auth.users email at write time, same convention
                                          -- NeedsYouTodayTile's dismiss()/AttentionPanel's ackItem() use
  tenant_id   uuid        not null default '00000000-0000-0000-0000-000000000001',
  created_at  timestamptz not null default now()
);

create index if not exists coaching_cycle_notes_cycle_idx on public.coaching_cycle_notes (cycle_id, created_at);
create index if not exists coaching_cycle_notes_loc_idx on public.coaching_cycle_notes (loc, created_at desc);

alter table public.coaching_cycle_notes enable row level security;

-- Same tenant + per-location RLS shape as the parent coaching_cycles table.
drop policy if exists coaching_cycle_notes_tenant on public.coaching_cycle_notes;
create policy coaching_cycle_notes_tenant on public.coaching_cycle_notes
  for all to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid)
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

drop policy if exists coaching_cycle_notes_loc on public.coaching_cycle_notes;
create policy coaching_cycle_notes_loc on public.coaching_cycle_notes
  as restrictive for all to authenticated
  using ( (select public.my_locs()) is null
          or ltrim(loc, '0') in (select unnest((select public.my_locs()))) )
  with check ( (select public.my_locs()) is null
          or ltrim(loc, '0') in (select unnest((select public.my_locs()))) );

comment on table public.coaching_cycle_notes is
  'Append-only progress log for an open coaching cycle (owner request 2026-10-14) -- each entry is a timestamped, attributed note appended DURING the 30-day review window, separate from coaching_cycles.note (the original one-time start note). Never updated or edited, only inserted -- the history is the record.';
