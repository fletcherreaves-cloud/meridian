// @vitest-environment happy-dom
// @ts-nocheck
// Notes 75 (2026-11-12 night) — render-level test for the real DailyReviewPanel, not just the
// pure engine (daily-review.test.js already covers that). Per CLAUDE.md's "would this still
// pass if reverted" standard: proves the panel actually calls buildDailyReview() and renders
// real section/line content, not just that the engine itself works in isolation.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const loadDtHistoryMock = vi.fn().mockResolvedValue([]);
vi.mock('../lib/supabase.js', () => ({ loadDtHistory: (...a) => loadDtHistoryMock(...a) }));

const { DailyReviewPanel } = await import('../views/daily-review.js');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('DailyReviewPanel', () => {
  let container, root;
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  const ds = {
    loaded: true,
    qsrActSummaryRows: [{ loc: '10422', date: new Date(2026, 10, 10), sales: 11000, gc: 300, oepe: 140, r2p: 95, kvst: 45 }],
    ctrlRows: [{ loc: '10422', date: new Date(2026, 10, 10), laborPct: 0.25, tpph: 5.0, discPct: 0.02 }],
    fobRows: [{ loc: '10422', date: new Date(2026, 10, 10), compWaste: 0.003, rawWaste: 0.004, condiment: 0.019, empMeal: 0.002, statVar: 0.012, unexplained: 0 }],
  };
  const stores = [{ loc: '10422' }];

  it('renders real section cards with real line content for the real engine output', async () => {
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    await act(async () => { root.render(React.createElement(DailyReviewPanel, { ds, stores, onClose: () => {} })); });
    await act(async () => { await Promise.resolve(); });

    expect(container.textContent).toContain('Daily Review');
    expect(container.textContent).toContain('Sales');
    expect(container.textContent).toContain('Service');
    expect(container.textContent).toContain('Controls — Labor');
    expect(container.textContent).toContain('Controls — Cash');
    expect(container.textContent).toContain('FOB');
    expect(container.textContent).toContain('Product Sales');
    expect(container.textContent).toContain('OEPE W/O Parked');
    expect(container.textContent).toContain('Punched Labor %');
  });

  it('stepping to the prior day re-fetches the daypart history for the new date', async () => {
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    await act(async () => { root.render(React.createElement(DailyReviewPanel, { ds, stores, onClose: () => {} })); });
    await act(async () => { await Promise.resolve(); });
    const callsBefore = loadDtHistoryMock.mock.calls.length;

    const prior = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Prior Day'));
    expect(prior, 'Prior Day button not found').toBeTruthy();
    await act(async () => { prior.click(); });
    await act(async () => { await Promise.resolve(); });

    expect(loadDtHistoryMock.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});
