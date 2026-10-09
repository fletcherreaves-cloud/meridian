#!/usr/bin/env node
// scripts/probe-crew-review-confidential-access.mjs — settles the owner's question: "they are
// all, or should be, marked confidential, so not sure that is the issue" (re: why Crew Review's
// content/score is the one of the 4 MCDOK People review forms that comes back 403 "You are not
// authorized to view this confidential response" -- see src/engine/forms-reviews.js's header and
// memory/finding-qsrsoft-review-forms-schedules-endpoint-2026-10-08.md's "Crew Review's
// content/score is NOT reachable" section). That measurement called the endpoint with a bare
// `X-Auth-Token` fetch, no browser cookies. CLAUDE.md's own dev rules already document ONE QSRSoft
// host family (api.reports.myqsrsoft.com) where a bare token-only fetch 401s and a browser-session
// (cookie-bearing) fetch succeeds -- that was never tested here. This probe tests it directly,
// plus whether `sharedWith` on the raw response actually differs between Crew Review and the 3
// forms that already work, which is the other half of "is 'confidential' really the gate".
//
// Three independent checks, same N sampled occurrences from each form:
//   1. sharedWith/isConfidential/anonymous shape comparison (schedule-list data only, no extra
//      calls) -- does Crew Review's raw response actually look different from the other 3, or do
//      they all carry the SAME isConfidential:true / same sharedWith membership?
//   2. bare X-Auth-Token fetch to responses/questions (reconfirms the original 11/11-denied
//      measurement, now against a fresh sample, and against the 3 "working" forms as a control).
//   3. the SAME call made with evalPage (in-browser fetch, real session cookies attached) after a
//      real Playwright SPA login -- isolates whether the denial is COOKIE-shaped (same mechanism
//      as api.reports) or a genuine per-account/per-form entitlement that a browser session
//      doesn't change either.
//
// Verdict logic at the bottom reads the three checks together and names which of the three
// explanations survived: (a) sharedWith genuinely excludes the owner on Crew Review responses
// specifically -> a QSRSoft-side review-assignment/approval-config difference, not a client bug;
// (b) cookies unlock it -> a client fix (same Playwright-evalPage path the pull already has for
// the schedule list, just also used for the content call); (c) neither explains it and even a
// full browser session still gets denied -> a QSRSoft account-entitlement question for this one
// form specifically, same shape as dispatch #63's api.security finding, not fixable from this repo.
//
// Read-only. No Supabase writes. No PII printed -- userIds are opaque QSRSoft UUIDs (never a
// name), and the one free-text PII land mine this repo already knows about ("Current Wage") is
// never read by this probe at all (it only ever inspects isConfidential/sharedWith/anonymous/
// totalQuestions/answeredQuestions and HTTP status codes, never `content`/`answer`).
//
// Required env: QSRSOFT_USERNAME, QSRSOFT_PASSWORD.
// Optional env:
//   PROBE_SAMPLE_SIZE   -- occurrences sampled per form (default: 5)
//   PROBE_DAYS_BACK      -- schedule window to sample from (default: 45, wide enough that Crew
//                           Review -- the least-scored of the 4 per the Review Forms panel -- has
//                           enough started occurrences to sample from)

import { getFreshToken } from './lib/qsrsoft-auth.mjs';
import { REVIEW_FORMS, CONTENT_ACCESSIBLE_FORM_IDS, normalizeFormsReviewRows } from '../src/engine/forms-reviews.js';

const BASE = 'https://forms.home.myqsrsoft.com';
const ORG_ID = 'a546d4ef-684a-4f25-8bc0-6580af068875';
const USER_ID = '26a9c0de-c5f8-4712-b7a4-37a8160c7b28'; // the owner's own QSRSoft userId, same constant as the pull script
const CREW_REVIEW_FORM_ID = '8c430399-a218-4b1f-aa85-89aca8cc441d';
const STORE_NSNS = [
  3708, 5183, 5985, 6178, 6838, 6972, 10034, 10422, 10915, 11657, 13113, 18213,
  20475, 24471, 29760, 31357, 32525, 33109, 33222, 33704, 34222, 35064, 35242,
  37566, 38609, 43380, 43701,
].map(String);

const SAMPLE_SIZE = parseInt(process.env.PROBE_SAMPLE_SIZE || '5', 10);
const DAYS_BACK = parseInt(process.env.PROBE_DAYS_BACK || '45', 10);

