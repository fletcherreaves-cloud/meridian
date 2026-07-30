import { describe, it, expect } from 'vitest';
import { classifyItemPattern, buildItemSeries, PATTERN_META } from '../engine/eom-item-pattern.js';

const S = (...dols) => dols.map((dol, i) => ({ period: `2026-0${i + 1}`, dol }));

describe('classifyItemPattern', () => {
  it('flags within-tolerance when every period sits inside the band', () => {
    const { primary, chips } = classifyItemPattern(S(-10, 20, -5, 15), { tolerance: 50 });
    expect(primary.id).toBe('within-tolerance');
    expect(chips).toHaveLength(1);
  });

  it('flags loss-forming when recent periods are unfavorable and worsening', () => {
    const { chips, primary } = classifyItemPattern(S(-20, -80, -140, -210), { tolerance: 50 });
    expect(chips.map(c => c.id)).toContain('loss-forming');
    expect(primary.id).toBe('loss-forming'); // highest rank
  });

  it('flags high-variance when most periods blow the band, same direction', () => {
    const { chips } = classifyItemPattern(S(-120, -160, -140, -180), { tolerance: 50 });
    expect(chips.map(c => c.id)).toContain('high-variance');
  });

  it('flags inconsistent-count on a big sign-flip reversal (over-count then correction)', () => {
    const { chips } = classifyItemPattern(S(10, 300, -280, 20), { tolerance: 50 });
    expect(chips.map(c => c.id)).toContain('inconsistent-count');
  });

  it('flags inconsistent-count when a period was not counted', () => {
    const series = [{ period: '2026-05', dol: -10, counted: true }, { period: '2026-06', dol: 5, counted: false }];
    const { chips } = classifyItemPattern(series, { tolerance: 50 });
    expect(chips.map(c => c.id)).toContain('inconsistent-count');
  });

  it('flags fluctuating for volatile swings without a steady trend', () => {
    const { chips } = classifyItemPattern(S(-70, 60, -55, 65), { tolerance: 50 });
    const ids = chips.map(c => c.id);
    expect(ids.some(id => id === 'fluctuating' || id === 'inconsistent-count')).toBe(true);
  });

  it('is robust to empty / single-point input', () => {
    expect(classifyItemPattern([], { tolerance: 50 }).chips).toEqual([]);
    expect(classifyItemPattern(S(-5), { tolerance: 50 }).primary.id).toBe('within-tolerance');
  });

  it('every chip id has PATTERN_META', () => {
    const { chips } = classifyItemPattern(S(-20, -80, -140, -210), { tolerance: 50 });
    for (const c of chips) expect(PATTERN_META[c.id]).toBeTruthy();
  });
});

describe('buildItemSeries', () => {
  const rows = [
    { loc: '5985', period: '2026-05', wrin: '1', descr: 'Beef 10:1', dolDiff: -20, variance: -2 },
    { loc: '5985', period: '2026-06', wrin: '1', descr: 'Beef 10:1', dolDiff: -140, variance: -12 },
    { loc: '5985', period: '2026-06', wrin: '2', descr: 'Nuggets', dolDiff: 15, variance: 1 },
    { loc: '9999', period: '2026-06', wrin: '1', descr: 'Other loc', dolDiff: 500, variance: 40 },
  ];
  it('groups by wrin, scoped to loc, ordered by period window', () => {
    const m = buildItemSeries(rows, { loc: '5985', periodsAsc: ['2026-05', '2026-06'] });
    expect(m.get('1').series.map(s => s.dol)).toEqual([-20, -140]);
    expect(m.get('1').descr).toBe('Beef 10:1');
    expect(m.get('2').series).toHaveLength(1);
    expect(m.has('1')).toBe(true);
  });
  it('excludes other locations', () => {
    const m = buildItemSeries(rows, { loc: '5985', periodsAsc: ['2026-06'] });
    expect(m.get('1').series[0].dol).toBe(-140); // not the 9999 row's 500
  });
});
