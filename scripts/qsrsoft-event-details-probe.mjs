#!/usr/bin/env node
// scripts/qsrsoft-event-details-probe.mjs — dispatch #58: settle the empty-registers/cashiers
// question BEFORE any daily pull script is written.
//
// Every event_details capture to date came from clicking one Register Audit drill-down cell, so
// every captured body carries POPULATED `registers`/`cashiers` arrays. Nobody has tested what an
// empty array does:
//   - If `"registers":[]`/`"cashiers":[]` mean "all", the daily pull is 27 stores x 8 tokens —
//     chunky but routine.
//   - If they are REQUIRED filters, every register and every cashier per store per day must be
//     enumerated first, multiplying the call count by orders of magnitude and probably making a
//     daily estate-wide pull impractical.
//
// This script settles it with one comparison: the SAME store/date/token, once with the known-
// populated registers/cashiers (from the finding file's own capture) and once with empty arrays.
// If the empty-array call returns a SUPERSET of the populated one, empty means "all" -- the pull
// is cheap. If it returns fewer rows (especially zero), the arrays are required filters -- the
// pull needs a redesign, not a straightforward daily loop.
//
// Read-only. No writes, no Supabase. See memory/dispatch-58.md for the full scoping and
// memory/finding-qsrsoft-event-details-endpoint-2026-08-21.md for the endpoint's field-level
// capture this probe is built from.
//
// Required env: QSRSOFT_USERNAME, QSRSOFT_PASSWORD (getFreshToken() mints a Cognito ID token
// directly -- no Playwright needed; the endpoint is already confirmed token-only, no cookie).
// Optional env:
//   QSRSOFT_EVENT_PROBE_STORE_REF   — unpadded NSN to probe (default: 29760, Duncan-Hwy 81 --
//                                     already confirmed as a valid storeRef in the finding file)
//   QSRSOFT_EVENT_PROBE_DATE        — YYYY-MM-DD (default: 7 days ago, a day almost certainly closed)
//   QSRSOFT_EVENT_PROBE_TOKEN       — one event_token to probe (default: all_promo)
//   QSRSOFT_EVENT_PROBE_REGISTERS   — comma-separated register numbers for the "populated" call
//                                     (default: 13, matching the finding file's own capture)
//   QSRSOFT_EVENT_PROBE_CASHIERS    — comma-separated cashier badges for the "populated" call
//                                     (default: 91,0, matching the finding file's own capture)

import { getFreshToken } from './lib/qsrsoft-auth.mjs';
import { createHash } from 'node:crypto';

const BASE = 'https://api.security.myqsrsoft.com';
const ORG_ID = 'a546d4ef-684a-4f25-8bc0-6580af068875';
const REPORT_PAGE = 'https://v3.myqsrsoft.com/reports/mcd/controlsCash/registerAudit';

const STORE_REF = (process.env.QSRSOFT_EVENT_PROBE_STORE_REF || '29760').trim();
const TOKEN_NAME = (process.env.QSRSOFT_EVENT_PROBE_TOKEN || 'all_promo').trim();
const REGISTERS = (process.env.QSRSOFT_EVENT_PROBE_REGISTERS || '13').split(',').map(s => Number(s.trim())).filter(Number.isFinite);
const CASHIERS = (process.env.QSRSOFT_EVENT_PROBE_CASHIERS || '91,0').split(',').map(s => Number(s.trim())).filter(Number.isFinite);

