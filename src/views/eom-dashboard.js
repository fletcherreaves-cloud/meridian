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
  loadEomDiagConfig, saveEomDiagConfig,
} from '../lib/supabase.js';
import {
  computeCountProgress, periodKey, daysInPeriod, countWindowStart, BELIEVES_DONE_PCT,
  buildIncompleteCountMessage,
} from '../engine/eom-inventory.js';
import { runDiagnosis, formatDiagnosisReport, applyChecksConfig, checksConfig } from '../engine/eom-diagnosis.js';
import { buildItemJourney, buildStoreJourneys, LANE_META } from '../engine/eom-item-journey.js';

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
// Two modes (Notes 29 owner idea): 'eom' = count-completion tracking (only
// meaningful in the last-3-day window); 'progress' = year-round view emphasizing
// last-count freshness + FOB/diagnosis results. Default: EOM only when we're
// actually in the current month's count window, else Progress.
function defaultModeFor(period) {
  const now = new Date();
  const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (period !== cur) return 'progress';
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  // In the count window default to the Scoreboard checklist (the owner's EOM triage view);
  // the detailed EOM Count table is one click away.
  return now.getDate() >= lastDay - 2 ? 'scoreboard' : 'progress';
}
const daysAgo = (dt) => {
  if (!dt) return null;
  const t = typeof dt === 'number' ? dt : Date.parse(dt);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
};

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

const VERDICT_TONE = { good: '#4ade80', warn: '#f5bc00', bad: '#f87171', neutral: 'var(--text3)' };
const jMoney = (n) => `$${Math.round(Math.abs(n || 0)).toLocaleString()}`;

