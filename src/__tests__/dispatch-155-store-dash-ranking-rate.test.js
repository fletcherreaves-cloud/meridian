// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #155 — renders the actual RankingTab panel (not just the engine). DR_PRESETS
// includes a preset literally called 'today' ({s:d,e:d}, d=new Date()), a real, user-reachable
// single-DAY selection — every other preset ends on addDR(new Date(),-1) (yesterday), so 'today'
// is the only one that can include the current, still-open business day.
//
// Because 'today' is always exactly ONE day, metricAvg (mean of 1 value) and metricSumRatio
// (Σ/Σ of 1 day's own raw legs) can never diverge on MAGNITUDE from blending multiple days —
// there's nothing to blend. The real, revert-detecting difference for a single-day range is
// mechanical: metricSumRatio always recomputes from the metric's declared raw
// numerator/denominator legs, while metricAvg (via metricSeries) prefers a PRECOMPUTED field
// when the source row carries one. This fixture gives the 'today' row both — a precomputed tpph
// field that disagrees with its own raw gc/actHrs legs (the exact shape a stale or
// inconsistently-written precomputed column could produce) — so a revert to metricAvg here would
// make this test fail by showing the stale precomputed figure instead of the recomputed one.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { RankingTab } from '../views/store-dash.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const NOOP = () => {};

function mkStore(loc, name) {
  return {
    loc, name, city: 'Test City',
    p: { laborPct: 0.28, oepe: 175, tpph: 92, r2p: 100, _cov: {} },
    t: { tOepe: 180, tTpph: 90, tCrewLabor: 0.30 },
    opsScore: 78, ctrlScore: 82, vel: null,
    pSales: 52000, pLY: 49500,
    findings: [], gm: null, hasRecords: false,
  };
}

describe("RankingTab TPPH uses the Σ/Σ rollup for the 'Today' preset, ignoring a stale precomputed field (dispatch #155)", () => {
  let container, root;
  afterEach(() => { act(() => { root?.unmount(); }); container?.remove(); });

  it("selecting 'Today' shows the recomputed Σgc/Σhrs figure, not the stale precomputed tpph field", () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const today = new Date();
    const ds = {
      qsrActSummaryRows: [
        // A stale/inconsistent precomputed tpph (20.00) alongside raw legs implying 15 —
        // metricAvg (via metricSeries' srcs-first lookup) would report the stale 20; metricRate
        // (metricSumRatio, always from raw legs for a `kind:'ratio'` metric) reports 15.
        { loc: '10422', date: today, tpph: 20, gc: 15, actHrs: 1 },
      ],
    };
    act(() => {
      root.render(React.createElement(RankingTab, {
        stores: [mkStore('10422', 'Test Store')], ds, settings: {}, dateRange: { s: today, e: today },
        onDateChange: NOOP, defaultMetric: 'tpph', onSelectStore: NOOP,
      }));
    });

    const todayBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Today');
    expect(todayBtn).toBeTruthy();
    act(() => { todayBtn.click(); });

    expect(container.textContent).toContain('15.00');
    expect(container.textContent).not.toContain('20.00');
  });
});
