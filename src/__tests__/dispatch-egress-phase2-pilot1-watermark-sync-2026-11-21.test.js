// @vitest-environment happy-dom
// @ts-nocheck
// Egress Phase 2 pilot #1 (2026-11-21) — watermark delta-sync for lifelenz_schedule. Owner
// approved both pieces this test covers: the custom_signals/staff_assignments updated_at DDL
// (unrelated to this file — see supabase/schema-egress-phase2-watermarks.sql) and this pilot.
//
// _stLifelenz now asks Supabase for only rows whose `updated_at` moved since the last sync
// (loadLifeLenzSchedule's `since` param) instead of re-fetching the whole ~210-day window every
// login, then MERGES the delta into the cached array by (loc,date) instead of replacing it —
// these tests exercise the two pure functions that make that safe: mergeLifelenzScheduleDelta
// (merge-by-key + window-prune) and maxUpdatedAt (server-timestamp-only watermark advance, never
// the client clock). See memory/plan-egress-reduction-2026-11-20.md Section 14.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, supabase: null }; // App.js's top-level code must not need a real client to import
});

const { mergeLifelenzScheduleDelta, maxUpdatedAt } = await import('../app/App.js');

const row = (loc, dateStr, extra = {}) => ({ loc, date: new Date(dateStr + 'T12:00:00'), ...extra });

describe('mergeLifelenzScheduleDelta', () => {
  it('a delta row overwrites the cached row with the same (loc,date) key, not a duplicate', () => {
    const prev = [row('3708', '2026-11-10', { sales: 100 })];
    const delta = [row('3708', '2026-11-10', { sales: 150 })];
    const merged = mergeLifelenzScheduleDelta(prev, delta, { daysBack: 400, daysFwd: 400 });
    expect(merged).toHaveLength(1);
    expect(merged[0].sales).toBe(150);
  });

  it('a delta row for a NEW (loc,date) is added alongside the untouched cached rows', () => {
    const prev = [row('3708', '2026-11-10', { sales: 100 })];
    const delta = [row('5183', '2026-11-11', { sales: 200 })];
    const merged = mergeLifelenzScheduleDelta(prev, delta, { daysBack: 400, daysFwd: 400 });
    expect(merged).toHaveLength(2);
    expect(merged.find(r => r.loc === '3708').sales).toBe(100);
    expect(merged.find(r => r.loc === '5183').sales).toBe(200);
  });

  it('an empty delta leaves every cached row untouched (the "nothing changed" case)', () => {
    const prev = [row('3708', '2026-11-10', { sales: 100 }), row('3708', '2026-11-11', { sales: 110 })];
    const merged = mergeLifelenzScheduleDelta(prev, [], { daysBack: 400, daysFwd: 400 });
    expect(merged).toHaveLength(2);
  });

  it('a cached row that has aged out of the current window is pruned, even with an empty delta', () => {
    // `recent` must stay well inside the 180-day window on every run, not just the day this test
    // was written — a hardcoded date literal here is exactly what broke two sibling watermark
    // test files on later dates (payroll-readiness 2026-11-22, dossier sparkline 2026-11-23); see
    // memory/plan-egress-reduction-2026-11-20.md's standing warning. Compute it relative to now.
    const recentDate = () => { const d = new Date(); d.setDate(d.getDate() - 5); return d.toISOString().slice(0, 10); };
    const farPast = row('3708', '2020-01-01', { sales: 1 }); // >400 days back from "today" in this test's frame
    const recent  = row('3708', recentDate(), { sales: 2 });
    const merged = mergeLifelenzScheduleDelta([farPast, recent], [], { daysBack: 180, daysFwd: 30 });
    expect(merged.some(r => r.sales === 1)).toBe(false);
    expect(merged.some(r => r.sales === 2)).toBe(true);
  });

  it('different stores on the same date are distinct keys, not collapsed into one row', () => {
    const prev = [row('3708', '2026-11-10', { sales: 100 }), row('5183', '2026-11-10', { sales: 200 })];
    const merged = mergeLifelenzScheduleDelta(prev, [], { daysBack: 400, daysFwd: 400 });
    expect(merged).toHaveLength(2);
  });
});

describe('maxUpdatedAt — server-timestamp-only watermark advance', () => {
  it('returns the single latest updatedAt across a batch of rows', () => {
    const rows = [
      row('3708', '2026-11-10', { updatedAt: '2026-11-21T10:00:00.000Z' }),
      row('3708', '2026-11-11', { updatedAt: '2026-11-21T14:00:00.000Z' }),
      row('3708', '2026-11-12', { updatedAt: '2026-11-21T08:00:00.000Z' }),
    ];
    expect(maxUpdatedAt(rows, null)).toBe('2026-11-21T14:00:00.000Z');
  });

  it('an empty batch (nothing changed this sync) returns the EXISTING watermark unchanged, not null or now()', () => {
    expect(maxUpdatedAt([], '2026-11-20T09:00:00.000Z')).toBe('2026-11-20T09:00:00.000Z');
  });

  it('never regresses the watermark below what it already was, even if a returned row has an older updatedAt than the current watermark', () => {
    const rows = [row('3708', '2026-11-10', { updatedAt: '2026-11-19T00:00:00.000Z' })];
    expect(maxUpdatedAt(rows, '2026-11-20T09:00:00.000Z')).toBe('2026-11-20T09:00:00.000Z');
  });

  it('a row with no updatedAt at all is ignored, not treated as the new max', () => {
    const rows = [row('3708', '2026-11-10', { updatedAt: null })];
    expect(maxUpdatedAt(rows, '2026-11-20T09:00:00.000Z')).toBe('2026-11-20T09:00:00.000Z');
  });

  it('with no prior watermark and no rows, returns null (first-ever sync of a genuinely empty result)', () => {
    expect(maxUpdatedAt([], null)).toBeNull();
  });
});
