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
  oepe:      { mode: 'pos', srcs: [['opsRows', 'oepe'], ['glimpseRows', 'oepe'], ['qsrActSummaryRows', 'oepe'], ['opsServiceRows', 'oepe']] },
  // KVS Time per GC (seconds) — manual Ops, then emailed Glimpse, then the cloud-fresh DAR
  // (= total MFY serve time ÷ total MFY trans, reconciled to the DAR report's KVS Time Per GC
  // column). The KVS stations are the MFY make-lines, so the DAR carries it without a new field.
  kvst:      { mode: 'pos', srcs: [['opsRows', 'kvst'], ['glimpseRows', 'kvst'], ['opsServiceRows', 'kvst'], ['qsrActSummaryRows', 'kvst']] },
  // KVS Healthy Usage (2nd-side) as a 0–1 fraction — manual Ops calls it `kvsu`, the emailed
  // Daily Glimpse calls it `kvsHealthy`, and the auto-pulled DAR derives it from healthy/unhealthy
  // order-health counts (cloud-fresh, so recent windows fill even when the Glimpse email lags/omits
  // KVS). Ordered Ops → Glimpse → DAR so a manual value still wins but auto always backstops.
  kvsHealthy: { mode: 'pos', srcs: [['opsRows', 'kvsu'], ['glimpseRows', 'kvsHealthy'], ['opsServiceRows', 'kvsHealthy'], ['qsrActSummaryRows', 'kvsHealthy']] },
  park:      { mode: 'pos', srcs: [['opsRows', 'park'], ['glimpseRows', 'parkedPct'], ['opsServiceRows', 'park']] },
  // R2P (Receipt to Print) — manual Ops Report first, else the cloud-fresh DAR-derived
  // R2P = (fc_untilserve − fc_untilclosedrawer) ÷ fc_trans_cnt (reconciled exactly to the
  // QSRSoft Daily Activity R2P column). The DAR fallback populates current-day One-Pager.
  r2p:       { mode: 'pos', srcs: [['opsRows', 'r2p'], ['qsrActSummaryRows', 'r2p']] },
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
  tpph:      { mode: 'pos', srcs: [['ctrlRows', 'tpph'], ['laborRows', 'tpph'], ['qsrActSummaryRows', 'tpph']],
                    derive: { inputs: ['gc', 'actHrs'], fn: (gc, hrs) => (hrs > 0 && gc > 0 ? gc / hrs : null) } },
  // TPPH = transactions ÷ actual hours. TRANSACTIONS AND GUEST COUNTS ARE THE SAME THING
  // here (owner-confirmed 2026-08-08) — the DAR calls it `transactions`, Glimpse and the
  // labor report call it `gc`, and metric-source resolves both under the `gc` key. Stated
  // explicitly because the two names invite the assumption that they differ.
  // The derivation is a FALLBACK: a precomputed tpph from any source wins. It exists for
  // days covered by Glimpse (guest counts) and Controls (hours) but not the DAR, which
  // previously produced nothing despite both halves being present.
  // OT Hours — manual Controls, then manual Labor, then the auto-pulled Operations Report
  // labor-summary stream (qsr_labor_summary → loadOpsLaborSummary, daily, already aliased to
  // otHrs) — closes the labor-tools.js Operations Group Stats gap (cleanup-backlog Class 2,
  // 2026-08-06): otHrs read raw ctrlRows/laborRows only, with no auto backstop, unlike
  // laborPct/tpph/oepe/cashOS in the same panel which already route through this resolver.
  otHrs:     { mode: 'any', srcs: [['ctrlRows', 'otHrs'], ['laborRows', 'otHrs'], ['opsLaborRows', 'otHrs']] },
  // Controls / loss-prevention — signed values (0 / negative are real).
  cashOSPct: { mode: 'any', srcs: [['ctrlRows', 'cashOSPct'], ['glimpseRows', 'cashOSPct'], ['cashRows', 'cashOSPct']] },
  // Cash Over/Short $ (dollar, not %) — manual Controls, then emailed Glimpse/Cash Sheet, then
  // the auto-pulled Operations Report cash-sheet. Closes EOM Supervisor's Cash +/- gap (#52).
  cashOSAmt: { mode: 'any', srcs: [['ctrlRows', 'cashOSAmt'], ['glimpseRows', 'cashOS'], ['cashRows', 'cashOS'], ['opsCashRows', 'cashOSAmt']] },
  // T-Reds Before/After % — manual Controls, then the cloud-fresh Operations Report cash-sheet
  // (treds $ ÷ net sales, same net-sales-weighted math as discPct). Closes #37 for T-Reds.
  tRedAPct:  { mode: 'any', srcs: [['ctrlRows', 'tRedAPct'], ['opsCashRows', 'tRedAPct']] },
  tRedBPct:  { mode: 'any', srcs: [['ctrlRows', 'tRedBPct'], ['opsCashRows', 'tRedBPct']] },
  // Drawer opens (count) — manual Controls, then the auto-pulled Operations Report cash-sheet.
  drawerOpens: { mode: 'any', srcs: [['ctrlRows', 'drawerOpens'], ['opsCashRows', 'drawerOpens']] },
  // Discount % — manual Controls, then the cloud-fresh Operations Report cash-sheet (discount $ ÷
  // net sales). Closes the stale-Controls discount gap without the manual upload (#37).
  discPct:   { mode: 'any', srcs: [['ctrlRows', 'discPct'], ['opsCashRows', 'discPct']] },

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
  cashRefAmt:     { mode: 'any', srcs: [['ctrlRows', 'cashRefAmt'],     ['opsCashRows', 'cashRefAmt'],     ['cashRows', 'cashRefAmt']] },
  cashRefCnt:     { mode: 'any', srcs: [['ctrlRows', 'cashRefCnt'],     ['opsCashRows', 'cashRefCnt'],     ['cashRows', 'cashRefCnt']] },
  cashlessRefAmt: { mode: 'any', srcs: [['ctrlRows', 'cashlessRefAmt'], ['opsCashRows', 'cashlessRefAmt'], ['cashRows', 'cashlessRefAmt']] },
  cashlessRefCnt: { mode: 'any', srcs: [['ctrlRows', 'cashlessRefCnt'], ['opsCashRows', 'cashlessRefCnt'], ['cashRows', 'cashlessRefCnt']] },

  // POS Over $ / count — manual Controls, then emailed Glimpse, then emailed Cash Sheet.
  posOverAmt:     { mode: 'any', srcs: [['ctrlRows', 'posOverAmt'],     ['glimpseRows', 'posOverAmt'],     ['cashRows', 'posOverAmt']] },
  posOverCnt:     { mode: 'any', srcs: [['ctrlRows', 'posOverCnt'],     ['glimpseRows', 'posOverCnt'],     ['cashRows', 'posOverCnt']] },

  // Promo $ / % — manual Controls, then emailed Glimpse. (promoCnt deliberately NOT
  // added: no auto/emailed stream emits it, so a chain would be single-source theatre.)
  promoAmt:       { mode: 'any', srcs: [['ctrlRows', 'promoAmt'],       ['glimpseRows', 'promoAmt']] },
  promoPct:       { mode: 'any', srcs: [['ctrlRows', 'promoPct'],       ['glimpseRows', 'promoPct']] },

  // T-Red Before/After COUNTS — the % versions already had chains to opsCashRows since
  // #37; the counts beside them did not, so the same tile could show a fresh % next to a
  // stale count.
  tRedACnt:       { mode: 'any', srcs: [['ctrlRows', 'tRedACnt'],       ['opsCashRows', 'tRedACnt']] },
  tRedBCnt:       { mode: 'any', srcs: [['ctrlRows', 'tRedBCnt'],       ['opsCashRows', 'tRedBCnt']] },

  // Average check — manual Labor, then emailed Glimpse / Cash Sheet / Sales Ledger.
  // 'pos' because a real avg check is never legitimately 0.
  avgCheck:       { mode: 'pos', srcs: [['laborRows', 'avgCheck'], ['glimpseRows', 'avgCheck'], ['cashRows', 'avgCheck'], ['salesLedgerRows', 'avgCheck']] },

  // DT mix % of sales — manual Labor, then the emailed Sales Ledger (same field name).
  dtMixPct:       { mode: 'pos', srcs: [['laborRows', 'dtPctTotal'], ['salesLedgerRows', 'dtPctTotal']] },

  // Actual punched hours — manual Controls, then the auto DAR rollup. Added 2026-08-08:
  // an audit of compute6wk found 14 of its 28 fields had no chain, and this was the ONLY
  // one with a real auto source sitting unused (qsr_daily_activity_rollup carries
  // actual_punched_hours, already loaded by loadQsrActSummary as `actHrs`).
  // ctrlRows.actHrs (supabase.js maps act_hrs) then the auto DAR rollup
  // (actual_punched_hours). laborRows is NOT in this chain — its loader emits only
  // loc/date/sales/laborPct/tpph/otHrs/otDollar, and the chain test caught that.
  actHrs:         { mode: 'pos', srcs: [['ctrlRows', 'actHrs'], ['qsrActSummaryRows', 'actHrs']] },

  // Actual vs needed hours — a SIGNED HOUR DIFFERENCE (actual − needed), not a percent.
  // mode:'any' is load-bearing: 'pos' would discard every NEGATIVE reading, i.e. exactly
  // the understaffed store-days worth seeing, and 0 (dead on target) is legitimate too.
  // Owner corrected an earlier assessment that this was manual-only — it is carried by
  // the Controls upload AND derivable from the DAR, which has both hour columns.
  actVsNeed:      { mode: 'any', srcs: [['ctrlRows', 'actVsNeed'], ['qsrActSummaryRows', 'actVsNeed']] },
};

