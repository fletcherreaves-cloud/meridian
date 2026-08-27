// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #167 -- TPPH auto-target calc (FR: "TPPH - Calculate TPPH targets automatically").
// The engine (schedule-summary.js's rollup()) already computed this correctly; this dispatch
// only SURFACES it in two places: Smart Targets (additive "Scheduled" target alongside the
// existing trailing-history "Trend" target) and Projection Workspace (a new integration point --
// nothing in that file previously read computeSmartTargets or schedule-summary.js at all).
//
// Renders the REAL SmartTargetPanel and the REAL ProjectionWorkflow (not the math in isolation),
// per this repo's "would this verification still pass if reverted?" standing rule -- an
// engine-only test can't prove either panel is actually wired to it. Also reconciles the
// surfaced number against Schedule Summary's own `computeScheduleSummary().tpmh` for the
// IDENTICAL store-week, per the "when two panels disagree on one number" rule -- all three
// surfaces must show the same figure for the same computation.
//
// NOTE on the fixture rows: schedule row `date` fields are built with `new Date(...)` freshly
// INSIDE each test/section (via mkSchedRows()), never once at module scope -- vi.setSystemTime
// swaps the global Date constructor for a fake one, and computeScheduleRollup's range filter does
// `d instanceof Date`. A row built with the real Date before the swap silently fails that check
// against the fake Date class, dropping every row out of range with no error. Building rows after
// the swap keeps them the same Date class the code under test will check them against.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { computeScheduleSummary } from '../engine/schedule-summary.js';
import { computeSmartTargets, SmartTargetPanel } from '../features/smart-targets.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, supabase: null };
});

const { ProjectionWorkflow } = await import('../features/projections.js');

// Same real store-week fixture as schedule-summary.test.js's reconciled-to-the-LifeLenz-
// screenshot block -- DeFuniak Springs (0006838), week of Wed Jul 22 -> Tue Jul 28 2026.
// Reconciled Schd TPMH = 4.92 (GC Forecast 7,191 / Scheduled Hours 1460.5).
const DAYS = [
  { dt: '2026-07-22', sched: 171,   fcst: 189.75, sales: 10774.97, laborPct: 24.34, gc: 1027 },
  { dt: '2026-07-23', sched: 201,   fcst: 210.5,  sales: 11901.83, laborPct: 24.92, gc: 1027 },
  { dt: '2026-07-24', sched: 222,   fcst: 231.5,  sales: 14611.22, laborPct: 23.30, gc: 1027 },
  { dt: '2026-07-25', sched: 226.5, fcst: 228,    sales: 14518.98, laborPct: 23.78, gc: 1027 },
  { dt: '2026-07-26', sched: 274.5, fcst: 247.75, sales: 16929.17, laborPct: 23.78, gc: 1027 },
  { dt: '2026-07-27', sched: 187,   fcst: 195.75, sales: 11134.49, laborPct: 25.95, gc: 1028 },
  { dt: '2026-07-28', sched: 178.5, fcst: 185.5,  sales: 9980.06,  laborPct: 26.57, gc: 1028 },
];
function mkSchedRows() {
  return DAYS.map(d => ({
    loc: '0006838', date: new Date(d.dt + 'T12:00:00'),
    schVLH: d.sched, schFixHrs: 0, schFloor: 0,
    projVLH: d.fcst, fixGuideHrs: 0, projFloor: 0,
    fcstSales: d.sales, sales: d.sales, laborPct: d.laborPct, fcstTCs: d.gc,
  }));
}

function baseDs(schedRows) {
  return {
    loaded: true, schedRows,
    laborRows: [], laborByLoc: {}, opsRows: [], opsByLoc: {}, ctrlRows: [], ctrlByLoc: {},
    fobRows: [], targets: {}, storeIds: ['6838'], glimpseRows: [], qsrActSummaryRows: [], qsrFobRows: [],
  };
}

describe('#167 computeSmartTargets — Scheduled TPPH reconciles to Schedule Summary exactly', () => {
  it('matches Schedule Summary\'s own tpmh for the identical store-week (4.92)', () => {
    const schedRows = mkSchedRows();
    const expectedTpmh = computeScheduleSummary(schedRows).weeks[0].stores.find(s => s.loc === '6838').tpmh;
    expect(expectedTpmh).toBeCloseTo(4.92, 2);

    const ds = baseDs(schedRows);
    const now = new Date('2026-07-24T12:00:00'); // any day inside the fixture week
    const results = computeSmartTargets('6838', ds, {}, now);
    expect(results.tpph.scheduled).toBeTruthy();
    expect(results.tpph.scheduled.tpmh).toBeCloseTo(expectedTpmh, 10); // exact reconciliation
    expect(results.tpph.scheduled.tpmh).toBeCloseTo(4.92, 2);
  });

  it('is additive -- the existing trailing-history tpph target is untouched', () => {
    const ds = baseDs(mkSchedRows());
    const results = computeSmartTargets('6838', ds, {}, new Date('2026-07-24T12:00:00'));
    // No laborRows at all in this fixture -> the trailing-trend engine legitimately has
    // nothing to compute from (recent === null); the point is the KEY still exists and the
    // scheduled figure lives alongside it, not in place of it.
    expect(results.tpph).toHaveProperty('recent');
    expect(results.tpph).toHaveProperty('proposedMonthly');
    expect(results.tpph).toHaveProperty('scheduled');
  });

  it('is null when the store has no published schedule for the current week', () => {
    const ds = baseDs(mkSchedRows());
    // "now" far outside the fixture's week -> currentScheduleWeekRange finds no matching rows.
    const results = computeSmartTargets('6838', ds, {}, new Date('2026-01-05T12:00:00'));
    expect(results.tpph.scheduled).toBeNull();
  });

  it('accepts any loc zero-padding (matches computeScheduleRollup\'s own contract)', () => {
    const ds = baseDs(mkSchedRows());
    const results = computeSmartTargets('0006838', ds, {}, new Date('2026-07-24T12:00:00'));
    expect(results.tpph.scheduled.tpmh).toBeCloseTo(4.92, 2);
  });
});