function probeDate() {
  const explicit = (process.env.QSRSOFT_EVENT_PROBE_DATE || '').trim();
  if (explicit) return explicit;
  const d = new Date(); d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

const HDRS = t => ({
  'X-Auth-Token': t, 'Content-Type': 'application/json', 'Accept': '*/*',
  'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/reports/mcd/controlsCash/registerAudit',
});

async function callEventDetails(token, body) {
  const url = `${BASE}/security/event_details/v1/${ORG_ID}/${STORE_REF}?orgId=${ORG_ID}`;
  const resp = await fetch(url, { method: 'POST', headers: HDRS(token), body: JSON.stringify(body) });
  const text = await resp.text();
  let rows = null;
  try { const parsed = JSON.parse(text); rows = Array.isArray(parsed) ? parsed : (parsed?.result || parsed?.data || null); } catch { /* non-JSON */ }
  return { status: resp.status, ok: resp.ok, rowCount: Array.isArray(rows) ? rows.length : null, snippet: text.slice(0, 300) };
}

// ── Auth discrimination (added after the 2026-08-22 run returned 403 on BOTH calls) ────────────
// The 403 body was {"Message":"User is not authorized to access this resource with an explicit
// deny in an identity-based policy"} -- AWS IAM for "credential accepted, principal DENIED", not
// "invalid token". Two candidate causes, and the probe could not tell them apart:
//   (a) api.security expects a DIFFERENT token than api.reports (different authorizer/audience);
//   (b) QSRSOFT_USERNAME lacks the security-module entitlement the owner's login has.
// These two checks separate them without anyone pasting a token anywhere.
//
// 🔴 NEVER log the token itself, or any claim VALUE that could identify a person. Claim NAMES,
// and the handful of structural claims below, only. sha256(value).slice(0,12) lets two tokens'
// `sub`/`eID` be compared for EQUALITY (same principal or not) without the hash itself being
// reversible to the value -- dispatch #63's own privacy bar (Task 2), done without needing the
// owner to run anything: this script now holds two tokens itself (the bare getFreshToken() one
// and, when Task 1 succeeds, the Playwright-SRP one) and can compare them directly.
const shortHash = v => v == null ? null : createHash('sha256').update(String(v)).digest('hex').slice(0, 12);

function describeToken(token) {
  try {
    const [, payload] = token.split('.');
    const claims = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    // Entitlement claims are the diagnostic ones and are NOT person-identifying. Deliberately
    // excluded as raw values below: eID, valid_eID, cognito:username, email, custom:authorName,
    // sub, jti -- sub/eID are surfaced ONLY as sha256 prefixes + lengths, never as themselves.
    const SAFE = ['aud', 'iss', 'token_use', 'exp', 'iat', 'auth_time', 'cognito:groups', 'scope',
                  'permissionsAccess', 'orgAdmin', 'lastOrgId'];
    const shown = {};
    for (const k of SAFE) if (claims[k] !== undefined) shown[k] = claims[k];
    return {
      shown, allClaimNames: Object.keys(claims).sort(),
      subHash: shortHash(claims.sub), eIDHash: shortHash(claims.eID),
      eIDLen: claims.eID != null ? String(claims.eID).length : null,
      validEID: claims.valid_eID,
    };
  } catch (e) { return { error: e.message }; }
}

// Does the SAME token work against the host we KNOW works? If reports says 200 and security says
// 403, the credential itself is fine and the difference is the resource/principal -- which is the
// whole question. regAudit is chosen because it is a known-good, already-shipped call path.
// ⚠️ CORRECTED 2026-08-22. The first version of this control sent the ID token to
// api.reports/reports/mcd/controlsCash/regAudit and read its 403 as "the credential is bad".
// That was an INVALID control: qsrsoft-register-audit-pull.mjs:297-303 deliberately sends NO
// X-Auth-Token to that route, with a comment saying a token is the likely CAUSE of a 403 there.
// The control reproduced a documented behaviour and mis-read it as a credential failure.
//
// The genuinely known-good control is /data_layer/v1/service/statistics, which
// qsrsoft-ops-pull.mjs:101 calls WITH the ID token, on a schedule, successfully.
async function callKnownGoodWithToken(token) {
  const params = new URLSearchParams({
    nsn: STORE_REF, orgId: ORG_ID, catalogType: 'serviceStats', enterprise: 'mcd',
    startDate: probeDate(), endDate: probeDate(), nsd: 'd', dsd: 's', weekStart: '3',
    compType: 'calendar', timeSegment: 'openClose', segmentBy: 'summary',
    segmentNames: 'timeSlice', segmentsSelected: 'open-close', selectCols: 'dtTrans',
  });
  const url = `https://api.reports.myqsrsoft.com/data_layer/v1/service/statistics?${params}`;
  try {
    const resp = await fetch(url, { headers: {
      'X-Auth-Token': token, 'Accept': 'application/json',
      'Origin': 'https://v3.myqsrsoft.com',
      'Referer': 'https://v3.myqsrsoft.com/reports/mcd/shift/operationsReport',
    } });
    return { status: resp.status, ok: resp.ok, snippet: (await resp.text()).slice(0, 160) };
  } catch (e) { return { status: 0, ok: false, snippet: `fetch failed: ${e.message}` }; }
}

// token_use is "id" and there is no `scope` claim -- an ID token. AWS API Gateway JWT authorizers
// commonly expect an ACCESS token instead. Cognito's InitiateAuth returns both; getFreshToken()
// keeps only the IdToken, so mint once more here and try the access token against the security
// host. Cheap, and it separates "wrong token TYPE" from "insufficient entitlement".
async function mintAccessToken() {
  const u = process.env.QSRSOFT_USERNAME, pw = process.env.QSRSOFT_PASSWORD;
  const CLIENT_ID = process.env.QSRSOFT_COGNITO_CLIENT_ID || '2vt4qrqcakbeo9sh0ivli3lbui';
  if (!u || !pw) return null;
  try {
    const resp = await fetch('https://cognito-idp.us-east-1.amazonaws.com/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth' },
      body: JSON.stringify({ AuthFlow: 'USER_PASSWORD_AUTH', ClientId: CLIENT_ID, AuthParameters: { USERNAME: u, PASSWORD: pw } }),
    });
    const body = await resp.json();
    return body?.AuthenticationResult?.AccessToken || null;
  } catch { return null; }
}

