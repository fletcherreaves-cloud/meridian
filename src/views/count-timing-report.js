// @ts-nocheck
// ── Count Timing Report — Inventory Control → Reports ─────────────────────────────────────────
// Owner req (2026-10-31), looking at a single store's 🔬 Food-Cost Diagnosis "⏱ Last count
// 10/29/2026: 13:51:19 → 18:34:38 · 4h 43m 0s" line: "put me together a report that shows the
// Last count data for all locations... sortable with our selector... maybe even allow me to
// select monthly and/or weekly counts to be able to display the past trend of whether the
// stores are performing inventory as trained or if they are submitting all at once."
//
// Three modes, one engine underneath (computeCountTiming/computeCountSessions,
// src/engine/eom-item-journey.js):
//   - Latest  — this period's final count per store (the SAME figure the Diagnose modal's
//     "⏱ Last count" line already shows, now district-wide and sortable).
//   - Sessions — every distinct count DAY this period per store (the "weekly" view): a store
//     counting as trained shows several real-duration, non-bulk sessions; a store cramming
//     everything in at the end shows one.
//   - Monthly  — the Latest-mode figure for each of the last N periods per store, so a slipping
//     or recovering pattern over time is visible, not just a single snapshot.
//
// Reads the CURRENT period's rawDetail from the caller (already loaded by EOMDashboardPanel —
// no refetch) for Latest/Sessions; fetches additional trailing periods itself, on demand, only
// when Monthly mode is picked.
import * as React from 'react';
import { ModalShell } from '../components/ModalShell.js';
import { LocationSelector } from '../components/PanelControls.js';
import { useSortedRows, SortTh } from '../components/SortableTh.js';
import { STORE_NAMES, INV_ORG_COORDS, sName, supervisorGroups } from '../constants.js';
import { loadQsrRawItemDetail } from '../lib/supabase.js';
import { computeCountTiming, computeCountSessions, fmtDurationHMS } from '../engine/eom-item-journey.js';
import { printHtml } from '../utils/print-html.js';

