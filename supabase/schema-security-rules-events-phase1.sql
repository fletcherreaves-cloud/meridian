-- ── Security rules, 'events' domain — qsr_security_events-sourced rules (dispatch 2026-11-09) ───
-- memory/design-security-events-risk-rules-2026-11-09.md. Extends the existing registry
-- (schema-security-rules*.sql) with the first rules sourced from qsr_security_events (landed
-- PR #1765/#1766, 113,782 real rows) -- NOT a new engine, NOT a new panel. Same
-- security_rules/security_findings/security-rules.js/security-panel.js every CASH-*/INV-*/
-- LABOR-* rule already uses.
--
-- Deliberately does NOT re-score all_promo/t_red_before/t_red_after/cash_refund/cashless_refund
-- -- those are already covered by active CASH-002/003/004 reading audit_rows (the Register Audit
-- pull, a different QSRSoft endpoint), confirmed by reading audit_rows' own field list
-- (tRedACnt/tRedBCnt/refundCash/refundCashless/promoAmt all already exist there) before writing
-- this file, per the design doc's own "what's already covered" section. Re-scoring those here
-- would be a duplicate rule on an already-covered signal, not new coverage.
--
-- EVENT-001/002: crew_token subject, employee_meal/manager_meal event rate -- no equivalent field
-- exists anywhere in audit_rows, genuinely new signal.
-- EVENT-003: mgr_token subject, pos_overring rate -- audit_rows' own posOverCnt is scored on the
-- CASHIER (CASH-002); this is a different accountability axis (which MANAGER's code authorized
-- the override), something audit_rows cannot provide (no manager column on it at all).
--
-- Denominator is distinct POS sessions worked (pos_session_start_dt/tm, already on every row) --
-- qsr_security_events carries no sales/GC column, so the dollar/transaction-normalized convention
-- CASH-*/INV-* use doesn't directly apply; "events per 1,000 sessions worked" is the nearest
-- available-today normalization, computed by scripts/security-rules-run.mjs's own aggregator
-- (no join, no new pull).
--
-- data_required uses "qsr_security_events" (crew subject) and "qsr_security_events:manager" (mgr
-- subject) -- a QUALIFIED VARIANT of the one real table name, not a second fake table, so the
-- compute job's dispatcher (supportsSecurityEventsCrew/Mgr) can tell the two subject grains apart
-- from data_required alone, same as every other rule-type branch in that file.
--
-- ACTIVE = FALSE on all three, same posture schema-security-rules-labor.sql's LABOR-001/002/003
-- already established for a rule whose thresholds are a first guess never yet measured against
-- this org's real data -- do not flip active=true blind; run scripts/security-rules-run.mjs
-- against the live backfill first and look at the actual value distribution.

insert into public.security_rules (
  rule_id, domain, subdomain, method, description, data_required, logic_type, logic_expression,
  window_days, baseline_type, threshold, severity, weight, confidence, opportunity_factor,
  corroboration_rules, exoneration_rules, false_positives, investigation_action, source, version, active
) values (
  'EVENT-001', 'events', 'employee-meal-rate', 'Employee-meal event rate',
  'employee_meal event count from qsr_security_events, normalized per 1,000 POS sessions worked. No equivalent field exists in audit_rows -- this is a genuinely new signal, not a re-score of an existing CASH rule. Subject is the crew_token who RANG the transaction (the only identity the raw row supports); not yet verified as who received the meal.',
  '["qsr_security_events"]', 'ratio',
  '{"numerator": {"field": "employeeMealCnt", "agg": "sum"}, "denominator": {"field": "sessionCnt", "agg": "sum"}, "scale": 1000, "comparator": "gte", "min_denominator": 5}',
  28, 'peer', '{"default": 50}', 2, 1, 'low', false,
  '{}', '{}', '["documented employee meal policy change", "shift-meal promotion", "new hire orientation week"]',
  'Pull the flagged crew member''s employee-meal transactions for the window and compare against the posted employee meal policy and scheduled hours.',
  'memory/design-security-events-risk-rules-2026-11-09.md', 1, false
)
on conflict (tenant_id, rule_id) do nothing;

insert into public.security_rules (
  rule_id, domain, subdomain, method, description, data_required, logic_type, logic_expression,
  window_days, baseline_type, threshold, severity, weight, confidence, opportunity_factor,
  corroboration_rules, exoneration_rules, false_positives, investigation_action, source, version, active
) values (
  'EVENT-002', 'events', 'manager-meal-rate', 'Manager-meal event rate',
  'manager_meal event count from qsr_security_events, normalized per 1,000 POS sessions worked. Same shape as EVENT-001, separate event_token -- no equivalent field exists in audit_rows. Subject is the crew_token who RANG the transaction, same open semantic note as EVENT-001.',
  '["qsr_security_events"]', 'ratio',
  '{"numerator": {"field": "managerMealCnt", "agg": "sum"}, "denominator": {"field": "sessionCnt", "agg": "sum"}, "scale": 1000, "comparator": "gte", "min_denominator": 5}',
  28, 'peer', '{"default": 50}', 2, 1, 'low', false,
  '{}', '{}', '["documented manager meal policy", "shift-meal promotion"]',
  'Pull the flagged crew member''s manager-meal transactions for the window and compare against the posted policy and manager schedule.',
  'memory/design-security-events-risk-rules-2026-11-09.md', 1, false
)
on conflict (tenant_id, rule_id) do nothing;

insert into public.security_rules (
  rule_id, domain, subdomain, method, description, data_required, logic_type, logic_expression,
  window_days, baseline_type, threshold, severity, weight, confidence, opportunity_factor,
  corroboration_rules, exoneration_rules, false_positives, investigation_action, source, version, active
) values (
  'EVENT-003', 'events', 'manager-pos-override-authorization', 'Manager-authorized POS-override rate',
  'pos_overring event count from qsr_security_events, subject is mgr_token (the MANAGER whose code authorized the override), normalized per 1,000 POS sessions that manager''s code appeared in. CASH-002 already scores the cashier''s own POS-over rate from audit_rows -- this is a different accountability axis audit_rows cannot provide at all (no manager column on it). opportunity_factor true: authorizing an override is itself a privileged action, same class as CASH-002/CASH-003''s own opportunity_factor.',
  '["qsr_security_events:manager"]', 'ratio',
  '{"numerator": {"field": "posOverringCnt", "agg": "sum"}, "denominator": {"field": "sessionCnt", "agg": "sum"}, "scale": 1000, "comparator": "gte", "min_denominator": 5}',
  28, 'store', '{"default": 100}', 3, 1, 'medium', true,
  '{}', '{}', '["new POS rollout", "documented equipment malfunction", "manager training on overrides"]',
  'Pull the flagged manager''s authorized-override transactions for the window and compare against the register''s own exception log.',
  'memory/design-security-events-risk-rules-2026-11-09.md', 1, false
)
on conflict (tenant_id, rule_id) do nothing;
