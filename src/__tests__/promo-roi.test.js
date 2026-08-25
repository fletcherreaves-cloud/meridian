// @vitest-environment happy-dom
// happy-dom is needed for the "renders the actual panel" describe block below (dispatch-111.md's
// verification bar: exercise src/views/promo-roi.js, not just the engine in isolation). Safe for
// every other test in this file -- they're plain data/logic assertions with no DOM dependency.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { buildDailyRecords, matchedLift, promoTagCoverage, computePromoDiscountRoi } from '../engine/promo-roi.js';
import { PromoRoiPanel } from '../views/promo-roi.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ISO 'YYYY-MM-DD' key matching org_events' date_start/date_end format and promoTagCoverage's
// expectations -- distinct from buildDailyRecords' internal (non-zero-padded) merge key.
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

// A minimal org-sourced userEvents day-map: tags every day in [startIdx, endIdx] (inclusive,
// 0-based from Apr 1 2026) as a real exogenous promo-calendar entry, for one loc. Useful when the
// WHOLE window should be treated as tagged (e.g. confirming coverage extraction itself).
function tagWindow(loc, startIdx, endIdx) {
  const days = {};
  for (let i = startIdx; i <= endIdx; i++) {
    const d = new Date(2026, 3, 1 + i);
    days[iso(d)] = { type: 'promo', orgSourced: true, label: 'sim national promo' };
  }
  return days;
}

// Tags only the "tagged" weeks (Math.floor(i/7)%2===0), leaving the alternate weeks untagged but
// STILL inside the known calendar window (a later week is tagged too, so covEnd extends past the
// last untagged week) -- this is the shape a matched-day comparison actually needs: real tagged
// AND real untagged days for every day-of-week, not a window that's either all-tagged or entirely
// unknown. `nDays` MUST be a multiple of 14 with an even trailing week also tagged, so the FINAL
// week is tagged (keeps covEnd past every interior untagged week -- see the coverage-window test
// below for what happens when it isn't).
function alternatingWeekTags(loc, nDays) {
  const days = {};
  for (let i = 0; i < nDays; i++) {
    if (Math.floor(i / 7) % 2 !== 0) continue; // untagged week -- no entry, but still inside [covStart,covEnd]
    const d = new Date(2026, 3, 1 + i);
    days[iso(d)] = { type: 'promo', orgSourced: true, label: 'sim national promo' };
  }
  return days;
}

describe('promo-roi — buildDailyRecords', () => {
  it('merges glimpse sales/promo and ctrl discount by loc+date', () => {
    const date = new Date(2026, 3, 1);
    const ds = {
      glimpseRows: [{ loc: '3708', date, allNetSales: 12000, gc: 1100, promoAmt: 400, promoPct: 0.03 }],
      ctrlRows: [{ loc: '0003708', date, discAmt: 150, discPct: 0.012 }],
    };
    const recs = buildDailyRecords(ds);
    expect(recs.length).toBe(1);
    expect(recs[0].sales).toBe(12000);
    expect(recs[0].promoAmt).toBe(400);
    expect(recs[0].discAmt).toBe(150); // joined despite zero-padded loc
  });
});

