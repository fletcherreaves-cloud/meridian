-- Egress Phase 2 pilot #1 (2026-11-21) — owner-approved DDL ("Go ahead with both — add the DDL
-- and build pilot #1"). Already run live via the Supabase Management API (not psql/DATABASE_URL
-- — no direct Postgres connection exists in this agent environment, but SUPABASE_ACCESS_TOKEN +
-- SUPABASE_PROJECT_REF do, and its /database/query endpoint executes arbitrary SQL). This file is
-- the durable record, not a pending migration to run.
--
-- Why these two tables and no others: memory/plan-egress-reduction-2026-11-20.md Section 13's
-- audit found 45/56 of App.js's eager-loaded tables already have a reliable, write-time-bumped
-- timestamp column; 3 more are genuinely insert-only (created_at alone is safe). custom_signals
-- and staff_assignments are the only two with real `.update()` call sites (editing a saved
-- signal's latest_r/latest_n/history; flipping a staff assignment's is_primary flag) and NO
-- column that moves when a row changes.
--
-- Both ALTERs are the safest possible shape: nullable-with-default, additive-only, no existing
-- reader or writer needs to change for the column to simply exist. The backfill sets every
-- EXISTING row's updated_at to its created_at (not left null) — a watermark delta-sync reading
-- `updated_at > since` needs a real value to compare against on day one, not a gap that would
-- make every pre-existing row either invisible to or always-returned-by the very first sync.

alter table public.custom_signals    add column if not exists updated_at timestamptz default now();
alter table public.staff_assignments add column if not exists updated_at timestamptz default now();

update public.custom_signals    set updated_at = created_at where updated_at is null and created_at is not null;
update public.staff_assignments set updated_at = created_at where updated_at is null and created_at is not null;

-- No trigger added. This schema has zero updated_at-bumping triggers anywhere (grepped every
-- supabase/*.sql file — confirmed in the same Section 13 audit), and the established convention
-- throughout this codebase is for the WRITING CODE to explicitly set the column on every write,
-- not a DB-level default/trigger (every other verified-safe watermark column — lifelenz_schedule,
-- forecast_commits, forecast_week_cache — works this way). src/lib/supabase.js's
-- updateCustomSignal/appendCustomSignalHistory/setPrimaryStaffAssignment were updated in the same
-- commit as this file to set `updated_at: new Date().toISOString()` on every write, matching that
-- convention rather than introducing a one-off trigger-based exception.

-- Verified live (service-role query via the Management API, 2026-11-21): both columns exist as
-- `timestamptz default now()`, and every existing row in both tables (19/19 custom_signals,
-- 10/10 staff_assignments at the time of this run) now has a non-null updated_at from the
-- backfill above.
