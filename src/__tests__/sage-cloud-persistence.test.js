// @ts-nocheck
// Dispatch #187 — SAGE conversation cross-device persistence. Exercises the ACTUAL call-site
// logic sage.js's SagePanel uses (its own _normSageBlob, plus the real blob-sync.js pushBlob/
// hydrateBlob it calls — not reimplemented here), per CLAUDE.md's "would this verification
// still pass if the change were reverted?": a test that only re-derives the guard logic in the
// test file can't tell "fixed" from "fixed but the panel never actually calls it."
//
// supabase.js's saveUserSetting/loadUserSetting are mocked (network calls) so the savedAt-
// guard behavior — the whole point of this dispatch, matching the _stDialedIn pattern
// (App.js) rather than the unconditional-cloud-wins _stModelAssignments pattern — can be
// tested without a live Supabase connection. Mirrors src/__tests__/blob-sync.test.js's own
// mock (same module, same mock shape) since sage.js and blob-sync.js both resolve to the
// same '../lib/supabase.js'.
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

vi.mock('../lib/supabase.js', () => ({
  supabase: null,
  saveTask: vi.fn(),
  saveFeatureRequest: vi.fn(),
  loadSagePrompts: vi.fn(() => Promise.resolve([])),
  saveSagePrompt: vi.fn(),
  deleteSagePrompt: vi.fn(),
  updateSagePromptSchedule: vi.fn(),
  searchQsrKb: vi.fn(),
  saveUserSetting: vi.fn(() => Promise.resolve()),
  loadUserSetting: vi.fn(() => Promise.resolve(null)),
}));

import { saveUserSetting, loadUserSetting } from '../lib/supabase.js';
import { pushBlob, readBlobLocal, hydrateBlob } from '../lib/blob-sync.js';
import { _normSageBlob, _capSessionsBySize } from '../views/sage.js';

// The literal keys SagePanel uses (mf_sage_thread_v1 / sage_thread, mf_sage_sessions_v1 /
// sage_sessions) — kept in sync by inspection since sage.js doesn't export them; a drift here
// would just make this test miss the real keys, which `npm run build` + the existing
// sage-manual-sourcing.test.js import of sage.js would not catch either, but a grep confirms
// them at review time.
const THREAD_LS = 'mf_sage_thread_v1';
const THREAD_SETTING = 'sage_thread';
const SESSIONS_LS = 'mf_sage_sessions_v1';
const SESSIONS_SETTING = 'sage_sessions';

function installLS() {
  const store = {};
  globalThis.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => { for (const k in store) delete store[k]; },
  };
}

describe('_normSageBlob — legacy-shape migration (dispatch #187)', () => {
  it('a pre-#187 bare-array localStorage value normalizes to savedAt:0 (oldest)', () => {
    const legacyThread = [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }];
    expect(_normSageBlob(legacyThread)).toEqual({ data: legacyThread, savedAt: 0 });
  });

  it('the new {data,savedAt} envelope passes through unchanged', () => {
    const wrapped = { data: [{ role: 'user', content: 'hi' }], savedAt: 12345 };
    expect(_normSageBlob(wrapped)).toEqual(wrapped);
  });

  it('null/undefined/malformed → empty data, savedAt 0 (never throws)', () => {
    for (const bad of [null, undefined, 42, 'x', {}]) {
      expect(_normSageBlob(bad)).toEqual({ data: [], savedAt: 0 });
    }
  });
});

describe('SAGE thread cloud settle-point — the savedAt guard actually protects an in-progress conversation (dispatch #187)', () => {
  beforeEach(() => { installLS(); loadUserSetting.mockReset(); saveUserSetting.mockClear(); });
  afterAll(() => { try { delete globalThis.localStorage; } catch {} });

  it('a newer local write is NOT clobbered by a stale cloud value arriving after it — this is the core requirement: an active conversation on one device must survive a stale cloud hydration from another', async () => {
    // Simulates: user is mid-conversation on Device A. The turn-complete settle point in
    // SagePanel calls exactly this — pushBlob(THREAD_LS, THREAD_SETTING, {data: messages}).
    const liveThread = [
      { role: 'user', content: 'which stores are lagging today?' },
      { role: 'assistant', content: 'Store 10422 is 8% below plan...' },
    ];
    const stamped = pushBlob(THREAD_LS, THREAD_SETTING, { data: liveThread });
    expect(stamped.savedAt).toBeTypeOf('number');
    expect(saveUserSetting).toHaveBeenCalledWith(THREAD_SETTING, stamped);

    // Now a hydration runs (e.g. panel remount) and the cloud read resolves to a STALE value
    // — an older conversation from a different, earlier session on another device.
    loadUserSetting.mockResolvedValue({ data: [{ role: 'user', content: 'old question' }], savedAt: stamped.savedAt - 60000 });

    const applied = [];
    hydrateBlob(THREAD_LS, THREAD_SETTING, (blob) => applied.push(_normSageBlob(blob).data));
    await new Promise(r => setTimeout(r, 0));

    // Only the local (live) apply happened — the stale cloud read never overwrote it.
    expect(applied).toEqual([liveThread]);
    expect(_normSageBlob(readBlobLocal(THREAD_LS)).data).toEqual(liveThread);
  });

  it('a genuinely newer cloud thread (e.g. continued on another device) DOES win a hydration', async () => {
    const oldLocal = [{ role: 'user', content: 'yesterday' }];
    localStorage.setItem(THREAD_LS, JSON.stringify({ data: oldLocal, savedAt: 100 }));
    const newerCloud = [{ role: 'user', content: 'from my phone just now' }, { role: 'assistant', content: '...' }];
    loadUserSetting.mockResolvedValue({ data: newerCloud, savedAt: 999999 });

    const applied = [];
    hydrateBlob(THREAD_LS, THREAD_SETTING, (blob) => applied.push(_normSageBlob(blob).data));
    await new Promise(r => setTimeout(r, 0));

    expect(applied).toEqual([oldLocal, newerCloud]); // local applied first (instant), then cloud (newer) wins
    expect(_normSageBlob(readBlobLocal(THREAD_LS)).data).toEqual(newerCloud);
  });

  it('a legacy pre-#187 bare-array local blob (savedAt 0) never beats a real stamped cloud write', async () => {
    localStorage.setItem(THREAD_LS, JSON.stringify([{ role: 'user', content: 'legacy, unwrapped' }]));
    const cloudThread = [{ role: 'user', content: 'cloud has a real timestamp' }];
    loadUserSetting.mockResolvedValue({ data: cloudThread, savedAt: Date.now() });

    const applied = [];
    hydrateBlob(THREAD_LS, THREAD_SETTING, (blob) => applied.push(_normSageBlob(blob).data));
    await new Promise(r => setTimeout(r, 0));

    expect(applied[applied.length - 1]).toEqual(cloudThread);
  });

  it('a fresh device/profile with no local thread at all hydrates straight from cloud', async () => {
    const cloudThread = [{ role: 'user', content: 'seen on device A' }];
    loadUserSetting.mockResolvedValue({ data: cloudThread, savedAt: 50 });
    const applied = [];
    hydrateBlob(THREAD_LS, THREAD_SETTING, (blob) => applied.push(_normSageBlob(blob).data));
    await new Promise(r => setTimeout(r, 0));
    expect(applied).toEqual([cloudThread]);
  });
});

