// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #134 — Schedule Retention report: computeStoreWeeks() reconciliation + the pure
// narrative/aggregation logic behind ScheduleRetentionSection, PLUS a real call-site render test
// (same standing rule security-panel.test.js/crew-schedule-panel.test.js cite, from #366 — a
// test that only imports the engine can't tell "built" from "built but never wired in"). Per
// the dispatch's verification bar: numbers must reconcile EXACTLY (not approximately) against
// what the existing all-stores Schedule Summary panel computes for the same store/week, and the
// smart-analysis text must change when the underlying weekly figures change (not a fabricated
// or generic string).
//
// Dispatch #140 renamed the exported component ScheduleRetentionPanel -> ScheduleRetentionSection
// (content-only, no own RoutePanelShell/onClose — it now renders as a Scheduling & Labor hub
// tab, see dispatch-140-schedule-retention-hub.test.js for the real hub-tab render) and broadened
// its LocationSelector from mode:'store' (a flat pill list) to mode:'progressive' (State -> Patch
// -> Store), so the component-wiring tests below now click through that hierarchy instead of a
// single flat store pill. Store 6838 (Defuniak Springs, FL) is INV_ORG_COORDS-seeded under
// State 'FL' / Patch 'Brad Denley'.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { computeScheduleSummary, computeStoreWeeks } from '../engine/schedule-summary.js';
import { aggregateSpan, splitWeeksAtMark, buildNarrative, buildPrintHTML, defaultWeekRange, ScheduleRetentionSection } from '../views/schedule-retention.js';

// Week B is the EXACT fixture from src/__tests__/schedule-summary.test.js (DeFuniak Springs,
// week of Wed Jul 22 -> Tue Jul 28 2026, reconciled to a real LifeLenz screenshot) — reused
// verbatim so this file's reconciliation check is against known-correct numbers, not new ones.
const WEEK_B_DAYS = [
  { dt: '2026-07-22', sched: 171,   fcst: 189.75, sales: 10774.97, laborPct: 24.34, gc: 1027 },
  { dt: '2026-07-23', sched: 201,   fcst: 210.5,  sales: 11901.83, laborPct: 24.92, gc: 1027 },
  { dt: '2026-07-24', sched: 222,   fcst: 231.5,  sales: 14611.22, laborPct: 23.30, gc: 1027 },
  { dt: '2026-07-25', sched: 226.5, fcst: 228,    sales: 14518.98, laborPct: 23.78, gc: 1027 },
  { dt: '2026-07-26', sched: 274.5, fcst: 247.75, sales: 16929.17, laborPct: 23.78, gc: 1027 },
  { dt: '2026-07-27', sched: 187,   fcst: 195.75, sales: 11134.49, laborPct: 25.95, gc: 1028 },
  { dt: '2026-07-28', sched: 178.5, fcst: 185.5,  sales: 9980.06,  laborPct: 26.57, gc: 1028 },
];

// Week A: Jul 15-21, PRE-workshop, one week earlier — forecast-only (no actuals posted yet at
// the moment this report is viewed), exercising the "bonus" ask's null/forecast-only state.
const weekDays = (startISO, sched, fcst, sales, laborPct, gc) => {
  const d0 = new Date(startISO + 'T12:00:00');
  return [0, 1, 2, 3, 4, 5, 6].map(i => {
    const d = new Date(d0); d.setDate(d0.getDate() + i);
    return { dt: d.toISOString().slice(0, 10), sched, fcst, sales, laborPct, gc };
  });
};
const WEEK_A_DAYS = weekDays('2026-07-15', 195, 190, 0, null, 1030);          // forecast-only, over-scheduled
// Week C: Jul 29-Aug4, first POST-workshop week — labor % improved vs Week B, hours closer to forecast.
const WEEK_C_DAYS = weekDays('2026-07-29', 195, 197, 12500, 22.10, 1050);
// Week D: Aug 5-11, second POST-workshop week — improvement holds.
const WEEK_D_DAYS = weekDays('2026-08-05', 198, 199, 12600, 21.85, 1055);

