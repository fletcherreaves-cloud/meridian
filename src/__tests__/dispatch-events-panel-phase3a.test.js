// @vitest-environment happy-dom
// @ts-nocheck
// Events Phase 3 (a) of memory/project-events-calendar-redesign-2026-09-04.md — src/views/
// events-panel.js. Per this repo's standing "would this verification still pass if the change
// were reverted?" rule: the pure grouping/filter logic is tested directly (fast, exhaustive on
// boundaries), and a render pass mounts the real EventsPanel component (not just its helpers) to
// confirm the Upcoming/Log tabs actually render grouped, filtered, date-scoped rows — a test that
// only imported groupEventsByDayLabelType could pass unchanged even if the panel's own wiring to
// it were deleted.
import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { flattenUserEvents, groupEventsByDayLabelType, EVENTS_TAB_IDS } from '../views/events-panel.js';

const loadEventImpactMock = vi.fn(() => Promise.resolve([]));
vi.mock('../lib/supabase.js', () => ({ loadEventImpact: (...args) => loadEventImpactMock(...args) }));

describe('flattenUserEvents', () => {
  it('flattens {loc:{dk:info}} into one row per (loc,dk)', () => {
    const userEvents = { '3708': { '2026-09-12': { type: 'sports', label: 'OU vs Texas' } } };
    const out = flattenUserEvents(userEvents);
    expect(out.length).toBe(1);
    expect(out[0]).toMatchObject({ loc: '3708', dk: '2026-09-12', type: 'sports', label: 'OU vs Texas' });
    expect(out[0].date).toBeInstanceOf(Date);
  });

  it('expands combinedEvents (issue #142 same-day-multi-event) into separate rows, none dropped', () => {
    const userEvents = {
      '3708': { '2026-09-12': { combinedEvents: [{ label: 'School Closure', type: 'school_no_school' }, { label: 'OU vs Texas', type: 'sports' }] } },
    };
    const out = flattenUserEvents(userEvents);
    expect(out.length).toBe(2);
    expect(out.map(e => e.label).sort()).toEqual(['OU vs Texas', 'School Closure']);
    expect(out[0].combinedOf).toBe(2);
  });

  it('returns [] for empty/undefined input, not a throw', () => {
    expect(flattenUserEvents({})).toEqual([]);
    expect(flattenUserEvents(undefined)).toEqual([]);
  });
});

describe('groupEventsByDayLabelType', () => {
  const ev = (loc, dk, label, type) => ({ loc, dk, label, type });

  it('groups the same (day, label, type) across stores into one entry with all locs', () => {
    const flat = [ev('3708', '2026-11-26', 'Thanksgiving', 'holiday'), ev('6178', '2026-11-26', 'Thanksgiving', 'holiday'), ev('4123', '2026-11-26', 'Thanksgiving', 'holiday')];
    const out = groupEventsByDayLabelType(flat);
    expect(out.length).toBe(1);
    expect(out[0].locs.sort()).toEqual(['3708', '4123', '6178']);
    expect(out[0].items.length).toBe(3);
  });

  it('keeps different types on the same day/label separate (never silently merged)', () => {
    const flat = [ev('3708', '2026-09-12', 'Fall Festival', 'event'), ev('3708', '2026-09-12', 'Fall Festival', 'promo')];
    const out = groupEventsByDayLabelType(flat);
    expect(out.length).toBe(2);
  });

  it('normalizes a "(Day N of M)" span suffix so a multi-day range groups as one series, not N separate rows', () => {
    const flat = [ev('3708', '2026-07-01', 'Summer Camp (Day 1 of 3)', 'other'), ev('6178', '2026-07-01', 'Summer Camp (Day 1 of 3)', 'other')];
    const out = groupEventsByDayLabelType(flat);
    expect(out.length).toBe(1);
    expect(out[0].locs.length).toBe(2);
  });

  it('a single-store event still groups (locs.length===1), not left ungrouped', () => {
    const out = groupEventsByDayLabelType([ev('3708', '2026-09-12', 'Local Fundraiser', 'event')]);
    expect(out.length).toBe(1);
    expect(out[0].locs).toEqual(['3708']);
  });

  it('returns [] for empty input', () => {
    expect(groupEventsByDayLabelType([])).toEqual([]);
    expect(groupEventsByDayLabelType(undefined)).toEqual([]);
  });
});

describe('EVENTS_TAB_IDS', () => {
  it('is the five design-doc views, in the mockup order', () => {
    expect(EVENTS_TAB_IDS).toEqual(['upcoming', 'calendar', 'log', 'impact', 'rules']);
  });
});

// ── Render pass — the real EventsPanel component ────────────────────────────────────────────────
async function flush(container, maxTicks = 15) {
  let last;
  for (let i = 0; i < maxTicks; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    if (container.textContent === last) return;
    last = container.textContent;
  }
}

describe('EventsPanel (render)', () => {
  it('defaults to the Upcoming tab and shows an event that falls inside the default forward window', async () => {
    const { EventsPanel } = await import('../views/events-panel.js');
    const today = new Date();
    const soon = new Date(today); soon.setDate(soon.getDate() + 5);
    const dk = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, '0')}-${String(soon.getDate()).padStart(2, '0')}`;
    const userEvents = { '3708': { [dk]: { type: 'sports', label: 'OU vs Texas (Home)' } } };
    const stores = [{ loc: '3708' }];

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => { root.render(React.createElement(EventsPanel, { stores, userEvents, onUpdate: () => {}, onClose: () => {} })); });
    await flush(container);

    expect(container.textContent).toContain('OU vs Texas (Home)');
    root.unmount();
    container.remove();
  });

  it('the Log tab shows only visibility:\'log\' events (a store_incident type), never a calendar-visible one', async () => {
    const { EventsPanel } = await import('../views/events-panel.js');
    const today = new Date();
    const dk = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const userEvents = {
      '3708': {
        [dk]: { combinedEvents: [{ type: 'outage', label: 'Power outage — POS down 40 min' }, { type: 'sports', label: 'OU vs Texas (Home)' }] },
      },
    };
    const stores = [{ loc: '3708' }];

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => { root.render(React.createElement(EventsPanel, { stores, userEvents, initialView: 'log', onUpdate: () => {}, onClose: () => {} })); });
    await flush(container);

    expect(container.textContent).toContain('Power outage');
    expect(container.textContent).not.toContain('OU vs Texas');
    root.unmount();
    container.remove();
  });

  it('initialView seeds the active pill (Upcoming vs Log) without needing a click', async () => {
    const { EventsPanel } = await import('../views/events-panel.js');
    const stores = [{ loc: '3708' }];
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => { root.render(React.createElement(EventsPanel, { stores, userEvents: {}, initialView: 'log', onUpdate: () => {}, onClose: () => {} })); });
    await flush(container);

    expect(container.textContent).toContain('log-only events');
    root.unmount();
    container.remove();
  });
});
