// @vitest-environment happy-dom
// @ts-nocheck
// Live production bug (dispatch 2026-11-18): the first build of this report fetched the FULL
// day's hourly rows (all 24 hour_slots) across the whole YTD date range with no hour_slot
// filter, to let every daypart tab switch instantly with no re-query. That one broad scan of
// qsr_daily_activity blew past Supabase's tolerance -- 137 of ~209 pages failed live, surfacing
// a "DATA INCOMPLETE... figures UNDERSTATED" banner and an all-dash table. The fix scopes each
// fetch to only the hour_slots the ACTIVE daypart needs (2-12, not 24), refetching on tab/range
// change instead of one giant upfront pull -- see views/daypart-oepe-report.js's header and
// lib/supabase.js's loadOepeHourlyActivity header.
//
// This file would NOT have caught the original bug by rendering alone -- the real regression was
// in what loadOepeHourlyActivity was CALLED WITH, not just that a table eventually rendered (a
// call with no hour_slot filter and a call with the narrow filter can both end up rendering the
// same mocked fixture). So the primary assertions below are on the mock's call arguments: each
// tab switch must request only that daypart's own hour_slots, never the full day.
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const loadOepeHourlyActivityMock = vi.fn();
vi.mock('../lib/supabase.js', () => ({
  loadOepeHourlyActivity: (...args) => loadOepeHourlyActivityMock(...args),
}));

import { DaypartOepeReportPanel } from '../views/daypart-oepe-report.js';
import { ALL_HOUR_SLOTS } from '../engine/daypart-oepe-report.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const STORES = [{ loc: '3708' }];

// React patches HTMLSelectElement's own 'value' setter to track its own last-seen value for
// controlled-element diffing; plain `el.value = x` goes through that patched setter and leaves
// React believing nothing changed, so the dispatched 'change' event never reaches onChange. Using
// the PROTOTYPE's setter instead bypasses React's instance override -- same pattern
// crew-schedule-panel.test.js's setInputValue() uses for HTMLInputElement.
function setSelectValue(el, v) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(el, v);
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

async function mount(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(DaypartOepeReportPanel, props)); });
  return { container, root };
}

