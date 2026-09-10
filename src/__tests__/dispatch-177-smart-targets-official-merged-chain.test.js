// @ts-nocheck
// GH #177 — every METRICS entry's officialVal() read DEFAULT_TARGETS directly, bypassing the
// merged chain (monthly-approved target, Targets-panel overrides, v2 monthly overrides) that
// App.js's mergedTargets memo already builds and passes down as settings.targets. So the column
// literally labeled "Official" showed the hardcoded constant instead of the actually-approved
// number -- measured 2026-08-11 against real production data: 20 of 27 stores' August approved
// crew_labor_pct differed from constants.js, up to 2.00pp (Ponce de Leon 43701: constant 26.00%,
// approved 24.00%).
//
// Fixed by routing every officialVal through mergedTarget(loc, settings), matching the SAME
// precedence labor-tools.js's own tgt construction already uses:
// `(settings.targets&&settings.targets[loc])||DEFAULT_TARGETS[loc]||{}` -- settings.targets[loc]
// IS App.js's already-fully-merged mergedTargets object (DEFAULT_TARGETS < yearly targets <
// monthly approved < user flat override < v2 monthly override), not a separate override-only
// table, so this reuses the real merge rather than re-deriving one.
import { describe, it, expect } from 'vitest';
import { METRICS, mergedTarget } from '../views/smart-targets.js';
import { DEFAULT_TARGETS } from '../constants.js';

const LOC = '43701'; // Ponce de Leon -- the sharpest real case from the #164/#177 triage

function metric(key) { return METRICS.find(m => m.key === key); }

describe('mergedTarget (pure function)', () => {
  it('prefers settings.targets[loc] over DEFAULT_TARGETS when a monthly-approved override exists', () => {
    const settings = { targets: { [LOC]: { tOepe: 150 } } };
    expect(mergedTarget(LOC, settings).tOepe).toBe(150);
    expect(DEFAULT_TARGETS[LOC].tOepe).not.toBe(150); // sanity: the constant really differs
  });

  it('falls back to DEFAULT_TARGETS when settings.targets has no entry for this store', () => {
    expect(mergedTarget(LOC, { targets: {} })).toEqual(DEFAULT_TARGETS[LOC]);
    expect(mergedTarget(LOC, {})).toEqual(DEFAULT_TARGETS[LOC]);
    expect(mergedTarget(LOC, null)).toEqual(DEFAULT_TARGETS[LOC]);
  });
});

describe('METRICS[*].officialVal resolves through the merged chain, not DEFAULT_TARGETS directly (GH #177)', () => {
  it('laborpct: cites the approved tCrewLabor override (24.00%), not the constant (26.00%) — the issue\'s own Ponce de Leon example', () => {
    const settings = { targets: { [LOC]: { tCrewLabor: 0.24 } } };
    expect(metric('laborpct').officialVal(LOC, settings)).toBeCloseTo(0.24, 6);
    expect(metric('laborpct').officialVal(LOC, {})).toBeCloseTo(DEFAULT_TARGETS[LOC].tCrewLabor, 6); // unchanged when no override
  });

  it('oepe: cites the merged-chain override, not the constant', () => {
    const settings = { targets: { [LOC]: { tOepe: 150 } } };
    expect(metric('oepe').officialVal(LOC, settings)).toBe(150);
    expect(metric('oepe').officialVal(LOC, {})).toBe(DEFAULT_TARGETS[LOC].tOepe);
  });

  it('fob/tpph/r2p/avgcheck/promopct each resolve through the merged chain too — not a labor-only fix', () => {
    const settings = {
      targets: {
        [LOC]: { tFOBTarget: 0.03, tTpph: 6.0, tR2p: 80, tAvgCheck: 15.0, tPromoPct: 0.01 },
      },
    };
    expect(metric('fob').officialVal(LOC, settings)).toBeCloseTo(0.03, 6);
    expect(metric('tpph').officialVal(LOC, settings)).toBeCloseTo(6.0, 6);
    expect(metric('r2p').officialVal(LOC, settings)).toBe(80);
    expect(metric('avgcheck').officialVal(LOC, settings)).toBeCloseTo(15.0, 6);
    expect(metric('promopct').officialVal(LOC, settings)).toBeCloseTo(0.01, 6);
  });

  it('a store with no override at all still resolves DEFAULT_TARGETS values (no-op for well-formed data, matching the constant)', () => {
    for (const key of ['oepe', 'fob', 'tpph', 'r2p', 'avgcheck', 'promopct']) {
      const m = metric(key);
      const field = { oepe: 'tOepe', fob: 'tFOBTarget', tpph: 'tTpph', r2p: 'tR2p', avgcheck: 'tAvgCheck', promopct: 'tPromoPct' }[key];
      expect(m.officialVal(LOC, {})).toBe(DEFAULT_TARGETS[LOC][field]);
    }
  });
});
