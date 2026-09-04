// @ts-nocheck
// ── EOM eBOS response parsers ─────────────────────────────────────────────────
// Pure mappers from the raw QSRSoft eBOS API responses (prod.ebos.qsrsoft.com)
// into the normalized shapes the diagnosis engine (eom-diagnosis.js) consumes.
// Keeping them here means the pull script (scripts/qsrsoft-variance-pull.mjs) and
// the client parse the SAME way — zero drift, the standing rule for cloud streams.
//
// Endpoints these map (all auth = eBOS x-auth-token):
//   /stat_variance/monthly/{date}      → mapVarianceRows   (Food/Paper carry $; Condiment unit-only)
//   /stat_variance/daily?start&end     → mapVarianceRows   (same shape, arbitrary window)
//   /stat_variance/yields?start&end    → mapYieldGroups    (acceptable yield band per concept group)
//   /raw_waste_promo?start&end         → mapWasteEvents    (per-entry, manager-attributed)
//   /raw_detail/{itemId}?start&end     → mapRawItemHistory (forensic count-timing register)
//   /raw_info/{itemId}?start&end       → mapRawItemInfo    (recipe/serving-factor + current cost snapshot)
//   /menuitems                         → mapMenuItems      (per-store menu-item catalog, dispatch #186)
//   /menu_item_activity2 (POST)        → mapMenuItemActivity      (per-item, per-day counts, dispatch #193)
//   /menu_item_activity_cost           → mapMenuItemActivityCost  (per-item, per-day $ cost, dispatch #193)
//   /menuitems/{store_menuitem_id}     → mapMenuItemRecipe   (per-item recipe/BOM + cost breakdown, Pricing Engine)
//   /inv_summary/rawitems?start&end    → mapInventorySummaryResponse (begin/end inv + usage per WRIN, Inventory Intelligence)
import { normClass } from './eom-inventory.js';

// ── Variance Stat rows ────────────────────────────────────────────────────────
// Food/Paper (ri:1) carry dollar_variance + yield + loose_unit_cost; Condiment
// (ri:0) rows are unit-only (no $). We keep BOTH but expose a single `dolDiff`
// (0 for condiments — they get the always-review unit-variance treatment).
export function mapVarianceRows(rows = []) {
  return (rows || []).map((r) => {
    const hasDollars = r.ri === 1 || r.dollar_variance != null;
    return {
      wrin: r.wrin,
      rawItemId: r.store_rawitem_id,
      descr: r.long_desc || r.short_desc || r.wrin,
      cls: normClass(r.class),
      classCode: r.class,
      // dolDiff is the top-5 / ±$50 sort key. Condiments have no $ → 0.
      dolDiff: hasDollars ? Number(r.dollar_variance) || 0 : 0,
      unitVar: Number(r.variance) || 0,
      expectedUsage: Number(r.expected_usage) || 0,
      actualUsage: Number(r.actual_usage) || 0,
      unitCost: Number(r.loose_unit_cost) || 0,
      pctOfSales: r.percentage != null ? Number(r.percentage) : null,
      yield: r.yield != null ? Number(r.yield) : null,
      midRangeYield: Number(r.mid_range_yield) || null,
      rawWaste: Number(r.raw_waste) || 0,
      compWaste: Number(r.comp_waste) || 0,
      hasDollars,
    };
  });
}

// ── Yields (acceptable yield band per concept group) ──────────────────────────
// Response: [{ groupName, description "Y Range: lo - hi", items: [wrinPrefix,…] }].
// We flatten to a prefix→band lookup so a variance row's actual `yield` can be
// checked against its group band → out-of-band = a procedural/calibration cause.
export function mapYieldGroups(groups = []) {
  const byPrefix = {};
  const list = [];
  for (const g of groups || []) {
    const band = parseYieldRange(g.description);
    const entry = { group: g.groupName, ...band, prefixes: g.items || [] };
    list.push(entry);
    for (const p of g.items || []) byPrefix[String(p)] = entry;
  }
  return { byPrefix, list };
}

// "Y Range: 35.00 - 37.00" | "Y Range: 53.1-58.7" → { lo, hi }
export function parseYieldRange(desc = '') {
  const m = String(desc).match(/([\d.]+)\s*-\s*([\d.]+)/);
  if (!m) return { lo: null, hi: null };
  return { lo: Number(m[1]), hi: Number(m[2]) };
}

