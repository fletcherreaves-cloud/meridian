// @ts-nocheck
// src/engine/security-drift.js — drift/trajectory detection (dispatch 2026-11-10 follow-on,
// extending Phase 1's security-health.js per the owner's "Security Health Dashboard" deep-dive
// §4). Fixtures anchor the materiality-floor choice to the REAL measured distributions and real
// subject histories this file's own header cites (pulled live from Supabase, service-role,
// 2026-11-10): CASH-002 loc 0013113 subject 81bfc4e9-459c-4692-b867-04ad41538a46 (the "starts
// near zero" edge case) and INV-001 loc 0006838 WRIN 08235-106 (a real, dramatic, still-pre-
// threshold rise: magnitude 0.684 -> 1.471, threshold_used=2.5).
import { describe, it, expect } from 'vitest';
import {
  classifySubjectDrift, driftContribution, driftKeyFor, isNearMissVerdict,
  selectDriftCandidates, computeDriftRollup, driftDirectionForStore, driftTrendBadge,
  DRIFT_MIN_WINDOWS, DRIFT_LOOKBACK_WINDOWS, DRIFT_MIN_RELATIVE_RISE, DRIFT_NEAR_MISS_FRACTION,
  DRIFT_EARLY_WEIGHT, DRIFT_CONFIRMED_WEIGHT,
} from '../engine/security-drift.js';

// A clean, synthetic-but-dimensionally-real z-score history: 4 windows, magnitude rising
// 1.0 -> 2.0 -> 3.0 -> 4.0 (a clean 300% relative rise, well past DRIFT_MIN_RELATIVE_RISE),
// latest window still pass:false (threshold_used sigma = 10, far from crossed) -- the exact
// "before it fully crosses" case §4 exists to catch.
function risingHistory({ latestPass = false } = {}) {
  // mean=0, stdev=10 fixed across all four windows -> magnitude = value/stdev = 1,2,3,4 exactly.
  return [
    { value: 10, thresholdUsed: 10, pass: false, baselineContext: { mean: 0, stdev: 10, n: 10 } }, // magnitude 1
    { value: 20, thresholdUsed: 10, pass: false, baselineContext: { mean: 0, stdev: 10, n: 10 } }, // magnitude 2
    { value: 30, thresholdUsed: 10, pass: false, baselineContext: { mean: 0, stdev: 10, n: 10 } }, // magnitude 3
    { value: 40, thresholdUsed: 10, pass: latestPass, baselineContext: { mean: 0, stdev: 10, n: 10 } }, // magnitude 4
  ];
}

