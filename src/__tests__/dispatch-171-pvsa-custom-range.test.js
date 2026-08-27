// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #171 — Projections vs Actuals custom date-range picker (live Feature Request read
// from Supabase `feature_requests`: "Add date range picker... Ex: I would like to be able to
// select an entire month.").
//
// Renders the REAL exported ProjectionVsActualsReport (src/views/analytics.js) — not a
// reimplementation of the week-resolution math — per this repo's "verification must touch the
// call site" standing rule (a test that only called resolvePvsaCustomWeeks() directly could
// pass unchanged with the panel's own wiring to it deleted). `ds.laborRows` is deliberately
// EMPTY: report.weeks (and therefore the rendered week count/dates) is built from date
// arithmetic alone, before any per-store data lookup, so an empty fixture is enough to prove
// which weeks a range resolves to without mocking forecastDay or fabricating sales history —
// forecastDay is never even called when there is no matching laborRows day to forecast.
//
// The custom-range case picks July 2026 — the FR's own named example ("select an entire
// month") — and July 1 2026 IS a Wednesday, so it's a clean, independently-verifiable case:
// the picked month resolves to exactly 5 Wed-Tue business weeks (Jul 1, 8, 15, 22, 29), the
// last of which runs into August — proof the report uses Option A (weeks that OVERLAP the
// picked range), the choice documented in the PR body and in resolvePvsaCustomWeeks()'s own
// header comment.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { ProjectionVsActualsReport } from '../views/analytics.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LOC = '3708';
const settings = { weekStartDay: 3 }; // 0=Sun 1=Mon 3=Wed -- DEF_SETTINGS' own value
const NOOP = () => {};
const wkLabel = (y, m, d) =>
  'Wk ' + new Date(y, m, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function buildDs() {
  return { loaded: true, laborRows: [], targets: {} };
}

function setInputValue(el, v) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
async function flush(container, maxTicks = 20) {
  let last;
  for (let i = 0; i < maxTicks; i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 15)); });
    if (container.textContent === last) return;
    last = container.textContent;
  }
}
async function clickByText(container, tag, text, exact = false) {
  const el = [...container.querySelectorAll(tag)].find((b) =>
    exact ? b.textContent.trim() === text : b.textContent.includes(text));
  expect(el, `no <${tag}> found containing "${text}"`).toBeTruthy();
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  return el;
}

