// @vitest-environment happy-dom
// @ts-nocheck
// LeadershipCascadeBody (one-pager.js) calls saveOnePager() on Save, upserting on
// (level, scope_key, period) — but until this fix, nothing ever called loadOnePagers() back, so
// reopening the panel (or navigating away and back to the same week/scope) always showed a blank
// narrative textarea even for an already-saved week. Freezes "today" so the component's
// Wednesday-anchored work-week period is deterministic, and duplicates that same tiny date math
// here (not exported from the component) to build a saved row that matches the exact key the
// component computes on first render.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const FROZEN_NOW = new Date('2026-08-13T12:00:00'); // a Thursday
const WW_START = 3; // Wednesday, matching one-pager.js's own default
function weekStartOf(date, wsd = WW_START) {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  const diff = (d.getDay() - wsd + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}
const iso = d => d.toISOString().slice(0, 10);
const EXPECTED_PERIOD = `wk-${iso(weekStartOf(FROZEN_NOW))}`;
const SAVED_NARRATIVE = 'Down two on labor but OEPE is trending the right way — hold the line.';

let loadOnePagersMock;
vi.mock('../lib/supabase.js', () => ({
  loadQsrFob: async () => [],
  loadActionItems: async () => [],
  loadOnePagers: async (...args) => loadOnePagersMock(...args),
  saveOnePager: async () => ({}),
  saveActionItem: async () => ({}),
  updateActionItem: async () => ({}),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { OnePagerPanel } = await import('../views/one-pager.js');

const STORES = [{ loc: '3708' }, { loc: '3709' }];
// scope_key the component computes for the default "all stores" scope: 'locs:' + sorted unpadded locs.
const SCOPE_KEY = 'locs:' + STORES.map(s => s.loc).slice().sort().join(',');

function mountRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

describe('LeadershipCascadeBody loads a saved narrative back on open (was: always blank)', () => {
  let container, root;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
    ({ container, root } = mountRoot());
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    vi.useRealTimers();
  });

  it('prefills the narrative textarea when a saved one_pagers row matches (level, scope_key, period)', async () => {
    loadOnePagersMock = vi.fn(async () => [
      { level: 'org', scope_key: SCOPE_KEY, period: EXPECTED_PERIOD, narrative: SAVED_NARRATIVE },
      // A decoy for a different scope/period — proves the match is exact, not "just take row 0".
      { level: 'org', scope_key: 'locs:9999999', period: EXPECTED_PERIOD, narrative: 'wrong scope' },
    ]);
    await act(async () => {
      root.render(React.createElement(OnePagerPanel, { ds: {}, stores: STORES, settings: {}, onClose: () => {} }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
    const textarea = container.querySelector('textarea');
    expect(textarea, 'narrative textarea not found').toBeTruthy();
    expect(textarea.value).toBe(SAVED_NARRATIVE);
  });

  it('leaves the narrative blank when no saved row matches the current (level, scope_key, period)', async () => {
    loadOnePagersMock = vi.fn(async () => [
      { level: 'org', scope_key: SCOPE_KEY, period: 'wk-2020-01-01', narrative: 'a different, older week' },
    ]);
    await act(async () => {
      root.render(React.createElement(OnePagerPanel, { ds: {}, stores: STORES, settings: {}, onClose: () => {} }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
    const textarea = container.querySelector('textarea');
    expect(textarea.value).toBe('');
  });
});
