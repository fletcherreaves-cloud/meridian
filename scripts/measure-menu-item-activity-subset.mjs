#!/usr/bin/env node
// scripts/measure-menu-item-activity-subset.mjs — dispatch #186 task 3
//
// Sizes the "real-activity subset" of a store's menu-item catalog: how many of the ~5,466
// catalog rows (memory/captures/menu-items-list-2026-08-28.json for store 3708; each store's
// own count once qsr_menu_items has real rows) were actually SOLD in the last N days, per
// already-pulled qsr_product_mix (item = the same small item_number/menuItemNumber POS code
// space as this catalog's parsed item_number — confirmed, memory/finding-menu-item-id-
// enumeration-2026-08-28.md's table #1). This is the number a follow-up dispatch sizes a
// bounded menu_item_activity2/menu_item_activity_cost pull against, instead of hitting the
// full, mostly-inactive catalog per store per day.
//
// Two measurement modes, chosen automatically:
//   1. If qsr_menu_items has rows for a store (real pull has landed), cross-reference that
//      store's OWN catalog against its own qsr_product_mix activity — the true number.
//   2. Otherwise (table not yet created/populated), fall back to reporting the store's
//      distinct-active-item COUNT from qsr_product_mix alone — every sold item necessarily
//      exists in that store's catalog (a POS can't sell an unconfigured item), so this count
//      IS the real-activity subset size; it just isn't cross-checked against that store's own
//      captured catalog rows. Labeled as a proxy, not asserted as a true intersection, when used.
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional: ACTIVITY_WINDOW_DAYS=90 (default), ACTIVITY_STORES=3708,... (default: all 27),
//           ACTIVITY_CAPTURE=path/to/captured-menu-items.json (default: the dispatch #186
//           capture, used only for the store(s) it covers — currently store 3708 only).

import { readFileSync, existsSync } from 'node:fs';

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('[measure] VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required'); process.exit(1); }

const WINDOW_DAYS = Number(process.env.ACTIVITY_WINDOW_DAYS || 90);
const CAPTURE_PATH = process.env.ACTIVITY_CAPTURE || 'memory/captures/menu-items-list-2026-08-28.json';
const STORE_NSNS = (process.env.ACTIVITY_STORES
  ? process.env.ACTIVITY_STORES.split(',').map(s => s.trim())
  : [
    3708, 5183, 5985, 6178, 6838, 6972,
    10034, 10422, 10915, 11657, 13113, 18213,
    20475, 24471, 29760, 31357, 32525, 33109,
    33222, 33704, 34222, 35064, 35242, 37566,
    38609, 43380, 43701,
  ]).map(String);

const pad7 = n => String(n).padStart(7, '0');
function isoDaysAgo(n) { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); }
const CUTOFF = isoDaysAgo(WINDOW_DAYS);

const MENU_ITEM_VALUE_RE = /^(\d+)\s*-\s*(.*)$/;
function catalogItemNumbersFromCapture(path) {
  if (!existsSync(path)) return null;
  const rows = JSON.parse(readFileSync(path, 'utf8'));
  const set = new Set();
  for (const r of rows) { const m = MENU_ITEM_VALUE_RE.exec(r.value || ''); if (m) set.add(Number(m[1])); }
  return set;
}

async function sbFetch(path, params) {
  const url = `${URL}/rest/v1/${path}?${new URLSearchParams(params)}`;
  const resp = await fetch(url, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  return resp;
}

/** Distinct qsr_product_mix `item` values for one store, date >= cutoff. Paginated. */
async function activeItemsFor(loc, cutoff) {
  const items = new Set();
  let offset = 0;
  const PAGE = 5000;
  for (;;) {
    const url = `${URL}/rest/v1/qsr_product_mix?${new URLSearchParams({ select: 'item', loc: `eq.${loc}`, date: `gte.${cutoff}` })}`;
    const resp = await fetch(url, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: `${offset}-${offset + PAGE - 1}`, Prefer: 'count=exact' } });
    const cr = resp.headers.get('content-range');
    const total = cr && cr.includes('/') ? Number(cr.split('/')[1]) : null;
    const rows = await resp.json();
    if (!Array.isArray(rows)) throw new Error(`qsr_product_mix query failed for ${loc}: ${JSON.stringify(rows).slice(0, 200)}`);
    for (const r of rows) if (r.item != null) items.add(Number(r.item));
    offset += rows.length;
    if (rows.length < PAGE || (total != null && offset >= total)) break;
  }
  return items;
}

/** This store's own qsr_menu_items catalog item_numbers, if the table has rows for it. */
async function catalogItemNumbersFromDb(loc) {
  const resp = await sbFetch('qsr_menu_items', { select: 'item_number', loc: `eq.${loc}`, limit: '20000' });
  if (!resp.ok) return null; // table doesn't exist yet, or another error — fall back
  const rows = await resp.json();
  if (!Array.isArray(rows) || !rows.length) return null;
  return new Set(rows.filter(r => r.item_number != null).map(r => Number(r.item_number)));
}

async function main() {
  console.log(`[measure] window: last ${WINDOW_DAYS} days (cutoff ${CUTOFF}), ${STORE_NSNS.length} stores`);
  const fileCatalog = catalogItemNumbersFromCapture(CAPTURE_PATH);
  if (fileCatalog) console.log(`[measure] fallback capture file loaded: ${CAPTURE_PATH} (${fileCatalog.size} unique item_numbers) — used for any store with no qsr_menu_items rows yet AND matching this file's own store`);

  const out = [];
  for (const nsn of STORE_NSNS) {
    const loc = pad7(nsn);
    const active = await activeItemsFor(loc, CUTOFF);
    let catalog = await catalogItemNumbersFromDb(loc);
    let mode = 'db-cross-reference';
    if (!catalog) {
      // Only the capture file's own store (3708) can be cross-referenced this way; for every
      // other store with no qsr_menu_items rows yet, report the proxy count instead of a false
      // cross-reference against a DIFFERENT store's catalog.
      if (fileCatalog && nsn === '3708') { catalog = fileCatalog; mode = 'capture-file-cross-reference'; }
      else { catalog = null; mode = 'proxy (no catalog available for this store yet)'; }
    }
    let inCatalog = active.size, notInCatalog = 0;
    if (catalog) {
      inCatalog = 0; notInCatalog = 0;
      for (const item of active) { if (catalog.has(item)) inCatalog++; else notInCatalog++; }
    }
    out.push({ nsn, loc, activeCount: active.size, catalogSize: catalog ? catalog.size : null, inCatalog, notInCatalog, mode });
    console.log(`  ${loc} (${nsn}): active=${active.size}  catalog=${catalog ? catalog.size : 'n/a'}  in-catalog=${inCatalog}  not-in-catalog=${notInCatalog}  [${mode}]`);
  }

  const sum = out.reduce((s, r) => s + r.inCatalog, 0);
  console.log(`\n[measure] sum of per-store real-activity subset counts: ${sum}`);
  console.log(`[measure] avg per store: ${(sum / out.length).toFixed(1)}`);
  return out;
}

main().catch(e => { console.error('[measure] FATAL', e); process.exit(1); });
