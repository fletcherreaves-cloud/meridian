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

// ── Trap 5: an in-progress day silently understates "current" price ───────────
// Owner-reported 2026-09-01: "I am not sure the Price you are populating is the correct
// price on a lot of items, making the margins seem way off." Live-measured cause: the
// engine's menuPrice is MAX(price) on the single most recent day in the caller's window --
// if that day is still IN PROGRESS (today, or a not-yet-fully-pulled prior day; the
// qsr_product_mix pull runs twice daily, ~5am CDT "prior day fully closed" + ~2pm CDT
// "current-day refresh"), only whatever price tiers have rung SO FAR that day are visible,
// which understates the true day's price. Live sample (store 3708, 2026-08-31 vs the prior
// two days): 34 of 359 items showed a LOWER MAX(price) on the latest date than on an earlier
// date in the same window -- a real menu-wide price rollback across dozens of unrelated
// items in one day is not plausible; an incomplete day's partial data is.
//
// Pure so it's unit-testable without a real Date/clock (the caller passes both dates in) --
// the actual "what day is it" call belongs in the view (lastClosedBusinessDay(),
// src/utils/date.js -- the same shared helper every other trailing-window computation in
// this repo already uses for exactly this trap), not here.
//
// dataMaxDate: the real max date PRESENT in the caller's rows (can be null/undefined if no
// rows). closedCutoff: the last CLOSED business day (a Date). Returns whichever is OLDER --
// never invents data past what's actually pulled (a lagging pull keeps its own real, older
// max), and never lets an in-progress day pass through as "current."
export function clampToLastClosedDay(dataMaxDate, closedCutoff) {
  if (!dataMaxDate) return dataMaxDate;
  return dataMaxDate > closedCutoff ? closedCutoff : dataMaxDate;
}

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

