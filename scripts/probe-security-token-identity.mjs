#!/usr/bin/env node
// scripts/probe-security-token-identity.mjs
//
// ONE-VARIABLE PROBE. Isolates whether api.security's 403 is about the TOKEN or the NETWORK.
//
// Everything else about this request is held constant -- same machine, same shell, same headers,
// same body, same moment. Only the token changes:
//
//   A) a token minted by scripts/lib/qsrsoft-auth.mjs's getFreshToken()  (what automation uses)
//   B) a token you paste in, captured from your own browser session       (what is known to work)
//
// Run from the Mac mini, which is where the working curl succeeded, so the network is identical
// to the successful case. If A 403s and B 200s on the same run, the variable is the TOKEN and the
// source-IP conclusion in finding-qsrsoft-security-entitlement-request-2026-08-22.md is wrong.
// If BOTH 200, the earlier 403s were something transient. If BOTH 403, the token is not the
// variable and the network reading survives.
//
// 🔒 Prints NO token values -- only lengths, claim NAMES, and cognito:groups (group names are not
// credentials and are the most likely thing to differ for one `sub`). Never logs the token itself.
//
// Usage:
//   node scripts/probe-security-token-identity.mjs                 # minted token only
//   BROWSER_TOKEN=<paste> node scripts/probe-security-token-identity.mjs   # both, side by side
import { createHash } from 'node:crypto';
import { getFreshToken } from './lib/qsrsoft-auth.mjs';
// The PULL's own request builders. Importing them (rather than copying) means case D exercises
// the exact code the failing pull runs -- if D fails where A succeeds, the difference is inside
// these two functions and nowhere else.
import { buildUrl, buildBody, fetchOne, runSecurityEvents } from './qsrsoft-security-events-pull.mjs';

// Short fingerprint for answering "are these the SAME token?" without printing any part of one.
// A raw tail (last N chars) would also work as a comparator, but this repo's standing rule is
// hashes and lengths only -- and a hash is strictly better: it cannot be reassembled toward the
// real value, and it fingerprints the WHOLE token rather than one end of it.
const fp = t => createHash('sha256').update(t).digest('hex').slice(0, 12);

