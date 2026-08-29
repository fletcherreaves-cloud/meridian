// @ts-nocheck
// ── Pricing Engine, first slice: per-item margin (dispatch #212, 2026-08-29) ─────
// `qsr_product_mix` already carries real per-item selling price AND
// unit_food_cost/unit_paper_cost for the full catalog, all 27 stores, since 2026-01-01 —
// a genuine, non-placeholder margin view, buildable from data already flowing, zero new
// pulls. Full scoping + live-confirmed numbers: memory/dispatch-212.md.
//
// ── THE RULE (reused, not re-derived) ─────────────────────────────────────────
// Real menu price per (loc, item, date) = MAX(price) that day, NEVER AVG. This is
// src/engine/price-events.js's own proven, load-bearing rule (its file header has the
// full derivation + live measurement: 49/283 items at one store on one sample day had
// >1 price row the same day, from a promo/discount tier — promos always sit below menu
// price, so max() recovers the real menu price). No function in price-events.js exports
// this exact "resolve real price per item per day" step standalone (the MAX-per-day
// grouping lives inside detectPriceSteps()'s internals, built for step-change detection,
// not margin math) — this file re-implements the grouping, not the rule.
//
// ── Aggregating price/cost across a multi-day WINDOW ──────────────────────────
// Within one day, MAX(price) is exact. Across a window (7D/30D/90D/...), this engine
// uses the MOST RECENT day's MAX(price)/unit_food_cost/unit_paper_cost as the item's
// "current" menu price/cost, not an average across days — an average would blend
// pre-/post-reprice prices into a number nobody actually charges, and this dispatch is
// an explicit CURRENT-snapshot ranking (multi-month margin TREND charting is out of
// scope — see dispatch-212.md's "Out of scope" section; a trend view needs its own
// item_number-stability check first, which the scoping pass explicitly left undone).
//
// ── VOLUME is summed across the whole window, across ALL price tiers ──────────
// A promo-tier sale is still a real unit sold — only the PRICE used for margin math
// excludes non-max (promo) rows that day, never the volume.
import { normLoc } from './insights.js';

// price-events.js's own _dayKey comment: rows can carry a Date (loadPmixRows' output,
// what the real panel passes) or an ISO string (raw REST rows, test fixtures) — same
// dual-shape trap. Getting this wrong is silent: a Date run through String() gives
// "Tue Aug 18 2026", not "2026-08-18", collapsing every row onto a nonsense key.
const _dayKey = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

// ── Trap 2: wrap-combo unit halving ────────────────────────────────────────────
// supabase/schema-product-mix.sql's own documented gotcha (a dismissible vendor
// banner, not discoverable from the data itself): "Wrap Combo Units Sold are based
// off the menu item, therefore the 2 wrap menu items will need to be multiplied by 2
// to get total single units sold." Live-confirmed against the real catalog (2026-08-29,
// service-role read of qsr_product_mix, desc_ ilike '%wrap%' across the full 2.5M-row
// table — 7 distinct items, exhaustive): the AFFECTED items are ONLY the "N <words>
// wrap..." bundle-meal SKUs — item 25269 "2 Ranch Snk Wrap Ml", 25270 "2 Ranch Snk Wrap
// Lrg", 25271 "2 Spicy Snack Wrap M", 25272 "2 Spicy Snack Wrap L" — never the plain
// single wraps (25254 "Ranch Snack Wrap", 25261 "Spicy Snack Wrap", 25729 "Caesar Snack
// Wrap?", no leading count, no correction).
//
// Deliberately scoped to WRAP items only, not "any item whose description starts with a
// number" — that broader pattern is a live-confirmed FALSE-POSITIVE trap of its own:
// the same live pull turned up 30+ unrelated items following an entirely different
// naming convention (piece/pack counts, not the wrap-bundle halving bug) that must NOT
// be corrected — "6 McNuggets", "20 McNuggets", "2 Biscuits & Gravy", "2 Chsburger
// Meal", "2 Burrito Ml-Hb", "4 McCrispy Strips", "3 Pack of Cookies", etc. Matches
// schema-product-mix.sql's own caveat: "the banner names only wraps; whether the same
// halving applies to the others is untested" — so this engine does not extrapolate.
const WRAP_HALVING_RE = /^(\d+)\s.*wrap/i;
function wrapVolumeMultiplier(descr) {
  const m = WRAP_HALVING_RE.exec(String(descr || '').trim());
  return m ? (parseInt(m[1], 10) || 1) : 1;
}

/**
 * computeItemMargins(pmixRows, opts) -- pure function.
 *
 * pmixRows: qsr_product_mix rows, any order. Accepts BOTH the raw REST/DB shape
 * ({loc, date, item, price, desc_, sold_qty, unit_food_cost, unit_paper_cost}) and
 * loadPmixRows()'s camelCase mapped shape ({loc, date, item, price, desc, soldQty,
 * unitFoodCost, unitPaperCost}) -- the real call site (PricingEnginePanel) reads
 * ds.pmixRows, which is ALWAYS the mapped shape; dual-shape tolerance keeps synthetic
 * qsr_product_mix-shaped test fixtures (raw column names, per the dispatch) working too,
 * the same dual-shape convention price-events.js's _dayKey already established for date.
 *
 * opts.locFilter: a single loc, or an array of locs (any padding). Omit for no filter.
 * opts.dateRange: {start, end} (or {s, e}) -- Date or ISO string, inclusive. Omit for
 * the full range of rows passed in.
 *
 * Returns one row per (loc, item_number) -- see the wrap-halving/combo-vs-component
 * comments above and below for why item_number, never description, is the grouping key.
 * {loc, itemNumber, descr, menuPrice, foodCost, paperCost, marginDollars, marginPct,
 *  volume, totalContrib}
 */
