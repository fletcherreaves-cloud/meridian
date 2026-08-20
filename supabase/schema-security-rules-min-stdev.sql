-- ── min_stdev degenerate-baseline guard for INV-001/INV-002 (dispatch #45 §A, second cause) ──────
-- memory/dispatch-45.md's own "SECOND, INDEPENDENT CAUSE" note: a live subject rendered
-- "0.04 vs threshold 2.50 -- store: mean 0.00, stdev 0.00, n 26 — Flagged." Both mean and stdev
-- were genuinely non-zero (else the engine's existing exact-zero guard would have caught it as an
-- honest null) but rounded away on screen, and z = (0.04 - ~0) / ~0 exploded into a nonsense
-- outlier. A peer population clustered at near-zero turns any real value into a massive z-score
-- regardless of whether that value is actually unusual.
--
-- `min_stdev` (src/engine/security-rules.js, this dispatch): a floor on the baseline's own stdev,
-- checked BEFORE computing z -- below it, the population genuinely cannot support a z-score
-- (honest null, the SAME class as n < MIN_BASELINE_N), never a materiality decision. Built exactly
-- like min_denominator/min_numerator: per-rule data inside logic_expression, one shared choke point.
--
-- MEASURED 2026-08-20, live security_findings.baseline_context for both rules (all rows with a
-- computed mean+stdev), before choosing the mechanism OR the number:
--
--   A coefficient-of-variation floor was tried first and REJECTED by measurement: the actual live
--   INV-002 subjects with |z| > 10 have CVs (stdev/mean) of 0.25-3.5 -- squarely inside the whole
--   population's own normal CV range (median 0.66, n=5,278). CV does not separate this failure mode.
--
--   Raw stdev DOES separate it. INV-001 (n=5,196): p5=1.670, p10=3.309, median=20.997 -- a clean,
--   well-behaved distribution; only 39 of 5,196 (0.75%) fall below CV 0.1, and the near-zero-stdev
--   tail (41 rows) is essentially identical to the already-null-guarded exact-zero set. min_stdev=1
--   sits comfortably below p5 -- a safety net that costs almost nothing today.
--
--   INV-002 (n=5,278): p5=0.000702, p10=0.000861, median=0.002455 -- the metric's own scale is tiny
--   throughout, so no min_stdev choice is free. min_stdev=0.001 sits near p10; measured against the
--   real |z|>10 population (10 subjects), it nulls 6 of the 10 worst offenders (|z| 8.6-23.2, all
--   with stdev < 0.001) while leaving legitimate mid-range subjects untouched. This nulls ~14% of
--   the estate to "undetermined" -- a real cost, but the alternative is reporting a fabricated
--   23-sigma outlier as a security finding.
--
-- Full-literal replacement, matching the established convention for this rule family (phase1c.sql,
-- phase1f.sql) rather than a jsonb `||` merge -- the security-rules-thresholds.test.js guard parses
-- `logic_expression = '{...}'` as one literal per statement, the same shape every prior migration
-- in this family uses. INV-001's other keys (min_value:20, min_denominator:10) and INV-002's
-- (min_numerator:15, from schema-security-rules-phase1f.sql, applied in the same deploy) are
-- reproduced here verbatim, not dropped.
--
-- Idempotent: safe to re-run.

update public.security_rules
set logic_expression = '{"numerator": {"field": "variance", "agg": "sum", "abs": true}, "denominator": {"field": "expUsage", "agg": "sum"}, "scale": 100, "comparator": "gte", "min_value": 20, "min_denominator": 10, "min_stdev": 1}'::jsonb,
    updated_at = now()
where tenant_id = '00000000-0000-0000-0000-000000000001'::uuid and rule_id = 'INV-001';

update public.security_rules
set logic_expression = '{"numerator": {"field": "dolDiff", "agg": "sum", "abs": true}, "denominator": {"field": "storeMonthSales", "agg": "sum"}, "scale": 1000, "comparator": "gte", "min_numerator": 15, "min_stdev": 0.001}'::jsonb,
    updated_at = now()
where tenant_id = '00000000-0000-0000-0000-000000000001'::uuid and rule_id = 'INV-002';
