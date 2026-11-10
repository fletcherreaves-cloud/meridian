// @ts-nocheck
// src/engine/security-health.js — the Phase 1 minimal health-score engine (dispatch 2026-11-10).
// Fixtures use the REAL loadSecurityFindings() row shape (src/lib/supabase.js's
// _mapSecurityFindingRow) and REAL numbers pulled live from this project's own Supabase
// (security_findings/security_rules, measured 2026-11-10): INV-003 at loc 0006178
// (value=77.6169953570208, threshold_used=2.5, baseline mean=20.195077123924356,
// stdev=10.299330175888517, n=18) and LABOR-001 at loc 0033704 (value=2, threshold_used=1, no
// baseline -- a threshold-type rule). Hand-computed expectations in each test's own comment.
import { describe, it, expect } from 'vitest';
import { findingMagnitude, findingContribution, computeStoreHealth, storeHealthList, HEALTH_SCORE_SCALE } from '../engine/security-health.js';
import { MIN_BASELINE_N } from '../engine/security-rules.js';

const INV003_FINDING = {
  id: 'f1', loc: '0006178', ruleId: 'INV-003', pass: true, lifecycleCategory: null,
  value: 77.6169953570208, thresholdUsed: 2.5,
  baselineContext: { mean: 20.195077123924356, stdev: 10.299330175888517, n: 18 },
  exonerationShare: null,
};
const LABOR001_FINDING = {
  id: 'f2', loc: '0033704', ruleId: 'LABOR-001', pass: true, lifecycleCategory: null,
  value: 2, thresholdUsed: 1, baselineContext: {}, exonerationShare: null,
};
const RULES_BY_ID = {
  'INV-003': { ruleId: 'INV-003', severity: 3 },
  'LABOR-001': { ruleId: 'LABOR-001', severity: 5 },
};

describe('findingMagnitude() — honest "how unusual", never a fabricated dollar figure', () => {
  it('z-score basis: (value-mean)/stdev, matching evaluateZScoreRule\'s own arithmetic', () => {
    const { magnitude, basis, lowConfidence } = findingMagnitude(INV003_FINDING);
    // (77.6169953570208 - 20.195077123924356) / 10.299330175888517 = 5.57572...
    expect(magnitude).toBeCloseTo(5.5757, 3);
    expect(basis).toBe('zscore');
    expect(lowConfidence).toBe(false); // n=18 >= MIN_BASELINE_N=5
  });

  it('flags lowConfidence when the baseline population is below MIN_BASELINE_N — the SAME floor security-rules.js z-scores against', () => {
    const thin = { ...INV003_FINDING, baselineContext: { mean: 20, stdev: 10, n: MIN_BASELINE_N - 1 } };
    expect(findingMagnitude(thin).lowConfidence).toBe(true);
    const exactlyAt = { ...INV003_FINDING, baselineContext: { mean: 20, stdev: 10, n: MIN_BASELINE_N } };
    expect(findingMagnitude(exactlyAt).lowConfidence).toBe(false);
  });

  it('ratio basis: value/threshold when no usable baseline exists (a plain threshold/ratio rule)', () => {
    const { magnitude, basis, lowConfidence } = findingMagnitude(LABOR001_FINDING);
    expect(magnitude).toBe(2); // 2 edits / 1 threshold
    expect(basis).toBe('ratio');
    expect(lowConfidence).toBe(false);
  });

  it('floors z-score magnitude at 0 rather than ever going negative', () => {
    const belowMean = { ...INV003_FINDING, value: 0, baselineContext: { mean: 20, stdev: 10, n: 10 } };
    expect(findingMagnitude(belowMean).magnitude).toBe(0);
  });

  it('falls back to unscaled (magnitude 1) when neither a baseline nor a positive threshold exists', () => {
    const bare = { value: 5, thresholdUsed: null, baselineContext: {} };
    const { magnitude, basis } = findingMagnitude(bare);
    expect(magnitude).toBe(1);
    expect(basis).toBe('unscaled');
  });
});

