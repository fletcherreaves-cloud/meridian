-- ── INV-003 (waste-unexplained) + INV-005 (phantom gains) — dispatch #48 ──────────────────────────
-- memory/dispatch-48.md (PM branch, commit 21c9b2c, not yet merged as of this migration).
-- "Two inventory schemes buildable with data already pulled, plus the item-level waste rule they
-- share a premise with." Both use qsr_variance_stat (dispatch #40's own table, already loaded on
-- every batch run) -- no new pull. plan-security-loss-prevention.md §2.2.
--
-- INV-004 (waste-log padding, qsr_waste-based, manager x day-part x store) is NOT in this file --
-- it carries a hard prerequisite (the identity vault does not yet cover qsr_waste.manager) and
-- ships separately once that lands. See supabase/schema-identity-vault-qsr-waste.sql.
--
-- QSRSoft's own sign convention (measured live, 2026-08-20, exact across every sampled row):
-- variance = exp_usage - act_usage. Positive means actual usage came in BELOW theoretical (a
-- "gain"); negative means actual exceeded theoretical (shrink, INV-001's own direction, unsigned).
-- Both derived fields (unexplainedVariance, positiveVariance) are computed once in
-- scripts/security-rules-run.mjs's mapVarianceStatRow() -- see that function's own header.
--
-- Both rules reuse the SAME z-score/store-baseline/exposure-floor/materiality-floor/min-stdev
-- mechanism dispatch #42/#45/#45b already validated on INV-001/INV-002 -- the only new thing is
-- which field the numerator names. Both land ACTIVE=FALSE per the dispatch's own explicit
-- instruction ("all three land inactive, with thresholds measured from their own distributions")
-- -- a first live run, not a live-panel debut, is how a threshold gets confirmed against real
-- output, matching the exact discipline that would have caught the unreachable-threshold class
-- earlier if it had been followed from INV-001/INV-002's own first ship.
--
-- ── INV-003 — Variance unmatched by logged waste ("the plan's own strongest single signal") ──────
-- plan §2.2: "an unexplained variance with zero waste logged for that item is the strongest single
-- signal" (TvA's own note). Dispatch #45 Part C already measured the gap this rule detects: of
-- INV-001's unexplained flags, only 44.1% have any logged waste at all, and only 4.2% have waste
-- covering even half the usage variance.
--
-- Shape: an exoneration-weighted variance, not a second copy of INV-001. `unexplainedVariance =
-- max(0, |variance| - (raw_waste + comp_waste))` is the mathematically identical operation to
-- weighting variance by (1 - exoneration_share) -- security_findings.exoneration_share (added in
-- #492's dispatch #46 §C item 6) is populated automatically for this rule too, since
-- computeItemFindingsForRule()'s exoneration computation already runs for ANY flagged INV rule,
-- not just INV-001 -- no new column, no new code path, exactly the dispatch's own instruction to
-- reuse it rather than add one.
--
-- The full manager/day-of-week/item grouping the plan's separate "waste-log padding" method
-- describes needs qsr_waste's daily grain (loc/busn_dt/manager), which carries NO item column --
-- item-level attribution isn't expressible from that table. This rule instead builds the
-- item-level half from qsr_variance_stat, which already loads raw_waste/comp_waste per item.
--
-- MEASURED 2026-08-20 (re-verified same day against the live table, second pass -- the table grew
-- between the two measurements, see the periods note below; both passes agree within normal drift),
-- live qsr_variance_stat, period 2026-08 (non-condiment, exp_usage>0):
--   Population rate (unexplainedVariance/exp_usage*100), n=4,221: median=14.98, p90=103.13,
--     max=36134.38 (a single outlier item; the min_value floor and z-score both tame it).
--   Peer-baseline stdev (per-(loc,wrin), leave-one-out, n>=5 peers), n=4,200 baselines:
--     p5=1.75, p10=3.74, median=25.79 -- a well-behaved distribution (2 exact-zero, 57 of 4,200
--     below stdev 1) -- this metric does NOT show INV-005's degenerate tail below.
-- min_value:15 (population median, "clears roughly half," same methodology every prior floor in
-- this build uses). min_denominator:10, matching INV-001's own established exp_usage exposure
-- floor (same denominator field, same units). min_stdev:1, comfortably below p5=1.75 -- mirrors
-- INV-001's own choice for the same reason (a near-no-op safety net against the exact-zero-adjacent
-- tail, not expected to null much on this well-behaved distribution).
insert into public.security_rules (
  rule_id, domain, subdomain, method, description, data_required, logic_type, logic_expression,
  window_days, baseline_type, threshold, severity, weight, confidence, opportunity_factor,
  corroboration_rules, exoneration_rules, false_positives, investigation_action, source, version, active
) values (
  'INV-003', 'inventory', 'waste-unexplained', 'Variance unmatched by logged waste',
  'How much of an item''s usage variance at a store has NO matching waste logged against it, compared to other stores'' own rate for that same item. A large gap with little or no logged waste is more likely a real, unexplained loss than a variance where waste already accounts for most of it.',
  '["qsr_variance_stat"]', 'z-score',
  '{"numerator": {"field": "unexplainedVariance", "agg": "sum", "abs": false}, "denominator": {"field": "expUsage", "agg": "sum"}, "scale": 100, "comparator": "gte", "min_value": 15, "min_denominator": 10, "min_stdev": 1}',
  90, 'store', '{"default": 2.5}', 3, 1, 'medium', false,
  '{"INV-001"}', '{}', '["waste logged in a different system/period not yet synced to qsr_waste", "count-timing error near a month boundary", "recipe/portion change mid-period not yet reflected in exp_usage", "a genuinely low-waste, efficient operation"]',
  'Pull the item''s waste log (qsr_waste) for the flagged store/period and confirm whether any waste was recorded near the variance date; if none, check raw-item detail (qsr_raw_item_detail) for a count-timing issue before treating this as loss.',
  'plan-security-loss-prevention.md §2.2 (Waste-log padding / TvA''s own "strongest single signal" note); memory/dispatch-48.md', 1, false
)
on conflict (tenant_id, rule_id) do nothing;

-- ── INV-005 — Unexplained positive inventory adjustment ("phantom gains") ────────────────────────
-- plan §2.2: "Flag unexplained positive inventory adjustments, especially post-count, especially
-- on items with a recent negative-variance history." The base signal (an unexplained current-
-- period gain) is built here; the historical-correlation qualifier ("recent negative-variance
-- history") needs a PRIOR-period join this migration does not build.
-- CORRECTION (re-measured 2026-08-20, same session, second pass): the original draft of this
-- comment claimed qsr_variance_stat "holds only ONE period, 2026-08" -- that was true at first
-- measurement but the table has since grown; a live re-check found FOUR periods present
-- (2026-05, 2026-06, 2026-07, 2026-08 -- 23,154 total rows). Per CLAUDE.md's standing rule ("a
-- table's min(dt) describes when the pull was first run, not what exists... never scope an
-- analysis down... because our data doesn't reach that far"), the missing qualifier is NOT a data
-- gap -- the prior-period rows needed to compute it are already sitting in this table. Per dispatch
-- #48's own instruction ("do not silently ship the weaker version"), stated explicitly rather than
-- left implicit: this rule still ships WITHOUT the recent-history qualifier THIS PASS -- the
-- reason is scope/time, not data availability. A future pass can join qsr_variance_stat against
-- itself one period back (same (loc,wrin), variance<0 last period) with no new pull required.
--
-- Sign convention determined BY MEASUREMENT, not read off the column name (dispatch #48's own
-- explicit warning: "a reversed rule detects the opposite of what it claims and passes review
-- invisibly"). Confirmed live, 2026-08-20, across every sampled qsr_variance_stat row: variance =
-- exp_usage - act_usage EXACTLY (not merely same-sign) -- so variance > 0 means actual usage came
-- in below theoretical, the gain direction this rule targets. See mapVarianceStatRow()'s own header
-- in scripts/security-rules-run.mjs for the verification method.
--
-- MEASURED 2026-08-20 (re-verified same day, second pass -- see the periods correction above),
-- live qsr_variance_stat, period 2026-08 (non-condiment, exp_usage>0):
--   Only subjects with variance>0 (a real gain) are eligible at all: 1,243 of 4,221 (29.4%).
--   Population rate among THOSE, n=1,243: median=15.22, p90=92.46, max=36234.38.
--   Peer-baseline stdev (same leave-one-out method as INV-003), n=4,200 baselines:
--     p5=0.00, p10=0.68, median=8.70 -- a MEASURABLY degenerate tail: 211 of 4,200 (5.0%) baselines
--     are EXACT ZERO stdev (vs 2 of 4,200 for INV-003's metric), and 586 (14.0%) sit below stdev 1.
--     Expected: positiveVariance is 0 for the ~70.6% shrink-side majority, so a peer population is
--     frequently mostly-zero with one or two real gains -- exactly the degenerate-baseline shape
--     dispatch #45b's min_stdev guard exists to catch. Built in from the start here, not left for
--     a live run to discover, per that dispatch's own standing lesson.
-- min_value:15 (median among eligible subjects). min_denominator:10 (same exp_usage floor).
-- min_stdev:1 -- sized to clear the exact-zero/near-zero cluster (586 baselines below 1, the 14.0%
-- this floor deliberately nulls) while leaving the median (8.70) population untouched.
insert into public.security_rules (
  rule_id, domain, subdomain, method, description, data_required, logic_type, logic_expression,
  window_days, baseline_type, threshold, severity, weight, confidence, opportunity_factor,
  corroboration_rules, exoneration_rules, false_positives, investigation_action, source, version, active
) values (
  'INV-005', 'inventory', 'phantom-gains', 'Unexplained positive inventory adjustment',
  'How much an item''s actual usage came in BELOW what the recipe predicts at a store -- a "gain" direction, unusual against other stores'' own rate for that item. A large, unusual gain can be a genuinely efficient period, or a count correction covering an earlier shortage. Does NOT yet check whether this item had a recent shortage (the plan''s own "especially" qualifier) -- not because the history is missing, but because this rule does not yet join across periods to look for it.',
  '["qsr_variance_stat"]', 'z-score',
  '{"numerator": {"field": "positiveVariance", "agg": "sum", "abs": false}, "denominator": {"field": "expUsage", "agg": "sum"}, "scale": 100, "comparator": "gte", "min_value": 15, "min_denominator": 10, "min_stdev": 1}',
  90, 'store', '{"default": 2.5}', 3, 1, 'medium', false,
  '{"INV-001"}', '{}', '["recipe/portion change reducing real usage", "a genuinely efficient shift or manager", "a delivery posted but not yet consumed", "a count correction fixing a PRIOR period''s undercount -- a real correction, not padding"]',
  'Pull the item''s count history for the flagged store/period and verify the positive adjustment against a physical recount; check whether this item carried a recent negative-variance flag this gain could be masking (not yet automated -- see this rule''s own description).',
  'plan-security-loss-prevention.md §2.2 (Inventory padding / phantom gains); memory/dispatch-48.md', 1, false
)
on conflict (tenant_id, rule_id) do nothing;
