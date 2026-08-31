import { describe, it, expect } from 'vitest';
import {
  periodKey, daysInPeriod, countWindowStart, lastDayOfPeriod, inCountWindow,
  normClass, computeCountProgress, diagnoseIncompleteCount, rankVarianceFollowups,
  buildStoreStatus, buildIncompleteCountMessage, FOB_CLASSES, BELIEVES_DONE_PCT,
  recommendationForState, STATE_RECOMMENDATION,
} from '../engine/eom-inventory.js';

const d = (y, m, day) => { const x = new Date(y, m - 1, day); x.setHours(0, 0, 0, 0); return x; };

describe('period + window helpers', () => {
  it('periodKey formats YYYY-MM', () => {
    expect(periodKey(d(2026, 7, 15))).toBe('2026-07');
    expect(periodKey(d(2026, 12, 1))).toBe('2026-12');
  });
  it('daysInPeriod handles month lengths + leap years', () => {
    expect(daysInPeriod('2026-07')).toBe(31);
    expect(daysInPeriod('2026-02')).toBe(28);
    expect(daysInPeriod('2024-02')).toBe(29); // leap
    expect(daysInPeriod('2026-04')).toBe(30);
  });
  it('countWindowStart is the last 3 days (July 29)', () => {
    expect(countWindowStart('2026-07').getTime()).toBe(d(2026, 7, 29).getTime());
    expect(countWindowStart('2026-02').getTime()).toBe(d(2026, 2, 26).getTime());
  });
  it('lastDayOfPeriod', () => {
    expect(lastDayOfPeriod('2026-07').getTime()).toBe(d(2026, 7, 31).getTime());
  });
  it('inCountWindow only true from the 29th onward (July)', () => {
    expect(inCountWindow('2026-07', d(2026, 7, 28))).toBe(false);
    expect(inCountWindow('2026-07', d(2026, 7, 29))).toBe(true);
    expect(inCountWindow('2026-07', d(2026, 7, 31))).toBe(true);
  });
});

describe('normClass', () => {
  it('maps QSRSoft labels to buckets', () => {
    expect(normClass('Food')).toBe('food');
    expect(normClass('Condiments')).toBe('condiment');
    expect(normClass('Paper')).toBe('paper');
    expect(normClass('Non-Product')).toBe('nonproduct');
    expect(normClass('Non Product')).toBe('nonproduct');
    expect(normClass('Operating Supplies')).toBe('nonproduct');
    expect(normClass('')).toBe('other');
  });
  it('FOB is food + condiment only', () => {
    expect(FOB_CLASSES).toEqual(['food', 'condiment']);
  });
});

describe('computeCountProgress', () => {
  const period = '2026-07';
  // 10 items: 4 food, 3 condiment, 2 paper, 1 nonproduct
  const mk = (wrin, cls, countedOn) => ({ wrin, cls, lastCounted: countedOn, onHandAmt: 100 });
  it('counts items whose lastCounted is inside the window', () => {
    const rows = [
      mk('10001', 'Food', d(2026, 7, 30)),   // counted
      mk('10002', 'Food', d(2026, 7, 29)),   // counted
      mk('10003', 'Food', null),             // not counted
      mk('10004', 'Food', d(2026, 7, 20)),   // before window → not counted
      mk('20001', 'Condiment', d(2026, 7, 30)),
      mk('20002', 'Condiment', d(2026, 7, 31)),
      mk('20003', 'Condiment', d(2026, 7, 30)),
      mk('30001', 'Paper', d(2026, 7, 29)),
      mk('30002', 'Paper', null),
      mk('40001', 'Non-Product', null),
    ];
    const p = computeCountProgress(rows, { period, asOf: d(2026, 7, 30) });
    expect(p.itemsTotal).toBe(10);
    expect(p.itemsCounted).toBe(6);
    expect(p.pctCounted).toBeCloseTo(0.6, 5);
    expect(p.byClass.food.total).toBe(4);
    expect(p.byClass.food.counted).toBe(2);
    expect(p.byClass.condiment.counted).toBe(3);
    expect(p.byClass.condiment.done).toBe(true); // 3/3
    // FOB completion = (2 food + 3 cond) / (4 + 3)
    expect(p.fobTotal).toBe(7);
    expect(p.fobCounted).toBe(5);
    expect(p.fobPctCounted).toBeCloseTo(5 / 7, 5);
    expect(p.inWindow).toBe(true);
    expect(p.lastActivityAt.getTime()).toBe(d(2026, 7, 31).getTime());
  });

  it('uses lastSubmitted when lastCounted is missing', () => {
    const rows = [{ wrin: '1', cls: 'Food', lastSubmitted: d(2026, 7, 30) }];
    const p = computeCountProgress(rows, { period, asOf: d(2026, 7, 30) });
    expect(p.itemsCounted).toBe(1);
  });

  it('believesDone flips at the 90% threshold', () => {
    const counted = Array.from({ length: 9 }, (_, i) => ({ wrin: 'c' + i, cls: 'Food', lastCounted: d(2026, 7, 30) }));
    const rows = [...counted, { wrin: 'x', cls: 'Food', lastCounted: null }];
    const p = computeCountProgress(rows, { period, asOf: d(2026, 7, 30) });
    expect(p.pctCounted).toBeCloseTo(0.9, 5);
    expect(p.pctCounted).toBeGreaterThanOrEqual(BELIEVES_DONE_PCT);
    expect(p.believesDone).toBe(true);
  });

  it('empty rows → zeroed, not NaN', () => {
    const p = computeCountProgress([], { period, asOf: d(2026, 7, 30) });
    expect(p.itemsTotal).toBe(0);
    expect(p.pctCounted).toBe(0);
    expect(p.believesDone).toBe(false);
  });
});

