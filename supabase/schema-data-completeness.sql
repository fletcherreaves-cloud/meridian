-- ── Data completeness ledger (#265) ───────────────────────────────────────────────────────
-- #263 (pull failure detection) only catches a pull that KNOWS it failed. It cannot catch
-- Sulphur's 8-day service-stats outage or Marietta's single-day upstream hole — both pulls
-- reported success, because QSRSoft itself had no row to return and no error to throw. This
-- table is the other half: a SCHEDULED expected-vs-actual comparison (see
-- scripts/check-data-completeness.mjs) that counts rows per (store, day) against what should
-- exist, independent of whether any pull ever complained.
--
-- Cloud-persisted with tenant_id + RLS, matching schema-coaching-cycles.sql's pattern (the
-- newest convention in this repo, not the tenant_id-less older tables like org_events).
--
-- classification: what KIND of gap this is, decided by scripts/check-data-completeness.mjs's
--   known-legitimate-cases table (informed by memory/store-events-material-changes.md) or left
--   'unclassified' for a human to review.
--   'legitimate'   — a real closure/reduced-hours/pre-opening window, not a data problem
--   'outage'       — a genuine pull or upstream failure; recovery is meaningful here
--   'unclassified' — not yet reviewed; the default for anything not matching a known pattern
--
-- cause: the more specific reason, once known. Free-growing but constrained to a starting
--   enum so the ranking/reporting query can group by it without full-text matching.
--   'holiday_closure' | 'weather' | 'store_opening' | 'store_relocation' | 'reduced_hours' |
--   'upstream_provider_hole' | 'pull_failure' | 'unknown'
--
-- recovery_status: 'open' (still missing) | 'backfilled' (later recovered) |
--   'unrecoverable' (QSRSoft itself never had it) | 'not_applicable' (legitimate, no repair
--   needed). Ranking is by UNRECOVERED DAYS (days since detected while still 'open'), not by
--   how many days the gap itself spans -- a 1-day gap open for 200 days is a bigger problem
--   than a 30-day gap fixed yesterday, and outage LENGTH alone hides that.
--
-- notes: RESTRICTED per the SAGE knowledge-grounding handling-notice convention
--   (memory/project-sage-knowledge-grounding.md) -- this field can carry accountability
--   content (e.g. "GM says the timer system was unplugged," a specific person's account of
--   why data is missing). Any UI/SAGE surface that displays this column must prepend the
--   same mandatory handling notice that restricted disclosures already carry elsewhere, and
--   gate on role the same way. NOT YET WIRED to a UI panel or SAGE tool -- the schema and the
--   detection script are this issue's scope; a review panel is a natural next slice, deferred
--   rather than half-built here.
create table if not exists public.data_completeness_incidents (
  id                 uuid             not null default gen_random_uuid() primary key,
  loc                text             not null,       -- unpadded, matches STORE_NAMES keys
  stream             text             not null,        -- e.g. 'qsr_service_stats', 'qsr_daily_activity'
  date_start         date             not null,
  date_end           date             not null,
  classification     text             not null default 'unclassified'
                       check (classification in ('legitimate','outage','unclassified')),
  cause              text             not null default 'unknown'
                       check (cause in ('holiday_closure','weather','store_opening',
                         'store_relocation','reduced_hours','upstream_provider_hole',
                         'pull_failure','unknown')),
  recovery_status    text             not null default 'open'
                       check (recovery_status in ('open','backfilled','unrecoverable','not_applicable')),
  detected_at        timestamptz      not null default now(),
  repair_requested_at timestamptz,
  recovered_at       timestamptz,
  notes              text,                              -- see RESTRICTED note above
  tenant_id          uuid             not null default '00000000-0000-0000-0000-000000000001',
  created_at         timestamptz      not null default now(),
  updated_at         timestamptz      not null default now(),
  unique (tenant_id, loc, stream, date_start)
);

-- The dashboard question is always "what's open and stale," not "everything ever seen" --
-- partial index keeps that cheap as the ledger accumulates resolved/legitimate history.
create index if not exists data_completeness_open_idx
  on public.data_completeness_incidents (detected_at)
  where recovery_status = 'open' and classification != 'legitimate';
create index if not exists data_completeness_loc_stream_idx
  on public.data_completeness_incidents (loc, stream, date_start desc);

alter table public.data_completeness_incidents enable row level security;

drop policy if exists data_completeness_incidents_tenant on public.data_completeness_incidents;
create policy data_completeness_incidents_tenant on public.data_completeness_incidents
  for all to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid)
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- Per-location restriction, ANDed with the tenant policy above (RESTRICTIVE), matching
-- schema-coaching-cycles.sql and schema-inv-count-sessions.sql.
drop policy if exists data_completeness_incidents_loc on public.data_completeness_incidents;
create policy data_completeness_incidents_loc on public.data_completeness_incidents
  as restrictive for all to authenticated
  using ( (select public.my_locs()) is null
          or ltrim(loc, '0') in (select unnest((select public.my_locs()))) );

comment on table public.data_completeness_incidents is
  'Data completeness ledger (#265) -- scheduled expected-vs-actual gaps per (store, stream, date range), independent of whether the pull that should have written the data ever reported failure. Catches upstream/silent holes #263''s exit-code fix cannot see. Ranked by unrecovered days, not outage length. notes column is RESTRICTED -- see table-level comment in schema-data-completeness.sql for the handling-notice requirement before this is ever surfaced in a UI or SAGE tool.';
