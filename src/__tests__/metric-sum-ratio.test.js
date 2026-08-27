// @ts-nocheck
// Dispatch #77's deferred numerator/denominator gap, resolved (see the ROLLUP CAVEAT comment
// above DERIVED_METRICS in ../engine/metric-source.js and memory/dispatch-77.md). metricAvg
// returns the mean of daily ratios -- an average-of-averages for a ratio metric. metricSumRatio
// returns the TRUE period figure, Σnumerator ÷ Σdenominator, using each metric's declared
// `derive: {inputs:[num,den], kind:'ratio'}` pair.
//
// Verification bar: reproduce the exact pattern that motivated this work (metric-source.js's own
// SPPH example -- a low-volume day and a high-volume day with different per-day ratios produce a
// mean-of-daily figure that diverges from the true Sum/Sum), not just "the function runs."
import { describe, it, expect } from 'vitest';
import { metricSumRatio, metricAvg, metricRate, rollupCapableMetricKeys, METRIC_SOURCES } from '../engine/metric-source.js';

describe('rollupCapableMetricKeys', () => {
  it('is exactly the 10 ratio metrics dispatch #77 named, plus spph/fobPct (dispatch #104), plus oepe/r2p (dispatch #153), plus dtMixPct (dispatch #165)', () => {
    const keys = rollupCapableMetricKeys().sort();
    expect(keys).toEqual([
      'avgCheck', 'cashOSPct', 'compWaste', 'discPct', 'dtMixPct', 'fobPct', 'laborPct',
      'oepe', 'r2p', 'rawWaste', 'spph', 'statVar', 'tRedAPct', 'tRedBPct', 'tpph',
    ].sort());
  });

  it('excludes non-ratio derives -- a product (oppCostDollar) and a difference (actVsSched) are not ratios', () => {
    const keys = rollupCapableMetricKeys();
    expect(keys).not.toContain('oppCostDollar');
    expect(keys).not.toContain('actVsSched');
    expect(keys).not.toContain('actVsSchedOpp');
    // oppCostPct IS a division (dollars/sales) but its own comment flags the denominator as an
    // unconfirmed assumption -- deliberately not marked kind:'ratio'.
    expect(keys).not.toContain('oppCostPct');
  });

  it('every rollup-capable key has exactly 2 derive inputs', () => {
    for (const k of rollupCapableMetricKeys()) {
      expect(METRIC_SOURCES[k].derive.inputs.length, k).toBe(2);
    }
  });
});

