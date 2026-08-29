// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #208 — District View Overview's new "Tab Digest" row (six new summary tiles, one per
// District View tab not already represented in Overview: Food Cost, Labor & Scheduling,
// Location Intelligence, Records, Register Audit, Action Plan). Owner, live: "let's add new data
// to overview tab to represent the new tabs and be all inclusive!"
//
// Renders the REAL StoreDash consumer (not TabDigestRow in isolation, and not the underlying
// engines in isolation) — per this repo's "would this verification still pass if the change were
// reverted" standing rule (dispatch16, 2026-08-17): a test that only calls
// computeFoodCostHeadline/computeLaborGapSplit/liComputeAll/computeRecords/analyzeRegisterAudit/
// generatePlan directly could pass unchanged with the tiles never wired into Overview's JSX.
// Every number below is hand-computed from the fixture against the real formulas (fob-report.js,
// labor-gap-split.js, register-audit.js) the same way dispatch-204's own store-cockpit test does,
// so a real regression in the math — not just the wiring — fails loudly too.
//
// forecastRangeAsync is mocked to settle synchronously (dispatch #168's own precedent) — StoreDash's
// weekly-forecast effect is irrelevant to the Tab Digest tiles under test. The four store-cockpit.js
// Supabase loaders (loadQsrFob/loadQsrVarianceHistory/loadDailyActivityRangeForStore/
// loadStoreLaborConfig) are stubbed to resolve empty/harmless — this sandbox has real
// VITE_SUPABASE_URL/ANON_KEY set, so leaving them real would let clicking into the Food Cost or
// Labor & Scheduling full tabs fire genuine network calls against production Supabase (dispatch
// #204's own test avoided this for the same reason). metric-source.js's metricSeries/
// dailyDataFreshness are mocked ONLY for the Records tile's computeRecords() call (same technique
// dispatch #200's StoreRecordsTab test uses) — metricAvg/metricRate/ensureLazyFill stay real via
// importOriginal, so the Labor & Scheduling tile's own metricRate(...) computation is untouched.
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LOC1 = '99999';   // not a real store -- not in STORE_COORDS, so fetchForecastWeather no-ops
const LOC2 = '88888';   // second store, for the "2 different stores" cross-check

// Records fixture -- one week apart, both safely in the past (2025) so neither is a still-open
// provisional business day regardless of when this suite runs.
const REC_DAY1 = '2025-01-08'; // Wed, sales 45000
const REC_DAY2 = '2025-01-15'; // Wed, one week later -- becomes the real Best Day Sales winner
const REC_SALES = { [REC_DAY1]: 45000, [REC_DAY2]: 52000 };
const REC_GC    = { [REC_DAY1]: 4200,  [REC_DAY2]: 4800 };
const REC_OEPE  = { [REC_DAY1]: 140,   [REC_DAY2]: 125 };

vi.mock('../engine/forecast.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, forecastRangeAsync: (loc, s, e, ds, settings, onPartial, onFinal) => { onFinal([]); } };
});

vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadQsrFob: async () => [],
    loadQsrVarianceHistory: async () => [],
    loadDailyActivityRangeForStore: async () => [],
    loadStoreLaborConfig: async () => ({}),
  };
});

vi.mock('../engine/metric-source.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    dailyDataFreshness: () => new Date('2025-01-20T00:00:00'),
    metricSeries: (ds, loc, range, key) => {
      const l = String(loc);
      if (l !== LOC1) return {};
      if (key === 'sales') return { ...REC_SALES };
      if (key === 'gc')    return { ...REC_GC };
      if (key === 'oepe')  return { ...REC_OEPE };
      return {};
    },
  };
});

import { StoreDash } from '../views/store-analytics.js';
import { liComputeAll, liBuildRoadmap, LocationIntelligence } from '../features/location-intel.js';

const NOOP = () => {};

// Food Cost fixture: 7-digit padded loc (fobSnapshotByStore's own keying quirk -- see
// computeFoodCostHeadline's fallback to Object.values(f)[0], same as dispatch-204's test row).
// prodSalesAmt 100000, component $ sum to 2200 -> fobPct 2.20%; target 1.80% -> +0.40pp over;
// tStatLoss set low enough that Variance Stat ($700, the largest component) is the sole
// qualifying over-target driver.
function fobRow(locPadded, period) {
  return {
    loc: locPadded, date: period + '-15',
    prodSalesAmt: 100000, compWasteAmt: 500, rawWasteAmt: 400, condimentsAmt: 300,
    empMgrMealsAmt: 200, statVarianceAmt: 700, unexplainedAmt: 100,
  };
}
// Store 2's FOB: half the component $ over double the sales -> fobPct 0.60%, UNDER an 2.80% target.
function fobRow2(locPadded, period) {
  return {
    loc: locPadded, date: period + '-15',
    prodSalesAmt: 200000, compWasteAmt: 200, rawWasteAmt: 200, condimentsAmt: 200,
    empMgrMealsAmt: 200, statVarianceAmt: 200, unexplainedAmt: 200,
  };
}