const { useState, useEffect, useMemo } = React;
const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const unpad = l => String(l || '').replace(/^0+/, '') || String(l || '');
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Same tiny helper weekly-count-status-report.js already carries its own copy of — see that
// file's own comment for why this isn't a shared export (a 10-line date-math utility).
function lastPeriods(period, n) {
  const m = /^(\d{4})-(\d{2})$/.exec(period || '');
  if (!m) return period ? [period] : [];
  let y = +m[1], mo = +m[2] - 1;
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(y, mo - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out.reverse(); // oldest -> newest
}

// qsr_raw_item_detail returns `loc` PADDED and never strips it (loadQsrRawItemDetail's own
// header comment) — unpad on the way in so every downstream key matches STORE_NAMES/locs.
function groupByLoc(rawDetailRows) {
  const m = {};
  for (const r of (rawDetailRows || [])) {
    const loc = unpad(r.loc);
    (m[loc] || (m[loc] = [])).push({ history: r.history || [] });
  }
  return m;
}

function downloadCsv(text, filename) {
  const blob = new Blob([text], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  a.click(); URL.revokeObjectURL(url);
}

const BULK_LABEL = { true: '⚠ Bulk-submit', false: '✅ Spread out' };
const BULK_COLOR = { true: '#f59e0b', false: '#4ade80' };
const BULK_TITLE = 'Bulk-submit = the items in this count were logged within one instant (or a single timestamp dominated, with a couple stragglers after) — a sign the count may have been written up from memory/paper rather than counted item-by-item in real time. Spread out = recorded over a real travel-path time span, the trained pattern.';

function bulkBadge(bulkSubmit, hasTimes) {
  if (!hasTimes) return span({ style: { color: 'var(--text3)' } }, 'no times recorded');
  return span({ style: { color: BULK_COLOR[bulkSubmit], fontWeight: 700, fontSize: 11 }, title: BULK_TITLE }, BULK_LABEL[bulkSubmit]);
}

function buildLatestRows(locs, rawByLoc) {
  return locs.map(loc => {
    const t = computeCountTiming(rawByLoc[loc] || []);
    return {
      loc, name: sName(loc) || loc,
      countDate: t?.countDate || null, beganTm: t?.beganTm || null, endedTm: t?.endedTm || null,
      durationMs: t?.durationMs ?? null, bulkSubmit: t?.bulkSubmit ?? null, hasTimes: t?.hasTimes ?? false,
      nDays: t?.nDays ?? null,
    };
  });
}

function buildSessionRows(locs, rawByLoc) {
  const rows = [];
  for (const loc of locs) {
    const sessions = computeCountSessions(rawByLoc[loc] || []);
    const name = sName(loc) || loc;
    if (!sessions.length) { rows.push({ loc, name, countDate: null, beganTm: null, endedTm: null, durationMs: null, bulkSubmit: null, hasTimes: false, nCounts: 0 }); continue; }
    for (const s of sessions) rows.push({ loc, name, countDate: s.countDate, beganTm: s.beganTm, endedTm: s.endedTm, durationMs: s.durationMs, bulkSubmit: s.bulkSubmit, hasTimes: s.hasTimes, nCounts: s.nCounts });
  }
  return rows;
}

function buildMonthlyRows(locs, byLocByPeriod, periods) {
  const rows = [];
  for (const loc of locs) {
    const name = sName(loc) || loc;
    for (const p of periods) {
      const t = computeCountTiming((byLocByPeriod[p] || {})[loc] || []);
      rows.push({
        loc, name, period: p,
        countDate: t?.countDate || null, beganTm: t?.beganTm || null, endedTm: t?.endedTm || null,
        durationMs: t?.durationMs ?? null, bulkSubmit: t?.bulkSubmit ?? null, hasTimes: t?.hasTimes ?? false,
      });
    }
  }
  return rows;
}

const MODE_LABEL = { latest: 'Latest count', sessions: "This period's sessions", monthly: 'Monthly trend' };
const MODE_TITLE = {
  latest: "Each store's most recent count this period — the same figure 🔬 Food-Cost Diagnosis shows, district-wide.",
  sessions: 'Every distinct count day this period, per store — spot whether a store counts in several real sessions (trained) or crams it into one (bulk-submitted).',
  monthly: "Each store's latest-count figure for the last several periods, one row per store per month — spot a pattern slipping or recovering over time.",
};

function reportHTML(rows, mode, scopeLabel) {
  const cols = mode === 'monthly'
    ? ['Store', 'Period', 'Count date', 'Began', 'Ended', 'Duration', 'Pattern']
    : mode === 'sessions'
      ? ['Store', 'Session date', 'Began', 'Ended', 'Duration', 'Pattern']
      : ['Store', 'Last count date', 'Began', 'Ended', 'Duration', 'Days spanned', 'Pattern'];
  const trs = rows.map(r => {
    const cells = [
      `${esc(r.name)} <span style="color:#888;font-family:monospace;font-size:10px">#${esc(r.loc)}</span>`,
      ...(mode === 'monthly' ? [esc(r.period)] : []),
      esc(r.countDate || '—'),
      esc(r.beganTm || '—'), esc(r.endedTm || '—'),
      r.hasTimes ? esc(fmtDurationHMS(r.durationMs)) : '—',
      ...(mode === 'latest' ? [esc(r.nDays ?? '—')] : []),
      r.hasTimes ? (r.bulkSubmit ? '⚠ Bulk-submit' : '✅ Spread out') : 'no times recorded',
    ];
    return `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
  }).join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Count Timing Report — ${esc(scopeLabel)}</title>
  <style>
    body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;margin:24px;color:#1a1a1a}
    h1{font-size:18px;margin:0 0 2px}
    .sub{color:#666;font-size:12px;margin-bottom:16px}
    table{border-collapse:collapse;width:100%;font-size:12px}
    th{text-align:left;padding:6px 10px;background:#f5f5f7;font-size:10px;text-transform:uppercase;letter-spacing:.03em;border-bottom:2px solid #ddd}
    td{padding:6px 10px;border-bottom:1px solid #eee}
    @media print{button{display:none}}
  </style></head><body>
  <h1>⏱ Count Timing Report — ${esc(scopeLabel)}</h1>
  <div class="sub">${esc(MODE_LABEL[mode])} · ${esc(MODE_TITLE[mode])}</div>
  <table><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
  <tbody>${trs}</tbody></table>
  </body></html>`;
}

function reportCSV(rows, mode) {
  const cols = mode === 'monthly'
    ? ['Store', 'Loc', 'Period', 'Count date', 'Began', 'Ended', 'Duration (HMS)', 'Duration (ms)', 'Pattern']
    : mode === 'sessions'
      ? ['Store', 'Loc', 'Session date', 'Began', 'Ended', 'Duration (HMS)', 'Duration (ms)', 'Items counted', 'Pattern']
      : ['Store', 'Loc', 'Last count date', 'Began', 'Ended', 'Duration (HMS)', 'Duration (ms)', 'Days spanned', 'Pattern'];
  const lines = [cols.map(c => `"${c}"`).join(',')];
  for (const r of rows) {
    const pattern = r.hasTimes ? (r.bulkSubmit ? 'Bulk-submit' : 'Spread out') : 'no times recorded';
    const base = [r.name, r.loc];
    const mid = mode === 'monthly' ? [r.period] : [];
    const tail = mode === 'sessions' ? [r.countDate || '', r.beganTm || '', r.endedTm || '', r.hasTimes ? fmtDurationHMS(r.durationMs) : '', r.durationMs ?? '', r.nCounts ?? '', pattern]
      : mode === 'monthly' ? [r.countDate || '', r.beganTm || '', r.endedTm || '', r.hasTimes ? fmtDurationHMS(r.durationMs) : '', r.durationMs ?? '', pattern]
      : [r.countDate || '', r.beganTm || '', r.endedTm || '', r.hasTimes ? fmtDurationHMS(r.durationMs) : '', r.durationMs ?? '', r.nDays ?? '', pattern];
    lines.push([...base, ...mid, ...tail].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  }
  return lines.join('\n');
}

export function CountTimingReportModal({ stores, rawDetail, period, onClose }) {
  const [locValue, setLocValue] = useState({ level: 'all', id: null });
  const [mode, setMode] = useState('latest');
  const [trendN, setTrendN] = useState(3);
  const [trendPeriods, setTrendPeriods] = useState({}); // period -> rawDetail rows, fetched on demand
  const [loadingTrend, setLoadingTrend] = useState(false);

  const scope = locValue.level === 'state' ? locValue.id.toLowerCase()
    : locValue.level === 'patch' ? 'grp:' + locValue.id
    : locValue.level === 'store' ? locValue.id : 'all';
  const groups = useMemo(() => { try { return supervisorGroups() || {}; } catch { return {}; } }, []);
  const locs = useMemo(() => {
    if (String(scope).startsWith('grp:')) return (groups[scope.slice(4)] || []).map(l => unpad(l));
    return Object.keys(STORE_NAMES).filter(l =>
      scope === 'all' ? true : scope === 'ok' ? (INV_ORG_COORDS[l] || {}).state === 'OK'
        : scope === 'fl' ? (INV_ORG_COORDS[l] || {}).state === 'FL' : l === scope);
  }, [scope, groups]);
  const scopeLabel = scope === 'all' ? 'All stores' : scope === 'ok' ? 'Oklahoma' : scope === 'fl' ? 'Florida'
    : String(scope).startsWith('grp:') ? ('Patch ' + scope.slice(4)) : (sName(scope) || scope);

  const currentByLoc = useMemo(() => groupByLoc(rawDetail), [rawDetail]);

  const periods = useMemo(() => lastPeriods(period, trendN), [period, trendN]);
  useEffect(() => {
    if (mode !== 'monthly') return;
    const toFetch = periods.filter(p => p !== period && !trendPeriods[p]);
    if (!toFetch.length) return;
    let live = true;
    setLoadingTrend(true);
    Promise.all(toFetch.map(p => loadQsrRawItemDetail({ period: p }).catch(() => [])))
      .then(results => {
        if (!live) return;
        setTrendPeriods(prev => {
          const next = { ...prev };
          toFetch.forEach((p, i) => { next[p] = results[i]; });
          return next;
        });
        setLoadingTrend(false);
      });
    return () => { live = false; };
  }, [mode, periods, period]); // eslint-disable-line react-hooks/exhaustive-deps

  const byLocByPeriod = useMemo(() => {
    const m = { [period]: currentByLoc };
    for (const [p, rows] of Object.entries(trendPeriods)) m[p] = groupByLoc(rows);
    return m;
  }, [period, currentByLoc, trendPeriods]);

  const rows = useMemo(() => {
    if (mode === 'latest') return buildLatestRows(locs, currentByLoc);
    if (mode === 'sessions') return buildSessionRows(locs, currentByLoc);
    return buildMonthlyRows(locs, byLocByPeriod, periods);
  }, [mode, locs, currentByLoc, byLocByPeriod, periods]);

  const { sorted, sortKey, sortDir, onSort } = useSortedRows(rows, 'durationMs', 'desc');

  const doPrint = () => printHtml(reportHTML(sorted, mode, scopeLabel));
  const doCsv = () => downloadCsv(reportCSV(sorted, mode), `count-timing-${mode}-${scopeLabel.replace(/\s+/g, '-').toLowerCase()}.csv`);

  const headerRow = div({ style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 } },
    h(LocationSelector, { stores: Object.keys(STORE_NAMES).map(l => ({ loc: l })), invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES, value: locValue, onChange: setLocValue, mode: 'full' }),
    h('select', {
      value: mode, onChange: e => setMode(e.target.value),
      style: { fontSize: 11, padding: '4px 8px', border: '.5px solid var(--bdr)', borderRadius: 6, background: 'var(--surf2)', color: 'var(--text)' },
    }, Object.entries(MODE_LABEL).map(([k, v]) => h('option', { key: k, value: k }, v))),
    mode === 'monthly' && h('select', {
      value: trendN, onChange: e => setTrendN(Number(e.target.value)),
      style: { fontSize: 11, padding: '4px 8px', border: '.5px solid var(--bdr)', borderRadius: 6, background: 'var(--surf2)', color: 'var(--text)' },
    }, [3, 6, 12].map(n => h('option', { key: n, value: n }, `Last ${n} periods`))),
    span({ style: { fontSize: 9.5, color: 'var(--text3)' } }, `${scopeLabel} · ${new Set(sorted.map(r => r.loc)).size} stores`),
    span({ style: { flex: 1 } }),
    h('button', { className: 'btn btn-sm', style: { fontSize: 10 }, onClick: doPrint }, '🖨 Print'),
    h('button', { className: 'btn btn-sm', style: { fontSize: 10 }, onClick: doCsv }, '⬇ CSV'));

  const explainer = div({ style: { fontSize: '11.5px', color: 'var(--text3)', marginBottom: 10 } }, MODE_TITLE[mode]);

  const extraCols = mode === 'monthly' ? [{ key: 'period', label: 'Period' }]
    : mode === 'latest' ? [{ key: 'nDays', label: 'Days spanned' }] : [];

  const theadEl = h('thead', null, h('tr', null,
    h(SortTh, { label: 'Store', colKey: 'name', sortKey, sortDir, onSort }),
    ...extraCols.map(c => h(SortTh, { key: c.key, label: c.label, colKey: c.key, sortKey, sortDir, onSort })),
    h(SortTh, { label: mode === 'sessions' ? 'Session date' : 'Count date', colKey: 'countDate', sortKey, sortDir, onSort }),
    h(SortTh, { label: 'Began', colKey: 'beganTm', sortKey, sortDir, onSort }),
    h(SortTh, { label: 'Ended', colKey: 'endedTm', sortKey, sortDir, onSort }),
    h(SortTh, { label: 'Duration', colKey: 'durationMs', sortKey, sortDir, onSort }),
    h(SortTh, { label: 'Pattern', colKey: 'bulkSubmit', sortKey, sortDir, onSort }),
  ));

  const tbodyEl = h('tbody', null, sorted.map((r, i) => h('tr', { key: `${r.loc}-${r.period || r.countDate || i}`, style: { borderBottom: '1px solid var(--bdr)' } },
    h('td', { style: { padding: '6px 10px', fontWeight: 600, color: 'var(--text)' } }, r.name,
      span({ style: { fontSize: '10px', color: 'var(--text3)', marginLeft: '5px', fontFamily: 'ui-monospace,Menlo,monospace' } }, `#${r.loc}`)),
    ...extraCols.map(c => h('td', { key: c.key, style: { padding: '6px 10px', color: 'var(--text2)' } }, r[c.key] ?? '—')),
    h('td', { style: { padding: '6px 10px', color: 'var(--text2)', whiteSpace: 'nowrap' } }, r.countDate || '—'),
    h('td', { style: { padding: '6px 10px', color: 'var(--text2)', whiteSpace: 'nowrap' } }, r.beganTm || '—'),
    h('td', { style: { padding: '6px 10px', color: 'var(--text2)', whiteSpace: 'nowrap' } }, r.endedTm || '—'),
    h('td', { style: { padding: '6px 10px', color: 'var(--text)', fontWeight: 600, whiteSpace: 'nowrap' } }, r.hasTimes ? fmtDurationHMS(r.durationMs) : '—'),
    h('td', { style: { padding: '6px 10px', whiteSpace: 'nowrap' } }, bulkBadge(r.bulkSubmit, r.hasTimes)),
  )));

  const tableWrap = div({ style: { overflowX: 'auto' } }, h('table', { style: { width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: '12.5px' } }, theadEl, tbodyEl));

  return h(ModalShell, { title: '⏱ Count Timing Report', subtitle: 'When each store\'s count began, ended, and how long it took — trained (spread out) or rushed (bulk-submitted)', onClose, maxWidth: 1100, closeOnBackdrop: true },
    headerRow, explainer,
    loadingTrend ? div({ style: { padding: 30, textAlign: 'center', color: 'var(--text3)' } }, 'Loading trailing periods…') : tableWrap);
}
