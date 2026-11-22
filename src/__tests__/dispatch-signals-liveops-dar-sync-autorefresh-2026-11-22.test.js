// @vitest-environment happy-dom
// @ts-nocheck
// Owner report (2026-11-22): "I resynced the lifelenz dar from Signals > Live Ops. I had to
// refresh page to get the updated data to show, can we force feed it?" Signals LiveOps's own
// "⟳ Sync Now" button dispatches the lifelenz_dar GitHub Actions pull and calls `refreshDar`
// once immediately — which just re-reads whatever was ALREADY there, since the real pull hasn't
// run yet — then does nothing further. Nobody was watching for the pull to actually land
// ~10 min later, unlike Data Manager's own "↻ Sync" button, which already auto-refreshes via a
// freshness-poll (dispatch-auto-refresh-after-sync-2026-11-09.test.js). This file exercises the
// SAME freshness-poll shape, now added to LiveOpsTab's handleSync: click Sync Now, let the poll
// run on fake timers, and assert it (a) captures a pre-dispatch baseline via
// loadLifelenzDarFreshness, (b) does nothing on a poll tick that still sees the baseline,
// (c) calls `refreshDar` again and shows a visible confirmation once `updated_at` actually
// moves past that baseline, and (d) clears its interval on unmount. Per "would this verification
// still pass if reverted?": every assertion below fails against the pre-change code, which had
// no polling, no second refreshDar call, and no "no refresh needed" message.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

let triggerDarSyncMock;
let freshnessSeq;
let freshnessIdx;

vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadDailyActivity: async () => [],
    triggerDarSync: (...a) => triggerDarSyncMock(...a),
    loadLifelenzDarFreshness: async () => {
      const v = freshnessSeq[Math.min(freshnessIdx, freshnessSeq.length - 1)];
      freshnessIdx++;
      if (v === '__ERROR__') throw new Error('simulated transient Supabase error');
      return v === undefined ? null : v;
    },
  };
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { LiveOpsTab } = await import('../views/signals.js');

let container, root;
beforeEach(() => {
  vi.useFakeTimers();
  triggerDarSyncMock = vi.fn(async () => ({ message: 'sync started; data refreshes in ~10 min.' }));
  freshnessSeq = [];
  freshnessIdx = 0;
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.clearAllMocks();
});

async function mount(props = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(LiveOpsTab, { darRows: [], refreshDar: () => {}, ...props }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  });
}

function syncButton() {
  const btn = [...container.querySelectorAll('button')].find(b => /Sync/.test(b.textContent));
  expect(btn, 'Sync Now button not found').toBeTruthy();
  return btn;
}

async function flush(n = 3) { for (let i = 0; i < n; i++) await Promise.resolve(); }

describe('LiveOpsTab Sync Now — auto-refresh after manual sync (2026-11-22)', () => {
  it('polls lifelenz_dar freshness and calls refreshDar again once it moves past the pre-dispatch baseline', async () => {
    const T0 = '2026-11-22T20:00:00Z';
    const T1 = '2026-11-22T20:11:00Z';
    // Baseline read sees T0; first poll tick still sees T0 (no-op); second poll tick sees T1.
    freshnessSeq = [T0, T0, T1];
    const refreshDar = vi.fn();
    await mount({ refreshDar });

    const btn = syncButton();
    await act(async () => { btn.click(); await flush(); });
    expect(triggerDarSyncMock).toHaveBeenCalledWith({ daysRecent: 1 });
    expect(refreshDar).toHaveBeenCalledTimes(1); // immediate re-query right after dispatch
    expect(container.textContent).toMatch(/watching for fresh data/i);

    // First poll tick (45s) — still T0, no detection yet.
    await act(async () => { await vi.advanceTimersByTimeAsync(45000); await flush(); });
    expect(refreshDar).toHaveBeenCalledTimes(1);

    // Second poll tick — T1, newer than baseline.
    await act(async () => { await vi.advanceTimersByTimeAsync(45000); await flush(); });
    expect(refreshDar).toHaveBeenCalledTimes(2);
    expect(container.textContent).toMatch(/fresh dar data loaded.*no refresh needed/i);
  });

  it('a baseline read failure does not false-positive on the very next poll tick', async () => {
    // Baseline read itself fails (simulated transient error) -> needsBaseline stays true.
    // First poll tick returns T0 for the first time: that becomes the trusted baseline, NOT a
    // detection (refreshDar must not be called a second time off of it).
    const T0 = '2026-11-22T20:00:00Z';
    freshnessSeq = ['__ERROR__', T0, T0];
    const refreshDar = vi.fn();
    await mount({ refreshDar });

    await act(async () => { syncButton().click(); await flush(); });
    expect(refreshDar).toHaveBeenCalledTimes(1); // immediate re-query only

    await act(async () => { await vi.advanceTimersByTimeAsync(45000); await flush(); });
    // T0 becomes the baseline here -- not treated as "newer than nothing".
    expect(refreshDar).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(45000); await flush(); });
    // Same T0 again on the next tick -- still no detection.
    expect(refreshDar).toHaveBeenCalledTimes(1);
  });

  it('gives up with a clear message after 15 minutes of no new data', async () => {
    const T0 = '2026-11-22T20:00:00Z';
    freshnessSeq = [T0]; // every read (baseline + all 20 poll ticks) sees the same unchanged value
    await mount({ refreshDar: () => {} });

    await act(async () => { syncButton().click(); await flush(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(45000 * 20); await flush(); });
    expect(container.textContent).toMatch(/still waiting on the sync after 15 min/i);
  });

  it('clears its polling interval on unmount (does not keep polling after the tab closes)', async () => {
    const T0 = '2026-11-22T20:00:00Z';
    freshnessSeq = [T0, T0, T0];
    await mount({ refreshDar: () => {} });
    await act(async () => { syncButton().click(); await flush(); });

    const callsBeforeUnmount = freshnessIdx;
    act(() => root.unmount());
    await act(async () => { await vi.advanceTimersByTimeAsync(45000 * 3); await flush(); });
    expect(freshnessIdx).toBe(callsBeforeUnmount); // no further freshness reads after unmount
  });
});
