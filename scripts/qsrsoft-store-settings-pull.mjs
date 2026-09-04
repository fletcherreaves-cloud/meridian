#!/usr/bin/env node
// scripts/qsrsoft-store-settings-pull.mjs
// QSRSoft Store Settings — per-store config distinct from storewide_controls (qsr_store_controls,
// scripts/qsrsoft-store-controls-pull.mjs): drawer/safe/instore cash-handling config (starting
// drawer bank, safe backup/petty cash, storewide/drawer max cash, deposit validation requirements,
// max drawer over/short), plus inventory settings (yield groups, waste hard/soft limits, EOM
// windows), homepage-metric thresholds, and full per-channel/per-day-of-week store hours + dayparts.
// Owner-captured live 2026-09-04 while hunting cash-control automation leads
// (memory/project-qsrsoft-store-settings-endpoint.md has the full endpoint intel + open caveats).
//
//   GET https://prod-green.ebos.qsrsoft.com/store_settings/{nsn}/settings?store_busn_dt=YYYY-MM-DD
//   -> { drawer, safe, instore, inventory, fdc_state, homepageMetrics, misc, storeConfig }
//
// Two things distinguish this from every other eBOS pull, both UNVERIFIED in this environment
// (no QSRSoft credentials reach this sandbox -- see the memory file's verification-caveat section):
//   1. Different HOST than the shared EBOS_BASE (prod-green.ebos.qsrsoft.com, not prod.ebos.qsrsoft.com)
//      and no /api/ path prefix. Presumed same eBOS token family (same SSO/Cognito auth), but that
//      is an assumption, not a measurement -- resolveEbosToken() is reused as-is, and an
//      AUTH_FAILED here is exactly as diagnosable as any other eBOS pull's.
//   2. The captured request's own Origin/Referer was https://prod.ebos.qsrsoft.com (NOT
//      v3.myqsrsoft.com, unlike every other eBOS pull) -- honored exactly as captured rather than
//      copied from the other scripts, since a same-site fetch can be origin-sensitive.
//   3. store_busn_dt: the capture used a stale date (2016-09-28) that was almost certainly just
//      whatever was in the browser's date picker, not a load-bearing value. Defaults here to
//      TODAY (UTC) on the reasoning that this is a current-config snapshot, not a report -- if the
//      endpoint actually returns date-specific historical settings, this default is wrong and will
//      need correcting once someone can observe real behavior (STORESET_BUSN_DATE overrides it).
//
// A CONFIG object, not a metric -- one request per store, pulled weekly like qsr_store_controls
// (config changes rarely). Stored as a raw JSONB blob (same discipline as qsr_store_controls: this
// capture is one live response, not an inventoried complete shape -- hand-picking DB columns risks
// silently dropping fields nobody has looked at). extractCashSettings() (src/engine/store-settings.js)
// pulls out just the drawer/safe/instore cash-handling slice for the current stated interest
// (owner: "cash-control automation") without losing anything from the raw blob.
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Auth -- shared eBOS ladder (scripts/lib/ebos-auth.mjs): QSRSOFT_EBOS_TOKEN -> getFreshToken()
//   (SSO exchange) -> QSRSOFT_USERNAME/PASSWORD (Playwright), same as every other eBOS pull.
// Optional: SETTINGS_STORES=3708,... (subset of NSNs, default: all 27), STORESET_BUSN_DATE
//   (override the store_busn_dt param, default: today UTC), QSRSOFT_DEBUG=1.

import { safeCreateClient } from './lib/safe-supabase-client.mjs';
import { withRetry } from './_retry.mjs';
import { makeOutcomeTracker } from './lib/pull-outcome.mjs';
import { resolveEbosToken } from './lib/ebos-auth.mjs';
import { extractCashSettings } from '../src/engine/store-settings.js';

const DEBUG = process.env.QSRSOFT_DEBUG === '1';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';
const SETTINGS_BASE = 'https://prod-green.ebos.qsrsoft.com';

const STORE_NSNS = (process.env.SETTINGS_STORES
  ? process.env.SETTINGS_STORES.split(',').map(s => s.trim())
  : [
    3708, 5183, 5985, 6178, 6838, 6972,
    10034, 10422, 10915, 11657, 13113, 18213,
    20475, 24471, 29760, 31357, 32525, 33109,
    33222, 33704, 34222, 35064, 35242, 37566,
    38609, 43380, 43701,
  ]).map(String);

const pad7 = n => String(n).padStart(7, '0');
const pad2 = n => String(n).padStart(2, '0');
const todayUtc = () => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
};
const BUSN_DATE = process.env.STORESET_BUSN_DATE || todayUtc();

// Guarded, not unconditional -- see scripts/lib/safe-supabase-client.mjs's own comment (2026-08-30
// CI failure root-caused there): a truthy-but-dummy env value stubbed by an unrelated test file can
// reach an unconditional createClient() and crash Node 20's Realtime sub-client setup even with fake
// credentials. This script has no test file yet, but starting from the safe pattern costs nothing.
const supabase = safeCreateClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function getStoreSettings(token, nsn) {
  const url = `${SETTINGS_BASE}/store_settings/${nsn}/settings?store_busn_dt=${BUSN_DATE}`;
  if (DEBUG) console.log('[GET]', url);
  const resp = await fetch(url, {
    headers: {
      'X-Auth-Token': token, 'X-Current-Nsn': String(nsn), 'X-User-Language': 'en',
      'Accept': '*/*', 'Origin': 'https://prod.ebos.qsrsoft.com', 'Referer': 'https://prod.ebos.qsrsoft.com/',
      'User-Agent': UA,
    },
  });
  if (resp.status === 401 || resp.status === 403) throw new Error(`AUTH_FAILED:${resp.status}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 160)}`);
  return resp.json();
}

async function upsert(row) {
  const { error } = await withRetry(
    () => supabase.from('qsr_store_settings').upsert(row, { onConflict: 'loc' }),
    { label: 'qsr_store_settings upsert' },
  );
  if (error) { console.warn('[store-settings] upsert error:', error.message); return false; }
  return true;
}

async function main() {
  const token = await resolveEbosToken();
  console.log(`[store-settings] pulling ${STORE_NSNS.length} store(s) as of ${BUSN_DATE}…`);

  let saved = 0, authFailed = false;
  const tracker = makeOutcomeTracker('store-settings');
  for (const nsn of STORE_NSNS) {
    if (authFailed) break;
    const loc = pad7(nsn);
    try {
      const settings = await getStoreSettings(token, nsn);
      const cash = extractCashSettings(settings);
      const ok = await upsert({ loc, settings, cash, store_busn_dt: BUSN_DATE });
      if (ok) { saved++; console.log(`  ${nsn}: saved (${Object.keys(settings || {}).length} top-level key(s))`); }
      else tracker.fail(nsn, 'upsert failed');
    } catch (e) {
      if (String(e.message).startsWith('AUTH_FAILED')) { authFailed = true; console.error('[store-settings] auth failed — refresh QSRSOFT_EBOS_TOKEN'); break; }
      console.warn(`  ${nsn}: ${e.message}`);
      tracker.fail(nsn, e.message);
    }
  }

  console.log(`[store-settings] ✓ ${saved}/${STORE_NSNS.length} store(s) saved`);
  if (authFailed) process.exit(1);

  const code = tracker.finalize({
    requestedUnits: STORE_NSNS, totalSaved: saved,
    formatRerun: failedStores => `SETTINGS_STORES=${failedStores.join(',')}`,
  });
  if (code) process.exit(code);
}

main().catch(err => { console.error('[store-settings] fatal:', err); process.exit(1); });