// One item's count-cycle "journey": verdict banner → flow summary → verified
// timeline → signals (facts vs clearly-labeled inferences). The visual guide that
// lets a GM see the path of an item and where it went wrong, backed only by ledger
// facts we can point to.
function ItemJourneyView({ journey: j }) {
  const [laneFilter, setLaneFilter] = useState(null); // click a flow chip to drill into that lane's events
  if (!j) return null;
  const inWindow = (when) => j.windowStart != null && when != null && when >= j.windowStart;
  const flowChips = [['received', j.totals.received], ['used', j.totals.used], ['waste', j.totals.waste], ['transfer', j.totals.transfer]]
    .filter(([, q]) => q > 0.0001);
  const shownEvents = laneFilter ? j.events.filter(e => e.lane === laneFilter) : j.events;
  const toggleLane = (lane) => setLaneFilter(f => f === lane ? null : lane);
  return div({ style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
    // verdict banner
    div({ style: { padding: '10px 12px', borderRadius: '8px', background: 'var(--surf2)', borderLeft: `4px solid ${VERDICT_TONE[j.verdict.tone]}` } },
      div({ style: { fontWeight: 700, color: 'var(--text)', fontSize: '13.5px' } }, j.descr || j.wrin),
      div({ style: { fontSize: '11px', color: 'var(--text3)', margin: '1px 0 5px' } },
        [j.wrin && `WRIN ${j.wrin}`, j.itemClass, j.uom].filter(Boolean).join('  ·  ')),
      div({ style: { fontSize: '13px', color: VERDICT_TONE[j.verdict.tone], fontWeight: 600 } }, j.verdict.text)),

    // Variance Stat report reconciliation (Note 30 A3) — the authoritative figure,
    // shown alongside a tie-out check against the count-cycle timeline total.
    (j.reportDollars != null || j.reportUnits != null) && (() => {
      const rd = j.reportDollars, ru = j.reportUnits, jd = j.netCountDollars;
      const diff = (rd != null && jd != null) ? Math.abs(rd - jd) : null;
      const ties = diff != null && diff < 1;
      return div({ style: { padding: '8px 12px', borderRadius: '8px', background: 'var(--surf3)', border: '1px solid var(--bdr)' } },
        div({ style: { display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' } },
          span({ style: { fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 700 } }, 'Variance Stat report'),
          rd != null && span({ style: { fontSize: '14px', fontWeight: 800, color: rd < 0 ? '#f87171' : '#4ade80' } }, `${rd < 0 ? '-' : '+'}${jMoney(rd)}`),
          ru != null && Math.abs(ru) >= 0.5 && span({ style: { fontSize: '12px', color: 'var(--text2)' } }, `${ru > 0 ? '+' : ''}${Math.round(ru).toLocaleString()}${j.uom ? ` ${j.uom}` : ' units'}`)),
        diff != null && div({ style: { fontSize: '11px', marginTop: '3px', color: ties ? '#4ade80' : '#f5bc00' } },
          ties ? '✓ Timeline reconciles exactly to the report.'
            : `⚠ Timeline count total is ${jd < 0 ? '-' : '+'}${jMoney(jd)} — differs by ${jMoney(diff)}; the raw-item ledger may not cover every count for this item.`));
    })(),

    // flow summary — clickable chips drill the timeline into that lane's events
    flowChips.length > 0 && div({ style: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' } },
      flowChips.map(([lane, q]) => {
        const active = laneFilter === lane;
        return h('button', {
          key: lane, title: `${LANE_META[lane].hint} — click to see these events`, onClick: () => toggleLane(lane),
          style: { fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '5px', cursor: 'pointer', border: `1px solid ${LANE_META[lane].color}`, color: active ? '#0f1117' : LANE_META[lane].color, background: active ? LANE_META[lane].color : 'var(--surf3)' },
        }, `${LANE_META[lane].label}: ${Math.round(q).toLocaleString()}`);
      }),
      laneFilter && h('button', { onClick: () => setLaneFilter(null), style: { fontSize: '11px', color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' } }, 'clear')),

    // timeline — every ledger event, chronological, count window shaded
    (() => {
      const qtyLabel = 'Qty' + (j.uom ? ` (${j.uom})` : '');
      const hcell = (t, w, right) => span({ style: { fontSize: '9.5px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.03em', fontWeight: 700, minWidth: w, flex: w == null ? 1 : undefined, textAlign: right ? 'right' : 'left' } }, t);
      const fmtQty = (n) => `${n > 0 ? '+' : ''}${Math.round(n).toLocaleString()}`;
      return div(null,
        div({ style: { fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '6px' } },
          laneFilter ? `${LANE_META[laneFilter].label} events` : 'Count-cycle timeline',
          laneFilter && span({ style: { textTransform: 'none', letterSpacing: 0, marginLeft: '6px', color: 'var(--text3)' } }, `(${shownEvents.length})`),
          !laneFilter && j.netCountUnits != null && Math.abs(j.netCountUnits) >= 0.5 && span({ style: { textTransform: 'none', letterSpacing: 0, marginLeft: '8px', color: j.netCountUnits < 0 ? '#f87171' : '#4ade80', fontWeight: 700 } },
            `net count variance ${fmtQty(j.netCountUnits)}${j.uom ? ` ${j.uom}` : ' units'}`)),
        shownEvents.length === 0
          ? div({ style: { fontSize: '12px', color: 'var(--text3)' } }, laneFilter ? `No ${LANE_META[laneFilter].label.toLowerCase()} events for this item.` : 'No ledger movement recorded for this item this period.')
          : div(null,
            // column headers
            div({ style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '2px 8px 4px', borderBottom: '1px solid var(--bdr)' } },
              span({ style: { width: '9px', flexShrink: 0 } }), hcell('Date', '82px'), hcell('Type', '68px'), hcell('Detail', null), hcell(qtyLabel, '70px', true), hcell('$ variance', '62px', true)),
            div({ style: { display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' } },
              shownEvents.map((e, i) => {
                const m = LANE_META[e.lane];
                const win = inWindow(e.when);
                const qtyVal = e.isCount ? e.unitVar : e.qty; // count rows show the counted unit variance
                return div({ key: i, style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 8px', borderRadius: '6px', background: e.isCount ? 'var(--surf2)' : 'transparent', border: e.isCount ? `1px solid ${m.color}55` : '1px solid transparent' } },
                  span({ style: { width: '9px', height: '9px', borderRadius: e.isCount ? '2px' : '50%', background: m.color, flexShrink: 0, transform: e.isCount ? 'rotate(45deg)' : 'none' } }),
                  span({ style: { fontSize: '11.5px', color: 'var(--text3)', minWidth: '82px', fontVariantNumeric: 'tabular-nums' } },
                    e.dt || '—', win && span({ style: { color: '#f5bc00', marginLeft: '4px' }, title: 'inside the count window' }, '●')),
                  span({ style: { fontSize: '12px', color: 'var(--text2)', minWidth: '68px', fontWeight: e.isCount ? 700 : 500 } }, m.label),
                  span({ style: { fontSize: '12px', color: 'var(--text)', flex: 1 } },
                    e.isCount ? `count${e.manager ? ` · ${e.manager}` : ''}` : (e.invoice || '')),
                  span({ style: { fontSize: '12px', minWidth: '70px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: e.isCount ? 700 : 500, color: qtyVal == null ? 'var(--text3)' : e.isCount ? (qtyVal < 0 ? '#f87171' : '#4ade80') : 'var(--text2)' } },
                    qtyVal == null ? '—' : fmtQty(qtyVal)),
                  span({ style: { fontSize: '12px', fontWeight: 700, minWidth: '62px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: (e.isCount && e.dollars != null && Math.abs(e.dollars) >= 1) ? (e.dollars < 0 ? '#f87171' : '#4ade80') : 'var(--text3)' } },
                    (e.isCount && e.dollars != null && Math.abs(e.dollars) >= 1) ? `${e.dollars < 0 ? '-' : '+'}${jMoney(e.dollars)}` : '—'));
              }))));
    })(),

    // signals — facts first (verified), then inferences (clearly labeled)
    j.signals.length > 0 && div(null,
      div({ style: { fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '6px' } }, 'What the data shows'),
      div({ style: { display: 'flex', flexDirection: 'column', gap: '5px' } },
        j.signals.map((s, i) => div({
          key: i,
          style: { fontSize: '12.5px', color: 'var(--text)', padding: '6px 9px', borderRadius: '6px', background: 'var(--surf3)', borderLeft: `3px solid ${s.kind === 'fact' ? '#4ade80' : '#38bdf8'}` },
        },
          span({ style: { fontWeight: 700, color: s.kind === 'fact' ? '#4ade80' : '#38bdf8', marginRight: '6px' } },
            s.kind === 'fact' ? '✓ Verified' : '💡 Likely — check'),
          s.text)))),
    div({ style: { fontSize: '10.5px', color: 'var(--text3)', fontStyle: 'italic' } },
      '✓ Verified = read directly from the item ledger.  💡 Likely = a data-backed read to confirm on-site.'));
}

// The 6 controllable FOB components (keys match fobByStore output).
const FOB_COMPONENTS = [
  ['comp', 'Comp Waste'], ['raw', 'Raw Waste'], ['cond', 'Condiments'],
  ['emp', 'Emp/Mgr'], ['statv', 'Stat Var'], ['unex', 'Unexplained'],
];

// FOB multi-location variance matrix (feature seed-fob-p): side-by-side component
// breakdown across stores, so the owner can see WHERE food-cost overruns originate.
// District comparison is dollar-weighted (Σ$ ÷ Σsales — never average averages).
// Outlier = a store's component runs >1.5× the district rate (and is material);
// each store's single biggest component is flagged ▸ as its primary driver.
function FobVarianceMatrix({ rows, showDollars, sortKey, onSort }) {
  const withFob = rows.filter(r => r.components && r.components.sales > 0);
  const tot = { sales: 0, fob: 0 }; FOB_COMPONENTS.forEach(([k]) => tot[k] = 0);
  withFob.forEach(r => { const c = r.components; tot.sales += c.sales; tot.fob += c.fob || 0; FOB_COMPONENTS.forEach(([k]) => tot[k] += c[k] || 0); });
  const distPct = k => tot.sales ? tot[k] / tot.sales : 0;
  const ratePct = (c, k) => (c[k] || 0) / (c.sales || 1);
  const isOutlier = (c, k) => { const p = ratePct(c, k); return p > distPct(k) * 1.5 && p > 0.001; };
  const driverOf = c => FOB_COMPONENTS.map(([k]) => [k, ratePct(c, k)]).sort((a, b) => b[1] - a[1])[0][0];
  const cell = (c, k) => showDollars ? money(c[k] || 0) : pct2(ratePct(c, k));

  const sorted = withFob.slice().sort((a, b) => {
    if (sortKey === 'name') return a.name.localeCompare(b.name);
    if (sortKey === 'fob') return (b.components.fobPct || 0) - (a.components.fobPct || 0);
    return ratePct(b.components, sortKey) - ratePct(a.components, sortKey);
  });
  if (withFob.length === 0) return div({ style: { padding: '20px', textAlign: 'center', color: 'var(--text3)', fontSize: '13px' } }, 'No FOB data for the stores in this filter yet.');

  const th = (key, label, tip) => h('th', {
    key, title: tip || `Sort by ${label}`, onClick: () => onSort(key),
    style: { padding: '7px 8px', borderBottom: '1px solid var(--bdr)', whiteSpace: 'nowrap', cursor: 'pointer', textAlign: key === 'name' ? 'left' : 'right', color: sortKey === key ? '#f5bc00' : 'var(--text3)' },
  }, label + (sortKey === key ? ' ▾' : ''));

  return div(null,
    h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' } },
      h('thead', null, h('tr', { style: { fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '.03em' } },
        th('name', 'Store'), th('fob', 'FOB %', 'Σ components ÷ sales'),
        ...FOB_COMPONENTS.map(([k, label]) => th(k, label)))),
      h('tbody', null,
        sorted.map(r => {
          const c = r.components;
          const drv = driverOf(c);
          return h('tr', { key: r.loc, style: { borderBottom: '1px solid var(--bdr)' } },
            h('td', { style: { padding: '6px 8px', color: 'var(--text)', fontWeight: 600, whiteSpace: 'nowrap' } },
              r.name, span({ style: { fontSize: '9px', color: r.org === 'emerald' ? '#38bdf8' : '#f5bc00', marginLeft: '5px' } }, r.org === 'emerald' ? 'FL' : 'OK')),
            h('td', { style: { padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' } }, pct2(c.fobPct)),
            ...FOB_COMPONENTS.map(([k]) => {
              const out = isOutlier(c, k);
              return h('td', {
                key: k,
                title: out ? `${(ratePct(c, k) * 100).toFixed(2)}% vs district ${(distPct(k) * 100).toFixed(2)}% — running hot` : '',
                style: {
                  padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                  color: out ? '#f87171' : 'var(--text2)', fontWeight: out ? 700 : 400,
                  background: out ? 'rgba(248,113,113,.08)' : 'transparent',
                },
              }, k === drv && span({ title: 'biggest component for this store', style: { color: '#f5bc00', marginRight: '3px' } }, '▸'), cell(c, k));
            }));
        }),
        // district dollar-weighted average row
        h('tr', { style: { borderTop: '2px solid var(--bdr2)', background: 'var(--surf2)' } },
          h('td', { style: { padding: '7px 8px', color: 'var(--text)', fontWeight: 700 } }, `District (${withFob.length})`),
          h('td', { style: { padding: '7px 8px', textAlign: 'right', fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' } }, pct2(tot.sales ? tot.fob / tot.sales : null)),
          ...FOB_COMPONENTS.map(([k]) => h('td', { key: k, style: { padding: '7px 8px', textAlign: 'right', fontWeight: 700, color: 'var(--text3)', fontVariantNumeric: 'tabular-nums' } },
            showDollars ? money(tot[k]) : pct2(distPct(k))))))),
    div({ style: { fontSize: '10.5px', color: 'var(--text3)', fontStyle: 'italic', marginTop: '8px' } },
      '▸ = store’s largest component.  Red = running >1.5× the district rate (dollar-weighted).  Click a column to sort.'));
}

// ── Scoreboard status model — a store advances left→right as the owner works it ──
// bucket from the auto count % (believesDone ≥90%) + the human check-offs (diagnosis /
// comms). Priority is right-most-wins so a reviewed+comms store reads as "comms sent".
const SB_PILL = {
  notstarted: { t: 'Not started',     c: 'var(--text3)', bg: 'var(--surf3)' },
  counting:   { t: 'Counting',        c: '#38bdf8',      bg: 'rgba(56,189,248,.12)' },
  ready:      { t: 'Ready to review', c: '#f5bc00',      bg: 'rgba(245,188,0,.16)' },
  reviewed:   { t: 'Reviewed',        c: '#4ade80',      bg: 'rgba(74,222,128,.12)' },
  comms:      { t: 'Comms sent',      c: '#a78bfa',      bg: 'rgba(167,139,250,.14)' },
};
const SB_ORDER = { ready: 0, counting: 1, notstarted: 2, reviewed: 3, comms: 4 };
function sbBucket(r) {
  if ((r.comms || 'none') !== 'none') return 'comms';
  if ((r.diagnosis || 'pending') !== 'pending') return 'reviewed';
  if (r.prog.believesDone) return 'ready';
  if ((r.prog.pctCounted || 0) > 0.01) return 'counting';
  return 'notstarted';
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
  const [journeys, setJourneys] = useState(null); // { loc, name, list, selectedWrin } item-journey modal
  const [fobOpen, setFobOpen] = useState(false); // FOB multi-location variance matrix modal
  const [fobDollars, setFobDollars] = useState(false); // matrix: show $ vs % of sales
  const [fobSort, setFobSort] = useState('fob'); // matrix sort column
  const [scope, setScope] = useState('all'); // 'all' | 'FL' | 'OK' — state filter
  const [oneStore, setOneStore] = useState(''); // '' = all stores in scope, else a single loc
  const [mode, setMode] = useState(() => defaultModeFor(periods[0])); // 'eom' | 'progress'
  // Re-default the mode when the period changes (manual toggle still overrides after).
  useEffect(() => { setMode(defaultModeFor(period)); }, [period]);
  const [diagCfg, setDiagCfg] = useState(null); // saved check overrides (or null = defaults)
  const [flowOpen, setFlowOpen] = useState(false); // flow-editor modal
  const [flowDraft, setFlowDraft] = useState([]); // editable copy while the modal is open
  const [flowSaving, setFlowSaving] = useState(false);

  // Load the editable diagnosis-flow config once on mount.
  useEffect(() => { loadEomDiagConfig().then(c => { if (c) setDiagCfg(c); }).catch(() => {}); }, []);
  // The active check registry (defaults + saved overrides), passed to runDiagnosis.
  const activeChecks = useMemo(() => applyChecksConfig(diagCfg || []), [diagCfg]);

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

  // Freshest business date across the EOM streams feeding this view (As-of stamp).
  const dataAsOf = useMemo(() => {
    const ms = [];
    const push = (v) => { if (!v) return; const t = v instanceof Date ? v.getTime() : Date.parse(v); if (!Number.isNaN(t)) ms.push(t); };
    (onHand || []).forEach(r => { push(r.lastCounted); push(r.lastSubmitted); });
    (waste || []).forEach(r => push(r.dt));
    (transfers || []).forEach(r => push(r.dt));
    (fobRows || []).forEach(r => push(r.date));
    const now = Date.now();
    const valid = ms.filter(t => t <= now);
    return valid.length ? new Date(Math.max(...valid)) : null;
  }, [onHand, waste, transfers, fobRows]);

  // Apply the location filter (state pills + optional single-store).
  const rows = useMemo(() => {
    const stateOf = (org) => org === 'emerald' ? 'FL' : 'OK';
    return allRows.filter(r =>
      (scope === 'all' || stateOf(r.org) === scope) &&
      (!oneStore || r.loc === oneStore));
  }, [allRows, scope, oneStore]);

  const openDraft = useCallback((loc, name, components) => {
    // Run the same diagnosis the 🔬 button uses, so the draft carries a real
    // "what to fix" action plan — not just the recount nudge (which is empty
    // off the count window). Freshest-wins cloud streams feed both.
    let actionItems = [], diagSummary = '', diagDollars = 0;
    if (hasDiagData.has(loc) || (components && components.sales)) {
      try {
        const dg = runDiagnosis({
          store: loc, storeName: name, period, asOf: new Date(), checks: activeChecks,
          data: {
            fob: components && components.sales ? {
              sales: components.sales, compWaste: components.comp, rawWaste: components.raw,
              condiments: components.cond, empMgrMeals: components.emp,
              statVariance: components.statv, unexplained: components.unex,
            } : null,
            variance: varByLoc[loc] || [],
            waste: wasteByLoc[loc] || [],
            transfers: xferByLoc[loc] || [],
            rawItems: rawByLoc[loc] || [],
          },
        });
        actionItems = dg.actionItems; diagSummary = dg.summary; diagDollars = dg.totalDollars;
      } catch { /* diagnosis is best-effort; fall back to the recount nudge */ }
    }
    const msg = buildIncompleteCountMessage(name, byLoc[loc] || [], {
      period, asOf: new Date(), actionItems, diagSummary, diagDollars,
    });
    setCopied(false);
    setDraft({ loc, name, subject: msg.subject, body: msg.body, hasGaps: msg.hasGaps, hasPlan: msg.hasPlan });
  }, [byLoc, varByLoc, wasteByLoc, xferByLoc, rawByLoc, hasDiagData, activeChecks, period]);

  const copyDraft = useCallback(async () => {
    if (!draft) return;
    const text = `${draft.subject}\n\n${draft.body}`;
    try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); }
  }, [draft]);

  // Run the full diagnosis engine for one store from the cloud streams.
  const openDiag = useCallback((loc, name, components) => {
    const c = components || {};
    const result = runDiagnosis({
      store: loc, storeName: name, period, asOf: new Date(), checks: activeChecks,
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
  }, [period, byLoc, varByLoc, wasteByLoc, xferByLoc, rawByLoc, activeChecks]);

  // Open the visual Item Journeys for a store (worst-net-variance first).
  // Enrich each with the authoritative Variance Stat report figure for the same
  // WRIN+period so the journey can be reconciled EXACT to the report (Note 30 A3).
  const openJourneys = useCallback((loc, name) => {
    const list = buildStoreJourneys(rawByLoc[loc] || [], { period, asOf: new Date() });
    const vmap = {}; (varByLoc[loc] || []).forEach(v => { vmap[String(v.wrin)] = v; });
    const enriched = list.map(j => {
      const v = vmap[String(j.wrin)];
      return v ? { ...j, reportDollars: v.dolDiff, reportUnits: v.unitVar } : j;
    });
    setJourneys({ loc, name, list: enriched, selectedWrin: enriched[0]?.wrin || null });
  }, [rawByLoc, varByLoc, period]);

  // ── Flow editor ──
  const openFlow = useCallback(() => {
    setFlowDraft(checksConfig(activeChecks));
    setFlowOpen(true);
  }, [activeChecks]);
  const flowSet = useCallback((id, patch) => {
    setFlowDraft(d => d.map(c => c.id === id ? { ...c, ...patch, params: { ...c.params, ...(patch.params || {}) } } : c));
  }, []);
  const flowMove = useCallback((id, dir) => {
    setFlowDraft(d => {
      const arr = d.slice().sort((a, b) => a.order - b.order);
      const i = arr.findIndex(c => c.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= arr.length) return d;
      const oi = arr[i].order, oj = arr[j].order;
      arr[i] = { ...arr[i], order: oj }; arr[j] = { ...arr[j], order: oi };
      return arr;
    });
  }, []);
  const flowSave = useCallback(async () => {
    setFlowSaving(true);
    const cfg = flowDraft.map(c => ({ id: c.id, order: c.order, enabled: c.enabled, params: c.params }));
    setDiagCfg(cfg);
    try { await saveEomDiagConfig(cfg); } finally { setFlowSaving(false); setFlowOpen(false); }
  }, [flowDraft]);
  const flowReset = useCallback(async () => {
    setDiagCfg(null); setFlowOpen(false);
    try { await saveEomDiagConfig([]); } catch {}
  }, []);

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

  // Freshness: latest eom_count_status import time (updated_at) = when the count pull last wrote.
  const eomImportedAt = useMemo(() => {
    let m = 0;
    for (const loc in statusMap) { const u = statusMap[loc] && statusMap[loc].updatedAt; if (u) { const t = new Date(u).getTime(); if (t > m) m = t; } }
    return m ? new Date(m) : null;
  }, [statusMap]);

  // Scoreboard buckets — a store moves left→right as you work it (owner EOM checklist).
  const scoreboard = useMemo(() => {
    const tally = { notstarted: 0, counting: 0, ready: 0, reviewed: 0, comms: 0 };
    for (const r of rows) tally[sbBucket(r)]++;
    const sorted = [...rows].sort((a, b) =>
      (SB_ORDER[sbBucket(a)] - SB_ORDER[sbBucket(b)]) || (a.prog.pctCounted - b.prog.pctCounted) || a.name.localeCompare(b.name));
    return { tally, sorted };
  }, [rows]);

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
          mode === 'eom'
            ? `Count-completion mode · count window is the last 3 days (from the ${countWindowStart(period).getDate()})`
            : 'Year-round progress mode · last-count freshness + FOB / diagnosis results (count % fills in during the last 3 days)',
          dataAsOf && span({ style: { marginLeft: '8px', color: 'var(--text2)' }, title: 'Freshest business date across the loaded EOM streams (on-hand, FOB, waste, transfers)' },
            `· data as of ${dataAsOf.toLocaleDateString()}`))),
      div({ style: { display: 'flex', gap: '10px', alignItems: 'center' } },
        // mode toggle — EOM count-completion vs year-round progress
        div({ style: { display: 'flex', border: '1px solid var(--bdr2)', borderRadius: '6px', overflow: 'hidden' } },
          [['scoreboard', 'Scoreboard'], ['eom', 'EOM Count'], ['progress', 'Year-Round']].map(([k, label]) =>
            h('button', {
              key: k, onClick: () => setMode(k),
              title: k === 'scoreboard' ? 'Completion checklist — who is ready for your review, who is still counting, what you\'ve cleared' : k === 'eom' ? 'Count-completion tracking (meaningful in the last-3-day window)' : 'Year-round: last-count freshness + FOB/diagnosis results',
              style: {
                background: mode === k ? '#f5bc00' : 'var(--surf3)', color: mode === k ? '#0f1117' : 'var(--text2)',
                border: 'none', padding: '6px 11px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
              },
            }, label))),
        h('select', {
          value: period, onChange: e => setPeriod(e.target.value),
          style: { background: 'var(--surf3)', color: 'var(--text)', border: '1px solid var(--bdr2)', borderRadius: '6px', padding: '6px 10px', fontSize: '13px' },
        }, periods.map(p => h('option', { key: p, value: p }, p))),
        h('button', {
          onClick: () => setFobOpen(true), title: 'Side-by-side FOB component breakdown across stores — spot where overruns originate',
          disabled: rows.length === 0,
          style: { background: 'var(--surf3)', color: 'var(--text2)', border: '1px solid var(--bdr2)', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', fontWeight: 600, cursor: rows.length ? 'pointer' : 'not-allowed' },
        }, '📊 FOB breakdown'),
        h('button', {
          onClick: exportCSV, title: 'Download the all-stores table as CSV',
          disabled: rows.length === 0,
          style: { background: 'var(--surf3)', color: 'var(--text2)', border: '1px solid var(--bdr2)', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', fontWeight: 600, cursor: rows.length ? 'pointer' : 'not-allowed' },
        }, '⬇ CSV'),
        h('button', {
          onClick: openFlow, title: 'Edit the diagnosis flow — reorder/toggle checks and tune thresholds',
          style: { background: 'var(--surf3)', color: 'var(--text2)', border: `1px solid ${diagCfg ? '#f5bc00' : 'var(--bdr2)'}`, borderRadius: '6px', padding: '6px 10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' },
        }, diagCfg ? '⚙ Flow *' : '⚙ Flow'),
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
      : mode === 'scoreboard' ? div(null,
          // freshness — when the count data was last imported (on-hand pull writes eom_count_status)
          div({ style: { fontSize: '11px', color: 'var(--text3)', marginBottom: '8px' } },
            eomImportedAt
              ? `Count data imported ${eomImportedAt.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · On-Hand pull runs ~8a/10a/2p CT`
              : 'Count data populates in the last 3 days of the month (On-Hand pull ~8a/10a/2p CT).'),
          // tally band
          div({ style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' } },
            [['notstarted', 'Not started'], ['counting', 'Counting'], ['ready', 'Ready for you'], ['reviewed', 'Reviewed'], ['comms', 'Comms sent']].map(([k, label]) => {
              const p = SB_PILL[k];
              return div({ key: k, style: { flex: '1 1 120px', border: '1px solid var(--bdr)', borderLeft: `3px solid ${p.c}`, borderRadius: '8px', padding: '8px 10px', background: 'var(--surf2)' } },
                div({ style: { fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em' } }, label),
                div({ style: { fontSize: '22px', fontWeight: 700, color: 'var(--text)' } }, String(scoreboard.tally[k])));
            })),
          // per-store checklist rows (ready-for-you first)
          div({ style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
            scoreboard.sorted.map(r => {
              const p = SB_PILL[sbBucket(r)];
              const reviewed = (r.diagnosis || 'pending') !== 'pending';
              const commsSent = (r.comms || 'none') !== 'none';
              const chk = (on, label, onClick) => h('button', {
                onClick, disabled: saving === r.loc,
                style: { background: on ? 'rgba(74,222,128,.14)' : 'var(--surf3)', color: on ? '#4ade80' : 'var(--text2)', border: '1px solid var(--bdr2)', borderRadius: '6px', padding: '4px 9px', fontSize: '11px', fontWeight: 600, cursor: saving === r.loc ? 'wait' : 'pointer', whiteSpace: 'nowrap' },
              }, (on ? '☑ ' : '☐ ') + label);
              return div({ key: r.loc, style: { display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px', border: '1px solid var(--bdr)', borderLeft: `3px solid ${p.c}`, borderRadius: '8px', background: 'var(--surf2)', flexWrap: 'wrap' } },
                div({ style: { flex: '1 1 150px', minWidth: '150px' } },
                  span({ style: { fontWeight: 700, color: 'var(--text)' } }, r.name),
                  span({ style: { fontSize: '10px', color: r.org === 'emerald' ? '#38bdf8' : '#f5bc00', marginLeft: '6px' } }, r.org === 'emerald' ? 'FL' : 'OK'),
                  r.prog.lastActivityAt ? span({ style: { fontSize: '10px', color: 'var(--text3)', marginLeft: '8px' } }, 'last count ' + new Date(r.prog.lastActivityAt).toLocaleDateString()) : null),
                div({ style: { flex: '1 1 160px', minWidth: '140px' } }, h(ProgressBar, { value: r.prog.pctCounted })),
                span({ style: { fontSize: '11px', fontWeight: 700, color: p.c, background: p.bg, borderRadius: '12px', padding: '3px 10px', whiteSpace: 'nowrap' } }, p.t),
                div({ style: { display: 'flex', gap: '6px' } },
                  chk(reviewed, 'Reviewed', () => updateStatus(r.loc, { diagnosisStatus: reviewed ? 'pending' : 'reviewed' })),
                  chk(commsSent, 'Comms', () => updateStatus(r.loc, { commsStatus: commsSent ? 'none' : 'sent' }))));
            })))
      : h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' } },
        h('thead', null, h('tr', { style: { textAlign: 'left', color: 'var(--text3)', fontSize: '11px', textTransform: 'uppercase' } },
          [['Store'], ['Count progress'], ['By class'], ['Last count'],
           ['FOB %', 'Food-Over-Base as a % of product sales, MTD, dollar-weighted (Σ FOB $ ÷ Σ product sales)'],
           ['FOB $', 'Total Food-Over-Base dollars for the period MTD — the sum of the 6 controllable components: completed waste + raw waste + condiments + emp/mgr meals + stat variance + unexplained'],
           ['Diagnosis'], ['Communication']].map(([c, tip], i) =>
            h('th', { key: i, title: tip || '', style: { padding: '8px 10px', borderBottom: '1px solid var(--bdr)', whiteSpace: 'nowrap', cursor: tip ? 'help' : 'default' } }, c)))),
        h('tbody', null, rows.map(r =>
          h('tr', { key: r.loc, style: { borderBottom: '1px solid var(--bdr)' } },
            h('td', { style: { padding: '8px 10px' } },
              div({ style: { fontWeight: 600, color: 'var(--text)' } }, r.name),
              span({ style: { fontSize: '10px', color: r.org === 'emerald' ? '#38bdf8' : '#f5bc00' } }, r.org === 'emerald' ? 'FL' : 'OK')),
            h('td', { style: { padding: '8px 10px' } }, h(ProgressBar, { value: r.prog.pctCounted })),
            h('td', { style: { padding: '8px 10px' } }, h(ClassChips, { byClass: r.prog.byClass })),
            h('td', { style: { padding: '8px 10px', color: 'var(--text2)', whiteSpace: 'nowrap', fontSize: '12px' } },
              r.prog.lastActivityAt ? new Date(r.prog.lastActivityAt).toLocaleDateString() : '—',
              mode === 'progress' && r.prog.lastActivityAt && (() => {
                const a = daysAgo(r.prog.lastActivityAt);
                return a == null ? null : span({ style: { fontSize: '10px', color: a > 40 ? '#f87171' : 'var(--text3)', marginLeft: '5px' } }, a === 0 ? 'today' : `${a}d ago`);
              })()),
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
                  title: 'Draft a store message — recount gaps + the food-cost diagnosis action plan',
                  onClick: () => openDraft(r.loc, r.name, r.components),
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
          div({ style: { fontWeight: 700, color: 'var(--text)' } }, `✉️ Store message — ${draft.name}`),
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
          !draft.hasGaps && draft.hasPlan && span({ style: { fontSize: '12px', color: '#38bdf8' } }, 'No count gaps — this is the food-cost action plan.'),
          !draft.hasGaps && !draft.hasPlan && span({ style: { fontSize: '12px', color: '#4ade80' } }, 'No gaps — count looks complete.')))),

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
          (rawByLoc[diag.loc] || []).length > 0 && h('button', {
            title: 'See the count-cycle path of each item — where the variance was realized',
            onClick: () => openJourneys(diag.loc, diag.name),
            style: { background: 'none', color: '#c084fc', border: '1px solid #c084fc', borderRadius: '6px', padding: '8px 14px', fontWeight: 600, cursor: 'pointer', fontSize: '13px' },
          }, '📊 Item journeys'),
          h('button', {
            onClick: () => { updateStatus(diag.loc, { diagnosisStatus: 'diagnosed' }); setDiag(null); },
            style: { background: 'none', color: '#38bdf8', border: '1px solid #38bdf8', borderRadius: '6px', padding: '8px 14px', fontWeight: 600, cursor: 'pointer', fontSize: '13px' },
          }, 'Mark diagnosed')))),

    // item-journey modal — the visual count-cycle guide (worst items first)
    journeys && (() => {
      const sel = journeys.list.find(j => j.wrin === journeys.selectedWrin) || journeys.list[0];
      return div({
        onClick: () => setJourneys(null),
        style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
      },
        div({
          onClick: e => e.stopPropagation(),
          style: { background: 'var(--surf)', border: '1px solid var(--bdr2)', borderRadius: '10px', width: '100%', maxWidth: '760px', maxHeight: '88vh', overflow: 'auto', padding: '18px' },
        },
          div({ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' } },
            div({ style: { fontWeight: 700, color: 'var(--text)' } }, `📊 Item journeys — ${journeys.name}`),
            h('button', { onClick: () => setJourneys(null), style: { background: 'none', border: 'none', color: 'var(--text3)', fontSize: '18px', cursor: 'pointer' } }, '✕')),
          div({ style: { fontSize: '12px', color: 'var(--text3)', marginBottom: '10px' } },
            `${journeys.list.length} item${journeys.list.length !== 1 ? 's' : ''} pulled for ${period}, worst net-variance first. Pick an item to trace its count cycle.`),

          journeys.list.length === 0
            ? div({ style: { fontSize: '13px', color: 'var(--text3)', padding: '20px', textAlign: 'center' } }, 'No raw-item detail pulled for this store this period.')
            : div(null,
              // item picker — worst-first chips
              div({ style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' } },
                journeys.list.slice(0, 24).map(j => {
                  const active = j.wrin === (sel && sel.wrin);
                  const tone = VERDICT_TONE[j.verdict.tone];
                  return h('button', {
                    key: j.wrin,
                    onClick: () => setJourneys(s => ({ ...s, selectedWrin: j.wrin })),
                    title: j.verdict.text,
                    style: {
                      background: active ? 'var(--surf3)' : 'transparent', color: 'var(--text)',
                      border: `1px solid ${active ? tone : 'var(--bdr2)'}`, borderRadius: '6px',
                      padding: '4px 8px', fontSize: '11.5px', cursor: 'pointer', fontWeight: active ? 700 : 500,
                      display: 'flex', alignItems: 'center', gap: '5px',
                    },
                  },
                    span({ style: { width: '7px', height: '7px', borderRadius: '50%', background: tone } }),
                    (j.descr || j.wrin), Math.abs(j.netCountDollars) >= 1 && span({ style: { color: 'var(--text3)' } }, jMoney(j.netCountDollars)));
                })),
              // selected item's journey
              h(ItemJourneyView, { key: sel && sel.wrin, journey: sel }))))
    })(),

    // FOB multi-location variance matrix modal
    fobOpen && div({
      onClick: () => setFobOpen(false),
      style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
    },
      div({
        onClick: e => e.stopPropagation(),
        style: { background: 'var(--surf)', border: '1px solid var(--bdr2)', borderRadius: '10px', width: '100%', maxWidth: '900px', maxHeight: '88vh', overflow: 'auto', padding: '18px' },
      },
        div({ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' } },
          div({ style: { fontWeight: 700, color: 'var(--text)' } }, `📊 FOB component breakdown — ${period}`),
          h('button', { onClick: () => setFobOpen(false), style: { background: 'none', border: 'none', color: 'var(--text3)', fontSize: '18px', cursor: 'pointer' } }, '✕')),
        div({ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' } },
          div({ style: { fontSize: '12px', color: 'var(--text3)' } },
            `${rows.length} store${rows.length !== 1 ? 's' : ''} in view · where each store's food-cost dollars are leaking`),
          div({ style: { display: 'flex', border: '1px solid var(--bdr2)', borderRadius: '6px', overflow: 'hidden' } },
            [[false, '% of sales'], [true, '$']].map(([v, label]) =>
              h('button', {
                key: String(v), onClick: () => setFobDollars(v),
                style: { background: fobDollars === v ? '#f5bc00' : 'var(--surf3)', color: fobDollars === v ? '#0f1117' : 'var(--text2)', border: 'none', padding: '5px 11px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' },
              }, label)))),
        h(FobVarianceMatrix, { rows, showDollars: fobDollars, sortKey: fobSort, onSort: setFobSort }))),

    // flow-editor modal — reorder/toggle checks + tune thresholds (persists to cloud)
    flowOpen && div({
      onClick: () => setFlowOpen(false),
      style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
    },
      div({
        onClick: e => e.stopPropagation(),
        style: { background: 'var(--surf)', border: '1px solid var(--bdr2)', borderRadius: '10px', width: '100%', maxWidth: '620px', maxHeight: '85vh', overflow: 'auto', padding: '18px' },
      },
        div({ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' } },
          div({ style: { fontWeight: 700, color: 'var(--text)' } }, '⚙ Edit diagnosis flow'),
          h('button', { onClick: () => setFlowOpen(false), style: { background: 'none', border: 'none', color: 'var(--text3)', fontSize: '18px', cursor: 'pointer' } }, '✕')),
        div({ style: { fontSize: '12px', color: 'var(--text3)', marginBottom: '12px' } },
          'Reorder, enable/disable, and tune each check. Applies to every store’s 🔬 Diagnose. Saved to the cloud.'),

        div({ style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
          flowDraft.slice().sort((a, b) => a.order - b.order).map((c, i, arr) => {
            const PARAM_LABEL = { threshold: '±$', topN: 'Top N', shareFlag: 'Mgr share', band: 'FOB band', minValue: 'Min $', minDollar: 'Min $', largeAmt: 'Large $' };
            const paramKeys = Object.keys(c.params || {});
            return div({ key: c.id, style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: '7px', opacity: c.enabled ? 1 : 0.55 } },
              // reorder
              div({ style: { display: 'flex', flexDirection: 'column' } },
                h('button', { onClick: () => flowMove(c.id, -1), disabled: i === 0, style: { background: 'none', border: 'none', color: 'var(--text3)', cursor: i === 0 ? 'default' : 'pointer', fontSize: '10px', lineHeight: 1, padding: 0 } }, '▲'),
                h('button', { onClick: () => flowMove(c.id, 1), disabled: i === arr.length - 1, style: { background: 'none', border: 'none', color: 'var(--text3)', cursor: i === arr.length - 1 ? 'default' : 'pointer', fontSize: '10px', lineHeight: 1, padding: 0 } }, '▼')),
              // enable toggle
              h('input', { type: 'checkbox', checked: c.enabled, onChange: e => flowSet(c.id, { enabled: e.target.checked }), style: { cursor: 'pointer' } }),
              // label
              div({ style: { flex: 1, fontSize: '12.5px', color: 'var(--text)', fontWeight: 600 } },
                c.label, c.pending && span({ style: { fontSize: '10px', color: 'var(--text3)', fontWeight: 400, marginLeft: '6px' } }, '(awaiting data)')),
              // tunable params
              ...paramKeys.map(k => div({ key: k, style: { display: 'flex', alignItems: 'center', gap: '4px' } },
                span({ style: { fontSize: '10px', color: 'var(--text3)' } }, PARAM_LABEL[k] || k),
                h('input', {
                  type: 'number', value: c.params[k],
                  onChange: e => flowSet(c.id, { params: { [k]: k === 'band' || k === 'shareFlag' ? parseFloat(e.target.value) : Number(e.target.value) } }),
                  style: { width: '58px', background: 'var(--surf3)', color: 'var(--text)', border: '1px solid var(--bdr2)', borderRadius: '5px', padding: '3px 5px', fontSize: '12px' },
                }))));
          })),

        div({ style: { display: 'flex', gap: '10px', marginTop: '14px', alignItems: 'center' } },
          h('button', {
            onClick: flowSave, disabled: flowSaving,
            style: { background: '#f5bc00', color: '#1a1400', border: 'none', borderRadius: '6px', padding: '8px 16px', fontWeight: 700, cursor: 'pointer', fontSize: '13px' },
          }, flowSaving ? 'Saving…' : 'Save flow'),
          h('button', {
            onClick: flowReset,
            style: { background: 'none', color: 'var(--text3)', border: '1px solid var(--bdr2)', borderRadius: '6px', padding: '8px 14px', fontWeight: 600, cursor: 'pointer', fontSize: '13px' },
          }, 'Reset to defaults')))),

    div({ style: { marginTop: '14px', fontSize: '11px', color: 'var(--text3)' } },
      'Count progress is inferred from each item\'s last-counted / last-submitted date landing inside the count window. ',
      'FOB % is dollar-weighted MTD (Σ components ÷ Σ product sales). 🔬 Diagnose runs the food-cost decision tree ',
      '(top-5 variance, ±$50, incomplete count, waste patterns, transfers) on the cloud-pulled streams. ',
      'Diagnosis & Communication status save to the cloud.'));
}