export function computeItemMargins(pmixRows, { locFilter, dateRange } = {}) {
  const wantLocs = locFilter == null ? null
    : new Set((Array.isArray(locFilter) ? locFilter : [locFilter]).map(normLoc));

  const start = dateRange && (dateRange.start ?? dateRange.s) != null ? _dayKey(dateRange.start ?? dateRange.s) : null;
  const end   = dateRange && (dateRange.end   ?? dateRange.e) != null ? _dayKey(dateRange.end   ?? dateRange.e) : null;

  // Step 1 — per (loc, item, date): MAX(price) that day (never AVG — trap 1/promo
  // contamination), sum sold_qty across ALL price tiers that day, and carry the day's
  // food/paper cost (constant per item/day across price tiers — dispatch live-confirmed:
  // one item's cost was identical at both its $2.79 and $3.59 price rows the same day).
  const byDay = new Map(); // "loc|item|date" -> {loc, item, day, maxPrice, volDay, foodCost, paperCost, descr}
  for (const r of pmixRows || []) {
    if (!r || r.item == null || r.loc == null || r.date == null) continue;
    const price = Number(r.price);
    if (!isFinite(price)) continue;
    const loc = normLoc(r.loc);
    if (wantLocs && !wantLocs.has(loc)) continue;
    const day = _dayKey(r.date);
    if (start && day < start) continue;
    if (end && day > end) continue;

    const k = loc + '|' + r.item + '|' + day;
    let e = byDay.get(k);
    if (!e) {
      e = { loc, item: r.item, day, maxPrice: -Infinity, volDay: 0, foodCost: null, paperCost: null, descr: '' };
      byDay.set(k, e);
    }
    const soldQty = Number(r.soldQty ?? r.sold_qty) || 0;
    e.volDay += soldQty;
    if (price > e.maxPrice) e.maxPrice = price; // <- trap 1: MAX, never AVG
    const fc = r.unitFoodCost ?? r.unit_food_cost;
    const pc = r.unitPaperCost ?? r.unit_paper_cost;
    if (fc != null && isFinite(Number(fc))) e.foodCost = Number(fc);
    if (pc != null && isFinite(Number(pc))) e.paperCost = Number(pc);
    const descr = r.desc ?? r.desc_;
    if (descr) e.descr = descr;
  }

  // Step 2 — aggregate per (loc, item) across the window. Trap 3 (combo vs. component
  // double-counting) is structural here, not a filter: the grouping key is loc+item ONLY
  // (never description — "Big Mac" item 5 and "Big Mac Meal" item 8936 are, and stay,
  // two completely separate rows/output entries; nothing in this function ever sums
  // across item_numbers).
  const byItem = new Map(); // "loc|item" -> accumulator
  for (const e of byDay.values()) {
    const k2 = e.loc + '|' + e.item;
    let a = byItem.get(k2);
    if (!a) { a = { loc: e.loc, itemNumber: e.item, descr: '', volume: 0, _latestDay: null }; byItem.set(k2, a); }
    if (!a.descr && e.descr) a.descr = e.descr;

    // Trap 2 — wrap-combo halving: applied to VOLUME (and therefore totalContrib) only,
    // per item/day, using that day's own description (a menu relaunch could in theory
    // change an item_number's description; this stays correct either way).
    const mult = wrapVolumeMultiplier(e.descr || a.descr);
    a.volume += e.volDay * mult;

    // "Current" menuPrice/cost = the most recent day observed in the window (see file
    // header) -- not an average across days.
    if (a._latestDay == null || e.day > a._latestDay) {
      a._latestDay = e.day;
      a.menuPrice = e.maxPrice > -Infinity ? e.maxPrice : 0;
      a.foodCost = e.foodCost;
      a.paperCost = e.paperCost;
    }
  }

  const out = [];
  for (const a of byItem.values()) {
    const menuPrice  = a.menuPrice || 0;
    const foodCost   = a.foodCost  || 0;
    const paperCost  = a.paperCost || 0;
    const marginDollars = menuPrice - foodCost - paperCost;
    // marginPct is a recipe/menu attribute (price/cost), not derived from that window's
    // mix -- correct even at volume:1, deliberately independent of the volume/totalContrib
    // ranking below (trap 4 — see PricingEnginePanel's two SEPARATE ranked tables).
    const marginPct = menuPrice > 0 ? marginDollars / menuPrice : null;
    out.push({
      loc: a.loc,
      itemNumber: a.itemNumber,
      descr: a.descr,
      menuPrice,
      foodCost,
      paperCost,
      marginDollars,
      marginPct,
      volume: a.volume,
      totalContrib: marginDollars * a.volume,
    });
  }
  return out;
}
