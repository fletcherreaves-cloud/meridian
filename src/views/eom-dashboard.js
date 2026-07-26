// @ts-nocheck
// ── EOM Dashboard ─────────────────────────────────────────────────────────────
// All-stores End-Of-Month view (Notes 29): each location's inventory count
// progress + finalization status, its FOB $/% snapshot, a diagnosis status, and
// communication-verification. Count progress is engine-derived from the auto-pulled
// qsr_onhand stream (last_counted/last_submitted inside the last-3-days window);
// FOB comes from the qsr_fob stream (dollar-weighted, MTD). Diagnosis + comms state
// persist to eom_count_status so the owner can track who was told what.
import * as React from 'react';
import { STORE_NAMES, getStoreOrg } from '../constants.js';
import {
  loadQsrOnHand, loadQsrFob, loadEomCountStatus, saveEomCountStatus,
  loadQsrVarianceStat, loadQsrWaste, loadQsrTransfers, loadQsrRawItemDetail,
} from '../lib/supabase.js';
import {
  computeCountProgress, periodKey, daysInPeriod, countWindowStart, BELIEVES_DONE_PCT,
  buildIncompleteCountMessage,
} from '../engine/eom-inventory.js';
import { runDiagnosis, formatDiagnosisReport } from '../engine/eom-diagnosis.js';

const { useState, useEffect, useMemo, useCallback } = React;
const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);

const unpad = loc => String(loc || '').replace(/^0+/, '') || String(loc || '');
const nm = loc => STORE_NAMES[unpad(loc)] || unpad(loc);
const pct = v => (v == null || isNaN(v)) ? '—' : (v * 100).toFixed(0) + '%';
const pct2 = v => (v == null || isNaN(v)) ? '—' : (v * 100).toFixed(2) + '%'; // FOB % — 2 decimals

// Trigger a client-side file download (matches the app's export pattern).
function downloadFile(content, filename, mime = 'text/csv') {
  try {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 300);
  } catch (e) { console.error('download failed', e); }
}
const csvCell = v => v == null ? '""' : (typeof v === 'number' ? v : '"' + String(v).replace(/"/g, '""') + '"');

// Open the diagnosis report in a print window (→ PDF via the browser print dialog).
function printDiagnosis(name, period, reportText) {
  const w = window.open('', '_blank', 'width=800,height=900');
  if (!w) return;
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>EOM Diagnosis — ${esc(name)} ${esc(period)}</title>
    <style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:28px;line-height:1.5}
    h1{font-size:17px;margin:0 0 2px} .sub{color:#666;font-size:12px;margin-bottom:16px}
    pre{white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;line-height:1.55}
    @media print{@page{margin:0.6in}}</style></head><body>
    <h1>EOM Food-Cost Diagnosis — ${esc(name)}</h1>
    <div class="sub">Period ${esc(period)} · generated ${new Date().toLocaleString()}</div>
    <pre>${esc(reportText)}</pre></body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 400);
}
const money = v => (v == null || isNaN(v)) ? '—' : '$' + Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 });

// Recent period options (current month + prior 3), as 'YYYY-MM'.
function recentPeriods(n = 4) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(periodKey(d));
  }
  return out;
}

const DIAG_OPTS = ['pending', 'in_review', 'diagnosed', 'cleared'];
const COMMS_OPTS = ['none', 'drafted', 'sent', 'verified'];
const DIAG_LABEL = { pending: 'Pending', in_review: 'In review', diagnosed: 'Diagnosed', cleared: 'Cleared' };
const COMMS_LABEL = { none: 'Not sent', drafted: 'Drafted', sent: 'Sent', verified: 'Verified' };
const statusColor = (v) => ({
  pending: '#64748b', in_review: '#f5bc00', diagnosed: '#38bdf8', cleared: '#4ade80',
  none: '#64748b', drafted: '#f5bc00', sent: '#38bdf8', verified: '#4ade80',
}[v] || '#64748b');

