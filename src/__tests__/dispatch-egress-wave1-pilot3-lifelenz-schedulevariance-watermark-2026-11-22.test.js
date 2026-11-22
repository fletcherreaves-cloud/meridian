// @vitest-environment happy-dom
// @ts-nocheck
// Egress Wave 1 delta-sync pilot #3 (2026-11-22) — watermark delta-sync for
// lifelenz_schedule_variance. Same shape as pilots #1/#2, now that
// loadLifeLenzScheduleVariance's mapped return shape actually exposes `seq` — fixed in the SAME
// commit as this pilot per memory/plan-egress-reduction-2026-11-20.md Section 18/19's own
// scoping note (the loader previously had no `seq` field at all, even though it's part of the
// table's real primary key).
//
// _stScheduleVariance now asks Supabase for only rows whose `updated_at` moved since the last
// sync (loadLifeLenzScheduleVariance's `since` param) instead of re-fetching the whole
// `daysBack` window every login, then MERGES the delta into the cached array by
// (loc, editedBy, occurredAt, seq) — the table's real PK
// (supabase/schema-lifelenz-schedule-variance.sql:21-39) — instead of replacing it. `seq` exists
// specifically because `occurredAt` is not necessarily unique per (loc,editedBy) when LifeLenz
// batches multiple field changes from one save action under the same timestamp; these tests
// prove that case is handled correctly. maxUpdatedAt itself is already covered by the
// lifelenz_schedule pilot's own test file — not re-tested here.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, supabase: null }; // App.js's top-level code must not need a real client to import
});

const { mergeLifelenzScheduleVarianceDelta } = await import('../app/App.js');

const row = (loc, editedBy, occurredAt, seq, extra = {}) => ({ loc, editedBy, occurredAt, seq, ...extra });

describe('mergeLifelenzScheduleVarianceDelta', () => {
  it('a delta row overwrites the cached row with the same (loc,editedBy,occurredAt,seq) key, not a duplicate', () => {
    const prev = [row('3708', 'jsmith', '2026-11-10T14:00:00', 0, { hoursVariance: 1 })];
    const delta = [row('3708', 'jsmith', '2026-11-10T14:00:00', 0, { hoursVariance: 2 })];
    const merged = mergeLifelenzScheduleVarianceDelta(prev, delta, { daysBack: 400 });
    expect(merged).toHaveLength(1);
    expect(merged[0].hoursVariance).toBe(2);
  });

  it('two edits by the same editor at the identical timestamp are distinct keys via seq, not collapsed', () => {
    const prev = [
      row('3708', 'jsmith', '2026-11-10T14:00:00', 0, { hoursVariance: 1 }),
      row('3708', 'jsmith', '2026-11-10T14:00:00', 1, { hoursVariance: 2 }),
    ];
    const merged = mergeLifelenzScheduleVarianceDelta(prev, [], { daysBack: 400 });
    expect(merged).toHaveLength(2);
    expect(merged.some(r => r.seq === 0 && r.hoursVariance === 1)).toBe(true);
    expect(merged.some(r => r.seq === 1 && r.hoursVariance === 2)).toBe(true);
  });

  it('a delta row for a NEW key is added alongside the untouched cached rows', () => {
    const prev = [row('3708', 'jsmith', '2026-11-10T14:00:00', 0, { hoursVariance: 1 })];
    const delta = [row('5183', 'awilliams', '2026-11-11T09:00:00', 0, { hoursVariance: 3 })];
    const merged = mergeLifelenzScheduleVarianceDelta(prev, delta, { daysBack: 400 });
    expect(merged).toHaveLength(2);
    expect(merged.find(r => r.loc === '3708').hoursVariance).toBe(1);
    expect(merged.find(r => r.loc === '5183').hoursVariance).toBe(3);
  });

  it('an empty delta leaves every cached row untouched (the "nothing changed" case)', () => {
    const prev = [
      row('3708', 'jsmith', '2026-11-10T14:00:00', 0, { hoursVariance: 1 }),
      row('3708', 'jsmith', '2026-11-11T09:00:00', 0, { hoursVariance: 2 }),
    ];
    const merged = mergeLifelenzScheduleVarianceDelta(prev, [], { daysBack: 400 });
    expect(merged).toHaveLength(2);
  });

  it('a cached row that has aged out of the current window is pruned, even with an empty delta', () => {
    const farPast = row('3708', 'jsmith', '2020-01-01T00:00:00', 0, { hoursVariance: 1 }); // >45 days back
    const recent  = row('3708', 'jsmith', '2026-11-10T14:00:00', 0, { hoursVariance: 2 });
    const merged = mergeLifelenzScheduleVarianceDelta([farPast, recent], [], { daysBack: 45 });
    expect(merged.some(r => r.hoursVariance === 1)).toBe(false);
    expect(merged.some(r => r.hoursVariance === 2)).toBe(true);
  });

  it('different editors at the identical (loc,occurredAt,seq) are distinct keys, not collapsed into one row', () => {
    const prev = [
      row('3708', 'jsmith', '2026-11-10T14:00:00', 0, { hoursVariance: 1 }),
      row('3708', 'awilliams', '2026-11-10T14:00:00', 0, { hoursVariance: 2 }),
    ];
    const merged = mergeLifelenzScheduleVarianceDelta(prev, [], { daysBack: 400 });
    expect(merged).toHaveLength(2);
  });
});
