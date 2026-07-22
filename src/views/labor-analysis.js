// @ts-nocheck
// ── Labor Analysis panel (weekly Fixed-Labor-Hours) ──────────────────────────
// Per-location weekly labor report ported from the "MBI - Labor Analysis" sheet.
// Reads weekly LifeLenz Band-1 inputs (lifelenz_labor_week) + per-store config
// (store_labor_config), computes the efficiency/recommended-hours columns via the
// labor-analysis engine (dollar-weighted OK/FL/grand subtotals), and prints.
// Config tab edits the "gathered" fixed-hours inputs (maintenance/prep/lobby/24hr).
import * as React from 'react';
import { STORE_NAMES, getStoreOrg, DEF_SETTINGS } from '../constants.js';
import { analyzeSheet, aggregateGroup, analyzeStore, fracToTime } from '../engine/labor-analysis.js';
import { loadLifeLenzLaborWeek, loadStoreLaborConfig, saveStoreLaborConfig } from '../lib/supabase.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);

const ALL_LOCS = Object.keys(STORE_NAMES);
const FL_LOCS = new Set(ALL_LOCS.filter(l => getStoreOrg(l) === 'emerald'));
const locNum = s => { const n = parseInt(s, 10); return Number.isNaN(n) ? String(s == null ? '' : s) : String(n); };
const storeNm = l => STORE_NAMES[locNum(l)] || locNum(l);
const isFL = l => FL_LOCS.has(locNum(l));

const money = v => v == null || Number.isNaN(v) ? '—' : '$' + Math.round(v).toLocaleString();
const num1 = v => v == null || Number.isNaN(v) ? '—' : (Math.round(v * 10) / 10).toLocaleString();
const pct = v => v == null || Number.isNaN(v) ? '—' : (v * 100).toFixed(1) + '%';
const signNum = v => v == null || Number.isNaN(v) ? '—' : (v >= 0 ? '+' : '') + (Math.round(v * 10) / 10).toLocaleString();
const DAYS = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']];

// Report columns: label, accessor, formatter, and (optional) a flag(row) → color.
const COLS = [
  { k: 'salesFcst', h: 'Sales Fcst', f: money },
  { k: 'laborPctActual', h: 'Labor %', f: pct, flag: r => (r.laborPctActual != null && r.laborTargetOrg != null && r.laborPctActual > r.laborTargetOrg) ? '#ef4444' : null },
  { k: 'laborTargetOrg', h: 'Target %', f: pct },
  { k: 'gcFcst', h: 'GC Fcst', f: v => v == null ? '—' : Math.round(v).toLocaleString() },
  { k: 'tpph', h: 'TPPH', f: num1 },
  { k: 'rate', h: 'Rate', f: v => v == null ? '—' : '$' + (Math.round(v * 100) / 100).toFixed(2) },
  { k: 'hoursFcst', h: 'Hrs Fcst', f: num1 },
  { k: 'hoursSched', h: 'Hrs Sched', f: num1 },
  { k: 'scheduledLaborD', h: 'Sched Labor $', f: money },
  { k: 'targetLaborD', h: 'Target Labor $', f: money },
  { k: 'projHrsTarget', h: 'Proj Hrs (Tgt)', f: num1 },
  { k: 'hrsVsForecast', h: 'Hrs ± Fcst', f: signNum, flag: r => r.hrsVsForecast == null ? null : r.hrsVsForecast > 0 ? '#f59e0b' : '#10b981' },
  { k: 'hrsVsTarget', h: 'Hrs ± Tgt', f: signNum, flag: r => r.hrsVsTarget == null ? null : r.hrsVsTarget > 0 ? '#f59e0b' : '#10b981' },
  { k: 'dollarsVsTarget', h: '$ ± Tgt', f: money, flag: r => r.dollarsVsTarget == null ? null : r.dollarsVsTarget > 0 ? '#f59e0b' : '#10b981' },
  { k: 'recFixed10', h: 'Rec Fix @10%', f: num1 },
  { k: 'recFixed15', h: 'Rec Fix @15%', f: num1 },
  { k: 'combined25', h: 'Combined @25%', f: num1 },
];

