// @ts-nocheck
// Bonus Eligibility module (owner-approved design, perf-review-excel-audit.md Round 2,
// 2026-07-28) — a previous-org benefit ("current org has NOT implemented this benefit yet but
// likely will next year"), tracked as genuinely unbuilt in backlog-master-2026-08-19.md /
// backlog-open-2026-09-06.md §7 until this file. A pass/fail gate on Labor%/FOB% vs target
// using absolute percentage-point thresholds (0.25pts Labor / 0.15pts FOB, the Round 1 figures),
// off by default, fully separate from the 1-4 base competency scoring (which correctly uses
// relative-%-of-target — see fob-metric-definition-fix.test.js for that history).
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_REVIEW_CONFIG, BONUS_ELIGIBILITY_GATES,
  bonusEligibilityForMonth, bonusEligibilityForPeriod,
  computeScores, computeScoreBreakdown, blankReview,
} from '../engine/review-engine.js';

function reviewWithMonths(monthData) {
  const review = blankReview('Test GM', 'GM', '3708', 2026, DEFAULT_REVIEW_CONFIG);
  for (const [n, data] of Object.entries(monthData)) {
    review.kpis.months[n] = { ...review.kpis.months[n], ...data };
  }
  return review;
}

describe('Bonus Eligibility module — off by default', () => {
  it('DEFAULT_REVIEW_CONFIG.bonusEligibility.enabled is false', () => {
    expect(DEFAULT_REVIEW_CONFIG.bonusEligibility.enabled).toBe(false);
  });
  it('bonusEligibilityForMonth returns null when disabled', () => {
    const mo = { labor: 0.24, laborTgt: 0.25, foodOB: 0.037, foodOBTgt: 0.0385 };
    expect(bonusEligibilityForMonth(mo, DEFAULT_REVIEW_CONFIG)).toBeNull();
  });
  it('bonusEligibilityForPeriod returns null when disabled', () => {
    const review = reviewWithMonths({ 1: { labor: 0.24, laborTgt: 0.25 } });
    expect(bonusEligibilityForPeriod(review, DEFAULT_REVIEW_CONFIG, [1])).toBeNull();
  });
});

describe('Bonus Eligibility module — per-month gates, once enabled', () => {
  const cfg = { ...DEFAULT_REVIEW_CONFIG, bonusEligibility: { enabled: true, gates: BONUS_ELIGIBILITY_GATES } };

  it('Labor 0.30pts under target (past the 0.25pt gate) is eligible', () => {
    const mo = { labor: 0.2170, laborTgt: 0.2200 };
    const [labor] = bonusEligibilityForMonth(mo, cfg);
    expect(labor.eligible).toBe(true);
  });
  it('Labor exactly 0.25pts under target is eligible (gate is inclusive)', () => {
    const mo = { labor: 0.2175, laborTgt: 0.2200 };
    const [labor] = bonusEligibilityForMonth(mo, cfg);
    expect(labor.eligible).toBe(true);
  });
  it('Labor only 0.10pts under target (short of the 0.25pt gate) is NOT eligible', () => {
    const mo = { labor: 0.2190, laborTgt: 0.2200 };
    const [labor] = bonusEligibilityForMonth(mo, cfg);
    expect(labor.eligible).toBe(false);
  });
  it('Labor OVER target is not eligible', () => {
    const mo = { labor: 0.2300, laborTgt: 0.2200 };
    const [labor] = bonusEligibilityForMonth(mo, cfg);
    expect(labor.eligible).toBe(false);
  });
  it('FOB 0.20pts under target (past the 0.15pt gate) is eligible', () => {
    const mo = { foodOB: 0.0365, foodOBTgt: 0.0385 };
    const [, fob] = bonusEligibilityForMonth(mo, cfg);
    expect(fob.eligible).toBe(true);
  });
  it('FOB only 0.05pts under target (short of the 0.15pt gate) is NOT eligible', () => {
    const mo = { foodOB: 0.0380, foodOBTgt: 0.0385 };
    const [, fob] = bonusEligibilityForMonth(mo, cfg);
    expect(fob.eligible).toBe(false);
  });
  it('missing actual or target rates eligible:null, not false', () => {
    const [labor, fob] = bonusEligibilityForMonth({ labor: 0.21 }, cfg);
    expect(labor.eligible).toBeNull();
    expect(fob.eligible).toBeNull();
  });
});

