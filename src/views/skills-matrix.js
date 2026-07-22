// @ts-nocheck
// ── Crew Skills Matrix panel ─────────────────────────────────────────────────
// Reformats the LifeLenz People List (Simple CSV) into a readable skills grid:
// each employee (+ job title) down the side, every job/skill across the top, the
// 1-5 rating in the cell (heat-mapped). The packed "SCHEDULE JOBS" string is
// exploded by the parser; this renders it as "Skill Levels".
import * as React from 'react';
import { STORE_NAMES, getStoreOrg, DEF_SETTINGS } from '../constants.js';
import { loadEmployeeSkills } from '../lib/supabase.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);
const locNum = s => { const n = parseInt(s, 10); return Number.isNaN(n) ? String(s == null ? '' : s) : String(n); };
const ALL_LOCS = Object.keys(STORE_NAMES);
const FL_LOCS = new Set(ALL_LOCS.filter(l => getStoreOrg(l) === 'emerald')); // FL panhandle

// Preferred left→right order: production → service → leadership/admin. Anything
// not listed is appended alphabetically.
const STATION_ORDER = ['DRIVE THRU', 'WINDOW', 'BEVERAGE SPECIALIST', 'FRENCH FRIES', 'HASHBROWN',
  'GRILL BREAKFAST MENU', 'GRILL REGULAR MENU', 'VAT', 'FOOD SAFETY', 'LOBBY', 'FLOOR',
  'FLOOR GUEST SERVICE', 'FLOOR PRODUCTION', 'GUEST EXPERIENCE LEADER', 'OTP', 'SUPPORT / PREP',
  'TRUCK DELIVERY', 'MAINTENANCE', 'PLANNED MAINTENANCE', 'OPENING', 'CLOSING', 'TRANSITION',
  'PRE-SHIFT', 'ADMINISTRATION/CASH', 'SCHEDULES', 'HIRING', 'TRAINING', 'INDIVIDUAL DEVELOPMENT',
  'MANAGER MEETING', 'WALK THRUS', 'STAT', 'BIRTHDAY PARTIES'];

// 1-5 heat map (red → green). Blank = not trained on that station.
const RATING_BG = { 1: 'rgba(239,68,68,.85)', 2: 'rgba(249,115,22,.82)', 3: 'rgba(234,179,8,.82)', 4: 'rgba(132,204,22,.82)', 5: 'rgba(16,185,129,.88)' };
const RATING_FG = { 1: '#fff', 2: '#1a1a1a', 3: '#1a1a1a', 4: '#1a1a1a', 5: '#062b1e' };

function orderJobs(jobs) {
  const set = new Set(jobs);
  const ordered = STATION_ORDER.filter(j => set.has(j));
  const rest = jobs.filter(j => !STATION_ORDER.includes(j)).sort();
  return [...ordered, ...rest];
}

