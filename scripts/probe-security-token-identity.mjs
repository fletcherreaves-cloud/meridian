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
import { getFreshToken } from './lib/qsrsoft-auth.mjs';

const ORG_ID    = 'a546d4ef-684a-4f25-8bc0-6580af068875';
const STORE_REF = '35064';                 // the store the working curl used
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

async function attempt(label, token, body = BODY) {
  const d = describe(token);
  console.log(`\n── ${label} ──`);
  console.log(`   token length : ${d.len}`);
  console.log(`   claim NAMES  : ${d.claimNames}`);
  console.log(`   cognito:groups: ${d.groups}`);
  console.log(`   age / ttl    : ${d.ageSec}s old, ${d.ttlLeftSec}s left`);
  const r = await fetch(URL, { method: 'POST', headers: headers(token), body: JSON.stringify(body) });
  console.log(`   body scope   : registers=${JSON.stringify(body.registers)} cashiers=${JSON.stringify(body.cashiers)}`);
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
  results.minted = await attempt('A) getFreshToken() minted token', await getFreshToken());
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

const browserToken = (process.env.BROWSER_TOKEN || '').trim();
if (browserToken) {
  results.browser = await attempt('B) your browser session token', browserToken);
} else {
  console.log('\n── B) your browser session token ──\n   (skipped -- set BROWSER_TOKEN to compare)');
}

console.log('\n── VERDICT ──');
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
