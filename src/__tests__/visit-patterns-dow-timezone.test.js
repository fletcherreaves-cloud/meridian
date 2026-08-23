// @vitest-environment happy-dom
// @ts-nocheck
// Visit Patterns' Day-of-week block was off by one for every real viewer.
//
// A graded visit's dateISO is a bare 'YYYY-MM-DD', and `new Date('2026-07-07')` parses a
// date-only string as UTC midnight. `.getDay()` then reads LOCAL time, so in any negative-offset
// zone -- both of this estate's markets, Oklahoma Central and Florida Eastern -- it reports the
// PREVIOUS day. CI runs in UTC, which is exactly why this shipped: the bug is invisible in the
// one timezone nobody looks at the panel from.
//
// These tests pin the timezone to America/Chicago on purpose. Under the old
// `new Date(v.dateISO)` they fail; under `_localDay`'s local-noon anchor they pass. Per the
// standing "would this verification still pass if the change were reverted" rule they render the
// ACTUAL VisitPatterns panel rather than calling analyzeGradedVisits directly, so a revert of
// either the engine helper or the panel's use of it registers.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { VisitPatterns } from '../views/visit-readiness.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CFV_CHANNEL_MAP = { driveThru: 'Drive Thru', curbside: 'Curbside', inRestaurant: 'In Restaurant' };

// The same real 217-visit dataset dispatch #74 imported and #75's test already reads -- not a
// re-fabricated fixture, so the counts asserted below are the estate's actual visit calendar.
const realCfv = JSON.parse(readFileSync(path.join(__dirname, '../../memory/data/cfv-history-2023-2026.json'), 'utf8'))
  .visits.map(v => ({
    store: String(v.loc).padStart(5, '0'), channel: CFV_CHANNEL_MAP[v.channel], reportType: v.reportType,
    dateISO: v.visitDate, score: v.overallPct, pass: v.overallPct >= 80,
  }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let _tz;
beforeAll(() => { _tz = process.env.TZ; process.env.TZ = 'America/Chicago'; });
afterAll(() => { if (_tz === undefined) delete process.env.TZ; else process.env.TZ = _tz; });

let host, root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

// Renders the panel expanded (it starts collapsed behind its own header click).
function renderPanel(visits) {
  act(() => root.render(React.createElement(VisitPatterns, { ds: { gradedVisits: visits }, locs: null })));
  const header = [...host.querySelectorAll('div')].find(d => d.textContent.startsWith('Visit Patterns'));
  act(() => header.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

// Reads the Day-of-week block back as { Mon: 42, ... } from the rendered DOM. Locating the block
// by its own heading (rather than scanning all text) keeps this from silently matching the
// Daypart or Weekpart blocks, which use the identical row markup.
function dowCounts() {
  const heading = [...host.querySelectorAll('div')].find(d => d.textContent.trim() === 'Day of week');
  if (!heading) return null;
  const rows = [...heading.parentElement.querySelectorAll('div')]
    .filter(d => /^n\d+$/.test((d.children[1] || {}).textContent || ''));
  return Object.fromEntries(rows.map(r => [r.children[0].textContent, +r.children[1].textContent.slice(1)]));
}

describe('Visit Patterns day-of-week is the calendar day, not a UTC-parse artifact', () => {
  it('reports the real weekday distribution under a negative-offset timezone', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/Chicago');
    renderPanel(realCfv);
    // Ground truth, computed from the ISO strings themselves rather than restated by hand.
    const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const truth = {};
    for (const v of realCfv) {
      const [Y, M, D] = v.dateISO.split('-').map(Number);
      const k = DOW[new Date(Date.UTC(Y, M - 1, D)).getUTCDay()];
      truth[k] = (truth[k] || 0) + 1;
    }
    expect(dowCounts()).toEqual(truth);
  });

  it('does not invent a Sunday bucket or drop Saturday (the exact shape of the old off-by-one)', () => {
    renderPanel(realCfv);
    const counts = dowCounts();
    // PACE shopped this estate on 13 Saturdays and zero Sundays. The UTC-midnight parse moved
    // every label back one day, which produced 42 phantom Sunday visits and erased Saturday.
    expect(counts.Sat).toBe(13);
    expect(counts.Sun).toBeUndefined();
    expect(counts.Tue).toBe(53);
    expect(counts.Mon).toBe(42);
  });

  it('files a Jan-1 visit under its own year, not the year before', () => {
    // No Jan-1 visit exists in the real data yet, so this is the latent half of the same bug:
    // dispatch #75's channel-by-year table would put the next one in the wrong row.
    const janVisits = [
      { store: '03708', channel: 'Drive Thru', reportType: 'CFV', dateISO: '2026-01-01', score: 91, pass: true },
      { store: '03708', channel: 'Drive Thru', reportType: 'CFV', dateISO: '2026-01-01', score: 88, pass: true },
    ];
    renderPanel(janVisits);
    const text = host.textContent;
    expect(text).toContain('2026');
    expect(text).not.toContain('2025');
  });
});
