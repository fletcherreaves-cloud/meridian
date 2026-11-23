// @vitest-environment happy-dom
// @ts-nocheck
// Egress Wave 1 delta-sync pilot #5 (2026-11-22) — watermark delta-sync for
// lifelenz_employee_performance. Unlike pilots #3/#4, this loader's mapped return already
// exposed its full real PK (loc, geid, periodEnd) verbatim before this pilot — no additive
// field fix was needed, confirmed by reading supabase/schema-lifelenz-employee-performance.sql
// before building rather than assuming based on pilot #4's surprise.
//
// _stEmployeePerformance now asks Supabase for only rows whose `updated_at` moved since the
// last sync (loadLifeLenzEmployeePerformance's `since` param) instead of re-fetching the whole
// `daysBack` window every login, then MERGES the delta into the cached array by
// (loc, geid, periodEnd) — the table's real PK — instead of replacing it. maxUpdatedAt itself is
// already covered by the lifelenz_schedule pilot's own test file — not re-tested here.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, supabase: null }; // App.js's top-level code must not need a real client to import
});

const { mergeLifelenzEmployeePerformanceDelta } = await import('../app/App.js');

const row = (loc, geid, periodEnd, extra = {}) => ({ loc, geid, periodEnd, ...extra });

describe('mergeLifelenzEmployeePerformanceDelta', () => {
  it('a delta row overwrites the cached row with the same (loc,geid,periodEnd) key, not a duplicate', () => {
    const prev = [row('3708', 'G12345', '2026-11-10', { attendanceRate: 90 })];
    const delta = [row('3708', 'G12345', '2026-11-10', { attendanceRate: 95 })];
    const merged = mergeLifelenzEmployeePerformanceDelta(prev, delta, { daysBack: 400 });
    expect(merged).toHaveLength(1);
    expect(merged[0].attendanceRate).toBe(95);
  });

  it('a delta row for a NEW key is added alongside the untouched cached rows', () => {
    const prev = [row('3708', 'G12345', '2026-11-10', { attendanceRate: 90 })];
    const delta = [row('5183', 'G67890', '2026-11-11', { attendanceRate: 80 })];
    const merged = mergeLifelenzEmployeePerformanceDelta(prev, delta, { daysBack: 400 });
    expect(merged).toHaveLength(2);
    expect(merged.find(r => r.loc === '3708').attendanceRate).toBe(90);
    expect(merged.find(r => r.loc === '5183').attendanceRate).toBe(80);
  });

  it('an empty delta leaves every cached row untouched (the "nothing changed" case)', () => {
    const prev = [
      row('3708', 'G12345', '2026-11-10', { attendanceRate: 90 }),
      row('3708', 'G67890', '2026-11-10', { attendanceRate: 85 }),
    ];
    const merged = mergeLifelenzEmployeePerformanceDelta(prev, [], { daysBack: 400 });
    expect(merged).toHaveLength(2);
  });

  it('a cached row that has aged out of the current window is pruned, even with an empty delta', () => {
    // `recent` must stay well inside the 60-day window on every run — see
    // memory/plan-egress-reduction-2026-11-20.md's standing warning against hardcoded fixture
    // dates in these window-prune tests. Compute it relative to now.
    const d = new Date(); d.setDate(d.getDate() - 5);
    const recentPeriodEnd = d.toISOString().slice(0, 10);
    const farPast = row('3708', 'G12345', '2020-01-01', { attendanceRate: 1 }); // >60 days back
    const recent  = row('3708', 'G12345', recentPeriodEnd, { attendanceRate: 2 });
    const merged = mergeLifelenzEmployeePerformanceDelta([farPast, recent], [], { daysBack: 60 });
    expect(merged.some(r => r.attendanceRate === 1)).toBe(false);
    expect(merged.some(r => r.attendanceRate === 2)).toBe(true);
  });

  it('two employees at the same (loc,periodEnd) are distinct keys, not collapsed into one row', () => {
    const prev = [
      row('3708', 'G12345', '2026-11-10', { attendanceRate: 90 }),
      row('3708', 'G67890', '2026-11-10', { attendanceRate: 85 }),
    ];
    const merged = mergeLifelenzEmployeePerformanceDelta(prev, [], { daysBack: 400 });
    expect(merged).toHaveLength(2);
  });

  it('different stores for the same geid are distinct keys, not collapsed into one row', () => {
    const prev = [
      row('3708', 'G12345', '2026-11-10', { attendanceRate: 90 }),
      row('5183', 'G12345', '2026-11-10', { attendanceRate: 80 }),
    ];
    const merged = mergeLifelenzEmployeePerformanceDelta(prev, [], { daysBack: 400 });
    expect(merged).toHaveLength(2);
  });
});
