-- ═══════════════════════════════════════════════════════════════════════════════
-- DISPATCH #142 — yearly_targets: add prod_sales + crew_labor_pct
--
-- ⚠️ OWNER ACTION REQUIRED: run this against the live Supabase project (SQL editor)
-- for the Performance Review Sales/Labor target fix (dispatch #142 items 1-3) to
-- take effect. The application code (src/lib/supabase.js) already tries to write
-- these two columns and degrades gracefully (retries without them, logging a clear
-- warning) if this migration hasn't run yet — so nothing breaks either way, but the
-- fix has no effect until this runs.
--
-- ROOT CAUSE (measured against live production Supabase 2026-08-25, not assumed):
--   parseYearlyTargets() (src/parsers/index.js) already parses BOTH the workbook's
--   Product Sales column (-> tProdSales) and Crew Labor % column (-> tCrewLabor)
--   correctly, with full decimal precision. But dispatch #107's original
--   yearly_targets schema + saveYearlyTargets()/_yearlyRowToTargets() never
--   persisted either field — confirmed by curl'ing the live table (`select=*`
--   returns no prod_sales/crew_labor_pct-shaped key at all, not even null) and by
--   reading dispatch #107's own persistence test (yearly-targets-persistence.test.js),
--   whose field list deliberately excludes both. So a freshly-uploaded yearly
--   workbook's real Sales/Labor targets were visible for the rest of THAT session
--   only, then silently reverted to the DEFAULT_TARGETS (constants.js) fallback on
--   the next login/device/reload — which is stale for several stores (measured
--   ~3x too small vs a real recent month's actual sales for multiple high-volume
--   stores) and explains "sales not correct" / "target roughly 4-14x too small"
--   from the owner's screenshot far more precisely than review-engine.js's own
--   dead lr-based bypass (see that file's dispatch #142 comment — verified
--   unreachable with the current data model before being removed).
--
--   Labor is the same shape but with a field-NAME mismatch on top: the monthly
--   workbook's "Crew Labor %" column already persists correctly as
--   monthly_targets.crew_labor_pct -> tCrewLabor (labor-basis.js's
--   DEFAULT_LABOR_BASIS — the org's decided-authoritative labor field, #153), but
--   review-engine.js's REVIEW_METRIC_TARGET_FIELD.labor was reading the legacy
--   'tLabor' field instead (fixed in the same dispatch #142 commit) — which only
--   ever had a YEARLY-tier column (labor_pct), never a monthly one, so a real
--   monthly-uploaded labor target could never reach Performance Review regardless
--   of this migration. Adding crew_labor_pct here closes the last gap: the yearly
--   tier now also carries tCrewLabor, so DEFAULT < yearly < monthly all resolve
--   through the SAME field name end-to-end.
--
-- Precedence unchanged: DEFAULT_TARGETS < yearly_targets < monthly_targets <
-- target_overrides (review-engine.js mergedTargetsForLoc/mergedTargetsForLocMonth).
-- ═══════════════════════════════════════════════════════════════════════════════

alter table public.yearly_targets
  add column if not exists prod_sales      float,  -- Product Sales $ (annual) — parseYearlyTargets' tProdSales
  add column if not exists crew_labor_pct  float;  -- Crew Labor % — parseYearlyTargets' tCrewLabor (labor-basis.js's authoritative field)

comment on column public.yearly_targets.prod_sales is
  'Product Sales $ target from the yearly workbook (parseYearlyTargets -> tProdSales). Added dispatch #142 — previously parsed but never persisted, so a fresh upload''s real value silently reverted to the (often stale) DEFAULT_TARGETS fallback on the next login/device.';
comment on column public.yearly_targets.crew_labor_pct is
  'Crew Labor % target from the yearly workbook (parseYearlyTargets -> tCrewLabor) — the org''s authoritative labor basis (labor-basis.js DEFAULT_LABOR_BASIS), not the legacy tLabor field. Added dispatch #142 so Performance Review''s Labor metric has a working yearly tier that agrees with monthly_targets.crew_labor_pct on the same field name.';