describe('classifySubjectDrift() — monotonic trend over the last 3-4 windows, independent of whether the latest one has crossed its own threshold', () => {
  it('fewer than DRIFT_MIN_WINDOWS usable windows is honestly insufficient-history, never guessed', () => {
    expect(classifySubjectDrift([]).direction).toBe('insufficient-history');
    expect(classifySubjectDrift([{ value: 1, thresholdUsed: 10, pass: false, baselineContext: {} }]).direction).toBe('insufficient-history');
  });

  it('a clean monotonic rise, still pass:false on the latest window, classifies "worsening" — the exact pre-threshold case the deep-dive doc asks for', () => {
    const result = classifySubjectDrift(risingHistory({ latestPass: false }));
    expect(result.direction).toBe('worsening');
    expect(result.latestFlagged).toBe(false);
    expect(result.latestMagnitude).toBe(4);
    expect(result.windowsUsed).toBe(4);
    expect(result.relativeChange).toBeCloseTo(3.0, 5); // (4-1)/1
  });

  it('the SAME rise with the latest window now pass:true is still "worsening", but latestFlagged flips true — "weight it higher once it does cross" needs this distinction', () => {
    const result = classifySubjectDrift(risingHistory({ latestPass: true }));
    expect(result.direction).toBe('worsening');
    expect(result.latestFlagged).toBe(true);
  });

  it('the exact mirror (monotonic FALL) classifies "improving" — the district grid\'s own "↓ improving" arrow needs this, not just worsening', () => {
    const falling = risingHistory().slice().reverse().map(w => ({ ...w }));
    const result = classifySubjectDrift(falling);
    expect(result.direction).toBe('improving');
    expect(result.relativeChange).toBeLessThan(0);
  });

  it('a genuinely mixed (non-monotonic) sequence is "flat", never forced into a direction the data does not support', () => {
    const mixed = [
      { value: 10, thresholdUsed: 10, pass: false, baselineContext: { mean: 0, stdev: 10, n: 10 } },
      { value: 30, thresholdUsed: 10, pass: false, baselineContext: { mean: 0, stdev: 10, n: 10 } },
      { value: 15, thresholdUsed: 10, pass: false, baselineContext: { mean: 0, stdev: 10, n: 10 } },
      { value: 35, thresholdUsed: 10, pass: false, baselineContext: { mean: 0, stdev: 10, n: 10 } },
    ];
    expect(classifySubjectDrift(mixed).direction).toBe('flat');
  });

  it('a real monotonic rise that does NOT clear DRIFT_MIN_RELATIVE_RISE is "flat", not "worsening" -- the noise-filter this project\'s own daily-rolling-window autocorrelation measurement exists for', () => {
    // 1.00 -> 1.05 -> 1.09 -> 1.12: monotonic, but only a 12% total rise, under the 15% floor.
    const barely = [
      { value: 1.00, thresholdUsed: 10, pass: false, baselineContext: { mean: 0, stdev: 1, n: 10 } },
      { value: 1.05, thresholdUsed: 10, pass: false, baselineContext: { mean: 0, stdev: 1, n: 10 } },
      { value: 1.09, thresholdUsed: 10, pass: false, baselineContext: { mean: 0, stdev: 1, n: 10 } },
      { value: 1.12, thresholdUsed: 10, pass: false, baselineContext: { mean: 0, stdev: 1, n: 10 } },
    ];
    expect(classifySubjectDrift(barely).direction).toBe('flat');
  });

  it('drops lifecycle-hygiene windows from the trajectory entirely (never coerced to a fake 0)', () => {
    const withHygiene = [
      { value: 10, thresholdUsed: 10, pass: false, baselineContext: { mean: 0, stdev: 10, n: 10 } },
      { value: 999, thresholdUsed: 10, pass: null, lifecycleCategory: 'deactivated', baselineContext: {} },
      { value: 20, thresholdUsed: 10, pass: false, baselineContext: { mean: 0, stdev: 10, n: 10 } },
      { value: 30, thresholdUsed: 10, pass: false, baselineContext: { mean: 0, stdev: 10, n: 10 } },
    ];
    const result = classifySubjectDrift(withHygiene);
    expect(result.windowsUsed).toBe(3); // the hygiene row never counts
    expect(result.direction).toBe('worsening');
  });

  it('drops low-confidence (thin-baseline) windows — same "never blend into anything" guard security-health.js\'s own findingContribution applies', () => {
    const withThin = [
      { value: 10, thresholdUsed: 10, pass: false, baselineContext: { mean: 0, stdev: 10, n: 10 } },
      { value: 50, thresholdUsed: 10, pass: false, baselineContext: { mean: 0, stdev: 0.001, n: 1 } }, // n below MIN_BASELINE_N
      { value: 20, thresholdUsed: 10, pass: false, baselineContext: { mean: 0, stdev: 10, n: 10 } },
      { value: 30, thresholdUsed: 10, pass: false, baselineContext: { mean: 0, stdev: 10, n: 10 } },
    ];
    expect(classifySubjectDrift(withThin).windowsUsed).toBe(3);
  });

  it('only looks at the last DRIFT_LOOKBACK_WINDOWS (4) windows, even with a longer real history on file', () => {
    const long = [
      { value: 100, thresholdUsed: 10, pass: false, baselineContext: { mean: 0, stdev: 10, n: 10 } }, // would wreck a monotonic check if included
      ...risingHistory(),
    ];
    expect(classifySubjectDrift(long).windowsUsed).toBe(DRIFT_LOOKBACK_WINDOWS);
    expect(classifySubjectDrift(long).direction).toBe('worsening');
  });

  it('REAL DATA (CASH-002, loc 0013113, measured 2026-11-09): a sequence starting at magnitude ~0 still classifies "worsening" via the Infinity-clears-any-floor rule, never a division-by-zero artifact', () => {
    // Real measured windows (window_end 2026-08-27 -> 08-29), z-score magnitude = max(0,(value-mean)/stdev):
    //   08-27: value=7.8125,            mean=9.248571660200705, stdev=15.262460174495423 -> z=-0.094 -> magnitude 0
    //   08-28: value=8.59291084854995,  mean=8.495644087398544, stdev=11.760651979493545 -> magnitude ~0.00827
    //   08-29: value=9.28074245939675,  mean=6.381910272020187, stdev=5.997668437194473  -> magnitude ~0.48329
    const real = [
      { value: 7.8125, pass: false, thresholdUsed: 15, baselineContext: { mean: 9.248571660200705, stdev: 15.262460174495423, n: 24 } },
      { value: 8.59291084854995, pass: false, thresholdUsed: 15, baselineContext: { mean: 8.495644087398544, stdev: 11.760651979493545, n: 24 } },
      { value: 9.28074245939675, pass: false, thresholdUsed: 15, baselineContext: { mean: 6.381910272020187, stdev: 5.997668437194473, n: 25 } },
    ];
    const result = classifySubjectDrift(real);
    expect(result.magnitudes[0]).toBe(0);
    expect(result.magnitudes[2]).toBeCloseTo(0.48329, 3);
    expect(result.direction).toBe('worsening');
  });

  it('REAL DATA (INV-001, loc 0006838, WRIN 08235-106, measured 2026-11-09): a real pre-threshold rise (0.684 -> 1.471, threshold_used=2.5) classifies "worsening" with latestFlagged false', () => {
    const real = [
      { value: 17.0, pass: false, thresholdUsed: 2.5, baselineContext: { mean: 10, stdev: 10.234567, n: 26 } }, // synthesized earlier anchor for a 3rd point; see below for the two REAL endpoints
      { value: 22.9797193607121, pass: false, thresholdUsed: 2.5, baselineContext: { mean: 17.715375191374385, stdev: 7.695035458004916, n: 26 } }, // REAL, window_end 2026-10-31
      { value: 35.4434895775196, pass: false, thresholdUsed: 2.5, baselineContext: { mean: 20.83207375072093, stdev: 9.928263351435978, n: 26 } }, // REAL, window_end 2026-11-30 (computed 2026-11-09)
    ];
    const result = classifySubjectDrift(real);
    expect(result.magnitudes[1]).toBeCloseTo(0.6841, 3);
    expect(result.magnitudes[2]).toBeCloseTo(1.4717, 3);
    expect(result.direction).toBe('worsening');
    expect(result.latestFlagged).toBe(false); // still under threshold_used=2.5 -- exactly the case §4 wants caught early
  });
});

