// @ts-nocheck
// Dispatch #154 (Performance Review continuity, Phase 5a) — promotion/transfer segmented
// scoring: majority-of-month/quarter attribution, per-segment scoring (own role's competency
// framework + own store's targets, reusing computeScores' own machinery, not reinvented), the
// provisional weighted rollup, and the full computeSegmentedReview pipeline (including the
// common "no transition" case reducing to exactly computeScores' own year rollup).
import { describe, it, expect } from 'vitest';
import {
  blankReview, computeScores, computeSegmentScores, computeSegmentedReview,
  resolvePeriodAttribution, provisionalSegmentRollup, LADDER_ROLE_TO_REVIEW_ROLE,
  calendarMonthRange,
} from '../engine/review-engine.js';

// A minimal, fully-predictable review config: exactly ONE scored metric (oepe, weight 1.0 in a
// single category with weight 1.0) so `metrics` === that single metric's 1-4 rating directly —
// same isolation technique dispatch #152's own year-rollup proof test used, so the numbers below
// are hand-checkable rather than depending on DEFAULT_REVIEW_CONFIG's full weighted mix.
const MINI_CFG = {
  version: 1,
  overall: { metrics: 0.70, behavioral: 0.30 },
  categoryWeights: { rgr: { label: 'RGR', weight: 1.0 } },
  metrics: {
    rgr: [{ key: 'oepe', label: 'OEPE', weight: 1.0, better: 'lower', unit: 'abs', scored: true, t: [-5, 5, 10], src: 'auto', field: 'oepe' }],
  },
  competencies: {
    AM: { rgr: ['AM competency item'] },
    GM: { rgr: ['GM competency item'] },
  },
  extraCategories: [],
};

describe('resolvePeriodAttribution — majority-of-month (decision #3-A)', () => {
  // 30-day month (June 2026), transfer boundary at the ORIGIN's last day / DESTINATION's first
  // day — exactly the dispatch's own worked examples.
  const origin = (endDay) => ({ start: '2026-01-01', end: `2026-06-${String(endDay).padStart(2, '0')}` });
  const dest = (startDay) => ({ start: `2026-06-${String(startDay).padStart(2, '0')}`, end: '2026-12-31' });

  it('a transfer on the 10th (origin: days 1-9, destination: days 10-30) attributes the WHOLE month to the destination', () => {
    const segs = [origin(9), dest(10)];
    const winner = resolvePeriodAttribution('2026-06-01', '2026-06-30', segs);
    expect(winner).toBe(segs[1]); // destination — 21 days beats origin's 9
  });

  it('a transfer on the 20th (origin: days 1-19, destination: days 20-30) attributes the WHOLE month to the origin', () => {
    const segs = [origin(19), dest(20)];
    const winner = resolvePeriodAttribution('2026-06-01', '2026-06-30', segs);
    expect(winner).toBe(segs[0]); // origin — 19 days beats destination's 11
  });

  it('generalizes beyond a month — works identically for a quarter-length period (behavioral attribution\'s own use)', () => {
    // Q2 2026 = Apr 1 - Jun 30 (91 days). A transition on May 1 gives origin 30 days (Apr),
    // destination 61 days (May+Jun) — destination majority.
    const segs = [
      { start: '2026-01-01', end: '2026-04-30' },
      { start: '2026-05-01', end: '2026-12-31' },
    ];
    const s = calendarMonthRange(2026, 4).s, e = calendarMonthRange(2026, 6).e;
    expect(resolvePeriodAttribution(s, e, segs)).toBe(segs[1]);
  });

  it('returns null when nothing overlaps the period at all', () => {
    expect(resolvePeriodAttribution('2026-06-01', '2026-06-30', [{ start: '2027-01-01', end: '2027-12-31' }])).toBeNull();
  });
});

describe('LADDER_ROLE_TO_REVIEW_ROLE — documented, lossy ladder-id -> ROLE_KEYS mapping', () => {
  it('resolves the three unambiguous ladder rungs directly', () => {
    expect(LADDER_ROLE_TO_REVIEW_ROLE.gm).toBe('GM');
    expect(LADDER_ROLE_TO_REVIEW_ROLE.area_supervisor).toBe('AS');
    expect(LADDER_ROLE_TO_REVIEW_ROLE.om).toBe('OM');
  });
  it('the ambiguous sm_am_dm rung resolves to the documented AM stand-in', () => {
    expect(LADDER_ROLE_TO_REVIEW_ROLE.sm_am_dm).toBe('AM');
  });
});

