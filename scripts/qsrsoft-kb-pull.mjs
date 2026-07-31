#!/usr/bin/env node
// scripts/qsrsoft-kb-pull.mjs
// ── QSRSoft Zendesk Knowledge Base pull (#41) ───────────────────────────────────
// The QSRSoft help center lives at qsrsoft.zendesk.com and is auth-gated, but it SSOs from the normal
// QSRSoft login. So we log in with Playwright (same ladder as the other pulls), let the session SSO
// into Zendesk, then walk the Zendesk Help Center API from INSIDE the authenticated browser context
// (cookies carry) — categories + sections + articles — and upsert to qsrsoft_kb. Grounds SAGE + our
// diagnostics in QSRSoft's own methodology (variance posting, deactivated-item timing, retention…).
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, QSRSOFT_USERNAME, QSRSOFT_PASSWORD
// Optional:     KB_HOST=qsrsoft.zendesk.com   KB_LOCALE=en-us   QSRSOFT_DEBUG=1

import { createClient } from '@supabase/supabase-js';
import { withRetry } from './_retry.mjs';

const SB_URL = process.env.VITE_SUPABASE_URL;  // NB: not named URL — that would shadow the global URL ctor
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB_URL || !KEY) { console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const sb = createClient(SB_URL, KEY, { auth: { persistSession: false } });

const KB_HOST = (process.env.KB_HOST || 'qsrsoft.zendesk.com').trim();
const LOCALE = (process.env.KB_LOCALE || 'en-us').trim();
const DEBUG = process.env.QSRSOFT_DEBUG === '1';

// Strip HTML → plain text (for search + LLM context). Good enough; not a full parser.
function htmlToText(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

async function main() {
  const u = process.env.QSRSOFT_USERNAME, pw = process.env.QSRSOFT_PASSWORD;
  if (!u || !pw) { console.error('[kb] QSRSOFT_USERNAME / QSRSOFT_PASSWORD required (Playwright login).'); process.exit(1); }

  const { chromium } = await import('playwright');
  const { mkdirSync } = await import('fs');
  try { mkdirSync('screenshots', { recursive: true }); } catch {}

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36' });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  const snap = (n) => page.screenshot({ path: `screenshots/${n}`, fullPage: true }).catch(() => {});

  try {
    // ── Login to QSRSoft ──
    console.log('[kb] logging in to v3.myqsrsoft.com…');
    await page.goto('https://v3.myqsrsoft.com', { waitUntil: 'networkidle', timeout: 45000 });
    const userSel = ['input[name="username"]', 'input[name="email"]', 'input[type="email"]', '#username', '#email', 'input[autocomplete="username"]', 'input[placeholder*="email" i]', 'input[placeholder*="username" i]'].join(', ');
    await page.waitForSelector(userSel, { timeout: 20000 });
    await page.fill(userSel, u);
    await page.fill('input[type="password"], input[name="password"]', pw);
    await page.click('button[type="submit"], input[type="submit"], .btn-primary, button:has-text("Login"), button:has-text("Sign in")');
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    console.log('[kb] post-login url:', page.url());

    // ── SSO into the KB the way the app does: the left-menu "Support Site" link (2nd from bottom)
    // initiates the SSO handshake — no separate login (owner-confirmed). Read its href and navigate to
    // it (robust vs. clicking a possibly-new-tab link); fall back to the help-center URL directly.
    let ssoHref = null;
    try {
      ssoHref = await page.evaluate(() => {
        const links = [...document.querySelectorAll('a')];
        const byText = links.find(a => /support\s*site/i.test(a.textContent || ''));
        const byHref = links.find(a => /zendesk|\/support\b|help[_-]?center|\/hc\b/i.test(a.href || ''));
        return (byText || byHref)?.href || null;
      });
    } catch {}
    if (ssoHref) {
      console.log('[kb] found Support Site link → SSO via', ssoHref);
      await page.goto(ssoHref, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    } else {
      console.log(`[kb] Support Site link not found — trying ${KB_HOST}/hc/${LOCALE} directly…`);
      await page.goto(`https://${KB_HOST}/hc/${LOCALE}`, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    }
    // The SSO bounces through v3.myqsrsoft.com/zdlogin → the custom KB domain (support.qsrsoft.com/hc).
    // Wait for that redirect to SETTLE on a /hc/ URL before reading the origin (first run caught the
    // zdlogin bounce mid-flight).
    await page.waitForURL(/\/hc\//, { timeout: 25000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));
    await snap('kb-01-helpcenter.png');
    console.log('[kb] KB landing url:', page.url());
    if (!/\/hc\//.test(page.url())) {
      await page.goto(`https://${KB_HOST}/hc/${LOCALE}`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
      await page.waitForURL(/\/hc\//, { timeout: 20000 }).catch(() => {});
    }
    // The API MUST be called on the origin we actually landed on (same-origin) — the KB is served from
    // its custom domain, so fetching the zendesk.com host cross-origin fails (the first-run lesson).
    const base = new URL(page.url()).origin;
    console.log('[kb] KB origin (API base):', base);

    // ── Walk the Help Center API from inside the authenticated browser (same-origin) ──
    const fetchJson = (path) => page.evaluate(async (p) => {
      const res = await fetch(p, { credentials: 'include', headers: { Accept: 'application/json' } });
      return { status: res.status, ok: res.ok, body: res.ok ? await res.json() : await res.text().catch(() => '') };
    }, path);

    // Categories + sections give us human-readable breadcrumbs.
    const catById = {}, secById = {};
    for (const [key, store] of [['categories', catById], ['sections', secById]]) {
      let url = `${base}/api/v2/help_center/${LOCALE}/${key}.json?per_page=100`;
      while (url) {
        const r = await withRetry(() => fetchJson(url), { tries: 3, baseMs: 900, label: key });
        if (!r.ok) { console.error(`[kb] ${key} fetch failed: ${r.status} ${String(r.body).slice(0, 200)}`); break; }
        for (const it of (r.body[key] || [])) store[it.id] = it;
        url = r.body.next_page || null;
      }
      console.log(`[kb] loaded ${Object.keys(store).length} ${key}`);
    }

    // Articles (paginated).
    const rows = [];
    let url = `https://${KB_HOST}/api/v2/help_center/${LOCALE}/articles.json?per_page=100`;
    let pageN = 0;
    while (url) {
      const r = await withRetry(() => fetchJson(url), { tries: 4, baseMs: 1000, label: `articles[${pageN}]` });
      if (!r.ok) { console.error(`[kb] articles fetch failed: ${r.status} ${String(r.body).slice(0, 300)}`); if (pageN === 0) { await snap('kb-02-articles-fail.png'); } break; }
      for (const a of (r.body.articles || [])) {
        const sec = secById[a.section_id]; const cat = sec ? catById[sec.category_id] : null;
        rows.push({
          id: a.id, title: a.title || null,
          body_html: a.body || null, body_text: htmlToText(a.body),
          section_id: a.section_id ?? null, section: sec ? sec.name : null, category: cat ? cat.name : null,
          locale: a.locale || LOCALE, html_url: a.html_url || null,
          labels: Array.isArray(a.label_names) ? a.label_names : null,
          updated_at: a.updated_at || a.edited_at || null, pulled_at: new Date().toISOString(),
        });
      }
      pageN++;
      url = r.body.next_page || null;
      if (pageN > 60) break; // safety
    }
    console.log(`[kb] collected ${rows.length} articles across ${pageN} page(s)`);
    if (!rows.length) { console.error('[kb] no articles — SSO may not have carried into Zendesk (check kb-01/kb-02 screenshots).'); process.exitCode = 1; return; }

    let saved = 0;
    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      const { error } = await withRetry(() => sb.from('qsrsoft_kb').upsert(chunk, { onConflict: 'id' }), { tries: 4, baseMs: 800, label: `upsert[${i}]` });
      if (error) { console.error('[kb] upsert error:', error.message); process.exitCode = 1; } else saved += chunk.length;
    }
    console.log(`[kb] ✓ stored ${saved}/${rows.length} KB articles`);
  } catch (e) {
    console.error('[kb] FATAL', e?.message || e); await snap('kb-99-fatal.png'); process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error('[kb] FATAL', e); process.exit(1); });