describe('diagnoseIncompleteCount', () => {
  const period = '2026-07';
  it('ranks uncounted items by value at risk and rolls up by class', () => {
    const rows = [
      { wrin: '1', cls: 'Food', descr: 'Beef 10:1', onHandAmt: 500, lastCounted: null },
      { wrin: '2', cls: 'Food', descr: 'Buns', onHandAmt: 50, lastCounted: null },
      { wrin: '3', cls: 'Food', descr: 'Fries', onHandAmt: 300, lastCounted: d(2026, 7, 30) }, // counted → excluded
      { wrin: '4', cls: 'Condiment', descr: 'Ketchup', onHandAmt: 120, lastCounted: null },
    ];
    const diag = diagnoseIncompleteCount(rows, { period, asOf: d(2026, 7, 30) });
    expect(diag.uncountedCount).toBe(3);
    expect(diag.uncounted[0].wrin).toBe('1'); // highest value first
    expect(diag.uncountedValue).toBe(670);
    const food = diag.byClass.find(c => c.cls === 'food');
    expect(food.count).toBe(2);
    expect(food.valueAtRisk).toBe(550);
  });
  it('minValue filters low-dollar noise', () => {
    const rows = [
      { wrin: '1', cls: 'Food', onHandAmt: 5, lastCounted: null },
      { wrin: '2', cls: 'Food', onHandAmt: 200, lastCounted: null },
    ];
    const diag = diagnoseIncompleteCount(rows, { period, minValue: 50 });
    expect(diag.uncountedCount).toBe(1);
  });
  it('acceptEarly (count-date exception) drops early-counted items but keeps never-counted', () => {
    const rows = [
      { wrin: '1', cls: 'Food', descr: 'Beef', onHandAmt: 500, lastCounted: null },            // never
      { wrin: '2', cls: 'Food', descr: 'Fries', onHandAmt: 300, lastCounted: d(2026, 7, 20) }, // early (this period, pre-window)
    ];
    const normal = diagnoseIncompleteCount(rows, { period, asOf: d(2026, 7, 31) });
    expect(normal.uncountedCount).toBe(2);
    expect(normal.byState.early.n).toBe(1);
    const accepted = diagnoseIncompleteCount(rows, { period, asOf: d(2026, 7, 31), acceptEarly: true });
    expect(accepted.uncountedCount).toBe(1);           // early accepted → dropped
    expect(accepted.byState.early.n).toBe(0);
    expect(accepted.uncounted[0].wrin).toBe('1');      // never-counted still flagged
  });
  it('drops zero-substance never/early items with no deactivation signal; a zero-substance item with a (Deactivated) descr still appears, but calmly (2026-08-31: descr-text detection supersedes "should NOT be flagged")', () => {
    const rows = [
      // Deactivated in QSRSoft (descr says so), zeroed out, counted this period before the final
      // window. Originally (v5.268) this was dropped from `uncounted` entirely -- but that missed
      // the actual point of the 'stale'/verify-and-clear bucket, which exists so a store can
      // formally confirm+deactivate a zeroed residual (see the 2026-08-31 descr-text fix above).
      // So this item now correctly APPEARS, routed to the calm 'stale' bucket, not dropped outright
      // and not given the urgent "recount now" treatment either.
      { wrin: 'dead-1', cls: 'Food', descr: 'APPLES/DICED (Deactivated)', onHandAmt: 0, totalUnits: 0, lastCounted: d(2026, 7, 15) },
      // Never counted at all, zero substance, and NO deactivation signal in its descr — genuinely
      // nothing to act on, correctly dropped.
      { wrin: 'dead-2', cls: 'Food', descr: 'Dead item, never counted', onHandAmt: 0, totalUnits: 0, lastCounted: null },
      // Real gap: never counted, real value → still flagged.
      { wrin: 'real-1', cls: 'Food', descr: 'Beef', onHandAmt: 500, totalUnits: 10, lastCounted: null },
      // Zero $ but real units on hand (e.g. missing unit price) → still flagged, there's physical stock.
      { wrin: 'real-2', cls: 'Food', descr: 'No price on file', onHandAmt: 0, totalUnits: 5, lastCounted: null },
    ];
    const diag = diagnoseIncompleteCount(rows, { period, asOf: d(2026, 7, 30) });
    const wrins = diag.uncounted.map(u => u.wrin);
    const byWrin = Object.fromEntries(diag.uncounted.map(u => [u.wrin, u]));
    expect(wrins).toContain('dead-1');
    expect(byWrin['dead-1'].state).toBe('stale'); // calm verify-&-clear bucket, not urgent recount
    expect(wrins).not.toContain('dead-2');
    expect(wrins).toContain('real-1');
    expect(wrins).toContain('real-2');
  });
  it('reclassifies a QSRSoft-deactivated item (active:false) to stale even with a nonzero residual and an in-period count date (2026-08-30 generalized fix)', () => {
    // Ada-Country Club, loc 6972, real 2026-08 data: two items marked active:false by QSRSoft
    // still carry a nonzero residual (so the zero-substance filter above doesn't catch them) and
    // were last counted THIS period before the final window -- so the date-only logic classified
    // them 'early' and the diagnosis report gave them the aggressive "recount now, real gap"
    // treatment meant for genuinely active items. active===false must win regardless of value or
    // count date, routing to the SAME "verify & clear" bucket a stale item gets.
    const rows = [
      { wrin: '00050-002', cls: 'Condiment', descr: 'LEMONS (Obsolete 4 days left', onHandAmt: 11.07, totalUnits: 10, lastCounted: d(2026, 7, 6), active: false },
      { wrin: '03663-024', cls: 'Condiment', descr: 'Big Mac Sauce Cup', onHandAmt: -1.47, totalUnits: -10.4, lastCounted: d(2026, 7, 13), active: false },
      // Control: a genuinely active item counted early with real value stays 'early' — this fix
      // must not blunt the real early-count warning for items that actually need it.
      { wrin: '00076-126', cls: 'Food', descr: 'Fried Apple Pie', onHandAmt: 30.58, totalUnits: 111, lastCounted: d(2026, 7, 13), active: true },
      // Control: active===null (pre-migration / unknown) must NOT be treated as inactive.
      { wrin: '19809-002', cls: 'Food', descr: 'Blue Raspberry Syrup', onHandAmt: 7.56, totalUnits: 1, lastCounted: d(2026, 7, 6), active: null },
    ];
    const diag = diagnoseIncompleteCount(rows, { period, asOf: d(2026, 7, 30) });
    const byWrin = Object.fromEntries(diag.uncounted.map(u => [u.wrin, u]));
    expect(byWrin['00050-002'].state).toBe('stale');
    expect(byWrin['03663-024'].state).toBe('stale');
    expect(byWrin['03663-024'].valueAtRisk).toBeCloseTo(1.47, 2); // abs() of the negative on-hand
    expect(byWrin['00076-126'].state).toBe('early'); // active item — real gap, unaffected
    expect(byWrin['19809-002'].state).toBe('early'); // active:null — not treated as inactive
  });
  it('reclassifies by descr text when `active` disagrees with it (2026-08-31 fix, Durant #5985 real data)', () => {
    // Durant-US Hwy 70/22, real 2026-08 data: `active` alone still missed two real cases --
    // Big Mac Sauce Cup shows active:null (not false, so the prior fix's `active===false` check
    // never fired) and Caesar Sauce Pouch shows active:TRUE despite its own descr literally
    // saying "(Deactivated)" -- QSRSoft's boolean column and its own text disagree. Both kept
    // showing up in "recount now, real gap" framing. The descr text is the more reliable signal.
    const rows = [
      { wrin: '03663-024', cls: 'Condiment', descr: 'Big Mac Sauce Cup (Deactivated)', onHandAmt: -2.20, totalUnits: -15.5, lastCounted: d(2026, 7, 7), active: null },
      { wrin: '18627-002', cls: 'Food', descr: 'Caesar Sauce Pouch (Deactivated)', onHandAmt: -1.37, totalUnits: -0.45, lastCounted: d(2026, 7, 22), active: true },
      // Control: "(Obsolete N days left" is a COUNTDOWN, not a completed deactivation -- the item
      // is still active right now and needs a normal current count. Must stay 'early', not 'stale'.
      { wrin: '00076-126', cls: 'Food', descr: 'Fried Apple Pie', onHandAmt: 30.58, totalUnits: 111, lastCounted: d(2026, 7, 7), active: true },
      { wrin: 'lid-1', cls: 'Paper', descr: 'LID/SIP LID/30OZ/CLD CUP (Obsolete 24 days left', onHandAmt: 5, totalUnits: 3, lastCounted: d(2026, 7, 7), active: true },
      // Control: a fully-expired obsolete item (closed parens, no countdown remaining) must still
      // route to stale purely off the descr text, even with active:null (isolates the descr path
      // from the already-tested active===false path above).
      { wrin: 'scooby-1', cls: 'Food', descr: 'SCOOBY/SCOOB/HM20/US (Obsolete)', onHandAmt: 2, totalUnits: 1, lastCounted: d(2026, 7, 7), active: null },
    ];
    const diag = diagnoseIncompleteCount(rows, { period, asOf: d(2026, 7, 30) });
    const byWrin = Object.fromEntries(diag.uncounted.map(u => [u.wrin, u]));
    expect(byWrin['03663-024'].state).toBe('stale');
    expect(byWrin['18627-002'].state).toBe('stale');
    expect(byWrin['00076-126'].state).toBe('early');
    expect(byWrin['lid-1'].state).toBe('early');
    expect(byWrin['scooby-1'].state).toBe('stale');
  });
  it('reclassifies an item that dropped out of the store\'s CURRENT on-hand pull, even with no deactivation text at all (2026-08-31 fix #2, Durant #5985 real data)', () => {
    // qsr_onhand is upsert-only -- when QSRSoft stops returning a WRIN, its row just stops getting
    // refreshed while the rest of the store keeps updating. Real Durant numbers: the store's freshest
    // pull today, these two items last refreshed 15.7 days earlier, NEITHER carries "(Deactivated)"/
    // "(Obsolete)" text or active:false -- isDeactivatedByDescr() alone would miss both.
    const freshAt = '2026-08-31T14:37:00.731Z';
    const staleAt = '2026-08-15T20:52:59.504Z';   // ~15.7 days behind
    const rows = [
      { wrin: '00076-126', cls: 'Food', descr: 'Fried Apple Pie', onHandAmt: 12.67, totalUnits: 46, lastCounted: d(2026, 7, 7), active: null, updatedAt: staleAt },
      { wrin: '20351-000', cls: 'Food', descr: 'Honey Brown Butter Sce Nat Flv', onHandAmt: 8.92, totalUnits: 1.87, lastCounted: d(2026, 7, 7), active: null, updatedAt: staleAt },
      // Control: a normal item refreshed in THIS SAME pull (0 gap) must stay 'early', not 'stale'.
      { wrin: 'active-1', cls: 'Food', descr: 'Sesame Seed Bun', onHandAmt: 40, totalUnits: 80, lastCounted: d(2026, 7, 7), active: null, updatedAt: freshAt },
      // Control: no updatedAt at all (pre-migration row) must never trigger this signal -- backward
      // compatible with every row shape that predates this fix.
      { wrin: 'no-updated-at', cls: 'Food', descr: 'Old Row', onHandAmt: 10, totalUnits: 5, lastCounted: d(2026, 7, 7), active: null },
    ];
    const diag = diagnoseIncompleteCount(rows, { period, asOf: d(2026, 7, 30) });
    const byWrin = Object.fromEntries(diag.uncounted.map(u => [u.wrin, u]));
    expect(byWrin['00076-126'].state).toBe('stale');
    expect(byWrin['20351-000'].state).toBe('stale');
    expect(byWrin['active-1'].state).toBe('early');
    expect(byWrin['no-updated-at'].state).toBe('early');
  });
  it('does NOT flag a store-wide pull outage — the signal is RELATIVE to the store\'s own freshest pull, not absolute', () => {
    // Every item in this store refreshed at the SAME time (the pull ran but the store just hasn't
    // had a MORE RECENT one) -- gap is 0 for everyone, nothing should read as "dropped".
    const sameAt = '2026-08-20T10:00:00.000Z';
    const rows = [
      { wrin: 'a', cls: 'Food', descr: 'Item A', onHandAmt: 10, totalUnits: 5, lastCounted: d(2026, 7, 7), active: null, updatedAt: sameAt },
      { wrin: 'b', cls: 'Food', descr: 'Item B', onHandAmt: 10, totalUnits: 5, lastCounted: d(2026, 7, 7), active: null, updatedAt: sameAt },
    ];
    const diag = diagnoseIncompleteCount(rows, { period, asOf: d(2026, 7, 30) });
    const byWrin = Object.fromEntries(diag.uncounted.map(u => [u.wrin, u]));
    expect(byWrin['a'].state).toBe('early');
    expect(byWrin['b'].state).toBe('early');
  });
  it('keeps zero-substance STALE items — the Obsolete/Discontinued/Inactive "verify & clear" bucket needs them', () => {
    const rows = [
      // Last counted in a PRIOR period, now zeroed out → 'stale'. Must stay so the store can
      // formally deactivate it in QSRSoft — this is exactly what that bucket exists to catch.
      { wrin: 'stale-dead', cls: 'Food', descr: 'Long-forgotten item', onHandAmt: 0, totalUnits: 0, lastCounted: d(2026, 6, 15) },
    ];
    const diag = diagnoseIncompleteCount(rows, { period, asOf: d(2026, 7, 30) });
    expect(diag.uncounted.map(u => u.wrin)).toContain('stale-dead');
    expect(diag.byState.stale.n).toBe(1);
  });
  it('flags lateBulk when Food/Cond/Paper bulk-counted on the last day (owner 2nd/3rd-day-out rule)', () => {
    // Bulk counted on the last day (07/31) → late.
    const late = diagnoseIncompleteCount([
      { wrin: '1', cls: 'Food', onHandAmt: 100, lastCounted: d(2026, 7, 31) },
      { wrin: '2', cls: 'Condiment', onHandAmt: 100, lastCounted: d(2026, 7, 31) },
      { wrin: '3', cls: 'Paper', onHandAmt: 100, lastCounted: d(2026, 7, 30) },
    ], { period });
    expect(late.lateBulk).toBe(true);
    expect(late.lateBulkDay).toBe('2026-07-31');
    // Bulk on the 30th (2nd day out) → on time, not late.
    const onTime = diagnoseIncompleteCount([
      { wrin: '1', cls: 'Food', onHandAmt: 100, lastCounted: d(2026, 7, 30) },
      { wrin: '2', cls: 'Condiment', onHandAmt: 100, lastCounted: d(2026, 7, 30) },
      { wrin: '3', cls: 'Food', onHandAmt: 100, lastCounted: d(2026, 7, 31) },
    ], { period });
    expect(onTime.lateBulk).toBe(false);
  });
});

