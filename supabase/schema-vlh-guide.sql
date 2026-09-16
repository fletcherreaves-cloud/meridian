-- ═══════════════════════════════════════════════════════════════════════════════
-- vlh_guide_hours — the 2022 VLH Workbook's Drive Thru + In-Store labor-hours
-- tables, parsed from the two source PDFs in docs/ (Task #56, "VLH needed-hours
-- calc"). Lets src/engine/vlh-guide.js compute a REAL guide-based needed-hours
-- number from DAR guest counts + a store's store_vlh_config selection, instead of
-- only trusting QSRSoft's total_needed_hours as an unverified proxy (the caveat
-- memory/analysis-labor-allocation-2026-08-18.md always carried: "assumed to be
-- the VLH guide value... not confirmed against the workbook tables").
--
-- SCOPE: only 'drive_thru' and 'in_store' positions. The workbook also has Order
-- Takers/Assemblers/Curbside/Table Service/BDAP/McCafe/Hash Browns & Fries/
-- Sandwiches tables, but their guest-count DRIVER isn't stated in the PDF text
-- itself (unlike Drive Thru <-> dt_transactions and In-Store <-> is_transactions,
-- which are a 1:1 name match to DAR's own fields) -- wiring those without a
-- confirmed driver risks shipping wrong labor guidance. The source PDFs
-- (docs/2022_VLH_Workbook_*.pdf) hold that data if a future dispatch confirms the
-- mapping. See memory/finding-vlh-guide-tables-2026-09-16.md.
--
-- REFERENCE DATA, not tenant-scoped: this is McDonald's-issued guest-count ->
-- labor-hours guidance, identical for every tenant using this table (same shape
-- as qsrsoft_kb's public-read reference table, not store_vlh_config's per-store
-- business data). No loc column, no per-tenant restrictive policy.
--
-- Seeded via scripts/seed-vlh-guide.mjs from scripts/data/vlh-guide-2022-seed.json
-- (the parsed output -- see that script's header for how it was extracted).
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists public.vlh_guide_hours (
  id           bigint      generated always as identity primary key,
  guide        text        not null,  -- 'standard' | 'hpg' (High Productivity)
  aot          boolean     not null,  -- Automated Order Taking
  dt_type      text        not null,  -- 'side_tandem'|'single_2booth'|'single_1booth'|'no_dt' -- describes the CONFIG, not this row's own position (an in_store row on a no_dt config still carries dt_type='no_dt')
  in_store     text        not null,  -- 'self_serve' | 'crew_pour'
  kitchen      text        not null,  -- 'fryer_same' | 'fryer_opp' | 'opl' | 'copl'
  position     text        not null,  -- 'drive_thru' | 'in_store'
  daypart      text        not null,  -- 'breakfast'|'lunch'|'afternoon'|'dinner'|'late_night'
  ipo          numeric,               -- items per order for this daypart (informational, guide-invariant)
  tier         integer     not null,  -- labor HOURS needed when guest count falls in [guest_start, guest_end]
  guest_start  integer     not null,
  guest_end    integer     not null   -- 9999 = uncapped top tier
);

create index if not exists vlh_guide_hours_lookup_idx
  on public.vlh_guide_hours (guide, aot, dt_type, in_store, kitchen, position, daypart, guest_start);

-- Natural key so scripts/seed-vlh-guide.mjs's upsert is idempotent (re-running the seed
-- after a workbook update replaces rows in place instead of duplicating them).
create unique index if not exists vlh_guide_hours_natural_key
  on public.vlh_guide_hours (guide, aot, dt_type, in_store, kitchen, position, daypart, tier);

alter table public.vlh_guide_hours enable row level security;

-- Read-only reference table -- every authenticated user can read, nobody writes from
-- the client (seeded server-side via the service-role key, matching qsrsoft_kb).
drop policy if exists vlh_guide_hours_read on public.vlh_guide_hours;
create policy vlh_guide_hours_read on public.vlh_guide_hours
  for select to authenticated
  using (true);

comment on table public.vlh_guide_hours is
  'The 2022 VLH Workbook''s Drive Thru + In-Store guest-count -> labor-hours breakpoint tables, parsed from docs/2022_VLH_Workbook_*.pdf. Reference data (not tenant-scoped). Read by src/engine/vlh-guide.js. Seeded via scripts/seed-vlh-guide.mjs.';
