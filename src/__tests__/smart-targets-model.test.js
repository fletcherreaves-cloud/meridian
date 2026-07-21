import { describe, it, expect } from 'vitest';
import { computeSmartTarget, peerBaselinesFor, districtValue } from '../engine/smart-targets-model.js';

const tight = (center, n = 20) => Array.from({ length: n }, (_, i) => center + (i % 5) - 2);

describe('computeSmartTarget', () => {
  it('null series → null target', () => {
    expect(computeSmartTarget([], []).smart).toBeNull();
  });

  it('with no peers, target = own robust baseline', () => {
    const r = computeSmartTarget(tight(100), []);
    expect(r.anchor).toBeNull();
    expect(r.smart).toBeCloseTo(100, 0);
    expect(r.baseline).toBeCloseTo(100, 0);
  });

  it('lower-better: steps a realistic fraction toward a better (lower) peer quartile', () => {
    // own baseline ~100; peers cluster ~80 → anchor lower (better)
    const peers = [78, 80, 82, 84, 86];
    const r = computeSmartTarget(tight(100), peers, { lowerBetter: true, frac: 0.25 });
    expect(r.anchor).toBeLessThan(100);
    // moved down from 100, but only ~25% of the gap — not all the way to the anchor
    expect(r.smart).toBeLessThan(100);
    expect(r.smart).toBeGreaterThan(r.anchor);
  });

  it('does NOT regress a store already better than the district best quartile', () => {
    // lower-better; own baseline ~60 already beats peers ~80
    const peers = [78, 80, 82, 84, 86];
    const r = computeSmartTarget(tight(60), peers, { lowerBetter: true, frac: 0.25 });
    expect(r.smart).toBeCloseTo(r.baseline, 5); // holds its strong baseline
  });

  it('higher-better: steps up toward a higher peer quartile', () => {
    const peers = [6.0, 6.2, 6.4, 6.6, 6.8]; // TPPH-like
    const r = computeSmartTarget(tight(5), peers, { lowerBetter: false, frac: 0.25 });
    expect(r.anchor).toBeGreaterThan(5);
    expect(r.smart).toBeGreaterThan(5);
    expect(r.smart).toBeLessThan(r.anchor);
  });

  it('rejects an anomaly from the baseline and reports it', () => {
    const s = tight(100).concat([99999]);
    const r = computeSmartTarget(s, []);
    expect(r.excluded).toBe(1);
    expect(r.smart).toBeLessThan(200);
  });

  it('confidence scales with sample size', () => {
    expect(computeSmartTarget(tight(100, 25), []).confidence).toBe('high');
    expect(computeSmartTarget(tight(100, 10), []).confidence).toBe('medium');
    expect(computeSmartTarget(tight(100, 4), []).confidence).toBe('low');
  });
});

describe('peerBaselinesFor — same market + volume tier', () => {
  const stores = [
    { loc: 'A', series: tight(100), volume: 1000 },
    { loc: 'B', series: tight(90), volume: 1100 },   // within 40%
    { loc: 'C', series: tight(80), volume: 5000 },   // too big → excluded
  ];
  it('includes similar-volume peers, excludes far-off volume, excludes self', () => {
    const peers = peerBaselinesFor('A', stores, 0.40);
    expect(peers.length).toBe(1); // only B qualifies
    expect(peers[0]).toBeCloseTo(90, 0);
  });
});

describe('districtValue — correct roll-up', () => {
  it('dollar-weights when $ pairs are given (not a mean of ratios)', () => {
    const pairs = [{ num: 5, den: 100 }, { num: 150, den: 1000 }];
    expect(districtValue([0.05, 0.15], pairs)).toBeCloseTo(155 / 1100, 10);
  });
  it('falls back to median of store baselines (never mean-of-means)', () => {
    expect(districtValue([10, 20, 90], null)).toBe(20); // median, not mean(40)
  });
});
