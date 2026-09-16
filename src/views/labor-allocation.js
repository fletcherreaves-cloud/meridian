// @ts-nocheck
// ── Labor Allocation panel (Dispatch29 Workstream G) ──────────────────────────
// Wires src/engine/labor-standard.js — a tested, correct engine that had ZERO callers
// anywhere in src/ (grepped directly) despite encoding a PROVEN, owner-run finding
// (memory/analysis-labor-allocation-2026-08-18.md): Breakfast and Lunch run UNDER the
// VLH guide while Afternoon/Dinner/Late Night run OVER it, and the surplus covers the
// deficit 1.6x — a real, cost-neutral reallocation, not a hypothesis. This is exactly
// the #366 failure mode CLAUDE.md names ("a test that only imports the engine can't
// tell fixed from fixed-but-never-wired-in") — the third time this session's dispatches
// found it. Self-loads its own data (90 days x 27 stores x 24 hour_slots is too large to
// add to App.js's startup ds — same reasoning dt-speedofservice.js's loadDtHistory
// already uses) rather than joining the global pipeline.
import * as React from 'react';
import { loadDailyActivityRange, loadStoreLaborConfig, loadVlhStoreConfigs, loadVlhGuideHours } from '../lib/supabase.js';
import {
  DAYPARTS, allocationDistrict, allocationByStoreDaypart, overnightOpenness, overnightExcessByStore,
} from '../engine/labor-standard.js';
import { buildVlhGuideIndex, guideVsReportedByStoreDaypart } from '../engine/vlh-guide.js';
import { STORE_NAMES } from '../constants.js';
import { ModalShell } from '../components/ModalShell.js';
import { mark as _mark } from '../utils/click-trace.js';

const h = React.createElement;
const sName = loc => STORE_NAMES?.[String(loc)] || ('Store ' + loc);
const DAYS_BACK = 90; // matches the proven analysis' own window

const fmtHrs = v => v == null ? '—' : Math.round(v).toLocaleString() + 'h';
const fmtSignedHrs = v => v == null ? '—' : (v >= 0 ? '+' : '') + Math.round(v).toLocaleString() + 'h';
const fmtRatio = v => v == null ? '—' : v.toFixed(3);
const fmtSec = v => v == null ? '—' : Math.round(v) + 's';
const fmtTpph = v => v == null ? '—' : v.toFixed(2);
// Guide-ratio color: green near 1.0, amber/red the further off (either direction) — a store
// can be JUST as wrong under guide as over it, so this is symmetric, not "high = bad."
const guideColor = v => v == null ? 'var(--text3)' : Math.abs(v - 1) <= 0.1 ? '#10b981' : Math.abs(v - 1) <= 0.3 ? '#f59e0b' : '#ef4444';
const gapColor = v => v == null ? 'var(--text3)' : Math.abs(v) < 5 ? 'var(--text2)' : v > 0 ? '#f59e0b' : '#60a5fa'; // over=amber, under=blue

function dayKeyRange(daysBack) {
  const end = new Date();
  const start = new Date(end.getTime() - daysBack * 86400000);
  const iso = d => d.toISOString().slice(0, 10);
  return { startDate: iso(start), endDate: iso(end) };
}

