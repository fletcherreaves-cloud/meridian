import { describe, it, expect } from 'vitest';
import {
  periodKey, daysInPeriod, countWindowStart, lastDayOfPeriod, inCountWindow,
  normClass, computeCountProgress, diagnoseIncompleteCount, rankVarianceFollowups,
  buildStoreStatus, buildIncompleteCountMessage, FOB_CLASSES, BELIEVES_DONE_PCT,
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