describe('computeCountProgress acceptEarly (count-date exception)', () => {
  it('counts early counts as done when the exception is granted', () => {
    const rows = [
      { cls: 'Food', lastCounted: d(2026, 7, 20) },   // early
      { cls: 'Food', lastCounted: d(2026, 7, 30) },   // in the final window
    ];
    expect(computeCountProgress(rows, { period: '2026-07', asOf: d(2026, 7, 31) }).byClass.food.counted).toBe(1);
    expect(computeCountProgress(rows, { period: '2026-07', asOf: d(2026, 7, 31), acceptEarly: true }).byClass.food.counted).toBe(2);
  });
});

describe('rankVarianceFollowups', () => {
  it('flags large negative variance as recount-up, filters below threshold', () => {
    const variance = [
      { wrin: '1', cls: 'Food', descr: 'Beef', dolDiff: -420, variance: -30 },
      { wrin: '2', cls: 'Food', descr: 'Cheese', dolDiff: -20, variance: -2 }, // below minDol
      { wrin: '3', cls: 'Condiment', descr: 'Mustard', dolDiff: 150, variance: 10 },
    ];
    const onHand = [{ wrin: '1', cases: 4, loose: 2 }, { wrin: '3', cases: 5 }];
    const summary = [{ wrin: '3', daysSupply: 14 }];
    const out = rankVarianceFollowups(variance, onHand, summary, { minDol: 50 });
    expect(out).toHaveLength(2);
    expect(out[0].wrin).toBe('1');
    expect(out[0].action).toBe('recount-up');
    expect(out[0].severity).toBe('critical');
    const cond = out.find(o => o.wrin === '3');
    expect(cond.action).toBe('verify-overcount');
    expect(cond.tip).toMatch(/days-of-supply/i);
  });
  it('no on-hand row → operational-issue tip', () => {
    const out = rankVarianceFollowups([{ wrin: '9', cls: 'Food', dolDiff: -100 }], [], []);
    expect(out[0].onHand).toBe(null);
    expect(out[0].tip).toMatch(/operational issue/i);
  });
});

