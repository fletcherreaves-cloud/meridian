// @ts-nocheck
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

// recordFireVolume/hydrateFireVolume go through blob-sync's pushBlob/hydrateBlob, which call
// saveUserSetting/loadUserSetting (real network calls) — mocked here, same pattern as
// blob-sync.test.js, so this can run without a live Supabase connection.
vi.mock('../lib/supabase.js', () => ({
  saveUserSetting: vi.fn(() => Promise.resolve()),
  loadUserSetting: vi.fn(() => Promise.resolve(null)),
}));

import { loadUserSetting } from '../lib/supabase.js';
import {
  snapshotFireVolume, recordFireVolume, hydrateFireVolume, summarizeFireVolume,
  FIRE_VOLUME_LS_KEY,
} from '../engine/insight-ledger-measure.js';

function installLS() {
  const store = {};
  globalThis.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => { for (const k in store) delete store[k]; },
  };
}

describe('snapshotFireVolume', () => {
  it('counts total + per-detector from the SAME per-detector shape buildAttentionFeed builds', () => {
    const bySource = {
      staleData: [{ id: 'stale', title: 'Sales data is 20 days old', severity: 'crit' }],
      fobOutliers: [{ id: 'fob-a', title: 'a — FOB hot', severity: 'warn', loc: 'a' }],
      salesBehindLY: [],
    };
    const snap = snapshotFireVolume(bySource, 15);
    expect(snap.totalItems).toBe(2);
    expect(snap.byDetector).toEqual({ staleData: 1, fobOutliers: 1, salesBehindLY: 0 });
    expect(snap.capped).toBe(false);
    expect(snap.keys['stale']).toEqual({ detector: 'staleData', title: 'Sales data is 20 days old', severity: 'crit', loc: null });
    expect(snap.keys['fob-a'].loc).toBe('a');
  });

  it('flags capped when total exceeds max — so a truncated run is never silently under-reported', () => {
    const bySource = { fobOutliers: Array.from({ length: 20 }, (_, i) => ({ id: 'fob-' + i, severity: 'warn' })) };
    const snap = snapshotFireVolume(bySource, 15);
    expect(snap.totalItems).toBe(20);
    expect(snap.capped).toBe(true);
  });

  it('skips items with no id rather than crashing (defensive — every real detector item has one)', () => {
    const snap = snapshotFireVolume({ x: [null, { title: 'no id' }, { id: 'ok' }] }, 15);
    expect(Object.keys(snap.keys)).toEqual(['ok']);
  });
});

describe('recordFireVolume', () => {
  beforeEach(() => { installLS(); vi.clearAllMocks(); });
  afterAll(() => { try { delete globalThis.localStorage; } catch {} });

  it('writes a day-bucketed snapshot to localStorage, one bucket per calendar day', () => {
    recordFireVolume({ staleData: [{ id: 'stale', severity: 'crit' }] }, 15);
    const blob = JSON.parse(localStorage.getItem(FIRE_VOLUME_LS_KEY));
    const days = Object.keys(blob.days);
    expect(days).toHaveLength(1);
    expect(blob.days[days[0]].totalItems).toBe(1);
  });

  it('repeated calls the same day OVERWRITE that day\'s bucket, not append — the whole point ' +
     'of aggregating per (day, detector, key) instead of one row per page load', () => {
    recordFireVolume({ staleData: [{ id: 'stale', severity: 'crit' }] }, 15);
    recordFireVolume({ staleData: [{ id: 'stale', severity: 'crit' }], fobOutliers: [{ id: 'fob-a', severity: 'warn' }] }, 15);
    const blob = JSON.parse(localStorage.getItem(FIRE_VOLUME_LS_KEY));
    const days = Object.keys(blob.days);
    expect(days).toHaveLength(1);              // still one bucket for today
    expect(blob.days[days[0]].totalItems).toBe(2);  // latest snapshot won, not summed across calls
  });

  it('never throws even if localStorage is unavailable (scaffolding must not break the panel)', () => {
    delete globalThis.localStorage;
    expect(() => recordFireVolume({ staleData: [{ id: 'stale', severity: 'crit' }] }, 15)).not.toThrow();
    installLS();
  });
});