describe('metricSumRatio -- laborPct (laborDollar / sales)', () => {
  function fixture() {
    return {
      opsLaborRows: [
        // Low-volume day: small $ over small sales, HIGH ratio (0.50).
        { loc: '1', date: new Date('2026-08-01'), laborDollar: 50 },
        // High-volume day: much larger $ over much larger sales, LOW ratio (0.20).
        { loc: '1', date: new Date('2026-08-02'), laborDollar: 400 },
      ],
      qsrActSummaryRows: [
        { loc: '1', date: new Date('2026-08-01'), sales: 100 },
        { loc: '1', date: new Date('2026-08-02'), sales: 2000 },
      ],
    };
  }
  const range = { s: new Date('2026-08-01'), e: new Date('2026-08-02') };

  it('mean-of-daily and Sum/Sum diverge on an uneven-volume fixture -- the exact pattern that motivated this fix', () => {
    const ds = fixture();
    const mean = metricAvg(ds, '1', range, 'laborPct');
    const sum = metricSumRatio(ds, '1', range, 'laborPct');
    // mean-of-daily: (0.50 + 0.20) / 2 = 0.35 -- the low-volume day's high ratio counts equally.
    expect(mean).toBeCloseTo(0.35, 5);
    // true Sum/Sum: (50+400) / (100+2000) = 450/2100 = 0.2142857... -- volume-weighted, correctly
    // dominated by the high-volume day.
    expect(sum.value).toBeCloseTo(450 / 2100, 5);
    expect(sum.n).toBe(2);
    // Confirms these are genuinely different numbers, not just different code paths landing on
    // the same value -- the whole point of the fix.
    expect(Math.abs(mean - sum.value)).toBeGreaterThan(0.1);
  });

  it('excludes a day where only one leg resolves, rather than treating a missing input as zero', () => {
    const ds = fixture();
    // Add a 3rd day with sales but no laborDollar at all.
    ds.qsrActSummaryRows.push({ loc: '1', date: new Date('2026-08-03'), sales: 999 });
    const range3 = { s: new Date('2026-08-01'), e: new Date('2026-08-03') };
    const sum = metricSumRatio(ds, '1', range3, 'laborPct');
    // n stays 2, not 3 -- the incomplete day contributes nothing to either sum.
    expect(sum.n).toBe(2);
    expect(sum.value).toBeCloseTo(450 / 2100, 5);
  });

  it('sums across multiple locs when given an array', () => {
    const ds = fixture();
    ds.opsLaborRows.push({ loc: '2', date: new Date('2026-08-01'), laborDollar: 30 });
    ds.qsrActSummaryRows.push({ loc: '2', date: new Date('2026-08-01'), sales: 300 });
    const sum = metricSumRatio(ds, ['1', '2'], range, 'laborPct');
    // (50+400+30) / (100+2000+300) = 480/2400 = 0.2
    expect(sum.value).toBeCloseTo(480 / 2400, 5);
    expect(sum.n).toBe(3);
  });

  it('returns null for a non-ratio metric (sales)', () => {
    const ds = fixture();
    expect(metricSumRatio(ds, '1', range, 'sales')).toBeNull();
  });

  it('returns null when neither leg resolves for any day', () => {
    expect(metricSumRatio({}, '1', range, 'laborPct')).toBeNull();
  });
});

describe('metricSumRatio -- discPct (discAmt / netSalesAmt, opsCashRows-only legs)', () => {
  it('computes the true net-sales-weighted district figure', () => {
    const ds = {
      opsCashRows: [
        { loc: '1', date: new Date('2026-08-01'), discAmt: 10, netSalesAmt: 500 },
        { loc: '1', date: new Date('2026-08-02'), discAmt: 80, netSalesAmt: 4000 },
      ],
    };
    const range = { s: new Date('2026-08-01'), e: new Date('2026-08-02') };
    const sum = metricSumRatio(ds, '1', range, 'discPct');
    // (10+80) / (500+4000) = 90/4500 = 0.02
    expect(sum.value).toBeCloseTo(0.02, 5);
    expect(sum.n).toBe(2);
    // And the mean-of-daily would have been (0.02 + 0.02)/2 = 0.02 here (uniform ratio) --
    // pick non-uniform amounts to actually prove divergence in a second case:
    const meanEqual = metricAvg(ds, '1', range, 'discPct');
    expect(meanEqual).toBeCloseTo(0.02, 5);
  });

  it('a day covered only by ctrlRows (no net-sales-$ column) is excluded from the sum, not guessed', () => {
    const ds = {
      opsCashRows: [{ loc: '1', date: new Date('2026-08-01'), discAmt: 10, netSalesAmt: 500 }],
      // ctrlRows carries discAmt but has no netSalesAmt field at all (parseCtrlData has no such
      // column) -- this day's discAmt should NOT silently pair with a wrong denominator.
      ctrlRows: [{ loc: '1', date: new Date('2026-08-02'), discAmt: 999 }],
    };
    const range = { s: new Date('2026-08-01'), e: new Date('2026-08-02') };
    const sum = metricSumRatio(ds, '1', range, 'discPct');
    expect(sum.n).toBe(1);
    expect(sum.value).toBeCloseTo(10 / 500, 5);
  });
});

