// @vitest-environment happy-dom
// @ts-nocheck
// Owner request 2026-11-11 (messaging/UX, cross-metric): "if OEPE is an opportunity, let's
// identify it as we are now by daily signal, but also point out what hours or even quarter
// hours had the biggest opportunity." worstOepeSlot() (src/features/morning-brief.js) finds the
// real qsr_daily_activity hour_slot that drove a store's daily OEPE hardest, using the SAME
// reconciled oepeSeconds() formula (utils/oepe.js) every other OEPE figure in the app already
// uses -- not a new, separately-calibrated formula. Wired into the STAFFED_SLOW finding (the
// clearest "OEPE is an opportunity" rule) as an additive detail, never replacing the daily figure.
//
// Drives the real computeMorningBrief() end to end (not the private MORNING_RULES array), per
// this repo's "would this verification still pass if reverted?" standing rule -- a test that
// only called worstOepeSlot() directly could pass unchanged with STAFFED_SLOW's own wiring to it
// deleted.
import { describe, it, expect } from 'vitest';
import { computeMorningBrief, worstOepeSlot } from '../features/morning-brief.js';
import { lastClosedBusinessDay } from '../engine/swing-feed.js';
import { addD } from '../utils/date.js';

const LOC = '3708'; // real seed store (constants.js STORE_NAMES), Ardmore-Broadway OK
const TARGET = lastClosedBusinessDay(); // computeStoreNorms' own 8-week window always ends here

function storeFrom(brief) {
  const s = brief.stores.find(st => st.loc === LOC);
  expect(s, `store ${LOC} not found in brief.stores`).toBeTruthy();
  return s;
}

describe('worstOepeSlot() — pure function', () => {
  it('picks the slot with the highest reconciled OEPE, among slots clearing the sample guard', () => {
    const dar = { slots: [
      // 17:00 (5pm): (5000-1000-0)/4/1000 = 1s... use larger numbers for a readable result.
      { slot: '17:00', dt_untilserve: 400000, dt_untilstore: 40000, dt_heldtime: 0, dt_trans_cnt: 4 }, // 90s
      { slot: '18:00', dt_untilserve: 800000, dt_untilstore: 40000, dt_heldtime: 0, dt_trans_cnt: 4 }, // 190s -- worst
      { slot: '06:00', dt_untilserve: 999999999, dt_untilstore: 40000, dt_heldtime: 0, dt_trans_cnt: 1 }, // below minTrans, excluded
    ]};
    const worst = worstOepeSlot(dar);
    expect(worst).toEqual({ slot: '18:00', oepe: 190, trans: 4, label: '6pm' });
  });

  it('finds the BEST slot instead when worst:false (the praise/shout-out mirror case)', () => {
    const dar = { slots: [
      { slot: '08:00', dt_untilserve: 400000, dt_untilstore: 40000, dt_heldtime: 0, dt_trans_cnt: 4 }, // 90s -- best
      { slot: '12:00', dt_untilserve: 800000, dt_untilstore: 40000, dt_heldtime: 0, dt_trans_cnt: 4 }, // 190s
    ]};
    expect(worstOepeSlot(dar, { worst: false })).toEqual({ slot: '08:00', oepe: 90, trans: 4, label: '8am' });
  });

  it('returns null when every slot is below the minimum-sample guard (no noisy near-empty slot named)', () => {
    const dar = { slots: [{ slot: '17:00', dt_untilserve: 100, dt_untilstore: 10, dt_heldtime: 0, dt_trans_cnt: 1 }] };
    expect(worstOepeSlot(dar)).toBeNull();
  });

  it('returns null for a store with no DAR slots at all', () => {
    expect(worstOepeSlot({ slots: [] })).toBeNull();
    expect(worstOepeSlot(null)).toBeNull();
  });
});

describe('STAFFED_SLOW finding — hour-slot drill-down (owner request 2026-11-11)', () => {
  it('names the worst hour when a qualifying DAR slot exists, without replacing the daily figure', () => {
    const ds = {
      laborRows: [{ loc: LOC, date: TARGET, actVsNeed: 1 }],
      peaksSvcRows: [
        // Historical norm rows (outside the +-3 day "today" window, inside the 8-week norm window).
        { loc: LOC, date: addD(TARGET, -10), oepe: 100 },
        { loc: LOC, date: addD(TARGET, -20), oepe: 100 },
        { loc: LOC, date: addD(TARGET, -30), oepe: 100 },
        // Today's own peaks-sourced OEPE, well above norm*1.15.
        { loc: LOC, date: TARGET, oepe: 250 },
      ],
    };
    const darByLoc = { [String(parseInt(LOC, 10))]: { slots: [
      { slot: '17:00', dt_untilserve: 400000, dt_untilstore: 40000, dt_heldtime: 0, dt_trans_cnt: 4 }, // 90s
      { slot: '18:00', dt_untilserve: 800000, dt_untilstore: 40000, dt_heldtime: 0, dt_trans_cnt: 4 }, // 190s -- worst
    ] } };

    const brief = computeMorningBrief(ds, TARGET, darByLoc);
    const flag = storeFrom(brief).flags.find(f => f.id === 'STAFFED_SLOW');
    expect(flag, 'STAFFED_SLOW flag did not fire').toBeTruthy();
    // The pre-existing daily figure is unchanged.
    expect(flag.headline).toMatch(/^OEPE 250s/);
    expect(flag.detail).toMatch(/manager on duty not actively managing the floor/);
    // The new drill-down is additive, in `action`, naming the real worst hour.
    expect(flag.action).toMatch(/Hardest hit: the 6pm hour \(190s over 4 cars\)/);
  });

  it('fires the daily-only finding, unchanged, when no darByLoc entry exists for this store (no slot note)', () => {
    const ds = {
      laborRows: [{ loc: LOC, date: TARGET, actVsNeed: 1 }],
      peaksSvcRows: [
        { loc: LOC, date: addD(TARGET, -10), oepe: 100 },
        { loc: LOC, date: addD(TARGET, -20), oepe: 100 },
        { loc: LOC, date: addD(TARGET, -30), oepe: 100 },
        { loc: LOC, date: TARGET, oepe: 250 },
      ],
    };
    const brief = computeMorningBrief(ds, TARGET, {});
    const flag = storeFrom(brief).flags.find(f => f.id === 'STAFFED_SLOW');
    expect(flag, 'STAFFED_SLOW flag did not fire').toBeTruthy();
    expect(flag.action).not.toMatch(/Hardest hit/);
  });
});