// ── enrichItemMargins — waste/comp/promo enrichment (dispatch #220, 2026-08-30) ──────
// Joins computeItemMargins()'s own output onto raw `qsr_menu_item_activity` rows
// (dispatch #193/#212, schema-qsr-menu-item-activity.sql) on the SAME (loc, item_number)
// key computeItemMargins() already returns as {loc, itemNumber}. See
// memory/dispatch-220.md for the full live-confirmed row shape and rationale.
//
// ── Cost-basis rule (the one thing NOT to get wrong here) ─────────────────────
// qsr_menu_item_activity carries its OWN food_cost/paper_cost columns, but dispatch #212
// already established these are "the SAME QSRSoft-computed number already in
// qsr_product_mix" -- i.e. a second copy of the same number, not a second source. This
// function NEVER reads activityRows' own food_cost/paper_cost. It multiplies summed
// waste/comp/promo UNITS by the ALREADY-JOINED margin row's own (foodCost+paperCost),
// so a waste-dollar figure and a margin-dollar figure for the same item are always
// computed from one cost number, never two independently-sourced ones that could drift
// apart.
//
// ── Aggregation rule -- deliberately NOT the same as price/cost above ─────────
// computeItemMargins()'s price/cost fields use the MOST RECENT day in the window only
// (see file header -- an average across a reprice would blend two prices nobody actually
// charges). Waste/comp/promo/activity are a genuinely different kind of data -- real
// physical/operational counts, not a snapshot attribute -- so this function SUMS them
// across every matching activity row in the window, full stop. Do not copy the
// latest-day-only pattern here.
//
// ── activity, never sold, as the denominator ───────────────────────────────────
// `sold` already EXCLUDES waste/comp/promo by construction (QSRSoft's own activity
// breakdown: activity = sold + waste + emp_meal + mgr_meal + promo + ...). Dividing an
// item's own waste by `sold` would inflate every item's waste-share by shrinking the
// base it's measured against. `activity` is the fuller, undiminished denominator -- use
// it for all three *PctOfActivity fields.
//
// ── null vs. 0 -- a real distinction, not an implementation detail ────────────
// A margin-row item with NO matching activityRows in the window (never pulled yet, or
// simply had zero activity of any kind that window) keeps every new field `null`. An
// item that DID have activity rows but genuinely zero waste/comp/promo gets real `0`s.
// Collapsing these to the same value would make "we don't have this item's activity
// data yet" indistinguishable from "this item wastes nothing," which is a materially
// different operational fact.
//
// activityRows: raw qsr_menu_item_activity rows -- accepts BOTH the raw DB/REST shape
// (loc, item_number, date, activity, sold, emp_meal, mgr_meal, waste, promo) and a
// loader's camelCase-mapped shape (itemNumber, empMeal, mgrMeal), same dual-shape
// tolerance computeItemMargins() already established for pmixRows. loc is normLoc()'d
// here exactly like computeItemMargins() normalizes marginRows' loc, so the two always
// agree on the join key regardless of raw padding.
//
// opts.dateRange: {start, end} (or {s, e}) -- Date or ISO string, inclusive. Should
// match the SAME window marginRows was computed over -- this function doesn't infer or
// validate that; the caller (PricingEnginePanel) owns keeping the two windows aligned.
//
// Returns each margin row extended with wasteUnits/wasteDollars, compUnits/compDollars
// (emp_meal+mgr_meal), promoUnits/promoDollars, wastePctOfActivity/compPctOfActivity/
// promoPctOfActivity, and activityUnits (the summed `activity` denominator itself --
// not in the dispatch's field list verbatim, kept for correct multi-store roll-ups, see
// the comment at its assignment below). All null together when no activity row matched.
export function enrichItemMargins(marginRows, activityRows, { dateRange } = {}) {
  const start = dateRange && (dateRange.start ?? dateRange.s) != null ? _dayKey(dateRange.start ?? dateRange.s) : null;
  const end   = dateRange && (dateRange.end   ?? dateRange.e) != null ? _dayKey(dateRange.end   ?? dateRange.e) : null;

  // Sum waste/comp(emp_meal+mgr_meal)/promo/activity per (loc, item_number) across every
  // matching activity row in [start,end] inclusive. hasRows distinguishes "summed to
  // real zero" from "never had a matching row" (see null-vs-0 note above).
  const sums = new Map(); // "loc|itemNumber" -> {waste, comp, promo, activity, hasRows}
  for (const r of activityRows || []) {
    if (!r) continue;
    const itemNumberRaw = r.itemNumber ?? r.item_number;
    if (itemNumberRaw == null || r.loc == null || r.date == null) continue;
    const itemNumber = Number(itemNumberRaw);
    if (!isFinite(itemNumber)) continue;
    const loc = normLoc(r.loc);
    const day = _dayKey(r.date);
    if (start && day < start) continue;
    if (end && day > end) continue;

    const k = loc + '|' + itemNumber;
    let a = sums.get(k);
    if (!a) { a = { waste: 0, comp: 0, promo: 0, activity: 0, hasRows: false }; sums.set(k, a); }
    a.hasRows = true;
    a.waste    += Number(r.waste) || 0;
    a.comp     += (Number(r.empMeal ?? r.emp_meal) || 0) + (Number(r.mgrMeal ?? r.mgr_meal) || 0);
    a.promo    += Number(r.promo) || 0;
    a.activity += Number(r.activity) || 0;
  }

  return (marginRows || []).map(m => {
    const k = m.loc + '|' + Number(m.itemNumber);
    const a = sums.get(k);
    if (!a || !a.hasRows) {
      return {
        ...m,
        wasteUnits: null, wasteDollars: null,
        compUnits: null, compDollars: null,
        promoUnits: null, promoDollars: null,
        wastePctOfActivity: null, compPctOfActivity: null, promoPctOfActivity: null,
        activityUnits: null,
      };
    }
    // Cost basis: the ALREADY-JOINED margin row's own cost, never activityRows' cost cols.
    const unitCost = (m.foodCost || 0) + (m.paperCost || 0);
    return {
      ...m,
      wasteUnits: a.waste, wasteDollars: a.waste * unitCost,
      compUnits: a.comp,   compDollars: a.comp * unitCost,
      promoUnits: a.promo, promoDollars: a.promo * unitCost,
      wastePctOfActivity: a.activity > 0 ? a.waste / a.activity : null,
      compPctOfActivity:  a.activity > 0 ? a.comp  / a.activity : null,
      promoPctOfActivity: a.activity > 0 ? a.promo / a.activity : null,
      // Not in the dispatch's field list verbatim, but needed by any caller aggregating
      // multiple stores' rows into one blended pct -- CLAUDE.md's own standing rule
      // ("never average averages," dollar/unit-weight instead) applies to a rate like
      // wastePctOfActivity exactly as it does to marginPct elsewhere in this file. Without
      // the raw denominator a caller can only average the already-computed percentages,
      // which is the exact anti-pattern that rule exists to prevent. PricingEnginePanel's
      // aggregateAcrossStores uses this to do Σwaste/Σactivity correctly.
      activityUnits: a.activity,
    };
  });
}

