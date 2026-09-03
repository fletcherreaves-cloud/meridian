// @ts-nocheck
// eom-inventory.js's buildCountTip had zero direct test coverage despite being live: called
// from diagnoseIncompleteCount (same file) and independently in src/views/fob-eom.js to render
// the per-item coaching tip on an incomplete-count diagnosis.
import { describe, it, expect } from 'vitest';
import { buildCountTip } from '../engine/eom-inventory.js';

describe('buildCountTip', () => {
  it('flags an operational issue (not a count error) when the item is not on the On-Hand report at all', () => {
    expect(buildCountTip({ oh: null, s: { daysSupply: 5 }, dol: 100 }))
      .toBe('Not on the On-Hand report — operational issue (waste, yield, or tracking), not a count error.');
  });

  it('describes low days-of-supply as a likely uncounted-stock miss', () => {
    const r = buildCountTip({ oh: { cases: 2, packs: 0, loose: 0 }, s: { daysSupply: 1 }, dol: 50 });
    expect(r).toBe('Counted 2 cases. LOW on hand — look for uncounted stock in the freezer / walk-in.');
  });

  it('describes unusually high days-of-supply as worth a recount', () => {
    const r = buildCountTip({ oh: { cases: 10, packs: 0, loose: 0 }, s: { daysSupply: 15 }, dol: 50 });
    expect(r).toBe('Counted 10 cases. Unusually high days-of-supply — double-check the case count is right.');
  });

  it('defaults to a plain verify-the-loose-count tip in the normal 3-10 day range', () => {
    const r = buildCountTip({ oh: { cases: 3, packs: 0, loose: 0 }, s: { daysSupply: 5 }, dol: 50 });
    expect(r).toBe('Counted 3 cases. Verify the loose count.');
  });

  it('combines cases, packs, and a 2-decimal loose count, and pluralizes correctly', () => {
    const r = buildCountTip({ oh: { cases: 1, packs: 2, loose: 3.5 }, s: { daysSupply: 5 }, dol: 50 });
    expect(r).toBe('Counted 1 case + 2 packs + 3.50 loose. Verify the loose count.');
  });

  it('reports "nothing counted" when the on-hand row has zero cases/packs/loose', () => {
    const r = buildCountTip({ oh: { cases: 0, packs: 0, loose: 0 }, s: { daysSupply: 5 }, dol: 50 });
    expect(r).toBe('Counted nothing counted. Verify the loose count.');
  });

  it('defaults s and dol when omitted, treating a missing daysSupply as 0 (low)', () => {
    const r = buildCountTip({ oh: { cases: 1, packs: 0, loose: 0 } });
    expect(r).toBe('Counted 1 case. LOW on hand — look for uncounted stock in the freezer / walk-in.');
  });
});