export function LaborAnalysisPanel({ ds, settings, onClose }) {
  const { useState, useMemo, useEffect } = React;
  const [tab, setTab] = useState('report');       // 'report' | 'config'
  const [scope, setScope] = useState('all');
  const [week, setWeek] = useState(null);         // {weekStart, rows}
  const [config, setConfig] = useState({});       // {loc: {...}}
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState({});           // dirty config edits
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    let live = true;
    setLoading(true);
    Promise.all([loadLifeLenzLaborWeek(), loadStoreLaborConfig()]).then(([w, c]) => {
      if (!live) return;
      // Fall back to the just-uploaded sheet if the DB is empty.
      if ((!w || !Object.keys(w.rows || {}).length) && ds && ds.laborAnalysis) {
        const la = ds.laborAnalysis; const rows = {};
        for (const s of la.stores) rows[locNum(s.loc)] = s.band1;
        w = { weekStart: la.weekStart, rows };
      }
      if ((!c || !Object.keys(c).length) && ds && ds.laborAnalysis) {
        c = {}; for (const s of ds.laborAnalysis.stores) c[locNum(s.loc)] = s.config;
      }
      setWeek(w || { weekStart: null, rows: {} });
      setConfig(c || {});
      setLoading(false);
    }).catch(() => { if (live) { setWeek({ weekStart: null, rows: {} }); setLoading(false); } });
    return () => { live = false; };
  }, [ds && ds.laborAnalysis]);

  const activeLocs = useMemo(() => {
    if (scope === 'all') return null;
    if (scope === 'fl') return new Set(ALL_LOCS.filter(l => FL_LOCS.has(l)));
    if (scope === 'ok') return new Set(ALL_LOCS.filter(l => !FL_LOCS.has(l)));
    if (scope.startsWith('__patch__')) return new Set(((DEF_SETTINGS.supervisorGroups || {})[scope.slice(9)] || []).map(l => locNum(l)));
    return new Set([locNum(scope)]);
  }, [scope]);

  // Analyze the weekly inputs → derived rows + dollar-weighted subtotals.
  const model = useMemo(() => {
    const rowsIn = Object.values((week && week.rows) || {});
    const analyzed = analyzeSheet(rowsIn, isFL);
    return analyzed;
  }, [week]);

  const shown = model.rows
    .filter(r => activeLocs === null || activeLocs.has(locNum(r.loc)))
    .sort((a, b) => (b.salesFcst || 0) - (a.salesFcst || 0));
  // Subtotals recomputed for the current scope selection.
  const scopedSub = useMemo(() => aggregateGroup(shown), [shown]);

  const selStyle = { fontSize: 10, padding: '3px 7px', background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', color: 'var(--text)', colorScheme: 'dark', cursor: 'pointer' };
  const th = { padding: '6px 8px', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.3px', color: 'var(--text3)', borderBottom: '.5px solid var(--bdr)', whiteSpace: 'nowrap', textAlign: 'right', background: 'var(--surf2)', position: 'sticky', top: 0 };
  const td = { padding: '4px 8px', fontSize: 10.5, borderBottom: '.5px solid rgba(255,255,255,.04)', whiteSpace: 'nowrap', textAlign: 'right', fontFamily: 'var(--mono)' };

  const cell = (r, col) => h('td', { key: col.k, style: { ...td, ...(col.flag && col.flag(r) ? { color: col.flag(r), fontWeight: 700 } : {}) } }, col.f(r[col.k]));
  const dataRow = r => h('tr', { key: r.loc, title: `${storeNm(r.loc)} #${locNum(r.loc)}` },
    h('td', { style: { ...td, textAlign: 'left', fontWeight: 600, fontFamily: 'inherit' } }, storeNm(r.loc) + ' ', span({ style: { color: 'var(--text3)', fontWeight: 400, fontSize: 8.5 } }, '#' + locNum(r.loc))),
    ...COLS.map(c => cell(r, c)));
  const subtotalRow = (label, s) => s ? h('tr', { key: label, style: { background: 'rgba(245,188,0,.06)' } },
    h('td', { style: { ...td, textAlign: 'left', fontWeight: 800, fontFamily: 'inherit', color: 'var(--amber)' } }, label + ' ', span({ style: { color: 'var(--text3)', fontWeight: 400, fontSize: 8.5 } }, '(' + s.n + ')')),
    ...COLS.map(c => h('td', { key: c.k, style: { ...td, fontWeight: 700 } }, s[c.k] != null ? c.f(s[c.k]) : '—'))) : null;

  // ── Config editor ──
  const cfgVal = (loc, field) => { const e = edit[loc] || {}; return field in e ? e[field] : (config[loc] || {})[field]; };
  const setCfg = (loc, field, v) => setEdit(p => ({ ...p, [loc]: { ...(p[loc] || {}), [field]: v } }));
  const saveConfig = async () => {
    const merged = Object.keys(edit).map(loc => ({ ...(config[loc] || { loc }), ...edit[loc], loc }));
    if (!merged.length) { setSaveMsg('No changes'); return; }
    setSaveMsg('Saving…');
    const res = await saveStoreLaborConfig(merged);
    if (res.errors && res.errors.length) { setSaveMsg('⚠ ' + res.errors[0]); return; }
    setConfig(p => { const n = { ...p }; for (const m of merged) n[locNum(m.loc)] = { ...(n[locNum(m.loc)] || {}), ...m }; return n; });
    setEdit({}); setSaveMsg('✓ Saved ' + res.saved + ' stores');
    setTimeout(() => setSaveMsg(''), 2500);
  };
  const cfgInput = (loc, field, w = 54) => h('input', { value: cfgVal(loc, field) ?? '', onChange: e => setCfg(loc, field, e.target.value === '' ? null : (field === 'maintDaysOff' ? e.target.value : parseFloat(e.target.value))), style: { width: w, fontSize: 10, padding: '2px 4px', background: 'var(--surf)', border: '.5px solid var(--bdr)', borderRadius: 4, color: 'var(--text)', textAlign: 'right', fontFamily: 'var(--mono)' } });

  const cfgStores = ALL_LOCS.filter(l => activeLocs === null || activeLocs.has(locNum(l))).sort((a, b) => (isFL(a) - isFL(b)) || STORE_NAMES[a].localeCompare(STORE_NAMES[b]));
  const cfgRow = loc => { const c = config[locNum(loc)] || {}; const hrs = c.hours || {};
    return h('tr', { key: loc },
      h('td', { style: { ...td, textAlign: 'left', fontFamily: 'inherit', fontWeight: 600 } }, storeNm(loc), ' ', span({ style: { color: 'var(--text3)', fontSize: 8.5 } }, '#' + locNum(loc))),
      h('td', { style: { ...td, textAlign: 'center' } }, h('input', { type: 'checkbox', checked: !!cfgVal(locNum(loc), 'is24hr'), onChange: e => setCfg(locNum(loc), 'is24hr', e.target.checked) })),
      h('td', { style: td }, cfgInput(locNum(loc), 'maintHours')),
      h('td', { style: td }, cfgInput(locNum(loc), 'maintPeople', 40)),
      h('td', { style: { ...td, fontFamily: 'inherit' } }, cfgInput(locNum(loc), 'maintDaysOff', 70)),
      h('td', { style: td }, cfgInput(locNum(loc), 'prepHours')),
      h('td', { style: td }, cfgInput(locNum(loc), 'lobbyHours')),
      // Hours of operation (read-only, deciphered) — compact per-day hours.
      h('td', { style: { ...td, fontFamily: 'var(--mono)', color: 'var(--text3)', fontSize: 9 } },
        DAYS.map(([d]) => (hrs[d] && hrs[d].hours != null) ? hrs[d].hours : '·').join(' / ')));
  };

  const csvCell = c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"';
  const exportCSV = () => {
    const cols = ['Store', 'NSN', ...COLS.map(c => c.h)];
    const lines = [cols.map(csvCell).join(',')];
    for (const r of shown) lines.push([storeNm(r.loc), locNum(r.loc), ...COLS.map(c => r[c.k] == null ? '' : r[c.k])].map(csvCell).join(','));
    if (scopedSub) lines.push(['Subtotal', scopedSub.n, ...COLS.map(c => scopedSub[c.k] == null ? '' : scopedSub[c.k])].map(csvCell).join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `labor-analysis-${(week && week.weekStart) || 'week'}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  const printReport = () => {
    const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[x]));
    const head = ['Store', ...COLS.map(c => c.h)].map(x => `<th>${esc(x)}</th>`).join('');
    const body = shown.map(r => `<tr><td class="s">${esc(storeNm(r.loc))} #${esc(locNum(r.loc))}</td>${COLS.map(c => `<td class="n">${esc(c.f(r[c.k]))}</td>`).join('')}</tr>`).join('');
    const sub = scopedSub ? `<tr class="sub"><td class="s">Subtotal (${scopedSub.n})</td>${COLS.map(c => `<td class="n">${esc(scopedSub[c.k] != null ? c.f(scopedSub[c.k]) : '—')}</td>`).join('')}</tr>` : '';
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Labor Analysis — ${esc((week && week.weekStart) || '')}</title>
      <style>body{font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#111;margin:18px;font-size:10px}h1{font-size:15px;margin:0 0 2px}.sub2{color:#666;font-size:10px;margin-bottom:10px}
      table{width:100%;border-collapse:collapse}th{text-align:right;font-size:8px;text-transform:uppercase;color:#666;border-bottom:2px solid #f5bc00;padding:4px 5px}th:first-child{text-align:left}
      td{padding:3px 5px;border-bottom:1px solid #eee}td.n{text-align:right;font-variant-numeric:tabular-nums}td.s{font-weight:600}tr.sub td{font-weight:800;background:#fff8e6}@media print{body{margin:0}}</style></head><body>
      <h1>Weekly Labor Analysis — Fixed Labor Hours</h1>
      <div class="sub2">Week of <b>${esc((week && week.weekStart) || '—')}</b> · ${shown.length} stores · scope: ${esc(scope)} · generated ${esc(new Date().toLocaleDateString())}</div>
      <table><thead><tr>${head}</tr></thead><tbody>${body}${sub}</tbody></table></body></html>`;
    const w = window.open('', '_blank'); if (!w) return; w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 250);
  };

  const scopeSelect = h('select', { value: scope, onChange: e => setScope(e.target.value), style: selStyle },
    h('option', { value: 'all' }, 'All Stores'), h('option', { value: 'fl' }, 'Florida'), h('option', { value: 'ok' }, 'Oklahoma'),
    h('optgroup', { label: '— Patches —' }, ...Object.entries(DEF_SETTINGS.supervisorGroups || {}).map(([n, l]) => h('option', { key: n, value: '__patch__' + n }, n.split(' ')[0] + ' Patch (' + l.length + ')'))),
    h('optgroup', { label: '— Florida —' }, ...ALL_LOCS.filter(l => FL_LOCS.has(l)).sort((a, b) => STORE_NAMES[a].localeCompare(STORE_NAMES[b])).map(l => h('option', { key: l, value: l }, STORE_NAMES[l]))),
    h('optgroup', { label: '— Oklahoma —' }, ...ALL_LOCS.filter(l => !FL_LOCS.has(l)).sort((a, b) => STORE_NAMES[a].localeCompare(STORE_NAMES[b])).map(l => h('option', { key: l, value: l }, STORE_NAMES[l]))));

  const tabBtn = (id, label) => btn({ onClick: () => setTab(id), style: { padding: '4px 12px', borderRadius: 6, border: '1px solid var(--bdr)', background: tab === id ? 'var(--amber)' : 'var(--surf)', color: tab === id ? '#111' : 'var(--text2)', fontSize: 11, fontWeight: 700, cursor: 'pointer' } }, label);

  return div({ style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)', zIndex: 460, display: 'flex', flexDirection: 'column', paddingTop: 20 } },
    div({ style: { flex: '0 0 20px', cursor: 'pointer' }, onClick: onClose }),
    div({ style: { flex: 1, background: 'var(--surf)', maxWidth: 1500, margin: '0 auto', width: 'calc(100% - 24px)', borderRadius: 'var(--rl) var(--rl) 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 -8px 40px rgba(0,0,0,.4)' } },
      div({ style: { padding: '10px 16px', borderBottom: '.5px solid var(--bdr)', flexShrink: 0, background: 'var(--surf2)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
        span({ style: { fontSize: 18 } }, '🧮'),
        div({ style: { flex: 1, minWidth: 180 } },
          div({ style: { fontSize: 14, fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } }, 'Labor Analysis',
            span({ style: { fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'rgba(245,188,0,.15)', color: 'var(--amber)' } }, 'Week of ' + ((week && week.weekStart) || '—'))),
          div({ style: { fontSize: 9, color: 'var(--text3)' } }, 'Weekly Fixed-Labor-Hours: LifeLenz inputs → scheduled vs target → recommended fixed/floor hours. Dollar-weighted subtotals.')),
        tabBtn('report', 'Report'), tabBtn('config', 'Config'),
        scopeSelect,
        tab === 'report' ? btn({ onClick: exportCSV, disabled: !shown.length, style: { padding: '3px 9px', borderRadius: 6, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text2)', fontSize: 11, fontWeight: 600, cursor: shown.length ? 'pointer' : 'default' } }, '⬇ CSV') : null,
        tab === 'report' ? btn({ onClick: printReport, disabled: !shown.length, style: { padding: '3px 9px', borderRadius: 6, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text2)', fontSize: 11, fontWeight: 600, cursor: shown.length ? 'pointer' : 'default' } }, '🖨 Print') : null,
        tab === 'config' ? span({ style: { fontSize: 10, color: 'var(--text3)' } }, saveMsg) : null,
        tab === 'config' ? btn({ onClick: saveConfig, disabled: !Object.keys(edit).length, style: { padding: '3px 11px', borderRadius: 6, border: '1px solid var(--amber)', background: Object.keys(edit).length ? 'var(--amber)' : 'var(--surf)', color: Object.keys(edit).length ? '#111' : 'var(--text3)', fontSize: 11, fontWeight: 700, cursor: Object.keys(edit).length ? 'pointer' : 'default' } }, 'Save config') : null,
        btn({ className: 'btn btn-sm', style: { color: 'var(--text3)' }, onClick: onClose }, '✕')),

      div({ style: { flex: 1, overflow: 'auto', padding: '12px 16px' } },
        loading
          ? div({ style: { textAlign: 'center', padding: '48px', color: 'var(--text3)', fontSize: 12 } }, 'Loading labor analysis…')
          : tab === 'report'
          ? (!shown.length
              ? div({ style: { textAlign: 'center', padding: '48px', color: 'var(--text3)', fontSize: 12 } }, 'No weekly labor data yet. Upload the MBI Labor Analysis workbook (Data Manager) to populate it.')
              : div({ style: { background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8, overflow: 'auto' } },
                  h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
                    h('thead', null, h('tr', null, h('th', { style: { ...th, textAlign: 'left' } }, 'Store'), ...COLS.map(c => h('th', { key: c.k, style: th }, c.h)))),
                    h('tbody', null,
                      ...shown.map(dataRow),
                      scope === 'all' ? subtotalRow('Oklahoma', model.subtotals.ok) : null,
                      scope === 'all' ? subtotalRow('Florida', model.subtotals.fl) : null,
                      subtotalRow(scope === 'all' ? 'Grand Total' : 'Subtotal', scope === 'all' ? model.subtotals.grand : scopedSub)))))
          : // Config tab
            div({ style: { background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8, overflow: 'auto' } },
              div({ style: { fontSize: 9, color: 'var(--text3)', padding: '8px 10px 0' } }, 'Gathered fixed-hours inputs (editable). Hours-of-operation are deciphered from the sheet (per-day hours shown Mon→Sun); edit support coming next.'),
              h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
                h('thead', null, h('tr', null,
                  h('th', { style: { ...th, textAlign: 'left' } }, 'Store'),
                  h('th', { style: { ...th, textAlign: 'center' } }, '24hr'),
                  h('th', { style: th }, 'Maint Hrs'), h('th', { style: th }, '# People'),
                  h('th', { style: { ...th, textAlign: 'left' } }, 'Maint Days Off'),
                  h('th', { style: th }, 'Prep Hrs'), h('th', { style: th }, 'Lobby Hrs'),
                  h('th', { style: { ...th, textAlign: 'right' } }, 'Hrs/Day (M→Su)'))),
                h('tbody', null, ...cfgStores.map(cfgRow)))))
    ));
}
