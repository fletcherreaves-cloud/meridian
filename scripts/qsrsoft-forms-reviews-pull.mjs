#!/usr/bin/env node
// scripts/qsrsoft-forms-reviews-pull.mjs
// QSRSoft Forms — MCDOK People confidential review occurrences (Crew Review, Crew Trainer
// Review, Maintenance Review, Shift Manager Review).
//
// NOT an extension of qsrsoft-forms-completion-pull.mjs -- a separate source. MEASURED live
// 2026-10-08 (memory/finding-qsrsoft-review-forms-schedules-endpoint-2026-10-08.md): these 4
// forms return ZERO rows from completionDetail/completionByForm (the endpoints that script
// reads); they appear only via a third endpoint:
//   GET https://forms.home.myqsrsoft.com/api/forms/schedules/scheduled
//       ?orgId=...&userId=...&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
//       &weekStartDate=...&weekEndDate=...&monthStartDate=...&monthEndDate=...
//       &locations=<27 unpadded NSNs, comma-joined>
// Returns an array of `{response, form}` pairs -- `response` present only once an occurrence
// has been STARTED (no response = not yet started, not a "missed" the way completionDetail
// means it -- this endpoint has no missed/open concept at all).
//
// 🔴 TWO MEASURED ENDPOINT QUIRKS THIS SCRIPT IS BUILT AROUND (both from the finding file --
// do not "simplify" either away without re-measuring):
//   1. startDate === endDate (a single calendar day) returns ZERO rows, for every form, not
//      just these four. CHUNK_DAYS must never produce a 1-day-wide request; MIN_CHUNK_DAYS=2
//      enforces a floor under any future tuning of the env var.
//   2. A WIDER window can silently return FEWER of today's rows than a narrower one -- a 7-day
//      probe returned MORE total rows (2,748) than a 3-day probe (937) but caught only 2 of the
//      3-day probe's 157 target-form matches for the current day. This is the same class of
//      silent-truncation risk qsrsoft-forms-completion-pull.mjs's own header already documents
//      for this host family ("a naive year-long backfill could silently truncate"); the fix is
//      the same -- short, overlapping CHUNK_DAYS windows, never one wide call. Default 3 days,
//      matching that sibling's own measured-safe size. Chunks may overlap in date range; upsert
//      on (loc, form_id, started_at) makes a re-fetched occurrence a no-op, not a duplicate.
//
// 🔴 NO "submitted" FLAG EXISTS ON THE SOURCE -- see src/engine/forms-reviews.js's header.
// completion_ratio (answered/total) is stored as a raw fact; this script does not compute or
// store any derived "is this done" boolean.
//
// 🎯 SCORE + CONTENT (added same pass, measured live 2026-10-08) -- a SEPARATE, heavier GET per
// occurrence:
//   GET https://forms.home.myqsrsoft.com/api/forms/responses/questions
//       ?orgId=...&formId=...&userId=...&startedAt=...
// Returns the full per-question answer + pointsReceived for ONE occurrence. The real dashboard
// Score is points-weighted (Σ pointsReceived / Σ pointsPossible), NOT completion_ratio -- see
// src/engine/forms-reviews.js's normalizeFormsReviewContent() and its header for the full
// capture, including the PII allow-list rationale (these forms embed a free-text "Current Wage"
// question; only structured rating questions are ever stored).
// 🔴 Crew Review is skipped entirely for this call -- measured 11/11 sampled responses 403
// "not authorized to view this confidential response" for the pulling account.
// CONTENT_ACCESSIBLE_FORM_IDS (forms-reviews.js) encodes this so the pull doesn't spend an API
// call per Crew Review occurrence on a request known to always fail.
//
// Auth: getFreshToken()-equivalent (inlined below, same Cognito USER_PASSWORD_AUTH shape as
// scripts/lib/qsrsoft-auth.mjs) with a Playwright fallback, same two-path pattern every
// sibling QSRSoft pull uses. QSRSOFT_USERNAME/PASSWORD serve both paths.
//
// Manual-upload fallback: DELIBERATELY NOT BUILT, same reasoning as
// qsrsoft-forms-completion-pull.mjs's own header -- nobody has ever hand-logged MCDOK People
// review completion outside QSRSoft itself, so there is no pre-existing manual workflow to
// protect. A dark pull's correct failure mode is sync-failure-watch.yml's own alert, not a new
// spreadsheet-upload UI for data that was never on paper.
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, QSRSOFT_USERNAME, QSRSOFT_PASSWORD
// Optional:
//   QSRSOFT_FORMS_REVIEWS_DAYS_BACK    -- max history on first run (default: 14)
//   QSRSOFT_FORMS_REVIEWS_DAYS_RECENT  -- rolling re-pull window (default: 4)
//   QSRSOFT_FORMS_REVIEWS_START_DATE   -- explicit backfill start (YYYY-MM-DD)
//   QSRSOFT_FORMS_REVIEWS_END_DATE     -- explicit backfill end (YYYY-MM-DD, default: today)
//   QSRSOFT_FORMS_REVIEWS_CHUNK_DAYS   -- days per API call (default: 3, floor 2 -- see quirk 1 above)
//   QSRSOFT_FORMS_REVIEWS_DEBUG=1