describe('computeSegmentScores — two segments, different role frameworks AND different store targets, scored independently', () => {
  it('does not blend the two segments — each scores against its OWN role\'s competencies and OWN store\'s (ds-refreshed) targets', () => {
    const review = blankReview('X', 'GM', '200', 2026, MINI_CFG, 'P1');
    // Segment A months: stale/wrong target baked into kpis.months (simulating autoPopulateKPIs
    // having populated it against review.loc, NOT this segment's own store) — proves
    // computeSegmentScores actually REFRESHES it via ds rather than trusting the stale value.
    for (const m of [1, 2, 3]) { review.kpis.months[m].oepe = 132; review.kpis.months[m].oepeTgt = 50; }
    // Segment B months: target already correct for review.loc (='200'), so no refresh needed.
    for (const m of [4, 5, 6]) { review.kpis.months[m].oepe = 150; review.kpis.months[m].oepeTgt = 100; }
    review.behavioralRatings.q1.rgr = [3];
    review.behavioralRatings.q2.rgr = [1];

    const ds = { targets: { '100': { tOepe: 140 }, '200': { tOepe: 100 } } };

    const segA = { role: 'AM', loc: '100', months: [1, 2, 3], qKeys: ['q1'] };
    const scoresA = computeSegmentScores(review, MINI_CFG, segA, ds);
    // dev = 132 - 140(REFRESHED, not the stale 50) = -8 <= t4(-5) -> rating 4
    expect(scoresA.metrics).toBe(4);
    expect(scoresA.behavioral).toBe(3); // AM's own single competency item, q1
    expect(scoresA.overall).toBeCloseTo(4 * 0.70 + 3 * 0.30, 10);

    const segB = { role: 'GM', loc: '200', months: [4, 5, 6], qKeys: ['q2'] };
    const scoresB = computeSegmentScores(review, MINI_CFG, segB, ds);
    // dev = 150 - 100 = 50, worse than every threshold -> rating 1
    expect(scoresB.metrics).toBe(1);
    expect(scoresB.behavioral).toBe(1); // GM's own single competency item, q2
    expect(scoresB.overall).toBeCloseTo(1 * 0.70 + 1 * 0.30, 10);

    // The headline assertion: NOT blended — scoring segment A never touched segment B's data
    // or role, and vice versa (proven by the two segments landing on very different ratings
    // from data the naive whole-review computeScores() would have averaged together).
    expect(scoresA.overall).not.toBeCloseTo(scoresB.overall, 1);
  });

  it('when segment.loc === review.loc, targets are reused as-is (no ds call needed, cheap path)', () => {
    const review = blankReview('X', 'GM', '200', 2026, MINI_CFG);
    review.kpis.months[1].oepe = 132;
    review.kpis.months[1].oepeTgt = 140; // already correct for review.loc
    review.behavioralRatings.q1.rgr = [4];
    const seg = { role: 'GM', loc: '200', months: [1], qKeys: ['q1'] };
    // No `ds` passed at all — should not throw, and should use the existing target unchanged.
    const scores = computeSegmentScores(review, MINI_CFG, seg, null);
    expect(scores.metrics).toBe(4); // dev = 132-140 = -8 <= -5 -> 4
  });
});

describe('provisionalSegmentRollup — concrete numeric example (decision #3\'s "starting point")', () => {
  it('weights each segment\'s overall score by its month COUNT, not an unweighted average', () => {
    const segments = [
      { overall: 4, months: [1, 2, 3] },          // 3 months
      { overall: 2, months: [4, 5, 6, 7, 8, 9, 10, 11, 12] }, // 9 months
    ];
    // (4*3 + 2*9) / (3+9) = (12+18)/12 = 2.5 -- NOT the unweighted (4+2)/2 = 3.0
    const rollup = provisionalSegmentRollup(segments);
    expect(rollup.value).toBeCloseTo(2.5, 10);
    expect(rollup.provisional).toBe(true);
    expect(rollup.segmentCount).toBe(2);
  });

  it('a segment with a null overall score contributes zero weight, not a zero score', () => {
    const segments = [
      { overall: 4, months: [1, 2, 3, 4, 5, 6] },
      { overall: null, months: [7, 8, 9, 10, 11, 12] }, // unscored — excluded, not scored as 0
    ];
    expect(provisionalSegmentRollup(segments).value).toBeCloseTo(4, 10);
  });

  it('returns null when nothing is scored at all', () => {
    expect(provisionalSegmentRollup([]).value).toBeNull();
    expect(provisionalSegmentRollup([{ overall: null, months: [1] }]).value).toBeNull();
  });
});