const th = (t, al) => h('th', { style: { textAlign: al || 'right', padding: '5px 8px', fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em', position: 'sticky', top: 0, background: 'var(--surf2)', whiteSpace: 'nowrap' } }, t);
const td = (c, al, col, mono = true) => h('td', { style: { textAlign: al || 'right', padding: '5px 8px', fontSize: 11, fontFamily: mono ? 'var(--mono)' : 'inherit', color: col || 'var(--text)', whiteSpace: 'nowrap' } }, c);

function DistrictTable({ district }) {
  const totalDeficit = DAYPARTS.reduce((s, dp) => s + Math.min(0, district[dp]?.gapHrs || 0), 0);
  const totalSurplus = DAYPARTS.reduce((s, dp) => s + Math.max(0, district[dp]?.gapHrs || 0), 0);
  return h('div', null,
    h('div', { style: { fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 8, lineHeight: 1.5, padding: '8px 10px', background: 'rgba(74,144,217,.08)', border: '.5px solid rgba(74,144,217,.3)', borderRadius: 6 } },
      `Deficit ${fmtSignedHrs(totalDeficit)} · Surplus ${fmtSignedHrs(totalSurplus)}` +
      (totalDeficit < 0 && totalSurplus > 0 ? ` — surplus covers deficit ${(totalSurplus / -totalDeficit).toFixed(1)}×. ` : '. ') +
      'Breakfast/Lunch schedule near guide but lose hours at the punch (execution); Afternoon/Dinner are written 30–38% over guide before anyone clocks in (scheduling). Different problems, different owners — see per-store detail below.'),
    h('table', { style: { width: '100%', borderCollapse: 'collapse', marginBottom: 16 } },
      h('thead', null, h('tr', null,
        th('Daypart', 'left'), th('Cars'), th('Punched'), th('Needed'), th('Gap'),
        th('Sched vs Guide'), th('Punched vs Sched'), th('Punched vs Guide'))),
      h('tbody', null, DAYPARTS.map(dp => {
        const d = district[dp] || {};
        return h('tr', { key: dp, style: { borderTop: '.5px solid var(--bdr)' } },
          td(dp, 'left', 'var(--text)', false),
          td((d.cars || 0).toLocaleString()),
          td(fmtHrs(d.punchedHrs)),
          td(fmtHrs(d.neededHrs), 'right', 'var(--text3)'),
          td(fmtSignedHrs(d.gapHrs), 'right', gapColor(d.gapHrs)),
          td(fmtRatio(d.scheduledVsGuide), 'right', guideColor(d.scheduledVsGuide)),
          td(fmtRatio(d.punchedVsScheduled), 'right', guideColor(d.punchedVsScheduled)),
          td(fmtRatio(d.punchedVsGuide), 'right', guideColor(d.punchedVsGuide)));
      }))));
}

// Coverage color: this is NOT a guide-vs-actual ratio like guideColor above (which grades
// near 1.0 as good) -- the real DT+In-Store guide is only a PARTIAL component of
// total_needed_hours (Variable Needed for 2 of ~10 positions; total_needed_hours also
// folds in Fixed Sched + Floor Need). Live-measured district average is ~38.6% coverage
// (memory/finding-vlh-guide-tables-2026-09-16.md) -- so this just flags whether a store/
// daypart's coverage sits near that established baseline or has drifted well off it, not
// whether it's "correct."
const coverageColor = pct => pct == null ? 'var(--text3)' : pct >= 25 && pct <= 55 ? 'var(--text2)' : '#f59e0b';

function GuideDetailTable({ detail }) {
  const rows = [];
  for (const [loc, dps] of Object.entries(detail || {})) {
    for (const dp of DAYPARTS) {
      const v = dps[dp];
      if (!v) continue;
      rows.push({ loc, dp, ...v, coveragePct: v.reportedHours > 0 ? (v.guideHours / v.reportedHours) * 100 : null });
    }
  }
  if (!rows.length) return h('div', { style: { padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 11 } },
    'No VLH guide data for this window — either store_vlh_config or vlh_guide_hours may be empty.');
  rows.sort((a, b) => sName(a.loc).localeCompare(sName(b.loc)) || DAYPARTS.indexOf(a.dp) - DAYPARTS.indexOf(b.dp));
  return h('div', null,
    h('div', { style: { fontSize: 10.5, color: 'var(--text3)', marginBottom: 8, lineHeight: 1.5 } },
      'Drive Thru + In-Store guest-count legs only, looked up directly against the actual 2022 VLH Workbook tables ',
      '(', h('code', null, 'vlh_guide_hours'), ') — not a re-derivation of the full ', h('code', null, 'total_needed_hours'),
      ' algorithm, which also folds in Fixed Sched + Floor Need and ~8 more positions. Live-measured baseline: guide hours ',
      'cover ~38.6% of reported total_needed_hours on average, moving directionally together — this is not meant to reconcile 1:1.'),
    h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
      h('thead', null, h('tr', null,
        th('Store', 'left'), th('Daypart', 'left'), th('Guide Hrs (DT+IS)'), th('Reported (Needed)'), th('Coverage %'), th('Rows Missing Guide'))),
      h('tbody', null, rows.map(r => h('tr', { key: r.loc + '|' + r.dp, style: { borderTop: '.5px solid var(--bdr)' } },
        td(sName(r.loc), 'left', 'var(--text)', false),
        td(r.dp, 'left', 'var(--text2)', false),
        td(fmtHrs(r.guideHours), 'right', 'var(--text2)'),
        td(fmtHrs(r.reportedHours), 'right', 'var(--text3)'),
        td(r.coveragePct == null ? '—' : r.coveragePct.toFixed(1) + '%', 'right', coverageColor(r.coveragePct)),
        td(r.rowsMissingGuide ? r.rowsMissingGuide.toLocaleString() : '—', 'right', r.rowsMissingGuide ? '#f59e0b' : 'var(--text3)'))))));
}

function PerStoreTable({ byStore, daypart }) {
  const rows = Object.entries(byStore)
    .map(([loc, dps]) => ({ loc, ...(dps[daypart] || {}) }))
    .filter(r => r.cars != null)
    .sort((a, b) => (a.gapHrs ?? 0) - (b.gapHrs ?? 0)); // biggest deficit first
  if (!rows.length) return h('div', { style: { padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 11 } }, 'No data for this daypart in the loaded window.');
  return h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
    h('thead', null, h('tr', null,
      th('Store', 'left'), th('Cars'), th('Gap'), th('Sched vs Guide'), th('Punched vs Sched'), th('Punched vs Guide'))),
    h('tbody', null, rows.map(r => h('tr', { key: r.loc, style: { borderTop: '.5px solid var(--bdr)' } },
      td(sName(r.loc), 'left', 'var(--text)', false),
      td((r.cars || 0).toLocaleString()),
      td(fmtSignedHrs(r.gapHrs), 'right', gapColor(r.gapHrs)),
      td(fmtRatio(r.scheduledVsGuide), 'right', guideColor(r.scheduledVsGuide)),
      td(fmtRatio(r.punchedVsScheduled), 'right', guideColor(r.punchedVsScheduled)),
      td(fmtRatio(r.punchedVsGuide), 'right', guideColor(r.punchedVsGuide))))));
}

// Overnight: classify FIRST, then read the number that classification allows — mixing a
// closed store's TPPH into an open-store speed ranking is exactly what produced the
// retracted "Tishomingo/Elgin killer pair" finding (both were actually closed overnight).
function OvernightTable({ byStore, openness, excessByStore, storeLaborConfig }) {
  const rows = Object.entries(openness).sort((a, b) => (b[1].gapHrs || 0) - (a[1].gapHrs || 0));
  if (!rows.length) return null;
  return h('div', null,
    h('div', { style: { fontSize: 10.5, color: 'var(--text3)', marginBottom: 8, lineHeight: 1.5 } },
      'Late Night is classified open vs closed FIRST (% of nights with any drive-thru car). ',
      h('b', null, 'Closed'), ' stores are graded against the owner\'s close-down/pre-open standard (3–4 combined hrs + a pre-open hour) — the VLH guide returns near-zero for a closed store and can\'t say what a close-down should cost. ',
      h('b', null, 'Open'), ' stores get the TPPH/speed read instead. The two never mix on one ratio.'),
    h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
      h('thead', null, h('tr', null,
        th('Store', 'left'), th('% nights w/ cars'), th('Configured open'), th('Status'), th('vs standard / TPPH'), th('sec/car'))),
      h('tbody', null, rows.map(([loc, o]) => {
        const cfg = storeLaborConfig[loc];
        const cfgHours = cfg?.hours?.mon; // Monday as a representative weekday for display
        const cfgOpenTxt = cfg?.is24hr ? '24hr' : cfgHours?.open != null ? `opens ~${(cfgHours.open * 24).toFixed(1)}h` : '—';
        const late = (byStore[loc] || {})['Late Night'] || {};
        if (o.isClosedOvernight) {
          const ex = excessByStore[loc];
          const verdict = ex?.na ? ex.reason
            : ex?.verdict?.overStandard ? `+${ex.verdict.excess.toFixed(1)}h/night over standard`
            : ex?.verdict?.underStandard ? `${ex.verdict.shortfall.toFixed(1)}h/night under standard`
            : ex?.verdict?.onTarget ? 'on target'
            : ex?.safeForWeeklyAverage === false ? 'mixed hours — see per-weekday detail'
            : '—';
          return h('tr', { key: loc, style: { borderTop: '.5px solid var(--bdr)' } },
            td(sName(loc), 'left', 'var(--text)', false),
            td(o.pctSlotsWithCars?.toFixed(1) + '%', 'right', 'var(--text3)'),
            td(cfgOpenTxt, 'right', 'var(--text3)'),
            td('Closed', 'right', '#60a5fa'),
            td(verdict, 'right', ex?.verdict?.overStandard ? '#f59e0b' : ex?.verdict?.underStandard ? '#60a5fa' : 'var(--text2)'),
            td('—'));
        }
        return h('tr', { key: loc, style: { borderTop: '.5px solid var(--bdr)' } },
          td(sName(loc), 'left', 'var(--text)', false),
          td(o.pctSlotsWithCars?.toFixed(1) + '%', 'right', 'var(--text3)'),
          td(cfgOpenTxt, 'right', 'var(--text3)'),
          td('Open', 'right', '#10b981'),
          td(fmtTpph(late.tpph) + ' TPPH', 'right', 'var(--text2)'),
          td(fmtSec(late.secPerCar)));
      }))));
}

