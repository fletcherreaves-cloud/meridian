// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #122 — EventCalendar ("Events & Tags") holiday sub-filter + full-list print.
//
// Per this repo's standing "would this verification still pass if reverted?" rule, this renders
// the ACTUAL EventCalendar component (not just the filtering logic in isolation) with a
// realistic multi-year, multi-holiday, multi-store dataset shaped exactly like the panel's own
// "🗓 Auto-Tag Holidays" button writes it (type:'holiday', note:hol.label — see
// src/views/store-dash.js's EventCalendar). Confirms:
//   1. Selecting the Holiday type filter reveals a second selector listing the distinct holiday
//      names present (derived from `note`), and picking one narrows the rendered list to just
//      that holiday.
//   2. The second selector does NOT appear for a non-holiday type filter.
//   3. The print/export path (ExportDropdown's "HTML Report / Print", this repo's existing
//      print pattern — see RankingView's identical use of the same component) renders the FULL
//      currently-filtered set, not a scroll-truncated subset — checked against a filtered set
//      (29 events) large enough to have overflowed the modal's scrolled results container.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

import { EventCalendar } from '../views/store-dash.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const STORES = [
  { loc: '1001', name: 'Store 1001' },
  { loc: '1002', name: 'Store 1002' },
  { loc: '1003', name: 'Store 1003' },
];
const YEARS = [2024, 2025, 2026];
// Distinct holiday names, matching buildHolidays()'s stable per-holiday label exactly
// (src/utils/holidays.js) — the same string the panel's own auto-tag flow writes into `note`.
const HOLIDAYS = ['New Year Day', 'Independence Day', 'Thanksgiving'];

function buildUserEvents() {
  const uev = {};
  let dayCounter = 1;
  for (const s of STORES) {
    uev[s.loc] = {};
    for (const y of YEARS) {
      for (const hol of HOLIDAYS) {
        // Distinct calendar dates per (store,year,holiday) combo — dk is (loc,date) keyed.
        const mm = String((dayCounter % 12) + 1).padStart(2, '0');
        const dd = String((dayCounter % 27) + 1).padStart(2, '0');
        dayCounter++;
        const dk = `${y}-${mm}-${dd}`;
        uev[s.loc][dk] = { type: 'holiday', note: hol, icon: '🗓', label: 'Holiday: ' + hol, autoTagged: true };
      }
    }
  }
  // One more holiday, on one store/year only, to exercise an uneven distinct-name count.
  uev['1001']['2025-12-25'] = { type: 'holiday', note: 'Christmas Day', icon: '🗓', label: 'Holiday: Christmas Day', autoTagged: true };
  // A non-holiday event, so the Holiday type filter must actually exclude it, and so the
  // "no second selector for other types" check has something real to switch to.
  uev['1002']['2025-09-06'] = { type: 'sports', note: 'Rival high school game night', icon: '🏈', label: 'Sports / Game Day' };
  return uev;
}

