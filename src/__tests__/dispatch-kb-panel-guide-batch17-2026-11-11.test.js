// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion), batch 17 — 2026-11-11.
//
// Resolves 3 of the 5 candidates batch 16 deferred (re-measured `articleKey:\s*'<key>'` across
// src/ -- all 3 still 0 matches before this batch):
//
// - brief_guide -> App.js's `routePanel==='brief'` RoutePanelShell (the real "🔭 Forecast Brief"
//   sidebar panel, on-screen title "🧠 Intelligence Brief — <scope>"). RoutePanelShell has the
//   SAME title/subtitle-forwarding hazard as ModalShell (confirmed by reading
//   src/components/ModalShell.js's RoutePanelShell export, not assumed from the ModalShell
//   precedent alone) -- its `title` also feeds ScreenshotShareButton's slugify/native-share
//   title, so the InfoIcon goes in `subtitle`, same as every ModalShell wiring so far.
// - intelligence_brief -> `Brief` (src/views/store-dash.js, re-exported through store-analytics.js
//   as the Store Dashboard's "Intelligence Brief" tab), its own 'brief-hdr' div. The KB article's
//   own text covers BOTH this per-store findings list AND the brief_guide panel above under one
//   "Intelligence Brief" umbrella -- the two keys are deliberately separate articles for two
//   related but distinct real surfaces, not a duplicate; each now points at its own real one.
// - competitive_impact_guide -> `ShiftAnalysisTab` (src/views/store-analytics.js)'s "🏪
//   Competitive Intelligence" sub-section header, wired into BOTH its empty-state branch (no
//   competition events tagged) and its real-data branch, same "both branches" treatment
//   why_engine_guide/gm_letters got in earlier batches.
//
// brief_guide is verified by build + full suite only, no dedicated render test -- same
// precedent as proj/pvsa/di_calibration_panel/date_range_report_guide/security_panel_guide in
// earlier batches: its wiring lives at the App.js routing gate, and meaningfully mounting it
// means mounting App.js's own routing JSX, not a standalone sub-component.
//
// The other 2 named candidates (fcst_accuracy_guide, count_cycle_guide) are still open --
// fcst_accuracy_guide needs the ForecastReportsPanel/ForecastAccuracyPanel hub read in the same
// depth lifelenz_bridge got; count_cycle_guide's real content has no dedicated per-tab header
// to anchor to inside its tabbed hub (confirmed in batch 16's entry). Left for a future batch.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const h = React.createElement;

let container, root;
afterEach(() => {
  if (root) act(() => root.unmount());
  if (container) container.remove();
  container = null; root = null;
});

function mountEl(el) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(el); });
}

function clickInfoIcon(near) {
  const icons = Array.from(container.querySelectorAll('span[title^="Click for details"]'));
  // InfoIcon wraps its own "?" span in an inline-flex div (src/engine/forecast.js), so the
  // header text actually sits a level or two further up than the icon's immediate parent.
  // With several InfoIcons on one page, pick whichever one's nearest matching ancestor is
  // closest (fewest hops) -- a distant shared ancestor eventually contains every section's
  // text, so the CLOSEST match, not just any match within a fixed hop count, disambiguates.
  const depthOf = (el) => {
    for (let node = el, hops = 0; node && hops < 6; node = node.parentElement, hops++) {
      if (node.textContent?.includes(near)) return hops;
    }
    return Infinity;
  };
  const icon = near
    ? icons.map(el => ({ el, d: depthOf(el) })).sort((a, b) => a.d - b.d)[0]?.el
    : icons[0];
  expect(icon, 'InfoIcon "?" control not found' + (near ? ` near "${near}"` : '')).toBeTruthy();
  act(() => { icon.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

describe('InfoIcon rollout batch 17 (2026-11-11)', () => {
  it('Intelligence Brief tab (intelligence_brief)', async () => {
    const { Brief } = await import('../views/store-dash.js');
    mountEl(h(Brief, { store: { name: 'Test Store', findings: [] }, rangeTotal: 0, rangeLY: 0 }));
    expect(container.textContent).toContain('Intelligence Brief — Test Store');
    clickInfoIcon();
    expect(container.textContent).toContain('Intelligence Brief — Per-Store Findings + AI Narrative');
  });

  it('Competitive Impact sub-section, empty-state branch (competitive_impact_guide)', async () => {
    const { ShiftAnalysisTab } = await import('../views/store-analytics.js');
    // The Competitive Intelligence section (both its empty-state and real-data branches) is
    // gated on `hasSalesData` -- derived from metricSeries('sales') over the trailing 6 weeks,
    // which needs at least one real row in ds.laborRows (metric-source.js's last-resort 'sales'
    // leg) for this store/date to come back non-empty. A day 3 days back sits comfortably
    // inside the default 6-week window regardless of exactly where lastClosedBusinessDay() lands.
    const d = new Date(); d.setDate(d.getDate() - 3);
    const dateStr = d.toISOString().slice(0, 10);
    mountEl(h(ShiftAnalysisTab, {
      store: { p: {}, t: {}, loc: '0001' },
      ds: { loaded: true, laborRows: [{ loc: '0001', date: dateStr, sales: 12000 }] },
      settings: {}, userEvents: {},
    }));
    expect(container.textContent).toContain('Competitive Intelligence');
    clickInfoIcon('Competitive Intelligence');
    expect(container.textContent).toContain('Competitive Impact');
  });
});