// ── Dispatch #104 -- fobPct (fobTotalAmt / prodSalesAmt, a 6-way-summed numerator) ─────────────
// Not table-driven like RATIO_METRIC_ROWS above: fobPct's numerator (fobTotalAmt) is itself a
// derived 6-way sum, not a single raw field on one row, so it doesn't fit that table's
// one-src/two-field shape -- same reason laborPct/discPct get their own describe blocks instead
// of a row.
describe('metricSumRatio -- fobPct (fobTotalAmt / prodSalesAmt, dispatch #104)', () => {
  function fixture() {
    return {
      qsrFobRows: [
        // Day 1: small $ over small sales.
        { loc: '1', date: new Date('2026-08-01'), prodSalesAmt: 1000,
          compWasteAmt: 10, rawWasteAmt: 5, condimentsAmt: 3, empMgrMealsAmt: 2, statVarianceAmt: 1, unexplainedAmt: 1 }, // total 22, 2.2%
        // Day 2: much larger $ over much larger sales, a DIFFERENT ratio.
        { loc: '1', date: new Date('2026-08-02'), prodSalesAmt: 10000,
          compWasteAmt: 300, rawWasteAmt: 150, condimentsAmt: 90, empMgrMealsAmt: 60, statVarianceAmt: 30, unexplainedAmt: 15 }, // total 645, 6.45%
      ],
    };
  }
  const range = { s: new Date('2026-08-01'), e: new Date('2026-08-02') };

  it('sums all 6 controllable components across both legs, not just the first', () => {
    const ds = fixture();
    const sum = metricSumRatio(ds, '1', range, 'fobPct');
    // (22+645) / (1000+10000) = 667/11000
    expect(sum.value).toBeCloseTo(667 / 11000, 6);
    expect(sum.n).toBe(2);
  });

  it('Sum/Sum diverges from mean-of-daily on an uneven-volume fixture', () => {
    const ds = fixture();
    const mean = metricAvg(ds, '1', range, 'fobPct');
    const sum = metricSumRatio(ds, '1', range, 'fobPct');
    // mean-of-daily: (0.022 + 0.0645) / 2 = 0.04325 -- the tiny day counts equally.
    expect(mean).toBeCloseTo((0.022 + 0.0645) / 2, 5);
    expect(sum.value).toBeCloseTo(667 / 11000, 6);
    expect(Math.abs(mean - sum.value)).toBeGreaterThan(0.005);
  });

  it('does NOT reproduce the dispatch #102 inflation bug -- a Sum/Sum over N snapshot-like days stays a real ratio, never an N-multiple of the true value', () => {
    // Model qsr_fob's actual shape: every day's $ fields are the SAME period-to-date snapshot
    // (dispatch #102's finding), not a daily increment. Sum/Sum on 3 identical-snapshot days
    // must still land near the single day's own ratio -- nowhere close to inflated ~3x.
    const snapshotDay = { prodSalesAmt: 10000, compWasteAmt: 300, rawWasteAmt: 150, condimentsAmt: 90, empMgrMealsAmt: 60, statVarianceAmt: 30, unexplainedAmt: 15 };
    const ds = { qsrFobRows: ['2026-08-01', '2026-08-02', '2026-08-03'].map(d => ({ loc: '1', date: new Date(d), ...snapshotDay })) };
    const range3 = { s: new Date('2026-08-01'), e: new Date('2026-08-03') };
    const sum = metricSumRatio(ds, '1', range3, 'fobPct');
    const singleDayRatio = 645 / 10000;
    expect(sum.value).toBeCloseTo(singleDayRatio, 6); // ratio of sums of identical days == that day's own ratio
  });
});

