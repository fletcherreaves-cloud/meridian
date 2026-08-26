// @ts-nocheck
// ── Yearly Projections panel ─────────────────────────────────────────────────
// Two views on the selected year, toggled by pill:
//   Sales Pace  — annual rollup of the official monthly sales targets
//     (monthly_targets.sales_proj = tProdSales) vs actual product sales: Annual
//     Target, YTD Actual, YTD-vs-plan (to-date, current month prorated), Projected
//     Full Year (actual banked + remaining plan), and FY-vs-Target. Dollar-weighted
//     OK/FL/grand subtotals (never average of %s). Actuals summed by month from
//     loadDailySales (product sales, same basis as tProdSales).
//   Target Categories (dispatch #107 Part 2) — the actual uploaded yearly-targets
//     workbook (OEPE/Park/KVS/R2P, Voice OSAT/EAD/B2B/1-800, Digital App/McDelivery,
//     People staffing+turnover, Labor/FOB), per store, for the selected year. Source:
//     ds.allYearlyTargets[year] (Supabase yearly_targets table, dispatch #107 Part 1)
//     with ds.targets (the flattened "most recent year" view, may include a workbook
//     uploaded this session before it round-trips through Supabase) preferred for the
//     current calendar year. This is the data parseYearlyTargets() already parses and
//     review-engine.js's mergedTargetsForLoc() already merges into Performance Review
//     — this panel previously never displayed it at all (owner-reported gap).
import * as React from 'react';
import { STORE_NAMES, getStoreOrg } from '../constants.js';
import { loadDailySales } from '../lib/supabase.js';

// Dispatch #147 -- ExportDropdown lives in store-dash.js, a 145 KB module this panel would
// otherwise drag into its own chunk on every open. React.lazy defers the actual import() to
// first render of the Export control itself -- established pattern (dispatch #122/#129/#134/
// #136/#143).
const LazyExportDropdown = React.lazy(() =>
  import('./store-dash.js').then(m => ({ default: m.ExportDropdown }))
);

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);

