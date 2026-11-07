-- ── Fix lifelenz_payroll_readiness's real grain (task #85) ──────────────────────────────────
-- Confirmed live (memory/finding-lifelenz-payroll-readiness-pk-mismatch-2026-11-04.md, "RESOLVED"
-- section): this table's original primary key, (loc, geid, pay_period_start), is NOT the real
-- report's unique key. A live GetReportMeta(payroll_readiness_report) call plus a real
-- GetReportDataCsvAsync pull (Freeport, 2026-10-16->11-05, 879 real rows) proved the report's
-- true grain is one row per (employee, payroll entry/shift), not one row per (employee, pay
-- period): grouping by (geid, pay_period_start) produced 122 keys for 879 rows (118 collided,
-- covering 99.5% of rows); grouping by (geid, entry_id) produced zero collisions, 879 distinct
-- values for 879 rows. In production, every store's pull was discarding 86-99% of real shifts
-- to last-write-wins dedup before this fix.
--
-- `payroll_entry_id` (GetReportMeta member `payroll_entry_id`, CSV label "Entry Id") was already
-- landing in every pulled row's `raw` JSONB (it was never in PROMOTED_MEMBERS before this fix,
-- so the dynamic-discovery fallback already captured it) -- this migration promotes it to a real
-- column and re-keys the table on it. Run this ONCE against the existing production table (it
-- already has data under the old PK); scripts/lifelenz-payroll-readiness-pull.mjs's own
-- create-table script (schema-lifelenz-payroll-readiness.sql) is updated in the same commit so a
-- FRESH install gets the right schema from the start -- this file is only for a database that
-- already ran the old version.
--
-- Safe to run top-to-bottom. NOT idempotent on the column backfill step (existing rows have no
-- payroll_entry_id value to backfill from -- it was never promoted before now) -- those existing
-- rows will have payroll_entry_id = NULL. That is expected and acceptable: this table has already
-- been discarding 86-99% of real rows under the old PK, so its pre-fix data was never a complete
-- record to begin with. The next scheduled pull (scripts/lifelenz-payroll-readiness-pull.mjs,
-- updated in this same commit) will upsert real payroll_entry_id values and overwrite/add the
-- rows this table was always missing.

alter table public.lifelenz_payroll_readiness
  add column if not exists payroll_entry_id text;

-- Drop the old primary key (it named a conflict target that is no longer this report's real
-- unique key) and add the new one. A table cannot have two primary keys, so this must run as a
-- single transaction block -- Supabase's SQL editor runs the whole pasted script as one implicit
-- transaction, so no explicit BEGIN/COMMIT is needed here (matches every other schema-fix-*.sql
-- in this repo).
alter table public.lifelenz_payroll_readiness
  drop constraint if exists lifelenz_payroll_readiness_pkey;

-- NULL payroll_entry_id values (the pre-fix rows, see header) cannot sit under a primary key --
-- a primary key column is implicitly NOT NULL. Delete them rather than leave the table in a
-- broken half-migrated state: they are exactly the known-incomplete last-write-wins rows the
-- header above already says were never a trustworthy record, and the next pull re-populates
-- real rows with real payroll_entry_id values within one scheduled run.
delete from public.lifelenz_payroll_readiness where payroll_entry_id is null;

alter table public.lifelenz_payroll_readiness
  add constraint lifelenz_payroll_readiness_pkey primary key (loc, payroll_entry_id);

comment on column public.lifelenz_payroll_readiness.payroll_entry_id is
  'The report''s real per-row unique identifier (GetReportMeta member payroll_entry_id, CSV label "Entry Id") -- one payroll entry/shift, not one pay period. This, not (geid,pay_period_start), is the table''s real primary key as of 2026-11-07; see memory/finding-lifelenz-payroll-readiness-pk-mismatch-2026-11-04.md.';
