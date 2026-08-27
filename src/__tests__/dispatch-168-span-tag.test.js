// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #168 — extends at-a-glance.js's per-tile "As of" freshness label (_spanTag, v4.837)
// to Store Dashboard, via a shared pure helper (spanTagInfo, src/utils/date.js) extracted out
// of at-a-glance.js's closure-bound version so the two panels share one implementation instead
// of two independently-drifting copies.
//
// Per this repo's "would this verification still pass if reverted" rule (dispatch16, #366):
// both cases below render the REAL panel component (AtAGlance / StoreDash), not spanTagInfo in
// isolation — a revert of either panel's wiring to the shared helper would leave these red, not
// just a revert of spanTagInfo itself.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

vi.mock('../engine/forecast.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    // StoreDash's own weekly-forecast effect is irrelevant to the KPI span tags under test
    // (Period Sales is deliberately left untagged — see store-analytics.js's comment) — settle
    // it synchronously with an empty range so no real forecast machinery has to run.
    forecastRangeAsync: (loc, s, e, ds, settings, onPartial, onFinal) => { onFinal([]); },
  };
});

import { AtAGlance } from '../views/at-a-glance.js';
import { StoreDash } from '../views/store-analytics.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const day = n => new Date(2026, 7, n, 12); // Aug n 2026, noon local — see at-a-glance-checklist-freshness.test.js
const NOOP = () => {};

function render(el) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  return { container, root };
}

describe('dispatch #168 — shared per-tile span-tag helper', () => {
  let container, root;
  afterEach(() => {
    if (root) act(() => { root.unmount(); });
    container?.remove();
    container = null; root = null;
  });

  it('AtAGlance: Controls tile span tag shows the real row span and the ⚠ fallback note when the toolbar period has no data for it (extracted helper, byte-identical output)', async () => {
    ({ container, root } = render());
    const dateRange = { s: day(1), e: day(5), label: 'Test Period' };
    const ds = {
      loaded: true,
      // laborRows anchors effectiveDateRange's fallback: nothing in the selected period
      // (day 1-5) but real data at day 20 -> effectiveDateRange falls back to the most
      // recent 30 days ending day 20, flagged isFallback:true.
      laborRows: [{ loc: '10422', date: day(20), sales: 12000 }],
      // ctrlEffective's own rows (Controls tile) — inside the FALLBACK window (day 20-29..20),
      // so it shows up via _recentWeek once effectiveDateRange widens to include it.
      ctrlRows: [{ loc: '10422', date: day(18), cashOSPct: 0.0005 }],
    };
    const baseProps = {
      stores: [{ loc: '10422' }],
      settings: { weekStartDay: 3 },
      userEvents: [], lockedProjections: {}, dateRange,
      onOpenStore: NOOP, onCoachingSaved: NOOP, onOpenProjections: NOOP,
      onOpenPVSA: NOOP, onOpenBrief: NOOP, onNav: NOOP, onOpenModal: NOOP,
    };

    await act(async () => {
      root.render(React.createElement(AtAGlance, { ...baseProps, ds }));
    });

    // Several sections' span tags read ds.laborRows too (day 20), so pick the one whose text
    // is specifically the Controls tile's own row (ctrlRows, day 18) — the whole point being
    // verified is that this tile's tag reflects ITS OWN rows, not a shared district-wide date.
    const tagged = [...container.querySelectorAll('span[title]')]
      .find(el => el.getAttribute('title')?.startsWith('Data shown spans') && el.textContent === '8/18 ⚠');
    expect(tagged).toBeTruthy();
    expect(tagged.getAttribute('title')).toBe(
      'Data shown spans 8/18 · 1 day present  ⚠ No data in the selected period (Test Period)'
      + ' — showing the most recent 30 days of available data instead.'
    );
    expect(tagged.style.color).toBe('#f59e0b');
  });

  it('StoreDash: OEPE KPI tile shows a real per-metric span tag with the ⚠ fallback note, sourced from its OWN rows via metric-source.js (not the toolbar range)', async () => {
    ({ container, root } = render());
    // dateRange is entirely in the future -- so every metric's real (past) rows fall OUTSIDE
    // it, exercising the fallback branch for every tagged KPI in one fixture.
    const dateRange = { s: new Date(Date.now() + 7 * 864e5), e: new Date(Date.now() + 14 * 864e5), label: 'Next Week' };
    const store = {
      loc: '99999', // not in STORE_COORDS -- fetchForecastWeather no-ops, no network hit
      name: 'Test Store',
      p: { laborPct: 0.28, oepe: 175, tpph: 5, cashOSPct: 0.0005, _cov: {} },
      t: { tOepe: 180, tTpph: 90, tCrewLabor: 0.30 },
      opsScore: 78, ctrlScore: 82, findings: [],
      pSales: 50000, pLY: 48000,
    };
    const ds = {
      loaded: true,
      opsRows:   [{ loc: '99999', date: day(10), oepe: 150 }],
      ctrlRows:  [{ loc: '99999', date: day(10), tpph: 5, cashOSPct: 0.0005 }],
      laborRows: [{ loc: '99999', date: day(10), laborPct: 0.28 }],
    };
    const settings = {};

    await act(async () => {
      root.render(React.createElement(StoreDash, {
        store, ds, settings, allStores: [store], onBack: NOOP, onNav: NOOP,
        dateRange, userEvents: {}, onUpdateSettings: NOOP,
      }));
    });

    const tagged = [...container.querySelectorAll('span[title]')]
      .filter(el => el.getAttribute('title')?.startsWith('Data shown spans'));
    // OEPE, TPPH, Labor %, Cash O/S each get their own tag (Period Sales/Ops Score/Controls/
    // T2W Trend are deliberately left untagged per store-analytics.js's comment).
    expect(tagged.length).toBe(4);
    for (const el of tagged) {
      expect(el.textContent).toBe('8/10 ⚠');
      expect(el.getAttribute('title')).toBe(
        'Data shown spans 8/10 · 1 day present  ⚠ No data in the selected period (Next Week)'
        + ' — showing the most recent 30 days of available data instead.'
      );
      expect(el.style.color).toBe('#f59e0b');
    }
  });

  it('StoreDash: a KPI span tag with data actually inside the selected period renders WITHOUT the ⚠ note', async () => {
    ({ container, root } = render());
    const dateRange = { s: day(1), e: day(15), label: 'MTD' };
    const store = {
      loc: '99999', name: 'Test Store',
      p: { laborPct: 0.28, oepe: 175, tpph: 5, cashOSPct: 0.0005, _cov: {} },
      t: { tOepe: 180, tTpph: 90, tCrewLabor: 0.30 },
      opsScore: 78, ctrlScore: 82, findings: [],
      pSales: 50000, pLY: 48000,
    };
    const ds = {
      loaded: true,
      opsRows: [{ loc: '99999', date: day(10), oepe: 150 }],
    };
    await act(async () => {
      root.render(React.createElement(StoreDash, {
        store, ds, settings: {}, allStores: [store], onBack: NOOP, onNav: NOOP,
        dateRange, userEvents: {}, onUpdateSettings: NOOP,
      }));
    });

    const tagged = [...container.querySelectorAll('span[title]')]
      .find(el => el.getAttribute('title')?.startsWith('Data shown spans'));
    expect(tagged).toBeTruthy();
    expect(tagged.textContent).toBe('8/10'); // no ⚠ — day(10) is inside dateRange (day 1-15)
    expect(tagged.getAttribute('title')).toBe('Data shown spans 8/10 · 1 day present');
    expect(tagged.style.color).not.toBe('#f59e0b');
  });
});
