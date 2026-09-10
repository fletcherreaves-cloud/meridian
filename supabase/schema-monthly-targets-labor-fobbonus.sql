-- ═══════════════════════════════════════════════════════════════════════════════
-- MONTHLY TARGETS -- persist labor_pct + fob_bonus_base_pct (GH #164 triage finding 1,
-- narrowed 2026-09-10 against current code)
--
-- #164's 2026-08-11 triage flagged parseMonthlyTargets() as extracting 8 fields
-- (tLabor/tOepe/tPark/tKvst/tKvsu/tR2p/tOsat/tOsatB2B) that saveMonthlyTargets() silently
-- dropped -- "scores can change between uploading the monthly file and refreshing the page."
-- Re-measured against CURRENT code (not the Aug-11 snapshot) before touching anything, per
-- CLAUDE.md's "measure it, don't reason about it" rule: parseMonthlyTargets() (src/parsers/
-- index.js) no longer produces tOepe/tPark/tKvst/tKvsu/tR2p/tOsat/tOsatB2B at all -- those now
-- live only in the separate parseYearlyTargets(). The real, current gap is narrower but still
-- live: parseMonthlyTargets() DOES produce t.tLabor and t.tFOBBonusBase, and
-- src/lib/supabase.js's saveMonthlyTargets() does not persist either one.
--
-- t.tLabor is the exact field GH #164's migration is about (the legacy "Combined Labor %"
-- reader, vs. the authoritative t.tCrewLabor) -- until that 69-reader migration lands, any
-- surface still reading t.tLabor silently falls back to DEFAULT_TARGETS the moment the page
-- reloads after an upload, because the in-memory value from the just-parsed workbook never made
-- it to Supabase. t.tFOBBonusBase ("Bonus Food Over Base Target") has the same drop, narrower
-- blast radius.
--
-- Purely additive: two new nullable columns, no data migration, no change to any existing
-- column or row. Existing NULL rows (every row before this ships) fall through the same
-- _stripNullTargets()-then-DEFAULT_TARGETS path they do today -- zero behavior change until the
-- next monthly-targets upload actually carries a value for either field.
alter table public.monthly_targets
  add column if not exists labor_pct         float, -- Combined Labor % (legacy; see GH #164)
  add column if not exists fob_bonus_base_pct float; -- Bonus Food Over Base Target