// ── enrichItemRecipe — ingredient-level recipe/BOM (2026-09-02) ───────────────────────────────
// Joins computeItemMargins()'s own output onto `qsr_menu_item_recipe` rows
// (scripts/qsrsoft-menu-item-recipe-pull.mjs, schema-qsr-menu-item-recipe.sql) on the same
// (loc, item_number) key enrichItemMargins() already uses. Owner: "I would definitely like the
// ability to look up the food and paper cost on any item... I think we can eventually tie in
// some other useful metrics from McDonald's RFM." This is the first slice of that: which raw
// ingredients (WRIN), at what quantity and cost, make up an item's food/paper cost, plus a real
// recipe-change history and POS/daypart/family-group metadata.
//
// ── Cost-basis rule (same discipline as enrichItemMargins) ────────────────────
// qsr_menu_item_recipe carries its OWN food_cost/paper_cost/total_cost (cost_breakdown from the
// recipe endpoint), independently computed by QSRSoft from a THIRD angle (per-ingredient
// cost_price summed by class, not the qsr_product_mix-derived number computeItemMargins() uses).
// Rather than silently overwrite the already-proven-correct margin-row cost with this one, this
// function keeps the recipe endpoint's cost as separate `recipeFoodCost`/`recipePaperCost`/
// `recipeTotalCost` fields — a live cross-check surface (do the two independently-computed
// numbers agree?), not a second source pretending to be the first. The margin row's own
// foodCost/paperCost (and everything derived from them — marginDollars, marginPct, the
// enrichItemMargins waste/comp/promo dollars) is UNTOUCHED by this function.
//
// ── current-state, no window aggregation ───────────────────────────────────────
// Unlike activityRows (a daily time series enrichItemMargins sums across the window),
// qsr_menu_item_recipe is a current-state snapshot — one row per (loc, store_menuitem_id), no
// date column. So this is a plain 1:1 join, no summing/latest-day logic needed.
//
// ── null vs. missing — same distinction enrichItemMargins already established ─
// An item with no matching recipeRow (not yet pulled, or a store/item the recipe pull hasn't
// reached) keeps `recipe: null` — never `[]`, which would misread as "pulled, has zero
// ingredients" (a genuinely different, suspicious fact worth being able to tell apart).
//
// recipeRows: raw qsr_menu_item_recipe rows (loc, item_number, description, daypart_code,
// family_group, combination_item, on_pos, food_cost, paper_cost, total_cost, recipe, hist_recipe,
// updated_at) — the DB/REST shape; also accepts a camelCase-mapped shape for consistency with
// this file's other enrich functions, though no loader maps one yet.
//
// Returns each margin row extended with recipeFoodCost/recipePaperCost/recipeTotalCost,
// familyGroup, daypartCode, onPos, combinationItem, recipe (ingredient array or null),
// histRecipe (array or null), recipeUpdatedAt. All null/false-default when unmatched.
export function enrichItemRecipe(marginRows, recipeRows) {
  const byItem = new Map(); // "loc|itemNumber" -> recipe row
  for (const r of recipeRows || []) {
    if (!r) continue;
    const itemNumberRaw = r.itemNumber ?? r.item_number;
    if (itemNumberRaw == null || r.loc == null) continue;
    const itemNumber = Number(itemNumberRaw);
    if (!isFinite(itemNumber)) continue;
    const k = normLoc(r.loc) + '|' + itemNumber;
    // A store can carry more than one store_menuitem_id resolving to the same item_number only
    // in edge cases (a promo-pricing variant sharing the display number) — keep the first/most
    // recently upserted row rather than silently summing two different recipes together.
    if (!byItem.has(k)) byItem.set(k, r);
  }

  return (marginRows || []).map(m => {
    const k = m.loc + '|' + Number(m.itemNumber);
    const r = byItem.get(k);
    if (!r) {
      return {
        ...m,
        recipeFoodCost: null, recipePaperCost: null, recipeTotalCost: null,
        familyGroup: null, daypartCode: null, onPos: null, combinationItem: null,
        recipe: null, histRecipe: null, recipeUpdatedAt: null,
      };
    }
    return {
      ...m,
      recipeFoodCost: r.foodCost ?? r.food_cost ?? null,
      recipePaperCost: r.paperCost ?? r.paper_cost ?? null,
      recipeTotalCost: r.totalCost ?? r.total_cost ?? null,
      familyGroup: r.familyGroup ?? r.family_group ?? null,
      daypartCode: r.daypartCode ?? r.daypart_code ?? null,
      onPos: r.onPos ?? r.on_pos ?? null,
      combinationItem: r.combinationItem ?? r.combination_item ?? null,
      recipe: Array.isArray(r.recipe) ? r.recipe : [],
      histRecipe: Array.isArray(r.histRecipe ?? r.hist_recipe) ? (r.histRecipe ?? r.hist_recipe) : [],
      recipeUpdatedAt: r.updatedAt ?? r.updated_at ?? null,
    };
  });
}