// wrin "00055-332" → prefix "00055"; look up its band; classify actual yield.
export function yieldBandFor(wrin, yieldLookup) {
  if (!wrin || !yieldLookup) return null;
  const prefix = String(wrin).split('-')[0];
  return yieldLookup.byPrefix?.[prefix] || null;
}
export function yieldStatus(actualYield, band) {
  if (band == null || actualYield == null || band.lo == null) return 'unknown';
  if (actualYield < band.lo) return 'below'; // over-portioning / cook loss
  if (actualYield > band.hi) return 'above'; // under-portioning / calibration high
  return 'in-band';
}

// ── Waste events (raw_waste_promo) ────────────────────────────────────────────
// Flat per-entry array; type "waste"=raw, "comp_waste"=completed. eID = manager.
export function mapWasteEvents(rows = []) {
  return (rows || []).map((r) => ({
    dt: r.store_busn_dt,
    tm: r.store_busn_tm,
    type: r.type === 'comp_waste' ? 'completed' : 'raw',
    amount: Number(r.amount) || 0,
    manager: r.eID || null,
    source: r.source || null, // BOS | MobileApp
    edited: r.edited === 1 || r.edited === true,
    reason: r.reason || null,
    createdSec: r.date_created_sec || r.date_created || null,
  }));
}

// Per-manager waste aggregation → feeds the manager-risk overlay + pencil-whip flags.
export function summarizeWasteByManager(events = []) {
  const by = {};
  let total = 0;
  for (const e of events) {
    total += e.amount;
    const m = (by[e.manager] = by[e.manager] || {
      manager: e.manager, total: 0, count: 0, raw: 0, completed: 0, edited: 0,
    });
    m.total += e.amount; m.count += 1; m[e.type] += e.amount;
    if (e.edited) m.edited += 1;
  }
  const list = Object.values(by).map((m) => ({ ...m, share: total ? m.total / total : 0 }));
  list.sort((a, b) => b.total - a.total);
  return { total, byManager: list };
}

// ── Transfers (transfers) ─────────────────────────────────────────────────────
// One row per line item; rows of the same transfer share `id` + `header_total_amt`.
// Out = product left this store; In = arrived. trans_nsn = counterparty store.
export function mapTransferLines(rows = []) {
  return (rows || []).map((r) => ({
    id: r.id,
    dir: r.type, // "In" | "Out"
    counterpartyNsn: r.trans_nsn != null ? String(r.trans_nsn) : null,
    dt: r.store_busn_dt,
    status: r.status, // approved | rejected
    lineAmt: Number(r.total_amt) || 0,
    transferTotal: Number(r.header_total_amt) || 0,
    manager: r.eID || null,
    autoPost: r.auto_post === 1 || r.auto_post === true,
    wrin: r.wrin,
    rawItemId: r.store_rawitem_id,
    descr: r.long_desc || r.wrin,
    cls: normClass(r.invty_class_cd),
    classCode: r.invty_class_cd,
    units: Number(r.units_count) || 0,
  }));
}

// Unmatched-side detection (integrity #47): a real inter-store transfer shows up on BOTH stores —
// an Out at the sender and a matching In at the receiver, same amount + date. A transfer whose
// counterparty is one of OUR stores but has no mirror record is a phantom-transfer risk (a paper
// move with no physical product, or a pair booked into different periods on each side). Only flagged
// when the counterparty is in the loaded store set — an outside-org store's side we simply never see.
// Returns a Set of `${normLoc}|${transferId}` keys (loc-scoped so ids can't collide across stores).
export function flagUnmatchedTransfers(lines = [], ourLocs = []) {
  const norm = s => String(s || '').replace(/^0+/, '') || String(s || '');
  const dayDiff = (a, b) => { const ta = Date.parse(a), tb = Date.parse(b); return (Number.isNaN(ta) || Number.isNaN(tb)) ? 999 : Math.abs(ta - tb) / 86400000; };
  const ours = new Set((ourLocs || []).map(norm));
  // Collapse to one header per (loc, transferId).
  const headers = new Map();
  for (const l of (lines || [])) {
    const id = l.transferId ?? l.id; if (id == null) continue;
    const key = norm(l.loc) + '|' + id;
    if (!headers.has(key)) headers.set(key, {
      id, key, loc: norm(l.loc), dir: l.dir, cp: norm(l.counterpartyNsn),
      total: Number(l.transferTotal) || 0, dt: String(l.dt || '').slice(0, 10),
    });
  }
  const hs = [...headers.values()];
  const unmatched = new Set();
  for (const h of hs) {
    if (!h.cp || !ours.has(h.cp)) continue;   // counterparty outside our org → can't verify, skip
    const mirror = hs.find(o =>
      o.loc === h.cp && o.cp === h.loc && o.dir !== h.dir &&
      Math.abs((o.total || 0) - (h.total || 0)) <= 1 && dayDiff(o.dt, h.dt) <= 1);
    if (!mirror) unmatched.add(h.key);
  }
  return unmatched;
}

