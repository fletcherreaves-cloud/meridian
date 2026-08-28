#!/usr/bin/env node
// scripts/qsrsoft-menu-items-pull.mjs — QSRSoft eBOS menu-item CATALOG sync (dispatch #186)
//
// Pulls each store's full menu-item catalog from prod.ebos.qsrsoft.com and upserts it to
// Supabase `qsr_menu_items`, resolving the ID-enumeration gap dispatch #185 hit (no known
// request listed a store's `store_menuitem_id` values — see
// memory/finding-menu-item-id-enumeration-2026-08-28.md). This landed once the owner captured
// the missing request live (memory/dispatch-186.md).
//
// Endpoint (owner-captured 2026-08-28):
//   GET /api/inv/{nsn}/menuitems
//   → [ { "data": 4194793, "value": "1 - Hamburger" }, ... ]   (5,466 rows for store 3708)
//   Same eBOS auth family as scripts/qsrsoft-variance-pull.mjs's ebosGetObj() (X-Auth-Token/
//   X-Current-Nsn) — no new auth path. Response is a JSON ARRAY (unlike raw_detail/raw_info,
//   which return an object), so this uses the array-returning fetch shape.
//
// A SEPARATE SCRIPT + WORKFLOW, not folded into qsrsoft-variance-pull.mjs's daily loop —
// this is catalog/reference data (an item's existence + description), not a daily time
// series, and changes rarely (new/discontinued menu items). Running it daily alongside
// raw_detail/raw_info would be 27x a mostly-unchanged 5,466-row response for no benefit.
// WEEKLY is the cadence (Sundays 11:30 UTC — after the LifeLenz People Skills Sync's similar
// weekly-catalog slot, same reasoning: "changes slowly — weekly is plenty",
// .github/workflows/lifelenz-people-pull.yml). This mirrors that script's shape too: a
// standalone low-cadence sibling with its own workflow, not a flag bolted onto a daily one
// (same call dispatch #185's own "check whether a helper exists before writing one" would
// make — the loop SHAPE fits qsrsoft-variance-pull.mjs's per-store ebosGet() fine, but the
// CADENCE doesn't, and lifelenz-people-pull.mjs is the existing precedent for exactly that
// split).
//
// Every pull is a FULL REPLACE of that store's catalog (delete rows for `loc`, then insert
// the fresh set) — matching scripts/lifelenz-people-pull.mjs's upsertEmployees() precedent —
// so a discontinued item is actually removed, not left stale forever under an upsert-only
// write.
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Auth — shared eBOS ladder (scripts/lib/ebos-auth.mjs), tried in order:
//   QSRSOFT_EBOS_TOKEN → getFreshToken() (SSO exchange) → QSRSOFT_USERNAME/PASSWORD (Playwright)
// Optional:
//   MENUITEMS_STORES=3708,... — subset of NSNs (default: all 27)
//   QSRSOFT_DEBUG=1
//
// Token refresh: v3.myqsrsoft.com → Inventory → Menu Items → DevTools → Network →
//   any prod.ebos.qsrsoft.com/api/inv/ request → copy X-Auth-Token → update QSRSOFT_EBOS_TOKEN.

import { createClient } from '@supabase/supabase-js';
import { withRetry } from './_retry.mjs';
import { makeOutcomeTracker } from './lib/pull-outcome.mjs';
import { EBOS_BASE, resolveEbosToken } from './lib/ebos-auth.mjs';
import { mapMenuItems } from '../src/engine/eom-parsers.js';

const DEBUG = process.env.QSRSOFT_DEBUG === '1';

const STORE_NSNS = (process.env.MENUITEMS_STORES
  ? process.env.MENUITEMS_STORES.split(',').map(s => s.trim())
  : [
    3708, 5183, 5985, 6178, 6838, 6972,
    10034, 10422, 10915, 11657, 13113, 18213,
    20475, 24471, 29760, 31357, 32525, 33109,
    33222, 33704, 34222, 35064, 35242, 37566,
    38609, 43380, 43701,
  ]).map(String);

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fetchMenuItems(token, nsn) {
  const url = `${EBOS_BASE}/api/inv/${nsn}/menuitems`;
  if (DEBUG) console.log('[GET]', url);
  const resp = await fetch(url, {
    headers: {
      'X-Auth-Token': token, 'X-Current-Nsn': String(nsn), 'Accept': 'application/json',
      'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
    },
  });
  if (resp.status === 401 || resp.status === 403) throw new Error(`AUTH_FAILED:${resp.status}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 160)}`);
  const data = await resp.json();
  return Array.isArray(data) ? data : [];
}

// Full-replace, not upsert-only — a discontinued item should actually leave the table, not
// linger under a stale row an upsert-only write would never touch again. The delete+insert is
// NOT wrapped in one transaction (Supabase JS has no cross-statement transaction here); a crash
// between the two would leave that one store's catalog briefly empty until the next weekly run
// re-fills it — acceptable for reference data with no live UI reading it yet (this dispatch is
// pull+storage only).
async function replaceStoreCatalog(loc, rows) {
  const { error: delErr } = await withRetry(
    () => supabase.from('qsr_menu_items').delete().eq('loc', loc),
    { label: 'qsr_menu_items delete' },
  );
  if (delErr) { console.warn(`[qsr_menu_items] delete error for ${loc}:`, delErr.message); return 0; }
  if (!rows.length) return 0;
  const CHUNK = 1000; let saved = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await withRetry(
      () => supabase.from('qsr_menu_items').upsert(chunk, { onConflict: 'loc,store_menuitem_id' }),
      { label: 'qsr_menu_items upsert' },
    );
    if (error) console.warn(`[qsr_menu_items] upsert error for ${loc}:`, error.message);
    else saved += chunk.length;
  }
  return saved;
}

async function main() {
  const token = await resolveEbosToken();
  console.log(`[menu-items-pull] ${STORE_NSNS.length} stores`);

  let totalSaved = 0, storesOk = 0, authFailed = false;
  const tracker = makeOutcomeTracker('menu-items-pull');
  for (const nsn of STORE_NSNS) {
    if (authFailed) break;
    const loc = String(nsn).padStart(7, '0');
    try {
      const raw = await fetchMenuItems(token, nsn);
      const items = mapMenuItems(raw);
      const rows = items.map(it => ({
        loc, store_menuitem_id: it.storeMenuitemId, item_number: it.itemNumber,
        description: it.description, value: it.value,
      }));
      const saved = await replaceStoreCatalog(loc, rows);
      totalSaved += saved;
      storesOk++;
      console.log(`  ${nsn}: ${raw.length} raw · ${items.length} parsed · ${saved} saved`);
    } catch (e) {
      if (e.message.startsWith('AUTH_FAILED')) { authFailed = true; console.error('[menu-items-pull] auth failed — refresh QSRSOFT_EBOS_TOKEN'); break; }
      console.warn(`  ${nsn}: ${e.message}`);
      tracker.fail(nsn, e.message);
    }
  }

  console.log(`[menu-items-pull] ✓ ${storesOk}/${STORE_NSNS.length} stores · ${totalSaved} rows saved`);
  if (authFailed) process.exit(1);
  const code = tracker.finalize({
    requestedUnits: STORE_NSNS, totalSaved,
    formatRerun: failedStores => `MENUITEMS_STORES=${failedStores.join(',')}`,
  });
  if (code) process.exit(code);
}

main().catch(err => { console.error('[menu-items-pull] fatal:', err); process.exit(1); });
