#!/usr/bin/env node
// scripts/qsrsoft-menu-item-activity-pull.mjs — per-menu-item DAILY activity + $ cost (dispatch #193)
//
// Wires the pull dispatch #185 designed but couldn't ship (no known enumeration of
// `store_menuitem_id`) and dispatch #186 unblocked (GET /menuitems -> qsr_menu_items, the
// item_number -> store_menuitem_id lookup) and sized (memory/finding-menu-item-activity-subset-
// 2026-08-28.md: ~330-390 recently-active items/store, not the full ~5,466-item catalog).
//
// For each store, per day:
//   1. Item selection — the set of item_numbers with qsr_product_mix activity in the trailing
//      90 days (SAME window dispatch #186's sizing measurement used — reused here rather than
//      re-derived, so this pull's scope matches the number that sizing decision was made against;
//      change it only with a fresh measurement, per CLAUDE.md's "measure it" rule), intersected
//      with that store's qsr_menu_items catalog (item_number -> store_menuitem_id, item_long_desc
//      source for the POST body). A store with no qsr_menu_items rows yet (the weekly catalog
//      pull hasn't fired since the owner applied its schema, dispatch #186) selects ZERO items —
//      logged clearly, not silently skipped — until that catalog lands.
//   2. Per selected item, CONCURRENTLY (Promise.allSettled, not sequential awaits — same pattern
//      dispatch #184 established for raw_detail/raw_info):
//        POST /api/inv/{nsn}/menu_item_activity2
//          body: store_menuitem_id, start_date/start_time, end_date/end_time, item_long_desc
//          -> activity/sold/emp_meal/mgr_meal/waste/promo/free_choice_qty
//        GET  /api/inv/{nsn}/menu_item_activity_cost?store_busn_dt=&menu_item_id=
//          -> food_cost/paper_cost/total_cost/last_close_business_date
//   3. Upsert one row per (loc, store_menuitem_id, date) into qsr_menu_item_activity — one row
//      covers both endpoints' data, per dispatch #185's original design.
//
// Same eBOS auth as every other eBOS pull (scripts/lib/ebos-auth.mjs) — no new auth path.
//
// Date default: yesterday only (the most recent COMPLETE calendar day) — matching
// qsrsoft-pmix-pull.mjs's own "only ever evaluate the most recent complete day" convention.
// menu_item_activity2's captured sample (dispatch #185) requests a plain calendar-day window
// (start_time 00:00 / end_time 23:45, not the DAR's 05:00-28:00 4am-ABC shape), so this pull
// does NOT apply src/utils/date.js's lastClosedBusinessDay() 4am cutover — there is no evidence
// this endpoint expects it, and forcing an unconfirmed boundary onto a working sample shape is
// the exact mistake CLAUDE.md's "ask which boundary each input is on" rule warns against. If a
// future reconciliation against a known-good source (the same pattern that resolved laborPct/
// compType:'calendar', dispatch #164/#330) finds this endpoint IS 4am-aligned, switch then —
// not on a guess now.
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional:
//   ACTIVITY_STORES=3708,...  — subset of NSNs (default: all 27)
//   ACTIVITY_DATE=YYYY-MM-DD  — override the pull date (default: yesterday, UTC)
//   ACTIVITY_WINDOW_DAYS=90   — trailing window for item selection (default: 90, matching
//                               dispatch #186's own sizing measurement — see header above)
//   QSRSOFT_DEBUG=1
//
// Token refresh: v3.myqsrsoft.com → Inventory → any page → DevTools → Network →
//   any prod.ebos.qsrsoft.com/api/inv/ request → copy X-Auth-Token → update QSRSOFT_EBOS_TOKEN.

import { createClient } from '@supabase/supabase-js';
import { withRetry } from './_retry.mjs';
import { makeOutcomeTracker } from './lib/pull-outcome.mjs';
import { EBOS_BASE, resolveEbosToken } from './lib/ebos-auth.mjs';
import { mapMenuItemActivity, mapMenuItemActivityCost } from '../src/engine/eom-parsers.js';

const DEBUG = process.env.QSRSOFT_DEBUG === '1';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';

const STORE_NSNS = (process.env.ACTIVITY_STORES
  ? process.env.ACTIVITY_STORES.split(',').map(s => s.trim())
  : [
    3708, 5183, 5985, 6178, 6838, 6972,
    10034, 10422, 10915, 11657, 13113, 18213,
    20475, 24471, 29760, 31357, 32525, 33109,
    33222, 33704, 34222, 35064, 35242, 37566,
    38609, 43380, 43701,
  ]).map(String);

