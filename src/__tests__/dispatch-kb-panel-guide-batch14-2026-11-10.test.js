// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion), batch 14 — 2026-11-10.
//
// Re-measured the real gap before picking this batch: grepped `articleKey:\s*'...'` across
// src/app/App.js, src/views/*.js, src/features/*.js and cross-checked against the real
// KB_ARTICLES keys named in memory/finding-kb-panel-guide-2026-11-03.md's own "next batch
// candidates" tail -- all 16 were still genuinely unwired (0 matches each). Wired 3 of them,
// each matched by reading its real mount point:
//
// - store_kb_guide -> StoreKBEditor's own header (src/views/labor-tools.js). Its real on-screen
//   title is "Restaurant Profiles", not "Store KB" (the panel-registry label/modal id) -- noted,
//   not changed, since nothing makes that wrong, just a different display name (same class as
//   the Events/Market-Intelligence precedent batch9 recorded).
// - revenue_intelligence -> RevenueIntelligence's ModalShell (src/views/store-analytics.js).
// - lifelenz_bridge -> LifeLenzBridgePanel's real-content ModalShell (src/features/lifelenz.js,
//   the ds.loaded branch -- the earlier "still loading" branch's own ModalShell was left alone).
//
// A real pitfall caught before committing any of this: ModalShell passes `title` straight into
// ScreenshotShareButton's slugify(title) and the native Web Share API's title, both of which
// expect a plain string -- a React node there degrades the screenshot filename and could throw
// at the share-sheet boundary. All three wirings here put the InfoIcon in `subtitle` (or, for
// StoreKBEditor's hand-rolled header, a div that isn't fed to any string-consuming helper),
// never in a ModalShell `title`, matching the established store_one_pager_guide precedent.
//
// file_import_guide was investigated and deliberately left unwired this batch: it's an "App
// Guide"-category conceptual article (every upload file type, naming, load order) with no
// single panel of its own -- "Load files" just click()s a bare <input type="file">, no header to
// attach an InfoIcon to. Same shape as locked_projections/smart_targets, which also don't carry
// a dedicated InfoIcon -- reachable via the Knowledge Base panel's own full-article browse/search
// instead, which is the correct channel for this category, not a gap.
//
// Each wiring gets a real render-level test per CLAUDE.md's "would this verification still pass
// if reverted?" rule -- mounts the ACTUAL component, clicks the real "?" InfoIcon control, and
// asserts the real article title appears. Reverting any one wiring (removing its InfoIcon call)
// makes that component's "?" control vanish and its test fails.
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

describe('InfoIcon rollout batch 14 (2026-11-10)', () => {
  it('Store KB / Restaurant Profiles editor (store_kb_guide)', async () => {
    const { StoreKBEditor } = await import('../views/labor-tools.js');
    mountEl(h(StoreKBEditor, { onClose: () => {}, ds: { loaded: true } }));
    expect(container.textContent).toContain('Restaurant Profiles');
    clickInfoIcon();
    expect(container.textContent).toContain('Store KB — Per-Store Operational Context');
  });

  it('Revenue Intelligence Engine modal (revenue_intelligence)', async () => {
    const { RevenueIntelligence } = await import('../views/store-analytics.js');
    mountEl(h(RevenueIntelligence, {
      stores: [], ds: { loaded: true }, settings: {}, userEvents: {},
      onSelectStore: () => {}, onClose: () => {},
    }));
    clickInfoIcon();
    expect(container.textContent).toContain('Revenue Intelligence Engine');
  });

  it('MBI vs LifeLenz Accuracy bridge panel, real-content state (lifelenz_bridge)', async () => {
    const { LifeLenzBridgePanel } = await import('../features/lifelenz.js');
    mountEl(h(LifeLenzBridgePanel, {
      stores: [], ds: { loaded: true }, settings: {}, userEvents: {}, onClose: () => {},
    }));
    clickInfoIcon();
    expect(container.textContent).toContain('MBI vs LifeLenz Accuracy — WFM Comparison & Adjustment');
  });
});
