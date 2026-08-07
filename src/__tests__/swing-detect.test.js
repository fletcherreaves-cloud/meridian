import { describe, it, expect } from 'vitest';
import { detectSwing, pctSeries, classify, swingItem, SWING_DEFAULTS } from '../engine/swing-detect.js';

// Weekly buckets for store 10422, pulled from qsr_daily_activity_rollup on 2026-08-07.
// This is the case the owner flagged: sales and guests both collapsed over five weeks
// and nothing surfaced it. The detector must fire CRITICAL on this data — that is the
// whole point of the feature, so it is pinned as a test.
const S10422 = [
  { label: '2026-06-19', cur: 96692,  base: 96534,  curGuests: 8388, baseGuests: 8390 },
  { label: '2026-06-26', cur: 94017,  base: 93168,  curGuests: 8165, baseGuests: 8180 },
  { label: '2026-07-03', cur: 102316, base: 100633, curGuests: 8535, baseGuests: 8500 },
  { label: '2026-07-10', cur: 94729,  base: 99330,  curGuests: 8094, baseGuests: 8500 },
  { label: '2026-07-17', cur: 88609,  base: 96298,  curGuests: 7890, baseGuests: 8600 },
  { label: '2026-07-24', cur: 89775,  base: 98214,  curGuests: 7904, baseGuests: 8700 },
  { label: '2026-07-31', cur: 77042,  base: 98634,  curGuests: 6900, baseGuests: 8800 },
  { label: '2026-08-07', cur: 69823,  base: 86942,  curGuests: 6340, baseGuests: 8200 },
];

// A healthy store: noisy week to week, but no sustained run. Must NOT fire — an alarm
// that cries wolf gets ignored, which defeats "there must be no reason it is not surfaced".
const HEALTHY = [
  { label: 'w1', cur: 100000, base: 98000,  curGuests: 8000, baseGuests: 7900 },
  { label: 'w2', cur: 94000,  base: 100000, curGuests: 7700, baseGuests: 8100 },
  { label: 'w3', cur: 103000, base: 99000,  curGuests: 8200, baseGuests: 8000 },
  { label: 'w4', cur: 97000,  base: 99500,  curGuests: 7900, baseGuests: 8050 },
];

describe('store 10422 — the case this was built for', () => {
  const swing = detectSwing(S10422);

  it('fires, and fires CRITICAL', () => {
    expect(swing).not.toBeNull();
    expect(swing.severity).toBe('crit');
  });

  it('identifies it as a sustained downward run, not a one-week blip', () => {
    expect(swing.rule).toBe('sustained-down');
    expect(swing.direction).toBe('down');
    expect(swing.run).toBeGreaterThanOrEqual(2);
  });

  it('reports the real magnitude', () => {
    expect(swing.pct).toBeLessThan(-15);
    expect(swing.dollars).toBeLessThan(-30000);
  });

  it('classifies it as a traffic problem, not a pricing one', () => {
    // Sales -20.8% vs guests -22.4%: only ~1.6pp apart, i.e. they moved together.
    // That is the diagnosis the owner wants up front — this is volume, not mix. The
    // gap is well inside noise, so it must NOT be over-read as "check is holding".
    expect(swing.guestPct).toBeLessThan(-15);
    expect(swing.kind).toBe('traffic');
  });

  it('requires acknowledgement so it cannot be scrolled past', () => {
    const item = swingItem('10422', swing, () => 'Store 10422');
    expect(item.requiresAck).toBe(true);
    expect(item.severity).toBe('crit');
    expect(item.title).toContain('10422');
    expect(item.dollars).toBeLessThan(0);
  });
});