import { safeCreateClient } from './lib/safe-supabase-client.mjs';
import { getFreshToken } from './lib/qsrsoft-auth.mjs';
import { makeOutcomeTracker } from './lib/pull-outcome.mjs';
import { logPartitionCoverage, checkFreshness } from './_pipeline-contract.mjs';
import { normalizeFormsReviewRows, normalizeFormsReviewContent, REVIEW_FORMS, CONTENT_ACCESSIBLE_FORM_IDS } from '../src/engine/forms-reviews.js';

const BASE = 'https://forms.home.myqsrsoft.com';
const ORG_ID = 'a546d4ef-684a-4f25-8bc0-6580af068875';
// Tied to the authenticated QSRSOFT_USERNAME/PASSWORD account (owner, Fletcher Reaves) --
// this endpoint requires userId and is only confirmed working for an account these 4 forms'
// predefinedSharedWith actually lists. A different QSRSOFT_USERNAME would need re-measuring,
// not just swapping this constant.
const USER_ID = '26a9c0de-c5f8-4712-b7a4-37a8160c7b28';
const STORE_NSNS = [
  3708, 5183, 5985, 6178, 6838, 6972, 10034, 10422, 10915, 11657, 13113, 18213,
  20475, 24471, 29760, 31357, 32525, 33109, 33222, 33704, 34222, 35064, 35242,
  37566, 38609, 43380, 43701,
].map(String);

const MIN_CHUNK_DAYS = 2; // quirk 1 above -- a 1-day-wide request returns zero rows, for every form
const DAYS_BACK   = parseInt(process.env.QSRSOFT_FORMS_REVIEWS_DAYS_BACK   || '14', 10);
const DAYS_RECENT = parseInt(process.env.QSRSOFT_FORMS_REVIEWS_DAYS_RECENT || '4',  10);
const START_DATE  = (process.env.QSRSOFT_FORMS_REVIEWS_START_DATE || '').trim();
const END_DATE    = (process.env.QSRSOFT_FORMS_REVIEWS_END_DATE   || '').trim();
const CHUNK_DAYS  = Math.max(MIN_CHUNK_DAYS, parseInt(process.env.QSRSOFT_FORMS_REVIEWS_CHUNK_DAYS || '3', 10));
const DEBUG       = process.env.QSRSOFT_FORMS_REVIEWS_DEBUG === '1';

