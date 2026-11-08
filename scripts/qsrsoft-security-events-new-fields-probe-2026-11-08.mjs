#!/usr/bin/env node
// scripts/qsrsoft-security-events-new-fields-probe-2026-11-08.mjs — task #131.
//
// Two QSRSoft KB updates the owner shared (2026-11-08):
//   1. "November 4, 2026 - Security" -- a new "General Drawer Open" Security Events category
//      (a drawer open with no other POS event attached). EVENT_TOKENS (src/engine/
//      security-events.js) is a hardcoded list of 8 tokens with nothing matching this -- a real
//      new event_token to discover, not something the existing pull already covers.
//   2. "October 21, 2026 - Security Events" -- POS Overring events (already pulled, event_token
//      'pos_overring') now carry a "Manager Authorization Type" field (manager code / biometrics
//      / unknown). parseSecurityEventRow (src/engine/security-events.js) has no field mapped for
//      this -- a real field gap on an event type already pulled.
//
// Read-only. No writes, no Supabase. Reuses buildUrl/buildBody/fetchOne/extractRows from the
// real production pull script (scripts/qsrsoft-security-events-pull.mjs) rather than
// re-deriving the request shape -- same exact wire format the daily pull already sends.
//
// Required env: QSRSOFT_USERNAME, QSRSOFT_PASSWORD.
// Optional env:
//   QSRSOFT_PROBE_STORE_REF — unpadded NSN to probe (default: 29760, Duncan-Hwy 81 -- an
//                             already-confirmed-valid storeRef per the dispatch #58 probe)
//   QSRSOFT_PROBE_DATE      — YYYY-MM-DD (default: 7 days ago, almost certainly closed)
//   QSRSOFT_PROBE_CANDIDATE_TOKENS — comma-separated extra event_token candidates to also try,
//                             on top of this script's own built-in guesses

import { getFreshToken } from './lib/qsrsoft-auth.mjs';
import { fetchOne, extractRows } from './qsrsoft-security-events-pull.mjs';

const STORE_REF = (process.env.QSRSOFT_PROBE_STORE_REF || '29760').trim();
const DATE = (() => {
  const explicit = (process.env.QSRSOFT_PROBE_DATE || '').trim();
  if (explicit) return explicit;
  const d = new Date(); d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
})();

// The 8 real tokens' own naming convention (snake_case, terse) is the only guide available --
// these are GUESSES to be TESTED against the live API, not an asserted answer. A wrong one just
// comes back empty/erroring; that's a real, informative measurement, not a harmful side effect.
const BUILTIN_CANDIDATES = [
  'general_drawer_open', 'drawer_open', 'no_sale_drawer_open', 'unauthorized_drawer_open',
  'drawer_open_no_event', 'drawer_open_unattached',
];
const EXTRA_CANDIDATES = (process.env.QSRSOFT_PROBE_CANDIDATE_TOKENS || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const CANDIDATE_TOKENS = [...new Set([...BUILTIN_CANDIDATES, ...EXTRA_CANDIDATES])];

// Fields parseSecurityEventRow (src/engine/security-events.js) already maps from a raw row --
// used only to point out which raw keys are NEW, not to filter/transform anything here.
const KNOWN_RAW_KEYS = new Set([
  'event_token', 'event_dt', 'event_tm', 'reg_num', 'order_key', 'event_name', 'event_display',
  'event_amt', 'remaining_amt', 'tender_type', 'daypart_name', 'store_busn_dt', 'crew', 'mgr',
  'mgr_code', 'pos_session_start_dt', 'pos_session_start_tm',
]);

async function main() {
  console.log(`[probe] store_ref=${STORE_REF} date=${DATE}`);
  const token = await getFreshToken();

  // ── Part 1: pos_overring -- already-pulled token, checking for a NEW raw field (the manager
  // authorization type the owner's screenshot shows: manager code / biometrics / unknown). ────
  console.log('\n=== Part 1: pos_overring -- looking for a new "manager authorization type" field ===');
  const posResp = await fetchOne(STORE_REF, 'pos_overring', DATE, token);
  console.log(`[probe] pos_overring -> HTTP ${posResp.status} (ok=${posResp.ok})`);
  if (Object.keys(posResp.diagHdrs || {}).length) console.log('[probe] diag headers:', posResp.diagHdrs);
  if (!posResp.json) console.log('[probe] non-JSON body (first 400 chars):', posResp.rawText);
  const posRows = posResp.json ? extractRows(posResp.json, `${STORE_REF}:pos_overring:${DATE}`) : [];
  console.log(`[probe] pos_overring row count: ${posRows.length}`);
  if (posRows.length) {
    const allKeys = new Set();
    for (const r of posRows) for (const k of Object.keys(r || {})) allKeys.add(k);
    const newKeys = [...allKeys].filter(k => !KNOWN_RAW_KEYS.has(k)).sort();
    console.log('[probe] ALL raw keys seen:', [...allKeys].sort().join(', '));
    console.log(newKeys.length
      ? `[probe] 🎯 NEW keys not in parseSecurityEventRow's known set: ${newKeys.join(', ')}`
      : '[probe] No keys beyond the already-mapped set -- either no override rows in this window, or the field lives inside an existing key (e.g. embedded in event_display/event_name text). Re-run against a date/store with known POS-override activity if this is empty.');
    console.log('[probe] Sample row (first):', JSON.stringify(posRows[0], null, 2));
  } else {
    console.log('[probe] Zero rows -- try a different store/date with known POS-override activity (QSRSOFT_PROBE_STORE_REF / QSRSOFT_PROBE_DATE).');
  }

  // ── Part 2: candidate event_token strings for the new "General Drawer Open" category. ──────
  console.log('\n=== Part 2: candidate event_token strings for "General Drawer Open" ===');
  for (const tok of CANDIDATE_TOKENS) {
    try {
      const resp = await fetchOne(STORE_REF, tok, DATE, token);
      const rows = resp.json ? extractRows(resp.json, `${STORE_REF}:${tok}:${DATE}`) : [];
      const bodyNote = resp.json ? '' : ` | non-JSON: ${(resp.rawText || '').slice(0, 120)}`;
      console.log(`[probe] event_token="${tok}" -> HTTP ${resp.status} rows=${rows.length}` +
        (rows.length ? ` | sample keys: ${Object.keys(rows[0] || {}).join(',')}` : '') + bodyNote);
    } catch (e) {
      console.log(`[probe] event_token="${tok}" -> ERROR: ${e.message}`);
    }
  }
  console.log('\n[probe] Done. A candidate token that returns rows (or a distinct non-empty-but-'+
    'zero-row response, as opposed to a 4xx rejection) is worth treating as real; a 4xx/invalid-'+
    'token-style rejection means that guess was wrong -- try another or inspect the real QSRSoft '+
    'Security Events page\'s own network request when filtering by "General Drawer Open" for the '+
    'authoritative token string.');
}

main().catch(e => { console.error('[probe] FATAL:', e.stack || e.message); process.exit(1); });
