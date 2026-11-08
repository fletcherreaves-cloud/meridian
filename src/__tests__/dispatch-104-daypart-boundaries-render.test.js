// @vitest-environment happy-dom
// @ts-nocheck
// Task #104 (2026-11-08) -- "Reconcile Meridian daypart boundaries vs. LifeLenz."
//
// Measured: LifeLenz itself (scripts/lifelenz-pull.mjs, scripts/lib/*.mjs) carries no daypart/
// meal-period concept at all -- it pulls per-shift schedule rows (start/end timestamps), nothing
// labeled "breakfast"/"lunch"/etc. QSRSoft's DAR (qsr_daily_activity) also has no named daypart
// field in its own payload -- "daypart" is entirely a Meridian-side grouping of hour_slot. The
// real ground truth to diff Meridian's own hardcoded daypart windows against is therefore the VLH
// guide's own published boundaries (Breakfast 5a-11a, Lunch 11a-2p, Afternoon 2p-5p, Dinner
// 5p-11p, Late Night 11p-5a) -- already identified by the owner (2026-08-17, #402/#403) and
// encoded as the single canonical answer in labor-standard.js's daypartOf()/DAYPART_SLOTS.
//
// Three OTHER, independently hand-rolled daypart-boundary lists had drifted off that canonical
// source and were never reconciled to it: dt-speedofservice.js's DAYPARTS (every boundary a full
// hour EARLY -- Breakfast 4am-10am instead of 5am-11am, etc. -- plus a dead '00:00' Late Night
// entry that can never match a real qsr_daily_activity row), and morning-brief.js's DAR_DAYPARTS /
// store-analytics.js's DAYPARTS_DEF (both splitting Dinner/Late Night at 9pm/10pm instead of the
// guide's 11pm). This file renders the REAL consumer component (not the engine function in
// isolation, per CLAUDE.md's "would this verification still pass if reverted?" rule) and checks
// that boundary-sensitive hour_slot rows land in the daypart bucket the VLH guide says they
// should -- each assertion here would fail against the pre-fix hand-rolled list.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// '11:00' (the 10-11am block) is Breakfast under the canonical boundary, but was grouped as Lunch
// under the pre-fix hand-rolled list (which started Lunch at '11:00'). '23:00' (10-11pm) is
// Dinner under the canonical boundary, but was grouped as Late Night under the pre-fix list
// (which started Late Night at '21:00'). One store, one day, 20 transactions per slot so each
// bucket's avg is unambiguous (not blended with any other row).
//
// oepeSeconds (utils/oepe.js) requires dt_untilstore > 0 (its own "has gap data" guard) and
// computes (Σdt_untilserve - Σdt_untilstore - Σdt_heldtime) / Σcnt / 1000 -- mirroring dispatch
// #110's own PARK_SEC pattern so each row resolves to exactly its intended avgSec.
const PARK_SEC = 10;
function mkRow(hourSlot, avgSec, cnt = 20) {
  return {
    loc: '3708', dt: '2026-08-03', hour_slot: hourSlot,
    dt_untilserve: (avgSec + PARK_SEC) * 1000 * cnt, dt_untilstore: PARK_SEC * 1000 * cnt, dt_heldtime: 0,
    dt_trans_cnt: cnt,
    fc_untilserve: 0, fc_trans_cnt: 0, mfy1_untilserve: 0, mfy1_trans_cnt: 0,
    mfy2_untilserve: 0, mfy2_trans_cnt: 0, bev_untilserve: 0, bev_trans_cnt: 0,
  };
}
const rows = [
  mkRow('11:00', 111), // 10-11am: Breakfast under the VLH guide, was Lunch pre-fix
  mkRow('12:00', 222), // 11am-12pm: Lunch either way (unaffected, sanity anchor)
  mkRow('23:00', 233), // 10-11pm: Dinner under the VLH guide, was Late Night pre-fix
  mkRow('24:00', 244), // 11pm-12am: Late Night either way (unaffected, sanity anchor)
];

vi.mock('../lib/supabase.js', () => ({ loadDtHistory: vi.fn(() => Promise.resolve(rows)) }));

const chartCalls = [];
class FakeChart {
  constructor(canvas, config) { this.config = config; chartCalls.push(config); }
  destroy() {}
}
vi.mock('chart.js/auto', () => ({ Chart: FakeChart }));

const { DTSpeedOfServicePanel } = await import('../views/dt-speedofservice.js');

async function flush(container, maxTicks = 15) {
  let last;
  for (let i = 0; i < maxTicks; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
    if (container.textContent === last) return;
    last = container.textContent;
  }
}

describe('Task #104 — DT Speed of Service daypart chart uses the VLH-guide boundaries', () => {
  let container, root;
  beforeEach(() => {
    chartCalls.length = 0;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('renders the real DtDaypartChart with 11:00 under Breakfast (not Lunch) and 23:00 under Dinner (not Late Night)', async () => {
    await act(async () => {
      root.render(React.createElement(DTSpeedOfServicePanel, { stores: [{ loc: '3708' }], onClose: () => {} }));
    });
    await flush(container);

    const daypartCfg = chartCalls.find(c => c.data?.datasets?.some(d => /by daypart/i.test(d.label || '')));
    expect(daypartCfg).toBeTruthy();
    const labels = daypartCfg.data.labels;
    const avgOf = (label) => daypartCfg.data.datasets[0].data[labels.indexOf(label)];

    // '11:00' alone feeds Breakfast -> avg exactly 111s. Pre-fix, '11:00' fed Lunch instead and
    // Breakfast would have been null/absent (no '05:00'-'10:00' rows supplied).
    expect(avgOf('Breakfast')).toBe(111);
    expect(labels.includes('Lunch')).toBe(true); // Lunch bucket exists...
    expect(avgOf('Lunch')).not.toBe(111);        // ...but does NOT carry the 11:00 row's value.

    // '23:00' feeds Dinner -> avg exactly 233s. Pre-fix, '23:00' fed Late Night instead.
    expect(avgOf('Dinner')).toBe(233);
    // Late Night is fed only by '24:00' (244s) under the fix; pre-fix it would have blended
    // 23:00 and 24:00 together ((233+244)/2 = 238.5), never a clean 244.
    expect(avgOf('Late Night')).toBe(244);
  });
});
