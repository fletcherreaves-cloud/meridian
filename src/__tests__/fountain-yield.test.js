import { describe, it, expect } from 'vitest';
import { fountainShortTotal, fountainBaseline, fountainVerdict } from '../engine/fountain-yield.js';

describe('fountainShortTotal', () => {
  it('sums fountain-beverage shorts with ~zero waste, ignores non-bev and wasted items', () => {
    const rows = [
      { descr: 'COKE CLASSIC BIB', dolDiff: -120, rawWaste: 0, compWaste: 0 },
      { descr: 'SPRITE BIB', dolDiff: -80, rawWaste: 0, compWaste: 0 },
      { descr: 'COKE BIB (waste logged)', dolDiff: -50, rawWaste: 5, compWaste: 0 },   // has waste → skip
      { descr: '100% BEEF', dolDiff: -300, rawWaste: 0, compWaste: 0 },                 // not bev → skip
      { descr: 'SPRITE BIB', dolDiff: 40, rawWaste: 0, compWaste: 0 },                  // gain → skip
    ];
    expect(fountainShortTotal(rows)).toBe(200);
  });
});

describe('fountainBaseline + fountainVerdict', () => {
  it('builds a mean/sd baseline and flags an abnormal current month', () => {
    const base = fountainBaseline([100, 120, 110, 130]);   // steady ~115
    expect(base.n).toBe(4);
    expect(Math.round(base.mean)).toBe(115);
    // a normal month ~ baseline → not abnormal
    expect(fountainVerdict(120, base).abnormal).toBe(false);
    // a big spike → abnormal (well beyond mean + 2sd and > 1.6x)
    const v = fountainVerdict(600, base);
    expect(v.abnormal).toBe(true);
    expect(v.ratio).toBeGreaterThan(1.6);
  });

  it('does not flag when there is no usable baseline (< 2 months)', () => {
    expect(fountainVerdict(500, fountainBaseline([100])).abnormal).toBe(false);
    expect(fountainVerdict(500, fountainBaseline([])).reason).toBe('no-baseline');
  });

  it('respects the minAbs floor — a small spike over a tiny baseline is not flagged', () => {
    const base = fountainBaseline([10, 12, 8]);
    expect(fountainVerdict(40, base, { minAbs: 75 }).abnormal).toBe(false);  // 40 < minAbs
  });
});
