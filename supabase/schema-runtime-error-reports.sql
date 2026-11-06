-- ═══════════════════════════════════════════════════════════════════════════════
-- RUNTIME ERROR REPORTS (error-telemetry prep, memory/plan-error-telemetry-auto-fix-2026-11-06.md,
-- task #103, Phase 1 — owner-approved design 2026-11-06)
--
-- Captures every real ErrorBoundary.componentDidCatch (src/features/session.js) crash into a
-- single deduplicated row per distinct bug, instead of letting it vanish into a console.error
-- nobody but the owner (and only if he's looking at the screen) ever sees. Fed, in a LATER phase
-- (#103's own Phase 2, NOT this migration), into the weekly self-maintenance sweep as an 8th
-- rotation dimension — this migration and the client-side reportRuntimeError()/componentDidCatch
-- wiring (src/lib/supabase.js, src/features/session.js) are Phase 1 only: rows accumulate, no
-- sweep integration yet, no in-app viewer, no push/email notification (both explicitly decided
-- against for v1 in the plan doc's "Decisions" section).
--
-- Dedup, not per-occurrence rows: `fingerprint` = a client-computed hash of (message, top stack
-- frame with its line/column stripped, panel) — see computeErrorFingerprint() (src/engine/
-- error-telemetry.js). The SAME bug firing for a thousand users across a week bumps one row's
-- occurrence_count/last_seen_at; it does not create a thousand rows. A genuinely different bug
-- (different message, frame, or panel) gets its own row.
--
-- No PII, by explicit design (plan doc §4): message/stack/panel ONLY. No user id, no
-- accessible_locs, no request payload. A crash message occasionally embedding a data value (e.g.
-- a malformed date string) is an accepted, already-reviewed risk inherent in any stack-trace
-- logging — not a reason to add an identity column here.
--
-- Same tenant_id + RLS shape every other small operational table in this repo uses (closest
-- analog: weekly_count_day_overrides, schema-weekly-count-day.sql) — tenant isolation only, not a
-- sensitive-data table; write access is gated by the client-side reportRuntimeError() call path
-- itself, same as that table's own reasoning.
--
-- ⚠️ Run this once in the Supabase SQL editor (idempotent) — same situation every other
-- supabase/schema-*.sql file in this repo is already in: this session has no DDL execution path,
-- and per CLAUDE.md's standing rule, Claude never runs schema DDL regardless. THE REST OF TASK
-- #103's FEATURE (reportRuntimeError()/componentDidCatch) IS ALREADY LIVE once this PR merges —
-- it self-heals (silent no-op, not an error) against the missing table until this migration runs,
-- so nothing breaks either way, but no crash report is actually stored until the owner runs this.
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists public.runtime_error_reports (
  id               uuid primary key default gen_random_uuid(),
  fingerprint      text not null,          -- hash of (message, top stack frame, panel) -- the dedup key
  message          text not null,
  stack            text,
  panel            text,                   -- lazyPanel's panelName (task #102), null for the top-level boundary
  occurrence_count int not null default 1,
  first_seen_at    timestamptz default now(),
  last_seen_at     timestamptz default now(),
  status           text not null default 'new' check (status in ('new','triaged','fixed','wontfix','flaky')),
  task_id          uuid references public.tasks(id),   -- set once a later sweep pass files a ticket (Phase 2, not this migration)
  tenant_id        uuid not null default '00000000-0000-0000-0000-000000000001',
  created_at       timestamptz default now(),
  unique (tenant_id, fingerprint)
);

alter table public.runtime_error_reports enable row level security;

drop policy if exists runtime_error_reports_tenant on public.runtime_error_reports;
create policy runtime_error_reports_tenant on public.runtime_error_reports
  for all to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid)
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

create index if not exists runtime_error_reports_status_idx on public.runtime_error_reports (status, occurrence_count desc);

comment on table public.runtime_error_reports is
  'Deduplicated real browser crash reports from ErrorBoundary.componentDidCatch (src/features/session.js), one row per distinct (message, top-stack-frame, panel) fingerprint. Phase 1 of memory/plan-error-telemetry-auto-fix-2026-11-06.md -- rows accumulate here; the weekly-sweep triage pass that reads status=''new'' is a later phase, not part of this migration.';
comment on column public.runtime_error_reports.fingerprint is
  'computeErrorFingerprint() (src/engine/error-telemetry.js) -- hash of trimmed message + topStackFrame(stack) (line/column stripped so a rebuild''s shifted line numbers don''t fragment the same bug into a new row) + panel. Unique per tenant.';
comment on column public.runtime_error_reports.panel is
  'lazyPanel()''s panelName (task #102, src/app/App.js) -- which panel''s ErrorBoundary caught this. Null for the top-level app-wide boundary (meridian.js), which passes no panelName.';
comment on column public.runtime_error_reports.status is
  'new (default, unreviewed) | triaged | fixed | wontfix | flaky -- set by a later sweep pass (Phase 2), never by the client-side capture path itself.';
