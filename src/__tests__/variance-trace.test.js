import { describe, it, expect } from 'vitest';
import {
  fobDailyTrace, annotateTouchpoints, biggestJumpDay, FOB_TRACE_COMPONENTS, lastCountAnchor,
  classDelta, classTrace, FOB_CLASS_KEYS,
} from '../engine/variance-trace.js';

// qsr_fob rows are MTD-CUMULATIVE snapshots — build a synthetic month where day 15
// has a sudden jump in statVarianceAmt (the "something happened here" signal).
const mk = (loc, date, o = {}) => ({
  loc, date, prodSalesAmt: 10000,
  compWasteAmt: 100, rawWasteAmt: 50, condimentsAmt: 20, empMgrMealsAmt: 10,
  statVarianceAmt: 0, unexplainedAmt: 0,
  ...o,
});

describe('variance-trace — fobDailyTrace (day-over-day delta from MTD-cumulative snapshots)', () => {
  const rows = [
    mk('3708', '2026-07-01', { statVarianceAmt: 0 }),
    mk('3708', '2026-07-02', { statVarianceAmt: 0 }),
    // ... (sparse — only a few days pulled, which is realistic for intraday-only pulls early on)
    mk('3708', '2026-07-14', { statVarianceAmt: 0 }),
    mk('3708', '2026-07-15', { statVarianceAmt: 800 }),   // the jump
    mk('3708', '2026-07-16', { statVarianceAmt: 800 }),   // flat after — confirms it landed on the 15th
    mk('3708', '2026-07-31', { statVarianceAmt: 850 }),
  ];

  const trace = fobDailyTrace(rows, { loc: '3708', period: '2026-07' });

  it('returns one point per unique day, sorted ascending', () => {
    expect(trace.map(t => t.date)).toEqual(['2026-07-01', '2026-07-02', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-31']);
  });

  it('cumulative fob = sum of all 6 components for that day', () => {
    const d15 = trace.find(t => t.date === '2026-07-15');
    expect(d15.cumulative.fob).toBeCloseTo(100 + 50 + 20 + 10 + 800 + 0, 6);
  });

  it('first day of the period deltas against $0 (no lead-in row)', () => {
    expect(trace[0].delta.fob).toBeCloseTo(trace[0].cumulative.fob, 6);
  });

  it('delta = this day\'s cumulative minus the PREVIOUS day pulled (not calendar-adjacent)', () => {
    const d15 = trace.find(t => t.date === '2026-07-15');
    // prev pulled day was 07-14 (statVar 0) → delta statVar = 800 - 0 = 800
    expect(d15.delta.statVar).toBeCloseTo(800, 6);
  });

  it('a flat day after the jump shows ~$0 delta (confirms the jump landed on the 15th, not smeared)', () => {
    const d16 = trace.find(t => t.date === '2026-07-16');
    expect(d16.delta.statVar).toBeCloseTo(0, 6);
  });

  it('all 6 components are present on every point', () => {
    for (const pt of trace) for (const c of FOB_TRACE_COMPONENTS) expect(pt.cumulative[c]).not.toBeUndefined();
  });

  it('fobPct = fob / sales for that day', () => {
    const d1 = trace[0];
    expect(d1.cumulative.fobPct).toBeCloseTo(d1.cumulative.fob / 10000, 6);
  });

  it('a lead-in row from the PRIOR month is ignored for the delta (different MTD basis — still vs $0)', () => {
    const withLeadIn = fobDailyTrace(
      [mk('3708', '2026-06-30', { statVarianceAmt: 40 }), ...rows],
      { loc: '3708', period: '2026-07' }
    );
    expect(withLeadIn[0].delta.statVar).toBeCloseTo(0, 6);   // NOT 0 - 40 — June's MTD total isn't comparable to July's
  });

  it('does not diff across a month boundary (MTD snapshot resets, not a real drop)', () => {
    const twoMonths = [
      mk('3708', '2026-06-30', { statVarianceAmt: 900 }),
      mk('3708', '2026-07-01', { statVarianceAmt: 5 }),   // reset for the new month
    ];
    const t = fobDailyTrace(twoMonths, { loc: '3708', period: '2026-07' });
    expect(t[0].delta.statVar).toBeCloseTo(5, 6);   // NOT 5 - 900 = -895
  });

  it('filters to the requested loc only', () => {
    const mixed = [...rows, mk('9999', '2026-07-15', { statVarianceAmt: 99999 })];
    const t = fobDailyTrace(mixed, { loc: '3708', period: '2026-07' });
    expect(t.find(p => p.date === '2026-07-15').cumulative.statVar).toBeCloseTo(800, 6);
  });

  it('keeps only the freshest row when a day was pulled more than once intraday', () => {
    const dup = [mk('3708', '2026-07-15', { statVarianceAmt: 100 }), mk('3708', '2026-07-15', { statVarianceAmt: 800 })];
    const t = fobDailyTrace(dup, { loc: '3708', period: '2026-07' });
    expect(t[0].cumulative.statVar).toBeCloseTo(800, 6);
  });
});

describe('variance-trace — annotateTouchpoints', () => {
  const trace = fobDailyTrace(
    [mk('3708', '2026-07-14'), mk('3708', '2026-07-15', { statVarianceAmt: 800 }), mk('3708', '2026-07-20')],
    { loc: '3708', period: '2026-07' }
  );
  it('tags days with a matching cadence session', () => {
    const out = annotateTouchpoints(trace, { sessions: [{ day: '2026-07-14', kind: 'weekly' }, { day: '2026-07-20', kind: 'spot' }] });
    expect(out.find(p => p.date === '2026-07-14').touchpoint).toBe('weekly');
    expect(out.find(p => p.date === '2026-07-20').touchpoint).toBe('spot');
    expect(out.find(p => p.date === '2026-07-15').touchpoint).toBeNull();
  });
  it('tags the eomDay as eom even without a cadence session', () => {
    const out = annotateTouchpoints(trace, { sessions: [], eomDay: '2026-07-20' });
    expect(out.find(p => p.date === '2026-07-20').touchpoint).toBe('eom');
  });
});

describe('variance-trace — biggestJumpDay (the look-back window)', () => {
  const rows = [
    mk('3708', '2026-07-01', { statVarianceAmt: 0 }),
    mk('3708', '2026-07-08', { statVarianceAmt: 0 }),     // weekly count, clean
    mk('3708', '2026-07-14', { statVarianceAmt: 20 }),
    mk('3708', '2026-07-15', { statVarianceAmt: 800 }),   // the jump
    mk('3708', '2026-07-22', { statVarianceAmt: 810 }),   // next weekly count, mostly flat since
  ];
  const trace = fobDailyTrace(rows, { loc: '3708', period: '2026-07' });
  const annotated = annotateTouchpoints(trace, { sessions: [{ day: '2026-07-08', kind: 'weekly' }, { day: '2026-07-22', kind: 'weekly' }] });

  it('finds the day with the largest |delta.fob|', () => {
    const jump = biggestJumpDay(annotated);
    expect(jump.date).toBe('2026-07-15');
  });

  it('brackets the look-back window to the nearest PRIOR real count', () => {
    const jump = biggestJumpDay(annotated);
    expect(jump.windowStart).toBe('2026-07-08');   // not 07-14 (no count that day), the real prior count
  });

  it('returns null for an empty trace', () => {
    expect(biggestJumpDay([])).toBeNull();
  });
});

// ── Notes 58 #2: loopback anchored on the last real count ────────────────────
describe('lastCountAnchor', () => {
  const S = [{ day: '2026-07-30', kind: 'eom' }, { day: '2026-08-05', kind: 'weekly' },
             { day: '2026-08-12', kind: 'weekly' }];

  it('walks back past a count too recent to make a usable chart', () => {
    // Anchoring on 08-12 two days later would leave a two-point chart.
    expect(lastCountAnchor(S, { asOf: '2026-08-14' })).toBe('2026-08-05');
  });

  it('uses the most recent count once the window is wide enough', () => {
    expect(lastCountAnchor(S, { asOf: '2026-08-20' })).toBe('2026-08-12');
  });

  it('falls back to the earliest count rather than returning nothing', () => {
    expect(lastCountAnchor(S, { asOf: '2026-07-31' })).toBe('2026-07-30');
  });

  it('includes an explicit EOM day alongside the sessions', () => {
    expect(lastCountAnchor([], { eomDay: '2026-08-01', asOf: '2026-08-20' })).toBe('2026-08-01');
  });

  it('returns null when there is no count history at all', () => {
    expect(lastCountAnchor([], { asOf: '2026-08-20' })).toBeNull();
    expect(lastCountAnchor()).toBeNull();
  });
});

describe('fobDailyTrace since', () => {
  const rows = ['2026-08-01', '2026-08-05', '2026-08-10', '2026-08-15'].map((d, i) => ({
    loc: '3708', date: d, prodSalesAmt: 10000 * (i + 1),
    compWasteAmt: 100 * (i + 1), rawWasteAmt: 0, condimentsAmt: 0,
    empMgrMealsAmt: 0, statVarianceAmt: 0, unexplainedAmt: 0,
  }));

  it('starts the trace at the anchor instead of the month boundary', () => {
    const t = fobDailyTrace(rows, { loc: '3708', period: '2026-08', since: '2026-08-05' });
    expect(t.map(p => p.date)).toEqual(['2026-08-05', '2026-08-10', '2026-08-15']);
  });

  it('still seeds the first delta from the row before the anchor', () => {
    // 08-01 is excluded from the output but must still prime prevCum, or 08-05's delta
    // would wrongly read as its full cumulative value.
    const t = fobDailyTrace(rows, { loc: '3708', period: '2026-08', since: '2026-08-05' });
    expect(t[0].delta.compWaste).toBe(100);      // 200 - 100, not 200
  });

  it('is unchanged when no anchor is given', () => {
    const t = fobDailyTrace(rows, { loc: '3708', period: '2026-08' });
    expect(t).toHaveLength(4);
  });

  it('cannot be dragged across a month boundary — MTD resets there', () => {
    const spanning = [{ loc: '3708', date: '2026-07-28', prodSalesAmt: 5000, compWasteAmt: 900,
                        rawWasteAmt: 0, condimentsAmt: 0, empMgrMealsAmt: 0, statVarianceAmt: 0, unexplainedAmt: 0 }, ...rows];
    const t = fobDailyTrace(spanning, { loc: '3708', period: '2026-08', since: '2026-07-28' });
    expect(t[0].date).toBe('2026-08-01');        // clamped to the period
  });
});

// ── Owner request 2026-11-05 (Store Cockpit screenshot): "add lines for the different
// classes (F/C/P)" on the Day-by-Day Variance chart. classDelta/classTrace are the pure
// data computation behind those 3 new lines — see variance-trace.js's own header comment
// for exactly what each class is sourced from.
describe('variance-trace — classDelta / classTrace (F/C/P breakdown)', () => {
  it('FOB_CLASS_KEYS is exactly food/condiment/paper, in that order', () => {
    expect(FOB_CLASS_KEYS).toEqual(['food', 'condiment', 'paper']);
  });

  it('classDelta: food = every FOB component except condiment; condiment = its own component', () => {
    const pt = { delta: { compWaste: 100, rawWaste: 50, condiment: 20, empMeal: 10, statVar: 5, unexplained: 5, fob: 190, pLPaperCost: 30 } };
    const cls = classDelta(pt);
    expect(cls.food).toBeCloseTo(100 + 50 + 10 + 5 + 5, 6);   // NOT condiment's 20
    expect(cls.condiment).toBeCloseTo(20, 6);
  });

  it('classDelta: paper comes from the delta\'s pLPaperCost leg, not any FOB component', () => {
    const pt = { delta: { compWaste: 0, rawWaste: 0, condiment: 0, empMeal: 0, statVar: 0, unexplained: 0, fob: 0, pLPaperCost: 42 } };
    expect(classDelta(pt).paper).toBeCloseTo(42, 6);
  });

  it('classDelta defaults every leg to 0 on a point with no delta at all (never undefined/NaN)', () => {
    expect(classDelta({})).toEqual({ food: 0, condiment: 0, paper: 0 });
    expect(classDelta({ delta: {} })).toEqual({ food: 0, condiment: 0, paper: 0 });
  });

  it('food + condiment reconstructs the existing total FOB delta exactly (no double count, nothing dropped)', () => {
    const pt = { delta: { compWaste: 12, rawWaste: 34, condiment: 56, empMeal: 7, statVar: 8, unexplained: 9, fob: 126 } };
    const cls = classDelta(pt);
    expect(cls.food + cls.condiment).toBeCloseTo(pt.delta.fob, 6);
  });

  it('classTrace attaches .cls to every point while preserving the original trace shape/length', () => {
    const rows = [
      { loc: '3708', date: '2026-07-01', prodSalesAmt: 10000, compWasteAmt: 100, rawWasteAmt: 50, condimentsAmt: 20, empMgrMealsAmt: 10, statVarianceAmt: 0, unexplainedAmt: 0 },
      { loc: '3708', date: '2026-07-02', prodSalesAmt: 10000, compWasteAmt: 150, rawWasteAmt: 50, condimentsAmt: 40, empMgrMealsAmt: 10, statVarianceAmt: 0, unexplainedAmt: 0 },
    ];
    const trace = fobDailyTrace(rows, { loc: '3708', period: '2026-07' });
    const out = classTrace(trace);
    expect(out).toHaveLength(trace.length);
    for (let i = 0; i < out.length; i++) {
      expect(out[i].date).toBe(trace[i].date);
      expect(out[i].delta).toBe(trace[i].delta);         // original fields untouched/preserved
      expect(out[i].cls).toEqual(classDelta(trace[i]));
    }
    // Day 2's condiment delta is 40-20=20, food delta is (150-100)+(50-50)+(10-10)=50.
    expect(out[1].cls.condiment).toBeCloseTo(20, 6);
    expect(out[1].cls.food).toBeCloseTo(50, 6);
  });

  it('paper swing is sourced through fobDailyTrace\'s own P&L Paper Cost build-up, diffed day over day (same MTD-cumulative-snapshot rule as every other component)', () => {
    const mkPaper = (date, paperCum) => ({
      loc: '3708', date, prodSalesAmt: 10000,
      compWasteAmt: 0, rawWasteAmt: 0, condimentsAmt: 0, empMgrMealsAmt: 0, statVarianceAmt: 0, unexplainedAmt: 0,
      // Begin+Purchases+Adjustments+Transfers-Promotions-End = paperCum (Begin/Adj/Transfers/Promotions at 0
      // keeps the build-up arithmetic trivial to reason about here).
      pnlPaperCostPurchases: paperCum,
    });
    const rows = [mkPaper('2026-07-01', 300), mkPaper('2026-07-02', 300), mkPaper('2026-07-15', 950)];
    const trace = fobDailyTrace(rows, { loc: '3708', period: '2026-07' });
    const out = classTrace(trace);
    expect(out[0].cls.paper).toBeCloseTo(300, 6);                    // day 1 vs $0
    expect(out[1].cls.paper).toBeCloseTo(0, 6);                      // flat day 2
    expect(out[2].cls.paper).toBeCloseTo(950 - 300, 6);              // the jump on the 15th
    // And it does NOT leak into the existing total FOB delta (Paper isn't part of FOB).
    expect(out[2].delta.fob).toBeCloseTo(0, 6);
  });

  it('does not diff paper across a month boundary (same MTD reset rule as the other components)', () => {
    const rows = [
      { loc: '3708', date: '2026-06-30', prodSalesAmt: 5000, compWasteAmt: 0, rawWasteAmt: 0, condimentsAmt: 0, empMgrMealsAmt: 0, statVarianceAmt: 0, unexplainedAmt: 0, pnlPaperCostPurchases: 900 },
      { loc: '3708', date: '2026-07-01', prodSalesAmt: 5000, compWasteAmt: 0, rawWasteAmt: 0, condimentsAmt: 0, empMgrMealsAmt: 0, statVarianceAmt: 0, unexplainedAmt: 0, pnlPaperCostPurchases: 5 },
    ];
    const trace = fobDailyTrace(rows, { loc: '3708', period: '2026-07' });
    const out = classTrace(trace);
    expect(out[0].cls.paper).toBeCloseTo(5, 6);   // NOT 5 - 900
  });
});