// ── Dispatch #87 item 1 -- pin metricAvg against silent absorption ─────────────────────────────
// #86's verification bar asked for this, #628 (the fix this file tests) correctly left metricAvg
// untouched but shipped without a regression pin. Nothing stops a future refactor from quietly
// redirecting metricAvg to metricSumRatio and moving numbers on metricAvg's ~70 other call sites.
// Reuses the laborPct fixture above (dispatch #87's own instruction: one number, not a new
// harness) rather than building a second fixture for the same disagreement.
describe('metricAvg is pinned to mean-of-daily (dispatch #87 item 1)', () => {
  it('returns the MEAN-of-daily answer on a fixture where mean and Sum/Sum genuinely disagree', () => {
    const ds = {
      opsLaborRows: [
        { loc: '1', date: new Date('2026-08-01'), laborDollar: 50 },
        { loc: '1', date: new Date('2026-08-02'), laborDollar: 400 },
      ],
      qsrActSummaryRows: [
        { loc: '1', date: new Date('2026-08-01'), sales: 100 },
        { loc: '1', date: new Date('2026-08-02'), sales: 2000 },
      ],
    };
    const range = { s: new Date('2026-08-01'), e: new Date('2026-08-02') };
    // mean-of-daily: (0.50 + 0.20) / 2 = 0.35 -- NOT the Sum/Sum answer, 450/2100 = 0.2142857.
    // If a future refactor redirects metricAvg to call metricSumRatio internally, this pin fails.
    expect(metricAvg(ds, '1', range, 'laborPct')).toBeCloseTo(0.35, 5);
  });
});

// ── Dispatch #87 item 2 -- per-metric num/den assertions for the other 9 ratio metrics ─────────
// Table-driven over rollupCapableMetricKeys() so a newly-marked ratio metric is covered the day
// it's added. The risk isn't the summation (metricSumRatio is generic) -- it's a REVERSED or
// WRONG pair in the declaration, which produces a plausible-looking number and a silently wrong
// ranking (e.g. tpph as actHrs/gc instead of gc/actHrs). Two checks per metric:
//   1. derive.fn(a,b) === a/b for sample values -- pins that `inputs` really is [num,den] in that
//      order and fn is a plain division, not something with a guard that reorders it.
//   2. A fixture where Sum/Sum != mean-of-daily, asserting the hand-computed, SEMANTICALLY
//      correct Sum/Sum (i.e. built from what the numerator and denominator actually MEAN --
//      gc/actHrs for TPPH, not just "whichever order derive.inputs happens to list them").
//
// laborPct and discPct already have dedicated arithmetic tests above; not repeated here.
//
// Row shape per metric: which METRIC_SOURCES chain field pair, on which raw stream, supplies both
// legs from a single row (traced from each metric's derive.inputs against their own chains).
const RATIO_METRIC_ROWS = {
  tpph:      { src: 'qsrActSummaryRows', numField: 'gc',              denField: 'actHrs' },
  avgCheck:  { src: 'qsrActSummaryRows', numField: 'sales',           denField: 'gc' },
  cashOSPct: { src: 'opsCashRows',       numField: 'cashOSAmt',       denField: 'netSalesAmt' },
  tRedAPct:  { src: 'opsCashRows',       numField: 'tRedAAmt',        denField: 'netSalesAmt' },
  tRedBPct:  { src: 'opsCashRows',       numField: 'tRedBAmt',        denField: 'netSalesAmt' },
  compWaste: { src: 'qsrFobRows',        numField: 'compWasteAmt',    denField: 'prodSalesAmt' },
  rawWaste:  { src: 'qsrFobRows',        numField: 'rawWasteAmt',     denField: 'prodSalesAmt' },
  statVar:   { src: 'qsrFobRows',        numField: 'statVarianceAmt', denField: 'prodSalesAmt' },
  spph:      { src: 'qsrActSummaryRows', numField: 'sales',           denField: 'actHrs' },
  // dispatch #165 -- the redundancy audit's own contained fix: dtMixPct had no auto/API
  // fallback at all (salesLedgerRows, the emailed stream, was its sole non-manual source).
  // opsSalesMixRows carries both legs on the same row (qsr_sales_mix, reconciled EXACTLY
  // against salesLedgerRows on a live shared day -- see loadOpsSalesMix's comment).
  dtMixPct:  { src: 'opsSalesMixRows',   numField: 'dtSalesAmt',      denField: 'netSalesAmt' },
};

