-- security_findings_latest — APP-SIDE WIRING IS DONE (v5.411); this migration is the one
-- remaining step, to be applied BY HAND (see memory/finding-security-findings-load-time-2026-09-09.md
-- for the full measurement + design).
--
-- security_findings grows ~4,600 rows/day (one fresh row per subject+rule on EVERY daily batch
-- run, flagged or not — 92,740 rows measured 2026-09-09, only 20 days after the batch went
-- live). The Security panel's own loader (loadSecurityFindings()) fetched the WHOLE table every
-- open with no date/loc bound, which forced ~93 sequential 1000-row-capped pages and produced a
-- real "taking several minutes to load" report the same day. Measured: those 92,740 rows
-- collapse to just 3,669 distinct (subject, rule) combinations — a 25x reduction PostgREST can't
-- express client-side (no DISTINCT ON), which is what this view exists to provide.
--
-- security_invoker = true (Postgres 15+) makes this view re-run security_findings' own RLS
-- policy ("security_findings: gated read", schema-security-findings.sql) AS THE QUERYING ROLE —
-- no policy duplication needed, and no weakening of the admin/supervisor-always,
-- manager-only-with-gm_identity_reveal_enabled gating that table already enforces.
--
-- APPLY THIS BY HAND (same as every other schema-*.sql file in this repo — no automated
-- migration runner exists in this session or in CI). loadSecurityFindings() (src/lib/supabase.js)
-- already PROBES for this view on first use each session and falls back to the full base table
-- automatically when it isn't found (checked via PostgREST's own PGRST205 "unknown relation"
-- code — NOT the raw Postgres 42P01, and NOT a `head: true` request, both of which were tried
-- and measured live to give a false "present" reading on this Supabase project). So today,
-- before this migration is applied, the app runs exactly as it did in v5.410 (full-table load,
-- trimmed payload). The moment this view exists, the next Security panel session picks up the
-- ~4-page fast path automatically — no further app deploy needed.
--
-- The companion half that makes this safe: security-panel.js's SubjectDetail no longer assumes
-- the bulk `findings` array carries full multi-window history. loadSecurityFindingsForSubject()
-- fetches ONE subject's real history from the base table (never this view) lazily, only when that
-- subject's row is expanded, and security-panel.js merges it over the bulk-loaded single-window
-- data before classifySubjectTrend()/classifySubjectShape()/buildSubjectTimeline() run — so
-- chronic/trend classification keeps working at full depth either way. See buildHistoryByRule()
-- and the "lazy per-subject full history" tests in src/__tests__/security-panel.test.js.

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
  'the caller. loadSecurityFindings() (src/lib/supabase.js) already probes for and reads from '
  'this view automatically once it exists — no app change needed after applying this file.';
