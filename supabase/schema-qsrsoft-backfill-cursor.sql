-- ── QSRSoft 7-year backfill cursor ─────────────────────────────────────────────
-- Owner, live, 2026-10-15: "QSRSoft retains data only for 7 years on a rolling cycle. Every day
-- drops a day... I will eventually want to backfill all stores data for that period. Set it up
-- whenever convenient and meter the data in." Tracks per-report-type progress for
-- scripts/qsrsoft-backfill-driver.mjs — one row per report type ('ebos' | 'dar' | 'ops'),
-- advanced by ~90 days per scheduled run, so a long-running campaign can resume exactly where
-- it left off across many separate workflow invocations without anyone babysitting it.
--
-- Internal automation bookkeeping only — never read or written by the app itself (RLS below is
-- enabled with ZERO policies, which blocks `anon`/`authenticated` entirely; the backfill driver
-- always connects with the service-role key, which bypasses RLS, same as every other scripts/
-- pull script's Supabase access).
create table if not exists public.qsrsoft_backfill_cursor (
  report_type           text        not null primary key,  -- 'ebos' | 'dar' | 'ops'
  earliest_date_pulled   date,                               -- oldest date successfully backfilled so far; null until first bootstrap
  done                    boolean     not null default false, -- true once earliest_date_pulled has reached the rolling 7-year floor
  last_chunk_start        date,
  last_chunk_end           date,
  last_status              text,                               -- 'ok' | 'error'
  last_error                text,
  last_run_at               timestamptz,
  updated_at                 timestamptz not null default now()
);

alter table public.qsrsoft_backfill_cursor enable row level security;
-- Deliberately no policies — default-deny for anon/authenticated. Service-role writes (the only
-- writer, scripts/qsrsoft-backfill-driver.mjs) bypass RLS entirely, same as every other scripts/
-- pull script's Supabase access.

comment on table public.qsrsoft_backfill_cursor is
  'Per-report-type progress cursor for the QSRSoft historical backfill (scripts/qsrsoft-backfill-driver.mjs, owner request 2026-10-15). earliest_date_pulled walks backward ~90 days per scheduled run until it either finds the real floor (consecutive_empty_chunks reaches the driver''s threshold) or hits the YEARS_BACK safety ceiling, at which point done flips true. Internal automation bookkeeping, never read by the app.';

-- Added 2026-10-17 — a live >7-year retention probe (owner request) disproved this table's own
-- header comment above ("today-minus-7-years" as a real data floor): real DAR/OPS data came
-- back for 2019-09 (>7 years old as of the probe date), while 2018-02 came back confirmed
-- empty. scripts/qsrsoft-backfill-driver.mjs no longer trusts a fixed 7-year calendar target to
-- know where to stop — it now tracks how many CONSECUTIVE chunks in a row came back confirmed-
-- empty (zero rows, zero per-unit errors) and marks done once that streak crosses its own
-- threshold, which is the real per-report-type floor, not an assumed one. See
-- memory/finding-qsrsoft-retention-2026-10-17.md for the measured findings.
alter table public.qsrsoft_backfill_cursor
  add column if not exists consecutive_empty_chunks integer not null default 0;
