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

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const fmtDate = d => d.toISOString().slice(0, 10);
const addDay  = (d, n) => { const r = new Date(d); r.setUTCDate(r.getUTCDate() + n); return r; };

// Same auth shape as ops-pull's HDRS -- forms.home confirmed token-only (no Cookie) via the
// owner's DevTools request-header panel; this differs from api.reports only in host + method.
const HDRS = t => ({
  'X-Auth-Token': t, 'Accept': '*/*', 'Content-Type': 'application/json',
  'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
});

async function fetchWindow(token, startDay, endDay, evalPage) {
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
    return Array.isArray(res.rows) ? res.rows : (res.rows?.result || []);
  }
  const resp = await fetch(url, { method: 'POST', headers: HDRS(token), body });
  if (resp.status === 401 || resp.status === 403) throw new Error(`AUTH_FAILED:${resp.status}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const parsed = await resp.json();
  return Array.isArray(parsed) ? parsed : (parsed?.result || []);
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

// ── Playwright fallback (mirrors qsrsoft-ops-pull.mjs's viaPlaywright) ───────────────────
async function viaPlaywright(chunks, tracker) {
  const u = process.env.QSRSOFT_USERNAME, pw = process.env.QSRSOFT_PASSWORD;
  if (!u || !pw) { console.error('[auth] no QSRSOFT_USERNAME/PASSWORD -- cannot use Playwright fallback'); return 0; }
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ userAgent: HDRS('')['User-Agent'] })).newPage();
  page.setDefaultTimeout(180000);
  let token = null;
  page.on('request', req => {
    if (!req.url().includes('home.myqsrsoft.com')) return;
    const t = req.headers()['x-auth-token'];
    if (t && t.length > 20 && !token) token = t;
  });
  try {
    await page.goto('https://v3.myqsrsoft.com', { waitUntil: 'networkidle', timeout: 45000 });
    const userSel = ['input[name="username"]', 'input[name="email"]', 'input[type="email"]', '#username', '#email'].join(', ');
    await page.waitForSelector(userSel, { timeout: 20000 });
    await page.fill(userSel, u);
    await page.fill('input[type="password"], input[name="password"]', pw);
    await page.click('button[type="submit"], input[type="submit"], .btn-primary, button:has-text("Login"), button:has-text("Sign in")');
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    if (!token) {
      // Nudge the app to fire a forms.home request the listener above can sniff.
      await page.goto('https://v3.myqsrsoft.com/forms/manage', { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 4000));
    }
    if (!token) { console.error('[auth] ✗ could not capture x-auth-token via Playwright'); return 0; }
    console.log(`[auth] ✓ token captured via Playwright (${token.length} chars)`);
    let grand = 0;
    for (const c of chunks) {
      try {
        const rows = await fetchWindow(token, c.start, c.end, page);
        const { saved } = await upsertRows(rows);
        console.log(`[forms-completion] ${c.start}..${c.end}: ${rows.length} row(s) -> ${saved} saved`);
        grand += saved;
      } catch (e) {
        console.error(`[forms-completion] ${c.start}..${c.end} ERROR: ${e.message}`);
        tracker?.fail(`${c.start}..${c.end}`, e.message);
      }
    }
    return grand;
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

async function main() {
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[forms-completion] missing Supabase env'); process.exit(1);
  }
  const { start, end } = await getDayRange();
  const chunks = chunkDays(start, end, CHUNK_DAYS);
  console.log(`[forms-completion] pulling ${start}..${end} in ${chunks.length} chunk(s) of ≤${CHUNK_DAYS} day(s)`);

  const tracker = makeOutcomeTracker('forms-completion-pull');
  let total = 0, coveredLocs = new Set();
  try {
    const r = await runDirect(chunks, tracker);
    total = r.grand; coveredLocs = r.coveredLocs;
  } catch (e) {
    console.log(`[auth] mint-and-fetch failed (${e.message}) -- falling back to Playwright`);
    total = await viaPlaywright(chunks, tracker);
  }
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

main().catch(e => { console.error('[forms-completion-pull] FATAL:', e); process.exit(1); });
