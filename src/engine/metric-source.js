// @ts-nocheck
// ── Metric source resolver (auto-first, single global implementation) ─────────
// ONE place that knows, for each operational metric, WHERE its per-(loc,date) value
// comes from and in what priority — manual uploads first (the authoritative Operations
// Report / Controls), then the auto-synced streams (emailed Daily Glimpse, DAR) as a
// fallback. Panels should read metrics through metricDaily / metricAvg instead of each
// filtering `ds.laborRows`/`ds.ctrlRows` itself — which is exactly why "recent windows
// look empty" kept cropping up (a manual-only read shows blank when only auto data exists).
//
// This complements engine/vs-ly.js (which owns the matched-day CURRENT-vs-LAST-YEAR math
// for sales/gc). Together they are the standing global system for sourcing operating data.
//
// Adding a metric = add one line to METRIC_SOURCES. `mode`:
//   'pos' — a real value is > 0 (sales, gc, speed times, %s that are never legitimately 0)
//   'any' — 0 / negative are legitimate (cash O/S, T-Reds, OT hours, discounts)

const _dk = d => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);

// srcs are tried in order; first source with a usable value for that day wins.
export const METRIC_SOURCES = {
  // Sales / guests — sales & gc also flow through vs-ly.js for the matched-day comparison.
  sales:     { mode: 'pos', srcs: [['laborRows', 'sales'], ['qsrActSummaryRows', 'sales'], ['qsrActSummaryRows', 'allNetSales']] },
  gc:        { mode: 'pos', srcs: [['laborRows', 'gc'], ['qsrActSummaryRows', 'gc'], ['glimpseRows', 'gc']] },
  // Projected (plan) guests / sales per day — QSRSoft's own forecast (DAR proj_total_transactions
  // / proj_sales_dollars). The "what the store should deliver" baseline. projSales drives the
  // One-Pager GC/sales-to-plan opportunity ($ shortfall vs plan — bounded + sane).
  projGC:    { mode: 'pos', srcs: [['qsrActSummaryRows', 'projGC']] },
  projSales: { mode: 'pos', srcs: [['qsrActSummaryRows', 'projSales']] },
  // Speed of service — manual Ops Report, else emailed Daily Glimpse.
  // OEPE — manual Ops Report, then emailed Daily Glimpse, then the cloud-fresh DAR-derived
  // OEPE = (dt_untilserve − dt_untilstore) ÷ dt_trans_cnt (reconciled exactly to the DAR
  // OEPE column) so current-day / recent windows populate before the Glimpse email lands.
  oepe:      { mode: 'pos', srcs: [['opsRows', 'oepe'], ['glimpseRows', 'oepe'], ['qsrActSummaryRows', 'oepe']] },
  // KVS Time per GC (seconds) — manual Ops, then emailed Glimpse, then the cloud-fresh DAR
  // (= total MFY serve time ÷ total MFY trans, reconciled to the DAR report's KVS Time Per GC
  // column). The KVS stations are the MFY make-lines, so the DAR carries it without a new field.
  kvst:      { mode: 'pos', srcs: [['opsRows', 'kvst'], ['glimpseRows', 'kvst'], ['qsrActSummaryRows', 'kvst']] },
  // KVS Healthy Usage (2nd-side) as a 0–1 fraction — manual Ops calls it `kvsu`, the emailed
  // Daily Glimpse calls it `kvsHealthy`, and the auto-pulled DAR derives it from healthy/unhealthy
  // order-health counts (cloud-fresh, so recent windows fill even when the Glimpse email lags/omits
  // KVS). Ordered Ops → Glimpse → DAR so a manual value still wins but auto always backstops.
  kvsHealthy: { mode: 'pos', srcs: [['opsRows', 'kvsu'], ['glimpseRows', 'kvsHealthy'], ['qsrActSummaryRows', 'kvsHealthy']] },
  park:      { mode: 'pos', srcs: [['opsRows', 'park'], ['glimpseRows', 'parkedPct']] },
  // R2P (Receipt to Print) — manual Ops Report first, else the cloud-fresh DAR-derived
  // R2P = (fc_untilserve − fc_untilclosedrawer) ÷ fc_trans_cnt (reconciled exactly to the
  // QSRSoft Daily Activity R2P column). The DAR fallback populates current-day One-Pager.
  r2p:       { mode: 'pos', srcs: [['opsRows', 'r2p'], ['qsrActSummaryRows', 'r2p']] },
  // Labor — PUNCHED Labor % for ALL locations (Notes 35): Controls (punched) → auto Daily
  // Glimpse (punched, cloud-fresh) → manual Labor rows (now punched-only too). Glimpse is
  // ordered ahead of the manual laborRows so the auto punched % wins per the auto-first rule
  // and no stale manual crew value can slip in. All three sources now emit a punched %.
  // See memory/project-labor-pct-punched-vs-crew.md + data-sourcing-standard.md.
  laborPct:  { mode: 'pos', srcs: [['ctrlRows', 'laborPct'], ['glimpseRows', 'laborPct'], ['laborRows', 'laborPct']] },
  tpph:      { mode: 'pos', srcs: [['ctrlRows', 'tpph'], ['laborRows', 'tpph'], ['qsrActSummaryRows', 'tpph']] },
  otHrs:     { mode: 'any', srcs: [['ctrlRows', 'otHrs'], ['laborRows', 'otHrs']] },
  // Controls / loss-prevention — signed values (0 / negative are real).
  cashOSPct: { mode: 'any', srcs: [['ctrlRows', 'cashOSPct'], ['glimpseRows', 'cashOSPct'], ['cashRows', 'cashOSPct']] },
  tRedAPct:  { mode: 'any', srcs: [['ctrlRows', 'tRedAPct']] },
  // Discount % — manual Controls, then the cloud-fresh Operations Report cash-sheet (discount $ ÷
  // net sales). Closes the stale-Controls discount gap without the manual upload (#37).
  discPct:   { mode: 'any', srcs: [['ctrlRows', 'discPct'], ['opsCashRows', 'discPct']] },
};

