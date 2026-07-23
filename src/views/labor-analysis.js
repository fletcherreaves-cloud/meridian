// @ts-nocheck
// ── Labor Analysis panel (weekly Fixed-Labor-Hours) ──────────────────────────
// Per-location weekly labor report ported from the "MBI - Labor Analysis" sheet.
// Reads weekly LifeLenz Band-1 inputs (lifelenz_labor_week) + per-store config
// (store_labor_config), computes the efficiency/recommended-hours columns via the
// labor-analysis engine (dollar-weighted OK/FL/grand subtotals), and prints.
// Config tab edits the "gathered" fixed-hours inputs (maintenance/prep/lobby/24hr).
import * as React from 'react';
import { STORE_NAMES, getStoreOrg, DEF_SETTINGS, DEFAULT_TARGETS } from '../constants.js';
import { analyzeSheet, aggregateGroup, analyzeStore, fracToTime, deriveBand1FromSchedule } from '../engine/labor-analysis.js';
import { loadLifeLenzLaborWeek, loadStoreLaborConfig, saveStoreLaborConfig, loadLifeLenzSchedule } from '../lib/supabase.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);

const ALL_LOCS = Object.keys(STORE_NAMES);
const FL_LOCS = new Set(ALL_LOCS.filter(l => getStoreOrg(l) === 'emerald'));
const locNum = s => { const n = parseInt(s, 10); return Number.isNaN(n) ? String(s == null ? '' : s) : String(n); };

