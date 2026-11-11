// @vitest-environment happy-dom
// @ts-nocheck
// Fresh-eyes role audit (2026-11-11, memory/finding-fresh-eyes-role-audit-2026-11-11.md §2 Q9):
// "Controls outliers already surfaces 'who and when' for a patch -- genuinely good data,
// currently only inside Above-Store One-Pager's text brief, not its own dashboard... promote it
// to its own visual card (sparkline of the outlier days, not just a text line)." Renders the REAL
// AboveStoreOnePager (this project's "verification must touch the call site" standing rule), same
// mount pattern as dispatch-190-onepager-merge.test.js, so a revert of the card's wiring (not just
// buildControlsOutliers itself, already covered by one-pager-data.test.js) would fail this.
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadQsrFob: async () => [],
    loadActionItems: async () => [],
    saveOnePager: async () => ({}),
    saveActionItem: async () => ({}),
    updateActionItem: async () => ({}),
  };
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { AboveStoreOnePager } = await import('../views/above-store-onepager.js');

describe('Above-Store One-Pager — Controls outliers visual card', () => {
  let container, root;
  afterEach(() => { act(() => { root?.unmount(); }); container?.remove(); });

  it('renders the "Worst Store-Days" card with the worst offending store/day/value when the scope has real outliers', async () => {
    const ds = { ctrlRows: [
      { loc: '3708', date: '2026-06-02', cashOSPct: 0.01,  tRedAPct: 0.02, discPct: 0.00 },
      { loc: '5183', date: '2026-06-03', cashOSPct: -0.09, tRedAPct: 0.00, discPct: 0.00 }, // worst cash O/S (abs)
      { loc: '3708', date: '2026-06-04', cashOSPct: 0.00,  tRedAPct: 0.00, discPct: 0.12 }, // worst discount
    ] };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(AboveStoreOnePager, {
        ds, settings: {}, userEvents: {}, eventImpact: {}, onClose: () => {},
        initialPeriod: 'custom', initialCustomRange: { s: '2026-06-01', e: '2026-06-30' },
      }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
    const text = container.textContent;
    expect(text).toContain('🚨 Worst Store-Days');
    expect(text).toContain('Ardmore-Broadway'); // 3708
    expect(text).toContain('Chickasha');        // 5183
    expect(text).toContain('06-03');            // worst cash O/S day
    expect(text).toContain('06-04');            // worst discount day
    // The old run-on text-line rendering ("↳ Store MM-DD val · Store MM-DD val") is gone.
    expect(text).not.toContain('↳');
  });

  it('renders nothing from the card when the scope has no offending days (all clean/zero)', async () => {
    const ds = { ctrlRows: [
      { loc: '3708', date: '2026-06-02', cashOSPct: 0, tRedAPct: 0, discPct: 0 },
    ] };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(AboveStoreOnePager, {
        ds, settings: {}, userEvents: {}, eventImpact: {}, onClose: () => {},
        initialPeriod: 'custom', initialCustomRange: { s: '2026-06-01', e: '2026-06-30' },
      }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
    expect(container.textContent).not.toContain('Worst Store-Days');
  });
});