function makeStore(loc, overrides = {}) {
  return {
    loc, name: 'Test Store ' + loc, org: 'MCDOK', gm: null, sup: null, city: 'Testville', state: 'OK', addr: null,
    p: { laborPct: 0.28, oepe: 175, tpph: 5, cashOSPct: 0.0005, t2w: null, otHrs: 3, _cov: {} },
    t: { tOepe: 180, tTpph: 90, tCrewLabor: 0.25, tFOBTarget: 0.018, tStatLoss: 0.001 },
    opsScore: 78, ctrlScore: 82, findings: [],
    pSales: 50000, pLY: 48000,
    ...overrides,
  };
}

function baseSettings(overrides = {}) {
  return { dialedInEnabled: false, ...overrides }; // skip StoreDash's own background auto-calibrate
}

// One row covers the whole Wed-Tue pay week (computeLaborGapSplit sums by weekKey, not by day) --
// Jan 8 2025 is itself a Wednesday, safely in the past regardless of when this suite runs.
function laborWeekRow(loc, { needHrs, actHrs, darSchedHrs }) {
  return { loc, date: new Date(2025, 0, 8), needHrs, actHrs, darSchedHrs };
}
function ctrlLaborRow(loc, laborPct) {
  return { loc, date: new Date(2025, 0, 10), laborPct };
}
function auditRow(loc) {
  // avgDrawerOpens 12>8 (+30), cashOSTotal -8<-5 (+25), avgTRedA 3>2 (+20) -> risk 75 -> highRisk.
  return {
    loc, date: new Date(2025, 0, 10), emp: 'Test Employee', registerType: 'cashier', empToken: 'tok1',
    drawerSales: 500, avgCheck: 10, drawerOpens: 12, drawerGC: 50,
    empMealDisc: 0, empMealCh: 0, manualRefAmt: 0, manualRefCnt: 0,
    refundCnt: 0, refundCash: 0, refundCashless: 0,
    mgrMealAmt: 0, mgrMealCnt: 0, cashOSDollar: -8, cashOSPct: -0.016,
    posOverAmt: 0, posOverCnt: 0, promoAmt: 0, promoCnt: 0, promoPct: 0,
    tRedBCnt: 0, tRedBPct: 0, tRedBAvg: 0, tRedBDollar: 0,
    tRedACnt: 3, tRedAPct: 0, tRedAAvg: 0, tRedADollar: 15,
  };
}

function baseDs(loc, { fobRowFn = fobRow, laborWk = { needHrs: 350, actHrs: 364, darSchedHrs: 357 }, laborPct = 0.30 } = {}) {
  const period = new Date().toISOString().slice(0, 7);
  const padded = '00' + loc; // 7 chars for a 5-digit loc, matching dispatch-204's own fixture convention
  return {
    loaded: true, storeIds: [loc],
    qsrFobRows: [fobRowFn(padded, period)],
    qsrActSummaryRows: [laborWeekRow(loc, laborWk)],
    ctrlRows: [ctrlLaborRow(loc, laborPct)],
    auditRows: [auditRow(loc)],
    laborRows: [], opsRows: [], records: {},
  };
}

// Register Audit's tile is IntersectionObserver-gated (dispatch #208 — see store-analytics.js's
// RegisterAuditDigestTile comment). happy-dom DOES implement IntersectionObserver but never
// fires callbacks (no real layout/viewport) — confirmed by direct probe this session — so the
// DEFAULT render below exercises the real "not yet scrolled into view" gate. FakeIO simulates a
// tile that has scrolled into view, for the tests that need the loaded state.
class FakeIO {
  constructor(cb) { this.cb = cb; }
  observe(el) { this.cb([{ isIntersecting: true, target: el }]); }
  disconnect() {}
}

function renderStoreDash(store, ds, settings, allStores) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const dateRange = { s: new Date(2025, 0, 1), e: new Date(2025, 0, 31), label: 'Test Period' };
  act(() => {
    root.render(React.createElement(StoreDash, {
      store, ds, settings, allStores: allStores === undefined ? [store] : allStores,
      onBack: NOOP, onNav: NOOP, dateRange, userEvents: {}, lockedProjections: {}, onUpdateSettings: NOOP,
    }));
  });
  return { container, root };
}

