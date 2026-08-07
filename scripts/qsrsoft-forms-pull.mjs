#!/usr/bin/env node
// scripts/qsrsoft-forms-pull.mjs — capture QSRSoft Shift-Management form templates
//
// Pulls the BLANK structure of the Pre-Shift Checklists (per daypart) and Travel
// Path forms from the QSRSoft Forms library, normalizes them, and writes them to
// public/forms/<slug>.json + public/forms/index.json. These are reusable, blank,
// fill-by-hand templates (no live/store data) rendered by src/views/forms-print.js.
//
// This is an ON-DEMAND capture, not a daily sync — forms rarely change. Re-run it
// when a form is edited in QSRSoft, then commit the updated public/forms/*.json.
//
// Endpoints (host: forms.home.myqsrsoft.com, auth: Cognito ID token as x-auth-token):
//   GET /api/forms?orgId=…&getLinkStatuses=true                → list of forms
//   GET /api/forms/questions?orgId=…&formId=…&isPublished=false → a form's questions
// The ID token is captured off a *.home.myqsrsoft.com request via Playwright login,
// then the two GETs run in-browser (page.evaluate) so CORS + origin match.
//
// Env:
//   QSRSOFT_USERNAME + QSRSOFT_PASSWORD  (required — Playwright login)
//   QSRSOFT_FORMS_TOKEN                  (optional — pre-captured x-auth-token, skips login)
//   FORMS_IDS=id1,id2                    (optional — pull exactly these formIds)
//   FORMS_MATCH=regex                    (optional — title filter; default Pre-Shift/Travel Path)
//   QSRSOFT_DEBUG=1
//
// Run locally (QSRSoft egress is open on your machine):
//   QSRSOFT_USERNAME=… QSRSOFT_PASSWORD=… node scripts/qsrsoft-forms-pull.mjs
//   node scripts/qsrsoft-forms-pull.mjs   (if QSRSOFT_FORMS_TOKEN is exported)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { normalizeForm } from '../src/engine/forms-model.js';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dir, '..', 'public', 'forms');
const ORG = 'a546d4ef-684a-4f25-8bc0-6580af068875';
const FORMS_BASE = 'https://forms.home.myqsrsoft.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';
const DEBUG = process.env.QSRSOFT_DEBUG === '1';
// Default target set (owner-confirmed): the 6 daypart Pre-Shift Checklists (with +
// without Playland) and the 2 Travel Path checklists — the current "/ Tasks"
// versions in the Shift Management Forms category. Pinned by formId so a re-run can
// never grab a draft/copy/legacy variant. Override with FORMS_IDS or FORMS_MATCH.
const DEFAULT_IDS = [
  '79d7dc35-eb18-4981-b2ff-632875fe0e0a', // Pre-Shift Checklist Breakfast
  '90790546-1a22-42e8-8039-4fcd0b01ebcf', // Pre-Shift Checklist Breakfast With Playland
  '9d94ab72-53b4-4b38-985c-7de69d82bfda', // Pre-Shift Checklist Lunch
  '5d8cc698-af6e-41ef-9461-5f0856d2a4e7', // Pre-Shift Checklist Lunch With Playland
  'b2b730a3-0a33-4258-b9d5-91a664000fd8', // Pre-Shift Checklist Dinner
  'b601b8d9-1ae7-450e-b426-25b16cae0081', // Pre-Shift Checklist Dinner With Playland
  '3ee1cc75-9f29-42d2-b49f-6ca3216addb4', // Travel Path No Play Place
  'fd2c551a-5859-449a-80c1-5bb980ce7704', // Travel Path With Playland
];
const DEFAULT_MATCH = /pre-?shift checklist|travel path/i;

const slugify = s => String(s || '')
  .replace(/\s*\/\s*tasks\s*$/i, '')          // drop trailing "/ Tasks"
  .toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'form';

