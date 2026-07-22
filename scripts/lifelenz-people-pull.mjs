#!/usr/bin/env node
// ── LifeLenz People List → employee_skills (Employee Skill Levels) ───────────
// Uses the working LIFELENZ_TOKEN (same secret the labor pull uses) instead of a
// browser form-login — LifeLenz's login is a Cloudflare-protected OAuth SPA that
// renders nothing headless, so we skip it. We inject the token so the People page
// loads authenticated, drive Download Report → Simple (CSV), parse with the SAME
// src/parsers function the app uses (zero drift), and upsert to `employee_skills`.
//
// Store selection is by URL: /us01/people/{businessId}/{scheduleId}. scheduleIds
// come from the same /api/admin/businesses/{id}/schedules call the labor pull uses.
//
// Env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LIFELENZ_TOKEN. Optional
//      LIFELENZ_PEOPLE_URLS (JSON [{loc,url}]) to override discovery; DEBUG=1.
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { mkdirSync } from 'fs';
import { parsePeopleSkills } from '../src/parsers/index.js';

const DEBUG = process.env.DEBUG === '1';
const BASE = 'https://us01-connect.lifelenz.com';
const BUSINESS_ID = '01979dbf-a166-759b-8702-aba9915c578e';
const TOKEN = process.env.LIFELENZ_TOKEN || '';
const peopleUrl = scheduleId => `https://admin.lifelenz.com/us01/people/${BUSINESS_ID}/${scheduleId}`;

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function apiHeaders(token) {
  return { 'X-Auth-Token': token, 'X-Business-Id': BUSINESS_ID, 'X-Lifelenz-Device': 'webadmin',
    'X-Version': '1.75.21', 'Accept': 'application/json', 'Content-Type': 'application/json' };
}

// Discover active store schedules → [{loc, scheduleId, name}] (server-side fetch).
async function discoverStores(token) {
  const url = `${BASE}/api/admin/businesses/${BUSINESS_ID}/schedules`;
  let all = [];
  try {
    const r = await fetch(url, { headers: apiHeaders(token) });
    console.log('[schedules] REST →', r.status);
    if (r.ok) { const d = await r.json(); all = (d && d.data) || []; }
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
  const seenCsv = [];
  const onResp = r => { try { if ((r.headers()['content-type'] || '').toLowerCase().includes('csv')) seenCsv.push(r.url()); } catch {} };
  page.on('response', onResp);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(2500);
  if (DEBUG) { try { mkdirSync('screenshots', { recursive: true }); await page.screenshot({ path: `screenshots/people-${tag}.png`, fullPage: true }); } catch {} }
  // Guard: if the token didn't take, the SPA bounces to a blank/login page.
  const looksAuthed = await page.getByText(/download report/i).count().then(c => c > 0).catch(() => false);
  if (!looksAuthed && DEBUG) {
    const body = await page.evaluate(() => document.body?.innerText?.slice(0, 300) || '(empty)').catch(() => '?');
    console.log(`[people] ${tag}: 'Download Report' not visible — page text:`, body, '| url:', page.url());
  }
  let csvText = null;
  try {
    const dl = page.waitForEvent('download', { timeout: 20000 });
    await page.getByText(/download report/i).first().click({ timeout: 10000 });
    await page.waitForTimeout(700);
    await page.getByText(/simple.*\(?csv\)?|^simple$/i).first().click({ timeout: 10000 });
    const download = await dl;
    const stream = await download.createReadStream();
    if (stream) { const chunks = []; for await (const c of stream) chunks.push(c); csvText = Buffer.concat(chunks).toString('utf8'); }
  } catch (e) { if (DEBUG) console.log(`[people] ${tag}: UI download failed:`, e.message); }
  if (!csvText && seenCsv.length) {
    csvText = await page.evaluate(async u => { const r = await fetch(u, { credentials: 'include' }); return r.ok ? await r.text() : null; }, seenCsv[seenCsv.length - 1]);
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
  if (!TOKEN) { console.error('[people] LIFELENZ_TOKEN not set — required (same secret the labor pull uses).'); process.exit(1); }

  // Targets: explicit override, else discover all stores by scheduleId.
  let list = [];
  if (process.env.LIFELENZ_PEOPLE_URLS) {
    try { list = JSON.parse(process.env.LIFELENZ_PEOPLE_URLS); } catch (e) { console.error('[cfg] LIFELENZ_PEOPLE_URLS bad JSON:', e.message); }
  } else {
    const stores = await discoverStores(TOKEN);
    list = stores.map(s => ({ loc: s.loc, url: peopleUrl(s.scheduleId) }));
  }
  if (!list.length) { console.error('[people] no target pages (token invalid, or no schedules discovered)'); process.exit(1); }

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'] });
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36', acceptDownloads: true });
  await context.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => undefined }));
  // Seed the token into storage under common keys so the SPA considers itself
  // authenticated (we don't know the exact key, so cover the likely candidates).
  await context.addInitScript(tok => {
    try { for (const k of ['authToken', 'token', 'access_token', 'X-Auth-Token', 'auth-token', 'lifelenz.token', 'auth']) { localStorage.setItem(k, tok); } } catch {}
  }, TOKEN);
  // Inject the token header on every LifeLenz API request the SPA makes.
  await context.route('**/*', route => {
    const req = route.request(); const u = req.url();
    if (u.includes('us01-connect.lifelenz.com') || u.includes('/manager/graphql') || u.includes('/api/')) {
      route.continue({ headers: { ...req.headers(), 'x-auth-token': TOKEN, 'x-business-id': BUSINESS_ID, 'x-lifelenz-device': 'webadmin', 'x-version': '1.75.21' } });
    } else route.continue();
  });
  const page = await context.newPage();

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