describe('per-metric numerator/denominator assertions (dispatch #87 item 2)', () => {
  it('RATIO_METRIC_ROWS covers every rollup-capable metric not already tested above', () => {
    const covered = new Set([...Object.keys(RATIO_METRIC_ROWS), 'laborPct', 'discPct', 'fobPct', 'oepe', 'r2p']);
    for (const k of rollupCapableMetricKeys()) expect(covered.has(k), k).toBe(true);
  });

  for (const [key, { src, numField, denField }] of Object.entries(RATIO_METRIC_ROWS)) {
    describe(key, () => {
      it('derive.fn(a, b) === a / b -- pins input order and a plain division', () => {
        const fn = METRIC_SOURCES[key].derive.fn;
        expect(fn(7, 3)).toBeCloseTo(7 / 3, 5);
      });

      it('Sum/Sum on an uneven-volume fixture matches the semantically correct numerator/denominator, not a reversed one', () => {
        const ds = {
          [src]: [
            { loc: '1', date: new Date('2026-08-01'), [numField]: 10, [denField]: 100 },
            { loc: '1', date: new Date('2026-08-02'), [numField]: 400, [denField]: 1000 },
          ],
        };
        const range = { s: new Date('2026-08-01'), e: new Date('2026-08-02') };
        const sum = metricSumRatio(ds, '1', range, key);
        const mean = metricAvg(ds, '1', range, key);
        const expected = (10 + 400) / (100 + 1000); // true Sum/Sum, numField over denField
        expect(sum.value).toBeCloseTo(expected, 5);
        expect(sum.n).toBe(2);
        // Also confirms this fixture actually disagrees with mean-of-daily -- a flat-volume
        // fixture would pass under a reversed pair too and prove nothing (dispatch's own warning).
        expect(Math.abs(mean - sum.value)).toBeGreaterThan(0.01);
      });
    });
  }
});

