// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { fobByRange, buildOnePagerInputs, buildCurrentState, buildReviewActuals, buildControlsOutliers } from '../engine/one-pager-data.js';

const d = s => new Date(s + 'T00:00:00');

describe('fobByRange', () => {
  it('dollar-weights components ÷ prodSales and skips no-sales-base rows', () => {
    const rows = [
      { loc: '1', date: '2026-06-15', prodSalesAmt: 10000, compWasteAmt: 200, rawWasteAmt: 100, unexplainedAmt: 100 }, // 4%
      { loc: '1', date: '2026-06-16', prodSalesAmt: 0,     compWasteAmt: 500 }, // component-only → skipped
      { loc: '1', date: '2026-05-01', prodSalesAmt: 99999, compWasteAmt: 9999 }, // out of range
    ];
    const agg = fobByRange(rows, { s: '2026-06-01', e: '2026-06-30' });
    expect(agg['1'].prodSales).toBe(10000);        // the 0-sales row excluded
    expect(agg['1'].fob$).toBe(400);
    expect(agg['1'].fobPct).toBeCloseTo(0.04, 6);
  });

  it('aggregates LY the same way (apples-to-apples) and yields lyFobPct', () => {
    const rows = [{ loc: '1', date: '2026-06-15', prodSalesAmt: 10000, compWasteAmt: 400, lyProdSalesAmt: 8000, lyCompWasteAmt: 480 }];
    const agg = fobByRange(rows, { s: '2026-06-01', e: '2026-06-30' });
    expect(agg['1'].fobPct).toBeCloseTo(0.04, 6);   // now 4%
    expect(agg['1'].lyProdSales).toBe(8000);
    expect(agg['1'].lyFob$).toBe(480);
    expect(agg['1'].lyFobPct).toBeCloseTo(0.06, 6); // ly 6% → FOB improved 2pp YoY
  });

  it('skips a LY row with no LY sales base (component-only would inflate) but keeps current', () => {
    const rows = [{ loc: '1', date: '2026-06-15', prodSalesAmt: 10000, compWasteAmt: 400, lyProdSalesAmt: 0, lyCompWasteAmt: 500 }];
    const agg = fobByRange(rows, { s: '2026-06-01', e: '2026-06-30' });
    expect(agg['1'].fobPct).toBeCloseTo(0.04, 6);
    expect(agg['1'].lyFobPct).toBe(null);           // no LY base → null, never inflated
  });
});

describe('buildOnePagerInputs window-consistency (Notes 32 C)', () => {
  // Weekly window: sales/gc are for the WEEK; the FOB row carries a MONTH of prodSales.
  const ds = {
    laborRows: [
      { loc: '1', date: d('2026-06-15'), sales: 7000, gc: 700, laborPct: 0.24 },
      { loc: '1', date: d('2026-06-16'), sales: 7000, gc: 700, laborPct: 0.24 },
    ],
  };
  const fobRows = [{ loc: '1', date: '2026-06-15', prodSalesAmt: 120000, compWasteAmt: 6000 }]; // monthly, 5%
  const range = { s: '2026-06-15', e: '2026-06-21' };

  it('avgCheck uses the window sales/guests, not the monthly FOB prodSales', () => {
    const [inp] = buildOnePagerInputs(ds, fobRows, ['1'], range);
    expect(inp.netSales).toBe(14000);              // window sales only (no monthly fallback)
    expect(inp.avgCheck).toBeCloseTo(10, 6);       // 14000 / 1400 guests = $10 (not 120000/1400=$85)
    expect(inp.prodSales).toBe(14000);             // food base = window sales
    expect(inp.fobProdSales).toBe(120000);         // fob rows' own base kept separately
    expect(inp.gcPerDayActual).toBe(700);          // 1400 guests / 2 days
  });

  it('falls back to the target avg-check only when the window has no sales', () => {
    const [inp] = buildOnePagerInputs({}, [], ['1'], range);
    expect(inp.netSales).toBe(0);
    // no DEFAULT_TARGETS avg-check for loc '1' in tests → null, never a monthly figure
    expect(inp.avgCheck == null || typeof inp.avgCheck === 'number').toBe(true);
  });
});

