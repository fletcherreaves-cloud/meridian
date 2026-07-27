import { describe, it, expect } from 'vitest';
import { resolveReviewConfig, computeScores, blankReview } from '../engine/review-engine.js';

// Minimal single-metric / single-competency template so the composite is easy to
// reason about: metrics 100% = category rgr = metric m1; behavioral = one item.
const mkCfg = (overall) => ({
  version: 1,
  overall,
  categoryWeights: { rgr: { weight: 1 } },
  metrics: { rgr: [{ key: 'm1', label: 'M1', weight: 1, better: 'higher', unit: 'abs', scored: true, t: [10, 5, 0] }] },
  competencies: { GM: { rgr: [{ text: 'c1', active: true }] } },
  extraCategories: [],
});

// A review whose metrics all score 4 (dev = 20-10 = 10 ≥ t4) and whose behavioral
// ratings are all 2 → so the metrics/behavioral split actually changes the overall.
const mkReview = (snapshot) => ({
  role: 'GM', half: 'H1',
  ...(snapshot ? { templateSnapshot: snapshot } : {}),
  kpis: { months: Object.fromEntries([1, 2, 3, 4, 5, 6].map(m => [m, { m1: 20, m1Tgt: 10 }])) },
  behavioralRatings: { q1: { rgr: [2] }, q2: { rgr: [2] } },
});

describe('resolveReviewConfig', () => {
  it('prefers the review snapshot, else the passed-in config', () => {
    const snap = mkCfg({ metrics: 0.5, behavioral: 0.5 });
    const live = mkCfg({ metrics: 0.7, behavioral: 0.3 });
    expect(resolveReviewConfig({ templateSnapshot: snap }, live)).toBe(snap);
    expect(resolveReviewConfig({}, live)).toBe(live);
  });
});

describe('computeScores template-snapshot isolation', () => {
  it('scores a pre-snapshot review against the live config (back-compat)', () => {
    const live = mkCfg({ metrics: 0.7, behavioral: 0.3 });
    const s = computeScores(mkReview(null), live);
    expect(s.half.overall).toBeCloseTo(4 * 0.7 + 2 * 0.3, 5); // 3.4
  });

  it('scores against the review snapshot, NOT the (changed) live config', () => {
    const live = mkCfg({ metrics: 0.7, behavioral: 0.3 });
    const snap = mkCfg({ metrics: 0.5, behavioral: 0.5 });
    const s = computeScores(mkReview(snap), live);
    expect(s.half.overall).toBeCloseTo(4 * 0.5 + 2 * 0.5, 5); // 3.0 — history protected
  });
});

describe('blankReview', () => {
  it('embeds a deep copy of the template it was built against', () => {
    const cfg = mkCfg({ metrics: 0.6, behavioral: 0.4 });
    const r = blankReview('Jane Doe', 'GM', '3708', 2026, 'H1', cfg);
    expect(r.templateSnapshot).toBeTruthy();
    expect(r.templateSnapshot.overall).toEqual({ metrics: 0.6, behavioral: 0.4 });
    expect(r.templateSnapshot).not.toBe(cfg); // deep copy, not a shared reference
  });
});
