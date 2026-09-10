// @ts-nocheck
// tolerance-status.js's tolMergedTarget had zero direct test coverage despite being live: called
// by tolStatusesForStore (same file) and documented as the extracted replacement for
// UnifiedTargetsPanel's former inline target-merge logic.
import { describe, it, expect } from 'vitest';
import { tolMergedTarget } from '../engine/tolerance-status.js';
import { DEFAULT_TARGETS } from '../constants.js';

const LOC = '3708';

describe('tolMergedTarget', () => {
  it('falls back to DEFAULT_TARGETS alone when ds has no targets/monthlyTargets overrides', () => {
    expect(tolMergedTarget(null, LOC)).toEqual(DEFAULT_TARGETS[LOC]);
    expect(tolMergedTarget({}, LOC)).toEqual(DEFAULT_TARGETS[LOC]);
  });

  it('lets ds.targets override the matching DEFAULT_TARGETS fields, keeping the rest', () => {
    const ds = { targets: { [LOC]: { tOepe: 999 } } };
    const merged = tolMergedTarget(ds, LOC);
    expect(merged.tOepe).toBe(999);
    expect(merged.tCrewLabor).toBe(DEFAULT_TARGETS[LOC].tCrewLabor); // untouched field survives
  });

  it('lets ds.monthlyTargets win over BOTH DEFAULT_TARGETS and ds.targets (last spread wins)', () => {
    const ds = { targets: { [LOC]: { tOepe: 999 } }, monthlyTargets: { [LOC]: { tOepe: 111 } } };
    expect(tolMergedTarget(ds, LOC).tOepe).toBe(111);
  });

  it('returns an empty object for a loc with no DEFAULT_TARGETS entry and no overrides', () => {
    expect(tolMergedTarget({}, 'nonexistent-loc')).toEqual({});
  });

  it('still applies overrides for a loc with no DEFAULT_TARGETS entry', () => {
    const ds = { monthlyTargets: { 'nonexistent-loc': { tOepe: 42 } } };
    expect(tolMergedTarget(ds, 'nonexistent-loc')).toEqual({ tOepe: 42 });
  });

  // GH #1221: settings (App.js's mergedTargets, the Targets-panel/v2 top layer) is the
  // LAST-added, optional 3rd param -- must win over ds.targets/ds.monthlyTargets/DEFAULT_TARGETS,
  // and must not break any existing 2-arg caller (settings undefined is a no-op).
  it('settings.targets wins over ds.monthlyTargets, ds.targets, and DEFAULT_TARGETS', () => {
    const ds = { targets: { [LOC]: { tOepe: 999 } }, monthlyTargets: { [LOC]: { tOepe: 111 } } };
    const settings = { targets: { [LOC]: { tOepe: 222 } } };
    expect(tolMergedTarget(ds, LOC, settings).tOepe).toBe(222);
  });

  it('omitting settings (the pre-#1221 2-arg call shape) is unaffected -- still resolves via ds/DEFAULT_TARGETS', () => {
    const ds = { targets: { [LOC]: { tOepe: 999 } } };
    expect(tolMergedTarget(ds, LOC).tOepe).toBe(999);
    expect(tolMergedTarget(ds, LOC, undefined).tOepe).toBe(999);
    expect(tolMergedTarget(ds, LOC, {}).tOepe).toBe(999);
  });
});