describe('Bonus Eligibility module — period rollup requires every rated month to pass', () => {
  const cfg = { ...DEFAULT_REVIEW_CONFIG, bonusEligibility: { enabled: true, gates: BONUS_ELIGIBILITY_GATES } };

  it('all months passing both gates → overallEligible true', () => {
    const review = reviewWithMonths({
      1: { labor: 0.2170, laborTgt: 0.2200, foodOB: 0.0365, foodOBTgt: 0.0385 },
      2: { labor: 0.2160, laborTgt: 0.2200, foodOB: 0.0360, foodOBTgt: 0.0385 },
    });
    const be = bonusEligibilityForPeriod(review, cfg, [1, 2]);
    expect(be.overallEligible).toBe(true);
    expect(be.gates.find(g => g.key === 'labor').eligible).toBe(true);
    expect(be.gates.find(g => g.key === 'foodOB').eligible).toBe(true);
  });

  it('one bad month on one gate fails that gate and the period overall', () => {
    const review = reviewWithMonths({
      1: { labor: 0.2170, laborTgt: 0.2200, foodOB: 0.0365, foodOBTgt: 0.0385 },
      2: { labor: 0.2300, laborTgt: 0.2200, foodOB: 0.0360, foodOBTgt: 0.0385 }, // labor over target
    });
    const be = bonusEligibilityForPeriod(review, cfg, [1, 2]);
    expect(be.gates.find(g => g.key === 'labor').eligible).toBe(false);
    expect(be.gates.find(g => g.key === 'foodOB').eligible).toBe(true);
    expect(be.overallEligible).toBe(false);
  });

  it('no data in any month for the period → overallEligible null, not false', () => {
    const review = reviewWithMonths({});
    const be = bonusEligibilityForPeriod(review, cfg, [1, 2, 3]);
    expect(be.overallEligible).toBeNull();
  });

  it('months with no data are simply excluded, not treated as failures', () => {
    const review = reviewWithMonths({
      1: { labor: 0.2170, laborTgt: 0.2200, foodOB: 0.0365, foodOBTgt: 0.0385 },
      // month 2 has no labor/foodOB data at all
    });
    const be = bonusEligibilityForPeriod(review, cfg, [1, 2]);
    expect(be.overallEligible).toBe(true);
    expect(be.gates.find(g => g.key === 'labor').monthsRated).toBe(1);
  });
});

describe('Bonus Eligibility module — never touches the base 1-4 scoring', () => {
  // The whole point of the module design (Round 2): it must be fully additive. Prove it by
  // computing the SAME KPI data's scores with the module off vs on and asserting byte-identical
  // output — computeScores/computeScoreBreakdown never read cfg.bonusEligibility at all.
  // Note: computeScores/computeScoreBreakdown resolve their config from review.templateSnapshot
  // (resolveReviewConfig), not the cfg argument directly — so the on/off config has to be set on
  // templateSnapshot to actually reach the scoring path, matching how a real review is scored.
  const monthData = {
    1: { labor: 0.30, laborTgt: 0.2200, foodOB: 0.05, foodOBTgt: 0.0385, sales: 100000, salesTgt: 95000 },
  };
  const cfgOff = DEFAULT_REVIEW_CONFIG;
  const cfgOn = { ...DEFAULT_REVIEW_CONFIG, bonusEligibility: { enabled: true, gates: BONUS_ELIGIBILITY_GATES } };

  it('computeScores is identical whether the module is enabled or disabled', () => {
    const reviewOff = reviewWithMonths(monthData); // templateSnapshot = cfgOff by default
    const reviewOn = reviewWithMonths(monthData);
    reviewOn.templateSnapshot = cfgOn;
    expect(computeScores(reviewOn, cfgOn)).toEqual(computeScores(reviewOff, cfgOff));
  });

  it('computeScoreBreakdown is identical whether the module is enabled or disabled', () => {
    const reviewOff = reviewWithMonths(monthData);
    const reviewOn = reviewWithMonths(monthData);
    reviewOn.templateSnapshot = cfgOn;
    expect(computeScoreBreakdown(reviewOn, cfgOn)).toEqual(computeScoreBreakdown(reviewOff, cfgOff));
  });
});
