#!/usr/bin/env node
// scripts/qsrsoft-menu-item-recipe-pull.mjs — per-menu-item recipe/BOM + cost breakdown
//
// Pricing Engine follow-up to the owner's live-captured recon (2026-09-01,
// memory/finding-ebos-menu-item-activity-cost-endpoint-2026-09-01.md): the recipe/BOM endpoint
// closes the gap memory/finding-legacy-pricing-workbook-structure-2026-08-27.md flagged as "no
// current Meridian source at all" -- which raw ingredients (WRIN), at what quantity and cost,
// make up a given menu item's food/paper cost, plus a real recipe-change history.
//
//   GET /api/inv/{nsn}/menuitems/{store_menuitem_id}
//     -> item_number/description/daypart_code/family_group/combination_item/on_pos,
//        recipe: [{full_wrin, long_desc, start_date, servings, class, loose_unit_cost, cost_price}],
//        hist_recipe: [...same shape + end_date...],
//        cost_breakdown: {food, paper, total}
//
// Item selection: SAME shared helper qsrsoft-menu-item-activity-pull.mjs uses
// (scripts/lib/menu-item-selection.mjs) -- trailing-90-day active item_numbers from
// qsr_product_mix, intersected with that store's qsr_menu_items catalog to resolve
// store_menuitem_id. NOT the full ~5,466-item catalog, and NOT qsr_raw_item_info's top-50-by-
// variance subset either -- that table is ingredient-centric and scoped to an EOM diagnostic
// sample, so it can't answer "what's the recipe for this item" for most items. This pull covers
// every item actually sold, regardless of variance.
//
// CURRENT-STATE data (recipes change rarely -- hist_recipe's own captured sample spans months
// between versions), so this is NOT a daily re-pull of everything: an item already in
// qsr_menu_item_recipe with updated_at newer than RECIPE_REFRESH_DAYS is skipped. A first run (or
// RECIPE_FORCE_FULL=1) pulls every selected item; steady-state runs only pull new items sold since
// the last pull plus items due for periodic refresh -- so the ongoing cost is small even though
// the initial backfill covers the same ~330-390 items/store the sibling activity pull does.
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Auth -- shared eBOS ladder (scripts/lib/ebos-auth.mjs): QSRSOFT_EBOS_TOKEN -> getFreshToken()
//   (SSO exchange) -> QSRSOFT_USERNAME/PASSWORD (Playwright), same as every other eBOS pull.
// Optional:
//   RECIPE_STORES=3708,...    -- subset of NSNs (default: all 27)
//   RECIPE_WINDOW_DAYS=90     -- trailing window for item selection (default: 90, matching the
//                                sibling activity pull's own sizing measurement)
//   RECIPE_REFRESH_DAYS=21    -- re-pull an item if its stored row is older than this (default: 21)
//   RECIPE_FORCE_FULL=1       -- ignore staleness, re-pull every selected item
//   RECIPE_MAX_PER_STORE=N    -- cap items pulled per store this run (default: no cap) -- a safety
//                                knob for a first live run before trusting the full backfill volume
//   QSRSOFT_DEBUG=1
//
// Token refresh: v3.myqsrsoft.com -> Inventory -> any page -> DevTools -> Network ->
//   any prod.ebos.qsrsoft.com/api/inv/ request -> copy X-Auth-Token -> update QSRSOFT_EBOS_TOKEN.

import { createClient } from '@supabase/supabase-js';
import { withRetry } from './_retry.mjs';
import { makeOutcomeTracker } from './lib/pull-outcome.mjs';
import { EBOS_BASE, resolveEbosToken } from './lib/ebos-auth.mjs';
import { activeItemNumbers, catalogLookup } from './lib/menu-item-selection.mjs';
import { mapMenuItemRecipe } from '../src/engine/eom-parsers.js';

const DEBUG = process.env.QSRSOFT_DEBUG === '1';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';