// WHO the token belongs to, as a comparable hash. `sub` and `cognito:username` identify the
// Cognito principal; hashing them lets a local run and a CI run be compared for "same account?"
// without either printing an identifier. Exported shape is deliberately identical to the one
// scripts/qsrsoft-security-events-pull.mjs logs, so the two lines can be diffed by eye.
export const identityFp = token => {
  try {
    const c = JSON.parse(Buffer.from(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return createHash('sha256').update(`${c.sub || ''}|${c['cognito:username'] || ''}`).digest('hex').slice(0, 12);
  } catch { return '(unparseable)'; }
};

const ORG_ID    = 'a546d4ef-684a-4f25-8bc0-6580af068875';
// ⚠️ Store is a VARIABLE, not a constant. Every successful measurement in this investigation --
// the owner's curl, and every probe run -- used 35064 and ONLY 35064. The pull iterates all 27
// starting at 3708, and 3708 is the store its first failing unit reports. "All 216 failed, so
// 35064 failed too" was an INFERENCE from the run summary, never a direct observation of 35064
// under the pull. Test the store the pull actually starts on:
//     PROBE_STORE=3708 node scripts/probe-security-token-identity.mjs
const STORE_REF = process.env.PROBE_STORE || '35064';
const DATE      = process.env.PROBE_DATE || '2026-08-15';
const URL = `https://api.security.myqsrsoft.com/security/event_details/v1/${ORG_ID}/${STORE_REF}?orgId=${ORG_ID}`;

// Exactly the header set from the curl that returned 200.
const headers = token => ({
  'x-auth-token': token,
  'Content-Type': 'application/json',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Connection': 'keep-alive',
  'Origin': 'https://v3.myqsrsoft.com',
  'Referer': 'https://v3.myqsrsoft.com/reports/mcd/controlsCash/registerAudit',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-site',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
  'sec-ch-ua': '"Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
});

// TWO body shapes, identical in every other respect. This is the comparison that matters:
// the working curl scoped its query to one register and two cashiers; the pull script's
// buildBody() sends EMPTY arrays for both, which plausibly means "all registers / all
// cashiers" -- an unscoped sweep the identity may not be entitled to.
const BODY_SCOPED = {
  event_token: 'all_promo', start_date: DATE, end_date: DATE,
  registers: [13], time_slices: [], cashiers: [2, 0], mgr_code: null,
};
// Exactly what scripts/qsrsoft-security-events-pull.mjs's buildBody() produces.
const BODY_UNSCOPED = {
  event_token: 'all_promo', start_date: DATE, end_date: DATE,
  registers: [], time_slices: [], cashiers: [], mgr_code: null,
};
const BODY = BODY_SCOPED;

// Claim NAMES always; claim VALUES only for cognito:groups (group names, not credentials).
function describe(token) {
  try {
    const claims = JSON.parse(Buffer.from(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    const groups = claims['cognito:groups'];
    return {
      len: token.length,
      claimNames: Object.keys(claims).sort().join(', '),
      groups: Array.isArray(groups) ? groups.join(', ') : (groups ?? '(none)'),
      // exp/iat are timestamps, not secrets -- and token AGE is the thing that has misled this
      // investigation more than once, so surface it explicitly.
      ageSec: claims.iat ? Math.round(Date.now() / 1000 - claims.iat) : null,
      ttlLeftSec: claims.exp ? Math.round(claims.exp - Date.now() / 1000) : null,
    };
  } catch { return { len: token.length, claimNames: '(unparseable)', groups: '?', ageSec: null, ttlLeftSec: null }; }
}

const tokenFps = {};
async function attempt(label, token, body = BODY) {
  const d = describe(token);
  console.log(`\n── ${label} ──`);
  console.log(`   token length : ${d.len}`);
  console.log(`   sha256[0:12] : ${fp(token)}   <-- same value in two rows = literally the same token`);
  console.log(`   IDENTITY     : ${identityFp(token)}   <-- hash of sub + cognito:username; compare against the pull's line`);
  console.log(`   claim NAMES  : ${d.claimNames}`);
  console.log(`   cognito:groups: ${d.groups}`);
  console.log(`   age / ttl    : ${d.ageSec}s old, ${d.ttlLeftSec}s left`);
  const r = await fetch(URL, { method: 'POST', headers: headers(token), body: JSON.stringify(body) });
  console.log(`   store / date : ${STORE_REF} / ${DATE}   body registers=${JSON.stringify(body.registers)} cashiers=${JSON.stringify(body.cashiers)}`);
  const text = await r.text();
  console.log(`   HTTP ${r.status}  x-amzn-errortype=${r.headers.get('x-amzn-errortype') || '(none)'}`);
  if (r.ok) {
    let n = '?'; try { const j = JSON.parse(text); n = Array.isArray(j) ? j.length : 'non-array'; } catch {}
    console.log(`   ✓ ${n} row(s) returned`);       // row COUNT only -- rows carry crew/manager names
  } else {
    console.log(`   ✗ ${text.slice(0, 200)}`);
  }
  return r.status;
}

const results = {};
try {
  const mintedTok = await getFreshToken();
  tokenFps.minted = fp(mintedTok);
  results.minted = await attempt('A) getFreshToken() minted token', mintedTok);
} catch (e) {
  console.log(`\n── A) getFreshToken() minted token ──\n   ✗ mint failed: ${e.message}`);
  results.minted = 'mint-failed';
}

// ── The body-scope comparison: SAME token, same store, same date, same headers. Only the
// registers/cashiers arrays change. This is the one-variable test the runner-vs-probe
// comparison could not be, because that one also varied date and store.
if (results.minted === 200) {
  try {
    const tok = await getFreshToken();
    results.unscoped = await attempt('C) SAME token, UNSCOPED body (what the pull sends)', tok, BODY_UNSCOPED);
  } catch (e) {
    console.log(`\n── C) unscoped body ──\n   ✗ ${e.message}`);
  }
}

// ── CASE D: BISECT. Same token, same headers, same store, same date as case A -- but the URL and
// body come from the PULL's own buildUrl()/buildBody(). A succeeds and the pull fails, so if D
// also fails the difference is in those builders; if D succeeds the difference is in the headers
// or the surrounding fetch, and the builders are exonerated. Either way it halves the search.
if (results.minted === 200) {
  const pullUrl  = buildUrl(STORE_REF);
  const pullBody = buildBody('all_promo', DATE);
  console.log('\n── D) PULL\'s buildUrl() + buildBody(), probe\'s headers ──');
  console.log(`   probe URL : ${URL}`);
  console.log(`   pull  URL : ${pullUrl}`);
  console.log(`   URL match : ${URL === pullUrl ? 'IDENTICAL' : '❗ DIFFERENT'}`);
  console.log(`   probe body: ${JSON.stringify(BODY_UNSCOPED)}`);
  console.log(`   pull  body: ${JSON.stringify(pullBody)}`);
  console.log(`   body match: ${JSON.stringify(BODY_UNSCOPED) === JSON.stringify(pullBody) ? 'IDENTICAL' : '❗ DIFFERENT'}`);
  try {
    const tok = await getFreshToken();
    const r = await fetch(pullUrl, { method: 'POST', headers: headers(tok), body: JSON.stringify(pullBody) });
    const t = await r.text();
    console.log(`   HTTP ${r.status}  x-amzn-errortype=${r.headers.get('x-amzn-errortype') || '(none)'}`);
    if (!r.ok) console.log(`   ✗ ${t.slice(0, 200)}`);
    else { let n='?'; try { const j=JSON.parse(t); n=Array.isArray(j)?j.length:'non-array'; } catch {} console.log(`   ✓ ${n} row(s)`); }
    results.pullBuilders = r.status;
  } catch (e) { console.log(`   ✗ ${e.message}`); }
}

// ── CASE E: the pull's ACTUAL fetchOne(). Not a reconstruction -- the same function, so the same
// header object, the same fetch options, the same everything. Cases A/C/D all rebuild the request
// by hand and all return 200; if E returns 403 then the difference lives in code this file has
// been unable to see by reading, and the header casing ('X-Auth-Token' vs 'x-auth-token') is the
// last textual difference between them.
if (results.minted === 200) {
  console.log('\n── E) the PULL\'s own fetchOne() -- same function, not a copy ──');
  console.log(`   store / date : ${STORE_REF} / ${DATE}`);
  try {
    const tok = await getFreshToken();
    const r = await fetchOne(STORE_REF, 'all_promo', DATE, tok);
    console.log(`   HTTP ${r.status}  x-amzn-errortype=${r.diagHdrs?.['x-amzn-errortype'] || '(none)'}`);
    if (r.ok) {
      const rows = Array.isArray(r.json) ? r.json.length : (r.json ? 'non-array' : '?');
      console.log(`   ✓ ${rows} row(s)`);
    } else {
      console.log(`   ✗ ${(r.rawText || JSON.stringify(r.json) || '').slice(0, 200)}`);
    }
    results.pullFetchOne = r.status;
  } catch (e) { console.log(`   ✗ threw: ${e.message}`); }
}

// ── CASE F: dispatch #91's token-injection test. Case E showed fetchOne() called DIRECTLY
// returns 200 from this shell. But the pull's own COLD, standalone process (a real scheduled or
// workflow_dispatch run of qsrsoft-security-events-pull.mjs by itself) 403s on its very first
// unit. Those are not the same test: Case E calls fetchOne() as one function call; the pull's
// failure comes from running its actual LOOP (runSecurityEvents()) in a process where nothing
// else has run first. This case closes that gap -- same process as Case E (so the token this
// injects is proven-good, per Case A/E's own 200s above), but routed through the pull's REAL
// loop machinery: module-level IDENTITY logging, resolveToken()'s function/string branch, the
// per-unit retry-on-401 gate, everything. The one thing forced constant is the CREDENTIAL --
// runSecurityEvents() normally receives the getFreshToken FUNCTION and mints its own token per
// unit; here it receives the already-obtained STRING instead, so resolveToken() short-circuits
// and returns it unchanged (dispatch #91's "inject the token" instruction, made literal).
//
// Scoped to ONE store/date/event_token -- the pull's own documented first-failing unit (store
// 3708, per #623's commit body) -- not the full 216-unit sweep, since this is a one-variable
// check, not a re-run of the whole pull. tracker is a local stub: runSecurityEvents() only calls
// .fail(unit, message), never .finalize() internally, so nothing more is needed and nothing here
// touches Supabase (no VITE_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY required for this case).
if (results.minted === 200) {
  console.log('\n── F) dispatch #91: the PULL\'s own runSecurityEvents() loop, SAME already-obtained token ──');
  const INJECT_STORE = Number(process.env.PROBE_INJECT_STORE || 3708); // the pull's own first unit, #623
  const INJECT_DATE  = process.env.PROBE_INJECT_DATE || '2026-08-22';  // the exact date #623 measured
  console.log(`   store / date : ${INJECT_STORE} / ${INJECT_DATE}  (the pull's documented first-failing unit)`);
  const failures = [];
  const trackerStub = { fail: (unit, message) => failures.push({ unit, message }) };
  try {
    const injectedTok = await getFreshToken(); // proven-good in this SAME process by Case A/E above
    const { collected, coveredStores } = await runSecurityEvents(
      injectedTok, [INJECT_DATE], trackerStub,
      { stores: [INJECT_STORE], eventTokens: ['all_promo'] },
    );
    const loc = String(INJECT_STORE).padStart(7, '0');
    if (failures.length) {
      results.injectedLoop = 403; // AUTH_FAILED is the only failure shape this loop throws for a 401/403
      console.log(`   ✗ the loop's own tracker recorded a failure: ${failures[0].message}`);
    } else if (coveredStores.has(loc) || collected.length) {
      results.injectedLoop = 200;
      console.log(`   ✓ succeeded through the loop -- ${collected.length} row(s) collected`);
    } else {
      // No failure AND no rows/coverage: a genuine 200-with-zero-rows day. Not the 403 this test
      // is checking for, but also not evidence of success on THIS unit -- say so plainly rather
      // than picking a verdict a bare boolean can't actually support.
      results.injectedLoop = 'empty';
      console.log('   ⚠ no failure recorded, but no rows/coverage either -- ambiguous (a genuine zero-row');
      console.log('     day would look identical to this). Re-run with a date more likely to carry events.');
    }
  } catch (e) {
    console.log(`   ✗ threw: ${e.message}`);
    results.injectedLoop = 'threw';
  }
}

const browserToken = (process.env.BROWSER_TOKEN || '').trim();
if (browserToken) {
  tokenFps.browser = fp(browserToken);
  results.browser = await attempt('B) your browser session token', browserToken);
} else {
  console.log('\n── B) your browser session token ──\n   (skipped -- set BROWSER_TOKEN to compare)');
}

if (results.browser !== undefined && tokenFps.minted && tokenFps.browser) {
  console.log('\n── TOKEN IDENTITY ──');
  console.log(tokenFps.minted === tokenFps.browser
    ? `   Fingerprints MATCH (${tokenFps.minted}) -- the same token was used for both rows, so the`
      + '\n   comparison proves nothing about identity. Re-capture the browser token and re-run.'
    : `   Fingerprints DIFFER (minted ${tokenFps.minted} vs browser ${tokenFps.browser}) -- genuinely`
      + '\n   two different tokens, so any status difference between them is real.');
}

console.log('\n── VERDICT ──');
if (results.pullFetchOne === 403 && results.pullBuilders === 200) {
  console.log('   🎯 The pull\'s fetchOne() is the difference. Its URL and body are provably identical');
  console.log('   (case D, 200) but calling the function itself fails. The remaining delta is inside');
  console.log('   fetchOne: header casing (X-Auth-Token vs x-auth-token) is the only textual one left.');
} else if (results.pullFetchOne === 200) {
  console.log('   ⚠️ The pull\'s OWN fetchOne() returns 200 from here. The script is not the problem:');
  console.log('   every component and the whole function work when run from this shell. What differs');
  console.log('   is the CONTEXT the pull runs in -- sequence, or accumulated state from prior runs.');
  console.log('   Next: run the pull itself after a long quiet period and see if unit #1 succeeds.');
}
if (results.pullBuilders === 403) {
  console.log('   🎯 The PULL\'s buildUrl()/buildBody() are the difference. Same token, same headers,');
  console.log('   same store, same date -- only the URL/body construction changed, and it failed.');
  console.log('   Compare the two URL and body lines printed above; one of them is not what it looks like.');
} else if (results.pullBuilders === 200) {
  console.log('   The pull\'s builders are EXONERATED -- they produce a request that works from here.');
  console.log('   So the difference is in the pull\'s HEADERS or its surrounding fetch, not the URL/body.');
  console.log('   Next: diff the two header objects at the wire level, not by reading the source.');
}
if (results.minted === 200 && results.unscoped === 403) {
  console.log('   🎯 THE BODY IS THE VARIABLE. Same token, same machine, same headers, same date,');
  console.log('   same store -- only registers/cashiers changed. An unscoped sweep (empty arrays)');
  console.log('   is denied; a scoped query is allowed. That is the whole six-dispatch 403, and it');
  console.log('   is a QUERY-SHAPE problem, not auth, not network, not fingerprinting.');
  console.log('   FIX: buildBody() must enumerate registers/cashiers instead of sending [].');
} else if (results.minted === 200 && results.unscoped === 200) {
  console.log('   Body scope is NOT the variable -- both shapes work from here. The runner 403s');
  console.log('   must come from something else (date? store? concurrency?). Do not guess: the');
  console.log('   next probe should vary date and store one at a time.');
}
if (results.injectedLoop === 200) {
  console.log('   🎯 dispatch #91: INJECTED TOKEN SUCCEEDED THROUGH THE LOOP. The token itself was fine --');
  console.log('   something about the pull\'s own request-construction or module state is the variable.');
  console.log('   Look at what differs between this probe\'s call site and the pull\'s cold-process loop:');
  console.log('   module-level imports/side effects are the finding file\'s own lead. Do NOT file a');
  console.log('   QSRSoft support ticket yet -- this points at code/context, not entitlement or network.');
} else if (results.injectedLoop === 403) {
  console.log('   🎯 dispatch #91: STILL 403 WITH AN INJECTED, PROVEN-GOOD TOKEN. The token is not the');
  console.log('   variable -- the difference is below what code-level injection can isolate. Proceed to');
  console.log('   the packet capture (dispatch-91.md\'s test 2): capture this failing call and a Case E');
  console.log('   success back to back and diff them byte-for-byte at the wire level.');
} else if (results.injectedLoop === 'empty' || results.injectedLoop === 'threw') {
  console.log('   ⚠️ dispatch #91: case F was inconclusive this run (see the F) block above for why).');
  console.log('   Re-run -- ideally with PROBE_INJECT_DATE set to a day already confirmed to carry rows.');
}
if (results.browser === undefined) {
  console.log('   Only the minted token was tested. Re-run with BROWSER_TOKEN set to isolate the variable.');
} else if (results.minted === 403 && results.browser === 200) {
  console.log('   TOKEN is the variable. Same machine, same network, same headers -- only the token');
  console.log('   differed. The source-IP conclusion is refuted; this is an identity/entitlement gap.');
} else if (results.minted === 200 && results.browser === 200) {
  console.log('   BOTH work. The earlier 403s were transient or token-age related, not structural.');
} else if (results.minted === 403 && results.browser === 403) {
  console.log('   NEITHER works from here. The token is not the variable -- the network reading survives,');
  console.log('   OR the browser token you pasted has since expired. Re-capture it and re-run before concluding.');
} else {
  console.log(`   Unexpected combination: minted=${results.minted}, browser=${results.browser}. Report both.`);
}