export function LaborAllocationPanel({ ds, stores, settings, onClose, embedded }) {
  const { useState, useEffect, useMemo } = React;
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [storeLaborConfig, setStoreLaborConfig] = useState({});
  const [vlhStoreConfigs, setVlhStoreConfigs] = useState({});
  const [vlhGuideRows, setVlhGuideRows] = useState([]);
  const [daypart, setDaypart] = useState('Breakfast');
  const [tab, setTab] = useState('district'); // district | store | overnight | guide

  useEffect(() => {
    setLoading(true);
    const { startDate, endDate } = dayKeyRange(DAYS_BACK);
    Promise.all([loadDailyActivityRange(startDate, endDate), loadStoreLaborConfig(), loadVlhStoreConfigs(), loadVlhGuideHours()])
      .then(([activityRows, cfg, vlhCfg, vlhGuide]) => {
        setRows(activityRows || []); setStoreLaborConfig(cfg || {});
        setVlhStoreConfigs(vlhCfg || {}); setVlhGuideRows(vlhGuide || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Perf instrumentation (backlog item G, gap 2) -- rows is up to 90 days x 27 stores x 24
  // hour_slots (~58k rows), and these 4 recompute on every `rows`/`storeLaborConfig` change.
  // Matches the _mark idiom other heavy-compute panels use (at-a-glance.js's
  // compute:weekProjections etc.) so a ?clicktrace=1 session can see where the cost sits.
  const district = useMemo(() => _mark('compute:laborAllocationDistrict', () => allocationDistrict(rows)), [rows]);
  const byStore = useMemo(() => _mark('compute:laborAllocationByStore', () => allocationByStoreDaypart(rows)), [rows]);
  const openness = useMemo(() => _mark('compute:laborAllocationOvernightOpenness', () => overnightOpenness(rows)), [rows]);
  const excessByStore = useMemo(() => _mark('compute:laborAllocationOvernightExcess', () => overnightExcessByStore(storeLaborConfig, openness)), [storeLaborConfig, openness]);
  // Task #73 -- wires the real VLH-workbook engine (src/engine/vlh-guide.js), shipped with
  // live-seeded data (4,592 rows) but no UI, into this panel's existing allocation view
  // rather than a new standalone panel (memory/finding-vlh-guide-tables-2026-09-16.md's own
  // recommendation). guideIndex only needs to rebuild when the reference table itself
  // changes (never, within one session), so it's keyed off vlhGuideRows not the 90-day rows.
  const guideIndex = useMemo(() => _mark('compute:laborAllocationVlhGuideIndex', () => buildVlhGuideIndex(vlhGuideRows)), [vlhGuideRows]);
  const guideDetail = useMemo(() => _mark('compute:laborAllocationVlhGuideDetail', () => guideVsReportedByStoreDaypart(guideIndex, vlhStoreConfigs, rows)), [guideIndex, vlhStoreConfigs, rows]);

  const tabBtn = (id, label) => h('button', { key: id, onClick: () => setTab(id),
    style: { padding: '4px 11px', borderRadius: 7, cursor: 'pointer', fontSize: 11, fontWeight: 700,
      border: '1px solid ' + (tab === id ? 'var(--amber)' : 'var(--bdr)'),
      background: tab === id ? 'rgba(245,188,0,.14)' : 'var(--surf)',
      color: tab === id ? 'var(--amber)' : 'var(--text2)' } }, label);
  const tabBar = h('div', { style: { display: 'flex', gap: 2 } }, tabBtn('district', 'District'), tabBtn('store', 'By Store'), tabBtn('overnight', 'Overnight'), tabBtn('guide', 'VLH Guide (Real)'));

  const body = loading ? h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 } }, 'Loading 90 days of hourly activity…')
    : !rows.length ? h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 } },
        h('div', { style: { fontSize: 26, marginBottom: 10 } }, '⚖️'),
        'No hourly activity data loaded for this window.')
    : tab === 'district' ? h(DistrictTable, { district })
    : tab === 'store' ? h('div', null,
        h('div', { style: { display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' } },
          ...DAYPARTS.map(dp => h('button', { key: dp, onClick: () => setDaypart(dp),
            style: { padding: '3px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 10.5, fontWeight: 700,
              border: '1px solid ' + (daypart === dp ? 'var(--amber)' : 'var(--bdr)'),
              background: daypart === dp ? 'rgba(245,188,0,.14)' : 'var(--surf2)',
              color: daypart === dp ? 'var(--amber)' : 'var(--text2)' } }, dp))),
        h(PerStoreTable, { byStore, daypart }))
    : tab === 'overnight' ? h(OvernightTable, { byStore, openness, excessByStore, storeLaborConfig })
    : h(GuideDetailTable, { detail: guideDetail });

  const footerNote = tab === 'guide'
    ? 'Real DT+In-Store hours from the 2022 VLH Workbook tables (vlh_guide_hours), looked up by actual DAR guest counts — not the total_needed_hours proxy the other tabs\' "vs Guide" columns use. Full analysis: memory/finding-vlh-guide-tables-2026-09-16.md.'
    : 'Ratio of sums, 24-hour-slot completeness guard applied. Daypart boundaries are the VLH guide\'s own (Breakfast 5a–11a, Lunch 11a–2p, Afternoon 2p–5p, Dinner 5p–11p, Late Night 11p–5a). Full analysis: memory/analysis-labor-allocation-2026-08-18.md.';

  // Dispatch30 (Workstream D follow-up): this branch was dead code before this pass —
  // App.js's SchedulingHubPanel is the only caller and always passes embedded:true — but a
  // dead code path hand-rolling the exact backdrop/card/close-button shape ModalShell already
  // standardizes (magic zIndex 460 instead of the shared Z.modal tier included) is precisely
  // the pattern dispatch #26/#30 flag. Kept reachable (a future standalone caller) but now
  // built on the shared shell instead of a second hand-copy of it.
  if (!embedded) {
    return h(ModalShell, {
      title: 'Labor Allocation', icon: '⚖️', maxWidth: 1200, onClose,
      subtitle: `Where hours sit vs the VLH guide, by daypart — last ${DAYS_BACK} days, all stores`,
      headerExtra: tabBar,
      bodyStyle: { padding: '14px 16px' },
      footer: h('div', { style: { fontSize: 9, color: 'var(--text3)' } }, footerNote),
    }, body);
  }

  const OUTER = { position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' };
  const CARD = { flex: 1, minHeight: 0, background: 'var(--surf)', width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' };
  return h('div', { style: OUTER },
    h('div', { style: CARD },
      h('div', { style: { padding: '10px 16px', borderBottom: '.5px solid var(--bdr)', flexShrink: 0, background: 'var(--surf2)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
        h('span', { style: { fontSize: 18 } }, '⚖️'),
        h('div', { style: { flex: 1, minWidth: 180 } },
          h('div', { style: { fontSize: 14, fontWeight: 800 } }, 'Labor Allocation'),
          h('div', { style: { fontSize: 9, color: 'var(--text3)' } }, `Where hours sit vs the VLH guide, by daypart — last ${DAYS_BACK} days, all stores`)),
        tabBar),
      h('div', { style: { flex: 1, overflowY: 'auto', padding: '14px 16px' } }, body),
      h('div', { style: { padding: '6px 16px', borderTop: '.5px solid var(--bdr)', flexShrink: 0, fontSize: 9, color: 'var(--text3)' } }, footerNote)));
}