// dispatch-111.md — discAmt/discPct used to be sourced ONLY from ds.ctrlRows (manual upload),
// with no auto-pulled fallback (unlike the promo leg, which already tries ds.glimpseRows first).
// A store/date with no manual Controls upload -- the expected steady state per CLAUDE.md's
// auto-first rule -- scored an empty discount lever even with real ds.opsCashRows data. These
// fixtures exercise the opsCashRows path specifically, which the suite above never did (every
// existing discAmt/discPct case only ever populated ctrlRows -- invisible to this exact bug).
// dispatch-113.md does NOT touch buildDailyRecords or this sourcing fix -- unaffected, unchanged.
describe('promo-roi — buildDailyRecords sources discount auto-first (opsCashRows -> ctrlRows)', () => {
  it('populates discAmt/discPct from ds.opsCashRows when there is NO ctrlRows upload at all', () => {
    const date = new Date(2026, 3, 1);
    const ds = {
      glimpseRows: [{ loc: '3708', date, allNetSales: 12000, gc: 1100, promoAmt: 400, promoPct: 0.03 }],
      opsCashRows: [{ loc: '3708', date, discAmt: 150, discPct: 0.012 }],
      // ctrlRows intentionally absent -- reproduces the steady-state gap from dispatch-111.md.
    };
    const recs = buildDailyRecords(ds);
    expect(recs.length).toBe(1);
    expect(recs[0].discAmt).toBe(150);
    expect(recs[0].discPct).toBe(0.012);
  });

  it('opsCashRows wins over ctrlRows when both cover the same loc/date (auto-first, first-writer-wins)', () => {
    const date = new Date(2026, 3, 1);
    const ds = {
      opsCashRows: [{ loc: '3708', date, discAmt: 150, discPct: 0.012 }],
      ctrlRows: [{ loc: '0003708', date, discAmt: 999, discPct: 0.5 }], // manual, should lose
    };
    const recs = buildDailyRecords(ds);
    expect(recs[0].discAmt).toBe(150);
    expect(recs[0].discPct).toBe(0.012);
  });

  it('still falls back to ctrlRows on a loc/date opsCashRows does not cover (additive, not a replacement)', () => {
    const dateA = new Date(2026, 3, 1), dateB = new Date(2026, 3, 2);
    const ds = {
      opsCashRows: [{ loc: '3708', date: dateA, discAmt: 150, discPct: 0.012 }],
      ctrlRows: [{ loc: '0003708', date: dateB, discAmt: 80, discPct: 0.007 }],
    };
    const recs = buildDailyRecords(ds).sort((a, b) => a.date - b.date);
    expect(recs.length).toBe(2);
    expect(recs[0].discAmt).toBe(150); // opsCashRows day
    expect(recs[1].discAmt).toBe(80);  // ctrlRows fallback day, untouched by the fix
  });

  it('a pre-existing ctrlRows-only fixture (no opsCashRows at all) still resolves exactly as before', () => {
    const date = new Date(2026, 3, 1);
    const ds = { ctrlRows: [{ loc: '0003708', date, discAmt: 150, discPct: 0.012 }] };
    const recs = buildDailyRecords(ds);
    expect(recs[0].discAmt).toBe(150);
    expect(recs[0].discPct).toBe(0.012);
  });
});

// dispatch-113.md — the discount lever no longer produces a numeric verdict at all (no exogenous
// discount-timing signal exists to split on -- see NO_DATA_COPY in views/promo-roi.js). This
// replaces the old "scores a store from opsCashRows alone" assertion (which checked a matchedLift
// verdict that the new, honest methodology can no longer support) with a check that the
// SOURCING half of dispatch-111's fix -- discAmt flowing in from opsCashRows -- is still intact:
// buildDailyRecords still carries the record (proven above), and computePromoDiscountRoi's
// discount lever reports the correct, honest "no signal exists" reason rather than silently
// erroring or reverting to an endogenous split.
describe('promo-roi — computePromoDiscountRoi discount leg (dispatch-111 sourcing intact, dispatch-113 methodology honest)', () => {
  it('discAmt from opsCashRows still reaches nRecords, but the discount lever reports "no exogenous signal" rather than a verdict', () => {
    const glimpseRows = [];
    const opsCashRows = [];
    for (let i = 0; i < 84; i++) {
      const date = new Date(2026, 3, 1 + i);
      const heavy = Math.floor(i / 7) % 2 === 0;
      const dowBase = 10000 + date.getDay() * 300;
      const sales = dowBase + (heavy ? 500 : 0);
      glimpseRows.push({ loc: '100', date, allNetSales: sales, gc: Math.round(sales / 10) });
      opsCashRows.push({ loc: '100', date, discAmt: heavy ? 300 : 50, discPct: heavy ? 0.03 : 0.005 });
    }
    const out = computePromoDiscountRoi({ glimpseRows, opsCashRows }, null, { marginRate: 0.35 });
    expect(out.nRecords).toBe(84); // the sourcing fix still merges discAmt in
    expect(out.discount.byStore).toEqual([]);
    expect(out.discount.reason).toBe('no_signal_exists');
  });
});

