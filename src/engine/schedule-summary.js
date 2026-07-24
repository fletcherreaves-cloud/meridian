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

// Roll a set of daily rows (one store, one week) into the band.
function rollup(loc, rows) {
  let fcstSales = 0, fcstGC = 0, schedHrs = 0, fcstHrs = 0, fixHrs = 0, laborDollars = 0;
  const days = rows
    .slice()
    .sort((a, b) => a.date - b.date)
    .map(r => {
      const sH = schedHrsOf(r), fH = fcstHrsOf(r);
      fcstSales += _n(r.fcstSales); fcstGC += _n(r.fcstTCs);
      schedHrs += sH; fcstHrs += fH; fixHrs += _n(r.schFixHrs);
      laborDollars += _n(r.laborPct) * _n(r.fcstSales); // weight by sales; unit of laborPct (frac or %) passes through unchanged
      return { date: r.date, schedHrs: sH, fcstHrs: fH, hrsDiff: sH - fH, laborPct: r.laborPct, fcstSales: r.fcstSales, fcstGC: r.fcstTCs };
    });
  return {
    loc,
    fcstSales, fcstGC,
    schedHrs, fcstHrs, hrsDiff: schedHrs - fcstHrs,
    // Dollar-weighted labor % (Σ labor$ / Σ sales$) — never a straight average of daily %s.
    laborPct: fcstSales > 0 ? laborDollars / fcstSales : null,
    tpmh: schedHrs > 0 ? fcstGC / schedHrs : null,
    // Fixed labor as a share of scheduled hours (hours-based). Labeled as such in UI.
    fixedLaborPct: schedHrs > 0 ? fixHrs / schedHrs : null,
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
    let dSales = 0, dGC = 0, dSched = 0, dFcst = 0, dFix = 0, dLaborD = 0;
    for (const s of stores) { dSales += s.fcstSales; dGC += s.fcstGC; dSched += s.schedHrs; dFcst += s.fcstHrs; dLaborD += (s.laborPct || 0) * s.fcstSales; dFix += (s.fixedLaborPct || 0) * s.schedHrs; }
    const district = {
      nStores: stores.length,
      fcstSales: dSales, fcstGC: dGC, schedHrs: dSched, fcstHrs: dFcst, hrsDiff: dSched - dFcst,
      laborPct: dSales > 0 ? dLaborD / dSales : null,
      tpmh: dSched > 0 ? dGC / dSched : null,
      fixedLaborPct: dSched > 0 ? dFix / dSched : null,
    };
    return { weekKey: wk, weekStart: weekStartOf(wk + 'T12:00:00'), stores, district };
  });
  return { weeks };
}