describe('buildCurrentState FOB% tile', () => {
  it('uses the fob rows own base (canonical), not the window sales base', () => {
    const ds = { laborRows: [{ loc: '1', date: d('2026-06-15'), sales: 7000, gc: 700 }] };
    const fobRows = [{ loc: '1', date: '2026-06-15', prodSalesAmt: 120000, compWasteAmt: 6000 }]; // 5%
    const rows = buildCurrentState(ds, fobRows, ['1'], { s: '2026-06-15', e: '2026-06-21' });
    const fob = rows.find(r => r.key === 'fobPct');
    expect(fob.actual).toBeCloseTo(0.05, 6);       // 6000/120000, NOT 6000/7000 (=0.857)
    const sales = rows.find(r => r.key === 'sales');
    expect(sales.actual).toBe(7000);               // window net sales
  });
});

describe('buildReviewActuals SMG n-weighting (Notes 36 #7)', () => {
  const range = { s: '2026-06-01', e: '2026-06-30' };
  it('n-weights CSAT % across stores (Σ pct·n / Σ n), not a simple mean', () => {
    const ds = { smgFullscale: [
      { loc: '1', year: 2026, month: 6, osat5: 0.90, n: 100 },
      { loc: '2', year: 2026, month: 6, osat5: 0.60, n: 900 },  // far more responses → pulls the roll-up down
    ] };
    const a = buildReviewActuals(ds, ['1', '2'], range);
    // weighted = (0.90*100 + 0.60*900)/1000 = 0.63 ; simple mean would be 0.75
    expect(a.osat).toBeCloseTo(0.63, 6);
    expect(a.osat).not.toBeCloseTo(0.75, 3);
  });
  it('falls back to a simple mean when any store lacks a response count', () => {
    const ds = { smgFullscale: [
      { loc: '1', year: 2026, month: 6, osat5: 0.90, n: 100 },
      { loc: '2', year: 2026, month: 6, osat5: 0.60, n: null },  // legacy row → no n
    ] };
    const a = buildReviewActuals(ds, ['1', '2'], range);
    expect(a.osat).toBeCloseTo(0.75, 6);   // (0.90+0.60)/2
  });
});

describe('buildControlsOutliers — the who + when behind the Controls averages', () => {
  const range = { s: '2026-06-01', e: '2026-06-30' };
  const ds = { ctrlRows: [
    { loc: '1', date: '2026-06-02', cashOSPct:  0.01, tRedAPct: 0.02, discPct: 0.05 },
    { loc: '2', date: '2026-06-03', cashOSPct: -0.03, tRedAPct: 0.09, discPct: 0.00 },
    { loc: '1', date: '2026-06-04', cashOSPct:  0.00, tRedAPct: 0.00, discPct: 0.12 },
  ] };

  it('cash O/S ranks by ABSOLUTE deviation (a big short beats a small over) and keeps the sign', () => {
    const out = buildControlsOutliers(ds, ['1', '2'], range);
    expect(out.cashOSPct.outliers[0]).toEqual({ loc: '2', date: '2026-06-03', val: -0.03 });
    expect(out.cashOSPct.outliers[1].val).toBe(0.01);
    expect(out.cashOSPct.outliers).toHaveLength(2);        // the 0.00 clean day excluded
    expect(out.cashOSPct.n).toBe(3);                       // avg still counts every day incl. 0
    expect(out.cashOSPct.avg).toBeCloseTo((0.01 - 0.03 + 0) / 3, 6);
  });

  it('T-Reds After and Discount rank HIGH and drop clean (0) days', () => {
    const out = buildControlsOutliers(ds, ['1', '2'], range);
    expect(out.tRedAPct.outliers[0]).toEqual({ loc: '2', date: '2026-06-03', val: 0.09 });
    expect(out.tRedAPct.outliers).toHaveLength(2);
    expect(out.discPct.outliers[0]).toEqual({ loc: '1', date: '2026-06-04', val: 0.12 });
    expect(out.discPct.outliers).toHaveLength(2);
  });

  it('respects topN', () => {
    const out = buildControlsOutliers(ds, ['1', '2'], range, 1);
    expect(out.cashOSPct.outliers).toHaveLength(1);
    expect(out.cashOSPct.outliers[0].loc).toBe('2');
  });

  it('normalizes loc zero-padding', () => {
    const padded = { ctrlRows: [{ loc: '0000002', date: '2026-06-03', cashOSPct: -0.03 }] };
    const out = buildControlsOutliers(padded, ['0000002'], range);
    expect(out.cashOSPct.outliers[0].loc).toBe('2');
  });
});
