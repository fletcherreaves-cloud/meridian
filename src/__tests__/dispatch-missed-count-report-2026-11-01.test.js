// @vitest-environment happy-dom
// @ts-nocheck
// Owner req (2026-11-01): "a report to list out by location any items missed on the current
// count... date selectable as well as... location selectable as we generally do... All current
// counts should have the same count date, therefore if a date for last counted or last submitted
// is different or blank or n/a that would indicate it was not physically counted on the current
// count cycle... display grouped by class of product as well."
//
// Exercises the fix through the REAL EOMDashboardPanel -> Reports▾ -> "🗓 Missed on Current Count"
// chain (this repo's "would this verification still pass if reverted?" rule), same harness every
// other Reports▾-menu test this session already established.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

// '3708' = Ardmore-Broadway (MCDOK). Bulk Food/Condiment count day is 2026-10-29 (3 of 4 items);
// one Food item was missed (counted 10/27). One Non-Product item was missed (counted early,
// before the period's 10/31 last day). One deactivated item with an old date is correctly excluded.
const onHand = [
  { loc: '3708', wrin: 'f1', descr: 'Lettuce', cls: 'Food', onHandAmt: 40, active: true, lastCounted: '2026-10-29' },
  { loc: '3708', wrin: 'f2', descr: 'Beef Patties', cls: 'Food', onHandAmt: 120, active: true, lastCounted: '2026-10-29' },
  { loc: '3708', wrin: 'c1', descr: 'Ketchup', cls: 'Condiment', onHandAmt: 30, active: true, lastCounted: '2026-10-29' },
  { loc: '3708', wrin: 'f3', descr: 'Cheese Slices', cls: 'Food', onHandAmt: 60, active: true, lastCounted: '2026-10-27' },
  { loc: '3708', wrin: 'np1', descr: 'Napkins', cls: 'Non-Product', onHandAmt: 15, active: true, lastCounted: '2026-10-28' },
  { loc: '3708', wrin: 'old1', descr: 'Old BBQ Sauce (Deactivated)', cls: 'Condiment', onHandAmt: 5, active: false, lastCounted: '2026-09-01' },
];

// Historical-mode ("Force count date" set to a PAST date, owner req 2026-11-09) fixture:
// inv_count_sessions' own frozen missing_items for the exact (loc, count_date, cls) the test picks.
// '3708' Food session on 2026-10-27 froze 'f3' (Cheese Slices) as missing THAT day -- note this is
// a DIFFERENT fact than onHand's live state above (where f3 now reads lastCounted:'2026-10-27',
// i.e. counted exactly on 10/27) -- deliberately, since the whole point of the fix is that the
// frozen session is the one source that can't be silently overwritten by a later recount, so this
// test fixture must be free to disagree with the live onHand snapshot.
// vi.hoisted (not a bare `let` at module scope) -- vi.mock's factory is hoisted above the rest of
// this file by vitest's static transform, so a plain top-level `let` referenced only by closure
// would be read before its own initializer ran. Same pattern push-subscribe.test.js already uses.
const sessionsHolder = vi.hoisted(() => ({ rows: [] }));
vi.mock('../lib/supabase.js', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }), upsert: async () => ({ data: null, error: null }) }) },
  loadQsrOnHand: async () => onHand,
  loadInvCountSessions: async () => sessionsHolder.rows,
  loadQsrFob: async () => [],
  loadEomPeriods: async () => ['2026-10'],
  loadEomCountStatus: async () => [],
  saveEomCountStatus: async () => ({}),
  loadQsrVarianceStat: async () => [],
  loadQsrVarianceHistory: async () => [],
  loadQsrVarianceHistoryAll: async () => [],
  loadQsrWaste: async () => [],
  loadQsrTransfers: async () => [],
  loadQsrRawItemDetail: async () => [],
  loadQsrRawItemInfo: async () => [],
  loadEomDiagConfig: async () => null,
  saveEomDiagConfig: async () => ({}),
  triggerSync: async () => ({ ok: true }),
  saveEomItemDisposition: async () => ({}),
  loadEomItemDisposition: async () => [],
  loadSelfServeTowerLocs: async () => [],
  saveEomSnapshots: async () => ({}),
  loadEomSnapshots: async () => [],
  saveEomSecondaryReview: async () => ({}),
  loadEomSecondaryReview: async () => [],
  saveEomCountException: async () => ({}),
  deleteEomCountException: async () => ({}),
  loadEomCountExceptions: async () => ({}),
  createEomShareLink: async () => ({}),
  loadEbosMonthlyByStore: async () => ({}),
  loadEomDigestConfig: async () => ({ levels: ['district', 'patch'], sendHourUtc: 23 }),
  saveEomDigestConfig: async () => ({ saved: true }),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { EOMDashboardPanel } = await import('../views/eom-dashboard.js');

