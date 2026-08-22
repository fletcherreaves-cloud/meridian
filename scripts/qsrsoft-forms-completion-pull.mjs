#!/usr/bin/env node
// scripts/qsrsoft-forms-completion-pull.mjs
// QSRSoft Forms — shift-checklist COMPLETION tracking (Forms dashboard Slice 3 of 3).
//
// Not to be confused with scripts/qsrsoft-forms-pull.mjs, which pulls BLANK form templates
// (public/forms/*.json, no store data). This pulls the LIVE completion records those
// templates get filled out against -- one row per scheduled occurrence, done/missed/open,
// who, when -- via forms.home.myqsrsoft.com's `completionDetail` report.
// See memory/finding-qsrsoft-forms-completion-endpoint-2026-08-21.md for the full capture
// this is built from, and memory/project-forms-dashboard-slice1.md / slice2.md for the
// schema/normalizer/panel this feeds.
//
// Endpoint (host confirmed 2026-08-21 -- token-only, NO session cookie; a plain server-side
// fetch works, same auth SHAPE as api.reports.myqsrsoft.com):
//   POST https://forms.home.myqsrsoft.com/api/forms/reports/completionDetail?orgId=...
//   { "startDate": "...", "endDate": "...", "locations": [<27 unpadded NSNs>, "noLocation"] }
// NO formIds -- the server already knows what's assigned to each store, which is exactly
// why this endpoint (not its completionByForm sibling) is the source: a hardcoded formId
// list silently misses every form created afterwards, and a missing form is OMITTED from
// the response rather than zeroed, so that failure would be invisible.
//
// Auth: getFreshToken() (scripts/lib/qsrsoft-auth.mjs) mints a fresh Cognito ID token per
// run via direct USER_PASSWORD_AUTH -- no Playwright needed for the primary path, same as
// qsrsoft-ops-pull.mjs since #312. A Playwright fallback (login, capture x-auth-token) is
// kept for the same reason ops-pull keeps one: a defensive second path, not the expected
// one. QSRSOFT_USERNAME/PASSWORD serve both paths.
//
// Row shape: the API response IS the raw shape src/engine/forms-completion.js's
// normalizeFormsCompletionRow() was built for (Slice 1) -- this script does no field
// mapping of its own beyond that shared normalizer, so the polymorphic `status` field, the
// null-`scheduledAt` ad-hoc-row key fallback, and the completedBy PII drop are handled in
// exactly one place, already tested by src/__tests__/forms-completion.test.js.
//
// Range caution (finding file, open question 4): a single capture of 3 days x 27 stores
// returned 4,714 rows with no pagination envelope observed, but the response cap is
// UNMEASURED -- a naive year-long backfill could silently truncate. This script requests
// CHUNK_DAYS-sized windows (default 3, matching the one measured-safe capture size) rather
// than the whole range in one call, upserting after each chunk so a truncation or failure
// partway through a backfill doesn't lose the chunks that already landed.
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, QSRSOFT_USERNAME, QSRSOFT_PASSWORD
// Optional:
//   QSRSOFT_FORMS_COMPLETION_DAYS_BACK    -- max history on first run (default: 14)
//   QSRSOFT_FORMS_COMPLETION_DAYS_RECENT  -- rolling re-pull window (default: 4)
//   QSRSOFT_FORMS_COMPLETION_START_DATE   -- explicit backfill start (YYYY-MM-DD)
//   QSRSOFT_FORMS_COMPLETION_END_DATE     -- explicit backfill end (YYYY-MM-DD, default: today)
//   QSRSOFT_FORMS_COMPLETION_CHUNK_DAYS   -- days per API call (default: 3 -- see range caution above)
//   QSRSOFT_FORMS_COMPLETION_DEBUG=1
//
// Manual-upload fallback: DELIBERATELY NOT BUILT. Unlike FOB/Ops Report/Controls, form-
// completion tracking has no pre-existing manual/spreadsheet workflow this replaces --
// nobody has ever hand-logged "did store X complete its Travel Path today" outside QSRSoft
// itself. CLAUDE.md's "always keep manual upload as fallback" rule exists to protect a
// workflow real people already relied on from breaking; there is no such workflow here to
// protect. If this pull goes dark, the panel's own honest "no data synced yet" state (Slice
// 2) is the correct failure mode, backstopped by sync-failure-watch.yml below -- not a new
// Excel-upload UI for data that was never on paper.

