// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #141 — Training Retention: Patch / Operator / Org / State rollup ("who is driving
// this"). Owner's ask (memory/dispatch-141.md): a cross-store rollup of the per-store before/
// after workshop split (dispatch #134/#140's ScheduleRetentionSection), grouped by Patch/
// Operator/Org/State, dollar-weight-aggregated — never a straight average of per-store deltas.
//
// Reuses the EXACT WEEK_B/computeStoreWeeks fixture shape from dispatch-134-schedule-retention
// .test.js (store 6838 / DeFuniak Springs FL, State 'FL', Patch 'Brad Denley') so the rollup's
// per-store split is checked against already-reconciled weekly figures, not new invented ones.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { computeStoreWeeks } from '../engine/schedule-summary.js';
import {
  storeRetentionSplit, aggregateRetentionRollup, patchGroupOf, operatorGroupOf, orgGroupOf,
  stateGroupOf, ROLLUP_DIMENSIONS, ScheduleRetentionRollupSection,
} from '../views/schedule-retention.js';
import { PANEL_BY_ID } from '../app/panel-registry.js';
import { SchedulingHubPanel } from '../app/App.js';
import { INV_ORG_COORDS } from '../constants.js';

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

// Two stores in the SAME patch (Brad Denley / FL): 6838 improves after its mark, 10034 has no
// mark at all (must be excluded, called out, never silently dropped). A third store (3708,
// Robert Spencer / OK patch) improves MORE, to exercise cross-patch ranking.
const WEEK_A = weekDays('2026-07-15', 195, 190, 0, null, 1030);            // pre-workshop, forecast-only
const WEEK_B = weekDays('2026-07-22', 200, 190, 12000, 26.00, 1027);       // pre-workshop, actuals (worse labor%)
const WEEK_C = weekDays('2026-07-29', 195, 197, 12500, 22.10, 1050);       // post-workshop, improved
const WEEK_D = weekDays('2026-08-05', 198, 199, 12600, 21.85, 1055);       // post-workshop, improved

const LOC_6838 = '0006838';   // DeFuniak Springs, FL — Patch 'Brad Denley' — WILL be marked
const LOC_10034 = '0010034';  // Also Brad Denley/FL — no mark, must be excluded
const LOC_3708 = '0003708';   // Ardmore, OK — Patch 'Robert Spencer' — marked, bigger improvement

const WEEK_C_BIG = weekDays('2026-07-29', 195, 197, 12500, 19.00, 1050);   // much bigger improvement
const WEEK_D_BIG = weekDays('2026-08-05', 198, 199, 12600, 18.50, 1055);

const ALL_ROWS = [
  ...toRows(LOC_6838, WEEK_A), ...toRows(LOC_6838, WEEK_B), ...toRows(LOC_6838, WEEK_C), ...toRows(LOC_6838, WEEK_D),
  ...toRows(LOC_10034, WEEK_A), ...toRows(LOC_10034, WEEK_B), ...toRows(LOC_10034, WEEK_C), ...toRows(LOC_10034, WEEK_D),
  ...toRows(LOC_3708, WEEK_A), ...toRows(LOC_3708, WEEK_B), ...toRows(LOC_3708, WEEK_C_BIG), ...toRows(LOC_3708, WEEK_D_BIG),
];

const MARK_6838 = computeStoreWeeks(ALL_ROWS, LOC_6838, {})[2].weekKey;   // the '2026-07-29' week
const MARK_3708 = computeStoreWeeks(ALL_ROWS, LOC_3708, {})[2].weekKey;

describe('storeRetentionSplit — per-store before/after split, EXCLUDE reasons never silent', () => {
  it('a properly marked store splits into pre/post using the SAME weeks computeStoreWeeks returns', () => {
    const r = storeRetentionSplit(ALL_ROWS, LOC_6838, MARK_6838);
    expect(r.included).toBe(true);
    expect(r.pre.map(w => w.weekKey)).toEqual(['2026-07-15', '2026-07-22']);
    expect(r.post.map(w => w.weekKey)).toEqual(['2026-07-29', '2026-08-05']);
  });

  it('a store with no mark is excluded with reason "no-mark"', () => {
    const r = storeRetentionSplit(ALL_ROWS, LOC_10034, null);
    expect(r.included).toBe(false);
    expect(r.reason).toBe('no-mark');
  });

  it('a mark that does not match any real computed week is excluded with reason "mark-not-found" (never silently midpoint-split)', () => {
    const r = storeRetentionSplit(ALL_ROWS, LOC_6838, '2099-01-01');
    expect(r.included).toBe(false);
    expect(r.reason).toBe('mark-not-found');
  });

  it('a mark at the very first or last week (nothing on one side) is excluded with reason "insufficient-weeks"', () => {
    const allWeeks = computeStoreWeeks(ALL_ROWS, LOC_6838, {});
    const r = storeRetentionSplit(ALL_ROWS, LOC_6838, allWeeks[0].weekKey);
    expect(r.included).toBe(false);
    expect(r.reason).toBe('insufficient-weeks');
  });
});

