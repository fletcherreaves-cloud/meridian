#!/usr/bin/env node
// ── LifeLenz People List → employee_skills (Employee Skill Levels) ───────────
// Logs into LifeLenz admin (Playwright), discovers every store's scheduleId,
// opens each store's People page (/us01/people/{businessId}/{scheduleId}),
// triggers Download Report → Simple (CSV), parses with the SAME src/parsers
// function the app uses (zero drift), and upserts to Supabase `employee_skills`.
//
// The People page is GraphQL-driven and the "Simple (CSV)" is built in-browser,
// so we drive the export UI and capture the download. Store selection is by URL:
// the second path segment IS the store's scheduleId (same IDs getStoreSchedules
// returns), so we loop all stores by URL — no dropdown automation.
//
// Env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LIFELENZ_USERNAME,
//      LIFELENZ_PASSWORD. Optional LIFELENZ_PEOPLE_URLS (JSON [{loc,url}]) to
//      override discovery; DEBUG=1 for verbose logging + screenshots.
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { mkdirSync } from 'fs';
import { parsePeopleSkills } from '../src/parsers/index.js';

const DEBUG = process.env.DEBUG === '1';
const BASE = 'https://us01-connect.lifelenz.com';
const BUSINESS_ID = '01979dbf-a166-759b-8702-aba9915c578e';
const CLIENT_ID = '63acf6b91f6c301188a20e18';
const REDIRECT_URI = 'https://admin.lifelenz.com/us01/auth/callback';
const peopleUrl = scheduleId => `https://admin.lifelenz.com/us01/people/${BUSINESS_ID}/${scheduleId}`;

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function apiHeaders(token) {
  return { 'X-Auth-Token': token, 'X-Business-Id': BUSINESS_ID, 'X-Lifelenz-Device': 'webadmin',
    'X-Version': '1.75.21', 'Accept': 'application/json', 'Content-Type': 'application/json' };
}

// Log in via IDM OAuth; capture the X-Auth-Token from outgoing API headers.
async function login(context) {
  const page = await context.newPage();
  let token = null;
  page.on('request', req => { const h = req.headers(); if (h['x-auth-token'] && !token) token = h['x-auth-token']; });
  page.on('response', async resp => { try { const h = resp.headers(); if (h['x-auth-token'] && !token) token = h['x-auth-token']; } catch {} });
  const authUrl = 'https://idm.lifelenz.com/connect/authorize?' + new URLSearchParams({
    client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code',
    scope: 'openid profile email offline_access', state: 'meridian-people',
  });
  console.log('[auth] navigating to IDM authorize…');
  await page.goto(authUrl, { waitUntil: 'networkidle', timeout: 45000 });
  const userSel = ['input[name="username"]', 'input[name="email"]', 'input[type="email"]', '#username', '#email',
    'input[autocomplete="username"]', 'input[autocomplete="email"]', 'input[placeholder*="email" i]', 'input[placeholder*="user" i]'].join(', ');
  const passSel = 'input[name="password"], input[type="password"], #password, input[autocomplete="current-password"]';
  const subSel = 'button[type="submit"], input[type="submit"], .btn-primary, button:has-text("Login"), button:has-text("Sign in"), button:has-text("Log in")';
  await page.waitForSelector(userSel, { timeout: 20000 });
  await page.fill(userSel, process.env.LIFELENZ_USERNAME);
  await page.fill(passSel, process.env.LIFELENZ_PASSWORD);
  await page.click(subSel);
  await page.waitForFunction(() => location.href.includes('admin.lifelenz.com') || !location.href.includes('idm.lifelenz.com'), { timeout: 25000 });
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  // Nudge an API call so the token appears in a request header if not seen yet.
  if (!token) { try { await page.goto('https://admin.lifelenz.com/us01/dashboard', { waitUntil: 'networkidle', timeout: 20000 }); } catch {} }
  console.log('[auth] logged in' + (token ? ' (token captured)' : ' (no token yet — schedule discovery may fall back)'));
  return { page, token };
}

// Discover active store schedules → [{loc, scheduleId, name}] using the same REST
// endpoint + filter the labor pull uses.
async function discoverStores(page, token) {
  const url = `${BASE}/api/admin/businesses/${BUSINESS_ID}/schedules`;
  let all = [];
  try {
    const data = await page.evaluate(async ([u, h]) => { const r = await fetch(u, { headers: h }); return r.ok ? await r.json() : { error: r.status }; }, [url, apiHeaders(token)]);
    all = (data && data.data) || [];
    if (data && data.error) console.warn('[schedules] REST →', data.error);
  } catch (e) { console.warn('[schedules] discovery error:', e.message); }
  const stores = all
    .filter(s => s.attributes && s.attributes.schedule_status === 'active')
    .map(s => { const nm = s.attributes.schedule_name || s.attributes.code || ''; const m = nm.match(/\b(\d{4,7})\b/); return m ? { loc: String(parseInt(m[1], 10)), scheduleId: s.id, name: nm } : null; })
    .filter(Boolean);
  console.log(`[schedules] ${stores.length} store schedules discovered`);
  return stores;
}

