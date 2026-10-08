-- ============================================================================
-- QSRSoft Forms — MCDOK People confidential review occurrences (Crew Review,
-- Crew Trainer Review, Maintenance Review, Shift Manager Review). One row per
-- SCHEDULED OCCURRENCE, upserted on every pull so an in-progress review's
-- answered-question count converges to its final value over repeated pulls.
--
-- NOT the same source as qsr_forms_completion (schema-qsr-forms-completion.sql)
-- -- a separate table, separate endpoint, separate shape. MEASURED live
-- 2026-10-08 (memory/finding-qsrsoft-review-forms-schedules-endpoint-
-- 2026-10-08.md): these 4 forms return ZERO rows from BOTH completionDetail
-- (0 of 133,324 rows, 90-day/all-store probe) and completionByForm (0 rows
-- with the 4 formIds supplied explicitly) -- the server's compliance/schedule
-- system does not route confidential, approval-gated review forms through
-- either endpoint. They DO appear via `forms/schedules/scheduled`, a
-- different endpoint with no missed/open/schedule concept at all -- only
-- occurrences that have actually been started.
--
-- 🔴 NO "submitted" FLAG EXISTS ON THE SOURCE. Measured across every captured
-- entry, including live in-progress ones started minutes before the probe
-- ran: the raw payload carries only answeredQuestions/totalQuestions, no
-- completedAt/status/submitted field anywhere, and no schedule object either
-- (unlike the routine checklist forms completionDetail covers). completion_
-- ratio here is a raw fact (answered/total); whether a given ratio means
-- "done" is a CONSUMER-SIDE judgment call, not something this table asserts.
-- These forms plateau a few questions short of total even when genuinely
-- finished (completionByForm's own documented conditional-branching caveat
-- applies here too) -- do not add a fabricated submitted boolean, or treat
-- ratio < 1 as "still open," without a fresh measurement to justify it.
--
-- 🔴 PII: reviewed_with stores userIds ONLY, never the plaintext employee
-- name the raw payload also carries (reviewedWith[].name) -- same rule as
-- qsr_forms_completion's completed_by, same reason (schema-qsr-forms-
-- completion.sql's own header: the name never needs to be stored at all).
-- The raw payload's `sessions` array (which carries the REVIEWER's own
-- plaintext name per sub-session) is not stored at all; reviewer_user_id
-- (response.userId, a stable QSRSoft UUID) is the person key this table uses.
--
-- loc is PADDED (matches every other QSRSoft-sourced table in this repo --
-- see schema-product-mix.sql's header for why this repo standardized on
-- padded storage).
--
-- started_at is to-the-millisecond and IS the occurrence key -- re-pulling
-- the SAME in-progress occurrence upserts the latest observed
-- answered_questions over the prior value, which is the intended behavior
-- (watch it converge across repeated pulls, never duplicate rows per pull).
--
-- tenant_id + tenant-scoped RLS from day one (CLAUDE.md standing rule;
-- pattern matches schema-qsr-forms-completion.sql). Zero rows at creation
-- time. Safe to run top-to-bottom; idempotent. Expected: "Success. No rows
-- returned."
-- ============================================================================
create table if not exists public.qsr_forms_reviews (
  loc                text        not null,               -- padded, e.g. '0005985'
  form_id            uuid        not null,
  started_at         timestamptz not null,                -- the occurrence key -- see header
  form_title         text        not null,                -- DISPLAY ONLY -- key on form_id, never this
  total_questions    integer,
  answered_questions integer,
  completion_ratio   numeric,                             -- answered/total -- a raw fact, NOT a confirmed "submitted" signal, see header
  reviewer_user_id   uuid,                                -- QSRSoft's stable person key -- name is NEVER stored, see header
  reviewed_with      jsonb       not null default '[]',   -- array of userIds ONLY, see header
  is_confidential    boolean     not null default false,
  shared_with        jsonb       not null default '[]',   -- userIds with view access
  is_deleted         boolean     not null default false,
  tenant_id          uuid        not null default '00000000-0000-0000-0000-000000000001',
  updated_at         timestamptz not null default now(),
  primary key (tenant_id, loc, form_id, started_at)
);

alter table public.qsr_forms_reviews enable row level security;
drop policy if exists qsr_forms_reviews_tenant on public.qsr_forms_reviews;
create policy qsr_forms_reviews_tenant on public.qsr_forms_reviews
  for all to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid)
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- store drill-down and per-form rollups.
create index if not exists qsr_forms_reviews_loc_idx on public.qsr_forms_reviews (loc, started_at desc);
create index if not exists qsr_forms_reviews_form_idx on public.qsr_forms_reviews (form_id, started_at desc);
