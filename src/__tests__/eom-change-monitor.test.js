import { describe, it, expect } from 'vitest';
import { diffSnapshot, diffScope } from '../engine/eom-change-monitor.js';

const baseline = {
  loc: '35064',
  fob: { sales: 200000, fob: 12800, fobPct: 0.064, comp: 700, raw: 1700, cond: 4600, emp: 900, statv: 4700, unex: 200 },
  count: { earlyPctCounted: 0.95 },
  items: [
    { wrin: '1001', descr: 'Beef 10:1', cls: 'food', qty: 40, onHandAmt: 320, dolDiff: -180, lastCounted: '2026-07-31' },
    { wrin: '1002', descr: 'Cheese', cls: 'food', qty: 20, onHandAmt: 150, dolDiff: 60, lastCounted: '2026-07-31' },
    { wrin: '1003', descr: 'Ketchup', cls: 'condiment', qty: 10, onHandAmt: 40, dolDiff: -12, lastCounted: '2026-07-28' },
  ],
};

describe('diffSnapshot', () => {
  it('flags a recount that HELPED (variance toward $0) and one that HURT (away from $0)', () => {
    const current = {
      loc: '35064',
      fob: { sales: 200000, fob: 12100, fobPct: 0.0605, comp: 700, raw: 1700, cond: 4600, emp: 900, statv: 4000, unex: 200 },
      count: { earlyPctCounted: 1 },
      items: [
        { wrin: '1001', descr: 'Beef 10:1', cls: 'food', qty: 42, onHandAmt: 336, dolDiff: -20, lastCounted: '2026-08-01' }, // -180 -> -20 : helped
        { wrin: '1002', descr: 'Cheese', cls: 'food', qty: 20, onHandAmt: 150, dolDiff: 240, lastCounted: '2026-08-01' },     // 60 -> 240 : hurt
        { wrin: '1003', descr: 'Ketchup', cls: 'condiment', qty: 10, onHandAmt: 40, dolDiff: -12, lastCounted: '2026-07-28' }, // unchanged -> skipped
      ],
    };
    const d = diffSnapshot(baseline, current);
    expect(d.fob.verdict).toBe('helping');           // FOB% 6.4 -> 6.05
    expect(d.fob.dFobPct).toBeCloseTo(-0.0035, 4);
    const beef = d.items.find(i => i.wrin === '1001');
    const cheese = d.items.find(i => i.wrin === '1002');
    expect(beef.verdict).toBe('helping');
    expect(cheese.verdict).toBe('hurting');
    expect(d.items.find(i => i.wrin === '1003')).toBeUndefined(); // flat & unchanged -> not listed
    expect(d.nHelped).toBe(1);
    expect(d.nHurt).toBe(1);
    expect(beef.recounted).toBe(true);
  });

  it('treats no change as no activity', () => {
    const d = diffSnapshot(baseline, JSON.parse(JSON.stringify(baseline)));
    expect(d.anyActivity).toBe(false);
    expect(d.fob.verdict).toBe('flat');
  });

  it('labels an empty-baseline store as count-landing (verdict "counted"), not hurting (owner Notes 38 var-0)', () => {
    const emptyBase = { loc: '38609', fob: { fobPct: 0.0282 }, count: { earlyPctCounted: 1 }, items:
      ['Ice Cream', 'Sprite', 'Nuggets', '100% Beef', 'Bacon', 'Coke'].map((d, i) => ({ wrin: 'w' + i, descr: d, cls: 'food', qty: 0, dolDiff: 0, variance: 0 })) };
    const current = { loc: '38609', fob: { fobPct: 0.0298 }, count: { earlyPctCounted: 1 }, items:
      ['Ice Cream', 'Sprite', 'Nuggets', '100% Beef', 'Bacon', 'Coke'].map((d, i) => ({ wrin: 'w' + i, descr: d, cls: 'food', qty: 20, dolDiff: [-622, -427, -411, -329, -255, -144][i], variance: [-120, -80, -60, -50, -40, -20][i] })) };
    const d = diffSnapshot(emptyBase, current);
    expect(d.items.every(i => i.verdict !== 'hurting')).toBe(true);   // NOT scored as moves-that-hurt
    expect(d.nCounted).toBeGreaterThanOrEqual(5);
    expect(d.nHurt).toBe(0);
    expect(d.baselineIncomplete).toBe(true);
    // Qty variance base→now carried through.
    const ice = d.items.find(i => i.descr === 'Ice Cream');
    expect(ice.baseQtyVar).toBe(0);
    expect(ice.curQtyVar).toBe(-120);
  });

  it('marks brand-new and disappeared items', () => {
    const current = { ...baseline, items: [
      ...baseline.items.slice(1),
      { wrin: '9999', descr: 'New item', cls: 'food', qty: 5, dolDiff: -50, lastCounted: '2026-08-01' },
    ] };
    const d = diffSnapshot(baseline, current);
    expect(d.items.find(i => i.wrin === '9999').isNew).toBe(true);
    expect(d.items.find(i => i.wrin === '1001').isGone).toBe(true);
  });
});

describe('diffScope', () => {
  it('rolls up improved/worsened stores and tolerates loc zero-padding', () => {
    const worse = { loc: '0035065', fob: { ...baseline.fob, fobPct: 0.070 }, items: [] };
    const cur = {
      '35064': { ...baseline, fob: { ...baseline.fob, fobPct: 0.060 } },   // improved
      '35065': { ...worse, fob: { ...worse.fob, fobPct: 0.075 } },         // worsened
    };
    const out = diffScope({ '35064': baseline, '0035065': worse }, cur);
    expect(out.nStores).toBe(2);
    expect(out.improved).toBe(1);
    expect(out.worsened).toBe(1);
  });
});
