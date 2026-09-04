// @vitest-environment happy-dom
// @ts-nocheck
// 2026-09-01 (owner req): "I would like to see the share link expanded to work with weekly
// counts." Real render test (per this repo's "would this verification still pass if reverted"
// standing rule): drives the actual CountCycleSection -> StoreCard -> real "🔗 Share" button
// click -> real createEomShareLink() call, not an isolated call to
// formatWeeklyComplianceReport() or createWeeklyShare() in isolation. Proves the wiring reaches
// the real UI, with the exact `period` shape (`wk:YYYY-MM-DD`) eom-share-view.js's own
// isMonthlyPeriod() gate depends on to skip the EOM-only refresh action for these links.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const createEomShareLink = vi.fn(async () => ({ token: '66666666-6666-6666-6666-666666666666', error: null }));

vi.mock('../lib/supabase.js', () => ({ createEomShareLink }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { CountCycleSection } = await import('../views/count-cycle-panel.js');

// Real qsr_onhand-shaped rows: a full Food+Condiment weekly session for store 3708
// (Ardmore-Broadway, a real STORE_NAMES entry) so cycleCompliance() grades it 'on cycle' with
// real session history for formatWeeklyComplianceReport() to render.
const mk = (loc, cls, n, date) => Array.from({ length: n }, (_, i) => ({ loc, cls, wrin: `${cls}-${i}`, last_counted: date }));
const ROWS = [
  ...mk('3708', 'Food', 118, '2026-08-25'),
  ...mk('3708', 'Condiment', 36, '2026-08-25'),
];

function mountRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

async function renderPanel(root) {
  await act(async () => {
    root.render(React.createElement(CountCycleSection, { rows: ROWS, period: '2026-08' }));
    await Promise.resolve(); await Promise.resolve();
  });
}

describe('Count Cycle — "🔗 Share" button creates a weekly-shaped share link', () => {
  // cycleCompliance() grades the fixture's last_counted:'2026-08-25' against `new Date()`
  // ("today") using a 9-day WEEKLY_DUE_DAYS cutoff (count-cycle.js) -- with no pinned clock this
  // test silently flips from "on cycle" to "overdue" (and the "Show N stores on cycle" toggle
  // this test depends on stops rendering at all) the moment wall-clock today passes 2026-09-03.
  // Pin the clock well inside the compliant window so the fixture's story stays true regardless
  // of when the suite actually runs.
  beforeEach(() => { createEomShareLink.mockClear(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-08-28T12:00:00')); });
  afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers(); });

  // The fixture store is fully compliant ("on cycle") -- CountCycleSection's own exceptions-first
  // design collapses every clean store behind a "▸ Show N stores on cycle" toggle by default (a
  // screen that opens on green rows buries the ones that actually need chasing), so a real render
  // test has to open that toggle before the card -- and its Share button -- exist in the DOM at all.
  async function expandCleanCard(container) {
    const showCleanBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Show') && b.textContent.includes('stores on cycle'));
    expect(showCleanBtn, '"Show N stores on cycle" toggle not found').toBeTruthy();
    await act(async () => { showCleanBtn.click(); });

    // Click the store-number SPAN, not a `div` match -- querySelectorAll('div') returns the
    // header's own OUTER wrapper div before the actual onClick div nested inside it (both have
    // identical textContent while collapsed, since the expanded body renders null), and
    // dispatching .click() directly on an ancestor does not invoke a descendant's own handler. A
    // leaf span's click bubbles up through the real onClick div correctly.
    const numberSpan = [...container.querySelectorAll('span')].find(s => s.textContent.trim() === '#3708');
    expect(numberSpan, 'store-number span (#3708) not found').toBeTruthy();
    await act(async () => { numberSpan.click(); });
  }

  it('clicking Share on a store card calls createEomShareLink with a wk:-period, no FOB, and the real compliance report as the body', async () => {
    const { container, root } = mountRoot();
    await renderPanel(root);
    await expandCleanCard(container);

    const shareBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('🔗 Share'));
    expect(shareBtn, '🔗 Share button not found on the expanded card').toBeTruthy();
    await act(async () => { shareBtn.click(); await Promise.resolve(); await Promise.resolve(); });

    expect(createEomShareLink).toHaveBeenCalledTimes(1);
    const call = createEomShareLink.mock.calls[0][0];
    expect(call.loc).toBe('3708');
    expect(call.period).toMatch(/^wk:\d{4}-\d{2}-\d{2}$/); // NOT a monthly 'YYYY-MM' period
    expect(call.fob).toBeNull(); // no FOB angle for a Count Cycle link
    expect(call.title).toMatch(/Count Cycle/);
    expect(call.title).toMatch(/Ardmore-Broadway/);
    expect(call.recapMd).toMatch(/# Count Cycle — .*Ardmore-Broadway/);
    expect(call.recapMd).toMatch(/Status: On cycle/);
    expect(call.fullMd).toBe(call.recapMd); // one report, not a separate recap/full split (unlike EOM)

    root.unmount();
  });

  it('shows a "link copied" confirmation after a successful share', async () => {
    const { container, root } = mountRoot();
    await renderPanel(root);
    await expandCleanCard(container);

    const shareBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('🔗 Share'));
    await act(async () => { shareBtn.click(); await Promise.resolve(); await Promise.resolve(); });

    expect(container.textContent).toMatch(/✓.*Ardmore-Broadway/);
    root.unmount();
  });
});