describe('SAGE archived sessions cloud settle-point (dispatch #187)', () => {
  beforeEach(() => { installLS(); loadUserSetting.mockReset(); saveUserSetting.mockClear(); });
  afterAll(() => { try { delete globalThis.localStorage; } catch {} });

  it('persistSessions-equivalent push stamps savedAt and mirrors to cloud under the sessions key/setting', () => {
    const sessions = [{ id: 's1', title: 'Which stores are lagging', count: 4, messages: [] }];
    const stamped = pushBlob(SESSIONS_LS, SESSIONS_SETTING, { data: sessions });
    expect(saveUserSetting).toHaveBeenCalledWith(SESSIONS_SETTING, stamped);
    expect(_normSageBlob(readBlobLocal(SESSIONS_LS)).data).toEqual(sessions);
  });

  it('an older cloud archive list does not clobber a newer local one', async () => {
    const localSessions = [{ id: 's2', title: 'newer archive', count: 1, messages: [] }];
    localStorage.setItem(SESSIONS_LS, JSON.stringify({ data: localSessions, savedAt: 500 }));
    loadUserSetting.mockResolvedValue({ data: [{ id: 's1', title: 'stale archive', count: 1, messages: [] }], savedAt: 100 });

    const applied = [];
    hydrateBlob(SESSIONS_LS, SESSIONS_SETTING, (blob) => applied.push(_normSageBlob(blob).data));
    await new Promise(r => setTimeout(r, 0));

    expect(applied).toEqual([localSessions]);
  });
});

describe('_capSessionsBySize — the size bound added after measurement (dispatch #187 task 4)', () => {
  it('leaves a small archive untouched', () => {
    const small = [{ id: 's1', title: 'x', count: 2, messages: [{ role: 'user', content: 'hi' }] }];
    expect(_capSessionsBySize(small, 300 * 1024)).toEqual(small);
  });

  it('drops the OLDEST sessions (the tail of a newest-first array) until under the byte budget', () => {
    const big = (id) => ({ id, title: 'x', count: 1, messages: [{ role: 'assistant', content: 'x'.repeat(50000) }] });
    const newestFirst = [big('newest'), big('middle'), big('oldest')];
    const capped = _capSessionsBySize(newestFirst, 60000); // ~1.2 sessions' worth of budget
    expect(capped.map(s => s.id)).toEqual(['newest']); // only the newest survives
  });

  it('never drops below 1 session even if that single session alone exceeds the budget', () => {
    const huge = [{ id: 'only', title: 'x', count: 1, messages: [{ role: 'assistant', content: 'x'.repeat(1000000) }] }];
    expect(_capSessionsBySize(huge, 1000)).toHaveLength(1);
  });

  it('a realistic 25-session archive (the actual measured scenario) gets capped under budget', () => {
    const sessions = [];
    for (let i = 0; i < 25; i++) {
      const messages = [];
      for (let t = 0; t < 6; t++) {
        messages.push({ role: 'user', content: 'which stores are lagging vs projection?' });
        messages.push({ role: 'assistant', content: 'store analysis '.repeat(200) }); // ~3KB reply
      }
      sessions.push({ id: 's' + i, title: 'conversation ' + i, count: messages.length, messages });
    }
    const rawBytes = new TextEncoder().encode(JSON.stringify(sessions)).length;
    expect(rawBytes).toBeGreaterThan(300 * 1024); // confirms this scenario actually needs capping
    const capped = _capSessionsBySize(sessions, 300 * 1024);
    const cappedBytes = new TextEncoder().encode(JSON.stringify(capped)).length;
    expect(cappedBytes).toBeLessThanOrEqual(300 * 1024);
    expect(capped.length).toBeLessThan(25);
    expect(capped[0].id).toBe('s0'); // newest (first) always survives
  });
});