describe('real QSRSoft On-Hand shape (captured 2026-07-26)', () => {
  // Rows as loadQsrOnHand returns them (post-DB-round-trip camelCase): the script maps
  // full_wrin→wrin, long_desc→descr, invty_class→cls, case_count→cases, nonRoundedOnHandAmt→onHandAmt,
  // last_counted→Date. This mirrors the actual eu065119 / store-3708 response.
  const mk = (wrin, cls, lastCounted, onHandAmt) => ({
    loc: '0003708', period: '2026-07', wrin, descr: wrin + ' desc', cls,
    cases: 3, packs: 0, loose: 5, totalUnits: 100, unitPrice: 0.5, onHandAmt,
    lastCounted, lastSubmitted: lastCounted,
  });
  it('pre-window (all counted 07/21-07/24) → 0% for the July close', () => {
    const rows = [
      mk('00001-705', 'Food', d(2026, 7, 21), 405.9),
      mk('00005-086', 'Food', d(2026, 7, 24), 1355.2),
      mk('00407-958', 'Food', d(2026, 7, 24), 2374.5),
    ];
    const p = computeCountProgress(rows, { period: '2026-07', asOf: d(2026, 7, 26) });
    expect(p.itemsTotal).toBe(3);
    expect(p.pctCounted).toBe(0); // last counts predate the 29th window → nothing counted yet
    expect(p.believesDone).toBe(false);
  });
  it('mid-window: items recounted on the 30th register as counted', () => {
    const rows = [
      mk('00001-705', 'Food', d(2026, 7, 30), 405.9),   // recounted
      mk('00005-086', 'Food', d(2026, 7, 30), 1355.2),  // recounted
      mk('00407-958', 'Food', d(2026, 7, 24), 2374.5),  // still stale
    ];
    const p = computeCountProgress(rows, { period: '2026-07', asOf: d(2026, 7, 30) });
    expect(p.itemsCounted).toBe(2);
    expect(p.pctCounted).toBeCloseTo(2 / 3, 5);
    // the stale high-value item surfaces as the top uncounted diagnosis
    const diag = diagnoseIncompleteCount(rows, { period: '2026-07', asOf: d(2026, 7, 30) });
    expect(diag.uncounted[0].wrin).toBe('00407-958');
  });
});