// FOB $/% snapshot for the period, dollar-weighted (Σcomponents / ΣprodSales) — MTD.
// FOB components (per fob-eom / analytics): comp waste + raw waste + condiments +
// emp/mgr meals + stat variance + unexplained. FOB% = FOB$ / product sales$.
function fobByStore(fobRows, period) {
  const acc = {};
  for (const r of (fobRows || [])) {
    const p = typeof r.date === 'string' ? r.date.slice(0, 7)
      : (r.date instanceof Date ? periodKey(r.date) : String(r.date || '').slice(0, 7));
    if (p !== period) continue;
    const loc = String(r.loc);
    const a = acc[loc] || (acc[loc] = { sales: 0, fob: 0, comp: 0, raw: 0, cond: 0, emp: 0, statv: 0, unex: 0 });
    a.sales += r.prodSalesAmt || 0;
    a.comp += r.compWasteAmt || 0;
    a.raw += r.rawWasteAmt || 0;
    a.cond += r.condimentsAmt || 0;
    a.emp += r.empMgrMealsAmt || 0;
    a.statv += r.statVarianceAmt || 0;
    a.unex += r.unexplainedAmt || 0;
  }
  for (const loc of Object.keys(acc)) {
    const a = acc[loc];
    a.fob = a.comp + a.raw + a.cond + a.emp + a.statv + a.unex;
    a.fobPct = a.sales ? a.fob / a.sales : null;
  }
  return acc;
}

function ClassChips({ byClass }) {
  const order = [['food', 'F'], ['condiment', 'C'], ['paper', 'P'], ['nonproduct', 'N']];
  return div({ style: { display: 'flex', gap: '4px' } },
    order.map(([k, label]) => {
      const b = byClass[k];
      if (!b || !b.total) return null;
      const color = b.done ? '#4ade80' : b.pct >= 0.5 ? '#f5bc00' : '#64748b';
      return span({
        key: k,
        title: `${label}: ${b.counted}/${b.total} counted (${pct(b.pct)})`,
        style: { fontSize: '10px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', border: `1px solid ${color}`, color },
      }, `${label} ${pct(b.pct)}`);
    }));
}

function ProgressBar({ value }) {
  const p = Math.max(0, Math.min(1, value || 0));
  const color = p >= BELIEVES_DONE_PCT ? '#4ade80' : p >= 0.5 ? '#f5bc00' : '#f87171';
  return div({ style: { display: 'flex', alignItems: 'center', gap: '8px', minWidth: '140px' } },
    div({ style: { flex: 1, height: '8px', background: 'var(--bdr)', borderRadius: '4px', overflow: 'hidden' } },
      div({ style: { width: `${p * 100}%`, height: '100%', background: color } })),
    span({ style: { fontSize: '12px', fontWeight: 700, color, minWidth: '34px', textAlign: 'right' } }, pct(p)));
}

