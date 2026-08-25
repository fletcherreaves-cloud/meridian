// @ts-nocheck
// Dispatch #41 step 4 — a red Model Health grade gets a real consequence: the store's DISPLAYED
// default projection switches to the Simple/trailing model instead of whatever engineered model
// triggered the red grade. Exercises the actual consumer store-analytics.js's StoreDash calls
// (forecastRangeAsync — and its sync sibling forecastRange, kept consistent) directly, not just
// modelHealthScore/forecastDay in isolation, so a future revert of the forceModel wiring inside
// forecastRange(Async) would fail this test even if modelHealthScore itself stayed correct.
import { describe, it, expect } from 'vitest';
import { forecastRange, forecastRangeAsync, modelHealthScore } from '../engine/forecast.js';
import { DEFAULT_MODEL_ASSIGNMENTS } from '../constants.js';

const LOC = '3708'; // assigned weekly:{model:'ae'} in DEFAULT_MODEL_ASSIGNMENTS — not 'simple'
const DOW_MULT = [0.8, 1.0, 1.0, 1.05, 1.1, 1.3, 1.2];

function makeDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(12, 0, 0, 0);
  return d;
}

function buildLaborRows(loc, days) {
  const rows = [];
  for (let i = days; i >= 1; i--) {
    const d = makeDate(i);
    const dow = d.getDay();
    const sales = Math.round(10000 * DOW_MULT[dow] * (0.95 + Math.random() * 0.1));
    rows.push({ loc, date: d, sales, gc: Math.round(sales / 7), laborPct: 0.28 });
  }
  return rows;
}

function buildDs(loc, days = 500) {
  const laborRows = buildLaborRows(loc, days);
  return {
    loaded: true, laborRows, opsRows: [], ctrlRows: [], weatherRows: [],
    targets: {}, lastActual: { [loc]: makeDate(1) }, storeIds: [loc],
  };
}

// Precondition: '3708' is really assigned 'ae' for weekly horizon, not 'simple' — otherwise this
// test wouldn't be able to tell "forced to simple by the gate" from "was simple anyway".
it('precondition: 3708 is assigned the ae model, not simple, absent the gate', () => {
  expect(DEFAULT_MODEL_ASSIGNMENTS[LOC].weekly.model).toBe('ae');
});

describe('forecastRangeAsync — red Model Health forces the Simple model for display', () => {
  it('a red-graded store gets modelUsed:"simple" instead of its assigned engineered model', async () => {
    const ds = buildDs(LOC);
    const settings = {
      dialedInEnabled: true, dialedInSkipped: [],
      dialedIn: {
        [LOC]: {
          runDate: new Date().toISOString(), // fresh cal, fresh data, high samples — only Accuracy fails
          mape6w: 25, mape4w: 26, mape2w: 27, mape: 30, samples: 500,
          t2: 0.5, t4: 0.3, t6: 0.2,
        },
      },
    };
    // Confirm the store is actually graded red under these settings before trusting the forecast
    // assertion below to mean anything.
    const health = modelHealthScore(LOC, ds, settings);
    expect(health.grade.label).toBe('Needs Attention');

    const end = makeDate(1), start = makeDate(6);
    const results = await new Promise(resolve => {
      forecastRangeAsync(LOC, start, end, ds, settings, null, resolve);
    });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) expect(r.modelUsed).toBe('simple');
  });

  it('a healthy-graded store is NOT forced off its assigned model (no false-positive override)', async () => {
    const ds = buildDs(LOC);
    const settings = {
      dialedInEnabled: true, dialedInSkipped: [],
      dialedIn: {
        [LOC]: {
          runDate: new Date().toISOString(),
          mape6w: 4, mape4w: 4.2, mape2w: 4.1, mape: 4.5, samples: 500,
          t2: 0.5, t4: 0.3, t6: 0.2,
        },
      },
    };
    const health = modelHealthScore(LOC, ds, settings);
    expect(health.grade.label).toBe('Healthy');

    const end = makeDate(1), start = makeDate(6);
    const results = await new Promise(resolve => {
      forecastRangeAsync(LOC, start, end, ds, settings, null, resolve);
    });
    expect(results.length).toBeGreaterThan(0);
    // Assigned model is 'ae' — the AE branch stamps modelUsed:'ae', confirming the gate did not fire.
    for (const r of results) expect(r.modelUsed).toBe('ae');
  });
});

describe('forecastRange (sync sibling) — same red-gate behavior', () => {
  it('forces simple on a red-graded store', () => {
    const ds = buildDs(LOC);
    const settings = {
      dialedInEnabled: true, dialedInSkipped: [],
      dialedIn: { [LOC]: { runDate: new Date().toISOString(), mape6w: 25, mape4w: 26, mape2w: 27, mape: 30, samples: 500, t2: .5, t4: .3, t6: .2 } },
    };
    const results = forecastRange(LOC, makeDate(6), makeDate(1), ds, settings);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) expect(r.modelUsed).toBe('simple');
  });
});
