// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion), batch 16 — 2026-11-11.
//
// Re-measured the remaining 8 named candidates from batch 15's list (`articleKey:\s*'<key>'`
// grep across src/) -- all still 0 matches. Wired 3 of them, each matched to its real mount
// point by reading the component:
//
// - store_compare_guide -> MultiStoreComparison (src/views/store-analytics.js)'s ModalShell.
//   On-screen title reads "📊 Multi-Store Comparison", not "Store Compare" -- same class of
//   display-name divergence earlier batches have noted and left alone.
// - forms_print_guide -> FormsPrintPanel (src/views/forms-print.js)'s ModalShell.
// - district_lens_guide -> DistrictLensPanel (src/views/analytics.js)'s hand-rolled modal header
//   (not ModalShell -- this one builds its own fixed overlay/header div, so the title/subtitle
//   string-forwarding hazard from the ModalShell-based wirings doesn't apply here; the InfoIcon
//   is appended directly to the title div, same pattern as shift_analysis_tab/why_engine_guide
//   in earlier batches).
//
// FormsPrintPanel fetches '/forms/index.json' on mount; confirmed by reading the component that
// both success and failure paths are caught and fall back to an empty index, and the
// ModalShell's title/subtitle render unconditionally regardless of that fetch's outcome -- no
// mock needed for this test to reach the real header.
//
// None of the remaining 5 named candidates (intelligence_brief, competitive_impact_guide,
// fcst_accuracy_guide, count_cycle_guide, brief_guide) were resolved to a single, unambiguous
// mount point in this pass -- count_cycle_guide's real content lives inside a tabbed hub
// (eom-dashboard.js) with no dedicated per-tab header text to anchor to, and the others need
// more investigation of their host components before wiring confidently. Left for a future batch
// rather than wired on a guess.
//
// Each wiring gets a real render-level test per CLAUDE.md's "would this verification still pass
// if reverted?" rule -- mounts the ACTUAL component, clicks the real "?" InfoIcon control, and
// asserts the real article title appears.
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

describe('InfoIcon rollout batch 16 (2026-11-11)', () => {
  it('Multi-Store Comparison modal (store_compare_guide)', async () => {
    const { MultiStoreComparison } = await import('../views/store-analytics.js');
    mountEl(h(MultiStoreComparison, {
      stores: [], ds: { loaded: true }, settings: {}, onSelectStore: () => {}, onClose: () => {},
    }));
    clickInfoIcon();
    expect(container.textContent).toContain('Store Compare — Panel Guide');
  });

  it('Printable Forms panel (forms_print_guide)', async () => {
    const { FormsPrintPanel } = await import('../views/forms-print.js');
    mountEl(h(FormsPrintPanel, { onClose: () => {} }));
    clickInfoIcon();
    expect(container.textContent).toContain('Printable Forms — Panel Guide');
  });

  it('District Lens panel (district_lens_guide)', async () => {
    const { DistrictLensPanel } = await import('../views/analytics.js');
    mountEl(h(DistrictLensPanel, { stores: [], ds: { loaded: true }, settings: {}, onClose: () => {} }));
    expect(container.textContent).toContain('District Lens — What Works Where');
    clickInfoIcon();
    expect(container.textContent).toContain('District Lens — Panel Guide');
  });
});
