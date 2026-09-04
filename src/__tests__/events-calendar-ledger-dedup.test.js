// @vitest-environment happy-dom
// @ts-nocheck
// Phase 0 of memory/project-events-calendar-redesign-2026-09-04.md — EventCalendar's ("Events &
// Tags") ledger used to render one row per (store x day) with zero grouping, so a districtwide
// event became N visually-identical consecutive rows differing only by store name -- the owner's
// literal complaint, "when I look at it I get a wall of repetitive events". calendar.js's sibling
// month-grid view (monthAgenda) already solved this with a (label) grouping + "(N stores)" badge;
// this ports the identical grouping key -- (dk, normalized label, type), matching monthAgenda's
// own `byLabel[k]=byLabel[k]||{...e,locs:[]}` shape -- into the flat ledger.
//
// Per "would this verification still pass if reverted?": renders the REAL EventCalendar with a
// fixture that tags the identical event (same date/label/type) across 5 stores, so a revert to
// one-row-per-(store,day) makes these assertions fail (5 separate visible rows instead of 1, no
// expand toggle, wrong per-store Edit/x wiring).
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
  { loc: '1004', name: 'Store 1004' },
  { loc: '1005', name: 'Store 1005' },
];

function buildUserEvents() {
  const uev = {};
  // A districtwide Thanksgiving tagged identically (same dk, label, type) across all 5 stores --
  // exactly how the now-retired "Auto-Tag Holidays" writer and applyEventToStores (calendar.js,
  // still live) both shape a multi-store write. This is the case that used to render as 5
  // stacked, identical-looking rows.
  for (const s of STORES) {
    uev[s.loc] = { '2026-11-26': { type: 'holiday', note: 'Thanksgiving', icon: '🗓', label: 'Holiday: Thanksgiving', autoTagged: true } };
  }
  // One store-local event, no other store shares it -- must stay a single ungrouped row with its
  // own inline Edit/x, not swept into any group.
  uev['1001']['2026-09-12'] = { type: 'sports', note: 'Rival game night', icon: '🏈', label: 'Sports / Game Day' };
  return uev;
}

function mountRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

describe('EventCalendar ledger -- dedup grouping (Phase 0, events-calendar-redesign)', () => {
  let container, root, userEvents, onUpdate;

  beforeEach(() => {
    ({ container, root } = mountRoot());
    userEvents = buildUserEvents();
    onUpdate = vi.fn();
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  function render() {
    act(() => {
      root.render(React.createElement(EventCalendar, { userEvents, onUpdate, onClose: vi.fn(), stores: STORES }));
    });
  }

  it('collapses one event tagged identically across 5 stores into a single row, not 5', () => {
    render();
    // Header: 2 distinct events (Thanksgiving + the sports game) across 6 store-tags.
    expect(container.textContent).toContain('2 events (6 store-tags)');

    // Exactly one "Holiday: Thanksgiving" heading in the DOM -- not 5.
    const headings = [...container.querySelectorAll('div')].filter(d => d.textContent === 'Holiday: Thanksgiving');
    expect(headings.length).toBe(1);

    // The collapsed group shows a store-count chip, not a single store name.
    expect(container.textContent).toContain('◍ 5 stores ▸');
  });

  it('does not show per-store Edit/x on a collapsed multi-store group', () => {
    render();
    // Only the single-store sports event has inline action buttons before any expand.
    const editButtons = [...container.querySelectorAll('button')].filter(b => b.textContent.includes('✎ Edit'));
    expect(editButtons.length).toBe(1);
  });

  // The test's `stores` prop names ("Store 1001") only feed the Add/Edit location <select> --
  // on-screen rows resolve names through the app's real global STORE_NAMES map (src/constants.js),
  // which these synthetic locs aren't in, so displayed rows fall back to the bare loc code.
  function groupHeaderRow() {
    const labelDiv = [...container.querySelectorAll('div')].find(d => d.textContent === 'Holiday: Thanksgiving');
    return labelDiv.parentElement.parentElement; // flex:1 wrapper -> the clickable outer row
  }

  it('expands a multi-store group on click to reveal all 5 per-store rows with their own Edit/x', () => {
    render();
    act(() => { groupHeaderRow().dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(container.textContent).toContain('◍ 5 stores ▾');
    STORES.forEach(s => expect(container.textContent).toContain(s.loc));

    // Now 5 expanded sub-rows + 1 single-event row = 6 Edit buttons total.
    const editButtons = [...container.querySelectorAll('button')].filter(b => b.textContent.includes('✎ Edit'));
    expect(editButtons.length).toBe(6);
  });

  it('removing one store from an expanded group only deletes that store\'s tag, not the whole group', () => {
    render();
    act(() => { groupHeaderRow().dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    // Find the sub-row for loc 1003 specifically and remove it.
    const subRow = [...container.querySelectorAll('div')].find(d => d.textContent === '1003').parentElement;
    const removeBtn = [...subRow.querySelectorAll('button')].find(b => b.textContent === '✕');
    act(() => { removeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(onUpdate).toHaveBeenCalled();
    const next = onUpdate.mock.calls[onUpdate.mock.calls.length - 1][0];
    expect(next['1003']).toBeUndefined(); // Store 1003 had only this one tag -- loc key removed.
    expect(next['1001']['2026-11-26']).toBeTruthy(); // other stores' tags untouched.
  });

  it('a single-store event still shows the store name inline (no chip) and works via one click', () => {
    render();
    expect(container.textContent).toContain('Sports / Game Day');
    // The store code appears directly next to the sports event's date, not behind an expand toggle.
    const sportsLabel = [...container.querySelectorAll('div')].find(d => d.textContent === 'Sports / Game Day');
    const sportsRow = sportsLabel.parentElement;
    expect(sportsRow.textContent).toContain('1001');
    expect(sportsRow.textContent).not.toContain('◍');
  });
});