// ── Deliberately manual-only ────────────────────────────────────────────────
// These metrics have NO auto or emailed stream that carries them — verified 2026-08-08
// against the live column lists of daily_glimpse_daily, cash_sheet_daily,
// sales_ledger_daily and qsr_daily_activity_rollup. They are listed explicitly so their
// absence from METRIC_SOURCES reads as a decision rather than an oversight, and so that
// anyone auditing coverage can tell "no chain yet" from "no source exists".
//
// Adding a chain for these requires a NEW upstream feed, not a code change. If one of
// these ever appears in an auto stream, move it into METRIC_SOURCES above.
//
// ⚠️ Consequence worth knowing: anything computed from these is manual-upload-only, so it
// goes stale the moment uploads stop and is blank on a device that never uploaded. The
// Controls scorecard renders '—' for them rather than 0 since v4.888.
// ── LifeLenz schedule chains (2026-08-08) ───────────────────────────────────
// The owner pushed back on these being "manual-only" and was right: LifeLenz carries the
// hours. ds.schedRows (lifelenz_schedule, 14,632 rows) has them, and coverage on COMPLETED
// days was measured before wiring — future-dated rows are mostly null because the schedule
// is not built yet, which would have looked like a dead source if sampled naively.
//
//   need_floor    400/400 rows populated
//   sch_vlh       400/400
//   sch_fix_hrs   391/400
//   need_vlh      346/400
//   sch_floor     324/400
//
// mode:'pos' throughout — an hours figure of 0 means "not scheduled/needed", which is
// genuinely absent rather than a reading worth averaging.
Object.assign(METRIC_SOURCES, {
  // ⚠️ laborRows is NOT a source for these. The chain test rejected it, and checking why
  // turned up a real gap: the labor_rows TABLE has no floor/variable/contract columns at
  // all (loc, report_date, sales, labor_pct, tpph, ot_hrs, ot_dollar, ids only). The MBI
  // parser produces these fields, but they are NEVER PERSISTED — so they existed only in
  // the browser session that did the upload and were 0 on every reload. LifeLenz is
  // therefore not a fallback here, it is the ONLY durable source.
  floorMgmtNeeded:  { mode: 'pos', srcs: [['schedRows', 'needFloor']] },
  floorHrsSched:    { mode: 'pos', srcs: [['schedRows', 'schFloor']] },
  variableNeeded:   { mode: 'pos', srcs: [['schedRows', 'needVLH']] },
  // Fixed contract hours = LifeLenz "fix guide hrs" (owner-confirmed 2026-08-08).
  // sch_fix_hrs is a DIFFERENT thing — how many fixed hours were actually scheduled.
  // ⚠️ Sparse: fix_guide_hrs was populated on only 33 of 400 completed-day rows sampled,
  // so expect gaps. That is a source-coverage fact, not a wiring fault.
  fixedContractHrs: { mode: 'pos', srcs: [['schedRows', 'fixGuideHrs']] },

  // Total scheduled hours — variable + fixed + floor, summed in the loader.
  schedHrs:         { mode: 'pos', srcs: [['schedRows', 'schedTotHrs']] },

  // Salaried manager hours — was unchained on the Ops scorecard too.
  salaryMgrHrs:     { mode: 'pos', srcs: [['ctrlRows', 'salaryMgrHrs'],     ['schedRows', 'salMgrHrs']] },
});