// ── Task 2: one-request discriminator ────────────────────────────────────────────────────────
// video_provider is the route the owner's browser gets a 200 from, in the SAME api.security
// module as event_details. Sending our own token here splits the remaining hypothesis space in
// half for the cost of one request:
//   200 → our principal is fine on api.security generally; the denial is SCOPED to event_details
//         (a route-level entitlement, not an account-wide one).
//   403 → our principal is denied across the whole security module; more likely fixed by Task 1
//         (a flow difference) than by anything scoped to this one route.
async function callVideoProvider(token) {
  const url = `${BASE}/security/video_provider/${STORE_REF}?orgId=${ORG_ID}`;
  try {
    const resp = await fetch(url, { method: 'POST', headers: HDRS(token), body: JSON.stringify({}) });
    return { status: resp.status, ok: resp.ok, snippet: (await resp.text()).slice(0, 200) };
  } catch (e) { return { status: 0, ok: false, snippet: `fetch failed: ${e.message}` }; }
}

// ── Task 1: retry with the token the real SPA mints via USER_SRP_AUTH ───────────────────────────
// getFreshToken() mints via a bare Cognito USER_PASSWORD_AUTH grant (#312's deliberate choice --
// SRP was never exercised there). Amplify's Auth.signIn (what the actual v3.myqsrsoft.com SPA
// runs) defaults to USER_SRP_AUTH. Same user, same app client, genuinely different flow -- and a
// pre-token-generation Lambda can see which flow produced the request. This logs in through the
// real SPA with Playwright (thereby going through SRP, the same as the owner's own browser) and
// captures whatever x-auth-token the app itself attaches to its own subsequent requests, then
// hands that token back for main() to retry event_details with.
//
// Broadened beyond qsrsoft-register-audit-pull.mjs's own viaPlaywright() listener (which filters
// to api.reports.myqsrsoft.com only): here we want ANY x-auth-token the SPA mints, on ANY host,
// since the goal is the credential itself, not a specific endpoint's response.
async function capturePlaywrightSRPToken() {
  const u = process.env.QSRSOFT_USERNAME, pw = process.env.QSRSOFT_PASSWORD;
  if (!u || !pw) { console.log('[task1] no QSRSOFT_USERNAME/PASSWORD -- cannot drive the real SPA login'); return null; }
  const { chromium } = await import('playwright');
  const { mkdirSync } = await import('fs');
  try { mkdirSync('screenshots', { recursive: true }); } catch {}
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  page.setDefaultTimeout(180000);
  let token = null;
  const seenHosts = new Set();
  page.on('request', async req => {
    try {
      const all = await req.allHeaders(); // allHeaders() is async+COMPLETE; headers() can be provisional
      const t = all['x-auth-token'];
      if (t) seenHosts.add(new URL(req.url()).host);
      if (t && t.length > 20 && !token) token = t;
    } catch { /* request may have been torn down; not diagnostic, ignore */ }
  });
  const snap = name => page.screenshot({ path: `screenshots/${name}`, fullPage: true }).catch(() => {});
  try {
    await page.goto('https://v3.myqsrsoft.com', { waitUntil: 'networkidle', timeout: 45000 });
    const userSel = ['input[name="username"]', 'input[name="email"]', 'input[type="email"]', '#username', '#email', 'input[autocomplete="username"]'].join(', ');
    await page.waitForSelector(userSel, { timeout: 20000 });
    await page.fill(userSel, u);
    await page.fill('input[type="password"], input[name="password"]', pw);
    await page.click('button[type="submit"], input[type="submit"], .btn-primary, button:has-text("Login"), button:has-text("Sign in")');
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    console.log('[task1] post-login url:', page.url());
    await snap('event-probe-01-post-login.png');

    // Navigate to a page that is known to fire an api.*-bound request (regAudit, per
    // qsrsoft-register-audit-pull.mjs's own confirmed navigation), to maximize the chance an
    // x-auth-token-bearing request fires even if login itself didn't produce one.
    await page.goto(REPORT_PAGE, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 5000));
    console.log('[task1] report page url:', page.url(), '| token captured:', !!token,
      '| hosts that carried x-auth-token:', seenHosts.size ? [...seenHosts].join(', ') : '(none)');
    await snap('event-probe-02-report-page.png');
  } catch (e) {
    console.log(`[task1] SPA login/navigation failed: ${e.message}`);
  } finally {
    await browser.close().catch(() => {});
  }
  return token;
}

