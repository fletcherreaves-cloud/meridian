-- ── INV-004 — Waste-log padding / spoilage masking (dispatch #48/#50 lineage) ───────────────────
-- memory/dispatch-48.md's own amended text (checked live before building, not re-derived): the
-- "no day-part sales denominator" blocker from the original brief was NOT real -- qsr_daily_activity
-- already carries net_sales/product_sales/transactions per (loc, dt, hour_slot), an hourly grain,
-- finer than day-part. Same failure shape as manOverringQty -- a reasonable-sounding "we don't have
-- X" one look at the schema refutes.
--
-- Scope: manager x day-part x store, NOT item-level -- qsr_waste has no wrin (event-level, not
-- per-item), so the plan's literal "group waste logs by item" cannot come from this table.
-- Item-level waste is INV-003's own territory (qsr_variance_stat.raw_waste/comp_waste). This is
-- the third subject grain in this build, beyond (loc,empToken) and (loc,wrin) -- see
-- schema-security-findings-daypart.sql (the additive daypart column that makes it possible without
-- a fourth subject-type branch on security_findings' own check constraint).
--
-- IDENTITY: qsr_waste.emp_token (schema-identity-vault-qsr-waste.sql, PR #498) is the only
-- identity this rule ever reads -- never the plaintext eID in qsr_waste.manager. NOTE, stated
-- plainly per that migration's own header: qsr_waste.manager is an eID, audit_rows.emp is a name,
-- so this rule's manager subjects will NOT cross-reference with that same person's CASH findings
-- under one emp_token until dispatch #49's re-key lands (Phase 0 of #49 has not run as of this
-- migration -- checked live before writing this note, not assumed).
--
-- ── Boundary, measured not assumed ───────────────────────────────────────────────────────────
-- qsr_waste.busn_dt is treated as ALREADY business-date-aligned (same convention
-- qsr_daily_activity.dt uses) -- joined DIRECTLY, no calendar-to-business-date shift applied.
-- Checked live 2026-08-20: 0 of 26,443 qsr_waste rows carry a busn_tm in 00:00-03:59, the one
-- window that would distinguish "already shifted" from "raw calendar date." This is NOT because
-- the business is closed then -- qsr_daily_activity confirms real overnight activity at 26 stores
-- in that exact wall-clock window (238,781 transactions measured) -- it means waste specifically
-- isn't logged there. With no live counter-example either way, this follows the two remaining
-- signals: the column's own name (busn_dt = business date) and qsr_daily_activity's own already-
-- established 4am->4am alignment (hour_slot 05:00->28:00, dar-vs-ops-reconciliation.md). Day-part
-- bucketing reuses daypartOf() (src/engine/labor-standard.js, the VLH guide's own boundaries) --
-- not a second, invented boundary set -- wrapping busn_tm's wall-clock hour into that same
-- 05:00->28:00 shape (see daypartFromBusnTm(), scripts/security-rules-run.mjs).
--
-- ── MEASURED 2026-08-20, live qsr_waste x qsr_daily_activity join, 2026-05-01 through 2026-08-20 ──
-- (grouping key for this measurement pass used the raw eID -- manager -- since qsr_waste.emp_token
-- does not exist on the live table yet as of this migration; PR #498's vault-extension column has
-- not been applied to production. The measured DISTRIBUTIONS are grouping-key-independent -- the
-- underlying dollar amounts and sales figures are identical regardless of which identity field
-- labels each bucket -- so the thresholds below hold once emp_token is live; only the raw eID
-- itself, never persisted or logged, was used to compute them.)
--   rate = wasteAmt / daypartSales * 1000 (dollars of waste per $1,000 of that day-part's sales):
--     n=636 subjects (post min_denominator=250 floor), min=0.03, p10=4.35, p50=12.99, p90=47.06,
--     p99=450.95, max=1274.79.
--   daypartSales (denominator): 23 of 687 raw subjects had salesSum <= 0 (a real DAR data-quality
--     artifact -- some (loc,dt,daypart) buckets sum to a small negative product_sales, likely a
--     void/return-heavy window) -- min_denominator excludes all of these along with the genuinely
--     tiny-exposure tail; p10 of the full (unfiltered) population is 666.29, so 250 sits
--     comfortably below it, a "clears the negatives and the tiny tail, not aggressive" floor,
--     matching this build's own established methodology.
--   Peer-baseline stdev (per-daypart, leave-one-out across stores, n>=5 peers), n=128 baselines:
--     p5=5.83, p10=5.96, median=7.40. Zero exact-zero, zero below 1 -- a well-behaved distribution,
--     unlike INV-005's positiveVariance metric. Checked BEFORE shipping per dispatch #45b's own
--     standing lesson (pre-empt the degenerate-baseline class, don't wait for a live |z|>10 to
--     find it) -- this metric does not show that shape, so min_stdev:1 here is a genuine no-op
--     safety net, not a working floor.
-- min_value:13 (population median, "clears roughly half," this build's own established
-- methodology). min_denominator:250. min_stdev:1 (comfortably below p5=5.83).
insert into public.security_rules (
  rule_id, domain, subdomain, method, description, data_required, logic_type, logic_expression,
  window_days, baseline_type, threshold, severity, weight, confidence, opportunity_factor,
  corroboration_rules, exoneration_rules, false_positives, investigation_action, source, version, active
) values (
  'INV-004', 'inventory', 'waste-log-padding', 'Waste dollars per day-part sales dollar, by closing manager',
  'How much a manager''s logged waste, in a specific part of the day (Breakfast/Lunch/Afternoon/Dinner/Late Night), compares to what other stores'' managers log for that same part of the day -- unusual against other stores'' own rate. A large, unusual amount can be genuine spoilage on a slow day, or waste logs padded to cover product removed after close. Item-level detail is not available from this signal -- pair with INV-003 (variance unmatched by logged waste) for item-specific evidence on the same manager''s store.',
  '["qsr_waste", "qsr_daily_activity"]', 'z-score',
  '{"numerator": {"field": "wasteAmt", "agg": "sum"}, "denominator": {"field": "daypartSales", "agg": "sum"}, "scale": 1000, "comparator": "gte", "min_value": 13, "min_denominator": 250, "min_stdev": 1}',
  28, 'store', '{"default": 2.5}', 3, 1, 'medium', false,
  '{"INV-003"}', '{}', '["a genuinely slow day-part with real spoilage", "a store-wide promo or event depressing that day-part''s sales without a matching drop in prep volume", "a new item launch with higher-than-usual waste during the learning curve", "an edited waste log correcting an earlier entry error, not padding"]',
  'Pull the manager''s waste log (qsr_waste) for the flagged store/day-part/window and cross-reference against that day-part''s POS void/comp activity; check whether this manager''s store also shows an INV-003 flag on an item the same day-parts would touch.',
  'plan-security-loss-prevention.md §2.2 (Waste-log padding / spoilage masking); memory/dispatch-48.md; memory/dispatch-50.md', 1, false
)
on conflict (tenant_id, rule_id) do nothing;
