#!/usr/bin/env node
// scripts/qsrsoft-pmix-pull.mjs
// QSRSoft Product Mix (PMIX) — per-item, per-price-point sales facts.
//
// Endpoint confirmed 2026-08-14 (memory/qsrsoft-report-catalog.md, "Product Mix — the
// SALES view" — read that section before changing selectCols or the row mapping, it has
// the full capture, reconciliation math, and every measured caveat this file is built
// from). Same /reporting/v2/ family qsrsoft-ops-pull.mjs already drives, so this file
// mirrors that script's auth ladder, query builder and Playwright fallback structure
// directly rather than reinventing them.
//
//   GET https://api.reports.myqsrsoft.com/reporting/v2/product/product-mix-bundles
//       ?catalogType=productMix&reportType=summary&nsn=<csv>&orgId=<org>
//       &enterpriseName=McDonalds&startDate=&endDate=&weekStart=3
//       &familyGroup=BREAKFAST_DRINK,BREAKFAST_SIDE,BREAKFAST_ENTREE,REGULAR_DRINK,
//                    REGULAR_ENTREE,FRIES,NON_PRODUCT,SHAKES,DESSERT
//       &poo=Combined&timeSegment=openClose&segmentBy=summary&timeInterval=summary
//       &segmentNames=open-close&segmentsSelected=open-close&nsd=?&dsd=?
//       &selectCols=soldQty,discQty,menuItemNumber,description,familyGroup,price,
//                   dollarsSold,promoQty,offerAmt,unitFoodCost,unitPaperCost
//   → { result: [ {menuItemNumber, price, soldQty, discQty, description, familyGroup,
//        dollarsSold, promoQty, offerAmt, unitFoodCost, unitPaperCost, bundleQty,
//        bundleDiscAmt, totalUnitFoodCost, totalUnitPaperCost} ] }
//
// nsd/dsd (= locationAgg/dateAgg — memory/qsrsoft-report-catalog.md "nsd/dsd CONFIRMED",
// captured 2026-08-15 from the vendor's own saved-report blobs) are the store/date GRAIN
// switches: 's' summary (rolled up, no store or date field on the rows), 'd' detail (one
// row per store/day, with storeNum/date on each row). The Product Mix UI can never send
// 'd' — enumerated three independent ways (filter bar, Column Settings, row expansion),
// it has no per-store or per-day control at all — so whether this endpoint HONOURS
// nsd=d&dsd=d for a multi-store request is a code test, not a capturable browser fact.
// probeDistrictMode() below is that test, run fresh at the start of every invocation:
//   - if the response carries a real per-row store field for >1 distinct store, USE IT —
//     one request/day for all 27 stores, loc trusted from the response.
//   - if not (endpoint silently rolls up anyway, or errors), fall back to one request
//     PER STORE per day (the shape this file originally shipped with) — loc is then
//     stamped from the request's own nsn parameter, NEVER trusted from the response,
//     because a summary response for a single-store request may or may not echo a store
//     field and either way it is redundant with what was already asked for.
// Either fallback ships #292; only the request count changes (1/day vs 27/day).
// dollarsSold/totalUnitFoodCost/totalUnitPaperCost are requested (the API always returns
// them) but deliberately NOT stored — measured exactly equal to price*soldQty /
// unitFoodCost*soldQty / unitPaperCost*soldQty on the captured payload (0 exceptions).
// Storing both a primitive and its extension invites them to disagree; the extensions are
// computed at read time instead. bundleQty/bundleDiscAmt are requested implicitly by the
// endpoint but not selected or stored — measured zero on every row of the captured
// payload despite the endpoint's name; not designed around until a capture shows one
// non-zero. discAmt is NOT in selectCols yet — memory/qsrsoft-report-catalog.md flags it
// as the one still-unknown column needed to close the reconciliation identity
// (ΣdollarsSold − Σoffer_amt − Σdisc_amt == allNetSales); add it here once captured.
//
// Rows with soldQty=0 are catalog placeholders (measured 21/441 on the captured payload)
// — filtered before upsert, not stored.
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Auth ladder: QSRSOFT_TOKEN (direct) → QSRSOFT_COGNITO_TOKEN (direct) →
//              QSRSOFT_USERNAME/PASSWORD (Playwright, mirrors qsrsoft-ops-pull.mjs exactly:
//              logs in, navigates to the Product Mix report page to passively capture a
//              token, in-browser fetch fallback if that alone doesn't fire a token-bearing
//              request).
// Optional: PMIX_START_DATE / PMIX_END_DATE (YYYY-MM-DD, backfill range — target 2024-01
//           per the issue, matching DAR/VOICE depth; probe retention depth first per the
//           standing rule, same as #257/#259 did — do not assume it reaches that far),
//           PMIX_STORE (comma-separated NSNs, default all 27).

