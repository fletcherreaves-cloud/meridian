-- ── security_findings.daypart — third subject dimension for INV-004 (dispatch #48/#50 lineage) ──
-- INV-004 (waste-log padding) is scoped manager x day-part x store (memory/dispatch-48.md's own
-- amended text: qsr_waste has no wrin, so item-level grouping isn't possible from it -- the
-- subject is a person at a specific store AND a specific day-part, not just a person at a store).
-- The existing subject shape (emp_token XOR wrin) has no room for that third dimension: two
-- findings for the same manager/store in different dayparts (e.g. Dinner vs Late Night) would
-- collide on the same subject_key and silently overwrite each other in the upsert.
--
-- security_findings_one_subject (schema-security-findings.sql) is UNCHANGED and does not need to
-- be -- it already permits (emp_token not null, wrin null), which is exactly INV-004's own row
-- shape. daypart is an ADDITIVE disambiguator on an already-valid emp_token subject, not a new
-- subject type of its own, so the check constraint needs no new branch.
--
-- subject_key is a STORED generated column -- Postgres cannot ALTER a generated column's own
-- expression, so this drops and recreates it. This recomputes subject_key for every existing row
-- (a full rewrite), but nothing outside this file and scripts/security-rules-run.mjs's own
-- onConflict target ever reads subject_key by value (verified: not referenced anywhere in src/ or
-- scripts/ besides that one file) -- the string CHANGES for existing rows (a new trailing '::'
-- segment appears), but nothing depends on the old literal value, only on it staying internally
-- consistent for the unique index, which it does.
alter table public.security_findings add column if not exists daypart text;

drop index if exists public.security_findings_upsert_key;
alter table public.security_findings drop column if exists subject_key;
alter table public.security_findings
  add column subject_key text generated always as (
    coalesce(emp_token::text, '') || '::' || coalesce(wrin, '') || '::' || coalesce(daypart, '')
  ) stored;

create unique index if not exists security_findings_upsert_key
  on public.security_findings (tenant_id, rule_id, loc, window_start, window_end, subject_key);

create index if not exists security_findings_daypart_idx
  on public.security_findings (daypart) where daypart is not null;

comment on column public.security_findings.daypart is
  'Breakfast|Lunch|Afternoon|Dinner|Late Night (src/engine/labor-standard.js DAYPARTS), set ONLY by INV-004 (manager x day-part x store). Null for every other rule -- an additive disambiguator on an emp_token subject, not a fourth subject type.';
