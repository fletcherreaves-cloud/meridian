// scripts/lib/weekly-count-day.mjs — Node-side loader for the weekly-count-day fallback.
//
// Owner-directed 2026-09-01 ("utilize both"): the qsr_onhand-derived detectWeeklyCountDay()
// (src/engine/count-cycle.js) is precise but sparse; data/org-structure/Organization_Structure.xlsx's
// "Weekly Inventory Count Day" column (Locations sheet) is real, owner-entered ground truth for
// the 20 OK stores, imported by parseOrgStructureCountDays() (src/parsers/index.js) on every
// org-structure upload and persisted to Supabase org_config (saveWeeklyCountDayOverrides(),
// src/lib/supabase.js). This is the Node/script-side read of that same org_config row -- shared by
// both qsrsoft-onhand-pull.mjs and weekly-cycle-digest-send.mjs so the fallback-lookup logic lives
// once, not twice. The actual derived+fallback merge is count-cycle.js's mergeWeeklyCountDay(),
// reused as-is from here, not reimplemented.

const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Returns `{ [loc]: { weekday, weekdayName } }`, ready to pass as mergeWeeklyCountDay()'s
// `fallbackByLoc` argument. `{}` (never throws) when Supabase is unavailable, the row doesn't
// exist yet (no org-structure workbook uploaded since this feature shipped), or a value fails to
// parse as a real weekday name -- a bad fallback entry should behave like "no fallback for this
// store," never crash the pull/digest that depends on it.
export async function loadWeeklyCountDayFallback(supabase) {
  if (!supabase) return {};
  const { data, error } = await supabase.from('org_config')
    .select('data').eq('key', 'weekly_count_day_overrides').maybeSingle();
  if (error) { console.warn('[weekly-count-day] loadWeeklyCountDayFallback error:', error.message); return {}; }
  const raw = data?.data;
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [loc, weekdayName] of Object.entries(raw)) {
    const weekday = WD.indexOf(String(weekdayName || '').trim());
    if (weekday < 0) continue;
    out[loc] = { weekday, weekdayName: WD[weekday] };
  }
  return out;
}
