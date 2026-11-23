// @vitest-environment happy-dom
// @ts-nocheck
// Egress Wave 2 pilot #2 (2026-11-23) — watermark delta-sync for the three emailed-report
// streams (daily_glimpse_daily / cash_sheet_daily / sales_ledger_daily,
// scripts/qsrsoft-email-parse.mjs). All three upsert with the same default onConflict:'loc,date'
// (mapGlimpse/mapCashSheet/mapSalesLedger never override it), so (loc,date) is each table's real
// PK, and all three set `updated_at` unconditionally on every write — same guarantee every prior
// pilot verified. Confirmed upsert-only (no `.delete(` against any of the three tables anywhere
// in src/ or scripts/).
//
// `_stCloudEmailReport` now asks Supabase for only rows whose `updated_at` moved since each
// stream's OWN last sync (loadGlimpse/loadCash/loadSalesLedger's new `since` param) instead of
// re-fetching the whole `daysBack` window every login, then MERGES each stream's delta into its
// own cached array by (loc,date) via the shared mergeEmailReportDelta — one function for all
// three since they are structurally identical (same PK, same `date` Date-object shape, same
// upsert-only write path). maxUpdatedAt itself is already covered by the lifelenz_schedule
// pilot's own test file — not re-tested here.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, supabase: null }; // App.js's top-level code must not need a real client to import
});

const { mergeEmailReportDelta } = await import('../app/App.js');

const row = (loc, dateStr, extra = {}) => ({ loc, date: new Date(dateStr + 'T00:00:00'), ...extra });

describe('mergeEmailReportDelta', () => {
  it('a delta row overwrites the cached row with the same (loc,date) key, not a duplicate', () => {
    const prev = [row('3708', '2026-11-10', { allNetSales: 1000 })];
    const delta = [row('3708', '2026-11-10', { allNetSales: 1250 })];
    const merged = mergeEmailReportDelta(prev, delta, { daysBack: 400 });
    expect(merged).toHaveLength(1);
    expect(merged[0].allNetSales).toBe(1250);
  });

  it('a delta row for a NEW (loc,date) is added alongside the untouched cached rows', () => {
    const prev = [row('3708', '2026-11-10', { allNetSales: 1000 })];
    const delta = [row('5183', '2026-11-11', { allNetSales: 2000 })];
    const merged = mergeEmailReportDelta(prev, delta, { daysBack: 400 });
    expect(merged).toHaveLength(2);
    expect(merged.find(r => r.loc === '3708').allNetSales).toBe(1000);
    expect(merged.find(r => r.loc === '5183').allNetSales).toBe(2000);
  });

  it('an empty delta leaves every cached row untouched (the "nothing changed" case)', () => {
    const prev = [row('3708', '2026-11-10', { allNetSales: 1000 }), row('3708', '2026-11-11', { allNetSales: 1100 })];
    const merged = mergeEmailReportDelta(prev, [], { daysBack: 400 });
    expect(merged).toHaveLength(2);
  });

  it('a cached row that has aged out of the current window is pruned, even with an empty delta', () => {
    const farPast = row('3708', '2020-01-01', { allNetSales: 1 }); // >60 days back
    const recent  = row('3708', '2026-11-10', { allNetSales: 2 });
    const merged = mergeEmailReportDelta([farPast, recent], [], { daysBack: 60 });
    expect(merged.some(r => r.allNetSales === 1)).toBe(false);
    expect(merged.some(r => r.allNetSales === 2)).toBe(true);
  });

  it('different stores on the same date are distinct keys, not collapsed into one row', () => {
    const prev = [row('3708', '2026-11-10', { allNetSales: 1000 }), row('5183', '2026-11-10', { allNetSales: 2000 })];
    const merged = mergeEmailReportDelta(prev, [], { daysBack: 400 });
    expect(merged).toHaveLength(2);
  });

  it('is shared correctly across all three streams\' own row shapes (glimpse/cash/salesLedger fields)', () => {
    // Not every field is identical across the three tables, but the merge only ever touches
    // `loc`/`date` for its key -- confirms the shared function doesn't assume a glimpse-only or
    // cash-only field exists on every row.
    const glimpseRow = row('3708', '2026-11-10', { oepe: 95.2, kvst: 4.1 });
    const cashRow = row('3708', '2026-11-10', { doorDashSales: 500, cashOS: -2.5 });
    const ledgerRow = row('3708', '2026-11-10', { dtSales: 800, bfSales: 300 });
    expect(mergeEmailReportDelta([], [glimpseRow], {})[0].oepe).toBe(95.2);
    expect(mergeEmailReportDelta([], [cashRow], {})[0].doorDashSales).toBe(500);
    expect(mergeEmailReportDelta([], [ledgerRow], {})[0].dtSales).toBe(800);
  });
});