const WINDOW_DAYS = Number(process.env.ACTIVITY_WINDOW_DAYS || 90);

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const pad2 = n => String(n).padStart(2, '0');
const pad7 = n => String(n).padStart(7, '0');
const fmtDate = d => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
const addDay = (d, n) => { const r = new Date(d); r.setUTCDate(r.getUTCDate() + n); return r; };
const isoDaysAgo = n => fmtDate(addDay(new Date(), -n));
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function resolveDate() {
  const d = (process.env.ACTIVITY_DATE || '').trim();
  if (!d) return fmtDate(addDay(new Date(), -1)); // yesterday only — today is still accumulating
  if (!DATE_RE.test(d)) { console.error(`[menu-item-activity] ✗ ACTIVITY_DATE must be YYYY-MM-DD — got "${d}"`); process.exit(1); }
  return d;
}

// ── Item selection: trailing-WINDOW_DAYS active item_numbers from qsr_product_mix, paginated ──
async function activeItemNumbers(loc, cutoff) {
  const items = new Set();
  const PAGE = 5000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await withRetry(
      () => supabase.from('qsr_product_mix').select('item').eq('loc', loc).gte('date', cutoff).range(from, from + PAGE - 1),
      { label: 'qsr_product_mix select' },
    );
    if (error) throw new Error(`qsr_product_mix query failed for ${loc}: ${error.message}`);
    for (const r of data || []) if (r.item != null) items.add(Number(r.item));
    if (!data || data.length < PAGE) break;
  }
  return items;
}

// ── Catalog lookup: this store's qsr_menu_items, item_number -> {storeMenuitemId, value} ──────
async function catalogLookup(loc) {
  const map = new Map();
  const PAGE = 5000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await withRetry(
      () => supabase.from('qsr_menu_items').select('store_menuitem_id,item_number,value').eq('loc', loc).range(from, from + PAGE - 1),
      { label: 'qsr_menu_items select' },
    );
    if (error) throw new Error(`qsr_menu_items query failed for ${loc}: ${error.message}`);
    for (const r of data || []) if (r.item_number != null) map.set(Number(r.item_number), { storeMenuitemId: r.store_menuitem_id, value: r.value });
    if (!data || data.length < PAGE) break;
  }
  return map;
}

// ── eBOS calls ───────────────────────────────────────────────────────────────
async function postMenuItemActivity(token, nsn, { storeMenuitemId, date, itemLongDesc }) {
  const url = `${EBOS_BASE}/api/inv/${nsn}/menu_item_activity2`;
  const body = { store_menuitem_id: storeMenuitemId, start_date: date, start_time: '00:00', end_date: date, end_time: '23:45', item_long_desc: itemLongDesc || '' };
  if (DEBUG) console.log('[POST]', url, JSON.stringify(body));
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Auth-Token': token, 'X-Current-Nsn': String(nsn), 'Accept': 'application/json', 'Content-Type': 'application/json',
      'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/', 'User-Agent': UA,
    },
    body: JSON.stringify(body),
  });
  if (resp.status === 401 || resp.status === 403) throw new Error(`AUTH_FAILED:${resp.status}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 160)}`);
  return resp.json();
}

async function getMenuItemActivityCost(token, nsn, { storeMenuitemId, date }) {
  const url = `${EBOS_BASE}/api/inv/${nsn}/menu_item_activity_cost?${new URLSearchParams({ store_busn_dt: date, menu_item_id: String(storeMenuitemId) })}`;
  if (DEBUG) console.log('[GET]', url);
  const resp = await fetch(url, {
    headers: { 'X-Auth-Token': token, 'X-Current-Nsn': String(nsn), 'Accept': 'application/json', 'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/', 'User-Agent': UA },
  });
  if (resp.status === 401 || resp.status === 403) throw new Error(`AUTH_FAILED:${resp.status}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 160)}`);
  return resp.json();
}

async function upsert(rows) {
  if (!rows.length) return 0;
  const CHUNK = 500; let saved = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await withRetry(
      () => supabase.from('qsr_menu_item_activity').upsert(chunk, { onConflict: 'loc,store_menuitem_id,date' }),
      { label: 'qsr_menu_item_activity upsert' },
    );
    if (error) console.warn('[qsr_menu_item_activity] upsert error:', error.message);
    else saved += chunk.length;
  }
  return saved;
}

