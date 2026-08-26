// @vitest-environment happy-dom
// @ts-nocheck
// Owner-reported (2026-08-26): the Retention Rollup's "Labor % Δ" column showed e.g. "-27.43pp"
// next to a Before→Since pair of "22.02% → 21.75%" — an 0.27pp move displayed as 100x itself.
// Root cause: laborPct throughout schedule-summary.js/schedule-retention.js is ALREADY on a
// 0-100 percent scale (schedule-summary.js:63 `// % scale`), so `laborPctDelta = b.laborPct -
// a.laborPct` (schedule-retention.js:618) is already in percentage points — but the table and
// CSV export multiplied it by 100 again before display, inflating every delta 100x. The pure
// aggregateRetentionRollup() computation was always correct (dispatch #141's own tests assert
// this); only the render/export layer was wrong, and no existing test rendered a POPULATED
// rollup table (every dispatch-141 render test hits the empty "no marks" state, since Supabase
// isn't configured in tests) — so the bug shipped invisibly until real marks landed via #146.
//
// This test mocks loadRetentionMarks to return real marks so the table actually renders rows,
// then checks the displayed "pp" text against the SAME pre/post values shown in the Before→Since
// cell — the way the owner caught this originally, not against a hardcoded number that could
// silently re-encode the bug.
import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { computeStoreWeeks } from '../engine/schedule-summary.js';
import { ScheduleRetentionRollupSection } from '../views/schedule-retention.js';

vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, loadRetentionMarks: vi.fn() };
});
import { loadRetentionMarks } from '../lib/supabase.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const weekDays = (startISO, sched, fcst, sales, laborPct, gc) => {
  const d0 = new Date(startISO + 'T12:00:00');
  return [0, 1, 2, 3, 4, 5, 6].map(i => {
    const d = new Date(d0); d.setDate(d0.getDate() + i);
    return { dt: d.toISOString().slice(0, 10), sched, fcst, sales, laborPct, gc };
  });
};
function toRows(loc, days) {
  return days.map(d => ({
    loc, date: new Date(d.dt + 'T12:00:00'),
    schVLH: d.sched, schFixHrs: 0, schFloor: 0,
    projVLH: d.fcst, fixGuideHrs: 0, projFloor: 0,
    fcstSales: d.sales || 10000, sales: d.sales, laborPct: d.laborPct, fcstTCs: d.gc,
  }));
}

// A single store, single-digit pp move — the exact shape the owner's screenshot showed
// (22.02% -> 21.75%, i.e. a sub-1pp change), not the double-digit swings a scaling bug hides in.
const WEEK_A = weekDays('2026-07-15', 195, 190, 0, null, 1030);
const WEEK_B = weekDays('2026-07-22', 200, 190, 12000, 22.02, 1027);
const WEEK_C = weekDays('2026-07-29', 195, 197, 12500, 21.75, 1050);
const LOC = '3708';
const ALL_ROWS = [...toRows(LOC, WEEK_A), ...toRows(LOC, WEEK_B), ...toRows(LOC, WEEK_C)];
// Mark WEEK_C so pre=[WEEK_A,WEEK_B] (WEEK_B has real actuals) and post=[WEEK_C] (real actuals)
// — both sides need an actuals-posted week for laborPct to compute at all.
const MARK = computeStoreWeeks(ALL_ROWS, LOC, {})[2].weekKey;

async function flush(container, maxTicks = 40) {
  let last = null;
  for (let i = 0; i < maxTicks; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    if (container.textContent === last && !container.textContent.includes('Loading')) return;
    last = container.textContent;
  }
}

describe('Retention Rollup — Labor % Δ column is NOT double-scaled vs. the Before→Since cell', () => {
  it('a sub-1pp Before→Since move renders as a sub-1pp Δ, not a ~100x-inflated one', async () => {
    loadRetentionMarks.mockResolvedValue([{ loc: LOC, weekKey: MARK }]);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(ScheduleRetentionRollupSection, {
        ds: { schedRows: ALL_ROWS, jobHours: [] }, stores: [{ loc: '3708' }], settings: {},
      }));
    });
    await flush(container);

    // Sanity: the row actually rendered with real Before/Since numbers, not the empty state.
    expect(container.textContent).toMatch(/22\.02%\s*→\s*21\.75%/);

    // The bug produced "-27.43pp" (0.27 * 100) for this exact 22.02->21.75 move; the correct
    // value is "-0.27pp". Assert the correct one is present and the buggy one is absent —
    // catches either a reintroduced `* 100` or some other future double-scaling.
    expect(container.textContent).toMatch(/-0\.27pp/);
    expect(container.textContent).not.toMatch(/-27\.\d\dpp/);

    act(() => { root.unmount(); });
    container.remove();
  });
});
