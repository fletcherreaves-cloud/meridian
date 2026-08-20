-- ── Security build Phase 1d — minimum-exposure floors for the cash rules (dispatch #42 §5) ──────
-- Widens the exposure-floor mechanism from an INV-001 special case (schema-security-rules-
-- phase1c.sql) to CASH-001..004 -- src/engine/security-rules.js already guards the denominator at
-- ONE shared choke point for both `ratio` and `threshold` LOGIC_TYPEs, so this is data (a
-- min_denominator key inside logic_expression), not an engine change. See dispatch-42.md §5's
-- amendment: "Make it rule-agnostic, not an INV-001 special case."
--
-- Why this matters MORE on the cash side than the inventory side: an inventory false positive
-- wastes an afternoon on a WRIN. A cash false positive puts a PERSON'S NAME in an investigation
-- queue. CASH-001..004 are `active = true` right now (unlike INV-001/INV-002, deactivated pending
-- this exact protection) and had never run against real audit_rows data until #487 landed 9,947
-- rows on 2026-08-20 -- their first live output was as unexamined as INV-001's originally was.
--
-- The mapping itself is verified sound (dispatch #42 §5a, re-confirmed here, not re-litigated) --
-- this is exposure-floor protection, not a correctness fix.
--
-- MEASURED 2026-08-20 against live audit_rows (28-day rolling window matching these rules'
-- window_days=28, tokenized subjects only -- the same population computeFindingsForRule() itself
-- scores):
--
--   subject grouping           denominator   n=670   already-null(=0)   floor    newly-null    survives
--   CASH-001/003/004 (per-emp)  drawerSales    670          10           250        24         636 (94.9%)
--   CASH-002 (per-emp)          drawerGC       670           7            25        23         640 (95.5%)
--
-- Neither floor comes close to nulling the estate -- both are real protection, not the rule
-- switched off. The floor's shape is corroborated at the raw-row level too: the owner's own check
-- found single DAYS with drawer_gc=1 producing a stored t_red_b_pct of up to 172 (172 T-Reds
-- against one transaction) -- that column isn't a rule input (§5a), but it's the same tiny-
-- denominator mechanism CASH-002's own posOverCnt/drawerGC ratio is exposed to, and the aggregate
-- (summed-over-window) measurement above found it materializes there too: 2 real subjects at
-- drawerGC=5 (rate 200) and drawerGC=13 (rate 1692.3), both below the 25 floor.
--
-- drawerSales floor (250) is shared across CASH-001/003/004 since it's the same physical quantity
-- (one employee's summed drawer sales over the window) for all three -- not because the engine
-- requires it; each rule still carries its own logic_expression and could diverge later if a
-- reason to differ shows up.
--
-- Idempotent: safe to re-run (jsonb merge, not a full retype -- avoids drift against whatever the
-- rest of each row's logic_expression currently is).

update public.security_rules
set logic_expression = logic_expression || '{"min_denominator": 250}'::jsonb,
    description = description || ' Exposure floor added (dispatch #42 section 5): min_denominator 250 (summed drawerSales, $) -- measured 2026-08-20 against the newly-landed audit_rows (#487): converts 24 of 670 tokenized subjects (3.6%) from a real-but-garbage rate to an honest null; 94.9% keep a real verdict.',
    updated_at = now()
where tenant_id = '00000000-0000-0000-0000-000000000001'::uuid and rule_id in ('CASH-001', 'CASH-003', 'CASH-004');

update public.security_rules
set logic_expression = logic_expression || '{"min_denominator": 25}'::jsonb,
    description = description || ' Exposure floor added (dispatch #42 section 5): min_denominator 25 (summed drawerGC, transaction count) -- measured 2026-08-20: converts 23 of 670 tokenized subjects (3.4%) from a real-but-garbage rate to an honest null (including 2 subjects at drawerGC=5/13 whose raw rates were 200 and 1692.3 -- the exact tiny-denominator pathology this floor exists to stop); 95.5% keep a real verdict.',
    updated_at = now()
where tenant_id = '00000000-0000-0000-0000-000000000001'::uuid and rule_id = 'CASH-002';