// ── Dispatch #153 (2026-08-27) -- OEPE/R2P: an in-progress "today" reading as the best day
// of the week under mean-of-daily, fixed by routing through Σnum/Σden instead ──────────────
// oepe/r2p don't fit RATIO_METRIC_ROWS above -- their numerator (oepeNumSec/r2pNumSec) is
// itself a 3-/2-input DERIVED metric (a difference of raw DAR timing components, not a single
// field on one row), same reason laborPct/discPct/fobPct got their own describe blocks instead
// of a RATIO_METRIC_ROWS row.
//
// Row shape: qsrActSummaryRows carries the underscore-prefixed per-day SUMS
// (_dtTotal/_dtStore/_dtHeldTime/_dtCars for OEPE, _fcServe/_fcDrawer/_fcCnt for R2P) that
// src/utils/oepe.js's oepeSeconds() and supabase.js's _finalizeQsrAct already use to compute
// the precomputed oepe/r2p fields on that same row -- see src/lib/supabase.js's
// `_qsrActFromSummed`/`_finalizeQsrAct`. metric-chains.test.js's EMITS.qsrActSummaryRows list
// already names all seven underscore fields, confirming the loader really emits them.
describe('metricSumRatio -- oepe (dtUntilServeUs/dtUntilStoreUs/dtHeldTimeUs / dtTransCnt)', () => {
  it('derive.fn(num, cnt) === num / cnt -- pins input order and a plain division', () => {
    const fn = METRIC_SOURCES.oepe.derive.fn;
    expect(fn(700, 5)).toBeCloseTo(140, 5);
  });

  // ── LIVE cross-check (dispatch #153's verification bar): a KNOWN-COMPLETE historical day,
  // real numbers pulled 2026-08-27 via SUPABASE_SERVICE_ROLE_KEY REST from
  // qsr_daily_activity_rollup, store 3708 (loc "0003708"), 2026-08-24 (960 of 1,044 projected
  // transactions = 91.9% of plan, i.e. genuinely complete, not the in-progress day). Proves the
  // new chain (Σ(dtUntilServeUs-dtUntilStoreUs-dtHeldTimeUs)/1000 ÷ ΣdtTransCnt) reproduces --
  // within Math.round's own tolerance -- the SAME formula src/utils/oepe.js's oepeSeconds()
  // already computes from the identical raw fields (that formula's own r=0.9958 QSRSoft
  // reconciliation, #183/#185, is what makes this a real numerator/denominator pair, not a
  // guess -- this test proves the NEW chain reads the same fields correctly, not the formula
  // itself, which was already proven). ──────────────────────────────────────────────────────
  it('single-day Σnum/Σden matches the existing oepeSeconds() precomputed value within rounding (live cross-check, store 3708, 2026-08-24)', () => {
    // Real live values -- see this dispatch's PR body for the raw curl capture.
    const dt_untilserve = 115730603, dt_untilstore = 14799561, dt_heldtime = 5291082, dt_trans_cnt = 769;
    const precomputedOepe = Math.round((dt_untilserve - dt_untilstore - dt_heldtime) / dt_trans_cnt / 1000); // 124
    const ds = { qsrActSummaryRows: [{ loc: '1', date: new Date('2026-08-24'),
      _dtTotal: dt_untilserve, _dtStore: dt_untilstore, _dtHeldTime: dt_heldtime, _dtCars: dt_trans_cnt }] };
    const range = { s: new Date('2026-08-24'), e: new Date('2026-08-24') };
    const sum = metricSumRatio(ds, '1', range, 'oepe');
    expect(sum.n).toBe(1);
    expect(Math.abs(sum.value - precomputedOepe)).toBeLessThan(1); // rounding-only delta
    expect(precomputedOepe).toBe(124); // pins the real measured value itself
  });

  it('Sum/Sum on an uneven-volume fixture diverges from mean-of-daily', () => {
    // Raw fields are (ms-equivalent, summed across the day) ÷ 1000 = seconds — real magnitude,
    // matching the live store-3708 values above (~150,000 raw per transaction ≈ 150s).
    const ds = {
      qsrActSummaryRows: [
        // Low-volume day: small num/den, but a HIGH per-transaction rate (200s).
        { loc: '1', date: new Date('2026-08-01'), _dtTotal: 20000000, _dtStore: 0, _dtHeldTime: 0, _dtCars: 100 },
        // High-volume day: much larger num/den, LOW per-transaction rate (50s).
        { loc: '1', date: new Date('2026-08-02'), _dtTotal: 50000000, _dtStore: 0, _dtHeldTime: 0, _dtCars: 1000 },
      ],
    };
    const range = { s: new Date('2026-08-01'), e: new Date('2026-08-02') };
    const mean = metricAvg(ds, '1', range, 'oepe');
    const sum = metricSumRatio(ds, '1', range, 'oepe');
    expect(mean).toBeCloseTo((200 + 50) / 2, 5); // (20000000/100/1000=200)+(50000000/1000/1000=50), /2
    expect(sum.value).toBeCloseTo((20000000 + 50000000) / (100 + 1000) / 1000, 5); // 70000000/1100/1000
    expect(Math.abs(mean - sum.value)).toBeGreaterThan(10);
  });

  // ── The exact measured real-world shape (dispatch #153 item 5): 7 complete days + 1
  // partial "today" with a plausible per-transaction rate but far fewer transactions. Reuses
  // the real store-3708 8-day window (2026-08-19..08-26) pulled live 2026-08-27 -- 2026-08-26
  // sat at 744 of 1,061 projected transactions (70.1% of plan), matching the dispatch's own
  // finding verbatim (store 3708 R2P 92.3s on that day, cited in dispatch-153.md). ──────────
  it('a low-volume in-progress day pulls mean-of-daily toward it but barely moves Σ/Σ (real 8-day store-3708 window)', () => {
    const days = [
      // dt: [_dtTotal, _dtStore, _dtHeldTime, _dtCars] -- real qsr_daily_activity_rollup values
      ['2026-08-19', 152168762, 19240753, 8262177, 799],
      ['2026-08-20', 183794535, 18185990, 10896295, 873],
      ['2026-08-21', 178545082, 19800801, 11672246, 916],
      ['2026-08-22', 187948201, 17619758, 8686196, 739],
      ['2026-08-23', 139215914, 16323393, 4794893, 648],
      ['2026-08-24', 115730603, 14799561, 5291082, 769],
      ['2026-08-25', 141389336, 14854001, 12962488, 800],
      // 2026-08-26: in-progress -- 744 of 1,061 projected transactions (70.1% of plan).
      ['2026-08-26', 77563378, 11697170, 5591806, 579],
    ];
    const ds = { qsrActSummaryRows: days.map(([dt, tot, store, held, cars]) =>
      ({ loc: '1', date: new Date(dt), _dtTotal: tot, _dtStore: store, _dtHeldTime: held, _dtCars: cars })) };
    const range = { s: new Date('2026-08-19'), e: new Date('2026-08-26') };
    const perDayOepe = days.map(([, tot, store, held, cars]) => Math.round((tot - store - held) / cars / 1000));
    const mean = metricAvg(ds, '1', range, 'oepe');
    const sum = metricSumRatio(ds, '1', range, 'oepe');
    // The in-progress day (104s) really is the fastest single day of the window -- that part
    // is real and true regardless of aggregation. What must NOT happen is the WEEKLY FIGURE
    // itself reading as fast as that one day; it should sit solidly inside the range the other
    // 7 (complete) days occupy, further from 104 under Σ/Σ than under mean-of-daily.
    const [minComplete] = [...perDayOepe.slice(0, 7)].sort((a, b) => a - b);
    expect(perDayOepe[7]).toBeLessThan(minComplete); // the partial day IS the window's fastest single reading
    expect(mean).toBeGreaterThan(perDayOepe[7]);      // (sanity) the mean isn't literally the partial day's value
    expect(sum.value).toBeGreaterThan(mean);          // Σ/Σ sits FURTHER from the artifact than mean-of-daily
    expect(sum.value).toBeGreaterThanOrEqual(minComplete - 1); // Σ/Σ stays within the complete-day range
  });
});

