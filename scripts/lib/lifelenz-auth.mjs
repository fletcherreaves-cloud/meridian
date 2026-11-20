// scripts/lib/lifelenz-auth.mjs — shared "verify the static token, fall back to a direct
// SignIn mutation" resolver for every LifeLenz pull script.
//
// Ported verbatim from lifelenz-dar-pull.mjs's resolveToken()/getAuthTokenDirect() (itself
// ported from lifelenz-pull.mjs's reauth()/getAuthTokenDirect()) — the one LifeLenz auth path
// that ran clean through the LIFELENZ_TOKEN expiry starting 2026-11-16, while five sibling
// Data Explorer pulls (Schedule Variance/Attendance/Compliance Audit/Payroll Readiness/
// Employee Performance) went dark for days because each hard-required LIFELENZ_TOKEN with no
// fallback at all (each one's own error string said so: "no Playwright fallback in this pull
// yet"). No Playwright needed, here or in the two scripts this was copied from — LifeLenz's own
// SPA authenticates via a plain GraphQL SignIn mutation against idm.lifelenz.com, which this
// replicates directly with a `fetch`.
//
// Extracted here (owner request, 2026-11-20) instead of re-pasting the block a sixth and
// seventh time, per CLAUDE.md's "check whether a helper exists before writing one" rule — four
// near-identical copies were already heading toward the same drift the org-map/week-start
// duplicates caused.

const BASE     = 'https://us01-connect.lifelenz.com';
const IDM_BASE = 'https://idm.lifelenz.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

function isSessionExpired(status, body) {
  if (status === 401 || status === 403 || status === 422) return true;
  const b = (body || '').toLowerCase();
  return b.includes('invalid_session_error') || b.includes('sign in again');
}

async function getAuthTokenDirect() {
  const u = process.env.LIFELENZ_USERNAME;
  const p = process.env.LIFELENZ_PASSWORD;
  const query = `mutation SignIn($username: String!, $credential: String!) {
    signIn(email: $username, credential: $credential) { authToken }
  }`;
  const credential = Buffer.from(p || '', 'utf8').toString('base64');
  const r = await fetch(`${IDM_BASE}/external/graphql?SignIn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA, 'Accept': '*/*', 'X-Lifelenz-Device': 'webadmin', 'X-Version': '1.78.11' },
    body: JSON.stringify({ operationName: 'SignIn', variables: { username: u, credential }, query }),
  });
  const data = await r.json().catch(() => null);
  if (data?.errors) { console.warn('[lifelenz-auth] SignIn error:', JSON.stringify(data.errors).slice(0, 300)); return null; }
  return data?.data?.signIn?.authToken || null;
}

// Validates a static LIFELENZ_TOKEN against a cheap, every-business-has-one endpoint before
// trusting it for the real pull — a token that's merely EXPIRED (not missing) would otherwise
// run the whole pull into the same "Session expired" wall this helper exists to avoid.
export async function resolveLifelenzToken(businessId) {
  let token = process.env.LIFELENZ_TOKEN || null;
  if (token) {
    const check = await fetch(`${BASE}/api/admin/businesses/${businessId}/schedules`, {
      headers: { 'X-Auth-Token': token, 'X-Business-Id': businessId, 'X-Lifelenz-Device': 'webadmin', 'X-Version': '1.78.11', 'Accept': 'application/json' },
    });
    if (!check.ok) {
      const body = await check.text().catch(() => '');
      if (isSessionExpired(check.status, body)) {
        console.warn('[lifelenz-auth] LIFELENZ_TOKEN rejected, falling back to SignIn mutation');
        token = null;
      }
    }
  }
  if (!token) token = await getAuthTokenDirect();
  if (!token) throw new Error('Could not resolve a LifeLenz auth token via LIFELENZ_TOKEN or LIFELENZ_USERNAME/PASSWORD SignIn.');
  return token;
}
