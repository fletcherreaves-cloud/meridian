// @ts-nocheck
// ── Metric source resolver (auto-first, single global implementation) ─────────
// ONE place that knows, for each operational metric, WHERE its per-(loc,date) value
// comes from and in what priority — AUTO/EMAILED FIRST (DAR, qsr_* pulls, emailed Daily
// Glimpse / Cash Sheet / Sales Ledger), with manual uploads LAST as a last-resort fill.
//
// This was manual-first until 2026-08-07, contradicting CLAUDE.md's standing rule that
// manual uploads "must never override auto/emailed data or be a tile's primary source."
// 27 of 30 chains led with a manual source. It had not bitten yet only because manual
// uploads stopped mid-July, so recent dates fell through to auto anyway.
//
// Why auto wins on the merits, not just by policy: DAR is HOURLY (even quarter-hourly)
// while the manual Operations Report is a day total. You can always derive the day from
// the hours, never the reverse. Verified 2026-08-07 that DAR is deterministic — re-pulling
// a date returned byte-identical values for all 27 stores — so it is a stable source, not
// an eventually-consistent one.
//
// Manual is deliberately KEPT, last in every chain: it holds history back to 2022-01-01
// that DAR (2025-01-01) does not, and metricDaily resolves PER DAY, so a date the auto
// stream cannot cover falls through to manual automatically. It is also the escape hatch
// when an upstream API changes.
//
// KNOWN, DOCUMENTED: DAR-summed daily sales differ from the manual Ops Report total on
// ~15% of store-days, median under $1 on a $10-20k day (~0.01%), consistently DAR-higher.
// Definitional, not drift. See memory/dar-vs-ops-reconciliation.md. Panels should read metrics through metricDaily / metricAvg instead of each
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
  sales: { mode: 'pos', srcs: [['qsrActSummaryRows', 'sales'], ['qsrActSummaryRows', 'allNetSales'], ['laborRows', 'sales']] },
  gc: { mode: 'pos', srcs: [['qsrActSummaryRows', 'gc'], ['glimpseRows', 'gc'], ['laborRows', 'gc']] },
  // Projected (plan) guests / sales per day — QSRSoft's own forecast (DAR proj_total_transactions
  // / proj_sales_dollars). The "what the store should deliver" baseline. projSales drives the
  // One-Pager GC/sales-to-plan opportunity ($ shortfall vs plan — bounded + sane).
  projGC:    { mode: 'pos', srcs: [['qsrActSummaryRows', 'projGC']] },
  projSales: { mode: 'pos', srcs: [['qsrActSummaryRows', 'projSales']] },
  // Speed of service — manual Ops Report, else emailed Daily Glimpse.
  // OEPE — manual Ops Report, then emailed Daily Glimpse, then the cloud-fresh DAR-derived
  // OEPE = (dt_untilserve − dt_untilstore) ÷ dt_trans_cnt (reconciled exactly to the DAR
  // OEPE column) so current-day / recent windows populate before the Glimpse email lands.
  oepe: { mode: 'pos', srcs: [['glimpseRows', 'oepe'], ['qsrActSummaryRows', 'oepe'], ['opsServiceRows', 'oepe'], ['opsRows', 'oepe']] },
  // KVS Time per GC (seconds) — manual Ops, then emailed Glimpse, then the cloud-fresh DAR
  // (= total MFY serve time ÷ total MFY trans, reconciled to the DAR report's KVS Time Per GC
  // column). The KVS stations are the MFY make-lines, so the DAR carries it without a new field.
  kvst: { mode: 'pos', srcs: [['glimpseRows', 'kvst'], ['opsServiceRows', 'kvst'], ['qsrActSummaryRows', 'kvst'], ['opsRows', 'kvst']] },
  // KVS Healthy Usage (2nd-side) as a 0–1 fraction — manual Ops calls it `kvsu`, the emailed
  // Daily Glimpse calls it `kvsHealthy`, and the auto-pulled DAR derives it from healthy/unhealthy
  // order-health counts (cloud-fresh, so recent windows fill even when the Glimpse email lags/omits
  // KVS). Ordered Ops → Glimpse → DAR so a manual value still wins but auto always backstops.
  kvsHealthy: { mode: 'pos', srcs: [['glimpseRows', 'kvsHealthy'], ['opsServiceRows', 'kvsHealthy'], ['qsrActSummaryRows', 'kvsHealthy'], ['opsRows', 'kvsu']] },
  park: { mode: 'pos', srcs: [['glimpseRows', 'parkedPct'], ['opsServiceRows', 'park'], ['opsRows', 'park']] },
  // R2P (Receipt to Print) — manual Ops Report first, else the cloud-fresh DAR-derived
  // R2P = (fc_untilserve − fc_untilclosedrawer) ÷ fc_trans_cnt (reconciled exactly to the
  // QSRSoft Daily Activity R2P column). The DAR fallback populates current-day One-Pager.
  r2p: { mode: 'pos', srcs: [['qsrActSummaryRows', 'r2p'], ['opsRows', 'r2p']] },
  // Labor — PUNCHED Labor % for ALL locations (Notes 35 + 2026-08-03 correction). Glimpse FIRST,
  // then Controls, then manual Labor rows. Controls (ctrlRows.laborPct) was supposed to already
  // be punched, but parseCtrlData had a bug (fixed 2026-08-03) that preferred "Actual Labor %"
  // over "Punched Labor %" when a sheet had both columns — owner-verified via QSRSoft screenshot,
  // e.g. store 6178 read Actual 25.84% vs Punched 23.23% for the same period, a 2.6pp gap. The
  // parser fix only affects FUTURE uploads; rows already in ctrl_rows from before the fix are
  // permanently stuck holding the wrong (Actual-labeled) value until that period is re-uploaded.
  // Glimpse is independently confirmed genuinely punched and auto/cloud-fresh (no upload lag), so
  // ordering it first gets today's best available number without waiting on a re-upload, and
  // costs nothing once ctrlRows data is clean again (both sources should then agree).
  laborPct:  { mode: 'pos', srcs: [['glimpseRows', 'laborPct'], ['ctrlRows', 'laborPct'], ['laborRows', 'laborPct']] },
  tpph: { mode: 'pos', srcs: [['qsrActSummaryRows', 'tpph'], ['ctrlRows', 'tpph'], ['laborRows', 'tpph']] },
  // OT Hours — manual Controls, then manual Labor, then the auto-pulled Operations Report
  // labor-summary stream (qsr_labor_summary → loadOpsLaborSummary, daily, already aliased to
  // otHrs) — closes the labor-tools.js Operations Group Stats gap (cleanup-backlog Class 2,
  // 2026-08-06): otHrs read raw ctrlRows/laborRows only, with no auto backstop, unlike
  // laborPct/tpph/oepe/cashOS in the same panel which already route through this resolver.
  otHrs: { mode: 'any', srcs: [['opsLaborRows', 'otHrs'], ['ctrlRows', 'otHrs'], ['laborRows', 'otHrs']] },
  // Controls / loss-prevention — signed values (0 / negative are real).
  cashOSPct: { mode: 'any', srcs: [['glimpseRows', 'cashOSPct'], ['cashRows', 'cashOSPct'], ['ctrlRows', 'cashOSPct']] },
  // Cash Over/Short $ (dollar, not %) — manual Controls, then emailed Glimpse/Cash Sheet, then
  // the auto-pulled Operations Report cash-sheet. Closes EOM Supervisor's Cash +/- gap (#52).
  cashOSAmt: { mode: 'any', srcs: [['glimpseRows', 'cashOS'], ['cashRows', 'cashOS'], ['opsCashRows', 'cashOSAmt'], ['ctrlRows', 'cashOSAmt']] },
  // T-Reds Before/After % — manual Controls, then the cloud-fresh Operations Report cash-sheet
  // (treds $ ÷ net sales, same net-sales-weighted math as discPct). Closes #37 for T-Reds.
  tRedAPct: { mode: 'any', srcs: [['opsCashRows', 'tRedAPct'], ['ctrlRows', 'tRedAPct']] },
  tRedBPct: { mode: 'any', srcs: [['opsCashRows', 'tRedBPct'], ['ctrlRows', 'tRedBPct']] },
  // Drawer opens (count) — manual Controls, then the auto-pulled Operations Report cash-sheet.
  drawerOpens: { mode: 'any', srcs: [['opsCashRows', 'drawerOpens'], ['ctrlRows', 'drawerOpens']] },
  // Discount % — manual Controls, then the cloud-fresh Operations Report cash-sheet (discount $ ÷
  // net sales). Closes the stale-Controls discount gap without the manual upload (#37).
  discPct: { mode: 'any', srcs: [['opsCashRows', 'discPct'], ['ctrlRows', 'discPct']] },

  // ── Notes 57 Phase 1 (v4.845) ──────────────────────────────────────────────
  // The inventory (scripts/metric-inventory.mjs) found 29 metrics described in
  // signal-registry with NO resolution chain — resolving from one hard-coded source,
  // with no freshest-wins and no fallback. That is the population the recurring
  // "manual-only / blank tile" bugs came from (v4.808-v4.833).
  //
  // These 12 are the ones where an auto or emailed stream already emits the SAME field
  // name, so the chain is a pure addition — no loader change, no derivation. Every one
  // was previously pinned to a MANUAL upload (ctrlRows = Controls Excel, laborRows =
  // Labor Excel), meaning it went blank on any device that hadn't uploaded.
  //
  // Ordering follows the existing convention here: manual Controls/Labor first (the
  // authoritative uploaded report), then emailed, then auto-pulled.

  // Refunds — manual Controls, then the auto Operations Report cash-sheet, then the
  // emailed Cash Sheet. All three already emit these exact field names.
  cashRefAmt: { mode: 'any', srcs: [['opsCashRows', 'cashRefAmt'], ['cashRows', 'cashRefAmt'], ['ctrlRows', 'cashRefAmt']] },
  cashRefCnt: { mode: 'any', srcs: [['opsCashRows', 'cashRefCnt'], ['cashRows', 'cashRefCnt'], ['ctrlRows', 'cashRefCnt']] },
  cashlessRefAmt: { mode: 'any', srcs: [['opsCashRows', 'cashlessRefAmt'], ['cashRows', 'cashlessRefAmt'], ['ctrlRows', 'cashlessRefAmt']] },
  cashlessRefCnt: { mode: 'any', srcs: [['opsCashRows', 'cashlessRefCnt'], ['cashRows', 'cashlessRefCnt'], ['ctrlRows', 'cashlessRefCnt']] },

  // POS Over $ / count — manual Controls, then emailed Glimpse, then emailed Cash Sheet.
  posOverAmt: { mode: 'any', srcs: [['glimpseRows', 'posOverAmt'], ['cashRows', 'posOverAmt'], ['ctrlRows', 'posOverAmt']] },
  posOverCnt: { mode: 'any', srcs: [['glimpseRows', 'posOverCnt'], ['cashRows', 'posOverCnt'], ['ctrlRows', 'posOverCnt']] },

  // Promo $ / % — manual Controls, then emailed Glimpse. (promoCnt deliberately NOT
  // added: no auto/emailed stream emits it, so a chain would be single-source theatre.)
  promoAmt: { mode: 'any', srcs: [['glimpseRows', 'promoAmt'], ['ctrlRows', 'promoAmt']] },
  promoPct: { mode: 'any', srcs: [['glimpseRows', 'promoPct'], ['ctrlRows', 'promoPct']] },

  // T-Red Before/After COUNTS — the % versions already had chains to opsCashRows since
  // #37; the counts beside them did not, so the same tile could show a fresh % next to a
  // stale count.
  tRedACnt: { mode: 'any', srcs: [['opsCashRows', 'tRedACnt'], ['ctrlRows', 'tRedACnt']] },
  tRedBCnt: { mode: 'any', srcs: [['opsCashRows', 'tRedBCnt'], ['ctrlRows', 'tRedBCnt']] },

  // Average check — manual Labor, then emailed Glimpse / Cash Sheet / Sales Ledger.
  // 'pos' because a real avg check is never legitimately 0.
  avgCheck: { mode: 'pos', srcs: [['glimpseRows', 'avgCheck'], ['cashRows', 'avgCheck'], ['salesLedgerRows', 'avgCheck'], ['laborRows', 'avgCheck']] },

  // DT mix % of sales — manual Labor, then the emailed Sales Ledger (same field name).
  dtMixPct: { mode: 'pos', srcs: [['salesLedgerRows', 'dtPctTotal'], ['laborRows', 'dtPctTotal']] },
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
