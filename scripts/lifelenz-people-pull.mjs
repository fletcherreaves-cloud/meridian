#!/usr/bin/env node
// ── LifeLenz People List → employee_skills (Crew Skill Levels) ────────────────
// Logs into LifeLenz admin (Playwright), opens each store's People page, triggers
// Download Report → Simple (CSV), parses the CSV with the SAME src/parsers
// function the app uses (zero drift), and upserts to Supabase `employee_skills`.
//
// Env:
//   VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — Supabase (service role)
//   LIFELENZ_USERNAME, LIFELENZ_PASSWORD          — admin login
//   LIFELENZ_PEOPLE_URLS  — JSON array of {loc, url} people pages to pull. If
//                           unset, falls back to LIFELENZ_PEOPLE_URL (single).
//   DEBUG=1               — verbose logging + screenshots
//
// NOTE (first-run): this drives the export UI by button text ("Download Report",
// "Simple"). On the first run it also LOGS the network request the export fires —
// send that URL back and we can convert this to a fast, all-stores API pull (like
// the DAR/labor pulls) that skips the UI entirely.
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { parsePeopleSkills } from '../src/parsers/index.js';

const DEBUG = process.env.DEBUG === '1';
const BUSINESS_ID = '01979dbf-a166-759b-8702-aba9915c578e';
const CLIENT_ID = '63acf6b91f6c301188a20e18';
const REDIRECT_URI = 'https://admin.lifelenz.com/us01/auth/callback';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function targets() {
  if (process.env.LIFELENZ_PEOPLE_URLS) {
    try { return JSON.parse(process.env.LIFELENZ_PEOPLE_URLS); } catch (e) { console.error('[cfg] LIFELENZ_PEOPLE_URLS not valid JSON:', e.message); }
  }
  if (process.env.LIFELENZ_PEOPLE_URL) return [{ loc: null, url: process.env.LIFELENZ_PEOPLE_URL }];
  // Fallback: the one page shared during development (Purcell).
  return [{ loc: '11657', url: `https://admin.lifelenz.com/us01/people/${BUSINESS_ID}/019c9ad6-63ef-700d-ae5a-ac74607165d1` }];
}

async function login(context) {
  const page = await context.newPage();
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
  console.log('[auth] logged in, url:', page.url());
  return page;
}

// Drive the export UI and capture the Simple CSV text. Logs the export request
// URL (the future fast-path endpoint) if we can see it.
async function downloadPeopleCSV(page, url) {
  const seenCsvUrls = [];
  const onResp = async resp => {
    try {
      const ct = (resp.headers()['content-type'] || '').toLowerCase();
      const u = resp.url();
      if (ct.includes('csv') || /people.*(export|report|simple)|export.*people/i.test(u)) seenCsvUrls.push(u);
    } catch {}
  };
  page.on('response', onResp);
  console.log('[people] opening', url);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1500);

  let csvText = null;
  // Strategy A: real browser download triggered by the UI buttons.
  try {
    const dl = page.waitForEvent('download', { timeout: 15000 });
    await page.getByText(/download report/i).first().click({ timeout: 8000 });
    await page.waitForTimeout(600);
    await page.getByText(/simple.*csv|^simple$/i).first().click({ timeout: 8000 });
    const download = await dl;
    const stream = await download.createReadStream();
    if (stream) { const chunks = []; for await (const c of stream) chunks.push(c); csvText = Buffer.concat(chunks).toString('utf8'); }
    console.log('[people] captured via download event');
  } catch (e) {
    if (DEBUG) console.log('[people] UI download path failed:', e.message);
  }
  // Strategy B: if a CSV endpoint was observed, fetch it in-browser (has session).
  if (!csvText && seenCsvUrls.length) {
    const csvUrl = seenCsvUrls[seenCsvUrls.length - 1];
    console.log('[people] fetching observed CSV endpoint:', csvUrl);
    csvText = await page.evaluate(async u => { const r = await fetch(u, { credentials: 'include' }); return r.ok ? await r.text() : null; }, csvUrl);
  }
  page.off('response', onResp);
  if (seenCsvUrls.length) console.log('[people] ⭐ export endpoint(s) seen (send these to wire a fast API pull):\n  ' + seenCsvUrls.join('\n  '));
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

async function main() {
  const list = targets();
  console.log(`[people] ${list.length} store page(s) to pull`);
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'] });
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36', acceptDownloads: true });
  await context.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => undefined }));
  let page;
  try { page = await login(context); }
  catch (e) { console.error('[auth] login failed:', e.message); await browser.close(); process.exit(1); }

  let totalSaved = 0;
  for (const t of list) {
    try {
      const csv = await downloadPeopleCSV(page, t.url);
      if (!csv) { console.warn(`[people] ${t.loc || t.url}: no CSV captured`); continue; }
      const wb = XLSX.read(csv, { type: 'string', raw: true });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null, raw: true });
      const parsed = parsePeopleSkills(rows);
      const saved = await upsertEmployees(parsed.employees);
      totalSaved += saved;
      console.log(`[people] ${parsed.pulledStore || t.loc || ''} (${parsed.pulledLoc || '?'}): ${parsed.employees.length} employees, ${saved} saved`);
    } catch (e) { console.error(`[people] ${t.loc || t.url} error:`, e.message); }
  }
  await browser.close();
  console.log(`[people] done — ${totalSaved} employee rows upserted`);
}

main().catch(e => { console.error('[people] fatal:', e); process.exit(1); });
