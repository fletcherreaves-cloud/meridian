// @ts-nocheck
// ── Schedule Retention Report (dispatch #134, moved + revised by dispatch #140) ──────────────
// Owner's ask (memory/dispatch-134.md): "a report for each location (it can be a permanent
// report) that allows for a period to be selected and then a side by side of each week in that
// period for what is displayed on [Schedule Summary] currently" — to check whether a store held
// onto what it learned at a schedule workshop (before-vs-after, side by side).
//
// REUSE, not a rebuild: every metric here comes from src/engine/schedule-summary.js's rollup()
// — the SAME function the all-stores, single-current-week Schedule Summary panel
// (src/views/schedule-summary.js) already calls and that reconciles to the LifeLenz screen
// (src/__tests__/schedule-summary.test.js). computeStoreWeeks() (added alongside rollup() in
// that file, dispatch #134) is a "very small wrapper" per that dispatch's own instruction: same
// per-row extraction, same dollar-weighting, just one store across an arbitrary multi-week
// period instead of every store for one current week. The "bonus" ask (actual labor results
// once a week completes) needs ZERO new data work — rollup()'s `sales`/`laborPct` are already
// ACTUAL-weighted once a week posts real numbers (see that file's #361 comment), and sit at
// their forecast-only null/0 state until then; this report just renders whichever state each
// week is already in.
//
// ── Dispatch #140 revisions (memory/dispatch-140.md) ──────────────────────────────────────────
// 1. Hub move: this file now exports a CONTENT-ONLY `ScheduleRetentionSection` (no own
//    RoutePanelShell) — same shape as dispatch #135's TargetsEditorSection. It renders as one of
//    the Scheduling & Labor hub's tabs (App.js's SCHED_TABS/SchedulingHubPanel), not a standalone
//    nav entry any more (panel-registry.js's sched-retention flipped nav+route:true -> hub-tab).
// 2. The narrative's "— worth a follow-up [staff-development] visit." editorial tail is gone
//    (owner: "I don't want to have a store see that comment directly") — the factual pp-change/
//    before-after numbers stay, on-screen and in print (buildPrintHTML reads the same
//    buildNarrative() output, so one fix covers both).
// 3. Week-anchored range picker (WeekRangeControl below) replaces the calendar-day
//    DateRangeControl — start/end LifeLenz business weeks, reusing computeStoreWeeks'/
//    weekStartOf's own Wed-anchored weekKey as the bound (never re-derived).
// 4. LocationSelector broadened to mode:'progressive' (All->State->Patch->Store, dispatch #139's
//    live-patch fix already under it). A single store keeps today's per-store detail view
//    unchanged; a broader (All/State/Patch) scope shows a "pick a store" empty state instead —
//    this panel is inherently single-store (before/after one store's own history), and the
//    cross-store rollup for a broader scope is dispatch #141's separate report, not rebuilt here.
// 5. sparklineFor() generalizes the old laborPct-only inline sparkline into one small chart per
//    metric row (Labor %, Sched/Fcst Hrs, Hours ± Fcst, TPMH, Fixed/Floor/Combined %), stacked as
//    small multiples below a shrunk, horizontally-spread narrative strip.
import * as React from 'react';
import { LocationSelector, buildLocationHierarchy, locationSelectorLocs } from '../components/PanelControls.js';
import { computeStoreWeeks, FIXED_FLOOR_SEG_MIN, FIXED_FLOOR_SEG_MAX, FIXED_FLOOR_COMBINED_MAX } from '../engine/schedule-summary.js';
import { StationBreakdown } from './schedule-summary.js';
import { ExportDropdown } from './store-dash.js';
import { INV_ORG_COORDS, STORE_NAMES, sNameC, sName, supervisorOf, getStoreOrg, DEF_SETTINGS } from '../constants.js';
import { loadRetentionMarks, saveRetentionMark } from '../lib/supabase.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);

const EMPTY_STORES = [];
const _normLoc = l => String(parseInt(String(l ?? '').replace(/\D/g, ''), 10) || '');