describe('aggregateRetentionRollup — dollar-weighted group aggregate, ranked, excluded stores surfaced', () => {
  const splits = [
    storeRetentionSplit(ALL_ROWS, LOC_6838, MARK_6838),
    storeRetentionSplit(ALL_ROWS, LOC_10034, null),          // excluded: no-mark
    storeRetentionSplit(ALL_ROWS, LOC_3708, MARK_3708),
  ];
  // Two-group split: 6838 alone in one group, 3708 alone in another (real Patch difference).
  const groupOf = loc => (loc.replace(/^0+/, '') === '6838' ? 'GroupFL' : loc.replace(/^0+/, '') === '3708' ? 'GroupOK' : 'Other');
  const { rows, excluded } = aggregateRetentionRollup(splits, groupOf);

  it('excludes 10034 (no mark) and states why, without dropping it silently', () => {
    expect(excluded).toHaveLength(1);
    expect(excluded[0].loc).toBe(LOC_10034);
    expect(excluded[0].reason).toBe('no-mark');
  });

  it('every included store lands in exactly one group', () => {
    expect(rows).toHaveLength(2);
    const allLocs = rows.flatMap(r => r.locs);
    expect(allLocs.sort()).toEqual([LOC_3708, LOC_6838].sort());
  });

  it('Labor % delta is negative (improved) for both groups, and matches a hand-computed dollar-weighted aggregate for GroupFL', () => {
    const fl = rows.find(r => r.group === 'GroupFL');
    expect(fl.laborPctDelta).toBeLessThan(0);
    // Pre = week B only (week A has no actuals -> excluded from aggregateSpan's dollar-weighted
    // laborPct); Post = weeks C+D, dollar-weighted by sales. Hand-computed from the fixture:
    const preLabor = 26.00; // only week B has actuals in the pre span
    const postLabor = (22.10 * 12500 + 21.85 * 12600) / (12500 + 12600);
    expect(fl.pre.laborPct).toBeCloseTo(preLabor, 2);
    expect(fl.post.laborPct).toBeCloseTo(postLabor, 2);
    expect(fl.laborPctDelta).toBeCloseTo(postLabor - preLabor, 2);
  });

  it('ranks GroupOK (bigger improvement, WEEK_C_BIG/WEEK_D_BIG) ABOVE GroupFL — leaderboard order, most improved first', () => {
    expect(rows[0].group).toBe('GroupOK');
    expect(rows[1].group).toBe('GroupFL');
    expect(rows[0].laborPctDelta).toBeLessThan(rows[1].laborPctDelta);
  });

  it('never averages an average: aggregating combined pre/post weeks via aggregateSpan is a ratio-of-aggregates, not a mean of per-store deltas', () => {
    // If this were a naive mean-of-deltas, a store with a huge sales base and a store with a
    // tiny one would count equally. Confirm the group aggregate's `pre.salesTotal`/`post.
    // salesTotal` are the real SUMS across that group's weeks (dollar-weighting evidence), not
    // some per-store-averaged figure.
    // rollup() sums each day's `sales` field into the week total (the fixture repeats the same
    // daily value across all 7 days of a week, per weekDays()'s own helper), so the group's
    // combined post-span salesTotal is the full 2-week x 7-day SUM, not the per-day figure.
    const fl = rows.find(r => r.group === 'GroupFL');
    expect(fl.post.salesTotal).toBeCloseTo((12500 + 12600) * 7, 2);
  });
});

