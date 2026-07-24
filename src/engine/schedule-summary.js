// @ts-nocheck
// ── LifeLenz Weekly Schedule Summary ──────────────────────────────────────────
// Reconstructs the "top section" band of the LifeLenz weekly schedule screen
// (Labor % Sales, Sales Forecast, GC Forecast, Scheduled vs Forecast hours + the
// daily over/unders, Fixed Labor %, Schd TPMH) from the daily rows Meridian ALREADY
// syncs into lifelenz_schedule — verified to reconcile to the penny/minute against a
// real store week (see src/__tests__/schedule-summary.test.js). No new pull needed
// for the band; the per-job hours+cost breakdown is a separate LifeLenz endpoint.

const _normLoc = l => String(parseInt(String(l ?? '').replace(/\D/g, ''), 10) || '');
const _n = v => (typeof v === 'number' && isFinite(v)) ? v : 0;
// LifeLenz business week for this org begins WEDNESDAY (verified: "Week Beginning
// Jul 22 2026" = a Wednesday). Change here if a future org uses a different anchor.
export const WEEK_START_DOW = 3;

export function weekStartOf(date) {
  const d = date instanceof Date ? new Date(date) : new Date(String(date));
  d.setHours(12, 0, 0, 0);
  const diff = (d.getDay() - WEEK_START_DOW + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}
const _wkKey = d => weekStartOf(d).toISOString().slice(0, 10);

// Scheduled / forecast hours for one daily row (hours, decimal).
const schedHrsOf = r => _n(r.schVLH) + _n(r.schFixHrs) + _n(r.schFloor);
const fcstHrsOf  = r => _n(r.projVLH) + _n(r.fixGuideHrs) + _n(r.projFloor);

// Daily labor % is an ACTUAL figure: null on future days, and wildly high on the
// CURRENT (partial) day — labor has accrued but the day's sales haven't landed yet,
// so a mid-day pull can read 400%+. Normalize to percent scale and drop nulls +
// out-of-band partial/garbage days so they don't dominate the weekly dollar-weighted
// average. Real QSR weekly labor % lives ~15–35%; anything >70% is a partial day.
const LABOR_PCT_MIN = 3, LABOR_PCT_MAX = 70;
function normLaborPct(raw) {
  if (raw == null || !isFinite(raw)) return null;
  const f = Math.abs(raw) <= 1.5 ? raw * 100 : raw; // accept fraction (0.245) or percent (24.5)
  return (f >= LABOR_PCT_MIN && f <= LABOR_PCT_MAX) ? f : null;
}

// Fixed / Floor labor standards (owner-confirmed 2026-07-24, viewed SEPARATELY):
//   • Fixed Hours  should be 10–15% of total scheduled hours.
//   • Floor Hours  should be 10–15% of total scheduled hours.
//   • Combined (Fixed + Floor) must NOT exceed 25% of total scheduled hours.
// Bands drive the color flags in the UI (in-band / out-of-band / combined breach).
export const FIXED_FLOOR_SEG_MIN = 0.10, FIXED_FLOOR_SEG_MAX = 0.15, FIXED_FLOOR_COMBINED_MAX = 0.25;

// Roll a set of daily rows (one store, one week) into the band.
function rollup(loc, rows) {
  let fcstSales = 0, fcstGC = 0, schedHrs = 0, fcstHrs = 0, fixHrs = 0, floorHrs = 0, laborPctW = 0, laborSalesW = 0;
  const days = rows
    .slice()
    .sort((a, b) => a.date - b.date)
    .map(r => {
      const sH = schedHrsOf(r), fH = fcstHrsOf(r);
      fcstSales += _n(r.fcstSales); fcstGC += _n(r.fcstTCs);
      schedHrs += sH; fcstHrs += fH; fixHrs += _n(r.schFixHrs); floorHrs += _n(r.schFloor);
      const lp = normLaborPct(r.laborPct); // % scale, or null for future/partial/garbage days
      if (lp != null) { laborPctW += lp * _n(r.fcstSales); laborSalesW += _n(r.fcstSales); }
      return { date: r.date, schedHrs: sH, fcstHrs: fH, hrsDiff: sH - fH, laborPct: lp, fcstSales: r.fcstSales, fcstGC: r.fcstTCs };
    });
  return {
    loc,
    fcstSales, fcstGC,
    schedHrs, fcstHrs, hrsDiff: schedHrs - fcstHrs,
    // Dollar-weighted labor % over the completed (valid) days only — never a straight
    // average of daily %s, and never contaminated by the current partial day. % scale.
    laborPct: laborSalesW > 0 ? laborPctW / laborSalesW : null,
    tpmh: schedHrs > 0 ? fcstGC / schedHrs : null,
    // Fixed / Floor labor as a share of scheduled hours (hours-based). Kept SEPARATE per
    // the owner standard; combined is what the ≤25% cap applies to. Labeled as such in UI.
    fixHrs, floorHrs,
    fixedLaborPct: schedHrs > 0 ? fixHrs / schedHrs : null,
    floorLaborPct: schedHrs > 0 ? floorHrs / schedHrs : null,
    combinedFixedFloorPct: schedHrs > 0 ? (fixHrs + floorHrs) / schedHrs : null,
    days,
    nDays: days.length,
  };
}

// computeScheduleSummary(schedRows) → { weeks:[{weekStart, weekKey, stores:[…], district}], … }
// Weeks newest-first; stores sorted by scheduled-vs-forecast gap (most over first).
export function computeScheduleSummary(schedRows, opts = {}) {
  const rows = (schedRows || []).filter(r => r && r.date && (r.fcstSales != null || r.schVLH != null || r.projVLH != null));
  const byWeek = {};
  for (const r of rows) {
    const wk = _wkKey(r.date);
    const loc = _normLoc(r.loc);
    (byWeek[wk] || (byWeek[wk] = {}));
    (byWeek[wk][loc] || (byWeek[wk][loc] = [])).push(r);
  }
  const weeks = Object.keys(byWeek).sort((a, b) => b.localeCompare(a)).map(wk => {
    const stores = Object.keys(byWeek[wk]).map(loc => rollup(loc, byWeek[wk][loc]));
    stores.sort((a, b) => (b.hrsDiff) - (a.hrsDiff)); // most over-scheduled first
    // District rollup (dollar/hour weighted).
    let dSales = 0, dGC = 0, dSched = 0, dFcst = 0, dFix = 0, dFloor = 0, dLaborD = 0, dLaborSales = 0;
    for (const s of stores) { dSales += s.fcstSales; dGC += s.fcstGC; dSched += s.schedHrs; dFcst += s.fcstHrs; if (s.laborPct != null) { dLaborD += s.laborPct * s.fcstSales; dLaborSales += s.fcstSales; } dFix += _n(s.fixHrs); dFloor += _n(s.floorHrs); }
    const district = {
      nStores: stores.length,
      fcstSales: dSales, fcstGC: dGC, schedHrs: dSched, fcstHrs: dFcst, hrsDiff: dSched - dFcst,
      // District labor % dollar-weighted over stores that have a valid weekly labor %.
      laborPct: dLaborSales > 0 ? dLaborD / dLaborSales : null,
      tpmh: dSched > 0 ? dGC / dSched : null,
      // Fixed / Floor as a share of district scheduled hours (ratio-of-aggregates, not
      // an average of store %s). Kept separate; combined is what the ≤25% cap applies to.
      fixHrs: dFix, floorHrs: dFloor,
      fixedLaborPct: dSched > 0 ? dFix / dSched : null,
      floorLaborPct: dSched > 0 ? dFloor / dSched : null,
      combinedFixedFloorPct: dSched > 0 ? (dFix + dFloor) / dSched : null,
    };
    return { weekKey: wk, weekStart: weekStartOf(wk + 'T12:00:00'), stores, district };
  });
  return { weeks };
}