// Net In/Out $ by class + a list of transfers to eyeball (large / not-approved).
export function summarizeTransfers(lines = [], { largeAmt = 100 } = {}) {
  let inTotal = 0, outTotal = 0;
  const byClass = {};
  const byId = {};
  for (const l of lines) {
    const id = l.id ?? l.transferId; // tolerate DB-loaded rows (transferId) + freshly-mapped (id)
    const lineAmt = Number(l.lineAmt) || 0;
    if (l.dir === 'Out') outTotal += lineAmt; else inTotal += lineAmt;
    const c = (byClass[l.cls] = byClass[l.cls] || { cls: l.cls, in: 0, out: 0 });
    if (l.dir === 'Out') c.out += lineAmt; else c.in += lineAmt;
    const t = (byId[id] = byId[id] || {
      id, dir: l.dir, dt: l.dt, status: l.status, manager: l.manager,
      counterpartyNsn: l.counterpartyNsn, total: Number(l.transferTotal) || 0, lines: 0,
    });
    t.lines += 1;
  }
  const transfers = Object.values(byId);
  const flagged = transfers.filter((t) => t.status !== 'approved' || t.total >= largeAmt);
  return { inTotal, outTotal, netAmt: inTotal - outTotal, byClass: Object.values(byClass), transfers, flagged };
}

// ── Raw-item forensic history (raw_detail/{itemId}) ───────────────────────────
// The per-transaction "life of the product". source=inventory rows are COUNTS
// carrying variance/difference/eID → the "when did the variance occur" answer.
export function mapRawItemHistory(detail = {}) {
  const history = (detail.history || []).map((h) => ({
    dt: h.store_busn_dt || h.store_busn_dt_raw,
    tm: h.store_busn_tm,
    displayDt: h.display_dt_tm,
    source: h.source, // invoice | pos_open | pos_sales | waste | comp_waste | transfer | inventory
    qtyChange: Number(h.qty_change) || 0,
    isCount: h.source === 'inventory',
    variance: h.variance != null ? Number(h.variance) : null,
    difference: h.difference != null ? Number(h.difference) : null, // $ impact of a count
    manager: h.eID || null,
    countSource: h.count_source || null,
    invoice: h.invoice_identifier || null,
    // source_id = monotonic creation-order id (exact same-timestamp ordering tiebreaker);
    // date_created = true wall-clock create time (vs store_busn_* = the assigned business date/time).
    sourceId: h.source_id != null ? Number(h.source_id) : null,
    createdAt: h.date_created || null,
  }));
  return {
    wrin: detail.full_wrin,
    descr: detail.long_desc,
    itemClass: detail.item_class,
    uom: detail.uom_desc,
    history,
    counts: history.filter((h) => h.isCount),
  };
}

// ── Raw-item info (raw_info/{itemId}) — dispatch #184 ──────────────────────────
// A CURRENT-STATE snapshot per raw item: recipe/serving-factor (BOM — which menu
// items this raw item feeds, and at what serving factor), combo composition, and
// current distributor cost (latest/avg case price, vendor, yield). Unlike
// mapRawItemHistory (a forensic per-transaction log, one row per period), this is
// point-in-time — the pull script keys it (loc, wrin) with no period, so a re-pull
// just overwrites the latest known values. See memory/dispatch-184.md.
export function mapRawItemInfo(detail = {}) {
  return {
    wrin: detail.full_wrin,
    descr: detail.long_desc,
    invtyCategoryType: detail.invty_category_type ?? null,
    caseQty: detail.case_qty != null ? Number(detail.case_qty) : null,
    latestCasePrice: detail.latest_case_price != null ? Number(detail.latest_case_price) : null,
    casePriceAvg: detail.case_price_avg != null ? Number(detail.case_price_avg) : null,
    primaryVdrName: detail.primary_vdr_name ?? null,
    primaryVdr: detail.primary_vdr != null ? String(detail.primary_vdr) : null,
    midRangeYield: detail.mid_range_yield != null ? Number(detail.mid_range_yield) : null,
    // The real live-captured response (memory/dispatch-184.md) sends this as the JSON
    // integer 1/0, not a boolean or 'Y'/'N' string — `=== true`/`=== 'Y'` alone would
    // silently read every real item as false. Accept all three representations QSRSoft's
    // other Y/N-flag fields (e.g. on_pos) are known to use across this API family.
    recipeItem: detail.recipe_item === true || detail.recipe_item === 'Y' || detail.recipe_item === 1 || detail.recipe_item === '1',
    currentUpt: detail.current_upt != null ? Number(detail.current_upt) : null,
    // Lists — stored as JSONB verbatim (matching qsr_raw_item_detail.history's precedent),
    // not normalized further in this first slice.
    menuItems: Array.isArray(detail.menu_items) ? detail.menu_items : [],
    menuItemCombos: Array.isArray(detail.menu_item_combos) ? detail.menu_item_combos : [],
    uptHist: Array.isArray(detail.upt_hist) ? detail.upt_hist : [],
  };
}