describe('promo-roi — promoTagCoverage', () => {
  it('collects only org-sourced promo-typed days, ignoring hand-typed and non-promo entries', () => {
    const userEvents = {
      '100': {
        '2026-04-05': { type: 'promo', orgSourced: true },
        '2026-04-06': { type: 'promo', orgSourced: false }, // hand-typed, not exogenous -- excluded
        '2026-04-07': { type: 'sports', orgSourced: true }, // wrong type -- excluded
        '2026-04-08': { type: 'sports', orgSourced: true, tags: [{ type: 'sports' }, { type: 'promo' }] }, // combined day -- included via tags
      },
    };
    const cov = promoTagCoverage(userEvents);
    expect([...cov.tagged['100']].sort()).toEqual(['2026-04-05', '2026-04-08']);
    expect(cov.covStart['100']).toBe('2026-04-05');
    expect(cov.covEnd['100']).toBe('2026-04-08');
  });

  it('returns empty coverage for a loc with no org-sourced promo entries at all', () => {
    const cov = promoTagCoverage({ '100': { '2026-04-05': { type: 'sports', orgSourced: true } } });
    expect(cov.tagged['100']).toBeUndefined();
    expect(cov.covStart['100']).toBeUndefined();
  });

  it('handles a missing/null userEvents without throwing', () => {
    expect(promoTagCoverage(null)).toEqual({ tagged: {}, covStart: {}, covEnd: {} });
    expect(promoTagCoverage(undefined)).toEqual({ tagged: {}, covStart: {}, covEnd: {} });
  });
});

