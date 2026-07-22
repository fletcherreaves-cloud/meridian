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

// Establish a session by filling the app's own login form. The form renders at
// /us01/auth/login (the bare IDM authorize URL is blank headless, but this isn't).
async function login(page) {
  console.log('[auth] opening login page…');
  await page.goto('https://admin.lifelenz.com/us01/auth/login', { waitUntil: 'domcontentloaded', timeout: 45000 });
  try {
    await page.waitForSelector('input[type="password"]', { timeout: 25000 }); // reliable anchor
  } catch (e) {
    const inputs = await page.evaluate(() => Array.from(document.querySelectorAll('input')).map(el => ({ type: el.type, name: el.name, id: el.id, placeholder: el.placeholder, visible: el.offsetParent !== null }))).catch(() => []);
    console.error('[auth] no password field. url:', page.url(), '| inputs:', JSON.stringify(inputs));
    try { mkdirSync('screenshots', { recursive: true }); await page.screenshot({ path: 'screenshots/login-fail.png', fullPage: true }); } catch {}
    throw e;
  }
  // Username = the first visible non-password text/email input.
  const userSel = 'input[type="email"], input[type="text"], input[name*="user" i], input[name*="email" i], input[name*="login" i], input[name*="geid" i], input[autocomplete="username"]';
  const u = await page.$(userSel);
  if (u) await u.fill(process.env.LIFELENZ_USERNAME);
  else await page.fill('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="submit"]):not([type="button"])', process.env.LIFELENZ_USERNAME);
  await page.fill('input[type="password"]', process.env.LIFELENZ_PASSWORD);
  if (DEBUG) { try { mkdirSync('screenshots', { recursive: true }); await page.screenshot({ path: 'screenshots/login-filled.png' }); } catch {} }
  // Click the primary "Log in" (NOT "Log in with SSO").
  const primary = page.getByRole('button', { name: /^\s*log ?in\s*$/i }).first();
  await primary.click({ timeout: 10000 }).catch(async () => { await page.click('button[type="submit"], input[type="submit"]').catch(() => {}); });
  await page.waitForFunction(() => !location.href.includes('/auth/login'), { timeout: 30000 }).catch(() => {});
  if (DEBUG) { try { await page.screenshot({ path: 'screenshots/login-after.png', fullPage: true }); } catch {} }
  console.log('[auth] post-login url:', page.url());
  if (page.url().includes('/auth/login')) throw new Error('still on login page after submit — check LIFELENZ_USERNAME/PASSWORD');
}

// Drive the export UI and capture the Simple CSV text for the current page.
async function downloadPeopleCSV(page, url, tag) {
  const seenCsv = [];
  const onResp = r => { try { if ((r.headers()['content-type'] || '').toLowerCase().includes('csv')) seenCsv.push(r.url()); } catch {} };
  page.on('response', onResp);
  // The LifeLenz SPA polls constantly (ping/events), so 'networkidle' never fires
  // — use domcontentloaded, then wait for the app's Download Report control.
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  const looksAuthed = await page.getByText(/download report/i).first().waitFor({ state: 'visible', timeout: 25000 }).then(() => true).catch(() => false);
  if (DEBUG) { try { mkdirSync('screenshots', { recursive: true }); await page.screenshot({ path: `screenshots/people-${tag}.png`, fullPage: true }); } catch {} }
  // Guard: if the token didn't take, the SPA bounces to a blank/login page.
  if (!looksAuthed) {
    const body = await page.evaluate(() => document.body?.innerText?.slice(0, 300) || '(empty)').catch(() => '?');
    console.log(`[people] ${tag}: 'Download Report' not visible — page text:`, body, '| url:', page.url());
  }
  let csvText = null;
  if (looksAuthed) {
    // Attach .catch so a timeout here never becomes an unhandled rejection.
    const dlPromise = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
    try {
      // Open the Download Report menu (best-effort), then invoke the Simple (CSV)
      // export directly: the link is hidden until the menu opens, but the app
      // (Aurelia) binds the export to a real click handler, so a native .click()
      // on the element fires it regardless of Playwright's visibility check.
      await page.getByText(/download report/i).first().click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(500);
      const clicked = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('a,button'));
        const el = els.find(e => /downloademployeerostercsvsimple/i.test(e.getAttribute('click.delegate') || ''))
                || els.find(e => /simple\s*\(csv\)/i.test((e.textContent || '').trim()));
        if (el) { el.click(); return true; }
        return false;
      });
      if (!clicked && DEBUG) console.log(`[people] ${tag}: Simple (CSV) link not found in DOM`);
      // A "Disclaimer" modal appears — the download only fires after clicking
      // "Acknowledge & Export".
      await page.waitForTimeout(600);
      await page.getByRole('button', { name: /acknowledge.*export/i }).click({ timeout: 8000 }).catch(async () => {
        await page.evaluate(() => { const b = Array.from(document.querySelectorAll('a,button')).find(e => /acknowledge\s*&?\s*export/i.test((e.textContent || '').trim())); if (b) b.click(); });
      });
    } catch (e) { if (DEBUG) console.log(`[people] ${tag}: export click failed:`, e.message); }
    const download = await dlPromise;
    if (download) { const stream = await download.createReadStream(); if (stream) { const chunks = []; for await (const c of stream) chunks.push(c); csvText = Buffer.concat(chunks).toString('utf8'); } }
  }
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
  if (!TOKEN) { console.error('[people] LIFELENZ_TOKEN not set — required for schedule discovery.'); process.exit(1); }
  if (!process.env.LIFELENZ_USERNAME || !process.env.LIFELENZ_PASSWORD) { console.error('[people] LIFELENZ_USERNAME/PASSWORD required for the login form.'); process.exit(1); }

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
  const page = await context.newPage();

  // Establish a real session via the app's login form (which renders at
  // /us01/auth/login — unlike the bare IDM authorize URL). This is what lets the
  // People pages load instead of bouncing back to login.
  try { await login(page); }
  catch (e) { console.error('[auth] login failed:', e.message); await browser.close(); process.exit(1); }

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
