import { describe, it, expect } from 'vitest';
import { recountImpactByStore, fobConsistencyByStore } from '../engine/fob-recount-analysis.js';

// A genuine recount is a SEPARATE session (different day) — same-day area entries are one count.
const cnt = (v, tm, dt = '2026-07-14') => ({ isCount: true, dt, tm, difference: v, manager: 'A' });

describe('recountImpactByStore', () => {
  it('ranks net-harmful stores first (recounts moved variance AWAY from zero)', () => {
    const rawByLoc = {
      '3708': [{ wrin: '1', descr: 'BEEF', history: [cnt(-100, '8:00 AM', '2026-07-14'), cnt(-300, '8:00 AM', '2026-07-15')] }],   // away $200 (harmful)
      '34222': [{ wrin: '1', descr: 'BEEF', history: [cnt(-100, '8:00 AM', '2026-07-14'), cnt(-20, '8:00 AM', '2026-07-15')] }],   // toward $80 (helpful)
    };
    const out = recountImpactByStore(rawByLoc);
    expect(out[0].loc).toBe('3708');          // most harmful first
    expect(out[0].net).toBe(-200);
    expect(out[0].away).toBe(200);
    expect(out[1].loc).toBe('34222');
    expect(out[1].net).toBe(80);
    expect(out[0].items[0].descr).toBe('BEEF');   // decomposable to the item
  });
});

describe('fobConsistencyByStore', () => {
  it('computes monthly-final FOB% mean + sd, steadiest first', () => {
    const fob = [
      // store A: 2 months, both ~4% → low sd
      { loc: 'A', date: '2026-06-30', prodSalesAmt: 10000, compWasteAmt: 100, rawWasteAmt: 100, condimentsAmt: 200, empMgrMealsAmt: 0, statVarianceAmt: 0, unexplainedAmt: 0 }, // 4.0%
      { loc: 'A', date: '2026-07-31', prodSalesAmt: 10000, compWasteAmt: 100, rawWasteAmt: 100, condimentsAmt: 210, empMgrMealsAmt: 0, statVarianceAmt: 0, unexplainedAmt: 0 }, // 4.1%
      // store B: 2 months, swingy → higher sd
      { loc: 'B', date: '2026-06-30', prodSalesAmt: 10000, compWasteAmt: 100, rawWasteAmt: 100, condimentsAmt: 100, empMgrMealsAmt: 0, statVarianceAmt: 0, unexplainedAmt: 0 }, // 3.0%
      { loc: 'B', date: '2026-07-31', prodSalesAmt: 10000, compWasteAmt: 100, rawWasteAmt: 100, condimentsAmt: 600, empMgrMealsAmt: 0, statVarianceAmt: 0, unexplainedAmt: 0 }, // 8.0%
    ];
    const out = fobConsistencyByStore(fob);
    expect(out[0].loc).toBe('A');            // steadiest first
    expect(out[0].sd).toBeLessThan(out[1].sd);
    expect(out[0].n).toBe(2);
    expect(Math.round(out[0].mean * 10) / 10).toBe(4.1);   // ~ (4.0 + 4.1)/2
  });
});
