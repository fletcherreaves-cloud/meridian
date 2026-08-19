// @ts-nocheck
// Dispatch24 Workstream B (#388) — event scope + recurrence. org_events' PK (unique(loc,
// date_start, label), loc not null) forced a district-wide event to be N per-store rows —
// "27 copies of Thanksgiving." collapseScopedEvents() (write side) groups a flat per-store event
// array into ONE scoped row; orgEventsToDayMap()'s scope expansion (read side) turns that one row
// back into the SAME per-store day-map entries every existing consumer (forecastDay,
// computeEventFactors) already reads — those two are explicitly UNCHANGED by this dispatch, so
// the proof that matters here is the round trip: collapse -> expand must reproduce exactly what
// the old flat-array -> orgEventsToDayMap path produced, for every consumer that never sees scope.
import { describe, it, expect } from 'vitest';
import { orgEventsToDayMap, collapseScopedEvents } from '../engine/events-import.js';

const ALL_LOCS = ['3708', '3709', '3710', '10422']; // 3 "OK" + 1 "FL", mirrors a tiny real roster
const stateOfLoc = l => (l === '10422' ? 'FL' : 'OK');

function flatEventFor(locs, overrides = {}) {
  return locs.map(loc => ({
    loc, dateStart: '2026-11-26', dateEnd: '2026-11-26', span: false,
    category: 'Holiday', type: 'holiday', label: 'Thanksgiving',
    impact: { magnitude: 'High', daypart: 'all', gameDay: false, raw: 'High' },
    note: 'Thanksgiving', ...overrides,
  }));
}

describe('collapseScopedEvents', () => {
  it('leaves a single-store event completely unchanged (scope stays "store")', () => {
    const [out] = collapseScopedEvents(flatEventFor(['3708']), { allLocs: ALL_LOCS, stateOfLoc });
    expect(out.scope).toBe('store');
    expect(out.loc).toBe('3708'); // real store loc, not a sentinel
    expect(out.scopeLocs).toBeNull();
  });

  it('collapses a full-roster group into one scope:"all" row with a non-store-colliding sentinel loc', () => {
    const out = collapseScopedEvents(flatEventFor(ALL_LOCS), { allLocs: ALL_LOCS, stateOfLoc });
    expect(out).toHaveLength(1);
    expect(out[0].scope).toBe('all');
    expect(out[0].loc).toBe('*ALL*');
    expect(out[0].scopeLocs.slice().sort()).toEqual(ALL_LOCS.slice().sort());
    expect(ALL_LOCS).not.toContain(out[0].loc); // sentinel can never collide with a real numeric loc
  });

  it('collapses a full-state group into one scope:"state" row', () => {
    const okStores = ALL_LOCS.filter(l => stateOfLoc(l) === 'OK');
    const out = collapseScopedEvents(flatEventFor(okStores), { allLocs: ALL_LOCS, stateOfLoc });
    expect(out).toHaveLength(1);
    expect(out[0].scope).toBe('state');
    expect(out[0].scopeState).toBe('OK');
    expect(out[0].loc).toBe('*STATE:OK*');
    expect(out[0].scopeLocs.slice().sort()).toEqual(okStores.slice().sort());
  });

  it('falls back to scope:"list" for a partial, non-state-aligned group', () => {
    const out = collapseScopedEvents(flatEventFor(['3708', '10422']), { allLocs: ALL_LOCS, stateOfLoc });
    expect(out).toHaveLength(1);
    expect(out[0].scope).toBe('list');
    expect(out[0].scopeState).toBeNull();
    expect(out[0].loc).toBe('*LIST:10422,3708*');
  });

  it('groups independently by (dateStart,dateEnd,label,type,category) -- two different events on the same day both collapse, separately', () => {
    const thanksgiving = flatEventFor(ALL_LOCS);
    const blackFriday = flatEventFor(ALL_LOCS, { dateStart: '2026-11-27', dateEnd: '2026-11-27', label: 'Black Friday', type: 'retail' });
    const out = collapseScopedEvents([...thanksgiving, ...blackFriday], { allLocs: ALL_LOCS, stateOfLoc });
    expect(out).toHaveLength(2);
    expect(out.map(e => e.label).sort()).toEqual(['Black Friday', 'Thanksgiving']);
    expect(out.every(e => e.scope === 'all')).toBe(true);
  });
});