export function SkillsMatrixPanel({ ds, onClose }) {
  const { useState, useMemo, useEffect } = React;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [store, setStore] = useState('all');
  const [q, setQ] = useState('');
  const [sortBy, setSortBy] = useState('name');   // 'name' | 'role' | job key
  const [minRating, setMinRating] = useState(0);   // dim cells below this

  useEffect(() => {
    let live = true; setLoading(true);
    loadEmployeeSkills().then(data => {
      if (!live) return;
      if ((!data || !data.length) && ds && ds.peopleSkills) data = ds.peopleSkills.employees;
      setRows(data || []); setLoading(false);
    }).catch(() => { if (live) { setRows([]); setLoading(false); } });
    return () => { live = false; };
  }, [ds && ds.peopleSkills]);

  // Distinct stores present, for the filter.
  const stores = useMemo(() => {
    const m = {};
    for (const e of rows) if (e.loc) m[e.loc] = e.homeStore || STORE_NAMES[locNum(e.loc)] || e.loc;
    return Object.entries(m).sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  }, [rows]);

  const scoped = useMemo(() => {
    let r = rows;
    if (store === 'fl') r = r.filter(e => FL_LOCS.has(locNum(e.loc)));
    else if (store === 'ok') r = r.filter(e => !FL_LOCS.has(locNum(e.loc)));
    else if (store.startsWith('__patch__')) { const set = new Set(((DEF_SETTINGS.supervisorGroups || {})[store.slice(9)] || []).map(l => locNum(l))); r = r.filter(e => set.has(locNum(e.loc))); }
    else if (store !== 'all') r = r.filter(e => locNum(e.loc) === locNum(store));
    if (q.trim()) { const s = q.trim().toLowerCase(); r = r.filter(e => (e.employee || '').toLowerCase().includes(s) || (e.role || '').toLowerCase().includes(s)); }
    return r;
  }, [rows, store, q]);

  const jobs = useMemo(() => {
    const set = new Set();
    for (const e of scoped) for (const j of Object.keys(e.skills || {})) set.add(j);
    return orderJobs([...set]);
  }, [scoped]);

  const sorted = useMemo(() => {
    const r = scoped.slice();
    if (sortBy === 'name') r.sort((a, b) => (a.employee || '').localeCompare(b.employee || ''));
    else if (sortBy === 'role') r.sort((a, b) => (a.role || '').localeCompare(b.role || '') || (a.employee || '').localeCompare(b.employee || ''));
    else r.sort((a, b) => ((b.skills || {})[sortBy] || 0) - ((a.skills || {})[sortBy] || 0) || (a.employee || '').localeCompare(b.employee || ''));
    return r;
  }, [scoped, sortBy]);

  // Coverage: how many crew are proficient (rating ≥3) at each job.
  const coverage = useMemo(() => {
    const cov = {};
    for (const j of jobs) cov[j] = scoped.filter(e => ((e.skills || {})[j] || 0) >= 3).length;
    return cov;
  }, [jobs, scoped]);

  const selStyle = { fontSize: 10, padding: '3px 7px', background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', color: 'var(--text)', colorScheme: 'dark', cursor: 'pointer' };
  const th = { padding: '5px 6px', fontSize: 8, fontWeight: 700, color: 'var(--text3)', borderBottom: '.5px solid var(--bdr)', whiteSpace: 'nowrap', background: 'var(--surf2)', position: 'sticky', top: 0, zIndex: 1 };
  const td = { padding: '3px 6px', fontSize: 10, borderBottom: '.5px solid rgba(255,255,255,.04)', whiteSpace: 'nowrap' };
  const jobTh = j => h('th', { key: j, title: j + ' — click to sort', onClick: () => setSortBy(j), style: { ...th, textAlign: 'center', cursor: 'pointer', writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: 92, verticalAlign: 'bottom', color: sortBy === j ? 'var(--amber)' : 'var(--text3)' } }, j);

  const skillCell = (e, j) => { const v = (e.skills || {})[j]; const dim = minRating > 0 && (!v || v < minRating);
    return h('td', { key: j, style: { ...td, textAlign: 'center', fontFamily: 'var(--mono)', fontWeight: 700, padding: 0 } },
      v ? span({ style: { display: 'block', padding: '3px 0', background: dim ? 'transparent' : RATING_BG[v], color: dim ? 'var(--text3)' : RATING_FG[v], opacity: dim ? 0.3 : 1 } }, v) : span({ style: { color: 'rgba(255,255,255,.12)' } }, '·')); };

  const empRow = e => h('tr', { key: e.loc + '|' + e.employee },
    h('td', { style: { ...td, position: 'sticky', left: 0, background: 'var(--surf)', zIndex: 1, fontWeight: 600, minWidth: 150 } }, e.employee,
      store === 'all' ? span({ style: { color: 'var(--text3)', fontWeight: 400, fontSize: 8.5, marginLeft: 5 } }, e.homeStore || locNum(e.loc)) : null),
    h('td', { style: { ...td, color: 'var(--text2)', fontSize: 9 } }, e.role || '—'),
    ...jobs.map(j => skillCell(e, j)));

  const csvCell = c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"';
  const exportCSV = () => {
    const cols = ['Employee', 'Job Title', 'Home Store', ...jobs];
    const lines = [cols.map(csvCell).join(',')];
    for (const e of sorted) lines.push([e.employee, e.role || '', e.homeStore || '', ...jobs.map(j => (e.skills || {})[j] ?? '')].map(csvCell).join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' }); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `skills-matrix-${store === 'all' ? 'all' : locNum(store)}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  const printReport = () => {
    const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[x]));
    const head = ['Employee', 'Job Title', ...jobs].map(x => `<th>${esc(x)}</th>`).join('');
    const body = sorted.map(e => `<tr><td class="s">${esc(e.employee)}</td><td>${esc(e.role || '')}</td>${jobs.map(j => { const v = (e.skills || {})[j]; return `<td class="r${v || 0}">${v || ''}</td>`; }).join('')}</tr>`).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Skill Levels — ${esc(store === 'all' ? 'All Stores' : (stores.find(s => locNum(s[0]) === locNum(store)) || [])[1] || store)}</title>
      <style>body{font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#111;margin:14px;font-size:9px}h1{font-size:14px;margin:0 0 2px}.sub{color:#666;font-size:10px;margin-bottom:10px}
      table{border-collapse:collapse}th{font-size:8px;color:#555;border-bottom:2px solid #f5bc00;padding:3px 4px;text-align:center}th:first-child,th:nth-child(2){text-align:left}
      td{padding:2px 5px;border-bottom:1px solid #eee;text-align:center;font-variant-numeric:tabular-nums}td.s{text-align:left;font-weight:600}
      td.r1{background:#fecaca}td.r2{background:#fed7aa}td.r3{background:#fef08a}td.r4{background:#d9f99d}td.r5{background:#a7f3d0}@media print{body{margin:0}}</style></head><body>
      <h1>Employee Skill Levels</h1>
      <div class="sub">${esc(store === 'all' ? 'All Stores' : (stores.find(s => locNum(s[0]) === locNum(store)) || [])[1] || store)} · ${sorted.length} crew · ${jobs.length} stations · generated ${esc(new Date().toLocaleDateString())}</div>
      <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
    const w = window.open('', '_blank'); if (!w) return; w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 250);
  };

  // Manager update worksheet: current rating printed small; an open box to write
  // the new rating (then enter changes back into LifeLenz). Includes blank rows
  // for new hires so the whole crew can be reviewed on paper.
  const printWorksheet = () => {
    const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[x]));
    const storeName = store === 'all' ? 'All Stores' : (stores.find(s => locNum(s[0]) === locNum(store)) || [])[1] || store;
    const head = ['Employee', 'Job Title', ...jobs].map((x, i) => `<th class="${i < 2 ? 'lbl' : 'st'}"><span>${esc(x)}</span></th>`).join('');
    const cellsFor = e => jobs.map(j => { const v = (e.skills || {})[j]; return `<td class="box">${v ? `<span class="cur">${v}</span>` : ''}</td>`; }).join('');
    const body = sorted.map(e => `<tr><td class="s">${esc(e.employee)}</td><td class="t">${esc(e.role || '')}</td>${cellsFor(e)}</tr>`).join('');
    // 4 blank rows for new hires / additions.
    const blanks = Array.from({ length: 4 }, () => `<tr class="blank"><td class="s">&nbsp;</td><td class="t"></td>${jobs.map(() => '<td class="box"></td>').join('')}</tr>`).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Skills Update Worksheet — ${esc(storeName)}</title>
      <style>@page{size:landscape}body{font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#111;margin:12px;font-size:9px}
      h1{font-size:14px;margin:0 0 2px}.sub{color:#555;font-size:10px;margin-bottom:4px}
      .note{color:#444;font-size:9px;margin-bottom:8px;padding:4px 6px;background:#fff8e6;border:1px solid #f0d060;border-radius:4px}
      table{border-collapse:collapse}
      th{font-size:7.5px;color:#333;border:1px solid #bbb;padding:2px;vertical-align:bottom}
      th.st{writing-mode:vertical-rl;transform:rotate(180deg);height:96px;text-align:left}
      th.lbl{text-align:left;min-width:110px}
      td{border:1px solid #ccc;padding:0}
      td.s{font-weight:600;padding:2px 5px;white-space:nowrap}td.t{color:#555;padding:2px 5px;white-space:nowrap;font-size:8px}
      td.box{width:20px;height:20px;position:relative}
      td.box .cur{position:absolute;top:0;left:1px;font-size:7px;color:#aaa}
      tr.blank td{height:22px}tr.blank td.s{min-width:110px}
      @media print{body{margin:0}}</style></head><body>
      <h1>Employee Skill Levels — Update Worksheet</h1>
      <div class="sub">${esc(storeName)} · ${sorted.length} crew · ${jobs.length} stations · ${esc(new Date().toLocaleDateString())}</div>
      <div class="note">Current rating is shown small/gray in each box. Write the <b>new</b> rating (1–5) in the box for any station that changed, then enter the updates in LifeLenz. Blank box = no change. Use the empty rows at the bottom for new hires.</div>
      <table><thead><tr>${head}</tr></thead><tbody>${body}${blanks}</tbody></table></body></html>`;
    const w = window.open('', '_blank'); if (!w) return; w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 250);
  };

  // Bulk worksheet: one update worksheet PER STORE for the current scope (All/FL/
  // OK/patch), each store page-broken so they print as separate handouts.
  const printWorksheetsByStore = () => {
    const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[x]));
    const nameOf = loc => (stores.find(s => locNum(s[0]) === locNum(loc)) || [])[1] || (sorted.find(e => locNum(e.loc) === locNum(loc)) || {}).homeStore || STORE_NAMES[locNum(loc)] || locNum(loc);
    const byLoc = {};
    for (const e of sorted) { const k = locNum(e.loc); (byLoc[k] = byLoc[k] || []).push(e); }
    const locs = Object.keys(byLoc).sort((a, b) => String(nameOf(a)).localeCompare(String(nameOf(b))));
    if (!locs.length) return;
    const head = ['Employee', 'Job Title', ...jobs].map((x, i) => `<th class="${i < 2 ? 'lbl' : 'st'}"><span>${esc(x)}</span></th>`).join('');
    const sheet = loc => {
      const rows = byLoc[loc];
      const bodyRows = rows.map(e => `<tr><td class="s">${esc(e.employee)}</td><td class="t">${esc(e.role || '')}</td>${jobs.map(j => { const v = (e.skills || {})[j]; return `<td class="box">${v ? `<span class="cur">${v}</span>` : ''}</td>`; }).join('')}</tr>`).join('');
      const blanks = Array.from({ length: 4 }, () => `<tr class="blank"><td class="s">&nbsp;</td><td class="t"></td>${jobs.map(() => '<td class="box"></td>').join('')}</tr>`).join('');
      return `<div class="store-sheet"><h1>Employee Skill Levels — Update Worksheet</h1>
        <div class="sub">${esc(nameOf(loc))} (#${esc(locNum(loc))}) · ${rows.length} crew · ${jobs.length} stations · ${esc(new Date().toLocaleDateString())}</div>
        <div class="note">Current rating is shown small/gray in each box. Write the <b>new</b> rating (1–5) in the box for any station that changed, then enter the updates in LifeLenz. Blank box = no change. Empty rows at the bottom are for new hires.</div>
        <table><thead><tr>${head}</tr></thead><tbody>${bodyRows}${blanks}</tbody></table></div>`;
    };
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Skill Worksheets — ${esc(locs.length)} stores</title>
      <style>@page{size:landscape}body{font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#111;margin:12px;font-size:9px}
      h1{font-size:14px;margin:0 0 2px}.sub{color:#555;font-size:10px;margin-bottom:4px}
      .note{color:#444;font-size:9px;margin-bottom:8px;padding:4px 6px;background:#fff8e6;border:1px solid #f0d060;border-radius:4px}
      .store-sheet{page-break-before:always}.store-sheet:first-child{page-break-before:auto}
      table{border-collapse:collapse}tr{page-break-inside:avoid}
      th{font-size:7.5px;color:#333;border:1px solid #bbb;padding:2px;vertical-align:bottom}
      th.st{writing-mode:vertical-rl;transform:rotate(180deg);height:96px;text-align:left}
      th.lbl{text-align:left;min-width:110px}
      td{border:1px solid #ccc;padding:0}
      td.s{font-weight:600;padding:2px 5px;white-space:nowrap}td.t{color:#555;padding:2px 5px;white-space:nowrap;font-size:8px}
      td.box{width:20px;height:20px;position:relative}td.box .cur{position:absolute;top:0;left:1px;font-size:7px;color:#aaa}
      tr.blank td{height:22px}tr.blank td.s{min-width:110px}
      @media print{body{margin:0}}</style></head><body>${locs.map(sheet).join('')}</body></html>`;
    const w = window.open('', '_blank'); if (!w) return; w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };

  return div({ style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)', zIndex: 460, display: 'flex', flexDirection: 'column', paddingTop: 20 } },
    div({ style: { flex: '0 0 20px', cursor: 'pointer' }, onClick: onClose }),
    div({ style: { flex: 1, background: 'var(--surf)', maxWidth: 1600, margin: '0 auto', width: 'calc(100% - 24px)', borderRadius: 'var(--rl) var(--rl) 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 -8px 40px rgba(0,0,0,.4)' } },
      div({ style: { padding: '10px 16px', borderBottom: '.5px solid var(--bdr)', flexShrink: 0, background: 'var(--surf2)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
        span({ style: { fontSize: 18 } }, '🎓'),
        div({ style: { flex: 1, minWidth: 160 } },
          div({ style: { fontSize: 14, fontWeight: 800, color: 'var(--text)' } }, 'Employee Skill Levels'),
          div({ style: { fontSize: 9, color: 'var(--text3)' } }, 'LifeLenz People List → skills matrix. Each station rated 1–5 (red→green). Click a station header to sort; ≥3 = proficient.')),
        h('input', { value: q, onChange: e => setQ(e.target.value), placeholder: 'Search name / title…', style: { ...selStyle, minWidth: 140 } }),
        h('select', { value: store, onChange: e => setStore(e.target.value), style: selStyle },
          h('option', { value: 'all' }, 'All Stores'),
          h('optgroup', { label: '— Groups —' },
            h('option', { value: 'fl' }, 'Florida'), h('option', { value: 'ok' }, 'Oklahoma'),
            ...Object.entries(DEF_SETTINGS.supervisorGroups || {}).map(([n, l]) => h('option', { key: n, value: '__patch__' + n }, n.split(' ')[0] + ' Patch (' + l.length + ')'))),
          h('optgroup', { label: '— Stores —' }, ...stores.map(([loc, nm]) => h('option', { key: loc, value: loc }, nm + ' (' + locNum(loc) + ')')))),
        h('select', { value: sortBy, onChange: e => setSortBy(e.target.value), title: 'Sort rows', style: selStyle },
          h('option', { value: 'name' }, 'Sort: Name'), h('option', { value: 'role' }, 'Sort: Job Title')),
        h('select', { value: minRating, onChange: e => setMinRating(+e.target.value), title: 'Dim ratings below…', style: selStyle },
          h('option', { value: 0 }, 'Show all'), h('option', { value: 3 }, 'Highlight ≥3'), h('option', { value: 4 }, 'Highlight ≥4'), h('option', { value: 5 }, 'Highlight 5 only')),
        btn({ onClick: exportCSV, disabled: !sorted.length, style: { padding: '3px 9px', borderRadius: 6, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text2)', fontSize: 11, fontWeight: 600, cursor: sorted.length ? 'pointer' : 'default' } }, '⬇ CSV'),
        btn({ onClick: printReport, disabled: !sorted.length, style: { padding: '3px 9px', borderRadius: 6, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text2)', fontSize: 11, fontWeight: 600, cursor: sorted.length ? 'pointer' : 'default' } }, '🖨 Print'),
        btn({ onClick: printWorksheet, disabled: !sorted.length, title: 'Printable worksheet — current ratings with write-in boxes for updates', style: { padding: '3px 9px', borderRadius: 6, border: '1px solid var(--amber)', background: 'var(--surf)', color: 'var(--amber)', fontSize: 11, fontWeight: 700, cursor: sorted.length ? 'pointer' : 'default' } }, '📝 Worksheet'),
        (() => { const nStores = new Set(sorted.map(e => locNum(e.loc))).size; return btn({ onClick: printWorksheetsByStore, disabled: nStores < 2, title: 'One worksheet per store for the selected scope, page-broken between stores (for handouts)', style: { padding: '3px 9px', borderRadius: 6, border: '1px solid var(--amber)', background: 'var(--surf)', color: 'var(--amber)', fontSize: 11, fontWeight: 700, cursor: nStores >= 2 ? 'pointer' : 'default', opacity: nStores >= 2 ? 1 : 0.5 } }, '📝 Per-store' + (nStores >= 2 ? ' ×' + nStores : '')); })(),
        btn({ className: 'btn btn-sm', style: { color: 'var(--text3)' }, onClick: onClose }, '✕')),

      div({ style: { flex: 1, overflow: 'auto', padding: '12px 16px' } },
        loading
          ? div({ style: { textAlign: 'center', padding: '48px', color: 'var(--text3)', fontSize: 12 } }, 'Loading crew skills…')
          : !sorted.length
          ? div({ style: { textAlign: 'center', padding: '48px', color: 'var(--text3)', fontSize: 12 } }, 'No crew skills yet. Upload a LifeLenz People List (Simple CSV) in Data Manager to populate the matrix.')
          : div({ style: { background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8, overflow: 'auto' } },
              h('table', { style: { borderCollapse: 'collapse', width: '100%' } },
                h('thead', null, h('tr', null,
                  h('th', { style: { ...th, textAlign: 'left', position: 'sticky', left: 0, zIndex: 2, minWidth: 150 } }, 'Employee'),
                  h('th', { style: { ...th, textAlign: 'left' } }, 'Job Title'),
                  ...jobs.map(jobTh))),
                h('tbody', null, ...sorted.map(empRow)),
                // Coverage footer — proficient (≥3) count per station.
                h('tfoot', null, h('tr', null,
                  h('td', { style: { ...td, position: 'sticky', left: 0, background: 'var(--surf2)', fontWeight: 800, color: 'var(--amber)' } }, '≥3 proficient'),
                  h('td', { style: { ...td, background: 'var(--surf2)' } }),
                  ...jobs.map(j => h('td', { key: j, style: { ...td, textAlign: 'center', background: 'var(--surf2)', fontFamily: 'var(--mono)', fontWeight: 700, color: coverage[j] === 0 ? '#ef4444' : 'var(--text2)' } }, coverage[j])))))))
    ));
}
