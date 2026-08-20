-- ── Security build Phase 1b — inventory-domain TvA rule (dispatch #40) ──────────────────────────
-- memory/dispatch-40.md, memory/plan-security-loss-prevention.md §2.2. Builds ONLY on top of
-- Phase 0b's already-correct security_rules schema/interpreter (dispatch #36) -- no change to
-- that table's shape or src/engine/security-rules.js. Same registry, same interpreter as Phase 1's
-- cash-domain rules (schema-security-rules-phase1.sql) -- do not duplicate any of it.
--
-- Idempotent: safe to re-run.
--
-- The finding that makes this buildable (verified directly against real schema/pull-script code,
-- not re-asserted from dispatch #39's stale "no theoretical-usage table exists" claim): QSRSoft
-- already computes TvA (theoretical-vs-actual) variance server-side, and Meridian already pulls
-- it daily for all 27 stores into qsr_variance_stat (supabase/schema.sql:1361-1379). exp_usage IS
-- the theoretical-usage figure -- no recipe/BOM pull needed for either rule below. Subject is a
-- STORE x ITEM (wrin), never an employee -- this table carries no emp/empToken column at all, so
-- both rules use baseline_type 'store' (security-baselines.js's storeBaseline(), the only
-- baseline function that doesn't hard-require r.emp -- personalBaseline/peerBaseline/
-- networkBaseline all do, per dispatch #40's own header, and are NOT usable for this data).
--
-- Condiment-class exclusion (applied uniformly to BOTH rules, decided in
-- scripts/security-rules-run.mjs's computeItemFindingsForRule -- not a SQL-level filter, since
-- the interpreter reads whatever rows the batch job hands it): condiment items (ri:0) have
-- dol_diff forced to 0 at map time (src/engine/eom-parsers.js's mapVarianceRows), which would
-- read as false-zero-variance on a dol_diff-based rule (INV-002) -- but even INV-001's
-- variance/exp_usage ratio, where the numerator isn't literally zeroed, is excluded too:
-- condiments' inherently low/noisy unit-usage figures make a %-rate rule on them prone to false
-- positives regardless of which numerator is used. One policy, stated once.
--
-- Field names in logic_expression below are camelCase, matching scripts/security-rules-run.mjs's
-- mapVarianceStatRow() output (expUsage, dolDiff, storeMonthSales) -- NOT qsr_variance_stat's raw
-- snake_case columns. This mirrors CASH-001..004's own convention (manualRefAmt/drawerSales, not
-- manual_ref_amt/drawer_sales): a rule's logic_expression reads whatever field names the batch
-- job's own row mapper produces, since that's what evaluateRule()'s dataContext actually carries.
-- dispatch-40.md's own rule spec writes "exp_usage" (the DB column spelling) for readability --
-- the schema here uses "expUsage" deliberately, to match what the row actually has by the time
-- evaluateRule() reads it. A snake_case field name here would silently resolve to undefined and
-- every finding would read as "no exposure" -- exactly the class of silent-zero bug CLAUDE.md's
-- loader-field-map rule exists to catch elsewhere in this codebase.

-- ── INV-001 — Item-level TvA variance rate vs. expected usage, store baseline ───────────────────
-- plan §2.2's own formula: variance_pct = (actual − theoretical) / theoretical × 100, computed
-- from qsr_variance_stat alone -- no join required. opportunity_factor false: no access/authority
-- dimension exists in this data (same finding as CASH-004 for audit_rows). Threshold (20 = 20%
-- variance) is a first guess in the same "needs tuning against real output" tier as every other
-- rule in this build -- not measured from this sandbox, per dispatch #40's own verification note.
insert into public.security_rules (
  rule_id, domain, subdomain, method, description, data_required, logic_type, logic_expression,
  window_days, baseline_type, threshold, severity, weight, confidence, opportunity_factor,
  corroboration_rules, exoneration_rules, false_positives, investigation_action, source, version, active
) values (
  'INV-001', 'inventory', 'tva-variance', 'Item TvA variance rate vs. expected usage',
  'Theoretical-vs-actual usage variance (variance / exp_usage, plan §2.2''s formula), store baseline. exp_usage is QSRSoft''s own server-computed theoretical-usage figure -- no recipe/BOM pull needed. Condiment-class (ri:0) rows excluded -- inherently low/noisy unit-usage figures make a %-rate rule on them prone to false positives (scripts/security-rules-run.mjs''s computeItemFindingsForRule).',
  '["qsr_variance_stat"]', 'ratio',
  '{"numerator": {"field": "variance", "agg": "sum", "abs": true}, "denominator": {"field": "expUsage", "agg": "sum"}, "scale": 100, "comparator": "gte"}',
  90, 'store', '{"default": 20}', 3, 1, 'medium', false,
  '{}', '{}', '["known short-dated waste event", "recipe/portion change mid-period not yet reflected in exp_usage", "count error at period boundary (see qsr_raw_item_detail count-reliability scans)"]',
  'Pull the item''s raw-item detail (qsr_raw_item_detail) for the flagged store/period and cross-reference against logged waste and transfer events for the same window.',
  'plan-security-loss-prevention.md §2.2 (Theoretical-vs-Actual); dispatch-40.md''s own verified finding that exp_usage is already QSRSoft''s computed theoretical figure', 1, true
)
on conflict (tenant_id, rule_id) do nothing;

-- ── INV-002 — Dollar-variance rate normalized against sales, store baseline ─────────────────────
-- Denominator decision (dispatch #40 explicitly required a decision, not a guess): qsr_variance_
-- stat.pct_sales' real semantics are UNCONFIRMED from this sandbox -- no comment, test, or prior
-- probe settles what QSRSoft's `percentage` field actually measures (src/engine/eom-parsers.js's
-- pctOfSales: r.percentage is itself documented as undocumented). Rather than trust an unverified
-- column as a detection rule's exposure denominator, this uses the real cross-table join instead:
-- store-month net sales (qsr_fob.prod_sales_amt, summed per (loc, period) by
-- scripts/security-rules-run.mjs's joinStoreMonthSales(), attached as storeMonthSales onto each
-- qsr_variance_stat row before evaluateRule sees it -- the interpreter itself needs zero changes,
-- it just reads whatever field logic_expression.denominator.field names). scale: 1000 matches
-- CASH-001's own per-$1,000-sales convention (dispatch #40's explicit instruction), not the
-- percentage unit INV-001 uses -- these two rules are NOT on the same scale, by design (INV-001
-- normalizes against usage, INV-002 against sales dollars). Threshold ($10/$1,000 = ~1% of sales)
-- is a first guess, unmeasured from this sandbox -- pct_sales' real semantics is the one open item
-- this dispatch explicitly flags as needing a live-data check before this threshold can be trusted.
insert into public.security_rules (
  rule_id, domain, subdomain, method, description, data_required, logic_type, logic_expression,
  window_days, baseline_type, threshold, severity, weight, confidence, opportunity_factor,
  corroboration_rules, exoneration_rules, false_positives, investigation_action, source, version, active
) values (
  'INV-002', 'inventory', 'tva-variance', 'Dollar-variance rate vs. store sales',
  'Dollarized TvA variance (dol_diff), normalized per $1,000 of store-month product sales (qsr_fob.prod_sales_amt, joined -- NOT qsr_variance_stat.pct_sales, whose real semantics are unconfirmed from this sandbox), store baseline. Condiment-class rows excluded -- dol_diff is forced to 0 for them at map time and would read as false-zero-variance otherwise.',
  '["qsr_variance_stat", "qsr_fob"]', 'ratio',
  '{"numerator": {"field": "dolDiff", "agg": "sum", "abs": true}, "denominator": {"field": "storeMonthSales", "agg": "sum"}, "scale": 1000, "comparator": "gte"}',
  90, 'store', '{"default": 10}', 3, 1, 'medium', false,
  '{"INV-001"}', '{}', '["known short-dated waste event", "recipe/portion change mid-period not yet reflected in exp_usage", "one-time high-cost item spoilage (freezer failure, delivery rejection)"]',
  'Pull the item''s dollarized variance detail for the flagged store/period and cross-reference against logged waste events and the FOB report''s Unexplained line for the same window.',
  'plan-security-loss-prevention.md §2.2 (Theoretical-vs-Actual); dispatch-40.md''s denominator decision (qsr_fob join, pct_sales unconfirmed)', 1, true
)
on conflict (tenant_id, rule_id) do nothing;
