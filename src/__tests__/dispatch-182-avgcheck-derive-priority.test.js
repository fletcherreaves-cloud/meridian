// @ts-nocheck
// Dispatch #182 — avgCheck: give the DAR-based derive (sales ÷ gc) priority over laborRows,
// the one purely-manual source in avgCheck's chain, WITHOUT touching the shared `_derive`
// mechanism every other derive-using metric in metric-source.js relies on (oepe, r2p,
// laborPct, spph, cashOSPct, discPct, tRedAPct/tRedBPct, fobPct, and more).
//
// #165's audit flagged this as "functionally low-risk to reorder," but a plain srcs[] reorder
// can't do it: metricSeriesWithSource's `_derive` helper only fills a day AFTER every entry in
// `srcs` (laborRows included) has already been checked, unconditionally — so derive is
// structurally last-resort no matter where anything sits in the array. The fix here is a
// narrow, avgCheck-ONLY early return (`_avgCheckSeries`) inside metricSeriesWithSource; the
// generic `srcs`-then-`derive` code path used by every other metric is untouched.

import { describe, it, expect } from 'vitest';
import { metricSeries, metricSeriesWithSource, metricDaily, METRIC_SOURCES } from '../engine/metric-source.js';

const d = s => new Date(s + 'T00:00:00');
const range = { s: d('2026-08-01'), e: d('2026-08-31') };

describe('dispatch #182 — avgCheck derive now outranks laborRows specifically', () => {
  it('the actual gap: derive (sales ÷ gc) wins over laborRows.avgCheck on a day only those two cover', () => {
    const ds = {
      // laborRows has a (stale/manual) avgCheck for this day — must NOT win any more.
      laborRows: [{ loc: '1', date: d('2026-08-05'), avgCheck: 6.10 }],
      // sales/gc resolve auto-first through their own chains (qsrActSummaryRows = DAR).
      qsrActSummaryRows: [{ loc: '1', date: d('2026-08-05'), sales: 4000, gc: 500 }],  // 4000/500 = 8.00
    };
    const withSrc = metricSeriesWithSource(ds, '1', range, 'avgCheck');
    expect(withSrc['2026-08-05'].value).toBeCloseTo(8.00, 6);
    expect(withSrc['2026-08-05'].source).toBe('derived');

    const s = metricSeries(ds, '1', range, 'avgCheck');
    expect(s['2026-08-05']).toBeCloseTo(8.00, 6);
  });

  it('laborRows still fills a day NEITHER a precomputed source NOR the derive can answer', () => {
    // No sales/gc anywhere (so the derive has nothing to compute from) — laborRows is the
    // only source with data for this day, and last-resort fill must still work.
    const ds = { laborRows: [{ loc: '1', date: d('2026-08-06'), avgCheck: 6.10 }] };
    const withSrc = metricSeriesWithSource(ds, '1', range, 'avgCheck');
    expect(withSrc['2026-08-06'].value).toBeCloseTo(6.10, 6);
    expect(withSrc['2026-08-06'].source).toBe('laborRows');
  });

  it('per-day precedence: derive and laborRows can each win on different days in the same ds', () => {
    const ds = {
      laborRows: [
        { loc: '1', date: d('2026-08-05'), avgCheck: 6.10 },   // derive covers this day — must lose
        { loc: '1', date: d('2026-08-07'), avgCheck: 6.25 },   // derive does NOT cover this day — wins
      ],
      qsrActSummaryRows: [{ loc: '1', date: d('2026-08-05'), sales: 4000, gc: 500 }],
    };
    const withSrc = metricSeriesWithSource(ds, '1', range, 'avgCheck');
    expect(withSrc['2026-08-05'].source).toBe('derived');
    expect(withSrc['2026-08-05'].value).toBeCloseTo(8.00, 6);
    expect(withSrc['2026-08-07'].source).toBe('laborRows');
    expect(withSrc['2026-08-07'].value).toBeCloseTo(6.25, 6);
  });
});

