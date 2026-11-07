// @ts-nocheck
// Tests for scripts/movers-alert-run.mjs's pure buildSeriesByLoc() — the yoy%/guard math that
// feeds src/engine/movers-alert.js's evaluator. Guarded by `if (import.meta.url === ...)` in the
// script itself, so importing it here does not also run a live Supabase read.
import { describe, it, expect } from 'vitest';
import { buildSeriesByLoc } from '../../scripts/movers-alert-run.mjs';

const row = (loc, dt, sales, lySales, txns = 100, lyTxns = 100) => ({ loc, dt, product_sales: sales, ly_product_sales: lySales, transactions: txns, ly_transactions: lyTxns });

describe('buildSeriesByLoc', () => {
  it('computes sales-vs-LY% per (loc, date), grouped and ordered as given', () => {
    const rows = [row('3708', '2026-11-01', 9000, 10000), row('3708', '2026-11-02', 8000, 10000)];
    const byLoc = buildSeriesByLoc(rows);
    expect(byLoc['3708']).toEqual([
      { date: '2026-11-01', pct: -10, guestPct: 0 },
      { date: '2026-11-02', pct: -20, guestPct: 0 },
    ]);
  });

  it('drops a row whose LY sales are below the $1,000 comp-sanity floor — same guard moversStrip uses', () => {
    const rows = [row('3708', '2026-11-01', 900, 500)];
    expect(buildSeriesByLoc(rows)['3708']).toBeUndefined();
  });

  it('drops a row whose |pct| exceeds 200% — a bogus comp, not a real swing', () => {
    const rows = [row('3708', '2026-11-01', 50000, 10000)]; // +400%
    expect(buildSeriesByLoc(rows)['3708']).toBeUndefined();
  });

  it('drops a row the sanity band already nulls out (e.g. zero/negative current or LY sales)', () => {
    const rows = [row('3708', '2026-11-01', 0, 10000)];
    expect(buildSeriesByLoc(rows)['3708']).toBeUndefined();
  });

  it('keeps separate stores in separate series', () => {
    const rows = [row('3708', '2026-11-01', 9000, 10000), row('9999', '2026-11-01', 11000, 10000)];
    const byLoc = buildSeriesByLoc(rows);
    expect(Object.keys(byLoc).sort()).toEqual(['3708', '9999']);
    expect(byLoc['9999'][0].pct).toBe(10);
  });

  it('computes guestPct from transactions/ly_transactions independently of the sales guard', () => {
    const rows = [row('3708', '2026-11-01', 9000, 10000, 80, 100)];
    expect(buildSeriesByLoc(rows)['3708'][0].guestPct).toBe(-20);
  });
});
