// @ts-nocheck
// Quick-Capture Phase 1 (memory/plan-overnight-notes-72-2026-11-06.md §1, task #101) — Logged
// Events metric category wiring. Same "synthesize 0/1 over the real-data universe" contract
// Calendar's own calWeekend/calFri/calMon metrics already prove out; this locks in that a logged
// org_events row becomes a real, correlatable Scanner series.
import { describe, it, expect } from 'vitest';
import { extractMetricValues, METRIC_FLAT } from '../engine/signal-registry.js';

function buildDs({ orgEventRows = [] } = {}) {
  const opsRows = [];
  for (let d = 1; d <= 5; d++) opsRows.push({ loc: '3708', date: new Date(2026, 9, d), oepe: 150 + d });
  return { opsRows, orgEventRows };
}

describe('Logged Events metric category', () => {
  it('registers one flag metric per EVENT_TYPE_GROUPS category', () => {
    expect(METRIC_FLAT.evt_operations).toBeTruthy();
    expect(METRIC_FLAT.evt_operations.category).toBe('events');
    expect(METRIC_FLAT.evt_operations.label).toContain('logged');
  });

  it('flags 1 on the day a store-scoped event of that category was logged, 0 on other days', () => {
    const ds = buildDs({
      orgEventRows: [
        { loc: '3708', dateStart: '2026-10-03', dateEnd: '2026-10-03', type: 'staffing', scope: 'store' },
      ],
    });
    const vals = extractMetricValues('evt_operations', ds, 'daily');
    const byDay = {};
    for (const v of vals) byDay[v.date.getDate()] = v.value;
    expect(byDay[3]).toBe(1);
    expect(byDay[1]).toBe(0);
    expect(byDay[2]).toBe(0);
    expect(byDay[4]).toBe(0);
    expect(byDay[5]).toBe(0);
  });

  it('a multi-day event flags every day in its span', () => {
    const ds = buildDs({
      orgEventRows: [
        { loc: '3708', dateStart: '2026-10-02', dateEnd: '2026-10-04', type: 'own_closure', scope: 'store' },
      ],
    });
    const vals = extractMetricValues('evt_store_events', ds, 'daily');
    const byDay = {};
    for (const v of vals) byDay[v.date.getDate()] = v.value;
    expect(byDay[1]).toBe(0);
    expect(byDay[2]).toBe(1);
    expect(byDay[3]).toBe(1);
    expect(byDay[4]).toBe(1);
    expect(byDay[5]).toBe(0);
  });

  it('a different loc\'s event never leaks into this store\'s series', () => {
    const ds = buildDs({
      orgEventRows: [
        { loc: '5183', dateStart: '2026-10-03', dateEnd: '2026-10-03', type: 'staffing', scope: 'store' },
      ],
    });
    const vals = extractMetricValues('evt_operations', ds, 'daily');
    expect(vals.every(v => v.value === 0)).toBe(true);
  });

  it('a non-store-scoped event (district/state) is not counted -- Phase 1 scope limitation', () => {
    const ds = buildDs({
      orgEventRows: [
        { loc: '3708', dateStart: '2026-10-03', dateEnd: '2026-10-03', type: 'holiday', scope: 'state' },
      ],
    });
    const vals = extractMetricValues('evt_operations', ds, 'daily');
    expect(vals.every(v => v.value === 0)).toBe(true);
  });

  it('an event type outside this group never flags it (e.g. a weather event does not flag Operations)', () => {
    const ds = buildDs({
      orgEventRows: [
        { loc: '3708', dateStart: '2026-10-03', dateEnd: '2026-10-03', type: 'snow', scope: 'store' },
      ],
    });
    const vals = extractMetricValues('evt_operations', ds, 'daily');
    expect(vals.every(v => v.value === 0)).toBe(true);
    const wxVals = extractMetricValues('evt_weather', ds, 'daily');
    expect(wxVals.some(v => v.value === 1)).toBe(true);
  });

  it('returns [] for monthly granularity (daily-only, same as Calendar)', () => {
    const ds = buildDs({ orgEventRows: [{ loc: '3708', dateStart: '2026-10-03', type: 'staffing', scope: 'store' }] });
    expect(extractMetricValues('evt_operations', ds, 'monthly')).toEqual([]);
  });

  it('handles a missing/undefined ds.orgEventRows without throwing', () => {
    const ds = buildDs();
    delete ds.orgEventRows;
    expect(() => extractMetricValues('evt_operations', ds, 'daily')).not.toThrow();
  });
});
