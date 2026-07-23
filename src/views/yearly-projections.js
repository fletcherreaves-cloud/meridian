// @ts-nocheck
// ── Yearly Projections panel ─────────────────────────────────────────────────
// Annual rollup of the official monthly sales targets (monthly_targets.sales_proj
// = tProdSales) vs actual product sales: Annual Target, YTD Actual, YTD-vs-plan
// (to-date, current month prorated), Projected Full Year (actual banked + remaining
// plan), and FY-vs-Target. Dollar-weighted OK/FL/grand subtotals (never average of
// %s). Actuals summed by month from loadDailySales (product sales, same basis as
// tProdSales). Complements the monthly "Pace to Target" view.
import * as React from 'react';
import { STORE_NAMES, getStoreOrg } from '../constants.js';
import { loadDailySales } from '../lib/supabase.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);

const ALL_LOCS = Object.keys(STORE_NAMES);
const FL_LOCS = new Set(ALL_LOCS.filter(l => getStoreOrg(l) === 'emerald'));
const locNum = s => { const n = parseInt(s, 10); return Number.isNaN(n) ? String(s == null ? '' : s) : String(n); };
const storeNm = l => STORE_NAMES[locNum(l)] || locNum(l);
const money = v => v == null || Number.isNaN(v) ? '—' : '$' + Math.round(v).toLocaleString();
const pctFmt = v => v == null || Number.isNaN(v) ? '—' : (v >= 0 ? '' : '') + v.toFixed(1) + '%';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// One store's annual figures. curMonth/dayFrac describe "today" within `year`.
function computeStoreYear(tgtByMonth, actByMonth, year, thisYear, curMonth, dayFrac) {
  let annual = 0, ytdActual = 0, ytdTgt = 0, remPlan = 0;
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const tgt = tgtByMonth[m] || 0;
    const act = actByMonth[m] || 0;
    annual += tgt;
    let state; // 'done' | 'current' | 'future'
    if (year < thisYear || (year === thisYear && m < curMonth)) state = 'done';
    else if (year === thisYear && m === curMonth) state = 'current';
    else state = 'future';
    if (state === 'done') { ytdActual += act; ytdTgt += tgt; }
    else if (state === 'current') { ytdActual += act; ytdTgt += tgt * dayFrac; remPlan += tgt * (1 - dayFrac); }
    else { remPlan += tgt; }
    months.push({ m, tgt, act, state });
  }
  const projFY = ytdActual + remPlan;
  return {
    annual, ytdActual, ytdTgt, projFY, months,
    ytdVsPct: ytdTgt > 0 ? (ytdActual / ytdTgt - 1) * 100 : null,
    fyVsPct: annual > 0 ? (projFY / annual - 1) * 100 : null,
  };
}

function aggregate(rows) {
  if (!rows.length) return null;
  const S = k => rows.reduce((a, r) => a + (r[k] || 0), 0);
  const annual = S('annual'), ytdActual = S('ytdActual'), ytdTgt = S('ytdTgt'), projFY = S('projFY');
  return {
    annual, ytdActual, ytdTgt, projFY, n: rows.length,
    ytdVsPct: ytdTgt > 0 ? (ytdActual / ytdTgt - 1) * 100 : null,
    fyVsPct: annual > 0 ? (projFY / annual - 1) * 100 : null,
  };
}

