-- ── lifelenz_compliance_audit — labor-compliance-violation log, with its $ cost/hour penalty ──
-- Source: LifeLenz's Data Explorer "Compliance Audit" report (Lakehouse-backed, async report
-- generation -- same mechanism as lifelenz_schedule_variance /
-- scripts/lifelenz-schedule-variance-pull.mjs, confirmed live 2026-11-01,
-- memory/lifelenz-session.md's "New Data Explorer" section has the full trigger→poll→download
-- flow). This table's pull script is scripts/lifelenz-compliance-audit-pull.mjs.
--
-- A real labor-compliance-violation log -- meal/rest break violations, minor-labor-law issues,
-- etc. -- each with a DOLLAR PENALTY (cost_penalty) and HOURS PENALTY (hour_penalty). Nothing in
-- Meridian tracked this before this table (no compliance-violation panel existed anywhere, per
-- CLAUDE.md's panel list, until this build).
--
-- Only the fields explicitly named in the live GetReportMeta discovery capture
-- (memory/lifelenz-session.md's "BUILT 2026-11-01" section -- 42 real columns confirmed, this
-- report's full member list) are promoted to real columns; everything else the pull script's
-- runtime GetReportMeta call discovers lands in `raw` JSONB -- same "avoids a 300-column schema"
-- precedent qsr_cash_sheet/qsr_labor_summary/etc. already use for a report with more fields than
-- any one "good use" needs queried directly. compliance_warning_id is the violation's own
-- confirmed-real id column, so (unlike lifelenz_schedule_variance, which has no natural id and
-- needs a derived seq) it is the natural per-row key; `seq` is kept only as a defensive
-- tie-breaker in case a future report revision ever repeats an id within one pull.
create table if not exists public.lifelenz_compliance_audit (
  tenant_id             uuid        not null default '00000000-0000-0000-0000-000000000001',
  loc                   text        not null,   -- store number, 7-char zero-padded
  compliance_warning_id text        not null,    -- the violation's own id (confirmed real column)
  employee_name         text,                    -- employees_employee_name
  geid                  text,                    -- employees_geid
  shift_date            date        not null,
  category              text,                    -- violation category (e.g. meal break, rest break, minor-labor)
  title                 text,
  description           text,
  source                text,
  cost_penalty          numeric,                 -- $ penalty for this violation
  hour_penalty          numeric,                 -- hours penalty for this violation
  warning_time          text,                    -- real shape (a time, a duration...) not yet confirmed against live data -- stored as text defensively, same precedent as lifelenz_schedule_variance's original_value/updated_value
  is_dismissed          boolean,
  dismissal_reason      text,
  dismissed_by          text,
  dismissed_on          text,                    -- not yet confirmed as a clean timestamp -- text, same reasoning as warning_time
  raw                   jsonb,                   -- every other real column this report carries (discovered at runtime via GetReportMeta, not hand-enumerated here)
  updated_at            timestamptz not null default now(),
  seq                   integer     not null default 0,
  primary key (loc, compliance_warning_id, seq)
);

create index if not exists lifelenz_compliance_audit_loc_date_idx
  on public.lifelenz_compliance_audit (loc, shift_date desc);
create index if not exists lifelenz_compliance_audit_employee_idx
  on public.lifelenz_compliance_audit (employee_name);
create index if not exists lifelenz_compliance_audit_category_idx
  on public.lifelenz_compliance_audit (category);

alter table public.lifelenz_compliance_audit enable row level security;

-- Same two-layer pattern as lifelenz_schedule_variance/lifelenz_punch_edits: tenant match +
-- accessible_locs loc-scoping via the existing (select public.my_locs()) RESTRICTIVE predicate.
drop policy if exists "lifelenz_compliance_audit: tenant read" on public.lifelenz_compliance_audit;
create policy "lifelenz_compliance_audit: tenant read" on public.lifelenz_compliance_audit
  for select using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

drop policy if exists "lifelenz_compliance_audit: loc scope" on public.lifelenz_compliance_audit;
create policy "lifelenz_compliance_audit: loc scope" on public.lifelenz_compliance_audit
  as restrictive for all to authenticated
  using (
    (select public.my_locs()) is null
    or ltrim(loc, '0') in (select unnest((select public.my_locs())))
  )
  with check (
    (select public.my_locs()) is null
    or ltrim(loc, '0') in (select unnest((select public.my_locs())))
  );
-- No insert/update/delete policy for any role -- every write comes from
-- scripts/lifelenz-compliance-audit-pull.mjs's service-role key, which bypasses RLS entirely.

comment on table public.lifelenz_compliance_audit is
  'Labor-compliance-violation log from LifeLenz''s Data Explorer Compliance Audit report (Lakehouse-backed): meal/rest break and minor-labor-law violations etc., each with a $ cost_penalty and hour_penalty, dismissal status, and who/what/when. Powers src/engine/compliance-audit.js''s per-store/per-category/per-employee Compliance Audit metrics (Labor & Scheduling hub''s Compliance Audit tab). Written only by scripts/lifelenz-compliance-audit-pull.mjs (service role); read gated by ordinary tenant + accessible_locs RLS.';
