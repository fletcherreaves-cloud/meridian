// @vitest-environment happy-dom
// @ts-nocheck
// Egress Wave 1 delta-sync pilot #7 (2026-11-22) — watermark delta-sync for hme_dt_daily. Same
// shape as the LifeLenz pilots, now that loadHmeDtRows's mapped return exposes `updatedAt` (it
// only exposed `pulledAt` before this pilot).
//
// _stHmeDt now asks Supabase for only rows whose `updated_at` moved since the last sync
// (loadHmeDtRows's `since` param) instead of re-fetching the whole `daysBack` window every
// login, then MERGES the delta into the cached array by (loc,date) — the table's real PK
// (supabase/schema-hme-cloud-dt.sql:17-33) — instead of replacing it. `date` is a real Date
// object on these rows (unlike the LifeLenz pilots' plain-string date fields), so the merge key
// re-derives a calendar-day string from it, same reasoning as mergeLifelenzScheduleDelta's own
// key. maxUpdatedAt itself is already covered by the lifelenz_schedule pilot's own test file —
// not re-tested here.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, supabase: null }; // App.js's top-level code must not need a real client to import
});

const { mergeHmeDtDelta } = await import('../app/App.js');

const row = (loc, dateStr, extra = {}) => ({ loc, date: new Date(dateStr + 'T00:00:00'), ...extra });

describe('mergeHmeDtDelta', () => {
  it('a delta row overwrites the cached row with the same (loc,date) key, not a duplicate', () => {
    const prev = [row('3708', '2026-11-10', { cars: 100 })];
    const delta = [row('3708', '2026-11-10', { cars: 150 })];
    const merged = mergeHmeDtDelta(prev, delta, { daysBack: 400 });
    expect(merged).toHaveLength(1);
    expect(merged[0].cars).toBe(150);
  });

  it('a delta row for a NEW (loc,date) is added alongside the untouched cached rows', () => {
    const prev = [row('3708', '2026-11-10', { cars: 100 })];
    const delta = [row('5183', '2026-11-11', { cars: 200 })];
    const merged = mergeHmeDtDelta(prev, delta, { daysBack: 400 });
    expect(merged).toHaveLength(2);
    expect(merged.find(r => r.loc === '3708').cars).toBe(100);
    expect(merged.find(r => r.loc === '5183').cars).toBe(200);
  });

  it('an empty delta leaves every cached row untouched (the "nothing changed" case)', () => {
    const prev = [row('3708', '2026-11-10', { cars: 100 }), row('3708', '2026-11-11', { cars: 110 })];
    const merged = mergeHmeDtDelta(prev, [], { daysBack: 400 });
    expect(merged).toHaveLength(2);
  });

  it('a cached row that has aged out of the current window is pruned, even with an empty delta', () => {
    // `recent` must stay well inside the 90-day window on every run — see
    // memory/plan-egress-reduction-2026-11-20.md's standing warning against hardcoded fixture
    // dates in these window-prune tests. Compute it relative to now.
    const d = new Date(); d.setDate(d.getDate() - 5);
    const recentDate = d.toISOString().slice(0, 10);
    const farPast = row('3708', '2020-01-01', { cars: 1 }); // >90 days back
    const recent  = row('3708', recentDate, { cars: 2 });
    const merged = mergeHmeDtDelta([farPast, recent], [], { daysBack: 90 });
    expect(merged.some(r => r.cars === 1)).toBe(false);
    expect(merged.some(r => r.cars === 2)).toBe(true);
  });

  it('different stores on the same date are distinct keys, not collapsed into one row', () => {
    const prev = [row('3708', '2026-11-10', { cars: 100 }), row('5183', '2026-11-10', { cars: 200 })];
    const merged = mergeHmeDtDelta(prev, [], { daysBack: 400 });
    expect(merged).toHaveLength(2);
  });
});
