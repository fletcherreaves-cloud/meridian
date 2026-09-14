import { describe, it, expect } from 'vitest';
import {
  median, mad, quantile, trendSlope, robustBaseline,
  likeSizedPeers, peerAnchor, blend, confidence, computeSmartTarget,
  windowRate, weightedRecencyProjection, periodTotal, backtestProjectors, toISODate,
  weightedLevel, weightedRecencyLevel, allocateShares,
} from '../engine/smart-targets.js';

// Build a daily series ending at `endIso`, `days` long, from a value fn(i, date).
function dailyFrom(endIso, days, valueFn) {
  const out = [];
  const end = new Date(endIso + 'T00:00:00');
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end); d.setDate(d.getDate() - i);
    out.push({ date: d, value: valueFn(days - 1 - i, d) });
  }
  return out;
}

describe('smart-targets — robust stats', () => {
  it('median handles odd/even and skips non-numbers', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([1, null, 3, NaN])).toBe(2);
    expect(median([])).toBeNull();
  });

  it('mad measures spread robustly', () => {
    // values 1..5 → median 3 → abs devs [2,1,0,1,2] → median 1
    expect(mad([1, 2, 3, 4, 5])).toBe(1);
  });

  it('quantile interpolates', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBeCloseTo(2.5, 9);
    expect(quantile([1, 2, 3, 4], 0.75)).toBeCloseTo(3.25, 9);
    expect(quantile([10], 0.9)).toBe(10);
  });

  it('trendSlope recovers a known slope', () => {
    // y = 2x + 5
    expect(trendSlope([5, 7, 9, 11, 13])).toBeCloseTo(2, 6);
    expect(trendSlope([9, 9, 9])).toBeCloseTo(0, 6);
    expect(trendSlope([1, 2])).toBe(0); // too short
  });
});

describe('smart-targets — robust baseline excludes anomalies', () => {
  it('drops a freak day and reports the exclusion count', () => {
    // steady ~100/day with one POS-outage day at 5
    const vals = [98, 101, 100, 99, 102, 100, 5, 101, 99, 100];
    const rb = robustBaseline(vals, { k: 3 });
    expect(rb.excluded).toBe(1);
    expect(rb.baseline).toBeGreaterThan(95);   // not dragged down by the 5
    expect(rb.n).toBe(10);
  });

  it('keeps everything when there are no outliers', () => {
    const rb = robustBaseline([100, 101, 99, 100, 102, 98]);
    expect(rb.excluded).toBe(0);
  });

  it('handles empty input', () => {
    expect(robustBaseline([]).baseline).toBeNull();
  });
});

describe('smart-targets — peers & anchor', () => {
  const peers = [
    { baseline: 100, volume: 1000 },
    { baseline: 120, volume: 1100 },
    { baseline: 140, volume: 1050 },
    { baseline: 300, volume: 9000 },  // much bigger store — should be excluded by band
  ];

  it('likeSizedPeers keeps only same-volume-band stores', () => {
    const t = likeSizedPeers(peers, 1000, { band: 2 });
    expect(t.map(p => p.baseline).sort((a, b) => a - b)).toEqual([100, 120, 140]);
  });

  it('peerAnchor picks the top quartile for higher-is-better', () => {
    const { anchor, tierN } = peerAnchor(peers, 1000, { direction: 'higher', band: 2 });
    expect(tierN).toBe(3);
    // 75th percentile of [100,120,140] = 130
    expect(anchor).toBeCloseTo(130, 6);
  });

  it('peerAnchor picks the bottom quartile for lower-is-better', () => {
    // lower is better → good direction is the 25th percentile
    const { anchor } = peerAnchor(peers, 1000, { direction: 'lower', band: 2 });
    expect(anchor).toBeCloseTo(110, 6); // 25th pct of [100,120,140]
  });
});

describe('smart-targets — blend caps and floors', () => {
  it('closes a fraction of the gap toward the anchor (cap not binding)', () => {
    // baseline 100, anchor 120, close half of the 20 gap → 110, cap 20% not hit
    expect(blend(100, 120, { closeGapFrac: 0.5, capFrac: 0.20 })).toBeCloseTo(110, 6);
  });

  it('caps the total move to capFrac of baseline', () => {
    // gap huge, but cap 8% of 100 = 8 → 108
    expect(blend(100, 500, { closeGapFrac: 1, capFrac: 0.08 })).toBeCloseTo(108, 6);
  });

  it('never proposes worse than baseline (higher-is-better)', () => {
    // anchor below baseline → hold at baseline
    expect(blend(100, 80, { direction: 'higher' })).toBe(100);
  });

  it('never proposes worse than baseline (lower-is-better)', () => {
    // lower is better; anchor above baseline (worse) → hold
    expect(blend(0.28, 0.34, { direction: 'lower' })).toBe(0.28);
  });

  it('returns baseline when there is no anchor', () => {
    expect(blend(100, null)).toBe(100);
  });
});

