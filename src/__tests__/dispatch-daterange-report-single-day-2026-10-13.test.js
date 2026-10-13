// @vitest-environment happy-dom
// @ts-nocheck
// Mass-review notes 70 (2026-10-13) — owner-reported live, with a screenshot: picking the SAME
// date for both START and END on the Date-Range Comprehensive Report (src/views/analytics.js's
// DateRangeReport) showed "DAYS: 2" for every store, not 1.
//
// Root cause: buildReport() built `range.s`/`range.e` as `new Date(startDate+'T00:00:00')` /
// `new Date(endDate+'T23:59:59')` — parsed in the browser's LOCAL time (no 'Z' suffix). But
// metric-source.js's `_dk()` re-derives each boundary's date KEY via `.toISOString()`, which is
// always UTC. In any negative-UTC-offset zone (every US timezone — this whole app's audience),
// local 23:59:59 on day D is UTC early-morning on day D+1, so the end boundary's date-key came
// out one day later than intended, widening a single-day pick into a 2-day range for
// metricSeries's rs<=dk<=re comparison. Fixed by passing the plain date-only strings straight
// through (no Date-object construction at all) — `new Date('YYYY-MM-DD')` parses as UTC
// midnight per spec, which is exactly what `_dk()` derives on the other side too.
//
// Renders the REAL DateRangeReport component end-to-end (date inputs -> Generate Report ->
// read the DAYS cell), per this repo's "would this verification still pass if reverted?"
// standing rule — not a standalone date-math unit test of some extracted range-builder (there
// isn't one; the bug lived inline in the component closure, same shape as dispatch #72 A4).
import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { DateRangeReport } from '../views/analytics.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// The bug is TIMEZONE-DEPENDENT (local-time Date construction vs UTC-keyed _dk()) and this
// sandbox's own CI runner is UTC, where local time === UTC time and the bug can't reproduce at
// all. Force a real negative-UTC-offset zone (Central, matching this app's own OK/FL audience)
// for this file only, so the test actually exercises the failure mode instead of silently
// passing in an environment that happens not to trigger it — the exact trap this repo's own
// "would this verification still pass if reverted?" rule warns about.
let _origTZ;
beforeAll(() => { _origTZ = process.env.TZ; process.env.TZ = 'America/Chicago'; });
afterAll(() => { process.env.TZ = _origTZ; });

describe('DateRangeReport — single picked date reads Days:1, not 2 (mass-review notes 70)', () => {
  let container, root;
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('a single calendar day of real sales data reports exactly 1 day, regardless of local timezone', async () => {
    const STORE = { loc: '3708', name: 'Ardmore-Broadway', opsScore: 80, ctrlScore: 80, p: {}, t: {} };
    // Two CONSECUTIVE real sales days, 10/9 days back so they're unambiguously closed, settled
    // business days no matter the runner's local clock. Picking day D as both start AND end
    // must report Days:1 using ONLY day D's sales -- day D+1's data sitting right next to it in
    // the dataset is the only thing that can distinguish "range correctly narrowed to one day"
    // from "range silently widened to two" (a single-row dataset can't tell the two apart, since
    // dateKeys.length would read 1 either way with nothing else in range to leak in).
    const dPrior = new Date(); dPrior.setDate(dPrior.getDate() - 10); dPrior.setHours(12, 0, 0, 0);
    const dNext = new Date(dPrior); dNext.setDate(dNext.getDate() + 1);
    const dk = dPrior.toISOString().slice(0, 10);
    const laborRows = [
      { loc: '3708', date: dPrior, sales: 12000, gc: 900 },
      { loc: '3708', date: dNext, sales: 99999, gc: 9000 }, // must NOT leak into a single-day pick
    ];
    const ds = { loaded: true, storeIds: ['3708'], laborRows, laborByLoc: {}, targets: {} };

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(DateRangeReport, {
        stores: [STORE], ds, settings: {}, userEvents: {}, onClose: () => {},
      }));
    });

    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    const dateInputs = [...container.querySelectorAll('input[type="date"]')];
    await act(async () => {
      setter.call(dateInputs[0], dk); dateInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      setter.call(dateInputs[1], dk); dateInputs[1].dispatchEvent(new Event('input', { bubbles: true }));
    });

    const genBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Generate Report'));
    await act(async () => { genBtn.click(); await Promise.resolve(); await Promise.resolve(); });

    // Store, Days, Sales, ... -- Days must read 1, and Sales must be ONLY the picked day's
    // $12,000, never the following day's $99,999 leaking in.
    const row = container.querySelector('tbody tr');
    expect(row).toBeTruthy();
    const cells = row.querySelectorAll('td');
    expect(cells[1].textContent.trim()).toBe('1');
    expect(cells[2].textContent.trim()).toBe('$12,000');
  });
});
