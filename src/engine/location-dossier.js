// @ts-nocheck
// ── Location Dossier (task #79, Phase 1) ──────────────────────────────────────────────────────
// "A report for each location... on any and all data we know and trends and results in (current,
// 28 day, lm, l3m, ytd)... factual by ingest or analyzed/discovered... a master collection of the
// data we have." Owner-answered design questions (memory/plan-location-dossier-report-2026-11-04.md
// §5): (1) top 3 actionable findings headline, with the rest reachable via expand — not an
// exhaustive dump, but not hidden from a manager who wants to dig further either; (2) build
// on-demand first, measure before adding caching; (2a) both tables/charts AND a SAGE plain-
// language narrative, not one or the other.
//
// Phase 1 scope: one store at a time (the "primarily location focused" half of the owner's ask —
// the patch/operator/state rollup views are Phase 4, not built here). Factual tier only (§2A) —
// reuses metric-source.js's auto-first registry, the same one every other panel in this app
// already sources from, so this report's numbers can never disagree with any other panel's. The
// "analyzed/discovered" tier here is limited to the store's own already-computed `findings` array
// (same structured output District Priority Brief/the store dashboard already use) — Scanner-
// driven cross-metric correlation curation is a real Phase 2, not duplicated here.
import { metricAvg, metricSumRatio, METRIC_SOURCES } from './metric-source.js';
import { dKey, mwStart, lastClosedBusinessDay } from '../utils/date.js';
import { STORE_KB } from '../constants.js';

// Rate metrics get metricAvg (mean of daily values — the standard aggregate for a rate).
// Ratio metrics with a declared numerator/denominator (fobPct, laborPct, cashOSPct, primeCostPct)
// get metricSumRatio instead, the TRUE period rollup (Σnum/Σden), matching metric-source.js's own
// documented reasoning for why a rate metric must never be averaged as an average of averages.
export const DOSSIER_METRICS = [
  { key: 'sales', label: 'Net Sales', unit: '$', agg: 'avg' },
  { key: 'gc', label: 'Guest Count', unit: 'n', agg: 'avg' },
  { key: 'laborPct', label: 'Labor %', unit: 'pct', agg: 'ratio' },
  { key: 'tpph', label: 'TPPH', unit: 'n2', agg: 'avg' },
  { key: 'oepe', label: 'OEPE', unit: 'sec', agg: 'avg' },
  { key: 'kvst', label: 'KVS Time', unit: 'sec', agg: 'avg' },
  { key: 'cashOSPct', label: 'Cash O/S %', unit: 'pct3', agg: 'ratio' },
  { key: 'fobPct', label: 'FOB %', unit: 'pct', agg: 'ratio' },
  { key: 'primeCostPct', label: 'Prime Cost %', unit: 'pct', agg: 'ratio' },
];

// Pure: today -> the 5 fixed windows the owner named (current/28d/lm/l3m/ytd), each {id,label,s,e}
// (same {s,e} YYYY-MM-DD shape metric-source.js's range param already accepts). "Current" is
// week-to-date against this app's own configured week-start day (mwStart() — McDonald's period
// convention, Wednesday by default), through the last CLOSED business day (never a naive
// "today", which would silently include a still-filling, structurally-incomplete day — the same
// completeness trap CLAUDE.md's 4am-business-day section already documents).
export function dossierWindows(today = new Date()) {
  const e = lastClosedBusinessDay(today);
  const eKey = dKey(e);

  const wkStart = mwStart();
  const current = { id: 'current', label: 'Current (WTD)', s: dKey(wkStart), e: eKey };

  const d28 = new Date(e); d28.setDate(d28.getDate() - 27);
  const win28 = { id: '28d', label: '28-Day', s: dKey(d28), e: eKey };

  // Last month = the most recently completed full calendar month.
  const lmEnd = new Date(e.getFullYear(), e.getMonth(), 0);
  const lmStart = new Date(lmEnd.getFullYear(), lmEnd.getMonth(), 1);
  const lm = { id: 'lm', label: 'Last Month', s: dKey(lmStart), e: dKey(lmEnd) };

  // L3M = the 3 most recently completed full calendar months (ending the same month as LM).
  const l3mStart = new Date(lmEnd.getFullYear(), lmEnd.getMonth() - 2, 1);
  const l3m = { id: 'l3m', label: 'L3M', s: dKey(l3mStart), e: dKey(lmEnd) };

  const ytdStart = new Date(e.getFullYear(), 0, 1);
  const ytd = { id: 'ytd', label: 'YTD', s: dKey(ytdStart), e: eKey };

  return [current, win28, lm, l3m, ytd];
}

// Pure: one metric spec + one window -> its computed value for this store, or null if nothing
// resolves (metric-source.js's own "null is a real signal, never guessed" contract preserved —
// a dossier cell reads "—", never a silently wrong number).
export function dossierMetricValue(ds, loc, window, metricSpec) {
  if (metricSpec.agg === 'ratio') {
    const r = metricSumRatio(ds, loc, window, metricSpec.key);
    return r ? r.value : null;
  }
  return metricAvg(ds, [loc], window, metricSpec.key);
}

// Pure: the full factual-tier grid for one store — one row per DOSSIER_METRICS entry, one column
// per dossierWindows() entry. Shape: [{key,label,unit,values:{[windowId]:number|null}}].
export function buildFactualGrid(ds, loc, windows = dossierWindows()) {
  return DOSSIER_METRICS.map(spec => ({
    key: spec.key, label: spec.label, unit: spec.unit,
    values: Object.fromEntries(windows.map(w => [w.id, dossierMetricValue(ds, loc, w, spec)])),
  }));
}

// Pure: a store's already-computed `findings` array (the same shape District Priority Brief/the
// store dashboard already consume — {t:'crit'|'watch'|'ok', m:string}) -> {headline, rest}. The
// owner's own answer to "how many show, and how are they picked": top 3 by severity (crit before
// watch before ok, stable within each tier), with everything past that reachable via "+N more"
// rather than dropped — "some managers are more proactive... and should be able to work on as
// much as possible."
export function topFindings(findings, max = 3) {
  const list = findings || [];
  const rank = { crit: 0, watch: 1, ok: 2 };
  const sorted = [...list].sort((a, b) => (rank[a.t] ?? 3) - (rank[b.t] ?? 3));
  return { headline: sorted.slice(0, max), rest: sorted.slice(max) };
}

// Pure: loc -> the free-text store context card (constants.js's STORE_KB — already-existing
// "general context about this location" infrastructure, surfaced directly rather than
// duplicated, per this plan's own §2C note).
export function dossierStoreContext(loc) {
  return STORE_KB[String(loc)] || null;
}
