import { describe, it, expect } from 'vitest';
import { DEF_SETTINGS } from '../constants.js';

// pipeline.js transitively imports morning-brief.js, which assigns `window.onerror` at module
// top level — harmless in a browser, but this suite runs under vitest's `node` environment
// (vite.config.ts), so `window` doesn't exist yet. Stub it before a dynamic import (NOT hoisted,
// unlike a static import) so that assignment has somewhere to land.
globalThis.window = globalThis.window || {};
const { computeCtrlScore } = await import('../engine/pipeline.js');

// v4.931 — data-integrity sweep signature #5: computeCtrlScore used to score every controls
// component off a bare `||0` with no coverage check, so a store with ZERO controls data scored
// every "lower is better" metric as a perfect 0 and produced ctrlScore≈100 — triggering
// buildBrief's "STRENGTH — CONTROLS ELITE" for a store that has no data at all. Fixed by reading
// p._cov (forecast.js compute6wk's observation-count map) and skipping/reducing the max for any
// uncovered component, mirroring computeOpsScore's already-correct t.X>0&&p.X>0 gate.
const sc = DEF_SETTINGS.scoring;

// A perfectly-covered, perfectly-scoring store (every metric at its best tier, every field covered).
const fullyGoodP = () => ({
  cashOSPct: 0, tRedAPct: 0, otHrs: 0, cashRefCnt: 0, discPct: 0,
  _cov: { cashOSPct: 40, tRedAPct: 40, otHrs: 40, cashRefCnt: 40, discPct: 40 },
});

describe('computeCtrlScore — coverage-aware (v4.931)', () => {
  it('a store with zero controls data does NOT score as elite (the reported bug)', () => {
    const noData = { cashOSPct: 0, tRedAPct: 0, otHrs: 0, cashRefCnt: 0, discPct: 0, _cov: {} };
    const cs = computeCtrlScore(noData, sc);
    expect(cs).toBeLessThan(90); // must not clear the "STRENGTH — CONTROLS ELITE" threshold in buildBrief
  });

  it('undefined _cov (field absent entirely) is treated the same as empty coverage', () => {
    const noCov = { cashOSPct: 0, tRedAPct: 0, otHrs: 0, cashRefCnt: 0, discPct: 0 };
    expect(computeCtrlScore(noCov, sc)).toBeLessThan(90);
  });

  it('a fully-covered, perfectly-scoring store still reaches the max achievable score', () => {
    const cs = computeCtrlScore(fullyGoodP(), sc);
    expect(cs).toBeGreaterThanOrEqual(90); // real excellence must still register as elite
  });

  it('a fully-covered store scores IDENTICALLY to the pre-fix formula (no behavior drift for real data)', () => {
    // Pre-fix formula: score/40*100, with every term always scored via ||0 defaults.
    const p = { cashOSPct: 0.0002, tRedAPct: 0.001, otHrs: 0.5, cashRefCnt: 0, discPct: 0.03,
      _cov: { cashOSPct: 40, tRedAPct: 40, otHrs: 40, cashRefCnt: 40, discPct: 40 } };
    const preFixScore = (() => {
      let score = 0; const ac = Math.abs(p.cashOSPct || 0); const { cashPts, tredPts, otPts, refundPts, discPts } = sc;
      if (ac <= sc.cashT1) score += cashPts[0]; else if (ac <= sc.cashT2) score += cashPts[1]; else if (ac <= sc.cashT3) score += cashPts[2]; else if (ac <= sc.cashT4) score += cashPts[3];
      const tra = p.tRedAPct || 0; if (tra <= sc.tredT1) score += tredPts[0]; else if (tra <= sc.tredT2) score += tredPts[1]; else if (tra <= sc.tredT3) score += tredPts[2];
      score += 3;
      const ot = p.otHrs || 0; if (ot <= sc.otT1) score += otPts[0]; else if (ot <= sc.otT2) score += otPts[1]; else if (ot <= sc.otT3) score += otPts[2]; else if (ot <= sc.otT4) score += otPts[3];
      const rc = p.cashRefCnt || 0; if (rc <= sc.refundT1) score += refundPts[0]; else if (rc <= sc.refundT2) score += refundPts[1]; else if (rc <= sc.refundT3) score += refundPts[2];
      const dp = p.discPct || 0; if (dp <= sc.discT1) score += discPts[0]; else if (dp <= sc.discT2) score += discPts[1]; else if (dp <= sc.discT3) score += discPts[2];
      return +Math.min(100, score / 40 * 100).toFixed(1);
    })();
    expect(computeCtrlScore(p, sc)).toBe(preFixScore);
  });

  it('partial coverage scores only the covered components, not inflated by missing ones', () => {
    // Only cashOSPct covered, and it's bad (worst tier) — the other 4 uncovered metrics must not
    // pad the score toward "excellent" the way the pre-fix ||0 defaulting would have.
    const p = { cashOSPct: 0.01, _cov: { cashOSPct: 40 } };
    const cs = computeCtrlScore(p, sc);
    expect(cs).toBeLessThan(50); // bad cash score, nothing else counted — should read as poor/unknown, not elite
  });

  it('missing just one of five components barely moves the score for an otherwise-excellent store', () => {
    const missingOne = { ...fullyGoodP(), _cov: { ...fullyGoodP()._cov, discPct: 0 } };
    const cs = computeCtrlScore(missingOne, sc);
    expect(cs).toBeGreaterThanOrEqual(90); // still reads as elite — one missing minor field shouldn't tank it
  });
});
