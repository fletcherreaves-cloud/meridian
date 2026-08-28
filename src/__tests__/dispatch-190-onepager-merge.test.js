// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #190 — merges the "Leadership One-Pager" (registry id leader-one-pager,
// src/views/one-pager.js's OnePagerPanel) into "Above-Store One-Pager" (registry id
// above-store, src/views/above-store-onepager.js's AboveStoreOnePager) behind a Rollup/
// Leadership `view` scope selector — the owner's 2026-08-10 "three one-pagers -> two" decision
// (memory/decisions-panel-inventory-2026-08-10.md). Renders the REAL AboveStoreOnePager
// component (this project's "verification must touch the call site" standing rule), same
// pattern as dispatch-158-onepager-custom-range.test.js.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { isRoutePanelId, parseRoute } from '../app/routing.js';
import { PANEL_BY_ID } from '../app/panel-registry.js';

// LeadershipCascadeBody's useEffects call loadQsrFob/loadActionItems -- mocked the same way
// dispatch-160-onepager-panel.test.js mocks them for the standalone OnePagerPanel, so the
// EMBEDDED body (inside AboveStoreOnePager's Leadership scope) resolves past "Loading…" too.
vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadQsrFob: async () => [],
    loadActionItems: async () => [],
    saveOnePager: async () => ({}),
    saveActionItem: async () => ({}),
    updateActionItem: async () => ({}),
  };
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { AboveStoreOnePager } = await import('../views/above-store-onepager.js');

function mountRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

async function renderPanel(root, extraProps) {
  await act(async () => {
    root.render(React.createElement(AboveStoreOnePager, {
      ds: {}, settings: {}, userEvents: {}, eventImpact: {}, onClose: () => {}, ...extraProps,
    }));
    // Flush the mocked loadQsrFob/loadActionItems microtasks (only relevant once Leadership
    // scope mounts LeadershipCascadeBody, but harmless to always flush).
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  });
}

describe('dispatch #190 item 1 — registry: leader-one-pager retired, above-store survives', () => {
  it('leader-one-pager is no longer a registered panel', () => {
    expect(PANEL_BY_ID['leader-one-pager']).toBeUndefined();
  });

  it('above-store is still registered, route:true, unchanged label', () => {
    const p = PANEL_BY_ID['above-store'];
    expect(p).toBeTruthy();
    expect(p.route).toBe(true);
    expect(p.label).toBe('Above-Store One-Pager');
  });
});

describe('dispatch #190 item 4 — old ?panel=leader-one-pager deep link redirects sensibly', () => {
  it('isRoutePanelId is false for the retired id directly (fails safe like any unknown id)', () => {
    expect(isRoutePanelId('leader-one-pager')).toBe(false);
  });

  it('parseRoute resolves ?panel=leader-one-pager to above-store, not null', () => {
    expect(parseRoute('?panel=leader-one-pager')).toBe('above-store');
  });

  it('a genuinely unknown id still fails safe to null (the redirect is specific, not a catch-all)', () => {
    expect(parseRoute('?panel=not-a-real-panel')).toBeNull();
  });
});

describe('dispatch #190 items 2-3 — the merged panel\'s scope selector (Rollup vs Leadership Cascade)', () => {
  let container, root;
  beforeEach(() => { ({ container, root } = mountRoot()); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('defaults to Rollup: shows the Above-Store title, LocationSelector, and panel toggles — no cascade select', async () => {
    await renderPanel(root);
    expect(container.textContent).toMatch(/Above-Store One-Pager/);
    const buttons = [...container.querySelectorAll('button')].map(b => b.textContent);
    expect(buttons).toContain('📄 Rollup');
    expect(buttons).toContain('📋 Leadership');
    // AboveStoreOnePager's own pre-existing LocationSelector (dispatch #160 item 3's conversion).
    expect(buttons).toContain('All Locations');
    // Leadership-only controls are absent by default.
    expect(container.querySelector('select[title="Cascade level"]')).toBeFalsy();
    expect(buttons).not.toContain('Org');
  });

  it('clicking the Leadership pill switches to the harvested cascade body: cascade select, Save, Reports, and its own hand-rolled Org/OK/FL scope', async () => {
    await renderPanel(root);
    const leadershipPill = [...container.querySelectorAll('button')].find(b => b.textContent === '📋 Leadership');
    expect(leadershipPill, 'Leadership scope pill not found').toBeTruthy();
    await act(async () => { leadershipPill.click(); await Promise.resolve(); await Promise.resolve(); });

    expect(container.textContent).toMatch(/Leadership One-Pager/);
    expect(container.querySelector('select[title="Cascade level"]'), 'Cascade level select not found').toBeTruthy();
    const buttons = [...container.querySelectorAll('button')].map(b => b.textContent);
    expect(buttons.some(t => t.includes('Save'))).toBe(true);
    expect(buttons.some(t => t.includes('Reports'))).toBe(true);
    // LeadershipCascadeBody's own scope UI (deliberately NOT LocationSelector — dispatch #160
    // item 3) rides along unchanged: Org/OK/FL presets.
    expect(buttons).toContain('Org');
    expect(buttons).toContain('OK');
    expect(buttons).toContain('FL');
    // Only ONE header/back-button chrome exists — no doubled RoutePanelShell.
    expect(container.querySelectorAll('button[aria-label="Back"]').length).toBe(1);
  });

  it('clicking back to Rollup restores the original Above-Store content', async () => {
    await renderPanel(root);
    const leadershipPill = [...container.querySelectorAll('button')].find(b => b.textContent === '📋 Leadership');
    await act(async () => { leadershipPill.click(); await Promise.resolve(); });
    const rollupPill = [...container.querySelectorAll('button')].find(b => b.textContent === '📄 Rollup');
    await act(async () => { rollupPill.click(); });
    expect(container.textContent).toMatch(/Above-Store One-Pager/);
    expect(container.querySelector('select[title="Cascade level"]')).toBeFalsy();
  });

  it('initialView:"leadership" opens the merged panel directly into the harvested cascade scope (the redirected deep-link case)', async () => {
    await renderPanel(root, { initialView: 'leadership' });
    expect(container.textContent).toMatch(/Leadership One-Pager/);
    expect(container.querySelector('select[title="Cascade level"]')).toBeTruthy();
  });
});