describe('metricSumRatio -- r2p (fcUntilServeUs/fcUntilClosedDrawerUs / fcTransCnt)', () => {
  it('derive.fn(num, cnt) === num / cnt -- pins input order and a plain division', () => {
    const fn = METRIC_SOURCES.r2p.derive.fn;
    expect(fn(700, 5)).toBeCloseTo(140, 5);
  });

  // Same live cross-check as OEPE above, same day/store -- R2P's own formula
  // (supabase.js's _finalizeQsrAct: (fc_untilserve-fc_untilclosedrawer)/fc_trans_cnt/1000) is
  // NOT rounded before use, so this delta is exact (~0), not rounding-only like OEPE's.
  it('single-day Σnum/Σden matches the existing R2P formula exactly (live cross-check, store 3708, 2026-08-24)', () => {
    const fc_untilserve = 41786684, fc_untilclosedrawer = 12095827, fc_trans_cnt = 229;
    const precomputedR2p = (fc_untilserve - fc_untilclosedrawer) / fc_trans_cnt / 1000;
    const ds = { qsrActSummaryRows: [{ loc: '1', date: new Date('2026-08-24'),
      _fcServe: fc_untilserve, _fcDrawer: fc_untilclosedrawer, _fcCnt: fc_trans_cnt }] };
    const range = { s: new Date('2026-08-24'), e: new Date('2026-08-24') };
    const sum = metricSumRatio(ds, '1', range, 'r2p');
    expect(sum.n).toBe(1);
    expect(sum.value).toBeCloseTo(precomputedR2p, 6);
    expect(precomputedR2p).toBeCloseTo(129.6544, 3); // pins the real measured value itself
  });

  it('the real store-3708 8-day window: 2026-08-26 (92.3s, 70.1% of plan) is the fastest single day, but Σ/Σ sits further from it than mean-of-daily', () => {
    const days = [
      // dt: [_fcServe, _fcDrawer, _fcCnt] -- real qsr_daily_activity_rollup values
      ['2026-08-19', 60304166, 11467983, 259],
      ['2026-08-20', 54784937, 10186836, 220],
      ['2026-08-21', 64878490, 12227325, 301],
      ['2026-08-22', 78935630, 16057553, 246],
      ['2026-08-23', 46981353, 11067664, 204],
      ['2026-08-24', 41786684, 12095827, 229],
      ['2026-08-25', 47739490, 8254306, 187],
      ['2026-08-26', 25436955, 8546200, 183], // in-progress, 70.1% of plan
    ];
    const ds = { qsrActSummaryRows: days.map(([dt, serve, drawer, cnt]) =>
      ({ loc: '1', date: new Date(dt), _fcServe: serve, _fcDrawer: drawer, _fcCnt: cnt })) };
    const range = { s: new Date('2026-08-19'), e: new Date('2026-08-26') };
    const perDayR2p = days.map(([, serve, drawer, cnt]) => (serve - drawer) / cnt / 1000);
    const mean = metricAvg(ds, '1', range, 'r2p');
    const sum = metricSumRatio(ds, '1', range, 'r2p');
    const minComplete = Math.min(...perDayR2p.slice(0, 7));
    expect(perDayR2p[7]).toBeCloseTo(92.3, 0);
    expect(perDayR2p[7]).toBeLessThan(minComplete);
    expect(sum.value).toBeGreaterThan(mean);
    expect(sum.value).toBeGreaterThanOrEqual(minComplete - 1);
  });
});