describe('smart-targets — confidence', () => {
  it('grades on sample size and variability', () => {
    expect(confidence(25, 0.1)).toBe('High');
    expect(confidence(15, 0.4)).toBe('Med');
    expect(confidence(5, 0.1)).toBe('Low');   // too few
    expect(confidence(30, 0.9)).toBe('Low');  // too noisy
  });
});

describe('smart-targets — end to end', () => {
  it('produces a stretch target between baseline and anchor with metadata', () => {
    // Store trending ~10,000/day, steady; peers top-quartile a bit higher.
    const series = Array.from({ length: 28 }, (_, i) => 10000 + (i % 7) * 50);
    const peers = [
      { baseline: 10200, volume: 300000 },
      { baseline: 10500, volume: 310000 },
      { baseline: 10800, volume: 305000 },
    ];
    const r = computeSmartTarget(series, peers, { direction: 'higher', volume: 300000, capFrac: 0.08 });
    expect(r.baseline).toBeGreaterThan(9900);
    expect(r.smart).toBeGreaterThanOrEqual(r.baseline);        // a stretch or hold, never worse
    expect(r.smart).toBeLessThanOrEqual(r.baseline * 1.08 + 1); // respects the cap
    expect(r.anchor).not.toBeNull();
    expect(['High', 'Med', 'Low']).toContain(r.confidence);
    expect(r.excludedDays).toBe(0);
    expect(r.n).toBe(28);
  });

  it('handles a store with no peers by holding to its own trajectory', () => {
    const series = [500, 510, 505, 515, 508, 512, 507, 511, 509, 513];
    const r = computeSmartTarget(series, [], { direction: 'higher', volume: 500 });
    expect(r.anchor).toBeNull();
    expect(r.smart).toBeGreaterThanOrEqual(r.baseline);
  });
});

describe('smart-targets — owner weighted-recency projector', () => {
  it('windowRate returns the anomaly-excluded mean daily rate for the window', () => {
    // 90 days of ~1000/day (natural weekly variation) with one freak 0-day in
    // the last 21. Real sales always vary, so MAD is nonzero and the outlier drops.
    const series = dailyFrom('2026-06-30', 90, (i) => (i === 80 ? 0 : 980 + (i % 7) * 8));
    const asOf = new Date('2026-07-01T00:00:00'); // exclusive upper bound
    const w = windowRate(series, asOf, 21, { k: 3 });
    expect(w.n).toBe(21);
    expect(w.excluded).toBe(1);            // the 0-day dropped
    expect(w.rate).toBeGreaterThan(975);   // not dragged down by the 0
  });

  it('projects a period total from the weighted blend of T3M/T6W/T3W', () => {
    // Steady 2000/day for 120 days → every window rate = 2000 → 31-day period = 62000
    const series = dailyFrom('2026-07-31', 120, () => 2000);
    const asOf = new Date('2026-08-01T00:00:00');
    const r = weightedRecencyProjection(series, { asOf, targetDays: 31 });
    expect(r.dailyRate).toBeCloseTo(2000, 6);
    expect(r.projection).toBeCloseTo(62000, 6);
  });

  it('weights recent windows more when the trend is rising', () => {
    // Ramp: older days lower, recent days higher. Recency-weighted rate should
    // exceed the flat 3-month average.
    const series = dailyFrom('2026-07-31', 120, (i) => 1000 + i * 10); // i:0..119
    const asOf = new Date('2026-08-01T00:00:00');
    const flat = weightedRecencyProjection(series, { asOf, targetDays: 30, weights: { m3: 1, w6: 0, w3: 0 } });
    const recency = weightedRecencyProjection(series, { asOf, targetDays: 30 }); // default recency-weighted
    expect(recency.dailyRate).toBeGreaterThan(flat.dailyRate);
  });

  it('applies a signed known-event delta to the projection', () => {
    const series = dailyFrom('2026-07-31', 90, () => 1000);
    const asOf = new Date('2026-08-01T00:00:00');
    const base = weightedRecencyProjection(series, { asOf, targetDays: 30 });
    const withEvent = weightedRecencyProjection(series, { asOf, targetDays: 30, eventDelta: 5000 });
    expect(withEvent.projection).toBeCloseTo(base.projection + 5000, 6);
  });

  it('returns null projection when no window has data', () => {
    const series = dailyFrom('2026-01-31', 30, () => 1000); // all far before asOf
    const asOf = new Date('2026-08-01T00:00:00');
    const r = weightedRecencyProjection(series, { asOf, targetDays: 30 });
    expect(r.projection).toBeNull();
  });

  // Data-integrity sweep, signature #4: every live caller (Smart Targets panel,
  // Dialed-In backtest, labor tools, etc.) depends on this exclusive boundary to
  // keep the still-open business day out of the target-setting math. Confirms the
  // contract directly rather than only through call sites that happen to honor it.
  it('excludes the row dated exactly at asOf — the still-open business day', () => {
    const series = dailyFrom('2026-08-01', 22, (i) => (i === 21 ? 999999 : 1000)); // last row = "today"
    const asOf = new Date('2026-08-01T00:00:00');
    const w = windowRate(series, asOf, 21, { k: 3 });
    expect(w.n).toBe(21);
    expect(w.rate).toBeCloseTo(1000, 6);
  });
});

