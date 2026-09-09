-- security_findings_latest — NOT YET WIRED INTO THE APP (see
-- memory/finding-security-findings-load-time-2026-09-09.md for the full measurement + why).
--
-- security_findings grows ~4,600 rows/day (one fresh row per subject+rule on EVERY daily batch
-- run, flagged or not — 92,740 rows measured 2026-09-09, only 20 days after the batch went
-- live). The Security panel's own loader (loadSecurityFindings()) fetches the WHOLE table every
-- open with no date/loc bound, which forced ~93 sequential 1000-row-capped pages and produced a
-- real "taking several minutes to load" report the same day. Measured: those 92,740 rows
-- collapse to just 3,669 distinct (subject, rule) combinations — a 25x reduction sitting here
-- unexploited, because PostgREST has no client-side way to express DISTINCT ON.
--
-- security_invoker = true (Postgres 15+) makes this view re-run security_findings' own RLS
-- policy ("security_findings: gated read", schema-security-findings.sql) AS THE QUERYING ROLE —
-- no policy duplication needed, and no weakening of the admin/supervisor-always,
-- manager-only-with-gm_identity_reveal_enabled gating that table already enforces.
--
-- APPLY THIS BY HAND (same as every other schema-*.sql file in this repo — no automated
-- migration runner exists). Once live, loadSecurityFindings() can point its default/list load
-- at this view instead of the base table — but that swap needs a companion lazy per-subject
-- history fetch first, or it silently breaks chronic/trend classification (classifySubjectTrend
-- et al. need >1 window per rule per subject, which "latest only" can never provide). See the
-- memory file for the exact scope of that follow-up. Do not wire this in without it.

create or replace view public.security_findings_latest
  with (security_invoker = true) as
select distinct on (tenant_id, loc, subject_key, rule_id)
  id, tenant_id, emp_token, wrin, loc, rule_id, window_start, window_end,
  value, threshold_used, pass, lifecycle_category, exoneration_share,
  baseline_context, explanation, computed_at, subject_key
from public.security_findings
order by tenant_id, loc, subject_key, rule_id, window_end desc, computed_at desc;

grant select on public.security_findings_latest to authenticated;

comment on view public.security_findings_latest is
  'One row per (tenant, loc, subject, rule) — the batch''s own latest evaluation, not the full '
  'daily-rolling-window history. security_invoker=true re-runs security_findings'' own RLS as '
  'the caller. See memory/finding-security-findings-load-time-2026-09-09.md before wiring the '
  'app to read from this — it needs a companion lazy per-subject history fetch to avoid breaking '
  'chronic/trend classification, which is NOT done yet.';