// Drive the export UI and capture the Simple CSV text for the current page.
async function downloadPeopleCSV(page, url, tag) {
  const seenCsvUrls = [];
  const onResp = r => { try { const ct = (r.headers()['content-type'] || '').toLowerCase(); if (ct.includes('csv')) seenCsvUrls.push(r.url()); } catch {} };
  page.on('response', onResp);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(2000);
  let csvText = null;
  try {
    const dl = page.waitForEvent('download', { timeout: 20000 });
    await page.getByText(/download report/i).first().click({ timeout: 10000 });
    await page.waitForTimeout(700);
    await page.getByText(/simple.*\(?csv\)?|^simple$/i).first().click({ timeout: 10000 });
    const download = await dl;
    const stream = await download.createReadStream();
    if (stream) { const chunks = []; for await (const c of stream) chunks.push(c); csvText = Buffer.concat(chunks).toString('utf8'); }
  } catch (e) {
    if (DEBUG) { console.log(`[people] ${tag}: UI download failed:`, e.message); try { mkdirSync('screenshots', { recursive: true }); await page.screenshot({ path: `screenshots/people-${tag}.png`, fullPage: true }); } catch {} }
  }
  if (!csvText && seenCsvUrls.length) {
    csvText = await page.evaluate(async u => { const r = await fetch(u, { credentials: 'include' }); return r.ok ? await r.text() : null; }, seenCsvUrls[seenCsvUrls.length - 1]);
  }
  page.off('response', onResp);
  return csvText;
}

async function upsertEmployees(employees) {
  const rows = employees.filter(e => e.employee && e.loc).map(e => ({
    loc: String(parseInt(e.loc, 10)), employee: e.employee, home_store: e.homeStore ?? null,
    role: e.role ?? null, role_code: e.roleCode ?? null, is_primary_role: e.isPrimaryRole !== false,
    school_calendar: e.schoolCalendar ?? null, skills_json: e.skills ?? {},
    source: 'lifelenz_people_scrape', updated_at: new Date().toISOString(),
  }));
  if (!rows.length) return 0;
  const { error } = await supabase.from('employee_skills').upsert(rows, { onConflict: 'loc,employee' });
  if (error) { console.warn('[supabase] upsert error:', error.message); return 0; }
  return rows.length;
}

async function pullOne(page, url, tag) {
  const csv = await downloadPeopleCSV(page, url, tag);
  if (!csv) { console.warn(`[people] ${tag}: no CSV captured`); return 0; }
  const wb = XLSX.read(csv, { type: 'string', raw: true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null, raw: true });
  const parsed = parsePeopleSkills(rows);
  const saved = await upsertEmployees(parsed.employees);
  console.log(`[people] ${parsed.pulledStore || tag}: ${parsed.employees.length} employees, ${saved} saved`);
  return saved;
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'] });
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36', acceptDownloads: true });
  await context.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => undefined }));

  let page, token;
  try { ({ page, token } = await login(context)); }
  catch (e) { console.error('[auth] login failed:', e.message); await browser.close(); process.exit(1); }

  // Targets: explicit override, else discover all stores by scheduleId.
  let list = [];
  if (process.env.LIFELENZ_PEOPLE_URLS) {
    try { list = JSON.parse(process.env.LIFELENZ_PEOPLE_URLS); } catch (e) { console.error('[cfg] LIFELENZ_PEOPLE_URLS bad JSON:', e.message); }
  } else if (token) {
    const stores = await discoverStores(page, token);
    list = stores.map(s => ({ loc: s.loc, url: peopleUrl(s.scheduleId) }));
  }
  if (!list.length) { console.error('[people] no target pages (need a captured token or LIFELENZ_PEOPLE_URLS)'); await browser.close(); process.exit(1); }

  console.log(`[people] ${list.length} store page(s) to pull`);
  let totalSaved = 0;
  for (const t of list) {
    try { totalSaved += await pullOne(page, t.url, t.loc || t.url); }
    catch (e) { console.error(`[people] ${t.loc || t.url} error:`, e.message); }
  }
  await browser.close();
  console.log(`[people] done — ${totalSaved} employee rows upserted across ${list.length} stores`);
}

main().catch(e => { console.error('[people] fatal:', e); process.exit(1); });