import { createClient } from '@supabase/supabase-js';

const BASE   = 'https://api.reports.myqsrsoft.com';
const ORG_ID = 'a546d4ef-684a-4f25-8bc0-6580af068875';
const REPORT_URL = 'https://v3.myqsrsoft.com/reports/mcd/product/productMixDrillDown';

const STORE_NSNS = (process.env.PMIX_STORE
  ? process.env.PMIX_STORE.split(',').map(s => s.trim())
  : [
    3708, 5183, 5985, 6178, 6838, 6972, 10034, 10422, 10915, 11657, 13113, 18213,
    20475, 24471, 29760, 31357, 32525, 33109, 33222, 33704, 34222, 35064, 35242,
    37566, 38609, 43380, 43701,
  ]).map(String);

const FAMILY_GROUPS = ['BREAKFAST_DRINK', 'BREAKFAST_SIDE', 'BREAKFAST_ENTREE', 'REGULAR_DRINK',
  'REGULAR_ENTREE', 'FRIES', 'NON_PRODUCT', 'SHAKES', 'DESSERT'].join(',');
const SELECT_COLS = ['soldQty', 'discQty', 'menuItemNumber', 'description', 'familyGroup', 'price',
  'dollarsSold', 'promoQty', 'offerAmt', 'unitFoodCost', 'unitPaperCost'].join(',');

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Deliberately NOT importing savePmixRows from src/lib/supabase.js: that module reads
// import.meta.env at load time (Vite-only), which is undefined under plain `node
// scripts/...` and crashes on import before this script's own env/token handling ever
// runs. Every sibling pull script (qsrsoft-ebos-pull.mjs, qsrsoft-ops-pull.mjs) upserts
// directly via its own createClient(process.env...) client for the same reason — this
// mirrors that pattern. Column mapping/onConflict kept identical to savePmixRows so the
// browser lazy-fill path (#385) and this pull stay in sync.
async function savePmixRows(rows) {
  if (!rows?.length) return { saved: 0, errors: [] };
  const toDate = r => r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10);
  const upsert = rows.map(r => ({
    loc:             String(r.loc),
    date:            toDate(r),
    item:            Number(r.item),
    price:           Number(r.price),
    desc_:           r.desc        ?? null,
    family_group:    r.familyGroup ?? null,
    sold_qty:        r.soldQty     ?? null,
    disc_qty:        r.discQty     ?? null,
    promo_qty:       r.promoQty    ?? null,
    offer_amt:       r.offerAmt    ?? null,
    disc_amt:        r.discAmt     ?? null,      // not yet selected upstream — see schema header
    unit_food_cost:  r.unitFoodCost  ?? null,
    unit_paper_cost: r.unitPaperCost ?? null,
    updated_at:      new Date().toISOString(),
  }));
  const CHUNK = 500;
  let saved = 0; const errors = [];
  for (let i = 0; i < upsert.length; i += CHUNK) {
    const { error } = await supabase.from('qsr_product_mix').upsert(upsert.slice(i, i + CHUNK), { onConflict: 'loc,date,item,price' });
    if (error) { console.warn('[qsr_product_mix] save error:', error); errors.push(error.message); }
    else saved += Math.min(CHUNK, upsert.length - i);
  }
  return { saved, errors };
}

