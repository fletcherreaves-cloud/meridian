// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #41 — reconcile modelHealthScore/computeModelHealth into one canonical implementation.
//
// Per this repo's own #366 lesson ("a test that only imports the engine can't tell 'fixed' from
// 'fixed but never wired in'"), this file renders the ACTUAL CONSUMERS — AtAGlance (checklist +
// district tally) and ModelHealthBadge (computeModelHealth's only remaining caller) — the same
// happy-dom createRoot/act pattern established in at-a-glance-checklist-freshness.test.js. A
// direct function comparison (both scorers' raw output side by side) was step 1's MEASUREMENT
// tool only, run once against a throwaway fixture harness before any code changed, logged and
// discarded — it doesn't belong here because it can't catch a future revert of either panel's
// wiring to modelHealthScore/computeModelHealth.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { AtAGlance } from '../views/at-a-glance.js';
import { ModelHealthBadge } from '../views/model-health-badge.js';
import { modelHealthScore, computeModelHealth } from '../engine/forecast.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LOC = '3708'; // Ardmore-Broadway — not a recentOnly store, real DEFAULT_TARGETS entry
const DOW_MULT = [0.8, 1.0, 1.0, 1.05, 1.1, 1.3, 1.2]; // Sun-Sat

function makeDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(12, 0, 0, 0);
  return d;
}

// A store with a "passing" 75-point weighted total by the OLD math on every consumer's own
// score>=75 threshold — Calibration/Freshness/Sample all maxed — but Accuracy genuinely 0/25
// (25-30% MAPE, more than double the "needs work" 18% cutoff). This is scenario F from the
// dispatch's step-1 measurement: BOTH pre-fix functions graded this green (modelHealthScore
// 75/Healthy, computeModelHealth 80/Trusted) because three healthy components diluted one
// real failure — the exact floor-masking bug the weakest-link gate exists to close.
function buildMaskingDs(loc = LOC) {
  const laborRows = [];
  for (let i = 500; i >= 1; i--) {
    const d = makeDate(i);
    const dow = d.getDay();
    const sales = Math.round(10000 * DOW_MULT[dow] * (0.95 + Math.random() * 0.1));
    laborRows.push({ loc, date: d, sales, gc: Math.round(sales / 7), laborPct: 0.28 });
  }
  return {
    loaded: true, laborRows, opsRows: [], ctrlRows: [], weatherRows: [],
    targets: {}, lastActual: { [loc]: makeDate(1) }, storeIds: [loc],
  };
}

function maskingSettings(loc = LOC) {
  return {
    weekStartDay: 3,
    dialedInEnabled: true,
    dialedInSkipped: [],
    dialedIn: {
      [loc]: {
        runDate: new Date().toISOString(), // fresh calibration -> Calibration 30/30
        mape6w: 25, mape4w: 26, mape2w: 27, mape: 30, // catastrophic -> Accuracy true 0/25
        samples: 500, // -> Sample Size 20/20
        t2: 0.5, t4: 0.3, t6: 0.2,
      },
    },
  };
}

// A store that has never run Dialed-In at all — Calibration AND Accuracy both true-zero by
// definition (di doesn't exist), so both the raw weighted math and the "never calibrated" gate
// condition agree it must render red. Included because it's the dispatch's own illustrative
// weakest-link example, exercised end-to-end through the same render path as the masking case.
function buildNeverCalibratedDs(loc = LOC) {
  const laborRows = [];
  for (let i = 500; i >= 1; i--) {
    const d = makeDate(i);
    const dow = d.getDay();
    const sales = Math.round(10000 * DOW_MULT[dow] * (0.95 + Math.random() * 0.1));
    laborRows.push({ loc, date: d, sales, gc: Math.round(sales / 7), laborPct: 0.28 });
  }
  return {
    loaded: true, laborRows, opsRows: [], ctrlRows: [], weatherRows: [],
    targets: {}, lastActual: { [loc]: makeDate(1) }, storeIds: [loc],
  };
}
const neverCalibratedSettings = { weekStartDay: 3, dialedInEnabled: true, dialedInSkipped: [], dialedIn: {} };

const NOOP = () => {};
function atAGlanceProps(ds, settings) {
  const day = n => new Date(2026, 7, n, 12);
  return {
    stores: [{ loc: LOC }],
    settings,
    ds,
    userEvents: [],
    lockedProjections: {},
    dateRange: { s: day(1), e: day(16), label: 'MTD' },
    onOpenStore: NOOP, onCoachingSaved: NOOP, onOpenProjections: NOOP,
    onOpenPVSA: NOOP, onOpenBrief: NOOP, onNav: NOOP, onOpenModal: NOOP,
  };
}