const fmtDate = d => d.toISOString().slice(0, 10);
const addDay = (d, n) => { const r = new Date(d); r.setUTCDate(r.getUTCDate() + n); return r; };

function scheduledUrl(startDate, endDate) {
  return `${BASE}/api/forms/schedules/scheduled?orgId=${ORG_ID}&userId=${USER_ID}`
    + `&startDate=${startDate}&endDate=${endDate}`
    + `&weekStartDate=${startDate}&weekEndDate=${endDate}`
    + `&monthStartDate=${startDate}&monthEndDate=${endDate}`
    + `&locations=${STORE_NSNS.join(',')}`;
}

function responseQuestionsUrl(formId, userId, startedAt) {
  return `${BASE}/api/forms/responses/questions?orgId=${ORG_ID}&formId=${formId}`
    + `&userId=${userId}&startedAt=${encodeURIComponent(startedAt)}`;
}

const BROWSER_HDRS = {
  'Accept': '*/*', 'Content-Type': 'application/json',
  'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
};

async function fetchSchedule(token, startDate, endDate) {
  // endDate exclusive -- see forms-reviews-pull.mjs's header. Pad one day past what we want.
  const resp = await fetch(scheduledUrl(startDate, fmtDate(addDay(new Date(`${endDate}T00:00:00.000Z`), 1))), {
    method: 'GET', headers: { ...BROWSER_HDRS, 'X-Auth-Token': token },
  });
  if (!resp.ok) throw new Error(`schedule fetch HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const parsed = await resp.json();
  return Array.isArray(parsed) ? parsed : (parsed?.results || parsed?.result || []);
}

async function fetchContentBare(token, formId, userId, startedAt) {
  const resp = await fetch(responseQuestionsUrl(formId, userId, startedAt), { method: 'GET', headers: { ...BROWSER_HDRS, 'X-Auth-Token': token } });
  const text = await resp.text();
  return { status: resp.status, snippet: text.slice(0, 160) };
}

async function fetchContentViaPage(page, token, formId, userId, startedAt) {
  const url = responseQuestionsUrl(formId, userId, startedAt);
  return page.evaluate(async ({ url, token }) => {
    try {
      // Deliberately NO explicit credentials:'include' override and NO Origin/Referer override --
      // this is the one call in this whole probe meant to behave exactly like the real SPA's own
      // same-origin-ish fetch would from inside an authenticated v3.myqsrsoft.com tab: the browser
      // attaches whatever cookies it already holds for this host automatically.
      const r = await fetch(url, { method: 'GET', headers: { 'X-Auth-Token': token, 'Accept': '*/*', 'Content-Type': 'application/json' } });
      const text = await r.text();
      return { status: r.status, snippet: text.slice(0, 160) };
    } catch (e) { return { status: 0, snippet: `fetch failed: ${e.message}` }; }
  }, { url, token });
}

function sample(rows, n) {
  // Evenly spread across history rather than the first N (which would all land in the most
  // recent few days) -- a stride pick, deterministic, no randomness to keep re-runs comparable.
  if (rows.length <= n) return rows;
  const stride = rows.length / n;
  const out = [];
  for (let i = 0; i < n; i++) out.push(rows[Math.floor(i * stride)]);
  return out;
}

async function loginViaPlaywright() {
  const u = process.env.QSRSOFT_USERNAME, pw = process.env.QSRSOFT_PASSWORD;
  if (!u || !pw) throw new Error('QSRSOFT_USERNAME/PASSWORD not set');
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ userAgent: BROWSER_HDRS['User-Agent'] })).newPage();
  page.setDefaultTimeout(180000);
  await page.goto('https://v3.myqsrsoft.com', { waitUntil: 'networkidle', timeout: 45000 });
  const userSel = ['input[name="username"]', 'input[name="email"]', 'input[type="email"]', '#username', '#email'].join(', ');
  const passSel = 'input[type="password"], input[name="password"]';
  const subSel = 'button[type="submit"], input[type="submit"], .btn-primary, button:has-text("Login"), button:has-text("Sign in")';
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
  await new Promise(r => setTimeout(r, 3000));
  // Visit a page under the forms app so the browser actually holds whatever session cookie (if
  // any) that subtree sets, not just whatever the generic SPA shell sets on first load.
  await page.goto('https://v3.myqsrsoft.com/forms/manage', { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));
  const cookieNames = (await page.context().cookies()).map(c => c.name);
  console.log(`[probe] post-login page url: ${page.url()}`);
  console.log(`[probe] cookies held for this session (names only): ${cookieNames.length ? cookieNames.join(', ') : '(none)'}`);
  return { browser, page };
}

async function main() {
  const token = await getFreshToken();
  const end = new Date();
  const start = addDay(end, -DAYS_BACK);
  console.log(`[probe] fetching schedule ${fmtDate(start)}..${fmtDate(end)} (${DAYS_BACK}d window)`);
  const raw = await fetchSchedule(token, fmtDate(start), fmtDate(end));
  const rows = normalizeFormsReviewRows(raw);
  console.log(`[probe] ${raw.length} raw schedule entries -> ${rows.length} target-form occurrence(s) across all 4 forms`);

  const byForm = new Map();
  for (const formId of Object.keys(REVIEW_FORMS)) byForm.set(formId, rows.filter(r => r.formId === formId));
  for (const [formId, formRows] of byForm) {
    console.log(`[probe] ${REVIEW_FORMS[formId]}: ${formRows.length} occurrence(s) in window`);
  }

  // ── Check 1: shape comparison, no extra calls ──────────────────────────────────────────────
  console.log('\n[probe] ── check 1: isConfidential / sharedWith shape, by form ──────────────────');
  const samples = new Map();
  for (const [formId, formRows] of byForm) {
    const picked = sample(formRows, SAMPLE_SIZE);
    samples.set(formId, picked);
    for (const r of picked) {
      console.log(`[probe] ${REVIEW_FORMS[formId]} | loc ${r.loc} | isConfidential=${r.isConfidential} `
        + `anonymous=${r.isDeleted === true ? '(deleted, skip)' : (raw.find(x => x?.response?.startedAt === r.startedAt && x?.response?.userId === r.reviewerUserId)?.response?.anonymous ?? '?')} `
        + `sharedWith.length=${r.sharedWith.length} ownerInSharedWith=${r.sharedWith.includes(USER_ID)} `
        + `reviewerIsOwner=${r.reviewerUserId === USER_ID} total=${r.totalQuestions} answered=${r.answeredQuestions}`);
    }
  }
  const allConfidentialFlags = rows.map(r => r.isConfidential);
  console.log(`[probe] isConfidential across ALL ${rows.length} sampled occurrences, all 4 forms: `
    + `true=${allConfidentialFlags.filter(Boolean).length} false=${allConfidentialFlags.filter(f => !f).length}`);
  const crewRows = samples.get(CREW_REVIEW_FORM_ID) || [];
  const crewOwnerIn = crewRows.filter(r => r.sharedWith.includes(USER_ID)).length;
  const otherSamples = [...samples.entries()].filter(([id]) => id !== CREW_REVIEW_FORM_ID).flatMap(([, v]) => v);
  const otherOwnerIn = otherSamples.filter(r => r.sharedWith.includes(USER_ID)).length;
  console.log(`[probe] owner present in sharedWith: Crew Review ${crewOwnerIn}/${crewRows.length}, other 3 forms combined ${otherOwnerIn}/${otherSamples.length}`);

  // ── Check 2: bare token fetch to responses/questions, all 4 forms (reconfirm + control) ─────
  console.log('\n[probe] ── check 2: bare X-Auth-Token fetch to responses/questions ─────────────');
  const bareResults = new Map();
  for (const [formId, picked] of samples) {
    const statuses = [];
    for (const r of picked) {
      if (!r.reviewerUserId) { statuses.push('(no reviewerUserId, skipped)'); continue; }
      const res = await fetchContentBare(token, formId, r.reviewerUserId, r.startedAt);
      statuses.push(res.status);
      if (res.status !== 200 && res.status !== 403) console.log(`[probe]   unexpected status ${res.status} for ${REVIEW_FORMS[formId]}: ${res.snippet}`);
      await new Promise(res2 => setTimeout(res2, 150));
    }
    bareResults.set(formId, statuses);
    console.log(`[probe] ${REVIEW_FORMS[formId]} bare-fetch statuses: [${statuses.join(', ')}]`);
  }

  // ── Check 3: SAME calls, in-browser with real session cookies ────────────────────────────────
  console.log('\n[probe] ── check 3: in-browser fetch with real session cookies (Playwright SPA login) ──');
  let browser, page;
  const pageResults = new Map();
  try {
    ({ browser, page } = await loginViaPlaywright());
    for (const [formId, picked] of samples) {
      const statuses = [];
      for (const r of picked) {
        if (!r.reviewerUserId) { statuses.push('(no reviewerUserId, skipped)'); continue; }
        const res = await fetchContentViaPage(page, token, formId, r.reviewerUserId, r.startedAt);
        statuses.push(res.status);
        if (res.status !== 200 && res.status !== 403) console.log(`[probe]   unexpected status ${res.status} for ${REVIEW_FORMS[formId]}: ${res.snippet}`);
        await new Promise(res2 => setTimeout(res2, 150));
      }
      pageResults.set(formId, statuses);
      console.log(`[probe] ${REVIEW_FORMS[formId]} in-browser-fetch statuses: [${statuses.join(', ')}]`);
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  // ── Verdict ───────────────────────────────────────────────────────────────────────────────
  console.log('\n[probe] ── verdict ──────────────────────────────────────────────────────────');
  const crewBare = bareResults.get(CREW_REVIEW_FORM_ID) || [];
  const crewPage = pageResults.get(CREW_REVIEW_FORM_ID) || [];
  const crewBareAll403 = crewBare.length > 0 && crewBare.every(s => s === 403);
  const crewPageAnySucceeded = crewPage.some(s => s === 200);
  const otherFormIds = Object.keys(REVIEW_FORMS).filter(id => id !== CREW_REVIEW_FORM_ID);
  const othersBareAll200 = otherFormIds.every(id => (bareResults.get(id) || []).every(s => s === 200));

  if (!crewBareAll403) {
    console.log('[probe] 🔴 Crew Review did NOT reproduce as all-403 this time -- re-check the per-sample');
    console.log('[probe]   statuses above before trusting either the old or a new verdict. Something about');
    console.log('[probe]   the sample (deleted rows? different occurrences?) may differ from the original 11.');
  } else if (crewPageAnySucceeded) {
    console.log('[probe] 🎯 COOKIE-BASED FETCH UNLOCKS CREW REVIEW. At least one in-browser (real session');
    console.log('[probe]   cookie) call succeeded where the bare-token call was denied. This is the SAME');
    console.log('[probe]   mechanism CLAUDE.md already documents for api.reports.myqsrsoft.com (cookie-gated,');
    console.log('[probe]   token alone insufficient) -- just not previously known to apply to this host too.');
    console.log('[probe]   FIX: route the content fetch for Crew Review (or all 4 forms, for safety) through');
    console.log('[probe]   evalPage in the direct-auth path too, not only the Playwright-fallback path --');
    console.log('[probe]   i.e. always use a real browser context for responses/questions calls.');
  } else if (crewOwnerIn < crewRows.length && otherOwnerIn === otherSamples.length) {
    console.log(`[probe] 🔴 sharedWith genuinely excludes the owner on Crew Review responses specifically`);
    console.log(`[probe]   (${crewOwnerIn}/${crewRows.length} vs ${otherOwnerIn}/${otherSamples.length} for the other 3 forms) --`);
    console.log('[probe]   cookies did not help either. This points to a QSRSoft-side review-assignment or');
    console.log('[probe]   approval-routing CONFIGURATION difference for Crew Review specifically -- who gets');
    console.log('[probe]   listed in sharedWith on submission -- not a client auth bug. Not fixable from this');
    console.log('[probe]   repo; would need a QSRSoft admin to check Crew Review\'s approval-routing config, or');
    console.log('[probe]   confirm whether this account should be added to each response\'s sharedWith.');
  } else {
    console.log('[probe] 🔴 Neither cookies nor sharedWith membership explain it -- the owner IS (or mostly is)');
    console.log('[probe]   listed in sharedWith on Crew Review responses, and a real browser session cookie');
    console.log('[probe]   made no difference either. This is a genuine QSRSoft account-entitlement question');
    console.log('[probe]   scoped to this one form, same shape as dispatch #63\'s api.security finding -- raise');
    console.log('[probe]   it with QSRSoft support/the account admin, not fixable with a code change here.');
  }
  console.log(`[probe] (context: other 3 forms bare-fetch all-200 this run: ${othersBareAll200})`);
}

main().catch(e => { console.error('[probe] fatal:', e.message); process.exit(1); });