// React's controlled <select>/<input> tracker ignores a plain `.value =` assignment before
// dispatching 'change' — set via the native setter so React's change tracking actually fires.
function setNativeValue(el, value) {
  const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('EventCalendar — holiday sub-filter + full-list print (Dispatch #122)', () => {
  let container, root, userEvents, onUpdate, openSpy, openedWindows;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    userEvents = buildUserEvents();
    onUpdate = vi.fn();
    openedWindows = [];
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => {
      const w = { document: { write: vi.fn(), close: vi.fn() } };
      openedWindows.push(w);
      return w;
    });
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    openSpy.mockRestore();
  });

  function render() {
    act(() => {
      root.render(React.createElement(EventCalendar, { userEvents, onUpdate, onClose: vi.fn(), stores: STORES }));
    });
  }

  // Selects reliably: [0]=type filter, [1]=holiday sub-filter (when present), then loc/sort.
  function typeFilterSelect() {
    return [...container.querySelectorAll('select')].find(s =>
      [...s.options].some(o => o.value === 'holiday'));
  }

  it('shows a second selector of distinct holiday names only after Holiday is selected, and narrows results', () => {
    render();

    // Baseline: 29 events tagged total (27 + 1 Christmas Day + 1 sports).
    expect(container.textContent).toContain('29 events tagged');

    // No holiday sub-filter yet (typeFilter==='all').
    let selectsBefore = [...container.querySelectorAll('select')];
    expect(selectsBefore.some(s => [...s.options].some(o => o.textContent.includes('All Holidays')))).toBe(false);

    setNativeValue(typeFilterSelect(), 'holiday');

    const holidaySel = [...container.querySelectorAll('select')].find(s =>
      [...s.options].some(o => o.textContent.includes('All Holidays')));
    expect(holidaySel).toBeTruthy();

    const optionTexts = [...holidaySel.options].map(o => o.textContent);
    expect(optionTexts).toEqual(expect.arrayContaining([
      expect.stringContaining('All Holidays (28)'),   // 27 + Christmas Day = 28 holiday-typed events
      expect.stringContaining('New Year Day (9)'),
      expect.stringContaining('Independence Day (9)'),
      expect.stringContaining('Thanksgiving (9)'),
      expect.stringContaining('Christmas Day (1)'),
    ]));
    // The sports event must never appear as a holiday option.
    expect(optionTexts.some(t => t.includes('Rival high school'))).toBe(false);

    // Narrow to just Thanksgiving.
    setNativeValue(holidaySel, 'Thanksgiving');
    expect(container.textContent).toContain('29 events tagged');
    expect(container.textContent).toContain('9 shown');
    // Every visible row's note should now be Thanksgiving-only.
    const noteEls = [...container.querySelectorAll('div')].filter(d => d.textContent === 'Thanksgiving');
    expect(noteEls.length).toBe(9);
  });

  it('does not surface the holiday sub-filter for a non-holiday type', () => {
    render();
    setNativeValue(typeFilterSelect(), 'sports');
    const selects = [...container.querySelectorAll('select')];
    expect(selects.some(s => [...s.options].some(o => o.textContent.includes('All Holidays')))).toBe(false);
  });

  it('resets the holiday sub-filter when the type filter changes away and back to Holiday', () => {
    render();
    setNativeValue(typeFilterSelect(), 'holiday');
    let holidaySel = [...container.querySelectorAll('select')].find(s =>
      [...s.options].some(o => o.textContent.includes('All Holidays')));
    setNativeValue(holidaySel, 'Thanksgiving');
    expect(container.textContent).toContain('9 shown');

    setNativeValue(typeFilterSelect(), 'sports');
    setNativeValue(typeFilterSelect(), 'holiday');
    // Should be back to "all holidays" (28 shown), not still narrowed to Thanksgiving (9).
    expect(container.textContent).toContain('28 shown');
  });

  it('print/export renders the FULL currently-filtered set (29 events, well beyond any scrolled viewport), not a truncated one', () => {
    render();
    // Open the export menu, then the HTML report/print option.
    const exportBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('⬇ Export'));
    expect(exportBtn).toBeTruthy();
    act(() => { exportBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const printBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('HTML Report / Print'));
    expect(printBtn).toBeTruthy();
    act(() => { printBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(openedWindows.length).toBe(1);
    const html = openedWindows[0].document.write.mock.calls[0][0];
    // One <tr> in <tbody> per data row — count matches the FULL unfiltered 29, not some
    // smaller number a scroll-viewport capture would have produced.
    const bodyMatch = html.match(/<tbody>([\s\S]*)<\/tbody>/);
    expect(bodyMatch).toBeTruthy();
    const rowCount = (bodyMatch[1].match(/<tr/g) || []).length;
    expect(rowCount).toBe(29);
    expect(html).toContain('window.print()');
  });

  it('print/export respects both the type filter and the holiday sub-filter together (narrows to 9)', () => {
    render();
    setNativeValue(typeFilterSelect(), 'holiday');
    const holidaySel = [...container.querySelectorAll('select')].find(s =>
      [...s.options].some(o => o.textContent.includes('All Holidays')));
    setNativeValue(holidaySel, 'Independence Day');

    const exportBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('⬇ Export'));
    act(() => { exportBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const printBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('HTML Report / Print'));
    act(() => { printBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    const html = openedWindows[0].document.write.mock.calls[0][0];
    const bodyMatch = html.match(/<tbody>([\s\S]*)<\/tbody>/);
    const rowCount = (bodyMatch[1].match(/<tr/g) || []).length;
    expect(rowCount).toBe(9);
    expect(html).not.toContain('Thanksgiving');
    expect(html).not.toContain('New Year Day');
  });
});
