-- ── Security build Phase 1g — CASH-003 rebuilt as an absolute dollar threshold (dispatch #48 lineage) ─
-- memory/dispatch-48.md (commit 2a02a2f, "CASH-003 RESOLVED AND LIVE"), checked in retroactively --
-- this migration matches a state the owner already applied directly against production Supabase
-- (confirmed live 2026-08-20, `updated_at: 2026-08-20T21:23:14Z`, before this file existed). Every
-- other threshold change in this build ships as a checked-in migration; this brings the repo back
-- in sync with what's actually running, per the standing convention.
--
-- phase1e.sql's own count-rule rebuild (manualRefCnt/drawerGC, dispatch #44) turned out to still be
-- the wrong instrument, discovered only after the count field itself was confirmed to not exist at
-- all (memory/finding-cash003-manoverringqty-absent-2026-08-20.md -- three independent
-- confirmations: the API response, parseRegisterAudit's own Excel header search, and the owner
-- reading the report directly). With no count field to build a count rule on, and the ORIGINAL
-- dollar RATE already proven unreachable (phase1e.sql's own measurement: 659 of 660 subjects at
-- exactly 0.0000), both a rate and a count are the wrong shape for this event.
--
-- Re-measured live 2026-08-20, 80-day backfill, 19,985 employee-days, 27 stores:
--   rows_80d  any_dollars  subjects  smallest  median_nonzero  largest  total
--      19985            6         4     $7.00          $10.00   $26.00    $70
-- SIX occurrences, FOUR employees, in the whole 80-day/27-store estate, with NO sub-dollar amounts
-- at all. For an event this rare, a rate needs a distribution it doesn't have, and a count needs a
-- count field that doesn't exist -- an ABSOLUTE dollar threshold needs neither: if essentially
-- nobody does this, any occurrence above trivial noise IS the outlier, full stop. The "trivially
-- gameable by rounding" objection that killed the original rate (a $0.01 refund on a $13 sales day
-- scores the same rate-shape as a real one) has no basis here once the denominator is dropped
-- entirely -- there is no rate to game.
--
-- logic_type flips from 'ratio' (phase1.sql's original seed) to 'threshold' -- the engine already
-- supports this shape (CASH-002/CASH-004 style comparatorValue() handling in
-- security-rules-thresholds.test.js already treats non-z-score logic_type uniformly via
-- threshold.default, so no test-harness change was needed for the shape itself, only for CASH-003's
-- own entry -- see that file). numerator reverts to manualRefAmt (dollars, dispatch #39's original
-- field) with NO denominator at all -- an absolute sum, not a rate -- so no exposure/materiality
-- floor applies (min_denominator would be meaningless with nothing to divide by).
--
-- threshold: 5 -- below the smallest observed real occurrence ($7), so it captures every real event
-- while excluding trivial noise; there IS no sub-$5 noise in the measured 80-day window to exclude in
-- practice, but the floor is set from first principles (below the smallest real event), not backed
-- into from the absence of noise. active = true -- legitimately, for the first time; CASH-003 has
-- been active=false since phase1e.sql. Expect roughly one or two subjects per 28-day window: small
-- enough to review every flag individually against manager-approval logs, not a queue to triage.
--
-- Idempotent: safe to re-run, full-literal replacement (not a merge), matching this file family's
-- established convention.

update public.security_rules
set logic_type = 'threshold',
    logic_expression = '{"field": "manualRefAmt", "agg": "sum", "comparator": "gte"}'::jsonb,
    threshold = '{"default": 5}'::jsonb,
    description = 'Manual refund / self-authorized override dollars per employee in the window, as an ABSOLUTE amount -- not a rate. Rebuilt 2026-08-20 after three independent confirmations that no count field exists (API response carries no manOverringQty, parseRegisterAudit finds no Qty column in the Excel export, and the owner confirmed the report itself has no such column), and after the original per-$1,000-sales rate proved unreachable (659 of 660 subjects at exactly 0.0000). A rate is the wrong instrument for a rare event: measured over 80 days and 19,985 employee-days across 27 stores, manual overrides occurred SIX times, by FOUR employees, totalling $70 (smallest $7, median $10, largest $26). Threshold $5 sits below the smallest observed occurrence, so it captures every real event while excluding rounding noise. The dollar value is not the signal -- authorization is. A flag here means "verify this override was approved," not "this person took $10." Expect roughly one or two subjects per 28-day window: a list to review exhaustively, not a queue to triage.',
    active = true,
    updated_at = now()
where tenant_id = '00000000-0000-0000-0000-000000000001'::uuid and rule_id = 'CASH-003';
