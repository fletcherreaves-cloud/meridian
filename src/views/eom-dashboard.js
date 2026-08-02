// @ts-nocheck
// ── EOM Dashboard ─────────────────────────────────────────────────────────────
// All-stores End-Of-Month view (Notes 29): each location's inventory count
// progress + finalization status, its FOB $/% snapshot, a diagnosis status, and
// communication-verification. Count progress is engine-derived from the auto-pulled
// qsr_onhand stream (last_counted/last_submitted inside the last-3-days window);
// FOB comes from the qsr_fob stream (dollar-weighted, MTD). Diagnosis + comms state
// persist to eom_count_status so the owner can track who was told what.
import * as React from 'react';
import { STORE_NAMES, getStoreOrg, supervisorGroups, DEFAULT_TARGETS } from '../constants.js';
import {
  loadQsrOnHand, loadQsrFob, loadEomCountStatus, saveEomCountStatus,
  loadQsrVarianceStat, loadQsrVarianceHistory, loadQsrVarianceHistoryAll, loadQsrWaste, loadQsrTransfers, loadQsrRawItemDetail,
  loadEomDiagConfig, saveEomDiagConfig, triggerSync,
  saveEomItemDisposition, loadEomItemDisposition, loadSelfServeTowerLocs,
  saveEomSnapshots, loadEomSnapshots, saveEomSecondaryReview, loadEomSecondaryReview,
  saveEomCountException, deleteEomCountException, loadEomCountExceptions,
  createEomShareLink,
} from '../lib/supabase.js';
import { diffScope } from '../engine/eom-change-monitor.js';
import { ledgerScopeDiff, closeWindowStartFor } from '../engine/eom-ledger-baseline.js';
import { storeVarianceProgressions } from '../engine/eom-variance-progression.js';
import { recountImpactByStore, fobConsistencyByStore } from '../engine/fob-recount-analysis.js';
import { buildFobReport } from '../engine/fob-report.js';
import { fountainShortTotal, fountainBaseline } from '../engine/fountain-yield.js';
import { latestVarianceByWrin } from '../engine/eom-variance-raw.js';
import { scanWaste } from '../engine/eom-waste-scan.js';
import { classifyItemPattern, buildItemSeries, scanChronicOffenders, scanCountReliability, scanRubberBand, PATTERN_META } from '../engine/eom-item-pattern.js';
import {
  computeCountProgress, periodKey, daysInPeriod, countWindowStart, BELIEVES_DONE_PCT,
  buildIncompleteCountMessage, diagnoseIncompleteCount, fobSnapshotByStore,
} from '../engine/eom-inventory.js';
import { runDiagnosis, formatDiagnosisReport, applyChecksConfig, checksConfig, fobComponentDeltas } from '../engine/eom-diagnosis.js';
import { flagUnmatchedTransfers } from '../engine/eom-parsers.js';
import { parseExternalFob, reconcileFob } from '../engine/fob-crosscheck.js';
import { buildDistrictSummary, COMP_META, CLASS_META } from '../engine/eom-district-summary.js';
import { mdToHtml } from '../utils/markdown.js';
import { buildItemJourney, buildStoreJourneys, computeCountTiming, fmtDurationHMS, LANE_META } from '../engine/eom-item-journey.js';
import { analyzeCountCadence, weeklyExceptions, WEEKDAY_NAMES, itemVarianceWindows } from '../engine/weekly-cadence.js';

const { useState, useEffect, useMemo, useCallback } = React;
const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);

