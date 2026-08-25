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
import { LocationSelector, buildLocationHierarchy } from '../components/PanelControls.js';
import { computeStoreWeeks, FIXED_FLOOR_SEG_MIN, FIXED_FLOOR_SEG_MAX, FIXED_FLOOR_COMBINED_MAX } from '../engine/schedule-summary.js';
import { StationBreakdown } from './schedule-summary.js';
import { ExportDropdown } from './store-dash.js';
import { INV_ORG_COORDS, STORE_NAMES, sNameC } from '../constants.js';

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

  // Persist which week is "the workshop week" per store, locally — a UI convenience only, never
  // a new data pipeline (out of scope per the dispatch). Wrapped in try/catch: private windows /
  // blocked site data must not break the panel. Also resets the week-range picker to its default
  // trailing window whenever the store changes (never on every schedRows refresh, so a live
  // reload doesn't clobber a manually-picked range).
  React.useEffect(() => {
    if (!loc) { setMarkedWeekKey(null); setWeekRange({ startKey: null, endKey: null }); setInspectWeekKey(null); return; }
    try {
      const saved = JSON.parse(localStorage.getItem('mf_sched_retention_mark') || '{}');
      setMarkedWeekKey(saved[loc] || null);
    } catch { setMarkedWeekKey(null); }
    const avail = computeStoreWeeks(ds?.schedRows || [], loc, {});
    setWeekRange(defaultWeekRange(avail));
    setInspectWeekKey(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc]);
  const markWeek = (weekKey) => {
    setMarkedWeekKey(prev => {
      const next = prev === weekKey ? null : weekKey;
      try {
        const saved = JSON.parse(localStorage.getItem('mf_sched_retention_mark') || '{}');
        if (next) saved[loc] = next; else delete saved[loc];
        localStorage.setItem('mf_sched_retention_mark', JSON.stringify(saved));
      } catch {}
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
      'A rollup across a whole ' + (scope.level === 'state' ? 'state' : 'patch') + ' is a separate report (the patch/operator/org/state rollup work), not built into this per-store view.')
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
