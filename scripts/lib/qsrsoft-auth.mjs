// scripts/lib/qsrsoft-auth.mjs — mints a fresh QSRSoft/Cognito ID token per run.
//
// #312's finding chain: QSRSOFT_TOKEN and QSRSOFT_COGNITO_TOKEN are the same credential, a
// Cognito ID token with a ~1h TTL — so a token STORED as a GitHub secret is expired ~23 of every
// 24 hours, and every scheduled pull that reads one has been falling straight through to its
// Playwright fallback, by construction, no matter how often the secret is rotated. This module
// exists to stop storing the token at all: mint one fresh, in-process, right before the request
// that needs it.
//
// #312's probe (workflow_dispatch, run 31906427264, 2026-08-15) answered the two open questions
// before this was written, so neither is guessed at here:
//   - Flow: USER_PASSWORD_AUTH is accepted directly by this app client. SRP was never exercised
//     and is DELIBERATELY not implemented below — an untested fallback is worse than none, since
//     it would get its first real run on the day the primary path breaks, the worst possible
//     moment to discover a bug in it. If USER_PASSWORD_AUTH ever stops being accepted, that is a
//     deliberate config change on QSRSoft's/AWS's side and deserves a real investigation, not a
//     silent second auth path bolted on here.
//   - SECRET_HASH: not required — this app client has no client secret configured (a public
//     client, consistent with it being called from browser JS), so none is computed or sent.
//
// The token this mints is the SAME shape QSRSOFT_TOKEN/QSRSOFT_COGNITO_TOKEN always were — every
// existing fetchDirect()-style call site that already sends process.env.QSRSOFT_TOKEN as
// X-Auth-Token to api.reports.myqsrsoft.com keeps working unchanged; only the source of the
// token value changes, from a stale secret to a fresh mint.
//
// Cached for the lifetime of the process only (one mint can serve many requests in a single
// pull run) — NEVER written to disk. A pull script that needs a fresh token on its next
// scheduled run mints again; there is no cross-run reuse to manage or invalidate.
//
// Expiry-aware (#312 scope 3, ops-pull conversion, 2026-08-15): a naive "mint once, reuse for
// the whole process" cache is correct for a short daily pull but wrong for a backfill —
// qsrsoft-ops-pull.mjs is explicitly backfill-capable (QSRSOFT_OPS_START_DATE/END_DATE, a
// day-by-day loop) and CLAUDE.md records a 27-month backfill as routine at ~6.6s/day, ≈1.5
// hours against this token's ~1h TTL. A single mint would sail past expiry and start 401ing
// partway through. Fixed two ways, deliberately both rather than picking one: (1) PROACTIVE —
// decode the token's own `exp` claim and re-mint once the remaining lifetime crosses
// EXPIRY_MARGIN_MS, so a long-running caller that calls getFreshToken() before each unit of
// work (each date, each request) never has to observe a stale token as such — it silently gets
// a new one instead; (2) REACTIVE — forceRemint lets a caller that DID get a 401 despite a
// nominally-fresh token (clock skew, early revocation, anything the exp claim didn't predict)
// force exactly one new mint and retry, rather than concluding the whole auth mechanism is
// broken and falling back to Playwright for work that a single re-mint would have fixed.
const CLIENT_ID = '2vt4qrqcakbeo9sh0ivli3lbui'; // QSRSoft's Cognito app client (region us-east-1)
const COGNITO_ENDPOINT = 'https://cognito-idp.us-east-1.amazonaws.com/';
const EXPIRY_MARGIN_MS = 5 * 60 * 1000; // re-mint 5 min before the token's own exp — covers clock skew and the gap between mint and first use
const ASSUMED_TTL_MS = 55 * 60 * 1000;  // fallback if exp can't be decoded: documented ~1h TTL, minus a safety margin

let cachedToken = null;
let cachedExpiryMs = 0;

// A Cognito ID token is a JWT; the middle segment is a base64url JSON payload carrying `exp`
// (epoch seconds). Decoded locally, no network call — this is not signature verification (this
// module never needs to verify the token, only read its own stated expiry) and must not be
// treated as one.
function decodeExpiryMs(idToken) {
  try {
    const payload = idToken.split('.')[1];
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof json.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

export async function getFreshToken({ forceRemint = false } = {}) {
  if (!forceRemint && cachedToken && Date.now() < cachedExpiryMs - EXPIRY_MARGIN_MS) return cachedToken;

  const username = process.env.QSRSOFT_USERNAME;
  const password = process.env.QSRSOFT_PASSWORD;
  if (!username || !password) throw new Error('getFreshToken: QSRSOFT_USERNAME/QSRSOFT_PASSWORD not set');

  let resp;
  try {
    resp = await fetch(COGNITO_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
      },
      body: JSON.stringify({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: CLIENT_ID,
        AuthParameters: { USERNAME: username, PASSWORD: password },
      }),
    });
  } catch (e) {
    throw new Error(`getFreshToken: network error reaching Cognito (${e.message})`);
  }

  const bodyText = await resp.text().catch(() => '');
  let body = null;
  try { body = JSON.parse(bodyText); } catch { /* non-JSON error body */ }

  const idToken = body?.AuthenticationResult?.IdToken;
  if (resp.ok && idToken) {
    cachedToken = idToken;
    cachedExpiryMs = decodeExpiryMs(idToken) || (Date.now() + ASSUMED_TTL_MS);
    return cachedToken;
  }

  if (body?.ChallengeName) {
    // Owner confirms MFA is off, per #312 — a challenge here is a surprise, not a
    // condition this module is designed to satisfy (no code prompts for an MFA code).
    throw new Error(`getFreshToken: unexpected challenge ${body.ChallengeName}`);
  }
  const code = body?.__type?.split('#').pop() || body?.code || `HTTP ${resp.status}`;
  throw new Error(`getFreshToken: InitiateAuth failed (${code})`);
}