async function main() {
  const token = await resolveEbosToken();
  const date = resolveDate();
  const cutoff = isoDaysAgo(WINDOW_DAYS);
  console.log(`[menu-item-activity] date ${date} · trailing-${WINDOW_DAYS}d item-selection cutoff ${cutoff} · ${STORE_NSNS.length} stores`);

  let totalSaved = 0, storesOk = 0, storesNoCatalog = 0, authFailed = false;
  const tracker = makeOutcomeTracker('menu-item-activity');
  for (const nsn of STORE_NSNS) {
    if (authFailed) break;
    const loc = pad7(nsn);
    try {
      const [active, catalog] = await Promise.all([activeItemNumbers(loc, cutoff), catalogLookup(loc)]);
      const selected = [...active].filter(n => catalog.has(n));
      if (!catalog.size) {
        // qsr_menu_items has no rows for this store yet (weekly pull hasn't fired since the
        // schema landed, or this store's own run hasn't happened) — nothing to resolve
        // store_menuitem_id against. Not a fetch failure, but not silently skipped either.
        storesNoCatalog++;
        console.warn(`  ${nsn}: qsr_menu_items has 0 rows for this store — skipping (${active.size} active item_numbers found, none resolvable to a store_menuitem_id yet)`);
        tracker.fail(nsn, 'qsr_menu_items empty for this store — catalog pull has not landed yet');
        continue;
      }
      if (DEBUG) console.log(`  ${nsn}: ${active.size} active (${WINDOW_DAYS}d) ∩ ${catalog.size} catalog = ${selected.length} selected`);

      const rows = [];
      for (const itemNumber of selected) {
        const { storeMenuitemId, value } = catalog.get(itemNumber);
        const [actRes, costRes] = await Promise.allSettled([
          postMenuItemActivity(token, nsn, { storeMenuitemId, date, itemLongDesc: value }),
          getMenuItemActivityCost(token, nsn, { storeMenuitemId, date }),
        ]);

        let act = null, cost = null;
        if (actRes.status === 'fulfilled') {
          const days = mapMenuItemActivity(actRes.value);
          // Single-day request → normally exactly one entry; sum defensively if the API ever
          // returns more than one for a single-day window (see file header).
          if (days.length) {
            act = days.reduce((a, d) => ({
              activity: a.activity + d.activity, sold: a.sold + d.sold, empMeal: a.empMeal + d.empMeal,
              mgrMeal: a.mgrMeal + d.mgrMeal, waste: a.waste + d.waste, promo: a.promo + d.promo,
              freeChoiceQty: a.freeChoiceQty + d.freeChoiceQty,
            }), { activity: 0, sold: 0, empMeal: 0, mgrMeal: 0, waste: 0, promo: 0, freeChoiceQty: 0 });
          }
        } else {
          const e = actRes.reason;
          if (String(e.message).startsWith('AUTH_FAILED')) throw e;
          if (DEBUG) console.warn(`    menu_item_activity2 ${itemNumber}: ${e.message}`);
        }
        if (costRes.status === 'fulfilled') {
          cost = mapMenuItemActivityCost(costRes.value);
        } else {
          const e = costRes.reason;
          if (String(e.message).startsWith('AUTH_FAILED')) throw e;
          if (DEBUG) console.warn(`    menu_item_activity_cost ${itemNumber}: ${e.message}`);
        }
        if (!act && !cost) continue; // both calls failed for this item — nothing to write

        rows.push({
          loc, store_menuitem_id: storeMenuitemId, date, item_number: itemNumber,
          activity: act?.activity ?? null, sold: act?.sold ?? null, emp_meal: act?.empMeal ?? null,
          mgr_meal: act?.mgrMeal ?? null, waste: act?.waste ?? null, promo: act?.promo ?? null,
          free_choice_qty: act?.freeChoiceQty ?? null,
          food_cost: cost?.foodCost ?? null, paper_cost: cost?.paperCost ?? null, total_cost: cost?.totalCost ?? null,
          last_close_business_date: cost?.lastCloseBusinessDate ?? null,
        });
      }
      const saved = await upsert(rows);
      totalSaved += saved;
      storesOk++;
      console.log(`  ${nsn}: ${active.size} active · ${catalog.size} catalog · ${selected.length} selected · ${rows.length} rows built · ${saved} saved`);
    } catch (e) {
      if (String(e.message).startsWith('AUTH_FAILED')) { authFailed = true; console.error('[menu-item-activity] auth failed — refresh QSRSOFT_EBOS_TOKEN'); break; }
      console.warn(`  ${nsn}: ${e.message}`);
      tracker.fail(nsn, e.message);
    }
  }

  console.log(`[menu-item-activity] ✓ ${storesOk}/${STORE_NSNS.length} stores · ${storesNoCatalog} skipped (no catalog yet) · ${totalSaved} rows saved for ${date}`);
  if (authFailed) process.exit(1);
  const code = tracker.finalize({
    requestedUnits: STORE_NSNS, totalSaved,
    formatRerun: failedStores => `ACTIVITY_STORES=${failedStores.join(',')} ACTIVITY_DATE=${date}`,
  });
  if (code) process.exit(code);
}

main().catch(err => { console.error('[menu-item-activity] fatal:', err); process.exit(1); });
