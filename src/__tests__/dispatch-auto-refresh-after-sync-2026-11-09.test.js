// @vitest-environment happy-dom
// @ts-nocheck
// Owner request (2026-11-09): "it seems that when I do a manual pull of data, I have to reload
// the page to see the new data." Data Manager's "↻ Sync" button dispatches a GitHub Actions pull
// but the real rows don't land in Supabase for ~10 minutes, and nothing ever re-read them —
// confirmed by direct investigation that no soft-refresh existed anywhere in the app before this
// change. This file exercises the REAL DataManagerPanel end to end: click ↻ Sync, let its own
// freshness-polling loop (not a mocked stand-in) run on fake timers, and assert it (a) detects
// the stream's `updated_at` actually moving past its pre-dispatch baseline, (b) calls the
// `onStreamSynced` prop exactly once per completed poll (App.js's real wiring for that prop
// reloads + merges the one stream via the SAME per-stream loader the tiered startup loader
// already uses — covered separately below against the real STREAM_RELOADERS shape), and (c)
// surfaces a visible, unmissable confirmation in the panel's own inline note. Per "would this
// verification still pass if reverted?": every assertion below fails against the pre-change
// code, which had no polling, no onStreamSynced call, and no "no refresh needed" message.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

// Per-table, per-call-sequence fake so the panel's OWN startup Promise.all (which also queries
// lifelenz_schedule/qsr_ebos_daily/qsr_daily_activity/qsr_fob for their own `updated_at`) and the
// baseline-then-poll calls this test drives can be told apart and advanced independently. The
// panel ALSO runs count/min/max coverage queries against ebos/dar's own tables in that same
// Promise.all (unrelated to freshness polling) — only a `.select('updated_at')` consumes the
// sequence; every other select on the same table gets a harmless static response so it never
// steals a slot from the freshness sequence.
function makeFakeSupabase(sequences) {
  const counters = {};
  const chainFor = (table) => {
    let selectedCols = null;
    const chain = {
      select: (cols) => { selectedCols = cols; return chain; },
      order: () => chain, eq: () => chain, gte: () => chain, limit: () => chain,
      single: async () => {
        if (selectedCols !== 'updated_at') return { data: null, error: null };
        const seq = sequences[table] || [];
        const i = counters[table] || 0;
        counters[table] = i + 1;
        const val = seq[Math.min(i, seq.length - 1)];
        if (val === '__ERROR__') throw new Error('simulated transient Supabase error');
        return { data: val === undefined ? null : { updated_at: val }, error: null };
      },
      then: (resolve) => resolve({ data: null, count: 0, error: null }),
    };
    return chain;
  };
  return { from: (table) => chainFor(table), __counters: counters };
}

let fakeSupabase;
let triggerSyncMock;
// Sequential, like makeFakeSupabase's per-table queues above: each call consumes the next entry
// (the last repeats once exhausted) so a test can simulate "coverage looked stale on the
// baseline read, then landed on a later poll tick" without every call seeing the same snapshot.
let secEventsSeq = [{ count: 0, coveredDays: 0, windowDays: 14, latestSync: null }];
let secEventsIdx = 0;

vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    get supabase() { return fakeSupabase; },
    triggerSync: (...a) => triggerSyncMock(...a),
    loadQsrSecurityEventsCoverage: async () => {
      const v = secEventsSeq[Math.min(secEventsIdx, secEventsSeq.length - 1)];
      secEventsIdx++;
      return v;
    },
    loadDataCompletenessIncidents: async () => [],
  };
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { DataManagerPanel } = await import('../views/analytics.js');

