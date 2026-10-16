// @vitest-environment happy-dom
// @ts-nocheck
// Reports redesign Phase 3 -- renders the REAL ReportsHub (category tabs + tiles + the embedded
// My Reports tab), not a mock. Verifies: tab strip shows every non-empty category plus My
// Reports, a direct-launch tile calls onOpenPanel with the real panel id, a subscribable tile
// calls onLaunchSubscription with the real report key, and the My Reports tab renders the real
// ReportSubscriptionsBody content (same component report-subscriptions.js's own tests exercise
// directly -- this just confirms the embedding wires it up, per "would this verification still
// pass if the wiring were reverted" discipline).
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { ReportsHub } from '../views/reports-hub.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const allowAll = () => true;

async function mount(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(ReportsHub, props)); });
  await act(async () => { await Promise.resolve(); }); // flush ReportSubscriptionsBody's loadReportSubs() microtask
  return { container, root };
}

function clickButtonWithText(container, text) {
  const btn = [...container.querySelectorAll('button')].find(b => b.textContent === text);
  expect(btn, `button "${text}" not found`).toBeTruthy();
  return btn;
}

describe('ReportsHub', () => {
  let container, root;
  afterEach(() => { act(() => root?.unmount()); container?.remove(); });

  it('renders the "All" tab, every populated category tab, and a "My Reports" tab', async () => {
    ({ container, root } = await mount({ can: allowAll, onOpenPanel: () => {}, onLaunchSubscription: () => {}, onClose: () => {} }));
    const text = container.textContent;
    expect(text).toContain('All (');
    expect(text).toContain('⭐ My Reports');
    for (const cat of ['Daily & Operations', 'Sales & Forecasting', 'Guest Experience', 'Labor & Payroll', 'Financial & Promotions', 'Leadership & Above-Store']) {
      expect(text).toContain(cat);
    }
  });

  it('the "All" view shows a tile for a direct-launch report (Loss Prevention Summary)', async () => {
    ({ container, root } = await mount({ can: allowAll, onOpenPanel: () => {}, onLaunchSubscription: () => {}, onClose: () => {} }));
    expect(container.textContent).toContain('Loss Prevention Summary');
  });

  it('clicking a direct-launch tile calls onOpenPanel with the panel\'s real registry id', async () => {
    const opened = [];
    ({ container, root } = await mount({ can: allowAll, onOpenPanel: (id) => opened.push(id), onLaunchSubscription: () => {}, onClose: () => {} }));
    const tile = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Loss Prevention Summary'));
    await act(async () => { tile.click(); });
    expect(opened).toEqual(['loss-prevention']);
  });

  it('clicking a subscribable tile calls onLaunchSubscription with the report\'s real key, not onOpenPanel', async () => {
    const opened = [];
    const launched = [];
    ({ container, root } = await mount({ can: allowAll, onOpenPanel: (id) => opened.push(id), onLaunchSubscription: (key) => launched.push(key), onClose: () => {} }));
    const tile = [...container.querySelectorAll('button')].find(b => b.textContent.includes('SMG VOICE'));
    await act(async () => { tile.click(); });
    expect(launched).toEqual(['smg-voice']);
    expect(opened).toEqual([]);
  });

  it('a permission denial removes that category\'s gated tile from the catalog (Pay Rate History under payroll.view)', async () => {
    const denyPayroll = (key) => key !== 'payroll.view';
    ({ container, root } = await mount({ can: denyPayroll, onOpenPanel: () => {}, onLaunchSubscription: () => {}, onClose: () => {} }));
    expect(container.textContent).not.toContain('Pay Rate History');
  });

  it('switching to the "My Reports" tab renders the real embedded ReportSubscriptionsBody (saved list + build-a-report form)', async () => {
    ({ container, root } = await mount({ can: allowAll, onOpenPanel: () => {}, onLaunchSubscription: () => {}, onClose: () => {} }));
    clickButtonWithText(container, '⭐ My Reports').click();
    await act(async () => { await Promise.resolve(); });
    expect(container.textContent).toContain('Build a report');
    expect(container.textContent).toMatch(/Saved \(\d+\)/);
    // the category tiles are gone while on this tab
    expect(container.textContent).not.toContain('Loss Prevention Summary');
  });

  it('onClose fires when the back button is clicked', async () => {
    let closed = false;
    ({ container, root } = await mount({ can: allowAll, onOpenPanel: () => {}, onLaunchSubscription: () => {}, onClose: () => { closed = true; } }));
    const backBtn = container.querySelector('button[aria-label="Back"]');
    expect(backBtn).toBeTruthy();
    await act(async () => { backBtn.click(); });
    expect(closed).toBe(true);
  });
});