// ── Formatters — copied verbatim from schedule-summary.js (display-only, not engine math;
// duplicating a one-line formatter is not "re-deriving" the metrics the dispatch protects) ─────
const f$ = n => n == null ? '—' : '$' + Math.round(n).toLocaleString();
const hm = v => { if (v == null) return '—'; const neg = v < 0; const t = Math.round(Math.abs(v) * 60); return (neg ? '-' : '') + Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
const hmSigned = v => v == null ? '—' : (v >= 0 ? '+' : '') + hm(v);
const pct = v => v == null ? '—' : ((Math.abs(v) <= 1.5 ? v * 100 : v)).toFixed(2) + '%';
const fracPct = v => v == null ? '—' : (v * 100).toFixed(2) + '%';
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const diffColor = d => d == null ? 'var(--text3)' : d > 0.5 ? '#f59e0b' : d < -0.5 ? '#60a5fa' : '#10b981';
const segColor = v => v == null ? 'var(--text3)' : (v >= FIXED_FLOOR_SEG_MIN && v <= FIXED_FLOOR_SEG_MAX) ? '#10b981' : '#f59e0b';
const combColor = v => v == null ? 'var(--text3)' : (v > FIXED_FLOOR_COMBINED_MAX) ? '#ef4444' : '#10b981';
const wkLabel = d => (d.getMonth() + 1) + '/' + d.getDate();

// ── Pure logic — exported and independently tested ──────────────────────────────────────────────

// Roll a SPAN of already-computed weeks (rollup() outputs) into one aggregate, using the exact
// same weighting rules rollup() itself uses one level down (dollar-weighted labor %, additive
// hours/GC sums, never a straight average of weekly percentages — "never average an average").
// Pure aggregation over rollup()'s own output fields; introduces no new metric formula.
export function aggregateSpan(weeksSubset) {
  const ws = weeksSubset || [];
  let fcstSales = 0, fcstGC = 0, schedHrs = 0, fcstHrs = 0, fixHrs = 0, floorHrs = 0, salesTotal = 0, laborD = 0, laborSales = 0, weeksWithActuals = 0;
  for (const w of ws) {
    fcstSales += w.fcstSales || 0; fcstGC += w.fcstGC || 0;
    schedHrs += w.schedHrs || 0; fcstHrs += w.fcstHrs || 0;
    fixHrs += w.fixHrs || 0; floorHrs += w.floorHrs || 0;
    const s = w.sales || 0; salesTotal += s;
    if (w.laborPct != null && s > 0) { laborD += w.laborPct * s; laborSales += s; weeksWithActuals++; }
  }
  return {
    weeksN: ws.length, weeksWithActuals,
    fcstSales, fcstGC, schedHrs, fcstHrs, salesTotal,
    hrsDiff: schedHrs - fcstHrs,
    hrsDiffAvgPerWeek: ws.length ? (schedHrs - fcstHrs) / ws.length : null,
    laborPct: laborSales > 0 ? laborD / laborSales : null,
    tpmh: schedHrs > 0 ? fcstGC / schedHrs : null,
    combinedFixedFloorPct: schedHrs > 0 ? (fixHrs + floorHrs) / schedHrs : null,
  };
}

// Where to split a chronological weeks[] into "before" / "since" — the marked week (if any,
// found by weekKey) becomes the FIRST week of "since"; with no mark, split the shown weeks in
// half so the narrative is never blank. Period selection (and which week was the workshop) is
// manual per the owner's own framing — no class-date pipeline, per the dispatch's explicit scope.
export function splitWeeksAtMark(weeks, markedWeekKey) {
  const ws = weeks || [];
  if (!ws.length) return { splitIdx: 0, pre: [], post: [] };
  let idx = markedWeekKey ? ws.findIndex(w => w.weekKey === markedWeekKey) : -1;
  if (idx < 0) idx = Math.ceil(ws.length / 2);
  return { splitIdx: idx, pre: ws.slice(0, idx), post: ws.slice(idx) };
}

// Plain-language narrative from REAL computed before/since deltas — never a fabricated or
// generic string (dispatch's explicit requirement); this is why it changes when the weeks or
// the split point change, and produces nothing when there isn't enough data to say something
// true. Voice-by-role (CLAUDE.md): headline states the decision in restaurant words, bullets
// keep the exact numbers next to it.
// Dispatch #140 item 2: the regression branch's editorial "worth a follow-up [staff-development]
// visit" tail is REMOVED (owner: doesn't want a store to see that phrase directly) — only the
// factual magnitude/direction statement stays, matching the improved/unchanged branches' style.
export function buildNarrative(weeks, markedWeekKey) {
  const ws = weeks || [];
  if (ws.length < 2) {
    return { headline: 'Select a period with at least two LifeLenz weeks to compare before vs. since.', bullets: [] };
  }
  const { splitIdx, pre, post } = splitWeeksAtMark(ws, markedWeekKey);
  if (!pre.length || !post.length) {
    return { headline: 'Not enough weeks on one side of the split to compare — widen the period or pick a different workshop week.', bullets: [], splitIdx };
  }
  const a = aggregateSpan(pre), b = aggregateSpan(post);
  const bullets = [];
  let headline;
  if (a.laborPct != null && b.laborPct != null) {
    const d = b.laborPct - a.laborPct; // pp; negative = lower labor % = improvement
    bullets.push(`Labor % (dollar-weighted, actuals-posted weeks only): ${a.laborPct.toFixed(2)}% before → ${b.laborPct.toFixed(2)}% since (${d >= 0 ? '+' : ''}${d.toFixed(2)}pp).`);
    headline = d < -0.15
      ? `✅ Labor % improved ${Math.abs(d).toFixed(2)}pp since the workshop (${a.laborPct.toFixed(2)}% → ${b.laborPct.toFixed(2)}%) — training appears to be sticking on labor cost.`
      : d > 0.15
      ? `⚠️ Labor % worsened ${Math.abs(d).toFixed(2)}pp since the workshop (${a.laborPct.toFixed(2)}% → ${b.laborPct.toFixed(2)}%).`
      : `➖ Labor % is essentially unchanged since the workshop (${a.laborPct.toFixed(2)}% → ${b.laborPct.toFixed(2)}%, ${d >= 0 ? '+' : ''}${d.toFixed(2)}pp).`;
  } else {
    headline = 'No completed (actuals-posted) week yet on one side of the split — Labor % retention can’t be judged until at least one full week posts real numbers.';
  }
  if (a.hrsDiffAvgPerWeek != null && b.hrsDiffAvgPerWeek != null) {
    bullets.push(`Scheduled vs Forecast hours: averaging ${a.hrsDiffAvgPerWeek >= 0 ? '+' : ''}${a.hrsDiffAvgPerWeek.toFixed(1)} hrs/wk before → ${b.hrsDiffAvgPerWeek >= 0 ? '+' : ''}${b.hrsDiffAvgPerWeek.toFixed(1)} hrs/wk since.`);
  }
  if (a.tpmh != null && b.tpmh != null) {
    bullets.push(`Schd TPMH: ${a.tpmh.toFixed(2)} before → ${b.tpmh.toFixed(2)} since.`);
  }
  if (a.combinedFixedFloorPct != null && b.combinedFixedFloorPct != null) {
    bullets.push(`Fixed+Floor %: ${(a.combinedFixedFloorPct * 100).toFixed(1)}% before → ${(b.combinedFixedFloorPct * 100).toFixed(1)}% since (target ≤25%).`);
  }
  return { headline, bullets, splitIdx, preN: pre.length, postN: post.length };
}

// Dispatch #140 item 3 — default week-range window, in whole LifeLenz business weeks (not
// calendar days). `allWeeks` is every week computeStoreWeeks() finds for the store (oldest ->
// newest, unbounded range); this just windows the trailing `count` of them, or all of them if
// there are fewer. Pure + exported so the "which weeks does a fresh store default to" choice is
// independently testable, same as splitWeeksAtMark above.
export function defaultWeekRange(allWeeks, count = 12) {
  const ws = allWeeks || [];
  if (!ws.length) return { startKey: null, endKey: null };
  const start = ws.length > count ? ws[ws.length - count] : ws[0];
  return { startKey: start.weekKey, endKey: ws[ws.length - 1].weekKey };
}

const _esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Full, scroll-independent printable report — built straight from the same computed `weeks` /
// `narrative` the screen renders, per this session's established ExportDropdown extraHTML
// pattern (dispatch #122/#129: never depend on what happened to be scrolled into view). Colors
// are literal hex (this opens in a blank window with no meridian.css loaded), carried by text
// color + border rather than a background fill (print-color-adjust defaults to 'economy').
// Reads narrative.headline/bullets verbatim — no separate hardcoded copy of the coaching-visit
// phrase existed here (confirmed dispatch #140 item 2), so buildNarrative's fix alone covers
// both the on-screen and the printed output.
export function buildPrintHTML(storeLabel, periodLabel, weeks, narrative) {
  if (!weeks || !weeks.length) return '<p>No LifeLenz schedule weeks in this period.</p>';
  const th = (t) => '<th style="border:1px solid #ddd;padding:5px 8px;background:#f5f5f7;font-size:8px;text-transform:uppercase;text-align:right;white-space:nowrap">' + _esc(t) + '</th>';
  const rowLbl = (t) => '<td style="border:1px solid #ddd;padding:5px 8px;font-weight:700;background:#fafafa;white-space:nowrap">' + _esc(t) + '</td>';
  const td = (t, col) => '<td style="border:1px solid #eee;padding:5px 8px;text-align:right;' + (col ? 'color:' + col + ';font-weight:700' : '') + '">' + _esc(t) + '</td>';

  const headRow = '<tr>' + rowLbl('Week of') + weeks.map(w => th(wkLabel(w.weekStart) + (w.sales > 0 ? ' (actual)' : ' (fcst)'))).join('') + '</tr>';
  const rows = [
    ['Labor % Sales', w => [pct(w.laborPct), diffColor(0)]],
    ['Sched vs Fcst Hrs', w => [hmSigned(w.hrsDiff), diffColor(w.hrsDiff)]],
    ['Scheduled Hrs', w => [hm(w.schedHrs), null]],
    ['Forecast Hrs', w => [hm(w.fcstHrs), null]],
    ['Schd TPMH', w => [w.tpmh == null ? '—' : w.tpmh.toFixed(2), null]],
    ['Fixed % (hrs)', w => [fracPct(w.fixedLaborPct), segColor(w.fixedLaborPct)]],
    ['Floor % (hrs)', w => [fracPct(w.floorLaborPct), segColor(w.floorLaborPct)]],
    ['Fixed+Floor %', w => [fracPct(w.combinedFixedFloorPct), combColor(w.combinedFixedFloorPct)]],
    ['Sales Forecast', w => [f$(w.fcstSales), null]],
    ['Actual Sales', w => [w.sales > 0 ? f$(w.sales) : 'forecast-only', w.sales > 0 ? '#10b981' : '#94a3b8']],
    ['GC Forecast', w => [(w.fcstGC || 0).toLocaleString(), null]],
  ];
  const bodyRows = rows.map(([label, fn]) => '<tr>' + rowLbl(label) + weeks.map(w => { const [v, c] = fn(w); return td(v, c); }).join('') + '</tr>').join('');
  const table = '<table style="border-collapse:collapse;width:100%;font-size:10px;margin-bottom:16px">' +
    '<thead>' + headRow + '</thead><tbody>' + bodyRows + '</tbody></table>';

  const narrHTML = '<div style="border:1px solid #ccc;border-left:4px solid #f5bc00;border-radius:4px;padding:10px 14px;margin-bottom:16px">' +
    '<div style="font-size:12px;font-weight:700;margin-bottom:6px">' + _esc(narrative.headline || '') + '</div>' +
    (narrative.bullets || []).map(b => '<div style="font-size:10px;color:#444;margin-top:2px">• ' + _esc(b) + '</div>').join('') +
    '</div>';

  return '<p style="font-size:11px;color:#666;margin:0 0 10px">' + _esc(storeLabel) + ' · ' + _esc(periodLabel) + ' · ' + weeks.length + ' week' + (weeks.length === 1 ? '' : 's') + '</p>' +
    narrHTML + table;
}

// Metric registry driving BOTH the side-by-side week table and the stacked per-metric
// sparklines below it (dispatch #140 item 5) — one definition per metric instead of two
// hand-written copies drifting apart. `get` reads the raw value off a week; `fmt` renders it;
// `color`, if present, takes the raw value and returns a CSS color for both the table cell and
// the sparkline's current-value readout.
const METRICS = [
  { key: 'laborPct', label: 'Labor % Sales', get: w => w.laborPct, fmt: pct, color: null },
  { key: 'hrsDiff', label: 'Sched vs Fcst Hrs', get: w => w.hrsDiff, fmt: hmSigned, color: diffColor },
  { key: 'schedHrs', label: 'Scheduled Hrs', get: w => w.schedHrs, fmt: hm, color: null },
  { key: 'fcstHrs', label: 'Forecast Hrs', get: w => w.fcstHrs, fmt: hm, color: null },
  { key: 'tpmh', label: 'Schd TPMH', get: w => w.tpmh, fmt: v => v == null ? '—' : v.toFixed(2), color: null },
  { key: 'fixedLaborPct', label: 'Fixed % (hrs)', get: w => w.fixedLaborPct, fmt: fracPct, color: segColor },
  { key: 'floorLaborPct', label: 'Floor % (hrs)', get: w => w.floorLaborPct, fmt: fracPct, color: segColor },
  { key: 'combinedFixedFloorPct', label: 'Fixed+Floor %', get: w => w.combinedFixedFloorPct, fmt: fracPct, color: combColor },
];

// ── WeekRangeControl — dispatch #140 item 3 ──────────────────────────────────────────────────
// Two <select>s (start week / end week) populated from the distinct LifeLenz business weeks
// actually present for this store (oldest -> newest, "Wk of M/D" labels via the shared wkLabel
// formatter) rather than a calendar-day picker. Clamps so start never lands after end (and vice
// versa) by snapping the other bound to match, instead of allowing an inverted/empty range.
const _selStyle = {
  background: 'var(--surf)', border: '.5px solid var(--bdr)', borderRadius: 'var(--r)',
  color: 'var(--text)', fontSize: '11px', padding: '4px 8px',
};
function WeekRangeControl({ weeks, value, onChange }) {
  if (!weeks || !weeks.length) return null;
  const idxOf = k => weeks.findIndex(w => w.weekKey === k);
  const setStart = k => {
    const si = idxOf(k), ei = idxOf(value?.endKey);
    onChange({ startKey: k, endKey: ei >= 0 && ei < si ? k : (value?.endKey ?? k) });
  };
  const setEnd = k => {
    const ei = idxOf(k), si = idxOf(value?.startKey);
    onChange({ startKey: si >= 0 && si > ei ? k : (value?.startKey ?? k), endKey: k });
  };
  return div({ style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } },
    span({ style: { fontSize: 11, color: 'var(--text3)' } }, 'Weeks:'),
    h('select', { value: value?.startKey || '', onChange: e => setStart(e.target.value), style: _selStyle },
      ...weeks.map(w => h('option', { key: w.weekKey, value: w.weekKey }, 'Wk of ' + wkLabel(w.weekStart)))),
    span({ style: { fontSize: 10, color: 'var(--text3)' } }, '→'),
    h('select', { value: value?.endKey || '', onChange: e => setEnd(e.target.value), style: _selStyle },
      ...weeks.map(w => h('option', { key: w.weekKey, value: w.weekKey }, 'Wk of ' + wkLabel(w.weekStart)))),
    span({ style: { fontSize: 9, color: 'var(--text3)' } }, '(' + weeks.length + ' wks available)'));
}

