// scripts/lib/ebos-auth.mjs — shared eBOS token-resolution ladder for prod.ebos.qsrsoft.com pulls.
//
// Extracted (2026-08-14, PR #273 review) from qsrsoft-variance-pull.mjs's copy — the most
// recently confirmed-working of what had become THREE near-identical copies of this same ~100
// lines (onhand-pull.mjs, variance-pull.mjs, ebos-pull.mjs), each evolved slightly differently.
// qsrsoft-inventory-history-pull.mjs would have been a fourth. This is that shared code, so a
// fourth eBOS pull extends the existing pattern instead of re-copying it.
//
// NOT yet adopted by the three existing scheduled pulls — swapping a production cron's auth
// code for a shared import is a bigger, riskier change than this extraction, and none of those
// three are broken today. Only the new inventory-history probe imports this so far. Migrating
// the other three (so there's ONE copy, not four) is a reasonable follow-up, done carefully and
// separately so a refactor can't regress a working scheduled pull.
//
// eBOS auth is its OWN ladder, distinct from the reporting-API ladder (api.reports.myqsrsoft.com,
// used by qsrsoft-ops-pull.mjs / qsrsoft-dar-pull.mjs / qsrsoft-shift-manager-pull.mjs, which read
// a fresh-minted token directly with no exchange step). eBOS tokens are short-lived (HS256, minted
// per-session) and are obtained by EXCHANGING a Cognito ID token for one via SSO, or as a last
// resort by a fresh Playwright login. QSRSOFT_EBOS_TOKEN is a static override/fallback. Building a
// new eBOS pull against the reporting-API ladder (a token read directly, no exchange) fails in a
// way that looks like a permissions problem, not a wrong-ladder problem — this module exists so
// that mistake can't happen again by construction.
//
// Dispatch #82 / memory/project-qsrsoft-cognito-auth-312.md: resolveEbosToken() used to feed the
// SSO exchange a static QSRSOFT_COGNITO_TOKEN/QSRSOFT_TOKEN — the same ~1h-TTL Cognito ID token
// stale ~23/24 hours as a stored secret, no matter how often it's rotated. This was a genuinely
// live bug: qsrsoft-inventory-history-pull.mjs already imports resolveEbosToken() from here, so it
// was silently falling through to Playwright on nearly every run despite never appearing in
// dispatch #82's own file-count (a grep for direct `process.env.QSRSOFT_TOKEN` reads misses a
// script that only reads it indirectly through a shared lib). Now mints a fresh token per call via
// getFreshToken() instead.

import { chromium } from 'playwright';
import { getFreshToken } from './qsrsoft-auth.mjs';

export const EBOS_BASE = 'https://prod.ebos.qsrsoft.com';
export const EBOS_ORG_ID = 'a546d4ef-684a-4f25-8bc0-6580af068875';

const DEBUG = process.env.QSRSOFT_DEBUG === '1';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';

