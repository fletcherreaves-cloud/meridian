// @ts-nocheck
// Dispatch23 §1 — scripts/forecast-week-precompute.mjs originally called forecastDay(loc, d,
// ds, {}, null, t): an empty settings object. forecastDay's event-adjustment block
// (src/engine/forecast.js's _evFactor) reads settings._userEvents/settings._eventFactors and
// silently returns 0 lift/dip whenever either is absent -- so every cache-hit forecast during
// a real tagged event (a football game, a district holiday, a price change) was silently the
// UN-adjusted number, diverging from what the live browser path (at-a-glance.js:1542,
// settings.useEventRegistry!==false?computeEventFactors(ds,userEvents||{}):{}) computes.
//
// The precompute script now builds userEvents via orgEventsToDayMap() (the SAME function
// App.js's own org_events hydration uses) and passes {useEventRegistry:true, _userEvents,
// _eventFactors} to forecastDay -- this test proves that construction actually changes
// forecastDay's output, using the exact real-world shape verified live during development
// (a "High" impact HS football home game, dinner daypart) rather than a synthetic one.
//
// Note: 'ae'/'ewma'/'simple' -- the models most real stores are actually assigned -- early-
// return inside forecastDay BEFORE reaching the event-adjustment tail at all (a structural,
// pre-existing forecastDay property, unrelated to this fix). forceModel:'dow' below exercises
// the code path that actually consumes _userEvents/_eventFactors, matching how this was
// verified against real Supabase data (see memory/dispatch23-precompute-event-factors.md).
import { describe, it, expect } from 'vitest';
import { forecastDay, setEventImpact } from '../engine/forecast.js';
import { orgEventsToDayMap } from '../engine/events-import.js';
import { computeEventFactors } from '../utils/events.js';

function buildLaborRows(loc, n, salesFn) {
  const out = [];
  const d0 = new Date('2026-01-01T12:00:00Z');
  for (let i = 0; i < n; i++) {
    const d = new Date(d0.getTime() + i * 86400000);
    out.push({ loc, date: d, sales: salesFn(i, d) });
  }
  return out;
}

describe('forecast-week-precompute event-factor wiring', () => {
  it('a real-shaped tagged event (org_events -> userEvents -> eventFactors) changes forecastDay output vs an empty cfg', () => {
    const loc = '35242';
    // A year of trailing daily sales so fetchLY/DOW baselines have real history to compare
    // the tagged event date against -- flat $9,000/day except a genuine home-game bump every
    // 4th Friday, mirroring how a real football schedule would show up in past sales.
    const laborRows = buildLaborRows(loc, 380, (i, d) => {
      const isFriday = d.getUTCDay() === 5;
      return isFriday && i % 28 === 21 ? 10500 : 9000;
    });
    const ds = { loaded: true, laborRows, laborByLoc: {}, qsrActSummaryRows: [], targets: {} };

    const orgEvents = [{
      id: 1, loc, dateStart: '2026-08-21', dateEnd: '2026-08-21', span: false,
      type: 'sports', label: 'Cottondale High School Football (Home)',
      impact: { magnitude: 'High', daypart: 'dinner', gameDay: false, raw: 'High - Dinner / Late Night' },
      opponent: 'North Bay Haven', kickoff: null, status: null,
      expectedSalesDelta: null, expectedGcDelta: null,
    }];
    const userEvents = orgEventsToDayMap(orgEvents, () => '');
    expect(userEvents[loc]['2026-08-21'].label).toBe('Cottondale High School Football (Home)');

    setEventImpact({}); // no curated registry entry for this store -- falls through to the magnitude x daypart estimate
    const eventFactors = computeEventFactors(ds, userEvents);

    const date = new Date('2026-08-21T12:00:00');
    const t = {};
    const withoutEventCfg = forecastDay(loc, date, ds, {}, null, t, 'weekly', 'dow');
    const withEventCfg = forecastDay(loc, date, ds,
      { useEventRegistry: true, _userEvents: userEvents, _eventFactors: eventFactors }, null, t, 'weekly', 'dow');

    expect(withEventCfg.forecast).not.toBe(withoutEventCfg.forecast);
    expect(withEventCfg.forecast).toBeGreaterThan(withoutEventCfg.forecast); // a "High" impact event should lift, not dip
  });

  it('useEventRegistry:true is required even with real _userEvents/_eventFactors -- omitting it silently reintroduces the bug', () => {
    // Guards the specific mistake that would un-fix this: forecastDay's _evFactor checks
    // `!settings.useEventRegistry` and short-circuits to 0 regardless of what _userEvents/
    // _eventFactors contain if this flag itself is missing from cfg.
    const loc = '35242';
    const laborRows = buildLaborRows(loc, 380, (i, d) => (d.getUTCDay() === 5 && i % 28 === 21 ? 10500 : 9000));
    const ds = { loaded: true, laborRows, laborByLoc: {}, qsrActSummaryRows: [], targets: {} };
    const userEvents = orgEventsToDayMap([{
      id: 1, loc, dateStart: '2026-08-21', dateEnd: '2026-08-21', span: false,
      type: 'sports', label: 'Cottondale High School Football (Home)',
      impact: { magnitude: 'High', daypart: 'dinner', gameDay: false, raw: 'High - Dinner / Late Night' },
    }], () => '');
    setEventImpact({});
    const eventFactors = computeEventFactors(ds, userEvents);
    const date = new Date('2026-08-21T12:00:00');

    const missingFlag = forecastDay(loc, date, ds, { _userEvents: userEvents, _eventFactors: eventFactors }, null, {}, 'weekly', 'dow');
    const withFlag = forecastDay(loc, date, ds, { useEventRegistry: true, _userEvents: userEvents, _eventFactors: eventFactors }, null, {}, 'weekly', 'dow');

    expect(missingFlag.forecast).not.toBe(withFlag.forecast);
  });
});
