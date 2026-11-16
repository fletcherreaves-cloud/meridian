// @vitest-environment happy-dom
// @ts-nocheck
// Manual Pull Triggers card, DataManagerPanel's "overview" tab (owner request 2026-11-16).
// Per "would this verification still pass if reverted?" — this renders the real DataManagerPanel
// and asserts the card's content, not the computeManualPullTriggers() engine in isolation, so a
// revert of the panel's own wiring to it (import removed, useMemo deleted, section unrendered)
// fails here even though manual-pull-triggers.test.js's own tests would still pass unchanged.
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { DEFAULT_TARGETS } from '../constants.js';

function fakeSupabaseChain() {
  const chain = {
    select: () => chain, order: () => chain, eq: () => chain, gte: () => chain, limit: () => chain,
    single: async () => ({ data: null, error: null }),
    then: (resolve) => resolve({ data: null, count: 0, error: null }),
  };
  return chain;
}
const fakeSupabase = { from: () => fakeSupabaseChain() };
vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, supabase: fakeSupabase };
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { DataManagerPanel } = await import('../views/analytics.js');

const LOC = Object.keys(DEFAULT_TARGETS).find(l => DEFAULT_TARGETS[l].tCompWaste > 0);
const COMPW_TOL = 0.001; // compW's declared tol, engine/tolerance-status.js TOL_METRICS

let container, root;
afterEach(() => { act(() => root.unmount()); container.remove(); });

async function mount(ds) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(DataManagerPanel, { ds, idbCoverage: {}, onClose: () => {} }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  });
}

describe('DataManagerPanel -- Manual Pull Triggers card', () => {
  it('shows the card with the real flag count + report name when a FOB metric is out of tolerance', async () => {
    const t = DEFAULT_TARGETS[LOC];
    const ds = { loaded: true, fobRows: [{ loc: LOC, date: new Date(Date.now() - 5 * 86400000), compWaste: t.tCompWaste + COMPW_TOL * 3 }] };
    await mount(ds);
    expect(container.textContent).toContain('MANUAL PULL NEEDED');
    expect(container.textContent).toContain('eBOS Purchases');
  });

  it('renders no card at all when nothing is flagged', async () => {
    await mount({ loaded: true });
    expect(container.textContent).not.toContain('MANUAL PULL NEEDED');
  });
});