describe('findingContribution() — severity × magnitude × (1 − exoneration), 0 for anything not a real current flag', () => {
  it('multiplies real severity by the real z-score magnitude', () => {
    // severity 3 × 5.5757... × (1 - 0) = 16.727...
    expect(findingContribution(INV003_FINDING, RULES_BY_ID['INV-003'])).toBeCloseTo(16.727, 2);
  });

  it('multiplies real severity by the ratio magnitude for a threshold rule', () => {
    // severity 5 × 2 × (1 - 0) = 10
    expect(findingContribution(LABOR001_FINDING, RULES_BY_ID['LABOR-001'])).toBe(10);
  });

  it('reduces contribution by a real exonerationShare, never below what a full exoneration would leave', () => {
    const exonerated = { ...LABOR001_FINDING, exonerationShare: 0.25 };
    expect(findingContribution(exonerated, RULES_BY_ID['LABOR-001'])).toBe(7.5); // 5 × 2 × 0.75
    const fullyExonerated = { ...LABOR001_FINDING, exonerationShare: 1 };
    expect(findingContribution(fullyExonerated, RULES_BY_ID['LABOR-001'])).toBe(0);
  });

  it('is 0 for a non-flagged verdict (pass false/null) even with a rule present', () => {
    expect(findingContribution({ ...LABOR001_FINDING, pass: false }, RULES_BY_ID['LABOR-001'])).toBe(0);
    expect(findingContribution({ ...LABOR001_FINDING, pass: null }, RULES_BY_ID['LABOR-001'])).toBe(0);
  });

  it('is 0 for a hygiene-routed (lifecycleCategory) verdict, never counted as a security flag', () => {
    expect(findingContribution({ ...LABOR001_FINDING, lifecycleCategory: 'deactivated' }, RULES_BY_ID['LABOR-001'])).toBe(0);
  });

  it('is 0 for a low-confidence (thin-baseline) z-score finding — the data-quality guard', () => {
    const thin = { ...INV003_FINDING, baselineContext: { mean: 20, stdev: 10, n: 2 } };
    expect(findingContribution(thin, RULES_BY_ID['INV-003'])).toBe(0);
  });

  it('is 0 with no rule row (defensive — a rule_id no longer in the loaded registry)', () => {
    expect(findingContribution(LABOR001_FINDING, undefined)).toBe(0);
  });
});

describe('computeStoreHealth() — per-store aggregate, insufficient-data kept separate from the score', () => {
  it('scores each store from its own flagged findings only, scaled and capped at 100', () => {
    const byLoc = computeStoreHealth([INV003_FINDING, LABOR001_FINDING], RULES_BY_ID);
    const a = byLoc.get('0006178');
    const b = byLoc.get('0033704');
    expect(a.flaggedCount).toBe(1);
    expect(a.score).toBe(Math.min(100, Math.round(16.727 * HEALTH_SCORE_SCALE)));
    expect(a.criticalCount).toBe(0); // severity 3 < 4
    expect(b.flaggedCount).toBe(1);
    expect(b.score).toBe(Math.min(100, Math.round(10 * HEALTH_SCORE_SCALE)));
    expect(b.criticalCount).toBe(1); // severity 5 >= 4
  });

  it('never blends a low-confidence finding into the score — routes it to insufficientCount instead', () => {
    const thin = { ...INV003_FINDING, loc: '0009999', baselineContext: { mean: 20, stdev: 10, n: 1 } };
    const byLoc = computeStoreHealth([thin], RULES_BY_ID);
    const row = byLoc.get('0009999');
    expect(row.score).toBe(0);
    expect(row.flaggedCount).toBe(0);
    expect(row.insufficientCount).toBe(1);
  });

  it('skips non-flagged, hygiene, and missing-loc rows entirely (not even an insufficient-data count)', () => {
    const byLoc = computeStoreHealth([
      { ...LABOR001_FINDING, loc: '0001111', pass: false },
      { ...LABOR001_FINDING, loc: '0002222', lifecycleCategory: 'obsolete' },
      { ...LABOR001_FINDING, loc: null },
    ], RULES_BY_ID);
    expect(byLoc.size).toBe(0);
  });

  it('accumulates multiple findings for the same store additively', () => {
    const second = { ...LABOR001_FINDING, id: 'f3', ruleId: 'INV-003', value: 50, thresholdUsed: 2.5, baselineContext: { mean: 10, stdev: 5, n: 10 } };
    const byLoc = computeStoreHealth([LABOR001_FINDING, { ...second, loc: '0033704' }], RULES_BY_ID);
    const row = byLoc.get('0033704');
    expect(row.flaggedCount).toBe(2);
    // contribution 1: severity5 × 2 × 1 = 10; contribution 2: severity3 × ((50-10)/5)=8 × 1 = 24 -> sum 34
    expect(row.score).toBe(Math.min(100, Math.round(34 * HEALTH_SCORE_SCALE)));
  });
});

describe('storeHealthList() — sorted worst-first for a district grid', () => {
  it('sorts stores by score descending', () => {
    const list = storeHealthList([INV003_FINDING, LABOR001_FINDING], RULES_BY_ID);
    expect(list.length).toBe(2);
    expect(list[0].score).toBeGreaterThanOrEqual(list[1].score);
    expect(list.map(r => r.loc)).toContain('0006178');
    expect(list.map(r => r.loc)).toContain('0033704');
  });

  it('returns an empty list for no findings', () => {
    expect(storeHealthList([], RULES_BY_ID)).toEqual([]);
  });
});

