// @vitest-environment happy-dom
// @ts-nocheck
// Egress Wave 1 delta-sync pilot #6 (2026-11-22) — watermark delta-sync for
// lifelenz_payroll_readiness. Same shape as pilots #1-#5, now that
// loadLifeLenzPayrollReadiness's mapped return shape actually exposes `payrollEntryId` — fixed
// in the SAME commit as this pilot (the loader previously had no `payrollEntryId` field at all,
// even though `(loc, payroll_entry_id)` is the table's real primary key —
// supabase/schema-lifelenz-payroll-readiness.sql:35-71 — re-keyed from the original wrong
// `(loc, geid, pay_period_start)` guess after a live measurement found one real pay period held
// 13 separate shift rows under the old key).
//
// _stPayrollReadiness now asks Supabase for only rows whose `updated_at` moved since the last
// sync (loadLifeLenzPayrollReadiness's `since` param) instead of re-fetching the whole
// `daysBack` window every login, then MERGES the delta into the cached array by
// (loc, payrollEntryId) instead of replacing it. maxUpdatedAt itself is already covered by the
// lifelenz_schedule pilot's own test file — not re-tested here.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, supabase: null }; // App.js's top-level code must not need a real client to import
});

const { mergeLifelenzPayrollReadinessDelta } = await import('../app/App.js');

const row = (loc, payrollEntryId, payPeriodStart, extra = {}) => ({ loc, payrollEntryId, payPeriodStart, ...extra });

// Fixture dates for the non-prune tests below, computed relative to "now" rather than hardcoded
// literals -- the same reasoning the prune test below already states (the merge's cutoff is
// computed from the real new Date(), so a hardcoded literal here is the identical time bomb,
// just with a longer fuse: these tests pass a generous daysBack:400, so a literal would only
// start failing ~400 days after it was written). Two distinct days so the "different keys" tests
// still exercise genuinely different payPeriodStarts.
const _fixtureDt = (daysAgo) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); return d.toISOString().slice(0, 10); };
const DT1 = _fixtureDt(10);
const DT2 = _fixtureDt(3);

describe('mergeLifelenzPayrollReadinessDelta', () => {
  it('a delta row overwrites the cached row with the same (loc,payrollEntryId) key, not a duplicate', () => {
    const prev = [row('3708', 'entry-001', DT1, { overtimeHours: 2 })];
    const delta = [row('3708', 'entry-001', DT1, { overtimeHours: 4 })];
    const merged = mergeLifelenzPayrollReadinessDelta(prev, delta, { daysBack: 400 });
    expect(merged).toHaveLength(1);
    expect(merged[0].overtimeHours).toBe(4);
  });

  it('multiple shift rows for the same employee/pay-period are distinct keys via payrollEntryId, not collapsed (the real-grain fix this pilot depends on)', () => {
    const prev = [
      row('3708', 'entry-001', DT1, { overtimeHours: 2 }),
      row('3708', 'entry-002', DT1, { overtimeHours: 1 }),
    ];
    const merged = mergeLifelenzPayrollReadinessDelta(prev, [], { daysBack: 400 });
    expect(merged).toHaveLength(2);
    expect(merged.some(r => r.payrollEntryId === 'entry-001' && r.overtimeHours === 2)).toBe(true);
    expect(merged.some(r => r.payrollEntryId === 'entry-002' && r.overtimeHours === 1)).toBe(true);
  });

  it('a delta row for a NEW key is added alongside the untouched cached rows', () => {
    const prev = [row('3708', 'entry-001', DT1, { overtimeHours: 2 })];
    const delta = [row('5183', 'entry-900', DT2, { overtimeHours: 5 })];
    const merged = mergeLifelenzPayrollReadinessDelta(prev, delta, { daysBack: 400 });
    expect(merged).toHaveLength(2);
    expect(merged.find(r => r.loc === '3708').overtimeHours).toBe(2);
    expect(merged.find(r => r.loc === '5183').overtimeHours).toBe(5);
  });

  it('an empty delta leaves every cached row untouched (the "nothing changed" case)', () => {
    const prev = [
      row('3708', 'entry-001', DT1, { overtimeHours: 2 }),
      row('3708', 'entry-002', DT2, { overtimeHours: 1 }),
    ];
    const merged = mergeLifelenzPayrollReadinessDelta(prev, [], { daysBack: 400 });
    expect(merged).toHaveLength(2);
  });

  it('a cached row that has aged out of the current window is pruned, even with an empty delta', () => {
    // The merge's cutoff is computed from the real new Date() (App.js:1101), so "recent" must be
    // computed relative to today too -- a hardcoded date one day short of the 14-day cutoff is a
    // time bomb that flips the moment the suite runs a day later than the date it was written on.
    const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
    const farPast = row('3708', 'entry-001', '2020-01-01', { overtimeHours: 1 }); // always >14 days back
    const recent  = row('3708', 'entry-002', daysAgo(5), { overtimeHours: 2 }); // comfortably inside 14 days
    const merged = mergeLifelenzPayrollReadinessDelta([farPast, recent], [], { daysBack: 14 });
    expect(merged.some(r => r.overtimeHours === 1)).toBe(false);
    expect(merged.some(r => r.overtimeHours === 2)).toBe(true);
  });

  it('different stores at the identical payrollEntryId are distinct keys, not collapsed into one row', () => {
    const prev = [
      row('3708', 'entry-001', DT1, { overtimeHours: 2 }),
      row('5183', 'entry-001', DT1, { overtimeHours: 3 }),
    ];
    const merged = mergeLifelenzPayrollReadinessDelta(prev, [], { daysBack: 400 });
    expect(merged).toHaveLength(2);
  });
});