// The exchange host api.sso.myqsrsoft.com authenticates with the COGNITO ID token (RS256,
// iss=cognito-idp.us-east-1…, token_use=id, ~1h TTL) in x-auth-token — NOT the
// api.reports.myqsrsoft.com reporting token, though QSRSOFT_TOKEN is accepted as a fallback
// value for `cognitoToken` here for backward-compat with scripts that only have that secret set.
export async function getEbosTokenViaSso(cognitoToken) {
  const url = `https://api.sso.myqsrsoft.com/token/ebosByOrg?orgId=${EBOS_ORG_ID}`;
  const resp = await fetch(url, {
    headers: {
      'X-Auth-Token': cognitoToken, 'Accept': 'application/json',
      'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/',
      'User-Agent': UA,
    },
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    console.log(`[auth] SSO exchange HTTP ${resp.status}${DEBUG && body ? ` — ${body.slice(0, 200)}` : ''}`);
    return null;
  }
  const data = await resp.json();
  const tok = data.token || data.accessToken || data.access_token || data.ebosByOrg
      || data.ebosToken || data.x_auth_token || data.xAuthToken || (typeof data === 'string' ? data : null) || null;
  if (!tok && DEBUG) console.log('[auth] SSO exchange OK but no token field — keys:', Object.keys(data || {}).join(', '));
  return tok;
}

// Playwright login — mints a FRESH eBOS token from a live browser session. eBOS tokens die in
// ~minutes, so there is no long-lived reusable token; this is the last-resort path when neither
// the SSO exchange nor a static QSRSOFT_EBOS_TOKEN works.
export async function getEbosTokenViaPlaywright() {
  const u = process.env.QSRSOFT_USERNAME, p = process.env.QSRSOFT_PASSWORD;
  if (!u || !p) { console.error('[auth] no QSRSOFT_USERNAME/PASSWORD for Playwright fallback'); return null; }
  const fs = await import('node:fs');
  try { fs.mkdirSync('screenshots', { recursive: true }); } catch {}
  const shot = async (page, name) => { try { await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true }); console.log(`[pw] 📸 ${name}`); } catch (e) { console.log(`[pw] screenshot ${name} failed: ${e.message}`); } };
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: UA });
  const page = await context.newPage();
  let ebosToken = null;
  const grab = (t, where) => { if (!ebosToken && t && t.length > 40) { ebosToken = t; console.log(`[pw] ✓ captured eBOS token from ${where}`); } };
  page.on('request', req => { if (req.url().includes('ebos.qsrsoft.com')) grab(req.headers()['x-auth-token'], 'request header'); });
  page.on('response', async resp => {
    if (ebosToken) return;
    const url = resp.url();
    if (!/sso\.myqsrsoft|ebos\.qsrsoft|token/i.test(url)) return;
    try { const body = await resp.text(); const m = body.match(/eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9[\w.\-]+/); if (m) grab(m[0], `response ${url.slice(0, 80)}`); } catch {}
  });
  try {
    console.log('[pw] goto v3.myqsrsoft.com …');
    await page.goto('https://v3.myqsrsoft.com', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {});
    await shot(page, '01-landing');
    const userSel = 'input[name="username"], input[name="email"], input[type="email"], #username, #email';
    const passSel = 'input[name="password"], input[type="password"], #password';
    const foundUser = await page.waitForSelector(userSel, { timeout: 20000 }).then(() => true).catch(() => false);
    if (!foundUser) { console.log('[pw] ✗ no username field found — login UI not recognized'); await shot(page, '02-no-login'); }
    else {
      const userLoc = page.locator(userSel).first();
      const passLoc = page.locator(passSel).first();
      await userLoc.click({ clickCount: 3 }); await userLoc.pressSequentially(u, { delay: 12 });
      await passLoc.click({ clickCount: 3 }).catch(() => {}); await passLoc.pressSequentially(p, { delay: 12 }).catch(() => {});
      await shot(page, '02-filled');
      const signIn = page.getByRole('button', { name: 'Sign in', exact: true });
      const clicked = await signIn.click({ timeout: 8000 }).then(() => true).catch(() => false);
      if (!clicked) { console.log('[pw] exact Sign in button not clickable — pressing Enter in password'); await passLoc.press('Enter').catch(() => {}); }
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 2500));
      await shot(page, '03-post-login');
    }
    for (const url of ['https://v3.myqsrsoft.com/inventory/variance', 'https://v3.myqsrsoft.com/inventory', 'https://v3.myqsrsoft.com/']) {
      if (ebosToken) break;
      await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 5000));
    }
    if (!ebosToken) await shot(page, '04-no-token');
  } catch (e) { console.error('[auth] Playwright error:', e.message); } finally { await browser.close(); }
  if (!ebosToken) console.error('[auth] ✗ Playwright could not capture an eBOS token');
  return ebosToken;
}

// The full ladder: SSO exchange (fresh, preferred) → static QSRSOFT_EBOS_TOKEN (may be stale) →
// Playwright (last resort, mints fresh). Returns the token, or null if every rung failed — the
// caller decides how to log/exit, since that message is naturally script-specific.
export async function resolveEbosToken() {
  try {
    const cognito = await getFreshToken();
    const t = await getEbosTokenViaSso(cognito);
    if (t) { console.log('[auth] ✓ eBOS token via SSO exchange (fresh)'); return t; }
    console.log('[auth] SSO exchange did not return a token — trying fallbacks');
  } catch (e) {
    console.log(`[auth] getFreshToken() failed (${e.message}) — trying fallbacks`);
  }
  const envToken = (process.env.QSRSOFT_EBOS_TOKEN || '').trim();
  if (envToken) { console.log('[auth] falling back to static QSRSOFT_EBOS_TOKEN (may be stale)'); return envToken; }
  return getEbosTokenViaPlaywright();
}
