// @vitest-environment happy-dom
// @ts-nocheck
// GH #167 asked whether Projections had its own target-resolution path with the same shape of
// bug #153 found in buildStore (reading a raw ds.* field instead of the merged settings.targets
// chain). Traced forecastDay's target param end to end: the ONLY field it reads off `tgt` is
// t.tGrowth (used to extrapolate this year's forecast from last year's actual). Three call
// sites in features/projections.js (computeWeek, the _fcstCache builder, and _cachedForecast's
// fallback) all built that target from `ds.targets[loc]||DEFAULT_TARGETS[loc]` — the exact
// #153 defect-1 pattern. ds.targets is {} on every cloud-load path (only an in-session
// OpsTargets.xlsx upload fills it), so a Targets-panel or v2 monthly override to a store's
// growth rate was silently ignored by every Projections forecast, falling through to the
// static DEFAULT_TARGETS value. Fixed by extracting one shared projectionTarget(loc, ds,
// settings) helper (matching the already-correct pattern PreForecastBrief used two components
// above) and routing all three call sites through it.
import { describe, it, expect } from 'vitest';
import { projectionTarget } from '../features/projections.js';
import { DEFAULT_TARGETS } from '../constants.js';

const LOC = Object.keys(DEFAULT_TARGETS)[0];

describe('projectionTarget (GH #167 — merge-chain sourcing for forecastDay\'s tGrowth read)', () => {
  it('prefers settings.targets[loc] (mergedTargets) over DEFAULT_TARGETS when a growth-rate override exists', () => {
    const settings = { targets: { [LOC]: { tGrowth: 0.5 } } };
    const t = projectionTarget(LOC, {}, settings);
    expect(t.tGrowth).toBe(0.5);
    expect(DEFAULT_TARGETS[LOC].tGrowth).not.toBe(0.5); // sanity: the constant really differs
  });

  it('falls back to ds.targets when settings.targets has no entry for this store', () => {
    const ds = { targets: { [LOC]: { tGrowth: 0.33 } } };
    expect(projectionTarget(LOC, ds, {})).toEqual({ tGrowth: 0.33 });
    expect(projectionTarget(LOC, ds, { targets: {} })).toEqual({ tGrowth: 0.33 });
  });

  it('falls back to DEFAULT_TARGETS when neither settings.targets nor ds.targets has an entry', () => {
    expect(projectionTarget(LOC, {}, {})).toEqual(DEFAULT_TARGETS[LOC]);
    expect(projectionTarget(LOC, { targets: {} }, { targets: {} })).toEqual(DEFAULT_TARGETS[LOC]);
    expect(projectionTarget(LOC, null, null)).toEqual(DEFAULT_TARGETS[LOC]);
  });

  it('settings.targets wins even when ds.targets ALSO has an entry — the exact #153 defect-1 precedence', () => {
    const ds = { targets: { [LOC]: { tGrowth: 0.11 } } };
    const settings = { targets: { [LOC]: { tGrowth: 0.44 } } };
    expect(projectionTarget(LOC, ds, settings).tGrowth).toBe(0.44);
  });
});
