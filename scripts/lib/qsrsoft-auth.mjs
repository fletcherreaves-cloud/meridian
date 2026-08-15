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
// Cached for the lifetime of the process only (one mint serves every request in a single pull
// run) — NEVER written to disk. A pull script that needs a fresh token on its next scheduled run
// mints again; there is no cross-run reuse to manage or invalidate.
const CLIENT_ID = '2vt4qrqcakbeo9sh0ivli3lbui'; // QSRSoft's Cognito app client (region us-east-1)
const COGNITO_ENDPOINT = 'https://cognito-idp.us-east-1.amazonaws.com/';

let cachedToken = null;

export async function getFreshToken() {
  if (cachedToken) return cachedToken;

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
