-- ── Security build Phase 1f — min_numerator materiality floor for INV-002 (dispatch #45 §A) ──────
-- memory/dispatch-45.md, memory/analysis-zscore-dry-run-2026-08-20.md. The first live z-score run
-- (32408929106) validated the peer-baseline conversion (max stores flagged per WRIN 27 -> 3) but
-- exposed a real gap: INV-002 flags 224 subjects on pure 2.5σ with NO materiality gate at all --
-- `min_value` was correctly removed in PR #481 (the inherited 10 was unreachable against a
-- measured max of 0.087), but nothing replaced it. `min_value` gates the computed RATE; the right
-- floor here is the absolute dollar amount, which `min_value` cannot express since the rate is
-- tiny precisely because the denominator (storeMonthSales) is large -- a store 3σ above peers on
-- $4 of variance is statistically interesting and operationally worthless (dispatch #42 §3's own
-- framing, with no mechanism behind it until this migration).
--
-- `min_numerator` (src/engine/security-rules.js, this dispatch): a per-rule materiality floor on
-- the RAW numerator sum, built exactly like `min_denominator` -- same shared choke point, per-rule
-- data, engine-agnostic -- but with the opposite asymmetry: unmet min_denominator produces an
-- honest null (not enough exposure to compute a rate); unmet min_numerator produces a real,
-- decided pass:false (the rule DID compute a rate, it's just not material). Neither collapses into
-- the other.
--
-- MEASURED 2026-08-20, live qsr_variance_stat (period 2026-08, the only period this table
-- currently holds -- window_days=90 has no earlier history to span yet), non-condiment rows with a
-- real dol_diff, matching INV-002's own numerator definition (sum(|dolDiff|), abs):
--
--   n=4,474 (full eligible population). min=0.00  p10=1.28  p25=4.45  MEDIAN=13.66  p75=39.65
--   p90=90.39  p95=136.53  p99=282.18  max=604.49
--
-- Set at the measured POPULATION MEDIAN, rounded to a clean number -- the exact same methodology
-- `phase1c.sql` used for INV-001's own min_value (20, "clears roughly half the floor-passing
-- population"), applied here for consistency rather than inventing a different rule. $15 sits at
-- this rule's own measured median: a real, non-trivial gate (not so low it's a no-op, not so high
-- it nulls the estate the way the old, wrong-instrument min_value:10 did on the RATE).
--
-- Idempotent: safe to re-run. logic_expression is a full replacement (min_numerator must set to
-- this exact value, not accumulate), so re-running twice leaves the same end state.

update public.security_rules
set logic_expression = '{"numerator": {"field": "dolDiff", "agg": "sum", "abs": true}, "denominator": {"field": "storeMonthSales", "agg": "sum"}, "scale": 1000, "comparator": "gte", "min_numerator": 15}'::jsonb,
    description = 'Dollarized TvA variance (dol_diff), normalized per $1,000 of store-month product sales (qsr_fob.prod_sales_amt, joined), store baseline z-score (dispatch #42). min_numerator:15 (dispatch #45 -- measured 2026-08-20 population median of sum(|dol_diff|), non-condiment, n=4,474) is a materiality floor on the RAW dollar amount, independent of the rate: without it the rule flagged 224 subjects on pure statistical unusualness regardless of dollar size (max flagged amount ~a few hundred dollars, median ~a few tens) -- min_value was correctly removed post-PR-481-review since the inherited value (10) was unreachable on this rule''s tiny rate, but nothing replaced the materiality check it used to (incompletely) provide.',
    updated_at = now()
where tenant_id = '00000000-0000-0000-0000-000000000001'::uuid and rule_id = 'INV-002';
