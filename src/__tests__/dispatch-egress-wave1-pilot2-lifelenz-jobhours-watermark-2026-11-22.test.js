// @vitest-environment happy-dom
// @ts-nocheck
// Egress Wave 1 delta-sync pilot #2 (2026-11-22) — watermark delta-sync for lifelenz_job_hours.
// Same shape as the lifelenz_dar pilot (#1), now that loadLifeLenzJobHours's mapped return
// shape actually exposes `updatedAt` — fixed in the SAME commit as this pilot per
// memory/plan-egress-reduction-2026-11-20.md Section 18/19's own scoping note (the loader
// previously had no `updatedAt` field at all, despite the DB column being set correctly on
// every upsert; a prior pass of the Wave 1 readiness audit wrongly assumed it already did).
//
// _stLifelenzJobHours now asks Supabase for only rows whose `updated_at` moved since the last
// sync (loadLifeLenzJobHours's `since` param) instead of re-fetching the whole
// weeksBack/weeksFwd window every login, then MERGES the delta into the cached array by
// (loc, weekStart, businessRoleId) — the table's real PK (supabase/schema.sql:1023-1037) —
// instead of replacing it. These tests exercise the pure function that makes that safe:
// mergeLifelenzJobHoursDelta (merge-by-key + window-prune on `weekStart`, a plain 'YYYY-MM-DD'
// string field, never a Date). maxUpdatedAt itself is already covered by the lifelenz_schedule
// pilot's own test file — not re-tested here.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, supabase: null }; // App.js's top-level code must not need a real client to import
});

const { mergeLifelenzJobHoursDelta } = await import('../app/App.js');

const row = (loc, weekStart, businessRoleId, extra = {}) => ({ loc, weekStart, businessRoleId, ...extra });

describe('mergeLifelenzJobHoursDelta', () => {
  it('a delta row overwrites the cached row with the same (loc,weekStart,businessRoleId) key, not a duplicate', () => {
    const prev = [row('3708', '2026-11-11', 'drive-thru', { hours: 100 })];
    const delta = [row('3708', '2026-11-11', 'drive-thru', { hours: 150 })];
    const merged = mergeLifelenzJobHoursDelta(prev, delta, { weeksBack: 400, weeksFwd: 400 });
    expect(merged).toHaveLength(1);
    expect(merged[0].hours).toBe(150);
  });

  it('a delta row for a NEW key is added alongside the untouched cached rows', () => {
    const prev = [row('3708', '2026-11-11', 'drive-thru', { hours: 100 })];
    const delta = [row('5183', '2026-11-18', 'front-counter', { hours: 200 })];
    const merged = mergeLifelenzJobHoursDelta(prev, delta, { weeksBack: 400, weeksFwd: 400 });
    expect(merged).toHaveLength(2);
    expect(merged.find(r => r.loc === '3708').hours).toBe(100);
    expect(merged.find(r => r.loc === '5183').hours).toBe(200);
  });

  it('an empty delta leaves every cached row untouched (the "nothing changed" case)', () => {
    const prev = [
      row('3708', '2026-11-11', 'drive-thru', { hours: 100 }),
      row('3708', '2026-11-11', 'front-counter', { hours: 110 }),
    ];
    const merged = mergeLifelenzJobHoursDelta(prev, [], { weeksBack: 400, weeksFwd: 400 });
    expect(merged).toHaveLength(2);
  });

  it('a cached row that has aged out of the current window is pruned, even with an empty delta', () => {
    // `recent` must stay well inside the 60-week window on every run — see
    // memory/plan-egress-reduction-2026-11-20.md's standing warning against hardcoded fixture
    // dates in these window-prune tests. Compute it relative to now.
    const d = new Date(); d.setDate(d.getDate() - 7);
    const recentWeek = d.toISOString().slice(0, 10);
    const farPast = row('3708', '2020-01-01', 'drive-thru', { hours: 1 }); // >60 weeks back
    const recent  = row('3708', recentWeek, 'drive-thru', { hours: 2 });
    const merged = mergeLifelenzJobHoursDelta([farPast, recent], [], { weeksBack: 60, weeksFwd: 4 });
    expect(merged.some(r => r.hours === 1)).toBe(false);
    expect(merged.some(r => r.hours === 2)).toBe(true);
  });

  it('two different roles in the same (loc,weekStart) are distinct keys, not collapsed into one row', () => {
    const prev = [
      row('3708', '2026-11-11', 'drive-thru', { hours: 100 }),
      row('3708', '2026-11-11', 'front-counter', { hours: 200 }),
    ];
    const merged = mergeLifelenzJobHoursDelta(prev, [], { weeksBack: 400, weeksFwd: 400 });
    expect(merged).toHaveLength(2);
  });

  it('different stores at the identical (weekStart,businessRoleId) are distinct keys, not collapsed into one row', () => {
    const prev = [
      row('3708', '2026-11-11', 'drive-thru', { hours: 100 }),
      row('5183', '2026-11-11', 'drive-thru', { hours: 200 }),
    ];
    const merged = mergeLifelenzJobHoursDelta(prev, [], { weeksBack: 400, weeksFwd: 400 });
    expect(merged).toHaveLength(2);
  });
});