describe('computeSegmentedReview — the common case (no assignment changes) reduces to computeScores() itself', () => {
  it('with zero staff_assignments rows, produces exactly ONE segment whose rollup EQUALS computeScores(review,cfg).year.overall', () => {
    const cfg = MINI_CFG;
    const review = blankReview('X', 'GM', '100', 2026, cfg, 'P9');
    for (const m of [1,2,3,4,5,6,7,8,9,10,11,12]) { review.kpis.months[m].oepe = 132; review.kpis.months[m].oepeTgt = 140; }
    review.behavioralRatings.q1.rgr = [4]; review.behavioralRatings.q2.rgr = [2];
    review.behavioralRatings.q3.rgr = [3]; review.behavioralRatings.q4.rgr = [1];

    const result = computeSegmentedReview(review, cfg, null, []); // no ds, no assignment rows
    expect(result.hasTransitions).toBe(false);
    expect(result.segments.length).toBe(1);
    expect(result.segments[0].role).toBe('GM'); // falls back to the review's own role
    expect(result.segments[0].loc).toBe('100');

    const plain = computeScores(review, cfg);
    expect(result.rollup.value).toBeCloseTo(plain.year.overall, 10);
    expect(result.segments[0].overall).toBeCloseTo(plain.year.overall, 10);
  });
});

describe('computeSegmentedReview — combined store-transfer + role-promotion (the unified mechanism)', () => {
  it('splits into two independently-scored segments and rolls them up by month-weight', () => {
    const cfg = MINI_CFG;
    const review = blankReview('X', 'GM', '200', 2026, cfg, 'P1'); // currently GM @ 200 (post-promotion/transfer)
    const assignmentRows = [
      { person: 'P1', role: 'sm_am_dm', target_type: 'store', target: '100', start: '2026-01-01' },
      { person: 'P1', role: 'gm',       target_type: 'store', target: '200', start: '2026-07-01' },
    ];
    // H1 (segment A, sm_am_dm@100): stale/wrong target baked in, must be REFRESHED via ds.
    for (const m of [1,2,3,4,5,6]) { review.kpis.months[m].oepe = 132; review.kpis.months[m].oepeTgt = 999; }
    // H2 (segment B, gm@200): already correct for review.loc, no refresh needed.
    for (const m of [7,8,9,10,11,12]) { review.kpis.months[m].oepe = 150; review.kpis.months[m].oepeTgt = 100; }
    review.behavioralRatings.q1.rgr = [3]; review.behavioralRatings.q2.rgr = [3]; // segment A (AM-mapped)
    review.behavioralRatings.q3.rgr = [1]; review.behavioralRatings.q4.rgr = [1]; // segment B (GM)

    const ds = { targets: { '100': { tOepe: 140 }, '200': { tOepe: 100 } } };
    const result = computeSegmentedReview(review, cfg, ds, assignmentRows);

    expect(result.hasTransitions).toBe(true);
    expect(result.segments.length).toBe(2);

    const segA = result.segments.find(s => s.loc === '100');
    const segB = result.segments.find(s => s.loc === '200');
    expect(segA.role).toBe('AM'); // sm_am_dm -> the documented canonical stand-in
    expect(segA.months).toEqual([1,2,3,4,5,6]);
    expect(segA.metrics).toBe(4);   // dev = 132-140(refreshed) = -8 -> rating 4
    expect(segA.behavioral).toBe(3);
    expect(segA.overall).toBeCloseTo(4*0.70+3*0.30, 10);

    expect(segB.role).toBe('GM');
    expect(segB.months).toEqual([7,8,9,10,11,12]);
    expect(segB.metrics).toBe(1);   // dev = 150-100 = 50 -> rating 1
    expect(segB.behavioral).toBe(1);
    expect(segB.overall).toBeCloseTo(1*0.70+1*0.30, 10);

    // Provisional rollup: equal 6-month weights on each side.
    const expectedRollup = (segA.overall * 6 + segB.overall * 6) / 12;
    expect(result.rollup.value).toBeCloseTo(expectedRollup, 10);
    expect(result.rollup.value).toBeCloseTo(2.35, 2);
  });
});
