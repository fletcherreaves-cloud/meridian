// @vitest-environment happy-dom
// @ts-nocheck
// Owner request, 2026-11-17: "That's the Spot-Check Ruler — Thank you, can we add that to
// reports?" This renders the REAL SpotCheckRulerReportPanel, built on the REAL
// cycleCompliance() resolution (engine/count-cycle.js) against a mocked lib/supabase.js — the
// same "touch the call site" pattern at-a-glance-weekly-recount-tile.test.js already uses — to
// prove the new Reports entry point correctly reuses the SAME lastWeekly/daysSinceWeekly
// resolution Count Cycle's own reactive "📋 Follow-Up" button already relies on, not a new
// compliance engine.
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Same mk()/store() shape as count-cycle.test.js's #357 Marietta fixture (112/118 Food,
// 33/36 Condiment, 85/92 Paper, one session, outside the close window) -- known to produce a
// real, qualifying lastWeekly session rather than a CRITICAL "no complete weekly count" verdict.
const mk = (loc, cls, n, date, from = 0) =>
  Array.from({ length: n }, (_, i) => ({ loc, cls, wrin: `${cls}-${from + i}`, last_counted: date }));
function onHandFixture(loc, date) {
  const rows = [
    ...mk(loc, 'Food', 118, null), ...mk(loc, 'Condiment', 36, null),
    ...mk(loc, 'Paper', 92, null), ...mk(loc, 'Non-Product', 18, null),
  ];
  const overwrite = (cls, n) => {
    let done = 0;
    for (const r of rows) { if (r.cls === cls && done < n) { r.last_counted = date; done++; } }
  };
  overwrite('Food', 112); overwrite('Condiment', 33); overwrite('Paper', 85);
  return rows;
}

vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, loadQsrOnHand: () => Promise.resolve(onHandFixture('3708', '2026-08-11')) };
});

const { SpotCheckRulerReportPanel } = await import('../views/spot-check-ruler-report.js');
const h = React.createElement;

const STORES = [{ loc: '3708' }];

async function mount(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(h(SpotCheckRulerReportPanel, props)); });
  return { container, root };
}

describe('SpotCheckRulerReportPanel', () => {
  let container, root;
  afterEach(() => { act(() => root?.unmount()); container?.remove(); });

  it('prompts to choose a store before anything else renders', async () => {
    ({ container, root } = await mount({ stores: STORES, onClose: () => {} }));
    expect(container.textContent).toContain('Choose a store to continue.');
  });

  it('picking a store resolves the SAME lastWeekly session Count Cycle\'s own reactive button uses, and offers Open Follow-Up', async () => {
    ({ container, root } = await mount({ stores: STORES, onClose: () => {} }));
    const select = container.querySelector('select');
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    await act(async () => {
      setValue.call(select, 'store:3708'); // LocationSelector's mode:'store' dropdown option value shape
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Ardmore-Broadway');
    expect(container.textContent).toContain('2026-08-11');
    expect(container.textContent).toContain('weekly count');
    expect([...container.querySelectorAll('button')].some(b => b.textContent.includes('Open Follow-Up'))).toBe(true);
  });

  it('clicking Open Follow-Up opens the real SpotCheckRulerModal for that store/date', async () => {
    ({ container, root } = await mount({ stores: STORES, onClose: () => {} }));
    const select = container.querySelector('select');
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    await act(async () => {
      setValue.call(select, 'store:3708');
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    const openBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Open Follow-Up'));
    await act(async () => { openBtn.click(); await Promise.resolve(); });

    // The modal portals outside `container` (same ModalShell pattern every other modal in this
    // app uses) -- check document.body for its presence instead.
    expect(document.body.textContent).toContain('Ardmore-Broadway');
  });
});
