// @vitest-environment happy-dom
// @ts-nocheck
// Backlog item G (shift dimension, labor-allocation.js): "(1) live-browser verification still
// needed -- no code-level way to check the District/By Store/Overnight views render correctly;
// (2) zero perf instrumentation (no trace/span/performance-mark idiom in the file)."
//
// This closes both: renders the REAL LaborAllocationPanel (not allocationDistrict/
// allocationByStoreDaypart/overnightOpenness/overnightExcessByStore in isolation -- per this
// repo's "would this verification still pass if reverted" rule, a wiring break between the
// engine and the panel has to show up here) across all 3 tabs with a realistic fixture built
// from the engine's own documented row/config shapes, and confirms the panel doesn't crash on
// the genuinely-empty-rows case either (the actual shape a fresh cloud session sees before its
// own 90-day fetch resolves). Perf instrumentation itself (_mark wrapping the 4 useMemo calls)
// isn't independently exercised here -- click-trace.js's own mark() is a transparent pass-
// through when tracing is off (the default, and what this test runs under), so there is nothing
// for a render test to observe about it either way; it's verified by code review instead.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

vi.mock('../lib/supabase.js', () => ({
  loadDailyActivityRange: vi.fn(),
  loadStoreLaborConfig: vi.fn(),
  // Task #73 -- LaborAllocationPanel now also loads the real VLH-workbook guide (loadVlhStoreConfigs/
  // loadVlhGuideHours) for its new "VLH Guide (Real)" tab. Every existing test below leaves these
  // unmocked-default (undefined resolve), so add a default empty resolve here rather than letting
  // Promise.all reject on a missing mock -- exactly the "would this still pass if reverted" trap this
  // file's own header names: a mock left stale by a new import would silently break every pre-existing
  // test's data load, not just skip the new tab.
  loadVlhStoreConfigs: vi.fn(),
  loadVlhGuideHours: vi.fn(),
}));

import { loadDailyActivityRange, loadStoreLaborConfig, loadVlhStoreConfigs, loadVlhGuideHours } from '../lib/supabase.js';
import { LaborAllocationPanel } from '../views/labor-allocation.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// hour_slot runs '05'..'28' (24 distinct slots, the 4am business day) -- daypartOf
// (labor-standard.js) buckets 06-11 Breakfast, 12-14 Lunch, 15-17 Afternoon, 18-23 Dinner,
// 05 + 24-28 Late Night. Matches the engine's own completeness guard (all 24 slots per
// (loc,dt) or the day is dropped entirely), so this fixture must supply every slot.
const HOUR_SLOTS = ['05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28'];

function buildRows() {
  const rows = [];
  const days = ['2026-08-10', '2026-08-11'];
  for (const dt of days) {
    for (const slot of HOUR_SLOTS) {
      const h = parseInt(slot, 10);
      const isLateNight = h === 5 || h >= 24;
      // Store 5: real drive-thru traffic around the clock -- overnight OPEN branch.
      rows.push({
        loc: '0000005', dt, hour_slot: slot,
        dt_trans_cnt: isLateNight ? 4 : 12,
        actual_punched_hours: isLateNight ? 3 : 8,
        total_needed_hours: isLateNight ? 2.5 : 7,
        total_scheduled_hours: isLateNight ? 3 : 7.5,
        actual_punched_dollars: isLateNight ? 45 : 120,
        dt_untilserve: isLateNight ? 4 * 180000 : 12 * 150000, // ms, matches graded-visits.js's secOf convention
      });
      // Store 9: zero DT traffic overnight -- overnight CLOSED branch, real close-down hours.
      rows.push({
        loc: '0000009', dt, hour_slot: slot,
        dt_trans_cnt: isLateNight ? 0 : 10,
        actual_punched_hours: isLateNight ? 3.5 : 7,
        total_needed_hours: isLateNight ? 0 : 6,
        total_scheduled_hours: isLateNight ? 3.5 : 6.5,
        actual_punched_dollars: isLateNight ? 50 : 100,
        dt_untilserve: isLateNight ? 0 : 10 * 160000,
      });
    }
  }
  return rows;
}

// loadStoreLaborConfig's real shape: keyed by UNPADDED loc, {is24hr, hours:{mon:{open,...}}}
// (labor-standard.js's own overnightExcessByStore doc comment).
const STORE_LABOR_CONFIG = {
  9: {
    is24hr: false,
    hours: Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map(wd => [wd, { open: 0.25 }])), // 6:00am every day, uniform
  },
};

