// @ts-nocheck
// Dispatch #221 — extends dispatch #153/#155's OEPE/R2P/TPPH completeness fix to KVS Time, the
// exact gap #153 left behind (see METRIC_SOURCES.kvst's own comment in metric-source.js). Per
// CLAUDE.md's "would this verification still pass if the change were reverted?" rule, these
// tests exercise the REAL CONSUMER functions (autoPopulateKPIs / buildMetricNow /
// buildReviewActuals), not just metricRate/metricSumRatio in isolation — a test that only
// imports the engine can't tell "migrated" from "migrated but the call site still reads
// metricAvg". The React-component call site (store-dash.js's RankingTab) has its own
// render-based test file alongside this one (dispatch-221-store-dash-kvst-rate.test.js),
// mirroring dispatch #155's own split between plain-function and render-based test files.
import { describe, it, expect } from 'vitest';
import { autoPopulateKPIs } from '../engine/review-engine.js';
import { buildMetricNow, buildReviewActuals } from '../engine/one-pager-data.js';

// ── review-engine.js: autoPopulateKPIs' kvsAvg (dispatch #221) ────────────────────────────────
// monthRange(m) always returns the FULL calendar month, not clipped to "so far" -- and `months`
// (review.kpis.months) covers all 12 months of the review year, so a review actively being built
// for the CURRENT, still-in-progress month passes a range that includes today's open business day.
describe('autoPopulateKPIs kvs uses the Σ/Σ rollup for the current, in-progress month (dispatch #221)', () => {
  function blankMonths() { const m = {}; for (let i = 1; i <= 12; i++) m[i] = {}; return m; }

  it('kvs diverges from mean-of-daily when the review covers the current month', () => {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth() + 1;
    // First-of-month "complete" day (5x weight via the loop below) vs. TODAY, an in-progress
    // day with a much lower transaction count but a plausible (not absurd) per-transaction rate
    // -- the exact completeness-artifact shape dispatch #153 measured live for OEPE/R2P and
    // dispatch #221 measured live for KVS Time (store 6178, 2026-08-30 -- see this dispatch's
    // PR body / metric-sum-ratio.test.js's live cross-check for the real numbers).
    const mkFirst = (i) => ({
      loc: '3708', date: new Date(y, m - 1, i, 12),
      _mfyTime: 50000000, _mfyCnt: 1000,   // 50s/day
    });
    const todayRow = {
      loc: '3708', date: new Date(y, m - 1, now.getDate(), 12),
      _mfyTime: 20000000, _mfyCnt: 100,    // 200s -- in-progress artifact
    };
    const days = [1, 2, 3, 4, 5].filter(d => d !== now.getDate()).slice(0, 5).map(mkFirst);
    const ds = { loaded: true, qsrActSummaryRows: [...days, todayRow] };
    const review = { loc: '3708', year: y, half: 'H1', role: 'GM', kpis: { months: blankMonths() } };
    const r = autoPopulateKPIs(review, ds);
    const mo = r.kpis.months[m];
    // Hand-computed Σ/Σ (5 complete days @ 50s/day + 1 in-progress day @ 200s):
    const sumKvst = (50000000 * days.length + 20000000) / (1000 * days.length + 100) / 1000;
    const meanKvst = (50 * days.length + 200) / (days.length + 1);
    expect(mo.kvs).toBeCloseTo(sumKvst, 4);
    expect(mo.kvs).not.toBeCloseTo(meanKvst, 1);
    // Sanity: the Σ/Σ figure sits closer to the 5 complete days' own rate (50s) than the flat
    // mean does -- the in-progress day is weighted by its actual (low) volume, not averaged in
    // as if it were a full, representative day.
    expect(Math.abs(mo.kvs - 50)).toBeLessThan(Math.abs(meanKvst - 50));
  });
});

// ── one-pager-data.js: buildMetricNow's kvst / buildReviewActuals' kvsPerGc (dispatch #221) ────
// Both build figures for the One-Pager / Above-Store One-Pager, whose caller-supplied range is
// not guaranteed to stop short of today (e.g. an MTD or custom range ending today), so both are
// a real, user-reachable "range includes the still-open business day" case.
describe('one-pager-data.js kvst/kvsPerGc use the Σ/Σ rollup over a range that includes today (dispatch #221)', () => {
  const now = new Date();
  const d = (daysAgo) => { const x = new Date(now); x.setDate(x.getDate() - daysAgo); return x; };

  function fixture() {
    const rows = [];
    for (let i = 1; i <= 5; i++) rows.push({ loc: '3708', date: d(i), _mfyTime: 50000000, _mfyCnt: 1000 }); // 50s/day
    rows.push({ loc: '3708', date: d(0), _mfyTime: 20000000, _mfyCnt: 100 }); // today, in-progress: 200s
    return { qsrActSummaryRows: rows };
  }
  // Both buildMetricNow and buildReviewActuals read range.s/range.e as "YYYY-MM-DD" strings
  // (fobByRange's range.s.slice(0,7) inside buildMetricNow; buildReviewActuals' own
  // range.s.slice(0,7) for the digital-app-% month match) -- matches their real callers
  // (one-pager.js/above-store-onepager.js both build string ranges), not Date objects.
  const range = { s: d(5).toISOString().slice(0, 10), e: d(0).toISOString().slice(0, 10) };

  it('buildMetricNow.kvst reflects Σ_mfyTime/Σ_mfyCnt, not the mean of 5 complete days + 1 in-progress day', () => {
    const ds = fixture();
    const out = buildMetricNow(ds, [], ['3708'], range);
    const sumKvst = (50000000 * 5 + 20000000) / (1000 * 5 + 100) / 1000;
    const meanKvst = (50 * 5 + 200) / 6;
    expect(out['3708'].kvst).toBeCloseTo(sumKvst, 4);
    expect(out['3708'].kvst).not.toBeCloseTo(meanKvst, 1);
  });

  it('buildReviewActuals.kvsPerGc reflects Σ_mfyTime/Σ_mfyCnt, not the mean of 5 complete days + 1 in-progress day', () => {
    const ds = fixture();
    const out = buildReviewActuals(ds, ['3708'], range);
    const sumKvst = (50000000 * 5 + 20000000) / (1000 * 5 + 100) / 1000;
    const meanKvst = (50 * 5 + 200) / 6;
    expect(out.kvsPerGc).toBeCloseTo(sumKvst, 4);
    expect(out.kvsPerGc).not.toBeCloseTo(meanKvst, 1);
  });
});
