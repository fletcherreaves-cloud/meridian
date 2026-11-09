// @vitest-environment happy-dom
// @ts-nocheck
// Owner request (2026-11-09): auto-refresh after a manual Data Manager "↻ Sync" instead of a
// hard page reload. App.js's exported STREAM_RELOADERS (same export pattern as
// WorkflowGuidePanel/PanelManagerPanel) is the single source of truth both the tiered startup
// loader's own _stLifelenz/_stQsrsoftFob/_stDarRows/_stEbosOpSupplies stages AND the post-"↻
// Sync" onStreamSynced path call — this exercises the REAL merge shape each one produces, not a
// duplicated stand-in, so a drift between the two call sites (e.g. darByLoc dropped from the dar
// patch, or the empty-rows guard removed) fails here.
import { describe, it, expect, vi, afterEach } from 'vitest';

const loaders = {
  loadLifeLenzSchedule: vi.fn(),
  loadQsrFob: vi.fn(),
  loadDarRows: vi.fn(),
  loadEbosDaily: vi.fn(),
};

vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadLifeLenzSchedule: (...a) => loaders.loadLifeLenzSchedule(...a),
    loadQsrFob: (...a) => loaders.loadQsrFob(...a),
    loadDarRows: (...a) => loaders.loadDarRows(...a),
    loadEbosDaily: (...a) => loaders.loadEbosDaily(...a),
    supabase: null, // App.js module top-level code must not need a real client just to import
  };
});

const { STREAM_RELOADERS } = await import('../app/App.js');

afterEach(() => { Object.values(loaders).forEach(fn => fn.mockReset()); });

describe('App.js STREAM_RELOADERS — single source of merge logic for all 5 "↻ Sync" streams', () => {
  it('lifelenz: merges rows into schedRows (same field _stLifelenz\'s own setDs call uses)', async () => {
    const rows = [{ loc: '3708', date: '2026-11-09' }];
    loaders.loadLifeLenzSchedule.mockResolvedValue(rows);
    const res = await STREAM_RELOADERS.lifelenz();
    expect(res).toEqual({ patch: { schedRows: rows }, count: 1 });
  });

  it('fob: merges rows into qsrFobRows (same field _stQsrsoftFob\'s own setDs call uses)', async () => {
    const rows = [{ loc: '3708', date: '2026-11-09' }, { loc: '6178', date: '2026-11-09' }];
    loaders.loadQsrFob.mockResolvedValue(rows);
    const res = await STREAM_RELOADERS.fob();
    expect(res).toEqual({ patch: { qsrFobRows: rows }, count: 2 });
  });

  it('dar: merges rows into darRows AND rebuilds darByLoc (same two fields _stDarRows sets)', async () => {
    const rows = [{ loc: '3708', dt: '2026-11-09' }, { loc: '3708', dt: '2026-11-10' }];
    loaders.loadDarRows.mockResolvedValue(rows);
    const res = await STREAM_RELOADERS.dar();
    expect(res.count).toBe(2);
    expect(res.patch.darRows).toBe(rows);
    expect(res.patch.darByLoc).toBeTruthy();
    expect(res.patch.darByLoc['3708']).toHaveLength(2);
  });

  it('ebos: calls loadEbosDaily(400) — the same 400-day window _stEbosOpSupplies uses — and merges ebosRows', async () => {
    const rows = [{ loc: '3708', date: '2026-11-09' }];
    loaders.loadEbosDaily.mockResolvedValue(rows);
    const res = await STREAM_RELOADERS.ebos();
    expect(loaders.loadEbosDaily).toHaveBeenCalledWith(400);
    expect(res).toEqual({ patch: { ebosRows: rows }, count: 1 });
  });

  it('returns null (no merge) when the table came back empty, for every stream — the startup stages rely on this to skip setDs entirely', async () => {
    loaders.loadLifeLenzSchedule.mockResolvedValue([]);
    loaders.loadQsrFob.mockResolvedValue([]);
    loaders.loadDarRows.mockResolvedValue([]);
    loaders.loadEbosDaily.mockResolvedValue([]);
    expect(await STREAM_RELOADERS.lifelenz()).toBeNull();
    expect(await STREAM_RELOADERS.fob()).toBeNull();
    expect(await STREAM_RELOADERS.dar()).toBeNull();
    expect(await STREAM_RELOADERS.ebos()).toBeNull();
  });

  it('there is no reloader for secevents — Security Events never loads into ds (loaded on demand, per-subject, inside the Security panel instead)', () => {
    expect(STREAM_RELOADERS.secevents).toBeUndefined();
  });
});
