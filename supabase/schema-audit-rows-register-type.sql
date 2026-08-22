-- ── audit_rows — register_type column + PK migration (dispatch #59) ────────────────────────────
-- The Register Audit offers Cashier · Manager · Preparer; qsrsoft-register-audit-pull.mjs
-- hardcoded 'cashier', so audit_rows held one third of it. This is the storage half of
-- collecting all three, per memory/dispatch-59.md.
--
-- 🔴 This is a GRAIN CHANGE on a LIVE, POPULATED table, not an additive column. One employee can
-- work a Cashier drawer and a Manager drawer on the SAME day; the PK was (loc, date, emp), so the
-- second row silently overwrote the first -- not an error, just a lost row. The PK becomes
-- (loc, date, emp, register_type).
--
-- Backfill is the column DEFAULT, not a data migration step: every existing row predates this
-- dispatch and was pulled with registerType=cashier hardcoded, so 'cashier' is not a guess -- it
-- is what those rows already are. `not null default 'cashier'` on an ADD COLUMN is a metadata-only
-- operation in Postgres 11+ (no full-table rewrite), safe to run against a populated table.
--
-- Two writers upsert this table and BOTH must move together or they silently disagree on the
-- upsert key: scripts/qsrsoft-register-audit-pull.mjs's saveAuditRows() (onConflict updated in
-- the same commit) and src/lib/supabase.js's saveAuditRows() (the client-side twin the pull's own
-- comment says was "copied verbatim" -- same commit, same reason).
--
-- Consumer audit (the real work of this dispatch, not the pull): of ~40 files touching
-- audit_rows, two computation sites encoded the one-row-per-employee-day invariant and needed a
-- code fix alongside this migration -- src/utils/register-audit.js (days/cashOSDays/avgCashOS
-- were counting ROWS as a proxy for DAYS) and src/engine/security-baselines.js's
-- personalBaseline() (one rate per qualifying ROW, now collapsed to one rate per DAY so an
-- employee's per-day distribution isn't inflated by working multiple register types on one date).
-- Both fixed in the same PR as this migration. Everywhere else that sums audit_rows' dollar/count
-- fields across rows (analyzeRegisterAudit's totals, personalBaseline's own dollar-weighted
-- `overall`, peerBaseline, storeBaseline, evaluateRule's numerator/denominator aggregation in
-- security-rules-run.mjs) is UNCHANGED and correct as-is: separate drawers genuinely sum. Full
-- audit in memory/dispatch-59.md's addendum.
--
-- RLS: audit_rows appears only inside generated table LISTS in schema-rls-phase2-loc.sql and
-- schema-multitenant-phase2-rls.sql (loc-scope + tenant-scope, generated per table) -- a new
-- column does not touch either policy. No RLS work in this migration.
--
-- Idempotent: safe to re-run. `add column if not exists` / `drop constraint if exists` no-op on
-- a second run; the `add constraint` is skipped by the guard below if it already exists.
-- ============================================================================

alter table public.audit_rows
  add column if not exists register_type text not null default 'cashier';

-- Postgres has no "ADD CONSTRAINT IF NOT EXISTS" for a primary key, but drop-then-add is
-- idempotent by construction: a first run replaces the old (loc,date,emp) PK; every subsequent
-- run drops the constraint this same migration just created and re-adds the identical one.
alter table public.audit_rows drop constraint if exists audit_rows_pkey;
alter table public.audit_rows add constraint audit_rows_pkey primary key (loc, date, emp, register_type);

-- ── VERIFY ──────────────────────────────────────────────────────────────────────────────────
--   select register_type, count(*) from public.audit_rows group by register_type;
--   -- expect: 100% 'cashier' until the pull's next run backfills manager/preparer rows.
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conrelid = 'public.audit_rows'::regclass and contype = 'p';
--   -- expect: PRIMARY KEY (loc, date, emp, register_type)

-- ── ROLLBACK (only if register_type is confirmed unused by any consumer) ──────────────────────
-- alter table public.audit_rows drop constraint if exists audit_rows_pkey;
-- alter table public.audit_rows add constraint audit_rows_pkey primary key (loc, date, emp);
-- alter table public.audit_rows drop column if exists register_type;