describe('promo-roi — matchedLift (exogenous-tag split, dispatch-113.md)', () => {
  // 91 days (13 weeks), alternating 1-week tagged / 1-week untagged, so every DOW has both
  // tagged and untagged observations -- same day-of-week-balance idea the old fixture used for
  // heavy/light weeks, adapted to a real calendar tag instead of an intensity threshold. 91 (not
  // 84) so the FINAL week is also tagged (week 12, even), keeping the known calendar window
  // (covStart..covEnd) spanning the whole range -- see alternatingWeekTags' own doc comment.
  const N = 91;
  function makeStore(loc, { liftPerTaggedDay, promoSpendTagged, base = 10000 }) {
    const rows = [];
    for (let i = 0; i < N; i++) {
      const date = new Date(2026, 3, 1 + i);
      const tagged = Math.floor(i / 7) % 2 === 0;
      const dowBase = base + date.getDay() * 300;
      const sales = dowBase + (tagged ? liftPerTaggedDay : 0);
      rows.push({ loc, date, allNetSales: sales, gc: Math.round(sales / 10), promoAmt: tagged ? promoSpendTagged : 200 });
    }
    return rows;
  }
  const covN = loc => promoTagCoverage({ [loc]: alternatingWeekTags(loc, N) });

  it('flags a promo that PAYS (big lift, small give-away)', () => {
    const rows = makeStore('100', { liftPerTaggedDay: 3000, promoSpendTagged: 300 });
    const res = matchedLift(buildDailyRecords({ glimpseRows: rows }), covN('100'), { spendField: 'promoAmt', marginRate: 0.35 });
    const s = res.byStore.find(x => x.loc === '100');
    expect(s).toBeTruthy();
    expect(s.extraSalesPerDay).toBeGreaterThan(2500);      // recovers the injected lift
    expect(s.liftSalesPct).toBeGreaterThan(0);
    expect(s.verdict).toBe('pays');
  });

  it('flags a promo that COSTS (tiny lift, big give-away)', () => {
    const rows = makeStore('200', { liftPerTaggedDay: 100, promoSpendTagged: 2000 });
    const res = matchedLift(buildDailyRecords({ glimpseRows: rows }), covN('200'), { spendField: 'promoAmt', marginRate: 0.35 });
    const s = res.byStore.find(x => x.loc === '200');
    expect(s).toBeTruthy();
    expect(s.verdict).toBe('costs');
    expect(s.grossProfitDelta).toBeLessThan(0);
  });

  it('skips stores with too few days', () => {
    const few = makeStore('300', { liftPerTaggedDay: 1000, promoSpendTagged: 100 }).slice(0, 10);
    const res = matchedLift(buildDailyRecords({ glimpseRows: few }), promoTagCoverage({ '300': alternatingWeekTags('300', 10) }), { minDays: 24 });
    expect(res.byStore.find(x => x.loc === '300')).toBeUndefined();
  });

  it('produces a district rollup weighted across stores', () => {
    const rows = [
      ...makeStore('100', { liftPerTaggedDay: 3000, promoSpendTagged: 300 }),
      ...makeStore('200', { liftPerTaggedDay: 100, promoSpendTagged: 2000 }),
    ];
    const cov = promoTagCoverage({ '100': alternatingWeekTags('100', N), '200': alternatingWeekTags('200', N) });
    const res = matchedLift(buildDailyRecords({ glimpseRows: rows }), cov, { marginRate: 0.35 });
    expect(res.district).toBeTruthy();
    expect(res.district.nStores).toBe(2);
    expect(['pays', 'costs', 'neutral', 'n/a']).toContain(res.district.verdict);
  });

  it('excludes records outside a store\'s known calendar window rather than treating them as untagged', () => {
    // The store has 91 days of SALES, but the calendar is only known for the first 35 (5 weeks,
    // tagged/untagged alternating as usual, last of those 5 weeks tagged so covEnd sits at day 34
    // -- see alternatingWeekTags). Days 35-90 are UNKNOWN, not "confirmed no promo".
    const rows = makeStore('400', { liftPerTaggedDay: 3000, promoSpendTagged: 300 });
    const cov = promoTagCoverage({ '400': alternatingWeekTags('400', 35) });
    const res = matchedLift(buildDailyRecords({ glimpseRows: rows }), cov, { minDays: 5, marginRate: 0.35 });
    const s = res.byStore.find(x => x.loc === '400');
    expect(s).toBeTruthy();
    // Only days 0-34 are inside the known window (35 days), well under the 91 the store has sales
    // for -- confirms the 56 out-of-window days were dropped, not folded into the "untagged" side.
    expect(s.nDays).toBeLessThanOrEqual(35);
  });

  it('reports "no_exogenous_tag_data" and zero candidates when no calendar coverage exists at all', () => {
    const rows = makeStore('500', { liftPerTaggedDay: 1000, promoSpendTagged: 100 });
    const res = matchedLift(buildDailyRecords({ glimpseRows: rows }), promoTagCoverage(null), { marginRate: 0.35 });
    expect(res.byStore).toEqual([]);
    expect(res.nCandidates).toBe(0);
    expect(res.reason).toBe('no_exogenous_tag_data');
  });
});