// ── Derived metrics ─────────────────────────────────────────────────────────
// Computed per day from other resolvable metrics rather than read from a field. Each
// input resolves auto-first through its own chain, so these inherit the full fallback
// depth of their parts.
// ⚠️ ROLLUP CAVEAT for these ratios. metricAvg returns the MEAN OF DAILY VALUES, which is
// its documented contract for rate metrics. For a ratio like SPPH the dollar-weighted
// Σsales ÷ Σhours is arguably the more correct district figure — measured on store 5985
// for 2026-08: mean-of-daily $70.18/hr vs Σ/Σ $67.04/hr, a $3.14 gap. Per-day derivation
// is still strictly better than the manual precomputed column, but a consumer that needs
// a true weighted rollup should sum the parts itself rather than call metricAvg. This is
// the numerator/denominator gap notes-57-metric-registry-plan §4 describes.
export const DERIVED_METRICS = {
  // Opportunity cost $ = the hours gap vs NEEDED, priced at the labour rate
  // (owner-confirmed: "actual hours +/- needed hours x average rate of pay").
  // actVsNeed is already the signed hour difference, so this is one multiply.
  // Signed on purpose: overstaffed is positive cost, understaffed negative — mode 'any'.
  oppCostDollar: { mode: 'any', derive: { inputs: ['actVsNeed', 'avgRate'],
                   fn: (gap, rate) => (rate > 0 ? gap * rate : null) } },

  // Opportunity cost as a share of sales, so it compares across stores of different size.
  // ⚠️ THE DENOMINATOR IS AN ASSUMPTION — the owner specified the dollar formula but not
  // this one. Sales is the natural basis and matches how every other pct metric here
  // works, but confirm before relying on it.
  oppCostPct:    { mode: 'any', derive: { inputs: ['oppCostDollar', 'sales'],
                   fn: (dollars, sales) => (sales > 0 ? dollars / sales : null) } },

  // ── NEW (owner's idea, 2026-08-08) ──────────────────────────────────────────
  // Act-vs-Sched Opportunity: (actual hours ± SCHEDULED hours) × average rate.
  // The existing opportunity cost measures actual against what was NEEDED. This measures
  // actual against what was PLANNED, which is the number a manager can act on: the hope is
  // that they move the schedule — up or down — toward needed, based on what actually got
  // used. Signed, so over- and under-scheduling are distinguishable.
  actVsSched:     { mode: 'any', derive: { inputs: ['actHrs', 'schedHrs'],
                    fn: (act, sched) => (act > 0 && sched > 0 ? act - sched : null) } },
  actVsSchedOpp:  { mode: 'any', derive: { inputs: ['actVsSched', 'avgRate'],
                    fn: (gap, rate) => (rate > 0 ? gap * rate : null) } },

  // Sales per person-hour. No stream carries it; sales and actual hours both resolve, and
  // actHrs now chains to the DAR (v4.889), so this is available wherever the DAR is.
  spph:    { mode: 'pos', derive: { inputs: ['sales', 'actHrs'],
             fn: (sales, hrs) => (hrs > 0 ? sales / hrs : null) } },

  // Average labour rate $/hr = labour dollars ÷ actual hours, and labour dollars =
  // laborPct × sales. NOT avg_check, which is $/transaction — a different metric that an
  // earlier name-match wrongly proposed as a source.
  avgRate: { mode: 'pos', derive: { inputs: ['laborPct', 'sales', 'actHrs'],
             fn: (pct, sales, hrs) => (hrs > 0 && pct > 0 ? (pct * sales) / hrs : null) } },
};
Object.assign(METRIC_SOURCES, DERIVED_METRICS);

