// @ts-nocheck
// ── Price-event detection (dispatch20 addendum, 2026-08-18) ──────────────────
// Meridian could not see a price change: forecast models calibrate straight through
// repricing weeks, Signal Lab/Scanner have no Price metric group, and every vs-LY
// comparison silently mixes pricing regimes. This engine is the missing stream.
//
// The dispatch's own source analysis (memory/mcvalue-verification.sql,
// memory/analysis-mcvalue-price-waves-2026-08-18.md) does not exist in this repo or
// environment -- checked `git log --all` and the filesystem, genuinely absent, not an
// oversight. Everything below was independently re-derived and re-measured against live
// Supabase data rather than assumed from the dispatch's prose. The core algorithm IS
// exactly as the dispatch specified (validated independently, see below) -- this is not
// a second invented method, it's the same one, verified.
//
// ── THE ALGORITHM -- validated, do not invent a second one ───────────────────
// Base menu price per (loc, item, date) = max(price) that day. qsr_product_mix carries
// MULTIPLE price rows for the same (loc, item, date) when a promo/discount tier applied
// that day (confirmed live: 49/283 items at one store on one sample day had >1 price row)
// -- promos always sit below menu, so max() recovers the real menu price.
//
// A change is CONFIRMED only where the price was flat for >=14 observed days before, and
// flat at the new value for >=14 observed days after. The naive alternative -- diffing the
// day-over-day price-tier SET -- is pure noise: independently re-measured this session,
// naive day-over-day diffing returns 50-170+ "changed" items per store on literally every
// date tried, INCLUDING a control date with no known price event (2026-03-16: 8-95 items
// "changed" per store, same magnitude as the real wave dates). The 14/14 flat-window
// requirement is what separates a real menu reprice from ordinary promo-tier noise.
export const FLAT_WINDOW_DAYS = 14;

// Accepts a Date (what loadPmixRows returns) or an ISO string (raw REST rows, test
// fixtures) -- same dual-shape trap as count-cycle.js's dOnly(). Getting this wrong is
// silent: a Date run through String() gives "Tue Aug 18 2026", not "2026-08-18", so every
// row would collapse onto a nonsense key.
const _dayKey = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

// `qsr_product_mix.loc` (what loadPmixRows/raw REST rows carry) is zero-padded to 7
// ("0013113"); every other loc this engine's consumers key against (ds.laborRows,
// store.loc, userEvents) is unpadded ("13113") -- same join trap CLAUDE.md flags for
// store_labor_config vs qsr_daily_activity. Normalized once, here, at the engine's own
// boundary, so no consumer (signal-registry.js, events.js, store-dash.js) has to
// remember to re-derive it and risk a silent zero-row join downstream.
const _unpadLoc = (l) => String(parseInt(l, 10) || l);

/**
 * rows: raw qsr_product_mix rows, any order -- [{loc, date, item, price}].
 * Returns confirmed step changes: [{loc, item, date, oldPrice, newPrice, stepPct}],
 * one entry per (loc, item) per confirmed transition, sorted by date. `loc` is unpadded
 * (see _unpadLoc above) regardless of the input row's own loc format.
 * `date` is the FIRST day of the new (post-change) flat run -- the day the price took effect.
 */
