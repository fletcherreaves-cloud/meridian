// @ts-nocheck
// Task #129 — the Spot-Check Ruler. The primary fixture reconstructs the owner's own real example
// (memory/plan-count-cycle-surfaces-and-spotcheck-ruler-2026-11-08.md §B): Nuggets/Espresso
// Beans/Beef Steak grew in count, +$800 combined, improved FOB by 1.72pp — reported FOB 3.37%,
// counterfactual-without-them 5.09%.
import { describe, it, expect } from 'vitest';
import {
  topVarianceMovers, counterfactualFob, flagCounterfactual, impossibilityFlags,
  recountDetection, buildSpotCheckRuler, rankStoresByGap, rulerGapScore,
  freshCountSessionPrompts, DEFAULT_TOP_N, MATERIAL_GAP_PTS,
} from '../engine/spot-check-ruler.js';

// Sales chosen so the three movers' $800 combined swing lands at exactly 1.72pp of sales,
// matching the owner's own real numbers (800 / 46511.63 * 100 = 1.72).
const SALES = 46511.63;
const varianceRows = [
  { wrin: '10001', descr: 'Nuggets', cls: 'Food', dolDiff: 400, variance: 40 },
  { wrin: '10002', descr: 'Espresso Beans', cls: 'Food', dolDiff: 250, variance: 10 },
  { wrin: '10003', descr: 'Beef Steak', cls: 'Food', dolDiff: 150, variance: 15 },
  { wrin: '10004', descr: 'Small Fries', cls: 'Food', dolDiff: 40, variance: 20 }, // below top-3, must not affect the box
];
const fobSnap = { sales: SALES, comp: 500, raw: 300, cond: 200, emp: 100, statv: 400, unex: 68.6, fob: 1568.6, fobPct: 1568.6 / SALES };

describe('topVarianceMovers', () => {
  it('sorts by |dolDiff| desc and slices to topN, preserving sign (eom-diagnosis.js\'s own finding wrapper drops it)', () => {
    const top = topVarianceMovers(varianceRows, 3);
    expect(top.map(v => v.wrin)).toEqual(['10001', '10002', '10003']);
    expect(top.every(v => typeof v.dolDiff === 'number')).toBe(true);
    expect(top[0].dolDiff).toBe(400);
  });
  it('defaults to DEFAULT_TOP_N (3, the owner\'s own example size, not variance-top5\'s 5)', () => {
    expect(DEFAULT_TOP_N).toBe(3);
    expect(topVarianceMovers(varianceRows).length).toBe(3);
  });
});

describe('counterfactualFob — the real insight', () => {
  it('reproduces the owner\'s own Holdenville/Ashley numbers: 3.37% reported, 5.09% without the top-3 movers, 1.72pp swing', () => {
    const cf = counterfactualFob({ fobSnap, varianceRows, topN: 3 });
    expect(cf.combinedDollars).toBe(800);
    expect(cf.swingPts).toBeCloseTo(1.72, 1);
    expect(cf.fobAsReportedPct * 100).toBeCloseTo(3.37, 1);
    expect(cf.fobWithoutMoversPct * 100).toBeCloseTo(5.09, 1);
  });
  it('a net-negative top-N swing LOWERS the counterfactual FOB (stripping real losses back out)', () => {
    const lossRows = [{ wrin: 'x', descr: 'Shortage Item', cls: 'Food', dolDiff: -500, variance: -5 }];
    const cf = counterfactualFob({ fobSnap: { sales: 10000, fobPct: 0.08 }, varianceRows: lossRows, topN: 1 });
    expect(cf.swingPts).toBeCloseTo(-5, 3);
    expect(cf.fobWithoutMoversPct).toBeLessThan(cf.fobAsReportedPct);
  });
  it('returns nulls gracefully with no FOB data', () => {
    const cf = counterfactualFob({ fobSnap: null, varianceRows });
    expect(cf.fobAsReportedPct).toBeNull();
    expect(cf.fobWithoutMoversPct).toBeNull();
  });
});

describe('flagCounterfactual — tier 1 (target-based)', () => {
  it('flags when the store only clears its own target BECAUSE of the top movers', () => {
    // Reported 3.37% clears a 4% target; without the movers it would be 5.09%, over target.
    const flag = flagCounterfactual({ fobAsReportedPct: 0.0337, fobWithoutMoversPct: 0.0509, swingPts: 1.72, targetPct: 0.04 });
    expect(flag.flagged).toBe(true);
    expect(flag.tier).toBe('target');
  });
  it('flags a large swing even when the target is cleared both ways (owner: "any wayward swing... should be flagged")', () => {
    const flag = flagCounterfactual({ fobAsReportedPct: 0.02, fobWithoutMoversPct: 0.033, swingPts: 1.3, targetPct: 0.06 });
    expect(flag.flagged).toBe(true);
    expect(flag.tier).toBe('material-swing');
  });
  it('does not flag a small, immaterial swing that does not cross the target either way', () => {
    const flag = flagCounterfactual({ fobAsReportedPct: 0.02, fobWithoutMoversPct: 0.0205, swingPts: 0.05, targetPct: 0.06 });
    expect(flag.flagged).toBe(false);
  });
  it('MATERIAL_GAP_PTS is the documented 1.0pp floor', () => { expect(MATERIAL_GAP_PTS).toBe(1.0); });
});