// dispatch 2026-11-10 follow-on -- convergence (the deep-dive doc's own §3 `convergence_multiplier`
// score term). Needs no new fetch: a pure function of the same bulk findings/rulesById every other
// test in this file already uses.
import { groupFlaggedRuleIdsBySubject, convergenceContribution, CONVERGENCE_WEIGHT, CONVERGENCE_BONUS_CAP } from '../engine/security-health.js';

describe('groupFlaggedRuleIdsBySubject() — the engine-local subject grouping convergence is built on', () => {
  it('groups by empToken across different rules at the same store, tracking the worst severity seen', () => {
    const findings = [
      { loc: '0001111', empToken: 'tok-a', ruleId: 'LABOR-001', pass: true },
      { loc: '0001111', empToken: 'tok-a', ruleId: 'INV-003', pass: true },
    ];
    const rulesById = { 'LABOR-001': { severity: 5 }, 'INV-003': { severity: 3 } };
    const out = groupFlaggedRuleIdsBySubject(findings, rulesById);
    expect(out.size).toBe(1);
    const row = [...out.values()][0];
    expect(row.ruleIds.size).toBe(2);
    expect(row.maxSeverity).toBe(5);
  });
  it('never groups an emp subject with a wrin subject, even at the same loc', () => {
    const findings = [
      { loc: '0001111', empToken: 'tok-a', ruleId: 'LABOR-001', pass: true },
      { loc: '0001111', wrin: 'WRIN-1', ruleId: 'INV-003', pass: true },
    ];
    const rulesById = { 'LABOR-001': { severity: 5 }, 'INV-003': { severity: 3 } };
    expect(groupFlaggedRuleIdsBySubject(findings, rulesById).size).toBe(2);
  });
  it('ignores non-flagged, hygiene, and subjectless rows, same posture as computeStoreHealth itself', () => {
    const findings = [
      { loc: '0001111', empToken: 'tok-a', ruleId: 'LABOR-001', pass: false },
      { loc: '0001111', empToken: 'tok-b', ruleId: 'LABOR-001', pass: true, lifecycleCategory: 'obsolete' },
      { loc: '0001111', ruleId: 'LABOR-001', pass: true },
    ];
    expect(groupFlaggedRuleIdsBySubject(findings, { 'LABOR-001': { severity: 5 } }).size).toBe(0);
  });
});

describe('convergenceContribution() — rewards corroborating independent rules, never a single one', () => {
  it('a single flagged rule earns no bonus -- nothing to corroborate yet', () => {
    expect(convergenceContribution(1, 5)).toBe(0);
    expect(convergenceContribution(0, 5)).toBe(0);
  });
  it('matches CONVERGENCE_WEIGHT × (ruleCount-1) × maxSeverity below the cap', () => {
    expect(convergenceContribution(2, 3)).toBe(CONVERGENCE_WEIGHT * 1 * 3);
    expect(convergenceContribution(3, 3)).toBe(CONVERGENCE_WEIGHT * 2 * 3);
  });
  it('never exceeds CONVERGENCE_BONUS_CAP, however many rules converge', () => {
    expect(convergenceContribution(10, 5)).toBe(CONVERGENCE_BONUS_CAP);
  });
});

describe('computeStoreHealth() — convergence folds into the score automatically, no opt-in needed', () => {
  it('two different rules flagging the SAME subject score HIGHER than the identical findings would at two different subjects', () => {
    const sameSubject = [
      { id: 'a', loc: '0001111', empToken: 'tok-a', ruleId: 'LABOR-001', pass: true, value: 2, thresholdUsed: 1, baselineContext: {} },
      { id: 'b', loc: '0001111', empToken: 'tok-a', ruleId: 'INV-003', pass: true, value: 50, thresholdUsed: 2.5, baselineContext: { mean: 10, stdev: 5, n: 10 } },
    ];
    const differentSubjects = sameSubject.map(f => ({ ...f, empToken: f.id === 'a' ? 'tok-a' : 'tok-b' }));
    const rulesById = { 'LABOR-001': { severity: 5 }, 'INV-003': { severity: 3 } };
    const sameScore = computeStoreHealth(sameSubject, rulesById).get('0001111').score;
    const diffScore = computeStoreHealth(differentSubjects, rulesById).get('0001111').score;
    expect(sameScore).toBeGreaterThan(diffScore);
  });
});