import { createClient } from '@supabase/supabase-js';
import { getFreshToken } from './lib/qsrsoft-auth.mjs';
import { makeOutcomeTracker } from './lib/pull-outcome.mjs';
import { logPartitionCoverage, checkFreshness } from './_pipeline-contract.mjs';
import { normalizeFormsCompletionRow, apiWindowForDays } from '../src/engine/forms-completion.js';

const BASE = 'https://forms.home.myqsrsoft.com';
const ORG_ID = 'a546d4ef-684a-4f25-8bc0-6580af068875';
const STORE_NSNS = [
  3708, 5183, 5985, 6178, 6838, 6972, 10034, 10422, 10915, 11657, 13113, 18213,
  20475, 24471, 29760, 31357, 32525, 33109, 33222, 33704, 34222, 35064, 35242,
  37566, 38609, 43380, 43701,
].map(String);
// "noLocation" is a real request member (finding file caveat 8) -- keeps submissions with
// no store attached surfacing rather than silently vanishing from the response.
const LOCATIONS = [...STORE_NSNS, 'noLocation'];

const DAYS_BACK   = parseInt(process.env.QSRSOFT_FORMS_COMPLETION_DAYS_BACK   || '14', 10);
const DAYS_RECENT = parseInt(process.env.QSRSOFT_FORMS_COMPLETION_DAYS_RECENT || '4',  10);
const START_DATE  = (process.env.QSRSOFT_FORMS_COMPLETION_START_DATE || '').trim();
const END_DATE    = (process.env.QSRSOFT_FORMS_COMPLETION_END_DATE   || '').trim();
const CHUNK_DAYS  = parseInt(process.env.QSRSOFT_FORMS_COMPLETION_CHUNK_DAYS  || '3', 10);
const DEBUG       = process.env.QSRSOFT_FORMS_COMPLETION_DEBUG === '1';

