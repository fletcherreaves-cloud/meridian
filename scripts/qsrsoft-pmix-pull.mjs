#!/usr/bin/env node
// scripts/qsrsoft-pmix-pull.mjs
// QSRSoft Product Mix (PMIX) — per-item units + dollars per store per day.
//
// STATUS (2026-08-14, issue #291): SKELETON ONLY. This script does NOT perform a real
// pull yet — see fetchPmixWindow() below, which throws rather than guessing. What IS real
// here: the auth ladder (direct token → Playwright fallback, proven pattern shared with
// every other reporting-API script) and the date-range/CLI scaffolding. Per the owner's
// explicit sequencing on #291 ("the endpoint capture has to come from the owner first, so
// start with schema and the pull skeleton") and this repo's own standing rule ("measure it,
// don't reason about it" — #273's probe: "do not guess the back-pull shape"), the one thing
// this file will NOT do is invent request params or a response shape for an endpoint nobody
// has captured. memory/qsrsoft-report-catalog.md still marks Product Mix / PMIX Discount /
// Product Mix Trend all ⬜ (unexplored) — the same status Shift Manager had before #266's
// DevTools capture confirmed it.
//
// What IS known, from menu.json's report catalogue (not a capture):
//   Host: api.reports.myqsrsoft.com          (same as DAR/ops/shift-manager — confirmed host)
//   Path: /reports/mcd/product/productMixDrillDown     permission: pmixCI
//   Page: https://v3.myqsrsoft.com/reports/mcd/product/productMixDrillDown
// A SEPARATE report, /reports/mcd/product/productMixDiscount (permission pmixDiscountMenuItems),
// isolates discounting from realized price — see issue #291's caveat on realized-vs-list
// price. NOT built here; a second pull once this one's shape is confirmed and proven.
//
// ── Next step (owner action required) ──────────────────────────────────────────────
// DevTools capture, same steps as every prior endpoint (Shift Manager, DAR, eBOS): open
// the Product Mix report at v3.myqsrsoft.com, run it for one store/one day, Network tab,
// filter to api.reports.myqsrsoft.com, copy the request URL + full query params + response
// JSON shape (field names for item id, description, family/category, units, DOLLARS —
// issue #291 requires storing units and dollars, never a computed unit price — and any
// discount/promo fields) into fetchPmixWindow() below. Once that lands, this script's auth
// ladder and CLI scaffolding need no changes — only fetchPmixWindow()'s body and the
// upsert-row mapping in runAll() do.
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Auth ladder: QSRSOFT_TOKEN (direct) → QSRSOFT_COGNITO_TOKEN (direct) →
//              QSRSOFT_USERNAME/PASSWORD (Playwright: logs in, navigates to the Product Mix
//              report page itself to passively capture a token — same technique DAR's pull
//              uses, "got the token PASSIVELY from the dailyActivity navigation itself").
// Optional: PMIX_START_DATE / PMIX_END_DATE (YYYY-MM-DD, backfill range — target 2024-01 per
//           the issue, matching DAR/VOICE depth), PMIX_STORE (comma-separated NSNs, default
//           all 27), QSRSOFT_DEBUG=1.

import { createClient } from '@supabase/supabase-js';
import { savePmixRows } from '../src/lib/supabase.js';

const BASE       = 'https://api.reports.myqsrsoft.com';
const REPORT_URL = 'https://v3.myqsrsoft.com/reports/mcd/product/productMixDrillDown';
const ORG_ID      = 'a546d4ef-684a-4f25-8bc0-6580af068875';
const DEBUG       = process.env.QSRSOFT_DEBUG === '1';

