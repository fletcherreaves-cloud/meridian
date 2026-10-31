// @vitest-environment happy-dom
// @ts-nocheck
// Owner req (2026-10-31), looking at a single store's 🔬 Food-Cost Diagnosis "⏱ Last count ..."
// line: "put me together a report that shows the Last count data for all locations... sortable
// with our selector... allow me to select monthly and/or weekly counts to be able to display the
// past trend of whether the stores are performing inventory as trained or if they are submitting
// all at once."
//
// Exercises the fix through the REAL EOMDashboardPanel -> Reports▾ -> "⏱ Count Timing Report"
// chain (this repo's "would this verification still pass if reverted?" rule), same harness every
// other Reports▾-menu test this session already established.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

// '3708' = Ardmore-Broadway (MCDOK) — a real, spread-out ("trained") count across 3 real sessions
// this period. '6178' = Chipley FL — a real, single bulk-submitted ("rushed") count.
const cnt = (dt, tm) => ({ isCount: true, dt, tm, source: 'inventory' });
const rawDetail = [
  // 3708: three distinct count days, real time spans each day -> "spread out", 3 sessions.
  { loc: '0003708', wrin: 'f1', descr: 'Food 1', history: [cnt('2026-10-08', '6:00 AM'), cnt('2026-10-08', '6:40 AM')] },
  { loc: '0003708', wrin: 'f2', descr: 'Food 2', history: [cnt('2026-10-15', '6:05 AM'), cnt('2026-10-15', '6:45 AM')] },
  { loc: '0003708', wrin: 'f3', descr: 'Food 3', history: [cnt('2026-10-29', '7:00 AM'), cnt('2026-10-29', '7:50 AM')] },
  // 6178: every item counted at the SAME instant on the same day -> "bulk-submit", 1 session.
  { loc: '0006178', wrin: 'c1', descr: 'Cond 1', history: [cnt('2026-10-29', '10:00 PM')] },
  { loc: '0006178', wrin: 'c2', descr: 'Cond 2', history: [cnt('2026-10-29', '10:00 PM')] },
  { loc: '0006178', wrin: 'c3', descr: 'Cond 3', history: [cnt('2026-10-29', '10:00 PM')] },
];

vi.mock('../lib/supabase.js', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }), upsert: async () => ({ data: null, error: null }) }) },
  loadQsrOnHand: async () => ([
    { loc: '3708', wrin: 'f1', descr: 'Food 1', cls: 'Food', onHandAmt: 10, active: true, lastCounted: '2026-10-29' },
    { loc: '6178', wrin: 'c1', descr: 'Cond 1', cls: 'Condiment', onHandAmt: 10, active: true, lastCounted: '2026-10-29' },
  ]),
  loadQsrFob: async () => [],
  loadEomPeriods: async () => ['2026-10'],
  loadEomCountStatus: async () => [],
  saveEomCountStatus: async () => ({}),
  loadQsrVarianceStat: async () => [],
  loadQsrVarianceHistory: async () => [],
  loadQsrVarianceHistoryAll: async () => [],
  loadQsrWaste: async () => [],
  loadQsrTransfers: async () => [],
  loadQsrRawItemDetail: async () => rawDetail,
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

const STORES = [{ loc: '3708' }, { loc: '6178' }];

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
  const openBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '⏱ Count Timing Report');
  expect(openBtn, '⏱ Count Timing Report item not found').toBeTruthy();
  await act(async () => { openBtn.click(); await Promise.resolve(); await Promise.resolve(); });
}

function modalCard(container) {
  const backdrop = [...document.querySelectorAll('div')].find(d => d.style.position === 'fixed' && d.textContent.includes('Count Timing Report'));
  expect(backdrop, 'Count Timing Report modal backdrop not found').toBeTruthy();
  return backdrop;
}

describe('Count Timing Report (owner req 2026-10-31)', () => {
  let container, root;
  beforeEach(() => { ({ container, root } = mountRoot()); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('opens from Reports▾ and shows every store\'s last count, sortable, with the Scope selector', async () => {
    await renderPanel(root);
    await openReport(container);
    const card = modalCard(container);
    expect(card.textContent).toContain('All Locations'); // LocationSelector present
    expect(card.textContent).toContain('Ardmore-Broadway');
    expect(card.textContent).toContain('Chipley');
    // Ardmore-Broadway's real spread-out session (6:00 -> 6:40 AM, 40m) reads as Spread out.
    expect(card.textContent).toContain('✅ Spread out');
    // Chipley's bulk-submitted session (all 10:00 PM) reads as Bulk-submit.
    expect(card.textContent).toContain('⚠ Bulk-submit');
  });

  it('clicking the Duration header sorts the table by duration', async () => {
    await renderPanel(root);
    await openReport(container);
    const card = modalCard(container);
    const th = [...card.querySelectorAll('th')].find(t => t.textContent.startsWith('Duration'));
    expect(th, 'Duration column header not found').toBeTruthy();
    await act(async () => { th.click(); });
    const rowsAfter = [...card.querySelectorAll('tbody tr')].map(r => r.textContent);
    // Chipley (0m duration, bulk) and Ardmore (50m on its last session, 10/29) -- ascending puts
    // the shorter duration first.
    const chipleyIdx = rowsAfter.findIndex(t => t.includes('Chipley'));
    const ardmoreIdx = rowsAfter.findIndex(t => t.includes('Ardmore-Broadway'));
    expect(chipleyIdx).toBeLessThan(ardmoreIdx);
  });

  it('"This period\'s sessions" mode shows all 3 of Ardmore-Broadway\'s real sessions, not just the last one', async () => {
    await renderPanel(root);
    await openReport(container);
    const card = modalCard(container);
    const select = [...card.querySelectorAll('select')][0];
    await act(async () => { select.value = 'sessions'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    const ardmoreRows = [...card.querySelectorAll('tbody tr')].filter(r => r.textContent.includes('Ardmore-Broadway'));
    expect(ardmoreRows.length).toBe(3);
    expect(ardmoreRows.every(r => r.textContent.includes('✅ Spread out'))).toBe(true);
    const chipleyRows = [...card.querySelectorAll('tbody tr')].filter(r => r.textContent.includes('Chipley'));
    expect(chipleyRows.length).toBe(1);
    expect(chipleyRows[0].textContent).toContain('⚠ Bulk-submit');
  });

  it('narrowing the Scope selector to one store narrows the report to that store only', async () => {
    await renderPanel(root);
    await openReport(container);
    const card = modalCard(container);
    const okBtn = [...card.querySelectorAll('button')].find(b => b.textContent === 'OK');
    expect(okBtn, 'OK state pill not found').toBeTruthy();
    await act(async () => { okBtn.click(); });
    // mode:'full' renders the WHOLE address book as navigable pills regardless of selection
    // (e.g. "Chipley-St Rd 77" still appears as a pill label) -- only the table body itself is
    // expected to narrow, so scope the assertion there, not the whole modal card.
    const tbody = card.querySelector('tbody');
    expect(tbody.textContent).toContain('Ardmore-Broadway');
    expect(tbody.textContent).not.toContain('Chipley');
  });
});