const STORE_NSNS = (process.env.RECIPE_STORES
  ? process.env.RECIPE_STORES.split(',').map(s => s.trim())
  : [
    3708, 5183, 5985, 6178, 6838, 6972,
    10034, 10422, 10915, 11657, 13113, 18213,
    20475, 24471, 29760, 31357, 32525, 33109,
    33222, 33704, 34222, 35064, 35242, 37566,
    38609, 43380, 43701,
  ]).map(String);

const WINDOW_DAYS = Number(process.env.RECIPE_WINDOW_DAYS || 90);
const REFRESH_DAYS = Number(process.env.RECIPE_REFRESH_DAYS || 21);
const FORCE_FULL = process.env.RECIPE_FORCE_FULL === '1';
const MAX_PER_STORE = process.env.RECIPE_MAX_PER_STORE ? Number(process.env.RECIPE_MAX_PER_STORE) : null;

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const pad2 = n => String(n).padStart(2, '0');
const pad7 = n => String(n).padStart(7, '0');
const fmtDate = d => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
const addDay = (d, n) => { const r = new Date(d); r.setUTCDate(r.getUTCDate() + n); return r; };
const isoDaysAgo = n => fmtDate(addDay(new Date(), -n));

// ── Freshness lookup: this store's qsr_menu_item_recipe, store_menuitem_id -> updated_at ────────
// PAGE=1000, matching scripts/lib/menu-item-selection.mjs's own fix — this project's PostgREST
// caps every request at 1000 rows regardless of the requested range (live-measured 2026-09-02),
// so a bigger PAGE constant silently truncates instead of erroring.
async function freshnessLookup(loc) {
  const map = new Map();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await withRetry(
      () => supabase.from('qsr_menu_item_recipe').select('store_menuitem_id,updated_at').eq('loc', loc).range(from, from + PAGE - 1),
      { label: 'qsr_menu_item_recipe freshness select' },
    );
    if (error) throw new Error(`qsr_menu_item_recipe query failed for ${loc}: ${error.message}`);
    for (const r of data || []) map.set(Number(r.store_menuitem_id), r.updated_at);
    if (!data || data.length < PAGE) break;
  }
  return map;
}

// ── eBOS call ────────────────────────────────────────────────────────────────
async function getMenuItemRecipe(token, nsn, storeMenuitemId) {
  const url = `${EBOS_BASE}/api/inv/${nsn}/menuitems/${storeMenuitemId}`;
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
      () => supabase.from('qsr_menu_item_recipe').upsert(chunk, { onConflict: 'loc,store_menuitem_id' }),
      { label: 'qsr_menu_item_recipe upsert' },
    );
    if (error) console.warn('[qsr_menu_item_recipe] upsert error:', error.message);
    else saved += chunk.length;
  }
  return saved;
}

