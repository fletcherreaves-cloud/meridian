-- ============================================================================
-- QSRSoft Forms — shift-checklist / travel-path completion, one row per
-- SCHEDULED OCCURRENCE. Forms dashboard, Slice 1 of 3 (schema + normalizer;
-- Slice 2 is the panel, Slice 3 is the pull script -- gated last, since it
-- is the only slice this environment cannot verify against a live host).
--
-- Endpoint confirmed 2026-08-21 (memory/finding-qsrsoft-forms-completion-
-- endpoint-2026-08-21.md — read that before touching this table further, it
-- has the full 4,714-row capture and every measured trap below):
--   POST https://forms.home.myqsrsoft.com/api/forms/reports/completionDetail
--        ?orgId=...
--   { startDate, endDate, locations: [ "3708", ..., "noLocation" ] }  -- NO
--   formIds -- the server already knows what's assigned, which is why this
--   endpoint (not its sibling completionByForm) is the one to build on: it
--   is the only source with a real denominator ("missed" requires knowing
--   what was SCHEDULED, not just what was submitted).
--
-- Built for one row per (loc, formId, occurrence) -- NOT per form per store
-- per range. completionByForm (the sibling, aggregate-only, no date, no
-- submitter) answers a DIFFERENT question (within-form thoroughness,
-- answered/total) and is out of scope for this table; it may get its own
-- table in a later slice if the dashboard needs it.
--
-- 🔴 status IS POLYMORPHIC -- a string enum OR a float. Never store the raw
-- field. Measured across all 4,714 captured rows, zero disagreements:
--   status:"MISSED"      missed=true   hasResponse=false  -> status_state 'missed'
--   status:"--"          missed=false  hasResponse=false  -> status_state 'open'    (STILL DUE, NOT a miss)
--   status: number 0-1   missed=false  hasResponse=true   -> status_state 'completed', completion_ratio = the number
-- Three states, not two. Reading "--" as missed over-reports misses by 13%
-- (599 of 4,714 rows in the capture). The normalizer (src/engine/
-- forms-completion.js) is the ONE place this branching happens; never
-- re-derive it from completion_ratio or status_state elsewhere.
--
-- 🔴 occurrence_key, not scheduled_at, is the key column. scheduled_at can
-- be NULL -- 32 captured rows, every one a completed AD-HOC submission with
-- no scheduled occurrence behind it. (loc, form_id, scheduled_at) drops or
-- collides all 32. occurrence_key = scheduled_at, falling back to
-- completed_on for those ad-hoc rows -- completed_on is guaranteed present
-- whenever scheduled_at is not (every non-completed row IS scheduled), so
-- the coalesced value is always defined. Computed by the normalizer, not by
-- a generated column, so a single code path owns the fallback logic.
--
-- time_to_complete_ms is ACTIVE time, not wall-clock elapsed. Median ratio
-- to (completed_on - started_at) is 0.9999 but the floor is 0.0000 -- one
-- captured row shows 28.97 days elapsed against 109 seconds recorded (a
-- form left open, finished much later). NEVER derive one from the other.
--
-- form_title is DISPLAY ONLY. Titles are dirty -- trailing spaces
-- ("Dinner Pre-Shift ") and one typo ("Reb Bull Tracking Form"). Group and
-- join on form_id (a stable UUID), never on the title.
--
-- score / reviewed_with are always null / 'N/A' estate-wide as of the
-- capture -- columns kept (a scored audit form presumably populates them)
-- but no metric should be built on them until a capture shows otherwise.
--
-- assigned_to is role GROUPS ("General Manager", "Shift Manager"), never
-- individuals. Manager attribution is NOT possible from this table alone --
-- measured: 0 of 3,886 missed rows carry a person (user_id is null on every
-- non-completed row by construction; a miss has nobody attached to it, and
-- the miss is exactly the row a manager would be accountable for). Slice 2
-- is total-day only, per the owner's own stated fallback.
--
-- 🔴 PII: completed_by (a PLAINTEXT EMPLOYEE NAME) is deliberately NOT a
-- column here and must never become one. user_id is QSRSoft's own stable
-- person key (a UUID, 40 distinct people in the capture) -- key on it
-- instead; the name never needs to be stored at all. If a future slice adds
-- name resolution, it goes through get_or_create_employee_token() on
-- ingest, exactly like every other identity-vault-covered stream, and never
-- lands in this table.
--
-- loc is PADDED (matches qsr_fob / qsr_product_mix / every other QSRSoft-
-- sourced table, not the unpadded STORE_NAMES key the raw `location` field
-- uses) -- see schema-product-mix.sql's own header for why this repo
-- standardized on padded storage after four loc-padding incidents.
--
-- tenant_id + tenant-scoped RLS from day one (CLAUDE.md standing rule;
-- pattern matches schema-product-mix.sql / schema-coaching-cycles.sql).
-- Zero rows at creation time -- the cheapest a tenant_id column ever gets.
-- Safe to run top-to-bottom; idempotent. Expected: "Success. No rows returned."
-- ============================================================================
create table if not exists public.qsr_forms_completion (
  loc                  text        not null,               -- padded, e.g. '0006178'
  form_id              uuid        not null,
  occurrence_key       timestamptz not null,                -- scheduled_at, or completed_on for null-scheduled_at ad-hoc rows -- see header
  form_title           text        not null,                -- DISPLAY ONLY -- dirty; never group by this
  status_state         text        not null check (status_state in ('missed','open','completed')),
  completion_ratio     numeric,                             -- only when status_state='completed' -- within-form ratio, NOT percent-of-schedule
  missed               boolean     not null,
  has_response         boolean     not null,
  scheduled_at         timestamptz,                         -- nullable -- ad-hoc completed rows have none
  started_at           timestamptz,
  completed_on         timestamptz,
  time_to_complete_ms  bigint,                              -- ACTIVE time -- never derive from completed_on - started_at; bigint, not int4: int4 caps at 24.9 DAYS in ms and the capture contains a 28.97-day span
  user_id              uuid,                                -- QSRSoft's stable person key -- name is NEVER stored, see header
  score                numeric,                             -- always null estate-wide today; column kept
  reviewed_with        text,                                -- always 'N/A' estate-wide today; column kept
  assigned_to          jsonb       not null default '[]',   -- role GROUPS, not individuals
  tenant_id            uuid        not null default '00000000-0000-0000-0000-000000000001',
  updated_at           timestamptz not null default now(),
  primary key (tenant_id, loc, form_id, occurrence_key)
);

alter table public.qsr_forms_completion enable row level security;
drop policy if exists qsr_forms_completion_tenant on public.qsr_forms_completion;
create policy qsr_forms_completion_tenant on public.qsr_forms_completion
  for all to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid)
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- store-day rollups (the panel's own query shape) and per-form drill-downs.
create index if not exists qsr_forms_completion_loc_key_idx on public.qsr_forms_completion (loc, occurrence_key desc);
create index if not exists qsr_forms_completion_form_idx on public.qsr_forms_completion (form_id, occurrence_key desc);