const pad2 = n => String(n).padStart(2, '0');
const fmtDate = d => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
const addDay = (d, n) => { const r = new Date(d); r.setUTCDate(r.getUTCDate() + n); return r; };
const nsn7 = n => String(n).padStart(7, '0');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function url(date, nsn, nsd, dsd) {
  const params = new URLSearchParams({
    catalogType: 'productMix', reportType: 'summary',
    nsn, orgId: ORG_ID, enterpriseName: 'McDonalds',
    startDate: date, endDate: date, weekStart: '3',
    familyGroup: FAMILY_GROUPS, poo: 'Combined',
    timeSegment: 'openClose', segmentBy: 'summary', timeInterval: 'summary',
    segmentNames: 'open-close', segmentsSelected: 'open-close', nsd, dsd,
    selectCols: SELECT_COLS,
  });
  return `${BASE}/reporting/v2/product/product-mix-bundles?${params}`;
}
// District mode: all 27 stores, one request, testing whether nsd=d&dsd=d yields real
// per-store/per-day attribution (see file header). Per-store mode: exactly what this
// file always sent — one NSN, nsd=s&dsd=s (nothing to disaggregate from a single store).
const districtUrl = date => url(date, STORE_NSNS.join(','), 'd', 'd');
const perStoreUrl  = (date, nsn) => url(date, nsn, 's', 's');

