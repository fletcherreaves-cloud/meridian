// @ts-nocheck
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

// pushBlob/hydrateBlob call saveUserSetting/loadUserSetting (real network calls) —
// mocked here so the savedAt-guard logic (issue #118's core correctness requirement)
// can be tested without a live Supabase connection.
vi.mock('../lib/supabase.js', () => ({
  saveUserSetting: vi.fn(() => Promise.resolve()),
  loadUserSetting: vi.fn(() => Promise.resolve(null)),
}));

import { saveUserSetting, loadUserSetting } from '../lib/supabase.js';
import { pushBlob, readBlobLocal, hydrateBlob, normalizeDialedIn } from '../lib/blob-sync.js';

function installLS() {
  const store = {};
  globalThis.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => { for (const k in store) delete store[k]; },
  };
}

describe('normalizeDialedIn — shape migration (issue #118)', () => {
  it('null/undefined/non-object → empty data, savedAt 0', () => {
    for (const bad of [null, undefined, 42, 'x']) {
      expect(normalizeDialedIn(bad)).toEqual({ data: {}, savedAt: 0 });
    }
  });

  it('new {data,savedAt} wrapper passes through unchanged', () => {
    const raw = { data: { '10422': { mape: 5.1 } }, savedAt: 12345 };
    expect(normalizeDialedIn(raw)).toEqual({ data: { '10422': { mape: 5.1 } }, savedAt: 12345 });
  });

  it('legacy bare flat-map shape (pre-#118 localStorage) treated as oldest, whole object as data', () => {
    // This is what real production localStorage held before this PR — a flat
    // {loc: calibrationResult} map with no wrapper at all.
    const legacy = { '10422': { mape: 5.1 }, '32525': { mape: 6.8 } };
    expect(normalizeDialedIn(legacy)).toEqual({ data: legacy, savedAt: 0 });
  });

  it('a legacy blob missing savedAt never beats a real stamped write in a comparison', () => {
    const legacy = normalizeDialedIn({ '10422': { mape: 5.1 } });
    const fresh = normalizeDialedIn({ data: { '10422': { mape: 4.2 } }, savedAt: Date.now() });
    expect(fresh.savedAt).toBeGreaterThan(legacy.savedAt);
  });
});

describe('readBlobLocal', () => {
  beforeEach(() => installLS());
  afterAll(() => { try { delete globalThis.localStorage; } catch {} });

  it('returns null when the key is missing', () => {
    expect(readBlobLocal('nope')).toBeNull();
  });

  it('parses a stored JSON blob', () => {
    localStorage.setItem('k', JSON.stringify({ a: 1 }));
    expect(readBlobLocal('k')).toEqual({ a: 1 });
  });

  it('degrades to null on malformed JSON rather than throwing', () => {
    localStorage.setItem('k', '{not json');
    expect(() => readBlobLocal('k')).not.toThrow();
    expect(readBlobLocal('k')).toBeNull();
  });
});

describe('pushBlob', () => {
  beforeEach(() => { installLS(); saveUserSetting.mockClear(); });
  afterAll(() => { try { delete globalThis.localStorage; } catch {} });

  it('stamps savedAt, writes local, and pushes the SAME stamped object to cloud', () => {
    const stamped = pushBlob('k', 'setting', { data: { a: 1 } });
    expect(stamped.savedAt).toBeTypeOf('number');
    expect(JSON.parse(localStorage.getItem('k'))).toEqual(stamped);
    expect(saveUserSetting).toHaveBeenCalledWith('setting', stamped);
  });
});

describe('hydrateBlob — the savedAt guard (issue #118, Hazard #2)', () => {
  beforeEach(() => { installLS(); loadUserSetting.mockReset(); });
  afterAll(() => { try { delete globalThis.localStorage; } catch {} });

  it('applies the local blob immediately if present, before cloud resolves', () => {
    localStorage.setItem('k', JSON.stringify({ data: { a: 1 }, savedAt: 100 }));
    loadUserSetting.mockReturnValue(new Promise(() => {})); // never resolves
    const applied = [];
    hydrateBlob('k', 'setting', (b) => applied.push(b));
    expect(applied).toEqual([{ data: { a: 1 }, savedAt: 100 }]);
  });

  it('cloud wins and re-applies when strictly newer than local — an in-progress local run is NOT clobbered by an equal-or-older cloud copy', async () => {
    localStorage.setItem('k', JSON.stringify({ data: { a: 1 }, savedAt: 100 }));
    loadUserSetting.mockResolvedValue({ data: { a: 2 }, savedAt: 200 });
    const applied = [];
    hydrateBlob('k', 'setting', (b) => applied.push(b));
    await new Promise(r => setTimeout(r, 0));
    expect(applied).toEqual([{ data: { a: 1 }, savedAt: 100 }, { data: { a: 2 }, savedAt: 200 }]);
    expect(JSON.parse(localStorage.getItem('k'))).toEqual({ data: { a: 2 }, savedAt: 200 });
  });

  it('local wins (cloud NOT applied) when cloud is equal-or-older — a fresher/in-progress local write survives a stale cloud hydration landing mid-run', async () => {
    localStorage.setItem('k', JSON.stringify({ data: { a: 1 }, savedAt: 200 }));
    loadUserSetting.mockResolvedValue({ data: { a: 'stale' }, savedAt: 100 });
    const applied = [];
    hydrateBlob('k', 'setting', (b) => applied.push(b));
    await new Promise(r => setTimeout(r, 0));
    expect(applied).toEqual([{ data: { a: 1 }, savedAt: 200 }]); // only the local apply
    expect(JSON.parse(localStorage.getItem('k'))).toEqual({ data: { a: 1 }, savedAt: 200 }); // untouched
  });

  it('cloud applies when there is no local copy at all (fresh device/profile)', async () => {
    loadUserSetting.mockResolvedValue({ data: { a: 9 }, savedAt: 50 });
    const applied = [];
    hydrateBlob('k', 'setting', (b) => applied.push(b));
    await new Promise(r => setTimeout(r, 0));
    expect(applied).toEqual([{ data: { a: 9 }, savedAt: 50 }]);
  });

  it('a reset (empty data, fresh savedAt) beats an older non-empty cloud copy, so a reset cannot be silently resurrected', async () => {
    // Mirrors DialedInPanel's clearAll(): pushBlob(.... {data:{}}) stamps savedAt=now.
    const resetSavedAt = Date.now();
    localStorage.setItem('k', JSON.stringify({ data: {}, savedAt: resetSavedAt }));
    loadUserSetting.mockResolvedValue({ data: { '10422': { mape: 5.1 } }, savedAt: resetSavedAt - 999999 });
    const applied = [];
    hydrateBlob('k', 'setting', (b) => applied.push(b));
    await new Promise(r => setTimeout(r, 0));
    expect(applied).toEqual([{ data: {}, savedAt: resetSavedAt }]); // cloud never applied
  });
});