export function EOMDashboardPanel({ stores, ds, settings, onClose }) {
  const periods = useMemo(() => recentPeriods(4), []);
  const [period, setPeriod] = useState(periods[0]);
  const [loading, setLoading] = useState(true);
  const [onHand, setOnHand] = useState([]);
  const [fobRows, setFobRows] = useState([]);
  const [statusMap, setStatusMap] = useState({}); // loc -> saved eom_count_status
  const [saving, setSaving] = useState('');
  const [draft, setDraft] = useState(null); // { loc, name, subject, body } for the comms modal
  const [copied, setCopied] = useState(false);
  const [variance, setVariance] = useState([]);
  const [waste, setWaste] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [rawDetail, setRawDetail] = useState([]);
  const [diag, setDiag] = useState(null); // { name, result, report } for the diagnosis modal
  const [diagCopied, setDiagCopied] = useState(false);
  const [scope, setScope] = useState('all'); // 'all' | 'FL' | 'OK' — state filter
  const [oneStore, setOneStore] = useState(''); // '' = all stores in scope, else a single loc

  const load = useCallback(async (p) => {
    setLoading(true);
    try {
      const [oh, fob, st, vr, wa, tr, rd] = await Promise.all([
        loadQsrOnHand({ period: p }),
        loadQsrFob().catch(() => []),
        loadEomCountStatus({ period: p }).catch(() => []),
        loadQsrVarianceStat({ period: p }).catch(() => []),
        loadQsrWaste({ period: p }).catch(() => []),
        loadQsrTransfers({ period: p }).catch(() => []),
        loadQsrRawItemDetail({ period: p }).catch(() => []),
      ]);
      setOnHand(oh || []);
      setFobRows(fob || []);
      setVariance(vr || []);
      setWaste(wa || []);
      setTransfers(tr || []);
      setRawDetail(rd || []);
      const m = {}; (st || []).forEach(r => { m[String(r.loc)] = r; });
      setStatusMap(m);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(period); }, [period, load]);

  // On-hand rows grouped by store loc (reused for progress + comms drafting).
  const byLoc = useMemo(() => {
    const m = {};
    for (const r of onHand) { (m[String(r.loc)] || (m[String(r.loc)] = [])).push(r); }
    return m;
  }, [onHand]);

  // Diagnosis inputs grouped by loc (variance / waste / transfers streams).
  const groupByLoc = (arr) => {
    const m = {};
    for (const r of (arr || [])) { (m[String(r.loc)] || (m[String(r.loc)] = [])).push(r); }
    return m;
  };
  const varByLoc = useMemo(() => groupByLoc(variance), [variance]);
  const wasteByLoc = useMemo(() => groupByLoc(waste), [waste]);
  const xferByLoc = useMemo(() => groupByLoc(transfers), [transfers]);
  // Raw-item registers grouped by loc; reshape for the engine (counts = inventory events).
  const rawByLoc = useMemo(() => {
    const m = {};
    for (const r of (rawDetail || [])) {
      const counts = (r.history || []).filter(h => h.isCount);
      (m[String(r.loc)] || (m[String(r.loc)] = [])).push({ wrin: r.wrin, descr: r.descr, history: r.history, counts });
    }
    return m;
  }, [rawDetail]);

  // Which stores have any diagnosis input beyond on-hand (variance/waste/transfers).
  const hasDiagData = useMemo(() => {
    const s = new Set([...Object.keys(varByLoc), ...Object.keys(wasteByLoc), ...Object.keys(xferByLoc)]);
    return s;
  }, [varByLoc, wasteByLoc, xferByLoc]);

  // Compute progress + FOB per store. Build the store universe from EVERY loaded
  // stream (on-hand ∪ variance ∪ waste ∪ transfers ∪ FOB) so stores show up even
  // before the count window opens (variance/waste/transfers land all month, while
  // on-hand only populates the last 3 days). Gating on on-hand alone hid everything.
  const allRows = useMemo(() => {
    const fob = fobByStore(fobRows, period);
    const asOf = new Date();
    const locs = new Set([
      ...Object.keys(byLoc), ...Object.keys(varByLoc), ...Object.keys(wasteByLoc),
      ...Object.keys(xferByLoc), ...Object.keys(fob),
    ]);
    const out = [...locs].map(loc => {
      const prog = computeCountProgress(byLoc[loc] || [], { period, asOf });
      const f = fob[loc] || {};
      const st = statusMap[loc] || {};
      return {
        loc,
        name: nm(loc),
        org: getStoreOrg(unpad(loc)),
        prog,
        fobPct: f.fobPct ?? null,
        fob$: f.fob ?? null,
        components: f,
        hasDiag: hasDiagData.has(loc),
        diagnosis: st.diagnosisStatus || 'pending',
        comms: st.commsStatus || 'none',
        commsRecipient: st.commsRecipient || '',
      };
    });
    // stores with unfinished counts first, then by name
    out.sort((a, b) => (a.prog.pctCounted - b.prog.pctCounted) || a.name.localeCompare(b.name));
    return out;
  }, [byLoc, varByLoc, wasteByLoc, xferByLoc, fobRows, statusMap, period, hasDiagData]);

  // Apply the location filter (state pills + optional single-store).
  const rows = useMemo(() => {
    const stateOf = (org) => org === 'emerald' ? 'FL' : 'OK';
    return allRows.filter(r =>
      (scope === 'all' || stateOf(r.org) === scope) &&
      (!oneStore || r.loc === oneStore));
  }, [allRows, scope, oneStore]);

  const openDraft = useCallback((loc, name) => {
    const msg = buildIncompleteCountMessage(name, byLoc[loc] || [], { period, asOf: new Date() });
    setCopied(false);
    setDraft({ loc, name, subject: msg.subject, body: msg.body, hasGaps: msg.hasGaps });
  }, [byLoc, period]);

  const copyDraft = useCallback(async () => {
    if (!draft) return;
    const text = `${draft.subject}\n\n${draft.body}`;
    try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); }
  }, [draft]);

  // Run the full diagnosis engine for one store from the cloud streams.
  const openDiag = useCallback((loc, name, components) => {
    const c = components || {};
    const result = runDiagnosis({
      store: loc, storeName: name, period, asOf: new Date(),
      data: {
        // FOB components → engine keys (targets come from monthly_targets later; band floor for now)
        fob: c.sales ? {
          sales: c.sales, compWaste: c.comp, rawWaste: c.raw, condiments: c.cond,
          empMgrMeals: c.emp, statVariance: c.statv, unexplained: c.unex,
        } : null,
        onHand: (byLoc[loc] || []).map(r => ({
          wrin: r.wrin, cls: r.cls, descr: r.descr, onHandAmt: r.on_hand_amt ?? r.onHandAmt,
          lastCounted: r.last_counted ? new Date(r.last_counted + 'T00:00:00') : (r.lastCounted || null),
          lastSubmitted: r.last_submitted ? new Date(r.last_submitted + 'T00:00:00') : (r.lastSubmitted || null),
        })),
        variance: varByLoc[loc] || [],
        waste: wasteByLoc[loc] || [],
        transfers: xferByLoc[loc] || [],
        rawItems: rawByLoc[loc] || [],
      },
    });
    setDiagCopied(false);
    setDiag({ loc, name, result, report: formatDiagnosisReport(result) });
  }, [period, byLoc, varByLoc, wasteByLoc, xferByLoc, rawByLoc]);

  const copyDiag = useCallback(async () => {
    if (!diag) return;
    try { await navigator.clipboard.writeText(diag.report); setDiagCopied(true); } catch { setDiagCopied(false); }
  }, [diag]);

  // District CSV export of the (filtered) all-stores table.
  const exportCSV = useCallback(() => {
    const cols = [
      ['Store', r => r.name], ['State', r => (r.org === 'emerald' ? 'FL' : 'OK')],
      ['Count %', r => r.prog.pctCounted != null ? (r.prog.pctCounted * 100).toFixed(0) : ''],
      ['FOB %', r => r.fobPct != null ? (r.fobPct * 100).toFixed(2) : ''],
      ['FOB $', r => r.fob$ != null ? Math.round(r.fob$) : ''],
      ['Diagnosis', r => DIAG_LABEL[r.diagnosis] || r.diagnosis],
      ['Communication', r => COMMS_LABEL[r.comms] || r.comms],
    ];
    const header = cols.map(c => csvCell(c[0])).join(',');
    const body = rows.map(r => cols.map(c => csvCell(c[1](r))).join(',')).join('\n');
    downloadFile(header + '\n' + body, `eom-dashboard-${period}.csv`, 'text/csv');
  }, [rows, period]);

  const summary = useMemo(() => {
    const n = rows.length;
    const done = rows.filter(r => r.prog.believesDone).length;
    const avg = n ? rows.reduce((s, r) => s + r.prog.pctCounted, 0) / n : 0;
    return { n, done, avg };
  }, [rows]);

  // "Ready for review" = store believes it's done counting AND you haven't started
  // diagnosing yet (diagnosis still 'pending'). Moving diagnosis off 'pending' clears it.
  const readyForReview = useMemo(
    () => rows.filter(r => r.prog.believesDone && r.diagnosis === 'pending'),
    [rows]);

  const updateStatus = useCallback(async (loc, patch) => {
    setSaving(loc);
    const cur = statusMap[loc] || {};
    const next = { ...cur, loc, period, ...patch };
    setStatusMap(m => ({ ...m, [loc]: next }));
    try { await saveEomCountStatus([next]); } finally { setSaving(''); }
  }, [statusMap, period]);

  const inWindow = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    return d >= countWindowStart(period);
  }, [period]);

  return div({ style: { padding: '20px', maxWidth: '1200px', margin: '0 auto' } },
    // header
    div({ style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' } },
      div(null,
        h('h2', { style: { margin: 0, fontSize: '20px', color: 'var(--text)' } }, '📦 EOM Dashboard'),
        span({ style: { fontSize: '12px', color: 'var(--text3)' } },
          `Inventory count progress + FOB status · window: last ${3} days (from the ${countWindowStart(period).getDate()}${daysInPeriod(period) ? '' : ''})`)),
      div({ style: { display: 'flex', gap: '10px', alignItems: 'center' } },
        h('select', {
          value: period, onChange: e => setPeriod(e.target.value),
          style: { background: 'var(--surf3)', color: 'var(--text)', border: '1px solid var(--bdr2)', borderRadius: '6px', padding: '6px 10px', fontSize: '13px' },
        }, periods.map(p => h('option', { key: p, value: p }, p))),
        h('button', {
          onClick: exportCSV, title: 'Download the all-stores table as CSV',
          disabled: rows.length === 0,
          style: { background: 'var(--surf3)', color: 'var(--text2)', border: '1px solid var(--bdr2)', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', fontWeight: 600, cursor: rows.length ? 'pointer' : 'not-allowed' },
        }, '⬇ CSV'),
        onClose && h('button', { onClick: onClose, style: { background: 'none', border: 'none', color: 'var(--text3)', fontSize: '20px', cursor: 'pointer' } }, '✕'))),

    // location picker — state pills (All / OK / FL) + single-store dropdown
    div({ style: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap' } },
      [['all', 'All'], ['OK', 'Oklahoma'], ['FL', 'Florida']].map(([k, label]) => {
        const active = scope === k;
        return h('button', {
          key: k, onClick: () => { setScope(k); setOneStore(''); },
          style: {
            background: active ? '#f5bc00' : 'var(--surf3)', color: active ? '#0f1117' : 'var(--text2)',
            border: `1px solid ${active ? '#f5bc00' : 'var(--bdr2)'}`, borderRadius: '999px',
            padding: '5px 14px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
          },
        }, label);
      }),
      h('span', { style: { color: 'var(--text3)', fontSize: '12px', margin: '0 2px' } }, '·'),
      h('select', {
        value: oneStore, onChange: e => setOneStore(e.target.value),
        style: { background: 'var(--surf3)', color: 'var(--text)', border: '1px solid var(--bdr2)', borderRadius: '6px', padding: '5px 10px', fontSize: '12px', maxWidth: '220px' },
      }, [
        h('option', { key: '', value: '' }, `All stores in scope (${allRows.filter(r => scope === 'all' || (r.org === 'emerald' ? 'FL' : 'OK') === scope).length})`),
        ...allRows
          .filter(r => scope === 'all' || (r.org === 'emerald' ? 'FL' : 'OK') === scope)
          .map(r => h('option', { key: r.loc, value: r.loc }, r.name)),
      ]),
      span({ style: { color: 'var(--text3)', fontSize: '12px', marginLeft: 'auto' } }, `${rows.length} shown`)),

    // summary tiles
    div({ style: { display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' } },
      [['Stores reporting', summary.n],
       ['Believe done (≥90%)', `${summary.done}/${summary.n}`],
       ['Avg count complete', pct(summary.avg)],
       ['Count window', inWindow ? 'OPEN' : 'not yet']].map(([label, val], i) =>
        div({ key: i, style: { flex: '1 1 160px', background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: '8px', padding: '12px 14px' } },
          div({ style: { fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em' } }, label),
          div({ style: { fontSize: '22px', fontWeight: 700, color: 'var(--text)', marginTop: '4px' } }, String(val))))),

    // "ready for review" notification banner
    readyForReview.length > 0 && div({
      style: {
        display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px',
        padding: '10px 14px', borderRadius: '8px',
        background: 'rgba(74,222,128,.08)', border: '1px solid rgba(74,222,128,.4)',
      },
    },
      span({ style: { fontSize: '18px' } }, '🔔'),
      div(null,
        div({ style: { fontWeight: 700, color: '#4ade80', fontSize: '13px' } },
          `${readyForReview.length} store${readyForReview.length !== 1 ? 's' : ''} ready for review`),
        div({ style: { fontSize: '12px', color: 'var(--text2)', marginTop: '2px' } },
          readyForReview.map(r => r.name).join(', ') + ' — count ≥90%. Set Diagnosis to "In review" to begin.'))),

    loading ? div({ style: { padding: '40px', textAlign: 'center', color: 'var(--text3)' } }, 'Loading…')
      : rows.length === 0 ? div({ style: { padding: '40px', textAlign: 'center', color: 'var(--text3)' } },
          allRows.length === 0
            ? `No EOM data for ${period} yet. Variance / waste / transfers pull daily; On-Hand count progress fills in the last 3 days of the month.`
            : 'No stores match this filter — try All.')
      : h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' } },
        h('thead', null, h('tr', { style: { textAlign: 'left', color: 'var(--text3)', fontSize: '11px', textTransform: 'uppercase' } },
          ['Store', 'Count progress', 'By class', 'Last count', 'FOB %', 'FOB $', 'Diagnosis', 'Communication'].map((c, i) =>
            h('th', { key: i, style: { padding: '8px 10px', borderBottom: '1px solid var(--bdr)', whiteSpace: 'nowrap' } }, c)))),
        h('tbody', null, rows.map(r =>
          h('tr', { key: r.loc, style: { borderBottom: '1px solid var(--bdr)' } },
            h('td', { style: { padding: '8px 10px' } },
              div({ style: { fontWeight: 600, color: 'var(--text)' } }, r.name),
              span({ style: { fontSize: '10px', color: r.org === 'emerald' ? '#38bdf8' : '#f5bc00' } }, r.org === 'emerald' ? 'FL' : 'OK')),
            h('td', { style: { padding: '8px 10px' } }, h(ProgressBar, { value: r.prog.pctCounted })),
            h('td', { style: { padding: '8px 10px' } }, h(ClassChips, { byClass: r.prog.byClass })),
            h('td', { style: { padding: '8px 10px', color: 'var(--text2)', whiteSpace: 'nowrap', fontSize: '12px' } },
              r.prog.lastActivityAt ? new Date(r.prog.lastActivityAt).toLocaleDateString() : '—'),
            h('td', { style: { padding: '8px 10px', fontWeight: 600, color: 'var(--text)' } }, pct2(r.fobPct)),
            h('td', { style: { padding: '8px 10px', color: 'var(--text2)' } }, money(r.fob$)),
            h('td', { style: { padding: '8px 10px' } },
              div({ style: { display: 'flex', gap: '6px', alignItems: 'center' } },
                h('select', {
                  value: r.diagnosis, disabled: saving === r.loc,
                  onChange: e => updateStatus(r.loc, { diagnosisStatus: e.target.value }),
                  style: { background: 'var(--surf3)', color: statusColor(r.diagnosis), border: `1px solid ${statusColor(r.diagnosis)}`, borderRadius: '5px', padding: '3px 6px', fontSize: '12px', fontWeight: 600 },
                }, DIAG_OPTS.map(o => h('option', { key: o, value: o }, DIAG_LABEL[o]))),
                h('button', {
                  title: hasDiagData.has(r.loc) ? 'Run the FOB / food-cost diagnosis' : 'No variance/waste/transfer data pulled for this period yet',
                  onClick: () => openDiag(r.loc, r.name, r.components),
                  disabled: !hasDiagData.has(r.loc) && !(r.components && r.components.sales),
                  style: {
                    background: 'none', border: '1px solid var(--bdr2)', borderRadius: '5px',
                    color: hasDiagData.has(r.loc) ? '#38bdf8' : 'var(--text3)',
                    cursor: hasDiagData.has(r.loc) ? 'pointer' : 'not-allowed', fontSize: '12px', padding: '3px 7px',
                  },
                }, '🔬 Diagnose'))),
            h('td', { style: { padding: '8px 10px' } },
              div({ style: { display: 'flex', gap: '6px', alignItems: 'center' } },
                h('select', {
                  value: r.comms, disabled: saving === r.loc,
                  onChange: e => updateStatus(r.loc, { commsStatus: e.target.value }),
                  style: { background: 'var(--surf3)', color: statusColor(r.comms), border: `1px solid ${statusColor(r.comms)}`, borderRadius: '5px', padding: '3px 6px', fontSize: '12px', fontWeight: 600 },
                }, COMMS_OPTS.map(o => h('option', { key: o, value: o }, COMMS_LABEL[o]))),
                h('button', {
                  title: 'Draft a recount message from the uncounted items',
                  onClick: () => openDraft(r.loc, r.name),
                  style: { background: 'none', border: '1px solid var(--bdr2)', borderRadius: '5px', color: 'var(--text2)', cursor: 'pointer', fontSize: '12px', padding: '3px 7px' },
                }, '✉️ Draft'))))))),

    // comms draft modal
    draft && div({
      onClick: () => setDraft(null),
      style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
    },
      div({
        onClick: e => e.stopPropagation(),
        style: { background: 'var(--surf)', border: '1px solid var(--bdr2)', borderRadius: '10px', width: '100%', maxWidth: '640px', maxHeight: '85vh', overflow: 'auto', padding: '18px' },
      },
        div({ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' } },
          div({ style: { fontWeight: 700, color: 'var(--text)' } }, `✉️ Recount message — ${draft.name}`),
          h('button', { onClick: () => setDraft(null), style: { background: 'none', border: 'none', color: 'var(--text3)', fontSize: '18px', cursor: 'pointer' } }, '✕')),
        div({ style: { fontSize: '12px', color: 'var(--text3)', marginBottom: '6px' } }, 'Subject'),
        div({ style: { fontSize: '13px', color: 'var(--text)', fontWeight: 600, marginBottom: '12px', padding: '8px 10px', background: 'var(--surf3)', borderRadius: '6px', border: '1px solid var(--bdr)' } }, draft.subject),
        div({ style: { fontSize: '12px', color: 'var(--text3)', marginBottom: '6px' } }, 'Message'),
        h('textarea', {
          readOnly: true, value: draft.body,
          style: { width: '100%', minHeight: '240px', background: 'var(--surf3)', color: 'var(--text)', border: '1px solid var(--bdr)', borderRadius: '6px', padding: '10px', fontSize: '12.5px', fontFamily: 'inherit', lineHeight: 1.5, resize: 'vertical' },
        }),
        div({ style: { display: 'flex', gap: '10px', marginTop: '12px', alignItems: 'center' } },
          h('button', {
            onClick: copyDraft,
            style: { background: '#f5bc00', color: '#1a1400', border: 'none', borderRadius: '6px', padding: '8px 14px', fontWeight: 700, cursor: 'pointer', fontSize: '13px' },
          }, copied ? '✓ Copied' : 'Copy message'),
          h('button', {
            onClick: () => { updateStatus(draft.loc, { commsStatus: 'sent', commsSentAt: new Date().toISOString() }); setDraft(null); },
            style: { background: 'none', color: '#4ade80', border: '1px solid #4ade80', borderRadius: '6px', padding: '8px 14px', fontWeight: 600, cursor: 'pointer', fontSize: '13px' },
          }, 'Mark as sent'),
          !draft.hasGaps && span({ style: { fontSize: '12px', color: '#4ade80' } }, 'No gaps — count looks complete.')))),

    // diagnosis modal — the detailed report + action items (owner downloads/attaches to email)
    diag && div({
      onClick: () => setDiag(null),
      style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
    },
      div({
        onClick: e => e.stopPropagation(),
        style: { background: 'var(--surf)', border: '1px solid var(--bdr2)', borderRadius: '10px', width: '100%', maxWidth: '720px', maxHeight: '85vh', overflow: 'auto', padding: '18px' },
      },
        div({ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' } },
          div({ style: { fontWeight: 700, color: 'var(--text)' } }, `🔬 Food-Cost Diagnosis — ${diag.name}`),
          h('button', { onClick: () => setDiag(null), style: { background: 'none', border: 'none', color: 'var(--text3)', fontSize: '18px', cursor: 'pointer' } }, '✕')),
        div({ style: { fontSize: '12px', color: 'var(--text3)', marginBottom: '10px' } }, diag.result.summary),

        // action items (medium+ severity) up top
        diag.result.actionItems.length > 0 && div({ style: { marginBottom: '12px' } },
          div({ style: { fontSize: '12px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '6px' } }, 'Action items'),
          div({ style: { display: 'flex', flexDirection: 'column', gap: '5px' } },
            diag.result.actionItems.map((a, i) =>
              div({ key: i, style: { fontSize: '12.5px', color: 'var(--text)', padding: '6px 9px', background: 'var(--surf3)', borderRadius: '6px', borderLeft: `3px solid ${a.startsWith('[CRITICAL') ? '#f87171' : a.startsWith('[HIGH') ? '#f5bc00' : '#38bdf8'}` } }, a)))),

        // full report text
        div({ style: { fontSize: '12px', color: 'var(--text3)', marginBottom: '6px' } }, 'Full report'),
        h('textarea', {
          readOnly: true, value: diag.report,
          style: { width: '100%', minHeight: '260px', background: 'var(--surf3)', color: 'var(--text)', border: '1px solid var(--bdr)', borderRadius: '6px', padding: '10px', fontSize: '12px', fontFamily: 'ui-monospace, monospace', lineHeight: 1.5, resize: 'vertical' },
        }),

        // pending checks (awaiting a data pull for this period)
        diag.result.pending.length > 0 && div({ style: { marginTop: '10px', fontSize: '11px', color: 'var(--text3)' } },
          'Awaiting data: ' + diag.result.pending.map(p => p.label).join(' · ')),

        div({ style: { display: 'flex', gap: '10px', marginTop: '12px', alignItems: 'center' } },
          h('button', {
            onClick: copyDiag,
            style: { background: '#f5bc00', color: '#1a1400', border: 'none', borderRadius: '6px', padding: '8px 14px', fontWeight: 700, cursor: 'pointer', fontSize: '13px' },
          }, diagCopied ? '✓ Copied' : 'Copy report'),
          h('button', {
            onClick: () => printDiagnosis(diag.name, period, diag.report),
            style: { background: 'none', color: 'var(--text2)', border: '1px solid var(--bdr2)', borderRadius: '6px', padding: '8px 14px', fontWeight: 600, cursor: 'pointer', fontSize: '13px' },
          }, '🖨 Print / PDF'),
          h('button', {
            onClick: () => { updateStatus(diag.loc, { diagnosisStatus: 'diagnosed' }); setDiag(null); },
            style: { background: 'none', color: '#38bdf8', border: '1px solid #38bdf8', borderRadius: '6px', padding: '8px 14px', fontWeight: 600, cursor: 'pointer', fontSize: '13px' },
          }, 'Mark diagnosed')))),

    div({ style: { marginTop: '14px', fontSize: '11px', color: 'var(--text3)' } },
      'Count progress is inferred from each item\'s last-counted / last-submitted date landing inside the count window. ',
      'FOB % is dollar-weighted MTD (Σ components ÷ Σ product sales). 🔬 Diagnose runs the food-cost decision tree ',
      '(top-5 variance, ±$50, incomplete count, waste patterns, transfers) on the cloud-pulled streams. ',
      'Diagnosis & Communication status save to the cloud.'));
}
