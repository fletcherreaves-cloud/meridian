-- ── Spot-Check Ruler notes (task #129) ──────────────────────────────────────
-- memory/plan-count-cycle-surfaces-and-spotcheck-ruler-2026-11-08.md §B, "proposed shape":
-- "A field for the DO/supervisor's own notes from the actual conversation (what the GM said for
-- Q4/Q5), loggable." This is that log: one row per (store, count period, period type), upserted
-- as the conversation happens and reopened later from the standing report surface.
--
-- One row per worksheet, not per question — the two qualitative questions (Q4 "how confident are
-- you", Q5 "what did you learn from your reports") plus a free-text notes field are all a DO
-- fills in from the SAME conversation, so they are one upsert, not four.
--
-- This also doubles as the durable record that the conversation actually happened, for a future
-- Recommendation Ledger / Huddle "Memory" tie-in (same spirit as inv_count_sessions' own history —
-- see that table's header) — not wired to the Ledger in this pass, just structured so it can be.
--
-- ⚠️ Run this once in the Supabase SQL editor. Idempotent (create if not exists). This session has
-- no DDL execution path -- the owner runs this.

create table if not exists public.spot_check_ruler_notes (
  loc                   text        not null,   -- NSN, zero-padded to 7 to match every other table
  period                text        not null,    -- 'YYYY-MM' for an EOM worksheet, 'wk:YYYY-MM-DD' for weekly (same convention count-cycle-panel.js's createWeeklyShare already uses)
  period_type           text        not null,    -- 'weekly' | 'eom'
  count_date            date,                    -- the physical count date the worksheet was built against
  confidence_answer     text,                    -- Q4 — "how confident are you in your counts?"
  reports_reviewed_answer text,                  -- Q5 — "did you look at your reports? what did you learn?"
  notes                 text,                    -- free-text DO/supervisor notes from the actual conversation
  flagged               boolean,                 -- snapshot of counterfactual.flagged at the time this was logged
  swing_pts             numeric,                 -- snapshot of counterfactual.swingPts at the time this was logged
  created_by            uuid,
  tenant_id             uuid        not null default '00000000-0000-0000-0000-000000000001',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  primary key (loc, period, period_type)
);

create index if not exists spot_check_ruler_notes_period_idx on public.spot_check_ruler_notes (period desc);

alter table public.spot_check_ruler_notes enable row level security;

-- Tenant isolation, matching the pattern used across the other operational tables.
drop policy if exists spot_check_ruler_notes_tenant on public.spot_check_ruler_notes;
create policy spot_check_ruler_notes_tenant on public.spot_check_ruler_notes
  for all to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid)
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- Per-location restriction, ANDed with the tenant policy above (RESTRICTIVE), so a user only ever
-- sees/writes notes for stores in their accessible_locs. my_locs() returns NULL for unrestricted
-- users. Mirrors supabase/schema-inv-count-sessions.sql.
drop policy if exists spot_check_ruler_notes_loc on public.spot_check_ruler_notes;
create policy spot_check_ruler_notes_loc on public.spot_check_ruler_notes
  as restrictive for all to authenticated
  using ( (select public.my_locs()) is null
          or ltrim(loc, '0') in (select unnest((select public.my_locs()))) );

comment on table public.spot_check_ruler_notes is
  'DO/supervisor conversation notes for one Spot-Check Ruler worksheet (store + count period + period type) — task #129. The app degrades gracefully (PGRST205 pattern) if this table does not exist yet.';
