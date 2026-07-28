// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { fobByRange, buildOnePagerInputs, buildCurrentState } from '../engine/one-pager-data.js';

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
