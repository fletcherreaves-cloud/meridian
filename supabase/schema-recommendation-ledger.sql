-- Recommendation Accuracy Ledger (task #80 follow-on, owner-approved 2026-11-04)
-- See memory/plan-recommendation-accuracy-ledger-2026-11-04.md for the full design.
--
-- Generic, cross-cutting table -- captures ANY recommendation Meridian's engines or SAGE
-- surface (a sales/labor forecast suggestion badge, a SAGE chat recommendation, a Visit
-- Readiness risk flag, a Scanner-promoted signal), tracks what actually happened, and grades
-- it. A new recommendation type is a new `source` value, never a new table.
--
-- RUN ORDER (owner's own action, per this repo's standing "DDL is never run by an agent" rule):
--   1. This file (creates the table, tenant_id defaulted per the multitenant-phase1 convention
--      so the add is metadata-only).
--   2. Re-run schema-multitenant-phase2-rls.sql (flips tenant-scoped RLS -- 'recommendation_ledger'
--      has already been added to its table-name array, same as every other table in this file).
--   3. Re-run schema-rls-phase2-loc.sql (adds the per-loc my_locs() scoping -- also already
--      added to its array). Both scripts are idempotent/guarded (`if exists`) and safe to re-run
--      against tables that already have the policy -- that's how every prior table in both
--      arrays was onboarded.

create table if not exists public.recommendation_ledger (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid default '00000000-0000-0000-0000-000000000001',
  loc                  text,                  -- nullable: some recommendations are fleet-wide
  source               text not null,         -- 'sales_forecast' | 'labor_tpph_forecast'
                                               -- | 'sage_chat' | 'visit_readiness' | 'scanner_signal'
  model_version        text not null,         -- e.g. 'owner-sales-forecast-v1' -- free text, never inferred
  recommendation_text  text not null,         -- human-readable, what was actually shown/said
  recommendation_value numeric,               -- the suggested number, when there is one
  context              jsonb not null default '{}',  -- inputs/window that produced it
  dedupe_key           text not null,         -- e.g. 'sales_forecast:3708:tProdSales:2026-11' --
                                               -- a real column (not a jsonb path) so Supabase's
                                               -- upsert(..., {onConflict:'dedupe_key'}) works
                                               -- directly against a plain unique constraint.
  status               text not null default 'open', -- 'open'|'accepted'|'overridden'|'ignored'|'graded'
  accepted_value       numeric,               -- what the user actually set, if different
  decided_at           timestamptz,
  outcome_due_at       timestamptz,           -- when the real actual becomes knowable
  outcome_value        numeric,
  outcome_error        numeric,               -- recommendation_value vs outcome_value, at grading
  grade                text,                  -- 'within_tolerance'|'over'|'under', null until graded
  graded_at            timestamptz,
  created_at           timestamptz not null default now()
);

create index if not exists recommendation_ledger_source_status_idx
  on public.recommendation_ledger (source, status);
create index if not exists recommendation_ledger_tenant_due_idx
  on public.recommendation_ledger (tenant_id, outcome_due_at);
-- One row per (loc, source, field, period) -- the exact dedup key every capture point builds
-- via src/engine/recommendation-ledger.js's dedupeKeyFor(), so logging a suggestion badge twice
-- (e.g. a re-render) upserts the same row instead of creating a duplicate. A UNIQUE INDEX, not a
-- named table constraint -- `add constraint ... if not exists` isn't valid Postgres syntax, but
-- `create unique index if not exists` is, and PostgREST's upsert onConflict target works against
-- either.
create unique index if not exists recommendation_ledger_dedupe_key_unique
  on public.recommendation_ledger (dedupe_key);
