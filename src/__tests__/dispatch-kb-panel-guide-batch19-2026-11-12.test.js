// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion), batch 19 — 2026-11-12.
//
// Re-measured all unwired real KB_ARTICLES keys (`articleKey:\s*'<key>'` grep across src/,
// excluding tests) against the current key list (121 top-level keys). Most of the 35 found
// unwired are the already-documented, deliberately-left-cross-referenced metric/engine-concept
// keys (oepe, tpph, labor_pct, forecast_formula, model_types, etc.) plus the two standing
// App-Guide exceptions (panel_index, file_import_guide, locked_projections). Four genuine,
// previously-unnoticed candidates surfaced -- real panel-level articles written in an earlier
// content batch (long before the InfoIcon-wiring phase started at batch 14) that never got an
// icon wired to them because the wiring passes worked off a different named-candidate list that
// didn't include them:
//
// - quick_capture_guide -> the ModalShell wrapping QuickCapturePanel in App.js (title:'‼ Log
//   Something'). QuickCapturePanel itself (src/views/quick-capture.js) has no header of its own
//   -- same "wiring lives at the App.js routing gate" situation as brief_guide/proj/pvsa in
//   earlier batches, so this one is build+full-suite verified only, no dedicated render test.
// - settings_guide -> Settings (src/views/management.js)'s own ModalShell (title:'⚙ Settings',
//   previously no subtitle at all).
// - troubleshooting_guide -> TroubleshootingPanel (src/views/troubleshooting.js)'s own
//   ModalShell -- converted its existing plain-string subtitle to a span+InfoIcon node, same
//   string-forwarding-hazard precedent as batch 15 (ModalShell forwards `title`, never
//   `subtitle`, into ScreenshotShareButton's slugify/native-share title).
// - calendar_manager_guide -> CalendarManagerPanel (src/features/calendar.js)'s own hand-rolled
//   header div ("📅 Calendar Manager" + subtitle text) -- not ModalShell, so the InfoIcon is
//   appended directly to the title div, same pattern as district_lens_guide/fcst_accuracy_guide.
//
// count_cycle_guide re-confirmed still genuinely unresolved (no dedicated per-tab header inside
// its tabbed hub to anchor to) -- unchanged across batches 16-18, not re-attempted here.
//
// Each of the 3 directly-wired candidates gets a real render-level test per CLAUDE.md's "would
// this verification still pass if reverted?" rule -- mounts the ACTUAL component, clicks the
// real "?" InfoIcon control, asserts the real article title appears.
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

describe('InfoIcon rollout batch 19 (2026-11-12)', () => {
  it('Settings modal (settings_guide)', async () => {
    const { Settings } = await import('../views/management.js');
    mountEl(h(Settings, {
      settings: {}, onUpdate: () => {}, onClose: () => {}, userRole: 'owner', accessibleLocs: null,
      onClearAll: () => {}, onOpenStoreNotes: () => {}, onOpenAdmin: null, onOpenRoleExplainer: () => {},
    }));
    clickInfoIcon();
    expect(container.textContent).toContain('Settings — Panel Guide');
  });

  it('Troubleshooting modal (troubleshooting_guide)', async () => {
    const { TroubleshootingPanel } = await import('../views/troubleshooting.js');
    mountEl(h(TroubleshootingPanel, { onClose: () => {} }));
    clickInfoIcon();
    expect(container.textContent).toContain('Troubleshooting — Panel Guide');
  });

  it('Calendar Manager panel (calendar_manager_guide)', async () => {
    const { CalendarManagerPanel } = await import('../features/calendar.js');
    mountEl(h(CalendarManagerPanel, {
      stores: [], ds: { loaded: true }, settings: {}, userEvents: {}, onUpdate: () => {}, onClose: () => {},
    }));
    expect(container.textContent).toContain('Calendar Manager');
    clickInfoIcon();
    expect(container.textContent).toContain('Calendar — Panel Guide');
  });
});