const STORES = [{ loc: '3708' }];

function mountRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

async function renderPanel(root) {
  await act(async () => {
    root.render(React.createElement(EOMDashboardPanel, { stores: STORES, ds: {}, settings: {}, onClose: () => {} }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  });
}

async function openReport(container) {
  const reportsBtn = [...container.querySelectorAll('button')].find(b => b.textContent.startsWith('Reports'));
  expect(reportsBtn, 'Reports▾ action menu button not found').toBeTruthy();
  await act(async () => { reportsBtn.click(); });
  const openBtn = [...document.querySelectorAll('button')].find(b => b.textContent === '🗓 Missed on Current Count');
  expect(openBtn, '🗓 Missed on Current Count item not found').toBeTruthy();
  await act(async () => { openBtn.click(); await Promise.resolve(); await Promise.resolve(); });
}

function modalCard(container) {
  const backdrop = [...document.querySelectorAll('div')].find(d => d.style.position === 'fixed' && d.textContent.includes('Missed on Current Count'));
  expect(backdrop, 'Missed on Current Count modal backdrop not found').toBeTruthy();
  return backdrop;
}

describe('Missed on Current Count report (owner req 2026-11-01)', () => {
  let container, root;
  beforeEach(() => {
    // eom-dashboard.js's defaultPeriod() shows the PRIOR month while now.getDate() <= 6 (early-
    // month grace window, "still closing"), else the real current month. This test's whole fixture
    // is anchored to October counts and relies on the panel defaulting to period '2026-10' — true
    // only through Nov 6. Pin the clock inside that window so this doesn't silently break every
    // month once the 7th arrives (exactly the class of bug dispatch #22 already fixed once).
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-03T12:00:00'));
    sessionsHolder.rows = [];
    ({ container, root } = mountRoot());
  });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.useRealTimers(); });

  it('opens from Reports▾ and lists only the items that miss the store\'s current count date, grouped by class', async () => {
    await renderPanel(root);
    await openReport(container);
    const card = modalCard(container);
    expect(card.textContent).toContain('Ardmore-Broadway');
    expect(card.textContent).toContain('Cheese Slices');  // missed Food item
    expect(card.textContent).toContain('Napkins');        // missed Non-Product item
    expect(card.textContent).not.toContain('Lettuce');    // counted on the current count date -- not missed
    expect(card.textContent).not.toContain('Old BBQ Sauce'); // deactivated -- excluded
    expect(card.textContent).toContain('2 items missed');
  });

  it('shows the detected per-store count date and a before/after reason per item', async () => {
    await renderPanel(root);
    await openReport(container);
    const card = modalCard(container);
    expect(card.textContent).toContain('this store\'s count date: Oct 29');
    expect(card.textContent).toMatch(/counted 2026-10-27, before this count/);
  });

  // Setting .value directly bypasses React's value tracker -- go through the native setter so the
  // SyntheticEvent system actually picks the change up, same pattern every date/text-input test in
  // this codebase that mutates a controlled input already uses.
  async function setForceDate(card, iso) {
    const dateInput = card.querySelector('input[type="date"]');
    expect(dateInput, 'Force count date input not found').toBeTruthy();
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    await act(async () => {
      nativeSetter.call(dateInput, iso);
      dateInput.dispatchEvent(new Event('input', { bubbles: true }));
      // Lets the lazy loadInvCountSessions() fetch (triggered by the date change) resolve and its
      // state updates flush, same multi-tick pattern renderPanel/openReport already use above.
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
  }

  it('a PAST Force count date reads the FROZEN inv_count_sessions snapshot, not today\'s live onHand re-anchored to that date', async () => {
    // Root-cause fixture: onHand (above) shows f3/Cheese Slices as counted exactly on 2026-10-27
    // (today's live state), but the 10/27 count SESSION itself froze a totally different item
    // (f1/Lettuce) as missing that day. Only the session read can tell the two apart -- the old
    // behavior (re-anchoring onHand) would have shown Cheese Slices as "on time" and said nothing
    // was missed that day, which is exactly the bug this fix closes.
    sessionsHolder.rows = [
      { loc: '3708', countDate: new Date('2026-10-27T00:00:00'), cls: 'Food', period: '2026-10', itemsCounted: 3, classTotal: 4, covered: true, sessionKind: 'bulk', updatedAt: '2026-10-27', missingItems: [{ wrin: 'f1', descr: 'Lettuce' }] },
    ];
    await renderPanel(root);
    await openReport(container);
    const card = modalCard(container);
    await setForceDate(card, '2026-10-27');
    expect(card.textContent).toContain('Lettuce');
    expect(card.textContent).not.toContain('Cheese Slices');
    expect(card.textContent).toContain('as of: Oct 27');
  });

  it('a class with no matching session row for the picked date says so plainly, instead of silently showing nothing or falling back to onHand', async () => {
    // No Condiment/Non-Product session rows at all for 2026-10-27 in this fixture -- only Food.
    sessionsHolder.rows = [
      { loc: '3708', countDate: new Date('2026-10-27T00:00:00'), cls: 'Food', period: '2026-10', itemsCounted: 3, classTotal: 4, covered: true, sessionKind: 'bulk', updatedAt: '2026-10-27', missingItems: [] },
    ];
    await renderPanel(root);
    await openReport(container);
    const card = modalCard(container);
    await setForceDate(card, '2026-10-27');
    expect(card.textContent).toMatch(/No count session on file for Condiment on Oct 27/);
    expect(card.textContent).toMatch(/No count session on file for Non-Product on Oct 27/);
    expect(card.textContent).not.toContain('Nothing missed in the current scope');
  });

  it('a pre-migration session row (missing_items null) is flagged as item-detail-unavailable, not treated as nothing missed', async () => {
    sessionsHolder.rows = [
      { loc: '3708', countDate: new Date('2026-10-27T00:00:00'), cls: 'Food', period: '2026-10', itemsCounted: 3, classTotal: 4, covered: true, sessionKind: 'bulk', updatedAt: '2026-10-27', missingItems: null },
    ];
    await renderPanel(root);
    await openReport(container);
    const card = modalCard(container);
    await setForceDate(card, '2026-10-27');
    expect(card.textContent).toMatch(/predates per-item tracking/);
  });

  it('clearing the Force count date returns to today\'s live onHand-based view', async () => {
    sessionsHolder.rows = [
      { loc: '3708', countDate: new Date('2026-10-27T00:00:00'), cls: 'Food', period: '2026-10', itemsCounted: 3, classTotal: 4, covered: true, sessionKind: 'bulk', updatedAt: '2026-10-27', missingItems: [{ wrin: 'f1', descr: 'Lettuce' }] },
    ];
    await renderPanel(root);
    await openReport(container);
    const card = modalCard(container);
    await setForceDate(card, '2026-10-27');
    expect(card.textContent).toContain('Lettuce');
    const clearBtn = [...card.querySelectorAll('button')].find(b => b.textContent === 'clear');
    expect(clearBtn, 'clear button not found').toBeTruthy();
    await act(async () => { clearBtn.click(); });
    expect(card.textContent).toContain('Cheese Slices');
    expect(card.textContent).toContain('Napkins');
    expect(card.textContent).toContain('this store\'s count date: Oct 29');
  });

  it('the Class Filter hides classes from the on-screen view (and the Copy/Print/CSV source) when narrowed', async () => {
    await renderPanel(root);
    await openReport(container);
    const card = modalCard(container);
    expect(card.textContent).toContain('Cheese Slices');
    expect(card.textContent).toContain('Napkins');
    const foodBtn = [...card.querySelectorAll('button')].find(b => b.textContent === 'Food');
    expect(foodBtn, 'Food class-filter pill not found').toBeTruthy();
    await act(async () => { foodBtn.click(); });
    expect(card.textContent).toContain('Cheese Slices');     // Food -- still shown
    expect(card.textContent).not.toContain('Napkins');       // Non-Product -- filtered out
    // Flip back to "All" and confirm it un-filters.
    const allBtn = [...card.querySelectorAll('button')].find(b => b.textContent.startsWith('All ('));
    expect(allBtn, 'All class-filter pill not found').toBeTruthy();
    await act(async () => { allBtn.click(); });
    expect(card.textContent).toContain('Napkins');
  });

  it('narrowing the Scope selector to a different state empties the report (no FL stores with any missed items in this fixture)', async () => {
    // View As Role scoping (2026-11-11) narrowed the Location selector's own option list to the
    // `stores` prop instead of every company store/state -- this test needs a real FL store
    // actually present in `stores` for the state:FL option to exist at all now, so it no longer
    // relies on the old always-both-states-regardless-of-scope picker. 6178 (Chipley-St Rd 77,
    // FL) has no onHand/missed-item rows in this fixture, so scoping to it still empties the
    // report, which is the behavior this test exists to prove.
    await act(async () => {
      root.render(React.createElement(EOMDashboardPanel, { stores: [...STORES, { loc: '6178' }], ds: {}, settings: {}, onClose: () => {} }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
    await openReport(container);
    const card = modalCard(container);
    // Location selector here renders as variant:'dropdown' (2026-11-02 rollout) -- a single
    // <select> with an optgroup per state, not a pill per state.
    const locSelect = [...card.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'state:FL'));
    expect(locSelect, 'Location dropdown with an FL state option not found').toBeTruthy();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(locSelect, 'state:FL');
      locSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(card.textContent).toContain('Nothing missed in the current scope');
  });
});