const _ok = (v, mode) => v != null && !isNaN(v) && (mode === 'any' ? true : v > 0);

// Newest per-day date present across the CORE daily operating streams — powers a
// "daily data is N days stale" guard so a truncated/stale read can never silently ship
// (Notes: the Jul-2026 data-loss incident). Returns a Date, or null when nothing is loaded.
const _DAILY_STREAMS = ['qsrActSummaryRows', 'salesLedgerRows', 'glimpseRows', 'laborRows', 'opsRows', 'ctrlRows', 'cashRows'];
export function dailyDataFreshness(ds) {
  if (!ds) return null;
  let max = null;
  for (const s of _DAILY_STREAMS) {
    for (const r of (ds[s] || [])) {
      if (!r || !r.date) continue;
      const t = r.date instanceof Date ? r.date.getTime() : Date.parse(r.date);
      if (!isNaN(t) && (max == null || t > max)) max = t;
    }
  }
  return max != null ? new Date(max) : null;
}

// Lazy per-source index (loc_date → rows[]), cached non-enumerably on ds so it rebuilds
// automatically when ds is replaced (setDs makes a new object).
function _srcIdx(ds, src) {
  const cacheKey = '_msIdx_' + src;
  if (!ds[cacheKey]) {
    const idx = {};
    for (const r of (ds?.[src] || [])) {
      if (!r || r.loc == null || !r.date) continue;
      const k = String(r.loc) + '_' + _dk(r.date);
      (idx[k] || (idx[k] = [])).push(r);
    }
    try { Object.defineProperty(ds, cacheKey, { value: idx, enumerable: false, configurable: true }); }
    catch { ds[cacheKey] = idx; }
  }
  return ds[cacheKey];
}

// Single-day value for a metric at (loc, date), auto-first. Returns null if no source has it.
export function metricDaily(ds, loc, date, key) {
  const spec = METRIC_SOURCES[key];
  if (!ds || !spec) return null;
  const dkey = String(loc) + '_' + _dk(date);
  for (const [src, field] of spec.srcs) {
    const rows = _srcIdx(ds, src)[dkey];
    if (rows) for (const r of rows) { const v = r[field]; if (_ok(v, spec.mode)) return v; }
  }
  return null;
}

// Per-(loc) daily value map over a range, auto-first per day. { dateKey: value }.
// `range.s`/`range.e` may be Date objects OR "YYYY-MM-DD" strings, and row dates may be
// Date objects (cloud streams via _mkDate) OR strings — normalize both sides to
// "YYYY-MM-DD" before comparing so a Date-vs-string mix doesn't silently drop rows
// (a Date >= a bare date-string coerces to NaN and is always false).
export function metricSeries(ds, loc, range, key) {
  const spec = METRIC_SOURCES[key];
  const out = {};
  if (!ds || !spec) return out;
  const L = String(loc);
  const rs = _dk(range.s), re = _dk(range.e);
  // Collect every date in range that any source has for this loc, then resolve auto-first.
  const dates = new Set();
  for (const [src] of spec.srcs) {
    for (const r of (ds?.[src] || [])) {
      if (String(r.loc) !== L || !r.date) continue;
      const dk = _dk(r.date);
      if (dk >= rs && dk <= re) dates.add(dk);
    }
  }
  for (const dk of dates) {
    for (const [src, field] of spec.srcs) {
      const rows = _srcIdx(ds, src)[L + '_' + dk];
      if (rows) { let hit = false; for (const r of rows) { const v = r[field]; if (_ok(v, spec.mode)) { out[dk] = v; hit = true; break; } } if (hit) break; }
    }
  }
  return out;
}

// Mean of the daily values across one or more locs over a range (auto-first per day).
// The standard aggregate for a RATE metric (labor %, OEPE, TPPH…) — never averages a
// pre-rolled average, it means the raw daily values from the freshest source per day.
export function metricAvg(ds, locs, range, key) {
  const list = Array.isArray(locs) ? locs : [locs];
  let sum = 0, n = 0;
  for (const loc of list) {
    const s = metricSeries(ds, loc, range, key);
    for (const k in s) { sum += s[k]; n++; }
  }
  return n ? sum / n : null;
}