// Dispatch #71 -- guarded, not unconditional, matching qsrsoft-register-audit-pull.mjs's and
// qsrsoft-security-events-pull.mjs's identical comment: keeps this module importable (for
// pullWithEscalation and the other pure helpers) under vitest, where neither env var is set.
const supabase = (process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

const fmtDate = d => d.toISOString().slice(0, 10);
const addDay  = (d, n) => { const r = new Date(d); r.setUTCDate(r.getUTCDate() + n); return r; };

// Same auth shape as ops-pull's HDRS -- forms.home confirmed token-only (no Cookie) via the
// owner's DevTools request-header panel; this differs from api.reports only in host + method.
const HDRS = t => ({
  'X-Auth-Token': t, 'Accept': '*/*', 'Content-Type': 'application/json',
  'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
});

// Dispatch #71 -- the real root cause, found by logging the raw response body once every other
// theory (silent-auth-denial, wrong token source) was measured and refuted: the server wraps rows
// under `results` (plural), not `result`. `completionDetail` returns real, populated data on every
// chunk -- `{"results":[{...MISSED row...}, ...]}` -- but `parsed?.result || []` reads a key that
// never existed, so every response silently parsed to an empty array regardless of auth, token
// source, or window correctness. None of those were ever the bug.
export async function fetchWindow(token, startDay, endDay, evalPage) {
  const { startDate, endDate } = apiWindowForDays(startDay, endDay);
  const url = `${BASE}/api/forms/reports/completionDetail?orgId=${ORG_ID}`;
  const body = JSON.stringify({ startDate, endDate, locations: LOCATIONS });
  if (evalPage) {
    const res = await evalPage.evaluate(async ({ url, body, token }) => {
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'X-Auth-Token': token, 'Accept': '*/*', 'Content-Type': 'application/json', 'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/' },
          body,
        });
        if (!r.ok) return { error: `HTTP ${r.status}` };
        return { rows: await r.json() };
      } catch (e) { return { error: e.message }; }
    }, { url, body, token });
    if (res.error) throw new Error(res.error);
    return Array.isArray(res.rows) ? res.rows : (res.rows?.results || res.rows?.result || []);
  }
  const resp = await fetch(url, { method: 'POST', headers: HDRS(token), body });
  if (resp.status === 401 || resp.status === 403) throw new Error(`AUTH_FAILED:${resp.status}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const parsed = await resp.json();
  return Array.isArray(parsed) ? parsed : (parsed?.results || parsed?.result || []);
}

async function upsertRows(rawRows) {
  const mapped = rawRows.map(normalizeFormsCompletionRow).filter(Boolean).map(r => ({
    loc: r.loc, form_id: r.formId, form_title: r.formTitle, occurrence_key: r.occurrenceKey,
    status_state: r.statusState, completion_ratio: r.completionRatio, missed: r.missed,
    has_response: r.hasResponse, scheduled_at: r.scheduledAt, started_at: r.startedAt,
    completed_on: r.completedOn, time_to_complete_ms: r.timeToCompleteMs, user_id: r.userId,
    score: r.score, reviewed_with: r.reviewedWith, assigned_to: r.assignedTo,
    updated_at: new Date().toISOString(),
  }));
  const dropped = rawRows.length - mapped.length;
  if (dropped > 0 && DEBUG) console.log(`[forms-completion] ${dropped} row(s) dropped by the normalizer (unusable/unkeyable)`);
  const CHUNK = 500;
  let saved = 0;
  for (let i = 0; i < mapped.length; i += CHUNK) {
    const { error } = await supabase.from('qsr_forms_completion')
      .upsert(mapped.slice(i, i + CHUNK), { onConflict: 'tenant_id,loc,form_id,occurrence_key' });
    if (error) throw new Error(`[qsr_forms_completion] ${error.message}`);
    saved += Math.min(CHUNK, mapped.length - i);
  }
  return { saved, dropped, locs: new Set(mapped.map(r => r.loc)) };
}

function chunkDays(start, end, chunkSize) {
  const chunks = [];
  let cur = new Date(`${start}T00:00:00.000Z`);
  const endD = new Date(`${end}T00:00:00.000Z`);
  while (cur <= endD) {
    const chunkEndMs = Math.min(addDay(cur, chunkSize - 1).getTime(), endD.getTime());
    const chunkEnd = new Date(chunkEndMs);
    chunks.push({ start: fmtDate(cur), end: fmtDate(chunkEnd) });
    cur = addDay(chunkEnd, 1);
  }
  return chunks;
}

async function getDayRange() {
  const today = new Date();
  if (START_DATE) return { start: START_DATE, end: END_DATE || fmtDate(today) };
  let latest = null;
  const { data, error } = await supabase.from('qsr_forms_completion')
    .select('occurrence_key').order('occurrence_key', { ascending: false }).limit(1).single();
  // PGRST116 = "Results contain 0 rows" -- a genuinely empty table, not a read failure.
  if (error && error.code !== 'PGRST116') throw new Error(`[forms-completion] getDayRange() latest read failed -- ${error.code}: ${error.message}`);
  latest = data?.occurrence_key || null;
  const daysSince = latest ? Math.floor((today - new Date(latest)) / 86400000) : DAYS_BACK;
  const back = Math.min(Math.max(DAYS_RECENT, daysSince + DAYS_RECENT), DAYS_BACK);
  return { start: fmtDate(addDay(today, -back)), end: fmtDate(today) };
}

// ── Playwright fallback ────────────────────────────────────────────────────────────────
// Dispatch #71 follow-up: the first version of this fallback sniffed the x-auth-token
// REQUEST HEADER off any home.myqsrsoft.com call, and used waitForLoadState('networkidle')
// as the login-complete signal. A live run showed it never captures a token on this host --
// "[auth] could not capture x-auth-token via Playwright" -- which is exactly the race and
// the wrong-token-source qsrsoft-forms-pull.mjs (the sibling script that already pulls form
// TEMPLATES from this same forms.home.myqsrsoft.com host, and works) already diagnosed and
// fixed: networkidle resolves ~3s after the click, before the SPA's auth request has even
// fired (v4.853), and the API wants the Cognito ID token (token_use:"id"), which the SPA
// persists to localStorage/sessionStorage under a `.idToken`-suffixed key -- not necessarily
// whatever happens to appear in a request header in the sniff window. Mirrors that script's
// captureToken() verbatim rather than re-deriving a second, worse version of it.
async function viaPlaywright(chunks, tracker) {
  const u = process.env.QSRSOFT_USERNAME, pw = process.env.QSRSOFT_PASSWORD;
  if (!u || !pw) { console.error('[auth] no QSRSOFT_USERNAME/PASSWORD -- cannot use Playwright fallback'); return { grand: 0, coveredLocs: new Set() }; }
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ userAgent: HDRS('')['User-Agent'] })).newPage();
  page.setDefaultTimeout(180000);
  let sniffed = null;
  page.on('request', req => {
    if (sniffed) return;
    if (req.url().includes('home.myqsrsoft.com')) {
      const t = req.headers()['x-auth-token'];
      if (t && t.length > 20) sniffed = t;
    }
  });
  try {
    await page.goto('https://v3.myqsrsoft.com', { waitUntil: 'networkidle', timeout: 45000 });
    const userSel = ['input[name="username"]', 'input[name="email"]', 'input[type="email"]', '#username', '#email'].join(', ');
    const passSel = 'input[type="password"], input[name="password"]';
    const subSel = 'button[type="submit"], input[type="submit"], .btn-primary, button:has-text("Login"), button:has-text("Sign in")';
    try {
      await page.waitForSelector(userSel, { timeout: 20000 });
      await page.fill(userSel, u);
      await page.fill(passSel, pw);
      await page.click(subSel);
      // Completion signal is the password field detaching as the SPA leaves the login
      // screen, NOT networkidle -- see comment above.
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline) {
        const stillOnLogin = await page.locator(passSel).count().catch(() => 1);
        if (!stillOnLogin) break;
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (e) { console.log('[auth] login step:', e.message); }
    await new Promise(r => setTimeout(r, 3000)); // let the SPA hydrate + persist tokens

    const readIdToken = () => page.evaluate(() => {
      const scan = (store) => {
        let hit = null;
        for (let i = 0; i < store.length; i++) {
          const k = store.key(i);
          if (/\.idToken$/.test(k)) { const v = store.getItem(k); if (v && v.length > 20) hit = v; }
        }
        return hit;
      };
      return scan(window.localStorage) || scan(window.sessionStorage) || null;
    }).catch(() => null);

    let token = await readIdToken();
    if (!token) {
      await page.goto('https://v3.myqsrsoft.com/forms/manage', { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 4000));
      token = await readIdToken() || sniffed;
    }
    if (!token) {
      const keys = await page.evaluate(() => ({
        url: location.href,
        ls: Object.keys(window.localStorage || {}),
        ss: Object.keys(window.sessionStorage || {}),
      })).catch(() => ({}));
      console.error('[auth] ✗ could not capture ID token. url=' + (keys.url || '?'));
      console.error('[auth]   localStorage keys: ' + (keys.ls || []).join(', ').slice(0, 800));
      console.error('[auth]   sessionStorage keys: ' + (keys.ss || []).join(', ').slice(0, 400));
      return { grand: 0, coveredLocs: new Set() };
    }
    console.log(`[auth] ✓ captured ID token${token === sniffed ? ' (via header sniff)' : ' (via storage)'} (${token.length} chars)`);
    let grand = 0;
    const coveredLocs = new Set();
    for (const c of chunks) {
      try {
        const rows = await fetchWindow(token, c.start, c.end, page);
        const { saved, locs } = await upsertRows(rows);
        for (const l of locs) coveredLocs.add(l);
        console.log(`[forms-completion] ${c.start}..${c.end}: ${rows.length} row(s) -> ${saved} saved`);
        grand += saved;
      } catch (e) {
        console.error(`[forms-completion] ${c.start}..${c.end} ERROR: ${e.message}`);
        tracker?.fail(`${c.start}..${c.end}`, e.message);
      }
    }
    return { grand, coveredLocs };
  } finally { await browser.close(); }
}

async function runDirect(chunks, tracker) {
  let grand = 0;
  const coveredLocs = new Set();
  for (const c of chunks) {
    try {
      let token = await getFreshToken();
      let rows;
      try {
        rows = await fetchWindow(token, c.start, c.end, null);
      } catch (e) {
        if (String(e.message).startsWith('AUTH_FAILED')) {
          console.log(`[forms-completion] ${c.start}..${c.end}: cached token rejected -- forcing a re-mint and retrying once`);
          token = await getFreshToken({ forceRemint: true });
          rows = await fetchWindow(token, c.start, c.end, null);
        } else throw e;
      }
      const { saved, dropped, locs } = await upsertRows(rows);
      for (const l of locs) coveredLocs.add(l);
      console.log(`[forms-completion] ${c.start}..${c.end}: ${rows.length} row(s) -> ${saved} saved${dropped ? `, ${dropped} dropped` : ''}`);
      grand += saved;
      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      if (String(e.message).startsWith('AUTH_FAILED')) throw e; // let the caller fall back to Playwright
      console.error(`[forms-completion] ${c.start}..${c.end} ERROR: ${e.message}`);
      tracker?.fail(`${c.start}..${c.end}`, e.message);
    }
  }
  return { grand, coveredLocs };
}

// Dispatch #71 -- the direct path's own fallback trigger (runDirect's thrown AUTH_FAILED on
// 401/403) can never fire against a host that denies a token-only request with 200 + [] instead
// of a 4xx: forms.home.myqsrsoft.com's auth shape was ASSUMED, never confirmed, unlike
// api.reports.myqsrsoft.com (CLAUDE.md's own documented "requires browser session cookies" case
// for that sibling host). A live run returned zero rows across every chunk of a window
// independently confirmed (by hand, and in Completion_Details.xlsx) to hold thousands of real
// rows -- the two very different conditions "authorized, genuinely nothing scheduled" and "not
// really authorized" were producing byte-identical output, same shape as #66's swallowed nav
// error one layer out. This estate runs 27 active stores on QSRSoft Forms daily; a real
// zero-total across every chunk in a rolling sync is never an expected outcome, so any all-zero
// direct-path result is retried via the Playwright path before the run is allowed to report its
// (possibly false) zero.
//
// Extracted from main() and given injectable direct/playwright callables specifically so this
// escalation DECISION is unit-testable without a real network/Supabase/browser -- the brief's own
// verification bar asks for a test that the Playwright path is actually ATTEMPTED on a 200-empty
// result, not merely that some internal flag flips.
export async function pullWithEscalation(chunks, tracker, { runDirectFn = runDirect, viaPlaywrightFn = viaPlaywright } = {}) {
  try {
    const r = await runDirectFn(chunks, tracker);
    if (r.grand > 0) return r;
    console.log('[forms-completion] direct path saved 0 row(s) across all chunks -- a silent-empty '
      + '200 is indistinguishable from a real auth denial on this host (dispatch #71); escalating '
      + 'to the Playwright fallback to check before trusting the zero');
    const pw = await viaPlaywrightFn(chunks, tracker);
    if (pw.grand > 0) {
      console.log(`[forms-completion] Playwright fallback recovered ${pw.grand} row(s) the direct `
        + 'path silently missed -- the direct path\'s auth is confirmed broken for this host, not '
        + 'merely an empty period');
      return pw;
    }
    console.log('[forms-completion] Playwright fallback also saved 0 row(s) -- the direct path\'s '
      + 'zero appears genuine (or Playwright itself could not authenticate; check the log above)');
    return r;
  } catch (e) {
    console.log(`[auth] mint-and-fetch failed (${e.message}) -- falling back to Playwright`);
    return await viaPlaywrightFn(chunks, tracker);
  }
}

async function main() {
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[forms-completion] missing Supabase env'); process.exit(1);
  }
  const { start, end } = await getDayRange();
  const chunks = chunkDays(start, end, CHUNK_DAYS);
  console.log(`[forms-completion] pulling ${start}..${end} in ${chunks.length} chunk(s) of ≤${CHUNK_DAYS} day(s)`);

  const tracker = makeOutcomeTracker('forms-completion-pull');
  const { grand: total, coveredLocs } = await pullWithEscalation(chunks, tracker);
  console.log(`[forms-completion] done -- ${total} row(s) upserted for ${start}..${end}.`);

  logPartitionCoverage(coveredLocs, STORE_NSNS.map(n => n.padStart(7, '0')), { label: 'forms-completion-pull', kind: 'store' });

  const { data: latestRow } = await supabase.from('qsr_forms_completion')
    .select('occurrence_key').order('occurrence_key', { ascending: false }).limit(1).single().then(r => r, () => ({ data: null }));
  const fresh = checkFreshness(latestRow?.occurrence_key || null, { warnAfterHours: 30, errorAfterHours: 54, label: 'forms-completion-pull' });
  if (fresh.message) (fresh.status === 'error' ? console.error : console.warn)(fresh.message);

  const code = tracker.finalize({
    requestedUnits: chunks.map(c => `${c.start}..${c.end}`), totalSaved: total,
    formatRerun: () => `QSRSOFT_FORMS_COMPLETION_START_DATE=${start} QSRSOFT_FORMS_COMPLETION_END_DATE=${end}`,
  });
  process.exit(code);
}

// Dispatch #71 -- this script was missing the guard every sibling pull script has
// (qsrsoft-security-events-pull.mjs, qsrsoft-register-audit-pull.mjs): without it, main() ran
// unconditionally on import, so importing this module for pullWithEscalation/its other pure
// helpers under vitest would kick off a real network/Supabase run and crash the test process on
// process.exit(). Only run main() when executed directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error('[forms-completion-pull] FATAL:', e); process.exit(1); });
}
