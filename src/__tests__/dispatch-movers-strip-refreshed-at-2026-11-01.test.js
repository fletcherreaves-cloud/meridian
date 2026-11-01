// @vitest-environment happy-dom
// @ts-nocheck
// Owner req (2026-11-01), from a screenshot of the Home panel's "Today's Movers" strip: "can we
// simply add time of the most recent data for that as well." Measured live against
// qsr_daily_activity_rollup (service-role curl, 2026-11-01): the table carries a real
// `refreshed_at` timestamptz, written by scripts/qsrsoft-dar-pull.mjs's refreshRollup() on every
// pull — a current row read 2026-11-01T19:17:05Z, matching the ~2pm CT intraday DAR slot. The
// hourly fallback table (qsr_daily_activity) has NO such column (confirmed live, 42703), so a
// row built from that path has no refreshedAt and the strip must fall back to date-only, exactly
// as it did before this change.
//
// Renders the REAL AtAGlance -> Today's Movers strip call site (this repo's "verification must
// touch the call site" rule), not just a standalone computation.
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, loadQsrRawItemDetail: () => Promise.resolve([]), loadQsrVarianceStat: () => Promise.resolve([]) };
});

const { AtAGlance } = await import('../views/at-a-glance.js');
const h = React.createElement;
const NOOP = () => {};

const baseProps = {
  stores: [{ loc: '3708' }, { loc: '6178' }],
  settings: { weekStartDay: 3 },
  userEvents: [], lockedProjections: {},
  dateRange: { s: new Date(2026, 10, 1), e: new Date(2026, 10, 1), label: 'Today' },
  onOpenStore: NOOP, onCoachingSaved: NOOP, onOpenProjections: NOOP,
  onOpenPVSA: NOOP, onOpenBrief: NOOP, onNav: NOOP, onOpenModal: NOOP,
};

// A real "mover" row needs: salesVsLYPct set + lySales>=1000 + |salesVsLYPct|<=200 (comp guard).
function moverRow(loc, { date, salesVsLYPct, refreshedAt }) {
  return {
    loc, date, salesVsLYPct, lySales: 10000, sales: 10000 * (1 + salesVsLYPct / 100),
    _dtCars: 0, _dtTotal: 0, refreshedAt: refreshedAt ?? null,
  };
}

function render(qsrActSummaryRows) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(h(AtAGlance, { ...baseProps, ds: { loaded: true, qsrActSummaryRows } }));
  });
  return { container, root };
}

describe('Today\'s Movers strip — refreshed-at time', () => {
  let container, root;
  afterEach(() => { if (root) act(() => { root.unmount(); }); container?.remove(); container = null; root = null; });

  it('shows "updated <time>" when the rollup row carries a real refreshed_at', async () => {
    const refreshedAt = new Date('2026-11-01T19:17:05.428Z');
    const rows = [
      moverRow('3708', { date: new Date(2026, 10, 1), salesVsLYPct: 28.29, refreshedAt }),
      moverRow('6178', { date: new Date(2026, 10, 1), salesVsLYPct: -18.65, refreshedAt }),
    ];
    ({ container, root } = render(rows));
    const strip = [...container.querySelectorAll('div')].find(d => d.textContent.includes("Today’s Movers"));
    expect(strip).toBeTruthy();
    expect(strip.textContent).toContain('as of Nov 1');
    expect(strip.textContent).toContain('updated');
    expect(strip.textContent).toMatch(/updated \d{1,2}:\d{2}\s?(AM|PM)/);
  });

  it('falls back to date-only (no "updated" text) when no row has a refreshedAt — the hourly-fallback path', async () => {
    const rows = [
      moverRow('3708', { date: new Date(2026, 10, 1), salesVsLYPct: 28.29 }),
      moverRow('6178', { date: new Date(2026, 10, 1), salesVsLYPct: -18.65 }),
    ];
    ({ container, root } = render(rows));
    const strip = [...container.querySelectorAll('div')].find(d => d.textContent.includes("Today’s Movers"));
    expect(strip).toBeTruthy();
    expect(strip.textContent).toContain('as of Nov 1');
    expect(strip.textContent).not.toContain('updated');
  });

  it('uses the MAX refreshedAt across rows when stores were written at slightly different times', async () => {
    const earlier = new Date('2026-11-01T14:05:00.000Z');
    const later = new Date('2026-11-01T19:17:05.428Z');
    const rows = [
      moverRow('3708', { date: new Date(2026, 10, 1), salesVsLYPct: 28.29, refreshedAt: earlier }),
      moverRow('6178', { date: new Date(2026, 10, 1), salesVsLYPct: -18.65, refreshedAt: later }),
    ];
    ({ container, root } = render(rows));
    const strip = [...container.querySelectorAll('div')].find(d => d.textContent.includes("Today’s Movers"));
    // 19:17 UTC renders as a specific local time depending on the test runner's TZ; assert the
    // EARLIER 14:05 time's hour does NOT win by checking the strip picked the later timestamp's
    // literal ISO hour against the same toLocaleTimeString the component itself uses.
    const expected = later.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    expect(strip.textContent).toContain('updated ' + expected);
  });
});