async function main() {
  const token = await resolveEbosToken();
  const cutoff = isoDaysAgo(WINDOW_DAYS);
  const refreshCutoff = addDay(new Date(), -REFRESH_DAYS).toISOString();
  console.log(`[menu-item-recipe] trailing-${WINDOW_DAYS}d item-selection cutoff ${cutoff} · refresh-if-older-than ${REFRESH_DAYS}d · ${STORE_NSNS.length} stores${FORCE_FULL ? ' · FORCE_FULL' : ''}`);

  let totalSaved = 0, totalDue = 0, storesOk = 0, storesNoCatalog = 0, authFailed = false;
  const tracker = makeOutcomeTracker('menu-item-recipe');
  for (const nsn of STORE_NSNS) {
    if (authFailed) break;
    const loc = pad7(nsn);
    try {
      const [active, catalog, fresh] = await Promise.all([
        activeItemNumbers(supabase, withRetry, loc, cutoff),
        catalogLookup(supabase, withRetry, loc),
        FORCE_FULL ? Promise.resolve(new Map()) : freshnessLookup(loc),
      ]);
      if (!catalog.size) {
        storesNoCatalog++;
        console.warn(`  ${nsn}: qsr_menu_items has 0 rows for this store — skipping (${active.size} active item_numbers found, none resolvable to a store_menuitem_id yet)`);
        tracker.fail(nsn, 'qsr_menu_items empty for this store — catalog pull has not landed yet');
        continue;
      }

      let selected = [...active].filter(n => catalog.has(n));
      const dueForRefresh = itemNumber => {
        const { storeMenuitemId } = catalog.get(itemNumber);
        const updatedAt = fresh.get(Number(storeMenuitemId));
        return !updatedAt || updatedAt < refreshCutoff;
      };
      const beforeStaleness = selected.length;
      selected = selected.filter(dueForRefresh);
      if (MAX_PER_STORE != null) selected = selected.slice(0, MAX_PER_STORE);
      if (DEBUG) console.log(`  ${nsn}: ${active.size} active (${WINDOW_DAYS}d) ∩ ${catalog.size} catalog = ${beforeStaleness} in scope · ${selected.length} due for pull`);
      totalDue += selected.length;

      const rows = [];
      for (const itemNumber of selected) {
        const { storeMenuitemId } = catalog.get(itemNumber);
        try {
          const raw = await getMenuItemRecipe(token, nsn, storeMenuitemId);
          const m = mapMenuItemRecipe(raw);
          rows.push({
            loc, store_menuitem_id: storeMenuitemId, item_number: m.itemNumber ?? itemNumber,
            description: m.description, daypart_code: m.daypartCode, family_group: m.familyGroup,
            combination_item: m.combinationItem, on_pos: m.onPos,
            food_cost: m.foodCost, paper_cost: m.paperCost, total_cost: m.totalCost,
            recipe: m.recipe, hist_recipe: m.histRecipe,
          });
        } catch (e) {
          if (String(e.message).startsWith('AUTH_FAILED')) throw e;
          if (DEBUG) console.warn(`    menuitems/${storeMenuitemId} (item ${itemNumber}): ${e.message}`);
        }
      }
      const saved = await upsert(rows);
      totalSaved += saved;
      storesOk++;
      console.log(`  ${nsn}: ${active.size} active · ${catalog.size} catalog · ${selected.length} pulled · ${rows.length} rows built · ${saved} saved`);
    } catch (e) {
      if (String(e.message).startsWith('AUTH_FAILED')) { authFailed = true; console.error('[menu-item-recipe] auth failed — refresh QSRSOFT_EBOS_TOKEN'); break; }
      console.warn(`  ${nsn}: ${e.message}`);
      tracker.fail(nsn, e.message);
    }
  }

  console.log(`[menu-item-recipe] ✓ ${storesOk}/${STORE_NSNS.length} stores · ${storesNoCatalog} skipped (no catalog yet) · ${totalDue} due for pull · ${totalSaved} rows saved`);
  if (authFailed) process.exit(1);

  // Unlike the sibling activity pull, this table is current-state and skips already-fresh items —
  // a healthy steady-state run can legitimately have totalDue=0 (nothing needed refreshing) and
  // therefore totalSaved=0. pull-outcome.mjs's zero-rows check exists to catch a pull that ran but
  // wrote nothing when it SHOULD have written something; that's not this case, so only run it when
  // there was actually work to do. A run with real per-store failures still goes through finalize()
  // either way, so those are never silently swallowed.
  if (totalDue === 0 && tracker.failedUnits().length === 0) {
    console.log('[menu-item-recipe] nothing due for refresh this run — steady state, not a failure.');
    return;
  }
  const code = tracker.finalize({
    requestedUnits: STORE_NSNS, totalSaved,
    formatRerun: failedStores => `RECIPE_STORES=${failedStores.join(',')}`,
  });
  if (code) process.exit(code);
}

main().catch(err => { console.error('[menu-item-recipe] fatal:', err); process.exit(1); });