// dispatch-113.md's own regression bar, ported into the suite so a revert is caught by CI rather
// than requiring someone to remember to re-run a standalone script under memory/data/. Mirrors
// memory/data/promo-roi-bias-sim-exogenous-tag-zero-effect.mjs and
// -known-effect.mjs — the SAME "spend scales with traffic" construction
// memory/finding-promo-roi-denominator-bias-2026-08-23.md used to catch the PRIOR (also wrong)
// fix, now run against the exogenous-tag split instead of any same-day intensity field.
describe('promo-roi — dispatch-113 exogenous-tag fix (finding-promo-roi-denominator-bias-2026-08-23.md, further correction)', () => {
  const DOW = [4000, 5200, 5000, 5100, 5600, 7000, 6500];
  const WINDOWS = [[0, 27], [35, 62], [70, 97]]; // realistic: real gaps between national windows
  const isTaggedDay = i => WINDOWS.some(([a, b]) => i >= a && i <= b);

  function buildDistrict({ seed, trueLift, nDays = 110 }) {
    let s = seed;
    const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
    const rows = []; const userEvents = {};
    for (let store = 0; store < 27; store++) {
      const loc = String(3000 + store); // matches buildDailyRecords' normalized loc, no padding needed
      const events = {};
      for (let i = 0; i < nDays; i++) {
        const d = new Date(2026, 3, 1 + i);
        const dow = d.getDay();
        const tagged = isTaggedDay(i);
        const sales = DOW[dow] * (0.75 + 0.5 * rnd()) * (tagged ? 1 + trueLift : 1);
        const spend = sales * 0.03 * (0.7 + 0.6 * rnd()); // give-away $ scales with traffic -- the real trap
        rows.push({ loc, date: d, allNetSales: sales, gc: Math.round(sales / 9), promoAmt: spend, promoPct: (spend / sales) * 100 });
        if (tagged) events[iso(d)] = { type: 'promo', orgSourced: true, label: 'sim national promo' };
      }
      userEvents[loc] = events;
    }
    return { records: buildDailyRecords({ glimpseRows: rows }), tagCoverage: promoTagCoverage(userEvents) };
  }

  it('at a TRUE effect of 0%, the exogenous split reports a mean lift near zero -- not the +16.5% the retired dollar split measured on the same generator', () => {
    const { records, tagCoverage } = buildDistrict({ seed: 3, trueLift: 0 });
    const out = matchedLift(records, tagCoverage, { marginRate: 0.35 });
    const lifts = out.byStore.map(s => s.liftSalesPct).filter(x => x != null);
    const meanLift = lifts.reduce((a, b) => a + b, 0) / lifts.length;
    expect(out.byStore.length).toBeGreaterThan(20);
    // Measured -0.51% in memory/data/promo-roi-bias-sim-exogenous-tag-zero-effect.mjs -- bound set
    // well clear of the retired dollar split's +16.5%.
    expect(Math.abs(meanLift)).toBeLessThan(3);
  });

  it('at a KNOWN +8% effect, the exogenous split recovers close to the true value -- not just ~0% regardless of input', () => {
    const { records, tagCoverage } = buildDistrict({ seed: 5, trueLift: 0.08 });
    const out = matchedLift(records, tagCoverage, { marginRate: 0.35 });
    const lifts = out.byStore.map(s => s.liftSalesPct).filter(x => x != null);
    const meanLift = lifts.reduce((a, b) => a + b, 0) / lifts.length;
    expect(out.byStore.length).toBeGreaterThan(20);
    // Measured 8.38% in memory/data/promo-roi-bias-sim-exogenous-tag-known-effect.mjs.
    expect(meanLift).toBeGreaterThan(5);
    expect(meanLift).toBeLessThan(11);
    expect(lifts.filter(x => x < 0).length).toBe(0);
  });

  it('computePromoDiscountRoi wires userEvents through to the same exogenous split (would this pass if the wiring were reverted?)', () => {
    const { records: _unused, tagCoverage } = buildDistrict({ seed: 5, trueLift: 0.08 }); // build userEvents alongside
    // Rebuild via the full ds + userEvents call path (not a direct matchedLift override) so a
    // revert of App.js's userEvents wiring, or of computePromoDiscountRoi's own plumbing, would
    // make this fail -- CLAUDE.md's "would this verification still pass if the change were
    // reverted" standard.
    let s = 5; const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
    const rows = []; const userEvents = {};
    for (let store = 0; store < 27; store++) {
      const loc = String(3000 + store);
      const events = {};
      for (let i = 0; i < 110; i++) {
        const d = new Date(2026, 3, 1 + i);
        const dow = d.getDay();
        const tagged = isTaggedDay(i);
        const sales = DOW[dow] * (0.75 + 0.5 * rnd()) * (tagged ? 1.08 : 1);
        const spend = sales * 0.03 * (0.7 + 0.6 * rnd());
        rows.push({ loc, date: d, allNetSales: sales, gc: Math.round(sales / 9), promoAmt: spend, promoPct: (spend / sales) * 100 });
        if (tagged) events[iso(d)] = { type: 'promo', orgSourced: true };
      }
      userEvents[loc] = events;
    }
    const out = computePromoDiscountRoi({ glimpseRows: rows }, userEvents, { marginRate: 0.35 });
    expect(out.promo.byStore.length).toBeGreaterThan(20);
    const withoutEvents = computePromoDiscountRoi({ glimpseRows: rows }, null, { marginRate: 0.35 });
    expect(withoutEvents.promo.byStore).toEqual([]); // no userEvents -> no exogenous signal -> honest empty
    expect(withoutEvents.promo.reason).toBe('no_exogenous_tag_data');
  });
});

