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

const BASE = 'https://api.security.myqsrsoft.com';
const ORG_ID = 'a546d4ef-684a-4f25-8bc0-6580af068875';

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
// and the handful of structural claims below, only.
function describeToken(token) {
  try {
    const [, payload] = token.split('.');
    const claims = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    const SAFE = ['aud', 'iss', 'token_use', 'exp', 'iat', 'auth_time', 'cognito:groups', 'scope'];
    const shown = {};
    for (const k of SAFE) if (claims[k] !== undefined) shown[k] = claims[k];
    return { shown, allClaimNames: Object.keys(claims).sort() };
  } catch (e) { return { error: e.message }; }
}

// Does the SAME token work against the host we KNOW works? If reports says 200 and security says
// 403, the credential itself is fine and the difference is the resource/principal -- which is the
// whole question. regAudit is chosen because it is a known-good, already-shipped call path.
async function callKnownGoodReportsHost(token) {
  const params = new URLSearchParams({
    nsn: STORE_REF, orgId: ORG_ID, enterpriseName: 'McDonalds',
    startDate: probeDate(), endDate: probeDate(), dsd: 'd', weekStart: '3', nsd: 'd',
    resultType: 'byDateEmployee', registerType: 'cashier',
  });
  const url = `https://api.reports.myqsrsoft.com/reports/mcd/controlsCash/regAudit?${params}`;
  try {
    const resp = await fetch(url, { headers: {
      'X-Auth-Token': token, 'Accept': 'application/json',
      'Origin': 'https://v3.myqsrsoft.com',
      'Referer': 'https://v3.myqsrsoft.com/reports/mcd/controlsCash/registerAudit',
    } });
    return { status: resp.status, ok: resp.ok, snippet: (await resp.text()).slice(0, 160) };
  } catch (e) { return { status: 0, ok: false, snippet: `fetch failed: ${e.message}` }; }
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
    const reports = await callKnownGoodReportsHost(token);
    console.log(`[probe] SAME token vs api.reports/regAudit (known-good path) → status ${reports.status}`);
    if (!reports.ok) console.log(`[probe]   snippet: ${reports.snippet}`);
    const t = describeToken(token);
    if (t.error) console.log(`[probe] token claims: unparseable (${t.error})`);
    else {
      console.log(`[probe] token claims (safe subset): ${JSON.stringify(t.shown)}`);
      console.log(`[probe] all claim NAMES present: ${t.allClaimNames.join(', ')}`);
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
