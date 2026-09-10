// @vitest-environment happy-dom
// @ts-nocheck
// GH #1221 -- filed while fixing #167, which found the SAME "ds.targets||DEFAULT_TARGETS"
// pattern (bypasses settings.targets, App.js's already-fully-merged mergedTargets object) in
// several more files beyond features/projections.js. Fixed the confirmed instances here:
//   - views/at-a-glance.js's weekProjections (storeProjs) -- feeds forecastDay's tGrowth
//   - features/smart-targets.js's computeSmartTargets -- feeds every metric's currentTarget
//   - views/analytics.js's runBacktest (PVSA backtest) -- feeds forecastDay's tGrowth
//   - views/analytics.js's runComparison (DI-vs-DOW model comparison) -- feeds forecastDay's tGrowth
//   - views/analytics.js's FOBAnalysisPanel's allTargets -- was missing settings.targets, the
//     Targets-panel/v2 top merge layer (ds.monthlyTargets was already merged in)
// Two more sites (engine/tolerance-status.js's tolMergedTarget, and its call chain through
// tolStatusesForStore/tolStatusesDistrict/ToleranceRollupTile) were investigated and deliberately
// NOT fixed in this pass -- the chain reaches a component (ToleranceRollupTile) that doesn't
// receive a settings prop at all, so fixing it needs a real prop-threading change across 4 call
// sites, not a local one-line fix. Left for its own follow-up.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { DEFAULT_TARGETS } from '../constants.js';
import { computeSmartTargets } from '../features/smart-targets.js';

const LOC = Object.keys(DEFAULT_TARGETS)[0];

describe('computeSmartTargets sources currentTarget through settings.targets (GH #1221)', () => {
  it('prefers a settings.targets override over DEFAULT_TARGETS for the first metric (oepe/tOepe)', () => {
    const ds = { loaded: true, laborRows: [], opsRows: [], ctrlRows: [], fobRows: [], storeIds: [LOC] };
    const settings = { targets: { [LOC]: { tOepe: 999 } } };
    const results = computeSmartTargets(LOC, ds, settings, new Date());
    expect(results.oepe.currentTarget).toBe(999);
    expect(DEFAULT_TARGETS[LOC].tOepe).not.toBe(999); // sanity: the constant really differs
  });

  it('falls back to DEFAULT_TARGETS when settings carries no override', () => {
    const ds = { loaded: true, laborRows: [], opsRows: [], ctrlRows: [], fobRows: [], storeIds: [LOC] };
    const results = computeSmartTargets(LOC, ds, {}, new Date());
    expect(results.oepe.currentTarget).toBe(DEFAULT_TARGETS[LOC].tOepe || null);
  });
});

// forecastDay is the only real consumer of the target object these fixes resolve (it reads
// exactly t.tGrowth, per #167's own investigation) -- spying on it directly proves the RESOLVED
// VALUE actually reaches the engine, not just that the component doesn't crash. A bare
// "doesn't throw" assertion would pass identically against the pre-fix ds.targets||
// DEFAULT_TARGETS code (that code doesn't throw either, it just silently resolves the wrong
// object) and so would not catch a revert -- this repo's own "would this verification still
// pass if reverted" rule.
vi.mock('../engine/forecast.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, forecastDay: vi.fn(actual.forecastDay) };
});

describe('AtAGlance weekProjections resolves targets through settings.targets (GH #1221)', () => {
  let container, root;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.clearAllMocks(); });

  it('calls forecastDay with a tgt object carrying the settings.targets override, not DEFAULT_TARGETS', async () => {
    const { AtAGlance } = await import('../views/at-a-glance.js');
    const { forecastDay } = await import('../engine/forecast.js');
    const ds = { loaded: true, laborRows: [], qsrActSummaryRows: [], forecastWeekCache: [] };
    const settings = { targets: { [LOC]: { tGrowth: 0.5 } } };
    const stores = [{ loc: LOC }];
    const dateRange = { s: new Date('2026-08-01'), e: new Date('2026-08-31') };
    act(() => {
      root.render(React.createElement(AtAGlance, {
        stores, ds, settings, userEvents: [], lockedProjections: [], dateRange,
        onOpenStore: () => {}, onCoachingSaved: () => {}, onOpenProjections: () => {},
        onOpenPVSA: () => {}, onOpenBrief: () => {}, onNav: () => {}, onOpenModal: () => {},
      }));
    });
    expect(forecastDay).toHaveBeenCalled();
    const callForLoc = forecastDay.mock.calls.find(args => args[0] === LOC);
    expect(callForLoc, `forecastDay must be called for ${LOC}`).toBeTruthy();
    const tgt = callForLoc[5]; // forecastDay(loc, date, ds, settings, casc, tgt, horizon)
    expect(tgt.tGrowth).toBe(0.5);
    expect(DEFAULT_TARGETS[LOC].tGrowth).not.toBe(0.5); // sanity: the constant really differs
  });
});

describe('FOBAnalysisPanel renders with a settings.targets override present (GH #1221, smoke test)', () => {
  // allTargets doesn't call forecastDay or expose its resolved value to the DOM in an easily
  // assertable way with an empty-data fixture -- this is a lighter smoke test than the two
  // above, appropriate to the change's own risk (appending one more spread key to an object
  // literal, no logic change). The full test suite's existing FOBAnalysisPanel coverage plus
  // this smoke test together confirm the settings prop threads through without breaking render.
  let container, root;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it('renders without throwing with a settings.targets override present', async () => {
    const { FOBAnalysisPanel } = await import('../views/analytics.js');
    const ds = { loaded: true, fobRows: [], qsrFobRows: null };
    const settings = { targets: { [LOC]: { tFOBTarget: 0.01 } } };
    const stores = [{ loc: LOC }];
    expect(() => {
      act(() => {
        root.render(React.createElement(FOBAnalysisPanel, { stores, ds, settings, onClose: () => {} }));
      });
    }).not.toThrow();
  });
});