describe('impossibilityFlags — tier 3 (hard rules, degrade gracefully)', () => {
  it('flags a negative on-hand value', () => {
    const flags = impossibilityFlags({ varianceRows: [{ wrin: 'a', descr: 'Bad Item', dolDiff: 10 }], onHandByWrin: { a: { onHandAmt: -5 } } });
    expect(flags.some(f => f.rule === 'negative-on-hand')).toBe(true);
  });
  it('flags a swing larger than the item\'s own on-hand dollar value', () => {
    const flags = impossibilityFlags({ varianceRows: [{ wrin: 'b', descr: 'Small Stock', dolDiff: -500 }], onHandByWrin: { b: { onHandAmt: 50 } } });
    expect(flags.some(f => f.rule === 'swing-exceeds-onhand')).toBe(true);
  });
  it('flags an implausible implied per-unit price vs the item\'s own on-hand unit price', () => {
    // On-hand: $100 / 100 units = $1/unit. Variance implies $20/unit (20x off).
    const flags = impossibilityFlags({ varianceRows: [{ wrin: 'c', descr: 'Price Mismatch', dolDiff: 200, variance: 10 }], onHandByWrin: { c: { onHandAmt: 100, totalUnits: 100 } } });
    expect(flags.some(f => f.rule === 'implausible-unit-price')).toBe(true);
  });
  it('returns [] with no on-hand data at all — never guesses', () => {
    expect(impossibilityFlags({ varianceRows, onHandByWrin: {} })).toEqual([]);
  });
});

