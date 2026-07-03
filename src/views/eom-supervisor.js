// @ts-nocheck
import * as React from 'react';
import { STORE_NAMES, sNameC, DEFAULT_TARGETS, DEF_SETTINGS } from '../constants.js';

const h = React.createElement;
const { useState: uSt, useEffect: uE, useMemo: uM, useCallback: uCB, useRef: uR } = React;

// ── Constants ─────────────────────────────────────────────────────────────────
const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const MANUAL_STORE_KEY = (y, m) => `meridian_eom_manual_${y}_${m}`;

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
  return p.toFixed(4) + '%';
};
const fmtPctDisplay = (v, dec = 4) => {
  if (v == null) return '—';
  const p = v > 1 ? v : v * 100;
  return p.toFixed(dec) + '%';
};
const fmtPctVar = (v) => {
  if (v == null) return '—';
  const p = v > 1 ? v : v * 100;
  const sign = p >= 0 ? '' : '';
  return (p >= 0 ? '' : '') + p.toFixed(4) + '%';
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
function computeStoreEOM(loc, ds, manual, selYear, selMonth) {
  const locStr = String(loc);
  const mt     = ds.monthlyTargets?.[locStr] || {};
  const tgt    = DEFAULT_TARGETS[locStr] || {};
  const meta   = ds.monthlyTargetsMeta;
  // mtOK: true when targets period matches the EOM period being viewed.
  // Priority: row-level _year/_month stamps (set by Supabase load and pipeline.js) first,
  // then monthlyTargetsMeta (set when a file is dragged in).
  const mtYear  = mt._year  || meta?.year;
  const mtMonth = mt._month || meta?.month;
  const mtOK    = !mtYear || (mtYear === selYear && mtMonth === selMonth);

  // Projections — from monthly targets (if matching month) or DEFAULT_TARGETS fallback
  // tLabor = generic labor %, tCrewLabor = crew-only — check both (Supabase loads tCrewLabor)
  const projSales    = (mtOK && mt.tProdSales)                          || tgt.tJuneProj       || null;
  const projFCPct    = (mtOK && mt.tFOBTotal)                           || null;
  const projFOBPct   = (mtOK && mt.tFOBTarget)                          || null;
  const projLaborPct = (mtOK && (mt.tCrewLabor || mt.tLabor))           || tgt.tJuneLaborPct   || null;
  const projOpSup    = (mtOK && mt.tOpSupply)                           || null;

  // Actuals from FOB rows (monthly report, one row per store per period)
  const fobRow = (ds.fobRows || []).find(r =>
    String(r.loc) === locStr &&
    r.date instanceof Date &&
    r.date.getFullYear() === selYear &&
    r.date.getMonth() + 1 === selMonth
  );

  // Labor rows for this store/month — period-summary Ops Report gives one row with
  // full-month totals (prodSales >> any single daily row), so take the max-sales row.
  const monthLaborRows = (ds.laborRows || []).filter(r =>
    String(r.loc) === locStr &&
    r.date instanceof Date &&
    r.date.getFullYear() === selYear &&
    r.date.getMonth() + 1 === selMonth
  );
  const summaryLabRow = monthLaborRows.reduce(
    (best, r) => (!best || (r.sales||0) > (best.sales||0)) ? r : best, null
  );

  const actSales    = fobRow?.prodSales || fobRow?.netSales
                      || summaryLabRow?.sales || summaryLabRow?.allNetSales || null;
  const actFCPct    = fobRow?.pLFoodPct  || null; // Total Food Cost % actual
  const actFOBPct   = fobRow?.fobPct     || null; // Food Over Base % actual
  const actLaborPct = fobRow?.laborPct   || summaryLabRow?.laborPct || null; // Crew Labor %

  // Cash: sum from ctrlRows for the month
  const cashFromCtrl = (() => {
    const rows = (ds.ctrlRows || []).filter(r =>
      String(r.loc) === locStr &&
      r.date instanceof Date &&
      r.date.getFullYear() === selYear &&
      r.date.getMonth() + 1 === selMonth &&
      (r.cashOSAmt || r.tCashOSAmt)
    );
    if (!rows.length) return null;
    const raw = rows.reduce((s, r) => s + (r.cashOSAmt || r.tCashOSAmt || 0), 0);
    return Math.round(raw * 100) / 100;
  })();

  // Manual overrides / inputs for this store
  const m            = manual[locStr] || {};
  const actOpSup     = m.actOpSup     != null ? +m.actOpSup     : null;
  const actCash      = m.actCash      != null ? +m.actCash      : cashFromCtrl;
  // OT Hours and OT $ — manual override first, then auto from Operations Report period-summary row
  const otHours      = m.otHours      != null ? +m.otHours      : (summaryLabRow?.otHrs    || null);
  const otDollar     = m.otDollar     != null ? +m.otDollar     : (summaryLabRow?.otDollar  || null);
  const laborXfers   = m.laborXfers   != null ? +m.laborXfers   : null;
  const laborUnclk   = m.laborUnclk   != null ? +m.laborUnclk   : null;
  const projOpSupMan = m.projOpSup    != null ? +m.projOpSup    : projOpSup;

  // Reference sales (actual if available, else projected)
  const refSales = actSales || projSales || 0;

  // $ variance rows — (actual% − proj%) × actual sales (pure rate impact)
  const fcVar$    = actFCPct    != null && projFCPct    != null && refSales
                    ? (norm(actFCPct) - norm(projFCPct)) * refSales : null;
  const fobVar$   = actFOBPct   != null && projFOBPct   != null && refSales
                    ? (norm(actFOBPct) - norm(projFOBPct)) * refSales : null;
  const laborVar$ = actLaborPct != null && projLaborPct != null && refSales
                    ? (norm(actLaborPct) - norm(projLaborPct)) * refSales : null;
  const opSup$    = actOpSup != null && (projOpSupMan || 0) > 0
                    ? actOpSup - projOpSupMan : null;
  const salesVar  = actSales != null && projSales != null ? actSales - projSales : null;
  const fcVarPct  = actFCPct    != null && projFCPct    != null ? norm(actFCPct)    - norm(projFCPct)    : null;
  const fobVarPct = actFOBPct   != null && projFOBPct   != null ? norm(actFOBPct)   - norm(projFOBPct)   : null;
  const laborVarPct = actLaborPct != null && projLaborPct != null ? norm(actLaborPct) - norm(projLaborPct) : null;

  // Crew Labor Adjustment section
  const laborAdjAmt  = laborVar$;
  const laborNewTotal= (laborAdjAmt || 0) + (laborXfers || 0) + (laborUnclk || 0);

  // Total P&L impact — sum of all negative variances (things costing more than plan)
  const totalShaded  = (fcVar$ || 0) + (fobVar$ || 0) + laborNewTotal + (otDollar || 0);
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
    hasFOB:     !!fobRow,
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

  const salesVar     = actSales && projSales ? actSales - projSales : null;
  const fcVarPct     = actFCPct  != null && projFCPct  != null ? actFCPct  - projFCPct  : null;
  const fobVarPct    = actFOBPct != null && projFOBPct != null ? actFOBPct - projFOBPct : null;
  const laborVarPct  = actLaborPct != null && projLaborPct != null ? actLaborPct - projLaborPct : null;

  const fcVar$       = sumF('fcVar$');
  const fobVar$      = sumF('fobVar$');
  const laborNewTotal= sumF('laborNewTotal');
  const otDollar     = sumF('otDollar');
  const opSup$       = anyF('opSup$') ? sumF('opSup$') : null;
  const totalShaded  = fcVar$ + fobVar$ + laborNewTotal + otDollar;
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

// ── EOM block (store or rollup) ───────────────────────────────────────────────
function EOMBlock({ data, isRollup, label, manual, onManualChange, expanded, setExpanded, forPrint }) {
  const id    = data.locStr || 'rollup';
  const isExp = forPrint || expanded === id;
  const C     = { // col header style
    th: { background: '#1e2d40', color: '#94b3cc', fontSize: '9px', fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '.05em', padding: '4px 6px',
          textAlign: 'right', borderRight: '1px solid rgba(255,255,255,.07)' },
    thL: { textAlign: 'left' },
    td: { fontFamily: 'monospace', fontSize: '11px', fontWeight: 600, padding: '3px 6px',
          textAlign: 'right', borderRight: '1px solid rgba(255,255,255,.06)',
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

  // pct variance display (basis points label)
  const varPctStr = (v) => {
    if (v == null) return '—';
    const p = (v * 100).toFixed(4);
    return (v > 0 ? '+' : '') + p + '%';
  };
  const varMoneyStr = (v) => {
    if (v == null) return '—';
    if (v < 0) return `(${fmtMoney(v, false).replace('-', '')})`;
    return `$${fmtD(v)}`;
  };
  const salesStr = (v) => v != null ? '$' + Math.round(v).toLocaleString() : '—';
  const pctStr   = (v) => v != null ? (v * 100).toFixed(4) + '%' : '—';
  const hrStr    = (v) => v != null ? v.toFixed(2) : '—';

  const rowBg = (i) => i % 2 === 0 ? 'rgba(255,255,255,.025)' : 'transparent';
  const bdr   = isRollup ? '2px solid rgba(245,158,11,.35)' : '1px solid rgba(255,255,255,.1)';
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
          h('td', { style: C.td }, projOpSup != null ? '$' + Math.round(projOpSup).toLocaleString() : '—'),
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
              ? (actOpSup != null ? '$' + Math.round(actOpSup).toLocaleString() : '—')
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
          h('td', { style: { ...C.td, color: colShaded(data.laborVar$), fontWeight: 700 } }, data.laborVar$ != null ? varMoneyStr(data.laborVar$) : '—'),
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
      border: '1px solid rgba(255,255,255,.1)', borderRadius: '6px', overflow: 'hidden',
    }
  },
    h('div', { style: { background: 'rgba(245,158,11,.06)', padding: '6px 10px', minWidth: '140px', borderRight: '1px solid rgba(255,255,255,.08)' } },
      h('div', { style: { fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: '#94b3cc', marginBottom: '4px' } }, 'Crew Labor Adjustment'),
      ...[
        ['$ Amount (Shaded)', laborAdjAmt != null ? varMoneyStr(laborAdjAmt) : '—', colShaded(laborAdjAmt), null, null],
        ['Transfers', null, amber, 'laborXfers', laborXfers],
        ['Unclocked Labor', null, amber, 'laborUnclk', laborUnclk],
        ['New Total $', null, colShaded(laborNewTotal), null, null, true],
      ].map(([lbl, val, col, field, curVal, isTot]) => h('div', { key: lbl, style: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '2px 0', borderTop: isTot ? '1px solid rgba(255,255,255,.1)' : 'none',
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
        }, pctImpact != null ? ((pctImpact * 100).toFixed(4) + '% impact to P&L') : '—')
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
    style: { border: bdr, background: bg, borderRadius: '8px', marginBottom: '14px',
             pageBreakInside: 'avoid' }
  },
    // Block header
    h('div', {
      style: {
        padding: '8px 12px', cursor: isRollup ? 'default' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: isRollup ? 'rgba(245,158,11,.07)' : 'rgba(255,255,255,.03)',
        borderBottom: '1px solid rgba(255,255,255,.08)',
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

// ── Print styles ──────────────────────────────────────────────────────────────
const PRINT_STYLE = `
@media print {
  body { background: white !important; color: #111 !important; }
  .eom-no-print { display: none !important; }
  .eom-print-area { padding: 0 !important; }
  table { font-size: 10px !important; }
  th, td { padding: 3px 4px !important; }
  .eom-block { page-break-inside: avoid; margin-bottom: 10px !important; }
  @page { margin: 0.5in; size: landscape; }
}
`;

// ── Main Panel ────────────────────────────────────────────────────────────────
export function EOMSupervisorPanel({ ds, settings, supabase }) {
  // Inject print styles once
  uE(() => {
    const id = 'eom-print-style';
    if (!document.getElementById(id)) {
      const s = document.createElement('style');
      s.id = id; s.textContent = PRINT_STYLE;
      document.head.appendChild(s);
    }
  }, []);

  const now = new Date();
  const [selYear,  setSelYear]  = uSt(now.getFullYear());
  const [selMonth, setSelMonth] = uSt(now.getMonth() + 1);
  const [groupType, setGroupType] = uSt('supervisor'); // supervisor | operator | all
  const [selGroup, setSelGroup]   = uSt('all');
  const [expanded,  setExpanded]  = uSt(null);
  const [manual,    setManual]    = uSt(() => loadManual(now.getFullYear(), now.getMonth() + 1));
  const [forPrint,  setForPrint]  = uSt(false);

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

  // Sync monthly targets month if available
  uE(() => {
    const meta = ds.monthlyTargetsMeta;
    if (meta?.year && meta?.month) {
      setSelYear(meta.year);
      setSelMonth(meta.month);
    }
  }, [ds.monthlyTargetsMeta]);

  // Build group maps from settings or DEF_SETTINGS
  const supGroups = uM(() => {
    const sg = (settings?.supervisorGroups) || DEF_SETTINGS.supervisorGroups || {};
    return Object.entries(sg).map(([name, locs]) => ({ name, locs: locs.map(String) }));
  }, [settings]);
  const opGroups = uM(() => {
    const og = (settings?.operators) || DEF_SETTINGS.operators || {};
    return Object.entries(og).map(([name, locs]) => ({ name, locs: locs.map(String) }));
  }, [settings]);
  const allLocs = uM(() => Object.keys(STORE_NAMES).map(String), []);

  // Determine which stores to include based on group selection
  const targetLocs = uM(() => {
    if (groupType === 'all' || selGroup === 'all') return allLocs;
    const groups = groupType === 'supervisor' ? supGroups : opGroups;
    const g = groups.find(g => g.name === selGroup);
    return g ? g.locs : allLocs;
  }, [groupType, selGroup, supGroups, opGroups, allLocs]);

  // Compute per-store EOM data
  const storeData = uM(() =>
    targetLocs.map(loc => computeStoreEOM(loc, ds, manual, selYear, selMonth))
              .filter(s => s.hasTargets || s.hasFOB)
  , [targetLocs, ds, manual, selYear, selMonth]);

  // Rollup
  const rollup = uM(() => computeRollup(storeData), [storeData]);

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

  const meta = ds.monthlyTargetsMeta;
  const mtLoaded = !!(meta?.year);
  const fobLoaded = !!(ds.fobRows?.length);

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
        )
      ),

      // Controls row
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' } },

        // Month/Year picker
        h('div', { style: { display: 'flex', gap: '4px', alignItems: 'center' } },
          h('span', { style: { fontSize: '11px', color: muted } }, 'Period:'),
          h('select', {
            value: selMonth,
            onChange: e => setSelMonth(+e.target.value),
            style: ctrlStyle(),
          }, MONTH_NAMES.map((m, i) => h('option', { key: i + 1, value: i + 1 }, m))),
          h('select', {
            value: selYear,
            onChange: e => setSelYear(+e.target.value),
            style: ctrlStyle(),
          }, [2024, 2025, 2026, 2027].map(y => h('option', { key: y, value: y }, y))),
        ),

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
          // Print button
          h('button', {
            onClick: () => window.print(),
            style: {
              background: 'rgba(16,185,129,.12)', border: '1px solid rgba(16,185,129,.3)',
              color: grn, borderRadius: '7px', padding: '6px 14px',
              cursor: 'pointer', fontSize: '12px', fontWeight: 600,
            }
          }, '🖨 Print'),
        ),
      ),
    ), // end eom-no-print

    // ── Print area (always visible, but print-formatted) ─────────────────
    h('div', { className: 'eom-print-area' },

      // Print-only title
      h('div', { className: 'eom-no-print', style: { display: 'none' } }),

      // Rollup block at top
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

      // Per-store blocks
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
          forPrint,
        })
      ),

      storeData.length === 0 && h('div', {
        style: { textAlign: 'center', padding: '48px', color: muted, fontSize: '14px' }
      }, 'No store data found for the selected period and group. Upload FOB or Monthly Targets to populate.'),
    ),

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
    background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.12)',
    borderRadius: '7px', padding: '5px 10px', color: 'var(--text,#111827)',
    fontSize: '12px', cursor: 'pointer',
  };
}
function pillStyle(active) {
  return {
    padding: '5px 12px', borderRadius: '99px', fontSize: '11px', fontWeight: 600,
    cursor: 'pointer', border: '1px solid',
    background: active ? 'rgba(245,158,11,.15)' : 'transparent',
    borderColor: active ? 'rgba(245,158,11,.4)' : 'rgba(255,255,255,.1)',
    color: active ? amber : muted,
  };
}
