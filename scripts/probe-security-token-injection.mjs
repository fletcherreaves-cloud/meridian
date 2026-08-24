#!/usr/bin/env node
// scripts/probe-security-token-injection.mjs — dispatch #91, test 1 of 2 (token-injection test).
//
// The unexplained fact this settles: within one process, on one machine, calling fetchOne()
// directly (scripts/probe-security-token-identity.mjs's "case E") returns 200 with real rows.
// Seconds later, the pull's own loop (scripts/qsrsoft-security-events-pull.mjs's
// runSecurityEvents(), via getFreshToken) calling what is by every code-level check the
// identical request returns 403. Twelve other hypotheses are already eliminated -- see
// memory/dispatch-91.md and memory/finding-qsrsoft-security-entitlement-request-2026-08-22.md.
// Do not re-litigate any of them here.
//
// This isolates ONE variable: is the difference the TOKEN, or the CALLER'S CONTEXT (the loop
// itself -- module state, call sequence, whatever a hand-read of the source has not surfaced)?
//
//   1. Mint a token and call fetchOne() directly, once -- reproducing case E in THIS process.
//      If this does not return 200, the environment has drifted since the last measurement and
//      the rest of this probe is not meaningful; it stops here and says so.
//   2. Take that SAME token string -- already proven good, seconds old -- and hand it to
//      runSecurityEvents(), the pull's own unmodified loop, in place of the getFreshToken
//      function it normally receives. resolveToken() inside the loop sees a string, not a
//      function, and returns it unchanged for every unit -- so every request the loop makes
//      uses the exact token that just succeeded in step 1, never a re-mint.
//
// | outcome                              | reading                                              |
// |---------------------------------------|-------------------------------------------------------|
// | step 2 first unit -> 200               | The TOKEN was the variable; the loop's own context is |
// |                                         | fine with a token proven good moments earlier.        |
// | step 2 first unit -> 403 (AccessDenied)| The token is NOT the variable -- injecting a token     |
// |                                         | that just worked still fails inside the loop. The     |
// |                                         | difference is below what this test can isolate;       |
// |                                         | proceed to the packet capture (dispatch #91, test 2). |
//
// Read-only: runSecurityEvents() only collects parsed rows in memory and never calls
// saveSecurityEventRows() / Supabase, matching every other probe script's read-only convention
// in this repo. No token value, sub, eID, cognito:username, or employee name is ever logged --
// runSecurityEvents() already logs unit labels (date:loc:eventToken) and row COUNTS only.
//
// Required env: QSRSOFT_USERNAME, QSRSOFT_PASSWORD (getFreshToken()'s Cognito mint).
// Optional env:
//   QSRSOFT_INJECT_DATE   — YYYY-MM-DD to run the loop against (default: today, UTC)
//   QSRSOFT_INJECT_STORE  — unpadded NSN for the standalone case-E baseline call in step 1
//                           (default: 3708, the pull's own first store — see finding file)
//   QSRSOFT_INJECT_TOKEN  — event_token for the case-E baseline call (default: all_promo,
//                           EVENT_TOKENS[0] — the pull's own first event token)

import { getFreshToken } from './lib/qsrsoft-auth.mjs';
import { fetchOne, buildUrl, dateList, runSecurityEvents, STORE_NSNS } from './qsrsoft-security-events-pull.mjs';
import { storeRefFromLoc, EVENT_TOKENS } from '../src/engine/security-events.js';
import { createHash } from 'node:crypto';

const fmtDate = d => d.toISOString().slice(0, 10);

const STORE_NSN = (process.env.QSRSOFT_INJECT_STORE || '3708').trim();
const EVENT_TOKEN = (process.env.QSRSOFT_INJECT_TOKEN || 'all_promo').trim();
const DATE = (process.env.QSRSOFT_INJECT_DATE || fmtDate(new Date())).trim();