// ── Item / combo cost lookup (owner request, 2026-09-01) ──────────────────────
// "I would definitely like the ability to look up the food and paper cost on any item, value
// meal, or custom created combination of items." A real McDonald's value meal already carries
// its OWN item_number/price/cost row (dispatch #212's trap 3 -- e.g. item 8936 "Big Mac Meal"
// is its own row, not derived from item 5 "Big Mac" + fries + drink), so "any item or value
// meal" is already served by a plain lookup against computeItemMargins()'s own output -- no
// new engine logic needed for that half. This function is the genuinely new half: a
// CUSTOM combination the owner builds by hand (e.g. "what would 2 Big Macs + a large fry cost
// me"), which has no existing item_number of its own.
//
// Pure: sums each selected item's OWN unit food/paper cost (and quantity-weighted volume/
// count), independent of any one store's actual sales mix -- this is a "what would this
// combination cost" calculator, not a sales-weighted analysis. Deliberately does NOT sum
// `menuPrice` into a suggested combo price: a real combo is priced BELOW the sum of its
// components (that's the point of a value meal), so inventing a "combo price" here would be
// actively misleading -- the caller shows Σ(component prices) as a reference figure only and
// lets the operator enter the combo's real menu price separately, if there is one.
//
// itemRows: computeItemMargins()/enrichItemMargins() output (or displayRows, the store-
// aggregated shape PricingEnginePanel already builds) -- one row per item_number in scope.
// picks: [{itemNumber, qty}] -- qty defaults to 1 if omitted. An itemNumber with no matching
// row is skipped (not silently zeroed) so a caller can tell "not found" from "found but
// zero-cost" by comparing picks.length to the returned items.length.
//
// Returns {items: [{itemNumber, descr, qty, unitPrice, unitFoodCost, unitPaperCost,
// lineFoodCost, linePaperCost, linePrice}], sumFoodCost, sumPaperCost, sumPrice, count}.
export function computeComboCost(itemRows, picks) {
  const byItem = new Map();
  for (const r of itemRows || []) {
    if (r && r.itemNumber != null && !byItem.has(r.itemNumber)) byItem.set(r.itemNumber, r);
  }
  const items = [];
  let sumFoodCost = 0, sumPaperCost = 0, sumPrice = 0, count = 0;
  for (const p of picks || []) {
    if (!p || p.itemNumber == null) continue;
    const row = byItem.get(p.itemNumber);
    if (!row) continue;
    const qty = Number(p.qty) > 0 ? Number(p.qty) : 1;
    const lineFoodCost = (row.foodCost || 0) * qty;
    const linePaperCost = (row.paperCost || 0) * qty;
    const linePrice = (row.menuPrice || 0) * qty;
    items.push({
      itemNumber: row.itemNumber, descr: row.descr, qty,
      unitPrice: row.menuPrice || 0, unitFoodCost: row.foodCost || 0, unitPaperCost: row.paperCost || 0,
      lineFoodCost, linePaperCost, linePrice,
    });
    sumFoodCost += lineFoodCost; sumPaperCost += linePaperCost; sumPrice += linePrice; count += qty;
  }
  return { items, sumFoodCost, sumPaperCost, sumPrice, count };
}