const STORE_NSNS = (process.env.PMIX_STORE
  ? process.env.PMIX_STORE.split(',').map(s => s.trim())
  : [
    3708, 5183, 5985, 6178, 6838, 6972, 10034, 10422, 10915, 11657, 13113, 18213,
    20475, 24471, 29760, 31357, 32525, 33109, 33222, 33704, 34222, 35064, 35242,
    37566, 38609, 43380, 43701,
  ]).map(String);

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const pad2 = n => String(n).padStart(2, '0');
const fmtDate = d => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
const nsn7 = n => String(n).padStart(7, '0');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Fail-fast input validation (PR #267 review, 2026-08-14, adopted repo-wide since): a bad
// PMIX_START_DATE/PMIX_END_DATE should error on the input, not surface as a confusing
// downstream auth or empty-result failure.
function resolveWindow() {
  const start = (process.env.PMIX_START_DATE || '').trim();
  const end   = (process.env.PMIX_END_DATE   || '').trim() || start;
  if (!start) {
    // No explicit range: default to yesterday only, matching the "only ever evaluate the
    // most recent COMPLETE day" rule this repo already applies elsewhere (qsrsoft-ops-pull.mjs) —
    // today's PMIX totals are still accumulating, not finalized.
    const y = new Date(); y.setUTCDate(y.getUTCDate() - 1);
    const yStr = fmtDate(y);
    return { start: yStr, end: yStr };
  }
  if (!DATE_RE.test(start) || !DATE_RE.test(end)) {
    console.error(`[pmix] ✗ PMIX_START_DATE/PMIX_END_DATE must be YYYY-MM-DD — got start="${start}" end="${end}"`);
    process.exit(1);
  }
  if (end < start) {
    console.error(`[pmix] ✗ PMIX_END_DATE (${end}) is before PMIX_START_DATE (${start})`);
    process.exit(1);
  }
  return { start, end };
}

// ── THE STUB — do not guess this ────────────────────────────────────────────────
// See the file header. This throws deliberately: a guessed URL/param shape that happens to
// return HTTP 200 with an empty or malformed body would look identical to "ran fine, no
// data" to every caller downstream — silently corrupting the very thing this pull exists to
// measure. Fails loud instead, naming exactly what's missing and where to get it.
async function fetchPmixWindow(token, nsn, start, end) {
  throw new Error(
    '[pmix] fetchPmixWindow() is a stub — the productMixDrillDown request shape has not been ' +
    'captured yet (memory/qsrsoft-report-catalog.md still marks it ⬜). See this file\'s header ' +
    'for the exact DevTools steps. Refusing to guess query params or a response shape.'
  );
}

async function runAll(token, dates, nsns = STORE_NSNS) {
  let total = 0;
  for (const nsn of nsns) {
    for (const { start, end } of dates) {
      let rows;
      try {
        rows = await fetchPmixWindow(token, nsn, start, end);
      } catch (e) {
        console.error(`[pmix] ${nsn7(nsn)} ${start}…${end}: ${e.message}`);
        throw e; // one stub failure means every call would fail identically — no point continuing
      }
      if (!rows?.length) continue;
      const { saved, errors } = await savePmixRows(rows.map(r => ({ ...r, loc: nsn7(nsn) })));
      if (errors.length) console.warn(`[pmix] ${nsn7(nsn)} ${start}…${end}: ${errors.length} save error(s)`);
      total += saved;
    }
  }
  return total;
}

// ── Auth: direct token, tried first ─────────────────────────────────────────────
function directToken() {
  const t = (process.env.QSRSOFT_TOKEN || process.env.QSRSOFT_COGNITO_TOKEN || '').trim();
  return t || null;
}

// ── Auth: Playwright fallback — logs in, navigates to the Product Mix report page itself to
// passively capture a token, same technique as qsrsoft-ops-pull.mjs's Daily Activity flow
// ("got the token PASSIVELY from the dailyActivity navigation itself" — no guessed trigger
// request needed, since simply loading the report page's default view fires a real
// authenticated request whose X-Auth-Token header this listener captures regardless of
// whatever params that default request happens to use).
async function viaPlaywright() {
  const u = process.env.QSRSOFT_USERNAME, pw = process.env.QSRSOFT_PASSWORD;
  if (!u || !pw) { console.error('[auth] no QSRSOFT_USERNAME/PASSWORD — cannot use Playwright fallback'); return null; }
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  page.setDefaultTimeout(180000);
  let token = null;
  const seenApiUrls = [];
  page.on('request', req => {
    if (!req.url().includes('api.reports.myqsrsoft.com')) return;
    seenApiUrls.push(req.url().replace(/\?.*/, ''));
    const t = req.headers()['x-auth-token'];
    if (t && t.length > 20 && !token) token = t;
  });
  const snap = (name) => page.screenshot({ path: `screenshots/${name}`, fullPage: true }).catch(() => {});
  try {
    await page.goto('https://v3.myqsrsoft.com', { waitUntil: 'networkidle', timeout: 45000 });
    const userSel = ['input[name="username"]', 'input[name="email"]', 'input[type="email"]', '#username', '#email', 'input[autocomplete="username"]'].join(', ');
    await page.waitForSelector(userSel, { timeout: 20000 });
    await page.fill(userSel, u);
    await page.fill('input[type="password"], input[name="password"]', pw);
    await page.click('button[type="submit"], input[type="submit"], .btn-primary, button:has-text("Login"), button:has-text("Sign in")');
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    await snap('pmix-01-post-login.png');
    await page.goto(REPORT_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await new Promise(r => setTimeout(r, 6000));
    console.log('[auth] product mix page url:', page.url(), '| token captured:', !!token);
    console.log('[auth] api.reports requests seen:', seenApiUrls.length ? JSON.stringify(seenApiUrls) : '(none)');
    await snap('pmix-02-report-page.png');
    if (!token) { console.error('[auth] ✗ could not capture token from the Product Mix report page'); return null; }
    console.log(`[auth] ✓ token captured (${token.length} chars)`);
    return token;
  } finally { await browser.close(); }
}

async function main() {
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) { console.error('[pmix] Missing Supabase env'); process.exit(1); }
  const { start, end } = resolveWindow();
  console.log(`[pmix] window: ${start}…${end} — ${STORE_NSNS.length} store(s)`);

  let token = directToken();
  if (token) {
    console.log('[auth] using direct token');
  } else {
    console.log('[auth] no direct token — falling back to Playwright');
    token = await viaPlaywright();
  }
  if (!token) { console.error('[pmix] ✗ no auth token available (direct env vars unset and Playwright fallback failed)'); process.exit(1); }

  try {
    const total = await runAll(token, [{ start, end }]);
    console.log(`[pmix] done — ${total} rows upserted.`);
    process.exit(0);
  } catch (e) {
    console.error('[pmix] not run — see the error above. This is expected until fetchPmixWindow() is implemented against a real DevTools capture.');
    process.exit(1);
  }
}

main().catch(e => { console.error('[pmix] FATAL:', e); process.exit(1); });