describe('driftContribution() — additive, severity×magnitude units (never a second scale), weighted lower pre-threshold than confirmed-and-rising', () => {
  const RULE = { ruleId: 'CASH-001', severity: 3 };

  it('is 0 for anything not classified "worsening"', () => {
    const flat = [
      { value: 1, thresholdUsed: 10, pass: false, baselineContext: { mean: 0, stdev: 1, n: 10 } },
      { value: 1, thresholdUsed: 10, pass: false, baselineContext: { mean: 0, stdev: 1, n: 10 } },
      { value: 1, thresholdUsed: 10, pass: false, baselineContext: { mean: 0, stdev: 1, n: 10 } },
    ];
    expect(driftContribution(flat, RULE)).toBe(0);
  });

  it('pre-threshold (not yet pass:true): severity × latest magnitude × DRIFT_EARLY_WEIGHT', () => {
    expect(driftContribution(risingHistory({ latestPass: false }), RULE))
      .toBeCloseTo(3 * 4 * DRIFT_EARLY_WEIGHT, 6);
  });

  it('confirmed (latest window pass:true AND still rising): severity × latest magnitude × DRIFT_CONFIRMED_WEIGHT -- a REAL number higher than the pre-threshold weight, "weighted higher once it crosses"', () => {
    expect(DRIFT_CONFIRMED_WEIGHT).toBeGreaterThan(DRIFT_EARLY_WEIGHT);
    expect(driftContribution(risingHistory({ latestPass: true }), RULE))
      .toBeCloseTo(3 * 4 * DRIFT_CONFIRMED_WEIGHT, 6);
  });

  it('defaults severity to 1 with no rule row (defensive, same posture as findingContribution)', () => {
    expect(driftContribution(risingHistory({ latestPass: false }), undefined))
      .toBeCloseTo(1 * 4 * DRIFT_EARLY_WEIGHT, 6);
  });
});

