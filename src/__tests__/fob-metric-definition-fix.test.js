// @ts-nocheck
// FOB metric-definition fix, owner-approved 2026-07-27 (memory/perf-review-excel-audit.md):
// Performance Reviews' foodOB metric used to score in DOLLARS (field:'fobDollar') against a
// workbook target that is a PERCENTAGE — a unit mismatch, not just a loose threshold, and the
// reason FOB never got an auto-filled target. Fixed to score FOB% directly (fob$÷prodSales /
// fobPct), same units both sides.
//
// ⚠️ CORRECTION (2026-09-06, same-session self-catch): this file originally also asserted
// unit:'abs', t:[-0.0015,0.0015,0.0045] — the 0.15/0.45-point figures from the SAME audit
// doc's Round 1 (2026-07-27), applied as the base 1-4 scoring bands. That was wrong: Round 2
// (2026-07-28, one day later, same file) explicitly revises this — those figures are
// PREVIOUS-ORG BONUS-ELIGIBILITY GATES, meant to live in a separate, currently-OFF "Bonus
// Eligibility" module, "distinct from the 1-4 competency scoring." Round 2 never named a
// replacement base-scoring threshold, so review-engine.js reverted unit/t to the value that
// shipped before either round touched it (unit:'pct', t:[-0.05,0.05,0.10] — relative-%-of-
// target, the shape most other metrics here use), now correctly applied to the FOB% actual/
// target instead of the old dollar figures. This test file is rewritten to match that
// corrected state. The Bonus Eligibility module itself is still genuinely unbuilt (tracked in
// backlog-master-2026-08-19.md), not attempted here.
import { describe, it, expect } from 'vitest';
import { DEFAULT_REVIEW_CONFIG, rateMetric } from '../engine/review-engine.js';

function fobMetric() {
  return DEFAULT_REVIEW_CONFIG.metrics.profit.find(m => m.key === 'foodOB');
}

describe('FOB metric-definition fix — config shape', () => {
  it('scores relative-%-of-target, same as most other auto metrics here — NOT the previous-org bonus-eligibility absolute-point gate', () => {
    expect(fobMetric().unit).toBe('pct');
    expect(fobMetric().t).toEqual([-0.05, 0.05, 0.10]);
  });
  it('is no longer flagged as a dollar figure, and is flagged for %-style display instead', () => {
    const m = fobMetric();
    expect(m.dollar).not.toBe(true);
    expect(m.pctInput).toBe(true);
  });
  it('reads its actual from the percentage field, not the old dollar field', () => {
    expect(fobMetric().field).toBe('fobPct');
  });
  it('better:lower is unchanged — over target FOB% is still unfavorable', () => {
    expect(fobMetric().better).toBe('lower');
  });
});

describe('FOB metric-definition fix — real scoring outcomes via rateMetric', () => {
  // Boundary values verified numerically against rateMetric's actual dev<=t4/t3/t2 comparison
  // chain before writing these.
  const m = fobMetric();
  const target = 0.0385; // 3.85%, a real DEFAULT_TARGETS value (loc 3708)

  it('beating target by more than 10% relative rates Exceeds (4)', () => {
    expect(rateMetric(target * 0.90, target, m)).toBe(4);
  });
  it('exactly on target rates On Target (3)', () => {
    expect(rateMetric(target, target, m)).toBe(3);
  });
  it('3% over target relative (inside the 5% On Target band) still rates On Target (3)', () => {
    expect(rateMetric(target * 1.03, target, m)).toBe(3);
  });
  it('7% over target relative (past 5%, inside the 10% band) rates Below (2)', () => {
    expect(rateMetric(target * 1.07, target, m)).toBe(2);
  });
  it('15% over target relative (past 10%) rates Needs Improvement (1)', () => {
    expect(rateMetric(target * 1.15, target, m)).toBe(1);
  });
  it('scores on FOB%, not the old dollar figure — the actual metric-definition bug this fix corrects', () => {
    // The real bug: field:'fobDollar' scored a dollar amount against a percentage target, so
    // rateMetric's relative-deviation math ((actual-target)/|target|) was comparing incommensurable
    // units — a dollar figure could sit orders of magnitude away from a 0.0385 target regardless
    // of whether the store was actually over or under its real FOB%. Scoring FOB% on both sides
    // makes the relative deviation mean what it's supposed to mean.
    expect(rateMetric(1000, target, m)).not.toBe(rateMetric(0.04, target, m));
    expect(rateMetric(0.04, target, m)).toBe(3); // 0.04 vs 0.0385 = ~3.9% over -> On Target
  });
});
