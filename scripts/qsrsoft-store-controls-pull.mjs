#!/usr/bin/env node
// scripts/qsrsoft-store-controls-pull.mjs
// QSRSoft Storewide Controls — per-store config: loss-prevention thresholds (T-Red/HALO/skim/
// cash), discount %s, tax tables, daypart windows, and user-defined metric targets. Discovered
// 2026-07-26 (memory/project-qsrsoft-controls-endpoint.md), never built until now. Full endpoint
// intel and the candidate downstream uses (feed real thresholds into Signals' Controls registry,
// auto-configure DEFAULT_TARGETS instead of hard-coding, wire discount %s into FOB) are in that
// file; read it before deciding what to do with the pulled config.
//
//   GET https://prod.ebos.qsrsoft.com/api/controls/{nsn}/storewide_controls
//   -> a rich JSON config object (RFMControls, VarianceControls, CashControls,
//      UserDefinedMetrics, SafeCountControls, DrawerBanks, SpareDrawers, DepositSettings,
//      active_taxes, daypart windows, store_busn_dt, timezone, ...)
//
// Per-store (nsn in path, not a comma-list endpoint) -- one request per store, 27 total. A
// CONFIG object, not a metric -- pulled weekly, not daily; config changes rarely.
//
// Stored as a raw JSONB blob (see supabase/schema-qsr-store-controls.sql's own header for why:
// the memory finding curated a list of valuable fields from one live response, not the endpoint's
// complete shape -- hand-picking columns now risks silently dropping fields nobody has inventoried
// yet). Current-state: one row per store, overwritten on each pull, no date dimension.
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Auth -- shared eBOS ladder (scripts/lib/ebos-auth.mjs): QSRSOFT_EBOS_TOKEN -> getFreshToken()
//   (SSO exchange) -> QSRSOFT_USERNAME/PASSWORD (Playwright), same as the recipe/inventory-history
//   eBOS pulls.
// Optional: CONTROLS_STORES=3708,... (subset of NSNs, default: all 27), QSRSOFT_DEBUG=1.

import { createClient } from '@supabase/supabase-js';
import { withRetry } from './_retry.mjs';
import { makeOutcomeTracker } from './lib/pull-outcome.mjs';
import { EBOS_BASE, resolveEbosToken } from './lib/ebos-auth.mjs';

const DEBUG = process.env.QSRSOFT_DEBUG === '1';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';

const STORE_NSNS = (process.env.CONTROLS_STORES
  ? process.env.CONTROLS_STORES.split(',').map(s => s.trim())
  : [
    3708, 5183, 5985, 6178, 6838, 6972,
    10034, 10422, 10915, 11657, 13113, 18213,
    20475, 24471, 29760, 31357, 32525, 33109,
    33222, 33704, 34222, 35064, 35242, 37566,
    38609, 43380, 43701,
  ]).map(String);

const pad7 = n => String(n).padStart(7, '0');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function getStorewideControls(token, nsn) {
  const url = `${EBOS_BASE}/api/controls/${nsn}/storewide_controls`;
  if (DEBUG) console.log('[GET]', url);
  const resp = await fetch(url, {
    headers: { 'X-Auth-Token': token, 'X-Current-Nsn': String(nsn), 'Accept': 'application/json', 'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/', 'User-Agent': UA },
  });
  if (resp.status === 401 || resp.status === 403) throw new Error(`AUTH_FAILED:${resp.status}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 160)}`);
  return resp.json();
}

async function upsert(row) {
  const { error } = await withRetry(
    () => supabase.from('qsr_store_controls').upsert(row, { onConflict: 'loc' }),
    { label: 'qsr_store_controls upsert' },
  );
  if (error) { console.warn('[store-controls] upsert error:', error.message); return false; }
  return true;
}

async function main() {
  const token = await resolveEbosToken();
  console.log(`[store-controls] pulling ${STORE_NSNS.length} store(s)…`);

  let saved = 0, authFailed = false;
  const tracker = makeOutcomeTracker('store-controls');
  for (const nsn of STORE_NSNS) {
    if (authFailed) break;
    const loc = pad7(nsn);
    try {
      const config = await getStorewideControls(token, nsn);
      const ok = await upsert({ loc, config });
      if (ok) { saved++; console.log(`  ${nsn}: saved (${Object.keys(config || {}).length} top-level key(s))`); }
      else tracker.fail(nsn, 'upsert failed');
    } catch (e) {
      if (String(e.message).startsWith('AUTH_FAILED')) { authFailed = true; console.error('[store-controls] auth failed — refresh QSRSOFT_EBOS_TOKEN'); break; }
      console.warn(`  ${nsn}: ${e.message}`);
      tracker.fail(nsn, e.message);
    }
  }

  console.log(`[store-controls] ✓ ${saved}/${STORE_NSNS.length} store(s) saved`);
  if (authFailed) process.exit(1);

  const code = tracker.finalize({
    requestedUnits: STORE_NSNS, totalSaved: saved,
    formatRerun: failedStores => `CONTROLS_STORES=${failedStores.join(',')}`,
  });
  if (code) process.exit(code);
}

main().catch(err => { console.error('[store-controls] fatal:', err); process.exit(1); });
