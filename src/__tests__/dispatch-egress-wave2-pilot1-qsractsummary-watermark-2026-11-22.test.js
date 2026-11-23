// @vitest-environment happy-dom
// @ts-nocheck
// Egress Wave 2 pilot #1 (2026-11-22) — watermark delta-sync for qsr_daily_activity_rollup
// (ds.qsrActSummaryRows), the single heaviest T1 load in the app (loadQsrActSummary's own
// comment: ~1,650 rows/60-day window, the reason the Sales/vs-LY/Guest-Count/TPPH tiles are the
// last to appear). Wave 1 (the 9 Phase-1.5-cached LifeLenz/HME/Squadle streams) is fully closed
// per memory/plan-egress-reduction-2026-11-20.md Section 24; this starts Wave 2 on the broader
// ~56-table universe Section 13's audit identified, picking up the highest-value Phase 1
// cache-first-rendered stream that never got the actual delta-sync treatment.
//
// `_stQsrsoftActSummary` now asks Supabase for only rows whose `refreshed_at` moved since the
// last sync (loadQsrActSummary's new `since` option) instead of re-fetching the whole `daysBack`
// window every login, then MERGES the delta into the cached array by (loc,date) — the table's
// real PK (onConflict:'loc,dt' in scripts/qsrsoft-dar-pull.mjs's refreshRollup()) — instead of
// replacing it. `date` is a real Date object on these rows (same wrinkle as the hmeDt/squadle
// pilots), so the merge key re-derives a calendar-day string from it rather than trusting a
// pre-formatted field.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, supabase: null }; // App.js's top-level code must not need a real client to import
});

const { mergeQsrActSummaryDelta } = await import('../app/App.js');

const row = (loc, dateStr, extra = {}) => ({ loc, date: new Date(dateStr + 'T00:00:00'), ...extra });

describe('mergeQsrActSummaryDelta', () => {
  it('a delta row overwrites the cached row with the same (loc,date) key, not a duplicate', () => {
    const prev = [row('3708', '2026-11-10', { sales: 1000 })];
    const delta = [row('3708', '2026-11-10', { sales: 1250 })];
    const merged = mergeQsrActSummaryDelta(prev, delta, { daysBack: 400 });
    expect(merged).toHaveLength(1);
    expect(merged[0].sales).toBe(1250);
  });

  it('a delta row for a NEW (loc,date) is added alongside the untouched cached rows', () => {
    const prev = [row('3708', '2026-11-10', { sales: 1000 })];
    const delta = [row('5183', '2026-11-11', { sales: 2000 })];
    const merged = mergeQsrActSummaryDelta(prev, delta, { daysBack: 400 });
    expect(merged).toHaveLength(2);
    expect(merged.find(r => r.loc === '3708').sales).toBe(1000);
    expect(merged.find(r => r.loc === '5183').sales).toBe(2000);
  });

  it('an empty delta leaves every cached row untouched (the "nothing changed" case)', () => {
    const prev = [row('3708', '2026-11-10', { sales: 1000 }), row('3708', '2026-11-11', { sales: 1100 })];
    const merged = mergeQsrActSummaryDelta(prev, [], { daysBack: 400 });
    expect(merged).toHaveLength(2);
  });

  it('a cached row that has aged out of the current window is pruned, even with an empty delta', () => {
    // `recent` must stay well inside the 60-day window on every run — see
    // memory/plan-egress-reduction-2026-11-20.md's standing warning against hardcoded fixture
    // dates in these window-prune tests. Compute it relative to now.
    const d = new Date(); d.setDate(d.getDate() - 5);
    const recentDate = d.toISOString().slice(0, 10);
    const farPast = row('3708', '2020-01-01', { sales: 1 }); // >60 days back
    const recent  = row('3708', recentDate, { sales: 2 });
    const merged = mergeQsrActSummaryDelta([farPast, recent], [], { daysBack: 60 });
    expect(merged.some(r => r.sales === 1)).toBe(false);
    expect(merged.some(r => r.sales === 2)).toBe(true);
  });

  it('different stores on the same date are distinct keys, not collapsed into one row', () => {
    const prev = [row('3708', '2026-11-10', { sales: 1000 }), row('5183', '2026-11-10', { sales: 2000 })];
    const merged = mergeQsrActSummaryDelta(prev, [], { daysBack: 400 });
    expect(merged).toHaveLength(2);
  });

  it('defaults daysBack to 60 (the stream\'s real T1 fetch window) when not given', () => {
    const farPast = row('3708', '2026-01-01', { sales: 1 }); // >60 days before "now"
    const recent  = row('3708', new Date().toISOString().slice(0, 10), { sales: 2 });
    const merged = mergeQsrActSummaryDelta([farPast, recent], []);
    expect(merged.some(r => r.sales === 1)).toBe(false);
    expect(merged.some(r => r.sales === 2)).toBe(true);
  });
});