async function main() {
  const token = await getFreshToken();
  const date = probeDate();
  console.log(`[probe] store ${STORE_REF}, date ${date}, token "${TOKEN_NAME}"`);
  console.log(`[probe] populated call uses registers=[${REGISTERS.join(',')}] cashiers=[${CASHIERS.join(',')}]`);

  const populatedBody = { event_token: TOKEN_NAME, start_date: date, end_date: date, registers: REGISTERS, time_slices: [], cashiers: CASHIERS, mgr_code: null };
  const emptyBody = { event_token: TOKEN_NAME, start_date: date, end_date: date, registers: [], time_slices: [], cashiers: [], mgr_code: null };

  const [populated, empty] = await Promise.all([
    callEventDetails(token, populatedBody),
    callEventDetails(token, emptyBody),
  ]);

  console.log(`[probe] populated → status ${populated.status}, rows ${populated.rowCount ?? '(unparseable)'}`);
  if (populated.rowCount == null) console.log(`[probe]   snippet: ${populated.snippet}`);
  console.log(`[probe] empty     → status ${empty.status}, rows ${empty.rowCount ?? '(unparseable)'}`);
  if (empty.rowCount == null) console.log(`[probe]   snippet: ${empty.snippet}`);

  // ── auth discrimination, only when the security host refused ────────────────────────────────
  if (!populated.ok || !empty.ok) {
    console.log('\n[probe] ── auth discrimination ──────────────────────────────');
    const reports = await callKnownGoodWithToken(token);
    console.log(`[probe] SAME token vs api.reports /data_layer/v1/service/statistics (ops-pull's own`);
    console.log(`[probe]   token-bearing path, runs green on a schedule) → status ${reports.status}`);
    if (!reports.ok) console.log(`[probe]   snippet: ${reports.snippet}`);
    const t = describeToken(token);
    if (t.error) console.log(`[probe] token claims: unparseable (${t.error})`);
    else {
      console.log(`[probe] token claims (safe subset): ${JSON.stringify(t.shown)}`);
      console.log(`[probe] all claim NAMES present: ${t.allClaimNames.join(', ')}`);
    }
    const access = await mintAccessToken();
    if (access) {
      const r2 = await callEventDetails(access, populatedBody);
      console.log(`[probe] ACCESS token (not ID token) vs api.security → status ${r2.status}`);
      if (!r2.ok) console.log(`[probe]   snippet: ${r2.snippet}`);
      if (r2.ok) console.log('[probe] 🎯 ACCESS TOKEN WORKS -- the security host wants an access token, not an ID token. One-line fix in the pull.');
    } else {
      console.log('[probe] (could not mint an access token -- creds unset or Cognito refused)');
    }

    if (reports.ok) {
      console.log('[probe] ⇒ The token WORKS on api.reports and is DENIED on api.security. The credential');
      console.log('[probe]   is valid and accepted by the platform, so this is NOT a bad/expired token.');
      console.log('[probe]   Either api.security uses a different authorizer, or this principal lacks the');
      console.log('[probe]   security-module entitlement. Check the claim names above for a groups/roles');
      console.log('[probe]   claim; if none is present, treat it as a QSRSoft entitlement request for the');
      console.log('[probe]   automation user -- no code change in this repo will fix it.');
    } else {
      console.log('[probe] ⇒ The token is refused on api.reports TOO, so this is a credential problem, not');
      console.log('[probe]   an entitlement one. Fix minting/expiry first; the security-host question is');
      console.log('[probe]   not yet answerable.');
    }

    // ── dispatch #63 Task 2: one-request discriminator (video_provider) ───────────────────────
    console.log('\n[probe] ── dispatch #63 task 2: video_provider discriminator ──────');
    const vp = await callVideoProvider(token);
    console.log(`[probe] SAME token vs POST /security/video_provider/${STORE_REF} (same api.security module,`);
    console.log(`[probe]   the route the owner's browser gets a 200 from) → status ${vp.status}`);
    if (!vp.ok) console.log(`[probe]   snippet: ${vp.snippet}`);
    if (vp.ok) {
      console.log('[probe] ⇒ Our principal is FINE on api.security generally -- the denial is SCOPED to');
      console.log('[probe]   event_details alone. A route-level entitlement, not an account-wide one.');
    } else {
      console.log('[probe] ⇒ Our principal is denied ACROSS the whole security module, not just this route.');
      console.log('[probe]   More consistent with a principal/flow difference than a route-scoped one.');
    }

    // ── dispatch #63 Task 1: retry with the token the real SPA mints (USER_SRP_AUTH) ──────────
    console.log('\n[probe] ── dispatch #63 task 1: Playwright SPA-login retry (USER_SRP_AUTH) ──');
    const srpToken = await capturePlaywrightSRPToken();
    if (!srpToken) {
      console.log('[task1] no token captured from the SPA session -- cannot retry event_details with it.');
      console.log('[task1] (the app may authenticate this navigation by session/cookie instead; see the');
      console.log('[task1]  seenHosts log above for which host(s), if any, actually carried x-auth-token)');
    } else {
      const srpResult = await callEventDetails(srpToken, populatedBody);
      console.log(`[task1] SRP-minted token vs event_details → status ${srpResult.status}`);
      if (!srpResult.ok) console.log(`[task1]   snippet: ${srpResult.snippet}`);
      if (srpResult.ok) {
        console.log('[task1] 🎯 SRP TOKEN WORKS -- the fix is the auth flow, not a QSRSoft entitlement. Do NOT');
        console.log('[task1]   write the pull yet regardless -- dispatch-58\'s empty-registers/cashiers question');
        console.log('[task1]   (populated vs empty verdict below) is still open and decides the pull\'s shape.');
      } else {
        console.log('[task1] SPA-login-as-QSRSOFT_USERNAME is ALSO denied -- strongly implies the owner\'s');
        console.log('[task1]   working browser session is a genuinely different identity. Entitlement question,');
        console.log('[task1]   not a code question. Write up the QSRSoft request; do not widen scope further.');
      }
      // Privacy-safe principal comparison (Task 2 of the original dispatch-63.md, done without
      // the owner: we hold both tokens ourselves now, same username, two different auth flows).
      const bare = describeToken(token), srp = describeToken(srpToken);
      if (bare.error || srp.error) {
        console.log(`[task1] claim comparison unavailable (bare: ${bare.error || 'ok'}, srp: ${srp.error || 'ok'})`);
      } else {
        console.log(`[task1] principal comparison (hashes only, never raw): bare sub#${bare.subHash} eID#${bare.eIDHash} `
          + `eID.len ${bare.eIDLen} valid_eID ${JSON.stringify(bare.validEID)}`);
        console.log(`[task1]                                        srp:  sub#${srp.subHash} eID#${srp.eIDHash} `
          + `eID.len ${srp.eIDLen} valid_eID ${JSON.stringify(srp.validEID)}`);
        console.log(`[task1] same principal (sub hash equal): ${bare.subHash === srp.subHash}`);
        console.log(`[task1] bare  claim NAMES: ${bare.allClaimNames.join(', ')}`);
        console.log(`[task1] srp   claim NAMES: ${srp.allClaimNames.join(', ')}`);
        const onlyInSrp = srp.allClaimNames.filter(c => !bare.allClaimNames.includes(c));
        const onlyInBare = bare.allClaimNames.filter(c => !srp.allClaimNames.includes(c));
        if (onlyInSrp.length || onlyInBare.length) {
          console.log(`[task1] 🔴 claim-name DIFFERENCE -- only in srp: [${onlyInSrp.join(', ')}], only in bare: [${onlyInBare.join(', ')}]`);
        } else {
          console.log('[task1] claim NAMES are identical between the two tokens (values not compared beyond sub/eID hashes).');
        }
      }
    }
  }

  console.log('\n[probe] ── verdict ──────────────────────────────────────────');
  if (!populated.ok || !empty.ok) {
    console.log(`[probe] ⚠️ at least one call failed (populated ${populated.status}, empty ${empty.status}) -- fix auth/params before trusting a row-count comparison. See the auth-discrimination block above.`);
  } else if (empty.rowCount == null || populated.rowCount == null) {
    console.log('[probe] ⚠️ could not parse rows from at least one response -- inspect the raw snippets above; the response shape may differ from the finding file\'s own capture.');
  } else if (empty.rowCount === 0 && populated.rowCount > 0) {
    console.log(`[probe] 🔴 EMPTY ARRAYS RETURN ZERO ROWS while the populated call returned ${populated.rowCount}. registers/cashiers are REQUIRED FILTERS, not "all". The daily pull needs a redesign (enumerate registers/cashiers per store first) -- see dispatch-58.md's own framing of this exact outcome. Do not write the straightforward per-store-per-token pull.`);
  } else if (empty.rowCount >= populated.rowCount) {
    console.log(`[probe] ✅ EMPTY ARRAYS RETURNED A SUPERSET (${empty.rowCount} vs ${populated.rowCount} populated) -- consistent with empty meaning "all". The daily pull (27 stores x 8 tokens, per-day or chunked ranges) is the straightforward design. Re-run this probe against 2-3 more store/date/token combinations before fully trusting a single comparison, then write scripts/qsrsoft-security-events-pull.mjs.`);
  } else {
    console.log(`[probe] ⚠️ AMBIGUOUS: empty returned FEWER rows (${empty.rowCount}) than populated (${populated.rowCount}) but not zero. Possibly a coincidental narrower match, a rate limit, or a paging cap. Re-run with a different store/date/token before concluding anything.`);
  }
}

main().catch(e => { console.error('[probe] fatal:', e.message); process.exit(1); });
