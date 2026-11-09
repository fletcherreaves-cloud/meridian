// @ts-nocheck
// Owner directive (2026-11-09): "before I generate monthly projections, can we populate the
// start-up, ramp-up data for 44689 so they get an actual forecast?" — the real, comparable-store-
// modeled ramp data was already sitting in new_store_launch_plan (memory/project-new-store-
// launch-planner.md), but forecastDay() had no idea the table existed: every model path (ae/
// ewma/simple/dow/di) keys off ds.laborRows/_locLaborRows for the store, which is empty for a
// store that hasn't opened yet, so every one of them returned 0. This tests the new launch-plan
// short-circuit in forecastDay() (src/engine/forecast.js) that fixes that.
import { describe, it, expect } from 'vitest';
import { forecastDay } from '../engine/forecast.js';

const NEW_LOC = '44689';
const OLD_LOC = '3708'; // a store with real, trailing history

function dKey(d) {
  return (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);
}

// A brand-new store: zero rows in laborRows at all (matches the real 44689 state pre-opening —
// qsr_daily_activity has 0 rows for it as of this dispatch).
function buildNewStoreDs({ launchPlanByLoc = {} } = {}) {
  return {
    laborRows: [], laborIdx: {}, laborByLoc: {},
    opsRows: [], ctrlRows: [], weatherRows: [],
    darRows: [], pmixData: {}, records: {},
    targets: {}, lastActual: {}, loaded: true,
    storeIds: [NEW_LOC],
    launchPlanByLoc,
  };
}

// A store WITH real trailing history (mirrors forecast.test.js's own buildDs fixture shape) —
// used to prove a launch-plan entry never overrides a store that has real data to forecast from.
function buildEstablishedStoreDs(loc, launchPlanByLoc) {
  const laborRows = [];
  for (let i = 400; i >= 1; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(12, 0, 0, 0);
    laborRows.push({ loc, date: d, sales: 10000, gc: 1000, laborPct: 0.28 });
  }
  const laborIdx = {};
  for (const r of laborRows) {
    const k = r.loc + '_' + dKey(r.date);
    (laborIdx[k] || (laborIdx[k] = [])).push(r);
  }
  return {
    laborRows, laborIdx, laborByLoc: { [loc]: laborRows },
    opsRows: [], ctrlRows: [], weatherRows: [],
    darRows: [], pmixData: {}, records: {},
    targets: {}, lastActual: { [loc]: laborRows[laborRows.length - 1].date }, loaded: true,
    storeIds: [loc],
    launchPlanByLoc,
  };
}

const BASE_SETTINGS = {
  mode: 'Forecast',
  trendWeights: { t2: 0.5, t4: 0.3, t6: 0.2 },
  dialedInEnabled: false,
  dialedIn: {},
  dialedInSkipped: [],
  _userEvents: {},
};

function futureDate(daysAhead) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(12, 0, 0, 0);
  return d;
}

describe('forecastDay — new store launch plan short-circuit', () => {
  it('uses the launch plan projected_sales when a new store has a plan row and no real history', () => {
    const target = futureDate(5);
    const ds = buildNewStoreDs({
      launchPlanByLoc: { [NEW_LOC]: { [dKey(target)]: { effective: 7418.17, projectedSales: 7418.17, overrideSales: null, source: 'ramp' } } },
    });
    const r = forecastDay(NEW_LOC, target, ds, BASE_SETTINGS);
    expect(r.forecast).toBe(7418);
    expect(r.modelUsed).toBe('launch-plan');
  });

  it('override_sales wins over projected_sales, matching the Launch Planner UI\'s own Effective $ convention', () => {
    const target = futureDate(6);
    const ds = buildNewStoreDs({
      launchPlanByLoc: { [NEW_LOC]: { [dKey(target)]: { effective: 9000, projectedSales: 6501.79, overrideSales: 9000, source: 'manual' } } },
    });
    const r = forecastDay(NEW_LOC, target, ds, BASE_SETTINGS);
    expect(r.forecast).toBe(9000);
  });

  it('goal equals forecast, not _goalOf(lyRaw) — there is no real prior year for a new store', () => {
    const target = futureDate(7);
    const ds = buildNewStoreDs({
      launchPlanByLoc: { [NEW_LOC]: { [dKey(target)]: { effective: 12144.86, projectedSales: 12144.86, overrideSales: null, source: 'ramp' } } },
    });
    const r = forecastDay(NEW_LOC, target, ds, BASE_SETTINGS);
    expect(r.goal).toBe(r.forecast);
    expect(r.goal).toBe(12145);
  });

  it('a store with no launchPlanByLoc entry at all is completely unaffected — regression guard for every real store', () => {
    const target = futureDate(5);
    const ds = buildNewStoreDs({ launchPlanByLoc: {} });
    const r = forecastDay(NEW_LOC, target, ds, BASE_SETTINGS);
    expect(r.modelUsed).not.toBe('launch-plan');
    expect(r.forecast).toBe(0);
  });

  it('a launch-plan entry for a DIFFERENT date than the one being forecast does not fire', () => {
    const target = futureDate(5);
    const otherDate = futureDate(50);
    const ds = buildNewStoreDs({
      launchPlanByLoc: { [NEW_LOC]: { [dKey(otherDate)]: { effective: 7000, projectedSales: 7000, overrideSales: null, source: 'ramp' } } },
    });
    const r = forecastDay(NEW_LOC, target, ds, BASE_SETTINGS);
    expect(r.modelUsed).not.toBe('launch-plan');
  });

  it('a store with REAL trailing history is never short-circuited by a launch-plan row, even if one exists for the same date', () => {
    const target = futureDate(5);
    const launchPlanByLoc = { [OLD_LOC]: { [dKey(target)]: { effective: 99999, projectedSales: 99999, overrideSales: null, source: 'ramp' } } };
    const ds = buildEstablishedStoreDs(OLD_LOC, launchPlanByLoc);
    const r = forecastDay(OLD_LOC, target, ds, BASE_SETTINGS);
    expect(r.modelUsed).not.toBe('launch-plan');
    expect(r.forecast).not.toBe(99999);
  });

  it('a past date inside the plan window shows a real actual against the plan, once the store has opened', () => {
    const past = new Date();
    past.setDate(past.getDate() - 2);
    past.setHours(12, 0, 0, 0);
    const ds = buildNewStoreDs({
      launchPlanByLoc: { [NEW_LOC]: { [dKey(past)]: { effective: 7000, projectedSales: 7000, overrideSales: null, source: 'ramp' } } },
    });
    // _qsrActIdx(ds) reads ds.qsrActSummaryRows / similar — not populated in this minimal
    // fixture, so actual falls back to 0 via fetchRow's own guard. This confirms the branch
    // doesn't crash reaching for a real actual on a past date, not that one is fabricated.
    const r = forecastDay(NEW_LOC, past, ds, BASE_SETTINGS);
    expect(r.isFuture).toBe(false);
    expect(r.modelUsed).toBe('launch-plan');
  });
});