describe('promo-roi — computePromoDiscountRoi', () => {
  it('returns both promo and discount analyses, with the discount lever always structurally unscored', () => {
    const rows = [];
    for (let i = 0; i < 40; i++) rows.push({ loc: '100', date: new Date(2026, 3, 1 + i), allNetSales: 10000, gc: 900, promoAmt: 200 });
    const out = computePromoDiscountRoi({ glimpseRows: rows }, null);
    expect(out.promo).toBeTruthy();
    expect(out.discount).toBeTruthy();
    expect(out.discount.reason).toBe('no_signal_exists');
    expect(out.nRecords).toBe(40);
    expect(out.marginRate).toBe(0.35);
  });
});

// dispatch-111.md verification bar, extended by dispatch-113.md: render the ACTUAL panel
// (src/views/promo-roi.js), not just the engine function in isolation -- catches the class of bug
// where the engine is fixed but the consumer's wiring to it is broken/reverted (CLAUDE.md's
// "would this verification still pass if the change were reverted" rule).
describe('promo-roi — PromoRoiPanel (dispatch-113: exogenous-tag promo scoring + honest discount state)', () => {
  let container, root;
  afterEach(() => {
    if (root) act(() => root.unmount());
    if (container) container.remove();
    container = null; root = null;
  });

  function render(props) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root.render(React.createElement(PromoRoiPanel, { onClose: () => {}, ...props })); });
    return container;
  }

  it('scores a real Promotions row when userEvents carries a genuine org-sourced promo tag', () => {
    const glimpseRows = [];
    const N = 91; // 13 weeks -- final week tagged too, see alternatingWeekTags' doc comment
    for (let i = 0; i < N; i++) {
      const date = new Date(2026, 3, 1 + i);
      const tagged = Math.floor(i / 7) % 2 === 0;
      const dowBase = 10000 + date.getDay() * 300;
      glimpseRows.push({ loc: '3708', date, allNetSales: dowBase + (tagged ? 3000 : 0), gc: 900, promoAmt: tagged ? 300 : 100 });
    }
    const userEvents = { '3708': alternatingWeekTags('3708', N) };
    const el = render({ ds: { glimpseRows }, userEvents });
    expect(el.textContent).toMatch(/Promotions/i);
    expect(el.textContent).toMatch(/Ardmore-Broadway/); // loc 3708 resolves -- a real per-store row rendered
    expect(el.textContent).not.toMatch(/known-unreliable/i); // old banner is gone
  });

  it('shows the honest "cannot determine" state for Discounts even with plenty of sales/discount data', () => {
    const glimpseRows = [];
    const opsCashRows = [];
    for (let i = 0; i < 84; i++) {
      const date = new Date(2026, 3, 1 + i);
      const heavy = Math.floor(i / 7) % 2 === 0;
      const dowBase = 10000 + date.getDay() * 300;
      glimpseRows.push({ loc: '3708', date, allNetSales: dowBase + (heavy ? 500 : 0), gc: 900 });
      opsCashRows.push({ loc: '3708', date, discAmt: heavy ? 300 : 50, discPct: heavy ? 0.03 : 0.005 });
    }
    const el = render({ ds: { glimpseRows, opsCashRows } });
    expect(el.textContent).toMatch(/Discounts/i);
    expect(el.textContent).toMatch(/Cannot determine/i);
    expect(el.textContent).toMatch(/no exogenous signal/i);
  });

  it('shows the honest "cannot determine" state for Promotions when no calendar tags are loaded at all', () => {
    const glimpseRows = [];
    for (let i = 0; i < 40; i++) glimpseRows.push({ loc: '3708', date: new Date(2026, 3, 1 + i), allNetSales: 10000, gc: 900, promoAmt: 200 });
    const el = render({ ds: { glimpseRows } }); // no userEvents prop at all
    expect(el.textContent).toMatch(/Promotions/i);
    expect(el.textContent).toMatch(/Cannot determine/i);
    expect(el.textContent).toMatch(/Calendar Manager/i);
  });
});
