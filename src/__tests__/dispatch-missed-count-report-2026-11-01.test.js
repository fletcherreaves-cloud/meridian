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

vi.mock('../lib/supabase.js', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }), upsert: async () => ({ data: null, error: null }) }) },
  loadQsrOnHand: async () => onHand,
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
  const openBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '🗓 Missed on Current Count');
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
  beforeEach(() => { ({ container, root } = mountRoot()); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

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

  it('the Force count date override changes which items read as missed', async () => {
    await renderPanel(root);
    await openReport(container);
    const card = modalCard(container);
    const dateInput = card.querySelector('input[type="date"]');
    expect(dateInput, 'Force count date input not found').toBeTruthy();
    // Setting .value directly bypasses React's value tracker -- go through the native setter so
    // the SyntheticEvent system actually picks the change up, same pattern every date/text-input
    // test in this codebase that mutates a controlled input already uses.
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    await act(async () => {
      nativeSetter.call(dateInput, '2026-10-27');
      dateInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    // Forcing the anchor to 10/27 flips which items read as missed -- now the 10/29-counted ones do.
    expect(card.textContent).toContain('Lettuce');
    expect(card.textContent).not.toContain('Cheese Slices');
  });

  it('narrowing the Scope selector to a different state empties the report (no FL stores in this fixture)', async () => {
    await renderPanel(root);
    await openReport(container);
    const card = modalCard(container);
    const flBtn = [...card.querySelectorAll('button')].find(b => b.textContent === 'FL');
    expect(flBtn, 'FL state pill not found').toBeTruthy();
    await act(async () => { flBtn.click(); });
    expect(card.textContent).toContain('Nothing missed in the current scope');
  });
});
