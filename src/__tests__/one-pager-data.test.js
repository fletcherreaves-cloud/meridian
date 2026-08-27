// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { fobByRange, buildOnePagerInputs, buildCurrentState, buildReviewActuals, buildControlsOutliers, summarizeCountStatus } from '../engine/one-pager-data.js';

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

  // qsr_fob is pulled ONE ROW PER DAY but the API is MONTH-KEYED — every row for a given
  // (loc, month) carries the CUMULATIVE month-to-date total as of that pull, not a daily
  // delta (the FOB-30x investigation: fobSnapshotByStore takes the latest row per month,
  // never sums). A full-month range must return the LAST day's cumulative value, never
  // the sum of every day's running total (which would ~15-30x-inflate both $ and sales).
  it('a full-month range with 3 cumulative daily snapshots returns the LATEST snapshot, not the sum', () => {
    const rows = [
      { loc: '1', date: '2026-06-10', prodSalesAmt: 100000, compWasteAmt: 2000 },  // MTD thru the 10th
      { loc: '1', date: '2026-06-20', prodSalesAmt: 220000, compWasteAmt: 4000 },  // MTD thru the 20th
      { loc: '1', date: '2026-06-30', prodSalesAmt: 330000, compWasteAmt: 6000 },  // MTD thru month-end (the true total)
    ];
    const agg = fobByRange(rows, { s: '2026-06-01', e: '2026-06-30' });
    expect(agg['1'].prodSales).toBe(330000);   // NOT 100000+220000+330000=650000
    expect(agg['1'].fob$).toBe(6000);          // NOT 2000+4000+6000=12000
    expect(agg['1'].fobPct).toBeCloseTo(6000 / 330000, 6);
  });

  it('a partial-month range (mid-month start) differences against the day-before baseline', () => {
    const rows = [
      { loc: '1', date: '2026-06-14', prodSalesAmt: 140000, compWasteAmt: 2800 },  // baseline (day before the window)
      { loc: '1', date: '2026-06-21', prodSalesAmt: 210000, compWasteAmt: 4200 },  // window end
    ];
    // "last 7 days" 06-15 → 06-21
    const agg = fobByRange(rows, { s: '2026-06-15', e: '2026-06-21' });
    expect(agg['1'].prodSales).toBe(70000);    // 210000 - 140000, the TRUE 7-day delta
    expect(agg['1'].fob$).toBe(1400);          // 4200 - 2800
  });

  // Found live 2026-08-27: production qsr_fob's own `actualFoodOverBase` report settles ONCE
  // near each month's start and then holds that exact value for the rest of the month (e.g.
  // store 6178 held 282347.08 unchanged for 26 straight days, Aug 1 through Aug 26 — confirmed
  // directly against production, not assumed). A single-month window that starts mid-month (like
  // "this week") diffs two IDENTICAL snapshots and got exactly zero — not a real "no activity"
  // result, a structural mismatch between this source's once-a-month cadence and a sub-month
  // window. This is the Leadership One-Pager's "Week of Aug 19" FOB tile showing $0/blank.
  it('a single-month mid-month-start window falls back to the month-to-date total when the source has NOT changed within the month (frozen-source real-world case)', () => {
    const rows = [
      { loc: '1', date: '2026-08-01', prodSalesAmt: 282347.08, compWasteAmt: 296.93 }, // settled at month start
      { loc: '1', date: '2026-08-16', prodSalesAmt: 282347.08, compWasteAmt: 296.93 }, // baseline (day before window) — UNCHANGED
      { loc: '1', date: '2026-08-23', prodSalesAmt: 282347.08, compWasteAmt: 296.93 }, // window end — UNCHANGED (frozen)
    ];
    // "Week of Aug 19": 08-17 → 08-23, entirely inside August, doesn't start at month-start.
    const agg = fobByRange(rows, { s: '2026-08-17', e: '2026-08-23' });
    // A naive diff (282347.08 - 282347.08) would be 0 → the pre-fix bug (blank/$0 tile).
    // The fallback instead surfaces August's real, settled MTD rate — a true, non-zero number.
    expect(agg['1'].prodSales).toBe(282347.08);
    expect(agg['1'].fob$).toBeCloseTo(296.93, 6);
    expect(agg['1'].fobPct).toBeCloseTo(296.93 / 282347.08, 6);
  });

  // Owner directive 2026-08-27, after an audit surfaced this exact multi-month case as a
  // residual of the same issue: *"whatever the latest data pulled is the number that should
  // be used."* This source cannot support a true sub-month delta at ANY window shape, so the
  // fallback is unconditional on segment count — every month segment independently falls back
  // to its own latest-pulled total when it has no distinguishable in-month delta, whether the
  // overall range spans one month or several. (This intentionally supersedes an earlier,
  // more conservative version of this same test that restricted the fallback to single-month
  // windows only, to avoid a perceived "double-counting" risk — the owner's directive settles
  // that a per-segment latest-pulled total is the correct answer everywhere, not just there.)
  it('the frozen-source fallback applies per-segment even across a multi-month-spanning window (owner directive: always use the latest pulled number)', () => {
    const rows = [
      { loc: '1', date: '2026-07-01', prodSalesAmt: 400000, compWasteAmt: 8000 }, // July settled, frozen all month
      { loc: '1', date: '2026-07-29', prodSalesAmt: 400000, compWasteAmt: 8000 }, // baseline (day before window) — frozen
      { loc: '1', date: '2026-08-01', prodSalesAmt: 50000,  compWasteAmt: 1000 }, // August MTD thru the 1st
    ];
    // window = 2026-07-30 → 2026-08-01 (crosses July→August).
    const agg = fobByRange(rows, { s: '2026-07-30', e: '2026-08-01' });
    // July segment: diff = 0 (frozen) → falls back to July's own latest-pulled total, 400000/8000.
    // August segment: no baseline (segStart === monthStart) → 50000/1000 as-is (unchanged).
    expect(agg['1'].prodSales).toBe(450000);
    expect(agg['1'].fob$).toBe(9000);
  });

  it('a range crossing a month boundary differences EACH month segment separately', () => {
    const rows = [
      { loc: '1', date: '2026-05-31', prodSalesAmt: 300000, compWasteAmt: 6000 },  // May's full-month total
      { loc: '1', date: '2026-05-29', prodSalesAmt: 280000, compWasteAmt: 5600 },  // May baseline (day before the window)
      { loc: '1', date: '2026-06-02', prodSalesAmt: 20000,  compWasteAmt: 400 },   // June MTD thru the 2nd (June resets to 0)
    ];
    // window = 2026-05-30 → 2026-06-02 (crosses May→June)
    const agg = fobByRange(rows, { s: '2026-05-30', e: '2026-06-02' });
    // May segment: 300000 (05-31, latest ≤ segEnd 05-31) - 280000 (baseline ≤ 05-29) = 20000
    // June segment: 20000 (06-02, no earlier June row → baseline 0) = 20000
    expect(agg['1'].prodSales).toBe(40000);
    expect(agg['1'].fob$).toBe(800);           // (6000-5600) + 400
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

describe('summarizeCountStatus — EOM count-completion rollup (Notes 47 v2)', () => {
  it('none when no status rows for the scope', () => {
    expect(summarizeCountStatus([], ['1']).none).toBe(true);
    expect(summarizeCountStatus([{ loc: '9', pctCounted: 0.5 }], ['1']).none).toBe(true);
  });

  it('notStarted when every scoped store reads 0% with no activity (mid-month, not "behind")', () => {
    const rows = [
      { loc: '1', pctCounted: 0, foodDone: false, condimentDone: false, lastActivityAt: null },
      { loc: '2', pctCounted: 0, foodDone: false, condimentDone: false, lastActivityAt: null },
    ];
    expect(summarizeCountStatus(rows, ['1', '2']).notStarted).toBe(true);
  });

  it('counts Food+Condiment complete and lists the lowest incomplete stores', () => {
    const rows = [
      { loc: '1', pctCounted: 1.0,  foodDone: true,  condimentDone: true },
      { loc: '2', pctCounted: 0.40, foodDone: true,  condimentDone: false },
      { loc: '3', pctCounted: 0.10, foodDone: false, condimentDone: false },
    ];
    const s = summarizeCountStatus(rows, ['1', '2', '3']);
    expect(s.n).toBe(3);
    expect(s.nDone).toBe(1);                          // only store 1 has BOTH classes done
    expect(s.avgPct).toBeCloseTo((1.0 + 0.40 + 0.10) / 3, 6);
    expect(s.behind.map(b => b.loc)).toEqual(['3', '2']);  // lowest first
    expect(s.behind[0].pct).toBeCloseTo(0.10, 6);
  });

  it('normalizes loc zero-padding on both the rows and the scope', () => {
    const rows = [{ loc: '0000002', pctCounted: 0.5, foodDone: false, condimentDone: false }];
    const s = summarizeCountStatus(rows, ['2']);
    expect(s.n).toBe(1);
    expect(s.behind[0].loc).toBe('2');
  });
});