function toRows(loc, days) {
  return days.map(d => ({
    loc, date: new Date(d.dt + 'T12:00:00'),
    schVLH: d.sched, schFixHrs: 0, schFloor: 0,
    projVLH: d.fcst, fixGuideHrs: 0, projFloor: 0,
    fcstSales: d.sales || 10000, sales: d.sales, laborPct: d.laborPct, fcstTCs: d.gc,
  }));
}

const LOC = '0006838';
const ALL_ROWS = [
  ...toRows(LOC, WEEK_A_DAYS),
  ...toRows(LOC, WEEK_B_DAYS),
  ...toRows(LOC, WEEK_C_DAYS),
  ...toRows(LOC, WEEK_D_DAYS),
];

describe('computeStoreWeeks — reconciles EXACTLY against Schedule Summary\'s own per-store rollup', () => {
  const storeWeeks = computeStoreWeeks(ALL_ROWS, LOC, { s: '2026-07-01', e: '2026-08-31' });
  const allStoresWeeks = computeScheduleSummary(ALL_ROWS).weeks; // same engine, all-stores/one-week-at-a-time shape

  it('returns all four weeks, oldest -> newest', () => {
    expect(storeWeeks.map(w => w.weekKey)).toEqual(['2026-07-15', '2026-07-22', '2026-07-29', '2026-08-05']);
  });

  it('Week B (the known-reconciled LifeLenz screenshot week) matches the exact published figures', () => {
    const wB = storeWeeks.find(w => w.weekKey === '2026-07-22');
    expect(wB.fcstSales).toBeCloseTo(89850.72, 2);
    expect(wB.fcstGC).toBe(7191);
    expect(wB.schedHrs).toBeCloseTo(1460.5, 5);
    expect(wB.fcstHrs).toBeCloseTo(1488.75, 5);
    expect(wB.hrsDiff).toBeCloseTo(-28.25, 5);
    expect(wB.laborPct).toBeCloseTo(24.50, 2);
    expect(wB.tpmh).toBeCloseTo(4.92, 2);
  });

  it('EVERY week from computeStoreWeeks is bit-for-bit identical to the same store/week rolled by computeScheduleSummary (the panel this report must reconcile against)', () => {
    for (const w of storeWeeks) {
      const wk = allStoresWeeks.find(x => x.weekKey === w.weekKey);
      const s = wk.stores.find(x => x.loc === '6838');
      expect(s, `store missing for week ${w.weekKey}`).toBeTruthy();
      // Deep-equal on every rollup() field except the array-valued `days` (compared separately
      // below) and computeStoreWeeks' own added weekKey/weekStart (computeScheduleSummary carries
      // those one level up, on the week object, not the per-store rollup) — this is the
      // dispatch's "must reconcile exactly, not approximately" bar on the rollup() output itself.
      const { days: wDays, weekKey, weekStart, ...wRest } = w;
      const { days: sDays, ...sRest } = s;
      expect(wRest).toEqual(sRest);
      expect(wDays).toEqual(sDays);
    }
  });

  it('Week A (forecast-only, no actuals posted) leaves sales/laborPct at their null/zero forecast-only state — the "bonus" ask needs no new data work', () => {
    const wA = storeWeeks.find(w => w.weekKey === '2026-07-15');
    expect(wA.sales).toBe(0);
    expect(wA.laborPct).toBeNull();
    expect(wA.fcstSales).toBeGreaterThan(0); // the forecast leg is still populated
  });

  it('Weeks C and D (post-workshop) carry real ACTUAL labor % once posted', () => {
    const wC = storeWeeks.find(w => w.weekKey === '2026-07-29');
    const wD = storeWeeks.find(w => w.weekKey === '2026-08-05');
    expect(wC.sales).toBeGreaterThan(0);
    expect(wC.laborPct).toBeCloseTo(22.10, 1);
    expect(wD.laborPct).toBeCloseTo(21.85, 1);
  });

  it('respects the period filter — a narrower range drops out-of-window weeks entirely', () => {
    const narrow = computeStoreWeeks(ALL_ROWS, LOC, { s: '2026-07-22', e: '2026-07-28' });
    expect(narrow.map(w => w.weekKey)).toEqual(['2026-07-22']);
  });

  it('returns [] for a store with no rows in range', () => {
    expect(computeStoreWeeks(ALL_ROWS, '9999999', { s: '2026-01-01', e: '2026-12-31' })).toEqual([]);
  });
});

