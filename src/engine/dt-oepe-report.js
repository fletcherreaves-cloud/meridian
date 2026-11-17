// @ts-nocheck
// DT OEPE w/o Parked report (owner request, 2026-11-17: "give a report that shows specifically
// DT OEPE w/o parked for the following periods for each location: MTD, LM, Last 30 Days, Last 45
// Days, Last 90 days and YTD"). METRIC_SOURCES.oepe in metric-source.js IS already the w/o-parked
// definition -- src/utils/oepe.js's oepeSeconds() excludes held/parked time; oepeWithParkSeconds
// is a separate, never-scored diagnostic kept only for drill-downs. No new metric computation is
// needed here, only the 6 fixed period windows this report asks for (none of which exist as a
// named set anywhere else -- fob-reference.js has MTD/LM/L3M/L6W, trend-report.js has its own
// 3-section MTD/last-month/two-back shape, neither covers Last 30/45/90 or YTD).
import { metricRate } from './metric-source.js';

const _mStart = d => new Date(d.getFullYear(), d.getMonth(), 1);
const _mEnd   = d => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const _addM   = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const _addD   = (d, n) => new Date(d.getTime() + n * 86400000);
const _yStart = d => new Date(d.getFullYear(), 0, 1);

export const DT_OEPE_WINDOW_COLS = [
  { key: 'mtd',    label: 'MTD' },
  { key: 'lm',     label: 'LM' },
  { key: 'last30', label: 'Last 30 Days' },
  { key: 'last45', label: 'Last 45 Days' },
  { key: 'last90', label: 'Last 90 Days' },
  { key: 'ytd',    label: 'YTD' },
];

// "Last N Days" is inclusive of asOf itself, matching fob-reference.js's l6w convention
// (_addD(asOf, -41) for a 42-day rolling window) -- N calendar days ending today, not N days
// before today.
export function dtOepeReportWindows(asOf) {
  return {
    mtd:    { s: _mStart(asOf), e: asOf },
    lm:     { s: _mStart(_addM(asOf, -1)), e: _mEnd(_addM(asOf, -1)) },
    last30: { s: _addD(asOf, -29), e: asOf },
    last45: { s: _addD(asOf, -44), e: asOf },
    last90: { s: _addD(asOf, -89), e: asOf },
    ytd:    { s: _yStart(asOf), e: asOf },
  };
}

// One row per store: { loc, mtd, lm, last30, last45, last90, ytd }, each a DT OEPE seconds value
// (or null when the store has no oepe-resolvable days in that window). metricRate -- true Σnumer
// /Σdenom via metricSumRatio, falling back to mean-of-daily only when the ratio legs can't both
// resolve -- is the standing rule for any rate/ratio metric rollup (metric-source.js's own ROLLUP
// CAVEAT comment); a plain average-of-daily-OEPE would let a single slow or light-volume day skew
// the period figure disproportionately.
export function computeDtOepeReport(ds, locs, asOf) {
  const d = (asOf instanceof Date && !isNaN(asOf)) ? asOf : new Date();
  const windows = dtOepeReportWindows(d);
  return (locs || []).map(loc => {
    const row = { loc };
    for (const col of DT_OEPE_WINDOW_COLS) row[col.key] = metricRate(ds, loc, windows[col.key], 'oepe');
    return row;
  });
}