// ── Print / Export (dispatch #147) ───────────────────────────────────────────
// Same local-helper pattern every print/export builder in this codebase repeats
// (signals.js/record-day.js/dt-speedofservice.js/security-panel.js) rather than a shared
// import -- a two-line escaper + table/section/shell builders, not a module. A full,
// scroll-independent printable HTML document opened via window.open, never bare
// window.print() against this panel's scrolled body.
function esc(s) { return String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function reportTable(headers, rows) {
  if (!rows.length) return '<p style="color:#9ca3af;font-size:12px;padding:8px 0">No data.</p>';
  return `<table style="width:100%;border-collapse:collapse;font-size:11px">
    <thead><tr>${headers.map(hd => `<th style="padding:6px 10px;text-align:left;font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.04em;border-bottom:2px solid #e5e7eb;background:#f8fafc">${esc(hd)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r, i) => `<tr style="background:${i % 2 ? '#fff' : '#fafafa'}">${r.map(c => `<td style="padding:5px 10px;border-bottom:1px solid #f1f5f9;color:#111">${c}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>`;
}
function reportSection(title, bodyHtml) {
  return `<div style="padding:20px 32px;border-top:1px solid #e5e7eb">
    <div style="font-size:11px;font-weight:700;letter-spacing:.06em;color:#6b7280;text-transform:uppercase;margin-bottom:12px">${esc(title)}</div>
    ${bodyHtml}
  </div>`;
}
function reportShell(title, subtitle, bodyHtml) {
  const now = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${esc(title)} — Report</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;color:#111;font-size:13px}
  @media print{
    body{background:white}
    .no-print{display:none!important}
    .page{box-shadow:none!important;margin:0!important;border-radius:0!important;max-width:100%!important}
  }
</style>
</head><body>
<div class="no-print" style="background:#1e293b;padding:12px 24px;display:flex;align-items:center;gap:12px">
  <span style="color:#f59e0b;font-weight:800;font-size:16px">Meridian</span>
  <span style="color:#94a3b8;font-size:13px">${esc(title)}</span>
  <button onclick="window.print()" style="margin-left:auto;background:#f59e0b;border:none;color:#000;padding:7px 20px;border-radius:6px;font-weight:700;cursor:pointer;font-size:13px">🖨 Print / Save as PDF</button>
  <button onclick="window.close()" style="background:transparent;border:1px solid #475569;color:#94a3b8;padding:7px 14px;border-radius:6px;cursor:pointer">Close</button>
</div>
<div class="page" style="max-width:1000px;margin:24px auto;background:white;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.10);overflow:hidden">
  <div style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);padding:28px 32px;color:white">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <div style="font-size:11px;letter-spacing:.08em;color:#94a3b8;text-transform:uppercase;margin-bottom:6px">Meridian</div>
        <div style="font-size:26px;font-weight:900;letter-spacing:-.5px">${esc(title)}</div>
        <div style="margin-top:8px;font-size:12px;color:#94a3b8">${esc(subtitle || '')}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:11px;color:#94a3b8">Generated</div>
        <div style="font-size:16px;font-weight:700;color:#f59e0b">${now}</div>
      </div>
    </div>
  </div>
  ${bodyHtml}
  <div style="padding:12px 32px;background:#0f172a;display:flex;justify-content:space-between;align-items:center">
    <span style="color:#f59e0b;font-weight:800;font-size:14px">Meridian</span>
    <span style="color:#475569;font-size:11px">QSR Forecasting &amp; Analytics · Generated ${now} · CONFIDENTIAL</span>
  </div>
</div>
</body></html>`;
}
function openPrintReport(html) {
  const w = window.open('', '_blank', 'width=1050,height=850,scrollbars=yes');
  if (w) { w.document.write(html); w.document.close(); }
  else { alert('Allow pop-ups for this page to open the report. Then try again.'); }
}

// Sales Pace view -- full store-by-store table exactly as rendered (model.rows + subtotals),
// for the currently selected year.
function salesExportSpec(model, year) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = model.rows.map(r => ({
    Store: storeNm(r.loc), 'Annual Target': money(r.annual), 'YTD Actual': money(r.ytdActual),
    'YTD vs Plan': r.ytdVsPct == null ? '—' : pctFmt(r.ytdVsPct), 'Proj Full Year': money(r.projFY),
    'FY vs Target': r.fyVsPct == null ? '—' : pctFmt(r.fyVsPct),
  }));
  return { rows, columns: ['Store', 'Annual Target', 'YTD Actual', 'YTD vs Plan', 'Proj Full Year', 'FY vs Target'].map(k => ({ key: k, label: k })),
    title: `Yearly Projections — Sales Pace — ${year}`, filename: `yearly-projections-sales-${year}-${today}` };
}
function salesPrintHtml(model, year) {
  const rowHtml = r => [
    esc(storeNm(r.loc)), money(r.annual), money(r.ytdActual),
    r.ytdVsPct == null ? '—' : `<b style="color:${r.ytdVsPct >= 0 ? '#10b981' : r.ytdVsPct >= -3 ? '#f59e0b' : '#ef4444'}">${(r.ytdVsPct >= 0 ? '+' : '') + pctFmt(r.ytdVsPct)}</b>`,
    `<b>${money(r.projFY)}</b>`,
    r.fyVsPct == null ? '—' : `<b style="color:${r.fyVsPct >= 0 ? '#10b981' : r.fyVsPct >= -3 ? '#f59e0b' : '#ef4444'}">${(r.fyVsPct >= 0 ? '+' : '') + pctFmt(r.fyVsPct)}</b>`,
  ];
  const rows = model.rows.map(rowHtml);
  const subRow = (label, s) => s ? [`<b>${esc(label)} (${s.n})</b>`, `<b>${money(s.annual)}</b>`, `<b>${money(s.ytdActual)}</b>`,
    s.ytdVsPct == null ? '—' : `<b>${(s.ytdVsPct >= 0 ? '+' : '') + pctFmt(s.ytdVsPct)}</b>`, `<b>${money(s.projFY)}</b>`,
    s.fyVsPct == null ? '—' : `<b>${(s.fyVsPct >= 0 ? '+' : '') + pctFmt(s.fyVsPct)}</b>`] : null;
  [['Oklahoma', model.sub.ok], ['Florida', model.sub.fl], ['Grand Total', model.sub.grand]].forEach(([label, s]) => {
    const r = subRow(label, s); if (r) rows.push(r);
  });
  return reportShell('Yearly Projections — Sales Pace', `${year} · ${model.rows.length} store${model.rows.length === 1 ? '' : 's'}`,
    reportSection('Annual target vs actual product sales', reportTable(['Store', 'Annual Target', 'YTD Actual', 'YTD vs Plan', 'Proj Full Year', 'FY vs Target'], rows)) +
    reportSection('Notes', '<p style="font-size:11px;color:#6b7280;line-height:1.6">Annual Target = Σ of the 12 official monthly sales targets for ' + year + '. YTD vs Plan compares YTD actual against the plan for the same elapsed period (current month prorated by day). Proj Full Year = actual banked so far + remaining plan. Subtotals are dollar-weighted, never an average of percentages.</p>'));
}