describe('buildIncompleteCountMessage', () => {
  const period = '2026-07';
  it('lists uncounted high-value items and totals them', () => {
    const rows = [
      { wrin: '00005-086', cls: 'Food', descr: '100% PURE BEEF', onHandAmt: 1355, lastCounted: null },
      { wrin: '00407-958', cls: 'Food', descr: 'Chicken McNuggets', onHandAmt: 2374, lastCounted: null },
      { wrin: '00013-350', cls: 'Condiment', descr: 'CHEESE', onHandAmt: 336, lastCounted: d(2026, 7, 30) }, // counted
    ];
    const msg = buildIncompleteCountMessage('Tishomingo', rows, { period, asOf: d(2026, 7, 30) });
    expect(msg.hasGaps).toBe(true);
    expect(msg.count).toBe(2);
    expect(msg.subject).toMatch(/2 items need recount/);
    expect(msg.body).toMatch(/Chicken McNuggets/);
    expect(msg.body).toMatch(/100% PURE BEEF/);
    expect(msg.body).not.toMatch(/CHEESE/); // already counted
    expect(Math.round(msg.totalValue)).toBe(3729);
  });
  it('all counted → clean "complete" message, hasGaps false', () => {
    const rows = [{ wrin: '1', cls: 'Food', descr: 'X', onHandAmt: 500, lastCounted: d(2026, 7, 30) }];
    const msg = buildIncompleteCountMessage('Ada', rows, { period, asOf: d(2026, 7, 30) });
    expect(msg.hasGaps).toBe(false);
    expect(msg.hasPlan).toBe(false);
    expect(msg.body).toMatch(/no outstanding/i);
  });
  it('off-window / no gaps but diagnosis findings → carries the action plan (fixes empty body)', () => {
    const actionItems = [
      '[CRITICAL] 100% PURE BEEF variance (WRIN 00005-086) — off by ~$420; recount before close.',
      '[HIGH] Waste concentrated with one manager — review shift logs.',
    ];
    const msg = buildIncompleteCountMessage('Ada', [], {
      period, asOf: d(2026, 7, 15), actionItems, diagSummary: '2 findings', diagDollars: 640,
    });
    expect(msg.hasGaps).toBe(false);
    expect(msg.hasPlan).toBe(true);
    expect(msg.subject).toMatch(/2 items to review/);
    expect(msg.body).toMatch(/action plan/i);
    expect(msg.body).toMatch(/100% PURE BEEF/);
    expect(msg.body).toMatch(/WRIN 00005-086/);
    expect(msg.body).not.toMatch(/no outstanding/i); // not the empty "looks complete" note
  });
  it('recount gaps AND findings → both the recount list and the appended action plan', () => {
    const rows = [{ wrin: '00005-086', cls: 'Food', descr: '100% PURE BEEF', onHandAmt: 1355, lastCounted: null }];
    const actionItems = ['[HIGH] Onion variance (WRIN 00019-001) — off by ~$110.'];
    const msg = buildIncompleteCountMessage('Tishomingo', rows, {
      period, asOf: d(2026, 7, 30), actionItems, diagDollars: 110,
    });
    expect(msg.hasGaps).toBe(true);
    expect(msg.hasPlan).toBe(true);
    expect(msg.body).toMatch(/need to recount|recount and resubmit|physically recount/i);
    expect(msg.body).toMatch(/action plan/i);
    expect(msg.body).toMatch(/Onion variance/);
  });
});