describe('DaypartOepeReportPanel', () => {
  let container, root;
  afterEach(() => { act(() => root?.unmount()); container?.remove(); loadOepeHourlyActivityMock.mockReset(); });

  it('shows the pre-run empty state before Run Report is clicked, and never fetches', async () => {
    loadOepeHourlyActivityMock.mockResolvedValue([]);
    ({ container, root } = await mount({ ds: {}, stores: STORES, onClose: () => {} }));
    expect(container.textContent).toContain('Choose a location, then Run Report.');
    expect(loadOepeHourlyActivityMock).not.toHaveBeenCalled();
  });

  it('Run Report (default tab, 4pm-Close) requests ONLY that daypart\'s hour_slots, never the full day', async () => {
    loadOepeHourlyActivityMock.mockResolvedValue([]);
    ({ container, root } = await mount({ ds: {}, stores: STORES, onClose: () => {} }));
    const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run Report');
    await act(async () => { runBtn.click(); await Promise.resolve(); });

    expect(loadOepeHourlyActivityMock).toHaveBeenCalledTimes(1);
    const [, , slots] = loadOepeHourlyActivityMock.mock.calls[0];
    // allNight = '17:00' through '28:00' -- 12 slots, exactly half the day, never all 24.
    expect(slots).toEqual(ALL_HOUR_SLOTS.filter(s => s >= '17:00'));
    expect(slots.length).toBeLessThan(ALL_HOUR_SLOTS.length);
  });

  it('switching to Breakfast fetches ONLY the 2 breakfast slots -- a fresh, separately-scoped call', async () => {
    loadOepeHourlyActivityMock.mockResolvedValue([]);
    ({ container, root } = await mount({ ds: {}, stores: STORES, onClose: () => {} }));
    const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run Report');
    await act(async () => { runBtn.click(); await Promise.resolve(); });

    const breakfastBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Breakfast (7–9am)');
    await act(async () => { breakfastBtn.click(); await Promise.resolve(); });

    expect(loadOepeHourlyActivityMock).toHaveBeenCalledTimes(2);
    const [, , slots] = loadOepeHourlyActivityMock.mock.calls[1];
    expect(slots).toEqual(['08:00', '09:00']);
  });

  it('switching back to an already-viewed daypart in the same Run is served from cache -- no extra fetch', async () => {
    loadOepeHourlyActivityMock.mockResolvedValue([]);
    ({ container, root } = await mount({ ds: {}, stores: STORES, onClose: () => {} }));
    const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run Report');
    await act(async () => { runBtn.click(); await Promise.resolve(); }); // allNight: fetch #1

    const breakfastBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Breakfast (7–9am)');
    await act(async () => { breakfastBtn.click(); await Promise.resolve(); }); // breakfast: fetch #2

    const allNightBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '4pm–Close');
    await act(async () => { allNightBtn.click(); await Promise.resolve(); }); // allNight again: cached

    expect(loadOepeHourlyActivityMock).toHaveBeenCalledTimes(2);
  });

  it('a Custom range with both bounds chosen fetches exactly that inclusive slot range', async () => {
    loadOepeHourlyActivityMock.mockResolvedValue([]);
    ({ container, root } = await mount({ ds: {}, stores: STORES, onClose: () => {} }));
    const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run Report');
    await act(async () => { runBtn.click(); await Promise.resolve(); }); // allNight: fetch #1

    const customBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Custom range');
    await act(async () => { customBtn.click(); });
    expect(container.textContent).toContain('Pick a Start and End time for the custom range.');

    // ReportShell's own date-preset/location controls are ALSO real <select> elements, so this
    // targets the two custom-range pickers by their aria-label, not DOM-order position.
    const startSel = container.querySelector('select[aria-label="Custom range start"]');
    const endSel = container.querySelector('select[aria-label="Custom range end"]');
    await act(async () => { setSelectValue(startSel, '10:00'); });
    await act(async () => { setSelectValue(endSel, '12:00'); await Promise.resolve(); });

    expect(loadOepeHourlyActivityMock).toHaveBeenCalledTimes(2);
    const [, , slots] = loadOepeHourlyActivityMock.mock.calls[1];
    expect(slots).toEqual(['10:00', '11:00', '12:00']);
  });

  it('renders the real computed OEPE value from the fetched rows for the active daypart', async () => {
    // The 1st of the current month, not literal "today" -- the report's own date-range picker
    // resolves its end date to the LAST CLOSED business day (PanelControls.js's
    // resolveDatePreset, never literal "today"), so a row dated exactly "now" can fall just
    // outside the MTD window depending on where in the day the suite runs. The 1st of the month
    // is safely inside every window regardless of that lag, same pattern
    // dt-oepe-report-panel.test.js's own buildDs() uses.
    const today = new Date();
    const mtdDay = new Date(today.getFullYear(), today.getMonth(), 1);
    // 5pm-6pm slot ('18:00'), 10 cars, 200s each -- dinner's own computation, not allNight's.
    loadOepeHourlyActivityMock.mockResolvedValue([
      { loc: '3708', dt: mtdDay, hour_slot: '18:00', dt_untilserve: 200000 * 10, dt_untilstore: 1, dt_heldtime: 0, dt_trans_cnt: 10 },
    ]);
    ({ container, root } = await mount({ ds: {}, stores: STORES, onClose: () => {} }));
    const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run Report');
    await act(async () => { runBtn.click(); await Promise.resolve(); });
    const dinnerBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Dinner (5–7pm)');
    await act(async () => { dinnerBtn.click(); await Promise.resolve(); });

    expect(container.querySelector('table')).toBeTruthy();
    expect(container.textContent).toContain('200s');
  });
});