// Fail-fast input validation (PR #267 review, 2026-08-14, applied repo-wide since): a bad
// PMIX_START_DATE/PMIX_END_DATE should error on the input, not surface as a confusing
// downstream auth or empty-result failure.
function resolveWindow() {
  const start = (process.env.PMIX_START_DATE || '').trim();
  const end   = (process.env.PMIX_END_DATE   || '').trim() || start;
  if (!start) {
    // No explicit range: default to yesterday only — today's totals are still
    // accumulating, matching the "only ever evaluate the most recent COMPLETE day" rule
    // this repo already applies elsewhere (qsrsoft-ops-pull.mjs's cash-anomaly check).
    const y = addDay(new Date(), -1);
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
function dateRange(start, end) {
  const out = [];
  for (let d = new Date(start + 'T00:00:00Z'); fmtDate(d) <= end; d = addDay(d, 1)) out.push(fmtDate(d));
  return out;
}

const HDRS = t => ({ 'X-Auth-Token': t, 'Accept': 'application/json', 'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/reports/mcd/product/productMixDrillDown', 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36' });

async function fetchRows(reqUrl, token, evalPage) {
  if (evalPage) {
    const res = await evalPage.evaluate(async ({ url, token }) => {
      try {
        const r = await fetch(url, { headers: { 'X-Auth-Token': token, 'Accept': 'application/json', 'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/reports/mcd/product/productMixDrillDown' }, signal: AbortSignal.timeout(25000) });
        if (!r.ok) return { error: `HTTP ${r.status}` };
        const body = await r.json();
        return { rows: Array.isArray(body) ? body : (body?.result || []) };
      } catch (e) { return { error: e.message }; }
    }, { url: reqUrl, token });
    if (res.error) throw new Error(res.error);
    return res.rows || [];
  }
  const resp = await fetch(reqUrl, { headers: HDRS(token) });
  if (resp.status === 401 || resp.status === 403) throw new Error(`AUTH_FAILED:${resp.status}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 160)}`);
  const body = await resp.json();
  return Array.isArray(body) ? body : (body?.result || []);
}

// Maps one API row → the shape savePmixRows() expects. In district mode, loc comes from
// the row's own store field (storeNum/nsn — the convention every sibling reporting/v2
// endpoint uses) because that field is exactly what's being tested. In per-store mode,
// loc is ALWAYS the store this specific request asked for (fallbackLoc), never read from
// the response — a single-store request's response may or may not echo a store field,
// and either way trusting it over what was actually asked for adds a failure mode for no
// benefit.
function mapRow(r, date, fallbackLoc) {
  return {
    loc: fallbackLoc != null ? nsn7(fallbackLoc) : nsn7(r.storeNum ?? r.nsn ?? ''),
    date,
    item: r.menuItemNumber,
    price: r.price,
    desc: r.description,
    familyGroup: r.familyGroup,
    soldQty: r.soldQty,
    discQty: r.discQty,
    promoQty: r.promoQty,
    offerAmt: r.offerAmt,
    unitFoodCost: r.unitFoodCost,
    unitPaperCost: r.unitPaperCost,
  };
}

// A store field is proof of real per-row attribution only if it identifies MORE THAN ONE
// distinct store — present-but-constant would just echo a request param, not demonstrate
// the endpoint actually disaggregated a 27-store request.
function districtRowsUsable(rows) {
  if (!rows.length) return false; // can't prove attribution from an empty response; fall back rather than assume
  const stores = new Set(rows.map(r => r.storeNum ?? r.nsn).filter(v => v != null && v !== ''));
  return stores.size > 1;
}

// The code test itself (see file header): one request, all 27 stores, nsd=d&dsd=d. Returns
// the raw rows if the endpoint honoured it, or null if it didn't (or errored) — the caller
// decides what null means (fall back to per-store for this run).
async function probeDistrictMode(date, token, evalPage) {
  const rows = await fetchRows(districtUrl(date), token, evalPage); // AUTH_FAILED propagates — that's an auth problem, not a grain-parameter one
  if (!districtRowsUsable(rows)) {
    console.log(`[pmix] district-mode probe: nsd=d&dsd=d returned ${rows.length} row(s) with no usable per-store field — falling back to per-store mode (27 requests/day).`);
    return null;
  }
  const stores = new Set(rows.map(r => r.storeNum ?? r.nsn));
  console.log(`[pmix] district-mode CONFIRMED: nsd=d&dsd=d returned ${rows.length} row(s) across ${stores.size} distinct store(s) — 1 request/day from here.`);
  return rows;
}

// Splits WHY a row didn't survive, not just whether it did — a wipeout attributable to `loc`
// (the multi-store field guess going wrong) is a materially different failure than a normal
// batch of soldQty=0 catalog placeholders, and upsertAndLog needs to tell them apart rather
// than reporting one merged "filtered" count that could quietly be masking the former as the
// latter (#292 review).
function mappedRows(rows, date, fallbackLoc) {
  const kept = [], locDropped = [], qtyDropped = [];
  for (const r of rows) {
    const m = mapRow(r, date, fallbackLoc);
    if (!m.loc || m.loc === '0000000') locDropped.push(m);
    else if (!(Number(m.soldQty) > 0)) qtyDropped.push(m); // soldQty=0 rows are catalog placeholders — see file header
    else kept.push(m);
  }
  return { kept, locDropped, qtyDropped };
}

async function upsertAndLog(mappedResult, label, rawCount) {
  const { kept, locDropped, qtyDropped } = mappedResult;
  if (!kept.length) {
    // Unconditional, not DEBUG-gated: a total wipeout is exactly the failure mode this repo
    // has already been bitten by (a green run that wrote nothing), and if the cause is `loc`
    // rather than genuinely-empty placeholders, that needs to be loud, not buried behind a
    // debug flag nobody sets on a scheduled run.
    if (locDropped.length) {
      console.error(`[pmix] ${label}: ${rawCount} row(s), ALL dropped — ${locDropped.length} for unresolved/placeholder loc, ${qtyDropped.length} for soldQty=0. A loc-attributed wipeout means the multi-store field guess is wrong, not that the day had no sales.`);
    } else {
      console.log(`[pmix] ${label}: ${rawCount} row(s), all filtered (${qtyDropped.length} soldQty=0 placeholder(s))`);
    }
    return 0;
  }
  const { saved, errors } = await savePmixRows(kept);
  if (errors.length) console.warn(`[pmix] ${label}: ${errors.length} save error(s)`);
  console.log(`[pmix] ${label}: ${kept.length}/${rawCount} row(s) upserted (${qtyDropped.length} placeholder(s), ${locDropped.length} unresolved-loc filtered)`);
  return saved;
}

// #263 — a run that upserts 0 rows must be distinguishable from one that never got real
// data in the first place: tallying per-store kept-row counts across the whole run (not
// just the per-date log lines already printed) makes a partial pull visible as "4/27 stores"
// instead of silently averaging into a total that still looks plausible.
function tally(perStoreCounts, kept) {
  for (const r of kept) perStoreCounts.set(r.loc, (perStoreCounts.get(r.loc) || 0) + 1);
}

async function runAll(token, dates, evalPage) {
  let grand = 0;
  let mode = null; // decided once, from the first date's probe, and reused for the rest of this run
  const perStoreCounts = new Map(); // loc -> rows kept, across the whole run

  for (const date of dates) {
    if (mode === null) {
      let districtRows;
      try {
        districtRows = await probeDistrictMode(date, token, evalPage);
      } catch (e) {
        if (String(e.message).startsWith('AUTH_FAILED')) throw e;
        console.error(`[pmix] ${date} ERROR (district-mode probe): ${e.message}`);
        mode = 'perStore';
        districtRows = undefined;
      }
      if (districtRows) {
        mode = 'district';
        const mr = mappedRows(districtRows, date, null);
        tally(perStoreCounts, mr.kept);
        grand += await upsertAndLog(mr, date, districtRows.length);
        await new Promise(r => setTimeout(r, 120));
        continue;
      }
      mode = mode || 'perStore'; // probe ran clean but returned null (endpoint didn't honour nsd=d&dsd=d)
      // falls through to the per-store loop below, for this same date
    }

    if (mode === 'district') {
      let rows;
      try {
        rows = await fetchRows(districtUrl(date), token, evalPage);
      } catch (e) {
        if (String(e.message).startsWith('AUTH_FAILED')) throw e;
        console.error(`[pmix] ${date} ERROR: ${e.message}`);
        continue;
      }
      const mr = mappedRows(rows, date, null);
      tally(perStoreCounts, mr.kept);
      grand += await upsertAndLog(mr, date, rows.length);
      await new Promise(r => setTimeout(r, 120));
      continue;
    }

    // mode === 'perStore'
    for (const nsn of STORE_NSNS) {
      let rows;
      try {
        rows = await fetchRows(perStoreUrl(date, nsn), token, evalPage);
      } catch (e) {
        if (String(e.message).startsWith('AUTH_FAILED')) throw e;
        console.error(`[pmix] ${date} store ${nsn} ERROR: ${e.message}`);
        continue;
      }
      const mr = mappedRows(rows, date, nsn);
      tally(perStoreCounts, mr.kept);
      grand += await upsertAndLog(mr, `${date} store ${nsn}`, rows.length);
      await new Promise(r => setTimeout(r, 120));
    }
  }
  return { grand, perStoreCounts };
}

// ── Playwright fallback — mirrors qsrsoft-ops-pull.mjs exactly, pointed at the Product
// Mix report page instead of the Operations Report.
async function viaPlaywright(dates) {
  const u = process.env.QSRSOFT_USERNAME, pw = process.env.QSRSOFT_PASSWORD;
  if (!u || !pw) throw new Error('AUTH_FAILED:playwright — no QSRSOFT_USERNAME/PASSWORD, cannot use Playwright fallback'); // #263 — was a silent `return null`, indistinguishable from a clean zero-row run
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ userAgent: HDRS('')['User-Agent'] })).newPage();
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
    if (!token) {
      console.log('[auth] no token from passive navigation — attempting in-browser fetch to trigger auth…');
      const testResult = await page.evaluate(async ({ reqUrl }) => {
        try { const r = await fetch(reqUrl, { credentials: 'include' }); return { status: r.status, ok: r.ok }; }
        catch (e) { return { error: e.message, name: e.name }; }
      }, { reqUrl: districtUrl(dates[0]) });
      console.log('[auth] in-browser test fetch result:', JSON.stringify(testResult));
      await new Promise(r => setTimeout(r, 2000));
      await snap('pmix-03-post-trigger.png');
    }
    // #263 — this used to `return 0` on a failed token capture, indistinguishable from a
    // clean run that genuinely wrote nothing. That is precisely the failure mode caught live
    // 2026-08-17: a backfill run exited 0 after failing to capture a token, no error, no
    // signal past a log line nobody was watching. Throwing here instead makes main()'s catch
    // handle it as the real failure it is.
    if (!token) throw new Error('AUTH_FAILED:playwright — could not capture token from the Product Mix report page');
    console.log(`[auth] ✓ token captured (${token.length} chars) — pulling ${dates.length} date(s)…`);
    return await runAll(token, dates, page);
  } finally { await browser.close(); }
}

