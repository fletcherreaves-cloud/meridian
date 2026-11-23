// @vitest-environment happy-dom
// @ts-nocheck
// Egress Wave 2 pilot #3 (2026-11-23) — watermark delta-sync for lifelenz_attendance_summary.
// The Section 17 readiness audit (2026-11-22, memory/plan-egress-reduction-2026-11-20.md) flagged
// this table's write path as unsafe for delta-sync — "pulled_at is never set on the upserted
// row, only on first insert via the column default" — and filed it as Wave 2, pending a
// pull-script fix. Re-reading scripts/lifelenz-attendance-pull.mjs before building found that
// fix was ALREADY SHIPPED on 2026-11-16 (commit 5b56302, `git blame`-confirmed), six days before
// the audit that claimed otherwise and never re-verified. No pull-script change was needed for
// this pilot — only the loader's `since` option.
//
// _stLifelenzAttendance now asks Supabase for only rows whose `pulled_at` moved since the last
// sync (loadLifeLenzAttendance's `since` param) instead of re-fetching the whole `daysBack`
// window every login, then MERGES the delta into the cached array by (loc,periodEnd) — the
// table's real PK (onConflict:'loc,period_end' in upsertSummary()) — instead of replacing it.
// `date`/`periodEnd` are plain 'YYYY-MM-DD' strings here (unlike the qsrActSummaryRows/hmeDt/
// squadle pilots' Date objects), so the merge key and window-prune use a plain string compare,
// same shape as mergeLifelenzEmployeePerformanceDelta's own key.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, supabase: null }; // App.js's top-level code must not need a real client to import
});

const { mergeLifelenzAttendanceDelta } = await import('../app/App.js');

const row = (loc, periodEnd, extra = {}) => ({ loc, date: periodEnd, periodEnd, ...extra });

describe('mergeLifelenzAttendanceDelta', () => {
  it('a delta row overwrites the cached row with the same (loc,periodEnd) key, not a duplicate', () => {
    const prev = [row('3708', '2026-11-15', { unexcusedAbsences: 2 })];
    const delta = [row('3708', '2026-11-15', { unexcusedAbsences: 5 })];
    const merged = mergeLifelenzAttendanceDelta(prev, delta, { daysBack: 400 });
    expect(merged).toHaveLength(1);
    expect(merged[0].unexcusedAbsences).toBe(5);
  });

  it('a delta row for a NEW (loc,periodEnd) is added alongside the untouched cached rows', () => {
    const prev = [row('3708', '2026-11-15', { unexcusedAbsences: 2 })];
    const delta = [row('5183', '2026-11-16', { unexcusedAbsences: 1 })];
    const merged = mergeLifelenzAttendanceDelta(prev, delta, { daysBack: 400 });
    expect(merged).toHaveLength(2);
    expect(merged.find(r => r.loc === '3708').unexcusedAbsences).toBe(2);
    expect(merged.find(r => r.loc === '5183').unexcusedAbsences).toBe(1);
  });

  it('an empty delta leaves every cached row untouched (the "nothing changed" case)', () => {
    const prev = [row('3708', '2026-11-15', { unexcusedAbsences: 2 }), row('3708', '2026-11-16', { unexcusedAbsences: 3 })];
    const merged = mergeLifelenzAttendanceDelta(prev, [], { daysBack: 400 });
    expect(merged).toHaveLength(2);
  });

  it('a cached row that has aged out of the current window is pruned, even with an empty delta', () => {
    const farPast = row('3708', '2020-01-01', { unexcusedAbsences: 1 }); // >45 days back
    const recentDate = new Date(); recentDate.setDate(recentDate.getDate() - 5);
    const recent = row('3708', recentDate.toISOString().slice(0, 10), { unexcusedAbsences: 2 });
    const merged = mergeLifelenzAttendanceDelta([farPast, recent], [], { daysBack: 45 });
    expect(merged.some(r => r.unexcusedAbsences === 1)).toBe(false);
    expect(merged.some(r => r.unexcusedAbsences === 2)).toBe(true);
  });

  it('different stores on the same periodEnd are distinct keys, not collapsed into one row', () => {
    const prev = [row('3708', '2026-11-15', { unexcusedAbsences: 2 }), row('5183', '2026-11-15', { unexcusedAbsences: 7 })];
    const merged = mergeLifelenzAttendanceDelta(prev, [], { daysBack: 400 });
    expect(merged).toHaveLength(2);
  });

  it('defaults daysBack to 45 (the stream\'s real fetch window) when not given', () => {
    const farPast = row('3708', '2026-01-01', { unexcusedAbsences: 1 }); // >45 days before "now"
    const recent  = row('3708', new Date().toISOString().slice(0, 10), { unexcusedAbsences: 2 });
    const merged = mergeLifelenzAttendanceDelta([farPast, recent], []);
    expect(merged.some(r => r.unexcusedAbsences === 1)).toBe(false);
    expect(merged.some(r => r.unexcusedAbsences === 2)).toBe(true);
  });
});