// ── Auth: capture the Cognito ID token via Playwright login ───────────────────
async function captureToken() {
  const pre = (process.env.QSRSOFT_FORMS_TOKEN || '').trim();
  if (pre) { console.log('[auth] using QSRSOFT_FORMS_TOKEN'); return { token: pre, page: null, browser: null }; }
  const u = process.env.QSRSOFT_USERNAME, p = process.env.QSRSOFT_PASSWORD;
  if (!u || !p) { console.error('[auth] set QSRSOFT_USERNAME/PASSWORD (or QSRSOFT_FORMS_TOKEN)'); process.exit(1); }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: UA });
  const page = await context.newPage();
  // Backup path: sniff the x-auth-token header off any *.home.myqsrsoft.com request.
  let sniffed = null;
  page.on('request', req => {
    if (sniffed) return;
    if (req.url().includes('home.myqsrsoft.com')) {
      const t = req.headers()['x-auth-token'];
      if (t && t.length > 20) sniffed = t;
    }
  });

  await page.goto('https://v3.myqsrsoft.com', { waitUntil: 'networkidle', timeout: 45000 });
  const userSel = ['input[name="username"]', 'input[name="email"]', 'input[type="email"]', '#username', '#email'].join(', ');
  const passSel = 'input[type="password"], input[name="password"], #password';
  const subSel  = 'button[type="submit"], input[type="submit"], .btn-primary, button:has-text("Login"), button:has-text("Sign in")';
  try {
    await page.waitForSelector(userSel, { timeout: 20000 });
    await page.fill(userSel, u); await page.fill(passSel, p); await page.click(subSel);
    // Wait for the login to actually COMPLETE, not for network idle.
    // networkidle resolves after 500ms of quiet, which on this SPA happens between the
    // click and the auth request firing — it returned in ~3s with the button still
    // reading "Signing in". Same race that broke qsrsoft-pull.mjs (v4.853); this script
    // has no token interceptor, so the completion signal is the password field
    // detaching as the SPA leaves the login screen.
    {
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline) {
        const stillOnLogin = await page.locator(passSel).count().catch(() => 1);
        if (!stillOnLogin) break;
        await new Promise(r => setTimeout(r, 500));
      }
    }
  } catch (e) { console.log('[auth] login step:', e.message); }
  await new Promise(r => setTimeout(r, 3000)); // let the SPA hydrate + persist tokens

  // Primary path: the QSRSoft SPA (amazon-cognito-identity-js) persists the Cognito
  // ID token — the exact `token_use:"id"` token the forms API wants — in localStorage
  // under `CognitoIdentityServiceProvider.<clientId>.<user>.idToken`. Read it directly
  // (robust; no network-timing race). Scan both web storages, newest-looking wins.
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
    // Nudge the app to (re)issue by opening the forms library, then re-read + sniff.
    await page.goto('https://v3.myqsrsoft.com/forms/manage', { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 4000));
    token = await readIdToken() || sniffed;
  }

  if (!token) {
    // Diagnostics: show which storage keys exist so we can adjust if the shape changed.
    const keys = await page.evaluate(() => {
      const ls = Object.keys(window.localStorage || {});
      const ss = Object.keys(window.sessionStorage || {});
      return { url: location.href, ls, ss };
    }).catch(() => ({}));
    console.error('[auth] ✗ could not capture ID token. url=' + (keys.url || '?'));
    console.error('[auth]   localStorage keys: ' + (keys.ls || []).join(', ').slice(0, 800));
    console.error('[auth]   sessionStorage keys: ' + (keys.ss || []).join(', ').slice(0, 400));
    await browser.close();
    process.exit(1);
  }
  console.log('[auth] ✓ captured ID token' + (token === sniffed ? ' (via header sniff)' : ' (via storage)'));
  return { token, page, browser };
}

// In-browser fetch (runs on v3.myqsrsoft.com origin → CORS ok). Falls back to a
// direct node fetch when we used a pre-captured token (no page).
async function apiGet(ctx, url) {
  if (ctx.page) {
    return ctx.page.evaluate(async ({ url, token }) => {
      const r = await fetch(url, { headers: { 'x-auth-token': token, 'accept': '*/*', 'origin': 'https://v3.myqsrsoft.com', 'referer': 'https://v3.myqsrsoft.com/' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }, { url, token: ctx.token });
  }
  const r = await fetch(url, { headers: { 'x-auth-token': ctx.token, 'accept': '*/*', 'origin': 'https://v3.myqsrsoft.com', 'referer': 'https://v3.myqsrsoft.com/' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

async function main() {
  const ctx = await captureToken();
  try {
    const list = await apiGet(ctx, `${FORMS_BASE}/api/forms?orgId=${ORG}&getLinkStatuses=true`);
    const all = Array.isArray(list) ? list : [];
    console.log(`[forms] library has ${all.length} forms`);

    // Choose target forms: explicit IDs, else title match (published, not deleted).
    const idFilter = (process.env.FORMS_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
    const match = process.env.FORMS_MATCH ? new RegExp(process.env.FORMS_MATCH, 'i') : DEFAULT_MATCH;
    let targets = all.filter(f => !f.isDeleted && f.publishedStatus !== 'draft');
    targets = idFilter.length
      ? targets.filter(f => idFilter.includes(f.formId))
      : targets.filter(f => match.test(f.title || ''));
    console.log(`[forms] pulling ${targets.length} form(s): ${targets.map(f => f.title).join(' · ')}`);
    if (!targets.length) { console.error('[forms] no matching forms'); process.exit(1); }

    fs.mkdirSync(OUT_DIR, { recursive: true });
    const manifest = [];
    for (const f of targets) {
      try {
        const q = await apiGet(ctx, `${FORMS_BASE}/api/forms/questions?orgId=${ORG}&formId=${f.formId}&isPublished=false`);
        const model = normalizeForm(q, {
          formId: f.formId, title: (f.title || '').replace(/\s*\/\s*tasks\s*$/i, '').trim(),
          description: f.description, categoryTitle: f.categoryTitle, lastEditedAt: f.lastEditedAt,
        });
        const slug = slugify(f.title);
        fs.writeFileSync(path.join(OUT_DIR, `${slug}.json`), JSON.stringify(model, null, 2));
        manifest.push({ slug, title: model.title, formId: f.formId, category: model.category || 'Forms', itemCount: model.itemCount, lastEditedAt: f.lastEditedAt || '' });
        console.log(`  ✓ ${model.title} — ${model.itemCount} items → ${slug}.json`);
      } catch (e) { console.warn(`  ✗ ${f.title}: ${e.message}`); }
    }
    manifest.sort((a, b) => a.title.localeCompare(b.title));
    fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(manifest, null, 2));
    console.log(`[forms] wrote ${manifest.length} form(s) + index.json to public/forms/`);
  } finally {
    if (ctx.browser) await ctx.browser.close();
  }
}

main().catch(e => { console.error('[forms-pull] fatal:', e.message); process.exit(1); });