describe('hydrateFireVolume', () => {
  beforeEach(() => { installLS(); vi.clearAllMocks(); });
  afterAll(() => { try { delete globalThis.localStorage; } catch {} });

  it('unions local + cloud day buckets rather than letting a fresher cloud blob drop a local-only day', async () => {
    localStorage.setItem(FIRE_VOLUME_LS_KEY, JSON.stringify({ days: { '2026-08-09': { totalItems: 3, byDetector: {}, keys: {} } }, savedAt: 100 }));
    loadUserSetting.mockResolvedValueOnce({ days: { '2026-08-10': { totalItems: 5, byDetector: {}, keys: {} } }, savedAt: 200 });
    const results = [];
    hydrateFireVolume(merged => results.push(merged));
    await new Promise(r => setTimeout(r, 0));
    expect(results.length).toBeGreaterThan(0);
    const last = results[results.length - 1];
    expect(Object.keys(last.days).sort()).toEqual(['2026-08-09', '2026-08-10']);
  });
});

describe('summarizeFireVolume — the actual answer the issue asks for', () => {
  it('computes the collapse ratio (total fires / distinct situation keys) — the headline number', () => {
    // Same store's stale-data warning fires 5 days running (one key, 5 daily buckets) alongside
    // a one-off FOB flag that fires once. This is exactly the "does it collapse hard" question.
    const days = {};
    for (let d = 1; d <= 5; d++) {
      days[`2026-08-0${d}`] = {
        totalItems: 1, byDetector: { staleData: 1 },
        keys: { stale: { detector: 'staleData', title: 'stale', severity: 'crit' } },
      };
    }
    days['2026-08-05'].totalItems = 2;
    days['2026-08-05'].byDetector.fobOutliers = 1;
    days['2026-08-05'].keys['fob-a'] = { detector: 'fobOutliers', title: 'fob', severity: 'warn', loc: 'a' };

    const s = summarizeFireVolume({ days });
    expect(s.daysMeasured).toBe(5);
    expect(s.totalFires).toBe(6);       // 5 stale-data days + 1 fob day
    expect(s.distinctKeys).toBe(2);     // 'stale' and 'fob-a'
    expect(s.collapseRatio).toBe(3);    // 6/2 — the situation key IS collapsing the repeats
    expect(s.byDetectorTotal).toEqual({ staleData: 5, fobOutliers: 1 });
  });

  it('tracks first-seen/last-seen per key so a future ledger design knows how long a situation stays live', () => {
    const days = {
      '2026-08-01': { totalItems: 1, byDetector: { staleData: 1 }, keys: { stale: { detector: 'staleData', title: 'stale' } } },
      '2026-08-03': { totalItems: 1, byDetector: { staleData: 1 }, keys: { stale: { detector: 'staleData', title: 'stale' } } },
    };
    const s = summarizeFireVolume({ days });
    expect(s.keyInfo.stale.firstSeen).toBe('2026-08-01');
    expect(s.keyInfo.stale.lastSeen).toBe('2026-08-03');
    expect(s.keyInfo.stale.fireDays).toBe(2);
  });

  it('surfaces whether any day hit the rankAttention cap, so a capped run is never silently under-reported', () => {
    const s1 = summarizeFireVolume({ days: { '2026-08-01': { totalItems: 20, capped: true, byDetector: {}, keys: {} } } });
    expect(s1.anyCapped).toBe(true);
    const s2 = summarizeFireVolume({ days: { '2026-08-01': { totalItems: 3, capped: false, byDetector: {}, keys: {} } } });
    expect(s2.anyCapped).toBe(false);
  });

  it('empty blob (no measurement yet) degrades cleanly instead of dividing by zero', () => {
    expect(summarizeFireVolume({ days: {} })).toMatchObject({ daysMeasured: 0, totalFires: 0, distinctKeys: 0, collapseRatio: 0 });
    expect(summarizeFireVolume(null)).toMatchObject({ daysMeasured: 0, collapseRatio: 0 });
  });
});