// ── Menu items catalog (GET /menuitems) — dispatch #186 ────────────────────────
// The store's full definable menu-item catalog: [{ data, value }], `data` =
// store_menuitem_id (the SAME id space menu_item_activity2/menu_item_activity_cost key
// off, dispatch #185), `value` = "{item_number} - {description}". Catalog/reference
// data, not a per-transaction log -- one row per (store, store_menuitem_id), full
// replace on every pull. Real live capture (memory/captures/menu-items-list-2026-08-28.json,
// store 3708, 5,466 rows) matched the "digits - text" pattern on every single row, but a
// future store/item could plausibly not -- unmatched rows keep their raw `value` with
// itemNumber/description left null rather than being dropped.
const MENU_ITEM_VALUE_RE = /^(\d+)\s*-\s*(.*)$/;
export function mapMenuItems(rows = []) {
  return (rows || [])
    .filter(r => r && r.data != null)
    .map(r => {
      const value = r.value != null ? String(r.value) : '';
      const m = MENU_ITEM_VALUE_RE.exec(value);
      return {
        storeMenuitemId: r.data,
        itemNumber: m ? Number(m[1]) : null,
        description: m ? m[2] : null,
        value,
      };
    });
}

// ── Menu item activity (POST /menu_item_activity2) — dispatch #193 ─────────────
// Per-item, per-day counts: activity/sold/emp_meal/mgr_meal/waste/promo/free_choice_qty.
// Response wraps a `getMenuItemActivity` array under `currentBusinessTime` (dispatch #185's
// captured sample); one entry per date_range in the requested window. The pull always requests
// a SINGLE calendar day, so normally exactly one entry comes back — but this stays a general
// array mapper (matching every other list mapper in this file) rather than assuming index [0],
// and the pull script sums across entries as a defensive fallback if the API ever returns more
// than one for a single-day request.
export function mapMenuItemActivity(resp = {}) {
  const rows = Array.isArray(resp?.getMenuItemActivity) ? resp.getMenuItemActivity : [];
  return rows.map(r => ({
    dateRange: r.date_range ?? null,
    activity: Number(r.activity) || 0,
    sold: Number(r.sold) || 0,
    empMeal: Number(r.emp_meal) || 0,
    mgrMeal: Number(r.mgr_meal) || 0,
    waste: Number(r.waste) || 0,
    promo: Number(r.promo) || 0,
    freeChoiceQty: Number(r.free_choice_qty) || 0,
    datetimeRange: r.datetime_range ?? null,
  }));
}

// ── Menu item activity cost (GET /menu_item_activity_cost) — dispatch #193 ─────
// Per-item, per-day QSRSoft-computed food+paper cost. Response is a single flat object (not a
// list, unlike menu_item_activity2), matching menu_item_activity_cost's dispatch #185 sample.
export function mapMenuItemActivityCost(resp = {}) {
  return {
    foodCost: resp?.food_cost != null ? Number(resp.food_cost) : null,
    paperCost: resp?.paper_cost != null ? Number(resp.paper_cost) : null,
    totalCost: resp?.total_cost != null ? Number(resp.total_cost) : null,
    lastCloseBusinessDate: resp?.last_close_business_date ?? null,
  };
}

