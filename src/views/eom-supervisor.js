// @ts-nocheck
// EOM Supervisor Summary — district-level monthly P&L variance rollup by store/supervisor/
// operator. Dispatch #202 (2026-08-28): folded into the Inventory Control hub
// (src/views/eom-dashboard.js) as a new "Supervisor Rollup" mode/tab, alongside
// Scoreboard/EOM Count/Cadence/Count Cycle — same "harvest-then-remove" move dispatch #189 did
// for Count Cycle (CountCycleSection, count-cycle-panel.js). The retired standalone route id
// (eom-summary, panel-registry.js) redirects into this tab; see EOMDashboardPanel's
// eomInitialMode==='supervisor' handling and App.js's onOpenModal('eom-summary') branch.
// EOMSupervisorPanel itself (the component below) is unchanged in substance — it was already
// content-only (no ModalShell/backdrop of its own; App.js's old showEOMSummary state supplied
// the ModalShell wrapper externally), so it slots into EOMDashboardPanel's RoutePanelShell body
// exactly like it slotted into the old standalone modal. Its own on-page print mechanism (below)
// still works unmodified — the class hooks it targets are now supplied by RoutePanelShell's
// className/headerClassName props instead of ModalShell's (see PRINT_STYLE's comment).
//
// Permission scoping (dispatch #202's explicit check): eom-summary's own perm was already
// 'analytics.district' — identical to eom-dashboard's registry-level perm (panel-registry.js).
// Measured, not assumed: there is no privilege mismatch to gate around here, unlike
// SchedulingHubPanel's sched-hub (analytics.store) hosting one stricter-perm tab
// (labor-analytics, analytics.labor) that IS internally gated via SCHED_TABS' own perm filter
// (App.js). Folding this tab in widens nothing and narrows nothing.
import * as React from 'react';
import { STORE_NAMES, sNameC, DEF_SETTINGS } from '../constants.js';
import { loadEbosMonthlyByStore } from '../lib/supabase.js';
import { metricAvg, metricSeries } from '../engine/metric-source.js';
import { fobSnapshotByStore } from '../engine/eom-inventory.js';
import { resolveLaborTarget } from '../engine/labor-basis.js';

const h = React.createElement;
const { useState: uSt, useEffect: uE, useMemo: uM, useCallback: uCB, useRef: uR } = React;

// ── Constants ─────────────────────────────────────────────────────────────────
const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const MANUAL_STORE_KEY = (y, m) => `meridian_eom_manual_${y}_${m}`;

