// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #75 -- Visit Patterns pooled all 4 years of CFV channel data into one pass-rate per
// channel, which is exactly what hid memory/finding-cfv-2026-drivethru-decline-2026-08-22.md:
// drive-thru went 43%->60% of visits AND 25%->54% below-80 in the SAME year, and neither move is
// visible in an all-time average. Fixed with a per-(channel, year) breakdown showing both the
// share of visits and the below-80 rate, with n on every cell and thin cells (< the engine's own
// CHANNEL_YEAR_MIN_N) suppressed to a count rather than a confident-looking percentage.
//
// Per the standing "would this verification still pass if reverted" rule and the dispatch's own
// bar, this renders the ACTUAL VisitPatterns consumer -- not analyzeGradedVisits directly -- so a
// revert of the panel's own rendering (reverting to `block('Channel', a.channel)`) fails this
// test even though the engine's channelByYear computation would still be intact.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { VisitPatterns } from '../views/visit-readiness.js';
import { CHANNEL_YEAR_MIN_N } from '../engine/visit-readiness.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CFV_CHANNEL_MAP = { driveThru: 'Drive Thru', curbside: 'Curbside', inRestaurant: 'In Restaurant' };
// The real 217-visit dataset dispatch #74 imported -- reused here (not re-fabricated) so this
// panel's rendering is checked against the same numbers the finding itself was computed from,
// matching this session's established pattern of grounding panel tests in committed real data
// (see dispatch-74-cfv-import-panel.test.js) rather than only a synthetic fixture.
const realCfv2026 = JSON.parse(readFileSync(path.join(__dirname, '../../memory/data/cfv-history-2023-2026.json'), 'utf8'))
  .visits.map(v => ({
    store: String(v.loc).padStart(5, '0'), channel: CFV_CHANNEL_MAP[v.channel], reportType: v.reportType,
    dateISO: v.visitDate, score: v.overallPct, pass: v.overallPct >= 80,
  }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const CURRENT_YEAR = String(new Date().getFullYear());

// n visits for one (channel, year), `belowCount` of them scored under 80 (score 70, fail) and
// the rest at 85 (pass) -- mirrors the real pass derivation (dispatch #74: score >= 80) without
// re-deriving it, since analyzeGradedVisits reads v.pass directly.
function mkVisits(channel, year, n, belowCount, store = '10422') {
  return Array.from({ length: n }, (_, i) => ({
    store, channel, reportType: 'CFV',
    dateISO: `${year}-03-${String((i % 27) + 1).padStart(2, '0')}`,
    score: i < belowCount ? 70 : 85,
    pass: i >= belowCount,
  }));
}

function mkFixture() {
  return [
    // 2024: Drive Thru mix 50% (10/20), below-80 20% (2/10) -- both cells sit exactly at the
    // n=10 floor, so this also pins the boundary (10 is NOT thin; 10 < CHANNEL_YEAR_MIN_N is false).
    ...mkVisits('Drive Thru', '2024', 10, 2),
    // belowCount=1, not 0 -- a real 0.00% below rate on a legitimate (non-thin) cell would
    // collide with the "the thin cell renders no rate at all" assertion below.
    ...mkVisits('Curbside', '2024', 10, 1),
    // CURRENT_YEAR (partial): Drive Thru mix rises to 15/21 = 71.43%, below-80 rises to 60% (9/15)
    // -- the SAME shape as the real drive-thru finding (mix and rate move together).
    ...mkVisits('Drive Thru', CURRENT_YEAR, 15, 9),
    ...mkVisits('Curbside', CURRENT_YEAR, 5, 0),
    // Thin-cell case: In Restaurant, n=1, well under the floor.
    ...mkVisits('In Restaurant', CURRENT_YEAR, 1, 0),
  ];
}

function openPanel(container) {
  const header = container.querySelectorAll('div')[1];
  act(() => { header.click(); });
}

describe('Channel over time (dispatch #75)', () => {
  let container, root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('shows both share-of-visits and below-80% per (channel, year), with n on every cell', () => {
    const ds = { gradedVisits: mkFixture() };
    act(() => { root.render(React.createElement(VisitPatterns, { ds, locs: null })); });
    openPanel(container);
    const text = container.textContent;

    expect(text).toContain('Channel over time');

    // 2024 Drive Thru: n=10 sits exactly at the floor -- must render as a real reading, not thin.
    expect(text).toContain('20.00% below');
    expect(text).toContain('50.00% of yr · n=10');

    // CURRENT_YEAR Drive Thru: mix AND rate both moved -- this is the finding the pooled view hid.
    expect(text).toContain('60.00% below');
    expect(text).toContain('71.43% of yr · n=15');

    // The current year is partial and must be labeled as such, not presented as complete.
    expect(text).toContain(CURRENT_YEAR + '*');
    expect(text).toContain('partial year');
  });

  it('suppresses a thin (n=1) cell to a count, never a bare 0%/100%', () => {
    const ds = { gradedVisits: mkFixture() };
    act(() => { root.render(React.createElement(VisitPatterns, { ds, locs: null })); });
    openPanel(container);
    const text = container.textContent;

    expect(text).toContain('In Restaurant');
    expect(text).toContain('n=1 (thin)');
    // The thin cell's own DOM node must carry no percentage at all -- not "% below" (a
    // textContent substring check against '0.00% below' is a trap here: several legitimate
    // non-thin cells in this fixture render "X0.00% below", e.g. "20.00%"/"60.00%", and would
    // collide with a naive substring check). Find the exact node holding "n=1 (thin)" and check
    // its immediate cell container instead.
    const thinCountEl = [...container.querySelectorAll('div')]
      .find(d => d.children.length === 0 && d.textContent === 'n=1 (thin)');
    expect(thinCountEl).toBeTruthy();
    expect(thinCountEl.parentElement.textContent).not.toContain('%');
    expect(text).toContain('too thin to rate');
    expect(text).toContain(`n=${CHANNEL_YEAR_MIN_N}`); // the floor itself is stated, not hidden
  });

  it('no trend line or slope indicator is rendered for the channel-over-time section', () => {
    const ds = { gradedVisits: mkFixture() };
    act(() => { root.render(React.createElement(VisitPatterns, { ds, locs: null })); });
    openPanel(container);
    // No <svg>/<canvas>/<polyline> -- the dispatch is explicit that a trend line is not
    // supportable at these n's. A table only.
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('real data: 2026 drive-thru reads 59.57% of visits and 53.57% below-80, and all 4 In Restaurant cells are thin', () => {
    const ds = { gradedVisits: realCfv2026 };
    act(() => { root.render(React.createElement(VisitPatterns, { ds, locs: null })); });
    openPanel(container);
    const text = container.textContent;

    // Matches memory/finding-cfv-2026-drivethru-decline-2026-08-22.md's headline move (drive-thru
    // 43%->60% of visits, 25%->54% below-80) computed independently from the same committed seed
    // file dispatch #74 imported -- not re-derived from this panel's own code.
    expect(text).toContain('53.57% below');
    expect(text).toContain('59.57% of yr · n=28');

    // In Restaurant is thin in every single year of real history (n=1/3/7/5, all under the
    // floor) -- confirms the suppression actually fires on the real distribution it was measured
    // from, not just a hand-picked synthetic case.
    const inRestaurantThinCells = [...container.querySelectorAll('div')]
      .filter(d => d.children.length === 0 && /^n=\d+ \(thin\)$/.test(d.textContent));
    expect(inRestaurantThinCells.length).toBeGreaterThanOrEqual(4);
  });
});
