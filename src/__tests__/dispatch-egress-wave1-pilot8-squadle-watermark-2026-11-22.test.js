// @vitest-environment happy-dom
// @ts-nocheck
// Egress Wave 1 delta-sync pilot #8 (2026-11-22) — watermark delta-sync for
// squadle_checklist_records. Same shape as the prior pilots, now that
// loadSquadleChecklistRecords's mapped return exposes `updatedAt` (it exposed nothing of the
// sort before this pilot).
//
// Critically, this table's real PK is (squadle_location_id, dt), NOT (loc, dt) —
// supabase/schema-squadle-checklist-records.sql's own header explains `loc` is derived from the
// record's `tags` field rather than being an independently-guaranteed-unique identifier. These
// tests exercise mergeSquadleDelta's merge key on `squadleLocationId`, not `loc`, to prove the
// real PK is what's used. maxUpdatedAt itself is already covered by the lifelenz_schedule
// pilot's own test file — not re-tested here.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, supabase: null }; // App.js's top-level code must not need a real client to import
});

const { mergeSquadleDelta } = await import('../app/App.js');

const row = (loc, squadleLocationId, dateStr, extra = {}) => ({
  loc, squadleLocationId, date: new Date(dateStr + 'T00:00:00'), ...extra,
});

// Fixture dates for the non-prune tests below, computed relative to "now" rather than hardcoded
// literals -- the same reasoning as the prune test's own recentDate further down (a hardcoded
// literal here is the identical time bomb, just with a longer fuse: these tests pass a generous
// daysBack:400, so a literal would only start failing ~400 days after it was written, exactly
// the kind of later-date rot memory/plan-egress-reduction-2026-11-20.md warns about). Two
// distinct days so the "different keys" tests still exercise genuinely different dates.
const _fixtureDt = (daysAgo) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); return d.toISOString().slice(0, 10); };
const DT1 = _fixtureDt(10);
const DT2 = _fixtureDt(9);

describe('mergeSquadleDelta', () => {
  it('a delta row overwrites the cached row with the same (squadleLocationId,date) key, not a duplicate', () => {
    const prev = [row('3708', '-M8rkFa0NUGRQPamf4CH', DT1, { shard: 'sqdl-prod-cd-001' })];
    const delta = [row('3708', '-M8rkFa0NUGRQPamf4CH', DT1, { shard: 'sqdl-prod-cd-002' })];
    const merged = mergeSquadleDelta(prev, delta, { daysBack: 400 });
    expect(merged).toHaveLength(1);
    expect(merged[0].shard).toBe('sqdl-prod-cd-002');
  });

  it('a delta row for a NEW squadleLocationId is added alongside the untouched cached rows', () => {
    const prev = [row('3708', '-M8rkFa0NUGRQPamf4CH', DT1)];
    const delta = [row('5183', '-M9xYz1pOVHSRQQbng5DI', DT2)];
    const merged = mergeSquadleDelta(prev, delta, { daysBack: 400 });
    expect(merged).toHaveLength(2);
  });

  it('an empty delta leaves every cached row untouched (the "nothing changed" case)', () => {
    const prev = [
      row('3708', '-M8rkFa0NUGRQPamf4CH', DT1),
      row('3708', '-M8rkFa0NUGRQPamf4CH', DT2),
    ];
    const merged = mergeSquadleDelta(prev, [], { daysBack: 400 });
    expect(merged).toHaveLength(2);
  });

  it('a cached row that has aged out of the current window is pruned, even with an empty delta', () => {
    // `recent` must stay well inside the 30-day window on every run — this is the tightest
    // window of all the watermark pilots, so it was the first one due to rot. See
    // memory/plan-egress-reduction-2026-11-20.md's standing warning. Compute it relative to now.
    const d = new Date(); d.setDate(d.getDate() - 5);
    const recentDate = d.toISOString().slice(0, 10);
    const farPast = row('3708', '-M8rkFa0NUGRQPamf4CH', '2020-01-01', { shard: 'old' }); // >30 days back
    const recent  = row('3708', '-M8rkFa0NUGRQPamf4CH', recentDate, { shard: 'new' });
    const merged = mergeSquadleDelta([farPast, recent], [], { daysBack: 30 });
    expect(merged.some(r => r.shard === 'old')).toBe(false);
    expect(merged.some(r => r.shard === 'new')).toBe(true);
  });

  it('two different squadleLocationIds that happen to share the same (synthetic) loc on the same date are distinct keys, not collapsed — the exact reason this table is keyed on squadleLocationId, not loc', () => {
    const prev = [
      row('3708', '-M8rkFa0NUGRQPamf4CH', DT1, { shard: 'a' }),
      row('3708', '-M9xYz1pOVHSRQQbng5DI', DT1, { shard: 'b' }),
    ];
    const merged = mergeSquadleDelta(prev, [], { daysBack: 400 });
    expect(merged).toHaveLength(2);
  });
});
