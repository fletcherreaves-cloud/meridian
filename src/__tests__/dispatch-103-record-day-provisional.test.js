// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #103 -- Record Day Intelligence could flag a same-day, still-accumulating value as
// a confirmed "New Record" (reproduced exactly for Tecumseh's 2026-08-24 95s OEPE: correct
// math over a day whose DAR rows only covered through 15:00; the owner's own later export had
// two more, slower, hours that would very likely have pushed the true full-day number worse).
//
// Renders the REAL RecordDayPanel/RecentBreakersTab consumer (not an isolated helper), per this
// repo's "would this verification still pass if reverted?" standing rule -- a test that only
// imports computeRecords could pass unchanged with the panel's rendering of `isProvisional`
// deleted. Mocks src/engine/metric-source.js the same way forms-panel.test.js mocks its loader,
// and fakes the system clock (matching di-compare-week-anchor.test.js's pattern) instead of
// threading a `now` parameter through computeRecords, since businessDate() already reads
// `new Date()` internally and re-deriving the cutover here would violate the same standing rule
// the fix itself relies on.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LOC = '33704'; // Tecumseh

// Fixture: an old best (97s, outside the 60-day window so it never appears in Recent Breaks),
// a genuinely CLOSED day inside the window that legitimately breaks it (90s, five days before
// "today"), and TODAY -- still-open, partial data -- at 85s, which beats the 90s closed-day
// record on paper but must not be allowed to become the confirmed all-time best, exactly the
// Tecumseh OEPE scenario: a fast partial reading that a slower, not-yet-landed remainder of the
// day would very likely erase.
const OLD_BEST_DK   = '2026-06-01'; // outside window, sets the initial best
const CLOSED_DK     = '2026-08-19'; // closed day inside window -- legitimate record
const TODAY_DK       = '2026-08-24'; // still-open business day -- provisional only

const SALES = { [OLD_BEST_DK]: 10000, [CLOSED_DK]: 11000, [TODAY_DK]: 9000 };
const OEPE  = { [OLD_BEST_DK]: 97,    [CLOSED_DK]: 90,    [TODAY_DK]: 85 };

vi.mock('../engine/metric-source.js', () => ({
  dailyDataFreshness: () => new Date(TODAY_DK + 'T00:00:00'),
  metricSeries: (ds, loc, range, key) => {
    if (String(loc) !== LOC) return {};
    if (key === 'sales') return { ...SALES };
    if (key === 'oepe')  return { ...OEPE };
    return {};
  },
}));

import { RecordDayPanel } from '../views/record-day.js';

function baseDs() {
  return { loaded: true, storeIds: [LOC], laborRows: [] };
}

describe('#103 RecordDayPanel — same-day completeness gate, rendered through the real panel', () => {
  let container, root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    try { localStorage.removeItem('mf_day_records_v1'); } catch {}
    vi.useRealTimers();
  });

  it('a fast partial-day OEPE today renders as PROVISIONAL, not a confirmed record, in Recent Breaks', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T15:00:00')); // 3pm CT-ish, well after the 4am cutover -> business date 2026-08-24
    await act(async () => {
      root.render(React.createElement(RecordDayPanel, { stores: [{ loc: LOC }], ds: baseDs(), onClose: () => {} }));
    });
    // Switch to the Recent Breaks tab.
    const tabs = [...container.querySelectorAll('button')];
    const recentTab = tabs.find(b => b.textContent.includes('Recent Breaks'));
    expect(recentTab).toBeTruthy();
    await act(async () => { recentTab.click(); });

    expect(container.textContent).toContain('Provisional');
    // The closed-day record (90s, 2026-08-19) is present as a normal confirmed record.
    expect(container.textContent).toContain('Confirmed');
    expect(container.textContent).toMatch(/90s/);
    // Today's 85s beat is still shown (not silently hidden) but flagged, not silent.
    expect(container.textContent).toMatch(/85s/);
  });

  it('the permanent all-time OEPE record (Speed tab) reflects the closed day (90s), never the provisional 85s', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T15:00:00'));
    await act(async () => {
      root.render(React.createElement(RecordDayPanel, { stores: [{ loc: LOC }], ds: baseDs(), onClose: () => {} }));
    });
    const tabs = [...container.querySelectorAll('button')];
    const speedTab = tabs.find(b => b.textContent.includes('Speed of Service'));
    await act(async () => { speedTab.click(); });

    expect(container.textContent).toMatch(/90s/);
    expect(container.textContent).not.toMatch(/85s/);
  });

  it('once "today" moves past 2026-08-24, that same day (now closed) is graded normally -- no permanent trace of having once been provisional', async () => {
    // First render while 08-24 is still open: 90s stays the confirmed record.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T15:00:00'));
    await act(async () => {
      root.render(React.createElement(RecordDayPanel, { stores: [{ loc: LOC }], ds: baseDs(), onClose: () => {} }));
    });

    // Now the trading day has closed and the DAR caught up: 08-24's OEPE settles at 101s
    // (slower than 90s -- the Tecumseh dispatch's own prediction of what the full day does).
    // Advance the clock into 08-25 and re-render with the closed-day value.
    OEPE[TODAY_DK] = 101;
    act(() => { root.unmount(); });
    container.remove();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.setSystemTime(new Date('2026-08-25T09:00:00'));
    await act(async () => {
      root.render(React.createElement(RecordDayPanel, { stores: [{ loc: LOC }], ds: baseDs(), onClose: () => {} }));
    });
    const tabs = [...container.querySelectorAll('button')];
    const speedTab = tabs.find(b => b.textContent.includes('Speed of Service'));
    await act(async () => { speedTab.click(); });

    // 90s (the genuinely closed 08-19 day) is still the all-time best -- 101s never beat it.
    expect(container.textContent).toMatch(/90s/);
    expect(container.textContent).not.toMatch(/101s/);
  });

  it('every dollar figure in the panel renders with exactly 2 decimals', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T15:00:00'));
    await act(async () => {
      root.render(React.createElement(RecordDayPanel, { stores: [{ loc: LOC }], ds: baseDs(), onClose: () => {} }));
    });
    const tabs = [...container.querySelectorAll('button')];
    const salesTab = tabs.find(b => b.textContent.includes('Sales & Volume'));
    await act(async () => { salesTab.click(); });

    // Every dollar token (with or without a decimal part) must carry exactly 2 decimal
    // digits -- this would fail if any render path fell back to f$'s 0-decimal default.
    const dollarMatches = container.textContent.match(/\$[\d,]+(?:\.\d+)?/g) || [];
    expect(dollarMatches.length).toBeGreaterThan(0);
    for (const m of dollarMatches) {
      expect(m).toMatch(/\.\d{2}$/);
    }
  });
});
