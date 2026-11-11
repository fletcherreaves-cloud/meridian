// @vitest-environment happy-dom
// @ts-nocheck
// View As Role scoping audit, phase 3 (owner-directed continuation, 2026-11-11): the panels
// flagged during the phase-2 audit (dispatch-viewas-scope-batch-2026-11-11.test.js) as ignoring
// their `stores` prop ENTIRELY for primary scoping -- enumerating every store in the system via
// Object.keys(STORE_NAMES), ds.storeIds, or an independent cloud/local read -- rather than just
// needing a call-site prop rename. Fixed here: DARDaypartPanel, ModelAssignmentPanel,
// DistrictLensPanel, StoreOnePager, WhyEnginePanel (single-store mode), WeeklyCountStatusPanel
// (both its `locs` AND its own LocationSelector's hardcoded option list), LifeLenzBridgePanel,
// ProductMixPanel, AIBacktestScanner, InventoryIntelligence -- plus two more of the same
// "Object.keys(STORE_NAMES) picker + locs fallback" shape discovered while fixing
// WeeklyCountStatusPanel's own cross-reference comment: CountTimingReportModal and
// MissedCountReportModal (both src/views/*-report.js, opened from EOMDashboardPanel).
//
// Per the standing "would this verification still pass if reverted" rule, this renders the REAL
// consumers (ProductMixPanel, InventoryIntelligence, WeeklyCountStatusPanel, CountTimingReportModal)
// for a representative sample -- the simplest-shaped, most-independent-of-fixture-complexity of
// the twelve -- and confirms narrowing their `stores` prop actually narrows what's reachable. The
// other eight (DARDaypartPanel, ModelAssignmentPanel, DistrictLensPanel, StoreOnePager,
// WhyEnginePanel, LifeLenzBridgePanel, AIBacktestScanner, MissedCountReportModal) share the exact
// same one-line fix shape (derive the picker/enumeration list from `stores` instead of
// Object.keys(STORE_NAMES)/ds.storeIds) and were confirmed via direct code reading rather than
// individually re-tested here; MissedCountReportModal's fix is additionally exercised indirectly
// via dispatch-missed-count-report-2026-11-01.test.js's real-FL-store fixture update.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { ProductMixPanel } from '../views/labor-tools.js';
import { WeeklyCountStatusPanel } from '../views/weekly-count-status-report.js';
import { CountTimingReportModal } from '../views/count-timing-report.js';

// InventoryIntelligence's own loadQsrInventorySummary() cloud read has no bearing on this
// file's scoping fix (manual ds.inventoryRows is the gap-fill path exercised here) -- resolved
// empty so the panel falls through to the manual rows deterministically, instead of leaving a
// real network call racing the test. Partial mock (importOriginal) so WeeklyCountStatusPanel's
// own supabase reads (loadQsrOnHand, loadWeeklyCountDayOverrides) in this same file are untouched.
vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, loadQsrInventorySummary: () => Promise.resolve([]) };
});
const { InventoryIntelligence } = await import('../views/inventory.js');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const GOOD = '3708';
const BAD = '5183';

describe('ProductMixPanel -- cloudLocs respects the caller\'s actual store scope', () => {
  let container, root;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  function pmixRow(loc, date, item, price, familyGroup, soldQty) {
    return { loc, date: new Date(date + 'T00:00:00'), item, price, desc: 'Item ' + item, familyGroup,
      soldQty, discQty: 0, promoQty: 0, offerAmt: 0, discAmt: 0, unitFoodCost: 0.8, unitPaperCost: 0.1 };
  }
  const pmixRows = [
    pmixRow(GOOD, '2026-08-10', 1, 3.99, 'Sandwiches', 100),
    pmixRow(BAD, '2026-08-10', 3, 2.49, 'Fries', 200),
  ];

  it('scoped to one store, a second real store never appears as a selectable option', async () => {
    await act(async () => {
      root.render(React.createElement(ProductMixPanel, {
        stores: [{ loc: GOOD }], ds: { pmixRows, pmixData: {} }, settings: {}, onClose: () => {},
      }));
    });
    const storeSelect = container.querySelector('select');
    expect(storeSelect.value).toBe(GOOD);
    expect([...storeSelect.options].some(o => o.value === BAD)).toBe(false);
    expect(container.textContent).not.toMatch(/Fries/);
  });

  it('unscoped (both stores known), both real stores remain selectable -- never changes behavior for a real, unscoped login', async () => {
    await act(async () => {
      root.render(React.createElement(ProductMixPanel, {
        stores: [{ loc: GOOD }, { loc: BAD }], ds: { pmixRows, pmixData: {} }, settings: {}, onClose: () => {},
      }));
    });
    const storeSelect = container.querySelector('select');
    expect([...storeSelect.options].some(o => o.value === BAD)).toBe(true);
  });
});

