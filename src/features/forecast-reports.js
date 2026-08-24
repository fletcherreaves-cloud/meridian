// @ts-nocheck
// ── FORECAST REPORTS (dispatch #106 Phase B) ──────────────────────────────────────────────
// "Forecast Reports" is a PROPOSED name for this merged parent category, not owner-confirmed —
// the dispatch names "Forecast Reports" or "Forecasting Center" as candidates and asks that the
// final choice be confirmed with the owner rather than picked unilaterally. Flagging this
// clearly rather than presenting it as decided; see memory/dispatch-106.md's Resolution section.
//
// Merges ForecastAccuracyPanel (src/views/analytics.js) and LifeLenzBridgePanel ("MBI vs
// LifeLenz Accuracy", src/features/lifelenz.js — renamed + given a real date-range control by
// dispatch #105) into ONE parent panel with an internal tab switcher between the two, per the
// dispatch's explicit instruction NOT to invent a new registry-level parent/child panel
// concept (panel-registry.js has none today) and to instead follow this app's own established
// "one panel, internal tabs" pattern — eom-dashboard.js's Scoreboard/EOM Count/Count Cycle
// segmented control, security-panel.js's domain tabs.
//
// THIS FILE IS A THIN SHELL, NOT A REWRITE. Both tabs reuse the real, existing panel
// components as-is — their computations, state, and rendering are completely untouched here;
// nothing is duplicated into this file. The only change made to either component (in their own
// files) is one new OPTIONAL `headerTabs` prop, additive and undefined-safe, that lets this
// shell place its report switcher inside each panel's own existing header row instead of
// layering a second header on top of their own position:fixed full-screen chrome — see the
// `headerTabs` doc comments on ForecastAccuracyPanel and LifeLenzBridgePanel themselves.
//
// Both tabs stay MOUNTED simultaneously (toggled via CSS display, not conditional mount/unmount)
// so a completed Forecast Accuracy backtest or a live MBI vs LifeLenz Accuracy scan survives
// switching tabs and back — re-running either is not free (a real backtest / a live scan over
// ds), so losing results on a tab switch would be a real regression, not a cosmetic one.
import * as React from 'react';
import { ForecastAccuracyPanel } from '../views/analytics.js';
import { LifeLenzBridgePanel } from './lifelenz.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);

// The two report tabs — ids match the two RETIRED standalone panel-registry.js entries
// (fcst-accuracy, lifelenz-bridge) they replace, purely for readability; this panel owns its
// own local `tab` state, not the registry/routing layer (see panel-registry.js's comment on
// the new 'forecast-reports' entry for how routing was collapsed from two ids to one).
const REPORT_TABS = [
  { id: 'fcst-accuracy', label: '🎯 Forecast Accuracy' },
  { id: 'lifelenz-bridge', label: '🌉 MBI vs LifeLenz Accuracy' },
];

export function ForecastReportsPanel({ stores, ds, settings, userEvents, onClose, initialTab }) {
  // initialTab (dispatch #106 Phase B) — same pattern as App.js's SchedulingHubPanel: which
  // tab to land on when arriving via a specific hub-tab entry (panel-registry.js's
  // 'fcst-accuracy'/'lifelenz-bridge', which now select a tab + route here instead of opening
  // their own standalone panel). Seeds initial state only — switching tabs afterward is fully
  // owned by this panel's own `tab` state below, matching SchedulingHubPanel's own behavior.
  const validTab = REPORT_TABS.some(t => t.id === initialTab) ? initialTab : 'fcst-accuracy';
  const [tab, setTab] = React.useState(validTab);

  // Segmented control — same visual pattern as eom-dashboard.js's mode tabsSlot (gold =
  // active, var(--surf3) = inactive). Rendered via each child's own headerTabs slot, so only
  // ONE instance is ever visible at a time (whichever tab is currently shown) — not duplicated
  // on screen even though both children stay mounted underneath.
  const tabsNode = div({ style: { display: 'flex', border: '.5px solid var(--bdr2)', borderRadius: 'var(--r)', overflow: 'hidden', flexShrink: 0 } },
    REPORT_TABS.map(t => btn({
      key: t.id, onClick: () => setTab(t.id),
      style: {
        background: tab === t.id ? '#f5bc00' : 'var(--surf3)', color: tab === t.id ? '#0f1117' : 'var(--text2)',
        border: 'none', padding: '5px 10px', fontSize: '9px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
      },
    }, t.label)));

  return div(null,
    div({ style: { display: tab === 'fcst-accuracy' ? 'block' : 'none' } },
      h(ForecastAccuracyPanel, { stores, ds, settings, userEvents, onClose, headerTabs: tabsNode })),
    div({ style: { display: tab === 'lifelenz-bridge' ? 'block' : 'none' } },
      h(LifeLenzBridgePanel, { stores, ds, settings, userEvents, onClose, headerTabs: tabsNode })),
  );
}

export default ForecastReportsPanel;
