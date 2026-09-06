// @vitest-environment happy-dom
// @ts-nocheck
// #300 (pm-handoff-2026-08-15.md / backlog-master-2026-08-19.md): "6-Week District Sales Trend
// has no completeness guard on either window — one week reads +391.69% and flattens the other
// five." at-a-glance.js's weeklyTrend summed whatever days a source happened to have with no
// check on how many of the window's (loc x day) cells were actually covered, so a sparse window
// (a data gap, an in-progress week) produced a real-looking but meaningless total or ratio that
// then dominated the shared chart scale. Fixed by extracting the computation to computeWeeklyTrend
// and gating both the current-side total and the vsLY ratio on >=50% (loc x day) coverage.
import { describe, it, expect } from 'vitest';
import { computeWeeklyTrend } from '../views/at-a-glance.js';

const iso = d => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const r = new Date(d); r.setUTCDate(r.getUTCDate() + n); return r; };

// Same week-start walk computeWeeklyTrend uses internally, so the test can know exactly which
// calendar week each `w` bucket (6..1) corresponds to without duplicating date-math guesswork.
function weekStart(d, wsd) {
  const w = new Date(d);
  while (w.getUTCDay() !== wsd) w.setUTCDate(w.getUTCDate() - 1);
  w.setUTCHours(0, 0, 0, 0);
  return w;
}

const WSD = 3; // Wednesday, this repo's default weekStartDay
const TODAY = new Date('2026-09-03T12:00:00Z');
const LOCS = ['101', '102'];

// Builds laborRows (the last-resort source in the 'sales' metric chain) with `sales` for every
// (loc, day) in [start, start+span) except the loc/day pairs in `skip` — lets a test build a
// mostly-complete week and knock out just enough cells to cross the 50% coverage line.
function rowsFor(start, spanDays, { skip = () => false, value = 1000 } = {}) {
  const rows = [];
  for (let i = 0; i < spanDays; i++) {
    const d = addDays(start, i);
    for (const loc of LOCS) {
      if (skip(loc, i)) continue;
      rows.push({ loc, date: iso(d), sales: value });
    }
  }
  return rows;
}

describe('#300 computeWeeklyTrend completeness guard', () => {
  it('returns [] when ds is not loaded or there are no locs', () => {
    expect(computeWeeklyTrend({ loaded: false }, LOCS, WSD, TODAY)).toEqual([]);
    expect(computeWeeklyTrend({ loaded: true, laborRows: [] }, [], WSD, TODAY)).toEqual([]);
  });

  it('renders a full-coverage week with a real total and vsLY when both windows are complete', () => {
    const ws1 = weekStart(addDays(TODAY, -7), WSD); // the w=1 bucket (most recent complete week)
    const lyWs1 = addDays(ws1, -364);
    const ds = { loaded: true, laborRows: [
      ...rowsFor(ws1, 7),
      ...rowsFor(lyWs1, 7, { value: 800 }),
    ] };
    const trend = computeWeeklyTrend(ds, LOCS, WSD, TODAY);
    expect(trend).toHaveLength(6);
    const last = trend[trend.length - 1];
    expect(last.sales).toBe(2000 * 7); // 2 locs x 1000/day x 7 days
    expect(last.lySales).toBe(1600 * 7);
    expect(last.vsLY).toBeCloseTo((2000 * 7 - 1600 * 7) / (1600 * 7), 10);
    expect(last.label).not.toBe('—');
  });

  it('blanks a week whose CURRENT-side window covers less than half its (loc x day) cells', () => {
    const ws1 = weekStart(addDays(TODAY, -7), WSD);
    const lyWs1 = addDays(ws1, -364);
    // Only 2 of 7 days present for either loc this week (4 of 14 cells, ~29% coverage) — an
    // in-progress or gap-ridden window, the shape that used to produce a wild total/ratio.
    const ds = { loaded: true, laborRows: [
      ...rowsFor(ws1, 7, { skip: (loc, i) => i >= 2 }),
      ...rowsFor(lyWs1, 7, { value: 800 }), // LY side fully covered — irrelevant, current gates first
    ] };
    const trend = computeWeeklyTrend(ds, LOCS, WSD, TODAY);
    const last = trend[trend.length - 1];
    expect(last).toEqual({ label: '—', sales: 0, vsLY: null });
  });

  it('keeps the real current-side total but nulls vsLY when only the LY-side window is sparse', () => {
    const ws1 = weekStart(addDays(TODAY, -7), WSD);
    const lyWs1 = addDays(ws1, -364);
    const ds = { loaded: true, laborRows: [
      ...rowsFor(ws1, 7), // current side fully covered
      ...rowsFor(lyWs1, 7, { skip: (loc, i) => i >= 2, value: 800 }), // LY side ~29% covered
    ] };
    const trend = computeWeeklyTrend(ds, LOCS, WSD, TODAY);
    const last = trend[trend.length - 1];
    expect(last.sales).toBe(2000 * 7); // real, complete current total still renders
    expect(last.label).not.toBe('—');
    expect(last.vsLY).toBeNull(); // but the misleading comparison against a near-empty LY sum is suppressed
  });

  it('treats a genuinely zero-sales week as the pre-existing no-data case, not a coverage failure', () => {
    const ds = { loaded: true, laborRows: [] };
    const trend = computeWeeklyTrend(ds, LOCS, WSD, TODAY);
    trend.forEach(wk => expect(wk).toEqual({ label: '—', sales: 0, vsLY: null }));
  });
});
