-- ── CASH-004 — opportunity_factor TRUE, now that a role/authority column exists (dispatch #59) ──
-- schema-security-rules-phase1.sql shipped CASH-004 with opportunity_factor FALSE, examined not
-- assumed: "no role/authority column exists in audit_rows to check against yet." Dispatch #59
-- adds register_type to audit_rows (see schema-audit-rows-register-type.sql), so that stated
-- precondition is now met -- this flips the flag, per the original comment's own instruction to
-- revisit once the column exists.
--
-- 🔴 Examined, not flipped blind, per dispatch-59.md's own bar: `opportunity_factor` has ZERO
-- runtime readers today. Grepped src/engine/security-rules.js (the ONLY place logic_expression
-- gets interpreted, per its own header) -- evaluateRule()/evaluateZScoreRule() never reference
-- rule.opportunity_factor anywhere. Grepped the rest of src/ -- the only other hit is a changelog
-- prose mention (5.078.js), not live code. The column comment in schema-security-rules.sql
-- describes it as documentation -- "does this rule need an access/authority check to fire
-- meaningfully" (§1 principle 3) -- for a human reading the rules table or a future
-- corroboration-scoring feature, not a runtime gate.
--
-- So this is a METADATA correction, not a behaviour change: CASH-004's logic_expression,
-- threshold, and the population it fires against (still cashier+manager+preparer rows summed
-- together, unchanged from before this dispatch) are untouched. Nothing computes differently
-- after this UPDATE runs. If opportunity_factor ever gains a real reader, that reader inherits an
-- ALREADY-CORRECT flag on CASH-004, rather than one flipped without checking what it fires
-- against -- which is the point of examining before flipping.
--
-- Idempotent: safe to re-run.

update public.security_rules
set opportunity_factor = true,
    description = 'Promo/discount dollars (promoAmt), normalized per $1,000 of drawer sales -- flags high discount frequency relative to actual sales volume (plan §2.1 "Unauthorized discount / manager-meal abuse"). opportunity_factor is true as of dispatch #59: audit_rows now carries register_type (cashier/manager/preparer), so a promo/discount rate on a Manager-register row is checkable against that authority context -- unlike a routine crew discount, a manager''s own drawer showing an elevated promo/discount rate is closer to the plan''s "manager-meal abuse" framing this rule was written against. The rule''s own logic_expression is UNCHANGED (still sums promoAmt/drawerSales across all register types) -- this flag is descriptive metadata (src/engine/security-rules.js has no runtime reader for it today), not a behaviour change; see this file''s own header for the full "examined, not assumed" check.',
    updated_at = now()
where tenant_id = '00000000-0000-0000-0000-000000000001'::uuid and rule_id = 'CASH-004';

-- ── VERIFY ──────────────────────────────────────────────────────────────────────────────────
--   select rule_id, opportunity_factor, description from public.security_rules where rule_id = 'CASH-004';
--   -- expect: opportunity_factor = true