export function YearlyProjectionsPanel({ ds, stores, settings, onClose }) {
  const { useState, useMemo, useEffect } = React;
  const now = new Date();
  const thisYear = now.getFullYear();
  const [year, setYear] = useState(thisYear);
  const [actuals, setActuals] = useState({});   // {loc: {month: sales}}
  const [loading, setLoading] = useState(true);

  // Pull daily product sales spanning the selected year → sum by (loc, month).
  useEffect(() => {
    let live = true; setLoading(true);
    const startY = new Date(year, 0, 1);
    const days = Math.min(900, Math.max(40, Math.ceil((Date.now() - startY.getTime()) / 86400000) + 5));
    loadDailySales(days).then(rows => {
      if (!live) return;
      const byLocMonth = {};
      for (const r of rows || []) {
        const d = r.date instanceof Date ? r.date : new Date(r.date);
        if (Number.isNaN(+d) || d.getFullYear() !== year) continue;
        const loc = locNum(r.loc), m = d.getMonth() + 1;
        (byLocMonth[loc] = byLocMonth[loc] || {})[m] = (byLocMonth[loc][m] || 0) + (r.sales || 0);
      }
      setActuals(byLocMonth); setLoading(false);
    }).catch(() => { if (live) { setActuals({}); setLoading(false); } });
    return () => { live = false; };
  }, [year]);

  const curMonth = now.getMonth() + 1;
  const dayFrac = now.getDate() / new Date(thisYear, curMonth, 0).getDate();

  const model = useMemo(() => {
    const all = (ds && ds.allMonthlyTargets) || {};
    const tgtForMonth = m => all[year + '-' + m] || {};
    const rows = ALL_LOCS.map(loc => {
      const ln = locNum(loc);
      const tgtByMonth = {}; let hasTgt = false;
      for (let m = 1; m <= 12; m++) { const v = (tgtForMonth(m)[ln] || tgtForMonth(m)[loc] || {}).tProdSales; if (v != null) { tgtByMonth[m] = v; hasTgt = true; } }
      const actByMonth = actuals[ln] || {};
      const hasAct = Object.keys(actByMonth).length > 0;
      if (!hasTgt && !hasAct) return null;
      return { loc: ln, ...computeStoreYear(tgtByMonth, actByMonth, year, thisYear, curMonth, dayFrac) };
    }).filter(Boolean).sort((a, b) => (b.annual || 0) - (a.annual || 0));
    const ok = rows.filter(r => !FL_LOCS.has(r.loc));
    const fl = rows.filter(r => FL_LOCS.has(r.loc));
    return { rows, sub: { ok: aggregate(ok), fl: aggregate(fl), grand: aggregate(rows) } };
  }, [ds, actuals, year, curMonth, dayFrac]);

  const th = { padding: '6px 9px', fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--text3)', borderBottom: '.5px solid var(--bdr)', whiteSpace: 'nowrap', textAlign: 'right', background: 'var(--surf2)', position: 'sticky', top: 0 };
  const td = { padding: '5px 9px', fontSize: 11, borderBottom: '.5px solid rgba(255,255,255,.04)', whiteSpace: 'nowrap', textAlign: 'right', fontFamily: 'var(--mono)' };
  const pctCell = v => ({ ...td, fontWeight: 700, color: v == null ? 'var(--text3)' : v >= 0 ? '#10b981' : v >= -3 ? '#f59e0b' : '#ef4444' });
  const monthsTitle = r => 'Monthly target / actual:\n' + r.months.map(mo => `${MONTHS[mo.m - 1]}: ${money(mo.tgt)}${mo.state !== 'future' ? ' / ' + money(mo.act) + (mo.state === 'current' ? ' (MTD)' : '') : ' (plan)'}`).join('\n');

  const dataRow = r => h('tr', { key: r.loc, title: monthsTitle(r) },
    h('td', { style: { ...td, textAlign: 'left', fontWeight: 600, fontFamily: 'inherit' } }, storeNm(r.loc) + ' ', span({ style: { color: 'var(--text3)', fontWeight: 400, fontSize: 9 } }, '#' + r.loc)),
    h('td', { style: td }, money(r.annual)),
    h('td', { style: td }, money(r.ytdActual)),
    h('td', { style: pctCell(r.ytdVsPct) }, r.ytdVsPct == null ? '—' : (r.ytdVsPct >= 0 ? '+' : '') + pctFmt(r.ytdVsPct)),
    h('td', { style: { ...td, fontWeight: 700, color: 'var(--amber)' } }, money(r.projFY)),
    h('td', { style: pctCell(r.fyVsPct) }, r.fyVsPct == null ? '—' : (r.fyVsPct >= 0 ? '+' : '') + pctFmt(r.fyVsPct)));
  const subRow = (label, s) => s ? h('tr', { key: label, style: { background: 'rgba(245,188,0,.06)' } },
    h('td', { style: { ...td, textAlign: 'left', fontWeight: 800, fontFamily: 'inherit', color: 'var(--amber)' } }, label + ' ', span({ style: { color: 'var(--text3)', fontWeight: 400, fontSize: 9 } }, '(' + s.n + ')')),
    h('td', { style: { ...td, fontWeight: 700 } }, money(s.annual)),
    h('td', { style: { ...td, fontWeight: 700 } }, money(s.ytdActual)),
    h('td', { style: { ...pctCell(s.ytdVsPct), fontWeight: 800 } }, s.ytdVsPct == null ? '—' : (s.ytdVsPct >= 0 ? '+' : '') + pctFmt(s.ytdVsPct)),
    h('td', { style: { ...td, fontWeight: 800, color: 'var(--amber)' } }, money(s.projFY)),
    h('td', { style: { ...pctCell(s.fyVsPct), fontWeight: 800 } }, s.fyVsPct == null ? '—' : (s.fyVsPct >= 0 ? '+' : '') + pctFmt(s.fyVsPct))) : null;

  const stepBtn = (label, dy) => h('button', { onClick: () => setYear(y => y + dy), style: { padding: '1px 8px', borderRadius: 6, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text2)', fontSize: 12, fontWeight: 700, cursor: 'pointer' } }, label);

  return div({ style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)', zIndex: 460, display: 'flex', flexDirection: 'column', paddingTop: 20 } },
    div({ style: { flex: '0 0 20px', cursor: 'pointer' }, onClick: onClose }),
    div({ style: { flex: 1, background: 'var(--surf)', maxWidth: 1000, margin: '0 auto', width: 'calc(100% - 24px)', borderRadius: 'var(--rl) var(--rl) 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 -8px 40px rgba(0,0,0,.4)' } },
      // Header
      div({ style: { padding: '10px 16px', borderBottom: '.5px solid var(--bdr)', flexShrink: 0, background: 'var(--surf2)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
        span({ style: { fontSize: 18 } }, '📆'),
        div({ style: { flex: 1, minWidth: 180 } },
          div({ style: { fontSize: 14, fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 } }, 'Yearly Projections',
            stepBtn('‹', -1),
            span({ style: { fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 99, background: 'rgba(245,188,0,.15)', color: 'var(--amber)' } }, year),
            stepBtn('›', 1)),
          div({ style: { fontSize: 9, color: 'var(--text3)' } }, 'Annual official target (Σ monthly_targets) vs actual product sales · YTD-to-date (current month prorated) · Projected FY = actual banked + remaining plan.')),
        h('button', { className: 'btn btn-sm', style: { color: 'var(--text3)' }, onClick: onClose }, '✕')),
      // Body
      div({ style: { flex: 1, overflowY: 'auto', padding: '12px 16px' } },
        loading
          ? div({ style: { textAlign: 'center', padding: '48px', color: 'var(--text3)', fontSize: 12 } }, 'Loading ' + year + ' actuals…')
          : !model.rows.length
          ? div({ style: { textAlign: 'center', padding: '48px', color: 'var(--text3)', fontSize: 12 } }, 'No targets or actuals for ' + year + '. Set monthly targets (Smart Targets → Apply as Official, or the Monthly Projections upload).')
          : div({ style: { background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8, overflow: 'auto' } },
              h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
                h('thead', null, h('tr', null,
                  h('th', { style: { ...th, textAlign: 'left' } }, 'Store'),
                  h('th', { style: th }, 'Annual Target'),
                  h('th', { style: th }, 'YTD Actual'),
                  h('th', { style: th, title: 'YTD actual vs plan-to-date (current month prorated by day)' }, 'YTD vs Plan'),
                  h('th', { style: th, title: 'Actual banked + remaining months’ plan' }, 'Proj Full Year'),
                  h('th', { style: th, title: 'Projected full year vs annual target' }, 'FY vs Target'))),
                h('tbody', null,
                  ...model.rows.map(dataRow),
                  subRow('Oklahoma', model.sub.ok),
                  subRow('Florida', model.sub.fl),
                  subRow('Grand Total', model.sub.grand)))),
        div({ style: { fontSize: 8, color: 'var(--text3)', marginTop: 8, lineHeight: 1.5 } },
          'Annual Target = Σ of the 12 official monthly sales targets (monthly_targets.sales_proj) for ' + year + '. YTD Actual = Σ actual product sales through today. YTD vs Plan compares YTD actual against the plan for the SAME elapsed period (the current month’s target is prorated by day-of-month), so it’s apples-to-apples. Proj Full Year = actual banked so far + the remaining months’ plan (current month’s unspent portion + future months). Subtotals are dollar-weighted (never an average of %s). Hover a store for the month-by-month plan/actual.'))
    ));
}
