// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #75's Channel-over-time block counted channel-LESS visits in its "share of yr"
// denominator. RGR visits carry no channel, so a year containing them had every channel's share
// diluted while no numerator moved -- the shares stopped summing to 100% and the year looked like
// its channels shrank.
//
// Reproduced from a real screenshot of the shipped panel (2026-08-23, 'All types', 237 visits):
// 2023/2024/2025 were correct only BY ACCIDENT (no RGR those years), while 2026 -- which holds all
// 20 RGR visits -- rendered drive-thru at ~41.8% of yr instead of 59.6%, against 43.1% in 2025.
// On screen that reads FLAT-to-DOWN when the truth is a 16-point RISE: exactly the trend #75 was
// built to surface, hidden one layer down.
//
// Renders the actual VisitPatterns panel per the standing revert-sensitivity rule, so a revert of
// either the engine fix or the panel's use of it registers.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { VisitPatterns } from '../views/visit-readiness.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host, root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

function renderPanel(visits) {
  act(() => root.render(React.createElement(VisitPatterns, { ds: { gradedVisits: visits }, locs: null })));
  const header = [...host.querySelectorAll('div')].find(d => d.textContent.startsWith('Visit Patterns'));
  act(() => header.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

const cfv = (dateISO, channel, score) =>
  ({ store: '03708', channel, reportType: 'CFV', dateISO, score, pass: score >= 80 });
// RGR visits carry NO channel -- that is the whole point of this test.
const rgr = (dateISO, score) =>
  ({ store: '03708', reportType: 'RGR', dateISO, score, pass: score >= 80 });

// Mirrors the real shape: two years, identical channel composition, but only the SECOND year
// also contains channel-less RGR visits. Under the bug, year two's shares shrink for no reason.
function fixture() {
  const v = [];
  for (let i = 0; i < 12; i++) v.push(cfv('2025-03-' + String(i + 1).padStart(2, '0'), 'Drive Thru', 90));
  for (let i = 0; i < 12; i++) v.push(cfv('2025-04-' + String(i + 1).padStart(2, '0'), 'Curbside', 90));
  for (let i = 0; i < 12; i++) v.push(cfv('2026-03-' + String(i + 1).padStart(2, '0'), 'Drive Thru', 90));
  for (let i = 0; i < 12; i++) v.push(cfv('2026-04-' + String(i + 1).padStart(2, '0'), 'Curbside', 90));
  for (let i = 0; i < 24; i++) v.push(rgr('2026-05-' + String(i + 1).padStart(2, '0'), 90));
  return v;
}

// Pull every "NN.NN% of yr" figure the Channel block rendered.
function sharesOfYr() {
  const heading = [...host.querySelectorAll('div')]
    .find(d => d.textContent.trim().startsWith('Channel over time'));
  const block = heading.parentElement;
  return [...block.textContent.matchAll(/([\d.]+)% of yr/g)].map(m => +m[1]);
}

describe('Channel share is a share of channel-bearing visits, not of all visits', () => {
  it('channel-less RGR visits do not dilute the year they land in', () => {
    renderPanel(fixture());
    // 12 of 24 channel-bearing visits in BOTH years => every cell is 50%.
    // Under the bug 2026 renders 12/48 = 25% because the 24 RGR rows inflate its denominator.
    const shares = sharesOfYr();
    expect(shares.length).toBe(4);
    for (const s of shares) expect(s).toBeCloseTo(50, 1);
    expect(shares).not.toContain(25);
  });

  it('shares within a year sum to 100%', () => {
    renderPanel(fixture());
    const shares = sharesOfYr();
    // Two channels per year, two years -> each year's pair must total 100.
    const total = shares.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(200, 1);
  });

  it('a year with NO channel-less visits is unaffected by the fix', () => {
    // Guards against over-correcting: 2025 was already right and must stay right.
    renderPanel(fixture().filter(v => v.reportType !== 'RGR'));
    const shares = sharesOfYr();
    for (const s of shares) expect(s).toBeCloseTo(50, 1);
  });
});