describe('smart-targets — weighted ratio level (labor %, speed)', () => {
  it('weightedLevel is Σ(v·w)/Σw, NOT the mean of daily ratios', () => {
    // Two days: 10% labor on $1000, 30% labor on $9000. Sales-weighted labor % is
    // (0.10·1000 + 0.30·9000)/10000 = 2800/10000 = 0.28 — a straight mean of the
    // two ratios would wrongly give 0.20.
    const r = weightedLevel([{ value: 0.10, weight: 1000 }, { value: 0.30, weight: 9000 }]);
    expect(r.level).toBeCloseTo(0.28, 6);
    expect(r.level).not.toBeCloseTo(0.20, 3);
  });

  it('drops days whose ratio is anomalous before weighting', () => {
    // Many ~21% days plus one freak 90% day — the outlier ratio is excluded.
    const pts = [];
    for (let i = 0; i < 20; i++) pts.push({ value: 0.21 + (i % 3) * 0.005, weight: 1000 });
    pts.push({ value: 0.90, weight: 1000 });
    const r = weightedLevel(pts, { k: 3 });
    expect(r.excluded).toBe(1);
    expect(r.level).toBeLessThan(0.25);
  });

  it('returns null when no valid weighted points', () => {
    expect(weightedLevel([{ value: 0.2, weight: 0 }, { value: null, weight: 5 }]).level).toBeNull();
  });

  it('weightedRecencyLevel blends trailing windows, weighting recent heavier', () => {
    // Labor % improving (falling) over time; weight steady. Recency-weighted level
    // should sit below the flat 3-month level because recent days are lower.
    const daily = dailyFrom('2026-07-31', 120, (i) => ({ pct: 0.26 - i * 0.0003 }))
      .map(r => ({ date: r.date, value: r.value.pct, weight: 1000 }));
    const asOf = new Date('2026-08-01T00:00:00');
    const flat = weightedRecencyLevel(daily, { asOf, weights: { m3: 1, w6: 0, w3: 0 } });
    const recency = weightedRecencyLevel(daily, { asOf });
    expect(recency.level).toBeLessThan(flat.level);
  });
});

describe('smart-targets — projector scoreboard (which wins per store)', () => {
  it('periodTotal sums values inside [start,end)', () => {
    const series = dailyFrom('2026-07-31', 60, () => 100);
    const { total, n } = periodTotal(series, new Date('2026-07-01T00:00:00'), new Date('2026-07-31T00:00:00'));
    expect(n).toBe(30);          // Jul 1..30 inclusive of start, exclusive of 31
    expect(total).toBe(3000);
  });

  it('grades competing projectors and names the closer one the winner', () => {
    // Actual recent periods run ~1000/day. "good" projects the true rate; "bad"
    // lowballs. Backtest should crown "good".
    const series = dailyFrom('2026-07-31', 150, () => 1000);
    const good = { key: 'good', name: 'Good', project: (s, o) => 1000 * o.targetDays };
    const bad = { key: 'bad', name: 'Bad', project: (s, o) => 600 * o.targetDays };
    const r = backtestProjectors(series, [good, bad], { periodDays: 28, folds: 3 });
    expect(r.folds).toBeGreaterThan(0);
    expect(r.winner).toBe('good');
    expect(r.perMethod.good.mape).toBeLessThan(r.perMethod.bad.mape);
    expect(r.perMethod.good.mape).toBeCloseTo(0, 1);
  });

  it('lets the owner method compete against a naive flat model', () => {
    const series = dailyFrom('2026-07-31', 150, (i) => 900 + i * 2); // gently rising
    const owner = { key: 'owner', name: 'T3M/T6W/T3W', project: (s, o) => weightedRecencyProjection(s, o) };
    const flat = { key: 'flat', name: 'Flat-3wk', project: (s, o) => weightedRecencyProjection(s, { ...o, weights: { m3: 1, w6: 0, w3: 0 } }) };
    const r = backtestProjectors(series, [owner, flat], { periodDays: 28, folds: 3 });
    expect(r.winner).not.toBeNull();
    expect(Object.keys(r.perMethod).sort()).toEqual(['flat', 'owner']);
  });

  it('toISODate normalizes Date and string inputs', () => {
    expect(toISODate('2026-08-15')).toBe('2026-08-15');
    expect(toISODate(new Date('2026-08-15T12:00:00Z'))).toBe('2026-08-15');
    expect(toISODate('not-a-date')).toBeNull();
  });
});