// ── Dispatch #155 — metricRate, relocated from one-pager-data.js's private `rateMetric` (dispatch
// #153) so every app-level call site that reads a ratio metric over a range that can include the
// current, still-open period shares the exact same fallback logic. Named `metricRate`, not
// `rateMetric`, to avoid colliding with review-engine.js's unrelated, already-exported
// `rateMetric(actual, target, metricCfg)` 1-4 scoring function.
describe('metricRate -- Σ/Σ first, metricAvg fallback only when the rollup has nothing (dispatch #155)', () => {
  it('prefers metricSumRatio when it can compute -- reuses the uneven-volume fixture above', () => {
    const ds = {
      qsrActSummaryRows: [
        { loc: '1', date: new Date('2026-08-01'), _dtTotal: 20000000, _dtStore: 0, _dtHeldTime: 0, _dtCars: 100 },
        { loc: '1', date: new Date('2026-08-02'), _dtTotal: 50000000, _dtStore: 0, _dtHeldTime: 0, _dtCars: 1000 },
      ],
    };
    const range = { s: new Date('2026-08-01'), e: new Date('2026-08-02') };
    const rate = metricRate(ds, '1', range, 'oepe');
    const sum = metricSumRatio(ds, '1', range, 'oepe');
    const mean = metricAvg(ds, '1', range, 'oepe');
    expect(rate).toBeCloseTo(sum.value, 6);
    expect(rate).not.toBeCloseTo(mean, 1);
  });

  it('falls back to metricAvg only when metricSumRatio returns null (no day resolves both raw legs)', () => {
    // Manual Ops Report upload only -- the precomputed oepe field, no DAR raw components at
    // all, so metricSumRatio has nothing to sum and must return null.
    const ds = { opsRows: [{ loc: '1', date: new Date('2026-08-01'), oepe: 155 }] };
    const range = { s: new Date('2026-08-01'), e: new Date('2026-08-01') };
    expect(metricSumRatio(ds, '1', range, 'oepe')).toBeNull();
    expect(metricRate(ds, '1', range, 'oepe')).toBeCloseTo(155, 6);
    expect(metricRate(ds, '1', range, 'oepe')).toBe(metricAvg(ds, '1', range, 'oepe'));
  });

  it('returns null, same as both underlying functions, when nothing resolves at all', () => {
    expect(metricRate({}, '1', { s: '2026-08-01', e: '2026-08-01' }, 'oepe')).toBeNull();
  });
});