// Target Categories view -- the currently active category tab's full store-by-store table
// (byLoc/rows/ok/fl lifted up from TargetCategoriesView via onExportReady, since that
// component owns the category tab state -- same lifting pattern signals.js uses for its
// Scanner/LiveOps tabs).
function targetsExportSpec(data, year) {
  const today = new Date().toISOString().slice(0, 10);
  const { active, rows, byLoc } = data;
  const cols = ['Store', ...active.fields.map(f => f.l)];
  const out = rows.map(loc => {
    const o = { Store: storeNm(loc) };
    active.fields.forEach(f => { o[f.l] = f.fmt((byLoc[loc] || {})[f.k]); });
    return o;
  });
  return { rows: out, columns: cols.map(k => ({ key: k, label: k })),
    title: `Yearly Projections — ${active.label} Targets — ${year}`, filename: `yearly-projections-${active.key}-${year}-${today}` };
}
function targetsPrintHtml(data, year) {
  const { active, rows, byLoc, ok, fl } = data;
  const catAgg = (locs, field) => {
    const vals = locs.map(l => byLoc[l] && byLoc[l][field.k]).filter(v => v != null && !Number.isNaN(v));
    if (!vals.length) return null;
    return field.agg === 'sum' ? vals.reduce((a, b) => a + b, 0) : vals.reduce((a, b) => a + b, 0) / vals.length;
  };
  const bodyRows = rows.map(loc => [esc(storeNm(loc)), ...active.fields.map(f => f.fmt((byLoc[loc] || {})[f.k]))]);
  [['Oklahoma', ok], ['Florida', fl], ['Grand Total', rows]].forEach(([label, locs]) => {
    if (locs.length) bodyRows.push([`<b>${esc(label)} (${locs.length})</b>`, ...active.fields.map(f => `<b>${f.fmt(catAgg(locs, f))}</b>`)]);
  });
  return reportShell(`Yearly Projections — ${active.label} Targets`, `${year} · ${rows.length} store${rows.length === 1 ? '' : 's'}`,
    reportSection(active.icon + ' ' + active.label, reportTable(['Store', ...active.fields.map(f => f.l)], bodyRows)) +
    reportSection('Notes', '<p style="font-size:11px;color:#6b7280;line-height:1.6">Values are the per-store annual targets from the uploaded yearly targets workbook for ' + year + '. District subtotals sum headcount-style targets and average rate/time targets. Monthly targets, when set for the same store/field, supersede these in Performance Review and elsewhere.</p>'));
}

