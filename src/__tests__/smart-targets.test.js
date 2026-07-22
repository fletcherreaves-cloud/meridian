import { describe, it, expect } from 'vitest';
import {
  median, mad, quantile, trendSlope, robustBaseline,
  likeSizedPeers, peerAnchor, blend, confidence, computeSmartTarget,
} from '../engine/smart-targets.js';

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