describe('isNearMissVerdict() / selectDriftCandidates() — the bounded candidate set a district-wide rollup can afford to fetch history for', () => {
  const rulesById = {
    'CASH-001': { ruleId: 'CASH-001', severity: 3 },
    'INV-001': { ruleId: 'INV-001', severity: 3 },
  };

  it('never a candidate when already flagged true (isNearMissVerdict is for the CLEAR population only)', () => {
    expect(isNearMissVerdict({ pass: true, thresholdUsed: 10 }, { magnitude: 9, basis: 'ratio', lowConfidence: false })).toBe(false);
  });

  it('ratio basis: magnitude is already value/threshold, so DRIFT_NEAR_MISS_FRACTION applies directly', () => {
    expect(isNearMissVerdict({ pass: false, thresholdUsed: 10 }, { magnitude: DRIFT_NEAR_MISS_FRACTION, basis: 'ratio', lowConfidence: false })).toBe(true);
    expect(isNearMissVerdict({ pass: false, thresholdUsed: 10 }, { magnitude: DRIFT_NEAR_MISS_FRACTION - 0.01, basis: 'ratio', lowConfidence: false })).toBe(false);
  });

  it('z-score basis: magnitude must clear a FRACTION of the rule\'s own sigma threshold, not a flat 0.5', () => {
    // threshold_used = 10 sigma -> near-miss floor is 5.0 sigma
    expect(isNearMissVerdict({ pass: false, thresholdUsed: 10 }, { magnitude: 5.0, basis: 'zscore', lowConfidence: false })).toBe(true);
    expect(isNearMissVerdict({ pass: false, thresholdUsed: 10 }, { magnitude: 4.9, basis: 'zscore', lowConfidence: false })).toBe(false);
  });

  it('never a candidate when low-confidence, regardless of magnitude', () => {
    expect(isNearMissVerdict({ pass: false, thresholdUsed: 10 }, { magnitude: 9, basis: 'ratio', lowConfidence: true })).toBe(false);
  });

  it('selectDriftCandidates: unions every currently-flagged subject with every near-miss one, deduped, skipping hygiene rows and unknown rules', () => {
    const findings = [
      // flagged -- always a candidate, regardless of magnitude
      { loc: '1', ruleId: 'CASH-001', empToken: 'emp-a', pass: true, value: 100, thresholdUsed: 10, baselineContext: {} },
      // clear, but a real near-miss (ratio 0.6 >= 0.5 floor)
      { loc: '2', ruleId: 'CASH-001', empToken: 'emp-b', pass: false, value: 6, thresholdUsed: 10, baselineContext: {} },
      // clear, and nowhere near its threshold -- excluded
      { loc: '3', ruleId: 'CASH-001', empToken: 'emp-c', pass: false, value: 1, thresholdUsed: 10, baselineContext: {} },
      // hygiene -- never a candidate even though pass is true-ish shaped
      { loc: '4', ruleId: 'INV-001', wrin: 'w1', pass: true, lifecycleCategory: 'deactivated', value: 50, thresholdUsed: 10, baselineContext: {} },
      // unknown rule -- defensively skipped
      { loc: '5', ruleId: 'MADE-UP', empToken: 'emp-d', pass: true, value: 50, thresholdUsed: 10, baselineContext: {} },
    ];
    const candidates = selectDriftCandidates(findings, rulesById);
    expect(candidates).toEqual([
      { loc: '1', ruleId: 'CASH-001', empToken: 'emp-a', wrin: null },
      { loc: '2', ruleId: 'CASH-001', empToken: 'emp-b', wrin: null },
    ]);
  });

  it('dedupes by (loc, ruleId, subject) — a bulk array with duplicate rows never produces duplicate candidates', () => {
    const dup = { loc: '1', ruleId: 'CASH-001', empToken: 'emp-a', pass: true, value: 100, thresholdUsed: 10, baselineContext: {} };
    expect(selectDriftCandidates([dup, { ...dup }], rulesById)).toHaveLength(1);
  });
});

