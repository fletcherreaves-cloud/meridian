// @vitest-environment happy-dom
// @ts-nocheck
// GH #194's own audit grep (`.tJuneProj\b|.tOperatorProj\b|.tQSRSoftProj\b|.tJuneTpph\b`) missed
// a fifth field riding the exact same fallback chain: morning-brief.js's two projSales readers
// both end `tJuneProj || tOperatorProj || tMayProj || 0`. A repo-wide grep for `tMayProj` turns
// up ONLY these two reads -- zero writers anywhere in src/ (applyProjectionsToTargets, the
// write site for this whole field family, never sets it; neither does any other parser or
// constants.js seed line). Same dead-fallback shape as #194's own tQSRSoftProj retirement:
// `_t?.tMayProj` can only ever evaluate to `undefined`, so the `||0`/`||null` at the end of
// each chain was already doing 100% of the work that branch pretended to do.
//
// Retired both `|| tMayProj` branches. This test proves the removal changed nothing observable
// (the field was never reachable) by setting tMayProj on a real store's DEFAULT_TARGETS entry
// with NO tJuneProj/tOperatorProj set, and confirming projSales still resolves to null/0 exactly
// as it did before this field existed in the chain at all -- a tMayProj value, however large,
// can never surface.
import { describe, it, expect } from 'vitest';
import { computeMorningBrief } from '../features/morning-brief.js';
import { DEFAULT_TARGETS, STORE_NAMES } from '../constants.js';

describe('tMayProj retired from morning-brief.js projSales fallback (GH #194)', () => {
  it('a store with ONLY tMayProj set (no tJuneProj/tOperatorProj) resolves projSales to null, not the tMayProj value', () => {
    const loc = Object.keys(STORE_NAMES)[0];
    const before = { ...DEFAULT_TARGETS[loc] };
    delete DEFAULT_TARGETS[loc].tJuneProj;
    delete DEFAULT_TARGETS[loc].tOperatorProj;
    DEFAULT_TARGETS[loc].tMayProj = 300000; // a large, unmistakable monthly figure

    try {
      const brief = computeMorningBrief({}, new Date('2026-10-20'), {});
      const store = brief.stores.find(s => s.loc === loc);
      expect(store).toBeTruthy();
      // Was never reachable before this fix either -- confirms the removal is a no-op, not a
      // behavior change.
      expect(store.projSales).toBeNull();
    } finally {
      // DEFAULT_TARGETS is the real shared module singleton -- restore it exactly.
      delete DEFAULT_TARGETS[loc].tMayProj;
      Object.assign(DEFAULT_TARGETS[loc], before);
    }
  });

  it('tJuneProj/tOperatorProj still resolve projSales normally -- the fix only dropped the dead third fallback', () => {
    const loc = Object.keys(STORE_NAMES)[1];
    const before = { ...DEFAULT_TARGETS[loc] };
    DEFAULT_TARGETS[loc].tJuneProj = 300000;
    DEFAULT_TARGETS[loc].tOperatorProj = 300000;

    try {
      const brief = computeMorningBrief({}, new Date('2026-10-20'), {});
      const store = brief.stores.find(s => s.loc === loc);
      expect(store.projSales).toBe(Math.round(300000 / 30));
    } finally {
      Object.assign(DEFAULT_TARGETS[loc], before);
    }
  });
});