// Owner request (2026-09-14): Smart Targets' FOB % row needed its 6 components
// (comp waste / raw waste / condiments / emp-mgr meals / stat variance /
// unexplained) broken out AND guaranteed to sum back to the Smart FOB % number
// shown for that store -- not just approximately, since a mismatch there would
// be a visible, checkable inconsistency on a panel that literally prints both
// the total and the pieces.
describe('allocateShares — component breakdown that sums to the total by construction', () => {
  // entries: [{d, w, comps:{a,b,c}}], mirroring what the view builds per metric
  // point (d=date, w=weight/sales, comps=per-component ratio for that day).
  const entries = (rows) => rows.map(([d, w, comps]) => ({ d: new Date(d), w, comps }));

  it('shares sum to 1 and total*shares sums to exactly the total (weightedLevel)', () => {
    const e = entries([
      ['2026-09-01', 1000, { a: 0.01, b: 0.02, c: 0.005 }],
      ['2026-09-02', 1200, { a: 0.012, b: 0.018, c: 0.006 }],
      ['2026-09-03', 900, { a: 0.009, b: 0.021, c: 0.004 }],
      ['2026-09-04', 1100, { a: 0.011, b: 0.019, c: 0.0055 }],
    ]);
    const { shares, sum } = allocateShares(e, ['a', 'b', 'c'], weightedLevel);
    const shareSum = shares.a + shares.b + shares.c;
    expect(shareSum).toBeCloseTo(1, 10);
    expect(sum).toBeGreaterThan(0);
    const total = 0.0385; // an arbitrary externally-computed "Smart" total
    const allocated = total * shares.a + total * shares.b + total * shares.c;
    expect(allocated).toBeCloseTo(total, 10);
  });

  it('produces the same guarantee through weightedRecencyLevel (the real Smart-target basis)', () => {
    const e = entries(Array.from({ length: 60 }, (_, i) => {
      const d = new Date('2026-09-13T00:00:00'); d.setDate(d.getDate() - i);
      return [d.toISOString().slice(0, 10), 1000 + i, { a: 0.01 + i * 0.0001, b: 0.02 - i * 0.00005, c: 0.005 }];
    }));
    const { shares } = allocateShares(e, ['a', 'b', 'c'], weightedRecencyLevel, { asOf: new Date('2026-09-13T00:00:00') });
    const shareSum = shares.a + shares.b + shares.c;
    expect(shareSum).toBeCloseTo(1, 9);
    const total = 100; // any number -- the guarantee is share-sum-to-1, not data-specific
    expect(total * shares.a + total * shares.b + total * shares.c).toBeCloseTo(total, 6);
  });

  it('falls back to an equal 1/N split (still summing to 1) when every component is zero/missing', () => {
    const e = entries([['2026-09-01', 1000, {}], ['2026-09-02', 1000, {}]]);
    const { shares } = allocateShares(e, ['a', 'b', 'c', 'd'], weightedLevel);
    expect(shares).toEqual({ a: 0.25, b: 0.25, c: 0.25, d: 0.25 });
  });

  it('a single component always gets a 100% share', () => {
    const e = entries([['2026-09-01', 1000, { a: 0.02 }]]);
    const { shares } = allocateShares(e, ['a'], weightedLevel);
    expect(shares).toEqual({ a: 1 });
  });

  it('degrades gracefully on empty/null entries', () => {
    expect(() => allocateShares(null, ['a', 'b'], weightedLevel)).not.toThrow();
    expect(allocateShares([], ['a', 'b'], weightedLevel).shares).toEqual({ a: 0.5, b: 0.5 });
  });

  it('a component genuinely worth more of the total gets more than an equal share', () => {
    // b's daily values run ~4x a's across every day -- b should end up with roughly
    // 4x a's share, not merely more (a monotonic, not just directional, check).
    const e = entries(Array.from({ length: 20 }, (_, i) => [
      new Date(2026, 8, 1 + i).toISOString().slice(0, 10), 1000, { a: 0.01, b: 0.04 },
    ]));
    const { shares } = allocateShares(e, ['a', 'b'], weightedLevel);
    expect(shares.b / shares.a).toBeCloseTo(4, 6);
  });
});