describe('aggregateSpan — dollar-weights labor % across weeks (never an average of averages)', () => {
  const storeWeeks = computeStoreWeeks(ALL_ROWS, LOC, { s: '2026-07-01', e: '2026-08-31' });
  const [wA, wB, wC, wD] = storeWeeks;

  it('sums additive atoms (hours, GC, sales) directly', () => {
    const span = aggregateSpan([wA, wB]);
    expect(span.schedHrs).toBeCloseTo(wA.schedHrs + wB.schedHrs, 5);
    expect(span.hrsDiff).toBeCloseTo((wA.schedHrs + wB.schedHrs) - (wA.fcstHrs + wB.fcstHrs), 5);
  });

  it('weights labor % by each week\'s ACTUAL sales, skipping weeks with no actuals (Week A)', () => {
    const span = aggregateSpan([wA, wB]);
    // Week A has sales=0 -> contributes nothing; result must equal Week B's own labor % exactly.
    expect(span.laborPct).toBeCloseTo(wB.laborPct, 6);
    expect(span.weeksWithActuals).toBe(1);
  });

  it('two-week span dollar-weights, not a flat average, when both weeks have actuals', () => {
    const span = aggregateSpan([wC, wD]);
    const manualWeighted = (wC.laborPct * wC.sales + wD.laborPct * wD.sales) / (wC.sales + wD.sales);
    const flatAverage = (wC.laborPct + wD.laborPct) / 2;
    expect(span.laborPct).toBeCloseTo(manualWeighted, 6);
    // Guard against the "average of averages" regression this codebase explicitly forbids:
    // only assert they differ if sales actually differ enough for it to matter.
    if (Math.abs(wC.sales - wD.sales) > 1) expect(span.laborPct).not.toBeCloseTo(flatAverage, 6);
  });
});

describe('splitWeeksAtMark', () => {
  const storeWeeks = computeStoreWeeks(ALL_ROWS, LOC, { s: '2026-07-01', e: '2026-08-31' });

  it('defaults to a midpoint split when nothing is marked', () => {
    const { splitIdx, pre, post } = splitWeeksAtMark(storeWeeks, null);
    expect(splitIdx).toBe(2);
    expect(pre.map(w => w.weekKey)).toEqual(['2026-07-15', '2026-07-22']);
    expect(post.map(w => w.weekKey)).toEqual(['2026-07-29', '2026-08-05']);
  });

  it('splits at the marked week — marked week becomes the FIRST week of "since"', () => {
    const { pre, post } = splitWeeksAtMark(storeWeeks, '2026-07-29');
    expect(pre.map(w => w.weekKey)).toEqual(['2026-07-15', '2026-07-22']);
    expect(post.map(w => w.weekKey)).toEqual(['2026-07-29', '2026-08-05']);
  });
});

describe('buildNarrative — grounded in real deltas, changes when the data changes', () => {
  const storeWeeks = computeStoreWeeks(ALL_ROWS, LOC, { s: '2026-07-01', e: '2026-08-31' });

  it('reports the real Labor % improvement direction and exact figures for this fixture (Week B -> Weeks C/D, an improvement)', () => {
    const n = buildNarrative(storeWeeks, '2026-07-29');
    expect(n.headline).toMatch(/improved/i);
    expect(n.headline).toContain('24.50'); // Week B's exact labor %
    const cdSpan = aggregateSpan(storeWeeks.slice(2));
    expect(n.headline).toContain(cdSpan.laborPct.toFixed(2));
    expect(n.bullets.some(b => /Labor %/.test(b))).toBe(true);
  });

  it('flips to a regression headline when the SAME weeks are fed with worse post-workshop numbers — proves this is computed, not a fixed string', () => {
    // Reuse Week B as "pre", but make "post" WORSE than Week B instead of better.
    const worsePost = toRows(LOC, weekDays('2026-07-29', 230, 190, 12000, 29.50, 1000));
    const rows = [...toRows(LOC, WEEK_B_DAYS), ...worsePost];
    const weeks = computeStoreWeeks(rows, LOC, { s: '2026-07-01', e: '2026-08-31' });
    const n = buildNarrative(weeks, '2026-07-29');
    expect(n.headline).toMatch(/worsened/i);
    expect(n.headline).not.toMatch(/improved/i);
  });

  it('says so, rather than guessing, when there are not enough weeks to compare', () => {
    const n = buildNarrative(storeWeeks.slice(0, 1), null);
    expect(n.headline).toMatch(/at least two/i);
    expect(n.bullets).toEqual([]);
  });

  it('says so, rather than fabricating a number, when neither span has posted actuals yet', () => {
    const futureOnly = toRows(LOC, [
      ...weekDays('2026-07-15', 190, 190, 0, null, 1000),
      ...weekDays('2026-07-22', 190, 190, 0, null, 1000),
    ]);
    const weeks = computeStoreWeeks(futureOnly, LOC, { s: '2026-07-01', e: '2026-07-31' });
    const n = buildNarrative(weeks, null);
    expect(n.headline).toMatch(/actuals-posted/i);
  });
});

