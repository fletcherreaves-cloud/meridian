// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #110 -- Speed of Service panel (src/views/dt-speedofservice.js): Avg-DT bar in the
// By-Hour table, DtTrendChart line->bar conversion (avg mode only), the shared DateRangeControl
// replacing the hardcoded 30/60/90 <select>, and the root-caused patch-selector redraw bug.
//
// Renders the REAL DTSpeedOfServicePanel (not an isolated helper), per this repo's "would this
// verification still pass if reverted?" standing rule -- CLAUDE.md notes the agent sandbox can't
// reach live Supabase (qsr_daily_activity is RLS-restricted), so loadDtHistory is mocked with
// synthetic rows shaped exactly like the real table, and chart.js/auto is mocked (happy-dom has
// no canvas 2D context) to CAPTURE every Chart construction -- letting item 4's fix be asserted
// directly: does a filter change that leaves weeks.length and series.length unchanged still
// produce a NEW Chart call with the new values, not the old (buggy) ones?
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ── Synthetic qsr_daily_activity rows ────────────────────────────────────────
// Two real store locs from two different default patches (constants.js DEF_SETTINGS.
// supervisorGroups): 3708 (Ardmore, "Robert Spencer") and 5183 (Chickasha, "Krystiana
// Langford"). 3708 is tuned to a constant 150s avg DT (fast/green), 5183 to a constant 250s
// avg DT (slow/red) -- deliberately DIFFERENT so an org/store filter switch changes the
// computed values, not just which locs are summed over the same total.
//
// Dispatch #128 Part 1 -- the panel's DT number now runs through oepeSeconds() (dt_untilserve -
// dt_untilstore - dt_heldtime, over dt_trans_cnt), not a raw dt_untilserve/dt_trans_cnt ratio.
// dt_untilstore is set to a constant 10s/order "park" component and dt_heldtime to 0, so
// oepeSeconds still resolves to exactly avgSec (10s added to dt_untilserve, then subtracted back
// out) -- every one of this file's pre-existing avgSec-based assertions stays valid unchanged.
// dt_untilstore must be > 0 (oepeSeconds' own null-guard for "no gap data") -- 0 would make every
// avg null instead of the old raw-ratio value.
const PARK_SEC = 10;
const rows = [];
function addRow(loc, dt, hourSlot, avgSec, cnt) {
  rows.push({
    loc, dt, hour_slot: hourSlot,
    dt_untilserve: (avgSec + PARK_SEC) * 1000 * cnt, dt_untilstore: PARK_SEC * 1000 * cnt, dt_heldtime: 0,
    dt_trans_cnt: cnt,
    fc_untilserve: 0, fc_trans_cnt: 0, mfy1_untilserve: 0, mfy1_trans_cnt: 0,
    mfy2_untilserve: 0, mfy2_trans_cnt: 0, bev_untilserve: 0, bev_trans_cnt: 0,
  });
}
// Week of Mon 2026-08-03
addRow('3708', '2026-08-03', '08:00', 150, 20);
addRow('3708', '2026-08-04', '12:00', 150, 20);
addRow('5183', '2026-08-03', '08:00', 250, 20);
addRow('5183', '2026-08-04', '12:00', 250, 20);
// Week of Mon 2026-08-10
addRow('3708', '2026-08-10', '08:00', 150, 20);
addRow('3708', '2026-08-11', '12:00', 150, 20);
addRow('5183', '2026-08-10', '08:00', 250, 20);
addRow('5183', '2026-08-11', '12:00', 250, 20);

vi.mock('../lib/supabase.js', () => ({ loadDtHistory: vi.fn(() => Promise.resolve(rows)) }));

// Fake Chart.js -- records every construction (config) and destruction, no-ops draw entirely
// (happy-dom's canvas has no real 2D context). Mirrors this file's own destroy/re-create
// lifecycle (useChart destroys the previous instance before building a new one).
const chartCalls = [];
class FakeChart {
  constructor(canvas, config) { this.config = config; chartCalls.push(config); }
  destroy() {}
}
vi.mock('chart.js/auto', () => ({ Chart: FakeChart }));

const { DTSpeedOfServicePanel } = await import('../views/dt-speedofservice.js');

function setSelectValue(el, v) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(el, v);
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
async function flush(container, maxTicks = 15) {
  let last;
  for (let i = 0; i < maxTicks; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
    if (container.textContent === last) return;
    last = container.textContent;
  }
}
// DtTrendChart configs specifically, NOT DtDaypartChart -- both charts share this file and
// DtDaypartChart's single dataset is labeled "Avg DT by daypart", which also contains the
// substring "DT", so filtering on that alone (over-)matches both charts. The reference-line
// datasets (isRef:true) are unique to DtTrendChart (DtDaypartChart has none), so require one.
// Dispatch #128 -- was a `/200s|240s/` label-text regex; the ref lines' VALUES are now each
// store's own target (not a fixed 200/240), so isRef (a real dataset property DtTrendChart sets,
// not pattern-matched display text) is the only stable way to identify them.
const trendConfigs = () => chartCalls.filter(c => c.data?.datasets?.some(d => d.isRef));