describe('does not cry wolf', () => {
  it('a noisy but healthy store does not fire', () => {
    expect(detectSwing(HEALTHY)).toBeNull();
  });

  it('a single bad week below the sustained threshold does not fire on its own', () => {
    const one = [
      { label: 'w1', cur: 100000, base: 100000 },
      { label: 'w2', cur: 100000, base: 100000 },
      { label: 'w3', cur: 90500,  base: 100000 },  // -9.5%: under warn, over the p1 spike
    ];
    expect(detectSwing(one)).toBeNull();
  });

  it('a recovered dip does not fire — the run must reach the present', () => {
    const recovered = [
      { label: 'w1', cur: 85000,  base: 100000 },  // -15%
      { label: 'w2', cur: 86000,  base: 100000 },  // -14%
      { label: 'w3', cur: 101000, base: 100000 },  // recovered
    ];
    expect(detectSwing(recovered)).toBeNull();
  });
});

describe('threshold behaviour', () => {
  const run = (pcts) => pcts.map((p, i) => ({ label: `w${i}`, cur: 100000 * (1 + p / 100), base: 100000 }));

  it('two weeks at -10% or worse is critical', () => {
    expect(detectSwing(run([0, -11, -12])).severity).toBe('crit');
  });

  it('two weeks at -8% is a watch, not a critical', () => {
    expect(detectSwing(run([0, -8.5, -8.5])).severity).toBe('warn');
  });

  it('a single week at the p1 level fires immediately without a second week', () => {
    const s = detectSwing(run([0, 0, -14]));
    expect(s.severity).toBe('crit');
    expect(s.rule).toBe('spike-down');
    expect(s.run).toBe(1);
  });

  it('large sustained UPWARD swings surface too', () => {
    // The owner asked for one-directional, not negative — an unexplained +20% is
    // either an opportunity or a data problem.
    const s = detectSwing(run([0, 18, 19]));
    expect(s).not.toBeNull();
    expect(s.direction).toBe('up');
    expect(s.rule).toBe('sustained-up');
  });

  it('thresholds are overridable per call', () => {
    const s = detectSwing(run([0, -5, -5]), { warnPct: -4, critPct: -4.5 });
    expect(s.severity).toBe('crit');
  });
});

describe('classify — operational or otherwise', () => {
  it('both moving together reads as traffic', () => {
    expect(classify(-12, -12)).toBe('traffic');
  });
  it('guests falling much faster means check is holding', () => {
    expect(classify(-12, -20)).toBe('traffic-loss-check-holding');
  });
  it('sales falling faster than traffic means check erosion', () => {
    expect(classify(-20, -12)).toBe('check-erosion');
  });
  it('flat guests with a sales move points at mix, not traffic', () => {
    expect(classify(-9, -0.5)).toBe('check-mix');
  });
  it('is honest when there is no guest data', () => {
    expect(classify(-12, null)).toBe('unknown');
  });
});

describe('input robustness', () => {
  it('handles an empty series', () => {
    expect(detectSwing([])).toBeNull();
    expect(detectSwing()).toBeNull();
  });

  it('drops periods with a zero or missing baseline instead of dividing by zero', () => {
    const s = pctSeries([
      { label: 'a', cur: 100, base: 0 },
      { label: 'b', cur: 100, base: null },
      { label: 'c', cur: 90,  base: 100 },
    ]);
    expect(s).toHaveLength(1);
    expect(s[0].pct).toBeCloseTo(-10, 6);
  });

  it('works with no guest data at all', () => {
    const s = detectSwing([
      { label: 'w1', cur: 88000, base: 100000 },
      { label: 'w2', cur: 87000, base: 100000 },
    ]);
    expect(s.severity).toBe('crit');
    expect(s.guestPct).toBeNull();
    expect(s.kind).toBe('unknown');
  });

  it('swingItem returns null for a null swing', () => {
    expect(swingItem('1', null)).toBeNull();
  });

  it('defaults are the documented, measured values', () => {
    expect(SWING_DEFAULTS.critPct).toBe(-10);
    expect(SWING_DEFAULTS.warnPct).toBe(-8);
    expect(SWING_DEFAULTS.spikePct).toBe(-13);
    expect(SWING_DEFAULTS.minRun).toBe(2);
  });
});
