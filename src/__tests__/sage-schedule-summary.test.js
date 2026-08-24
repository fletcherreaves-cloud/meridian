// @ts-nocheck
// Dispatch #85 #2 -- SAGE, after the #619 redeploy, on the same store in one answer: "the static
// 30-day summary says +141h/day over-scheduled, but the live 7-day pull says +13.9h/day." Both
// read the same underlying sch_vlh/need_vlh; they must not disagree.
//
// buildScheduleSummary's own averaging math was inspected and found sound (one row per day,
// straight mean, no window-total-as-daily-rate confusion like #82's gap_vlh bug) -- but it was a
// SECOND, independently hand-rolled implementation of "average the daily gap per store", which is
// exactly the kind of duplication that can drift even when today's version is correct. Fixed by
// routing the static summary's per-store computation through the SAME aggregateLifelenzLabor
// (#82) the live query_lifelenz_labor tool uses, so the two can no longer diverge by construction.
//
// Verification bar (memory/dispatch-85.md): "the static summary and query_lifelenz_labor must
// agree for the same store and window, within rounding. Assert that, not the formatting."
import { describe, it, expect } from 'vitest';
import { buildScheduleSummary } from '../views/sage.js';
import { aggregateLifelenzLabor } from '../../supabase/functions/sage-chat/lifelenz-labor-agg.js';

function makeSchedRows(loc, days, schPerDay, needPerDay) {
  const rows = [];
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    rows.push({ loc, date: d, schVLH: schPerDay, needVLH: needPerDay });
  }
  return rows;
}

describe('buildScheduleSummary agrees with aggregateLifelenzLabor (dispatch #85 #2)', () => {
  it('per-store h/day figure matches the live tool exactly for the same rows', () => {
    // Ada-shaped fixture: +4.7h/day over-scheduled, NOT the impossible +141h/day the static
    // summary once reported for a store independently confirmed top-quartile on labor %.
    const rows = makeSchedRows('6972', 30, 104.7, 100);
    const summary = buildScheduleSummary({ schedRows: rows });
    expect(summary).toBeTruthy();
    expect(summary).toContain('+4.7h/day avg (over-staffed)');
    expect(summary).not.toMatch(/\+141(\.\d+)?h\/day/);

    // Cross-check against the exact function the live tool calls, on the same rows (converted
    // to the snake_case shape the shared aggregator expects) -- this IS the "must agree" bar.
    const live = aggregateLifelenzLabor(rows.map(r => ({ loc: r.loc, sch_vlh: r.schVLH, need_vlh: r.needVLH })));
    const liveStore = live.find(s => s.loc === '6972');
    expect(liveStore.avg_daily_gap).toBeCloseTo(4.7, 1);
    // Same number both places -- not just both plausible, IDENTICAL, since they now share one
    // implementation.
    expect(summary).toContain(`+${liveStore.avg_daily_gap.toFixed(1)}h/day`);
  });

  it('a second store with its own day-count reconciles independently, not off a shared constant', () => {
    const rows = makeSchedRows('13113', 18, 105, 100); // +5.0h/day over 18 days
    const summary = buildScheduleSummary({ schedRows: rows });
    expect(summary).toContain('+5.0h/day avg (over-staffed)');
  });

  it('under-staffed direction is labeled correctly', () => {
    const rows = makeSchedRows('35064', 20, 90, 100); // -10h/day, understaffed
    const summary = buildScheduleSummary({ schedRows: rows });
    expect(summary).toContain('-10.0h/day avg (under-staffed)');
  });

  it('returns null on too few rows, unchanged behavior', () => {
    expect(buildScheduleSummary({ schedRows: makeSchedRows('6972', 3, 100, 100) })).toBeNull();
    expect(buildScheduleSummary({ schedRows: [] })).toBeNull();
    expect(buildScheduleSummary({})).toBeNull();
  });
});