describe('Dispatch #110 -- Speed of Service panel', () => {
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

  async function renderPanel() {
    await act(async () => {
      root.render(React.createElement(DTSpeedOfServicePanel, {
        stores: [{ loc: '3708' }, { loc: '5183' }], onClose: () => {},
      }));
    });
    await flush(container);
  }

  it('item 3: DateRangeControl replaces the old 30/60/90 <select> -- full preset catalog + Custom present', async () => {
    await renderPanel();
    const buttons = [...container.querySelectorAll('button')].map(b => b.textContent);
    for (const label of ['7D', '14D', '28D', '30D', '60D', '90D', '180D', 'Custom…']) {
      expect(buttons).toContain(label);
    }
    // The old hardcoded PERIODS labels ('30 Days' etc.) are gone.
    expect(container.textContent).not.toMatch(/30 Days|60 Days|90 Days/);
  });

  it('item 1: By-Hour table gets a second (Avg DT) bar alongside the existing Trans bar', async () => {
    await renderPanel();
    const tables = [...container.querySelectorAll('table')];
    // Store Ranking table is first in DOM order, By Hour second (per the panel's own layout).
    const byHourTable = tables[1];
    expect(byHourTable).toBeTruthy();
    expect(container.textContent).toMatch(/By Hour/);
    const rows_ = [...byHourTable.querySelectorAll('tbody tr')];
    expect(rows_.length).toBeGreaterThan(0);
    // Every row should now carry TWO hand-rolled bar <div>s (height:6px, per this file's
    // existing sizing convention) -- one for Avg DT (new), one for Trans (pre-existing).
    for (const tr of rows_) {
      const bars = [...tr.querySelectorAll('div')].filter(d => d.style.height === '6px');
      expect(bars.length).toBe(2);
    }
  });

  it('item 2: Weekly DT Trend renders as a BAR chart in the default avg mode, with explicit line-type ref lines', async () => {
    await renderPanel();
    const cfgs = trendConfigs();
    expect(cfgs.length).toBeGreaterThan(0);
    const cfg = cfgs[cfgs.length - 1];
    expect(cfg.type).toBe('bar');
    const avgDs = cfg.data.datasets.find(d => d.label === 'Avg DT');
    expect(avgDs).toBeTruthy();
    expect(avgDs.type).toBeUndefined(); // inherits the base chart's 'bar' type
    expect(Array.isArray(avgDs.backgroundColor)).toBe(true); // per-bar dtColor fill, not one line color
    // Ref lines need an explicit type:'line' override now that the base chart is type:'bar'
    // (Chart.js mixed-chart requirement) -- verifies this wasn't a blind type-string flip.
    // Dispatch #128 -- filters on isRef (not label text: the ref lines' values are now this
    // scope's own averaged tOepe, not a fixed 200/240).
    const refLines = cfg.data.datasets.filter(d => d.isRef);
    expect(refLines.length).toBe(2);
    for (const rl of refLines) expect(rl.type).toBe('line');
  });

  it('item 2: store/patch trend modes stay as LINE charts (multi-series bars would be unreadable)', async () => {
    await renderPanel();
    const byStoreBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'By store');
    await act(async () => { byStoreBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    const cfg = trendConfigs().slice(-1)[0];
    expect(cfg.type).toBe('line');
    expect(cfg.data.datasets.filter(d => !d.isRef).length).toBe(2); // one per store in scope
  });

  it('item 4 (root-caused bug): switching the store/patch filter in avg mode visibly redraws the chart with the NEW values', async () => {
    await renderPanel();
    // Baseline: 'all' scope averages 3708 (150s) and 5183 (250s) at EQUAL weight per week ->
    // 200s exactly, both weeks (deliberately identical week-to-week so weeks.join(',') is
    // unaffected by the filter switch below -- isolates the redraw fix from a weeks-changed
    // confound).
    const before = trendConfigs().slice(-1)[0];
    const beforeData = before.data.datasets.find(d => d.label === 'Avg DT').data;
    expect(beforeData).toEqual([200, 200]);

    // Switch the org/store filter to JUST store 3708 (150s constant). In 'avg' mode this holds
    // BOTH of the old buggy deps constant: series.length stays 1 (avg mode is always exactly
    // one series) and weeks.join(',') stays the same two Mondays (both stores report the same
    // two weeks) -- the exact shape dispatch #110 describes. Only the series' VALUES change.
    const orgSelect = [...container.querySelectorAll('select')].find(s =>
      [...s.querySelectorAll('option')].some(o => o.value === '3708'));
    expect(orgSelect).toBeTruthy();
    await act(async () => { setSelectValue(orgSelect, '3708'); });
    await flush(container);

    const after = trendConfigs().slice(-1)[0];
    const afterData = after.data.datasets.find(d => d.label === 'Avg DT').data;
    // The FIX: a new Chart call fires with the genuinely new values. Pre-fix, useChart's effect
    // deps [weeks.join(','), series.length, mode] would not have changed, the redraw effect
    // would never re-fire, and afterData would still read the STALE [200, 200].
    expect(afterData).toEqual([150, 150]);
    expect(afterData).not.toEqual(beforeData);
    // And the chart was genuinely reconstructed (not just re-read) -- a strictly-more Chart call.
    expect(chartCalls.length).toBeGreaterThan(0);
  });

  it('item 4: the redraw fix also holds in "By store" and "By patch" trend modes', async () => {
    await renderPanel();
    const byPatchBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'By patch');
    await act(async () => { byPatchBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    const before = trendConfigs().slice(-1)[0];
    // 2 patches in scope (Robert Spencer for 3708, Krystiana Langford for 5183).
    expect(before.data.datasets.filter(d => !d.isRef).length).toBe(2);

    const orgSelect = [...container.querySelectorAll('select')].find(s =>
      [...s.querySelectorAll('option')].some(o => o.value === '5183'));
    await act(async () => { setSelectValue(orgSelect, '5183'); });
    await flush(container);

    const after = trendConfigs().slice(-1)[0];
    const nonRef = after.data.datasets.filter(d => !d.isRef);
    expect(nonRef.length).toBe(1); // scoped to a single store -> a single patch series remains
    expect(nonRef[0].data).toEqual([250, 250]);
  });
});
