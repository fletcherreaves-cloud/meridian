-- ── Pay events (raises / review-cycle pay increases) ──────────────────────────
-- Owner, live, 2026-10-15: "We need to have ability to add review cycle dates and effective
-- dates for any pay increases earned by employees... tied to Labor & Scheduling tab in store
-- tiles in district view to notate for reason for average rate of pay jumping... if you can
-- run analysis in a report I can pull that shows impact of those raises to labor and
-- profitability." Cloud-persisted with tenant_id + RLS, never device-local, same discipline as
-- every other operational log in this app.
--
-- STORE-level, not per-employee -- Meridian has no per-employee hourly-crew roster pulled at
-- all (PII rules bar pulling employeeRoster broadly, CLAUDE.md's standing PII rules), and the
-- one per-person roster that IS pulled (qsr_employee_tenure) only covers review-eligible
-- management, not hourly crew. `employee_label` is a free-text note of who/what drove the
-- raise ("new crew minimum," "Jane D. review raise") for human context, not a foreign key to a
-- person entity that doesn't exist yet.
--
-- `effective_date` is the one date every computation in engine/pay-events.js anchors to
-- (payRaiseImpact's before/after windows, detectAropJumps' "already explained" check).
-- `review_date` is optional and purely informational -- the performance-review date that
-- prompted the raise, kept for the owner's own record, not read by any engine logic.
create table if not exists public.pay_events (
  id              uuid             not null default gen_random_uuid() primary key,
  loc             text             not null,      -- unpadded, matches STORE_NAMES keys
  raise_type      text             not null default 'other',
  amount_per_hour double precision,                -- null if the owner only knows "a raise happened," not the $ amount
  employee_label  text             not null default '',
  review_date     date,                             -- optional -- the review that prompted it, informational only
  effective_date  date             not null,        -- the date every before/after computation anchors to
  note            text             not null default '',
  tenant_id       uuid             not null default '00000000-0000-0000-0000-000000000001',
  created_by      uuid,
  created_at      timestamptz      not null default now()
);

-- detectAropJumps()'s "already explained" scan and the Pay Events report both filter/sort by
-- (loc, effective_date) -- same per-location-recency shape coaching_cycles_loc_idx uses.
create index if not exists pay_events_loc_idx on public.pay_events (loc, effective_date desc);

alter table public.pay_events enable row level security;

drop policy if exists pay_events_tenant on public.pay_events;
create policy pay_events_tenant on public.pay_events
  for all to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid)
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- Per-location restriction, ANDed with the tenant policy above (RESTRICTIVE). Mirrors
-- schema-coaching-cycles.sql / schema-rls-phase2-loc.sql.
drop policy if exists pay_events_loc on public.pay_events;
create policy pay_events_loc on public.pay_events
  as restrictive for all to authenticated
  using ( (select public.my_locs()) is null
          or ltrim(loc, '0') in (select unnest((select public.my_locs()))) )
  with check ( (select public.my_locs()) is null
          or ltrim(loc, '0') in (select unnest((select public.my_locs()))) );

comment on table public.pay_events is
  'One row per logged pay raise / review-cycle increase at a store (owner request 2026-10-15) -- effective_date anchors engine/pay-events.js''s before/after impact computation and its "already explained" check against detectAropJumps(). Store-level, not per-employee -- see this file''s header for why.';
