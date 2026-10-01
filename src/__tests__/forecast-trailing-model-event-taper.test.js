// @ts-nocheck
// ae/ewma/simple fit directly to recent actuals, so once a long-running tagged event's own
// elevated days roll into their trailing windows, those models start reflecting it on their
// own — applying the full _eventFactors value on top would double-count. dow/di forecast off
// an explicit LY+trend blend and never see the raw actuals directly, so they have no such
// risk and keep using the full (untapered) factor unchanged.
//
// forecastDay now hoists _evFactor above the ae/ewma/simple short-circuits and tapers it for
// those three models by event age (_trailingModelEvWeight: full weight through day 14, linear
// taper to zero by day 90, keyed off how many consecutive prior days carry the same tag type).
// A single-day event (holiday, sports, etc.) always has age 0, so this never changes behavior
// for the existing single-day Event Registry use case — only a long-running tag is affected.
import { describe, it, expect } from 'vitest';
import { forecastDay } from '../engine/forecast.js';

const LOC = '3708';

function makeDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(12, 0, 0, 0);
  return d;
}
function dKey(d) { return d.toISOString().slice(0, 10); }
function buildLaborIdx(rows) {
  const idx = {};
  for (const r of rows) {
    const k = r.loc + '_' + dKey(r.date);
    (idx[k] ??= []).push(r);
  }
  return idx;
}

// Two years of flat-ish history (no real event lift baked into the data itself — the whole
// point is to isolate the _evFactor/taper wiring, not re-derive a measured effect).
function buildDs(loc = LOC) {
  const laborRows = [];
  const DOW_MULT = [0.8, 1.0, 1.0, 1.05, 1.1, 1.3, 1.2];
  for (let i = 760; i >= 1; i--) {
    const d = makeDate(i);
    const sales = Math.round(10000 * DOW_MULT[d.getDay()]);
    laborRows.push({ loc, date: d, sales, gc: Math.round(sales / 7), laborPct: 0.28 });
  }
  return {
    laborRows, laborIdx: buildLaborIdx(laborRows), laborByLoc: { [loc]: laborRows },
    opsRows: [], ctrlRows: [], weatherRows: [], targets: {},
    lastActual: { [loc]: makeDate(1) }, loaded: true, storeIds: [loc],
  };
}

const FACTOR = 0.20; // a deliberately large, easy-to-eyeball learned comp_closure factor

// Tags every day from `startDaysAgo` down to `endDaysAgo` (inclusive) as a single contiguous
// comp_closure event, and sets the learned _eventFactors value forecastDay will read.
function buildEventSettings({ startDaysAgo, endDaysAgo = 0 }) {
  const userEvents = { [LOC]: {} };
  for (let i = startDaysAgo; i >= endDaysAgo; i--) {
    userEvents[LOC][dKey(makeDate(i))] = { tags: [{ type: 'comp_closure' }] };
  }
  return {
    mode: 'Forecast', dialedInEnabled: false, dialedIn: {}, dialedInSkipped: [],
    useEventRegistry: true,
    _userEvents: userEvents,
    _eventFactors: { [LOC]: { comp_closure: FACTOR } },
  };
}

describe('forecastDay — trailing-model (ae/ewma/simple) event-factor taper', () => {
  it('dow keeps the FULL factor regardless of event age (unchanged behavior)', () => {
    const ds = buildDs();
    // Fresh event (age 0)
    const fresh = forecastDay(LOC, makeDate(5), ds, buildEventSettings({ startDaysAgo: 5, endDaysAgo: 5 }), null, null, 'monthly', 'dow');
    expect(fresh._evFactor).toBeCloseTo(FACTOR, 5);
    // Old event (age 150 — well past the 90-day taper-to-zero point)
    const old = forecastDay(LOC, makeDate(5), ds, buildEventSettings({ startDaysAgo: 155, endDaysAgo: 5 }), null, null, 'monthly', 'dow');
    expect(old._evFactor).toBeCloseTo(FACTOR, 5);
  });

  for (const model of ['ae', 'ewma', 'simple']) {
    it(`${model}: a just-started event (age 0) gets the FULL factor`, () => {
      const ds = buildDs();
      const date = makeDate(5);
      const settings = buildEventSettings({ startDaysAgo: 5, endDaysAgo: 5 }); // only today is tagged — age 0
      const r = forecastDay(LOC, date, ds, settings, null, null, 'monthly', model);
      expect(r.modelUsed).toBe(model);
      expect(r._evFactor).toBeCloseTo(FACTOR, 5);
    });

    it(`${model}: an old, long-running event (age >= 90) is fully tapered to zero`, () => {
      const ds = buildDs();
      const date = makeDate(5);
      // Event has been running since 200 days ago through 5 days ago — age at `date` is 195.
      const settings = buildEventSettings({ startDaysAgo: 200, endDaysAgo: 5 });
      const r = forecastDay(LOC, date, ds, settings, null, null, 'monthly', model);
      expect(r.modelUsed).toBe(model);
      expect(r._evFactor).toBeCloseTo(0, 5);
    });

    it(`${model}: mid-taper (age 50) lands strictly between full and zero, matching the linear formula`, () => {
      const ds = buildDs();
      const date = makeDate(5);
      // Event started 55 days before `date` (55 days ago) and is still active at `date` (5 days
      // ago) — age = 50 consecutive prior days tagged the same way.
      const settings = buildEventSettings({ startDaysAgo: 55, endDaysAgo: 5 });
      const r = forecastDay(LOC, date, ds, settings, null, null, 'monthly', model);
      const expectedWeight = 1 - (50 - 14) / (90 - 14); // _trailingModelEvWeight(50)
      expect(r._evFactor).toBeCloseTo(FACTOR * expectedWeight, 5);
      expect(r._evFactor).toBeGreaterThan(0);
      expect(r._evFactor).toBeLessThan(FACTOR);
    });

    it(`${model}: the taper actually changes the forecast dollar value, not just metadata`, () => {
      const ds = buildDs();
      const date = makeDate(5);
      const freshSettings = buildEventSettings({ startDaysAgo: 5, endDaysAgo: 5 });
      const oldSettings = buildEventSettings({ startDaysAgo: 200, endDaysAgo: 5 });
      const fresh = forecastDay(LOC, date, ds, freshSettings, null, null, 'monthly', model);
      const old = forecastDay(LOC, date, ds, oldSettings, null, null, 'monthly', model);
      expect(fresh.forecast).not.toBe(old.forecast);
      // Fresh (full +20% factor) should forecast noticeably higher than the fully-tapered one.
      expect(fresh.forecast).toBeGreaterThan(old.forecast);
    });
  }

  it('a single-day event (holiday-style) is never tapered on ae — age is always 0', () => {
    const ds = buildDs();
    const date = makeDate(5);
    const settings = buildEventSettings({ startDaysAgo: 5, endDaysAgo: 5 }); // exactly one tagged day
    const r = forecastDay(LOC, date, ds, settings, null, null, 'monthly', 'ae');
    expect(r._evFactor).toBeCloseTo(FACTOR, 5);
  });

  it('no tagged event at all → _evFactor is 0 on every model, no regression', () => {
    const ds = buildDs();
    const date = makeDate(5);
    const settings = { mode: 'Forecast', dialedInEnabled: false, dialedIn: {}, dialedInSkipped: [], useEventRegistry: true, _userEvents: {}, _eventFactors: {} };
    for (const model of ['ae', 'ewma', 'simple', 'dow']) {
      const r = forecastDay(LOC, date, ds, settings, null, null, 'monthly', model);
      expect(r._evFactor ?? 0).toBe(0);
    }
  });
});