// ── Menu item recipe/BOM (GET /menuitems/{store_menuitem_id}) — Pricing Engine recipe ─────────
// Per-item, CURRENT-STATE recipe/bill-of-materials + cost breakdown (owner-captured live,
// 2026-09-01 — memory/finding-ebos-menu-item-activity-cost-endpoint-2026-09-01.md). A single flat
// object, like menu_item_activity_cost, not a list. `recipe` = the item's current ingredient list
// (full_wrin/long_desc/start_date/servings/class F-food|P-paper/loose_unit_cost/cost_price);
// `hist_recipe` = prior recipe versions, same per-ingredient shape plus an end_date. `on_pos` and
// `combination_item` are flag fields QSRSoft sends as JSON 1/0 in the real capture — normalized
// the same permissive way mapRawItemInfo's recipeItem already handles this API family's flags
// (true/'Y'/1/'1' all read as true), so a future response using a different truthy encoding for
// the SAME field doesn't silently read as false.
const truthy = v => v === true || v === 'Y' || v === 1 || v === '1';
function mapRecipeIngredient(r = {}) {
  return {
    fullWrin: r.full_wrin ?? null,
    longDesc: r.long_desc ?? null,
    startDate: r.start_date ?? null,
    endDate: r.end_date ?? null,           // present on hist_recipe entries, absent on current recipe
    servings: r.servings != null ? Number(r.servings) : null,
    cls: r.class ?? null,                  // 'F' food / 'P' paper — QSRSoft's own cost-category split
    looseUnitCost: r.loose_unit_cost != null ? Number(r.loose_unit_cost) : null,
    costPrice: r.cost_price != null ? Number(r.cost_price) : null,
  };
}
export function mapMenuItemRecipe(resp = {}) {
  return {
    itemNumber: resp?.item_number != null ? Number(resp.item_number) : null,
    description: resp?.description ?? null,
    daypartCode: resp?.daypart_code ?? null,
    familyGroup: resp?.family_group ?? null,
    combinationItem: truthy(resp?.combination_item),
    onPos: truthy(resp?.on_pos),
    foodCost: resp?.cost_breakdown?.food != null ? Number(resp.cost_breakdown.food) : null,
    paperCost: resp?.cost_breakdown?.paper != null ? Number(resp.cost_breakdown.paper) : null,
    totalCost: resp?.cost_breakdown?.total != null ? Number(resp.cost_breakdown.total) : null,
    recipe: Array.isArray(resp?.recipe) ? resp.recipe.map(mapRecipeIngredient) : [],
    histRecipe: Array.isArray(resp?.hist_recipe) ? resp.hist_recipe.map(mapRecipeIngredient) : [],
  };
}

// ── Inventory Usage (Inventory Intelligence's auto stream, qsr_inventory_summary) ────────────────
// One row per raw item within the store's requested date window. Field-for-field the same shape
// the manual "Inventory Summary and Usage.xlsx" upload already produces (parseInventoryData,
// src/parsers/inventory-parse.js) and cloudRowsToPanelShape (src/views/inventory.js) already
// expects — QSRSoft precomputes actual_usage itself (Starting + Purchases +/- Transfers - Waste -
// Ending, per the KB's own "Inventory Usage" article), so this is a direct field rename, not a
// re-derivation of their internal accounting.
function mapInventorySummaryRow(r = {}) {
  return {
    wrin: r.full_wrin ?? null,
    descr: r.long_desc ?? null,
    cls: r.invty_class ?? null,           // 'Food' / 'Condiment' / 'Paper' / 'Non-Product' / 'Miscellaneous'
    uom: r.uom_desc ?? null,
    caseSz: r.case_qty != null ? Number(r.case_qty) : null,
    cost: r.uom_cost != null ? Number(r.uom_cost) : null,
    startInv: r.begin_inv_qty != null ? Number(r.begin_inv_qty) : null,
    purchases: r.purchase_qty != null ? Number(r.purchase_qty) : null,
    transferQty: r.transfer_qty != null ? Number(r.transfer_qty) : null,
    wasteQty: r.waste_qty != null ? Number(r.waste_qty) : null,
    endInv: r.end_inv_qty != null ? Number(r.end_inv_qty) : null,
    actualUsage: r.actual_usage != null ? Number(r.actual_usage) : null,
  };
}
export function mapInventorySummaryResponse(resp = {}) {
  const items = Array.isArray(resp?.getInvSummaryInfo) ? resp.getInvSummaryInfo : [];
  return items.map(mapInventorySummaryRow);
}