const ALL_LOCS = Object.keys(STORE_NAMES);
const FL_LOCS = new Set(ALL_LOCS.filter(l => getStoreOrg(l) === 'emerald'));
const locNum = s => { const n = parseInt(s, 10); return Number.isNaN(n) ? String(s == null ? '' : s) : String(n); };
const storeNm = l => STORE_NAMES[locNum(l)] || locNum(l);
const money = v => v == null || Number.isNaN(v) ? '—' : '$' + Math.round(v).toLocaleString();
const pctFmt = v => v == null || Number.isNaN(v) ? '—' : (v >= 0 ? '' : '') + v.toFixed(2) + '%';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── Target-category field config (Part 2) ────────────────────────────────────
// Values are stored on ds.targets exactly as parseYearlyTargets() (src/parsers/index.js)
// and yearly_targets (Supabase) round-trip them: percentages as fractions (parsePct,
// same convention as monthly_targets — e.g. tLabor 0.28 = 28%), OEPE/KVS/R2P as raw
// seconds, everything else as raw counts/ratings. agg:'sum' totals a headcount-style
// target across stores in a subtotal row; agg:'avg' averages a rate/time target —
// never averaged into a %-of-% (these are target VALUES, not measured performance, so
// there is no sales-weighting basis the way there is for actuals elsewhere).
const secFmt = v => v == null ? '—' : Math.round(v) + 's';
const pct2Fmt = v => v == null ? '—' : (v * 100).toFixed(2) + '%';
const numFmt = (d) => v => v == null ? '—' : v.toFixed(d);
const YEARLY_CATS = [
  { key: 'ops', label: 'Service & Ops', icon: '⚡', fields: [
    { k: 'tOepe', l: 'OEPE PACE', fmt: secFmt, agg: 'avg' },
    { k: 'tPark', l: 'Park %', fmt: pct2Fmt, agg: 'avg' },
    { k: 'tKvst', l: 'KVS PACE', fmt: secFmt, agg: 'avg' },
    { k: 'tKvsu', l: 'KVS Usage', fmt: pct2Fmt, agg: 'avg' },
    { k: 'tR2p', l: 'R2P PACE', fmt: secFmt, agg: 'avg' },
  ]},
  { key: 'csat', label: 'CSAT', icon: '⭐', fields: [
    { k: 'tOsat', l: 'Voice OSAT', fmt: pct2Fmt, agg: 'avg' },
    { k: 'tOsatB2B', l: 'OSAT B2B', fmt: pct2Fmt, agg: 'avg' },
    { k: 'tVoiceEAD', l: 'Execute As Designed', fmt: pct2Fmt, agg: 'avg' },
    { k: 't1800Contacts', l: '1-800 Contacts', fmt: numFmt(0), agg: 'avg' },
  ]},
  { key: 'digital', label: 'Digital', icon: '📱', fields: [
    { k: 'tDigAppPct', l: 'App % of Sales', fmt: pct2Fmt, agg: 'avg' },
    { k: 'tDigAppGCRD', l: 'App GC/R/D', fmt: numFmt(2), agg: 'avg' },
    { k: 'tMcdGCRD', l: 'McDelivery GC/R/D', fmt: numFmt(2), agg: 'avg' },
    { k: 'tMcdWait', l: 'McDelivery Wait', fmt: numFmt(1), agg: 'avg' },
    { k: 'tMcdStars', l: 'McDelivery Stars', fmt: numFmt(2), agg: 'avg' },
  ]},
  { key: 'people', label: 'People', icon: '👥', fields: [
    { k: 'tCrewStaffing', l: 'Crew Staffing', fmt: numFmt(0), agg: 'sum' },
    { k: 'tShiftLeaders', l: 'Shift Leaders', fmt: numFmt(0), agg: 'sum' },
    { k: 'tManagers', l: 'GM/DM/Swing Mgr', fmt: numFmt(0), agg: 'sum' },
    { k: 'tHeadcount', l: 'Total Headcount', fmt: numFmt(0), agg: 'sum' },
    { k: 'tToShiftLeader', l: 'Shift Leader T/O (TTM)', fmt: pct2Fmt, agg: 'avg' },
    { k: 'tToCrew090', l: '0-90 Crew T/O', fmt: pct2Fmt, agg: 'avg' },
    { k: 'tToCrewYTD', l: 'YTD Crew T/O', fmt: pct2Fmt, agg: 'avg' },
  ]},
  { key: 'labor', label: 'Labor & FOB', icon: '💰', fields: [
    { k: 'tTpph', l: 'TPPH', fmt: numFmt(2), agg: 'avg' },
    { k: 'tLabor', l: 'Labor %', fmt: pct2Fmt, agg: 'avg' },
    { k: 'tFOBTarget', l: 'FOB Target', fmt: pct2Fmt, agg: 'avg' },
  ]},
];

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