describe('#167 SmartTargetPanel — real component surfaces the Scheduled TPPH target', () => {
  let container, root;
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-07-24T09:00:00')); // inside the fixture week
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    vi.useRealTimers();
  });

  // The panel's own grid computation runs behind a real setTimeout(...,50) (not a resolved
  // promise), so this waits a fixed, comfortably-longer real duration across several act()
  // ticks rather than exiting the moment two consecutive polls happen to read the same
  // (still-"Computing…") text -- that early-exit shape reports "stable" before the 50ms
  // timer has even fired.
  async function flush(totalMs = 300, stepMs = 20) {
    for (let waited = 0; waited < totalMs; waited += stepMs) {
      await act(async () => { await new Promise(r => setTimeout(r, stepMs)); });
    }
  }

  it('renders both a Trend target and a Scheduled target for TPPH, and they read as different figures', async () => {
    const ds = baseDs(mkSchedRows());
    const stores = [{ loc: '6838', org: 'Emerald Arches', supervisor: 'X' }];
    await act(async () => {
      root.render(React.createElement(SmartTargetPanel, { stores, ds, settings: {}, onClose: () => {} }));
    });
    await flush();

    // Click the TPPH cell for the store to open its detail panel. Locate it by column
    // position under the real rendered header (not a hardcoded index), so this stays correct
    // if SMART_METRICS is ever reordered.
    const headerCells = [...container.querySelectorAll('thead th')];
    const tpphColIdx = headerCells.findIndex(th => th.textContent.trim() === 'TPPH');
    expect(tpphColIdx).toBeGreaterThan(0);
    const bodyRow = container.querySelector('tbody tr');
    expect(bodyRow).toBeTruthy();
    const tpphCell = bodyRow.querySelectorAll('td')[tpphColIdx];
    expect(tpphCell).toBeTruthy();
    await act(async () => { tpphCell.click(); });
    await flush();

    expect(container.textContent).toMatch(/TREND TARGET/);
    expect(container.textContent).toMatch(/SCHEDULED TARGET/);
    // The Scheduled figure must be the reconciled 4.92, in both the grid cell and detail panel.
    expect(container.textContent).toMatch(/Sched 4\.92/);
    expect(container.textContent).toMatch(/4\.92/);
  });
});

describe('#167 ProjectionWorkflow — real component surfaces the same Scheduled TPPH figure', () => {
  let container, root;
  beforeEach(() => {
    // ProjectionWorkflow's default "This Week" anchor is the NEXT wsd-weekday strictly after
    // today (never today itself) -- so pinning "today" to the Wednesday exactly one week
    // before the fixture week (Jul 15) makes its default weekStart land on Jul 22, the
    // fixture's own Wednesday anchor, without needing to click through Prev/Next.
    vi.setSystemTime(new Date('2026-07-15T09:00:00'));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    vi.useRealTimers();
  });

  async function flush(totalMs = 400, stepMs = 20) {
    for (let waited = 0; waited < totalMs; waited += stepMs) {
      await act(async () => { await new Promise(r => setTimeout(r, stepMs)); });
    }
  }

  it('shows "↳ Scheduled TPPH" = 4.92 for the default week, matching Schedule Summary exactly', async () => {
    const schedRows = mkSchedRows();
    const expectedTpmh = computeScheduleSummary(schedRows).weeks[0].stores.find(s => s.loc === '6838').tpmh;
    const ds = baseDs(schedRows);
    const stores = [{ loc: '6838', org: 'Emerald Arches', supervisor: 'X', patch: 'X' }];
    await act(async () => {
      root.render(React.createElement(ProjectionWorkflow, {
        stores, ds, settings: {}, userEvents: {}, lockedProjections: {}, onSaveLocked: () => {},
      }));
    });
    await flush();

    // Default groupBy is 'patch' with no settings.supervisorGroups configured here, so the
    // table's sections list is empty and only the (all-dash) district total row shows. Switch
    // to the "All" grouping toggle -- a real user interaction, not a prop override -- so the
    // store row actually renders.
    const allBtn = [...container.querySelectorAll('button')].find(b => b.textContent.trim() === 'All');
    expect(allBtn).toBeTruthy();
    await act(async () => { allBtn.click(); });
    await flush();

    expect(container.textContent).toMatch(/Scheduled TPPH/);
    expect(container.textContent).toMatch(/4\.92/);
    expect(expectedTpmh).toBeCloseTo(4.92, 2);
  });
});