// Dispatch pattern (qsrsoft-security-events-pull.mjs, qsrsoft-register-audit-pull.mjs,
// qsrsoft-forms-completion-pull.mjs) -- keeps this module importable under vitest, where
// neither env var is set.
const supabase = (process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  ? safeCreateClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

const fmtDate = d => d.toISOString().slice(0, 10);
const addDay  = (d, n) => { const r = new Date(d); r.setUTCDate(r.getUTCDate() + n); return r; };

const HDRS = t => ({
  'X-Auth-Token': t, 'Accept': '*/*', 'Content-Type': 'application/json',
  'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
});

function scheduledUrl(startDate, endDate) {
  return `${BASE}/api/forms/schedules/scheduled?orgId=${ORG_ID}&userId=${USER_ID}`
    + `&startDate=${startDate}&endDate=${endDate}`
    + `&weekStartDate=${startDate}&weekEndDate=${endDate}`
    + `&monthStartDate=${startDate}&monthEndDate=${endDate}`
    + `&locations=${STORE_NSNS.join(',')}`;
}

export async function fetchWindow(token, startDay, endDay, evalPage) {
  const url = scheduledUrl(startDay, endDay);
  if (evalPage) {
    const res = await evalPage.evaluate(async ({ url, token }) => {
      try {
        const r = await fetch(url, {
          method: 'GET',
          headers: { 'X-Auth-Token': token, 'Accept': '*/*', 'Content-Type': 'application/json', 'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/' },
        });
        if (!r.ok) return { error: `HTTP ${r.status}` };
        return { rows: await r.json() };
      } catch (e) { return { error: e.message }; }
    }, { url, token });
    if (res.error) throw new Error(res.error);
    return Array.isArray(res.rows) ? res.rows : (res.rows?.results || res.rows?.result || []);
  }
  const resp = await fetch(url, { method: 'GET', headers: HDRS(token) });
  if (resp.status === 401 || resp.status === 403) throw new Error(`AUTH_FAILED:${resp.status}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const parsed = await resp.json();
  return Array.isArray(parsed) ? parsed : (parsed?.results || parsed?.result || []);
}

function responseQuestionsUrl(formId, userId, startedAt) {
  return `${BASE}/api/forms/responses/questions?orgId=${ORG_ID}&formId=${formId}`
    + `&userId=${userId}&startedAt=${encodeURIComponent(startedAt)}`;
}

// Returns null (not throws) on the measured 403 "not authorized to view this confidential
// response" -- an EXPECTED outcome for some occurrences (see CONTENT_ACCESSIBLE_FORM_IDS's own
// header), not a transient failure worth retrying or failing the pull over. Throws on anything
// else (a real network/auth problem), same as fetchWindow.
export async function fetchResponseContent(token, formId, userId, startedAt, evalPage) {
  const url = responseQuestionsUrl(formId, userId, startedAt);
  if (evalPage) {
    const res = await evalPage.evaluate(async ({ url, token }) => {
      try {
        const r = await fetch(url, { method: 'GET', headers: { 'X-Auth-Token': token, 'Accept': '*/*', 'Content-Type': 'application/json', 'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/' } });
        if (r.status === 403) return { denied: true };
        if (!r.ok) return { error: `HTTP ${r.status}` };
        return { body: await r.json() };
      } catch (e) { return { error: e.message }; }
    }, { url, token });
    if (res.denied) return null;
    if (res.error) throw new Error(res.error);
    return res.body?.questions || [];
  }
  const resp = await fetch(url, { method: 'GET', headers: HDRS(token) });
  if (resp.status === 403) return null;
  if (resp.status === 401) throw new Error('AUTH_FAILED:401');
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const parsed = await resp.json();
  return parsed?.questions || [];
}

async function upsertRows(rawRows, token, evalPage) {
  const mapped = normalizeFormsReviewRows(rawRows).map(r => ({
    loc: r.loc, form_id: r.formId, started_at: r.startedAt, form_title: r.formTitle,
    total_questions: r.totalQuestions, answered_questions: r.answeredQuestions,
    completion_ratio: r.completionRatio, reviewer_user_id: r.reviewerUserId,
    reviewed_with: r.reviewedWith, is_confidential: r.isConfidential,
    shared_with: r.sharedWith, is_deleted: r.isDeleted,
    score_points_possible: null, score_points_received: null, score_pct: null,
    content: [], content_available: false,
    updated_at: new Date().toISOString(),
  }));
  if (DEBUG) console.log(`[forms-reviews] ${rawRows.length} raw entries -> ${mapped.length} target-form occurrence(s)`);

  // Content/score pass -- one extra GET per occurrence whose form is known-accessible (see
  // CONTENT_ACCESSIBLE_FORM_IDS's header). Paced with a short delay; a failure on any single
  // occurrence is logged and leaves that row's content_available=false rather than aborting the
  // whole chunk -- the metadata half of the row (already mapped above) is still worth saving.
  for (const row of mapped) {
    if (!CONTENT_ACCESSIBLE_FORM_IDS.has(row.form_id) || !row.reviewer_user_id) continue;
    try {
      const questions = await fetchResponseContent(token, row.form_id, row.reviewer_user_id, row.started_at, evalPage);
      if (questions) {
        const c = normalizeFormsReviewContent(questions);
        row.score_points_possible = c.scorePointsPossible;
        row.score_points_received = c.scorePointsReceived;
        row.score_pct = c.scorePct;
        row.content = c.content;
        row.content_available = true;
      }
      await new Promise(r => setTimeout(r, 150));
    } catch (e) {
      if (String(e.message).startsWith('AUTH_FAILED')) throw e; // let the caller's retry/escalation see this
      if (DEBUG) console.log(`[forms-reviews] content fetch failed for ${row.form_id}/${row.started_at}: ${e.message}`);
    }
  }

  const CHUNK = 500;
  let saved = 0;
  for (let i = 0; i < mapped.length; i += CHUNK) {
    const { error } = await supabase.from('qsr_forms_reviews')
      .upsert(mapped.slice(i, i + CHUNK), { onConflict: 'tenant_id,loc,form_id,started_at' });
    if (error) throw new Error(`[qsr_forms_reviews] ${error.message}`);
    saved += Math.min(CHUNK, mapped.length - i);
  }
  return { saved, locs: new Set(mapped.map(r => r.loc)) };
}

export function chunkDays(start, end, chunkSize) {
  const chunks = [];
  let cur = new Date(`${start}T00:00:00.000Z`);
  const endD = new Date(`${end}T00:00:00.000Z`);
  while (cur <= endD) {
    let chunkEnd = new Date(Math.min(addDay(cur, chunkSize - 1).getTime(), endD.getTime()));
    // quirk 1 -- a single-day-wide request (start === end) returns ZERO rows, for every form.
    // Extend the end forward by one day whenever that would otherwise happen -- whether the
    // WHOLE requested range is one day, or this is just a trailing remainder chunk. Overshooting
    // the nominal end by a day is harmless (upsert on (loc, form_id, started_at) makes the
    // overlap with the next pull a no-op); returning zero rows for a real day is not.
    if (fmtDate(chunkEnd) === fmtDate(cur)) chunkEnd = addDay(chunkEnd, 1);
    chunks.push({ start: fmtDate(cur), end: fmtDate(chunkEnd) });
    cur = addDay(chunkEnd, 1);
  }
  return chunks;
}

async function getDayRange() {
  const today = new Date();
  if (START_DATE) return { start: START_DATE, end: END_DATE || fmtDate(today) };
  let latest = null;
  const { data, error } = await supabase.from('qsr_forms_reviews')
    .select('started_at').order('started_at', { ascending: false }).limit(1).single();
  if (error && error.code !== 'PGRST116') throw new Error(`[forms-reviews] getDayRange() latest read failed -- ${error.code}: ${error.message}`);
  latest = data?.started_at || null;
  const daysSince = latest ? Math.floor((today - new Date(latest)) / 86400000) : DAYS_BACK;
  const back = Math.min(Math.max(DAYS_RECENT, daysSince + DAYS_RECENT), DAYS_BACK);
  return { start: fmtDate(addDay(today, -back)), end: fmtDate(today) };
}

// ── Playwright fallback ────────────────────────────────────────────────────────────────
// Mirrors qsrsoft-forms-completion-pull.mjs's viaPlaywright() verbatim in shape (same host
// family, same measured login-completion signal and token-capture strategy) -- see that
// script's own comment for why networkidle and a request-header sniff are NOT the signal used.
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
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline) {
        const stillOnLogin = await page.locator(passSel).count().catch(() => 1);
        if (!stillOnLogin) break;
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (e) { console.log('[auth] login step:', e.message); }
    await new Promise(r => setTimeout(r, 3000));

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
      console.error('[auth] ✗ could not capture ID token via Playwright');
      return { grand: 0, coveredLocs: new Set() };
    }
    console.log(`[auth] ✓ captured ID token${token === sniffed ? ' (via header sniff)' : ' (via storage)'} (${token.length} chars)`);
    let grand = 0;
    const coveredLocs = new Set();
    for (const c of chunks) {
      try {
        const rows = await fetchWindow(token, c.start, c.end, page);
        const { saved, locs } = await upsertRows(rows, token, page);
        for (const l of locs) coveredLocs.add(l);
        console.log(`[forms-reviews] ${c.start}..${c.end}: ${rows.length} raw entries -> ${saved} saved`);
        grand += saved;
      } catch (e) {
        console.error(`[forms-reviews] ${c.start}..${c.end} ERROR: ${e.message}`);
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
          console.log(`[forms-reviews] ${c.start}..${c.end}: cached token rejected -- forcing a re-mint and retrying once`);
          token = await getFreshToken({ forceRemint: true });
          rows = await fetchWindow(token, c.start, c.end, null);
        } else throw e;
      }
      const { saved, locs } = await upsertRows(rows, token, null);
      for (const l of locs) coveredLocs.add(l);
      console.log(`[forms-reviews] ${c.start}..${c.end}: ${rows.length} raw entries -> ${saved} saved`);
      grand += saved;
      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      if (String(e.message).startsWith('AUTH_FAILED')) throw e;
      console.error(`[forms-reviews] ${c.start}..${c.end} ERROR: ${e.message}`);
      tracker?.fail(`${c.start}..${c.end}`, e.message);
    }
  }
  return { grand, coveredLocs };
}

// Same escalation shape as qsrsoft-forms-completion-pull.mjs's pullWithEscalation -- a 200 with
// zero rows and a real auth denial can look identical on this host family, so an all-zero direct
// result gets one Playwright-backed check before the run is allowed to report that zero.
export async function pullWithEscalation(chunks, tracker, { runDirectFn = runDirect, viaPlaywrightFn = viaPlaywright } = {}) {
  try {
    const r = await runDirectFn(chunks, tracker);
    if (r.grand > 0) return r;
    console.log('[forms-reviews] direct path saved 0 row(s) across all chunks -- escalating to the Playwright fallback to check before trusting the zero');
    const pw = await viaPlaywrightFn(chunks, tracker);
    if (pw.grand > 0) {
      console.log(`[forms-reviews] Playwright fallback recovered ${pw.grand} row(s) the direct path missed`);
      return pw;
    }
    console.log('[forms-reviews] Playwright fallback also saved 0 row(s) -- the direct path\'s zero appears genuine');
    return r;
  } catch (e) {
    console.log(`[auth] mint-and-fetch failed (${e.message}) -- falling back to Playwright`);
    return await viaPlaywrightFn(chunks, tracker);
  }
}

async function main() {
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[forms-reviews] missing Supabase env'); process.exit(1);
  }
  const { start, end } = await getDayRange();
  const chunks = chunkDays(start, end, CHUNK_DAYS);
  console.log(`[forms-reviews] pulling ${start}..${end} in ${chunks.length} chunk(s) of ~${CHUNK_DAYS} day(s), targeting: ${Object.values(REVIEW_FORMS).join(', ')}`);

  const tracker = makeOutcomeTracker('forms-reviews-pull');
  const { grand: total, coveredLocs } = await pullWithEscalation(chunks, tracker);
  console.log(`[forms-reviews] done -- ${total} occurrence(s) upserted for ${start}..${end}.`);

  logPartitionCoverage(coveredLocs, STORE_NSNS.map(n => n.padStart(7, '0')), { label: 'forms-reviews-pull', kind: 'store' });

  const { data: latestRow } = await supabase.from('qsr_forms_reviews')
    .select('started_at').order('started_at', { ascending: false }).limit(1).single().then(r => r, () => ({ data: null }));
  // Warn-only thresholds, wider than the sibling's -- these 4 forms are conducted far less often
  // than a daily shift checklist (per-store, not per-day), so "no new occurrence in N hours" is
  // not itself an outage signal the way a dark DAILY stream is.
  const fresh = checkFreshness(latestRow?.started_at || null, { warnAfterHours: 72, errorAfterHours: 168, label: 'forms-reviews-pull' });
  if (fresh.message) (fresh.status === 'error' ? console.error : console.warn)(fresh.message);

  const code = tracker.finalize({
    requestedUnits: chunks.map(c => `${c.start}..${c.end}`), totalSaved: total,
    formatRerun: () => `QSRSOFT_FORMS_REVIEWS_START_DATE=${start} QSRSOFT_FORMS_REVIEWS_END_DATE=${end}`,
  });
  process.exit(code);
}

// Guard matching every sibling pull script -- without it, importing this module for
// pullWithEscalation/fetchWindow/chunkDays under vitest would kick off a real network/Supabase
// run and crash the test process on process.exit().
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error('[forms-reviews-pull] FATAL:', e); process.exit(1); });
}
