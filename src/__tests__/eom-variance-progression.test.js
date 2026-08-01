import { describe, it, expect } from 'vitest';
import { itemVarianceProgression, storeVarianceProgressions } from '../engine/eom-variance-progression.js';

// A count event: variance ($) at that count, plus a time so ordering is stable.
const cnt = (dolVar, tm, manager = 'Marlena F') => ({ isCount: true, dt: '2026-07-14', tm, difference: dolVar, manager });

describe('itemVarianceProgression', () => {
  it("owner example: base -100 -> recount to -50 = improved (moved toward zero)", () => {
    const p = itemVarianceProgression([cnt(-100, '8:00 AM'), cnt(-50, '9:00 AM')]);
    expect(p.base.dolVar).toBe(-100);
    expect(p.nRecounts).toBe(1);
    expect(p.final.dolVar).toBe(-50);
    expect(p.improvedVsBase).toBe(true);
    expect(p.verdict).toBe('improved');
    expect(p.steps[0].direction).toBe('improved');
    expect(p.steps[0].netImprovedVsBase).toBe(50);   // $50 closer to zero
    expect(p.flags).not.toContain('recount-worsened');
  });

  it("owner example: base -100 -> recount to -175 = worsened (recount hurt)", () => {
    const p = itemVarianceProgression([cnt(-100, '8:00 AM'), cnt(-175, '9:00 AM')]);
    expect(p.verdict).toBe('worsened');
    expect(p.steps[0].direction).toBe('hurt');
    expect(p.flags).toContain('recount-worsened');
    expect(p.netVsBase).toBe(-75);
  });

  it('held-worse: two recounts holding the worse value (bad for result, good for accuracy)', () => {
    const p = itemVarianceProgression([cnt(-100, '8:00 AM'), cnt(-175, '9:00 AM'), cnt(-175, '10:00 AM')]);
    expect(p.nRecounts).toBe(2);
    expect(p.flags).toContain('held-worse');
    expect(p.verdict).toBe('worsened');
  });

  it('flags a ~$0 final variance as improbable', () => {
    const p = itemVarianceProgression([cnt(-100, '8:00 AM'), cnt(0, '9:00 AM')]);
    expect(p.flags).toContain('zero-variance');
  });

  it('single count = no recounts, no verdict noise', () => {
    const p = itemVarianceProgression([cnt(-120, '8:00 AM')]);
    expect(p.nRecounts).toBe(0);
    expect(p.verdict).toBe('single-count');
    expect(p.steps).toHaveLength(0);
  });

  it('baseIndex override re-anchors the base (the picker)', () => {
    const p = itemVarianceProgression([cnt(-30, '7:00 AM'), cnt(-100, '8:00 AM'), cnt(-50, '9:00 AM')], { baseIndex: 1 });
    expect(p.base.dolVar).toBe(-100);   // base is the 2nd count now
    expect(p.nRecounts).toBe(1);
    expect(p.final.dolVar).toBe(-50);
  });

  it('storeVarianceProgressions ranks flagged/biggest movers first', () => {
    const items = [
      { wrin: '1', descr: 'BEEF', history: [cnt(-100, '8:00 AM'), cnt(-175, '9:00 AM')] },  // worsened → flagged
      { wrin: '2', descr: 'FRIES', history: [cnt(-40, '8:00 AM'), cnt(-20, '9:00 AM')] },    // improved, small
      { wrin: '3', descr: 'TINY', history: [cnt(-5, '8:00 AM')] },                            // below minAbs → dropped
    ];
    const out = storeVarianceProgressions(items);
    expect(out[0].descr).toBe('BEEF');            // flagged first
    expect(out.find(o => o.descr === 'TINY')).toBeUndefined();
  });
});
