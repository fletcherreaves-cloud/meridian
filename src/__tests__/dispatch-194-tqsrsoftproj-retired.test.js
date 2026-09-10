// @ts-nocheck
// GH #194 (follow-up to #176) flagged four fields riding applyProjectionsToTargets's runtime
// mutation of the shared DEFAULT_TARGETS constant -- tJuneProj/tOperatorProj/tQSRSoftProj/
// tJuneTpph -- as an unaudited correctness hazard and asked for each to be classified: retire,
// route through a resolver, or stay. Per the issue's own instruction ("run the search at the
// scope you are quoting for... audit every hit and classify it"), a repo-wide grep for each
// field found tJuneProj/tOperatorProj/tJuneTpph all have live readers (morning-brief.js) and are
// left untouched -- but tQSRSoftProj has ZERO readers anywhere, confirming the issue's own guess
// ("the cheapest to confirm and probably the first to retire"). This test asserts the runtime
// write is gone -- a store's tQSRSoftProj is never mutated by applying a projections upload --
// while the other three fields, and the raw r.qsr value itself (still in ds.projRows via
// pipeline.js, unaffected), are untouched.
import { describe, it, expect } from 'vitest';
import { applyProjectionsToTargets } from '../parsers/index.js';
import { DEFAULT_TARGETS } from '../constants.js';

describe('applyProjectionsToTargets no longer mutates tQSRSoftProj (GH #194)', () => {
  it('a projections upload updates tJuneProj/tOperatorProj/tJuneTpph but leaves tQSRSoftProj untouched', () => {
    const loc = Object.keys(DEFAULT_TARGETS)[0];
    const before = { ...DEFAULT_TARGETS[loc] };
    const sentinelQSR = before.tQSRSoftProj; // whatever the static constants.js seed has

    const applied = applyProjectionsToTargets([{ loc, proj: 999999, qsr: 555555, labor: 0.25, tpph: 7.7 }], 'test.xlsx');

    expect(applied).toBe(1);
    expect(DEFAULT_TARGETS[loc].tJuneProj).toBe(999999);
    expect(DEFAULT_TARGETS[loc].tOperatorProj).toBe(999999);
    expect(DEFAULT_TARGETS[loc].tJuneTpph).toBe(7.7);
    // The bug this closes: r.qsr (555555) must NOT land on tQSRSoftProj -- the field stays
    // exactly what the static seed already had, not the just-uploaded value.
    expect(DEFAULT_TARGETS[loc].tQSRSoftProj).toBe(sentinelQSR);
    expect(DEFAULT_TARGETS[loc].tQSRSoftProj).not.toBe(555555);

    // Restore -- this function mutates the real shared DEFAULT_TARGETS module singleton.
    Object.assign(DEFAULT_TARGETS[loc], before);
  });

  it('a zero/absent proj or tpph leaves the corresponding fields alone, same as before this fix', () => {
    const loc = Object.keys(DEFAULT_TARGETS)[1];
    const before = { ...DEFAULT_TARGETS[loc] };

    applyProjectionsToTargets([{ loc, proj: 0, qsr: 0, labor: 0, tpph: 0 }], 'test.xlsx');
    expect(DEFAULT_TARGETS[loc].tJuneProj).toBe(before.tJuneProj);
    expect(DEFAULT_TARGETS[loc].tOperatorProj).toBe(before.tOperatorProj);
    expect(DEFAULT_TARGETS[loc].tJuneTpph).toBe(before.tJuneTpph);
    expect(DEFAULT_TARGETS[loc].tQSRSoftProj).toBe(before.tQSRSoftProj);

    Object.assign(DEFAULT_TARGETS[loc], before);
  });
});
