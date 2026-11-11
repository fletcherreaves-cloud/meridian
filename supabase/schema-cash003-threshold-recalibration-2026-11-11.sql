-- ── CASH-003 threshold recalibrated for its new data source (2026-11-11) ──────────────────────────
-- memory/finding-cash003-security-events-restructure-2026-11-11.md (same-day, earlier commit)
-- restructured CASH-003 onto qsr_security_events after audit_rows (the old source) went dead
-- company-wide 2026-09-19. That restructure left the rule's own threshold ($5, set phase1g.sql
-- 2026-08-20 against audit_rows' near-zero base rate: 6 occurrences by 4 employees in 80 days
-- company-wide) completely unchanged -- correct for the data-pipe fix, but the richer, far more
-- complete qsr_security_events source exposed self-authorized refunds as a MUCH more routine
-- occurrence than audit_rows ever surfaced. First live run against the new source (window
-- 2026-10-14..2026-11-11): 84 subjects with any exposure, 66 of them (79%) crossing $5 -- not a
-- sudden company-wide integrity problem, a stale threshold applied to a data source an order of
-- magnitude more complete than the one it was calibrated against.
--
-- Re-measured live against that same real population before picking a new number (percentile_cont
-- over all 84 subjects' 28-day manualRefAmt sums, not guessed):
--   p10    p25    p50     p75     p90     p95     p99     mean    stdev
--   $3.22  $5.52  $12.83  $29.45  $52.38  $61.27  $93.26  $21.68  $21.56
-- A smooth, continuous, right-skewed spread with no natural bimodal gap (unlike e.g. the swing
-- alarm's or count-completeness's own measured distributions) -- this population is "employees who
-- did at least one self-authorized refund in 28 days," already filtered down from the full roster,
-- and the dollar total blends one-off legitimate comps with any genuine repeat pattern. In the
-- absence of a natural break, the threshold is set near the 90th percentile of this real,
-- already-filtered population: $50, flagging 9 of 84 (~11%) in the same measurement window,
-- restoring something close to phase1g.sql's own stated intent ("a list to review exhaustively, not
-- a queue to triage") rather than redefining it. threshold.default was 5; a sub-$5 value (the old
-- audit_rows-era floor) would now flag effectively everyone in this population and tell a manager
-- nothing. This is a reasoned first recalibration from a real measured distribution, not a
-- precision-optimized statistic -- same honest tier as this engine's other first-pass thresholds
-- (HEALTH_SCORE_SCALE, drift's EARLY/CONFIRMED weights) -- and should be revisited once case-
-- tracking data on these 9 subjects exists to check whether $50 actually separates signal from
-- noise in practice.
--
-- Does NOT change logic_type, logic_expression, or baseline_type -- this is a threshold-value-only
-- recalibration, not a rule redesign. A z-score/peer-relative redesign (comparing each employee
-- against their OWN historical rate rather than one flat company-wide dollar line, which
-- `baseline_type:'personal'` already computes but a 'threshold' logic_type rule's pass/fail gate
-- currently ignores -- confirmed by reading evaluateRule()'s own code) is a more principled
-- longer-term option, flagged for the owner's call, not applied here.
--
-- Idempotent: safe to re-run, full-literal replacement (not a merge), matching this file family's
-- established convention (phase1g.sql above).

update public.security_rules
set threshold = '{"default": 50}'::jsonb,
    description = 'Manual refund / self-authorized override dollars per employee in the window, as an ABSOLUTE amount -- not a rate. Sourced from qsr_security_events (cash_refund/cashless_refund events where crew_token = mgr_token, i.e. the same employee rang and self-authorized the refund) since 2026-11-11, after the prior source (audit_rows/Register Audit pull) went dead company-wide 2026-09-19 -- see memory/finding-register-audit-pull-403-explicit-deny-2026-11-11.md and memory/finding-cash003-security-events-restructure-2026-11-11.md. Threshold recalibrated the same day (memory/finding-cash003-security-events-restructure-2026-11-11.md): the old $5 floor was set against audit_rows'' near-zero base rate (6 occurrences company-wide in 80 days) and flagged 79% of exposed subjects against the new, far more complete source. $50 sits near the 90th percentile of the real measured 28-day distribution under the new source, flagging roughly the top 10% rather than nearly everyone with any self-authorized refund activity. The dollar value is not the signal -- authorization is. A flag here means "verify this pattern of overrides was approved," not "this person took $50." Expect roughly the top decile of exposed subjects per 28-day window: a list to review, not a queue to triage.',
    updated_at = now()
where tenant_id = '00000000-0000-0000-0000-000000000001'::uuid and rule_id = 'CASH-003';