// Last `n` period keys up to and including `period` (oldest→newest) — the look-back window
// for Action-Items provenance (per-item month-over-month variance history).
function lastPeriods(period, n = 6) {
  const m = /^(\d{4})-(\d{2})$/.exec(period || '');
  if (!m) return period ? [period] : [];
  let y = +m[1], mo = +m[2] - 1; // 0-based month of the current period
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(y, mo - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out.reverse();
}

// Standardized modal close ✕ — pinned to the top-right corner of the modal container so it
// lands in the SAME place on every panel (owner req #43), instead of riding at the end of the
// header row. The container must be position:relative (added to each modal below).
const MODAL_X = { position: 'absolute', top: '10px', right: '14px', background: 'none', border: 'none', color: 'var(--text3)', fontSize: '18px', lineHeight: 1, cursor: 'pointer', zIndex: 6, padding: '2px 5px' };
// Small toolbar button (Save CSV / Print) shared by the scan modals.
const MODAL_TOOLBTN = { fontFamily: 'ui-monospace,Menlo,monospace', fontSize: '11px', fontWeight: 600, color: 'var(--text2)', background: 'var(--surf3)', border: '1px solid var(--bdr2)', borderRadius: '6px', padding: '4px 9px', cursor: 'pointer' };

// ── Save / print helpers (dependency-free) ────────────────────────────────────
const _csvCell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const toCsv = (headers, rows) => [headers.map(_csvCell).join(','), ...rows.map(r => r.map(_csvCell).join(','))].join('\n');
function downloadText(filename, text, mime = 'text/csv;charset=utf-8') {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  } catch (e) { console.warn('[eom] download failed', e); }
}
function openPrintWindow(title, bodyHtml) {
  try {
    // NB: do NOT pass 'noopener' — with it window.open() returns null, so nothing gets written and the
    // new tab stays blank white (owner Notes 38: "Print for summary report ... blank white page").
    const w = window.open('', '_blank', 'width=900,height=1100');
    if (!w) { console.warn('[eom] print window blocked'); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:-apple-system,system-ui,"Segoe UI",sans-serif;color:#111;margin:26px;font-size:12px;line-height:1.45}
h1{font-size:17px;margin:0 0 3px}.sub{color:#666;font-size:11px;margin:0 0 16px}
table{border-collapse:collapse;width:100%;margin:0 0 18px}th,td{border:1px solid #cbcbcb;padding:5px 8px;text-align:left;vertical-align:top}
th{background:#f1f1f1;font-size:10.5px;text-transform:uppercase;letter-spacing:.04em}
tr{break-inside:avoid}.g{font-weight:800}.r{color:#b00}.mono{font-family:ui-monospace,Menlo,monospace}
@media print{.noprint{display:none}}</style></head><body>${bodyHtml}
<script>window.onload=function(){setTimeout(function(){window.focus();window.print();},200)}<\/script></body></html>`);
    w.document.close();
  } catch (e) { console.warn('[eom] print failed', e); }
}

const unpad = loc => String(loc || '').replace(/^0+/, '') || String(loc || '');
const nm = loc => STORE_NAMES[unpad(loc)] || unpad(loc);
// Per-store FOB target (Food-Over-Base % of product sales) — over target = worse food cost =
// prioritize the diagnosis (owner req 2026-07-30). tFOBTarget is a fraction (e.g. 0.0385 = 3.85%).
const fobTgtOf = loc => { const t = DEFAULT_TARGETS[unpad(loc)]; return t && t.tFOBTarget != null ? Number(t.tFOBTarget) : null; };
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
  // Render the SAME markdown the on-screen modal shows (mdToHtml) instead of dumping raw
  // markdown into a <pre> — so Print/PDF matches the formatted report incl. tables + chips
  // (Notes 36). Light-theme print CSS mirrors the modal's structure with print-safe colors.
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>EOM Diagnosis — ${esc(name)} ${esc(period)}</title>
    <style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;margin:28px;line-height:1.5;font-size:12.5px}
    h1{font-size:18px;margin:0 0 2px;color:#111} .sub{color:#666;font-size:12px;margin-bottom:16px}
    .rpt h1{font-size:15px;border-bottom:2px solid #111;padding-bottom:3px;margin:18px 0 8px}
    .rpt h2{font-size:12.5px;text-transform:uppercase;letter-spacing:.4px;color:#333;margin:16px 0 6px;border-bottom:1px solid #ccc;padding-bottom:2px}
    .rpt h3{font-size:12px;margin:10px 0 4px}
    .rpt table{border-collapse:collapse;width:100%;margin:6px 0;font-size:11px}
    .rpt th{background:#f0f0f0;border:1px solid #ccc;padding:4px 7px;text-align:left}
    .rpt td{border:1px solid #ddd;padding:4px 7px}
    .rpt ul,.rpt ol{margin:5px 0;padding-left:20px} .rpt li{margin:2px 0}
    .rpt code{background:#f2f2f2;border-radius:3px;padding:0 4px;font-size:11px}
    .chip{display:inline-block;font-size:10px;font-weight:700;padding:1px 7px;border-radius:9px;margin:0 2px;border:1px solid}
    .chip-warn{background:#fff7e6;border-color:#f0b400;color:#8a6400}
    .chip-bad{background:#fdecec;border-color:#e05555;color:#a12020}
    .chip-good{background:#eafaf0;border-color:#4caf78;color:#1f7a44}
    .chip-info{background:#eef4fb;border-color:#5b9bd5;color:#2f5f8f}
    @media print{@page{margin:0.6in}}</style></head><body>
    <h1>EOM Food-Cost Diagnosis — ${esc(name)}</h1>
    <div class="sub">Period ${esc(period)} · generated ${new Date().toLocaleString()}</div>
    <div class="rpt">${mdToHtml(reportText)}</div></body></html>`);
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

// The date to attribute a store's count to: the APPROVED early-count date (exception) wins, else the
// bulk-count day (mode, prog.fullCountDate), else the latest activity. Keeps the dashboard honest about
// WHEN a store actually counted — not a stray last-touch or the close date (owner: PDL counted 07/28).
const preferredCountDate = (r) => {
  const iso = (r && r.exception && r.exception.acceptedDate) || (r && r.prog && r.prog.fullCountDate) || null;
  if (iso) return new Date(iso + 'T00:00:00');
  return (r && r.prog && r.prog.lastActivityAt) ? new Date(r.prog.lastActivityAt) : null;
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
// The EOM count/close runs into the first days of the NEXT month, so early in a month you are still
// closing the PRIOR month's EOM — default the dashboard there (else Progression/EOM read the brand-new
// month, which has no count data yet and shows blank). Mid-month, the current month is the active period.
function defaultPeriod() {
  const now = new Date();
  const d = now.getDate() <= 6
    ? new Date(now.getFullYear(), now.getMonth() - 1, 1)
    : new Date(now.getFullYear(), now.getMonth(), 1);
  return periodKey(d);
}

const DIAG_OPTS = ['pending', 'in_review', 'diagnosed', 'cleared'];
const COMMS_OPTS = ['none', 'drafted', 'sent', 'verified'];
const DIAG_LABEL = { pending: 'Pending', in_review: 'In review', diagnosed: 'Diagnosed', cleared: 'Cleared' };
const COMMS_LABEL = { none: 'Not sent', drafted: 'Drafted', sent: 'Sent', verified: 'Verified' };
const statusColor = (v) => ({
  pending: '#64748b', in_review: '#f5bc00', diagnosed: '#38bdf8', cleared: '#4ade80',
  none: '#64748b', drafted: '#f5bc00', sent: '#38bdf8', verified: '#4ade80',
}[v] || '#64748b');

// FOB $/% per store for the period — the LATEST daily snapshot, NOT a sum (see fobSnapshotByStore).
const fobByStore = fobSnapshotByStore;

function ClassChips({ byClass, uncounted, npDueToday }) {
  // Food/Condiment/Paper are due to 100% by EOD; Non-Product ('N') isn't due until tomorrow — UNLESS
  // today is the last day of the month, when it's due too (owner Notes 38). Muted "tmrw" tag only when
  // it's genuinely not-yet-due.
  const order = [['food', 'F'], ['condiment', 'C'], ['paper', 'P'], ['nonproduct', 'N']];
  return div({ style: { display: 'flex', gap: '4px' } },
    order.map(([k, label]) => {
      const b = byClass[k];
      if (!b || !b.total) return null;
      const isLate = k === 'nonproduct' && !npDueToday;  // due tomorrow — not part of today's 100% (except last day)
      const isFC = k === 'food' || k === 'condiment';
      // Food/Condiment need 100% — a SINGLE uncounted profit-driver item must flag, even at 99%+
      // (owner: Holdenville had one food item not counted → should flag). Paper/Non-Product keep the
      // 98% "done" threshold. So FC is only "done" (green) when every item is counted in the window.
      const done = isFC ? (b.total > 0 && b.counted >= b.total) : b.done;
      const color = isLate ? 'var(--text3)' : done ? '#4ade80' : (isFC && !done) ? '#fb923c' : b.pct >= 0.5 ? '#f5bc00' : '#64748b';
      // When a class isn't done, hover reveals EXACTLY which items are still uncounted (top by $).
      const items = (uncounted && uncounted[k]) || [];
      const nearDone = !isLate && !done && items.length > 0;
      const stTag = u => u.state === 'never' ? 'NEVER counted' : u.state === 'stale' ? `stale (last ${u.lastCounted || '?'})` : `early (${u.lastCounted || '?'})`;
      const title = isLate
        ? `${label} (Non-Product): ${b.counted}/${b.total} counted (${pct(b.pct)}) — NOT due until tomorrow, so uncounted here today is expected (not part of today's 100%).`
        : nearDone
        ? `${label}: ${b.counted}/${b.total} counted (${pct(b.pct)}) — due by EOD — items not counted in the final window:\n` +
          items.slice(0, 12).map(u => `• ${u.descr || u.wrin}${u.valueAtRisk ? ` ($${Math.round(u.valueAtRisk)})` : ''} — ${stTag(u)}`).join('\n') +
          (items.length > 12 ? `\n…+${items.length - 12} more` : '') +
          `\n(NEVER = true blank · early = counted earlier this period · stale = prior period / likely obsolete / discontinued / inactive)`
        : `${label}: ${b.counted}/${b.total} counted (${pct(b.pct)})${k === 'paper' ? ' — due by EOD (completeness, not cost-control)' : ''}`;
      return span({
        key: k, title,
        style: { fontSize: '10px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', border: `1px solid ${color}`, color, opacity: isLate ? 0.75 : 1, cursor: (nearDone || isLate) ? 'help' : 'default' },
      }, `${label} ${pct(b.pct)}${isLate ? ' tmrw' : nearDone ? ` ·${items.length}` : ''}`);
    }));
}

// FOB component strip (owner req) — FOB %/$ + each component's $, % of sales, and ± vs its own
// target. Shared by the diagnosis panel AND the store-message draft so they read identically.
function FobStrip({ fob, loc }) {
  const f = fob || {};
  if (f.fob == null && f.fobPct == null) return null;
  const tg = DEFAULT_TARGETS[unpad(loc)] || {};
  const fobTgt = tg.tFOBTarget;
  const $ = v => `$${Math.round(v || 0).toLocaleString()}`;
  const box = { padding: '3px 9px', background: 'var(--surf3)', border: '1px solid var(--bdr)', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '1px' };
  const lab = { fontSize: '8px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap' };
  const big = c => ({ fontSize: '12px', fontWeight: 700, color: c || 'var(--text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' });
  const simple = (label, val, color) => div({ style: box }, span({ style: lab }, label), span({ style: big(color) }, val));
  const comp = (label, amt, tgtFrac) => {
    const p = f.sales ? amt / f.sales : null;
    const dPp = (tgtFrac != null && p != null) ? (p - tgtFrac) * 100 : null;
    const over = dPp != null && dPp > 0.001;
    return div({ style: box },
      span({ style: lab }, label),
      span({ style: big() }, $(amt)),
      p != null ? span({ style: { fontSize: '8.5px', fontWeight: 600, color: dPp == null ? 'var(--text3)' : over ? '#f87171' : '#4ade80', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } },
        `${(p * 100).toFixed(2)}%${dPp != null ? ` · ${dPp >= 0 ? '+' : ''}${dPp.toFixed(2)}` : ''}${tgtFrac != null ? ` (tgt ${(tgtFrac * 100).toFixed(2)}%)` : ''}`) : null);
  };
  const fobOver = fobTgt != null && f.fobPct != null && f.fobPct > fobTgt;
  return div({ style: { marginBottom: '10px' } },
    div({ style: { display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'stretch' } },
      div({ style: box },
        span({ style: lab }, 'FOB'),
        span({ style: big(fobOver ? '#f87171' : '#f5bc00') }, `${f.fobPct != null ? (f.fobPct * 100).toFixed(2) + '%' : '—'} · ${$(f.fob)}`),
        fobTgt != null ? span({ style: { fontSize: '8.5px', fontWeight: 600, color: fobOver ? '#f87171' : '#4ade80', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } },
          `${f.fobPct != null ? `${f.fobPct >= fobTgt ? '+' : ''}${((f.fobPct - fobTgt) * 100).toFixed(2)} vs ` : ''}tgt ${(fobTgt * 100).toFixed(2)}%`) : null),
      comp('Comp Waste', f.comp, tg.tCompWaste), comp('Raw Waste', f.raw, tg.tRawWaste), comp('Condiments', f.cond, tg.tCondiment),
      comp('Emp Meals', f.emp, tg.tEmpFood), comp('Stat Var', f.statv, tg.tStatLoss), comp('Unexplained', f.unex, tg.tUnex),
      f.sales ? simple('Prod Sales', $(f.sales)) : null),
    f.asOf ? div({ style: { fontSize: '9px', color: 'var(--text3)', marginTop: '3px' } }, `FOB as of ${f.asOf} · MTD, dollar-weighted · % = component ÷ prod sales, ± = pp vs target`) : null);
}

function ProgressBar({ value }) {
  const p = Math.max(0, Math.min(1, value || 0));
  const color = p >= BELIEVES_DONE_PCT ? '#4ade80' : p >= 0.5 ? '#f5bc00' : '#f87171';
  return div({ style: { display: 'flex', alignItems: 'center', gap: '8px', minWidth: '140px' } },
    div({ style: { flex: 1, height: '8px', background: 'var(--bdr)', borderRadius: '4px', overflow: 'hidden' } },
      div({ style: { width: `${p * 100}%`, height: '100%', background: color } })),
    span({ style: { fontSize: '12px', fontWeight: 700, color, minWidth: '34px', textAlign: 'right' } }, pct(p)));
}

// Weekly-count cadence monitor (Count Cycle view) — is each store running its weekly full Food+Condiment
// count? Detected weekly day, last full count + days-since, weekly-vs-spot session mix. Overdue first.
function CadenceMonitor({ rows, cadenceByLoc, rawByLoc, nm }) {
  const [open, setOpen] = useState(null);   // loc expanded to its between-count variance windows
  const data = (rows || []).map(r => ({ loc: r.loc, name: r.name, c: cadenceByLoc[String(r.loc)] })).filter(x => x.c);
  if (!data.length) return null;
  const statusOf = c => c.daysSinceWeekly == null ? 3 : (c.daysSinceWeekly >= 14 ? 2 : c.daysSinceWeekly >= 8 ? 1 : 0);
  data.sort((a, b) => statusOf(b.c) - statusOf(a.c) || ((b.c.daysSinceWeekly || 0) - (a.c.daysSinceWeekly || 0)) || a.name.localeCompare(b.name));
  const nOverdue = data.filter(x => statusOf(x.c) >= 1 && x.c.daysSinceWeekly != null).length;
  const nNever = data.filter(x => x.c.daysSinceWeekly == null).length;
  const fmtDay = d => { try { return new Date(d + 'T00:00:00').toLocaleDateString(); } catch { return d; } };
  const $ = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n || 0)).toLocaleString();
  const th = (t) => h('th', { key: t, style: { padding: '4px 10px', borderBottom: '1px solid var(--bdr)', whiteSpace: 'nowrap' } }, t);

  // Between-count variance windows for a store: per item, the biggest |delta| between consecutive
  // counts — that window localizes WHEN the product moved (Notes: the powerful part of the engine).
  const windowsFor = (loc) => (rawByLoc[String(loc)] || [])
    .map(it => { const w = itemVarianceWindows(it.history); return w.biggest ? { descr: it.descr || it.wrin, ...w.biggest } : null; })
    .filter(Boolean).filter(w => Math.abs(w.delta) >= 50)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 8);

  return div({ style: { marginBottom: '18px', border: '1px solid var(--bdr)', borderRadius: '10px', padding: '12px 14px', background: 'var(--surf2)' } },
    div({ style: { fontWeight: 700, color: 'var(--text)', marginBottom: '2px' } }, '🗓 Weekly Count Cadence'),
    div({ style: { fontSize: '11px', color: 'var(--text3)', marginBottom: '10px' } },
      `Every store runs a full Food + Condiment count weekly. ${nOverdue ? `⚠ ${nOverdue} overdue (≥8 days)` : '✓ all current'}${nNever ? ` · ${nNever} with no full weekly on record` : ''}. Click a store to see which count window each item's variance happened in.`),
    h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' } },
      h('thead', null, h('tr', { style: { textAlign: 'left', color: 'var(--text3)', fontSize: '10px', textTransform: 'uppercase' } },
        ['Store', 'Counts on', 'Last full count', 'This window', 'Status'].map(th))),
      h('tbody', null, data.flatMap(({ loc, name, c }) => {
        const st = statusOf(c);
        const col = st >= 2 ? '#f87171' : st === 1 ? '#f5bc00' : '#4ade80';
        const label = c.daysSinceWeekly == null ? 'No full weekly' : c.daysSinceWeekly >= 8 ? `Overdue · ${c.daysSinceWeekly}d` : 'On track';
        const isOpen = open === loc;
        const wins = isOpen ? windowsFor(loc) : [];
        const rowEls = [
          h('tr', { key: loc, onClick: () => setOpen(o => o === loc ? null : loc), style: { borderBottom: isOpen ? 'none' : '1px solid var(--bdr)', cursor: 'pointer' } },
            h('td', { style: { padding: '6px 10px', fontWeight: 600, color: 'var(--text)' } }, `${isOpen ? '▾' : '▸'} ${name}`,
              span({ style: { fontSize: '10px', color: 'var(--text3)', marginLeft: '5px', fontFamily: 'ui-monospace,Menlo,monospace' } }, `#${unpad(loc)}`)),
            h('td', { style: { padding: '6px 10px', color: 'var(--text2)' } }, c.detectedWeekdayName ? `${c.detectedWeekdayName}s` : '—'),
            h('td', { style: { padding: '6px 10px', color: 'var(--text2)', whiteSpace: 'nowrap' } }, c.lastWeekly ? `${fmtDay(c.lastWeekly)}${c.daysSinceWeekly != null ? ` · ${c.daysSinceWeekly}d ago` : ''}` : '—'),
            h('td', { style: { padding: '6px 10px', color: 'var(--text3)' } }, `${c.nWeekly} weekly · ${c.nSpot} spot`),
            h('td', { style: { padding: '6px 10px' } }, span({ style: { color: col, fontWeight: 700, fontSize: '11px', whiteSpace: 'nowrap' } }, label))),
        ];
        if (isOpen) rowEls.push(
          h('tr', { key: loc + '-d', style: { borderBottom: '1px solid var(--bdr)' } },
            h('td', { colSpan: 5, style: { padding: '2px 10px 10px 24px', background: 'var(--surf3)' } },
              wins.length
                ? div(null,
                    div({ style: { fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.03em', margin: '4px 0 3px' } }, 'Biggest between-count variance windows (where the movement happened)'),
                    ...wins.map((w, i) => div({ key: i, style: { fontSize: '11.5px', color: 'var(--text2)', padding: '1px 0' } },
                      span({ style: { fontWeight: 600, color: 'var(--text)' } }, w.descr), ` — moved `,
                      span({ style: { fontWeight: 700, color: w.delta < 0 ? '#f87171' : '#4ade80' } }, `${w.delta >= 0 ? '+' : ''}${$(w.delta)}`),
                      ` between ${w.from} and ${w.to}`)))
                : div({ style: { fontSize: '11px', color: 'var(--text3)', padding: '4px 0' } }, 'No multi-point count history to bracket a variance window yet.'))));
        return rowEls;
      }))));
}

// Change Monitor v2 (Notes 41, session model 2026-08-01) — reads the raw count ledger the way QSRSoft's
// Raw Item Detail reads it. An item is counted BY AREA, so one honest count = several submissions in one
// session; only the FINAL entry is binding ("most recent count overrides all previous"). A "recount" only
// exists ACROSS sessions (a separate day/large gap). Headline = the authoritative period variance
// (qsr_variance_stat); the session table below is the how-it-was-counted story. No lock/baseline needed.
const VP_VBADGE = {
  'single-count': ['var(--text3)', 'counted'],
  'counted-multi': ['#38bdf8', 'counted · area-by-area'],
  improved: ['#4ade80', 'recount improved'],
  worsened: ['#f87171', 'recount hurt'],
  held: ['#f5bc00', 'recount held'],
};
function VarianceProgressionView({ rows, progByLoc, nm }) {
  const [openStore, setOpenStore] = useState(null);
  const [openItem, setOpenItem] = useState(null);
  const [baseMode, setBaseMode] = useState('period');   // 'period' (this month's sessions) | 'lastEom' (vs last period)
  const $ = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n || 0)).toLocaleString();
  const lastEom = baseMode === 'lastEom';

  // PERIOD-SPECIFIC recount (owner, 2026-08-01): on an EOM/monthly period the only recount that matters
  // for grading is a genuine same-day re-verify on the FINAL (EOM-binding) count day — a later store-level
  // count window, or a back-office (non-MobileApp) correction. Same-day recounts on EARLIER weekly count-
  // days are informational (that count doesn't bind the period). Cross-DAY counts are the weekly count
  // PROGRESSION, never recounts. Grading: helped = the recount moved the variance toward zero, hurt = away.
  const nGenuine = i => i.recount?.nEomRecounts || 0;
  const recountBadge = (i) => {
    const rc = i.recount; if (!rc || !rc.nEomRecounts) return null;
    const confirmed = (rc.eomRecounts || []).some(r => r.confidence === 'confirmed');
    const label = rc.nEomHurt > rc.nEomHelped ? 'recount hurt' : rc.nEomHelped > rc.nEomHurt ? 'recount helped' : 'recount held';
    const color = rc.nEomHurt > rc.nEomHelped ? '#f87171' : rc.nEomHelped > rc.nEomHurt ? '#4ade80' : 'var(--text3)';
    return { label: `↻ ${label}${confirmed ? ' ✓' : ''}`, color,
      title: `${rc.nEomRecounts} same-day recount${rc.nEomRecounts !== 1 ? 's' : ''} on the binding (EOM) count day ${rc.eomDay || ''} — ${rc.nEomHelped} helped, ${rc.nEomHurt} hurt${confirmed ? '. ✓ = a back-office (non-MobileApp) correction — a confirmed recount.' : '. Detected from a later store-level count window — a re-verify after the walkthrough.'}${rc.nRecounts > rc.nEomRecounts ? ` (${rc.nRecounts - rc.nEomRecounts} more on earlier count-days — informational only.)` : ''}` };
  };

  // Month-over-month vs last period's authoritative variance (Notes 42 #2). Improving = |variance| shrank
  // toward zero; resolved = dropped off the flag list entirely; regressed = grew; new = newly on the list.
  const mom = (p) => {
    const cur = p.officialVar, prior = p.priorVar;
    if (prior == null && cur == null) return { verdict: 'na', cur, prior, delta: null };
    if (prior == null) return { verdict: 'new', cur, prior: null, delta: null };
    if (cur == null) return { verdict: 'resolved', cur: null, prior, delta: -Math.abs(prior) };
    const d = Math.abs(cur) - Math.abs(prior);   // − = toward zero = improved
    return { verdict: Math.abs(d) < 1 ? 'held' : d < 0 ? 'improved' : 'regressed', cur, prior, delta: d };
  };
  const isImproving = v => v === 'improved' || v === 'resolved';
  const isRegressing = v => v === 'regressed' || v === 'new';

  const stores = (rows || []).map(r => {
    const items = progByLoc[String(r.loc)] || [];
    const moms = items.map(mom);
    return { loc: r.loc, name: r.name, items,
      recounted: items.filter(i => nGenuine(i) > 0).length,
      rHelped: items.reduce((n, i) => n + (i.recount?.nEomHelped || 0), 0),
      rHurt: items.reduce((n, i) => n + (i.recount?.nEomHurt || 0), 0),
      worsened: items.filter(i => i.verdict === 'worsened').length,
      flagged: items.filter(i => (i.flags || []).some(f => f !== 'recount-worsened')).length,
      improving: moms.filter(m => isImproving(m.verdict)).length,
      regressing: moms.filter(m => isRegressing(m.verdict)).length,
      momNet: moms.reduce((s, m) => s + (m.delta || 0), 0) };
  }).filter(s => s.items.length);
  if (!stores.length) return div({ style: { color: 'var(--text3)', fontSize: '12.5px', padding: '20px', textAlign: 'center' } },
    'No raw item count history in scope yet — this view reads the per-item count ledger (fills in as counts post).');
  stores.sort(lastEom
    ? (a, b) => (b.regressing - a.regressing) || (b.momNet - a.momNet) || (b.items.length - a.items.length)
    : (a, b) => (b.flagged - a.flagged) || (b.worsened - a.worsened) || (b.items.length - a.items.length));
  const all = stores.flatMap(s => s.items);
  const dRecounted = all.filter(i => nGenuine(i) > 0).length;
  const dRHelped = all.reduce((n, i) => n + (i.recount?.nEomHelped || 0), 0);
  const dRHurt = all.reduce((n, i) => n + (i.recount?.nEomHurt || 0), 0);
  const dWorsened = all.filter(i => i.verdict === 'worsened').length;
  const dZero = all.filter(i => (i.flags || []).includes('zero-variance')).length;
  const dImproving = stores.reduce((n, s) => n + s.improving, 0);
  const dRegressing = stores.reduce((n, s) => n + s.regressing, 0);
  const dMomNet = stores.reduce((n, s) => n + s.momNet, 0);
  const box = { background: 'var(--surf2)', border: '1px solid var(--bdr2)', borderRadius: '7px', padding: '7px 10px', minWidth: '96px' };
  const lab = { fontSize: '9px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text3)', fontWeight: 700 };
  const qty = n => n == null ? '—' : (Math.round(n * 100) / 100).toLocaleString();
  const MOM_BADGE = {
    improved: ['#4ade80', 'improving vs last period'], resolved: ['#4ade80', 'resolved vs last period'],
    regressed: ['#f87171', 'regressing vs last period'], new: ['#f5bc00', 'new vs last period'],
    held: ['var(--text3)', 'flat vs last period'], na: ['var(--text3)', 'no last-period data'],
  };
  const toggleBtn = (k, l) => h('button', { key: k, onClick: () => setBaseMode(k),
    style: { background: baseMode === k ? 'var(--accent,#f5bc00)' : 'var(--surf3)', color: baseMode === k ? '#0f1117' : 'var(--text2)', border: 'none', padding: '4px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', borderRadius: '5px' } }, l);

  // Plain-language one-liner for an item — the story a GM can read without decoding a chain.
  const story = (p) => {
    const rc = p.recount;
    const eomSess = p.sessions[p.sessions.length - 1];   // the BINDING (final/EOM) count day
    const areas = eomSess.nEntries > 1 ? ` counted area-by-area (${eomSess.nEntries} entries)` : '';
    // Period frame: multiple count-days = the weekly progression; only the final (EOM) count binds.
    const frame = p.nSessions > 1
      ? `Counted on ${p.nSessions} days this period — the weekly count progression; only the final (EOM) count on ${eomSess.date}${areas} binds.`
      : `Counted once${areas}. Binding = the final entry.`;
    // The ONLY recount that changes the binding number is a same-day re-verify ON the EOM count day.
    if (rc && rc.nEomRecounts > 0) {
      const dir = rc.nEomHelped > rc.nEomHurt ? 'moved the variance toward zero — good diagnosis' : rc.nEomHurt > rc.nEomHelped ? 'moved it further from zero' : 'held about the same';
      const conf = (rc.eomRecounts || []).some(r => r.confidence === 'confirmed') ? ' via a back-office correction (a confirmed recount)' : '';
      const earlier = rc.nRecounts > rc.nEomRecounts ? ` (${rc.nRecounts - rc.nEomRecounts} same-day recount${rc.nRecounts - rc.nEomRecounts === 1 ? '' : 's'} on earlier count-days are informational.)` : '';
      return `${frame} On the EOM count it was re-verified the same day${conf}; the recount ${dir}.${earlier}`;
    }
    if (eomSess.offsetting) return `${frame} The swing between the EOM day's entries is normal area-by-area counting, not a loss.`;
    return frame;
  };

  // Raw-Item-Detail-style event table for one item: every count session, its area entries, binding final.
  const eventTable = (p) => {
    const th = { textAlign: 'left', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text3)', fontWeight: 700, padding: '3px 8px', borderBottom: '1px solid var(--bdr2)' };
    const td = { padding: '3px 8px', fontSize: '11.5px', color: 'var(--text2)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
    const bodyRows = [];
    // Point-to-point anchor: the period's beginning inventory = the first POS Open reading (carried from
    // last EOM's ending count). Variance reconciles from HERE to the binding count.
    if (p.periodStart) {
      bodyRows.push(h('tr', { key: 'ps-h' },
        h('td', { colSpan: 5, style: { padding: '6px 8px 2px', fontSize: '9.5px', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '.04em' } }, 'Period start · beginning inventory (carried from last EOM)')));
      bodyRows.push(h('tr', { key: 'ps' },
        h('td', { style: { ...td, color: 'var(--text3)' } }, `${p.periodStart.dt}${p.periodStart.tm ? ' ' + p.periodStart.tm : ''}`),
        h('td', { style: td }, 'POS Open'),
        h('td', { style: { ...td, fontWeight: 700, color: 'var(--text2)' } }, qty(p.periodStart.onHand)),
        h('td', { style: { ...td, color: 'var(--text3)' } }, '—'),
        h('td', { style: { ...td, fontSize: '9px', fontWeight: 700, color: '#38bdf8' } }, 'BEGIN')));
    }
    // Same-day recount entries (store-window model): a walkthrough entry re-verified after a gap, or a
    // back-office correction. Keyed by date+time so we can mark them RECOUNT in the ledger.
    const recountKeys = new Set();
    for (const d of (p.recount?.days || [])) for (const r of (d.recounts || [])) recountKeys.add(`${r.dt} ${r.tm || ''}`);
    p.sessions.forEach((s, si) => {
      // Cross-day sessions = the weekly count PROGRESSION (not recounts). Only same-day re-verifies (marked
      // per-entry below) are recounts. Base day neutral; later days = progression (blue).
      const labelTxt = p.nSessions === 1 ? 'Count' : si === 0 ? 'Count' : `Count progression — ${s.date}`;
      bodyRows.push(h('tr', { key: `s${si}` },
        h('td', { colSpan: 5, style: { padding: '6px 8px 2px', fontSize: '9.5px', fontWeight: 700, color: si === 0 ? 'var(--text3)' : '#38bdf8', textTransform: 'uppercase', letterSpacing: '.04em' } },
          `${labelTxt}${s.nEntries > 1 ? ` · ${s.nEntries} area entries` : ''}`)));
      s.entries.forEach((e, ei) => {
        const binding = ei === s.entries.length - 1;
        const isRecount = recountKeys.has(`${e.dt} ${e.tm || ''}`);
        const dc = Math.abs(e.dolVar) >= 1 ? (e.dolVar < 0 ? '#f87171' : '#4ade80') : 'var(--text3)';
        const tag = binding ? 'BINDING' : isRecount ? 'RECOUNT' : 'area';
        const tagC = binding ? '#38bdf8' : isRecount ? '#f5bc00' : 'var(--text3)';
        bodyRows.push(h('tr', { key: `s${si}e${ei}`, style: { background: binding ? 'var(--surf2)' : isRecount ? 'rgba(245,188,0,.07)' : 'transparent' } },
          h('td', { style: { ...td, color: 'var(--text3)' } }, `${e.dt}${e.tm ? ' ' + e.tm : ''}`),
          h('td', { style: td }, e.manager || '—'),
          h('td', { style: { ...td, fontWeight: binding ? 800 : 500, color: binding ? 'var(--text)' : 'var(--text2)' } }, qty(e.onHand)),
          h('td', { style: { ...td, color: dc } }, Math.abs(e.dolVar) >= 1 ? `${e.dolVar < 0 ? '-' : '+'}$${Math.abs(Math.round(e.dolVar)).toLocaleString()}` : '—'),
          h('td', { style: { ...td, fontSize: '9px', fontWeight: 700, color: tagC } }, tag)));
      });
    });
    return h('table', { style: { borderCollapse: 'collapse', width: '100%', maxWidth: '620px', marginTop: '6px' } },
      h('thead', null, h('tr', null,
        h('th', { style: th }, 'Date · Time'), h('th', { style: th }, 'Counter'),
        h('th', { style: th }, 'On-hand entered'), h('th', { style: { ...th }, title: 'The item’s variance in dollars at that count (unit variance × unit cost). During an area-by-area walkthrough the intermediate rows show PARTIAL variance (an artifact until every area is counted); only the BINDING row is the real variance for that count.' }, 'Variance $ (at count)'), h('th', { style: th }, ''))),
      h('tbody', null, ...bodyRows));
  };

  const netC = dMomNet < 0 ? '#4ade80' : dMomNet > 0 ? '#f87171' : 'var(--text3)';
  return div(null,
    // Baseline toggle: this-period sessions vs month-over-month vs last period.
    div({ style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' } },
      span({ style: { ...lab } }, 'Baseline'),
      div({ style: { display: 'flex', gap: '4px' } }, toggleBtn('period', 'This period'), toggleBtn('lastEom', 'Month-over-month'))),
    lastEom
      ? div({ style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' } },
          div({ style: box }, span({ style: lab, title: 'Items whose period variance moved TOWARD zero vs last period, or dropped off the flag list entirely' }, 'Improving'), div({ style: { fontSize: '17px', fontWeight: 800, color: '#4ade80' } }, String(dImproving))),
          div({ style: box }, span({ style: lab, title: 'Items whose variance grew away from zero vs last period, or newly landed on the flag list' }, 'Regressing'), div({ style: { fontSize: '17px', fontWeight: 800, color: '#f87171' } }, String(dRegressing))),
          div({ style: box }, span({ style: lab, title: 'Net change in |variance| vs last period across scoped items (− = better)' }, 'Net vs last period'), div({ style: { fontSize: '17px', fontWeight: 800, color: netC } }, (dMomNet < 0 ? '−' : dMomNet > 0 ? '+' : '') + $(Math.abs(dMomNet)).replace('-', ''))))
      : div({ style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' } },
          div({ style: box }, span({ style: { ...lab }, title: 'Items with a genuine SAME-DAY recount — a deliberate re-verify AFTER the count walkthrough (a later store-level count window, or a back-office correction). Area-by-area entries within one walkthrough are NOT recounts, and neither is a weekly-cadence count on another day.' }, 'Recounted'), div({ style: { fontSize: '17px', fontWeight: 800, color: '#38bdf8' } }, String(dRecounted))),
          div({ style: box }, span({ style: lab, title: 'Same-day recounts that moved the variance TOWARD zero — the manager diagnosed and corrected well.' }, 'Recount helped'), div({ style: { fontSize: '17px', fontWeight: 800, color: '#4ade80' } }, String(dRHelped))),
          div({ style: box }, span({ style: lab, title: 'Same-day recounts that moved the variance AWAY from zero — re-verifying made the number worse (or introduced an error).' }, 'Recount hurt'), div({ style: { fontSize: '17px', fontWeight: 800, color: '#f87171' } }, String(dRHurt))),
          div({ style: box }, span({ style: lab, title: 'A binding count of ~$0 is statistically improbable — usually not-yet-posted; verify' }, '$0 (verify)'), div({ style: { fontSize: '17px', fontWeight: 800, color: '#38bdf8' } }, String(dZero)))),
    div({ style: { fontSize: '10.5px', color: 'var(--text3)', marginBottom: '10px', lineHeight: 1.5 } }, lastEom
      ? ['Month-over-month trend: each item’s ', span({ key: 'a', style: { fontWeight: 700, color: 'var(--text2)' } }, 'official period variance, this period vs last'), '. (Each period already reconciles from the prior EOM count — beginning inventory = last EOM’s ending count — so this compares two reconciliations.) Improving = variance shrank toward zero (or resolved off the list); regressing = grew (or newly on the list). Stores ranked by most regressing. Click a store, then an item.']
      : ['Reads like QSRSoft Raw Item Detail. An item is counted ', span({ key: 'a', style: { fontWeight: 700, color: 'var(--text2)' } }, 'by area'), ', so one count is several entries in one walkthrough — only the ', span({ key: 'b', style: { fontWeight: 700, color: 'var(--text2)' } }, 'final (BINDING)'), ' entry counts. Headline is the item’s ', span({ key: 'c', style: { fontWeight: 700, color: 'var(--text2)' } }, 'official period variance'), '. A ', span({ key: 'd', style: { fontWeight: 700, color: 'var(--text2)' } }, 'recount'), ' = a deliberate SAME-DAY re-verify after the walkthrough (a later store-level count window, or a back-office correction) — graded helped/hurt. Counts on other days are the weekly count progression, not recounts. Click a store, then an item.']),
    div(null, stores.map(s => {
      const isOpen = openStore === s.loc;
      const items = isOpen ? s.items.slice(0, 80) : [];
      return div({ key: s.loc, style: { borderBottom: '1px solid var(--bdr)' } },
        div({ onClick: () => setOpenStore(o => o === s.loc ? null : s.loc), style: { display: 'flex', alignItems: 'baseline', gap: '8px', padding: '8px 4px', cursor: 'pointer' } },
          span({ style: { color: 'var(--text3)' } }, isOpen ? '▾' : '▸'),
          span({ style: { fontWeight: 700, color: 'var(--text)', fontSize: '13px' } }, s.name),
          span({ style: { fontSize: '10px', color: 'var(--text3)', fontFamily: 'ui-monospace,Menlo,monospace' } }, `#${unpad(s.loc)}`),
          span({ style: { marginLeft: 'auto', fontSize: '11px', display: 'flex', gap: '10px' } }, ...(lastEom
            ? [s.regressing ? span({ key: 'r', style: { color: '#f87171', fontWeight: 700 } }, `${s.regressing} regressing`) : null,
               s.improving ? span({ key: 'i', style: { color: '#4ade80', fontWeight: 700 } }, `${s.improving} improving`) : null,
               span({ key: 'n', style: { color: s.momNet < 0 ? '#4ade80' : s.momNet > 0 ? '#f87171' : 'var(--text3)' } }, `net ${s.momNet < 0 ? '−' : s.momNet > 0 ? '+' : ''}${$(Math.abs(s.momNet)).replace('-', '')} vs last period`)]
            : [s.rHurt ? span({ key: 'w', style: { color: '#f87171', fontWeight: 700 } }, `${s.rHurt} recount hurt`) : null,
               s.rHelped ? span({ key: 'h', style: { color: '#4ade80', fontWeight: 700 } }, `${s.rHelped} helped`) : null,
               s.flagged ? span({ key: 'f', style: { color: '#f5bc00', fontWeight: 700 } }, `⚑ ${s.flagged}`) : null,
               span({ key: 'c', style: { color: 'var(--text3)' } }, `${s.recounted} recounted · ${s.items.length} items`)]))),
        isOpen ? div({ style: { padding: '2px 4px 12px 22px' } }, items.map(p => {
          const m = mom(p);
          // "This period" badge is period-specific: the BINDING (EOM) count's base state (single vs
          // counted-by-area). Recount grading rides on the separate ↻ badge; cross-day progression is
          // NOT graded here (that was the old byDay verdict that mislabeled weekly counts as recounts).
          const eomMulti = p.sessions.length ? p.sessions[p.sessions.length - 1].nEntries > 1 : false;
          const [vc, vl] = lastEom ? (MOM_BADGE[m.verdict] || MOM_BADGE.na) : VP_VBADGE[eomMulti ? 'counted-multi' : 'single-count'];
          const iid = `${s.loc}|${p.wrin}`;
          const itemOpen = openItem === iid;
          const off = p.officialVar;
          const offC = off == null ? 'var(--text3)' : Math.abs(off) < 1 ? 'var(--text3)' : off < 0 ? '#f87171' : '#4ade80';
          return div({ key: p.wrin, style: { borderTop: '1px solid var(--bdr)', padding: '4px 0' } },
            div({ onClick: () => setOpenItem(o => o === iid ? null : iid), style: { display: 'flex', alignItems: 'baseline', gap: '8px', fontSize: '12px', flexWrap: 'wrap', cursor: 'pointer' } },
              span({ style: { color: 'var(--text3)', fontSize: '10px' } }, itemOpen ? '▾' : '▸'),
              span({ style: { fontWeight: 600, color: 'var(--text)', minWidth: '150px' } }, p.descr),
              // Headline: last-EOM → this-EOM (month-over-month) OR this period's official variance
              lastEom
                ? span({ title: 'Last period → this period authoritative variance (QSRSoft Variance Stat). Each period already reconciles from the prior EOM, so this is a month-over-month trend.', style: { fontVariantNumeric: 'tabular-nums' } },
                    span({ style: { fontSize: '9px', color: 'var(--text3)', marginRight: '3px' } }, 'last period'),
                    span({ style: { color: 'var(--text2)', fontWeight: 700 } }, m.prior == null ? '—' : $(m.prior)),
                    span({ style: { color: 'var(--text3)', margin: '0 4px' } }, '→'),
                    span({ style: { fontWeight: 800, color: offC } }, m.cur == null ? 'resolved' : $(m.cur)))
                : (off != null
                    ? span({ title: 'Official period variance (QSRSoft Variance Stat)' }, span({ style: { fontSize: '9px', color: 'var(--text3)', marginRight: '3px' } }, 'period var'), span({ style: { fontWeight: 800, color: offC, fontVariantNumeric: 'tabular-nums' } }, $(off)))
                    : span({ style: { fontSize: '10px', color: 'var(--text3)' }, title: 'No authoritative period variance (QSRSoft Variance Stat) for this item — either it is under ±$50 (immaterial), or the Variance-Stat data has not posted / been pulled for this period yet. If EVERY item reads "not flagged", the period’s variance report almost certainly has not landed yet — the ledger below still shows how it was counted.' }, 'not flagged')),
              span({ style: { fontSize: '10px', fontWeight: 700, color: vc, border: `1px solid ${vc}`, borderRadius: '4px', padding: '0 6px' } }, vl),
              lastEom && m.delta != null ? span({ style: { fontSize: '9px', color: m.delta < 0 ? '#4ade80' : '#f87171' } }, `${m.delta < 0 ? '−' : '+'}${$(Math.abs(m.delta)).replace('-', '')}`) : null,
              !lastEom ? (p.nSessions > 1 ? span({ title: 'Counted on more than one day — the weekly count progression. Only the final (EOM) count binds; these are NOT recounts.', style: { fontSize: '9px', color: 'var(--text3)' } }, `${p.nSessions} count days`) : span({ style: { fontSize: '9px', color: 'var(--text3)' } }, `${p.sessions[0].nEntries} ${p.sessions[0].nEntries === 1 ? 'entry' : 'area entries'}`)) : null,
              // Genuine same-day recount badge (store-window model) — graded helped/hurt; ✓ = confirmed back-office.
              !lastEom ? (() => { const rb = recountBadge(p); return rb ? span({ title: rb.title, style: { fontSize: '9px', fontWeight: 700, color: rb.color, border: `1px solid ${rb.color}`, borderRadius: '4px', padding: '0 5px' } }, rb.label) : null; })() : null,
              // Only the $0-verify flag is period-safe. 'held-worse'/'recount-worsened' were cross-day byDay
              // artifacts (they treated the weekly count progression as recounts) — dropped per the finalized model.
              ...((p.flags || []).filter(f => f === 'zero-variance').map(f => span({ key: f, title: 'The binding count posted ≈ $0 variance — statistically improbable; usually the variance just has not posted yet (QSRSoft lag / early lock). Verify.', style: { fontSize: '9px', fontWeight: 700, color: '#38bdf8', border: '1px solid #38bdf8', borderRadius: '4px', padding: '0 5px' } }, '$0 — verify')))),
            itemOpen ? div({ style: { padding: '4px 0 8px 18px' } },
              div({ style: { fontSize: '11px', color: 'var(--text2)', marginBottom: '2px', lineHeight: 1.45 } }, story(p)),
              eventTable(p)) : null);
        })) : null);
    })));
}

const VERDICT_TONE = { good: '#4ade80', warn: '#f5bc00', bad: '#f87171', neutral: 'var(--text3)' };
const jMoney = (n) => `$${Math.round(Math.abs(n || 0)).toLocaleString()}`;

// One item's count-cycle "journey": verdict banner → flow summary → verified
// timeline → signals (facts vs clearly-labeled inferences). The visual guide that
// lets a GM see the path of an item and where it went wrong, backed only by ledger
// facts we can point to.
// ── Action-Items provenance (owner req 2026-07-30) ────────────────────────────
// Each diagnosis finding, with its month-over-month variance history nested underneath
// (click to expand) and a pattern chip that classifies the behavior — Within Tolerance /
// High Variance / Fluctuating / Loss Pattern Forming / Inconsistent Count(s). A look-back
// selector tunes the window. Turns a flat "here's the $ this month" list into "is this a
// one-off or a chronic problem, and is it a real-usage loss or a count-integrity artifact?"
const SEV_COLOR = { critical: '#f87171', high: '#f5bc00', medium: '#38bdf8', info: '#64748b', low: '#64748b' };
function PatternChip({ chip, title }) {
  return span({
    title: title || chip.why,
    style: {
      display: 'inline-block', fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: '9px',
      border: `1px solid ${chip.color}`, color: chip.color, background: `${chip.color}22`, whiteSpace: 'nowrap',
    },
  }, chip.label);
}
function dolStr(v) { const s = v < 0 ? '-' : ''; return `${s}$${Math.abs(Math.round(v || 0)).toLocaleString()}`; }

function ActionItemsProvenance({ findings, history, caseSzByWrin = {}, tolerance = 50 }) {
  const [lookback, setLookback] = useState(6);
  const [open, setOpen] = useState({});
  const items = (findings || []).filter(f => (f.severity ?? 0) >= 1); // medium+ (matches actionItems)
  const periodsAsc = useMemo(() => (history?.periods || []).slice(-lookback), [history, lookback]);
  const seriesByWrin = useMemo(
    () => history ? buildItemSeries(history.rows || [], { periodsAsc }) : new Map(),
    [history, periodsAsc]);

  // Collapse to ONE entry per item (owner req 2026-07-30): a single WRIN can trip several checks
  // (variance-50 + raw-items-timing + uom-sanity …), which read as multiple prioritized rows and
  // leave a manager unsure which line to act on. One line = one decision. The PRIMARY finding (most
  // severe, then largest $) is the current result on the surface; the other checks, the pattern, and
  // the month history all move into the expand.
  const entries = useMemo(() => {
    const byWrin = new Map(), out = [];
    for (const f of items) {
      const wrin = f.data?.wrin != null ? String(f.data.wrin) : null;
      if (!wrin) { out.push({ key: `f${out.length}`, wrin: null, primary: f, others: [] }); continue; }
      const e = byWrin.get(wrin);
      if (!e) { const ne = { key: wrin, wrin, primary: f, others: [] }; byWrin.set(wrin, ne); out.push(ne); }
      else {
        const cmp = ((f.severity ?? 0) - (e.primary.severity ?? 0)) || ((f.dollars || 0) - (e.primary.dollars || 0));
        if (cmp > 0) { e.others.push(e.primary); e.primary = f; } else e.others.push(f);
      }
    }
    return out.sort((a, b) => ((b.primary.severity ?? 0) - (a.primary.severity ?? 0)) || ((b.primary.dollars || 0) - (a.primary.dollars || 0)));
  }, [items]);
  if (!entries.length) return null;

  const toggle = (k) => setOpen(o => ({ ...o, [k]: !o[k] }));

  return div({ style: { marginTop: '12px' } },
    div({ style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', gap: '8px', flexWrap: 'wrap' } },
      div({ style: { fontSize: '12px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em' } }, 'Action items'),
      // Look-back selector — how many periods of history to classify against.
      div({ style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text3)' }, title: 'How many prior monthly count periods to classify the trend against (one EOM count = one month).' },
        'Look back (months)',
        div({ style: { display: 'flex', border: '1px solid var(--bdr2)', borderRadius: '6px', overflow: 'hidden' } },
          [3, 6, 12].map(n => h('button', {
            key: n, onClick: () => setLookback(n),
            title: !history ? 'loading history…' : `last ${n} monthly count periods`,
            disabled: !history,
            style: {
              background: lookback === n ? '#f5bc00' : 'var(--surf3)', color: lookback === n ? '#0f1117' : 'var(--text2)',
              border: 'none', padding: '3px 9px', fontSize: '11px', fontWeight: 700, cursor: history ? 'pointer' : 'default',
            },
          }, n)))),
    ),
    !history && div({ style: { fontSize: '11px', color: 'var(--text3)', marginBottom: '6px' } }, 'Loading item history…'),
    div({ style: { display: 'flex', flexDirection: 'column', gap: '5px' } },
      entries.map((e, i) => {
        const f = e.primary;
        const wrin = e.wrin;
        const it = wrin ? seriesByWrin.get(wrin) : null;
        const series = it?.series || [];
        const cls = series.length ? classifyItemPattern(series, { tolerance }) : null;
        const chips = cls?.chips || [];
        const hasMore = series.length > 0 || e.others.length > 0;
        const isOpen = hasMore && open[e.key];
        const sevColor = SEV_COLOR[f.severityWord] || '#38bdf8';
        const caseSz = wrin ? caseSzByWrin[wrin] : 0;
        return div({ key: e.key, style: { background: 'var(--surf3)', borderRadius: '6px', borderLeft: `3px solid ${sevColor}`, overflow: 'hidden' } },
          // ── ONE line per item: the current result + the action, nothing else on the surface ──
          div({
            onClick: hasMore ? () => toggle(e.key) : undefined,
            style: { display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '6px 9px', cursor: hasMore ? 'pointer' : 'default' },
          },
            hasMore && span({ style: { color: 'var(--text3)', fontSize: '11px', marginTop: '1px', width: '10px', flexShrink: 0 } }, isOpen ? '▾' : '▸'),
            div({ style: { flex: 1, minWidth: 0 } },
              div({ style: { fontSize: '12.5px', color: 'var(--text)' } },
                span({ style: { fontWeight: 700, color: sevColor } }, `[${(f.severityWord || '').toUpperCase()}] `),
                f.title, wrin ? span({ style: { color: 'var(--text3)' } }, ` · WRIN ${wrin}`) : null),
              f.detail && div({ style: { fontSize: '11px', color: 'var(--text3)', marginTop: '1px' } }, f.detail),
              // Surface chips: the single most-actionable pattern chip + a count of other checks —
              // the detail lives in the expand so the row stays one decision.
              (cls?.primary || e.others.length) ? div({ style: { display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap', alignItems: 'center' } },
                cls?.primary ? h(PatternChip, { key: 'p', chip: cls.primary }) : null,
                e.others.length ? span({ style: { fontSize: '10px', color: 'var(--text3)' } }, `+${e.others.length} more check${e.others.length !== 1 ? 's' : ''}`) : null) : null),
          ),
          // ── Expand: everything else — the other checks, the full pattern, the month history ──
          isOpen && div({ style: { padding: '2px 10px 9px 29px', borderTop: '1px solid var(--bdr)' } },
            e.others.length ? div({ style: { margin: '6px 0 2px' } },
              div({ style: { fontSize: '10.5px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '2px' } }, 'Also flagged'),
              e.others.map((o, j3) => div({ key: j3, style: { fontSize: '11px', color: 'var(--text2)', margin: '1px 0' } },
                span({ style: { color: SEV_COLOR[o.severityWord] || 'var(--text3)', fontWeight: 700 } }, `${(o.severityWord || '').toUpperCase()} `),
                `${o.title} — ${o.detail}`))) : null,
            chips.length > 1 ? div({ style: { display: 'flex', gap: '4px', margin: '6px 0 2px', flexWrap: 'wrap' } },
              chips.map(c => h(PatternChip, { key: c.id, chip: c }))) : null,
            cls?.primary && div({ style: { fontSize: '11px', color: cls.primary.color, margin: '6px 0 4px' } },
              `${cls.primary.label}: ${cls.primary.why}`),
            series.length ? h('table', { style: { borderCollapse: 'collapse', width: '100%', fontSize: '11px' } },
              h('thead', null, h('tr', null,
                ['Period', 'Variance $', 'Qty', caseSz > 0 ? 'Cases' : null].filter(Boolean).map(hd =>
                  h('th', { key: hd, style: { textAlign: hd === 'Period' ? 'left' : 'right', padding: '2px 6px', borderBottom: '1px solid var(--bdr)', color: 'var(--text3)', fontWeight: 600 } }, hd)))),
              h('tbody', null, series.map((p, j2) => {
                const worst = Math.abs(p.dol) === Math.max(...series.map(x => Math.abs(x.dol)));
                return h('tr', { key: p.period, style: { background: worst && series.length > 1 ? 'rgba(248,113,113,.08)' : 'transparent' } },
                  h('td', { style: { padding: '2px 6px', color: 'var(--text2)' } }, p.period),
                  h('td', { style: { padding: '2px 6px', textAlign: 'right', fontWeight: 700, color: p.dol < -tolerance ? '#f87171' : p.dol > tolerance ? '#fbbf24' : 'var(--text2)' } }, dolStr(p.dol)),
                  h('td', { style: { padding: '2px 6px', textAlign: 'right', color: 'var(--text3)' } }, (p.qty || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })),
                  caseSz > 0 ? h('td', { style: { padding: '2px 6px', textAlign: 'right', color: 'var(--text3)' } }, (Math.abs(p.qty) / caseSz).toFixed(1)) : null);
              }))) : (wrin ? div({ style: { fontSize: '11px', color: 'var(--text3)' } }, 'No prior-period history for this item.') : null)),
        );
      })),
  );
}

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

    // Variance reconciliation (Note 30 A3 / Notes 36) — the authoritative Variance Stat report
    // figure, framed as ONE "Variance" with Qty and $ sub-values, plus an explicit
    // matches-the-report? check for BOTH: $ (report vs the count-cycle $ total) and Qty
    // (report units vs the ledger/register net count units from the most-recent data).
    (j.reportDollars != null || j.reportUnits != null) && (() => {
      const rd = j.reportDollars, ru = j.reportUnits, jd = j.netCountDollars, ju = j.netCountUnits;
      const dDiff = (rd != null && jd != null) ? Math.abs(rd - jd) : null;   // $ tie-out
      const qDiff = (ru != null && ju != null) ? Math.abs(ru - ju) : null;   // qty tie-out
      const dTies = dDiff != null && dDiff < 1;
      const qTies = qDiff != null && qDiff < 0.5;
      // Overall Y/N: every comparison we HAVE must tie. (If only one side is available, judge on it.)
      const checks = [dDiff != null ? dTies : null, qDiff != null ? qTies : null].filter(v => v != null);
      const allTie = checks.length > 0 && checks.every(Boolean);
      const cs = (j.caseSz && Math.abs(ru || 0) >= j.caseSz) ? ` (≈ ${(ru / j.caseSz).toFixed(1)} cs)` : '';
      const lbl = (t) => span({ style: { fontSize: '9.5px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.03em', fontWeight: 700, marginRight: '3px' } }, t);
      return div({ style: { padding: '8px 12px', borderRadius: '8px', background: 'var(--surf3)', border: '1px solid var(--bdr)' } },
        div({ style: { display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' } },
          span({ style: { fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 700 } }, 'Variance (Stat report)'),
          rd != null && span(null, lbl('$'), span({ style: { fontSize: '14px', fontWeight: 800, color: rd < 0 ? '#f87171' : '#4ade80' } }, `${rd < 0 ? '-' : '+'}${jMoney(rd)}`)),
          ru != null && Math.abs(ru) >= 0.5 && span(null, lbl('Qty'), span({ style: { fontSize: '13px', fontWeight: 700, color: 'var(--text2)' } }, `${ru > 0 ? '+' : ''}${Math.round(ru).toLocaleString()}${j.uom ? ` ${j.uom}` : ''}${cs}`))),
        checks.length > 0 && div({ style: { fontSize: '11px', marginTop: '4px', color: allTie ? '#4ade80' : '#f5bc00' } },
          allTie
            ? `✓ Variance matches report (${[dDiff != null ? '$' : null, qDiff != null ? 'qty' : null].filter(Boolean).join(' + ')} tie out to the ledger).`
            : `⚠ Doesn't fully match — ${[
                dDiff != null && !dTies ? `$ off by ${jMoney(dDiff)} (ledger ${jd < 0 ? '-' : '+'}${jMoney(jd)})` : null,
                qDiff != null && !qTies ? `qty off by ${Math.round(qDiff).toLocaleString()}${j.uom ? ` ${j.uom}` : ''} (ledger ${ju > 0 ? '+' : ''}${Math.round(ju).toLocaleString()})` : null,
              ].filter(Boolean).join('; ')}; the raw-item ledger may not cover every count for this item.`));
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
              span({ style: { width: '9px', flexShrink: 0 } }), hcell('Date / time', '104px'), hcell('Type', '68px'), hcell('Detail', null), hcell(qtyLabel, '70px', true), hcell('$ variance', '62px', true)),
            div({ style: { display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' } },
              shownEvents.map((e, i) => {
                const m = LANE_META[e.lane];
                const win = inWindow(e.when);
                const qtyVal = e.isCount ? e.unitVar : e.qty; // count rows show the counted unit variance
                return div({ key: i, style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 8px', borderRadius: '6px', background: e.isCount ? 'var(--surf2)' : 'transparent', border: e.isCount ? `1px solid ${m.color}55` : '1px solid transparent' } },
                  span({ style: { width: '9px', height: '9px', borderRadius: e.isCount ? '2px' : '50%', background: m.color, flexShrink: 0, transform: e.isCount ? 'rotate(45deg)' : 'none' } }),
                  span({ style: { fontSize: '11.5px', color: 'var(--text3)', minWidth: '104px', fontVariantNumeric: 'tabular-nums' } },
                    e.dt || '—',
                    // Count TIME (Notes 36): when a count was entered — a count logged right at
                    // cutoff, or re-entered late, is a tell for a padded/fixed count. Emphasized on counts.
                    e.tm ? span({ style: { color: e.isCount ? '#f5bc00' : 'var(--text3)', marginLeft: '5px', fontWeight: e.isCount ? 700 : 400 }, title: e.isCount ? 'time this count was entered' : 'entry time' }, e.tm) : null,
                    win && span({ style: { color: '#f5bc00', marginLeft: '4px' }, title: 'inside the count window' }, '●')),
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
// Component → its target key in DEFAULT_TARGETS (all fractions of sales). Opportunity/hot is measured
// vs a component's OWN target, not raw $ or district rate (Condiments is structurally large — Notes 38).
const FOB_COMP_TGT = { comp: 'tCompWaste', raw: 'tRawWaste', cond: 'tCondiment', emp: 'tEmpFood', statv: 'tStatLoss', unex: 'tUnex' };

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
  // Per-component target + over/under (pp) vs a store's OWN target — over target = worse food cost
  // (owner Notes 38: measure vs target, not raw rate/$). District target = sales-weighted.
  const tgtOf = (loc, k) => { const t = (DEFAULT_TARGETS[unpad(loc)] || {})[FOB_COMP_TGT[k]]; return t != null ? Number(t) : null; };
  const overTgt = (loc, k, c) => { const t = tgtOf(loc, k); return t == null ? null : (ratePct(c, k) - t) * 100; };
  const distTgt = k => { let n = 0, d = 0; for (const r of withFob) { const t = tgtOf(r.loc, k); if (t != null) { n += t * r.components.sales; d += r.components.sales; } } return d ? n / d : null; };
  const distFobTgt = (() => { let n = 0, d = 0; for (const r of withFob) { const t = fobTgtOf(r.loc); if (t != null) { n += t * r.components.sales; d += r.components.sales; } } return d ? n / d : null; })();
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
              const dPp = overTgt(r.loc, k, c);           // pp over(+)/under(−) this store's target
              const t = tgtOf(r.loc, k);
              const over = dPp != null && dPp > 0.01, under = dPp != null && dPp < -0.01;
              return h('td', {
                key: k,
                title: t != null ? `${(ratePct(c, k) * 100).toFixed(2)}% vs tgt ${(t * 100).toFixed(2)}% (${dPp >= 0 ? '+' : ''}${dPp.toFixed(2)}pp)` : `${(ratePct(c, k) * 100).toFixed(2)}% — no target set`,
                style: {
                  padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                  color: over ? '#f87171' : under ? '#4ade80' : 'var(--text2)', fontWeight: over ? 700 : 400,
                  background: over ? 'rgba(248,113,113,.08)' : 'transparent',
                },
              }, k === drv && span({ title: 'biggest component for this store', style: { color: '#f5bc00', marginRight: '3px' } }, '▸'), cell(c, k));
            }));
        }),
        // district dollar-weighted actual row
        h('tr', { style: { borderTop: '2px solid var(--bdr2)', background: 'var(--surf2)' } },
          h('td', { style: { padding: '7px 8px', color: 'var(--text)', fontWeight: 700 } }, `District (${withFob.length})`),
          h('td', { style: { padding: '7px 8px', textAlign: 'right', fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' } }, pct2(tot.sales ? tot.fob / tot.sales : null)),
          ...FOB_COMPONENTS.map(([k]) => h('td', { key: k, style: { padding: '7px 8px', textAlign: 'right', fontWeight: 700, color: 'var(--text3)', fontVariantNumeric: 'tabular-nums' } },
            showDollars ? money(tot[k]) : pct2(distPct(k))))),
        // TARGET row (sales-weighted) — the "vs target" reference (owner Notes 38)
        h('tr', { style: { background: 'var(--surf)' } },
          h('td', { style: { padding: '6px 8px', color: 'var(--text3)', fontWeight: 600, fontStyle: 'italic' } }, 'Target (wtd)'),
          h('td', { style: { padding: '6px 8px', textAlign: 'right', color: 'var(--text3)', fontVariantNumeric: 'tabular-nums' } }, pct2(distFobTgt)),
          ...FOB_COMPONENTS.map(([k]) => { const dt = distTgt(k); const dPp = (dt != null && distPct(k) != null) ? (distPct(k) - dt) * 100 : null;
            return h('td', { key: k, style: { padding: '6px 8px', textAlign: 'right', color: 'var(--text3)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } },
              dt != null ? pct2(dt) : '—', dPp != null ? span({ style: { fontSize: '9px', color: dPp > 0.01 ? '#f87171' : '#4ade80', marginLeft: '4px' } }, `${dPp >= 0 ? '+' : ''}${dPp.toFixed(2)}`) : null); })))),
    div({ style: { fontSize: '10.5px', color: 'var(--text3)', fontStyle: 'italic', marginTop: '8px' } },
      '▸ = store’s largest component.  Red = OVER its target · green = under.  Target row = sales-weighted target per component (± = district vs target).  Click a column to sort.'));
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
  if (((r.prog.earlyPctCounted ?? r.prog.pctCounted) || 0) > 0.01) return 'counting';
  return 'notstarted';
}

export function EOMDashboardPanel({ stores, ds, settings, onClose }) {
  const periods = useMemo(() => recentPeriods(4), []);
  const [period, setPeriod] = useState(defaultPeriod());   // early-month → prior month's EOM (still closing)
  const [loading, setLoading] = useState(true);
  const [onHand, setOnHand] = useState([]);
  const [fobRows, setFobRows] = useState([]);
  const [statusMap, setStatusMap] = useState({}); // loc -> saved eom_count_status
  const [saving, setSaving] = useState('');
  const [draft, setDraft] = useState(null); // { loc, name, subject, body, rows, uncounted } for the comms modal
  const [copied, setCopied] = useState(false);
  const [draftText, setDraftText] = useState(false); // false = table view, true = raw text view
  const [draftFull, setDraftFull] = useState(false); // false = abbreviated recap, true = full report (text view)
  const [shareMsg, setShareMsg] = useState('');      // transient result of "Share link" (URL copied / error)
  const [wasteOpen, setWasteOpen] = useState(false); // Waste-analysis scan modal (Notes 40 #2)
  const [wasteScan, setWasteScan] = useState(null);
  const [wasteDrill, setWasteDrill] = useState(null); // loc currently expanded to its raw waste events
  const [variance, setVariance] = useState([]);
  const [prevVariance, setPrevVariance] = useState([]);   // prior period's variance stat → "vs Last EOM" baseline
  const [waste, setWaste] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [rawDetail, setRawDetail] = useState([]);
  const [diag, setDiag] = useState(null); // { name, result, report } for the diagnosis modal
  const [diagCopied, setDiagCopied] = useState(false);
  const [dispByWrin, setDispByWrin] = useState({}); // #38 verify-&-clear: wrin -> disposition
  const [dispBusy, setDispBusy] = useState(null);   // wrin currently saving
  const [journeys, setJourneys] = useState(null); // { loc, name, list, selectedWrin } item-journey modal
  const [fobOpen, setFobOpen] = useState(false); // FOB multi-location variance matrix modal
  const [fobDollars, setFobDollars] = useState(false); // matrix: show $ vs % of sales
  const [fobSort, setFobSort] = useState('fob'); // matrix sort column
  const [scope, setScope] = useState('all'); // 'all' | 'FL' | 'OK' — state filter
  const [oneStore, setOneStore] = useState(''); // '' = all stores in scope, else a single loc
  const [patch, setPatch] = useState('');       // '' = all supervisors, else a supervisor's patch
  const patchGroups = useMemo(() => { try { return supervisorGroups() || {}; } catch { return {}; } }, []);
  const [mode, setMode] = useState(() => defaultModeFor(defaultPeriod())); // 'eom' | 'progress'
  // Re-default the mode when the period changes (manual toggle still overrides after).
  useEffect(() => { setMode(defaultModeFor(period)); }, [period]);
  const [diagCfg, setDiagCfg] = useState(null); // saved check overrides (or null = defaults)
  const [flowOpen, setFlowOpen] = useState(false); // flow-editor modal
  const [flowDraft, setFlowDraft] = useState([]); // editable copy while the modal is open
  const [flowSaving, setFlowSaving] = useState(false);
  // Chronic Offenders — district-wide past-period pattern scan (on-demand; explicit run only).
  const [chronicOpen, setChronicOpen] = useState(false);
  const [chronic, setChronic] = useState(null);      // { items, periods, nRows, error }
  const [chronicBusy, setChronicBusy] = useState(false);
  const [chronicLookback, setChronicLookback] = useState(6);
  const [chronicOpenRows, setChronicOpenRows] = useState({}); // wrin -> expanded
  // Count Reliability — accuracy/consistency score per store (owner north-star). On-demand.
  const [relOpen, setRelOpen] = useState(false);
  const [rel, setRel] = useState(null);       // { stores, periods, nRows, error }
  const [relBusy, setRelBusy] = useState(false);
  const [relLookback, setRelLookback] = useState(6);
  const [relOpenRows, setRelOpenRows] = useState({}); // loc -> expanded (supporting-fact drill-down)
  // Rubber-band scan — padding→collapse integrity pattern across periods (owner req). On-demand.
  const [rbOpen, setRbOpen] = useState(false);
  const [rb, setRb] = useState(null);            // { stores, periods, nRows, error }
  const [rbBusy, setRbBusy] = useState(false);
  const [rbLookback, setRbLookback] = useState(6);
  const [rbOpenRows, setRbOpenRows] = useState({});
  // FOB Cross-Check — reconcile a pasted external AI FOB analysis (e.g. CoachQ) vs Meridian's real
  // numbers; catches internal fabrications (components don't sum to FOB$) + divergences.
  const [xcOpen, setXcOpen] = useState(false);
  const [xcText, setXcText] = useState('');
  const [xcResult, setXcResult] = useState(null);
  // Bulk EOM follow-up — generate every location's message at once (owner sends). Generation only.
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkDrafts, setBulkDrafts] = useState([]);
  const [bulkCopied, setBulkCopied] = useState('');
  // District EOM Summary — roll-up across the current scope (FOB + components, count, opportunity).
  const [sumOpen, setSumOpen] = useState(false);

  // ── Baseline lock + day-2 Change Monitor ─────────────────────────────────────
  const [locking, setLocking] = useState(false);      // "Lock baseline" in-flight
  const [lockMsg, setLockMsg] = useState('');         // transient result of a lock
  const [monOpen, setMonOpen] = useState(false);      // Change Monitor modal
  const [monBusy, setMonBusy] = useState(false);
  const [mon, setMon] = useState(null);               // { diff, takenAt, nBaseline, error }
  const [monOpenRows, setMonOpenRows] = useState({});  // loc -> expanded item deltas
  const [monView, setMonView] = useState('progression'); // 'progression' (ledger-derived, v2) | 'diff' (snapshot)
  const [riddleOpen, setRiddleOpen] = useState(false);   // 🔬 FOB Root-Cause Analysis modal
  const [fobRepOpen, setFobRepOpen] = useState(false);   // 📊 FOB Report modal
  const [fobRepStore, setFobRepStore] = useState(null);  // loc expanded in the report
  const [riddleStore, setRiddleStore] = useState(null);  // loc expanded to its harmful recount items
  const [secReview, setSecReview] = useState({});     // loc -> { status, note } (day-2 secondary review)
  // On-demand EOM pulls (Notes 35). A manual button forces the pull regardless of the
  // count-window / 8a–6p-CT gate. Needs the trigger-dar-sync edge fn redeployed with the
  // onhand/variance allowlist entries (added in supabase/functions/trigger-dar-sync).
  const [pulling, setPulling] = useState('');   // '' | 'onhand' | 'variance'
  const [pullMsg, setPullMsg] = useState(null);  // { ok, text }
  const doPull = useCallback(async (wf, label) => {
    setPulling(wf); setPullMsg(null);
    try {
      const r = await triggerSync(wf, {});
      if (r && r.error) setPullMsg({ ok: false, text: `✗ ${label}: ${r.error}` });
      else setPullMsg({ ok: true, text: `✓ ${label} pull started — data refreshes in ~5–10 min, then reload.` });
    } catch (e) { setPullMsg({ ok: false, text: `✗ ${label}: ${e.message || 'failed'}` }); }
    finally { setPulling(''); }
  }, []);

  // Load the editable diagnosis-flow config once on mount.
  useEffect(() => { loadEomDiagConfig().then(c => { if (c) setDiagCfg(c); }).catch(() => {}); }, []);
  // Self-serve beverage-tower locs (integrity #47) — suppress the fountain-yield "loss" flag for
  // stores where low yield is structural (free refills). One tiny 2-column read, once.
  const [selfServeTowers, setSelfServeTowers] = useState(new Set());
  // Fountain-yield look-back baseline (#52): per-store mean/sd of prior-months' fountain-short totals,
  // so the bib-yield check can tell a store's structural free-refill norm from an abnormal spike.
  const [fountainBaselineByLoc, setFountainBaselineByLoc] = useState({});
  useEffect(() => {
    let cancelled = false;
    const priorPs = lastPeriods(period, 4).slice(0, 3);   // 3 completed months before the current
    Promise.all(priorPs.map(pp => loadQsrVarianceStat({ period: pp }).catch(() => []))).then(mons => {
      if (cancelled) return;
      const shortsByLoc = {};
      for (const rows of mons) {
        const byLoc = {};
        for (const v of (rows || [])) { const u = unpad(v.loc); (byLoc[u] || (byLoc[u] = [])).push(v); }
        for (const u in byLoc) (shortsByLoc[u] || (shortsByLoc[u] = [])).push(fountainShortTotal(byLoc[u]));
      }
      const base = {};
      for (const u in shortsByLoc) base[u] = fountainBaseline(shortsByLoc[u]);
      setFountainBaselineByLoc(base);
    }).catch(() => { if (!cancelled) setFountainBaselineByLoc({}); });
    return () => { cancelled = true; };
  }, [period]);
  const [exceptions, setExceptions] = useState({});   // loc -> {kind, acceptedDate, approvedBy, note} (count-date exceptions)
  useEffect(() => { loadSelfServeTowerLocs().then(setSelfServeTowers).catch(() => {}); }, []);
  // The active check registry (defaults + saved overrides), passed to runDiagnosis.
  const activeChecks = useMemo(() => applyChecksConfig(diagCfg || []), [diagCfg]);

  const load = useCallback(async (p) => {
    setLoading(true);
    try {
      const prevP = lastPeriods(p, 2)[0];   // previous month → "vs Last EOM" baseline
      const [oh, fob, st, vr, wa, tr, rd, pvr] = await Promise.all([
        loadQsrOnHand({ period: p }),
        loadQsrFob().catch(() => []),
        loadEomCountStatus({ period: p }).catch(() => []),
        loadQsrVarianceStat({ period: p }).catch(() => []),
        loadQsrWaste({ period: p }).catch(() => []),
        loadQsrTransfers({ period: p }).catch(() => []),
        loadQsrRawItemDetail({ period: p }).catch(() => []),
        loadQsrVarianceStat({ period: prevP }).catch(() => []),
      ]);
      setOnHand(oh || []);
      setFobRows(fob || []);
      setVariance(vr || []);
      setPrevVariance(pvr || []);
      setWaste(wa || []);
      setTransfers(tr || []);
      setRawDetail(rd || []);
      const m = {}; (st || []).forEach(r => { m[String(r.loc)] = r; });
      setStatusMap(m);
      loadEomCountExceptions({ period: p }).then(x => setExceptions(x || {})).catch(() => setExceptions({}));
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
  const prevVarByLoc = useMemo(() => groupByLoc(prevVariance), [prevVariance]);
  const wasteByLoc = useMemo(() => groupByLoc(waste), [waste]);
  const xferByLoc = useMemo(() => groupByLoc(transfers), [transfers]);
  // Unmatched-transfer set (integrity #47) — computed district-wide over ALL loaded transfers (the
  // mirror side lives at another store), keyed by `${normLoc}|${transferId}`. Fed to every store's
  // diagnosis so the transfers check can flag a transfer with no counterparty side.
  const unmatchedXfer = useMemo(() => flagUnmatchedTransfers(transfers, [...new Set(transfers.map(t => t.loc))]), [transfers]);
  // Raw-item registers grouped by loc; reshape for the engine (counts = inventory events).
  const rawByLoc = useMemo(() => {
    const m = {};
    for (const r of (rawDetail || [])) {
      const counts = (r.history || []).filter(h => h.isCount);
      (m[String(r.loc)] || (m[String(r.loc)] = [])).push({ wrin: r.wrin, descr: r.descr, history: r.history, counts, caseSz: r.caseSz, uom: r.uom });
    }
    return m;
  }, [rawDetail]);

  // Count timing per store (#45) — when the EOM count began/ended + total duration, from the
  // raw-item count-event timestamps. Insightful for pace/coaching + spotting a padded-at-cutoff count.
  const timingByLoc = useMemo(() => {
    const m = {};
    for (const loc in rawByLoc) { const t = computeCountTiming(rawByLoc[loc]); if (t) m[loc] = t; }
    return m;
  }, [rawByLoc]);

  // Weekly-count cadence per store (Notes 40 #1) — is each store doing its weekly full Food/Condiment
  // count? Detected weekly day, last full count + days-since, weekly vs daily-spot sessions. Overdue
  // ≥ 8 days. Powers the Count Cycle view's cadence monitor.
  const cadenceByLoc = useMemo(() => {
    const m = {};
    for (const loc in rawByLoc) { try { m[loc] = analyzeCountCadence(rawByLoc[loc], { asOf: new Date() }); } catch { /* skip */ } }
    return m;
  }, [rawByLoc]);

  // Change Monitor v2 (Notes 41): per-store item variance progressions read straight from the raw ledger
  // — base count → recount steps → improved/hurt/held. No lock needed; works for any period reviewed.
  const progByLoc = useMemo(() => {
    const m = {};
    for (const loc in rawByLoc) {
      // Authoritative period $ variance per item (qsr_variance_stat) → headline the real number,
      // not the count-impact chain. Keyed by wrin for the session engine to attach as officialVar.
      const statVar = {};
      for (const v of (varByLoc[loc] || [])) if (v.dolDiff != null && v.dolDiff !== 0)statVar[String(v.wrin)] = v.dolDiff;
      // Prior-month authoritative variance per item → the "vs Last EOM" baseline (month-over-month).
      const priorStatVar = {};
      for (const v of (prevVarByLoc[loc] || [])) if (v.dolDiff != null && v.dolDiff !== 0)priorStatVar[String(v.wrin)] = v.dolDiff;
      try { m[loc] = storeVarianceProgressions(rawByLoc[loc], { statVar, priorStatVar }); } catch { m[loc] = []; }
    }
    return m;
  }, [rawByLoc, varByLoc, prevVarByLoc]);

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
      const acceptEarly = !!exceptions[loc];   // count-date exception → early count accepted as EOM count
      const prog = computeCountProgress(byLoc[loc] || [], { period, asOf, acceptEarly });
      // Specific still-uncounted items per class (Notes 35) — so a ≥90% class can show
      // exactly what's left (hover on the class chip + in the diagnosis/comms report).
      const incByClass = {};
      try { for (const b of diagnoseIncompleteCount(byLoc[loc] || [], { period, asOf, acceptEarly }).byClass) incByClass[b.cls] = b.items; } catch {}
      const f = fob[loc] || {};
      const st = statusMap[loc] || {};
      return {
        loc,
        name: nm(loc),
        org: getStoreOrg(unpad(loc)),
        prog,
        uncountedByClass: incByClass,
        fobPct: f.fobPct ?? null,
        fob$: f.fob ?? null,
        components: f,
        hasDiag: hasDiagData.has(loc),
        diagnosis: st.diagnosisStatus || 'pending',
        comms: st.commsStatus || 'none',
        commsRecipient: st.commsRecipient || '',
        exception: exceptions[loc] || null,   // count-date exception (accepted early count), if any
      };
    });
    // Counted + counting locations to the TOP (Notes 35) — order by the same scoreboard
    // bucket priority everywhere (ready→counting→not-started→reviewed→comms), then least-
    // counted first within a bucket, then name. Surfaces the stores actively in play.
    out.sort((a, b) => (SB_ORDER[sbBucket(a)] - SB_ORDER[sbBucket(b)]) || (a.prog.pctCounted - b.prog.pctCounted) || a.name.localeCompare(b.name));
    return out;
  }, [byLoc, varByLoc, wasteByLoc, xferByLoc, fobRows, statusMap, period, hasDiagData, exceptions]);

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
    const patchLocs = patch ? new Set((patchGroups[patch] || []).map(unpad)) : null;
    return allRows.filter(r =>
      (scope === 'all' || stateOf(r.org) === scope) &&
      (!patchLocs || patchLocs.has(unpad(r.loc))) &&
      (!oneStore || r.loc === oneStore));
  }, [allRows, scope, oneStore, patch, patchGroups]);

  // FOB Root-Cause Analysis (Notes 41) — recount impact + FOB consistency, SCOPED to the current filter
  // (one / all / patch). Same engine as the CI scan, so numbers are verifiable. Declared AFTER `rows`
  // (it reads it) to avoid a temporal-dead-zone crash.
  const riddle = useMemo(() => {
    const scoped = new Set(rows.map(r => unpad(r.loc)));
    const rawScoped = {}; for (const loc of Object.keys(rawByLoc)) if (scoped.has(unpad(loc))) rawScoped[loc] = rawByLoc[loc];
    const fobScoped = (fobRows || []).filter(r => scoped.has(unpad(r.loc)));
    const impact = recountImpactByStore(rawScoped);
    const consistency = fobConsistencyByStore(fobScoped);
    const months = [...new Set(fobScoped.map(r => (typeof r.date === 'string' ? r.date : '').slice(0, 7)).filter(Boolean))].sort();
    return { impact, consistency, months, nFob: fobScoped.length };
  }, [rows, rawByLoc, fobRows]);

  // FOB Report (Notes 42 #1) — all-location EOM-lean read, SCOPED to the current filter: OK/FL summary →
  // biggest opportunities → patch → store, with trend / worst component / top losers / masking / actions.
  const patchOfLoc = useCallback((u) => {
    for (const p of Object.keys(patchGroups || {})) if ((patchGroups[p] || []).map(unpad).includes(u)) return p;
    return null;
  }, [patchGroups]);
  const fobReport = useMemo(() => {
    const prevP = lastPeriods(period, 2)[0];
    const months = lastPeriods(period, 5);   // ascending
    const fobByMonth = {}; for (const mo of months) fobByMonth[mo] = fobByStore(fobRows, mo);
    // Report the latest month with REAL FOB (non-zero) — early in a month the MTD row is all zeros, so
    // at the start of a period we fall back to last completed EOM (matches how the owner reviews it).
    let reportPeriod = period;
    for (let i = months.length - 1; i >= 0; i--) { const f = fobByMonth[months[i]] || {}; if (Object.values(f).some(x => x && x.fobPct != null)) { reportPeriod = months[i]; break; } }
    const cur = fobByMonth[reportPeriod] || {};
    const monthlyByLoc = {};
    for (const mo of months) { if (mo > reportPeriod) continue; const f = fobByMonth[mo] || {}; for (const loc in f) if (f[loc]?.fobPct != null) (monthlyByLoc[loc] || (monthlyByLoc[loc] = {}))[mo] = f[loc].fobPct; }
    const varSource = reportPeriod === period ? varByLoc : reportPeriod === prevP ? prevVarByLoc : {};
    const get = (s) => {
      const loc = String(s.loc), u = unpad(loc);
      const fob = cur[loc] || cur[u] || null;
      const tg = DEFAULT_TARGETS[u] || {};
      const compActual = (fob && fob.sales) ? {
        statv: fob.statv / fob.sales, comp: fob.comp / fob.sales, raw: fob.raw / fob.sales,
        cond: fob.cond / fob.sales, emp: fob.emp / fob.sales, unex: fob.unex / fob.sales,
      } : null;
      const compTarget = { statv: tg.tStatLoss, comp: tg.tCompWaste, raw: tg.tRawWaste, cond: tg.tCondiment, emp: tg.tEmpFood, unex: tg.tUnex };
      return {
        name: s.name, org: s.org === 'emerald' ? 'FL' : 'OK', patch: patchOfLoc(u),
        fob, target: fobTgtOf(loc), monthly: monthlyByLoc[loc] || monthlyByLoc[u] || {},
        varRows: (varSource[loc] || varSource[u] || []).filter(v => v.hasDollars).map(v => ({ descr: v.descr, wrin: v.wrin, dolDiff: v.dolDiff })),
        compActual, compTarget,
      };
    };
    return { ...buildFobReport({ stores: rows, get }), reportPeriod };
  }, [rows, fobRows, varByLoc, prevVarByLoc, period, patchOfLoc]);

  // FOB Report — printable (→ PDF) + CSV export, so it can go into a DO/GM review.
  const $ = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n || 0)).toLocaleString();
  const fobRepPrintHtml = () => {
    const R = fobReport, esc = s => String(s || '').replace(/</g, '&lt;');
    const gap = r => r.gapPP == null ? '' : `${r.gapPP > 0 ? '+' : ''}${r.gapPP}pp`;
    const head = `<h1>FOB Report — ${scopeLabel()}</h1><p class="sub">Reporting ${R.reportPeriod}${R.reportPeriod !== period ? ` (latest month with real FOB; ${period} MTD not populated)` : ''} · ${R.summary.nStores} store(s) · dollar-weighted FOB vs target · avg ${R.summary.avgFobPP ?? '—'}% · ${R.summary.overTarget} over target · ${$(R.summary.oppDollars)}/mo opportunity</p>`;
    const opps = R.opportunities.length ? `<h1 style="font-size:14px">Biggest opportunities</h1><table><thead><tr><th>Store</th><th>Mkt</th><th>FOB</th><th>Tgt</th><th>Gap</th><th>Trend</th><th>Action</th></tr></thead><tbody>${R.opportunities.map(r => `<tr><td class="g">${esc(r.name || nm(r.loc))}</td><td>${r.org}</td><td class="g${r.overTarget ? ' r' : ''}">${pct2(r.fobPct)}</td><td>${pct2(r.target)}</td><td class="${r.gapPP > 0 ? 'r' : ''}">${gap(r)}</td><td>${r.trend.dir}</td><td>${esc(r.actions[0] || '')}</td></tr>`).join('')}</tbody></table>` : '<p class="sub">No over-target or regressing stores in scope — clean.</p>';
    const byOrg = R.orgs.map(o => `<h1 style="font-size:14px">${o.label} — avg ${o.summary.avgFobPP ?? '—'}%, ${o.summary.overTarget}/${o.summary.nStores} over target, ${o.summary.regressing} regressing</h1><table><thead><tr><th>Store</th><th>Patch</th><th>FOB</th><th>Tgt</th><th>Gap</th><th>Trend</th><th>Top item losers</th></tr></thead><tbody>${o.stores.map(r => `<tr><td class="g">${esc(r.name || nm(r.loc))}</td><td>${esc(r.patch || '')}</td><td class="g${r.overTarget ? ' r' : ''}">${pct2(r.fobPct)}</td><td>${pct2(r.target)}</td><td class="${r.gapPP > 0 ? 'r' : ''}">${gap(r)}</td><td>${r.trend.dir}${r.masking ? ' · masking' : ''}</td><td>${esc(r.topItems.map(i => `${i.descr} ${$(i.dolDiff)}`).join('; '))}</td></tr>`).join('')}</tbody></table>`).join('');
    return head + opps + byOrg;
  };
  // Leadership summary narrative — the district position + the math of laggards eroding achiever gains.
  const leadershipLines = () => {
    const L = fobReport.leadership; if (!L || L.districtFobPct == null) return [];
    const pctf = f => (f * 100).toFixed(2) + '%';
    const lines = [];
    lines.push(`District FOB is ${pctf(L.districtFobPct)} (dollar-weighted: ${$(L.totFob)} of food-over-base on ${$(L.totSales)} in sales) vs a ${pctf(L.districtTarget)} target — ${L.net > 0 ? '+' : ''}${$(L.net)}/mo ${L.net > 0 ? 'OVER' : 'under'} target across ${L.nStores} stores.`);
    if (L.achievers.length || L.laggards.length) {
      lines.push(`${L.achievers.length} store${L.achievers.length === 1 ? '' : 's'} under target banked ${$(L.savings)}/mo in savings; ${L.laggards.length} store${L.laggards.length === 1 ? '' : 's'} over target ran ${$(L.excess)}/mo over — offsetting ${$(L.erased)} of those gains.`);
      lines.push(L.net > 0
        ? `The over-target stores more than offset the top performers' gains, leaving the district ${$(L.net)}/mo over target — closing that gap is the whole opportunity.`
        : `The top performers still edged the district ${$(-L.net)}/mo ahead — and bringing the focus stores on board would add ${$(L.excess)}/mo more.`);
      const top3 = L.laggards.slice(0, 3).reduce((s, r) => s + (r.oppDollars || 0), 0);
      if (L.laggards.length) lines.push(`Bringing just the top ${Math.min(3, L.laggards.length)} focus stores to target recovers ${$(top3)}/mo.`);
    }
    return lines;
  };
  const leadershipPrintHtml = () => {
    const R = fobReport, L = R.leadership, esc = s => String(s || '').replace(/</g, '&lt;');
    const pctf = f => f == null ? '—' : (f * 100).toFixed(2) + '%';
    const head = `<h1>FOB Leadership Summary — ${scopeLabel()}</h1><p class="sub">Reporting ${R.reportPeriod} · ${R.summary.nStores} store(s) · dollar-weighted · for above-store leaders</p>`;
    const narrative = `<p style="font-size:13px;line-height:1.6;background:#f7f7f4;border-left:3px solid #b98a00;padding:10px 14px;margin:0 0 16px">${leadershipLines().map(esc).join('<br><br>')}</p>`;
    const lag = L.laggards.length ? `<h1 style="font-size:14px">Focus Stores — bringing these to target gets everyone on board (${$(L.excess)}/mo at stake)</h1><table><thead><tr><th>Store</th><th>Mkt</th><th>FOB</th><th>Tgt</th><th>Over by</th><th>$/mo over</th><th>What to do</th></tr></thead><tbody>${L.laggards.map(r => `<tr><td class="g">${esc(r.name)}</td><td>${r.org}</td><td class="g r">${pctf(r.fobPct)}</td><td>${pctf(r.target)}</td><td class="r">+${r.gapPP}pp</td><td class="g r">${$(r.oppDollars)}</td><td>${esc(r.actions[0] || '')}</td></tr>`).join('')}</tbody></table>` : '<p class="sub">No stores over target — the whole scope is at/under. 🎉</p>';
    const ach = L.achievers.length ? `<h1 style="font-size:14px">Top Performers — the model (${$(L.savings)}/mo banked)</h1><table><thead><tr><th>Store</th><th>Mkt</th><th>FOB</th><th>Tgt</th><th>Under by</th><th>$/mo saved</th></tr></thead><tbody>${L.achievers.map(r => `<tr><td class="g">${esc(r.name)}</td><td>${r.org}</td><td class="g">${pctf(r.fobPct)}</td><td>${pctf(r.target)}</td><td>${r.gapPP}pp</td><td class="g">${$(r.savingsDollars)}</td></tr>`).join('')}</tbody></table>` : '';
    return head + narrative + lag + ach;
  };
  const fobRepCsv = () => {
    const R = fobReport;
    const rows = [['Market', 'Patch', 'Store', 'Loc', 'FOB%', 'Target%', 'GapPP', 'Trend', 'Masking', 'OppDollarsPerMo', 'TopAction']];
    for (const o of R.orgs) for (const r of o.stores) rows.push([o.label, r.patch || '', r.name || nm(r.loc), unpad(r.loc),
      r.fobPct != null ? (r.fobPct * 100).toFixed(2) : '', r.target != null ? (r.target * 100).toFixed(2) : '', r.gapPP ?? '',
      r.trend.dir, r.masking ? 'yes' : '', Math.round(r.oppDollars || 0), r.actions[0] || '']);
    return rows.map(r => r.map(csvCell).join(',')).join('\n');
  };

  // Store-picker options: scoped by state + patch but NOT by the single-store selection, so the
  // dropdown always lists every store you could switch to (not just the one already chosen).
  const pickerStores = useMemo(() => {
    const stateOf = (org) => org === 'emerald' ? 'FL' : 'OK';
    const patchLocs = patch ? new Set((patchGroups[patch] || []).map(unpad)) : null;
    return allRows.filter(r =>
      (scope === 'all' || stateOf(r.org) === scope) &&
      (!patchLocs || patchLocs.has(unpad(r.loc))));
  }, [allRows, scope, patch, patchGroups]);

  // Chronic Offenders — on-demand district-wide scan. Explicit run only (reads many rows), scoped
  // to the current location filter. Which items are chronically bad on our own pattern principles?
  const runChronicScan = useCallback(async (lb) => {
    const lookback = lb ?? chronicLookback;
    setChronicBusy(true); setChronicOpen(true); setChronicOpenRows({});
    try {
      const periodsAsc = lastPeriods(period, lookback);
      const scopedLocs = [...new Set(rows.map(r => String(r.loc)))];
      const varRows = await loadQsrVarianceHistoryAll({ periods: periodsAsc, locs: scopedLocs });
      setChronic({ items: scanChronicOffenders(varRows, { periodsAsc, tolerance: 50 }), periods: periodsAsc, nRows: varRows.length, _rows: varRows });
    } catch (e) {
      setChronic({ items: [], periods: [], nRows: 0, error: String(e?.message || e) });
    }
    setChronicBusy(false);
  }, [period, rows, chronicLookback]);

  // Count Reliability scan — same district variance pull, scored per store (least reliable first).
  const runReliabilityScan = useCallback(async (lb) => {
    const lookback = lb ?? relLookback;
    setRelBusy(true); setRelOpen(true);
    try {
      const periodsAsc = lastPeriods(period, lookback);
      const scopedLocs = [...new Set(rows.map(r => String(r.loc)))];
      const varRows = await loadQsrVarianceHistoryAll({ periods: periodsAsc, locs: scopedLocs });
      setRel({ stores: scanCountReliability(varRows, { periodsAsc, tolerance: 50 }), periods: periodsAsc, nRows: varRows.length });
    } catch (e) {
      setRel({ stores: [], periods: [], nRows: 0, error: String(e?.message || e) });
    }
    setRelBusy(false);
  }, [period, rows, relLookback]);

  // Rubber-band scan — same district variance pull, detects the padding→collapse pattern per store.
  const runRubberBandScan = useCallback(async (lb) => {
    const lookback = lb ?? rbLookback;
    setRbBusy(true); setRbOpen(true); setRbOpenRows({});
    try {
      const periodsAsc = lastPeriods(period, lookback);
      const scopedLocs = [...new Set(rows.map(r => String(r.loc)))];
      const varRows = await loadQsrVarianceHistoryAll({ periods: periodsAsc, locs: scopedLocs });
      setRb({ stores: scanRubberBand(varRows, { periodsAsc, tolerance: 50 }), periods: periodsAsc, nRows: varRows.length });
    } catch (e) {
      setRb({ stores: [], periods: [], nRows: 0, error: String(e?.message || e) });
    }
    setRbBusy(false);
  }, [period, rows, rbLookback]);

  // Meridian's real per-store FOB (from the loaded FOB stream) — the ground truth for cross-check.
  const meridianByStore = useMemo(() => {
    const m = {};
    for (const r of allRows) {
      const c = r.components || {};
      m[unpad(r.loc)] = { fob: r.fob$ || 0, fobPct: r.fobPct || 0, sales: c.sales || 0,
        comp: c.comp, raw: c.raw, cond: c.cond, emp: c.emp, statv: c.statv, unex: c.unex };
    }
    return m;
  }, [allRows]);
  const runXcheck = useCallback(() => {
    const parsed = parseExternalFob(xcText, allRows.map(r => r.loc));
    setXcResult(reconcileFob(parsed, meridianByStore));
  }, [xcText, allRows, meridianByStore]);

  // ── Baseline lock + Change Monitor ───────────────────────────────────────────
  // Build a FULL live snapshot of one store from what's already loaded (on-hand ∪ variance + FOB).
  // Used identically to WRITE a baseline and to compute the CURRENT side of the diff — no drift.
  const isoDay = (d) => !d ? null : (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
  const buildLiveSnapshot = useCallback((r) => {
    const loc = String(r.loc);
    const oh = byLoc[loc] || [], vr = varByLoc[loc] || [];
    const vByWrin = {}; for (const v of vr) vByWrin[String(v.wrin)] = v;
    // RAW-source variance (the var-0 fix): the Raw Item count event logs the variance the instant a
    // manager submits (owner-confirmed), whereas the aggregate qsr_variance_stat lags. Prefer raw; the
    // aggregate is the fallback. So the baseline/current never capture a stale $0 for a counted item.
    const rawV = latestVarianceByWrin(rawByLoc[loc] || [], { asOf: new Date() });
    const dolOf = w => rawV[w]?.dolDiff ?? vByWrin[w]?.dolDiff ?? null;
    const varOf = w => rawV[w]?.variance ?? vByWrin[w]?.variance ?? null;
    const items = oh.map(o => {
      const w = String(o.wrin), v = vByWrin[w] || {};
      return {
        wrin: w, descr: o.descr || v.descr || '', cls: o.cls || v.cls || '',
        qty: o.totalUnits ?? null, onHandAmt: o.onHandAmt ?? null,
        dolDiff: dolOf(w), variance: varOf(w),
        lastCounted: isoDay(o.lastCounted) || isoDay(o.lastSubmitted) || rawV[w]?.lastCounted || null,
      };
    });
    // Variance-only items (no on-hand row) — retain them too so nothing is lost.
    const seen = new Set(items.map(i => i.wrin));
    for (const v of vr) { const w = String(v.wrin); if (!seen.has(w)) items.push({ wrin: w, descr: v.descr || '', cls: v.cls || '', qty: null, onHandAmt: null, dolDiff: dolOf(w), variance: varOf(w), lastCounted: rawV[w]?.lastCounted || null }); }
    const c = r.components || {};
    return {
      loc, period, name: r.name,
      fob: { sales: c.sales ?? null, fob: r.fob$ ?? null, fobPct: r.fobPct ?? null, comp: c.comp ?? null, raw: c.raw ?? null, cond: c.cond ?? null, emp: c.emp ?? null, statv: c.statv ?? null, unex: c.unex ?? null, asOf: c.asOf ?? null },
      count: { pctCounted: r.prog?.pctCounted ?? null, earlyPctCounted: r.prog?.earlyPctCounted ?? null, believesDone: !!r.prog?.believesDone, byClass: r.prog?.byClass ?? null },
      items,
    };
  }, [byLoc, varByLoc, rawByLoc, period]);

  // Lock a baseline for EVERY loaded store (not just the current filter) so the baseline is complete.
  const lockBaseline = useCallback(async () => {
    if (locking) return;
    setLocking(true); setLockMsg('');
    try {
      const snaps = allRows.map(r => ({ ...buildLiveSnapshot(r), kind: 'baseline', label: 'manual', takenAt: new Date() }));
      const res = await saveEomSnapshots(snaps);
      if (res.errors?.length) setLockMsg(`Saved ${res.saved}; ${res.errors.length} error(s): ${res.errors[0]}`);
      else setLockMsg(`✓ Locked baseline for ${res.saved} store${res.saved === 1 ? '' : 's'} at ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
    } catch (e) { setLockMsg('Lock failed: ' + (e?.message || e)); }
    setLocking(false);
  }, [allRows, buildLiveSnapshot, locking]);

  // Open the Change Monitor. LEDGER-DERIVED (v4.743, spec §5b): the baseline is each item's variance AT
  // COUNT-COMPLETION, read straight from the raw ledger — no frozen snapshot, no $0 ghosts, no manual lock.
  // The auto "count-complete" snapshot is still used ONLY for the store-level FOB base→now (an aggregate the
  // ledger doesn't carry). Item helped/hurt/recount + the engagement verdict all come from the ledger.
  const openMonitor = useCallback(async () => {
    setMonOpen(true); setMonBusy(true); setMonOpenRows({}); setMon(null);
    try {
      const [ccSnaps, sr] = await Promise.all([
        loadEomSnapshots({ period, kind: 'count-complete', latestPerLoc: true }).catch(() => []),
        loadEomSecondaryReview({ period }),
      ]);
      setSecReview(sr || {});
      const pick = (map, loc) => map[unpad(loc)] ?? map[String(loc)] ?? map[String(loc).padStart(7, '0')] ?? null;
      // Close window = the last few days of the period (the EOM count + any recounts). An item's FIRST count
      // in the window is its session count; later-day counts are recounts. Same start for every store.
      const closeStart = closeWindowStartFor(period, 3);
      const ccFob = {}, baselineKind = {};
      for (const s of ccSnaps) { const k = unpad(s.loc); ccFob[k] = { baseFobPct: s.fob?.fobPct ?? null, basePct: s.count?.earlyPctCounted ?? null }; baselineKind[k] = 'count-complete'; }

      const rawScoped = {}, perLoc = {};
      for (const r of rows) {
        const k = unpad(r.loc);
        const items = pick(rawByLoc, r.loc) || [];
        rawScoped[k] = items;
        const statVar = {}; for (const v of (pick(varByLoc, r.loc) || [])) if (v.dolDiff != null) statVar[String(v.wrin)] = v.dolDiff;
        perLoc[k] = {
          name: r.name || nm(r.loc), closeWindowStart: closeStart, statVar,
          baseFobPct: ccFob[k]?.baseFobPct ?? null, curFobPct: r.fobPct ?? null,
          basePct: ccFob[k]?.basePct ?? null, curPct: r.prog?.earlyPctCounted ?? null,
        };
      }
      const nAsCounted = Object.values(baselineKind).filter(v => v === 'count-complete').length;
      const hasLedger = Object.values(rawScoped).some(a => a.length);
      if (hasLedger) {
        const diff = ledgerScopeDiff(rawScoped, perLoc);
        setMon({ diff, takenAt: ccSnaps[0]?.takenAt || null, nBaseline: diff.nStores, baselineKind, nAsCounted, ledger: true });
      } else {
        // Fallback (no raw ledger loaded yet): keep the old snapshot diff so the view never goes blank.
        const baselinesByLoc = {}, currentsByLoc = {};
        for (const s of ccSnaps) { const k = unpad(s.loc); baselinesByLoc[k] = { loc: s.loc, fob: s.fob, count: s.count, items: s.items }; }
        for (const r of rows) currentsByLoc[unpad(r.loc)] = buildLiveSnapshot(r);
        setMon({ diff: diffScope(baselinesByLoc, currentsByLoc), takenAt: ccSnaps[0]?.takenAt || null, nBaseline: Object.keys(baselinesByLoc).length, baselineKind, nAsCounted, ledger: false });
      }
    } catch (e) {
      setMon({ error: String(e?.message || e) });
    }
    setMonBusy(false);
  }, [period, rows, rawByLoc, varByLoc, buildLiveSnapshot]);

  const markSecondary = useCallback(async (loc, status) => {
    setSecReview(m => ({ ...m, [String(loc)]: { ...(m[String(loc)] || {}), status } }));
    try { await saveEomSecondaryReview({ loc, period, status }); } catch {}
  }, [period]);

  // Count-date exception (owner 2026-07-31): accept a store's EARLY count as its EOM count — logged +
  // attributed (who approved, why). Toggling on/off updates the exceptions map so progress + diagnosis
  // re-derive with acceptEarly. Grant asks for the approver + reason so the workaround is tracked.
  const toggleException = useCallback(async (loc, existing) => {
    const key = String(loc);
    if (existing) {
      if (typeof window !== 'undefined' && !window.confirm(`Remove the accepted-early-count exception for ${nm(loc)}?`)) return;
      setExceptions(m => { const n = { ...m }; delete n[key]; return n; });
      try { await deleteEomCountException({ loc, period }); } catch {}
      return;
    }
    // The perceived FULL-count date = the day the store counted the bulk of its items (mode of the
    // items' last-counted dates), so the accepted count is dated to when it actually happened (owner).
    const dayCount = {};
    for (const o of (byLoc[key] || [])) { const d = isoDay(o.lastCounted) || isoDay(o.lastSubmitted); if (d) dayCount[d] = (dayCount[d] || 0) + 1; }
    const acceptedDate = Object.keys(dayCount).sort((a, b) => dayCount[b] - dayCount[a])[0] || null;
    const approvedBy = typeof window !== 'undefined' ? window.prompt(`Grant "accepted early count" exception for ${nm(loc)}${acceptedDate ? ` — full count dated ${acceptedDate}` : ''}.\nApproved by (above-store leader):`, '') : '';
    if (approvedBy == null) return;   // cancelled
    const note = typeof window !== 'undefined' ? (window.prompt('Reason / note (optional):', '') || '') : '';
    const rec = { kind: 'early-count-accepted', approvedBy: approvedBy.trim() || 'unspecified', note, acceptedDate, createdAt: new Date().toISOString() };
    setExceptions(m => ({ ...m, [key]: rec }));
    try { await saveEomCountException({ loc, period, approvedBy: rec.approvedBy, note, acceptedDate }); } catch {}
  }, [period, byLoc]);

  // District EOM Summary over the CURRENT scope (rows are already filtered by state/patch/store).
  const districtSummary = useMemo(() => buildDistrictSummary(rows, DEFAULT_TARGETS), [rows]);
  const sumCsv = () => {
    const H = ['Store', 'Prod Sales', 'FOB $', 'FOB %', 'FOB target %', 'FOB ± pp',
      ...COMP_META.map(m => `${m.label} $`), ...COMP_META.map(m => `${m.label} %`), ...COMP_META.map(m => `${m.label} ±pp`),
      'Count %', ...CLASS_META.map(m => `${m.label} %`), 'Ready', 'Uncounted F/C', '$ over target'];
    const rows2 = districtSummary.stores.map(s => {
      const pctOf = k => s.sales ? (s.comps[k] / s.sales * 100) : null;
      const dOf = m => { const p = pctOf(m.k); const t = DEFAULT_TARGETS[unpad(s.loc)]?.[m.tgt]; return (p != null && t != null) ? (p - t * 100) : null; };
      return [nm(s.loc), Math.round(s.sales), Math.round(s.fobD), s.fobPct != null ? (s.fobPct * 100).toFixed(2) : '', s.fobTgt != null ? (s.fobTgt * 100).toFixed(2) : '', s.deltaPp != null ? s.deltaPp.toFixed(2) : '',
        ...COMP_META.map(m => Math.round(s.comps[m.k])), ...COMP_META.map(m => { const p = pctOf(m.k); return p != null ? p.toFixed(2) : ''; }), ...COMP_META.map(m => { const d = dOf(m); return d != null ? d.toFixed(2) : ''; }),
        s.countPct != null ? Math.round(s.countPct * 100) : '', ...CLASS_META.map(m => { const p = s.classPct[m.k]; return p != null ? Math.round(p * 100) : ''; }), s.believesDone ? 'yes' : 'no', s.uncountedFC, s.over$ != null ? Math.round(s.over$) : ''];
    });
    return toCsv(H, rows2);
  };
  const sumPrintHtml = () => {
    const d = districtSummary; const r = d.rollup;
    const $ = v => `$${Math.round(v || 0).toLocaleString()}`;
    const pctS = (p) => p != null ? `${(p * 100).toFixed(2)}%` : '—';
    const head = `<h1>District EOM Summary — ${scopeLabel()}</h1><p class="sub">${period} · ${r.nStores} store(s) · dollar-weighted FOB roll-up</p>
      <table><tbody>
      <tr><th>District FOB</th><td class="g">${pctS(r.fobPct)} · ${$(r.fob$)}</td><th>vs target</th><td>${pctS(r.fobTgt)}${r.fobPct != null && r.fobTgt != null ? ` (${r.fobPct >= r.fobTgt ? '+' : ''}${((r.fobPct - r.fobTgt) * 100).toFixed(2)}pp)` : ''}</td><th>Prod Sales</th><td>${$(r.sales)}</td></tr>
      <tr><th>Count</th><td colspan="5">${d.completion.ready} ready · ${d.completion.counting} counting · ${d.completion.notStarted} not started · avg ${d.completion.avgCountPct != null ? Math.round(d.completion.avgCountPct * 100) + '%' : '—'} · ${d.completion.storesWithUncountedFC} Location(s) with uncounted Food/Condiment${d.completion.totalUncountedFC ? ` (${d.completion.totalUncountedFC} Items Total)` : ''}</td></tr>
      <tr><th>By class</th><td colspan="5">${CLASS_META.map(m => { const p = d.completion.byClass[m.k]; return `${m.label} ${p != null ? Math.round(p * 100) + '%' : '—'}${m.k === 'nonproduct' ? ' (due tomorrow)' : ''}`; }).join(' · ')}</td></tr>
      <tr><th>Opportunity</th><td colspan="5">${$(d.totalOver$)} over target across ${d.opportunity.length} store(s) · biggest component opportunity vs target: ${d.analysis.anyOverTarget ? `${d.analysis.biggestComp.label} (${d.analysis.biggestComp.deltaPp != null ? `+${d.analysis.biggestComp.deltaPp.toFixed(2)}pp · ` : ''}${$(d.analysis.biggestComp.over$)} over)` : 'all components at/under target'}</td></tr>
      </tbody></table>`;
    const rowsHtml = d.stores.slice().sort((a, b) => (b.over$ || -1e9) - (a.over$ || -1e9)).map(s =>
      `<tr><td>${nm(s.loc)}</td><td class="${s.deltaPp > 0 ? 'r' : ''}">${pctS(s.fobPct)}${s.deltaPp != null ? ` (${s.deltaPp >= 0 ? '+' : ''}${s.deltaPp.toFixed(2)})` : ''}</td><td>${$(s.fobD)}</td>${COMP_META.map(m => `<td>${$(s.comps[m.k])}</td>`).join('')}<td>${s.countPct != null ? Math.round(s.countPct * 100) + '%' : '—'}${s.uncountedFC ? ` <span class="r">(${s.uncountedFC} F/C)</span>` : ''}</td>${CLASS_META.map(m => { const p = s.classPct[m.k]; return `<td>${p != null ? Math.round(p * 100) + '%' : '—'}</td>`; }).join('')}<td>${s.believesDone ? '✓' : s.countPct > 0.01 ? 'counting' : '—'}</td></tr>`).join('');
    const table = `<h1 style="margin-top:18px">By store</h1><table><thead><tr><th>Store</th><th>FOB % (±tgt)</th><th>FOB $</th>${COMP_META.map(m => `<th>${m.label}</th>`).join('')}<th>Count</th>${CLASS_META.map(m => `<th>${m.short}</th>`).join('')}<th>Ready</th></tr></thead><tbody>${rowsHtml}</tbody></table>`;
    return head + table;
  };

  // ── Scan exports (Save CSV / Print) — supporting facts for coaching + records ──
  const scopeLabel = () => `${patch ? `patch: ${patch}` : (scope === 'all' ? 'all stores' : scope)}${oneStore ? ` · ${nm(oneStore)}` : ''}`;
  const relCsv = () => {
    const H = ['Store', 'Grade', 'Score %', 'Items scored', 'Inconsistent', 'Fluctuating', 'WRIN', 'Item', 'Class', 'Swing $', 'High $', 'High period', 'Low $', 'Low period'];
    const out = [];
    for (const s of (rel?.stores || [])) {
      if (!s.worst?.length) { out.push([nm(s.loc), s.grade, s.score, s.nItems, s.nInconsistent, s.nFluct, '', '(no flagged items)', '', '', '', '', '', '']); continue; }
      for (const w of s.worst) out.push([nm(s.loc), s.grade, s.score, s.nItems, s.nInconsistent, s.nFluct, w.wrin, w.descr || '', w.cls || '', Math.round(w.swing || 0), Math.round(w.swingHi || 0), w.swingHiP || '', Math.round(w.swingLo || 0), w.swingLoP || '']);
    }
    return toCsv(H, out);
  };
  const relPrintHtml = () => {
    const p = rel?.periods || [];
    const body = (rel?.stores || []).map(s => {
      const items = (s.worst || []).map(w => `<tr><td class="mono">${w.wrin}</td><td>${w.descr || ''}</td><td>${w.cls || ''}</td><td class="r">$${Math.round(w.swing || 0).toLocaleString()}</td><td>+$${Math.round(w.swingHi || 0).toLocaleString()} (${w.swingHiP || ''}) &rarr; -$${Math.abs(Math.round(w.swingLo || 0)).toLocaleString()} (${w.swingLoP || ''})</td></tr>`).join('') || '<tr><td colspan="5">No flagged items — consistent.</td></tr>';
      return `<h1 style="margin-top:20px">${nm(s.loc)} — <span class="g">${s.grade}</span> (${s.score}%)</h1><p class="sub">${s.nInconsistent} inconsistent of ${s.nItems} scored${s.nFluct ? ` &middot; ${s.nFluct} fluctuating` : ''}</p><table><thead><tr><th>WRIN</th><th>Item</th><th>Class</th><th>Swing</th><th>Biggest over &rarr; short (period)</th></tr></thead><tbody>${items}</tbody></table>`;
    }).join('');
    return `<h1>Count Reliability — ${scopeLabel()}</h1><p class="sub">${p[0] || ''} &rarr; ${p[p.length - 1] || ''} &middot; ${(rel?.nRows || 0).toLocaleString()} rows read &middot; least reliable first</p>${body}`;
  };
  const chronicCsv = () => {
    const H = ['Item', 'WRIN', 'Worst pattern', 'Stores affected', '$ at stake'];
    return toCsv(H, (chronic?.items || []).map(it => [it.descr || it.wrin, it.wrin, (PATTERN_META[it.worst]?.label) || it.worst || '', it.nStores, Math.round(it.totalDol || 0)]));
  };
  const chronicPrintHtml = () => {
    const p = chronic?.periods || [];
    const rowsHtml = (chronic?.items || []).map(it => `<tr><td>${it.descr || it.wrin}</td><td class="mono">${it.wrin}</td><td>${(PATTERN_META[it.worst]?.label) || it.worst || ''}</td><td>${it.nStores}</td><td class="r">$${Math.round(it.totalDol || 0).toLocaleString()}</td></tr>`).join('');
    return `<h1>Chronic Offenders — ${scopeLabel()}</h1><p class="sub">${p[0] || ''} &rarr; ${p[p.length - 1] || ''} &middot; ${(chronic?.nRows || 0).toLocaleString()} rows &middot; worst across the most stores first</p><table><thead><tr><th>Item</th><th>WRIN</th><th>Worst pattern</th><th>Stores</th><th>$ at stake</th></tr></thead><tbody>${rowsHtml}</tbody></table>`;
  };
  const rbCsv = () => {
    const H = ['Store', 'Rubber-band items', 'Total snap $', 'WRIN', 'Item', 'Class', 'Snap $', 'Over periods', 'Over $ built up', 'Snapped period'];
    const out = [];
    for (const s of (rb?.stores || [])) {
      for (const w of s.worst) out.push([nm(s.loc), s.nItems, Math.round(s.totalSnap), w.wrin, w.descr || '', w.cls || '', Math.round(w.snap || 0), `${w.overN} (${w.from || ''})`, Math.round(w.overSum || 0), w.to || '']);
    }
    return toCsv(H, out);
  };
  const rbPrintHtml = () => {
    const p = rb?.periods || [];
    const body = (rb?.stores || []).map(s => {
      const items = (s.worst || []).map(w => `<tr><td class="mono">${w.wrin}</td><td>${w.descr || ''}</td><td>${w.cls || ''}</td><td class="r">$${Math.round(w.snap || 0).toLocaleString()}</td><td>+$${Math.round(w.overSum || 0).toLocaleString()} over ${w.overN} mo (from ${w.from || ''}) &rarr; snapped ${w.to || ''}</td></tr>`).join('') || '<tr><td colspan="5">No rubber-band items.</td></tr>';
      return `<h1 style="margin-top:20px">${nm(s.loc)} — ${s.nItems} item(s), $${Math.round(s.totalSnap || 0).toLocaleString()} snap exposure</h1><table><thead><tr><th>WRIN</th><th>Item</th><th>Class</th><th>Snap $</th><th>Padding built up &rarr; collapse</th></tr></thead><tbody>${items}</tbody></table>`;
    }).join('');
    return `<h1>Rubber-band (padding &rarr; collapse) — ${scopeLabel()}</h1><p class="sub">${p[0] || ''} &rarr; ${p[p.length - 1] || ''} &middot; ${(rb?.nRows || 0).toLocaleString()} rows &middot; biggest snap exposure first</p>${body}`;
  };

  // Build a store's follow-up draft (same diagnosis the 🔬 button uses → a real action plan, not just
  // ── Shared diagnosis result + report opts (used by BOTH the full-report modal and the message
  // draft, so the recap can never drift from the report). buildDiagResult mirrors openDiag's data
  // shape exactly; diagOptsFor returns the report options incl. the FOB one-liner inputs.
  const buildDiagResult = useCallback((loc, name, components) => {
    const c = components || {};
    return runDiagnosis({
      store: loc, storeName: name, period, asOf: new Date(), checks: activeChecks,
      data: {
        fob: c.sales ? { sales: c.sales, compWaste: c.comp, rawWaste: c.raw, condiments: c.cond, empMgrMeals: c.emp, statVariance: c.statv, unexplained: c.unex } : null,
        onHand: (byLoc[loc] || []).map(r => ({
          wrin: r.wrin, cls: r.cls, descr: r.descr, onHandAmt: r.on_hand_amt ?? r.onHandAmt,
          totalUnits: r.total_units ?? r.totalUnits,
          lastCounted: r.last_counted ? new Date(r.last_counted + 'T00:00:00') : (r.lastCounted || null),
          lastSubmitted: r.last_submitted ? new Date(r.last_submitted + 'T00:00:00') : (r.lastSubmitted || null),
        })),
        variance: varByLoc[loc] || [], waste: wasteByLoc[loc] || [], transfers: xferByLoc[loc] || [],
        unmatchedTransfers: unmatchedXfer, selfServeTower: selfServeTowers.has(unpad(loc)), rawItems: rawByLoc[loc] || [],
        fountainBaseline: fountainBaselineByLoc[unpad(loc)] || null,
      },
    });
  }, [byLoc, varByLoc, wasteByLoc, xferByLoc, rawByLoc, unmatchedXfer, selfServeTowers, activeChecks, period, fountainBaselineByLoc]);

  const diagOptsFor = useCallback((loc, components) => {
    const incomplete = diagnoseIncompleteCount(byLoc[loc] || [], { period, asOf: new Date(), acceptEarly: !!exceptions[loc] });
    const caseSzByWrin = {};
    for (const it of (rawByLoc[loc] || [])) { if (it.caseSz > 0) caseSzByWrin[String(it.wrin)] = it.caseSz; }
    const c = components || {};
    const tg = DEFAULT_TARGETS[unpad(loc)] || {};
    const pct = c.fobPct != null ? c.fobPct : (c.sales ? (c.fob / c.sales) : null);
    const fob = pct != null ? { pct, tgt: tg.tFOBTarget != null ? Number(tg.tFOBTarget) : null, dollars: c.fob ?? null, components: fobComponentDeltas(c, tg) } : null;
    return { incomplete, caseSzByWrin, selfServeTower: selfServeTowers.has(unpad(loc)), fob, exception: exceptions[loc] || null };
  }, [byLoc, rawByLoc, period, selfServeTowers, exceptions]);

  // Pure — returns the draft object with BOTH the abbreviated recap (default message, Notes 37 C1)
  // and the full report one click away. Reused by openDraft AND the bulk "Message all" generator.
  const computeDraft = useCallback((loc, name, components) => {
    let recapBody = '', fullBody = '', diagRows = [], actionItems = [];
    const opts = diagOptsFor(loc, components);
    if (hasDiagData.has(loc) || (components && components.sales)) {
      try {
        const result = buildDiagResult(loc, name, components);
        recapBody = formatDiagnosisReport(result, { ...opts, mode: 'recap' });
        fullBody = formatDiagnosisReport(result, { ...opts, mode: 'full' });
        actionItems = result.actionItems || [];
        diagRows = (result.findings || []).filter(f => (f.severity ?? 0) >= 1).map(f => ({
          sev: f.severity ?? 0, sevWord: String(f.severityWord || '').toUpperCase(),
          item: f.title, wrin: f.data?.wrin || '', dollars: f.dollars, note: f.detail,
        }));
      } catch { /* diagnosis is best-effort */ }
    }
    // Fall back to the plain recount nudge if the diagnosis produced nothing (e.g. no FOB/variance yet).
    if (!recapBody) {
      const msg = buildIncompleteCountMessage(name, byLoc[loc] || [], { period, asOf: new Date() });
      recapBody = msg.body; fullBody = msg.body;
    }
    const inc = opts.incomplete;
    const uncounted = (inc && inc.uncounted) ? inc.uncounted.slice(0, 20) : [];
    const hasGaps = !!(inc && inc.uncountedCount);
    // Subject leads with FOB vs target — NOT a raw findings count. "(239 to do now)" overwhelmed
    // (owner Notes 38); the focused Top-5 lives in the body, so the subject just frames the result.
    const fp = opts.fob;
    let fobTail = '';
    if (fp && fp.pct != null) {
      const dpp = fp.tgt != null ? (fp.pct - fp.tgt) : null;
      fobTail = ` · FOB ${(fp.pct * 100).toFixed(2)}%${dpp != null ? (dpp > 0.0001 ? ` (+${(dpp * 100).toFixed(2)}pp — opportunity)` : ' (at/under target ✓)') : ''}`;
    }
    const subject = `EOM FOB — ${name}${fobTail}`;
    return { loc, name, subject, body: recapBody, recapBody, fullBody, hasGaps, hasPlan: actionItems.length > 0, rows: diagRows, uncounted, fob: components || {} };
  }, [buildDiagResult, diagOptsFor, hasDiagData, byLoc, period]);

  const openDraft = useCallback((loc, name, components) => {
    setCopied(false); setDraftFull(false); setDraftText(false);
    setDraft(computeDraft(loc, name, components));
  }, [computeDraft]);

  // Create an opaque, scoped, read-only SHARE LINK for a store's EOM report (Phase 1 sandbox) — snapshots
  // the recap + full report + FOB strip into the link, then copies the no-login URL to paste anywhere.
  const createShare = useCallback(async (loc, name, components) => {
    setShareMsg(`Creating link for ${name}…`);
    try {
      const result = buildDiagResult(loc, name, components);
      const opts = diagOptsFor(loc, components);
      const recapMd = formatDiagnosisReport(result, { ...opts, mode: 'recap' });
      const fullMd = formatDiagnosisReport(result, { ...opts, mode: 'full' });
      const { token, error } = await createEomShareLink({ loc, period, storeName: name, title: `EOM FOB ${period}`, fob: components || {}, recapMd, fullMd });
      if (error || !token) { setShareMsg(`Share failed: ${error || 'no token'}`); return; }
      const url = `${location.origin}${import.meta.env.BASE_URL || '/'}`.replace(/\/+$/, '/') + `?share=${token}`;
      try { await navigator.clipboard.writeText(url); setShareMsg(`✓ Read-only link copied — ${name}`); }
      catch { setShareMsg(`✓ Link (copy it): ${url}`); }
    } catch (e) { setShareMsg(`Share failed: ${e?.message || e}`); }
  }, [buildDiagResult, diagOptsFor, period]);

  // Waste analysis (Notes 40 #2): run the Second-Look waste rules across the current scope on demand.
  const runWasteScan = useCallback(() => {
    const scoped = new Set(rows.map(r => unpad(r.loc)));
    const w = (waste || []).filter(x => scoped.has(unpad(x.loc)));
    setWasteScan(scanWaste(w, { period }));
    setWasteDrill(null);
    setWasteOpen(true);
  }, [rows, waste, period]);

  // The raw waste events behind a flagged store — sorted biggest-$ first (drill-in for the scan card).
  const wasteEventsFor = useCallback((loc) => (waste || [])
    .filter(x => unpad(x.loc) === unpad(loc) && Number(x.amount) > 0)
    .sort((a, b) => Number(b.amount) - Number(a.amount)), [waste]);

  // Hand a flagged store's waste picture to SAGE for a deeper, non-accusatory read (owner: "expound").
  const askSageWaste = useCallback((store) => {
    const evs = wasteEventsFor(store.loc);
    const byMgr = {}; for (const e of evs) { const m = e.manager || '?'; byMgr[m] = (byMgr[m] || 0) + Number(e.amount || 0); }
    const mgrLines = Object.entries(byMgr).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([m, $]) => `  ${m}: $${Math.round($).toLocaleString()}`).join('\n');
    const flagLines = store.flags.map(f => `  • [${f.kind}] ${f.label}`).join('\n');
    const topEvents = evs.slice(0, 20).map(e => `  ${e.dt}${e.tm ? ' ' + e.tm : ''} · ${e.type || 'waste'} · $${Number(e.amount).toFixed(2)} · ${e.manager || '?'}${e.edited ? ' · EDITED' : ''}${e.reason ? ' · ' + e.reason : ''}`).join('\n');
    const context = `Waste analysis — ${nm(store.loc)} (#${unpad(store.loc)}), period ${period}\n`
      + `Total logged waste: $${Math.round(store.total).toLocaleString()} across ${store.nEvents} entries.\n\n`
      + `Second-Look flags:\n${flagLines || '  (none)'}\n\n`
      + `Waste $ by manager:\n${mgrLines}\n\n`
      + `Largest waste events:\n${topEvents}`;
    try {
      window.__MF_SAGE_SEED__ = { context, prompt: `Here is ${nm(store.loc)}'s waste picture for ${period} with our Second-Look flags. Help me read it WITHOUT accusing anyone: which flags are most likely real behavior vs benign (self-serve beverage free-refills, a legit big toss, a travel-path multi-count)? Weight FOOD + CONDIMENT waste over paper/non-product (paper is seldom raw-wasted). If a manager's session or a uniform/static value looks like a guessed/copy-paste entry rather than a real toss, say what a coach should ASK — not conclude (note: most items are eyeballed — few stores have a scale; only ice cream mix and fries are realistically weighed). Give me 3 short, specific coaching questions for the GM and one thing to verify on the floor. Keep it professional and non-accusatory.` };
      window.dispatchEvent(new CustomEvent('mf:open-sage'));
    } catch {}
    setWasteOpen(false);
    onClose && onClose();
  }, [wasteEventsFor, period, onClose]);

  // Generate a follow-up draft for EVERY store in scope — the ones that need a message first.
  const openBulk = useCallback(() => {
    const drafts = rows.map(r => ({ ...computeDraft(r.loc, r.name, r.components), commsSent: r.comms === 'sent' }));
    drafts.sort((a, b) => ((b.hasGaps || b.hasPlan) - (a.hasGaps || a.hasPlan)) || a.name.localeCompare(b.name));
    setBulkDrafts(drafts); setBulkCopied(''); setBulkOpen(true);
  }, [rows, computeDraft]);
  const copyText = (t, tag) => {
    try { navigator.clipboard.writeText(t); setBulkCopied(tag); setTimeout(() => setBulkCopied(c => c === tag ? '' : c), 1800); }
    catch { /* clipboard may be blocked */ }
  };

  const copyDraft = useCallback(async () => {
    if (!draft) return;
    const activeBody = draftFull ? (draft.fullBody || draft.body) : (draft.recapBody || draft.body);
    const text = `${draft.subject}\n\n${activeBody}`;
    try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); }
  }, [draft, draftFull]);

  // Run the full diagnosis engine for one store from the cloud streams.
  const openDiag = useCallback((loc, name, components) => {
    const result = buildDiagResult(loc, name, components);
    setDiagCopied(false);
    // Report opts (count-integrity never/early/stale, case sizes, self-serve, FOB one-liner inputs).
    const opts = diagOptsFor(loc, components);
    const { incomplete, caseSzByWrin } = opts;
    setDiag({ loc, name, result, report: formatDiagnosisReport(result, opts), history: null, caseSzByWrin, incomplete, fob: components || {} });
    // #38: load any saved verify-&-clear dispositions for this store/period so the panel shows state.
    setDispByWrin({});
    loadEomItemDisposition({ period, loc }).then(rows => {
      const m = {}; for (const r of rows) m[String(r.wrin)] = r.disposition;
      setDispByWrin(m);
    }).catch(() => {});
    // Provenance: pull a look-back window of variance history for this store so each action item
    // can nest its month-over-month trend + a pattern chip. On-demand (per modal open), scoped to
    // the loc + an explicit period list → bounded egress. Fetch a generous 12-period window once;
    // the look-back selector slices it client-side (no re-fetch). Best-effort — the report stands
    // on its own if this fails or the table is empty.
    const histPeriods = lastPeriods(period, 12);
    loadQsrVarianceHistory({ loc, periods: histPeriods }).then(rows => {
      setDiag(prev => (prev && prev.loc === loc) ? { ...prev, history: { rows, periods: histPeriods } } : prev);
    }).catch(() => {
      setDiag(prev => (prev && prev.loc === loc) ? { ...prev, history: { rows: [], periods: histPeriods } } : prev);
    });
  }, [buildDiagResult, diagOptsFor, period]);

  // #38 verify-&-clear: record a manager's decision for one obsolete/inactive item (optimistic +
  // persisted to eom_item_disposition). No QSRSoft write-back in v1 — logs the decision only.
  const setDisposition = useCallback(async (loc, item, disp) => {
    setDispBusy(String(item.wrin));
    setDispByWrin(prev => ({ ...prev, [String(item.wrin)]: disp }));
    try { await saveEomItemDisposition([{ loc, period, wrin: item.wrin, disposition: disp, cls: item.cls, descr: item.descr, onHandAmt: item.onHandAmt }]); }
    catch (e) { console.warn('disposition save failed', e); }
    setDispBusy(null);
  }, [period]);

  // Open the visual Item Journeys for a store (worst-net-variance first).
  // Enrich each with the authoritative Variance Stat report figure for the same
  // WRIN+period so the journey can be reconciled EXACT to the report (Note 30 A3).
  const openJourneys = useCallback((loc, name) => {
    const list = buildStoreJourneys(rawByLoc[loc] || [], { period, asOf: new Date() });
    const vmap = {}; (varByLoc[loc] || []).forEach(v => { vmap[String(v.wrin)] = v; });
    const enriched = list.map(j => {
      const v = vmap[String(j.wrin)];
      // Variance Stat rows carry the qty variance as `variance` (not `unitVar`) — using the
      // wrong field made reportUnits 0/undefined so journeys couldn't reconcile to the report.
      return v ? { ...j, reportDollars: v.dolDiff, reportUnits: v.variance } : j;
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
      ['Count %', r => { const v = r.prog.earlyPctCounted ?? r.prog.pctCounted; return v != null ? (v * 100).toFixed(0) : ''; }],
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
    const avg = n ? rows.reduce((s, r) => s + (r.prog.earlyPctCounted ?? r.prog.pctCounted), 0) / n : 0;
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

  // District completion BY CLASS (owner req 2026-07-30). Food + Condiment are the profit
  // drivers and should be the first classes done; Paper is flexible days 1-2; Non-Product is
  // counted the LAST day — so a low Non-Product % early in the cycle is EXPECTED, not behind.
  const classSummary = useMemo(() => {
    const order = [['food', 'Food', true], ['condiment', 'Condiment', true], ['paper', 'Paper', false], ['nonproduct', 'Non-Product', false]];
    const agg = {}; for (const [k] of order) agg[k] = { total: 0, counted: 0, doneStores: 0, n: 0 };
    for (const r of rows) { const bc = r.prog?.byClass || {}; for (const [k] of order) { const b = bc[k]; if (b && b.total) { agg[k].total += b.total; agg[k].counted += b.counted || 0; agg[k].n++; if (b.done) agg[k].doneStores++; } } }
    return order.map(([k, label, fob]) => ({ k, label, fob, pct: agg[k].total ? agg[k].counted / agg[k].total : null, doneStores: agg[k].doneStores, n: agg[k].n }));
  }, [rows]);

  const inWindow = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    return d >= countWindowStart(period);
  }, [period]);

  return div({ style: { padding: '20px', maxWidth: '1200px', margin: '0 auto' } },
    // header
    div({ style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' } },
      div(null,
        h('h2', { style: { margin: 0, fontSize: '20px', color: 'var(--text)' } }, '📦 Inventory Control'),
        span({ style: { fontSize: '12px', color: 'var(--text3)' } },
          mode === 'eom'
            ? `Count-completion mode · count window is the last 3 days (from the ${countWindowStart(period).getDate()})`
            : 'Year-round progress mode · last-count freshness + FOB / diagnosis results (count % fills in during the last 3 days)',
          dataAsOf && span({ style: { marginLeft: '8px', color: 'var(--text2)' }, title: 'Freshest business date across the loaded EOM streams (on-hand, FOB, waste, transfers)' },
            `· data as of ${dataAsOf.toLocaleDateString()}`))),
      div({ style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' } },
        // mode toggle — EOM count-completion vs year-round progress
        div({ style: { display: 'flex', border: '1px solid var(--bdr2)', borderRadius: '6px', overflow: 'hidden', flexShrink: 0 } },
          [['scoreboard', 'Scoreboard'], ['eom', 'EOM Count'], ['progress', 'Count Cycle']].map(([k, label]) =>
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
        h('button', {
          onClick: () => runChronicScan(), disabled: rows.length === 0 || chronicBusy,
          title: 'Scan the current location scope across a past window — which items are chronically High-Variance / Loss-Forming across stores (on our own pattern principles). Reads on demand.',
          style: { background: 'var(--surf3)', color: '#c084fc', border: '1px solid #c084fc', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', fontWeight: 700, cursor: rows.length ? 'pointer' : 'not-allowed' },
        }, chronicBusy ? '…' : '🔁 Chronic offenders'),
        h('button', {
          onClick: () => runReliabilityScan(), disabled: rows.length === 0 || relBusy,
          title: 'Count Reliability — grades each store on how CONSISTENTLY it counts (big count-error reversals hurt; real losses do not). Accuracy + consistency is king. Reads on demand.',
          style: { background: 'var(--surf3)', color: '#4ade80', border: '1px solid #4ade80', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', fontWeight: 700, cursor: rows.length ? 'pointer' : 'not-allowed' },
        }, relBusy ? '…' : '📊 Count reliability'),
        h('button', {
          onClick: () => runRubberBandScan(), disabled: rows.length === 0 || rbBusy,
          title: 'Rubber-band — the padding→collapse integrity pattern: items that ran OVER (inventory padded) for months then snapped to a big short. Catches the "variance collapse" before it explodes. Reads on demand across the scope.',
          style: { background: 'var(--surf3)', color: '#fb923c', border: '1px solid #fb923c', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', fontWeight: 700, cursor: rows.length ? 'pointer' : 'not-allowed' },
        }, rbBusy ? '…' : '🪃 Rubber-band'),
        h('button', {
          onClick: runWasteScan, disabled: rows.length === 0,
          title: 'Waste analysis — run the Second-Look waste rules across the scope: uniform/static values (a guessed/copy-paste entry, not a real toss), high-$ manager sessions, manager concentration, and count-window spikes.',
          style: { background: 'var(--surf3)', color: '#a3e635', border: '1px solid #a3e635', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', fontWeight: 700, cursor: rows.length ? 'pointer' : 'not-allowed' },
        }, '🗑 Waste'),
        h('button', {
          onClick: () => setXcOpen(true), disabled: rows.length === 0,
          title: 'AI Cross-Check — paste an external AI\'s FOB analysis (e.g. CoachQ) and reconcile it against Meridian\'s real numbers. Catches fabricated rows (components that don\'t sum to their own FOB$) + divergences.',
          style: { background: 'var(--surf3)', color: '#38bdf8', border: '1px solid #38bdf8', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', fontWeight: 700, cursor: rows.length ? 'pointer' : 'not-allowed' },
        }, '🔍 AI Cross-Check'),
        h('button', {
          onClick: openBulk, disabled: rows.length === 0,
          title: 'Generate the EOM follow-up message for every location in scope at once — copy each and send (recount lists / action plans, freshest-wins).',
          style: { background: 'var(--surf3)', color: '#f5bc00', border: '1px solid #f5bc00', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', fontWeight: 700, cursor: rows.length ? 'pointer' : 'not-allowed' },
        }, '📣 Message all'),
        h('button', {
          onClick: () => setSumOpen(true), disabled: rows.length === 0,
          title: 'District EOM Summary — FOB + all components ($/%/vs target), count completion, and the $ opportunity across the current scope. CSV + Print.',
          style: { background: 'var(--surf3)', color: '#c084fc', border: '1px solid #c084fc', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', fontWeight: 700, cursor: rows.length ? 'pointer' : 'not-allowed' },
        }, '📊 Summary report'),
        // Optional manual snapshot. The Change Monitor no longer needs it — the baseline is auto-derived
        // from the count ledger (variance at count-completion). Keep this only to freeze an extra checkpoint
        // for watching the authoritative number drift over days. Muted so it's clearly secondary.
        h('button', {
          onClick: lockBaseline, disabled: allRows.length === 0 || locking,
          title: 'Optional: freeze an extra snapshot of the current state to watch the authoritative FOB drift over days. NOT required — the Change Monitor auto-derives each store\'s baseline from the count ledger (variance at count-completion).',
          style: { background: 'var(--surf3)', color: 'var(--text3)', border: '1px solid var(--bdr2)', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', fontWeight: 600, cursor: allRows.length ? 'pointer' : 'not-allowed' },
        }, locking ? '… Locking' : '📌 Snapshot (optional)'),
        h('button', {
          onClick: openMonitor, disabled: rows.length === 0,
          title: 'Change Monitor — diff the current live state against the locked baseline. Shows per store the FOB Δ and, per item, whether a recount HELPED (variance moved toward $0) or HURT (moved away). This is the day-2 secondary review.',
          style: { background: 'var(--surf3)', color: '#f472b6', border: '1px solid #f472b6', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', fontWeight: 700, cursor: rows.length ? 'pointer' : 'not-allowed' },
        }, '📸 Change Monitor'),
        h('button', {
          onClick: () => { setRiddleStore(null); setRiddleOpen(true); }, disabled: rows.length === 0,
          title: 'FOB Root-Cause Analysis — for the current scope: which stores\' RECOUNTS add loss (net-harmful = the coaching opportunities) and which stores hold the most CONSISTENT FOB month-to-month. Same math as the batch analysis; every number is decomposable.',
          style: { background: 'var(--surf3)', color: '#a78bfa', border: '1px solid #a78bfa', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', fontWeight: 700, cursor: rows.length ? 'pointer' : 'not-allowed' },
        }, '🔬 FOB Analysis'),
        h('button', {
          onClick: () => { setFobRepStore(null); setFobRepOpen(true); }, disabled: rows.length === 0,
          title: 'FOB Report — all-location EOM-lean read for the current scope: OK/FL summary, biggest opportunities, then patch → store with each store\'s FOB vs target, month-over-month trend (improving/regressing), worst component, top item losers, a masking check, and a plain-language action plan. Reusable for one / all / patch.',
          style: { background: 'var(--surf3)', color: '#34d399', border: '1px solid #34d399', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', fontWeight: 700, cursor: rows.length ? 'pointer' : 'not-allowed' },
        }, '📊 FOB Report'),
        lockMsg ? span({ style: { fontSize: '11px', color: lockMsg.startsWith('✓') ? '#4ade80' : '#fb923c', alignSelf: 'center' } }, lockMsg) : null,
        // On-demand pulls (Notes 35): fetch fresh On-Hand count progress / Variance now.
        h('button', {
          onClick: () => doPull('onhand', 'On-Hand'), disabled: pulling === 'onhand',
          title: 'Pull fresh On-Hand count progress now (forces a run regardless of the count-window / 8a–6p CT gate)',
          style: { background: 'rgba(245,188,0,.14)', color: '#f5bc00', border: '1px solid rgba(245,188,0,.4)', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', fontWeight: 700, cursor: pulling === 'onhand' ? 'default' : 'pointer' },
        }, pulling === 'onhand' ? '…' : '↻ On-Hand'),
        h('button', {
          onClick: () => doPull('variance', 'Variance'), disabled: pulling === 'variance',
          title: 'Pull fresh Variance / Raw-Item detail now',
          style: { background: 'rgba(245,188,0,.14)', color: '#f5bc00', border: '1px solid rgba(245,188,0,.4)', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', fontWeight: 700, cursor: pulling === 'variance' ? 'default' : 'pointer' },
        }, pulling === 'variance' ? '…' : '↻ Variance'),
        pullMsg && span({ style: { fontSize: '11px', color: pullMsg.ok ? '#4ade80' : '#f87171', maxWidth: '260px' } }, pullMsg.text),
        onClose && h('button', { onClick: onClose, style: { background: 'none', border: 'none', color: 'var(--text3)', fontSize: '20px', cursor: 'pointer' } }, '✕'))),

    // location picker — state pills (All / OK / FL) + single-store dropdown
    div({ style: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap' } },
      [['all', 'All'], ['OK', 'Oklahoma'], ['FL', 'Florida']].map(([k, label]) => {
        const active = scope === k;
        return h('button', {
          key: k, onClick: () => { setScope(k); setOneStore(''); setPatch(''); },
          style: {
            background: active ? '#f5bc00' : 'var(--surf3)', color: active ? '#0f1117' : 'var(--text2)',
            border: `1px solid ${active ? '#f5bc00' : 'var(--bdr2)'}`, borderRadius: '999px',
            padding: '5px 14px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
          },
        }, label);
      }),
      // Patch / operator (supervisor) filter — pin opportunity by patch. Cross-checks with scope.
      Object.keys(patchGroups).length ? h('select', {
        value: patch, onChange: e => { setPatch(e.target.value); setScope('all'); setOneStore(''); },
        title: 'Filter to one supervisor / operator patch',
        style: { background: patch ? '#f5bc00' : 'var(--surf3)', color: patch ? '#0f1117' : 'var(--text)', border: '1px solid var(--bdr2)', borderRadius: '999px', padding: '5px 12px', fontSize: '12px', fontWeight: 700, maxWidth: '200px' },
      }, [
        h('option', { key: '', value: '' }, 'All patches'),
        ...Object.keys(patchGroups).sort().map(sup => h('option', { key: sup, value: sup }, `${sup} (${(patchGroups[sup] || []).length})`)),
      ]) : null,
      h('span', { style: { color: 'var(--text3)', fontSize: '12px', margin: '0 2px' } }, '·'),
      h('select', {
        value: oneStore, onChange: e => setOneStore(e.target.value),
        style: { background: 'var(--surf3)', color: 'var(--text)', border: '1px solid var(--bdr2)', borderRadius: '6px', padding: '5px 10px', fontSize: '12px', maxWidth: '220px' },
      }, [
        h('option', { key: '', value: '' }, `All stores in scope (${pickerStores.length})`),
        ...pickerStores.map(r => h('option', { key: r.loc, value: r.loc }, r.name)),
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

    // Completion BY CLASS (owner req) — Food + Condiment (profit drivers) emphasized; Non-Product
    // is a last-day class so a low % early is expected. Shown for the count-progress modes.
    rows.length > 0 && div({ style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'stretch' } },
      span({ style: { fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em', alignSelf: 'center', marginRight: '2px' } }, 'By class:'),
      classSummary.map(c => {
        const p = c.pct;
        const col = p == null ? 'var(--text3)' : p >= 0.98 ? '#4ade80' : p >= 0.5 ? '#f5bc00' : (c.k === 'nonproduct' && !inWindow) ? 'var(--text3)' : '#64748b';
        return div({ key: c.k, title: c.k === 'nonproduct' ? 'Non-Product is counted the LAST day — low early is expected' : c.fob ? 'FOB profit driver — count first' : '', style: { flex: '1 1 130px', border: `1px solid ${c.fob ? 'rgba(245,188,0,.4)' : 'var(--bdr)'}`, borderLeft: `3px solid ${col}`, borderRadius: '8px', padding: '8px 10px', background: c.fob ? 'rgba(245,188,0,.06)' : 'var(--surf2)' } },
          div({ style: { fontSize: '10px', color: c.fob ? '#f5bc00' : 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: c.fob ? 700 : 400 } }, c.label + (c.fob ? ' ★' : '')),
          div({ style: { fontSize: '20px', fontWeight: 700, color: 'var(--text)', marginTop: '2px' } }, p == null ? '—' : pct(p)),
          div({ style: { fontSize: '10px', color: 'var(--text3)' } }, `${c.doneStores}/${c.n} stores done`));
      })),

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

    // Count Cycle view → weekly-cadence monitor above the store table (Notes 40 #1). Renders only when
    // it has cadence data; hidden in Scoreboard/EOM modes.
    (mode === 'progress' && !loading && rows.length) ? h(CadenceMonitor, { rows, cadenceByLoc, rawByLoc, nm }) : null,

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
                  span({ style: { fontSize: '10px', color: 'var(--text3)', marginLeft: '6px', fontFamily: 'ui-monospace,Menlo,monospace' } }, `#${unpad(r.loc)}`),
                  span({ style: { fontSize: '10px', color: r.org === 'emerald' ? '#38bdf8' : '#f5bc00', marginLeft: '6px' } }, r.org === 'emerald' ? 'FL' : 'OK'),
                  (() => { const cd = preferredCountDate(r); return cd ? span({ style: { fontSize: '10px', color: 'var(--text3)', marginLeft: '8px' } }, 'counted ' + cd.toLocaleDateString()) : null; })()),
                div({ style: { flex: '1 1 160px', minWidth: '140px' } }, h(ProgressBar, { value: r.prog.earlyPctCounted ?? r.prog.pctCounted })),
                span({ style: { fontSize: '11px', fontWeight: 700, color: p.c, background: p.bg, borderRadius: '12px', padding: '3px 10px', whiteSpace: 'nowrap' } }, p.t),
                div({ style: { display: 'flex', gap: '6px' } },
                  h('button', {
                    onClick: () => openDiag(r.loc, r.name, r.components),
                    title: 'Open the full FOB variance report + action plan for this store',
                    style: { background: 'var(--surf3)', color: 'var(--text)', border: '1px solid var(--accent,#f5bc00)', borderRadius: '6px', padding: '4px 9px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
                  }, '📋 Report'),
                  chk(reviewed, 'Reviewed', () => updateStatus(r.loc, { diagnosisStatus: reviewed ? 'pending' : 'reviewed' })),
                  chk(commsSent, 'Comms', () => updateStatus(r.loc, { commsStatus: commsSent ? 'none' : 'sent' }))));
            })))
      : h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' } },
        h('thead', null, h('tr', { style: { textAlign: 'left', color: 'var(--text3)', fontSize: '11px', textTransform: 'uppercase' } },
          [['Store'], ['Count progress'], ['By class'], ['Last count'],
           ['FOB % vs tgt', 'Food-Over-Base as a % of product sales, MTD, dollar-weighted (Σ FOB $ ÷ Σ product sales), against the store\'s FOB target. Red = over target (worse food cost) → prioritize the diagnosis; green = under.'],
           ['FOB $', 'Total Food-Over-Base dollars for the period MTD — the sum of the 6 controllable components: completed waste + raw waste + condiments + emp/mgr meals + stat variance + unexplained'],
           ['Diagnosis'], ['Communication']].map(([c, tip], i) =>
            h('th', { key: i, title: tip || '', style: { padding: '8px 10px', borderBottom: '1px solid var(--bdr)', whiteSpace: 'nowrap', cursor: tip ? 'help' : 'default' } }, c)))),
        h('tbody', null, rows.map(r =>
          h('tr', { key: r.loc, style: { borderBottom: '1px solid var(--bdr)' } },
            h('td', { style: { padding: '8px 10px' } },
              div({ style: { fontWeight: 600, color: 'var(--text)' } }, r.name,
                span({ style: { fontSize: '10px', color: 'var(--text3)', marginLeft: '6px', fontFamily: 'ui-monospace,Menlo,monospace' } }, `#${unpad(r.loc)}`)),
              span({ style: { fontSize: '10px', color: r.org === 'emerald' ? '#38bdf8' : '#f5bc00' } }, r.org === 'emerald' ? 'FL' : 'OK'),
              // Count-date exception (accept early count) — green tag when active (click to remove), else a grant link.
              r.exception
                ? span({ onClick: () => toggleException(r.loc, r.exception), title: `Early count (full count ${r.exception.acceptedDate || '?'}) accepted as this store's EOM count${r.exception.approvedBy ? ` — approved by ${r.exception.approvedBy}` : ''}${r.exception.note ? `\n${r.exception.note}` : ''}\n(click to remove)`, style: { display: 'inline-block', marginTop: '3px', fontSize: '9.5px', fontWeight: 700, color: '#4ade80', border: '1px solid #4ade80', borderRadius: '4px', padding: '0 5px', cursor: 'pointer' } }, `✓ count accepted${r.exception.acceptedDate ? ` ${r.exception.acceptedDate}` : ''}${r.exception.approvedBy ? ` · ${r.exception.approvedBy}` : ''}`)
                : h('button', { onClick: () => toggleException(r.loc, null), title: "Accept this store's early count as its EOM count (logged + attributed to the approver)", style: { display: 'block', marginTop: '3px', fontSize: '9px', color: 'var(--text3)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' } }, 'grant count exception')),
            h('td', { style: { padding: '8px 10px' } }, h(ProgressBar, { value: r.prog.earlyPctCounted ?? r.prog.pctCounted })),
            h('td', { style: { padding: '8px 10px' } }, h(ClassChips, { byClass: r.prog.byClass, uncounted: r.uncountedByClass, npDueToday: r.prog.nonProductDueToday })),
            h('td', { style: { padding: '8px 10px', color: 'var(--text2)', whiteSpace: 'nowrap', fontSize: '12px' } },
              (() => { const cd = preferredCountDate(r); return cd ? cd.toLocaleDateString() : '—'; })(),
              mode === 'progress' && (() => {
                const cd = preferredCountDate(r); if (!cd) return null;
                const a = daysAgo(cd.getTime());
                return a == null ? null : span({ style: { fontSize: '10px', color: a > 40 ? '#f87171' : 'var(--text3)', marginLeft: '5px' } }, a === 0 ? 'today' : `${a}d ago`);
              })()),
            (() => {
              const tgt = fobTgtOf(r.loc);
              const d = (r.fobPct != null && tgt != null) ? r.fobPct - tgt : null;
              const over = d != null && d > 0.0005, under = d != null && d < -0.0005;
              const c = over ? '#f87171' : under ? '#4ade80' : 'var(--text)';
              return h('td', { style: { padding: '8px 10px', fontWeight: 600, whiteSpace: 'nowrap' },
                  title: tgt != null ? `Target ${(tgt * 100).toFixed(2)}% · ${over ? 'OVER target — prioritize diagnosis' : under ? 'under target' : 'on target'}` : 'No FOB target on file' },
                span({ style: { color: c } }, pct2(r.fobPct)),
                d != null ? div({ style: { fontSize: '10px', color: c, fontWeight: 600, fontVariantNumeric: 'tabular-nums' } },
                  `tgt ${(tgt * 100).toFixed(2)}% · ${d >= 0 ? '+' : ''}${(d * 100).toFixed(2)}pp`) : null);
            })(),
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
                }, '✉️ Draft'),
                h('button', {
                  title: 'Create a read-only, no-login share link to this store\'s EOM report (scoped + expiring). Copies the URL.',
                  onClick: () => createShare(r.loc, r.name, r.components),
                  style: { background: 'none', border: '1px solid var(--bdr2)', borderRadius: '5px', color: 'var(--text2)', cursor: 'pointer', fontSize: '12px', padding: '3px 7px', marginLeft: '4px' },
                }, '🔗 Share'))))))),
    shareMsg ? div({ style: { position: 'fixed', bottom: '16px', left: '50%', transform: 'translateX(-50%)', zIndex: 500, background: 'var(--surf)', border: '1px solid var(--bdr2)', borderRadius: '8px', padding: '9px 14px', fontSize: '12.5px', color: shareMsg.startsWith('✓') ? '#4ade80' : shareMsg.startsWith('Share failed') ? '#f87171' : 'var(--text2)', boxShadow: '0 6px 20px rgba(0,0,0,.4)', maxWidth: '90vw' }, onClick: () => setShareMsg('') }, shareMsg) : null,

    // 📊 FOB Report modal (Notes 42 #1) — OK/FL summary → opportunities → patch → store, scoped.
    fobRepOpen && (() => {
      const R = fobReport;
      const ppf = f => (f == null ? '—' : (f * 100).toFixed(2) + '%');
      const trendChip = (t) => t.dir === 'improving' ? span({ style: { color: '#4ade80', fontWeight: 700 } }, `▼ improving ${t.deltaPP}pp`)
        : t.dir === 'regressing' ? span({ style: { color: '#f87171', fontWeight: 700 } }, `▲ regressing +${t.deltaPP}pp`)
        : t.dir === 'flat' ? span({ style: { color: 'var(--text3)' } }, 'flat') : span({ style: { color: 'var(--text3)' } }, 'n/a');
      const sumTile = (label, val, color, sub) => div({ style: { background: 'var(--surf2)', border: '1px solid var(--bdr2)', borderRadius: '8px', padding: '8px 12px', minWidth: '120px' } },
        div({ style: { fontSize: '9px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text3)', fontWeight: 700 } }, label),
        div({ style: { fontSize: '18px', fontWeight: 800, color } }, val),
        sub ? div({ style: { fontSize: '10px', color: 'var(--text3)' } }, sub) : null);
      const orgBlock = (o) => {
        const sm = o.summary;
        return div({ key: o.org, style: { marginBottom: '16px' } },
          div({ style: { display: 'flex', alignItems: 'baseline', gap: '10px', borderBottom: '2px solid var(--bdr2)', paddingBottom: '4px', marginBottom: '8px' } },
            span({ style: { fontWeight: 800, fontSize: '14px', color: o.org === 'FL' ? '#38bdf8' : '#f5bc00' } }, o.label),
            span({ style: { fontSize: '11px', color: 'var(--text3)' } }, `${sm.nStores} stores · avg FOB ${sm.avgFobPP != null ? sm.avgFobPP + '%' : '—'} · ${sm.overTarget} over target · ${sm.regressing} regressing · ${sm.improving} improving`),
            sm.oppDollars > 0 ? span({ style: { marginLeft: 'auto', fontSize: '11px', color: '#f87171', fontWeight: 700 } }, `${$(sm.oppDollars)}/mo opportunity`) : null),
          o.patches.map(pg => div({ key: pg.patch, style: { marginBottom: '6px' } },
            pg.patch !== '—' ? div({ style: { fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text3)', fontWeight: 700, margin: '4px 0 2px' } }, pg.patch) : null,
            pg.stores.map(r => {
              const iso = fobRepStore === r.loc;
              const gc = r.overTarget ? '#f87171' : '#4ade80';
              return div({ key: r.loc, style: { borderBottom: '1px solid var(--bdr)' } },
                div({ onClick: () => setFobRepStore(o => o === r.loc ? null : r.loc), style: { display: 'flex', alignItems: 'baseline', gap: '8px', padding: '5px 2px', cursor: 'pointer', flexWrap: 'wrap' } },
                  span({ style: { color: 'var(--text3)', fontSize: '10px' } }, iso ? '▾' : '▸'),
                  span({ style: { fontWeight: 600, color: 'var(--text)', minWidth: '140px' } }, r.name || nm(r.loc)),
                  span({ style: { fontVariantNumeric: 'tabular-nums', fontWeight: 800, color: gc } }, ppf(r.fobPct)),
                  span({ style: { fontSize: '10px', color: 'var(--text3)' } }, `tgt ${ppf(r.target)}`),
                  r.gapPP != null ? span({ style: { fontSize: '10px', fontWeight: 700, color: gc } }, `${r.gapPP > 0 ? '+' : ''}${r.gapPP}pp`) : null,
                  trendChip(r.trend),
                  r.masking ? span({ style: { fontSize: '9px', fontWeight: 700, color: '#f5bc00', border: '1px solid #f5bc00', borderRadius: '4px', padding: '0 5px' } }, 'masking') : null),
                iso ? div({ style: { padding: '4px 4px 12px 20px' } },
                  r.actions.length ? div({ style: { marginBottom: '8px' } }, div({ style: { fontSize: '10px', textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 700, marginBottom: '3px' } }, 'Action plan'),
                    r.actions.map((a, i) => div({ key: i, style: { fontSize: '11.5px', color: 'var(--text2)', lineHeight: 1.5, marginBottom: '2px' } }, '• ' + a))) : null,
                  r.comps.some(c => c.deltaPP != null) ? div({ style: { marginBottom: '6px' } }, div({ style: { fontSize: '10px', textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 700, marginBottom: '3px' } }, 'Components vs target'),
                    div({ style: { display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '11px' } }, r.comps.filter(c => c.actualPP != null).map(c => span({ key: c.key, style: { color: c.deltaPP > 0.02 ? '#f87171' : 'var(--text3)' } }, `${c.label} ${c.actualPP}%${c.tgtPP != null ? ` (t ${c.tgtPP}%)` : ''}`)))) : null,
                  r.topItems.length ? div(null, div({ style: { fontSize: '10px', textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 700, marginBottom: '3px' } }, 'Top item losers'),
                    div({ style: { fontSize: '11px', color: 'var(--text2)' } }, r.topItems.map(i => `${i.descr} ${$(i.dolDiff)}`).join(' · '))) : null,
                  r.masking ? div({ style: { fontSize: '10.5px', color: '#f5bc00', marginTop: '4px' } }, `Masking: ${$(r.grossLoss)} losses offset by ${$(r.grossGain)} gains (net ${$(r.net)}) — verify the offsetting counts are real.`) : null) : null);
            }))));
      };
      return div({ onClick: () => setFobRepOpen(false), style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' } },
        div({ onClick: e => e.stopPropagation(), style: { background: 'var(--surf)', border: '1px solid var(--bdr2)', borderRadius: '10px', width: '100%', maxWidth: '980px', maxHeight: '90vh', overflow: 'auto', padding: '18px', position: 'relative' } },
          div({ style: { fontWeight: 700, color: 'var(--text)', marginBottom: '2px', paddingRight: '30px' } }, `📊 FOB Report — ${scopeLabel()}`),
          h('button', { onClick: () => setFobRepOpen(false), style: MODAL_X }, '✕'),
          div({ style: { display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' } },
            h('button', { onClick: () => openPrintWindow('FOB Report', fobRepPrintHtml()), style: MODAL_TOOLBTN, title: 'Full report → PDF (summary + opportunities + every store)' }, '⎙ Print (full)'),
            h('button', { onClick: () => openPrintWindow('FOB Leadership Summary', leadershipPrintHtml()), style: { ...MODAL_TOOLBTN, color: '#34d399', borderColor: '#34d399' }, title: 'Detailed-yet-summarized report for above-store leaders: where we are, who is where, the math of focus stores vs top performers, and what to do' }, '⎙ Leadership Summary'),
            h('button', { onClick: () => downloadFile(fobRepCsv(), `fob-report-${R.reportPeriod}.csv`), style: MODAL_TOOLBTN, title: 'Download the report as CSV' }, '⬇ CSV')),
          // Leadership narrative — the district position + the math of laggards eroding achiever gains.
          (() => { const lines = leadershipLines(); return lines.length ? div({ style: { background: 'var(--surf2)', border: '1px solid var(--bdr2)', borderLeft: '3px solid #34d399', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px' } },
            div({ style: { fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text3)', fontWeight: 700, marginBottom: '5px' } }, 'Leadership summary — the math'),
            ...lines.map((l, i) => div({ key: i, style: { fontSize: '12px', color: 'var(--text2)', lineHeight: 1.55, marginBottom: i < lines.length - 1 ? '5px' : 0 } }, l))) : null; })(),
          div({ style: { fontSize: '11px', color: 'var(--text3)', marginBottom: '12px' } }, `Reporting ${R.reportPeriod}${R.reportPeriod !== period ? ` (latest month with real FOB — ${period} MTD not populated yet)` : ''} · ${R.summary.nStores} store(s) · dollar-weighted FOB vs target · trend = month-over-month final FOB%. Opportunities ranked by gap-to-target, regression, and masking.`),
          // Summary tiles
          div({ style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' } },
            sumTile('Stores', String(R.summary.nStores), 'var(--text)', `${R.summary.overTarget} over target`),
            sumTile('Avg FOB', R.summary.avgFobPP != null ? R.summary.avgFobPP + '%' : '—', 'var(--text)'),
            sumTile('Regressing', String(R.summary.regressing), '#f87171', `${R.summary.improving} improving`),
            sumTile('Opportunity', $(R.summary.oppDollars) + '/mo', '#f5bc00', 'over-target $ vs target'),
            ...Object.keys(R.summary.byOrg).sort().map(k => sumTile(k, (R.summary.byOrg[k].avgFobPP ?? '—') + '%', k === 'FL' ? '#38bdf8' : '#f5bc00', `${R.summary.byOrg[k].overTarget}/${R.summary.byOrg[k].nStores} over tgt`))),
          // Biggest opportunities
          R.opportunities.length ? div({ style: { marginBottom: '16px' } },
            div({ style: { fontWeight: 700, color: 'var(--text)', fontSize: '13px', marginBottom: '6px' } }, `Biggest opportunities (${R.opportunities.length})`),
            R.opportunities.slice(0, 8).map(r => div({ key: r.loc, onClick: () => { setFobRepStore(r.loc); }, style: { display: 'flex', gap: '8px', alignItems: 'baseline', padding: '3px 0', fontSize: '12px', cursor: 'pointer', flexWrap: 'wrap' } },
              span({ style: { fontWeight: 700, color: 'var(--text)', minWidth: '150px' } }, `${r.name || nm(r.loc)}`, span({ style: { fontSize: '9px', color: 'var(--text3)', marginLeft: '4px' } }, r.org)),
              span({ style: { color: '#f87171', fontWeight: 800, fontVariantNumeric: 'tabular-nums' } }, ppf(r.fobPct)),
              span({ style: { fontSize: '10px', color: 'var(--text3)' } }, `+${r.gapPP}pp vs tgt`),
              trendChip(r.trend),
              span({ style: { fontSize: '11px', color: 'var(--text2)' } }, r.actions[0] || ''))))
            : div({ style: { color: '#4ade80', fontSize: '12px', marginBottom: '14px' } }, 'No over-target or regressing stores in scope — clean. ✓'),
          // Hierarchy
          div({ style: { fontWeight: 700, color: 'var(--text)', fontSize: '13px', marginBottom: '6px', borderTop: '1px solid var(--bdr2)', paddingTop: '10px' } }, 'By market → patch → store'),
          R.orgs.map(orgBlock)));
    })(),
    // 🔬 FOB Root-Cause Analysis modal (Notes 41) — recount impact + FOB consistency, scoped + verifiable.
    riddleOpen && (() => {
      const R = riddle;
      const $ = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n || 0)).toLocaleString();
      const harmful = R.impact.filter(s => s.net < 0);
      const winLbl = R.months.length ? `${R.months[0]} → ${R.months[R.months.length - 1]} (${R.months.length} mo)` : 'no FOB history in scope';
      const th = (t, r) => h('th', { key: t, style: { textAlign: r ? 'right' : 'left', padding: '4px 9px', borderBottom: '1px solid var(--bdr2)', fontSize: '9.5px', textTransform: 'uppercase', color: 'var(--text3)', whiteSpace: 'nowrap' } }, t);
      return div({ onClick: () => setRiddleOpen(false), style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' } },
        div({ onClick: e => e.stopPropagation(), style: { background: 'var(--surf)', border: '1px solid var(--bdr2)', borderRadius: '10px', width: '100%', maxWidth: '940px', maxHeight: '90vh', overflow: 'auto', padding: '18px', position: 'relative' } },
          div({ style: { fontWeight: 700, color: 'var(--text)', marginBottom: '2px', paddingRight: '30px' } }, `🔬 FOB Root-Cause Analysis — ${scopeLabel()}`),
          h('button', { onClick: () => setRiddleOpen(false), style: MODAL_X }, '✕'),
          div({ style: { fontSize: '11px', color: 'var(--text3)', marginBottom: '10px' } }, `Scope: ${rows.length} store${rows.length === 1 ? '' : 's'} · FOB history ${winLbl} · ${R.nFob.toLocaleString()} daily snapshots · recount impact from the current-period ledger`),
          // Methodology — for trust
          div({ style: { background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: '8px', padding: '10px 12px', marginBottom: '14px', fontSize: '11.5px', color: 'var(--text2)', lineHeight: 1.55 } },
            div({ style: { fontWeight: 700, color: 'var(--text)', marginBottom: '4px' } }, 'How this is computed (audit anything):'),
            div(null, span({ style: { fontWeight: 700, color: '#a78bfa' } }, 'Recount Impact — '), 'for each item counted more than once, compare the FINAL count\'s variance to the FIRST (base) count. Closer to $0 = the recount HELPED (toward); further away = it HURT (away). Read straight from the raw item ledger — the same data the Change Monitor → Progression view shows. Net = toward − away. Net-negative stores are where recounting is adding loss.'),
            div({ style: { marginTop: '4px' } }, span({ style: { fontWeight: 700, color: '#4ade80' } }, 'FOB Consistency — '), 'each store\'s month-final FOB% across every month on record → the average and the standard deviation (sd). Low sd = repeatable results (dialed in). Dollar-weighted FOB (Σ components ÷ Σ sales), same as everywhere else.')),
          // T1 — Recount Impact
          div({ style: { fontWeight: 700, color: 'var(--text)', margin: '4px 0 6px', fontSize: '13px' } }, '① Recount Impact — the opportunities',
            harmful.length ? span({ style: { marginLeft: '8px', fontSize: '11px', color: '#f87171', fontWeight: 700 } }, `${harmful.length} store${harmful.length === 1 ? '' : 's'} net-harmful`) : span({ style: { marginLeft: '8px', fontSize: '11px', color: '#4ade80' } }, 'all net-helpful ✓')),
          !R.impact.length ? div({ style: { color: 'var(--text3)', fontSize: '12px', padding: '4px 0 12px' } }, 'No recounted items in the current-period ledger for this scope yet.')
          : div({ style: { overflowX: 'auto', marginBottom: '16px' } }, h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' } },
              h('thead', null, h('tr', null, th('Store'), th('Toward $0', 1), th('Away', 1), th('Net', 1), th('# recounted', 1))),
              h('tbody', null, R.impact.flatMap(s => {
                const isOpen = riddleStore === s.loc;
                const c = s.net < 0 ? '#f87171' : '#4ade80';
                const els = [h('tr', { key: s.loc, onClick: () => setRiddleStore(o => o === s.loc ? null : s.loc), style: { borderBottom: isOpen ? 'none' : '1px solid var(--bdr)', cursor: 'pointer' } },
                  h('td', { style: { padding: '5px 9px', color: 'var(--text)', fontWeight: 600, whiteSpace: 'nowrap' } }, `${isOpen ? '▾' : '▸'} ${nm(s.loc)}`, span({ style: { color: 'var(--text3)', fontWeight: 400, marginLeft: '5px', fontFamily: 'ui-monospace,Menlo,monospace', fontSize: '10px' } }, `#${unpad(s.loc)}`)),
                  h('td', { style: { padding: '5px 9px', textAlign: 'right', color: '#4ade80', fontVariantNumeric: 'tabular-nums' } }, $(s.toward)),
                  h('td', { style: { padding: '5px 9px', textAlign: 'right', color: '#f87171', fontVariantNumeric: 'tabular-nums' } }, $(s.away)),
                  h('td', { style: { padding: '5px 9px', textAlign: 'right', fontWeight: 800, color: c, fontVariantNumeric: 'tabular-nums' } }, `${s.net >= 0 ? '+' : ''}${$(s.net)}`),
                  h('td', { style: { padding: '5px 9px', textAlign: 'right', color: 'var(--text3)' } }, s.nRecounted))];
                if (isOpen) els.push(h('tr', { key: s.loc + '-d', style: { borderBottom: '1px solid var(--bdr)' } },
                  h('td', { colSpan: 5, style: { padding: '2px 9px 10px 22px', background: 'var(--surf3)' } },
                    div({ style: { fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase', margin: '4px 0 3px' } }, 'Recounts that hurt most (base → final)'),
                    s.items.slice(0, 12).map((it, i) => div({ key: i, style: { fontSize: '11.5px', color: 'var(--text2)', padding: '1px 0' } },
                      span({ style: { fontWeight: 600, color: 'var(--text)' } }, it.descr), ' — ',
                      span({ style: { fontFamily: 'ui-monospace,Menlo,monospace' } }, `${$(it.baseVar)} → ${$(it.finalVar)}`), ' · ',
                      span({ style: { fontWeight: 700, color: it.effect < 0 ? '#f87171' : '#4ade80' } }, `${it.effect < 0 ? 'hurt ' : 'helped '}${$(Math.abs(it.effect))}`))))));
                return els;
              })))),
          // T3 — Consistency
          div({ style: { fontWeight: 700, color: 'var(--text)', margin: '4px 0 6px', fontSize: '13px' } }, '② FOB Consistency — steadiest first (lowest sd = most dialed in)'),
          !R.consistency.length ? div({ style: { color: 'var(--text3)', fontSize: '12px', padding: '4px 0' } }, 'Need ≥2 months of FOB history in scope to measure consistency.')
          : div({ style: { overflowX: 'auto' } }, h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' } },
              h('thead', null, h('tr', null, th('Store'), th('Mean FOB%', 1), th('Std dev (pp)', 1), th('# months', 1))),
              h('tbody', null, R.consistency.map((s, i) => h('tr', { key: s.loc, style: { borderBottom: '1px solid var(--bdr)' } },
                h('td', { style: { padding: '5px 9px', color: 'var(--text)', fontWeight: 600, whiteSpace: 'nowrap' } }, i < 3 ? '🟢 ' : '', nm(s.loc), span({ style: { color: 'var(--text3)', fontWeight: 400, marginLeft: '5px', fontFamily: 'ui-monospace,Menlo,monospace', fontSize: '10px' } }, `#${unpad(s.loc)}`)),
                h('td', { style: { padding: '5px 9px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text2)' } }, `${s.mean.toFixed(2)}%`),
                h('td', { style: { padding: '5px 9px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: s.sd < 0.3 ? '#4ade80' : s.sd < 0.5 ? '#f5bc00' : '#f87171' } }, s.sd.toFixed(2)),
                h('td', { style: { padding: '5px 9px', textAlign: 'right', color: 'var(--text3)' } }, s.n)))))),
          div({ style: { marginTop: '12px', fontSize: '10.5px', color: 'var(--text3)', fontStyle: 'italic' } }, 'Recount impact reads the current selected period\'s ledger; consistency spans all FOB history in scope. Click a store above to see the recounts driving its number.')));
    })(),

    // Waste analysis modal (Notes 40 #2) — Second-Look waste rules across the scope.
    wasteOpen && div({
      onClick: () => setWasteOpen(false),
      style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
    },
      div({ onClick: e => e.stopPropagation(),
        style: { background: 'var(--surf)', border: '1px solid var(--bdr2)', borderRadius: '10px', width: '100%', maxWidth: '860px', maxHeight: '90vh', overflow: 'auto', padding: '18px', position: 'relative' } },
        div({ style: { fontWeight: 700, color: 'var(--text)', marginBottom: '2px', paddingRight: '30px' } }, `🗑 Waste Analysis — ${scopeLabel()}`),
        h('button', { onClick: () => setWasteOpen(false), style: MODAL_X }, '✕'),
        div({ style: { fontSize: '11.5px', color: 'var(--text3)', marginBottom: '12px' } },
          wasteScan ? `${wasteScan.nFlags} flag${wasteScan.nFlags === 1 ? '' : 's'} across ${wasteScan.nStores} store${wasteScan.nStores === 1 ? '' : 's'} · ${period} · Second-Look waste rules (verify, don't accuse)` : ''),
        (!wasteScan || !wasteScan.stores.length)
          ? div({ style: { color: '#4ade80', padding: '16px', fontSize: '13px' } }, '🏆 No waste patterns flagged across this scope — logging looks clean.')
          : div(null, wasteScan.stores.map(s => {
              const drilled = wasteDrill === s.loc;
              const evs = drilled ? wasteEventsFor(s.loc) : [];
              return div({ key: s.loc, style: { border: '1px solid var(--bdr)', borderLeft: `3px solid ${s.flags.some(f => f.sev >= 3) ? '#f87171' : '#fb923c'}`, borderRadius: '7px', background: 'var(--surf2)', padding: '10px 12px', marginBottom: '8px' } }, [
              div({ key: 'h', style: { display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '5px' } },
                span({ onClick: () => setWasteDrill(d => d === s.loc ? null : s.loc), style: { fontWeight: 700, color: 'var(--text)', fontSize: '13px', cursor: 'pointer' }, title: 'Show / hide the raw waste events behind these flags' }, `${drilled ? '▾' : '▸'} ${nm(s.loc)}`),
                span({ style: { color: 'var(--text3)', fontSize: '10px', fontFamily: 'ui-monospace,Menlo,monospace' } }, `#${unpad(s.loc)}`),
                span({ style: { marginLeft: 'auto', color: 'var(--text3)', fontSize: '10.5px' } }, `$${Math.round(s.total).toLocaleString()} waste · ${s.nEvents} entries`),
                h('button', { onClick: () => askSageWaste(s), title: 'Open SAGE with this store\'s waste picture — coaching questions, not accusations', style: { background: 'none', color: 'var(--accent,#f5bc00)', border: '1px solid var(--accent,#f5bc00)', borderRadius: '5px', padding: '1px 7px', fontSize: '10px', fontWeight: 700, cursor: 'pointer' } }, '🧠 Ask SAGE')),
              ...s.flags.map((f, i) => div({ key: 'f' + i, style: { display: 'flex', gap: '7px', alignItems: 'baseline', fontSize: '12px', color: 'var(--text2)', padding: '2px 0' } },
                span({ style: { fontSize: '9px', fontWeight: 700, color: f.sev >= 3 ? '#f87171' : f.sev >= 2 ? '#fb923c' : '#f5bc00', border: `1px solid ${f.sev >= 3 ? '#f87171' : f.sev >= 2 ? '#fb923c' : '#f5bc00'}`, borderRadius: '4px', padding: '0 5px', textTransform: 'uppercase', whiteSpace: 'nowrap' } }, f.kind),
                span(null, f.label))),
              drilled && div({ key: 'drill', style: { marginTop: '7px', borderTop: '1px dashed var(--bdr)', paddingTop: '6px' } }, [
                div({ key: 'dh', style: { fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: '3px' } }, `Waste events (largest first) — ${evs.length}`),
                ...evs.slice(0, 40).map((e, i) => div({ key: 'e' + i, style: { display: 'flex', gap: '8px', alignItems: 'baseline', fontSize: '11.5px', color: 'var(--text2)', padding: '1px 0', fontFamily: 'ui-monospace,Menlo,monospace' } },
                  span({ style: { color: 'var(--text3)', minWidth: '92px' } }, `${e.dt}${e.tm ? ' ' + String(e.tm).slice(0, 5) : ''}`),
                  span({ style: { color: 'var(--text)', fontWeight: 600, minWidth: '64px', textAlign: 'right' } }, `$${Number(e.amount).toFixed(2)}`),
                  span({ style: { flex: 1 } }, `${e.type || 'waste'} · ${e.manager || '?'}`),
                  e.edited && span({ style: { color: '#fb923c', fontSize: '9px', fontWeight: 700 } }, 'EDITED'),
                  e.reason && span({ style: { color: 'var(--text3)', fontSize: '10px' } }, e.reason))),
                evs.length > 40 && div({ key: 'more', style: { fontSize: '10px', color: 'var(--text3)', marginTop: '2px' } }, `+${evs.length - 40} more`),
              ]),
            ]); })),
        div({ style: { fontSize: '10.5px', color: 'var(--text3)', marginTop: '10px', fontStyle: 'italic' } }, 'Uniform = same $ many days (estimated, not weighed) · Session = one manager/day outlier · Concentration = one manager\'s share · Spike = count-window day spike. Verify, don\'t accuse.')),
    ),

    // comms draft modal
    draft && div({
      onClick: () => setDraft(null),
      style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
    },
      div({
        onClick: e => e.stopPropagation(),
        style: { background: 'var(--surf)', border: '1px solid var(--bdr2)', borderRadius: '10px', width: '100%', maxWidth: '640px', maxHeight: '85vh', overflow: 'auto', padding: '18px', position: 'relative' },
      },
        div({ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' } },
          div({ style: { fontWeight: 700, color: 'var(--text)' } }, `✉️ Store message — ${draft.name}`),
          h('button', { onClick: () => setDraft(null), style: MODAL_X }, '✕')),
        div({ style: { fontSize: '12px', color: 'var(--text3)', marginBottom: '6px' } }, 'Subject'),
        div({ style: { fontSize: '13px', color: 'var(--text)', fontWeight: 600, marginBottom: '12px', padding: '8px 10px', background: 'var(--surf3)', borderRadius: '6px', border: '1px solid var(--bdr)' } }, draft.subject),
        // FOB component strip verbatim (owner Notes 38) — same tiles the diagnose panel shows on top.
        h(FobStrip, { fob: draft.fob, loc: draft.loc }),
        div({ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' } },
          span({ style: { fontSize: '12px', color: 'var(--text3)' } }, draftFull ? 'Full report' : 'Abbreviated recap'),
          div({ style: { display: 'flex', gap: '12px' } },
            (draft.fullBody && draft.fullBody !== draft.recapBody)
              ? h('button', { onClick: () => setDraftFull(f => !f), style: { background: 'none', border: 'none', color: draftFull ? 'var(--gold)' : 'var(--text3)', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline' } }, draftFull ? '↩ Recap' : 'Full report →') : null,
            h('button', { onClick: () => setDraftText(t => !t), style: { background: 'none', border: 'none', color: 'var(--text3)', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline' } }, draftText ? 'Formatted' : 'Plain text'))),
        // Message body — the approved abbreviated recap by default (Full report a click away).
        // Formatted (mdToHtml) reads like the report + copies with styling; Plain text = raw for SMS/Slack.
        draftText
          ? h('textarea', {
              readOnly: true, value: (draftFull ? (draft.fullBody || draft.body) : (draft.recapBody || draft.body)),
              style: { width: '100%', minHeight: '240px', background: 'var(--surf3)', color: 'var(--text)', border: '1px solid var(--bdr)', borderRadius: '6px', padding: '10px', fontSize: '12.5px', fontFamily: 'inherit', lineHeight: 1.5, resize: 'vertical' },
            })
          : h('div', {
              className: 'md-rpt',
              style: { maxHeight: '52vh', overflow: 'auto', border: '1px solid var(--bdr)', borderRadius: '6px', background: 'var(--surf3)', padding: '12px', fontSize: '13px', lineHeight: 1.55 },
              dangerouslySetInnerHTML: { __html: mdToHtml(draftFull ? (draft.fullBody || draft.body) : (draft.recapBody || draft.body)) },
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
        style: { background: 'var(--surf)', border: '1px solid var(--bdr2)', borderRadius: '10px', width: '100%', maxWidth: '720px', maxHeight: '85vh', overflow: 'auto', padding: '18px', position: 'relative' },
      },
        div({ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' } },
          div({ style: { fontWeight: 700, color: 'var(--text)' } }, `🔬 Food-Cost Diagnosis — ${diag.name}`),
          h('button', { onClick: () => setDiag(null), style: MODAL_X }, '✕')),
        div({ style: { fontSize: '12px', color: 'var(--text3)', marginBottom: '10px' } }, diag.result.summary),
        // Count timing (#45) — the LAST count date's start→end + duration (owner: the final count is
        // the meaningful one; mid-cycle counts telescope out of the EOM result).
        (() => { const t = timingByLoc[diag.loc]; if (!t) return null;
          return div({ style: { fontSize: '11.5px', color: 'var(--text2)', marginBottom: '10px', padding: '5px 9px', background: 'var(--surf3)', borderRadius: '6px', display: 'inline-block' } },
            `⏱ Last count ${t.countDate}: `,
            t.hasTimes
              ? span(null, `${t.beganTm} → ${t.endedTm} · `, span({ style: { fontWeight: 700, color: 'var(--text)' } }, fmtDurationHMS(t.durationMs)))
              : span({ style: { color: 'var(--text3)' } }, 'no time recorded — duration unknown'),
            t.nDays > 1 ? span({ style: { color: 'var(--text3)' } }, ` · counted over ${t.nDays} days`) : null,
            t.bulkSubmit ? span({ style: { color: '#f87171', fontWeight: 700, display: 'block', marginTop: '3px' }, title: 'A single timestamp accounts for the whole count — submitted all at once instead of the lock-in-as-you-go travel path. Variance for items in active use during the count may be skewed.' },
              t.allSame
                ? '⚠ All counts submitted at once — travel-path process not followed (in-use items may be skewed)'
                : `⚠ Whole count submitted at once — ${t.domCount} of ${t.domCount + t.nStragglers} items @ ${t.domTm}${t.nStragglers ? `, ${t.nStragglers} added after` : ''}; travel-path not followed (in-use items may be skewed)`) : null); })(),

        // FOB snapshot strip (owner req) — current period FOB $/% + all 6 components, low-profile,
        // right where the diagnosis works. FOB% vs the store's target: red = over (worse food cost).
        h(FobStrip, { fob: diag.fob, loc: diag.loc }),

        // FOB ANALYSIS report FIRST (owner reversed the order — this is where they work from).
        // Rendered markdown (tables, tiers, chips). Copy/Print use the raw text.
        div({ style: { fontSize: '12px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '6px' } }, 'FOB Analysis'),
        h('style', null, `.md-rpt{font-size:12.5px;line-height:1.5;color:var(--text);max-height:60vh;overflow:auto;background:var(--surf3);border:1px solid var(--bdr);border-radius:6px;padding:12px 14px}
          .md-rpt h1{font-size:15px;margin:2px 0 6px;color:var(--text)}
          .md-rpt h2{font-size:13px;margin:12px 0 4px;color:var(--text);border-bottom:1px solid var(--bdr);padding-bottom:3px}
          .md-rpt table{border-collapse:collapse;width:100%;margin:4px 0 8px;font-size:11.5px}
          .md-rpt th{background:var(--surf2);text-align:left;padding:3px 7px;border:.5px solid var(--bdr);color:var(--text2)}
          .md-rpt td{padding:3px 7px;border:.5px solid var(--bdr)}
          .md-rpt ul,.md-rpt ol{margin:3px 0;padding-left:18px}
          .md-rpt li{margin:2px 0}
          .md-rpt p{margin:4px 0}
          .md-rpt code{background:var(--surf2);padding:1px 4px;border-radius:3px;font-size:11px}
          .md-rpt .chip{display:inline-block;font-size:10px;font-weight:700;padding:1px 7px;border-radius:9px;margin:0 2px;border:1px solid}
          .md-rpt .chip-warn{background:rgba(245,188,0,.14);border-color:#f5bc00;color:#f5bc00}
          .md-rpt .chip-bad{background:rgba(248,113,113,.14);border-color:#f87171;color:#f87171}
          .md-rpt .chip-good{background:rgba(74,222,128,.14);border-color:#4ade80;color:#4ade80}
          .md-rpt .chip-info{background:rgba(91,155,213,.14);border-color:#5b9bd5;color:#7fb0e0}`),
        h('div', { className: 'md-rpt', dangerouslySetInnerHTML: { __html: mdToHtml(diag.report) } }),

        // Action items now BELOW the analysis (owner reversed the order), each carrying its own
        // provenance: month-over-month history + a pattern chip, click to expand (owner req).
        h(ActionItemsProvenance, { findings: diag.result.findings, history: diag.history, caseSzByWrin: diag.caseSzByWrin }),

        // #38 — interactive verify-&-clear for obsolete/discontinued/inactive items (class-aware,
        // logs the decision to Supabase; no QSRSoft write-back in v1).
        (() => {
          const stale = (diag.incomplete?.uncounted || []).filter(u => u.state === 'stale').sort((a, b) => (b.valueAtRisk || 0) - (a.valueAtRisk || 0));
          if (!stale.length) return null;
          const perish = cls => { const c = String(cls || '').toLowerCase(); return c === 'food' || c === 'condiment'; };
          const $ = v => `$${Math.round(v || 0).toLocaleString()}`;
          const decided = stale.filter(u => (dispByWrin[String(u.wrin)] || 'pending') !== 'pending').length;
          return div({ style: { marginTop: '14px' } },
            div({ style: { fontSize: '12px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '2px' } },
              `🧹 Verify & clear — obsolete / discontinued / inactive (${decided}/${stale.length} decided)`),
            div({ style: { fontSize: '10.5px', color: 'var(--text3)', marginBottom: '6px' } },
              'Verify with a physical count first, then log the decision. Food/Condiment: waste to zero if it won\'t be used before expiration. Non-product (promo/paper): keep if usable — don\'t discard. Deactivate the WRIN only at a verified zero on-hand.'),
            div({ style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
              stale.slice(0, 20).map(u => {
                const cur = dispByWrin[String(u.wrin)] || 'pending';
                const busy = dispBusy === String(u.wrin);
                const mk = (val, label, color) => h('button', {
                  key: val, disabled: busy, onClick: () => setDisposition(diag.loc, u, val),
                  style: { background: cur === val ? color : 'var(--surf)', color: cur === val ? '#0f1117' : 'var(--text2)', border: `1px solid ${color}`, borderRadius: '5px', padding: '2px 8px', fontSize: '10.5px', fontWeight: 700, cursor: busy ? 'default' : 'pointer', whiteSpace: 'nowrap' },
                }, label);
                return div({ key: u.wrin, style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 8px', background: 'var(--surf3)', borderRadius: '6px', borderLeft: `3px solid ${cur !== 'pending' ? '#4ade80' : '#f5bc00'}`, flexWrap: 'wrap' } },
                  div({ style: { flex: 1, minWidth: '150px' } },
                    div({ style: { fontSize: '12px', color: 'var(--text)' } }, `${u.descr || u.wrin} `,
                      span({ style: { color: 'var(--text3)', fontSize: '10.5px' } }, `· ${u.cls || 'item'} · on-hand ${$(u.onHandAmt)}`))),
                  div({ style: { display: 'flex', gap: '4px' } },
                    mk('counted', '✓ Counted', '#38bdf8'),
                    perish(u.cls) ? mk('wrote_off', '✗ Wrote off', '#f87171') : mk('kept_usable', '◦ Kept (usable)', '#4ade80')));
              }),
              stale.length > 20 ? div({ style: { fontSize: '10.5px', color: 'var(--text3)', padding: '4px' } }, `+${stale.length - 20} more.`) : null));
        })(),

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
            title: 'Open SAGE with this report loaded — ask follow-ups (recount list, GM message, root cause)',
            onClick: () => {
              try { window.__MF_SAGE_SEED__ = { context: diag.report, prompt: `From this ${diag.name} FOB variance report, give me a prioritized recount list and a short GM message. Respect the Count-integrity section: NEVER-counted items are the only true "go count it" recovery; EARLY-counted items are already counted (recount only if the count looks wrong — the dollars are locked this period); STALE / obsolete / discontinued / inactive items need a verify-and-count before close, not a recount — and the disposal is CLASS-SPECIFIC: for FOOD/CONDIMENT, verify & enter a count and if it will not be used before its expiration, waste it to zero to account for the balance, then deactivate the WRIN at a verified zero on-hand; for NON-PRODUCT (promotional/Happy Meal items like HM26, paper, supplies), count and KEEP it in inventory if it is still usable (donation / local giveaway) and deactivate the WRIN only once it is genuinely used up and verified at zero — never tell a manager to discard usable non-product. Don't tell the GM to "count $X of blanks" unless that $ is in the NEVER bucket. Apply the Decision guide 2x2: a mid-month COUNT ERROR washes out of the monthly figure (QSRSoft anchors period-to-period) — don't chase a locked, verified one-off. But a locked REAL loss that RECURS still needs its cause fixed (portion/yield/theft/process) because it returns next month; and an early count never re-counted at EOM is still fixable — recount it to protect next month's opening. Separate "drop it" (locked one-off) from "fix the cause" (recurring) from "recount now" (still-fixable count). Flag any UOM-sanity items as verify-first, not confirmed losses. Weight the direction by CLASS: Food + Condiment are ~22-29% of revenue and are where variance/waste attention actually moves the P&L — lead the recount list and the GM message with them. Paper / Non-Product are ~3-4% of revenue and raw paper is very seldom wasted on its own (it's normally captured inside a completed-product waste), so do NOT send the GM to chase paper/non-product waste as an opportunity unless a number is clearly and materially out of line — keep it to a brief mention, not an action item.` }; } catch {}
              try { window.dispatchEvent(new CustomEvent('mf:open-sage')); } catch {}
              // Close BOTH the diagnose panel AND the EOM Dashboard modal — otherwise SAGE
              // (rendered at the App level) opens BEHIND these overlays and looks like nothing
              // happened (owner report, Notes 36). Closing them lands the manager in seeded SAGE.
              setDiag(null);
              onClose && onClose();
            },
            style: { background: 'none', color: 'var(--text2)', border: '1px solid var(--accent,#f5bc00)', borderRadius: '6px', padding: '8px 14px', fontWeight: 700, cursor: 'pointer', fontSize: '13px' },
          }, '🧠 Ask SAGE'),
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
          style: { background: 'var(--surf)', border: '1px solid var(--bdr2)', borderRadius: '10px', width: '100%', maxWidth: '760px', maxHeight: '88vh', overflow: 'auto', padding: '18px', position: 'relative' },
        },
          div({ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' } },
            div({ style: { fontWeight: 700, color: 'var(--text)' } }, `📊 Item journeys — ${journeys.name}`),
            h('button', { onClick: () => setJourneys(null), style: MODAL_X }, '✕')),
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
    relOpen && div({
      onClick: () => setRelOpen(false),
      style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
    },
      div({ onClick: e => e.stopPropagation(),
        style: { background: 'var(--surf)', border: '1px solid var(--bdr2)', borderRadius: '10px', width: '100%', maxWidth: '720px', maxHeight: '88vh', overflow: 'auto', padding: '18px', position: 'relative' } },
        div({ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', gap: '8px', flexWrap: 'wrap', paddingRight: '30px' } },
          div({ style: { fontWeight: 700, color: 'var(--text)' } }, `📊 Count Reliability — ${scope === 'all' ? 'all stores' : scope}${oneStore ? ` · ${nm(oneStore)}` : ''}`),
          div({ style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text3)' }, title: 'Prior monthly count periods scored (one EOM count = one month).' },
            'Look back (months)',
            div({ style: { display: 'flex', border: '1px solid var(--bdr2)', borderRadius: '6px', overflow: 'hidden' } },
              [1, 2, 3, 6, 12].map(n => h('button', { key: n, onClick: () => { setRelLookback(n); runReliabilityScan(n); }, disabled: relBusy,
                style: { background: relLookback === n ? '#f5bc00' : 'var(--surf3)', color: relLookback === n ? '#0f1117' : 'var(--text2)', border: 'none', padding: '3px 9px', fontSize: '11px', fontWeight: 700, cursor: relBusy ? 'default' : 'pointer' } }, n))))),
        h('button', { onClick: () => setRelOpen(false), style: MODAL_X }, '✕'),
        div({ style: { fontSize: '11.5px', color: 'var(--text3)', marginBottom: '10px' } },
          'How CONSISTENTLY each store counts — a store whose same items swing wildly month-to-month (big over-count→correction reversals) is counting unreliably, which skews its numbers AND risks a bad opening for next month. Real losses do NOT count against the grade. Accuracy + consistency is king. Least reliable first. Click a store to see the items behind its grade.'),
        rel && rel.stores.length ? div({ style: { display: 'flex', gap: '7px', marginBottom: '10px' } },
          h('button', { onClick: () => downloadText(`count-reliability_${scope}_${period}.csv`, relCsv()), style: MODAL_TOOLBTN, title: 'Download the full store×item detail as CSV' }, '⤓ Save CSV'),
          h('button', { onClick: () => openPrintWindow('Count Reliability', relPrintHtml()), style: MODAL_TOOLBTN, title: 'Open a printable report (Save as PDF or print)' }, '⎙ Print')) : null,
        relBusy ? div({ style: { padding: '30px', textAlign: 'center', color: 'var(--text3)' } }, 'Scoring count consistency across the scope…')
          : rel?.error ? div({ style: { padding: '20px', textAlign: 'center', color: '#f87171', fontSize: '13px' } }, `Scan failed: ${rel.error}`)
          : rel && !rel.stores.length ? div({ style: { padding: '20px', textAlign: 'center', color: '#f5bc00', fontSize: '13px' } },
              !rel.nRows ? 'No variance history for this scope/window — run the Variance pull or widen the look-back.'
                : rel.periods && rel.periods.length < 2 ? `Only 1 period in this window (${rel.nRows.toLocaleString()} rows) — consistency needs at least 2 periods to compare. Choose a 2+ look-back.`
                : `Read ${rel.nRows.toLocaleString()} rows, but no store has enough multi-period items to score yet — widen the look-back.`)
          : rel ? div({ style: { display: 'flex', flexDirection: 'column', gap: '5px' } },
              rel.stores.map(s => {
                const gc = s.grade === 'A' ? '#4ade80' : s.grade === 'B' ? '#a3e635' : s.grade === 'C' ? '#f5bc00' : s.grade === 'D' ? '#fb923c' : '#f87171';
                const isOpen = relOpenRows[s.loc];
                const canOpen = (s.worst || []).length > 0;
                return div({ key: s.loc, style: { background: 'var(--surf3)', borderRadius: '6px', borderLeft: `3px solid ${gc}`, overflow: 'hidden' } },
                  div({ onClick: () => canOpen && setRelOpenRows(o => ({ ...o, [s.loc]: !o[s.loc] })),
                    style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 10px', cursor: canOpen ? 'pointer' : 'default' } },
                    span({ style: { color: 'var(--text3)', fontSize: '11px', width: '10px', flexShrink: 0 } }, canOpen ? (isOpen ? '▾' : '▸') : ''),
                    div({ style: { minWidth: '34px', textAlign: 'center' } },
                      div({ style: { fontSize: '18px', fontWeight: 800, color: gc, lineHeight: 1 } }, s.grade),
                      div({ style: { fontSize: '10px', color: 'var(--text3)' } }, `${s.score}%`)),
                    div({ style: { flex: 1, minWidth: 0 } },
                      div({ style: { fontSize: '12.5px', color: 'var(--text)', fontWeight: 600 } }, nm(s.loc)),
                      div({ style: { fontSize: '11px', color: 'var(--text3)' } },
                        `${s.nInconsistent} inconsistent-count item${s.nInconsistent === 1 ? '' : 's'}${s.nFluct ? ` · ${s.nFluct} fluctuating` : ''} of ${s.nItems} scored${canOpen ? '' : ' — consistent ✓'}`))),
                  isOpen && div({ style: { padding: '2px 12px 10px 30px', borderTop: '1px solid var(--bdr)' } },
                    div({ style: { fontSize: '10.5px', color: 'var(--text3)', margin: '8px 0 6px', textTransform: 'uppercase', letterSpacing: '.05em' } }, 'Items behind the grade — biggest count swing first'),
                    div({ style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
                      (s.worst || []).map(w => div({ key: w.wrin, style: { display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap', fontSize: '11.5px' } },
                        span({ style: { color: 'var(--text)', fontWeight: 600 } }, w.descr || w.wrin),
                        span({ style: { color: 'var(--text3)', fontSize: '10px' } }, `${w.cls || ''} · WRIN ${w.wrin}`),
                        span({ style: { color: '#f87171', fontWeight: 700 } }, `swing $${Math.round(w.swing || 0).toLocaleString()}`),
                        span({ style: { color: 'var(--text3)' } }, `+$${Math.round(w.swingHi || 0).toLocaleString()} (${w.swingHiP || ''}) → -$${Math.abs(Math.round(w.swingLo || 0)).toLocaleString()} (${w.swingLoP || ''})`))))));
              }))
          : null)),

    rbOpen && div({
      onClick: () => setRbOpen(false),
      style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
    },
      div({ onClick: e => e.stopPropagation(),
        style: { background: 'var(--surf)', border: '1px solid var(--bdr2)', borderRadius: '10px', width: '100%', maxWidth: '760px', maxHeight: '88vh', overflow: 'auto', padding: '18px', position: 'relative' } },
        div({ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', gap: '8px', flexWrap: 'wrap', paddingRight: '30px' } },
          div({ style: { fontWeight: 700, color: 'var(--text)' } }, `🪃 Rubber-band — ${scope === 'all' ? 'all stores' : scope}${oneStore ? ` · ${nm(oneStore)}` : ''}`),
          div({ style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text3)' }, title: 'Prior monthly count periods scanned. Rubber-band needs at least 3 to see a run then a snap.' },
            'Look back (months)',
            div({ style: { display: 'flex', border: '1px solid var(--bdr2)', borderRadius: '6px', overflow: 'hidden' } },
              [3, 6, 12].map(n => h('button', { key: n, onClick: () => { setRbLookback(n); runRubberBandScan(n); }, disabled: rbBusy,
                style: { background: rbLookback === n ? '#f5bc00' : 'var(--surf3)', color: rbLookback === n ? '#0f1117' : 'var(--text2)', border: 'none', padding: '3px 9px', fontSize: '11px', fontWeight: 700, cursor: rbBusy ? 'default' : 'pointer' } }, n))))),
        h('button', { onClick: () => setRbOpen(false), style: MODAL_X }, '✕'),
        div({ style: { fontSize: '11.5px', color: 'var(--text3)', marginBottom: '10px' } },
          'The padding→collapse pattern: an item that ran OVER (a gain — inventory padded, a "loan against next month") for 2+ months and then SNAPPED to a big short. That snap is the accumulated padding catching up. Biggest snap exposure first. Click a store for the items. Verify each — a real explanation clears it.'),
        rb && rb.stores.length ? div({ style: { display: 'flex', gap: '7px', marginBottom: '10px' } },
          h('button', { onClick: () => downloadText(`rubber-band_${scope}_${period}.csv`, rbCsv()), style: MODAL_TOOLBTN, title: 'Download the full store×item detail as CSV' }, '⤓ Save CSV'),
          h('button', { onClick: () => openPrintWindow('Rubber-band', rbPrintHtml()), style: MODAL_TOOLBTN, title: 'Open a printable report' }, '⎙ Print')) : null,
        rbBusy ? div({ style: { padding: '30px', textAlign: 'center', color: 'var(--text3)' } }, 'Scanning for padding→collapse across the scope…')
          : rb?.error ? div({ style: { padding: '20px', textAlign: 'center', color: '#f87171', fontSize: '13px' } }, `Scan failed: ${rb.error}`)
          : rb && !rb.stores.length ? div({ style: { padding: '20px', textAlign: 'center', color: rb.nRows ? '#4ade80' : '#f5bc00', fontSize: '13px' } },
              !rb.nRows ? 'No variance history for this scope/window — run the Variance pull or widen the look-back.'
                : rb.periods && rb.periods.length < 3 ? `Only ${rb.periods.length} period(s) in this window — rubber-band needs at least 3 to see a run then a snap. Choose a 3+ look-back.`
                : `✓ No rubber-band patterns — no store shows an over-run that snapped to a short across ${rb.periods.length} periods.`)
          : rb ? div({ style: { display: 'flex', flexDirection: 'column', gap: '5px' } },
              rb.stores.map(s => {
                const isOpen = rbOpenRows[s.loc];
                return div({ key: s.loc, style: { background: 'var(--surf3)', borderRadius: '6px', borderLeft: '3px solid #fb923c', overflow: 'hidden' } },
                  div({ onClick: () => setRbOpenRows(o => ({ ...o, [s.loc]: !o[s.loc] })),
                    style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 10px', cursor: 'pointer' } },
                    span({ style: { color: 'var(--text3)', fontSize: '11px', width: '10px', flexShrink: 0 } }, isOpen ? '▾' : '▸'),
                    div({ style: { flex: 1, minWidth: 0 } },
                      div({ style: { fontSize: '12.5px', color: 'var(--text)', fontWeight: 600 } }, nm(s.loc)),
                      div({ style: { fontSize: '11px', color: 'var(--text3)' } }, `${s.nItems} rubber-band item${s.nItems === 1 ? '' : 's'} — e.g. ${s.worst.slice(0, 3).map(w => w.descr || w.wrin).join(', ')}`)),
                    div({ style: { textAlign: 'right', flexShrink: 0 } },
                      div({ style: { fontSize: '13px', fontWeight: 800, color: '#fb923c' } }, `$${Math.round(s.totalSnap || 0).toLocaleString()}`),
                      div({ style: { fontSize: '10px', color: 'var(--text3)' } }, 'snap exposure'))),
                  isOpen && div({ style: { padding: '2px 12px 10px 30px', borderTop: '1px solid var(--bdr)' } },
                    div({ style: { fontSize: '10.5px', color: 'var(--text3)', margin: '8px 0 6px', textTransform: 'uppercase', letterSpacing: '.05em' } }, 'Items — padding built up, then snapped'),
                    div({ style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
                      (s.worst || []).map(w => div({ key: w.wrin, style: { display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap', fontSize: '11.5px' } },
                        span({ style: { color: 'var(--text)', fontWeight: 600 } }, w.descr || w.wrin),
                        span({ style: { color: 'var(--text3)', fontSize: '10px' } }, `${w.cls || ''} · WRIN ${w.wrin}`),
                        span({ style: { color: '#fb923c', fontWeight: 700 } }, `snap $${Math.round(w.snap || 0).toLocaleString()}`),
                        span({ style: { color: 'var(--text3)' } }, `+$${Math.round(w.overSum || 0).toLocaleString()} over ${w.overN} mo (from ${w.from || ''}) → snapped ${w.to || ''}`))))));
              }))
          : null)),

    sumOpen && (() => {
      const d = districtSummary, r = d.rollup;
      const $ = v => `$${Math.round(v || 0).toLocaleString()}`;
      const pctS = p => p != null ? `${(p * 100).toFixed(2)}%` : '—';
      const box = { padding: '4px 9px', background: 'var(--surf3)', border: '1px solid var(--bdr)', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '1px' };
      const lab = { fontSize: '8px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap' };
      const big = c => ({ fontSize: '13px', fontWeight: 800, color: c || 'var(--text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' });
      const fobOver = r.fobPct != null && r.fobTgt != null && r.fobPct > r.fobTgt;
      const th = t => h('th', { style: { textAlign: 'right', color: 'var(--text3)', fontWeight: 600, padding: '4px 7px', borderBottom: '1px solid var(--bdr2)', fontSize: '9.5px', textTransform: 'uppercase', whiteSpace: 'nowrap' } }, t);
      const stores = d.stores.slice().sort((a, b) => (b.over$ || -1e9) - (a.over$ || -1e9));
      return div({
        onClick: () => setSumOpen(false),
        style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
      },
        div({ onClick: e => e.stopPropagation(),
          style: { background: 'var(--surf)', border: '1px solid var(--bdr2)', borderRadius: '10px', width: '100%', maxWidth: '960px', maxHeight: '90vh', overflow: 'auto', padding: '18px', position: 'relative' } },
          div({ style: { fontWeight: 700, color: 'var(--text)', marginBottom: '2px', paddingRight: '30px' } }, `📊 District EOM Summary — ${scopeLabel()}`),
          h('button', { onClick: () => setSumOpen(false), style: MODAL_X }, '✕'),
          div({ style: { fontSize: '11px', color: 'var(--text3)', marginBottom: '10px' } }, `${period} · ${r.nStores} store${r.nStores === 1 ? '' : 's'} · dollar-weighted roll-up`),
          div({ style: { display: 'flex', gap: '7px', marginBottom: '12px' } },
            h('button', { onClick: () => downloadText(`eom-summary_${scope}_${period}.csv`, sumCsv()), style: MODAL_TOOLBTN }, '⤓ Save CSV'),
            h('button', { onClick: () => openPrintWindow('District EOM Summary', sumPrintHtml()), style: MODAL_TOOLBTN }, '⎙ Print')),
          // FOB roll-up strip
          div({ style: { display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '10px' } },
            div({ style: box }, span({ style: lab }, 'District FOB'), span({ style: big(fobOver ? '#f87171' : '#f5bc00') }, `${pctS(r.fobPct)} · ${$(r.fob$)}`),
              r.fobTgt != null ? span({ style: { fontSize: '8.5px', fontWeight: 600, color: fobOver ? '#f87171' : '#4ade80' } }, `${r.fobPct != null ? `${r.fobPct >= r.fobTgt ? '+' : ''}${((r.fobPct - r.fobTgt) * 100).toFixed(2)} vs ` : ''}tgt ${pctS(r.fobTgt)}`) : null),
            ...COMP_META.map(m => { const dpp = r.compDeltaPp && r.compDeltaPp[m.k]; const tgt = r.compTgt && r.compTgt[m.k]; const over = dpp != null && dpp > 0.001;
              return div({ key: m.k, style: box }, span({ style: lab }, m.label), span({ style: big() }, $(r.comps[m.k])),
                span({ style: { fontSize: '8.5px', fontWeight: 600, color: dpp == null ? 'var(--text3)' : over ? '#f87171' : '#4ade80', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } },
                  `${pctS(r.compPct[m.k])}${dpp != null ? ` · ${dpp >= 0 ? '+' : ''}${dpp.toFixed(2)}` : ''}${tgt != null ? ` (tgt ${pctS(tgt)})` : ''}`)); }),
            div({ style: box }, span({ style: lab }, 'Prod Sales'), span({ style: big() }, $(r.sales)),
              span({ style: { fontSize: '8.5px', fontWeight: 600, color: 'var(--text3)' } }, `${r.nStores} ${scopeLabel()} store${r.nStores === 1 ? '' : 's'} · MTD`))),
          // Completion + opportunity + analysis
          div({ style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px', fontSize: '12px' } },
            span(null, span({ style: { color: '#4ade80', fontWeight: 700 } }, `${d.completion.ready} ready`), ` · ${d.completion.counting} counting · ${d.completion.notStarted} not started · avg ${d.completion.avgCountPct != null ? Math.round(d.completion.avgCountPct * 100) + '%' : '—'}`),
            d.completion.storesWithUncountedFC ? span({ style: { color: '#fb923c', fontWeight: 700 } }, `⚠ ${d.completion.storesWithUncountedFC} Location${d.completion.storesWithUncountedFC === 1 ? '' : 's'} with uncounted Food/Condiment${d.completion.totalUncountedFC ? ` (${d.completion.totalUncountedFC} Item${d.completion.totalUncountedFC === 1 ? '' : 's'} Total)` : ''}`) : null),
          // District per-class completion (owner req) — Non-Product muted (not due today).
          div({ style: { display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px', fontSize: '11.5px', color: 'var(--text3)' } },
            span({ style: { textTransform: 'uppercase', letterSpacing: '.04em', fontSize: '10px' } }, 'By class:'),
            ...CLASS_META.map(m => { const p = d.completion.byClass[m.k]; const late = m.k === 'nonproduct';
              return span({ key: m.k, style: { color: p == null ? 'var(--text3)' : late ? 'var(--text3)' : p >= 0.999 ? '#4ade80' : p >= 0.5 ? '#f5bc00' : '#fb923c', fontWeight: 600, opacity: late ? 0.7 : 1 } },
                `${m.label} ${p != null ? Math.round(p * 100) + '%' : '—'}${late ? ' (tmrw)' : ''}`); })),
          div({ style: { display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '12px', fontSize: '12px' } },
            span(null, span({ style: { color: '#f5bc00', fontWeight: 700 } }, `💰 ${$(d.totalOver$)} over target`), ` across ${d.opportunity.length} store${d.opportunity.length === 1 ? '' : 's'}`),
            d.analysis.anyOverTarget
              ? span({ style: { color: 'var(--text2)' } }, `Biggest opportunity vs target: ${d.analysis.biggestComp.label} (${d.analysis.biggestComp.deltaPp != null ? `+${d.analysis.biggestComp.deltaPp.toFixed(2)}pp · ` : ''}${$(d.analysis.biggestComp.over$)} over)`)
              : span({ style: { color: '#4ade80' } }, 'All components at/under target ✓')),
          // Per-store table
          div({ style: { overflowX: 'auto' } },
            h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' } }, [
              h('thead', { key: 'h' }, h('tr', null,
                h('th', { style: { textAlign: 'left', color: 'var(--text3)', fontWeight: 600, padding: '4px 7px', borderBottom: '1px solid var(--bdr2)', fontSize: '9.5px', textTransform: 'uppercase' } }, 'Store'),
                th('FOB % (±tgt)'), th('FOB $'), ...COMP_META.map(m => th(m.label)), th('Count'), ...CLASS_META.map(m => th(m.short)), th('Ready'), th('$ over'))),
              h('tbody', { key: 'b' }, stores.map((s, i) => {
                const sc = s.deltaPp > 0.001 ? '#f87171' : s.deltaPp < -0.001 ? '#4ade80' : 'var(--text)';
                return h('tr', { key: i, style: { borderBottom: '1px solid var(--bdr)' } }, [
                  h('td', { style: { padding: '4px 7px', color: 'var(--text)', fontWeight: 600, whiteSpace: 'nowrap' } }, nm(s.loc), span({ style: { color: 'var(--text3)', fontWeight: 400, fontSize: '9px', marginLeft: '4px' } }, `#${unpad(s.loc)}`)),
                  h('td', { style: { padding: '4px 7px', textAlign: 'right', color: sc, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } }, `${pctS(s.fobPct)}${s.deltaPp != null ? ` (${s.deltaPp >= 0 ? '+' : ''}${s.deltaPp.toFixed(2)})` : ''}`),
                  h('td', { style: { padding: '4px 7px', textAlign: 'right', color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' } }, $(s.fobD)),
                  ...COMP_META.map(m => h('td', { key: m.k, style: { padding: '4px 7px', textAlign: 'right', color: 'var(--text3)', fontVariantNumeric: 'tabular-nums' } }, $(s.comps[m.k]))),
                  h('td', { style: { padding: '4px 7px', textAlign: 'right', color: s.uncountedFC ? '#fb923c' : 'var(--text2)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } }, s.countPct != null ? `${Math.round(s.countPct * 100)}%` : '—', s.uncountedFC ? ` ·${s.uncountedFC}` : ''),
                  ...CLASS_META.map(m => { const p = s.classPct[m.k]; const late = m.k === 'nonproduct';
                    return h('td', { key: m.k, style: { padding: '4px 7px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: p == null ? 'var(--text3)' : late ? 'var(--text3)' : p >= 0.999 ? '#4ade80' : p >= 0.5 ? '#f5bc00' : '#fb923c', opacity: late ? 0.7 : 1 } }, p != null ? `${Math.round(p * 100)}%` : '—'); }),
                  h('td', { style: { padding: '4px 7px', textAlign: 'center', color: s.believesDone ? '#4ade80' : 'var(--text3)' } }, s.believesDone ? '✓' : ''),
                  h('td', { style: { padding: '4px 7px', textAlign: 'right', color: s.over$ > 0 ? '#f5bc00' : 'var(--text3)', fontVariantNumeric: 'tabular-nums' } }, s.over$ != null && s.over$ > 0 ? $(s.over$) : ''),
                ]);
              })),
            ]))));
    })(),

    // ── Change Monitor modal — day-2 diff of live state vs the locked baseline ──────
    monOpen && (() => {
      const V = { helping: '#4ade80', hurting: '#f87171', flat: 'var(--text3)', unknown: 'var(--text3)', tie: 'var(--text3)', counted: '#38bdf8' };
      const VLABEL = { helping: 'helping', hurting: 'hurting', flat: 'flat', unknown: '—', counted: 'var posted' };
      const box = { background: 'var(--surf2)', border: '1px solid var(--bdr2)', borderRadius: '7px', padding: '7px 10px', display: 'flex', flexDirection: 'column', gap: '1px', minWidth: '96px' };
      const lab = { fontSize: '9px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text3)', fontWeight: 700 };
      const th = (t, extra) => h('th', { key: t, style: { textAlign: extra?.left ? 'left' : 'right', color: 'var(--text3)', fontWeight: 600, padding: '4px 7px', borderBottom: '1px solid var(--bdr2)', fontSize: '9.5px', textTransform: 'uppercase', whiteSpace: 'nowrap' } }, t);
      const dpp = v => v == null ? '—' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(2)}pp`;
      const d = mon?.diff;
      const stores = d ? d.stores : [];
      const takenLbl = mon?.takenAt ? new Date(mon.takenAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null;
      return div({
        onClick: () => setMonOpen(false),
        style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
      },
        div({ onClick: e => e.stopPropagation(),
          style: { background: 'var(--surf)', border: '1px solid var(--bdr2)', borderRadius: '10px', width: '100%', maxWidth: '1000px', maxHeight: '90vh', overflow: 'auto', padding: '18px', position: 'relative' } },
          div({ style: { fontWeight: 700, color: 'var(--text)', marginBottom: '2px', paddingRight: '30px' } }, `📸 EOM Change Monitor — ${scopeLabel()}`),
          h('button', { onClick: () => setMonOpen(false), style: MODAL_X }, '✕'),
          div({ style: { fontSize: '11px', color: 'var(--text3)', marginBottom: '10px' } },
            monView === 'progression'
              ? 'Per-item variance progression — read straight from the raw count ledger (no lock needed), for the selected period.'
              : (mon?.ledger
                  ? `The EOM count + qualifying recounts — baseline is each store's variance at count-completion, read from the ledger (no lock, no $0 ghosts). Changes below are recounts made since. ${mon.nAsCounted || 0} store${mon.nAsCounted === 1 ? '' : 's'} carry an as-counted FOB.`
                  : (takenLbl ? `Live now vs baseline locked ${takenLbl} · ${mon.nBaseline} store${mon.nBaseline === 1 ? '' : 's'} baselined` : 'No baseline found for this period yet.'))),
          div({ style: { display: 'flex', gap: '7px', marginBottom: '12px', alignItems: 'center' } },
            div({ style: { display: 'flex', border: '1px solid var(--bdr2)', borderRadius: '6px', overflow: 'hidden' } },
              [['progression', '📈 Progression'], ['diff', '📸 Baseline diff']].map(([k, l]) =>
                h('button', { key: k, onClick: () => { setMonView(k); if (k === 'diff' && !mon && !monBusy) openMonitor(); },
                  style: { background: monView === k ? 'var(--accent,#f5bc00)' : 'var(--surf3)', color: monView === k ? '#0f1117' : 'var(--text2)', border: 'none', padding: '5px 11px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' } }, l))),
            monView === 'diff' ? h('button', { onClick: openMonitor, style: MODAL_TOOLBTN, disabled: monBusy }, monBusy ? '… Refreshing' : '↻ Refresh') : null),

          monView === 'progression' ? h(VarianceProgressionView, { rows, progByLoc, nm })
          : monBusy ? div({ style: { color: 'var(--text3)', padding: '30px', textAlign: 'center' } }, 'Diffing live data against the baseline…')
          : mon?.error ? div({ style: { color: '#fb923c', padding: '16px', fontSize: '12.5px', lineHeight: 1.5 } }, mon.error)
          : !mon?.nBaseline ? div({ style: { color: 'var(--text3)', padding: '16px', fontSize: '12.5px', lineHeight: 1.5 } },
              'No count-ledger data for these stores in this period yet — the baseline is derived from the raw item counts as they post. Check back once the stores have counted.')
          : [
            // District roll-up strip
            div({ key: 'roll', style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' } },
              div({ style: box }, span({ style: lab, title: 'Stores that recounted flagged items and moved the variance toward zero (better FOB)' }, 'Improving'), span({ style: { fontSize: '17px', fontWeight: 800, color: '#4ade80' } }, String(d.improved))),
              div({ style: box }, span({ style: lab, title: 'Stores whose recounts moved the variance away from zero (worse FOB)' }, 'Made worse'), span({ style: { fontSize: '17px', fontWeight: 800, color: '#f87171' } }, String(d.worsened))),
              div({ style: box }, span({ style: lab, title: 'Stores with no qualifying recount on their flagged items since count-completion' }, 'No action'), span({ style: { fontSize: '17px', fontWeight: 800, color: 'var(--text)' } }, String(d.noAction ?? (d.nStores - d.improved - d.worsened)))),
              div({ style: box }, span({ style: lab }, '$ moved toward 0'), span({ style: { fontSize: '15px', fontWeight: 800, color: '#4ade80' } }, money(d.totalHelped))),
              div({ style: box }, span({ style: lab }, '$ moved away'), span({ style: { fontSize: '15px', fontWeight: 800, color: '#f87171' } }, money(d.totalHurt)))),
            d.active === 0 ? div({ key: 'noact', style: { color: 'var(--text3)', fontSize: '12px', padding: '4px 2px 12px' } }, 'No recounts since count-completion — nothing has moved. This is the honest read for a period the stores have finished; the signal fills in when they recount flagged items.') : null,
            div({ key: 'floor', style: { color: 'var(--text3)', fontSize: '10.5px', marginBottom: '10px', lineHeight: 1.5 } },
              'Baseline = each store\'s variance ', span({ style: { fontWeight: 700, color: 'var(--text2)' } }, 'at count-completion'), ' (from the ledger). Helped / hurt count only ', span({ style: { fontWeight: 700, color: 'var(--text2)' } }, 'material recounts (≥ $25 toward/away zero)'), '. ', span({ style: { color: '#f5bc00', fontWeight: 700 } }, '↻'), ' = a recount actually occurred since count-completion. The ', span({ style: { fontWeight: 700 } }, 'Verdict'), ' is the store\'s engagement: did it act on its flagged items and improve FOB.'),

            // Per-store table
            div({ key: 'tbl', style: { overflowX: 'auto' } },
              h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' } }, [
                h('thead', { key: 'h' }, h('tr', null,
                  th('Store', { left: true }), th('FOB base→now'), th('Δ'), th('Verdict'),
                  th('Count'), th('Helped'), th('Hurt'), th('Recounted'), th('2nd review'))),
                h('tbody', { key: 'b' }, stores.flatMap((s) => {
                  const loc = s.loc; const open = !!monOpenRows[loc];
                  const sr = secReview[unpad(loc)] || secReview[String(loc)] || {};
                  const rowEls = [
                    h('tr', { key: loc, onClick: () => setMonOpenRows(m => ({ ...m, [loc]: !m[loc] })),
                      style: { cursor: 'pointer', borderBottom: '1px solid var(--bdr)', background: open ? 'var(--surf2)' : 'transparent' } },
                      h('td', { style: { padding: '5px 7px', color: 'var(--text)', fontWeight: 600, whiteSpace: 'nowrap' } },
                        span({ style: { color: 'var(--text3)', marginRight: '5px' } }, open ? '▾' : '▸'), nm(loc), span({ style: { color: 'var(--text3)', fontWeight: 400 } }, ` #${unpad(loc)}`),
                        (mon.baselineKind && mon.baselineKind[unpad(loc)] === 'count-complete') ? span({ title: 'This store has an auto as-counted FOB baseline (captured when its count completed). Item variances + recounts are read live from the ledger, not this snapshot.', style: { marginLeft: '6px', fontSize: '8.5px', fontWeight: 700, color: '#4ade80', border: '1px solid #4ade80', borderRadius: '4px', padding: '0 4px', cursor: 'help' } }, 'as-counted FOB') : null,
                        s.baselineIncomplete ? span({ title: 'Most items had ~$0 variance at lock — the Variance/Stat data was not yet populated in the snapshot when the baseline was captured (QSRSoft\'s variance report lags the physical count, and an early auto-lock can precede the daily pull). This is NOT proof the store hadn\'t counted. The diff below shows the variance data landing, not moves that helped or hurt.', style: { marginLeft: '6px', fontSize: '8.5px', fontWeight: 700, color: '#38bdf8', border: '1px solid #38bdf8', borderRadius: '4px', padding: '0 4px', cursor: 'help' } }, 'baseline: var not yet posted') : null),
                      h('td', { style: { padding: '5px 7px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: 'var(--text2)' } }, `${pct2(s.fob.baseFobPct)} → ${pct2(s.fob.curFobPct)}`),
                      h('td', { style: { padding: '5px 7px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: V[s.fob.verdict] } }, dpp(s.fob.dFobPct)),
                      (() => {
                        const EV = { improving: '#4ade80', worsened: '#f87171', mixed: '#f5bc00', 'no-action': 'var(--text3)' };
                        const e = s.engagement || {};
                        return h('td', { title: e.readLabel || '', style: { padding: '5px 7px', textAlign: 'right', fontWeight: 700, color: EV[e.verdict] || 'var(--text3)' } }, e.label || '—');
                      })(),
                      h('td', { style: { padding: '5px 7px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text3)', whiteSpace: 'nowrap' } }, s.count.basePct != null && s.count.curPct != null ? `${Math.round(s.count.basePct * 100)}→${Math.round(s.count.curPct * 100)}%` : '—'),
                      h('td', { style: { padding: '5px 7px', textAlign: 'right', color: s.nHelped ? '#4ade80' : 'var(--text3)', fontWeight: s.nHelped ? 700 : 400 } }, s.nHelped || ''),
                      h('td', { style: { padding: '5px 7px', textAlign: 'right', color: s.nHurt ? '#f87171' : 'var(--text3)', fontWeight: s.nHurt ? 700 : 400 } }, s.nHurt || ''),
                      h('td', { title: s.nRecounted ? `${s.nRecounted} item${s.nRecounted === 1 ? '' : 's'} were RE-COUNTED since the baseline (their last-counted date changed). ↻ = a recount occurred, not a recommendation.` : '', style: { padding: '5px 7px', textAlign: 'right', color: s.nRecounted ? '#f5bc00' : 'var(--text3)', fontWeight: s.nRecounted ? 700 : 400 } }, s.nRecounted ? `↻ ${s.nRecounted}` : ''),
                      h('td', { style: { padding: '5px 7px', textAlign: 'right', whiteSpace: 'nowrap' }, onClick: e => e.stopPropagation() },
                        h('button', { onClick: () => markSecondary(loc, sr.status === 'reviewed' ? 'pending' : 'reviewed'),
                          style: { fontSize: '10px', fontWeight: 700, borderRadius: '5px', padding: '2px 7px', cursor: 'pointer', border: '1px solid', ...(sr.status === 'reviewed' ? { color: '#4ade80', borderColor: '#4ade80', background: 'transparent' } : sr.status === 'flagged' ? { color: '#f87171', borderColor: '#f87171', background: 'transparent' } : { color: 'var(--text3)', borderColor: 'var(--bdr2)', background: 'var(--surf3)' }) } },
                          sr.status === 'reviewed' ? '✓ reviewed' : sr.status === 'flagged' ? '⚑ flagged' : 'mark'),
                        h('button', { onClick: () => markSecondary(loc, sr.status === 'flagged' ? 'pending' : 'flagged'), title: 'Flag for follow-up',
                          style: { marginLeft: '4px', fontSize: '10px', fontWeight: 700, borderRadius: '5px', padding: '2px 6px', cursor: 'pointer', border: '1px solid var(--bdr2)', background: 'var(--surf3)', color: sr.status === 'flagged' ? '#f87171' : 'var(--text3)' } }, '⚑'))),
                  ];
                  if (open) {
                    const its = s.items.slice(0, 40);
                    const qv = v => v == null ? '—' : (Math.round(v * 10) / 10).toLocaleString();
                    rowEls.push(h('tr', { key: loc + '-d' }, h('td', { colSpan: 9, style: { padding: '2px 7px 10px 24px', background: 'var(--surf2)' } },
                      s.items.length === 0 ? div({ style: { color: 'var(--text3)', fontSize: '11px', padding: '6px 0' } }, 'No item-level changes since baseline.')
                      : h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '11px' } }, [
                        h('thead', { key: 'ih' }, h('tr', null, th('Item', { left: true }), th('Class', { left: true }), th('$ Var base→now'), th('Δ|var|'), th('Qty var base→now'), th('Move'), th('Recounted'))),
                        h('tbody', { key: 'ib' }, its.map((it, j) => h('tr', { key: j, style: { borderBottom: '1px solid var(--bdr)' } },
                          h('td', { style: { padding: '3px 7px', color: 'var(--text2)' } }, it.descr || it.wrin, it.isNew ? span({ style: { color: '#38bdf8', fontSize: '9px', marginLeft: '4px' } }, 'NEW') : it.isGone ? span({ style: { color: 'var(--text3)', fontSize: '9px', marginLeft: '4px' } }, 'GONE') : null),
                          h('td', { style: { padding: '3px 7px', color: 'var(--text3)', textTransform: 'capitalize' } }, it.cls || '—'),
                          h('td', { style: { padding: '3px 7px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text3)', whiteSpace: 'nowrap' } }, `${it.baseVar != null ? money(it.baseVar) : '—'} → ${it.curVar != null ? money(it.curVar) : '—'}`),
                          // Δ|var| = change in variance MAGNITUDE (toward/away from zero), so the sign matches the
                          // helping/hurting color: −$ = shrank toward zero (helping), +$ = grew (hurting). (The raw
                          // base→now column beside it shows the actual signed variance, incl. any overage→loss flip.)
                          (() => { const dMag = (it.baseVar != null && it.curVar != null) ? Math.abs(it.curVar) - Math.abs(it.baseVar) : null;
                            return h('td', { title: 'Change in variance magnitude vs baseline: −$ = moved toward zero (helping), +$ = grew away from zero (hurting).', style: { padding: '3px 7px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: V[it.verdict] } }, dMag != null ? `${dMag > 0 ? '+' : ''}${money(dMag)}` : '—'); })(),
                          h('td', { style: { padding: '3px 7px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text3)', whiteSpace: 'nowrap' } }, `${qv(it.baseQtyVar)} → ${qv(it.curQtyVar)}`),
                          h('td', { style: { padding: '3px 7px', textAlign: 'right', fontWeight: 700, color: V[it.verdict] } }, VLABEL[it.verdict]),
                          h('td', { title: it.recounted ? 'A recount OCCURRED since the baseline — this item’s last-counted date changed (the store re-counted it).' : '', style: { padding: '3px 7px', textAlign: 'center', color: it.recounted ? '#f5bc00' : 'var(--text3)' } }, it.recounted ? '↻' : ''))))]),
                      s.items.length > 40 ? div({ style: { color: 'var(--text3)', fontSize: '10px', paddingTop: '4px' } }, `+${s.items.length - 40} more changed items`) : null)));
                  }
                  return rowEls;
                })),
              ])),
          ],
        ));
    })(),

    bulkOpen && div({
      onClick: () => setBulkOpen(false),
      style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
    },
      div({ onClick: e => e.stopPropagation(),
        style: { background: 'var(--surf)', border: '1px solid var(--bdr2)', borderRadius: '10px', width: '100%', maxWidth: '760px', maxHeight: '90vh', overflow: 'auto', padding: '18px', position: 'relative' } },
        div({ style: { fontWeight: 700, color: 'var(--text)', marginBottom: '4px', paddingRight: '30px' } }, `📣 EOM Follow-up — ${bulkDrafts.length} location${bulkDrafts.length === 1 ? '' : 's'}`),
        h('button', { onClick: () => setBulkOpen(false), style: MODAL_X }, '✕'),
        (() => { const needed = bulkDrafts.filter(d => d.hasGaps || d.hasPlan).length; return div({ style: { fontSize: '11.5px', color: 'var(--text3)', marginBottom: '12px' } },
          `${needed} need a follow-up (count gap or food-cost action plan); the rest look clean. Copy each and send to the store, then Mark sent. Ordered by who needs it first.`); })(),
        div({ style: { display: 'flex', flexDirection: 'column', gap: '7px' } },
          bulkDrafts.map(d => {
            const needs = d.hasGaps || d.hasPlan;
            return div({ key: d.loc, style: { border: '1px solid var(--bdr)', borderLeft: `3px solid ${needs ? '#f5bc00' : '#4ade80'}`, borderRadius: '7px', background: 'var(--surf2)', padding: '9px 11px' } },
              div({ style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
                span({ style: { fontWeight: 700, color: 'var(--text)', fontSize: '12.5px' } }, d.name),
                span({ style: { color: 'var(--text3)', fontSize: '10px', fontFamily: 'ui-monospace,Menlo,monospace' } }, `#${unpad(d.loc)}`),
                d.commsSent ? span({ style: { fontSize: '10px', color: '#4ade80', fontWeight: 700 } }, '✓ sent') : null,
                span({ style: { marginLeft: 'auto', display: 'flex', gap: '6px' } },
                  needs ? h('button', { onClick: () => copyText(d.body, d.loc), style: { ...MODAL_TOOLBTN, color: bulkCopied === d.loc ? '#4ade80' : 'var(--gold)', borderColor: bulkCopied === d.loc ? '#4ade80' : 'var(--bdr2)' } }, bulkCopied === d.loc ? '✓ Copied' : 'Copy') : null,
                  h('button', { onClick: () => { openDraft(d.loc, d.name, allRows.find(r => r.loc === d.loc)?.components); setBulkOpen(false); }, style: MODAL_TOOLBTN, title: 'Open the single-store message (recap + Full report toggle)' }, 'Open'),
                  h('button', { onClick: () => updateStatus(d.loc, { commsStatus: 'sent', commsSentAt: new Date().toISOString() }), style: { ...MODAL_TOOLBTN, color: '#4ade80', borderColor: '#4ade80' } }, 'Mark sent'))),
              div({ style: { fontSize: '11.5px', color: needs ? 'var(--text2)' : 'var(--text3)', marginTop: '4px' } }, needs ? d.subject : 'Count looks complete — no action items. Nothing to send.'));
          })))),

    xcOpen && div({
      onClick: () => setXcOpen(false),
      style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
    },
      div({ onClick: e => e.stopPropagation(),
        style: { background: 'var(--surf)', border: '1px solid var(--bdr2)', borderRadius: '10px', width: '100%', maxWidth: '820px', maxHeight: '90vh', overflow: 'auto', padding: '18px', position: 'relative' } },
        div({ style: { fontWeight: 700, color: 'var(--text)', marginBottom: '4px', paddingRight: '30px' } }, '🔍 AI Cross-Check — external FOB vs Meridian'),
        h('button', { onClick: () => setXcOpen(false), style: MODAL_X }, '✕'),
        div({ style: { fontSize: '11.5px', color: 'var(--text3)', marginBottom: '10px' } },
          'Paste an external AI\'s FOB analysis (one store per line — store number, then Prod Sales, FOB$, FOB%, and the 6 components). Meridian reconciles it against its own real numbers and flags: ',
          span({ style: { color: '#f87171', fontWeight: 700 } }, 'fabricated'), ' (the external row\'s own components don\'t sum to its stated FOB$), ',
          span({ style: { color: '#f5bc00', fontWeight: 700 } }, 'diverge'), ' (>$50 off Meridian), and ',
          span({ style: { color: '#4ade80', fontWeight: 700 } }, 'match'), '.'),
        h('textarea', {
          value: xcText, onChange: e => setXcText(e.target.value), placeholder: '3708  $307,503.52  $13,252.22  4.31%  $944.88  $878.93  $6,477.45  $650.28  $1,440.48  $4,323.90  -$23.22\n5183  …',
          style: { width: '100%', minHeight: '120px', background: 'var(--surf3)', color: 'var(--text)', border: '1px solid var(--bdr)', borderRadius: '6px', padding: '10px', fontSize: '11.5px', fontFamily: 'ui-monospace,Menlo,monospace', lineHeight: 1.5, resize: 'vertical' },
        }),
        div({ style: { display: 'flex', gap: '8px', margin: '10px 0' } },
          h('button', { onClick: runXcheck, disabled: !xcText.trim(),
            style: { background: '#f5bc00', color: '#1a1400', border: 'none', borderRadius: '6px', padding: '7px 14px', fontWeight: 700, cursor: xcText.trim() ? 'pointer' : 'default', fontSize: '13px' } }, 'Reconcile'),
          xcResult ? h('button', { onClick: () => { setXcText(''); setXcResult(null); }, style: MODAL_TOOLBTN }, 'Clear') : null),
        xcResult ? div(null, [
          div({ key: 'sum', style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px', fontSize: '12px', fontWeight: 700 } },
            span({ style: { color: '#4ade80' } }, `✓ ${xcResult.tally.match || 0} match`),
            span({ style: { color: '#f5bc00' } }, `⚠ ${xcResult.tally.diverge || 0} diverge`),
            span({ style: { color: '#f87171' } }, `🚩 ${xcResult.tally.fabricated || 0} fabricated`),
            (xcResult.tally['no-meridian'] || 0) ? span({ style: { color: 'var(--text3)' } }, `· ${xcResult.tally['no-meridian']} no Meridian data`) : null,
            span({ style: { color: 'var(--text3)', fontWeight: 400 } }, `of ${xcResult.total} parsed`)),
          !xcResult.total ? div({ key: 'none', style: { padding: '16px', textAlign: 'center', color: '#f5bc00', fontSize: '12.5px' } }, 'No store rows recognized — check the paste includes store numbers (one of your 27) at the start of each line.')
            : h('table', { key: 'tbl', style: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' } }, [
                h('thead', null, h('tr', null, ['Store', 'Meridian FOB$', 'External FOB$', 'Δ$', 'Meridian FOB%', 'External FOB%', 'Δ%', 'Status'].map((hd, i) =>
                  h('th', { key: i, style: { textAlign: i >= 1 && i <= 6 ? 'right' : 'left', color: 'var(--text3)', fontWeight: 600, padding: '5px 8px', borderBottom: '1px solid var(--bdr2)', fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap' } }, hd)))),
                h('tbody', null, xcResult.rows.map((r, i) => {
                  const sc = r.status === 'match' ? '#4ade80' : r.status === 'diverge' ? '#f5bc00' : r.status === 'fabricated' ? '#f87171' : 'var(--text3)';
                  const label = r.status === 'no-meridian' ? 'no Meridian data' : r.status;
                  const merFob = r.meridian ? `$${Math.round(r.meridian.fob).toLocaleString()}` : '—';
                  const merPct = r.meridian && r.meridian.fobPct != null ? `${(r.meridian.fobPct * 100).toFixed(2)}%` : '—';
                  return h('tr', { key: i, style: { borderBottom: '1px solid var(--bdr)' } }, [
                    h('td', { style: { padding: '5px 8px', color: 'var(--text)', fontWeight: 600 } }, nm(r.store), span({ style: { color: 'var(--text3)', fontWeight: 400, fontSize: '10px', marginLeft: '5px' } }, `#${r.store}`)),
                    h('td', { style: { padding: '5px 8px', textAlign: 'right', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' } }, merFob),
                    h('td', { style: { padding: '5px 8px', textAlign: 'right', color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' } }, r.extFob != null ? `$${Math.round(r.extFob).toLocaleString()}` : '—'),
                    h('td', { style: { padding: '5px 8px', textAlign: 'right', color: sc, fontVariantNumeric: 'tabular-nums', fontWeight: 600 } }, r.dFob != null ? `${r.dFob >= 0 ? '+' : ''}$${Math.round(r.dFob).toLocaleString()}` : '—'),
                    h('td', { style: { padding: '5px 8px', textAlign: 'right', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' } }, merPct),
                    h('td', { style: { padding: '5px 8px', textAlign: 'right', color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' } }, r.extFobPct != null ? `${r.extFobPct.toFixed(2)}%` : '—'),
                    h('td', { style: { padding: '5px 8px', textAlign: 'right', color: sc, fontVariantNumeric: 'tabular-nums', fontWeight: 600 } }, r.dPct != null ? `${r.dPct >= 0 ? '+' : ''}${r.dPct.toFixed(2)} pp` : '—'),
                    h('td', { style: { padding: '5px 8px' } },
                      span({ style: { fontSize: '10px', fontWeight: 700, color: sc, border: `1px solid ${sc}`, borderRadius: '4px', padding: '1px 6px', whiteSpace: 'nowrap' }, title: r.status === 'fabricated' ? `External components sum to $${Math.round(r.sum6 || 0).toLocaleString()}, not its stated $${Math.round(r.extFob || 0).toLocaleString()} — the external tool's own numbers don't reconcile (likely fabricated).` : r.status === 'diverge' ? `External $${Math.round(r.extFob || 0).toLocaleString()} vs Meridian $${Math.round((r.meridian?.fob) || 0).toLocaleString()}.` : '' }, label)),
                  ]);
                })),
              ]),
        ]) : null)),

    chronicOpen && div({
      onClick: () => setChronicOpen(false),
      style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
    },
      div({
        onClick: e => e.stopPropagation(),
        style: { background: 'var(--surf)', border: '1px solid var(--bdr2)', borderRadius: '10px', width: '100%', maxWidth: '860px', maxHeight: '88vh', overflow: 'auto', padding: '18px', position: 'relative' },
      },
        div({ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', gap: '8px', flexWrap: 'wrap', paddingRight: '30px' } },
          div({ style: { fontWeight: 700, color: 'var(--text)' } }, `🔁 Chronic Offenders — ${scope === 'all' ? 'all stores' : scope}${oneStore ? ` · ${nm(oneStore)}` : ''}`),
          div({ style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text3)' }, title: 'How many prior monthly count periods to scan across (one EOM count = one month).' },
            'Look back (months)',
            div({ style: { display: 'flex', border: '1px solid var(--bdr2)', borderRadius: '6px', overflow: 'hidden' } },
              [1, 2, 3, 6, 12].map(n => h('button', {
                key: n, title: `last ${n} monthly count periods`,
                onClick: () => { setChronicLookback(n); runChronicScan(n); }, disabled: chronicBusy,
                style: { background: chronicLookback === n ? '#f5bc00' : 'var(--surf3)', color: chronicLookback === n ? '#0f1117' : 'var(--text2)', border: 'none', padding: '3px 9px', fontSize: '11px', fontWeight: 700, cursor: chronicBusy ? 'default' : 'pointer' },
              }, n))))),
        h('button', { onClick: () => setChronicOpen(false), style: MODAL_X }, '✕'),
        div({ style: { fontSize: '11.5px', color: 'var(--text3)', marginBottom: '10px' } },
          chronicBusy ? 'Scanning…'
            : chronic?.error ? `Scan failed: ${chronic.error}`
            : chronic ? `${chronic.items.length} chronic item${chronic.items.length === 1 ? '' : 's'} across ${chronic.periods.length} periods (${chronic.periods[0]}→${chronic.periods[chronic.periods.length - 1]}) · ${chronic.nRows.toLocaleString()} rows read. Items bad across the MOST stores rank first — a systemic/spec issue, not a one-store fluke.`
            : 'Run the scan.'),
        chronic && chronic.items.length ? div({ style: { display: 'flex', gap: '7px', marginBottom: '10px' } },
          h('button', { onClick: () => downloadText(`chronic-offenders_${scope}_${period}.csv`, chronicCsv()), style: MODAL_TOOLBTN, title: 'Download the chronic-item list as CSV' }, '⤓ Save CSV'),
          h('button', { onClick: () => openPrintWindow('Chronic Offenders', chronicPrintHtml()), style: MODAL_TOOLBTN, title: 'Open a printable report (Save as PDF or print)' }, '⎙ Print')) : null,
        chronicBusy ? div({ style: { padding: '30px', textAlign: 'center', color: 'var(--text3)' } }, 'Reading variance history across the scope…')
          : chronic && !chronic.items.length && !chronic.error ? (() => {
              // Distinguish "no data" from "clean" so an empty result is never ambiguous.
              const nP = new Set((chronic._rows || []).map(r => r.period)).size;
              if (!chronic.nRows) return div({ style: { padding: '20px', textAlign: 'center', color: '#f5bc00', fontSize: '13px' } },
                'No variance history found for this scope + window. Either the Variance pull has not populated these months yet (run it / widen the look-back), or this scope has no items. ',
                span({ style: { display: 'block', fontSize: '11px', color: 'var(--text3)', marginTop: '4px' } }, `(0 rows across ${chronic.periods.join(', ')})`));
              if (nP < 2) return div({ style: { padding: '20px', textAlign: 'center', color: '#f5bc00', fontSize: '13px' } },
                `Only ${nP} period of variance data in this window (${chronic.nRows.toLocaleString()} rows) — chronic patterns need at least 2 periods to compare. Run more Variance pulls or widen the look-back.`);
              return div({ style: { padding: '20px', textAlign: 'center', color: '#4ade80', fontSize: '13px' } }, `✓ No chronic offenders — read ${chronic.nRows.toLocaleString()} rows across ${nP} periods, all within tolerance or one-off.`);
            })()
          : chronic ? div({ style: { display: 'flex', flexDirection: 'column', gap: '5px' } },
              chronic.items.slice(0, 40).map(it => {
                const isOpen = chronicOpenRows[it.wrin];
                const worstMeta = it.worst ? PATTERN_META[it.worst] : null;
                return div({ key: it.wrin, style: { background: 'var(--surf3)', borderRadius: '6px', borderLeft: `3px solid ${worstMeta?.color || 'var(--bdr2)'}`, overflow: 'hidden' } },
                  div({ onClick: () => setChronicOpenRows(o => ({ ...o, [it.wrin]: !o[it.wrin] })),
                    style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', cursor: 'pointer' } },
                    span({ style: { color: 'var(--text3)', fontSize: '11px', width: '10px', flexShrink: 0 } }, isOpen ? '▾' : '▸'),
                    div({ style: { flex: 1, minWidth: 0 } },
                      div({ style: { fontSize: '12.5px', color: 'var(--text)', fontWeight: 600 } },
                        it.descr || it.wrin, span({ style: { color: 'var(--text3)', fontWeight: 400 } }, ` · WRIN ${it.wrin}`)),
                      worstMeta ? div({ style: { marginTop: '3px' } }, h(PatternChip, { chip: { ...worstMeta, id: it.worst }, title: `worst pattern across ${it.nStores} store(s)` })) : null),
                    div({ style: { textAlign: 'right', flexShrink: 0 } },
                      div({ style: { fontSize: '13px', fontWeight: 800, color: '#f87171' } }, `${it.nStores} store${it.nStores === 1 ? '' : 's'}`),
                      div({ style: { fontSize: '11px', color: 'var(--text3)' } }, `${dolStr(it.totalDol)} at stake`))),
                  isOpen && div({ style: { padding: '2px 10px 9px 28px', borderTop: '1px solid var(--bdr)' } },
                    it.stores.map(s => div({ key: s.loc, style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', borderBottom: '1px solid var(--bdr)', fontSize: '11.5px' } },
                      span({ style: { minWidth: '120px', color: 'var(--text2)', fontWeight: 600 } }, nm(s.loc)),
                      s.primary ? h(PatternChip, { chip: s.primary }) : null,
                      span({ style: { marginLeft: 'auto', fontWeight: 700, color: s.latestDol < 0 ? '#f87171' : '#fbbf24' } }, dolStr(s.latestDol)),
                      span({ style: { color: 'var(--text3)', fontSize: '10.5px', minWidth: '150px', textAlign: 'right' } },
                        s.series.map(p => dolStr(p.dol)).join(' → '))))));
              }),
              chronic.items.length > 40 ? div({ style: { fontSize: '11px', color: 'var(--text3)', padding: '6px' } }, `+${chronic.items.length - 40} more.`) : null)
          : null)),

    fobOpen && div({
      onClick: () => setFobOpen(false),
      style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
    },
      div({
        onClick: e => e.stopPropagation(),
        style: { background: 'var(--surf)', border: '1px solid var(--bdr2)', borderRadius: '10px', width: '100%', maxWidth: '900px', maxHeight: '88vh', overflow: 'auto', padding: '18px', position: 'relative' },
      },
        div({ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' } },
          div({ style: { fontWeight: 700, color: 'var(--text)' } }, `📊 FOB component breakdown — ${period}`),
          h('button', { onClick: () => setFobOpen(false), style: MODAL_X }, '✕')),
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
        style: { background: 'var(--surf)', border: '1px solid var(--bdr2)', borderRadius: '10px', width: '100%', maxWidth: '620px', maxHeight: '85vh', overflow: 'auto', padding: '18px', position: 'relative' },
      },
        div({ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' } },
          div({ style: { fontWeight: 700, color: 'var(--text)' } }, '⚙ Edit diagnosis flow'),
          h('button', { onClick: () => setFlowOpen(false), style: MODAL_X }, '✕')),
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
