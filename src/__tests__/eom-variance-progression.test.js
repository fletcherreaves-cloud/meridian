import { describe, it, expect } from 'vitest';
import { itemVarianceProgression, storeVarianceProgressions, itemCountSessions } from '../engine/eom-variance-progression.js';

// A count event: $ impact at that submission + a date/time so ordering + session-grouping are stable.
const cnt = (dolVar, tm, dt = '2026-07-14', manager = 'Marlena F') => ({ isCount: true, dt, tm, difference: dolVar, manager });

describe('itemCountSessions — binding-final, area-by-area', () => {
  it('groups same-session area entries into ONE session (final is binding)', () => {
    // FRIES at #3708: 3 bags at the fry station (−$1,103), then the freezer added (+$1,106) → one count.
    const s = itemCountSessions([cnt(-1103, '9:02 AM'), cnt(1106, '9:46 AM')]);
    expect(s.nSessions).toBe(1);
    expect(s.nRecounts).toBe(0);                 // NOT a recount — it's one area-by-area count
    expect(s.sessions[0].nEntries).toBe(2);
    expect(s.sessions[0].areaBuildUp).toBe(true);
    expect(s.sessions[0].offsetting).toBe(true); // big swing that nets small = counting artifact
    expect(Math.round(s.binding.netDolVar)).toBe(3);
  });

  it('splits a next-day count into a separate session (a genuine recount)', () => {
    const s = itemCountSessions([cnt(-100, '8:00 AM', '2026-07-14'), cnt(-40, '8:00 AM', '2026-07-15')]);
    expect(s.nSessions).toBe(2);
    expect(s.nRecounts).toBe(1);
  });
});

describe('itemVarianceProgression — session-aware', () => {
  it('single session with area entries = counted, NOT recount-hurt (the FRIES bug fix)', () => {
    const p = itemVarianceProgression([cnt(-1103, '9:02 AM'), cnt(1106, '9:46 AM')]);
    expect(p.nRecounts).toBe(0);
    expect(p.verdict).toBe('counted-multi');
    expect(p.flags).not.toContain('recount-worsened');
    expect(p.flags).not.toContain('held-worse');
  });

  it("genuine recount (separate day): base -100 -> -50 = improved", () => {
    const p = itemVarianceProgression([cnt(-100, '8:00 AM', '2026-07-14'), cnt(-50, '8:00 AM', '2026-07-15')]);
    expect(p.base.dolVar).toBe(-100);
    expect(p.nRecounts).toBe(1);
    expect(p.final.dolVar).toBe(-50);
    expect(p.improvedVsBase).toBe(true);
    expect(p.verdict).toBe('improved');
    expect(p.steps[0].direction).toBe('improved');
    expect(p.steps[0].netImprovedVsBase).toBe(50);
    expect(p.flags).not.toContain('recount-worsened');
  });

  it("genuine recount (separate day): base -100 -> -175 = worsened (recount hurt)", () => {
    const p = itemVarianceProgression([cnt(-100, '8:00 AM', '2026-07-14'), cnt(-175, '8:00 AM', '2026-07-15')]);
    expect(p.verdict).toBe('worsened');
    expect(p.steps[0].direction).toBe('hurt');
    expect(p.flags).toContain('recount-worsened');
    expect(p.netVsBase).toBe(-75);
  });

  it('held-worse: two separate recount sessions holding the worse value', () => {
    const p = itemVarianceProgression([cnt(-100, '8:00 AM', '2026-07-14'), cnt(-175, '8:00 AM', '2026-07-15'), cnt(-175, '8:00 AM', '2026-07-16')]);
    expect(p.nRecounts).toBe(2);
    expect(p.flags).toContain('held-worse');
    expect(p.verdict).toBe('worsened');
  });

  it('flags a ~$0 binding as improbable', () => {
    const p = itemVarianceProgression([cnt(-100, '8:00 AM', '2026-07-14'), cnt(0, '8:00 AM', '2026-07-15')]);
    expect(p.flags).toContain('zero-variance');
  });

  it('single count = no recounts, no verdict noise', () => {
    const p = itemVarianceProgression([cnt(-120, '8:00 AM')]);
    expect(p.nRecounts).toBe(0);
    expect(p.verdict).toBe('single-count');
    expect(p.steps).toHaveLength(0);
  });

  it('baseIndex override re-anchors the base session (the picker)', () => {
    const p = itemVarianceProgression([
      cnt(-30, '8:00 AM', '2026-07-13'), cnt(-100, '8:00 AM', '2026-07-14'), cnt(-50, '8:00 AM', '2026-07-15'),
    ], { baseIndex: 1 });
    expect(p.base.dolVar).toBe(-100);   // base is the 2nd session now
    expect(p.nRecounts).toBe(1);
    expect(p.final.dolVar).toBe(-50);
  });

  it('storeVarianceProgressions ranks flagged/biggest first + attaches officialVar', () => {
    const items = [
      { wrin: '1', descr: 'BEEF', history: [cnt(-100, '8:00 AM', '2026-07-14'), cnt(-175, '8:00 AM', '2026-07-15')] }, // worsened → flagged
      { wrin: '2', descr: 'FRIES', history: [cnt(-40, '8:00 AM', '2026-07-14'), cnt(-20, '8:00 AM', '2026-07-15')] },   // improved, small
      { wrin: '3', descr: 'TINY', history: [cnt(-5, '8:00 AM')] },                                                       // below minAbs, no official → dropped
    ];
    const out = storeVarianceProgressions(items, { statVar: { '1': 260 } });
    expect(out[0].descr).toBe('BEEF');            // flagged first
    expect(out[0].officialVar).toBe(260);         // authoritative period variance attached
    expect(out.find(o => o.descr === 'TINY')).toBeUndefined();
  });

  it('attaches priorVar (last-EOM anchor) for the month-over-month "vs Last EOM" view', () => {
    const items = [{ wrin: '1', descr: 'BEEF', history: [cnt(-100, '8:00 AM', '2026-07-14')] }];
    const out = storeVarianceProgressions(items, { statVar: { '1': -60 }, priorStatVar: { '1': -200 } });
    expect(out[0].officialVar).toBe(-60);
    expect(out[0].priorVar).toBe(-200);           // |−60| < |−200| → improving vs last EOM
  });
});