describe('dispatch #41 — canonical Model Health reconciliation, rendered end-to-end', () => {
  let container, root;
  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('AtAGlance: a store with a masked-catastrophic Accuracy component shows as red, not green, in the checklist and district tally', async () => {
    const ds = buildMaskingDs();
    const settings = maskingSettings();

    // Sanity-check the engine result this render depends on, so a failure here points straight
    // at the gate rather than the render plumbing.
    const canon = modelHealthScore(LOC, ds, settings);
    expect(canon.grade.label).toBe('Needs Attention');
    expect(canon.score).toBeLessThan(50);

    await act(async () => {
      root.render(React.createElement(AtAGlance, atAGlanceProps(ds, settings)));
    });

    // at-a-glance.js's own checklist item (`redStores`, `s<50`) and district tally (`hlth.red`)
    // both bucket by modelHealthScore(...).score directly, not `.grade` — so this only renders
    // red end-to-end if the gate clamps the NUMBER, not just the label. This is exactly the case
    // #366 warns about: an engine-only test can't tell "fixed" from "fixed but the number the
    // panel actually reads never moved."
    expect(container.textContent).toMatch(/1 store at red model health/);
  });

  it('AtAGlance: a never-calibrated store also renders red end-to-end', async () => {
    const ds = buildNeverCalibratedDs();
    const settings = neverCalibratedSettings;

    const canon = modelHealthScore(LOC, ds, settings);
    expect(canon.grade.label).toBe('Needs Attention');

    await act(async () => {
      root.render(React.createElement(AtAGlance, atAGlanceProps(ds, settings)));
    });
    expect(container.textContent).toMatch(/1 store at red model health/);
  });

  it('ModelHealthBadge (computeModelHealth\'s only remaining consumer): displayed total/grade match the canonical function exactly, including the gate', async () => {
    const ds = buildMaskingDs();
    const settings = maskingSettings();

    const canon = modelHealthScore(LOC, ds, settings);
    const adapted = computeModelHealth(LOC, settings, ds); // note the swapped arg order — real call signature

    // The adapter's own contract: same total, same grade family, gated the same way.
    expect(adapted.total).toBe(canon.score);
    expect(adapted.grade).toBe('red');
    expect(adapted.gradeLabel).toBe('Needs Attention');

    await act(async () => {
      root.render(React.createElement(ModelHealthBadge, { loc: LOC, settings, ds, showDetail: true }));
    });

    // The pill renders `{total}` + ' ' + `{gradeLabel}` — assert the ACTUAL DOM text, not just
    // the object computeModelHealth returned, so a future change that stops passing `health.total`
    // /`health.gradeLabel` into the pill (while computeModelHealth itself stays correct) would fail
    // this test the way #366's engine-only test could not.
    expect(container.textContent).toContain(String(canon.score));
    expect(container.textContent).toContain('Needs Attention');
  });

  it('ModelHealthBadge: a healthy store still renders green/Trusted (no false positive from the gate)', async () => {
    const laborRows = [];
    for (let i = 500; i >= 1; i--) {
      const d = makeDate(i);
      const dow = d.getDay();
      const sales = Math.round(10000 * DOW_MULT[dow] * (0.95 + Math.random() * 0.1));
      laborRows.push({ loc: LOC, date: d, sales, gc: Math.round(sales / 7), laborPct: 0.28 });
    }
    const ds = { loaded: true, laborRows, opsRows: [], ctrlRows: [], weatherRows: [], targets: {}, lastActual: { [LOC]: makeDate(1) }, storeIds: [LOC] };
    const settings = {
      weekStartDay: 3, dialedInEnabled: true, dialedInSkipped: [],
      dialedIn: { [LOC]: { runDate: new Date().toISOString(), mape6w: 4, mape4w: 4.2, mape2w: 4.1, mape: 4.5, samples: 500, t2: .5, t4: .3, t6: .2 } },
    };
    const canon = modelHealthScore(LOC, ds, settings);
    expect(canon.grade.label).toBe('Healthy');

    await act(async () => {
      root.render(React.createElement(ModelHealthBadge, { loc: LOC, settings, ds, showDetail: true }));
    });
    expect(container.textContent).toContain('Trusted');
    expect(container.textContent).not.toMatch(/Needs Attention/);
  });
});