describe('buildPrintHTML — full period, not a scroll-clipped subset (dispatch #122/#129 pattern)', () => {
  const storeWeeks = computeStoreWeeks(ALL_ROWS, LOC, { s: '2026-07-01', e: '2026-08-31' });
  const narrative = buildNarrative(storeWeeks, '2026-07-29');
  const html = buildPrintHTML('DeFuniak Springs', '2026-07-01 → 2026-08-31', storeWeeks, narrative);

  it('contains every week\'s date label, not just the ones that would fit a viewport', () => {
    for (const w of storeWeeks) {
      const label = (w.weekStart.getMonth() + 1) + '/' + w.weekStart.getDate();
      expect(html).toContain(label);
    }
  });

  it('contains Week B\'s exact reconciled dollar figure', () => {
    expect(html).toContain('$89,851'); // Math.round(89850.72) formatted via f$
  });

  it('marks the forecast-only week distinctly from the actuals-posted weeks', () => {
    expect(html).toContain('forecast-only');
  });

  it('includes the narrative headline', () => {
    expect(html).toContain(narrative.headline.replace(/^[^\w]+/, '').slice(0, 20));
  });

  it('handles an empty weeks[] without throwing', () => {
    expect(buildPrintHTML('X', 'Y', [], { headline: '', bullets: [] })).toContain('No LifeLenz schedule weeks');
  });
});

// ── Component wiring — proves the panel is actually reachable and renders real reconciled
// numbers, not just that the pure helpers above compute correctly in isolation. Same pattern as
// crew-schedule-panel.test.js: real DOM (happy-dom), real createRoot + act, a real click on the
// LocationSelector's store pill (mode:'store', per the dispatch's own "single-store focus"
// grounding) rather than injected state. ──────────────────────────────────────────────────────
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function flush(container, maxTicks = 10) {
  let last = null;
  for (let i = 0; i < maxTicks; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    if (container.textContent === last) return;
    last = container.textContent;
  }
}

// Navigates the broadened mode:'progressive' LocationSelector (State -> Patch -> Store) down to
// store 6838's pill and clicks it — replaces the old single flat-pill click now that dispatch
// #140 item 4 broadened the selector.
async function pickStore6838(container) {
  const stateBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'FL');
  expect(stateBtn, 'FL state pill not found').toBeTruthy();
  await act(async () => { stateBtn.click(); });
  await flush(container);
  const patchBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Brad Denley');
  expect(patchBtn, 'Brad Denley patch pill not found').toBeTruthy();
  await act(async () => { patchBtn.click(); });
  await flush(container);
  const storePill = [...container.querySelectorAll('button')].find(b => /6838/.test(b.textContent));
  expect(storePill, 'store pill not found once its Patch is selected').toBeTruthy();
  await act(async () => { storePill.click(); });
  await flush(container);
}

