-- ── Plain-language wording fix: "POS z-report" -> "POS report" (owner, 2026-11-11) ─────────────
-- "z-report" is POS-terminology jargon that reads as a typo/unexplained term to anyone outside
-- register-ops. Same pattern as schema-security-rules-plain-language.sql (dispatch #46 §A): the
-- Security panel (src/views/security-panel.js) renders security_rules.investigation_action
-- verbatim as the on-screen "Next:" action line, so the STORED text is rewritten here rather than
-- patched client-side -- SAGE and any future consumer get the same wording.
--
-- CASH-001's investigation_action was seeded once in schema-security-rules.sql and never updated
-- by any later phase migration (confirmed by reading phase1/phase1b/phase1d, which only flip
-- `active` and seed OTHER rules' investigation_action) -- this is the first UPDATE to this column.
--
-- Idempotent: safe to re-run -- sets investigation_action to its own fixed final string.

update public.security_rules
set investigation_action = 'Pull the flagged employee''s drawer-count photos for the window and compare against the POS report.',
    updated_at = now()
where tenant_id = '00000000-0000-0000-0000-000000000001'::uuid and rule_id = 'CASH-001';