describe('computeDriftRollup() / driftDirectionForStore() — the district-grid-and-health-score shared pass over multi-window history', () => {
  const rulesById = { 'CASH-001': { ruleId: 'CASH-001', severity: 3 } };

  it('a worsening subject contributes score and increments the store\'s own worsening count', () => {
    const historyByKey = new Map([
      ['k1', { loc: '0000001', ruleId: 'CASH-001', history: risingHistory({ latestPass: false }) }],
    ]);
    const { byLoc, perKey } = computeDriftRollup(historyByKey, rulesById);
    const row = byLoc.get('0000001');
    expect(row.worsening).toBe(1);
    expect(row.improving).toBe(0);
    expect(row.contribution).toBeCloseTo(3 * 4 * DRIFT_EARLY_WEIGHT, 6);
    expect(perKey.get('k1').direction).toBe('worsening');
  });

  it('an improving subject increments the improving count but contributes nothing to score', () => {
    const falling = risingHistory().slice().reverse().map(w => ({ ...w }));
    const historyByKey = new Map([['k1', { loc: '0000002', ruleId: 'CASH-001', history: falling }]]);
    const { byLoc } = computeDriftRollup(historyByKey, rulesById);
    expect(byLoc.get('0000002').improving).toBe(1);
    expect(byLoc.get('0000002').contribution).toBe(0);
  });

  it('driftDirectionForStore: worsening beats improving beats the default flat', () => {
    expect(driftDirectionForStore({ worsening: 1, improving: 3 })).toBe('worsening');
    expect(driftDirectionForStore({ worsening: 0, improving: 2 })).toBe('improving');
    expect(driftDirectionForStore({ worsening: 0, improving: 0 })).toBe('flat');
    expect(driftDirectionForStore(undefined)).toBe('flat');
  });

  it('skips a record whose rule is not in the registry, defensively', () => {
    const historyByKey = new Map([['k1', { loc: '0000001', ruleId: 'GONE', history: risingHistory() }]]);
    const { byLoc } = computeDriftRollup(historyByKey, rulesById);
    expect(byLoc.size).toBe(0);
  });
});

describe('driftTrendBadge() — the narrative card\'s "Escalating" / "Recurring" / "First flag", reusing both existing axes rather than reclassifying', () => {
  it('worsening drift always wins as "Escalating", regardless of the chronic/new trend axis', () => {
    expect(driftTrendBadge('worsening', 'chronic')).toBe('escalating');
    expect(driftTrendBadge('worsening', 'new')).toBe('escalating');
    expect(driftTrendBadge('worsening', 'insufficient-history')).toBe('escalating');
  });

  it('not worsening, but chronic by the existing axis -> "Recurring"', () => {
    expect(driftTrendBadge('flat', 'chronic')).toBe('recurring');
    expect(driftTrendBadge('improving', 'chronic')).toBe('recurring');
    expect(driftTrendBadge(undefined, 'chronic')).toBe('recurring');
  });

  it('neither -> "First flag" (covers new and insufficient-history alike, as the mockup groups them)', () => {
    expect(driftTrendBadge('flat', 'new')).toBe('first-flag');
    expect(driftTrendBadge('flat', 'insufficient-history')).toBe('first-flag');
    expect(driftTrendBadge(undefined, undefined)).toBe('first-flag');
  });
});

describe('driftKeyFor() — stable, shared key format across the rollup and the panel\'s own fetch grouping', () => {
  it('keys an employee-subject finding by loc::ruleId::emp:token', () => {
    expect(driftKeyFor({ loc: '13113', ruleId: 'CASH-002', empToken: 'tok-1', wrin: null })).toBe('13113::CASH-002::emp:tok-1');
  });
  it('keys a wrin-subject finding by loc::ruleId::wrin:code', () => {
    expect(driftKeyFor({ loc: '6838', ruleId: 'INV-001', empToken: null, wrin: '08235-106' })).toBe('6838::INV-001::wrin:08235-106');
  });
});

describe('Constants are within the documented, measured bounds (a guard against an accidental edit silently re-tuning the detector)', () => {
  it('DRIFT_MIN_WINDOWS/DRIFT_LOOKBACK_WINDOWS match the deep-dive doc\'s own "last 3-4 rolling windows"', () => {
    expect(DRIFT_MIN_WINDOWS).toBe(3);
    expect(DRIFT_LOOKBACK_WINDOWS).toBe(4);
  });
  it('DRIFT_MIN_RELATIVE_RISE sits above CASH-002\'s own measured noisiest decile (0.11) and below every other active rule\'s (0.18-0.51)', () => {
    expect(DRIFT_MIN_RELATIVE_RISE).toBeGreaterThan(0.11);
    expect(DRIFT_MIN_RELATIVE_RISE).toBeLessThan(0.18);
  });
});