export const MANUAL_ONLY_METRICS = {
  // Controls report
  empMealAmt:   'Employee meals $ — Controls upload only',
  mgrMealAmt:   'Manager meals $ — Controls upload only',
  manualRefAmt: 'Manual refunds $ — Controls upload only',
  depositAmt:   'Deposit $ — Controls upload only',
  // Labor / MBI report
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
// Per-source, per-loc sorted date keys, cached on ds alongside _srcIdx. Built once from
// the same single pass, so adding it costs nothing beyond the memory for the keys.
function _srcDates(ds, src) {
  const cacheKey = '_msDates_' + src;
  if (!ds[cacheKey]) {
    const byLoc = {};
    for (const r of (ds?.[src] || [])) {
      if (!r || r.loc == null || !r.date) continue;
      const l = String(r.loc);
      (byLoc[l] || (byLoc[l] = new Set())).add(_dk(r.date));
    }
    const out = {};
    for (const l in byLoc) out[l] = [...byLoc[l]].sort();
    try { Object.defineProperty(ds, cacheKey, { value: out, enumerable: false, configurable: true }); }
    catch { ds[cacheKey] = out; }
  }
  return ds[cacheKey];
}

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
export function metricSeries(ds, loc, range, key, _depth = 0) {
  const spec = METRIC_SOURCES[key];
  const out = {};
  if (!ds || !spec) return out;

  // ── DERIVED metrics ────────────────────────────────────────────────────────
  // Some metrics are not carried by ANY stream but are computable from ones that are.
  // Before this, coverage was judged as "does a source emit this field", which understated
  // what is actually available: sales-per-person-hour is not in any feed, but sales and
  // actual hours both are, so it is resolvable — and computing it per DAY from
  // auto-first inputs is strictly better than reading a manual-only precomputed column.
  //
  // Derivation happens PER DATE, not on aggregates. Deriving from averages would average
  // a ratio (Σsales/n ÷ Σhours/n), which is the "never average an average" error this
  // codebase has been bitten by before. Each day resolves its own inputs auto-first, and a
  // day is emitted only when EVERY input is present for it — a partial input set produces
  // no value rather than a wrong one.
  const _derive = (into) => {
    if (!spec.derive || _depth > 3) return into;      // depth guard: cyclic definitions
    const parts = spec.derive.inputs.map(k => metricSeries(ds, loc, range, k, _depth + 1));
    const days = new Set(parts.flatMap(p => Object.keys(p)));
    for (const dk of days) {
      if (into[dk] != null) continue;                 // a real source already answered
      const vals = parts.map(p => p[dk]);
      if (vals.some(v => v == null)) continue;        // incomplete inputs → no value
      const v = spec.derive.fn(...vals);
      if (_ok(v, spec.mode)) into[dk] = v;
    }
    return into;
  };
  if (spec.derive && !spec.srcs) return _derive(out);  // derivation-only metric
  const L = String(loc);
  const rs = _dk(range.s), re = _dk(range.e);
  // Collect every date in range that any source has for this loc, then resolve auto-first.
  //
  // This used to scan the FULL source array on every call. That is fine for a panel
  // resolving one metric, but compute6wk resolves ~18 metrics, 3 times per store, across
  // 27 stores — roughly 4,000 full-array passes over multi-year tables. The comment at the
  // top of compute6wk documents a previous fix for exactly that pathology, so routing it
  // through here without this would have re-created the problem it warns about.
  // _srcDates caches a per-source, per-loc sorted date list on ds, so collection is O(days
  // for this store) instead of O(all rows).
  const dates = new Set();
  for (const [src] of spec.srcs) {
    for (const dk of (_srcDates(ds, src)[L] || [])) {
      if (dk >= rs && dk <= re) dates.add(dk);
    }
  }
  for (const dk of dates) {
    for (const [src, field] of spec.srcs) {
      const rows = _srcIdx(ds, src)[L + '_' + dk];
      if (rows) { let hit = false; for (const r of rows) { const v = r[field]; if (_ok(v, spec.mode)) { out[dk] = v; hit = true; break; } } if (hit) break; }
    }
  }
  // LAST RESORT: compute the metric for days no source could answer. A precomputed value
  // from a real source always wins — derivation only fills gaps. This matters for TPPH: a
  // day with Glimpse (guest counts) and Controls (hours) but no DAR previously produced
  // nothing, even though both halves of transactions ÷ hours were sitting right there.
  return _derive(out);
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
