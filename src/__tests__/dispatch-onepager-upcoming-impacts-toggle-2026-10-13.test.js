// @vitest-environment happy-dom
// @ts-nocheck
// Owner-requested (2026-10-13): "allow me to remove the Upcoming Impacts Tile as well. Make it a
// button/toggle like the others. Also for the Upcoming Impact tile, make it list the full period
// of upcoming events. You can combine and summarize where possible for events running multiple
// days."
//
// Two changes, both verified by rendering the REAL AboveStoreOnePager component (per this repo's
// "would this verification still pass if reverted?" rule):
//   1. "Upcoming Impacts" is now a 'events' entry in ONEPAGER_PANELS, so it gets a toggle pill
//      like Sales/GC, FOB, etc. -- before this it was always rendered (Section(...,panelKey=null)
//      with no showP() gate at all).
//   2. A multi-day event (sharing a rangeId, same convention orgEventsToDayMap/EventCalendar's
//      save() already write) now shows as ONE line spanning its full period with a day-count
//      badge, instead of one identical-looking line per day.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { AboveStoreOnePager } from '../views/above-store-onepager.js';
import { groupEventRanges } from '../engine/events-import.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LOC = '3708';
function dkFromToday(daysOut) {
  const d = new Date(); d.setDate(d.getDate() + daysOut);
  return d.toISOString().slice(0, 10);
}

describe('groupEventRanges (engine/events-import.js) — pure unit tests', () => {
  it('collapses a multi-day rangeId span into one entry covering the full period', () => {
    const flat = [
      { dk: '2026-11-24', label: 'Thanksgiving Break (Day 1 of 4)', type: 'event', rangeId: 'r1', rangeDayNum: 1, rangeTotalDays: 4 },
      { dk: '2026-11-25', label: 'Thanksgiving Break (Day 2 of 4)', type: 'event', rangeId: 'r1', rangeDayNum: 2, rangeTotalDays: 4 },
      { dk: '2026-11-26', label: 'Thanksgiving Break (Day 3 of 4)', type: 'event', rangeId: 'r1', rangeDayNum: 3, rangeTotalDays: 4 },
      { dk: '2026-11-27', label: 'Thanksgiving Break (Day 4 of 4)', type: 'event', rangeId: 'r1', rangeDayNum: 4, rangeTotalDays: 4 },
    ];
    const out = groupEventRanges(flat);
    expect(out).toHaveLength(1);
    expect(out[0].dk).toBe('2026-11-24');
    expect(out[0].dkStart).toBe('2026-11-24');
    expect(out[0].dkEnd).toBe('2026-11-27');
    expect(out[0].totalDays).toBe(4);
    expect(out[0].label).toBe('Thanksgiving Break'); // "(Day N of M)" suffix stripped
  });

  it('a single-day event (no rangeId) passes through unchanged', () => {
    const flat = [{ dk: '2026-11-20', label: 'Veterans Day Promo', type: 'event' }];
    const out = groupEventRanges(flat);
    expect(out).toEqual([{ dk: '2026-11-20', label: 'Veterans Day Promo', type: 'event' }]);
  });

  it('a window that only shows PART of a range still reports the real totalDays vs daysShown', () => {
    // Only days 2-3 of a 4-day event are in view (e.g. a 21-day lookahead clipped the tail).
    const flat = [
      { dk: '2026-11-25', label: 'X (Day 2 of 4)', rangeId: 'r2', rangeDayNum: 2, rangeTotalDays: 4 },
      { dk: '2026-11-26', label: 'X (Day 3 of 4)', rangeId: 'r2', rangeDayNum: 3, rangeTotalDays: 4 },
    ];
    const out = groupEventRanges(flat);
    expect(out[0].totalDays).toBe(4);
    expect(out[0].daysShown).toBe(2);
  });

  it('mixes grouped and single-day entries, sorted by start date', () => {
    const flat = [
      { dk: '2026-11-28', label: 'Later Single Day', type: 'event' },
      { dk: '2026-11-24', label: 'Range (Day 1 of 2)', rangeId: 'rX', rangeDayNum: 1, rangeTotalDays: 2 },
      { dk: '2026-11-25', label: 'Range (Day 2 of 2)', rangeId: 'rX', rangeDayNum: 2, rangeTotalDays: 2 },
    ];
    const out = groupEventRanges(flat);
    expect(out.map(e => e.dk)).toEqual(['2026-11-24', '2026-11-28']);
  });
});

describe('AboveStoreOnePager — Upcoming Impacts toggle + multi-day grouping (2026-10-13)', () => {
  let container, root;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('shows an "Upcoming Impacts" panel toggle pill alongside the others, and it starts checked', async () => {
    await act(async () => {
      root.render(React.createElement(AboveStoreOnePager, {
        ds: { loaded: true, qsrFobRows: [] }, settings: {}, userEvents: {}, eventImpact: {}, onClose: () => {},
        initialScope: LOC,
      }));
    });
    const pill = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Upcoming Impacts'));
    expect(pill, 'Upcoming Impacts panel toggle not found').toBeTruthy();
    expect(pill.textContent.startsWith('✓')).toBe(true); // on by default, like every other panel
  });

  it('clicking the Upcoming Impacts toggle hides the whole section', async () => {
    const userEvents = { [LOC]: { [dkFromToday(3)]: { type: 'event', label: 'Test Event', icon: '📌' } } };
    await act(async () => {
      root.render(React.createElement(AboveStoreOnePager, {
        ds: { loaded: true, qsrFobRows: [] }, settings: {}, userEvents, eventImpact: {}, onClose: () => {},
        initialScope: LOC,
      }));
    });
    expect(container.textContent).toContain('Upcoming Impacts (21 days)');
    expect(container.textContent).toContain('Test Event');

    const pill = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Upcoming Impacts'));
    await act(async () => { pill.click(); });

    expect(container.textContent).not.toContain('Upcoming Impacts (21 days)');
    expect(container.textContent).not.toContain('Test Event');
  });

  it('a multi-day tagged event renders as ONE line spanning its full period with a day-count badge, not one line per day', async () => {
    const d1 = dkFromToday(5), d2 = dkFromToday(6), d3 = dkFromToday(7);
    const userEvents = {
      [LOC]: {
        [d1]: { type: 'event', label: 'School Closure (Day 1 of 3)', icon: '🏫', rangeId: 'sc1', rangeDayNum: 1, rangeTotalDays: 3 },
        [d2]: { type: 'event', label: 'School Closure (Day 2 of 3)', icon: '🏫', rangeId: 'sc1', rangeDayNum: 2, rangeTotalDays: 3 },
        [d3]: { type: 'event', label: 'School Closure (Day 3 of 3)', icon: '🏫', rangeId: 'sc1', rangeDayNum: 3, rangeTotalDays: 3 },
      },
    };
    await act(async () => {
      root.render(React.createElement(AboveStoreOnePager, {
        ds: { loaded: true, qsrFobRows: [] }, settings: {}, userEvents, eventImpact: {}, onClose: () => {},
        initialScope: LOC,
      }));
    });
    // The real, user-facing text: ONE "School Closure" line (suffix stripped), not three.
    const occurrences = (container.textContent.match(/School Closure/g) || []).length;
    expect(occurrences).toBe(1);
    expect(container.textContent).toContain('3d'); // day-count badge
    expect(container.textContent).toMatch(new RegExp(d1.slice(5) + '.*' + d3.slice(5)));
  });
});