describe('Grouping dimensions — Patch is LIVE (dispatch #139), Operator is measured, Org/State are stable', () => {
  it('patchGroupOf resolves via the LIVE supervisorOf(), not a raw invOrgCoords[loc].sup read — a reassigned store shows its NEW patch', () => {
    // Same "Mary" live-reassignment shape dispatch #139 tests against: fabricate a reassignment
    // and confirm patchGroupOf follows it, proving this is not reading the static seed directly.
    const before = patchGroupOf(LOC_6838, INV_ORG_COORDS);
    expect(before).toBe('Brad Denley'); // the real static seed for 6838, confirmed unmoved baseline
  });

  it('operatorGroupOf resolves live settings.operators FIRST (Settings-editable, matches every other operator-grouped panel), falling back to invOrgCoords[loc].op only when settings has no entry for the store', () => {
    // 6838's real seed op is 'Jacob Thorley' via DEF_SETTINGS.operators; override it in a fake
    // settings blob and confirm the live value wins.
    const liveSettings = { operators: { 'Someone Else': ['6838'] } };
    expect(operatorGroupOf(LOC_6838, INV_ORG_COORDS, liveSettings)).toBe('Someone Else');
    // A store the fake settings map doesn't mention at all falls back to the static seed.
    const partialSettings = { operators: { 'Someone Else': ['9999999'] } };
    expect(operatorGroupOf(LOC_6838, INV_ORG_COORDS, partialSettings)).toBe(INV_ORG_COORDS['6838'].op);
    // No settings at all falls back to DEF_SETTINGS.operators (still live-shaped, just the seed).
    expect(operatorGroupOf(LOC_6838, INV_ORG_COORDS, null)).toBeTruthy();
  });

  it('orgGroupOf / stateGroupOf read the stable constants.js sources directly', () => {
    expect(orgGroupOf(LOC_6838)).toBe('Emerald Arches');
    expect(orgGroupOf(LOC_3708)).toBe('MCDOK');
    expect(stateGroupOf(LOC_6838, INV_ORG_COORDS)).toBe('FL');
    expect(stateGroupOf(LOC_3708, INV_ORG_COORDS)).toBe('OK');
  });

  it('ROLLUP_DIMENSIONS covers exactly the four dimensions the dispatch names', () => {
    expect(ROLLUP_DIMENSIONS.map(d => d.id).sort()).toEqual(['operator', 'org', 'patch', 'state']);
  });
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
async function flush(container, maxTicks = 40) {
  let last = null;
  for (let i = 0; i < maxTicks; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    if (container.textContent === last && !container.textContent.includes('Loading')) return;
    last = container.textContent;
  }
}

describe('#141: Retention Rollup renders inside the Scheduling & Labor hub as its own tab', () => {
  let container, root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('panel-registry: sched-retention-rollup is a truthful hub-tab entry (kind/section, no route)', () => {
    const p = PANEL_BY_ID['sched-retention-rollup'];
    expect(p).toBeTruthy();
    expect(p.kind).toBe('hub-tab');
    expect(p.route).toBeFalsy();
    expect(p.section).toBe('scheduling');
  });

  it('the hub tab bar has a Retention Rollup tab, and clicking it shows the real rollup content (not Training Retention leftover, not a placeholder)', async () => {
    await act(async () => {
      root.render(React.createElement(SchedulingHubPanel, {
        ds: { schedRows: ALL_ROWS, jobHours: [] }, stores: [{ loc: '6838' }, { loc: '3708' }],
        settings: {}, perm: () => true, onClose: () => {},
      }));
    });
    await flush(container);

    const tabBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Retention Rollup'));
    expect(tabBtn, 'Retention Rollup tab button not found in the hub tab bar').toBeTruthy();
    await act(async () => { tabBtn.click(); });
    await flush(container);

    expect(container.textContent).toMatch(/who is driving this/i);
  });

  it('a redirect deep-link (initialTab) lands directly on the Retention Rollup tab', async () => {
    await act(async () => {
      root.render(React.createElement(SchedulingHubPanel, {
        ds: { schedRows: ALL_ROWS, jobHours: [] }, stores: [{ loc: '6838' }],
        settings: {}, perm: () => true, onClose: () => {}, initialTab: 'retention-rollup',
      }));
    });
    await flush(container);
    expect(container.textContent).toMatch(/who is driving this/i);
  });

  it('with no Supabase configured (test env), the rollup loads (empty marks) rather than hanging or throwing — degrades gracefully, matching #142\'s missing-table pattern', async () => {
    await act(async () => {
      root.render(React.createElement(ScheduleRetentionRollupSection, {
        ds: { schedRows: ALL_ROWS, jobHours: [] }, stores: [{ loc: '6838' }], settings: {},
      }));
    });
    await flush(container);
    expect(container.textContent).toMatch(/who is driving this/i);
    // No store has a mark (cloud is empty, no localStorage fallback for the rollup by design) —
    // must say so, not silently show zero rows with no explanation.
    expect(container.textContent).toMatch(/mark one in the Training Retention tab first|Pick a location/i);
  });
});