// ── Copy / CSV helpers (local; mirrors the eom-dashboard pattern) ──────────────
function downloadFile(content, filename, mime = 'text/csv') {
  try {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 300);
  } catch { /* no-op */ }
}
const csvCell = (v) => {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// ── Formatting helpers ────────────────────────────────────────────────────────
const fmtD = (v) => v != null ? Math.abs(v).toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2}) : '';
const fmtMoney = (v, parens = true) => {
  if (v == null) return '—';
  const abs = Math.abs(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  if (parens && v < 0) return `(${abs})`;
  const sign = !parens && v < 0 ? '-' : '';
  return `${sign}$${abs}`;
};
const fmtPct = (v) => {
  if (v == null) return '—';
  const p = v > 1 ? v : v * 100;
  return p.toFixed(2) + '%';
};
const fmtPctDisplay = (v, dec = 2) => {
  if (v == null) return '—';
  const p = v > 1 ? v : v * 100;
  return p.toFixed(dec) + '%';
};
const fmtPctVar = (v) => {
  if (v == null) return '—';
  const p = v > 1 ? v : v * 100;
  const sign = p >= 0 ? '' : '';
  return (p >= 0 ? '' : '') + p.toFixed(2) + '%';
};
const fmtNum  = (v, dec = 2) => v != null ? v.toFixed(dec) : '—';
const norm    = (v) => v == null ? null : (v > 1 ? v / 100 : v); // ensure 0-1

// ── Manual data persistence ───────────────────────────────────────────────────
function loadManual(year, month) {
  try { return JSON.parse(localStorage.getItem(MANUAL_STORE_KEY(year, month)) || '{}'); }
  catch { return {}; }
}
function saveManual(year, month, data) {
  try { localStorage.setItem(MANUAL_STORE_KEY(year, month), JSON.stringify(data)); }
  catch { console.warn('EOM: could not save manual data'); }
}

// ── Per-store data computation ────────────────────────────────────────────────
function computeStoreEOM(loc, ds, manual, selYear, selMonth, ebosByLoc) {
  const locStr = String(loc);
  // Look up this period's targets from the all-periods index first; fall back to current monthlyTargets.
  const periodKey = `${selYear}-${selMonth}`;
  const mt = ds.allMonthlyTargets?.[periodKey]?.[locStr]
             || ds.monthlyTargets?.[locStr]
             || {};
  const meta   = ds.monthlyTargetsMeta;
  // mtOK: targets must be for this exact period. allMonthlyTargets entries carry _year/_month
  // so the check is automatic; monthlyTargets fallback also uses _year/_month stamps.
  const mtYear  = mt._year  || meta?.year;
  const mtMonth = mt._month || meta?.month;
  const mtOK    = !mtYear || (mtYear === selYear && mtMonth === selMonth);

  // Projections — from monthly targets only. No defaults: projections are intentionally blank
  // when targets for this specific period haven't been loaded.
  const projSales    = (mtOK && mt.tProdSales)               || null;
  const projFCPct    = (mtOK && mt.tFOBTotal)                || null;
  const projFOBPct   = (mtOK && mt.tFOBTarget)               || null;
  const projLaborPct = (mtOK && (resolveLaborTarget(mt) ?? mt.tLabor)) || null; // #164: routed through the named resolver, same fallback kept
  const projOpSup    = (mtOK && mt.tOpSupply)                || null;

  // Actuals from FOB rows (monthly report, one row per store per period)
  const fobRow = (ds.fobRows || []).find(r =>
    String(r.loc) === locStr &&
    r.date instanceof Date &&
    r.date.getFullYear() === selYear &&
    r.date.getMonth() + 1 === selMonth
  );

  // Labor rows for this store/month — daily rows from Labor Analysis upload.
  const monthLaborRows = (ds.laborRows || []).filter(r =>
    String(r.loc) === locStr &&
    r.date instanceof Date &&
    r.date.getFullYear() === selYear &&
    r.date.getMonth() + 1 === selMonth
  );

  // Monthly aggregates — sum daily rows for accurate period totals.
  const monthlySales     = monthLaborRows.reduce((s, r) => s + (r.sales||0), 0);
  const monthlyOtHrs     = monthLaborRows.reduce((s, r) => s + (r.otHrs||0), 0);
  const monthlyOtDollar  = monthLaborRows.reduce((s, r) => s + (r.otDollar||0), 0);
  // AUTO OT (auto-first, standing rule): the emailed/auto Operations Report labor-summary stream
  // (ds.opsLaborRows, metrics.overTimeTotalHours/$) — device-independent, no manual upload needed.
  // Fills OT when the manual laborRows upload is absent; manual entry still overrides below.
  const _locKey = String(locStr).replace(/^0+/, '');
  const monthOpsLabor = (ds.opsLaborRows || []).filter(r => {
    if (String(r.loc).replace(/^0+/, '') !== _locKey) return false;
    const d = r.dt ? new Date(r.dt + 'T00:00:00') : (r.date instanceof Date ? r.date : null);
    return d && d.getFullYear() === selYear && d.getMonth() + 1 === selMonth;
  });
  // NB: _loadOpsTable SPREADS the metrics JSONB flat onto the row (snake_cased), so the fields are
  // r.over_time_total_hours / _dollars — NOT nested under r.metrics.
  const autoOtHrs    = monthOpsLabor.reduce((s, r) => s + (Number(r.over_time_total_hours)   || 0), 0);
  const autoOtDollar = monthOpsLabor.reduce((s, r) => s + (Number(r.over_time_total_dollars) || 0), 0);
  // Sales-weighted labor % from daily rows (only rows with both values)
  const _lbrValid = monthLaborRows.filter(r => (r.laborPct||0) > 0 && (r.sales||0) > 0);
  const _lbrWt    = _lbrValid.reduce((s, r) => s + r.laborPct * r.sales, 0);
  const _lbrSales = _lbrValid.reduce((s, r) => s + r.sales, 0);
  const monthlyLaborPct  = _lbrSales > 0 ? _lbrWt / _lbrSales : null;

  // Auto-first backstops (#52) — the manual FOB Report / Labor Analysis / Controls uploads above
  // are still preferred (an intentional monthly submission), but when they're missing for this
  // period, fall through to the SAME cloud streams every other panel already sources through
  // (metric-source.js's auto-first resolver + fobSnapshotByStore's proven latest-per-month
  // qsr_fob snapshot — never a sum, see project-fob-30x-investigation). pmKey is zero-padded
  // ('YYYY-MM') to match fobSnapshotByStore/metricSeries date-key slicing; periodKey above isn't.
  const pmKey      = `${selYear}-${String(selMonth).padStart(2, '0')}`;
  const monthRange = { s: `${pmKey}-01`, e: new Date(selYear, selMonth, 0).toISOString().slice(0, 10) };
  // qsr_fob rows carry a 7-char zero-padded NSN (unlike ctrlRows/laborRows/etc., which are
  // unpadded like STORE_NAMES) — fobSnapshotByStore's output keys follow suit, so the lookup
  // must pad locStr to match, not strip it.
  const autoFob    = fobSnapshotByStore(ds.qsrFobRows || [], pmKey)[locStr.padStart(7, '0')];
  // EXACT dollar-weighted Punched Labor % (2026-08-03, replaces the %-blending approach below) —
  // Σ qsr_labor_summary.crew_labor_dollars ÷ qsr_fob's Product Sales snapshot. qsr_labor_summary
  // is a DAILY auto pull (unlike qsr_fob) with genuine per-day $ figures — crewLaborDollars is a
  // SEPARATE API field from salariedManagerDollars (gross = crew + salaried, verified against raw
  // rows), so it's the hourly/punched $ specifically, not contaminated by the FL salaried-manager-
  // inclusion quirk that affects "Crew Labor %" elsewhere. Verified against the owner's own
  // QSRSoft screenshot for TWO stores: 6178 (FL) → Σcrew$ $87,233.02 (exact match to the
  // screenshot's Punched Labor $ column, $87,233.05) ÷ qsr_fob sales $375,586.72 = 23.2258%
  // (screenshot Punched Labor %: 23.23%); 3708 (OK) → $76,071.81 ÷ $331,402.08 = 22.9545%
  // (screenshot: 22.95%). Both essentially exact — this is materially more accurate than the
  // %-averaging fallback below, which tops out around 23.7% for a store with contaminated
  // historical ctrlRows data.
  const _lsRows = (ds.opsLaborRows || []).filter(r =>
    String(r.loc).padStart(7, '0') === locStr.padStart(7, '0') &&
    r.date instanceof Date && r.date.getFullYear() === selYear && r.date.getMonth() + 1 === selMonth);
  const _crewLaborDollarSum = _lsRows.reduce((s, r) => s + (Number(r.crew_labor_dollars) || 0), 0);
  const dollarWeightedLaborPct = (_crewLaborDollarSum > 0 && autoFob?.sales > 0) ? _crewLaborDollarSum / autoFob.sales : null;
  const autoLaborPct = metricAvg(ds, locStr, monthRange, 'laborPct');   // punched %, auto-first (fallback)
  // EXACT Cash Over/Short $ (2026-08-03 follow-up — the metricSeries blend below still
  // under-counted for several stores). qsr_cash_sheet (ds.opsCashRows, the ops-pull's
  // "cash-sheet-extract" endpoint) is a genuine COMPLETE daily pull with its own
  // cash_over_or_short $ field — same pattern as qsr_labor_summary's crew_labor_dollars.
  // Verified against the owner's own QSRSoft screenshot for FOUR stores, all exact: 5985
  // −$25.22, 10422 −$208.13, 33109 −$84.15, 43380 −$65.61 (31/31 days each, Σ cash_over_or_short
  // matched to the cent). The metricSeries('cashOSAmt') blend (ctrlRows→glimpse→cash→opsCash)
  // under-counted for these stores — kept only as the fallback below.
  const _ocRows = (ds.opsCashRows || []).filter(r =>
    String(r.loc).padStart(7, '0') === locStr.padStart(7, '0') &&
    r.date instanceof Date && r.date.getFullYear() === selYear && r.date.getMonth() + 1 === selMonth);
  const _cashOverShortSum = _ocRows.length
    ? Math.round(_ocRows.reduce((s, r) => s + (Number(r.cash_over_or_short) || 0), 0) * 100) / 100
    : null;
  const autoCashSeries = metricSeries(ds, locStr, monthRange, 'cashOSAmt');
  const autoCash = _cashOverShortSum != null ? _cashOverShortSum
    : (Object.keys(autoCashSeries).length
      ? Math.round(Object.values(autoCashSeries).reduce((a, b) => a + b, 0) * 100) / 100
      : null);

  // Sales — auto qsr_fob's Product Sales snapshot FIRST (2026-08-03 correction, same reasoning as
  // actFCPct/actLaborPct above; this feeds refSales, the denominator for EVERY $ variance below,
  // so an under-count here silently under-states every dollar figure in the panel). monthlySales
  // (Σ manual ds.laborRows) covered only 17 of 31 July days for one spot-checked store — a SUM
  // over partial days under-counts by exactly the missing fraction (verified: $183K manual vs
  // the true $331K qsr_fob month total for that store, a 45% under-count). autoFob.sales is the
  // SAME snapshot actFCPct's denominator already uses, so Sales and Food Cost % stay internally
  // consistent with each other, not derived from two different partial pictures.
  const actSales    = (autoFob?.sales > 0 ? autoFob.sales : null)
                      || (monthlySales > 0 ? monthlySales : null)
                      || (fobRow?.sales > 0 ? fobRow.sales : null);
  // Total Food Cost % / Food Over Base % actual — AUTO qsr_fob snapshot FIRST, manual FOB report
  // as a last-resort fill only (2026-08-03 correction — this was backwards in the original #52
  // fix and re-broke the same field it was meant to close). The manual FOB Report is a ONE-TIME
  // monthly upload that can't self-refresh, unlike ctrlRows (uploaded ~daily, realistically fresh
  // in practice) — QSRSoft's own P&L Food Cost figure keeps posting adjustments after the report
  // is typically pulled, so a manual row from early/mid-month goes stale while qsr_fob keeps
  // updating. Verified against the owner's own QSRSoft screenshot: store 5985 read 27.21% P&L
  // Food Cost — auto qsr_fob's latest snapshot computed to 27.2128% (exact match); the manual
  // fob_rows upload held a stale 27.46%. Matches the standing "auto/emailed-first, freshest-wins"
  // rule (CLAUDE.md) — manual must never override auto, only fill a gap auto doesn't cover.
  const actFCPct    = autoFob?.pLFoodPct || fobRow?.pLFoodPct || null;
  const actFOBPct   = autoFob?.fobPct    || fobRow?.fobPct    || null; // Food Over Base % actual
  // Crew Labor Actual — EXACT dollar-weighted Punched Labor % FIRST (see dollarWeightedLaborPct
  // above), then the %-blending auto-first fallback, then manual, in decreasing order of
  // precision. dollarWeightedLaborPct requires both qsr_labor_summary and qsr_fob coverage for
  // the period — when either is missing (e.g. a brand-new store, or before these auto pulls were
  // live) it falls through to autoLaborPct, which still resolves ctrlRows→glimpseRows→laborRows
  // per day and subsumes monthlyLaborPct's own source while filling gap days.
  const actLaborPct = dollarWeightedLaborPct || autoLaborPct || (fobRow?.laborPct > 0 ? fobRow.laborPct : null) || monthlyLaborPct || null;

  // Cash: Σ the auto-first cashOSAmt SERIES for the month (#52 follow-up, 2026-08-03) — NOT
  // "manual ctrlRows if any rows exist, else auto." July's manual Controls upload turned out to
  // be PARTIAL for every store (~15 of 31 days, verified against the live DB) — the old
  // any-rows-exist gate summed only the covered days and silently presented that as "the month,"
  // which is worse than no manual data at all (a store with zero manual rows got the full
  // auto-blended total; a store with half a month's manual rows got half a total, mislabeled as
  // whole). metricSeries already resolves ctrlRows→glimpseRows→cashRows→opsCashRows PER DAY (the
  // standing auto-first rule), so summing its output blends manual days with auto-filled gap
  // days correctly — ctrlRows still wins for any day it actually covers, no regression there.
  const cashFromCtrl = autoCash;

  // Manual overrides / inputs for this store
  const m            = manual[locStr] || {};
  const ebosOpSup    = ebosByLoc?.[locStr] != null ? Math.round(ebosByLoc[locStr] * 100) / 100 : null;
  const actOpSup     = m.actOpSup     != null ? +m.actOpSup     : ebosOpSup;
  const actCash      = m.actCash      != null ? +m.actCash      : cashFromCtrl;
  // OT Hours and OT $ — manual override first, then AUTO ops stream, then manual daily labor upload.
  const otHours      = m.otHours      != null ? +m.otHours      : (autoOtHrs    > 0 ? autoOtHrs    : (monthlyOtHrs    > 0 ? monthlyOtHrs    : null));
  const otDollar     = m.otDollar     != null ? +m.otDollar     : (autoOtDollar > 0 ? autoOtDollar : (monthlyOtDollar > 0 ? monthlyOtDollar : null));
  const laborXfers   = m.laborXfers   != null ? +m.laborXfers   : null;
  const laborUnclk   = m.laborUnclk   != null ? +m.laborUnclk   : null;
  const projOpSupMan = m.projOpSup    != null ? +m.projOpSup    : projOpSup;

  // Reference sales (actual if available, else projected)
  const refSales = actSales || projSales || 0;

  // % variance rows — rounded to the SAME 0.01-percentage-point precision the +/- row displays
  // (owner-flagged 2026-09-01: the $ Amount row used to multiply refSales by the FULL-PRECISION
  // float diff — e.g. an underlying ~0.0219% that the +/- row rounds to "+0.02%" for display — so
  // a user hand-checking "0.02% × actual sales" got $123.37 while the panel showed $135.02, a
  // ~$12 gap nobody could reproduce from the numbers actually on screen. Rounding HERE, once, and
  // reusing this same rounded value for both the +/- % cell and the $ Amount multiply below,
  // guarantees the two always tie out exactly — round2pp(0.0219%)=0.02%, ×$616,861.43=$123.37.
  const round2pp  = (v) => v == null ? null : Math.round(v * 10000) / 10000; // nearest 0.01 percentage point
  const fcVarPct  = actFCPct    != null && projFCPct    != null ? round2pp(norm(actFCPct)    - norm(projFCPct))    : null;
  const fobVarPct = actFOBPct   != null && projFOBPct   != null ? round2pp(norm(actFOBPct)   - norm(projFOBPct))   : null;
  const laborVarPct = actLaborPct != null && projLaborPct != null ? round2pp(norm(actLaborPct) - norm(projLaborPct)) : null;

  // $ variance rows — rounded % (above) × actual sales (pure rate impact), so each $ Amount cell
  // reconciles exactly with the displayed +/- % in the same column.
  const fcVar$    = fcVarPct    != null && refSales ? fcVarPct    * refSales : null;
  const fobVar$   = fobVarPct   != null && refSales ? fobVarPct   * refSales : null;
  const laborVar$ = laborVarPct != null && refSales ? laborVarPct * refSales : null;
  const opSup$    = actOpSup != null && (projOpSupMan || 0) > 0
                    ? actOpSup - projOpSupMan : null;
  const salesVar  = actSales != null && projSales != null ? actSales - projSales : null;

  // Crew Labor Adjustment section
  const laborAdjAmt  = laborVar$;
  const laborNewTotal= (laborAdjAmt || 0) + (laborXfers || 0) + (laborUnclk || 0);

  // Total of Shaded Boxes — Food Over Base + Crew Labor + Op Supplies ONLY (owner directive,
  // 2026-08-04: Total Food Cost and OT $ are shown/shaded in their own cells but must NOT be
  // folded into this total — Food Over Base is the actionable food-cost variance; Total Food
  // Cost duplicates/overlaps it).
  const totalShaded  = (fobVar$ || 0) + laborNewTotal + (opSup$ || 0);
  const pctImpact    = refSales > 0 ? totalShaded / refSales : null;

  return {
    loc, locStr, name: sNameC(loc),
    projSales, projFCPct: norm(projFCPct), projFOBPct: norm(projFOBPct),
    projLaborPct: norm(projLaborPct), projOpSup: projOpSupMan,
    actSales, actFCPct: norm(actFCPct), actFOBPct: norm(actFOBPct),
    actLaborPct: norm(actLaborPct), actOpSup, actCash,
    otHours, otDollar, laborXfers, laborUnclk,
    salesVar, fcVarPct, fobVarPct, laborVarPct, opSup$,
    fcVar$, fobVar$, laborVar$, laborAdjAmt, laborNewTotal,
    totalShaded, pctImpact,
    // Dispatch (2026-09-01): hasFOB gates the "FOB missing" warning banner, the "✓ FOB"/"○ FOB
    // missing" badge, AND the rollup's stores-to-include filter (S = ...hasFOB below) — all three
    // were false-positiving "missing" for stores with real, current AUTO-pulled FOB (autoFob)
    // whenever the manual monthly upload (fobRow) was absent, even though actSales/actFCPct/
    // actFOBPct/actLaborPct above already fall back to autoFob correctly. Verified live
    // (service-role Supabase read) against 3708/Ardmore-Broadway and 5183/Chickasha-So 4th:
    // both have complete August 2026 qsr_fob rows (31/31 days) driving real displayed actuals,
    // while this flag alone still called it "missing" for lack of a manual row.
    hasFOB:     !!(fobRow || autoFob),
    hasTargets: !!(projSales || projLaborPct),
    hasMonthlyTargets: !!(mtOK && mt.tFOBTotal),
  };
}

// ── Group rollup ──────────────────────────────────────────────────────────────
function computeRollup(stores) {
  const S = stores.filter(s => s.hasTargets || s.hasFOB);
  if (!S.length) return null;
  const sumF  = f => S.reduce((a, s) => a + (s[f] != null ? +s[f] : 0), 0);
  const anyF  = f => S.some(s => s[f] != null);

  const projSales    = sumF('projSales');
  const actSales     = sumF('actSales');
  const refSales     = actSales || projSales;

  // Sales-weighted % rollup for projections
  const wAvgProj = (f) => {
    const tot = S.reduce((a, s) => a + (s[f] != null && s.projSales ? norm(s[f]) * s.projSales : 0), 0);
    return projSales > 0 ? tot / projSales : null;
  };
  // Sales-weighted % rollup for actuals
  const wAvgAct = (f) => {
    const tot = S.reduce((a, s) => a + (s[f] != null && s.actSales ? norm(s[f]) * s.actSales : 0), 0);
    return actSales > 0 ? tot / actSales : null;
  };

  const projFCPct    = anyF('projFCPct')    ? wAvgProj('projFCPct')    : null;
  const projFOBPct   = anyF('projFOBPct')   ? wAvgProj('projFOBPct')   : null;
  const projLaborPct = anyF('projLaborPct') ? wAvgProj('projLaborPct') : null;
  const projOpSup    = anyF('projOpSup')    ? sumF('projOpSup')         : null;
  const actFCPct     = anyF('actFCPct')     ? wAvgAct('actFCPct')       : null;
  const actFOBPct    = anyF('actFOBPct')    ? wAvgAct('actFOBPct')      : null;
  const actLaborPct  = anyF('actLaborPct')  ? wAvgAct('actLaborPct')    : null;
  const actOpSup     = anyF('actOpSup')     ? (S.every(s=>s.actOpSup!=null) ? sumF('actOpSup') : null) : null;
  const otHours      = anyF('otHours')      ? sumF('otHours')            : null;
  const actCash      = anyF('actCash')      ? (S.every(s=>s.actCash!=null) ? sumF('actCash') : null) : null;

  // Rounded to the same 0.01-percentage-point precision as the per-store +/- row (see
  // computeStoreEOM's round2pp comment) — display-consistency only; this rollup's own $ Amount
  // figures below are sums of each store's ALREADY-rounded fcVar$/fobVar$/laborVar$, not
  // recomputed from these rollup-level %s, so no double-rounding of the dollar totals occurs.
  const round2pp     = (v) => v == null ? null : Math.round(v * 10000) / 10000;
  const salesVar     = actSales && projSales ? actSales - projSales : null;
  const fcVarPct     = actFCPct  != null && projFCPct  != null ? round2pp(actFCPct  - projFCPct)  : null;
  const fobVarPct    = actFOBPct != null && projFOBPct != null ? round2pp(actFOBPct - projFOBPct) : null;
  const laborVarPct  = actLaborPct != null && projLaborPct != null ? round2pp(actLaborPct - projLaborPct) : null;

  const fcVar$       = sumF('fcVar$');
  const fobVar$      = sumF('fobVar$');
  const laborNewTotal= sumF('laborNewTotal');
  const otDollar     = sumF('otDollar');
  const opSup$       = anyF('opSup$') ? sumF('opSup$') : null;
  // Total of Shaded Boxes — Food Over Base + Crew Labor + Op Supplies ONLY, same as the
  // per-store total (owner directive, 2026-08-04) — Total Food Cost and OT $ excluded.
  const totalShaded  = fobVar$ + laborNewTotal + (opSup$ || 0);
  const pctImpact    = refSales > 0 ? totalShaded / refSales : null;

  return {
    projSales, projFCPct, projFOBPct, projLaborPct, projOpSup,
    actSales, actFCPct, actFOBPct, actLaborPct, actOpSup, otHours, actCash,
    salesVar, fcVarPct, fobVarPct, laborVarPct,
    fcVar$, fobVar$, laborNewTotal, otDollar, opSup$, totalShaded, pctImpact,
    laborAdjAmt: sumF('laborAdjAmt'),
    laborXfers:  sumF('laborXfers'),
    laborUnclk:  sumF('laborUnclk'),
  };
}

// ── Color helpers ─────────────────────────────────────────────────────────────
const red   = '#ef4444', amber = '#f59e0b', grn = '#10b981', muted = '#6b7280';
const colSalesVar = (v) => v == null ? muted : v >= 0 ? grn : v > -5000 ? amber : red;
const colPctVar   = (v) => v == null ? muted : v <= 0 ? grn : v <= 0.005 ? amber : red;
const colCash     = (v) => v == null ? muted : Math.abs(v) < 10 ? grn : Math.abs(v) < 50 ? amber : red;
const colShaded   = (v) => v == null ? muted : v <= 0 ? grn : v <= 500 ? amber : red;
const colPctImpact= (v) => v == null ? muted : v <= 0 ? grn : v <= 0.01 ? amber : red;

// ── Inline editable cell ──────────────────────────────────────────────────────
function EditCell({ value, onChange, prefix = '', placeholder = '—', style = {}, cls = '' }) {
  const [focused, setFocused] = uSt(false);
  const [draft, setDraft]     = uSt('');
  uE(() => {
    if (!focused) {
      if (value == null) { setDraft(''); return; }
      const n = +value;
      setDraft(Number.isFinite(n) ? n.toFixed(2) : String(value));
    }
  }, [value, focused]);
  return h('input', {
    value: draft,
    placeholder,
    onChange: e => setDraft(e.target.value),
    onFocus: () => { setFocused(true); setDraft(value != null ? String(value) : ''); },
    onBlur: e => {
      setFocused(false);
      const v = e.target.value.replace(/[$,()\s]/g, '');
      if (v === '' || isNaN(+v)) { onChange(null); setDraft(''); }
      else { onChange(+v); }
    },
    style: {
      width: '100%', background: 'rgba(245,158,11,.08)',
      border: '1px dashed rgba(245,158,11,.4)', borderRadius: '3px',
      textAlign: 'right', color: '#f59e0b', fontFamily: 'monospace',
      fontSize: '11px', padding: '1px 3px', fontWeight: 600,
      ...style,
    },
  });
}

// ── Row-value formatters (shared by the live EOMBlock render AND formatSupervisorHtml's static
// print export below — one set of formatting rules, so the two can never disagree on what a
// number should read as). ──────────────────────────────────────────────────────────────────────
const varPctStr = (v) => {
  if (v == null) return '—';
  const p = (v * 100).toFixed(2);
  return (v > 0 ? '+' : '') + p + '%';
};
const varMoneyStr = (v) => {
  if (v == null) return '—';
  if (v < 0) return `(${fmtMoney(v, false).replace('-', '')})`;
  return `$${fmtD(v)}`;
};
const salesStr = (v) => v != null ? '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
const pctStr   = (v) => v != null ? (v * 100).toFixed(2) + '%' : '—';
const hrStr    = (v) => v != null ? v.toFixed(2) : '—';

// ── EOM block (store or rollup) ───────────────────────────────────────────────
function EOMBlock({ data, isRollup, label, manual, onManualChange, expanded, setExpanded, forPrint }) {
  const id    = data.locStr || 'rollup';
  const isExp = forPrint || expanded === id;
  const C     = { // col header style
    th: { background: '#1e2d40', color: '#94b3cc', fontSize: '9px', fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '.05em', padding: '4px 6px',
          textAlign: 'right', borderRight: '1px solid var(--bdr)' },
    thL: { textAlign: 'left' },
    td: { fontFamily: 'monospace', fontSize: '11px', fontWeight: 600, padding: '3px 6px',
          textAlign: 'right', borderRight: '1px solid var(--bdr)',
          color: 'var(--text,#111827)' },
    tdL: { textAlign: 'left', color: 'var(--text2,#374151)', fontSize: '11px' },
    num: (col) => ({ color: col || 'var(--text,#111827)' }),
  };

  const {
    projSales, projFCPct, projFOBPct, projLaborPct, projOpSup,
    actSales, actFCPct, actFOBPct, actLaborPct, actOpSup, actCash,
    otHours, otDollar, laborXfers, laborUnclk,
    salesVar, fcVarPct, fobVarPct, laborVarPct,
    fcVar$, fobVar$, laborAdjAmt, laborNewTotal, otDollar: _otD, opSup$,
    totalShaded, pctImpact,
  } = data;

  const rowBg = (i) => i % 2 === 0 ? 'rgba(255,255,255,.025)' : 'transparent';
  const bdr   = isRollup ? '2px solid rgba(245,158,11,.35)' : '1px solid var(--bdr)';
  const bg    = isRollup ? 'rgba(245,158,11,.04)' : 'rgba(255,255,255,.02)';

  // Render the 4-row x 8-col data table
  const dataTable = h('div', { style: { overflowX: 'auto' } },
    h('table', {
      style: {
        width: '100%', borderCollapse: 'collapse',
        tableLayout: 'fixed', minWidth: '760px',
      }
    },
      // Header row
      h('thead', null,
        h('tr', null,
          h('th', { style: { ...C.th, ...C.thL, width: '80px' } }, ''),
          h('th', { style: { ...C.th, width: '110px' } }, 'Product Net Sales'),
          h('th', { style: { ...C.th, width: '90px'  } }, 'Total Food Cost'),
          h('th', { style: { ...C.th, width: '90px'  } }, 'Food Over Base'),
          h('th', { style: { ...C.th, width: '90px'  } }, 'Crew Labor'),
          h('th', { style: { ...C.th, width: '70px'  } }, 'OT Hours'),
          h('th', { style: { ...C.th, width: '90px'  } }, 'Op Supplies'),
          h('th', { style: { ...C.th, width: '80px', borderRight: 'none' } }, 'Cash +/−'),
        )
      ),
      h('tbody', null,
        // Projection row
        h('tr', { style: { background: rowBg(0) } },
          h('td', { style: { ...C.td, ...C.tdL, fontWeight: 700, color: '#94b3cc' } }, 'Projection'),
          h('td', { style: C.td }, salesStr(projSales)),
          h('td', { style: C.td }, pctStr(projFCPct)),
          h('td', { style: C.td }, pctStr(projFOBPct)),
          h('td', { style: C.td }, pctStr(projLaborPct)),
          h('td', { style: C.td }, '0'),
          h('td', { style: C.td }, salesStr(projOpSup)),
          h('td', { style: { ...C.td, borderRight: 'none' } }, '—'),
        ),
        // Actual row
        h('tr', { style: { background: rowBg(1) } },
          h('td', { style: { ...C.td, ...C.tdL, fontWeight: 700, color: '#94b3cc' } }, 'Actual'),
          h('td', { style: { ...C.td, color: colSalesVar(actSales && projSales ? actSales - projSales : null) } },
            actSales != null ? salesStr(actSales) : (forPrint ? '—' : '—')
          ),
          h('td', { style: { ...C.td, color: actFCPct != null ? colPctVar(actFCPct - (projFCPct||0)) : muted } }, pctStr(actFCPct)),
          h('td', { style: { ...C.td, color: actFOBPct != null ? colPctVar(actFOBPct - (projFOBPct||0)) : muted } }, pctStr(actFOBPct)),
          h('td', { style: { ...C.td, color: actLaborPct != null ? colPctVar(actLaborPct - (projLaborPct||0)) : muted } }, pctStr(actLaborPct)),
          // OT Hours — manual
          h('td', { style: C.td },
            forPrint
              ? hrStr(otHours)
              : h(EditCell, { value: otHours, placeholder: 'hrs', onChange: v => onManualChange('otHours', v) })
          ),
          // Op Supplies — manual
          h('td', { style: C.td },
            forPrint
              ? salesStr(actOpSup)
              : h(EditCell, { value: actOpSup, placeholder: '$ actual', onChange: v => onManualChange('actOpSup', v) })
          ),
          // Cash — auto or manual
          h('td', { style: { ...C.td, borderRight: 'none', color: colCash(actCash) } },
            forPrint
              ? (actCash != null ? varMoneyStr(actCash) : '—')
              : h(EditCell, { value: actCash, placeholder: '$ cash', onChange: v => onManualChange('actCash', v) })
          ),
        ),
        // +/- row
        h('tr', { style: { background: rowBg(0) } },
          h('td', { style: { ...C.td, ...C.tdL, fontWeight: 700, color: '#94b3cc' } }, '+/−'),
          h('td', { style: { ...C.td, color: colSalesVar(salesVar) } },
            salesVar != null ? varMoneyStr(salesVar) : '—'),
          h('td', { style: { ...C.td, color: colPctVar(fcVarPct) } }, varPctStr(fcVarPct)),
          h('td', { style: { ...C.td, color: colPctVar(fobVarPct) } }, varPctStr(fobVarPct)),
          h('td', { style: { ...C.td, color: colPctVar(laborVarPct) } }, varPctStr(laborVarPct)),
          h('td', { style: C.td }, '—'),
          h('td', { style: { ...C.td, color: opSup$ != null ? colPctVar(opSup$) : muted } },
            opSup$ != null ? varMoneyStr(opSup$) : '—'),
          h('td', { style: { ...C.td, borderRight: 'none' } }, '—'),
        ),
        // $ Amount row
        h('tr', { style: { background: 'rgba(245,158,11,.06)', borderTop: '1px solid rgba(245,158,11,.2)' } },
          h('td', { style: { ...C.td, ...C.tdL, fontWeight: 700, color: '#f59e0b' } }, '$ Amount'),
          h('td', { style: C.td }, '—'),
          h('td', { style: { ...C.td, color: colShaded(fcVar$), fontWeight: 700 } }, fcVar$ != null ? varMoneyStr(fcVar$) : '—'),
          h('td', { style: { ...C.td, color: colShaded(fobVar$), fontWeight: 700 } }, fobVar$ != null ? varMoneyStr(fobVar$) : '—'),
          // Reads laborAdjAmt (destructured above), NOT data.laborVar$ — computeRollup() never sets
          // laborVar$ on the rollup object (only laborAdjAmt, which holds the identical value at the
          // per-store level: `const laborAdjAmt = laborVar$;` in computeStoreEOM). Reading data.laborVar$
          // directly here always rendered "—" for the ROLLUP card specifically (owner-flagged
          // 2026-09-01, alongside the $ Amount rounding fix, "need to fix ... rollups as well") — the
          // per-store cards happened to work because laborVar$ IS present on computeStoreEOM's return.
          h('td', { style: { ...C.td, color: colShaded(laborAdjAmt), fontWeight: 700 } }, laborAdjAmt != null ? varMoneyStr(laborAdjAmt) : '—'),
          h('td', { style: { ...C.td, color: colShaded(otDollar), fontWeight: 700 } },
            forPrint
              ? (otDollar != null ? varMoneyStr(otDollar) : '—')
              : h(EditCell, { value: otDollar, placeholder: 'OT $', onChange: v => onManualChange('otDollar', v), style: { color: amber } })
          ),
          h('td', { style: { ...C.td, color: colShaded(opSup$), fontWeight: 700 } }, opSup$ != null ? varMoneyStr(opSup$) : '—'),
          h('td', { style: { ...C.td, borderRight: 'none' } }, '—'),
        ),
      )
    )
  );

  // Labor Adjustment mini-section
  const laborAdj = h('div', {
    style: {
      display: 'flex', gap: '0', marginTop: '8px',
      border: '1px solid var(--bdr)', borderRadius: '6px', overflow: 'hidden',
    }
  },
    h('div', { style: { background: 'rgba(245,158,11,.06)', padding: '6px 10px', minWidth: '140px', borderRight: '1px solid var(--bdr)' } },
      h('div', { style: { fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: '#94b3cc', marginBottom: '4px' } }, 'Crew Labor Adjustment'),
      ...[
        ['$ Amount (Shaded)', laborAdjAmt != null ? varMoneyStr(laborAdjAmt) : '—', colShaded(laborAdjAmt), null, null],
        ['Transfers', null, amber, 'laborXfers', laborXfers],
        ['Unclocked Labor', null, amber, 'laborUnclk', laborUnclk],
        ['New Total $', null, colShaded(laborNewTotal), null, null, true],
      ].map(([lbl, val, col, field, curVal, isTot]) => h('div', { key: lbl, style: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '2px 0', borderTop: isTot ? '1px solid var(--bdr)' : 'none',
        marginTop: isTot ? '3px' : 0, paddingTop: isTot ? '4px' : '2px',
      }},
        h('span', { style: { fontSize: '10px', color: '#7da0c4' } }, lbl),
        field
          ? (forPrint
              ? h('span', { style: { fontSize: '11px', fontFamily: 'monospace', fontWeight: 600, color: col } }, curVal != null ? varMoneyStr(curVal) : '—')
              : h(EditCell, { value: curVal, placeholder: '—', onChange: v => onManualChange(field, v), style: { width: '80px', color: col } })
            )
          : h('span', { style: { fontSize: '11px', fontFamily: 'monospace', fontWeight: 600, color: col } },
              isTot ? varMoneyStr(laborNewTotal) : (val || '—'))
      ))
    ),
    h('div', { style: { flex: 1, padding: '6px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center' } },
      h('div', { style: { fontSize: '10px', color: '#94b3cc', marginBottom: '2px' } },
        'Total of Shaded Boxes:',
        h('span', {
          style: { fontSize: '13px', fontFamily: 'monospace', fontWeight: 700, marginLeft: '8px',
                   color: colShaded(totalShaded) }
        }, varMoneyStr(totalShaded))
      ),
      h('div', { style: { fontSize: '10px', color: '#94b3cc', marginTop: '2px' } },
        '÷ Prod. Net Sales =',
        h('span', {
          style: { fontSize: '13px', fontFamily: 'monospace', fontWeight: 700, marginLeft: '8px',
                   color: colPctImpact(pctImpact) }
        }, pctImpact != null ? ((pctImpact * 100).toFixed(2) + '% impact to P&L') : '—')
      ),
    )
  );

  // Missing data indicators
  const missingNote = !data.hasFOB && !isRollup
    ? h('div', { style: { fontSize: '10px', color: amber, background: 'rgba(245,158,11,.08)',
        border: '1px solid rgba(245,158,11,.2)', borderRadius: '4px', padding: '3px 8px',
        marginBottom: '6px' } },
        '⚠ No FOB report found for this period — actual food cost / labor data missing. Enter monthly target data manually or upload the FOB report.')
    : null;

  const noTargetsNote = !data.hasTargets && !isRollup
    ? h('div', { style: { fontSize: '10px', color: muted, marginBottom: '4px' } },
        'No monthly targets loaded for this store — upload QSRSoft Monthly Projections or enter projection values.')
    : null;

  return h('div', {
    key: id,
    className: 'eom-block',
    style: { border: bdr, background: bg, borderRadius: '8px', marginBottom: '14px',
             pageBreakInside: 'avoid', breakInside: 'avoid' }
  },
    // Block header
    h('div', {
      style: {
        padding: '8px 12px', cursor: isRollup ? 'default' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: isRollup ? 'rgba(245,158,11,.07)' : 'rgba(255,255,255,.03)',
        borderBottom: '1px solid var(--bdr)',
      },
      onClick: isRollup ? undefined : () => setExpanded(isExp && !forPrint ? null : id),
    },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
        h('span', { style: { fontSize: isRollup ? '13px' : '12px', fontWeight: 700,
                              color: isRollup ? '#f59e0b' : 'var(--text,#111827)' } },
          label || data.name),
        !isRollup && h('span', { style: { fontSize: '10px', color: muted,
          background: 'rgba(128,128,128,.1)', borderRadius: '4px', padding: '1px 6px' } },
          'Rest. #' + data.locStr),
        data.hasFOB && h('span', { style: { fontSize: '9px', color: grn, fontWeight: 600 } }, '✓ FOB'),
        !data.hasFOB && !isRollup && h('span', { style: { fontSize: '9px', color: amber, fontWeight: 600 } }, '○ FOB missing'),
      ),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
        // Quick KPI chips in header
        actSales != null && h('span', { style: { fontFamily: 'monospace', fontSize: '11px', fontWeight: 700,
          color: colSalesVar(salesVar) } }, '$' + Math.round(actSales / 1000) + 'K actual'),
        pctImpact != null && h('span', { style: { fontFamily: 'monospace', fontSize: '11px', fontWeight: 700,
          color: colPctImpact(pctImpact) } }, (pctImpact * 100).toFixed(2) + '% P&L impact'),
        !isRollup && h('span', { style: { fontSize: '13px', color: muted, transition: 'transform .2s',
          transform: isExp ? 'rotate(180deg)' : 'none' } }, '▾'),
      )
    ),
    // Expanded content
    (isExp || isRollup) && h('div', { style: { padding: '12px' } },
      missingNote,
      noTargetsNote,
      dataTable,
      laborAdj,
    )
  );
}

