// @vitest-environment happy-dom
// @ts-nocheck
// Egress Wave 1 delta-sync pilot #1 (2026-11-22) — watermark delta-sync for lifelenz_dar,
// copying the shape of the lifelenz_schedule pilot (egress Phase 2 pilot #1, 2026-11-21) exactly,
// per memory/plan-egress-reduction-2026-11-20.md Section 17's recommended next-pilot ordering.
//
// _stLifelenzDar now asks Supabase for only rows whose `updated_at` moved since the last sync
// (loadLifeLenzDar's `since` param) instead of re-fetching the whole `daysBack` window every
// login, then MERGES the delta into the cached array by (loc,start_time) — lifelenz_dar's real
// PK (supabase/schema-lifelenz-dar.sql) — instead of replacing it. These tests exercise the pure
// function that makes that safe: mergeLifelenzDarDelta (merge-by-key + window-prune on `dt`, a
// plain 'YYYY-MM-DD' string field, never a Date). maxUpdatedAt itself is already covered by the
// lifelenz_schedule pilot's own test file — not re-tested here.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, supabase: null }; // App.js's top-level code must not need a real client to import
});

const { mergeLifelenzDarDelta } = await import('../app/App.js');

const row = (loc, startTime, dt, extra = {}) => ({ loc, startTime, dt, ...extra });

describe('mergeLifelenzDarDelta', () => {
  it('a delta row overwrites the cached row with the same (loc,startTime) key, not a duplicate', () => {
    const prev = [row('3708', '2026-11-10T11:00:00.000Z', '2026-11-10', { netSales: 100 })];
    const delta = [row('3708', '2026-11-10T11:00:00.000Z', '2026-11-10', { netSales: 150 })];
    const merged = mergeLifelenzDarDelta(prev, delta, { daysBack: 400 });
    expect(merged).toHaveLength(1);
    expect(merged[0].netSales).toBe(150);
  });

  it('a delta row for a NEW (loc,startTime) is added alongside the untouched cached rows', () => {
    const prev = [row('3708', '2026-11-10T11:00:00.000Z', '2026-11-10', { netSales: 100 })];
    const delta = [row('5183', '2026-11-11T12:00:00.000Z', '2026-11-11', { netSales: 200 })];
    const merged = mergeLifelenzDarDelta(prev, delta, { daysBack: 400 });
    expect(merged).toHaveLength(2);
    expect(merged.find(r => r.loc === '3708').netSales).toBe(100);
    expect(merged.find(r => r.loc === '5183').netSales).toBe(200);
  });

  it('an empty delta leaves every cached row untouched (the "nothing changed" case)', () => {
    const prev = [
      row('3708', '2026-11-10T11:00:00.000Z', '2026-11-10', { netSales: 100 }),
      row('3708', '2026-11-10T12:00:00.000Z', '2026-11-10', { netSales: 110 }),
    ];
    const merged = mergeLifelenzDarDelta(prev, [], { daysBack: 400 });
    expect(merged).toHaveLength(2);
  });

  it('a cached row that has aged out of the current window is pruned, even with an empty delta', () => {
    const farPast = row('3708', '2020-01-01T11:00:00.000Z', '2020-01-01', { netSales: 1 }); // >45 days back
    const recent  = row('3708', '2026-11-10T11:00:00.000Z', '2026-11-10', { netSales: 2 });
    const merged = mergeLifelenzDarDelta([farPast, recent], [], { daysBack: 45 });
    expect(merged.some(r => r.netSales === 1)).toBe(false);
    expect(merged.some(r => r.netSales === 2)).toBe(true);
  });

  it('two different hours on the same (loc,dt) are distinct keys, not collapsed into one row', () => {
    const prev = [
      row('3708', '2026-11-10T11:00:00.000Z', '2026-11-10', { netSales: 100 }),
      row('3708', '2026-11-10T12:00:00.000Z', '2026-11-10', { netSales: 200 }),
    ];
    const merged = mergeLifelenzDarDelta(prev, [], { daysBack: 400 });
    expect(merged).toHaveLength(2);
  });

  it('different stores at the identical startTime are distinct keys, not collapsed into one row', () => {
    const prev = [
      row('3708', '2026-11-10T11:00:00.000Z', '2026-11-10', { netSales: 100 }),
      row('5183', '2026-11-10T11:00:00.000Z', '2026-11-10', { netSales: 200 }),
    ];
    const merged = mergeLifelenzDarDelta(prev, [], { daysBack: 400 });
    expect(merged).toHaveLength(2);
  });
});
