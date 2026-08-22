// @vitest-environment happy-dom
// @ts-nocheck
// Post-triage sweep (dispatch #72's widened no-undef guard, applied while sequencing the
// original 25-site list) -- StoreDash's auto-calibration effect (src/views/store-analytics.js
// ~1802) called `saveSettings(next)` to persist an improved Dialed-In calibration result.
// `saveSettings` was never a prop or a local of this component -- App.js's own saveSettings
// useCallback never crossed the h(StoreDash,{...}) boundary at App.js:2772, unlike
// DialedInPanel's identical onUpdateSettings:saveSettings wiring a few hundred lines away in
// the same file. Deep short-circuit (dialedInEnabled + first-run-or-10-new-rows + an actually
// improved MAPE), and the resulting rejected promise was swallowed by .catch(()=>{}) --
// silent, no console trace.
//
// Per the standing "would this verification still pass if reverted" rule (dispatch16, #366):
// a static no-undef check alone can't tell "the prop is threaded end-to-end" from "the prop
// exists in one file but the call site forgot to pass it" -- reverting only the App.js half
// (dropping onUpdateSettings:saveSettings from the h(StoreDash,{...}) call) would leave
// `onUpdateSettings` a valid-but-undefined optional prop, invisible to no-undef, and the save
// would still silently never happen. So this renders the ACTUAL StoreDash consumer, mocks
// calibrateStore to return an improved result deterministically, and asserts the onUpdateSettings
// callback prop is actually invoked with the calibrated settings -- not just that nothing throws.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

vi.mock('../engine/backtest.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, calibrateStore: vi.fn().mockResolvedValue({ mape: 3.2 }) };
});
vi.mock('../engine/forecast.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    // Synchronously invoke the "done" callback with an empty range so the calibration branch
    // below it runs on the same tick, without needing real forecast data.
    forecastRangeAsync: (loc, s, e, ds, settings, onPartial, onFinal) => { onFinal([]); },
  };
});

import { StoreDash } from '../views/store-analytics.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function mkStore() {
  return {
    loc: '99999', // not in STORE_COORDS -- fetchForecastWeather no-ops instead of hitting the network
    name: 'Test Store',
    p: { laborPct: 0.28, oepe: 175, tpph: 92, _cov: {} },
    t: { tOepe: 180, tTpph: 90, tCrewLabor: 0.30 },
    opsScore: 78, ctrlScore: 82, findings: [],
  };
}

describe('StoreDash auto-calibration persists via onUpdateSettings (dispatch #72 extra finding)', () => {
  let container, root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('calls onUpdateSettings with the improved dialedIn calibration for the store', async () => {
    const store = mkStore();
    const ds = { loaded: true, laborRows: [] };
    const settings = { dialedInEnabled: true }; // no existing dialedIn -- first run, _shouldRun=true
    const onUpdateSettings = vi.fn();
    const dateRange = { s: new Date(Date.now() + 7 * 864e5), e: new Date(Date.now() + 14 * 864e5) }; // future -- skips fetchHistoricalWeather

    await act(async () => {
      root.render(React.createElement(StoreDash, {
        store, ds, settings, allStores: [store], onBack: () => {}, onNav: () => {},
        dateRange, userEvents: {}, onUpdateSettings,
      }));
      // Let the effect's forecastRangeAsync -> calibrateStore -> .then() chain settle.
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });

    expect(onUpdateSettings).toHaveBeenCalledTimes(1);
    const next = onUpdateSettings.mock.calls[0][0];
    expect(next.dialedIn['99999']).toEqual({ mape: 3.2 });
  });
});