async function main() {
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) { console.error('[pmix] Missing Supabase env'); process.exit(1); }
  const { start, end } = resolveWindow();
  const dates = dateRange(start, end);
  console.log(`[pmix] window: ${start}…${end} (${dates.length} day(s)) — ${STORE_NSNS.length} store(s)`);

  const token = (process.env.QSRSOFT_TOKEN || process.env.QSRSOFT_COGNITO_TOKEN || '').trim();
  let result = { grand: 0, perStoreCounts: new Map() };
  if (token) {
    console.log('[auth] using direct token');
    try { result = await runAll(token, dates, null); }
    catch (e) {
      if (String(e.message).startsWith('AUTH_FAILED')) { console.log('[auth] direct token 401/403 — falling back to Playwright'); result = await viaPlaywright(dates); }
      else throw e;
    }
  } else {
    console.log('[auth] no direct token — falling back to Playwright');
    result = await viaPlaywright(dates);
  }
  const { grand: total, perStoreCounts } = result;

  // #263 — per-store counts, always logged, so a partial pull (e.g. 4/27 stores) is visible
  // directly rather than averaging into a plausible-looking total.
  const storesWithRows = perStoreCounts.size;
  console.log(`[pmix] per-store: ${storesWithRows}/${STORE_NSNS.length} store(s) had at least one row upserted.`);
  if (storesWithRows > 0 && storesWithRows < STORE_NSNS.length) {
    const missing = STORE_NSNS.filter(nsn => !perStoreCounts.has(nsn7(nsn)));
    console.warn(`[pmix] ${missing.length} store(s) with zero rows across the whole window: ${missing.join(', ')}`);
  }

  console.log(`[pmix] done — ${total} row(s) upserted.`);

  // #263 — a run that upserts 0 rows over a non-empty requested window must exit non-zero.
  // Caught live 2026-08-17: a Playwright token-capture failure returned 0 with no thrown
  // error, and the run reported success anyway — the third failure-reports-success path
  // found this week (after mf_events's bare catch{} and _pagedParallel dropping its error).
  // A day with genuinely zero sales across all 27 real stores is not a plausible outcome to
  // guard against silently; an auth/pull failure that yields exactly the same shape is.
  if (total === 0 && dates.length > 0) {
    console.error(`[pmix] ✗ 0 rows upserted across ${dates.length} requested day(s) — treating as a failed run, not an empty one. See auth/error output above.`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch(e => { console.error('[pmix] FATAL:', e); process.exit(1); });