describe('ScheduleRetentionSection — real render, real click, real numbers', () => {
  let container, root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('empty state prompts for a location before any store is picked', async () => {
    await act(async () => { root.render(React.createElement(ScheduleRetentionSection, { ds: { schedRows: [], jobHours: [] }, stores: [{ loc: '6838' }] })); });
    await flush(container);
    expect(container.textContent).toMatch(/pick a location/i);
  });

  it('picking State -> Patch -> Store renders the SAME reconciled Week B figures as computeStoreWeeks — proves the engine is actually wired to the screen, not just importable', async () => {
    await act(async () => { root.render(React.createElement(ScheduleRetentionSection, { ds: { schedRows: ALL_ROWS, jobHours: [] }, stores: [{ loc: '6838' }] })); });
    await flush(container);
    await pickStore6838(container);

    // Week B's exact reconciled figures (see the top-level fixture + the LifeLenz-screenshot
    // test above) must appear on screen verbatim once the store is selected. Both weeks fall
    // inside the default trailing week-range window (all 4 fixture weeks < 12), so no range
    // adjustment is needed for them to show.
    expect(container.textContent).toMatch(/24\.50%/);          // Week B Labor %
    expect(container.textContent).toMatch(/\$89,851/);         // Week B Sales Forecast (rounded)
    // The smart-analysis headline is present and non-generic (contains a real computed number).
    const n = buildNarrative(computeStoreWeeks(ALL_ROWS, '6838', {}), null);
    expect(container.textContent).toContain(n.headline.replace(/^[^\w]+/, '').slice(0, 15));
  });

  it('dropped the "worth a follow-up coaching visit" editorial tail from the on-screen narrative (dispatch #140 item 2)', async () => {
    // Reuse the worse-post-workshop fixture from the buildNarrative describe block above —
    // guarantees a regression ("worsened") headline actually renders on screen.
    const worsePost = toRows(LOC, weekDays('2026-07-29', 230, 190, 12000, 29.50, 1000));
    const rows = [...toRows(LOC, WEEK_B_DAYS), ...worsePost];
    await act(async () => { root.render(React.createElement(ScheduleRetentionSection, { ds: { schedRows: rows, jobHours: [] }, stores: [{ loc: '6838' }] })); });
    await flush(container);
    await pickStore6838(container);

    expect(container.textContent).toMatch(/worsened/i);
    expect(container.textContent).not.toMatch(/coaching visit/i);
  });

  it('clicking "Days ▾" on a week reveals that week\'s daily grid (per-week inspect, not always-on for every column)', async () => {
    await act(async () => { root.render(React.createElement(ScheduleRetentionSection, { ds: { schedRows: ALL_ROWS, jobHours: [] }, stores: [{ loc: '6838' }] })); });
    await flush(container);
    await pickStore6838(container);

    expect(container.textContent).not.toMatch(/Daily detail/i);
    const dayBtn = [...container.querySelectorAll('button')].find(b => /Days\s*▾/.test(b.textContent));
    expect(dayBtn).toBeTruthy();
    await act(async () => { dayBtn.click(); });
    await flush(container);
    expect(container.textContent).toMatch(/Daily detail/i);
  });

  it('picking a Patch (broader than a single store) shows a "pick a store" empty state, not a per-store view (dispatch #140 item 4)', async () => {
    await act(async () => { root.render(React.createElement(ScheduleRetentionSection, { ds: { schedRows: ALL_ROWS, jobHours: [] }, stores: [{ loc: '6838' }] })); });
    await flush(container);
    const stateBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'FL');
    await act(async () => { stateBtn.click(); });
    await flush(container);
    const patchBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Brad Denley');
    await act(async () => { patchBtn.click(); });
    await flush(container);

    expect(container.textContent).toMatch(/pick a store/i);
    expect(container.textContent).not.toMatch(/24\.50%/);
  });
});

describe('defaultWeekRange — trailing-window default, in whole business weeks (dispatch #140 item 3)', () => {
  const storeWeeks = computeStoreWeeks(ALL_ROWS, LOC, {}); // all 4 fixture weeks, oldest -> newest

  it('windows to the trailing `count` weeks when more are available than the default', () => {
    const r = defaultWeekRange(storeWeeks, 2);
    expect(r).toEqual({ startKey: '2026-07-29', endKey: '2026-08-05' });
  });

  it('spans everything when fewer weeks exist than the requested count', () => {
    const r = defaultWeekRange(storeWeeks, 12);
    expect(r).toEqual({ startKey: '2026-07-15', endKey: '2026-08-05' });
  });

  it('returns null bounds for an empty weeks list', () => {
    expect(defaultWeekRange([], 12)).toEqual({ startKey: null, endKey: null });
  });
});
