import { describe, it, expect } from 'vitest';
import { detectSessions, cycleCompliance, diffNewWrins, COVER_FRAC,
         formatWeeklyComplianceReport } from '../engine/count-cycle.js';

// Owner-directed 2026-10-11: "I would like to change that [the coverage bar] throughout to
// be more close to 100% with the only exception being a new wrin (new product)... But with a
// notation that a new wrin needs counting." COVER_FRAC is now 1 (see its own comment in
// count-cycle.js); diffNewWrins() is the new mechanism that keeps a genuinely new product
// from being held against this period's compliance while still surfacing it for the crew.

const mkRow = (loc, cls, wrin, lastCounted, extra = {}) =>
  ({ loc, cls, wrin, last_counted: lastCounted, ...extra });

describe('diffNewWrins — detecting items new to a store\'s active universe this period', () => {
  it('flags a wrin present now but absent from the prior period as new', () => {
    const current = [mkRow('5985', 'Food', 'A', null), mkRow('5985', 'Food', 'B', null)];
    const prior = [mkRow('5985', 'Food', 'A', null)];   // B didn't exist last period
    const out = diffNewWrins(current, prior);
    expect(out['5985'].has('B')).toBe(true);
    expect(out['5985'].has('A')).toBe(false);
  });

  it('a wrin present in both periods is not new', () => {
    const current = [mkRow('5985', 'Food', 'A', null)];
    const prior = [mkRow('5985', 'Food', 'A', null)];
    const out = diffNewWrins(current, prior);
    expect(out['5985']).toBeUndefined();
  });

  it('with no prior-period data at all for a loc, every active current item reads as new -- ' +
     'correct (nothing to compare against), not a gap papered over with a guess', () => {
    const current = [mkRow('5985', 'Food', 'A', null), mkRow('5985', 'Food', 'B', null)];
    const out = diffNewWrins(current, []);
    expect(out['5985'].size).toBe(2);
  });

  it('an inactive row never counts as new (isActive() gate, same as the rest of the engine)', () => {
    const current = [mkRow('5985', 'Food', 'A', null, { active: false, recipeItem: false })];
    const out = diffNewWrins(current, []);
    expect(out['5985']).toBeUndefined();
  });
});

describe('detectSessions() excludes new WRINs from both numerator and denominator', () => {
  it('a new item is invisible to the coverage math but listed in newItems', () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => mkRow('5985', 'Food', `old-${i}`, '2026-10-05')),
      mkRow('5985', 'Food', 'new-1', null, { descr: 'New Breakfast Wrap' }),   // never touched
    ];
    const newWrinsByLoc = { '5985': new Set(['new-1']) };
    const { sessions, classTotals, newItems } = detectSessions(rows, { newWrinsByLoc });
    expect(classTotals['5985'].Food).toBe(10);   // the new item is NOT part of the denominator
    const s = sessions['5985'][0];
    expect(s.covered).toContain('Food');          // 10/10 real items -- full coverage despite the untouched new item
    expect(newItems['5985']).toEqual([{ wrin: 'new-1', descr: 'New Breakfast Wrap', cls: 'Food' }]);
  });

  it('without the exclusion, the SAME new item would have blocked full coverage (contrast case)', () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => mkRow('5985', 'Food', `old-${i}`, '2026-10-05')),
      mkRow('5985', 'Food', 'new-1', null),
    ];
    const { sessions, classTotals } = detectSessions(rows);   // no newWrinsByLoc at all
    expect(classTotals['5985'].Food).toBe(11);
    expect(sessions['5985'][0].covered).not.toContain('Food');   // 10/11 < COVER_FRAC(1)
  });

  it('a new item that IS counted is simply excluded either way -- new-ness, not counting, decides', () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => mkRow('5985', 'Food', `old-${i}`, '2026-10-05')),
      mkRow('5985', 'Food', 'new-1', '2026-10-05'),   // crew counted it anyway
    ];
    const newWrinsByLoc = { '5985': new Set(['new-1']) };
    const { classTotals, newItems } = detectSessions(rows, { newWrinsByLoc });
    expect(classTotals['5985'].Food).toBe(10);
    expect(newItems['5985'].length).toBe(1);   // still listed -- whether it got counted isn't tracked here
  });
});

describe('cycleCompliance() surfaces newItems per store, and grades Food+Condiment at the near-100% bar', () => {
  const fullStore = (loc, { newWrin = false } = {}) => {
    const rows = [
      ...Array.from({ length: 20 }, (_, i) => mkRow(loc, 'Food', `f-${i}`, '2026-10-05')),
      ...Array.from({ length: 10 }, (_, i) => mkRow(loc, 'Condiment', `c-${i}`, '2026-10-05')),
    ];
    if (newWrin) rows.push(mkRow(loc, 'Food', 'new-item', null, { descr: 'New Fry Sauce' }));
    return rows;
  };

  it('a store that fully counted every pre-existing item, with one brand-new untouched item, ' +
     'is NOT overdue and gets a newItems note', () => {
    const rows = fullStore('5985', { newWrin: true });
    const newWrinsByLoc = diffNewWrins(rows, [...Array.from({ length: 20 }, (_, i) => mkRow('5985', 'Food', `f-${i}`, null)),
                                               ...Array.from({ length: 10 }, (_, i) => mkRow('5985', 'Condiment', `c-${i}`, null))]);
    const c = cycleCompliance(rows, { asOf: '2026-10-06', newWrinsByLoc });
    expect(c[0].overdue).toBe(false);
    expect(c[0].newItems).toEqual([{ wrin: 'new-item', descr: 'New Fry Sauce', cls: 'Food' }]);
  });

  it('without newWrinsByLoc at all (the pre-existing call shape), that same store would read ' +
     'overdue -- confirms the exception is opt-in via the param, not a silent universal grace', () => {
    const rows = fullStore('5985', { newWrin: true });
    const c = cycleCompliance(rows, { asOf: '2026-10-06' });
    expect(c[0].overdue).toBe(true);
    expect(c[0].newItems).toEqual([]);
  });
});

describe('formatWeeklyComplianceReport — no stale 75% text, new items get their own section', () => {
  it('never mentions 75% (the stale text this dispatch fixed)', () => {
    const rows = [...Array.from({ length: 5 }, (_, i) => mkRow('5985', 'Food', `f-${i}`, '2026-10-05'))];
    const c = cycleCompliance(rows, { asOf: '2026-10-06' })[0];
    const md = formatWeeklyComplianceReport(c, { storeName: 'Test Store' });
    expect(md).not.toMatch(/75%/);
  });

  it('lists pending new items with a "still needs counting" note when present', () => {
    const rows = fullStoreRows();
    const newWrinsByLoc = { '5985': new Set(['new-item']) };
    const c = cycleCompliance(rows, { asOf: '2026-10-06', newWrinsByLoc })[0];
    const md = formatWeeklyComplianceReport(c, { storeName: 'Test Store' });
    expect(md).toMatch(/New items/);
    expect(md).toMatch(/still/);
    expect(md).toMatch(/New Fry Sauce/);
  });

  function fullStoreRows() {
    return [
      ...Array.from({ length: 20 }, (_, i) => mkRow('5985', 'Food', `f-${i}`, '2026-10-05')),
      mkRow('5985', 'Food', 'new-item', null, { descr: 'New Fry Sauce' }),
    ];
  }
});

describe('COVER_FRAC value', () => {
  it('is 1 (full coverage of the active-minus-new universe)', () => {
    expect(COVER_FRAC).toBe(1);
  });
});
