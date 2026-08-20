-- ── Security build Phase 1e — CASH-003 re-expressed as a count rule (dispatch #44) ───────────────
-- PR #481's merge commit named this as KNOWN OPEN: CASH-003's threshold (8) is unreachable against
-- a measured max of 0.7702 -- the same defect class phase1c.sql fixed for INV-002, on a rule this
-- dispatch's own review had already forced `active = false` pending exactly this fix. Re-measured
-- live 2026-08-20 (security_findings for CASH-003, n=670, post min_denominator=250 floor): 659 of
-- 660 non-null subjects sit at EXACTLY 0.0000 -- only ONE subject in the whole estate had any
-- manual refund dollars at all in the window. This is not a bent-ruler problem (INV-001's uniform
-- 50.4%) or a wrong-units problem alone (INV-002's 77x-too-high floor) -- it's that manual
-- overrings are, as the owner has separately confirmed, a genuinely rare event, and a dollar rate
-- per $1,000 of drawer sales collapses to zero for nearly the entire population regardless of what
-- threshold sits above it. The one real spike (0.7702) is real signal a reachable dollar threshold
-- should have been able to catch -- 8 just isn't it, and there is no dollar number in this rule's
-- own measured range that would flag ONE subject out of 660 without also being trivially gameable
-- by rounding (a $0.01 manual refund on a $13 sales day scores the same shape of "rate" as a
-- legitimate one).
--
-- The fix is not a smaller dollar threshold -- it's the wrong instrument. `audit_rows` already has
-- a COUNT sibling for the identical "privileged override" event type: CASH-002 flags posOverCnt
-- (POS over-ring transaction COUNT) per 1,000 transactions, not overringAmt in dollars, and that
-- shape produces a believable 10.7% rate. `manOverringAmt`'s own API response carries the same
-- Amt/Qty pairing (`manOverringQty`) every other override category in this response already has
-- (overringAmt/overringQty, refundCashAmt/refundCashQty) -- it was simply never pulled. This
-- migration follows CASH-002's own precedent exactly: numerator switches from manualRefAmt (sum,
-- dollars) to manualRefCnt (sum, occurrences), denominator switches from drawerSales to drawerGC
-- (transactions) to match, same scale (per 1,000) and comparator. min_denominator moves from 250
-- (a drawerSales-dollars floor, meaningless once the denominator is a transaction count) to 25 --
-- CASH-002's own value, reused because it is now literally the same physical quantity (summed
-- drawerGC over the window) that floor was already measured against.
--
-- `threshold` is explicitly CLEARED, not replaced with a guessed number. manual_ref_cnt has never
-- been pulled -- it does not exist in a single row of `audit_rows` yet, so there is no measured
-- range to set a floor inside, the same discipline schema-security-rules-phase1c.sql applied to
-- INV-002 (no min_value rather than an invented one) and src/__tests__/security-rules-thresholds.
-- test.js now enforces across every rule this file family touches, not just phase1c.sql's z-score
-- pair. `resolveThreshold()` returns null with no `default` key, `evaluateRule()` returns an honest
-- `pass: null` ("no threshold configured") -- moot in practice since CASH-003 stays `active =
-- false` (unchanged by this migration; the batch job only fetches `active = true` rows at all,
-- scripts/security-rules-run.mjs:281), so this rule evaluates NOTHING until a deliberate
-- reactivation. The real threshold gets set from a live re-measurement AFTER the next
-- qsrsoft-register-audit-pull.yml run backfills manual_ref_cnt and the batch job (once reactivated)
-- has real counts to score -- guessing one now would repeat the exact mistake this migration exists
-- to undo.
--
-- Idempotent: safe to re-run. logic_expression is a full replacement (not a merge -- min_denominator
-- must change value, not accumulate), threshold likewise; both produce the identical end state on
-- every run. description is rebuilt wholesale (phase1c.sql's own style), not appended.

alter table public.audit_rows add column if not exists manual_ref_cnt numeric;

update public.security_rules
set logic_expression = '{"numerator": {"field": "manualRefCnt", "agg": "sum"}, "denominator": {"field": "drawerGC", "agg": "sum"}, "scale": 1000, "comparator": "gte", "min_denominator": 25}'::jsonb,
    threshold = '{}'::jsonb,
    description = 'Manual refund/override COUNT (manualRefCnt, dispatch #44), normalized per 1,000 transactions -- same shape as CASH-002''s posOverCnt/drawerGC ratio. Replaces the original manualRefAmt/drawerSales dollar rate (dispatch #39), which was unreachable: measured 2026-08-20, 659 of 660 non-null subjects sat at exactly 0.0000 (manual overrings are a genuinely rare event, owner-confirmed), so no dollar threshold in this rule''s own range could flag the one real subject without being trivially gameable. No threshold is set yet -- manual_ref_cnt has never been pulled (see this migration''s header); stays active=false until re-measured against real counts.',
    updated_at = now()
where tenant_id = '00000000-0000-0000-0000-000000000001'::uuid and rule_id = 'CASH-003';