describe('orgEventsToDayMap scope expansion', () => {
  it('expands a scope:"all" row into a day-map entry for every store in scopeLocs', () => {
    const [scoped] = collapseScopedEvents(flatEventFor(ALL_LOCS), { allLocs: ALL_LOCS, stateOfLoc });
    scoped.id = 501;
    const map = orgEventsToDayMap([scoped], () => '📌');
    for (const loc of ALL_LOCS) {
      expect(map[loc]).toBeDefined();
      expect(map[loc]['2026-11-26'].label).toBe('Thanksgiving');
      expect(map[loc]['2026-11-26'].orgEventId).toBe(501);
    }
  });

  it('round-trips to the old flat per-store array for every field an existing consumer (forecastDay/computeEventFactors) reads', () => {
    const flat = flatEventFor(ALL_LOCS).map((e, i) => ({ ...e, id: 100 + i }));
    // Old behavior: orgEventsToDayMap on N per-store rows (each carrying its OWN id, since that's
    // what N materialized rows would each have). New behavior: collapse first, so all N stores
    // share ONE id -- the field that's allowed to differ, along with the new scope/scopeState
    // fields orgEventsToDayMap now deliberately stamps onto a scope<>'store' entry (harmless
    // additive metadata -- no existing reader looks for them, matching the dispatch's "zero
    // forecasting-logic change" constraint). Every field forecastDay/computeEventFactors actually
    // reads (type, label, impact, expectedSalesDelta/GcDelta, etc) must match exactly.
    const oldWay = orgEventsToDayMap(flat, () => '📌');
    const [scoped] = collapseScopedEvents(flatEventFor(ALL_LOCS), { allLocs: ALL_LOCS, stateOfLoc });
    scoped.id = 999;
    const newWay = orgEventsToDayMap([scoped], () => '📌');
    for (const loc of ALL_LOCS) {
      const { orgEventId: _o1, ...oldEntry } = oldWay[loc]['2026-11-26'];
      const { orgEventId: _o2, scope: _s2, scopeState: _ss2, ...newEntry } = newWay[loc]['2026-11-26'];
      expect(newEntry).toEqual(oldEntry);
    }
  });

  it('scope:"store" rows (every pre-existing row, and every row that predates this migration) expand exactly as before -- e.scope undefined behaves identically to e.scope==="store"', () => {
    const legacyRow = { id: 1, loc: '3708', dateStart: '2026-08-21', dateEnd: '2026-08-21', span: false, type: 'sports', label: 'Home Game', note: 'Home Game' };
    const map = orgEventsToDayMap([legacyRow], () => '');
    expect(Object.keys(map)).toEqual(['3708']);
    expect(map['3708']['2026-08-21'].label).toBe('Home Game');
  });
});

describe('orgEventsToDayMap exceptions (open design question #1 -- per-store overrides on a scoped event)', () => {
  it('a "canceled" exception drops just that one store, leaving the rest of the scoped event expanded normally', () => {
    const [scoped] = collapseScopedEvents(flatEventFor(ALL_LOCS), { allLocs: ALL_LOCS, stateOfLoc });
    scoped.id = 42;
    const exceptions = { 42: { '3709': { status: 'canceled' } } };
    const map = orgEventsToDayMap([scoped], () => '', exceptions);
    expect(map['3709']).toBeUndefined();
    for (const loc of ALL_LOCS.filter(l => l !== '3709')) {
      expect(map[loc]['2026-11-26'].label).toBe('Thanksgiving');
    }
  });

  it('a "modified" exception overrides fields for just that store, leaving siblings untouched', () => {
    const [scoped] = collapseScopedEvents(flatEventFor(ALL_LOCS), { allLocs: ALL_LOCS, stateOfLoc });
    scoped.id = 43;
    const exceptions = { 43: { '3710': { status: 'modified', overrides: { expectedSalesDelta: 250 } } } };
    const map = orgEventsToDayMap([scoped], () => '', exceptions);
    expect(map['3710']['2026-11-26'].expectedSalesDelta).toBe(250);
    expect(map['3708']['2026-11-26'].expectedSalesDelta).toBeNull();
  });

  it('omitting exceptions entirely (every pre-existing call site) is a no-op -- full expansion, no skips', () => {
    const [scoped] = collapseScopedEvents(flatEventFor(ALL_LOCS), { allLocs: ALL_LOCS, stateOfLoc });
    scoped.id = 44;
    const map = orgEventsToDayMap([scoped], () => '');
    expect(Object.keys(map).sort()).toEqual(ALL_LOCS.slice().sort());
  });
});
