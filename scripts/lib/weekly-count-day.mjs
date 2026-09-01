// scripts/lib/weekly-count-day.mjs — Node-side loader for the weekly-count-day fallback.
//
// Owner-directed 2026-09-01 ("utilize both"): the qsr_onhand-derived detectWeeklyCountDay()
// (src/engine/count-cycle.js) is precise but sparse; data/org-structure/Organization_Structure.xlsx's
// "Weekly Inventory Count Day" column (Locations sheet) is real, owner-entered ground truth for
// the 20 OK stores, imported by parseOrgStructureCountDays() (src/parsers/index.js) on every
// org-structure upload and persisted to Supabase (saveWeeklyCountDayOverrides(),
// src/lib/supabase.js) in a REAL TABLE, `weekly_count_day_overrides`
// (supabase/schema-weekly-count-day.sql -- owner-requested 2026-09-01: "add it to a table so it
// is persisted", replacing this feature's first-shipped org_config-blob draft). This is the
// Node/script-side read of that same table -- shared by both qsrsoft-onhand-pull.mjs and
// weekly-cycle-digest-send.mjs so the fallback-lookup logic lives once, not twice. The actual
// derived+fallback merge is count-cycle.js's mergeWeeklyCountDay(), reused as-is from here, not
// reimplemented.

// Returns `{ [loc]: { weekday, weekdayName } }`, ready to pass as mergeWeeklyCountDay()'s
// `fallbackByLoc` argument. `{}` (never throws) when Supabase is unavailable, the table doesn't
// exist yet (schema-weekly-count-day.sql not yet run in the Supabase SQL editor), or is simply
// empty (no org-structure workbook uploaded since this feature shipped) -- a missing fallback
// should behave like "no fallback for this store," never crash the pull/digest that depends on it.
export async function loadWeeklyCountDayFallback(supabase) {
  if (!supabase) return {};
  const { data, error } = await supabase.from('weekly_count_day_overrides').select('loc,weekday,weekday_name');
  if (error) { console.warn('[weekly-count-day] loadWeeklyCountDayFallback error:', error.message); return {}; }
  const out = {};
  for (const r of (data || [])) out[r.loc] = { weekday: r.weekday, weekdayName: r.weekday_name };
  return out;
}
