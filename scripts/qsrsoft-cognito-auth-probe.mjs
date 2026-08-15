#!/usr/bin/env node
// #312 probe ONLY — answers one question: which Cognito auth flow does the QSRSoft
// app client accept? QSRSOFT_TOKEN and QSRSOFT_COGNITO_TOKEN are the same credential
// (owner-confirmed), a Cognito ID token with a ~1h TTL, so every stored-secret pull
// has been running on the Playwright fallback ~23 of every 24 hours, by construction.
// Rotation cannot fix that; minting per-run can — but only once we know which
// InitiateAuth flow this app client accepts. workflow_dispatch only. Do NOT build the
// shared getFreshToken() lib until this has run green — see the issue.
//
// Security, non-negotiable: this script must NEVER print, log, echo, or write to
// disk the token or the password. Only a fixed, hand-picked set of fields is ever
// logged (flow name, yes/no, AWS error CODE, and derived booleans) — never a raw
// response body, which is the one place a token could appear (AuthenticationResult).
// No debug/verbose mode. Nothing is written to disk (this is a probe, not the future
// cached-token helper).
//
// Region / pool / app client / credential source are all pre-confirmed per the issue
// — not re-derived here.
const REGION = 'us-east-1';
const USER_POOL_ID = 'us-east-1_OdhPNFLDP';
const CLIENT_ID = '2vt4qrqcakbeo9sh0ivli3lbui';
const COGNITO_ENDPOINT = `https://cognito-idp.${REGION}.amazonaws.com/`;

const username = process.env.QSRSOFT_USERNAME;
const password = process.env.QSRSOFT_PASSWORD;

function report(fields) {
  // The one and only place this script prints anything about the auth attempts.
  // fields is a small fixed object of non-sensitive, derived values — never the
  // raw AWS response, which is where AuthenticationResult.IdToken would live.
  for (const [k, v] of Object.entries(fields)) console.log(`${k}: ${v}`);
}

// Inspects an AWS error body for the literal substring "secret hash" without ever
// printing the body itself — the body itself may be safe (it's AWS's own error
// text, no credentials), but the task asks for a derived flag, not a raw echo, so
// that's exactly what this returns and nothing else leaves this function.
function mentionsSecretHash(errBody) {
  return /secret\s*hash/i.test(errBody || '');
}

async function tryUserPasswordAuth() {
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
    return { ok: false, networkError: true, code: e.name || 'FetchError' };
  }
  const bodyText = await resp.text().catch(() => '');
  let body = null;
  try { body = JSON.parse(bodyText); } catch { /* non-JSON error body */ }

  if (resp.ok && body && body.AuthenticationResult) {
    return { ok: true, hasIdToken: !!body.AuthenticationResult.IdToken };
  }
  if (body && body.ChallengeName) {
    return { ok: false, challengeName: body.ChallengeName, code: 'ChallengeReturned' };
  }
  const code = (body && (body.__type || body.code)) || `HTTP ${resp.status}`;
  return { ok: false, code: String(code).split('#').pop(), secretHash: mentionsSecretHash(bodyText) };
}

async function trySrp() {
  const { CognitoUserPool, CognitoUser, AuthenticationDetails } =
    await import('amazon-cognito-identity-js');

  // amazon-cognito-identity-js expects a browser-shaped Storage; Node has none.
  // In-memory only, never touches disk, and is discarded when the process exits.
  const memoryStorage = new Map();
  const Storage = {
    getItem: (k) => (memoryStorage.has(k) ? memoryStorage.get(k) : null),
    setItem: (k, v) => memoryStorage.set(k, v),
    removeItem: (k) => memoryStorage.delete(k),
  };

  const pool = new CognitoUserPool({ UserPoolId: USER_POOL_ID, ClientId: CLIENT_ID, Storage });
  const user = new CognitoUser({ Username: username, Pool: pool, Storage });
  const authDetails = new AuthenticationDetails({ Username: username, Password: password });

  return new Promise((resolve) => {
    user.authenticateUser(authDetails, {
      onSuccess: (session) => {
        resolve({ ok: true, hasIdToken: !!session.getIdToken().getJwtToken() });
      },
      onFailure: (err) => {
        resolve({ ok: false, code: (err && err.code) || 'Unknown', secretHash: mentionsSecretHash(err && err.message) });
      },
      // Any challenge here (NEW_PASSWORD_REQUIRED, SMS_MFA, SOFTWARE_TOKEN_MFA, ...)
      // means tokens did not come back directly — owner confirms MFA is off, so
      // seeing one of these is a surprise worth flagging, not something to solve here.
      newPasswordRequired: () => resolve({ ok: false, challengeName: 'NEW_PASSWORD_REQUIRED', code: 'ChallengeReturned' }),
      mfaRequired: () => resolve({ ok: false, challengeName: 'SMS_MFA', code: 'ChallengeReturned' }),
      totpRequired: () => resolve({ ok: false, challengeName: 'SOFTWARE_TOKEN_MFA', code: 'ChallengeReturned' }),
      customChallenge: () => resolve({ ok: false, challengeName: 'CUSTOM_CHALLENGE', code: 'ChallengeReturned' }),
      selectMFAType: () => resolve({ ok: false, challengeName: 'SELECT_MFA_TYPE', code: 'ChallengeReturned' }),
    });
  });
}

async function main() {
  if (!username || !password) {
    report({ IdToken: 'no', ErrorCode: 'MissingCredentials' });
    process.exitCode = 1;
    return;
  }

  console.log('[probe] attempting USER_PASSWORD_AUTH...');
  const pwAttempt = await tryUserPasswordAuth();

  if (pwAttempt.ok) {
    report({
      Flow: 'USER_PASSWORD_AUTH',
      IdToken: pwAttempt.hasIdToken ? 'yes' : 'no',
      SecretHashRequired: 'no',
      ChallengeName: 'none',
    });
    return;
  }

  report({
    'USER_PASSWORD_AUTH result': 'failed',
    ErrorCode: pwAttempt.code || 'Unknown',
    ...(pwAttempt.challengeName ? { ChallengeName: pwAttempt.challengeName } : {}),
    SecretHashRequired: pwAttempt.secretHash ? 'yes' : 'no',
  });

  console.log('[probe] attempting SRP (USER_SRP_AUTH) via amazon-cognito-identity-js...');
  const srpAttempt = await trySrp();

  if (srpAttempt.ok) {
    report({
      Flow: 'SRP (USER_SRP_AUTH)',
      IdToken: srpAttempt.hasIdToken ? 'yes' : 'no',
      SecretHashRequired: 'no',
      ChallengeName: 'none',
    });
    return;
  }

  report({
    Flow: 'none — both USER_PASSWORD_AUTH and SRP failed',
    IdToken: 'no',
    ErrorCode: srpAttempt.code || 'Unknown',
    ChallengeName: srpAttempt.challengeName || 'none',
    SecretHashRequired: srpAttempt.secretHash ? 'yes' : 'no',
  });
  process.exitCode = 1;
}

main();