function tileByLabel(container, label) {
  return container.querySelector(`[title="Click to open the full ${label} tab"]`);
}

describe('dispatch #208 — Overview Tab Digest row', () => {
  let container, root;
  afterEach(() => {
    if (root) act(() => { root.unmount(); });
    container?.remove();
    container = null; root = null;
    vi.unstubAllGlobals();
  });

  it('renders all 6 tiles with real, hand-verified numbers (IntersectionObserver stubbed as visible)', () => {
    vi.stubGlobal('IntersectionObserver', FakeIO);
    const store = makeStore(LOC1);
    const ds = baseDs(LOC1);
    ({ container, root } = renderStoreDash(store, ds, baseSettings(), [store]));

    // Food Cost -- fobPct 2.20% (2200/100000), target 1.80% -> +0.40pp, driver Variance Stat.
    const food = tileByLabel(container, 'FOOD COST');
    expect(food).toBeTruthy();
    expect(food.textContent).toContain('2.20%');
    expect(food.textContent).toContain('target 1.80%');
    expect(food.textContent).toContain('+0.40pp');
    expect(food.textContent).toMatch(/driver: Variance Stat/);

    // Labor & Scheduling -- actual 30.00% (single ctrlRows.laborPct), target 25.00% -> +5.00pp,
    // planningGapHrs=execGapHrs=7 (equal) -> "Planning-driven".
    const labor = tileByLabel(container, 'LABOR & SCHEDULING');
    expect(labor).toBeTruthy();
    expect(labor.textContent).toContain('30.00%');
    expect(labor.textContent).toContain('target 25.00%');
    expect(labor.textContent).toContain('+5.00pp');
    expect(labor.textContent).toMatch(/Planning-driven/);

    // Location Intelligence -- real liComputeAll/liBuildRoadmap output for this fixture (no
    // correlation-worthy opsRows/laborRows supplied, so a real $0/"no opportunities" reading is
    // the CORRECT engine output, not a placeholder) -- assert it renders without crashing and
    // shows a real (possibly zero) dollar figure, not '—'/undefined.
    const li = tileByLabel(container, 'LOCATION INTELLIGENCE');
    expect(li).toBeTruthy();
    expect(li.textContent).toMatch(/\$[\d,]+/);

    // Records -- Best Day Sales $52,000.00 on 2025-01-15 (the higher of the two fixture days).
    const rec = tileByLabel(container, 'RECORDS');
    expect(rec).toBeTruthy();
    expect(rec.textContent).toContain('$52,000.00');

    // Register Audit -- FakeIO makes it immediately "visible": real analyzeRegisterAudit() over
    // the fixture row -> risk 75 -> 1 high-risk, 0 watch, 1 employee.
    const reg = tileByLabel(container, 'REGISTER AUDIT');
    expect(reg).toBeTruthy();
    expect(reg.textContent).toContain('1 high-risk');
    expect(reg.textContent).toContain('0 watch');
    expect(reg.textContent).toContain('1 employees');

    // Action Plan -- p.otHrs:3 triggers generatePlan's FIRST rule (OT), deterministically actions[0].
    const action = tileByLabel(container, 'ACTION PLAN');
    expect(action).toBeTruthy();
    expect(action.textContent).toContain('HIGH');
    expect(action.textContent).toContain('Overtime averaging 3.0 hrs/day');
  });

  it('the Register Audit tile is IntersectionObserver-gated -- with the REAL happy-dom observer (which never auto-fires), it stays in the "not yet visible" state and never renders auditRows data', () => {
    // No vi.stubGlobal here -- uses happy-dom's real IntersectionObserver, confirmed this
    // session to never invoke its callback without a real layout pass.
    const store = makeStore(LOC1);
    const ds = baseDs(LOC1);
    ({ container, root } = renderStoreDash(store, ds, baseSettings(), [store]));
    const reg = tileByLabel(container, 'REGISTER AUDIT');
    expect(reg).toBeTruthy();
    expect(reg.textContent).toContain('Scrolls into view to load');
    expect(reg.textContent).not.toContain('high-risk');
    // Every other tile is unaffected by the gate -- still real, live-computed.
    expect(tileByLabel(container, 'FOOD COST').textContent).toContain('2.20%');
  });

  it('each tile click-through switches the real tab and the target tab shows the SAME number the tile did (Food Cost + Labor & Scheduling + Records + Location Intelligence + Action Plan)', () => {
    vi.stubGlobal('IntersectionObserver', FakeIO);
    const store = makeStore(LOC1);
    const ds = baseDs(LOC1);
    ({ container, root } = renderStoreDash(store, ds, baseSettings(), [store]));

    // Food Cost.
    act(() => { tileByLabel(container, 'FOOD COST').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('FOB % — Food Over Base');
    expect(container.textContent).toContain('2.20%'); // same number the Overview tile showed

    // Back to overview, then Labor & Scheduling.
    act(() => { [...container.querySelectorAll('.tab')].find(t => t.textContent === 'Overview').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    act(() => { tileByLabel(container, 'LABOR & SCHEDULING').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('Crew Labor % — tCrewLabor basis');
    expect(container.textContent).toContain('30.00%');

    // Back to overview, then Records.
    act(() => { [...container.querySelectorAll('.tab')].find(t => t.textContent === 'Overview').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    act(() => { tileByLabel(container, 'RECORDS').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('Live Data Records');
    expect(container.textContent).toContain('$52,000.00');

    // Back to overview, then Location Intelligence.
    act(() => { [...container.querySelectorAll('.tab')].find(t => t.textContent === 'Overview').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    act(() => { tileByLabel(container, 'LOCATION INTELLIGENCE').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('Location Intelligence');

    // Back to overview, then Action Plan.
    act(() => { [...container.querySelectorAll('.tab')].find(t => t.textContent === 'Overview').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    act(() => { tileByLabel(container, 'ACTION PLAN').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('Overtime averaging 3.0 hrs/day');

    // Back to overview, then Register Audit.
    act(() => { [...container.querySelectorAll('.tab')].find(t => t.textContent === 'Overview').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    act(() => { tileByLabel(container, 'REGISTER AUDIT').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('Test Employee');
  });

  it('renders for a genuine single-store context (allStores length 1) -- and the district-scoped Enterprise Overview block stays absent', () => {
    const store = makeStore(LOC1);
    const ds = baseDs(LOC1);
    ({ container, root } = renderStoreDash(store, ds, baseSettings(), [store]));
    expect(tileByLabel(container, 'FOOD COST')).toBeTruthy();
    expect(tileByLabel(container, 'ACTION PLAN')).toBeTruthy();
    expect(container.textContent).not.toMatch(/REVENUE AT RISK/);
  });

  it('a SECOND store shows genuinely different, independently hand-verified Food Cost and Labor numbers (not a fixed/mock value)', () => {
    const store2 = makeStore(LOC2, {
      t: { tOepe: 180, tTpph: 90, tCrewLabor: 0.22, tFOBTarget: 0.028, tStatLoss: 0.001 },
    });
    const ds2 = baseDs(LOC2, { fobRowFn: fobRow2, laborWk: { needHrs: 300, actHrs: 300, darSchedHrs: 300 }, laborPct: 0.20 });
    ({ container, root } = renderStoreDash(store2, ds2, baseSettings(), [store2]));

    // fobPct = 1200/200000 = 0.60%, UNDER the 2.80% target (opposite branch from store 1).
    const food = tileByLabel(container, 'FOOD COST');
    expect(food.textContent).toContain('0.60%');
    expect(food.textContent).toContain('target 2.80%');
    expect(food.textContent).not.toContain('2.20%'); // store 1's number must not leak in

    // 20.00% actual vs 22.00% target -> UNDER target (opposite branch from store 1's over-target).
    const labor = tileByLabel(container, 'LABOR & SCHEDULING');
    expect(labor.textContent).toContain('20.00%');
    expect(labor.textContent).toContain('target 22.00%');
    expect(labor.textContent).not.toContain('30.00%');
  });
});

describe('dispatch #208 — Location Intelligence export addition (pure addition, no behavior change)', () => {
  let container, root;
  afterEach(() => {
    if (root) act(() => { root.unmount(); });
    container?.remove();
  });

  it('liComputeAll/liBuildRoadmap are now real, callable exports (were module-private before #208)', () => {
    const ds = { loaded: true, laborRows: [], opsRows: [] };
    const stats = liComputeAll('12345', ds, {});
    expect(stats).toBeTruthy();
    expect(stats.loc).toBe('12345');
    const roadmap = liBuildRoadmap(stats);
    expect(Array.isArray(roadmap)).toBe(true); // empty is a valid, real answer for empty ds
  });

  it('LocationIntelligence itself still renders exactly as before the export addition (embedded, no backdrop)', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(LocationIntelligence, {
        store: { loc: '3708' }, allStores: [{ loc: '3708' }], ds: { loaded: false }, settings: {},
        scope: 'store', embedded: true, onClose: () => {},
      }));
    });
    expect(container.textContent).toContain('Location Intelligence');
    const outer = container.firstElementChild;
    expect(outer.style.position).not.toBe('fixed');
  });
});
