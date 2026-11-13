// @vitest-environment happy-dom
// @ts-nocheck
// Render-level test for DailyReviewPanel's new Store/Patch toggle (2026-11-13 night) — real
// engine, real ds rows, no metric-source mocking (daily-review-panel.test.js's own convention),
// since this proves the PANEL actually wires buildPatchDailyReview/buildPatchHotspots into real
// UI, not just that the pure engine functions work in isolation.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

vi.mock('../lib/supabase.js', () => ({ loadDtHistory: vi.fn().mockResolvedValue([]) }));

const { DailyReviewPanel } = await import('../views/daily-review.js');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Two real stores from the same real patch (constants.js DEF_SETTINGS.supervisorGroups —
// 'Ashley Podroza': ['5985','10422','33109']) so patchesWithin() finds a real group.
const STORES = [{ loc: '5985' }, { loc: '10422' }];
const ds = {
  loaded: true,
  qsrActSummaryRows: [
    { loc: '5985', date: new Date(2026, 10, 10), sales: 9000, gc: 250, oepe: 130, r2p: 90, kvst: 42 },
    { loc: '10422', date: new Date(2026, 10, 10), sales: 11000, gc: 300, oepe: 140, r2p: 95, kvst: 45 },
  ],
  ctrlRows: [
    { loc: '5985', date: new Date(2026, 10, 10), laborPct: 0.19, tpph: 5.2, discPct: 0.01 },
    { loc: '10422', date: new Date(2026, 10, 10), laborPct: 0.25, tpph: 5.0, discPct: 0.02 },
  ],
  fobRows: [
    { loc: '5985', date: new Date(2026, 10, 10), compWaste: 0.001, rawWaste: 0.002, condiment: 0.018, empMeal: 0.001, statVar: 0.01, unexplained: 0 },
    { loc: '10422', date: new Date(2026, 10, 10), compWaste: 0.003, rawWaste: 0.004, condiment: 0.019, empMeal: 0.002, statVar: 0.012, unexplained: 0 },
  ],
};

describe('DailyReviewPanel — Patch scope toggle', () => {
  let container, root;
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  async function mount() {
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    await act(async () => { root.render(React.createElement(DailyReviewPanel, { ds, stores: STORES, onClose: () => {} })); });
    await act(async () => { await Promise.resolve(); });
  }

  it('defaults to Store scope and offers a Patch toggle when the stores span a real patch', async () => {
    await mount();
    const patchBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Patch');
    expect(patchBtn, 'Patch toggle button not found').toBeTruthy();
  });

  it('switching to Patch scope renders the window tabs, aggregated sections, and the hotspot table', async () => {
    await mount();
    const patchBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Patch');
    await act(async () => { patchBtn.click(); });
    await act(async () => { await Promise.resolve(); });

    expect(container.textContent).toContain('Today');
    expect(container.textContent).toContain('WTD');
    expect(container.textContent).toContain('MTD');
    expect(container.textContent).toContain('Sales');
    expect(container.textContent).toContain('Stores — worst first');
    expect(container.textContent).toContain('2 stores in this patch');
  });

  it('clicking a store in the hotspot table switches back to Store scope on that store', async () => {
    await mount();
    const patchBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Patch');
    await act(async () => { patchBtn.click(); });
    await act(async () => { await Promise.resolve(); });

    const row = [...container.querySelectorAll('div')].find(d => d.style.cursor === 'pointer');
    expect(row, 'no clickable hotspot row rendered').toBeTruthy();
    await act(async () => { row.click(); });
    await act(async () => { await Promise.resolve(); });

    // Patch-only content (window tabs, hotspot table) is gone — back on the single-store view.
    expect(container.textContent).not.toContain('Stores — worst first');
    expect(container.textContent).not.toContain('WTD');
  });
});