describe('recountDetection — across-session only (task #130 scope line)', () => {
  it('detects a second dated session for the same class as a real recount', () => {
    const rows = [
      { loc: '0003708', countDate: '2026-11-03', cls: 'Food' },
      { loc: '0003708', countDate: '2026-11-05', cls: 'Food' },
      { loc: '0003708', countDate: '2026-11-03', cls: 'Condiment' },
    ];
    const r = recountDetection({ sessionLogRows: rows, loc: '0003708', classesOfInterest: ['Food', 'Condiment'] });
    expect(r.recounts).toEqual([{ cls: 'Food', dates: ['2026-11-03', '2026-11-05'], recountDates: ['2026-11-05'] }]);
  });
  it('reports no recounts (not a guess) when only one session exists per class', () => {
    const rows = [{ loc: '0003708', countDate: '2026-11-03', cls: 'Food' }];
    const r = recountDetection({ sessionLogRows: rows, loc: '0003708', classesOfInterest: ['Food'] });
    expect(r.recounts).toEqual([]);
  });
  it('always states the within-session limitation honestly', () => {
    const r = recountDetection({ sessionLogRows: [], loc: '0003708' });
    expect(r.withinSessionNote).toMatch(/not detectable from today's data/);
  });
  it('ignores a different store\'s sessions', () => {
    const rows = [
      { loc: '0003708', countDate: '2026-11-03', cls: 'Food' },
      { loc: '0005183', countDate: '2026-11-05', cls: 'Food' },
    ];
    const r = recountDetection({ sessionLogRows: rows, loc: '0003708', classesOfInterest: ['Food'] });
    expect(r.recounts).toEqual([]);
  });
});

describe('buildSpotCheckRuler — full worksheet assembly', () => {
  it('assembles all 5 questions with the owner\'s real example numbers, pre-filled where auto-computable', () => {
    const w = buildSpotCheckRuler({
      loc: '13113', storeName: 'Madill', period: '2026-11', periodType: 'weekly', countDate: '2026-11-07',
      fobSnap, targets: { tFOBTarget: 0.04 }, varianceRows, topN: 3,
      sessionLogRows: [{ loc: '13113', countDate: '2026-11-07', cls: 'Food' }],
      reportLink: 'https://meridianbi.vercel.app/?share=abc123',
    });
    expect(w.questions).toHaveLength(5);
    const [fobQ, varQ, recountQ, confQ, reportsQ] = w.questions;

    expect(fobQ.answer).toMatch(/3\.37%/);
    expect(fobQ.auto).toBe(true);

    expect(varQ.answer).toContain('Nuggets');
    expect(varQ.answer).toContain('Espresso Beans');
    expect(varQ.answer).toContain('Beef Steak');
    expect(varQ.answer).not.toContain('Small Fries'); // below top-3

    expect(recountQ.auto).toBe(true);
    expect(recountQ.note).toMatch(/not detectable from today's data/);

    expect(confQ.auto).toBe(false);
    expect(confQ.answer).toBeNull();

    expect(reportsQ.link).toBe('https://meridianbi.vercel.app/?share=abc123');

    expect(w.counterfactual.swingPts).toBeCloseTo(1.72, 1);
    expect(w.counterfactual.flagged).toBe(true); // 3.37% clears 4% target, 5.09% without the movers does not
    expect(w.counterfactual.flagTier).toBe('target');
  });

  it('never fabricates an answer when the underlying data is absent', () => {
    const w = buildSpotCheckRuler({ loc: '13113', period: '2026-11', periodType: 'eom' });
    expect(w.questions[0].answer).toBeNull();
    expect(w.questions[0].note).toMatch(/No FOB data/);
    expect(w.questions[1].answer).toBeNull();
    expect(w.counterfactual.flagged).toBe(false);
    expect(w.impossibilities).toEqual([]);
  });
});

describe('rankStoresByGap / rulerGapScore — the weekly deep-dive digest ranking', () => {
  it('ranks a hard impossibility above a flagged swing, above a quiet store', () => {
    const quiet = { counterfactual: { flagged: false, swingPts: 0.1 }, impossibilities: [] };
    const flaggedSwing = { counterfactual: { flagged: true, swingPts: 2.5 }, impossibilities: [] };
    const impossible = { counterfactual: { flagged: false, swingPts: 0.2 }, impossibilities: [{ rule: 'negative-on-hand' }] };
    const ranked = rankStoresByGap([quiet, flaggedSwing, impossible]);
    expect(ranked[0]).toBe(impossible);
    expect(ranked[1]).toBe(flaggedSwing);
    expect(ranked[2]).toBe(quiet);
  });
  it('rulerGapScore is monotonic in swing size among otherwise-equal stores', () => {
    const a = { counterfactual: { flagged: false, swingPts: 0.5 }, impossibilities: [] };
    const b = { counterfactual: { flagged: false, swingPts: 3.0 }, impossibilities: [] };
    expect(rulerGapScore(b)).toBeGreaterThan(rulerGapScore(a));
  });
});

describe('freshCountSessionPrompts — Curated Home trigger', () => {
  const stores = [{ loc: '13113', name: 'Madill' }, { loc: '3708', name: 'Tishomingo' }];
  it('fires for a store whose latest qualifying session landed within the window', () => {
    const sessionsByLoc = {
      '13113': [{ date: '2026-11-07', satisfiesWeekly: true, isEom: false }],
      '3708': [{ date: '2026-10-01', satisfiesWeekly: true, isEom: false }], // too old
    };
    const prompts = freshCountSessionPrompts(sessionsByLoc, stores, { asOf: new Date('2026-11-09T12:00:00'), withinDays: 2 });
    expect(prompts).toHaveLength(1);
    expect(prompts[0].loc).toBe('13113');
    expect(prompts[0].periodType).toBe('weekly');
    expect(prompts[0].period).toBe('wk:2026-11-07');
  });
  it('labels an EOM-qualifying session with the monthly period, not the wk: form', () => {
    const sessionsByLoc = { '13113': [{ date: '2026-10-31', satisfiesWeekly: false, isEom: true }] };
    const prompts = freshCountSessionPrompts(sessionsByLoc, [stores[0]], { asOf: new Date('2026-11-01T08:00:00'), withinDays: 2 });
    expect(prompts[0].periodType).toBe('eom');
    expect(prompts[0].period).toBe('2026-10');
  });
  it('never fires for a partial/spot session, even a recent one', () => {
    const sessionsByLoc = { '13113': [{ date: '2026-11-08', satisfiesWeekly: false, isEom: false, isPartial: true }] };
    const prompts = freshCountSessionPrompts(sessionsByLoc, [stores[0]], { asOf: new Date('2026-11-09T08:00:00'), withinDays: 2 });
    expect(prompts).toEqual([]);
  });
  it('never fires once the window has passed', () => {
    const sessionsByLoc = { '13113': [{ date: '2026-11-01', satisfiesWeekly: true, isEom: false }] };
    const prompts = freshCountSessionPrompts(sessionsByLoc, [stores[0]], { asOf: new Date('2026-11-09T08:00:00'), withinDays: 2 });
    expect(prompts).toEqual([]);
  });
});