// ── Target Categories view (Part 2) ──────────────────────────────────────────
// Per-store table of the real uploaded yearly-targets workbook fields, tabbed by
// category (eom-dashboard.js's internal-tab pattern). Source precedence matches the
// Sales view's data model: ds.allYearlyTargets[year] (Supabase-persisted, Part 1),
// with ds.targets (flattened "most recent year", may include a same-session upload
// not yet round-tripped through Supabase) preferred for the current calendar year.
function TargetCategoriesView({ ds, year, thisYear, onExportReady }) {
  const { useState, useMemo, useEffect } = React;
  const [cat, setCat] = useState(YEARLY_CATS[0].key);

  const byLoc = useMemo(() => {
    const fromCloud = (ds && ds.allYearlyTargets && ds.allYearlyTargets[year]) || {};
    const fromSession = (year === thisYear && ds && ds.targets) || {};
    const merged = {};
    for (const loc of new Set([...Object.keys(fromCloud), ...Object.keys(fromSession)])) {
      merged[loc] = { ...(fromCloud[loc] || {}), ...(fromSession[loc] || {}) };
    }
    return merged;
  }, [ds, year, thisYear]);

  const rows = useMemo(() => ALL_LOCS.map(locNum).filter(loc => byLoc[loc] && Object.keys(byLoc[loc]).length > 0)
    .sort((a, b) => storeNm(a).localeCompare(storeNm(b))), [byLoc]);
  // ok/fl must be memoized off `rows` -- a plain filter() here produced a fresh array
  // reference every render, which the onExportReady effect below depends on, which set
  // parent state every render, which re-rendered this component: an infinite loop that
  // hung any test exercising this view (confirmed: dispatch-107-yearly-projections-panel
  // .test.js never returned).
  const ok = useMemo(() => rows.filter(l => !FL_LOCS.has(l)), [rows]);
  const fl = useMemo(() => rows.filter(l => FL_LOCS.has(l)), [rows]);

  const active = YEARLY_CATS.find(c => c.key === cat) || YEARLY_CATS[0];
  const catAgg = (locs, field) => {
    const vals = locs.map(l => byLoc[l] && byLoc[l][field.k]).filter(v => v != null && !Number.isNaN(v));
    if (!vals.length) return null;
    return field.agg === 'sum' ? vals.reduce((a, b) => a + b, 0) : vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  // Dispatch #147 -- lift the currently-active category's full data up to the parent panel for
  // print/export, since this component owns the category-tab state (same lifting pattern
  // signals.js uses for its Scanner/LiveOps tabs via onExportReady).
  useEffect(() => {
    onExportReady?.(rows.length ? { active, rows, byLoc, ok, fl } : null);
  }, [active, rows, byLoc, ok, fl, onExportReady]);

  const th = { padding: '6px 9px', fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--text3)', borderBottom: '.5px solid var(--bdr)', whiteSpace: 'nowrap', textAlign: 'right', background: 'var(--surf2)', position: 'sticky', top: 0 };
  const td = { padding: '5px 9px', fontSize: 11, borderBottom: '.5px solid var(--bdr)', whiteSpace: 'nowrap', textAlign: 'right', fontFamily: 'var(--mono)' };

  if (!rows.length) {
    return div({ style: { textAlign: 'center', padding: '48px', color: 'var(--text3)', fontSize: 12 } },
      'No yearly targets uploaded for ' + year + '. Upload the yearly targets workbook (Data Manager → Targets) to populate OEPE/CSAT/Digital/People/Labor-FOB goals here.');
  }

  return div(null,
    // Category sub-tabs
    div({ style: { display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' } },
      YEARLY_CATS.map(c => h('button', {
        key: c.key, onClick: () => setCat(c.key),
        style: { padding: '5px 12px', borderRadius: 99, border: '1px solid ' + (cat === c.key ? 'var(--amber)' : 'var(--bdr)'),
          background: cat === c.key ? 'rgba(245,188,0,.15)' : 'var(--surf)', color: cat === c.key ? 'var(--amber)' : 'var(--text2)',
          fontSize: 10.5, fontWeight: 700, cursor: 'pointer' } },
        c.icon + ' ' + c.label)
      )),
    div({ style: { background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8, overflow: 'auto' } },
      h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
        h('thead', null, h('tr', null,
          h('th', { style: { ...th, textAlign: 'left' } }, 'Store'),
          ...active.fields.map(f => h('th', { key: f.k, style: th, title: f.agg === 'sum' ? 'District subtotal = sum' : 'District subtotal = average' }, f.l)))),
        h('tbody', null,
          ...rows.map(loc => h('tr', { key: loc },
            h('td', { style: { ...td, textAlign: 'left', fontWeight: 600, fontFamily: 'inherit' } }, storeNm(loc) + ' ', span({ style: { color: 'var(--text3)', fontWeight: 400, fontSize: 9 } }, '#' + loc)),
            ...active.fields.map(f => h('td', { key: f.k, style: td }, f.fmt((byLoc[loc] || {})[f.k]))))),
          [['Oklahoma', ok], ['Florida', fl], ['Grand Total', rows]].map(([label, locs]) => locs.length ? h('tr', { key: label, style: { background: 'rgba(245,188,0,.06)' } },
            h('td', { style: { ...td, textAlign: 'left', fontWeight: 800, fontFamily: 'inherit', color: 'var(--amber)' } }, label + ' ', span({ style: { color: 'var(--text3)', fontWeight: 400, fontSize: 9 } }, '(' + locs.length + ')')),
            ...active.fields.map(f => h('td', { key: f.k, style: { ...td, fontWeight: 800 } }, f.fmt(catAgg(locs, f))))) : null)))),
    div({ style: { fontSize: 8, color: 'var(--text3)', marginTop: 8, lineHeight: 1.5 } },
      'Values are the per-store annual targets from the uploaded yearly targets workbook for ' + year + ' (parseYearlyTargets, persisted to the yearly_targets Supabase table). District subtotals sum headcount-style targets and average rate/time targets — never an average of an average. Monthly targets, when set for the same store/field, supersede these in Performance Review and elsewhere (mergedTargetsForLoc).')
  );
}

export function YearlyProjectionsPanel({ ds, stores, settings, onClose, embedded }) {
  const { useState, useMemo, useEffect, useCallback } = React;
  const now = new Date();
  const thisYear = now.getFullYear();
  const [year, setYear] = useState(thisYear);
  const [view, setView] = useState('sales');    // 'sales' | 'targets'
  const [actuals, setActuals] = useState({});   // {loc: {month: sales}}
  const [loading, setLoading] = useState(true);
  // Dispatch #147 -- the Target Categories view's active-category data, lifted up from
  // TargetCategoriesView (which owns the category-tab state) for print/export.
  const [targetsData, setTargetsData] = useState(null);

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
  const td = { padding: '5px 9px', fontSize: 11, borderBottom: '.5px solid var(--bdr)', whiteSpace: 'nowrap', textAlign: 'right', fontFamily: 'var(--mono)' };
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

  // Dispatch #147 -- print/export, scoped to whichever view is active. Sales Pace reads model
  // (computed right here); Target Categories reads targetsData, lifted up from
  // TargetCategoriesView above. Null while there's nothing to export yet -- the toolbar hides.
  const exportSpec = useMemo(() => {
    if (view === 'sales') return model.rows.length ? salesExportSpec(model, year) : null;
    return targetsData ? targetsExportSpec(targetsData, year) : null;
  }, [view, model, year, targetsData]);
  const handlePrintReport = useCallback(() => {
    if (view === 'sales') { if (model.rows.length) openPrintReport(salesPrintHtml(model, year)); return; }
    if (targetsData) openPrintReport(targetsPrintHtml(targetsData, year));
  }, [view, model, year, targetsData]);

  const OUTER = embedded ? { position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' } : { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)', zIndex: 460, display: 'flex', flexDirection: 'column', paddingTop: 20 };
  const CARD = embedded ? { flex: 1, minHeight: 0, background: 'var(--surf)', width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' } : { flex: 1, background: 'var(--surf)', maxWidth: 1000, margin: '0 auto', width: 'calc(100% - 24px)', borderRadius: 'var(--rl) var(--rl) 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 -8px 40px rgba(0,0,0,.4)' };
  return div({ style: OUTER },
    !embedded && div({ style: { flex: '0 0 20px', cursor: 'pointer' }, onClick: onClose }),
    div({ style: CARD },
      // Header
      div({ style: { padding: '10px 16px', borderBottom: '.5px solid var(--bdr)', flexShrink: 0, background: 'var(--surf2)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
        span({ style: { fontSize: 18 } }, '📆'),
        div({ style: { flex: 1, minWidth: 180 } },
          div({ style: { fontSize: 14, fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 } }, 'Yearly Projections',
            stepBtn('‹', -1),
            span({ style: { fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 99, background: 'rgba(245,188,0,.15)', color: 'var(--amber)' } }, year),
            stepBtn('›', 1)),
          div({ style: { fontSize: 9, color: 'var(--text3)' } }, view === 'sales'
            ? 'Annual official target (Σ monthly_targets) vs actual product sales · YTD-to-date (current month prorated) · Projected FY = actual banked + remaining plan.'
            : 'Real yearly-targets workbook categories (OEPE/CSAT/Digital/People/Labor-FOB), per store, for ' + year + '.')),
        !embedded && h('button', { className: 'btn btn-sm', style: { color: 'var(--text3)' }, onClick: onClose }, '✕')),
      // View toggle: Sales Pace vs Target Categories
      div({ style: { display: 'flex', gap: 0, alignItems: 'center', borderBottom: '.5px solid var(--bdr)', flexShrink: 0, background: 'var(--surf)', flexWrap: 'wrap' } },
        [['sales', '💵 Sales Pace'], ['targets', '🎯 Target Categories']].map(([k, label]) =>
          h('button', { key: k, onClick: () => setView(k),
            style: { padding: '8px 16px', fontSize: 11, fontWeight: 700, border: 'none',
              borderBottom: view === k ? '2px solid var(--amber)' : '2px solid transparent',
              background: 'transparent', color: view === k ? 'var(--amber)' : 'var(--text3)', cursor: 'pointer' } },
            label)),
        // Dispatch #147 -- print/export toolbar for the active view. Hidden when there's
        // nothing to export yet (exportSpec null).
        exportSpec && div({ style: { display: 'flex', gap: 6, marginLeft: 'auto', padding: '0 10px' } },
          h(React.Suspense, {
            fallback: h('button', { className: 'btn btn-sm', style: { opacity: .5 }, disabled: true }, '⬇ Export') },
            h(LazyExportDropdown, { rows: exportSpec.rows, columns: exportSpec.columns, title: exportSpec.title, filename: exportSpec.filename }),
          ),
          h('button', { className: 'btn btn-sm', onClick: handlePrintReport }, '🖨 Print Report'),
        )),
      // Body
      div({ style: { flex: 1, overflowY: 'auto', padding: '12px 16px' } },
        view === 'targets'
          ? h(TargetCategoriesView, { ds, year, thisYear, onExportReady: setTargetsData })
          : [
        loading
          ? div({ key: 'load', style: { textAlign: 'center', padding: '48px', color: 'var(--text3)', fontSize: 12 } }, 'Loading ' + year + ' actuals…')
          : !model.rows.length
          ? div({ key: 'empty', style: { textAlign: 'center', padding: '48px', color: 'var(--text3)', fontSize: 12 } }, 'No targets or actuals for ' + year + '. Set monthly targets (Smart Targets → Apply as Official, or the Monthly Projections upload).')
          : div({ key: 'table', style: { background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8, overflow: 'auto' } },
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
        div({ key: 'note', style: { fontSize: 8, color: 'var(--text3)', marginTop: 8, lineHeight: 1.5 } },
          'Annual Target = Σ of the 12 official monthly sales targets (monthly_targets.sales_proj) for ' + year + '. YTD Actual = Σ actual product sales through today. YTD vs Plan compares YTD actual against the plan for the SAME elapsed period (the current month’s target is prorated by day-of-month), so it’s apples-to-apples. Proj Full Year = actual banked so far + the remaining months’ plan (current month’s unspent portion + future months). Subtotals are dollar-weighted (never an average of %s). Hover a store for the month-by-month plan/actual.')
      ])
    ));
}
