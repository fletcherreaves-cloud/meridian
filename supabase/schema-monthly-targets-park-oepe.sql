-- ── monthly_targets: add park_pct, oepe_target ───────────────────────────────
-- Issue #174 (#184 dispatch item 2). Priority pair — see the issue's owner-delegated decision
-- comment (2026-08-11): four of computeOpsScore's six scored targets (tOepe, tKvst, tKvsu,
-- tPark) had no cloud path at all, reaching the scorer only from constants.js's hardcoded
-- DEFAULT_TARGETS. tPark and tOepe go first because #181's deferred park re-baseline is
-- explicitly gated on this migration landing (memory/project-backlog.md #181 entry: "a
-- spreadsheet upload once #174 lands, not a deploy"). tKvst/tKvsu/tR2p/tOsat/tOsatB2B are a
-- follow-up. tLabor is deliberately NOT included — #164 is migrating the labor basis to
-- tCrewLabor, and persisting tLabor too would add a seventh competing labor number; hold until
-- #164 lands and decide then whether it should exist at all.
--
-- Also corrects the issue body's premise, found while implementing (not assumed): the quoted
-- code excerpt at "src/parsers/index.js:783-800" is parseYearlyTargets, not parseMonthlyTargets
-- — parseMonthlyTargets did not extract tOepe/tPark/tKvst/tKvsu/tR2p/tOsat at all before this
-- change (verified by reading its column-detection object, which had no entries for them). The
-- structural gap the issue flags (no cloud path for these four scored targets) is real and
-- confirmed independently; the parseMonthlyTargets/saveMonthlyTargets divergence as literally
-- described was not — this migration is what makes parseMonthlyTargets able to extract them at
-- all, not just what makes saveMonthlyTargets stop dropping them.
--
-- Whether the real monthly workbook has Park/OEPE columns is UNVERIFIED from this sandbox (no
-- file access) — parseMonthlyTargets's new column-detection reuses the exact header strings
-- already proven correct in parseYearlyTargets ('OEPE\nPACE'/'OEPE PACE', 'Park %'), which is
-- the only evidence available; if the monthly sheet uses different header text, extraction
-- silently finds nothing (same no-op-if-absent behavior every other field in this parser
-- already has) rather than failing. Owner should confirm against the real file.
alter table public.monthly_targets add column if not exists park_pct float;
alter table public.monthly_targets add column if not exists oepe_target float;

comment on column public.monthly_targets.park_pct is
  'Park % target. Monthly-sheet column header "Park %" (same as parseYearlyTargets).';
comment on column public.monthly_targets.oepe_target is
  'OEPE target, in seconds. Monthly-sheet column header "OEPE PACE" (same as parseYearlyTargets).';
