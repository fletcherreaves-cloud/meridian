// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion), batch 18 — 2026-11-11.
//
// Resolves the last real candidate from batch 17's deferred list (re-measured
// `articleKey:\s*'fcst_accuracy_guide'` across src/ -- 0 matches before this batch):
//
// - fcst_accuracy_guide -> ForecastAccuracyPanel (src/views/analytics.js), hosted by
//   ForecastReportsPanel (src/features/forecast-reports.js)'s "🎯 Forecast Accuracy" tab --
//   same hub structure lifelenz_bridge (batch 14) was wired into, the other tab of the same
//   shell. ForecastAccuracyPanel builds its own hand-rolled title bar (not ModalShell/
//   RoutePanelShell), so the title/subtitle string-forwarding hazard doesn't apply here; the
//   InfoIcon is appended directly to the "🎯 Forecast Accuracy Report" title div, same pattern
//   as district_lens_guide (batch 16) and fcst_accuracy_guide's own sibling panel wirings.
//
// `count_cycle_guide` remains genuinely unresolved (no dedicated per-tab header inside its
// tabbed hub, confirmed across batches 16-17) -- this closes out the fcst/count_cycle pair from
// batch 17's note, one of two, not both.
//
// ForecastAccuracyPanel is independently exported from analytics.js (confirmed via its own
// export list), so it's mounted directly here rather than through the ForecastReportsPanel
// shell. Mount props mirror the existing dispatch-106-forecast-reports.test.js's own
// ForecastAccuracyPanel mount (ds:{loaded:true,laborRows:[]}, settings:{}) -- that file mocks
// forecast.js (including InfoIcon: () => null) since it's testing backtest behavior, not KB
// wiring; this test deliberately does NOT mock forecast.js, so the real InfoIcon renders.
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

function clickInfoIcon() {
  const icon = container.querySelector('span[title^="Click for details"]');
  expect(icon, 'InfoIcon "?" control not found').toBeTruthy();
  act(() => { icon.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

describe('InfoIcon rollout batch 18 (2026-11-11)', () => {
  it('Forecast Accuracy Report panel (fcst_accuracy_guide)', async () => {
    const { ForecastAccuracyPanel } = await import('../views/analytics.js');
    mountEl(h(ForecastAccuracyPanel, {
      stores: [], ds: { loaded: true, laborRows: [] }, settings: {}, userEvents: {}, onClose: () => {},
    }));
    expect(container.textContent).toContain('Forecast Accuracy Report');
    clickInfoIcon();
    expect(container.textContent).toContain('Forecast Accuracy — Panel Guide');
  });
});