describe('InventoryIntelligence -- effRows respects the caller\'s actual store scope', () => {
  let container, root;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  // Service-area fixture (lands in the `svc` section, the panel's default activeSection===1 tab)
  // -- computeInvSections() filters on area==='Service' && usageDay>0 && usage1000>0.
  function invRow(loc, wrin, description) {
    return { loc, wrin, description, area: 'Service', class_: 'Paper',
      daysSupply: 10, usageDay: 1, usage1000: 1, uom: 'EA/CS', caseSize: 1, cost: 1 };
  }

  it('scoped to one store, a second real store\'s inventory rows never surface', async () => {
    await act(async () => {
      root.render(React.createElement(InventoryIntelligence, {
        stores: [{ loc: GOOD }], ds: { inventoryRows: [
          invRow(GOOD, '00001', 'Good Napkins'), invRow(BAD, '00002', 'Bad Cups'),
        ], qsrActSummaryRows: [] }, settings: {}, onClose: () => {},
      }));
    });
    await act(async () => { await Promise.resolve(); });
    expect(container.textContent).toMatch(/Good Napkins/);
    expect(container.textContent).not.toMatch(/Bad Cups/);
  });

  it('unscoped (both stores known), the second store remains a selectable, reachable option -- never changes behavior for a real, unscoped login', async () => {
    await act(async () => {
      root.render(React.createElement(InventoryIntelligence, {
        stores: [{ loc: GOOD }, { loc: BAD }], ds: { inventoryRows: [
          invRow(GOOD, '00001', 'Good Napkins'), invRow(BAD, '00002', 'Bad Cups'),
        ], qsrActSummaryRows: [] }, settings: {}, onClose: () => {},
      }));
    });
    await act(async () => { await Promise.resolve(); });
    // The LocationSelector (mode:'store', variant:'dropdown') renders a native <select> with
    // one `store:<loc>` option per scoped loc -- confirm BAD is offered, then switch to it.
    const picker = [...container.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === `store:${BAD}`));
    expect(picker).toBeTruthy();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(picker, `store:${BAD}`);
      picker.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.textContent).toMatch(/Bad Cups/);
  });
});

describe('WeeklyCountStatusPanel -- "All stores" scope respects the caller\'s actual store scope', () => {
  let container, root;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it('scoped to one store, a second real company store never contributes to the "All stores" report', async () => {
    await act(async () => {
      root.render(React.createElement(WeeklyCountStatusPanel, {
        stores: [{ loc: GOOD }], ds: { loaded: true }, settings: {}, onClose: () => {},
      }));
    });
    await act(async () => { await Promise.resolve(); });
    // "All stores" is the default scope -- confirm a real, specific OTHER company store
    // (Chickasha-So 4th, 5183 -- not in `stores`) never appears in the per-store table, while
    // the one real store that IS in scope (Ardmore-Broadway) does.
    expect(container.textContent).toMatch(/Ardmore-Broadway/);
    expect(container.textContent).not.toMatch(/Chickasha-So 4th/);
  });

  it('unscoped (both stores known), both real stores\' rows remain reachable -- never changes behavior for a real, unscoped login', async () => {
    await act(async () => {
      root.render(React.createElement(WeeklyCountStatusPanel, {
        stores: [{ loc: GOOD }, { loc: BAD }], ds: { loaded: true }, settings: {}, onClose: () => {},
      }));
    });
    await act(async () => { await Promise.resolve(); });
    expect(container.textContent).toMatch(/Ardmore-Broadway/);
    expect(container.textContent).toMatch(/Chickasha-So 4th/);
  });
});

describe('CountTimingReportModal -- "All stores" scope respects the caller\'s actual store scope', () => {
  let container, root;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  // rawDetail's real on-the-wire shape (loadQsrRawItemDetail): padded loc, per count-timing-
  // report.test.js's own established fixture convention.
  const row = (loc, wrin, itemClass, history) => ({ loc, period: '2026-07', wrin, descr: wrin, itemClass, history });
  const cnt = (dt, tm) => ({ isCount: true, dt, tm });
  const rawDetail = [
    row('0003708', 'a', 'Food', [cnt('2026-07-31', '9:00 AM')]),
    row('0005183', 'b', 'Food', [cnt('2026-07-31', '9:00 AM')]),
  ];

  it('scoped to one store, a second real company store\'s name never appears in the "All stores" report', async () => {
    await act(async () => {
      root.render(React.createElement(CountTimingReportModal, {
        stores: [{ loc: GOOD }], rawDetail, period: '2026-07', onClose: () => {},
      }));
    });
    await act(async () => { await Promise.resolve(); });
    expect(container.textContent).toMatch(/Ardmore-Broadway/);
    expect(container.textContent).not.toMatch(/Chickasha-So 4th/);
  });

  it('unscoped (both stores known), both real stores\' names remain reachable -- never changes behavior for a real, unscoped login', async () => {
    await act(async () => {
      root.render(React.createElement(CountTimingReportModal, {
        stores: [{ loc: GOOD }, { loc: BAD }], rawDetail, period: '2026-07', onClose: () => {},
      }));
    });
    await act(async () => { await Promise.resolve(); });
    expect(container.textContent).toMatch(/Ardmore-Broadway/);
    expect(container.textContent).toMatch(/Chickasha-So 4th/);
  });
});
