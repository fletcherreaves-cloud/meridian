import { describe, it, expect } from 'vitest';
import {
  median, mad, quantile, trendSlope, robustBaseline,
  likeSizedPeers, peerAnchor, blend, confidence, computeSmartTarget,
  windowRate, weightedRecencyProjection, periodTotal, backtestProjectors, toISODate,
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