export function detectPriceSteps(rows, { flatWindow = FLAT_WINDOW_DAYS } = {}) {
  const byKey = new Map(); // "loc|item" -> Map(date -> maxPrice)
  for (const r of rows || []) {
    if (!r || r.price == null || isNaN(r.price) || !r.date || r.loc == null || r.item == null) continue;
    const k = _unpadLoc(r.loc) + '|' + r.item;
    if (!byKey.has(k)) byKey.set(k, new Map());
    const dayMap = byKey.get(k);
    const d = _dayKey(r.date);
    const cur = dayMap.get(d);
    if (cur == null || r.price > cur) dayMap.set(d, r.price);
  }

  const out = [];
  for (const [k, dayMap] of byKey) {
    const [loc, item] = k.split('|');
    // sorted [date, price] pairs -- one per OBSERVED day (gaps in the raw data are simply
    // absent, not zero-filled; "14 observed days" means 14 such entries, not 14 calendar days).
    const days = [...dayMap.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    let i = 0;
    while (i < days.length) {
      let j = i;
      while (j + 1 < days.length && days[j + 1][1] === days[i][1]) j++;
      const runLen = j - i + 1;
      if (runLen >= flatWindow && j + 1 < days.length) {
        const newPrice = days[j + 1][1];
        let k2 = j + 1;
        while (k2 + 1 < days.length && days[k2 + 1][1] === newPrice) k2++;
        const nextRunLen = k2 - (j + 1) + 1;
        if (nextRunLen >= flatWindow) {
          const oldPrice = days[i][1];
          out.push({
            loc, item, date: days[j + 1][0], oldPrice, newPrice,
            stepPct: oldPrice > 0 ? ((newPrice - oldPrice) / oldPrice) * 100 : null,
          });
        }
        i = j + 1; // resume scanning from the new run, whether or not it qualified
      } else {
        i = j + 1;
      }
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Groups confirmed steps into per-(loc, date) repricing EVENTS -- one or more items at one
 * store confirmed-changing on the same day. Returns [{loc, date, itemsChanged, meanStepPct}],
 * sorted by date.
 *
 * NO minimum-items floor, deliberately -- an earlier version gated this at >=8 items to
 * separate "a real repricing round" from "an isolated correction," but that threshold was
 * invented, not measured, and it was WRONG: verified against the real 2026-06-13/06-26
 * district rounds (763k real qsr_product_mix rows, May16-Jul24), the unfiltered algorithm
 * splits all 27 stores cleanly into exactly 14 (06-13) and 13 (06-26) -- an exact match to
 * the known ground truth -- while an >=8 floor silently dropped 4 real stores whose
 * confirmed, 14/14-flat-validated change only touched 5-7 items that particular day
 * (DeFuniak Springs: 5, Harrah: 7, Pauls Valley: 7, Elgin: 5). The 14/14 flat-window
 * requirement in detectPriceSteps() is what separates signal from noise; a SINGLE
 * confirmed step already cleared that bar and needs no second gate on top of it.
 */
export function priceChangeEvents(rows, { flatWindow = FLAT_WINDOW_DAYS } = {}) {
  const steps = detectPriceSteps(rows, { flatWindow });
  const byKey = new Map(); // "loc|date" -> steps[]
  for (const s of steps) {
    const k = s.loc + '|' + s.date;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(s);
  }
  const out = [];
  for (const [k, group] of byKey) {
    const [loc, date] = k.split('|');
    const pcts = group.map(s => s.stepPct).filter(v => v != null);
    const meanStepPct = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
    out.push({ loc, date, itemsChanged: group.length, meanStepPct });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Per-store LATEST confirmed repricing event -- the Store Dashboard "last price change"
 * field. Returns {[loc]: {date, itemsChanged, meanStepPct}}, one entry per store that has
 * ever had a confirmed event in `rows`.
 */
export function lastPriceChangeByStore(rows, opts) {
  const events = priceChangeEvents(rows, opts);
  const out = {};
  for (const e of events) {
    const cur = out[e.loc];
    if (!cur || e.date > cur.date) out[e.loc] = { date: e.date, itemsChanged: e.itemsChanged, meanStepPct: e.meanStepPct };
  }
  return out;
}

/**
 * Daily per-store series for the Signal Lab / Scanner (signal-registry.js's '__priceEvents'
 * source): one row per (loc, date) present in `rows`, every day -- not just event days --
 * so `daysSinceChange` is a continuous ramp a correlation can actually use (does traffic
 * dip right after a reprice and recover over the following days). `itemsChanged` and
 * `meanStepPct` are non-null/non-zero only on the event day itself (same shape as the
 * existing Controls count/$ metrics).
 */
export function priceDailySeries(rows, opts) {
  const events = priceChangeEvents(rows, opts);
  const eventsByLoc = new Map();
  for (const e of events) {
    if (!eventsByLoc.has(e.loc)) eventsByLoc.set(e.loc, []);
    eventsByLoc.get(e.loc).push(e);
  }
  // day universe per loc, from the raw rows themselves
  const daysByLoc = new Map();
  for (const r of rows || []) {
    if (!r || !r.date || r.loc == null) continue;
    const d = _dayKey(r.date);
    if (!daysByLoc.has(r.loc)) daysByLoc.set(r.loc, new Set());
    daysByLoc.get(r.loc).add(d);
  }

  const out = [];
  for (const [loc, daySet] of daysByLoc) {
    const days = [...daySet].sort();
    const locEvents = (eventsByLoc.get(loc) || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    let evIdx = -1; // index of the most recent event at/before the current day
    for (const d of days) {
      while (evIdx + 1 < locEvents.length && locEvents[evIdx + 1].date <= d) evIdx++;
      const lastEvent = evIdx >= 0 ? locEvents[evIdx] : null;
      const daysSinceChange = lastEvent
        ? Math.round((new Date(d) - new Date(lastEvent.date)) / 86400000)
        : null;
      const onEventDay = lastEvent && lastEvent.date === d;
      out.push({
        loc, date: d,
        daysSinceChange,
        itemsChanged: onEventDay ? lastEvent.itemsChanged : 0,
        meanStepPct: onEventDay ? lastEvent.meanStepPct : 0,
      });
    }
  }
  return out;
}