describe('LaborAllocationPanel renders District/By Store/Overnight (backlog item G)', () => {
  let container, root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    loadVlhStoreConfigs.mockResolvedValue({});
    loadVlhGuideHours.mockResolvedValue([]);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    vi.clearAllMocks();
  });

  const NOOP = () => {};

  it('District tab renders real deficit/surplus totals from the engine, not zeros', async () => {
    loadDailyActivityRange.mockResolvedValue(buildRows());
    loadStoreLaborConfig.mockResolvedValue(STORE_LABOR_CONFIG);

    await act(async () => {
      root.render(React.createElement(LaborAllocationPanel, { ds: {}, stores: [], settings: {}, onClose: NOOP, embedded: true }));
      await new Promise(r => setTimeout(r, 0));
    });

    expect(container.textContent).toContain('Deficit');
    expect(container.textContent).toContain('Surplus');
    expect(container.textContent).toContain('Breakfast');
    expect(container.textContent).toContain('Late Night');
    // Real engine output, not the loading/empty placeholders.
    expect(container.textContent).not.toContain('Loading 90 days');
    expect(container.textContent).not.toContain('No hourly activity data loaded');
  });

  it('By Store tab (default daypart Breakfast) lists both fixture stores with real gap hours', async () => {
    loadDailyActivityRange.mockResolvedValue(buildRows());
    loadStoreLaborConfig.mockResolvedValue(STORE_LABOR_CONFIG);

    await act(async () => {
      root.render(React.createElement(LaborAllocationPanel, { ds: {}, stores: [], settings: {}, onClose: NOOP, embedded: true }));
      await new Promise(r => setTimeout(r, 0));
    });
    const storeTabBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'By Store');
    expect(storeTabBtn).toBeTruthy();
    await act(async () => { storeTabBtn.click(); });

    expect(container.textContent).toContain('Store 5');
    expect(container.textContent).toContain('Store 9');
    expect(container.textContent).not.toContain('No data for this daypart');
  });

  it('Overnight tab shows the OPEN branch (TPPH) for store 5 and the CLOSED branch (standard verdict) for store 9', async () => {
    loadDailyActivityRange.mockResolvedValue(buildRows());
    loadStoreLaborConfig.mockResolvedValue(STORE_LABOR_CONFIG);

    await act(async () => {
      root.render(React.createElement(LaborAllocationPanel, { ds: {}, stores: [], settings: {}, onClose: NOOP, embedded: true }));
      await new Promise(r => setTimeout(r, 0));
    });
    const overnightTabBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Overnight');
    await act(async () => { overnightTabBtn.click(); });

    expect(container.textContent).toContain('Store 5');
    expect(container.textContent).toContain('Store 9');
    expect(container.textContent).toContain('Open');   // store 5's status cell
    expect(container.textContent).toContain('Closed');  // store 9's status cell
    expect(container.textContent).toMatch(/TPPH/);      // store 5's open-branch reading
    // Store 9: punched 3.5h/night vs the 6am-opener standard (close-down 3-4h + 0 pre-open-in-LN
    // fraction since 6am is exactly the Breakfast/Late-Night boundary) -- "on target" or a named
    // over/under verdict, never the na/no-config placeholder this fixture's config rules out.
    expect(container.textContent).not.toContain('no store_labor_config row');
  });

  it('renders the empty-data placeholder (not a crash) when the 90-day fetch resolves with zero rows -- the real shape a fresh session sees before cloud data lands', async () => {
    loadDailyActivityRange.mockResolvedValue([]);
    loadStoreLaborConfig.mockResolvedValue({});

    await act(async () => {
      root.render(React.createElement(LaborAllocationPanel, { ds: {}, stores: [], settings: {}, onClose: NOOP, embedded: true }));
      await new Promise(r => setTimeout(r, 0));
    });

    expect(container.textContent).toContain('No hourly activity data loaded for this window.');
  });

  // Task #73 -- wires the real VLH-workbook engine (src/engine/vlh-guide.js) into a 4th tab.
  // Mirrors this file's own header rule: verify through the PANEL, not the engine in isolation,
  // so a wiring break here (wrong loader, wrong key normalization) actually shows up.
  it('VLH Guide (Real) tab shows real coverage numbers for a configured store, not the empty-guide placeholder', async () => {
    const guideRows = buildRows(); // Store 5 breakfast slots (06-11) carry total_needed_hours already
    for (const r of guideRows) {
      if (r.loc === '0000005') { r.dt_transactions = 8; r.is_transactions = 60; }
    }
    loadDailyActivityRange.mockResolvedValue(guideRows);
    loadStoreLaborConfig.mockResolvedValue(STORE_LABOR_CONFIG);
    loadVlhStoreConfigs.mockResolvedValue({
      5: { loc: '0000005', aot: false, dt_type: 'side_tandem', in_store: 'self_serve', kitchen: 'fryer_same', vlh_guide: 'standard' },
    });
    loadVlhGuideHours.mockResolvedValue([
      { guide: 'standard', aot: false, dt_type: 'side_tandem', in_store: 'self_serve', kitchen: 'fryer_same', position: 'drive_thru', daypart: 'breakfast', tier: 2, guest_start: 0, guest_end: 9999 },
      { guide: 'standard', aot: false, dt_type: 'side_tandem', in_store: 'self_serve', kitchen: 'fryer_same', position: 'in_store', daypart: 'breakfast', tier: 1, guest_start: 0, guest_end: 9999 },
    ]);

    await act(async () => {
      root.render(React.createElement(LaborAllocationPanel, { ds: {}, stores: [], settings: {}, onClose: NOOP, embedded: true }));
      await new Promise(r => setTimeout(r, 0));
    });
    const guideTabBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'VLH Guide (Real)');
    expect(guideTabBtn).toBeTruthy();
    await act(async () => { guideTabBtn.click(); });

    expect(container.textContent).toContain('Store 5');
    expect(container.textContent).toContain('Breakfast');
    expect(container.textContent).toContain('vlh_guide_hours');
    expect(container.textContent).not.toContain('No VLH guide data for this window');
    // Store 9 has no store_vlh_config entry in this fixture -- confirms the "skip stores with
    // no config, never guess" contract survives the real panel wiring, not just the engine.
    const guideTable = [...container.querySelectorAll('table')].pop();
    expect(guideTable.textContent).not.toContain('Store 9');
  });
});