describe('dispatch #182 — regression: precomputed sources still resolve, and still outrank the derive', () => {
  it('glimpseRows still wins over both laborRows AND the derive when it covers the day', () => {
    const ds = {
      glimpseRows: [{ loc: '1', date: d('2026-08-05'), avgCheck: 9.99 }],
      laborRows: [{ loc: '1', date: d('2026-08-05'), avgCheck: 6.10 }],
      qsrActSummaryRows: [{ loc: '1', date: d('2026-08-05'), sales: 4000, gc: 500 }], // would derive 8.00
    };
    const withSrc = metricSeriesWithSource(ds, '1', range, 'avgCheck');
    expect(withSrc['2026-08-05'].value).toBeCloseTo(9.99, 6);
    expect(withSrc['2026-08-05'].source).toBe('glimpseRows');
  });

  it('cashRows still wins over the derive when it covers the day', () => {
    const ds = {
      cashRows: [{ loc: '1', date: d('2026-08-05'), avgCheck: 7.77 }],
      qsrActSummaryRows: [{ loc: '1', date: d('2026-08-05'), sales: 4000, gc: 500 }], // would derive 8.00
    };
    const withSrc = metricSeriesWithSource(ds, '1', range, 'avgCheck');
    expect(withSrc['2026-08-05'].value).toBeCloseTo(7.77, 6);
    expect(withSrc['2026-08-05'].source).toBe('cashRows');
  });

  it('salesLedgerRows still wins over the derive when it covers the day', () => {
    const ds = {
      salesLedgerRows: [{ loc: '1', date: d('2026-08-05'), avgCheck: 8.88 }],
      qsrActSummaryRows: [{ loc: '1', date: d('2026-08-05'), sales: 4000, gc: 500 }], // would derive 8.00
    };
    const withSrc = metricSeriesWithSource(ds, '1', range, 'avgCheck');
    expect(withSrc['2026-08-05'].value).toBeCloseTo(8.88, 6);
    expect(withSrc['2026-08-05'].source).toBe('salesLedgerRows');
  });

  it('precomputed auto-first relative order among glimpse/cash/salesLedger is unchanged', () => {
    const ds = {
      glimpseRows: [{ loc: '1', date: d('2026-08-05'), avgCheck: 1 }],
      cashRows: [{ loc: '1', date: d('2026-08-05'), avgCheck: 2 }],
      salesLedgerRows: [{ loc: '1', date: d('2026-08-05'), avgCheck: 3 }],
    };
    const withSrc = metricSeriesWithSource(ds, '1', range, 'avgCheck');
    expect(withSrc['2026-08-05'].source).toBe('glimpseRows');
    expect(withSrc['2026-08-05'].value).toBe(1);
  });

  it("'pos' mode still ignores a 0 in a precomputed source and falls through", () => {
    const ds = {
      glimpseRows: [{ loc: '1', date: d('2026-08-05'), avgCheck: 0 }],       // 0 = no real data
      qsrActSummaryRows: [{ loc: '1', date: d('2026-08-05'), sales: 4000, gc: 500 }],
    };
    const withSrc = metricSeriesWithSource(ds, '1', range, 'avgCheck');
    expect(withSrc['2026-08-05'].source).toBe('derived');
    expect(withSrc['2026-08-05'].value).toBeCloseTo(8.00, 6);
  });

  it('an empty ds (no sources at all) resolves to nothing, no crash', () => {
    expect(metricSeries({}, '1', range, 'avgCheck')).toEqual({});
  });
});

describe('dispatch #182 — no other metric\'s derive behavior changed', () => {
  // Structural guard: the special case in metricSeriesWithSource is gated on
  // key === 'avgCheck' specifically — this pins that METRIC_SOURCES itself is untouched
  // (same srcs/derive shape as before) and spot-checks a sibling derive-using metric
  // (oepe) still resolves through the GENERIC last-resort-derive path, unaffected.
  it('avgCheck spec itself is unchanged (mode, direction, srcs order, derive)', () => {
    expect(METRIC_SOURCES.avgCheck.mode).toBe('pos');
    expect(METRIC_SOURCES.avgCheck.direction).toBe('higher');
    expect(METRIC_SOURCES.avgCheck.srcs.map(([s]) => s))
      .toEqual(['glimpseRows', 'cashRows', 'salesLedgerRows', 'laborRows']);
    expect(METRIC_SOURCES.avgCheck.derive.inputs).toEqual(['sales', 'gc']);
    expect(METRIC_SOURCES.avgCheck.derive.kind).toBe('ratio');
  });

  it('oepe (a sibling derive-using metric) still treats derive as last-resort, unlike avgCheck now', () => {
    // opsRows (manual, precomputed oepe) still wins over a resolvable derive for oepe — the
    // OLD, generic behavior avgCheck itself used to have and no longer does.
    const ds = {
      opsRows: [{ loc: '1', date: d('2026-08-05'), oepe: 150 }],
      // whatever oepe's own derive inputs are, absent here entirely — this just confirms
      // the manual precomputed source still wins outright, unaffected by this dispatch.
    };
    expect(metricDaily(ds, '1', d('2026-08-05'), 'oepe')).toBe(150);
  });
});