function identityFp(token) {
  try {
    const c = JSON.parse(Buffer.from(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return createHash('sha256').update(`${c.sub || ''}|${c['cognito:username'] || ''}`).digest('hex').slice(0, 12);
  } catch { return '(unparseable)'; }
}

async function main() {
  if (!process.env.QSRSOFT_USERNAME || !process.env.QSRSOFT_PASSWORD) {
    console.error('[inject-probe] Missing QSRSOFT_USERNAME/QSRSOFT_PASSWORD'); process.exit(1);
  }

  console.log(`[inject-probe] store ${STORE_NSN} (storeRef ${storeRefFromLoc(STORE_NSN)}), date ${DATE}, event_token "${EVENT_TOKEN}"`);
  console.log(`[inject-probe] url: ${buildUrl(storeRefFromLoc(STORE_NSN))}`);

  // ── Step 1: reproduce case E in THIS process — mint, then call fetchOne() directly ──────────
  console.log('\n[inject-probe] ── step 1: baseline fetchOne() call, direct (case E) ──────────');
  const baselineToken = await getFreshToken();
  console.log(`[inject-probe] IDENTITY ${identityFp(baselineToken)} — hash of sub + cognito:username`);
  const baseline = await fetchOne(storeRefFromLoc(STORE_NSN), EVENT_TOKEN, DATE, baselineToken);
  console.log(`[inject-probe] baseline → HTTP ${baseline.status}` + (baseline.diagHdrs?.['x-amzn-errortype'] ? ` (${baseline.diagHdrs['x-amzn-errortype']})` : ''));
  if (baseline.ok) {
    const rows = Array.isArray(baseline.json) ? baseline.json.length : (baseline.json ? 'non-array' : '?');
    console.log(`[inject-probe] baseline ✓ ${rows} row(s)`);
  } else {
    console.log(`[inject-probe] baseline ✗ ${(baseline.rawText || JSON.stringify(baseline.json) || '').slice(0, 300)}`);
  }

  if (!baseline.ok) {
    console.log('\n[inject-probe] ── VERDICT ──────────────────────────────────────────────────');
    console.log('[inject-probe] ⚠️ INCONCLUSIVE: the direct fetchOne() baseline (case E) did not');
    console.log('[inject-probe]   reproduce a 200 in this process/run. The prior 200/403 split may');
    console.log('[inject-probe]   itself have changed (token, network, or upstream state) since it was');
    console.log('[inject-probe]   last observed. Do not treat a 403 here as answering test 1 -- there is');
    console.log('[inject-probe]   no proven-good token to inject. Re-run, and if this keeps happening,');
    console.log('[inject-probe]   that is itself a finding: case E is no longer reproducible.');
    process.exit(1);
  }

  // ── Step 2: hand that SAME, seconds-old, already-proven token to the pull's own loop ────────
  console.log('\n[inject-probe] ── step 2: runSecurityEvents() — the pull\'s ACTUAL loop — with the');
  console.log('[inject-probe]    step-1 token INJECTED as a plain string (resolveToken() will return it');
  console.log('[inject-probe]    unchanged for every unit; getFreshToken() is never called again) ──────');
  const dates = dateList(DATE, DATE);
  const totalUnits = dates.length * STORE_NSNS.length * EVENT_TOKENS.length;
  // Track every failed unit's reason, not just row counts -- a 200 with zero promo events that
  // day is a legitimate success and must not be misread as a failure. AUTH_FAILED:<status> is
  // the exact string runSecurityEvents() throws (and the tracker records) on a 401/403; anything
  // else (a parse error, a Supabase-adjacent throw) is a different failure class entirely.
  const failures = [];
  const tracker = { fail(unit, reason) { failures.push({ unit, reason: String(reason) }); } };
  const t0 = Date.now();
  const result = await runSecurityEvents(baselineToken, dates, tracker);
  const authFailures = failures.filter(f => /^AUTH_FAILED:/.test(f.reason));
  console.log(`[inject-probe] loop finished in ${((Date.now() - t0) / 1000).toFixed(1)}s — `
    + `${result.collected.length} row(s) parsed, ${result.coveredStores.size} store(s) with data, `
    + `${failures.length}/${totalUnits} unit(s) failed (${authFailures.length} auth-related)`);
  if (failures.length) {
    console.log(`[inject-probe] first failed unit: ${failures[0].unit} — ${failures[0].reason}`);
  }

  console.log('\n[inject-probe] ── VERDICT ──────────────────────────────────────────────────────');
  if (authFailures.length === 0) {
    console.log('[inject-probe] 🎯 THE TOKEN WAS THE VARIABLE. The injected token — proven good against');
    console.log('[inject-probe]   this exact route seconds earlier — also worked for every unit inside');
    console.log('[inject-probe]   the pull\'s own loop (zero auth failures). Whatever separates a failing');
    console.log('[inject-probe]   scheduled run from a working manual one is upstream of the request (how');
    console.log('[inject-probe]   /where the token that run used was minted or aged), not the loop\'s call');
    console.log('[inject-probe]   site, module state, or sequence.');
  } else if (authFailures.length === totalUnits) {
    console.log('[inject-probe] 🔴 THE TOKEN WAS NOT THE VARIABLE. A token proven good one call earlier,');
    console.log('[inject-probe]   in the SAME process, STILL failed on every unit once handed to the');
    console.log('[inject-probe]   loop. The difference is not the credential and is not visible to');
    console.log('[inject-probe]   code-level injection — proceed to the packet capture (dispatch #91,');
    console.log('[inject-probe]   test 2): capture the step-1 call and a step-2 unit back to back and');
    console.log('[inject-probe]   diff them at the wire level.');
  } else {
    console.log(`[inject-probe] ⚠️ MIXED: ${authFailures.length}/${totalUnits} unit(s) got an auth`);
    console.log('[inject-probe]   failure with the injected token while others succeeded. Report the');
    console.log('[inject-probe]   exact failed unit(s) above rather than a single token-vs-context');
    console.log('[inject-probe]   verdict -- this shape was not anticipated by either predicted outcome');
    console.log('[inject-probe]   and is itself a finding worth its own follow-up.');
  }
}

main().catch(e => { console.error('[inject-probe] FATAL:', e); process.exit(1); });