describe('dispatch #171 — ProjectionVsActualsReport custom date range', () => {
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

  it('the existing [2,4,6]-week presets still resolve to exactly that many evaluated weeks (regression)', async () => {
    await act(async () => {
      root.render(React.createElement(ProjectionVsActualsReport, {
        stores: [{ loc: LOC }], ds: buildDs(), settings, userEvents: [], onClose: NOOP,
      }));
    });
    await flush(container);

    // Deliberately out of declared [2,4,6] order -- proves each click re-resolves the report,
    // not just that the initial default (4) happens to work.
    for (const n of [2, 6, 4]) {
      await clickByText(container, 'button', n + 'W', true);
      await clickByText(container, 'button', '▶ Run', false);
      await flush(container);
      expect(container.textContent).toContain(
        'Evaluated ' + n + ' business week' + (n === 1 ? '' : 's') + ' (Wed–Tue)');
      expect(container.textContent).toContain('preset: last ' + n + ' weeks');
      expect(container.textContent).not.toContain('custom range picked');
    }
  });

  it('a custom range (the FR\'s own "select an entire month" example) resolves to a DIFFERENT, correctly-computed set of weeks than any preset', async () => {
    await act(async () => {
      root.render(React.createElement(ProjectionVsActualsReport, {
        stores: [{ loc: LOC }], ds: buildDs(), settings, userEvents: [], onClose: NOOP,
      }));
    });
    await flush(container);

    // Baseline: run the default 4-week preset first, so the next block proves picking a
    // custom range actually CHANGES which weeks get backtested, not just that new UI exists.
    await clickByText(container, 'button', '▶ Run Report', true);
    await flush(container);
    expect(container.textContent).toContain('Evaluated 4 business weeks');

    await clickByText(container, 'button', 'Custom…', true);
    const dateInputs = [...container.querySelectorAll('input[type="date"]')];
    expect(dateInputs.length).toBe(2);
    await act(async () => {
      setInputValue(dateInputs[0], '2026-07-01');
      setInputValue(dateInputs[1], '2026-07-31');
    });
    await flush(container);
    // Live preview (before clicking Run) already names the resolved week count.
    expect(container.textContent).toContain('→ 5 business weeks');

    await clickByText(container, 'button', '▶ Run Custom Range Backtest', true);
    await flush(container);

    // Exactly 5 weeks: July 2026 never divides evenly into Wed-Tue business weeks. The picked
    // month resolves to the week starting Jul 1 (a real Wednesday) through the week starting
    // Jul 29 -- which runs to Aug 4, past the picked end date (Option A: weeks that OVERLAP
    // the range, not just weeks fully contained in it).
    expect(container.textContent).toContain('Evaluated 5 business weeks (Wed–Tue): ' +
      wkLabel(2026, 6, 1) + ' – ' + wkLabel(2026, 7, 4));
    expect(container.textContent).toContain('custom range picked: 2026-07-01 to 2026-07-31');
    expect(container.textContent).not.toContain('Evaluated 4 business weeks');
    expect(container.textContent).not.toContain('preset: last');

    // The "Weeks Analyzed" KPI tile also reflects the real evaluated count (5), not a stale
    // weeksBack preset value -- this was a real bug fixed alongside the custom-range feature
    // (the tile used to read String(weeksBack) unconditionally).
    const kpiCard = [...container.querySelectorAll('div')]
      .find(d => d.children.length === 3 && d.children[0].textContent === 'Weeks Analyzed');
    expect(kpiCard, 'Weeks Analyzed KPI card not found').toBeTruthy();
    expect(kpiCard.children[1].textContent).toBe('5');
  });

  it('switching back to a preset after a custom run restores preset behavior (no stuck custom state)', async () => {
    await act(async () => {
      root.render(React.createElement(ProjectionVsActualsReport, {
        stores: [{ loc: LOC }], ds: buildDs(), settings, userEvents: [], onClose: NOOP,
      }));
    });
    await flush(container);

    await clickByText(container, 'button', 'Custom…', true);
    const dateInputs = [...container.querySelectorAll('input[type="date"]')];
    await act(async () => {
      setInputValue(dateInputs[0], '2026-07-01');
      setInputValue(dateInputs[1], '2026-07-31');
    });
    await clickByText(container, 'button', '▶ Run Custom Range Backtest', true);
    await flush(container);
    expect(container.textContent).toContain('Evaluated 5 business weeks');

    await clickByText(container, 'button', '2W', true);
    expect(container.querySelectorAll('input[type="date"]').length).toBe(0); // custom picker collapses
    await clickByText(container, 'button', '▶ Run Report', true);
    await flush(container);
    expect(container.textContent).toContain('Evaluated 2 business weeks (Wed–Tue)');
    expect(container.textContent).toContain('preset: last 2 weeks');
  });

  it('the Run button is disabled in custom mode until both dates are picked', async () => {
    await act(async () => {
      root.render(React.createElement(ProjectionVsActualsReport, {
        stores: [{ loc: LOC }], ds: buildDs(), settings, userEvents: [], onClose: NOOP,
      }));
    });
    await flush(container);
    await clickByText(container, 'button', 'Custom…', true);

    const runBtn = [...container.querySelectorAll('button')]
      .find(b => b.textContent.includes('▶ Run'));
    expect(runBtn.disabled).toBe(true);

    const dateInputs = [...container.querySelectorAll('input[type="date"]')];
    await act(async () => { setInputValue(dateInputs[0], '2026-07-01'); });
    expect(runBtn.disabled).toBe(true); // end date still missing

    await act(async () => { setInputValue(dateInputs[1], '2026-07-31'); });
    expect(runBtn.disabled).toBe(false);
  });
});
