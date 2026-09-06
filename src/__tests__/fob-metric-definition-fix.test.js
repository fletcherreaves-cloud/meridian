// @ts-nocheck
// FOB metric-definition fix, owner-approved 2026-07-27/28 (memory/perf-review-excel-audit.md):
// Performance Reviews' foodOB metric used to score in DOLLARS (field:'fobDollar') against a
// workbook target that is a PERCENTAGE — a unit mismatch, not just a loose threshold, and the
// reason FOB never got an auto-filled target. Fixed to score FOB% directly, in absolute
// percentage-POINTS (unit:'abs'), against thresholds converted from the owner's percentage-point
// figures (0.15/0.45 pts) to this app's fraction-of-1 storage scale for a percentage (divided by
// 100). This test locks in the real scoring outcome end to end — not just that the auto-fill
// data-sourcing changed (covered elsewhere), but that a real actual/target pair now rates the way
// the owner's spec says it should.
import { describe, it, expect } from 'vitest';
import { DEFAULT_REVIEW_CONFIG, rateMetric } from '../engine/review-engine.js';

function fobMetric() {
  return DEFAULT_REVIEW_CONFIG.metrics.profit.find(m => m.key === 'foodOB');
}

describe('FOB metric-definition fix — config shape', () => {
  it('scores in absolute percentage-points, not relative-%-of-target', () => {
    expect(fobMetric().unit).toBe('abs');
  });
  it('is no longer flagged as a dollar figure, and is flagged for %-style display instead', () => {
    const m = fobMetric();
    expect(m.dollar).not.toBe(true);
    expect(m.pctInput).toBe(true);
  });
  it('thresholds are the owner\'s 0.15/0.45 percentage-point figures on this app\'s fraction-of-1 scale', () => {
    // DEFAULT_TARGETS stores a percentage like 3.85% as 0.0385, not 3.85 or 38.5 — confirmed
    // against src/constants.js. "0.15 percentage points" on that scale is 0.0015.
    expect(fobMetric().t).toEqual([-0.0015, 0.0015, 0.0045]);
  });
  it('better:lower is unchanged — over target FOB% is still unfavorable', () => {
    expect(fobMetric().better).toBe('lower');
  });
});

describe('FOB metric-definition fix — real scoring outcomes via rateMetric', () => {
  // Boundary values verified numerically against rateMetric's actual dev<=t4/t3/t2 comparison
  // chain before writing these — an exact-boundary actual (e.g. target+0.0015) is floating-point
  // sensitive (0.0385+0.0015-0.0385 !== exactly 0.0015) and can land one bucket off, so every
  // case here sits comfortably inside its band rather than exactly on a threshold.
  const m = fobMetric();
  const target = 0.0385; // 3.85%, a real DEFAULT_TARGETS value (loc 3708)

  it('beating target by more than 0.15 points rates Exceeds (4)', () => {
    expect(rateMetric(target - 0.0020, target, m)).toBe(4);
  });
  it('exactly on target rates On Target (3) — "exceeds" requires meaningfully beating it, not just matching it', () => {
    expect(rateMetric(target, target, m)).toBe(3);
  });
  it('0.10 points over target (inside the 0.15pt On Target band) still rates On Target (3)', () => {
    expect(rateMetric(target + 0.0010, target, m)).toBe(3);
  });
  it('0.30 points over target (past 0.15, inside the 0.45pt band) rates Below (2)', () => {
    expect(rateMetric(target + 0.0030, target, m)).toBe(2);
  });
  it('0.60 points over target (past 0.45) rates Needs Improvement (1)', () => {
    expect(rateMetric(target + 0.0060, target, m)).toBe(1);
  });
  it('scores on the ABSOLUTE point gap, not the old relative-%-of-target formula — the exact ' +
     'bug this fix corrects (a small target made a small pct miss look huge in relative terms)', () => {
    // Under the OLD unit:'pct' formula, dev = (actual-target)/|target|. At a small target like
    // 0.01 (1%), being 0.006 over (60% relative) would have read as a severe miss regardless of
    // how the absolute gap compares to a differently-sized store's target. Under the NEW
    // unit:'abs' formula, dev = actual-target = 0.006 for EITHER target size, past the 0.0045
    // band -> the same rating (1) for the same absolute overage, which the old relative formula
    // could never guarantee (a small-target store and a large-target store with an identical
    // 0.6pt miss used to score differently; now they don't).
    const smallTarget = 0.01;
    expect(rateMetric(smallTarget + 0.0060, smallTarget, m)).toBe(1);
    const largeTarget = 0.08;
    expect(rateMetric(largeTarget + 0.0060, largeTarget, m)).toBe(1);
  });
});
