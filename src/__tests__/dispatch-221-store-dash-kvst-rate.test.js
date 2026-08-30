// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #221 — renders the actual RankingTab panel (not just the engine), same method dispatch
// #155 used for TPPH (dispatch-155-store-dash-ranking-rate.test.js). DR_PRESETS includes a preset
// literally called 'today' ({s:d,e:d}, d=new Date()), a real, user-reachable single-DAY selection.
//
// Because 'today' is always exactly ONE day, metricAvg (mean of 1 value) and metricSumRatio (Σ/Σ
// of that 1 day's own raw legs) can never diverge on MAGNITUDE from blending multiple days —
// there's nothing to blend. The real, revert-detecting difference for a single-day range is
// mechanical: metricSumRatio always recomputes from the metric's declared raw numerator/
// denominator legs, while metricAvg (via metricSeries) prefers a PRECOMPUTED field when the
// source row carries one. This fixture gives the 'today' row both — a precomputed kvst field
// that disagrees with its own raw _mfyTime/_mfyCnt legs (the exact shape a stale or
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
    p: { laborPct: 0.28, oepe: 175, tpph: 92, r2p: 100, kvst: 80, _cov: {} },
    t: { tOepe: 180, tTpph: 90, tCrewLabor: 0.30, tKvst: 90 },
    opsScore: 78, ctrlScore: 82, vel: null,
    pSales: 52000, pLY: 49500,
    findings: [], gm: null, hasRecords: false,
  };
}

describe("RankingTab KVS Time uses the Σ/Σ rollup for the 'Today' preset, ignoring a stale precomputed field (dispatch #221)", () => {
  let container, root;
  afterEach(() => { act(() => { root?.unmount(); }); container?.remove(); });

  it("selecting 'Today' shows the recomputed Σ_mfyTime/Σ_mfyCnt figure, not the stale precomputed kvst field", () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const today = new Date();
    const ds = {
      qsrActSummaryRows: [
        // A stale/inconsistent precomputed kvst (80s) alongside raw legs implying 45s —
        // metricAvg (via metricSeries' srcs-first lookup) would report the stale 80; metricRate
        // (metricSumRatio, always from raw legs for a `kind:'ratio'` metric) reports 45.
        { loc: '10422', date: today, kvst: 80, _mfyTime: 45000, _mfyCnt: 1 },
      ],
    };
    act(() => {
      root.render(React.createElement(RankingTab, {
        stores: [mkStore('10422', 'Test Store')], ds, settings: {}, dateRange: { s: today, e: today },
        onDateChange: NOOP, defaultMetric: 'kvst', onSelectStore: NOOP,
      }));
    });

    const todayBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Today');
    expect(todayBtn).toBeTruthy();
    act(() => { todayBtn.click(); });

    // kvst's RankingTab fmt is Math.round(v)+'s' (integer seconds), not tpph's 2-decimal fmt.
    expect(container.textContent).toContain('45s');
    expect(container.textContent).not.toContain('80s');
  });
});