// FLH planning template (sheet 2 "FLH - Worksheet"): Wed→Tue grid, Floor + Fixed
// stations with guidance notes. Manager writes planned hours; the header carries
// the store's projected sales/hours (pulled from the weekly analysis) + the
// Floor/FLH/Max ranges (10% / 15% / 25% of projected hours).
const FLH_DAYS = ['Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue'];
const FLH_FLOOR = [
  { code: 'FL', name: 'FLOOR', note: 'Floor coverage min of peaks or 7 hrs/day, optionally from open to close (Hourly Only). Generally, all open hours should be covered' },
  { code: 'FG', name: 'FLOOR GUEST SERVICE', note: 'Peaks/High Volume Periods 7(+) hrs/day, based on store needs' },
  { code: 'FP', name: 'FLOOR PRODUCTION', note: 'Peaks/High Volume Periods 7(+) hrs/day, based on store needs' },
];
const FLH_FIXED = [
  { code: 'A', name: 'ADMINISTRATION/CASH', note: '4 hrs/day, figure actual admin time spent and allocate (eg: deposits, email, voice, complaints, orders) (Hourly Only)' },
  { code: 'BP', name: 'BIRTHDAY PARTIES', note: 'N/A' },
  { code: 'C', name: 'CLOSING', note: '2 hrs/day (2 hourly for 1 hour) *Does not include Manager' },
  { code: 'FS', name: 'FOOD SAFETY', note: '1.5 hrs/day (Performed 2x/day)' },
  { code: 'GL', name: 'GUEST EXPERIENCE', note: 'Peaks/High Volume Periods 7(+) hrs/day, based on store needs' },
  { code: 'H', name: 'HIRING', note: '1-2 hrs/day' },
  { code: 'ID', name: 'INDIVIDUAL DEVELOPMENT', note: '3 hrs/day' },
  { code: 'L', name: 'LOBBY', note: 'Min 7 hrs/day (Peaks)' },
  { code: 'M', name: 'MAINTENANCE', note: 'Total of maintenance hours. Hrs distributed per their schedule' },
  { code: 'MM', name: 'MANAGER MEETING', note: 'Number of hourly managers x 1 hour each' },
  { code: 'O', name: 'OPENING', note: '2-3 hrs/day' },
  { code: 'TP', name: 'OTP', note: '1 hr/day' },
  { code: 'PM', name: 'PLANNED MAINTENANCE', note: 'Min 1 hr/day' },
  { code: 'PS', name: 'PRE-SHIFT', note: '15 - 30 minutes each/peak for FM, FG, FP' },
  { code: 'ST', name: 'STAT', note: '1 hr/day for inventory count/analyze and 2 hrs/wk to deep dive stat' },
  { code: 'SC', name: 'SCHEDULES', note: 'Time taken to do scheduling and review thereof. Likely 3-6 hours' },
  { code: 'S', name: 'SUPPORT / PREP', note: 'Min 6 hrs/day - Adjust to need' },
  { code: 'T', name: 'TRAINING', note: 'Min 8 hrs/day' },
  { code: 'TR', name: 'TRANSITION', note: 'Included in VLH with Grill. Would probably not utilize.' },
  { code: 'TD', name: 'TRUCK DELIVERY', note: '3 hrs/day each truck day, 1 hr each day prior to truck for rotation and prep of delivery' },
  { code: 'V', name: 'VAT', note: 'Included with maintenance hours' },
  { code: 'WT', name: 'WALK THRUS', note: '1 hr/day (20 minutes/peak)' },
];
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
  const [flhHours, setFlhHours] = useState('lifelenz'); // FLH template hours basis: 'lifelenz' (F) | 'target' (O)
  const [scope, setScope] = useState('all');
  const [weekStart, setWeekStart] = useState(null); // selected week (ISO Monday); null = current week
  const [sched, setSched] = useState([]);           // raw daily lifelenz_schedule rows (auto source)
  const [manual, setManual] = useState({ weekStart: null, rows: {} }); // MBI upload / lifelenz_labor_week (gap-fill)
  const [config, setConfig] = useState({});       // {loc: {...}}
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState({});           // dirty config edits
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    let live = true;
    setLoading(true);
    // AUTO source (freshest-wins): the daily lifelenz_schedule, aggregated per week.
    // MANUAL (MBI upload / lifelenz_labor_week) is loaded only as a gap-fill fallback.
    Promise.all([loadLifeLenzSchedule({ daysBack: 35, daysFwd: 21 }), loadLifeLenzLaborWeek(), loadStoreLaborConfig()]).then(([sch, w, c]) => {
      if (!live) return;
      // Fall back to the just-uploaded sheet if the labor-week DB is empty.
      if ((!w || !Object.keys(w.rows || {}).length) && ds && ds.laborAnalysis) {
        const la = ds.laborAnalysis; const rows = {};
        for (const s of la.stores) rows[locNum(s.loc)] = s.band1;
        w = { weekStart: la.weekStart, rows };
      }
      if ((!c || !Object.keys(c).length) && ds && ds.laborAnalysis) {
        c = {}; for (const s of ds.laborAnalysis.stores) c[locNum(s.loc)] = s.config;
      }
      setSched(sch || []);
      setManual(w || { weekStart: null, rows: {} });
      setConfig(c || {});
      setLoading(false);
    }).catch(() => { if (live) { setSched([]); setManual({ weekStart: null, rows: {} }); setLoading(false); } });
    return () => { live = false; };
  }, [ds && ds.laborAnalysis]);

  // The displayed week: AUTO (schedule-derived) wins; MANUAL fills only the stores
  // AUTO lacks for the SAME week (never overrides). If the schedule has nothing for
  // the selected week, fall back to the manual (MBI) week entirely.
  const orgTargetFor = loc => { const t = DEFAULT_TARGETS[locNum(loc)]; return t && typeof t.tCrewLabor === 'number' ? t.tCrewLabor : null; };
  const week = useMemo(() => {
    const auto = deriveBand1FromSchedule(sched, { weekStart, orgTargetFor });
    const autoLocs = Object.keys(auto.rows);
    if (!autoLocs.length) {
      if (manual && Object.keys(manual.rows || {}).length) return { weekStart: manual.weekStart, rows: manual.rows, source: 'manual', autoCount: 0, manualFill: Object.keys(manual.rows).length };
      return { weekStart: auto.weekStart, rows: {}, source: 'auto', autoCount: 0, manualFill: 0 };
    }
    const rows = { ...auto.rows }; let filled = 0;
    if (manual && manual.weekStart === auto.weekStart) {
      for (const loc of Object.keys(manual.rows || {})) if (!rows[loc]) { rows[loc] = manual.rows[loc]; filled++; }
    }
    return { weekStart: auto.weekStart, rows, source: 'auto', autoCount: autoLocs.length, manualFill: filled };
  }, [sched, manual, weekStart]);

  const shiftWeek = delta => { const base = (week && week.weekStart) ? new Date(week.weekStart + 'T00:00:00') : new Date(); base.setDate(base.getDate() + delta * 7); setWeekStart(base.toISOString().slice(0, 10)); };

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

  // Per-store FLH planning worksheet (sheet-2 template). One page per store in the
  // current scope; projected sales/hours pulled from the weekly analysis, hours
  // basis chosen at print time (LifeLenz forecast F, or target-based O). Manager
  // fills the Wed→Tue grid; guidance notes + Floor/FLH/Max ranges are pre-filled.
  const printFLHWorksheets = () => {
    if (!shown.length) return;
    const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[x]));
    const basisLbl = flhHours === 'lifelenz' ? 'LifeLenz' : 'Target';
    const fmtH = v => v == null || Number.isNaN(v) ? '—' : Math.round(v).toLocaleString();
    const fmtS = v => v == null || Number.isNaN(v) ? '—' : '$' + Math.round(v).toLocaleString();
    const colspan = 2 + FLH_DAYS.length + 1 + 1;
    const headRow = `<tr><th class="lbl">Code</th><th class="lbl">Station</th>${FLH_DAYS.map(d => `<th>${d}</th>`).join('')}<th>Total</th><th class="notehd">Explanation / Reasoning / Suggestions</th></tr>`;
    const stnRow = s => `<tr><td class="code">${esc(s.code)}</td><td class="stn">${esc(s.name)}</td>${FLH_DAYS.map(() => '<td class="box"></td>').join('')}<td class="box"></td><td class="note">${esc(s.note || '')}</td></tr>`;
    const totRow = lbl => `<tr class="tr-tot"><td></td><td class="stn">${esc(lbl)}</td>${FLH_DAYS.map(() => '<td class="box"></td>').join('')}<td class="box"></td><td></td></tr>`;
    const secRow = lbl => `<tr class="tr-sec"><td colspan="${colspan}">${esc(lbl)}</td></tr>`;
    const sheet = r => {
      const H = (flhHours === 'lifelenz' ? r.hoursFcst : r.projHrsTarget) || 0;
      const summary = `<table class="summary"><tbody>
        <tr><td class="sl">Projected Sales for Period</td><td class="sv">${fmtS(r.salesFcst)}</td>
            <td class="sl">Projected Hours for Period (${esc(basisLbl)})</td><td class="sv">${fmtH(H)}</td></tr>
        <tr><td class="sl">Target Floor Hours (10–15%)</td><td class="sv">${fmtH(H * 0.10)} – ${fmtH(H * 0.15)} &nbsp;(median ${fmtH(H * 0.125)})</td>
            <td class="sl">Target FLH (10–15%)</td><td class="sv">${fmtH(H * 0.10)} – ${fmtH(H * 0.15)} &nbsp;(median ${fmtH(H * 0.125)})</td></tr>
        <tr><td class="sl">Maximum Floor + Fixed Hours (25%)</td><td class="sv">${fmtH(H * 0.25)}</td>
            <td class="sl">Combined Floor + FLH — 25% or below?</td><td class="sv">☐ Yes &nbsp; ☐ No</td></tr></tbody></table>`;
      return `<div class="store-sheet">
        <div class="note-strip">Write planned hours per day for each station. Floor + Fixed should stay within the ranges above (Combined ≤ 25% of projected hours). Guidance is a starting point — adjust to store needs.</div>
        ${summary}
        <table class="grid"><thead>
          <tr><th class="pagehdr" colspan="${colspan}">${esc(storeNm(r.loc))} (#${esc(locNum(r.loc))}) — Fixed-Labor-Hours Worksheet · Proj Sales ${fmtS(r.salesFcst)} · Proj Hours ${fmtH(H)} (${esc(basisLbl)}) · ${esc(new Date().toLocaleDateString())}</th></tr>
          ${headRow}</thead><tbody>
          ${secRow('FLOOR HOURS')}${FLH_FLOOR.map(stnRow).join('')}${totRow('TOTAL FLOOR HOURS')}
          ${secRow('FIXED LABOR HOURS')}${FLH_FIXED.map(stnRow).join('')}${totRow('TOTAL FIXED LABOR HOURS')}
        </tbody></table></div>`;
    };
    // Tightened to fit one landscape page per store (3 floor + 22 fixed + totals).
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>FLH Worksheets — ${esc(shown.length)} stores</title>
      <style>@page{size:landscape;margin:0.3in}body{font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#111;margin:0;font-size:7.5px}
      .store-sheet{page-break-before:always;page-break-inside:avoid}.store-sheet:first-child{page-break-before:auto}
      .note-strip{font-size:7px;color:#444;background:#fff8e6;border:1px solid #f0d060;border-radius:3px;padding:2px 5px;margin:0 0 3px;line-height:1.15}
      table.summary{border-collapse:collapse;width:100%;margin:0 0 3px}table.summary td{border:1px solid #ccc;padding:1px 5px;font-size:8px}
      table.summary td.sl{background:#f4f4f4;font-weight:600;width:22%}table.summary td.sv{font-variant-numeric:tabular-nums}
      table.grid{border-collapse:collapse;width:100%}tr{page-break-inside:avoid}thead{display:table-header-group}
      th.pagehdr{text-align:left;font-size:9.5px;font-weight:800;background:#f5bc00;color:#111;padding:2px 6px;border:1px solid #999}
      th{font-size:7px;color:#333;border:1px solid #bbb;padding:1px 2px;background:#f4f4f4}th.lbl,th.notehd{text-align:left}
      td{border:1px solid #ccc;padding:0 3px;font-size:7.5px;height:13px;line-height:12px}
      td.code{font-weight:700;text-align:center;width:22px}td.stn{font-weight:600;white-space:nowrap}
      td.box{width:30px}td.note{color:#555;font-size:6.5px;line-height:1.05}
      tr.tr-tot td{font-weight:800;background:#fbfbe8}tr.tr-sec td{font-weight:800;background:#eee;text-transform:uppercase;letter-spacing:.3px;font-size:7px;padding:1px 3px}
      </style></head><body>${shown.map(sheet).join('')}</body></html>`;
    const w = window.open('', '_blank'); if (!w) return; w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
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
          div({ style: { fontSize: 14, fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } }, 'Labor Analysis',
            // Week navigator ‹ · ›
            btn({ onClick: () => shiftWeek(-1), title: 'Previous week', style: { padding: '1px 7px', borderRadius: 6, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text2)', fontSize: 12, fontWeight: 700, cursor: 'pointer' } }, '‹'),
            span({ style: { fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'rgba(245,188,0,.15)', color: 'var(--amber)' } }, 'Week of ' + ((week && week.weekStart) || '—')),
            btn({ onClick: () => shiftWeek(1), title: 'Next week', style: { padding: '1px 7px', borderRadius: 6, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text2)', fontSize: 12, fontWeight: 700, cursor: 'pointer' } }, '›'),
            weekStart ? btn({ onClick: () => setWeekStart(null), title: 'Back to current week', style: { padding: '1px 7px', borderRadius: 6, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text3)', fontSize: 9, fontWeight: 700, cursor: 'pointer' } }, 'This week') : null,
            // Source chip: auto (schedule-derived) vs manual (MBI upload)
            span({ title: week.source === 'auto' ? 'Auto — derived from the daily LifeLenz schedule (cloud-fresh)' + (week.manualFill ? ' · ' + week.manualFill + ' store(s) gap-filled from manual upload' : '') : 'Manual — from the uploaded MBI Labor Analysis workbook (no schedule data for this week)', style: { fontSize: 8.5, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: week.source === 'auto' ? 'rgba(16,185,129,.15)' : 'rgba(148,163,184,.18)', color: week.source === 'auto' ? '#10b981' : 'var(--text3)' } }, week.source === 'auto' ? ('⟳ Auto' + (week.manualFill ? ' +' + week.manualFill : '')) : 'Manual')),
          div({ style: { fontSize: 9, color: 'var(--text3)' } }, 'Weekly Fixed-Labor-Hours from the daily LifeLenz schedule (auto, cloud-fresh) → scheduled vs target → recommended fixed/floor hours. Hours Forecast = Proj VLH + Fixed + Floor (hourly only). Dollar-weighted subtotals; manual MBI upload gap-fills only.')),
        tabBtn('report', 'Report'), tabBtn('config', 'Config'),
        scopeSelect,
        tab === 'report' ? btn({ onClick: exportCSV, disabled: !shown.length, style: { padding: '3px 9px', borderRadius: 6, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text2)', fontSize: 11, fontWeight: 600, cursor: shown.length ? 'pointer' : 'default' } }, '⬇ CSV') : null,
        tab === 'report' ? btn({ onClick: printReport, disabled: !shown.length, style: { padding: '3px 9px', borderRadius: 6, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text2)', fontSize: 11, fontWeight: 600, cursor: shown.length ? 'pointer' : 'default' } }, '🖨 Print') : null,
        tab === 'report' ? h('select', { value: flhHours, onChange: e => setFlhHours(e.target.value), title: 'FLH worksheet — which projected hours to base the ranges on', style: selStyle }, h('option', { value: 'lifelenz' }, 'FLH hrs: LifeLenz'), h('option', { value: 'target' }, 'FLH hrs: Target (col O)')) : null,
        tab === 'report' ? btn({ onClick: printFLHWorksheets, disabled: !shown.length, title: 'Print the per-store Fixed-Labor-Hours planning worksheet (one page per store in scope)', style: { padding: '3px 9px', borderRadius: 6, border: '1px solid var(--amber)', background: 'var(--surf)', color: 'var(--amber)', fontSize: 11, fontWeight: 700, cursor: shown.length ? 'pointer' : 'default' } }, '🗒 FLH Worksheet' + (shown.length > 1 ? ' ×' + shown.length : '')) : null,
        tab === 'config' ? span({ style: { fontSize: 10, color: 'var(--text3)' } }, saveMsg) : null,
        tab === 'config' ? btn({ onClick: saveConfig, disabled: !Object.keys(edit).length, style: { padding: '3px 11px', borderRadius: 6, border: '1px solid var(--amber)', background: Object.keys(edit).length ? 'var(--amber)' : 'var(--surf)', color: Object.keys(edit).length ? '#111' : 'var(--text3)', fontSize: 11, fontWeight: 700, cursor: Object.keys(edit).length ? 'pointer' : 'default' } }, 'Save config') : null,
        btn({ className: 'btn btn-sm', style: { color: 'var(--text3)' }, onClick: onClose }, '✕')),

      div({ style: { flex: 1, overflow: 'auto', padding: '12px 16px' } },
        loading
          ? div({ style: { textAlign: 'center', padding: '48px', color: 'var(--text3)', fontSize: 12 } }, 'Loading labor analysis…')
          : tab === 'report'
          ? (!shown.length
              ? div({ style: { textAlign: 'center', padding: '48px', color: 'var(--text3)', fontSize: 12 } }, 'No labor data for this week. The auto source needs the daily LifeLenz schedule synced (lifelenz_schedule) — try ‹ / › to another week, or upload the MBI Labor Analysis workbook (Data Manager) as a fallback.')
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
