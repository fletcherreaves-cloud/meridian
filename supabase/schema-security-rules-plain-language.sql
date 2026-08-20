-- ── Plain-language rule descriptions (dispatch #46 §A) ────────────────────────────────────────
-- memory/dispatch-46.md Part A point 1: "Do not invent new copy where a column already holds it;
-- where the stored text is engineer-voice, rewrite the STORED text so SAGE and any future consumer
-- get the same improvement." The Security panel (src/views/security-panel.js) renders
-- security_rules.description as the always-visible per-rule explainer -- CASH-004/INV-001/INV-002's
-- stored text names internal jargon (`opportunity_factor`, `plan §2.2`, `dispatch #42/#45`,
-- migration filenames) a restaurant-floor reader has no way to parse. CASH-001/CASH-002's
-- descriptions were already close to plain and are left alone.
--
-- The FULL technical reasoning (why this threshold, what was measured, what was tried and
-- rejected) is NOT lost -- it stays exactly where it already lived, in the migration files that
-- first set these values (schema-security-rules-phase1.sql, -phase1b.sql, -phase1c.sql,
-- -phase1f.sql) and in the memory/ writeups those commits cite. This migration only replaces the
-- single DATABASE COLUMN a reader-facing UI actually renders.
--
-- Idempotent: safe to re-run -- each UPDATE sets description to its own fixed final string.

update public.security_rules
set description = 'How much promo/discount money an employee rings up, compared to how much sales they actually handle. A high rate can mean legitimate frequent price-matching or employee-meal use -- or self-authorized discounting nobody approved.',
    updated_at = now()
where tenant_id = '00000000-0000-0000-0000-000000000001'::uuid and rule_id = 'CASH-004';

update public.security_rules
set description = 'How far an item''s actual usage at a store runs from what the recipe/portioning says it should use, over the period. A high number usually means the item''s expected-usage setup in QSRSoft is wrong (a recipe change, a unit-of-measure mismatch) rather than theft -- check the item''s setup before assuming shrink.',
    updated_at = now()
where tenant_id = '00000000-0000-0000-0000-000000000001'::uuid and rule_id = 'INV-001';

update public.security_rules
set description = 'The dollar value of an item''s usage variance, sized against how much that store sold that month. Only counted when the raw dollar amount clears a real minimum -- a statistically unusual but financially tiny variance (a few dollars) is not flagged.',
    updated_at = now()
where tenant_id = '00000000-0000-0000-0000-000000000001'::uuid and rule_id = 'INV-002';