// ── Print (isolated window) ─────────────────────────────────────────────────────
// 2026-08-31/2026-09-01 history: this file used to also export PRINT_STYLE (an in-place
// body.eom-printing + @media print mechanism) and PrintGeneratingBanner, reused verbatim by the
// Missing Items / Recount Impact / Team Snapshot / Count Swings report tabs. That mechanism
// reproducibly printed BLANK for the owner (dark-mode CSS-variable colors resolving to
// near-white-on-white under print, plus a DOM-nesting scoping bug) even after two rounds of real
// fixes, so those four reports were migrated onto the isolated-window mechanism below instead
// (2026-08-31, dispatch #227). Supervisor Rollup (THIS panel) was deliberately left on the old
// mechanism at the time, since its own `forPrint` flag did more than gate a banner — it also
// expanded every row and swapped editable cells for plain text — and had never been confirmed
// broken. It was, though (owner-flagged 2026-09-01, same failure mode as the other four): this
// panel is now migrated too, via formatSupervisorHtml() below (a pure HTML-string export, same
// shape as formatMissingItemsHtml/formatRecountImpactHtml), and PRINT_STYLE/PrintGeneratingBanner
// were removed entirely — once this panel stopped using them, they had zero remaining callers
// app-wide (mirrors 9ba5140's own removal of ensureEomPrintStyleInjected for the same reason).
export function openPrintWindow(title, bodyHtml) {
  try {
    // NB: do NOT pass 'noopener' — with it window.open() returns null, so nothing gets written and
    // the new tab stays blank white (owner Notes 38: "Print for summary report ... blank white page").
    const w = window.open('', '_blank', 'width=900,height=1100');
    if (!w) { console.warn('[eom] print window blocked'); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:-apple-system,system-ui,"Segoe UI",sans-serif;color:#111;margin:26px;font-size:12px;line-height:1.45}
h1{font-size:17px;margin:0 0 3px}.sub{color:#666;font-size:11px;margin:0 0 16px}
table{border-collapse:collapse;width:100%;margin:0 0 18px}th,td{border:1px solid #cbcbcb;padding:5px 8px;text-align:left;vertical-align:top}
th{background:#f1f1f1;font-size:10.5px;text-transform:uppercase;letter-spacing:.04em}
tr{break-inside:avoid}.g{font-weight:800}.r{color:#b00}.mono{font-family:ui-monospace,Menlo,monospace}
.block{margin-bottom:14px;break-inside:avoid} .loc-hdr{font-size:13px;font-weight:800;margin:14px 0 2px}
.grp{font-weight:700;color:#1a1a1a;margin:8px 0 3px;font-size:11.5px}
.badge{display:inline-block;font-size:10px;font-weight:700;padding:1px 7px;border-radius:9px;margin-left:6px;border:1px solid}
.badge-warn{background:#fff7e6;border-color:#f0b400;color:#8a6400}
.badge-bad{background:#fdecec;border-color:#e05555;color:#a12020}
.s-block{margin-bottom:16px;break-inside:avoid;border:1px solid #ccc;border-radius:6px;padding:10px 12px}
.s-hdr{font-size:13px;margin-bottom:6px}
.s-badge{display:inline-block;font-size:10px;color:#666;background:#f0f0f0;border-radius:4px;padding:1px 6px;margin-left:6px}
.s-fob-ok{font-size:10px;color:#0a0;font-weight:700;margin-left:6px}
.s-fob-bad{font-size:10px;color:#b80;font-weight:700;margin-left:6px}
.s-kpi{font-size:11px;color:#333;font-weight:700;margin-left:10px}
.s-note{font-size:10px;color:#666;margin:4px 0}
.s-note-warn{color:#8a6400;background:#fff7e6;border:1px solid #f0b400;border-radius:4px;padding:3px 8px}
.s-table{table-layout:fixed}
.s-table th{font-size:9px;text-align:right;white-space:nowrap}
.s-table th:first-child{text-align:left;width:70px}
.s-table td{font-family:ui-monospace,Menlo,monospace;font-size:11px;text-align:right;white-space:nowrap}
.s-lbl{text-align:left!important;font-weight:700;color:#555;font-family:-apple-system,system-ui,sans-serif!important}
.s-amt td{background:#fff8e6}
.s-labor{margin-top:0;background:#fffaf0}
.s-labor-lbl{font-weight:700;font-size:10px;color:#555;white-space:nowrap;text-align:left!important}
.s-labor td{font-size:11px;padding:4px 8px;text-align:left}
.s-total{font-size:11px;margin-top:6px}
@media print{.noprint{display:none}}</style></head><body>${bodyHtml}
<script>window.onload=function(){setTimeout(function(){window.focus();window.print();},200)}<\/script></body></html>`);
    w.document.close();
  } catch (e) { console.warn('[eom] print failed', e); }
}

// Static HTML for one store or rollup block — mirrors EOMBlock's dataTable + laborAdj sections
// exactly (same columns, same rows, same values), using the SAME row-value formatters
// (varMoneyStr/varPctStr/salesStr/pctStr/hrStr, module-scope above) and the SAME color helpers
// (colShaded/colPctVar/colCash/colSalesVar/colPctImpact, "── Color helpers" above) the live table
// uses, so the print colors/values can't drift from what the screen shows. Always "forPrint"
// semantics — every value plain text, since the isolated print window never mounts EOMBlock or
// has any live React state to edit.
function eomBlockHtml(data, { isRollup, label } = {}) {
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const {
    projSales, projFCPct, projFOBPct, projLaborPct, projOpSup,
    actSales, actFCPct, actFOBPct, actLaborPct, actOpSup, actCash,
    otHours, otDollar, laborXfers, laborUnclk,
    salesVar, fcVarPct, fobVarPct, laborVarPct,
    fcVar$, fobVar$, laborAdjAmt, laborNewTotal, opSup$,
    totalShaded, pctImpact, locStr, hasFOB, hasTargets, name,
  } = data;
  const colorAttr = (v, fn) => v == null ? '' : ` style="color:${fn(v)}"`;
  const td = (content, colorStyle = '') => `<td${colorStyle}>${esc(content)}</td>`;

  let html = `<div class="s-block">`;
  html += `<div class="s-hdr"><b>${esc(label || name)}</b>`;
  if (!isRollup) html += ` <span class="s-badge">Rest. #${esc(locStr)}</span>`;
  if (hasFOB) html += ` <span class="s-fob-ok">✓ FOB</span>`;
  else if (!isRollup) html += ` <span class="s-fob-bad">○ FOB missing</span>`;
  const kpi = [];
  if (actSales != null) kpi.push(`$${Math.round(actSales / 1000)}K actual`);
  if (pctImpact != null) kpi.push(`${(pctImpact * 100).toFixed(2)}% P&L impact`);
  if (kpi.length) html += ` <span class="s-kpi">${esc(kpi.join(' · '))}</span>`;
  html += `</div>`;

  if (!hasFOB && !isRollup) {
    html += `<div class="s-note s-note-warn">⚠ No FOB report found for this period — actual food cost / labor data missing. Enter monthly target data manually or upload the FOB report.</div>`;
  }
  if (!hasTargets && !isRollup) {
    html += `<div class="s-note">No monthly targets loaded for this store — upload QSRSoft Monthly Projections or enter projection values.</div>`;
  }

  html += `<table class="s-table"><thead><tr><th></th><th>Product Net Sales</th><th>Total Food Cost</th><th>Food Over Base</th><th>Crew Labor</th><th>OT Hours</th><th>Op Supplies</th><th>Cash +/&minus;</th></tr></thead><tbody>`;
  html += `<tr><td class="s-lbl">Projection</td>${td(salesStr(projSales))}${td(pctStr(projFCPct))}${td(pctStr(projFOBPct))}${td(pctStr(projLaborPct))}${td('0')}${td(salesStr(projOpSup))}${td('—')}</tr>`;
  html += `<tr><td class="s-lbl">Actual</td>`
    + td(actSales != null ? salesStr(actSales) : '—', colorAttr(actSales && projSales ? actSales - projSales : null, colSalesVar))
    + td(pctStr(actFCPct), actFCPct != null ? colorAttr(actFCPct - (projFCPct || 0), colPctVar) : '')
    + td(pctStr(actFOBPct), actFOBPct != null ? colorAttr(actFOBPct - (projFOBPct || 0), colPctVar) : '')
    + td(pctStr(actLaborPct), actLaborPct != null ? colorAttr(actLaborPct - (projLaborPct || 0), colPctVar) : '')
    + td(hrStr(otHours))
    + td(salesStr(actOpSup))
    + td(actCash != null ? varMoneyStr(actCash) : '—', colorAttr(actCash, colCash))
    + `</tr>`;
  html += `<tr><td class="s-lbl">+/−</td>`
    + td(salesVar != null ? varMoneyStr(salesVar) : '—', colorAttr(salesVar, colSalesVar))
    + td(varPctStr(fcVarPct), colorAttr(fcVarPct, colPctVar))
    + td(varPctStr(fobVarPct), colorAttr(fobVarPct, colPctVar))
    + td(varPctStr(laborVarPct), colorAttr(laborVarPct, colPctVar))
    + td('—')
    + td(opSup$ != null ? varMoneyStr(opSup$) : '—', opSup$ != null ? colorAttr(opSup$, colPctVar) : '')
    + td('—')
    + `</tr>`;
  html += `<tr class="s-amt"><td class="s-lbl">$ Amount</td>`
    + td('—')
    + td(fcVar$ != null ? varMoneyStr(fcVar$) : '—', colorAttr(fcVar$, colShaded))
    + td(fobVar$ != null ? varMoneyStr(fobVar$) : '—', colorAttr(fobVar$, colShaded))
    + td(laborAdjAmt != null ? varMoneyStr(laborAdjAmt) : '—', colorAttr(laborAdjAmt, colShaded))
    + td(otDollar != null ? varMoneyStr(otDollar) : '—', colorAttr(otDollar, colShaded))
    + td(opSup$ != null ? varMoneyStr(opSup$) : '—', colorAttr(opSup$, colShaded))
    + td('—')
    + `</tr>`;
  html += `</tbody></table>`;

  // Crew Labor Adjustment mini-panel — same 4 fields as the live laborAdj sidebar.
  html += `<table class="s-labor"><tbody><tr>`
    + `<td class="s-labor-lbl">Crew Labor Adjustment</td>`
    + `<td>$ Amount (Shaded): <b${colorAttr(laborAdjAmt, colShaded)}>${esc(laborAdjAmt != null ? varMoneyStr(laborAdjAmt) : '—')}</b></td>`
    + `<td>Transfers: <b>${esc(laborXfers != null ? varMoneyStr(laborXfers) : '—')}</b></td>`
    + `<td>Unclocked Labor: <b>${esc(laborUnclk != null ? varMoneyStr(laborUnclk) : '—')}</b></td>`
    + `<td>New Total $: <b${colorAttr(laborNewTotal, colShaded)}>${esc(varMoneyStr(laborNewTotal))}</b></td>`
    + `</tr></tbody></table>`;
  html += `<div class="s-total">Total of Shaded Boxes: <b${colorAttr(totalShaded, colShaded)}>${esc(varMoneyStr(totalShaded))}</b>`
    + ` &nbsp;÷ Prod. Net Sales = <b${colorAttr(pctImpact, colPctImpact)}>${esc(pctImpact != null ? (pctImpact * 100).toFixed(2) + '% impact to P&L' : '—')}</b></div>`;

  html += `</div>`;
  return html;
}

// HTML export for the "🖨 Print" button (2026-09-01 migration — see openPrintWindow's own comment
// above for the full history). Pure function of the same rollup/storeData the live panel already
// computed, so print can't disagree with what's on screen; the rollup block always renders (same
// as the live "SUPERVISOR PATCH TOTAL" card), followed by one block per in-scope store.
export function formatSupervisorHtml(rollup, storeData, { groupLabel, monthLabel } = {}) {
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const list = storeData || [];
  let html = `<h1>EOM Supervisor Summary — ${esc(groupLabel || 'All Stores')}</h1>`;
  html += `<div class="sub">${esc(monthLabel)} · ${list.length} location${list.length === 1 ? '' : 's'}</div>`;
  if (rollup) {
    html += eomBlockHtml(rollup, { isRollup: true, label: `SUPERVISOR PATCH TOTAL — ${groupLabel} — ${monthLabel}` });
  }
  if (!list.length) {
    html += `<p>No store data found for the selected period and group. Upload FOB or Monthly Targets to populate.</p>`;
  } else {
    for (const sd of list) html += eomBlockHtml(sd, { isRollup: false, label: sd.name });
  }
  return html;
}

// ── Main Panel ────────────────────────────────────────────────────────────────
// dispatch #225 Task 3/4 — `period` ('YYYY-MM', the SAME shared period every other Inventory
// Control tab now reads — src/views/eom-dashboard.js) and `scopedLocs` (the resolved loc list
// from the SAME shared LocationSelector every other tab now reads) replace this panel's former
// own independent selYear/selMonth state + internal month/year picker and its own unscoped
// `Object.keys(STORE_NAMES)` universe. Translated to {selYear, selMonth} at this boundary
// (parsePeriod below) rather than rewriting computeStoreEOM/computeRollup's own selYear/selMonth-
// keyed internals. groupType/selGroup (which rollup grouping) stays independent — a different
// axis from scopedLocs (which stores are in scope at all); the two compose (see targetLocs).
function parsePeriod(period) {
  const m = /^(\d{4})-(\d{2})$/.exec(period || '');
  const now = new Date();
  if (!m) return { selYear: now.getFullYear(), selMonth: now.getMonth() + 1 };
  return { selYear: +m[1], selMonth: +m[2] };
}
export function EOMSupervisorPanel({ ds, settings, supabase, period, scopedLocs }) {
  // dispatch #225 Task 4 — selYear/selMonth are now DERIVED from the shared `period` prop
  // (src/views/eom-dashboard.js's EOMDashboardPanel, one period picker for all 5 tabs), not
  // independent state. This drops the old "default to last completed month" initializer (Notes
  // 53) and the "sync selYear/selMonth to whatever monthly targets loaded" effect below it —
  // both existed only to pick a sensible period when this panel owned its own period state;
  // with one shared, user-controlled period picker at the top of the hub, EOMDashboardPanel's own
  // defaultPeriod() is the single default and the owner's own selection is authoritative.
  const { selYear, selMonth } = uM(() => parsePeriod(period), [period]);
  const [groupType, setGroupType] = uSt('supervisor'); // supervisor | operator | all
  const [selGroup, setSelGroup]   = uSt('all');
  const [expanded,   setExpanded]  = uSt(null);
  const [manual,     setManual]    = uSt(() => loadManual(selYear, selMonth));
  const [ebosByLoc,  setEbosByLoc] = uSt({});

  // Reload manual data when month changes — local first, then merge remote
  uE(() => {
    const local = loadManual(selYear, selMonth);
    setManual(local);
    if (supabase) {
      const sbKey = `eom_manual_${selYear}_${selMonth}`;
      supabase.from('org_config').select('data').eq('key', sbKey).maybeSingle()
        .then(({ data }) => {
          if (!data?.data) return;
          setManual(cur => ({ ...cur, ...data.data }));
        }).catch(() => {});
    }
  }, [selYear, selMonth, supabase]);

  // Load eBOS op supply actuals for the selected month
  uE(() => {
    loadEbosMonthlyByStore(selYear, selMonth).then(setEbosByLoc).catch(() => {});
  }, [selYear, selMonth]);

  // Build group maps from settings or DEF_SETTINGS
  const supGroups = uM(() => {
    const sg = (settings?.supervisorGroups) || DEF_SETTINGS.supervisorGroups || {};
    return Object.entries(sg).map(([name, locs]) => ({ name, locs: locs.map(String) }));
  }, [settings]);
  const opGroups = uM(() => {
    const og = (settings?.operators) || DEF_SETTINGS.operators || {};
    return Object.entries(og).map(([name, locs]) => ({ name, locs: locs.map(String) }));
  }, [settings]);
  // dispatch #225 Task 3 — the shared LocationSelector's resolved scope (`scopedLocs`, from
  // EOMDashboardPanel) replaces the old unconditional `Object.keys(STORE_NAMES)` universe. Falls
  // back to every store when the prop is absent/empty (defensive default; in practice the parent
  // always resolves at least 'all' → every store).
  const allLocs = uM(() => (scopedLocs && scopedLocs.length ? scopedLocs.map(String) : Object.keys(STORE_NAMES).map(String)), [scopedLocs]);

  // Determine which stores to include: groupType/selGroup (which rollup grouping) composes WITH
  // the location scope above (which stores are in scope at all) — a location narrower must still
  // apply even when a specific supervisor/operator patch is also selected, not get silently
  // overridden by it (dispatch #225 verification requirement).
  const targetLocs = uM(() => {
    const base = (groupType === 'all' || selGroup === 'all') ? allLocs : (() => {
      const groups = groupType === 'supervisor' ? supGroups : opGroups;
      const g = groups.find(g => g.name === selGroup);
      return g ? g.locs : allLocs;
    })();
    const scopedSet = new Set(allLocs);
    // Sort by location number (owner-requested 2026-09-01) -- a named supervisor/operator
    // group's `locs` array is stored in whatever order it was configured in (settings, not
    // necessarily numeric), so store cards could render out of order (e.g. Mossy Head/37566
    // before Bonifay/10034 within "Marys Patch"). The 'all' case already happened to look
    // sorted (JS iterates integer-like object keys, i.e. STORE_NAMES's, in ascending numeric
    // order per spec) -- sorting explicitly here makes every grouping consistent, not just 'all'.
    return base.filter(l => scopedSet.has(String(l))).sort((a, b) => (+a || 0) - (+b || 0));
  }, [groupType, selGroup, supGroups, opGroups, allLocs]);

  // Compute per-store EOM data — targets resolved from ds.allMonthlyTargets by period
  const storeData = uM(() =>
    targetLocs.map(loc => computeStoreEOM(loc, ds, manual, selYear, selMonth, ebosByLoc))
              .filter(s => s.hasTargets || s.hasFOB)
  , [targetLocs, ds, manual, selYear, selMonth, ebosByLoc]);

  // Rollup
  const rollup = uM(() => computeRollup(storeData), [storeData]);

  // ── OP Supplies export (Note 5): every store's current op-supplies (eBOS MTD +
  // projected), sorted low→high by store number, for pasting into projections. ──
  const [opCopied, setOpCopied] = uSt(false);
  const opSupplyRows = uM(() =>
    storeData.slice()
      .sort((a, b) => (+a.loc || 0) - (+b.loc || 0))
      .map(s => ({ num: s.locStr, name: s.name, act: s.actOpSup, proj: s.projOpSup })),
    [storeData]);
  const OP_COLS = [
    ['Store #', r => r.num],
    ['Store', r => r.name],
    ['OP Supplies MTD $', r => r.act != null ? r.act.toFixed(2) : ''],
    ['Projected OP Supply $', r => r.proj != null ? Number(r.proj).toFixed(2) : ''],
  ];
  const buildOpTable = (delim) => {
    const head = OP_COLS.map(c => c[0]).join(delim);
    const body = opSupplyRows.map(r => OP_COLS.map(c => {
      const v = c[1](r);
      return delim === ',' ? csvCell(v) : String(v ?? '');
    }).join(delim)).join('\n');
    return head + '\n' + body;
  };
  // The copied text has no filename (unlike the CSV export, which carries the period in its
  // filename) — a period-selector click changes what the underlying data IS, but the pasted
  // text itself gave no clue which month it was for once shared out of context (#52: "I need
  // EOM numbers for July" — the recipient can't tell from the paste alone). Prefix a title line.
  const copyOpSupplies = uCB(async () => {
    const title = `Op Supplies — ${MONTH_NAMES[selMonth - 1]} ${selYear}`;
    try { await navigator.clipboard.writeText(title + '\n' + buildOpTable('\t')); setOpCopied(true); setTimeout(() => setOpCopied(false), 2000); }
    catch { setOpCopied(false); }
  }, [opSupplyRows, selYear, selMonth]);
  const exportOpCsv = uCB(() =>
    downloadFile(buildOpTable(','), `op-supplies-${selYear}-${String(selMonth).padStart(2, '0')}.csv`),
    [opSupplyRows, selYear, selMonth]);

  // Update manual for one store field
  const onManualChange = uCB((loc, field, value) => {
    setManual(prev => {
      const next = { ...prev, [String(loc)]: { ...(prev[String(loc)] || {}), [field]: value } };
      saveManual(selYear, selMonth, next);
      if (supabase) {
        const sbKey = `eom_manual_${selYear}_${selMonth}`;
        supabase.from('org_config').upsert({ key: sbKey, data: next }, { onConflict: 'key' }).catch(() => {});
      }
      return next;
    });
  }, [selYear, selMonth, supabase]);

  const monthLabel = `${MONTH_NAMES[selMonth - 1]} ${selYear}`;
  const groupLabel = selGroup === 'all' ? 'All Stores' : selGroup;

  // Print the current grouping in an isolated window (2026-09-01 migration — see
  // openPrintWindow's own comment for the full history). Pure function of the SAME rollup/
  // storeData the live cards already show, so print can't disagree with the screen.
  const doPrint = uCB(() => {
    openPrintWindow(
      `EOM Supervisor Summary — ${groupLabel} — ${monthLabel}`,
      formatSupervisorHtml(rollup, storeData, { groupLabel, monthLabel })
    );
  }, [rollup, storeData, groupLabel, monthLabel]);

  const meta = ds.monthlyTargetsMeta;
  const mtLoaded = !!(meta?.year);
  // Same manual-only blind spot as hasFOB above (computeStoreEOM) — this header banner also
  // ignored the auto-pulled qsr_fob stream (ds.qsrFobRows), so it could read "No FOB data" while
  // stores below it were showing real cloud-sourced actuals.
  const fobLoaded = !!(ds.fobRows?.length || ds.qsrFobRows?.length);

  // Available groups for the current group type
  const availGroups = groupType === 'supervisor' ? supGroups : opGroups;

  return h('div', { style: { padding: '16px', maxWidth: '1100px', margin: '0 auto' } },

    // ── Print styles (screen-only controls) ────────────────────────────────
    h('div', { className: 'eom-no-print' },

      // Header
      h('div', { style: { marginBottom: '16px' } },
        h('div', { style: { fontSize: '11px', fontWeight: 700, letterSpacing: '.1em',
                             textTransform: 'uppercase', color: amber, marginBottom: '4px' } },
          'EOM Supervisor Summary'),
        h('div', { style: { fontFamily: "'Syne',sans-serif", fontSize: '22px', fontWeight: 900,
                             letterSpacing: '-.03em', color: 'var(--text,#111827)' } },
          groupLabel + ' — ' + monthLabel),
        h('div', { style: { fontSize: '11px', color: muted, marginTop: '3px', display: 'flex', gap: '12px', flexWrap: 'wrap' } },
          h('span', null, storeData.length + ' stores'),
          mtLoaded
            ? h('span', { style: { color: grn } }, '✓ Monthly Targets: ' + MONTH_SHORT[meta.month-1] + ' ' + meta.year)
            : h('span', { style: { color: amber } }, '○ No monthly targets loaded'),
          fobLoaded
            ? h('span', { style: { color: grn } }, '✓ FOB data in session')
            : h('span', { style: { color: amber } }, '○ No FOB data — food cost actuals will be missing'),
          Object.keys(ebosByLoc).length > 0
            ? h('span', { style: { color: grn } }, '✓ eBOS op supplies: ' + Object.keys(ebosByLoc).length + ' stores')
            : h('span', { style: { color: muted } }, '○ No eBOS data for period'),
        )
      ),

      // Controls row
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' } },

        // dispatch #225 Task 4 — the own month/year <select> pair that lived here is gone;
        // Period is now the shared picker at the top of the Inventory Control hub
        // (EOMDashboardPanel's dateControlSlot, PanelChrome's `dateControl` band), which this
        // panel reads via the `period` prop (see parsePeriod above). monthLabel/selYear/selMonth
        // below are unchanged reads, just now derived instead of independently settable here.

        // Group type toggle
        h('div', { style: { display: 'flex', gap: '3px' } },
          ['supervisor', 'operator', 'all'].map(t =>
            h('button', {
              key: t,
              onClick: () => { setGroupType(t); setSelGroup('all'); },
              style: pillStyle(groupType === t),
            }, t === 'supervisor' ? 'By Supervisor' : t === 'operator' ? 'By Operator' : 'All Stores')
          )
        ),

        // Group selector
        groupType !== 'all' && h('select', {
          value: selGroup,
          onChange: e => setSelGroup(e.target.value),
          style: ctrlStyle(),
        },
          h('option', { value: 'all' }, '— All —'),
          ...availGroups.map(g => h('option', { key: g.name, value: g.name }, g.name))
        ),

        h('div', { style: { marginLeft: 'auto', display: 'flex', gap: '6px' } },
          // OP Supplies copy / CSV (Note 5) — current op-supplies per store for projections
          h('button', {
            onClick: copyOpSupplies, disabled: opSupplyRows.length === 0,
            title: 'Copy every store’s OP Supplies for the selected Period above (actual + projected), sorted by store number — paste into Excel',
            style: {
              background: opCopied ? 'rgba(16,185,129,.18)' : 'rgba(255,255,255,.06)',
              border: '1px solid var(--bdr)', color: opCopied ? grn : 'var(--text,#111827)',
              borderRadius: '7px', padding: '6px 12px', cursor: opSupplyRows.length ? 'pointer' : 'not-allowed', fontSize: '12px', fontWeight: 600,
            }
          }, opCopied ? '✓ Copied' : '📋 Copy OP Supplies'),
          h('button', {
            onClick: exportOpCsv, disabled: opSupplyRows.length === 0,
            title: 'Download OP Supplies per store as CSV, sorted by store number',
            style: {
              background: 'rgba(255,255,255,.06)', border: '1px solid var(--bdr)',
              color: 'var(--text,#111827)', borderRadius: '7px', padding: '6px 12px',
              cursor: opSupplyRows.length ? 'pointer' : 'not-allowed', fontSize: '12px', fontWeight: 600,
            }
          }, '⬇ CSV'),
          // Print button — expands every location, then prints the current grouping (rollup + each store)
          h('button', {
            onClick: doPrint,
            title: 'Print the selected grouping — patch total on top, each assigned location below, one location per block (no location splits across pages).',
            style: {
              background: 'rgba(16,185,129,.12)', border: '1px solid rgba(16,185,129,.3)',
              color: grn, borderRadius: '7px', padding: '6px 14px',
              cursor: 'pointer', fontSize: '12px', fontWeight: 600,
            }
          }, '🖨 Print'),
        ),
      ),
    ), // end eom-no-print

    // Rollup block at top — always rendered in forPrint style (fully expanded, plain values):
    // its numbers are computed aggregates, never directly editable, regardless of print state.
    rollup && h(EOMBlock, {
      key: 'rollup',
      data: rollup,
      isRollup: true,
      label: `SUPERVISOR PATCH TOTAL — ${groupLabel} — ${monthLabel}`,
      manual: {},
      onManualChange: () => {},
      expanded: null,
      setExpanded: () => {},
      forPrint: true,
    }),

    // Per-store blocks — interactive on screen (click to expand, EditCell inputs); printing no
    // longer toggles this DOM at all (see doPrint/openPrintWindow/formatSupervisorHtml above).
    storeData.map(sd =>
      h(EOMBlock, {
        key: sd.locStr,
        data: sd,
        isRollup: false,
        label: sd.name,
        manual: manual[sd.locStr] || {},
        onManualChange: (field, val) => onManualChange(sd.locStr, field, val),
        expanded,
        setExpanded,
      })
    ),

    storeData.length === 0 && h('div', {
      style: { textAlign: 'center', padding: '48px', color: muted, fontSize: '14px' }
    }, 'No store data found for the selected period and group. Upload FOB or Monthly Targets to populate.'),

    // Legend
    h('div', { className: 'eom-no-print', style: { marginTop: '16px', fontSize: '10px', color: muted, display: 'flex', gap: '16px', flexWrap: 'wrap' } },
      h('span', null, '🟡 Yellow cells = manual entry required'),
      h('span', null, '✓ Green = at/under projection'),
      h('span', null, '⚠ Amber = slight variance'),
      h('span', null, '✗ Red = significant over-projection'),
    ),
  );
}

// ── Style helpers ─────────────────────────────────────────────────────────────
function ctrlStyle() {
  return {
    background: 'rgba(255,255,255,.07)', border: '1px solid var(--bdr)',
    borderRadius: '7px', padding: '5px 10px', color: 'var(--text,#111827)',
    fontSize: '12px', cursor: 'pointer',
  };
}
function pillStyle(active) {
  return {
    padding: '5px 12px', borderRadius: '99px', fontSize: '11px', fontWeight: 600,
    cursor: 'pointer', border: '1px solid',
    background: active ? 'rgba(245,158,11,.15)' : 'transparent',
    borderColor: active ? 'rgba(245,158,11,.4)' : 'var(--bdr)',
    color: active ? amber : muted,
  };
}