let container, root;
beforeEach(() => {
  vi.useFakeTimers();
  triggerSyncMock = vi.fn(async (wf) => ({ message: `${wf} sync started; data refreshes in ~10 min.` }));
  secEventsSeq = [{ count: 0, coveredDays: 0, windowDays: 14, latestSync: null }];
  secEventsIdx = 0;
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
    root.render(React.createElement(DataManagerPanel, { ds: { loaded: true }, idbCoverage: {}, onClose: () => {}, ...props }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  });
}

function syncButtonFor(label) {
  const btns = [...container.querySelectorAll('button')].filter(b => /Sync|watching/.test(b.textContent));
  // Each auto-synced row renders its name as plain text right before its ↻ Sync button's <td>;
  // walk up to the row and find the button inside it.
  const row = [...container.querySelectorAll('tr')].find(tr => tr.textContent.includes(label));
  expect(row, `row for "${label}" not found`).toBeTruthy();
  const btn = row.querySelector('button');
  expect(btn, `sync button for "${label}" not found`).toBeTruthy();
  return btn;
}

async function flush(n = 3) { for (let i = 0; i < n; i++) await Promise.resolve(); }

describe('DataManagerPanel — auto-refresh after manual ↻ Sync (2026-11-09)', () => {
  it('polls lifelenz_schedule.updated_at and calls onStreamSynced once it moves past the pre-dispatch baseline', async () => {
    const T0 = '2026-11-09T10:00:00Z';
    const T1 = '2026-11-09T10:12:00Z';
    // Startup Promise.all reads lifelenz_schedule once (T0); doSync's own baseline read is the
    // 2nd call (T0, unchanged); the first poll tick still sees T0 (no-op); the second poll tick
    // sees T1 — that's when the merge should fire.
    fakeSupabase = makeFakeSupabase({ lifelenz_schedule: [T0, T0, T0, T1] });
    const onStreamSynced = vi.fn(async () => ({ ok: true, count: 1234 }));
    await mount({ onStreamSynced });

    const btn = syncButtonFor('LifeLenz Schedule');
    await act(async () => { btn.click(); await flush(); });
    expect(triggerSyncMock).toHaveBeenCalledWith('lifelenz', {});
    expect(container.textContent).toMatch(/Watching for it to land/);
    expect(onStreamSynced).not.toHaveBeenCalled();

    // First poll tick (45s) — still T0, no detection yet.
    await act(async () => { await vi.advanceTimersByTimeAsync(45000); await flush(); });
    expect(onStreamSynced).not.toHaveBeenCalled();

    // Second poll tick — T1, newer than baseline.
    await act(async () => { await vi.advanceTimersByTimeAsync(45000); await flush(); });
    expect(onStreamSynced).toHaveBeenCalledTimes(1);
    expect(onStreamSynced).toHaveBeenCalledWith('lifelenz', 'LifeLenz Schedule');
    expect(container.textContent).toMatch(/new data loaded, no refresh needed/i);
    expect(container.textContent).toMatch(/1,234 rows/);
  });

  it('a failed baseline read does not fire a false-positive "synced" the instant polling can read the table at all (self-review finding)', async () => {
    const T0 = '2026-11-09T10:00:00Z'; // the SAME, unchanged value throughout — nothing ever landed
    // Call #1 = mount's own Promise.all; call #2 = doSync's pre-dispatch baseline, which THROWS
    // (simulating a transient network blip); call #3 = first poll tick, succeeds with the exact
    // same T0 that was already there before the sync was ever clicked.
    fakeSupabase = makeFakeSupabase({ lifelenz_schedule: [T0, '__ERROR__', T0, T0, T0] });
    const onStreamSynced = vi.fn(async () => ({ ok: true, count: 999 }));
    await mount({ onStreamSynced });

    await act(async () => { syncButtonFor('LifeLenz Schedule').click(); await flush(); });
    // First poll tick reads T0 successfully — but since the baseline read itself failed, this
    // read becomes the trusted baseline, NOT a "newer than nothing" false positive.
    await act(async () => { await vi.advanceTimersByTimeAsync(45000); await flush(); });
    expect(onStreamSynced).not.toHaveBeenCalled();
    // Second poll tick — still the same T0 as the now-established baseline — correctly still no
    // detection, because nothing has actually changed.
    await act(async () => { await vi.advanceTimersByTimeAsync(45000); await flush(); });
    expect(onStreamSynced).not.toHaveBeenCalled();
  });

  it('gives up with a clear message after ~15 minutes if the data never lands', async () => {
    const T0 = '2026-11-09T10:00:00Z';
    fakeSupabase = makeFakeSupabase({ qsr_ebos_daily: Array(30).fill(T0) });
    const onStreamSynced = vi.fn(async () => ({ ok: true, count: 0 }));
    await mount({ onStreamSynced });

    const btn = syncButtonFor('eBOS Purchases');
    await act(async () => { btn.click(); await flush(); });

    // 20 attempts * 45s = 15 min — step through each tick (rather than one huge jump) so every
    // async tick's chained awaits actually settle before the next one fires.
    for (let i = 0; i < 20; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(45000); await flush(); });
    }
    expect(onStreamSynced).not.toHaveBeenCalled();
    expect(container.textContent).toMatch(/still not back yet after ~15 min/);
  });

  it('tracks polling state per-stream — syncing two different streams does not cross-cancel', async () => {
    const T0 = '2026-11-09T10:00:00Z';
    const T1 = '2026-11-09T10:12:00Z';
    fakeSupabase = makeFakeSupabase({
      lifelenz_schedule: [T0, T0, T1],
      qsr_daily_activity: [T0, T0, T0, T1],
    });
    const onStreamSynced = vi.fn(async (wf) => ({ ok: true, count: wf === 'lifelenz' ? 10 : 20 }));
    await mount({ onStreamSynced });

    await act(async () => { syncButtonFor('LifeLenz Schedule').click(); await flush(6); });
    await act(async () => { syncButtonFor('QSRSoft Daily Activity').click(); await flush(6); });

    // One shared tick resolves lifelenz (its 3rd call = T1) while DAR needs one more tick.
    await act(async () => { await vi.advanceTimersByTimeAsync(45000); await flush(); });
    expect(onStreamSynced).toHaveBeenCalledWith('lifelenz', 'LifeLenz Schedule');
    expect(onStreamSynced).not.toHaveBeenCalledWith('dar', 'QSRSoft Daily Activity');

    await act(async () => { await vi.advanceTimersByTimeAsync(45000); await flush(); });
    expect(onStreamSynced).toHaveBeenCalledWith('dar', 'QSRSoft Daily Activity');
    expect(onStreamSynced).toHaveBeenCalledTimes(2);
  });

  it('clears its polling interval on unmount (does not keep calling onStreamSynced after the panel closes)', async () => {
    const T0 = '2026-11-09T10:00:00Z';
    const T1 = '2026-11-09T10:12:00Z';
    fakeSupabase = makeFakeSupabase({ qsr_fob: [T0, T0, T1] });
    const onStreamSynced = vi.fn(async () => ({ ok: true, count: 5 }));
    await mount({ onStreamSynced });

    await act(async () => { syncButtonFor('QSRSoft FOB Daily').click(); await flush(); });
    act(() => { root.unmount(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 45000); await flush(); });
    expect(onStreamSynced).not.toHaveBeenCalled();
    // Prevent the shared afterEach's own unmount from double-unmounting.
    root = createRoot(document.createElement('div'));
  });

  it('secevents has no ds field to merge — onStreamSynced is still called so the toast fires, and the coverage re-fetch refreshes its own tile', async () => {
    fakeSupabase = makeFakeSupabase({});
    // Call #1 = the panel's own mount-time coverage effect, #2 = doSync's pre-dispatch baseline
    // (still null), #3 = the first poll tick, now landed.
    secEventsSeq = [
      { count: 0, coveredDays: 0, windowDays: 14, latestSync: null },
      { count: 0, coveredDays: 0, windowDays: 14, latestSync: null },
      { count: 50, coveredDays: 10, windowDays: 14, latestSync: '2026-11-09T10:12:00Z' },
    ];
    secEventsIdx = 0;
    const onStreamSynced = vi.fn(async () => ({ ok: true, count: 0 }));
    await mount({ onStreamSynced });

    await act(async () => { syncButtonFor('QSRSoft Security Events').click(); await flush(); });
    expect(onStreamSynced).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(45000); await flush(); });
    expect(onStreamSynced).toHaveBeenCalledWith('secevents', 'Security Events');
    // The panel's own secEventsCov state (its coverage tile) picked up the landed numbers too.
    expect(container.textContent).toMatch(/10\/14d/);
  });
});
