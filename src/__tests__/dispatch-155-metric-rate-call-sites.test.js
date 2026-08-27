// @ts-nocheck
// Dispatch #155 — extends dispatch #153's OEPE/R2P/TPPH completeness fix (metricRate, the Σ/Σ
// rollup with a metricAvg fallback -- see metric-source.js's own comment) to every OTHER call
// site whose range can genuinely include the current, still-open business day. Per CLAUDE.md's
// "would this verification still pass if the change were reverted?" rule, these tests exercise
// the REAL CONSUMER function (autoPopulateKPIs / buildLaborSummary / buildOpsSummary), not just
// metricRate/metricSumRatio in isolation -- a test that only imports the engine can't tell
// "converted" from "converted but the call site still reads metricAvg".
//
// Full per-call-site disposition (converted vs. left alone, and why) is in this dispatch's PR
// body -- this file covers the plain-function call sites; the React-component call sites
// (at-a-glance.js, signals.js, labor-tools.js, store-dash.js, attention-now.js) have their own
// render-based test files alongside this one.
import { describe, it, expect } from 'vitest';
import { autoPopulateKPIs } from '../engine/review-engine.js';
import { buildLaborSummary, buildOpsSummary } from '../views/sage.js';

// ── review-engine.js: autoPopulateKPIs' oepeAvg/r2pAvg (dispatch #155) ─────────────────────────
// monthRange(m) always returns the FULL calendar month, not clipped to "so far" -- and `months`
// (review.kpis.months) covers all 12 months of the review year, so a review actively being built
// for the CURRENT, still-in-progress month passes a range that includes today's open business day.
describe('autoPopulateKPIs OEPE/R2P use the Σ/Σ rollup for the current, in-progress month (dispatch #155)', () => {
  function blankMonths() { const m = {}; for (let i = 1; i <= 12; i++) m[i] = {}; return m; }

  it('oepe/r2p diverge from mean-of-daily when the review covers the current month', () => {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth() + 1;
    // First-of-month "complete" day (5x weight via the loop below) vs. TODAY, an in-progress
    // day with a much lower transaction count but a plausible (not absurd) per-transaction rate
    // -- the exact completeness-artifact shape dispatch #153 measured live on store 3708.
    const mkFirst = (i) => ({
      loc: '3708', date: new Date(y, m - 1, i, 12),
      _dtTotal: 50000000, _dtStore: 0, _dtHeldTime: 0, _dtCars: 1000,   // 50s/day
      _fcServe: 20000000, _fcDrawer: 0, _fcCnt: 500,                    // 40s/day
    });
    const todayRow = {
      loc: '3708', date: new Date(y, m - 1, now.getDate(), 12),
      _dtTotal: 20000000, _dtStore: 0, _dtHeldTime: 0, _dtCars: 100,    // 200s -- in-progress artifact
      _fcServe: 15000000, _fcDrawer: 0, _fcCnt: 60,                     // 250s -- in-progress artifact
    };
    const days = [1, 2, 3, 4, 5].filter(d => d !== now.getDate()).slice(0, 5).map(mkFirst);
    const ds = { loaded: true, qsrActSummaryRows: [...days, todayRow] };
    const review = { loc: '3708', year: y, half: 'H1', role: 'GM', kpis: { months: blankMonths() } };
    const r = autoPopulateKPIs(review, ds);
    const mo = r.kpis.months[m];
    // Hand-computed Σ/Σ (5 complete days @ the rates above + 1 in-progress day):
    const sumOepe = (50000000 * days.length + 20000000) / (1000 * days.length + 100) / 1000;
    const sumR2p = (20000000 * days.length + 15000000) / (500 * days.length + 60) / 1000;
    const meanOepe = (50 * days.length + 200) / (days.length + 1);
    const meanR2p = (40 * days.length + 250) / (days.length + 1);
    expect(mo.oepe).toBeCloseTo(sumOepe, 4);
    expect(mo.oepe).not.toBeCloseTo(meanOepe, 1);
    expect(mo.r2p).toBeCloseTo(sumR2p, 4);
    expect(mo.r2p).not.toBeCloseTo(meanR2p, 1);
    // Sanity: the Σ/Σ figure sits closer to the 5 complete days' own rate (50s/40s) than the
    // flat mean does -- the in-progress day is being weighted by its actual (low) volume, not
    // averaged in as if it were a full, representative day.
    expect(Math.abs(mo.oepe - 50)).toBeLessThan(Math.abs(meanOepe - 50));
    expect(Math.abs(mo.r2p - 40)).toBeLessThan(Math.abs(meanR2p - 40));
  });
});

// ── sage.js: buildLaborSummary's distAvgTpph / buildOpsSummary's distOepe (dispatch #155) ─────
// _lastNDaysRange's `e` is literally `new Date()` (no lastClosedBusinessDay clip), so SAGE's
// 60-day district figures always include today's still-open business day and are reported to
// the owner as fact whenever asked mid-day.
describe('SAGE district TPPH/OEPE use the Σ/Σ rollup, not a flat mean, over a window that includes today (dispatch #155)', () => {
  const today = new Date();
  const d = (daysAgo) => { const x = new Date(today); x.setDate(x.getDate() - daysAgo); return x; };

  it('buildLaborSummary distAvgTpph reflects Σgc/Σhrs, not the mean of 5 complete days + 1 inflated in-progress day', () => {
    const rows = [], glimpseRows = [];
    for (let i = 1; i <= 5; i++) {
      rows.push({ loc: '3708', date: d(i), gc: 1000, actHrs: 100 }); // tpph=10/day
      glimpseRows.push({ loc: '3708', date: d(i), laborPct: 0.28 }); // satisfies the totalDays>=5 gate (keyed off laborPct's own dayCount, not tpph's)
    }
    rows.push({ loc: '3708', date: d(0), gc: 15, actHrs: 1 }); // today, in-progress: tpph=15 (inflated)
    const ds = { qsrActSummaryRows: rows, glimpseRows };
    const out = buildLaborSummary(ds);
    expect(out).not.toBeNull();
    // Σ/Σ = (1000*5+15)/(100*5+1) = 5015/501 ≈ 10.01 -> "10.0"; mean-of-daily = (10*5+15)/6 ≈
    // 10.83 -> "10.8". Assert the Σ/Σ figure is what SAGE reports, and the mean-of-daily one is
    // NOT (a test that only checked "contains 10.0" could pass by coincidence on a formatting
    // change; asserting the mean-of-daily string is absent closes that gap).
    expect(out).toContain('TPPH 10.0');
    expect(out).not.toContain('TPPH 10.8');
  });

  it('buildOpsSummary distOepe reflects Σnum/Σden, not the mean of 5 complete days + 1 in-progress day', () => {
    const rows = [];
    for (let i = 1; i <= 5; i++) rows.push({ loc: '3708', date: d(i), _dtTotal: 50000000, _dtStore: 0, _dtHeldTime: 0, _dtCars: 1000 }); // 50s/day
    rows.push({ loc: '3708', date: d(0), _dtTotal: 20000000, _dtStore: 0, _dtHeldTime: 0, _dtCars: 100 }); // today, in-progress: 200s
    const ds = { qsrActSummaryRows: rows };
    const out = buildOpsSummary(ds);
    expect(out).not.toBeNull();
    // Σ/Σ = (50000000*5+20000000)/(1000*5+100)/1000 = 270000000/5100/1000 ≈ 52.94s -> "53s";
    // mean-of-daily = (50*5+200)/6 = 75.0s -> "75s".
    expect(out).toContain('District avg OEPE: 53s');
    expect(out).not.toContain('District avg OEPE: 75s');
  });
});
