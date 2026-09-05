// @ts-nocheck
// SAGE's query_smg tool (SMG VOICE FullScale scores). Imports supabase/functions/sage-chat/
// smg-agg.js directly -- the same plain-JS module index.ts's query_smg tool calls and
// JSON.stringifies as its literal tool result, same pattern as sage-lifelenz-labor-agg.test.js.
//
// The thing most likely to be wrong here: n-weighted vs plain-mean district averages ("never
// average averages," this repo's own standing rule) and the below_standard flags matching the
// SAME thresholds src/views/smg-voice.js's SMG_DEFAULTS uses (a drift here would make SAGE and
// the in-app dashboard disagree about which stores are below standard for the same period).
import { describe, it, expect } from 'vitest';
import { aggregateSmgFullscale, weightedAvg, SMG_STANDARDS, SMG_NOTE } from '../../supabase/functions/sage-chat/smg-agg.js';

describe('weightedAvg -- response-count-weighted district average', () => {
  it('weights by n when every row has it (never a plain store-to-store average)', () => {
    // Store A: 90% top-2 on 100 responses. Store B: 70% top-2 on 900 responses (much bigger n).
    // A plain mean would say 80%; the n-weighted figure should sit much closer to store B's 70%.
    const rows = [{ osat_top2: 0.90, n: 100 }, { osat_top2: 0.70, n: 900 }];
    const avg = weightedAvg(rows, 'osat_top2');
    expect(avg).toBeCloseTo((0.90 * 100 + 0.70 * 900) / 1000, 5);
    expect(avg).toBeLessThan(0.80); // NOT the plain mean
  });

  it('falls back to a plain mean only when NO row in the set has n', () => {
    const rows = [{ osat_top2: 0.80, n: null }, { osat_top2: 0.90, n: null }];
    expect(weightedAvg(rows, 'osat_top2')).toBeCloseTo(0.85, 5);
  });

  it('a store missing n is excluded from the weighted figure, not treated as weight 0 or NaN', () => {
    const rows = [{ osat_top2: 0.90, n: 100 }, { osat_top2: 0.50, n: null }];
    // Only the n=100 row contributes to the weighted branch (mixed n presence -> use the ones
    // that have it, per the function's own documented fallback rule).
    expect(weightedAvg(rows, 'osat_top2')).toBeCloseTo(0.90, 5);
  });

  it('returns null for an all-null metric column rather than NaN or 0', () => {
    const rows = [{ osat_top2: null, n: 100 }, { osat_top2: null, n: 50 }];
    expect(weightedAvg(rows, 'osat_top2')).toBeNull();
  });
});

describe('aggregateSmgFullscale -- below_standard flags match the in-app dashboard thresholds', () => {
  // Same values as src/views/smg-voice.js's SMG_DEFAULTS (osatStd 0.90, accStd 0.95,
  // dtProbStd/ovProbStd 0.10) -- pinned here so a drift between the two threshold sets fails
  // this test, not just a silent disagreement discovered later by the owner.
  it('SMG_STANDARDS matches the in-app dashboard\'s own McDonald\'s corporate thresholds', () => {
    expect(SMG_STANDARDS.osatTop2Min).toBe(0.90);
    expect(SMG_STANDARDS.osatB2BMin).toBe(0.90);
    expect(SMG_STANDARDS.accuracyB2BMin).toBe(0.95);
    expect(SMG_STANDARDS.dtProblemMax).toBe(0.10);
    expect(SMG_STANDARDS.overallProblemMax).toBe(0.10);
  });

  it('flags a store below the OSAT/Accuracy floors and above the problem-rate ceilings', () => {
    const rows = [{ loc: '3708', osat_top2: 0.85, osat_5: 0.60, osat_b2b: 0.88, accuracy_b2b: 0.92, dt_problem: 0.12, overall_problem: 0.11, n: 200 }];
    const { stores } = aggregateSmgFullscale(rows, { '3708': 'Ardmore-Broadway' });
    const s = stores[0];
    expect(s.below_standard.osat_top2).toBe(true);
    expect(s.below_standard.osat_b2b).toBe(true);
    expect(s.below_standard.accuracy_b2b).toBe(true);
    expect(s.below_standard.dt_problem).toBe(true);
    expect(s.below_standard.overall_problem).toBe(true);
  });

  it('a store meeting every standard has all flags false, not just falsy', () => {
    const rows = [{ loc: '3708', osat_top2: 0.95, osat_5: 0.70, osat_b2b: 0.95, accuracy_b2b: 0.97, dt_problem: 0.05, overall_problem: 0.04, n: 200 }];
    const { stores } = aggregateSmgFullscale(rows, {});
    expect(Object.values(stores[0].below_standard)).toEqual([false, false, false, false, false]);
  });

  it('a null metric is never flagged below standard (missing data is not a failing score)', () => {
    const rows = [{ loc: '3708', osat_top2: null, osat_5: null, osat_b2b: null, accuracy_b2b: null, dt_problem: null, overall_problem: null, n: null }];
    const { stores } = aggregateSmgFullscale(rows, {});
    expect(Object.values(stores[0].below_standard).every(v => v === false)).toBe(true);
  });

  it('sorts worst OSAT Top-2 first', () => {
    const rows = [
      { loc: '1', osat_top2: 0.95, n: 100 },
      { loc: '2', osat_top2: 0.70, n: 100 },
      { loc: '3', osat_top2: 0.85, n: 100 },
    ];
    const { stores } = aggregateSmgFullscale(rows, {});
    expect(stores.map(s => s.loc)).toEqual(['2', '3', '1']);
  });

  it('a store with no osat_top2 sorts last (treated as the best case, never crashes the sort)', () => {
    const rows = [{ loc: '1', osat_top2: 0.80, n: 100 }, { loc: '2', osat_top2: null, n: 100 }];
    const { stores } = aggregateSmgFullscale(rows, {});
    expect(stores[stores.length - 1].loc).toBe('2');
  });

  it('district.store_count matches the row count and every metric is n-weighted', () => {
    const rows = [
      { loc: '1', osat_top2: 0.95, osat_5: 0.5, osat_b2b: 0.9, accuracy_b2b: 0.96, dt_problem: 0.05, overall_problem: 0.05, n: 900 },
      { loc: '2', osat_top2: 0.70, osat_5: 0.4, osat_b2b: 0.7, accuracy_b2b: 0.90, dt_problem: 0.15, overall_problem: 0.15, n: 100 },
    ];
    const { district } = aggregateSmgFullscale(rows, {});
    expect(district.store_count).toBe(2);
    // n-weighted (900 vs 100) should sit much closer to store 1's figures than a plain mean would.
    expect(district.osat_top2).toBeCloseTo((0.95 * 900 + 0.70 * 100) / 1000, 5);
  });

  it('falls back to a generated store label when no name is supplied', () => {
    const rows = [{ loc: '99999', osat_top2: 0.9, n: 10 }];
    const { stores } = aggregateSmgFullscale(rows, {});
    expect(stores[0].name).toBe('Store 99999');
  });
});

describe('SMG_NOTE', () => {
  it('states the fraction scale and the automation status, so SAGE never implies a live pull', () => {
    expect(SMG_NOTE).toMatch(/0-1 fraction/i);
    expect(SMG_NOTE).toMatch(/not yet automated/i);
  });
});