// ── Component ─────────────────────────────────────────────────────────────────────────────────
// Dispatch #140 item 1: content-only, no own RoutePanelShell — renders as a tab inside App.js's
// SchedulingHubPanel (SCHED_TABS 'retention' entry), the same "Section" shape #135 established
// for TargetsEditorSection. All internal state/logic (scope, week range, markedWeekKey, the
// weeks/narrative computation) is unchanged in substance from the standalone panel this replaces
// — only the outer chrome and the range/location controls changed.
export function ScheduleRetentionSection({ ds, stores }) {
  const treeStores = stores || EMPTY_STORES;
  const tree = React.useMemo(() => buildLocationHierarchy(treeStores, INV_ORG_COORDS, STORE_NAMES), [treeStores]);
  const [scope, setScope] = React.useState({ level: 'all', id: null });
  const [weekRange, setWeekRange] = React.useState({ startKey: null, endKey: null });
  const [markedWeekKey, setMarkedWeekKey] = React.useState(null);
  const [inspectWeekKey, setInspectWeekKey] = React.useState(null);

  // Dispatch #140 item 4: broadened to mode:'progressive' (All->State->Patch->Store). This
  // report is inherently single-store (one location's own before/after history) — a broader
  // scope has no per-store detail to show, so `loc` stays null until a specific store is picked,
  // same as the flat mode:'store' picker did for "All Locations" before. A State/Patch selection
  // gets its own, more specific empty-state message below rather than being lumped in with the
  // initial "nothing picked yet" state — the cross-store rollup for that case is dispatch #141's
  // separate report (not yet built when this shipped), not reimplemented here.
  const loc = scope.level === 'store' ? _normLoc(scope.id) : null;

  // Dispatch #141: workshop-week marks are now cloud-persisted (supabase/schema-dispatch-141-
  // retention-marks.sql, src/lib/supabase.js's loadRetentionMarks/saveRetentionMark) — Supabase
  // is the source of truth, not localStorage. A mark made from one device/session is invisible
  // to a rollup computed elsewhere unless it lives in a shared table (the blocking prerequisite
  // that dispatch's own brief called out). localStorage is kept ONLY as a same-session,
  // instant-paint fast-path cache: it renders immediately on store switch, before the one-time
  // cloud read below resolves, and is overwritten by the cloud value the moment it does — never
  // trusted as authoritative once `marksLoaded` is true.
  const [cloudMarks, setCloudMarks] = React.useState({});     // loc -> weekKey, from Supabase
  const [marksLoaded, setMarksLoaded] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    loadRetentionMarks().then(rows => {
      if (!alive) return;
      const m = {};
      for (const r of (rows || [])) if (r.loc && r.weekKey) m[r.loc] = r.weekKey;
      setCloudMarks(m);
      setMarksLoaded(true);
    });
    return () => { alive = false; };
  }, []);

  // Resets the week-range picker to its default trailing window whenever the STORE changes
  // (never on every schedRows/cloudMarks refresh, so a live reload doesn't clobber a manually-
  // picked range) — split from the mark-sync effect below so the two concerns don't fight.
  React.useEffect(() => {
    if (!loc) { setWeekRange({ startKey: null, endKey: null }); setInspectWeekKey(null); return; }
    const avail = computeStoreWeeks(ds?.schedRows || [], loc, {});
    setWeekRange(defaultWeekRange(avail));
    setInspectWeekKey(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc]);

  // Keeps markedWeekKey in sync with whichever store is selected — cloud-first once loaded,
  // localStorage fast-path only until then (see comment above cloudMarks).
  React.useEffect(() => {
    if (!loc) { setMarkedWeekKey(null); return; }
    if (marksLoaded) { setMarkedWeekKey(cloudMarks[loc] || null); return; }
    try {
      const saved = JSON.parse(localStorage.getItem('mf_sched_retention_mark') || '{}');
      setMarkedWeekKey(saved[loc] || null);
    } catch { setMarkedWeekKey(null); }
  }, [loc, marksLoaded, cloudMarks]);

  const markWeek = (weekKey) => {
    setMarkedWeekKey(prev => {
      const next = prev === weekKey ? null : weekKey;
      // Same-session cache write, purely for instant paint — see comment above cloudMarks.
      try {
        const saved = JSON.parse(localStorage.getItem('mf_sched_retention_mark') || '{}');
        if (next) saved[loc] = next; else delete saved[loc];
        localStorage.setItem('mf_sched_retention_mark', JSON.stringify(saved));
      } catch {}
      setCloudMarks(cm => { const n = { ...cm }; if (next) n[loc] = next; else delete n[loc]; return n; });
      saveRetentionMark(loc, next).then(({ error }) => {
        if (error) console.warn('[sched_retention_marks] failed to persist mark for', loc, ':', error);
      });
      return next;
    });
  };

  const allWeeksForStore = React.useMemo(
    () => loc ? computeStoreWeeks(ds?.schedRows || [], loc, {}) : [],
    [ds?.schedRows, loc],
  );
  const weeks = React.useMemo(
    () => loc ? computeStoreWeeks(ds?.schedRows || [], loc, { s: weekRange.startKey, e: weekRange.endKey }) : [],
    [ds?.schedRows, loc, weekRange.startKey, weekRange.endKey],
  );
  const jobsIdx = React.useMemo(() => {
    const m = {};
    for (const r of (ds?.jobHours || [])) {
      const k = _normLoc(r.loc) + '|' + String(r.weekStart);
      (m[k] || (m[k] = [])).push(r);
    }
    return m;
  }, [ds?.jobHours]);

  const narrative = React.useMemo(() => buildNarrative(weeks, markedWeekKey), [weeks, markedWeekKey]);
  const { pre, post } = React.useMemo(() => splitWeeksAtMark(weeks, markedWeekKey), [weeks, markedWeekKey]);
  const preSet = React.useMemo(() => new Set(pre.map(w => w.weekKey)), [pre]);

  const storeLabel = loc ? sNameC(loc) : null;
  const periodLabel = weeks.length ? 'Wk of ' + wkLabel(weeks[0].weekStart) + ' → Wk of ' + wkLabel(weeks[weeks.length - 1].weekStart) : '';

  // ── Inline SVG sparkline factory — dispatch #140 item 5 generalizes the old laborPct-only
  // chart into one per metric row (this app's established "no chart-junk" line-trend language —
  // dt-speedofservice.js's DtTrendChart, visit-readiness.js's per-store rows). Self-contained: no
  // library, one metric, one series. Keeps the proven pre/post-workshop dot coloring.
  const sparklineFor = (accessor, { width = 130, height = 28, pad = 4, color = '#f5bc00' } = {}) => {
    if (weeks.length < 2) return null;
    const vals = weeks.map(accessor);
    const known = vals.filter(v => v != null);
    if (known.length < 2) return null;
    const lo = Math.min(...known), hi = Math.max(...known);
    const span2 = hi - lo || 1;
    const pts = vals.map((v, i) => {
      const x = pad + (i / (vals.length - 1)) * (width - pad * 2);
      if (v == null) return null;
      const y = height - pad - ((v - lo) / span2) * (height - pad * 2);
      return [x, y];
    });
    const known2 = pts.filter(Boolean);
    const path = known2.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    return h('svg', { width, height, style: { display: 'block', flexShrink: 0 } },
      h('path', { d: path, fill: 'none', stroke: color, strokeWidth: 1.4 }),
      ...pts.map((p, i) => p && h('circle', { key: i, cx: p[0], cy: p[1], r: 2, fill: preSet.has(weeks[i].weekKey) ? '#94a3b8' : color })));
  };

  const th = (t, key) => h('th', {
    key, onClick: () => weeks[Number(key)] && markWeek(weeks[Number(key)].weekKey),
    title: 'Click to mark/unmark this week as the workshop week (splits the before/since narrative here)',
    style: { textAlign: 'right', padding: '6px 8px', fontSize: 9.5, cursor: 'pointer', whiteSpace: 'nowrap',
      color: 'var(--text3)', position: 'sticky', top: 0, background: 'var(--surf2)' },
  }, t);

  const metricRow = (label, fn, colFn) => h('tr', { style: { borderTop: '.5px solid var(--bdr)' } },
    h('td', { style: { padding: '6px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', position: 'sticky', left: 0, background: 'var(--surf)' } }, label),
    ...weeks.map((w, i) => h('td', { key: w.weekKey, style: { textAlign: 'right', padding: '6px 8px', fontSize: 11, fontFamily: 'var(--mono)', whiteSpace: 'nowrap', color: colFn ? colFn(w) : 'var(--text)', background: preSet.has(w.weekKey) ? 'transparent' : 'rgba(245,188,0,.05)' } }, fn(w))));

  const inspectWeek = weeks.find(w => w.weekKey === inspectWeekKey);

  const emptyState = (icon, msg) => div({ style: { padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 } },
    div({ style: { fontSize: 26, marginBottom: 10 } }, icon), msg);

  const body = div(null,
    div({ style: { fontSize: 11, color: 'var(--text3)', padding: '8px 12px', margin: '0 0 8px',
      background: 'var(--surf2)', borderRadius: 'var(--r)', border: '.5px solid var(--bdr)', lineHeight: 1.5 } },
      '🎓 Compare one store’s LifeLenz schedule weeks before vs. after a training workshop.' +
      (loc ? ' ' + storeLabel + ' · ' + periodLabel + ' · ' + weeks.length + ' week' + (weeks.length === 1 ? '' : 's') : '')),

    div({ style: { display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 14px', borderBottom: '.5px solid var(--bdr)' } },
      h(LocationSelector, { stores: treeStores, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES, value: scope, onChange: v => { setScope(v); setInspectWeekKey(null); }, mode: 'progressive' }),
      loc && div({ style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
        h(WeekRangeControl, { weeks: allWeeksForStore, value: weekRange, onChange: setWeekRange }),
        h(ExportDropdown, {
          title: 'Schedule Retention — ' + (storeLabel || '') + (periodLabel ? ' · ' + periodLabel : ''),
          filename: 'schedule_retention_' + (loc || 'store') + '_' + new Date().toISOString().slice(0, 10),
          rows: weeks.map(w => ({
            'Week of': wkLabel(w.weekStart), 'Labor %': pct(w.laborPct), 'Sched vs Fcst Hrs': hmSigned(w.hrsDiff),
            'Scheduled Hrs': hm(w.schedHrs), 'Forecast Hrs': hm(w.fcstHrs), 'Schd TPMH': w.tpmh == null ? '' : w.tpmh.toFixed(2),
            'Fixed %': fracPct(w.fixedLaborPct), 'Floor %': fracPct(w.floorLaborPct), 'Fixed+Floor %': fracPct(w.combinedFixedFloorPct),
            'Sales Forecast': w.fcstSales, 'Actual Sales': w.sales || '', 'GC Forecast': w.fcstGC,
          })),
          extraHTML: buildPrintHTML(storeLabel, periodLabel, weeks, narrative),
        }),
      ),
    ),

    !loc && scope.level === 'all' ? emptyState('🎓',
      'Pick a location above to see its schedule-retention report — every LifeLenz business week in the selected period, side by side.')
    : !loc ? emptyState('🏬',
      'This report compares one store’s own schedule weeks over time — pick a Store above to see it. ' +
      'For a rollup across a whole ' + (scope.level === 'state' ? 'state' : 'patch') + ' — "who is driving this" — see the Retention Rollup tab next to this one (dispatch #141): same before/after math, aggregated across every marked store in the group.')
    : !weeks.length ? emptyState('📋',
      'No LifeLenz schedule weeks for ' + storeLabel + ' in this period. Widen the week range or check the daily LifeLenz sync.')
    : div({ style: { padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 14 } },

      // Smart analysis — plain-language, grounded in the real weeks currently shown. Dispatch
      // #140 item 5: shrunk into a compact strip with bullets spread horizontally (flex-wrap)
      // instead of stacked one-per-line, freeing vertical room for the stacked charts below.
      div({ style: { background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderLeft: '3px solid var(--amber)', borderRadius: 8, padding: '8px 12px' } },
        div({ style: { fontSize: 12, fontWeight: 800, marginBottom: narrative.bullets.length ? 4 : 0 } }, narrative.headline),
        narrative.bullets.length > 0 && div({ style: { display: 'flex', flexWrap: 'wrap', columnGap: 16, rowGap: 2 } },
          ...narrative.bullets.map((b, i) => div({ key: i, style: { fontSize: 10, color: 'var(--text2)' } }, '• ' + b))),
        weeks.length >= 2 && div({ style: { fontSize: 9, color: 'var(--text3)', marginTop: 4 } },
          markedWeekKey ? 'Split at the 📌 marked week — click any week header to move it.' : 'No week marked as the workshop yet — click a week header below to mark it (defaults to a midpoint split until then).')),

      // Stacked per-metric sparklines ("for effect", owner's own words) — a small-multiples
      // trend strip, one row per metric, driven off the same METRICS registry as the table below.
      div({ style: { display: 'flex', flexDirection: 'column', gap: 5, padding: '8px 10px', border: '.5px solid var(--bdr)', borderRadius: 8, background: 'var(--surf2)' } },
        div({ style: { fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em' } }, 'Trend — every metric, pre vs. since'),
        ...METRICS.map(m => {
          const sp = sparklineFor(m.get);
          if (!sp) return null;
          const lastVal = m.get(weeks[weeks.length - 1]);
          return div({ key: m.key, style: { display: 'flex', alignItems: 'center', gap: 10 } },
            div({ style: { width: 118, fontSize: 10, color: 'var(--text2)', fontWeight: 600, flexShrink: 0 } }, m.label),
            sp,
            div({ style: { fontSize: 10.5, fontFamily: 'var(--mono)', fontWeight: 700, marginLeft: 'auto', color: m.color ? m.color(lastVal) : 'var(--text)' } }, m.fmt(lastVal)));
        }),
        div({ style: { fontSize: 9, color: 'var(--text3)' } }, '● before  ·  ● since (or unmarked)')),

      // Side-by-side week grid — weeks in COLUMNS (chronological, oldest→newest), metrics in
      // rows, mirroring Schedule Summary's own band, just transposed to compare across time
      // instead of across stores.
      div({ style: { border: '.5px solid var(--bdr)', borderRadius: 8, overflow: 'auto' } },
        h('table', { style: { width: '100%', borderCollapse: 'collapse', minWidth: 200 + weeks.length * 92 } },
          h('thead', null, h('tr', null,
            h('th', { style: { textAlign: 'left', padding: '6px 8px', fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', position: 'sticky', left: 0, top: 0, background: 'var(--surf2)', zIndex: 1 } }, 'Week of →'),
            ...weeks.map((w, i) => th(
              (preSet.has(w.weekKey) ? '' : '→ ') + wkLabel(w.weekStart) + (markedWeekKey === w.weekKey ? ' 📌' : ''),
              String(i),
            )))),
          h('tbody', null,
            ...METRICS.map(m => metricRow(m.label, w => m.fmt(m.get(w)), m.color ? w => m.color(m.get(w)) : null)),
            metricRow('Sales Forecast', w => f$(w.fcstSales)),
            metricRow('Actual Sales', w => w.sales > 0 ? f$(w.sales) : 'forecast-only', w => w.sales > 0 ? '#10b981' : 'var(--text3)'),
            metricRow('GC Forecast', w => (w.fcstGC || 0).toLocaleString()),
            h('tr', null, h('td', { style: { padding: '4px 8px', fontSize: 9, color: 'var(--text3)', position: 'sticky', left: 0, background: 'var(--surf)' } }, 'Inspect'),
              ...weeks.map(w => h('td', { key: w.weekKey, style: { textAlign: 'right', padding: '4px 8px' } },
                btn({ className: 'btn btn-sm', style: { fontSize: 9, padding: '2px 7px' }, onClick: () => setInspectWeekKey(k => k === w.weekKey ? null : w.weekKey) },
                  inspectWeekKey === w.weekKey ? 'Hide ▴' : 'Days ▾')))))),
      ),

      // Per-week detail — daily grid + per-station breakdown for whichever week is being
      // inspected. Kept collapsed by default (dispatch's own suggested compromise: full detail
      // for 4+ weeks side by side gets unreadable if always expanded).
      inspectWeek && div({ style: { border: '.5px solid var(--bdr)', borderRadius: 8, padding: '10px 14px', background: 'var(--surf2)' } },
        div({ style: { fontSize: 11, fontWeight: 800, marginBottom: 6 } }, 'Daily detail — week of ' + wkLabel(inspectWeek.weekStart)),
        h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
          h('thead', null, h('tr', { style: { color: 'var(--text3)', fontSize: 9, textTransform: 'uppercase' } },
            ...['Day', 'Sched', 'Forecast', 'Over/Under', 'Labor %', 'Fcst Sales'].map((t, i) => h('th', { key: i, style: { textAlign: i ? 'right' : 'left', padding: '3px 8px', fontWeight: 700 } }, t)))),
          h('tbody', null, inspectWeek.days.map((d, i) => h('tr', { key: i, style: { fontSize: 10.5, fontFamily: 'var(--mono)' } },
            h('td', { style: { padding: '3px 8px', color: 'var(--text2)' } }, DOW[d.date.getDay()] + ' ' + (d.date.getMonth() + 1) + '/' + d.date.getDate()),
            h('td', { style: { textAlign: 'right', padding: '3px 8px' } }, hm(d.schedHrs)),
            h('td', { style: { textAlign: 'right', padding: '3px 8px', color: 'var(--text3)' } }, hm(d.fcstHrs)),
            h('td', { style: { textAlign: 'right', padding: '3px 8px', color: diffColor(d.hrsDiff), fontWeight: 700 } }, hmSigned(d.hrsDiff)),
            h('td', { style: { textAlign: 'right', padding: '3px 8px' } }, pct(d.laborPct)),
            h('td', { style: { textAlign: 'right', padding: '3px 8px' } }, f$(d.fcstSales)))))),
        h(StationBreakdown, { jobRows: jobsIdx[loc + '|' + inspectWeek.weekKey] })),

      div({ style: { fontSize: 9, color: 'var(--text3)', lineHeight: 1.6 } },
        '⚙ Same metrics as Schedule Summary, reconciled to the penny/minute. Over/Under = Scheduled − Forecast hours. Labor % is dollar-weighted from ACTUAL results once a week posts real sales/labor — it reads — (and Actual Sales reads “forecast-only”) until then. Click a week header to mark/unmark it as the workshop week.'),
    ),
  );

  return body;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// ── Retention Rollup — Patch / Operator / Org / State ("who is driving this") ────────────────
// Dispatch #141 (memory/dispatch-141.md), owner's ask: "If possible do a patch and operator/
// org/state rollup report as well. It would be interesting to see who is driving this."
//
// Placement decision: a NEW hub tab (SCHED_TABS 'retention-rollup' in App.js), next to Training
// Retention, rather than a mode/toggle folded into ScheduleRetentionSection above. Reasoning:
// dispatch #140 already gave the per-store panel's broader-than-store scope a documented,
// deliberate empty state ("pick a store above… the cross-store rollup is dispatch #141's
// separate report, not built into this per-store view") — #140's own comment explicitly framed
// this as the coordination point for #141 to resolve, and a *separate tab* is what that empty
// state's wording already promises (updated above to name this tab directly) rather than
// silently repurposing the same screen's State/Patch scope for a completely different kind of
// view (group leaderboard vs. one store's week-by-week grid). Two tabs sharing the Supabase
// marks + LocationSelector + METRICS/formatter plumbing costs one extra file section, not a
// second implementation.
//
// MATH: reuses computeStoreWeeks/splitWeeksAtMark/aggregateSpan verbatim (never re-derived).
// storeRetentionSplit() does the SAME per-store before/after split ScheduleRetentionSection
// does above, once per store in scope. aggregateRetentionRollup() then buckets those splits by
// a caller-supplied grouping dimension and re-aggregates: concatenating every in-scope store's
// `pre` weeks (and, separately, its `post` weeks) into one combined per-group list, then calling
// aggregateSpan() on each combined list. This IS the dollar-weighted, ratio-of-aggregates rollup
// the dispatch requires ("dollar-weight-aggregate those deltas… never average an average") —
// aggregateSpan already dollar-weights labor % by sales and sums hours/GC additively per week;
// applying it to a combined multi-store week-list is the exact same rule one level up, matching
// computeScheduleSummary()'s own per-week district rollup (schedule-summary.js) in spirit. A
// group's delta is then simply its combined POST aggregate minus its combined PRE aggregate —
// never a straight average of each store's own delta.

// Grouping dimension: PATCH — LIVE supervisorOf() (dispatch #139's fix), never a direct
// invOrgCoords[loc].sup read. Same source buildLocationHierarchy's own Patch tier resolves
// through (PanelControls.js) — a store recently reassigned to a new supervisor shows under its
// CURRENT patch here, matching every other already-fixed panel.
export function patchGroupOf(loc, invOrgCoords) {
  const l = _normLoc(loc);
  return supervisorOf(l, invOrgCoords?.[l]?.sup) || null;
}

// Grouping dimension: OPERATOR — MEASURED, per the dispatch's explicit instruction not to
// assume either way. A grep of this codebase (management.js's "Operator Groups" Settings tab,
// `S.operators` → `{name:[locs]}`) found a real live/Settings-editable operator assignment map,
// already consumed by scheduling.js / one-pager.js / store-dash.js's own operator-scoped views —
// so `op` is NOT simply a static, rarely-changing field the way state/org are. But it has NOT
// received dispatch #139's specific treatment: there is no effective-dated whoRan()-style
// timeline and no single-store live-lookup helper analogous to supervisorOf() for operator, so
// this cannot claim the same "as-of-today, reassignment-aware" guarantee sup now has. This
// resolves `settings.operators` first (live, Settings-editable — the same source every other
// operator-grouped panel already reads), falling back to invOrgCoords[loc].op only for a store
// the settings map doesn't cover at all — the same fallback SHAPE supervisorOf() uses, without
// overstating what it actually verifies.
export function operatorGroupOf(loc, invOrgCoords, settings) {
  const l = _normLoc(loc);
  const groups = (settings && settings.operators) || DEF_SETTINGS.operators || {};
  for (const [name, locs] of Object.entries(groups)) {
    if ((locs || []).some(x => _normLoc(x) === l)) return name;
  }
  return invOrgCoords?.[l]?.op || null;
}

// Grouping dimensions: ORG / STATE — CLAUDE.md Organization Context: stable, already-correct,
// no known staleness issue (unlike sup pre-#139) — safe to read directly.
export function orgGroupOf(loc) {
  return getStoreOrg(_normLoc(loc)) === 'emerald' ? 'Emerald Arches' : 'MCDOK';
}
export function stateGroupOf(loc, invOrgCoords) {
  return invOrgCoords?.[_normLoc(loc)]?.state || null;
}

export const ROLLUP_DIMENSIONS = [
  { id: 'patch',    label: 'Patch',    groupOf: (loc, invOrgCoords) => patchGroupOf(loc, invOrgCoords) },
  { id: 'operator', label: 'Operator', groupOf: (loc, invOrgCoords, settings) => operatorGroupOf(loc, invOrgCoords, settings) },
  { id: 'org',      label: 'Org',      groupOf: (loc) => orgGroupOf(loc) },
  { id: 'state',    label: 'State',    groupOf: (loc, invOrgCoords) => stateGroupOf(loc, invOrgCoords) },
];

// One store's before/after split — pure, independently testable. `markedWeekKey` must resolve
// to an ACTUAL computed week for the store (findIndex succeeds), not just be non-null: a mark
// left over from a week LifeLenz sync no longer covers would otherwise silently fall through to
// splitWeeksAtMark's own midpoint-split fallback and be counted as if properly split. Per the
// dispatch's scope item 4, a store failing any of these checks is EXCLUDED with a stated reason
// — never silently dropped, never silently included with a fabricated split.
export function storeRetentionSplit(schedRows, loc, markedWeekKey) {
  const allWeeks = computeStoreWeeks(schedRows || [], loc, {});
  if (!markedWeekKey) return { loc, included: false, reason: 'no-mark' };
  const idx = allWeeks.findIndex(w => w.weekKey === markedWeekKey);
  if (idx < 0) return { loc, included: false, reason: 'mark-not-found' };
  const { pre, post } = splitWeeksAtMark(allWeeks, markedWeekKey);
  if (!pre.length || !post.length) return { loc, included: false, reason: 'insufficient-weeks' };
  return { loc, included: true, pre, post };
}

// Buckets a set of storeRetentionSplit() results by `groupOf(loc)` and re-aggregates — see file
// header above for why concatenating pre/post week-lists per group and calling aggregateSpan()
// on each is the correct dollar-weighted rollup, not a re-derivation of it. Sorted by Labor %
// delta ascending (most negative = biggest improvement first) so "who is driving this" reads
// top-to-bottom as a leaderboard; groups with no measurable Labor % delta (no actuals-posted
// week on both sides, district-wide) sort after every group that has one, ranked among
// themselves by store count so a real "no signal yet" group isn't confused with "improved 0.00".
export function aggregateRetentionRollup(storeSplits, groupOf) {
  const buckets = {};
  const excluded = [];
  for (const sd of (storeSplits || [])) {
    if (!sd.included) { excluded.push(sd); continue; }
    const gid = groupOf(sd.loc) || 'Unassigned';
    (buckets[gid] ||= { preWeeks: [], postWeeks: [], locs: [] });
    buckets[gid].preWeeks.push(...sd.pre);
    buckets[gid].postWeeks.push(...sd.post);
    buckets[gid].locs.push(sd.loc);
  }
  const rows = Object.keys(buckets).map(gid => {
    const g = buckets[gid];
    const a = aggregateSpan(g.preWeeks), b = aggregateSpan(g.postWeeks);
    const laborPctDelta = (a.laborPct != null && b.laborPct != null) ? b.laborPct - a.laborPct : null;
    const tpmhDelta = (a.tpmh != null && b.tpmh != null) ? b.tpmh - a.tpmh : null;
    const hrsDiffDelta = (a.hrsDiffAvgPerWeek != null && b.hrsDiffAvgPerWeek != null) ? b.hrsDiffAvgPerWeek - a.hrsDiffAvgPerWeek : null;
    return {
      group: gid, storeCount: g.locs.length, locs: g.locs.slice().sort((x, y) => Number(x) - Number(y)),
      pre: a, post: b, laborPctDelta, tpmhDelta, hrsDiffDelta,
    };
  });
  rows.sort((x, y) => {
    if (x.laborPctDelta == null && y.laborPctDelta == null) return y.storeCount - x.storeCount;
    if (x.laborPctDelta == null) return 1;
    if (y.laborPctDelta == null) return -1;
    return x.laborPctDelta - y.laborPctDelta;
  });
  return { rows, excluded };
}

const _lpDeltaColor = d => d == null ? 'var(--text3)' : d < -0.15 ? '#10b981' : d > 0.15 ? '#ef4444' : 'var(--text3)';
const _lpVerdict = d => d == null ? '— no actuals-posted week yet' : d < -0.15 ? '✅ improved' : d > 0.15 ? '⚠️ worsened' : '➖ flat';
const _EXCLUDE_REASON_LABEL = {
  'no-mark': 'no workshop week marked yet',
  'mark-not-found': 'marked week no longer in the synced range',
  'insufficient-weeks': 'not enough weeks on one side of the mark',
};

// ── Component ─────────────────────────────────────────────────────────────────────────────────
// Content-only (same shape as ScheduleRetentionSection) — renders as SCHED_TABS'
// 'retention-rollup' tab in App.js's SchedulingHubPanel.
export function ScheduleRetentionRollupSection({ ds, stores, settings }) {
  const treeStores = stores || EMPTY_STORES;
  const tree = React.useMemo(() => buildLocationHierarchy(treeStores, INV_ORG_COORDS, STORE_NAMES), [treeStores]);
  const [scope, setScope] = React.useState({ level: 'all', id: null });
  const [dim, setDim] = React.useState('patch');

  // Same cloud-first mark load as ScheduleRetentionSection above (dispatch #141) — this view is
  // meaningless on localStorage-only marks (a store marked from a different device/session would
  // silently read as "no workshop week" and make every group's aggregate wrong), so it reads
  // ONLY the Supabase table, no localStorage fallback (that fast-path exists on the per-store
  // panel purely for instant single-store paint; a rollup has no single-store paint to protect).
  const [cloudMarks, setCloudMarks] = React.useState({});
  const [marksLoaded, setMarksLoaded] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    loadRetentionMarks().then(rows => {
      if (!alive) return;
      const m = {};
      for (const r of (rows || [])) if (r.loc && r.weekKey) m[r.loc] = r.weekKey;
      setCloudMarks(m);
      setMarksLoaded(true);
    });
    return () => { alive = false; };
  }, []);

  const locsInScope = React.useMemo(() => locationSelectorLocs(scope, tree), [scope, tree]);

  const storeSplits = React.useMemo(() => {
    if (!marksLoaded) return [];
    return locsInScope.map(loc => storeRetentionSplit(ds?.schedRows || [], loc, cloudMarks[loc] || null));
  }, [locsInScope, ds?.schedRows, cloudMarks, marksLoaded]);

  const dimDef = ROLLUP_DIMENSIONS.find(d => d.id === dim) || ROLLUP_DIMENSIONS[0];
  const { rows, excluded } = React.useMemo(
    () => aggregateRetentionRollup(storeSplits, loc => dimDef.groupOf(loc, INV_ORG_COORDS, settings)),
    [storeSplits, dimDef, settings],
  );
  const includedCount = storeSplits.length - excluded.length;

  const scopeLabel = scope.level === 'all' ? 'All Locations'
    : scope.level === 'state' ? (tree.states.find(s => s.id === scope.id)?.label || scope.id)
    : scope.level === 'patch' ? (tree.patches.find(p => p.id === scope.id)?.label || scope.id)
    : scope.id ? sNameC(scope.id) : '';

  const th = t => h('th', { key: t, style: { textAlign: t === 'Group' ? 'left' : 'right', padding: '6px 8px', fontSize: 9.5, textTransform: 'uppercase', color: 'var(--text3)', whiteSpace: 'nowrap' } }, t);
  const td = (v, style) => h('td', { style: { textAlign: 'right', padding: '6px 8px', fontSize: 11, fontFamily: 'var(--mono)', whiteSpace: 'nowrap', ...style } }, v);

  const emptyState = (icon, msg) => div({ style: { padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 } },
    div({ style: { fontSize: 26, marginBottom: 10 } }, icon), msg);

  const body = div(null,
    div({ style: { fontSize: 11, color: 'var(--text3)', padding: '8px 12px', margin: '0 0 8px',
      background: 'var(--surf2)', borderRadius: 'var(--r)', border: '.5px solid var(--bdr)', lineHeight: 1.5 } },
      '📊 "Who is driving this" — every marked store\'s own before/after workshop split (dispatch #141), dollar-weight-aggregated by group. ' +
      (marksLoaded ? includedCount + ' of ' + storeSplits.length + ' store' + (storeSplits.length === 1 ? '' : 's') + ' in scope have a usable mark.' : 'Loading marks…')),

    div({ style: { display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 14px', borderBottom: '.5px solid var(--bdr)' } },
      h(LocationSelector, { stores: treeStores, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES, value: scope, onChange: setScope, mode: 'progressive' }),
      div({ style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } },
        span({ style: { fontSize: 11, color: 'var(--text3)' } }, 'Group by:'),
        ...ROLLUP_DIMENSIONS.map(d => btn({
          key: d.id, onClick: () => setDim(d.id),
          style: { padding: '4px 12px', borderRadius: 'var(--r)', border: '.5px solid ' + (dim === d.id ? 'rgba(245,158,11,.4)' : 'var(--bdr)'),
            background: dim === d.id ? 'var(--adim)' : 'transparent', color: dim === d.id ? 'var(--amber)' : 'var(--text2)',
            fontSize: '11px', fontWeight: dim === d.id ? 700 : 400, cursor: 'pointer' },
        }, d.label)),
        ExportDropdown && rows.length ? h(ExportDropdown, {
          title: 'Retention Rollup by ' + dimDef.label + ' — ' + scopeLabel,
          filename: 'retention_rollup_' + dim + '_' + new Date().toISOString().slice(0, 10),
          rows: rows.map(r => ({
            [dimDef.label]: r.group, Stores: r.storeCount,
            'Labor % Before': r.pre.laborPct == null ? '' : pct(r.pre.laborPct), 'Labor % Since': r.post.laborPct == null ? '' : pct(r.post.laborPct),
            'Labor % Δ (pp)': r.laborPctDelta == null ? '' : (r.laborPctDelta * 100).toFixed(2),
            'Sched-Fcst Hrs/Wk Before': r.pre.hrsDiffAvgPerWeek == null ? '' : r.pre.hrsDiffAvgPerWeek.toFixed(1),
            'Sched-Fcst Hrs/Wk Since': r.post.hrsDiffAvgPerWeek == null ? '' : r.post.hrsDiffAvgPerWeek.toFixed(1),
            'TPMH Before': r.pre.tpmh == null ? '' : r.pre.tpmh.toFixed(2), 'TPMH Since': r.post.tpmh == null ? '' : r.post.tpmh.toFixed(2),
          })),
        }) : null,
      ),
    ),

    !marksLoaded ? emptyState('⏳', 'Loading workshop-week marks from Supabase…')
    : !locsInScope.length ? emptyState('🎓', 'Pick a location above to see the rollup for that scope.')
    : !rows.length ? emptyState('📋', 'No store in this scope has a usable workshop-week mark yet — mark one in the Training Retention tab first.')
    : div({ style: { padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 } },

      div({ style: { border: '.5px solid var(--bdr)', borderRadius: 8, overflow: 'auto' } },
        h('table', { style: { width: '100%', borderCollapse: 'collapse', minWidth: 620 } },
          h('thead', null, h('tr', null, [dimDef.label, 'Stores', 'Labor % Before → Since', 'Labor % Δ', 'Sched-Fcst Hrs/Wk Δ', 'TPMH Δ', 'Verdict'].map(th))),
          h('tbody', null, ...rows.map((r, i) => h('tr', { key: r.group, style: { borderTop: '.5px solid var(--bdr)', background: i === 0 && r.laborPctDelta != null ? 'rgba(16,185,129,.06)' : 'transparent' } },
            h('td', { style: { padding: '6px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' } }, (i === 0 && r.laborPctDelta != null ? '🏆 ' : '') + r.group),
            td(r.storeCount),
            td(r.pre.laborPct == null || r.post.laborPct == null ? '—' : pct(r.pre.laborPct) + ' → ' + pct(r.post.laborPct)),
            td(r.laborPctDelta == null ? '—' : (r.laborPctDelta >= 0 ? '+' : '') + (r.laborPctDelta * 100).toFixed(2) + 'pp', { color: _lpDeltaColor(r.laborPctDelta), fontWeight: 700 }),
            td(r.hrsDiffDelta == null ? '—' : (r.hrsDiffDelta >= 0 ? '+' : '') + r.hrsDiffDelta.toFixed(1) + ' hrs/wk'),
            td(r.tpmhDelta == null ? '—' : (r.tpmhDelta >= 0 ? '+' : '') + r.tpmhDelta.toFixed(2)),
            h('td', { style: { textAlign: 'left', padding: '6px 8px', fontSize: 10.5, color: _lpDeltaColor(r.laborPctDelta), whiteSpace: 'nowrap' } }, _lpVerdict(r.laborPctDelta)),
          ))),
        ),
      ),

      excluded.length > 0 && div({ style: { fontSize: 10.5, color: 'var(--text3)', border: '.5px dashed var(--bdr)', borderRadius: 8, padding: '8px 12px', lineHeight: 1.6 } },
        div({ style: { fontWeight: 700, marginBottom: 4, color: 'var(--text2)' } },
          '⚠️ ' + excluded.length + ' store' + (excluded.length === 1 ? '' : 's') + ' in this scope excluded from every group\'s aggregate above (no before/after delta to measure):'),
        ...Object.entries(excluded.reduce((m, e) => { (m[e.reason] ||= []).push(e.loc); return m; }, {})).map(([reason, locs]) =>
          div({ key: reason }, '• ' + _EXCLUDE_REASON_LABEL[reason] + ': ' + locs.map(l => sName(l) || l).join(', '))),
      ),

      div({ style: { fontSize: 9, color: 'var(--text3)', lineHeight: 1.6 } },
        '⚙ Each group\'s Before/Since figures are the DOLLAR-WEIGHTED aggregate of every marked store\'s own before/after weeks in that group (same rule aggregateSpan/computeScheduleSummary use elsewhere) — never a straight average of stores\' individual deltas. Δ = Since − Before; negative Labor % Δ and Sched-Fcst Hrs/Wk Δ moving toward 0 are improvements.'),
    ),
  );

  return body;
}
