-- ── Coaching cycles (#208) ────────────────────────────────────────────────────
-- The fifth leg of the coaching loop (identify -> assign -> intervene -> measure -> VERIFY),
-- per memory/project-coaching-feedback-loop.md. Cloud-persisted with tenant_id + RLS, never
-- device-local (design doc §2 is explicit about this).
--
-- `metric` is one of engine/coaching-loop.js's COACHING_METRICS keys (labor_pct,
-- fob_total_pct, condiment_pct, raw_waste_pct, comp_waste_pct) — food cost and labor only,
-- per the issue's own scope discipline. `baseline`/`result` are ALWAYS auto-captured by the
-- app (engine/coaching-loop.js's snapshotMetricValue) — this table has no path for a typed
-- number, matching design-doc rule 1. `verdict` is null until engine/coaching-loop.js's
-- NOISE_THRESHOLDS has a real, measured entry for the metric (scripts/
-- measure-coaching-noise-threshold.mjs) — a null verdict on an old row is not a bug, it's the
-- v1 fallback the issue itself specifies ("ship the loop recording cycles WITHOUT verdicts
-- rather than with wrong ones").
create table if not exists public.coaching_cycles (
  id             uuid             not null default gen_random_uuid() primary key,
  loc            text             not null,      -- unpadded, matches STORE_NAMES keys
  metric         text             not null,
  baseline       double precision,                -- null only if no data existed at coaching time
  coached_at     date             not null,
  note           text             not null default '',
  review_at      date             not null,        -- coached_at + 30 days (engine/coaching-loop.js REVIEW_WINDOW_DAYS)
  result         double precision,                -- null until the follow-up is recorded
  verdict        text,                             -- improved | worse | no change | null
  tenant_id      uuid             not null default '00000000-0000-0000-0000-000000000001',
  created_by     uuid,
  created_at     timestamptz      not null default now(),
  updated_at     timestamptz      not null default now()
);

-- Needs Attention's "review due" scan filters on this shape every load — result IS NULL, ordered
-- by review_at. Partial index keeps it cheap as the table grows past the (small) live set.
create index if not exists coaching_cycles_due_idx on public.coaching_cycles (review_at) where result is null;
create index if not exists coaching_cycles_loc_idx on public.coaching_cycles (loc, coached_at desc);

alter table public.coaching_cycles enable row level security;

-- Tenant isolation, matching the pattern used across the other operational tables.
drop policy if exists coaching_cycles_tenant on public.coaching_cycles;
create policy coaching_cycles_tenant on public.coaching_cycles
  for all to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid)
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- Per-location restriction, ANDed with the tenant policy above (RESTRICTIVE). Mirrors
-- supabase/schema-rls-phase2-loc.sql and schema-inv-count-sessions.sql.
drop policy if exists coaching_cycles_loc on public.coaching_cycles;
create policy coaching_cycles_loc on public.coaching_cycles
  as restrictive for all to authenticated
  using ( (select public.my_locs()) is null
          or ltrim(loc, '0') in (select unnest((select public.my_locs()))) );

comment on table public.coaching_cycles is
  'Coaching feedback loop (#208) — one row per coaching intervention: store, specific metric, auto-captured baseline, coached date, note, auto-set review date (+30d), and a MEASURED result/verdict once the follow-up window closes. verdict stays null until engine/coaching-loop.js has a real, measured noise threshold for that metric.';
