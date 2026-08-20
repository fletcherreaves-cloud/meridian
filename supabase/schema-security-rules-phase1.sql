-- ── Security build Phase 1 — real cash-domain detection rules (dispatch #39) ───────────────────
-- memory/dispatch-39.md, memory/plan-security-loss-prevention.md §2.1/§7. Builds ONLY on top of
-- Phase 0b's already-correct security_rules schema/interpreter (dispatch #36) -- no change to
-- that table's shape, CASH-001/CASH-002's logic_expression, or src/engine/security-rules.js.
--
-- Idempotent: safe to re-run. Activates the 2 existing test-fixture rules and inserts 2 new
-- ones, all still cash-domain (audit_rows-supported) -- TvA inventory variance is explicitly
-- NOT here, see dispatch-39.md's own same-day correction for why it's a later dispatch, not a
-- silent scope-cut.

-- ── Activate CASH-001/CASH-002 — no logic_expression change, just flip the fixture flag off ────
-- These shipped ACTIVE=false as dispatch #36's interpreter-round-trip test fixtures. Their
-- thresholds are unchanged (still the plan's own §2.1 first-guess numbers) -- Phase 1's job is
-- turning them on, not re-deriving them.
update public.security_rules set active = true, updated_at = now()
  where tenant_id = '00000000-0000-0000-0000-000000000001'::uuid and rule_id in ('CASH-001', 'CASH-002');

-- ── CASH-003 — Manual refund / self-authorized refund rate ─────────────────────────────────────
-- plan §2.1 "Refund/return abuse (ghost customer)". manualRefAmt (audit_rows' manOverringAmt) is
-- a privileged-override category, same class as CASH-002's POS-overring -- opportunity_factor
-- true for the same reason CASH-002 already is: correcting a transaction after tender is not
-- something every cashier is equally positioned to do routinely. baseline_type personal, matching
-- CASH-001's own choice: a rising manual-refund rate against an employee's OWN history is the
-- more direct signal than a peer comparison for this method. Threshold ($8/$1,000 sales) is a
-- first guess in the same tier as CASH-001's $5, deliberately not identical since manual refunds
-- are a rarer, higher-severity event than routine cash variance -- to be tuned against real
-- score distributions once this job has run, per the plan's own standing instruction.
insert into public.security_rules (
  rule_id, domain, subdomain, method, description, data_required, logic_type, logic_expression,
  window_days, baseline_type, threshold, severity, weight, confidence, opportunity_factor,
  corroboration_rules, exoneration_rules, false_positives, investigation_action, source, version, active
) values (
  'CASH-003', 'cash', 'refund-abuse', 'Manual refund / self-authorized refund rate',
  'Manual refund/override dollars (manualRefAmt), normalized per $1,000 of drawer sales -- a privileged-override category distinct from CASH-002''s POS-overring rate. High relative usage flags either legitimate frequent correction needs or self-authorized refund abuse (plan §2.1 "Refund/return abuse").',
  '["audit_rows"]', 'ratio',
  '{"numerator": {"field": "manualRefAmt", "agg": "sum"}, "denominator": {"field": "drawerSales", "agg": "sum"}, "scale": 1000, "comparator": "gte"}',
  28, 'personal', '{"default": 8}', 3, 1, 'medium', true,
  '{"CASH-001"}', '{}', '["documented price-match override", "manager-approved service recovery", "POS training correction"]',
  'Pull the manual-refund transaction detail for the flagged employee and cross-reference against manager-approval logs for the same window.',
  'plan-security-loss-prevention.md §2.1 (Refund/return abuse)', 1, true
)
on conflict (tenant_id, rule_id) do nothing;

-- ── CASH-004 — Promo/discount rate ──────────────────────────────────────────────────────────────
-- plan §2.1 "Unauthorized discount / manager-meal abuse". baseline_type peer, per the plan's own
-- framing: "high discount frequency relative to actual headcount on shift" is a relative-to-
-- colleagues question, not a personal-drift one. opportunity_factor FALSE, examined not assumed:
-- audit_rows carries no role/authority column (dispatch #36's documented gap, still true), and
-- unlike a manual-refund override, a standard promo/discount code is not obviously restricted to
-- a privileged subset of staff in this data -- revisit if an access model becomes available.
-- Threshold (100 = 10% of sales) is NOT invented from nothing -- it's src/utils/register-audit.js's
-- OWN existing discPct amber band (>.10 -> 'watch', >.20 -> 'crit'), already live in the Register
-- Audit table today; 100 per $1,000 sales is exactly that 10% band expressed in this rule's units.
insert into public.security_rules (
  rule_id, domain, subdomain, method, description, data_required, logic_type, logic_expression,
  window_days, baseline_type, threshold, severity, weight, confidence, opportunity_factor,
  corroboration_rules, exoneration_rules, false_positives, investigation_action, source, version, active
) values (
  'CASH-004', 'cash', 'discount-abuse', 'Promo/discount rate',
  'Promo/discount dollars (promoAmt), normalized per $1,000 of drawer sales -- flags high discount frequency relative to actual sales volume (plan §2.1 "Unauthorized discount / manager-meal abuse"). opportunity_factor is false: no role/authority column exists in audit_rows to check against yet.',
  '["audit_rows"]', 'ratio',
  '{"numerator": {"field": "promoAmt", "agg": "sum"}, "denominator": {"field": "drawerSales", "agg": "sum"}, "scale": 1000, "comparator": "gte"}',
  28, 'peer', '{"default": 100}', 2, 1, 'low', false,
  '{}', '{}', '["new promo campaign", "documented manager-approved comp", "employee meal policy explains the rate"]',
  'Pull the Meal Activity log for the flagged employee and compare discount transactions against the employee meal policy and scheduled hours.',
  'plan-security-loss-prevention.md §2.1 (Unauthorized discount / manager-meal abuse); threshold sourced from src/utils/register-audit.js''s existing discPct amber band (>10%)', 1, true
)
on conflict (tenant_id, rule_id) do nothing;