describe('buildStoreStatus', () => {
  it('fires shouldNotify when believesDone AND in window', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ wrin: 's' + i, cls: 'Food', lastCounted: d(2026, 7, 30) }));
    const s = buildStoreStatus({ loc: '0001234', period: '2026-07', onHandRows: rows, fobSnapshot: { fobPct: 0.256, totalFcPct: 0.31 }, asOf: d(2026, 7, 30) });
    expect(s.believesDone).toBe(true);
    expect(s.shouldNotify).toBe(true);
    expect(s.fobPct).toBeCloseTo(0.256, 5);
  });
  it('does not notify before the window even if fully counted', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ wrin: 's' + i, cls: 'Food', lastCounted: d(2026, 7, 20) }));
    const s = buildStoreStatus({ loc: '0001234', period: '2026-07', onHandRows: rows, asOf: d(2026, 7, 20) });
    expect(s.shouldNotify).toBe(false);
  });
});

describe('recommendationForState (dispatch #227 — Missing-Items report)', () => {
  it('maps never/early/stale to buildIncompleteCountMessage\'s own proven phrasing, not new copy', () => {
    expect(recommendationForState('never')).toBe(STATE_RECOMMENDATION.never);
    expect(recommendationForState('never')).toMatch(/no count on record this period/);
    expect(recommendationForState('early')).toMatch(/predates the final count window/);
    expect(recommendationForState('stale')).toMatch(/no count since a prior period/);
  });
  it('falls back safely for an unknown/missing state', () => {
    expect(recommendationForState('bogus')).toMatch(/Review this item/);
    expect(recommendationForState(undefined)).toMatch(/Review this item/);
  });
});
