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

    // ── SSO into the KB. Hitting the zendesk host initiates SSO (v3/zdlogin bounce → the custom domain
    // support.qsrsoft.com/hc). That bounce is FLAKY, so retry navigating to the help center until the
    // URL actually settles on a /hc/ page that isn't the zdlogin interstitial. `settled` = we're there.
    const settled = () => { const u = page.url(); return /support\.qsrsoft\.com\/hc\//.test(u); };
    const landed = u => /support\.qsrsoft\.com\/(hc|access)/.test(String(u));
    console.log('[kb] initiating KB SSO…');
    // ONE navigation, then a long single wait — the zdlogin JWT page bounces itself to the KB; re-
    // navigating just resets it to a fresh zdlogin (the flaky-loop lesson).
    await page.goto(`https://${KB_HOST}/hc/${LOCALE}`, { waitUntil: 'load', timeout: 45000 }).catch(() => {});
    await page.waitForURL(landed, { timeout: 40000 }).catch(() => {});
    let base = settled() ? new URL(page.url()).origin : null;
    if (!base) {
      // The zdlogin SSO endpoint is showing the QSRSoft sign-in form (our token/SPA app login doesn't
      // set the cookie session it honors). Sign in HERE with the same creds — this IS the SSO entry
      // that establishes the KB session and redirects to support.qsrsoft.com/hc.
      const loginSel = 'input[name="username"], input[name="email"], input[type="email"], #username';
      if (await page.$(loginSel)) {
        console.log('[kb] zdlogin is asking to sign in — logging in on the SSO page…');
        await page.fill(loginSel, u).catch(() => {});
        await page.fill('input[name="password"], input[type="password"], #password', pw).catch(() => {});
        await page.click('button[type="submit"], input[type="submit"], button:has-text("Sign in"), button:has-text("Login"), .btn-primary').catch(() => {});
        await page.waitForURL(landed, { timeout: 35000 }).catch(() => {});
        base = settled() ? new URL(page.url()).origin : null;
        console.log('[kb] after zdlogin sign-in:', page.url(), '| origin:', base);
      }
    }
    await snap('kb-01-helpcenter.png');
    console.log('[kb] KB landing url:', page.url(), '| origin:', base);
    if (!base) { console.error('[kb] SSO never settled on the help center — see zdlogin diagnostics + kb-01.'); process.exitCode = 1; return; }
    if (!settled()) { await page.goto(`https://support.qsrsoft.com/hc/${LOCALE}`, { waitUntil: 'load', timeout: 30000 }).catch(() => {}); await page.waitForURL(settled, { timeout: 20000 }).catch(() => {}); base = settled() ? new URL(page.url()).origin : base; }

    // ── Crawl the RENDERED help center (Zendesk server-renders article bodies into the page HTML; the
    // end-user JSON API 401s on this restricted custom-domain HC). BFS from the home page over
    // categories → sections → article pages, collecting article URLs, then read each article's body. ──
    const linksOn = () => page.evaluate((b) => {
      const all = [...document.querySelectorAll('a[href]')].map(a => a.href);
      const hc = [...new Set(all.filter(h => h.startsWith(b) && /\/hc\/[^/]+\/(categories|sections|articles)\//.test(h)).map(h => h.split('#')[0].split('?')[0]))];
      return { hc, total: all.length, sampleHc: [...new Set(all.filter(h => /\/hc\//.test(h)))].slice(0, 15) };
    }, base).catch(() => ({ hc: [], total: 0, sampleHc: [] }));

    const seen = new Set(), queue = [`${base}/hc/${LOCALE}`], articleUrls = new Set();
    let guard = 0, first = true;
    const LINK_SEL = 'a[href*="/categories/"], a[href*="/sections/"], a[href*="/articles/"]';
    while (queue.length && guard++ < 500) {
      const u = queue.shift();
      if (seen.has(u) || /\/articles\//.test(u)) continue;
      seen.add(u);
      await page.goto(u, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
      // The Copenhagen theme renders category/article links via JS — wait for them (the render-flake fix).
      await page.waitForSelector(LINK_SEL, { timeout: 8000 }).catch(() => {});
      let { hc, total, sampleHc } = await linksOn();
      // First listing page empty → one reload+wait retry (SSO/render timing).
      if (first && hc.length === 0) {
        await page.reload({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
        await page.waitForSelector(LINK_SEL, { timeout: 12000 }).catch(() => {});
        await new Promise(r => setTimeout(r, 1500));
        ({ hc, total, sampleHc } = await linksOn());
      }
      if (first) { console.log(`[kb] home: ${total} total links, ${hc.length} cat/sec/article; sample /hc/ hrefs:`, JSON.stringify(sampleHc)); first = false; }
      for (const l of hc) {
        if (/\/articles\//.test(l)) articleUrls.add(l);
        else if (!seen.has(l)) queue.push(l);
      }
    }
    console.log(`[kb] discovered ${articleUrls.size} article URL(s) across ${seen.size} listing page(s)`);
    if (!articleUrls.size) { console.error('[kb] no article links found — check kb-01 screenshot (are we signed in?).'); await snap('kb-02-nolinks.png'); process.exitCode = 1; return; }

    const rows = [];
    let n = 0;
    for (const au of articleUrls) {
      await page.goto(au, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      const art = await page.evaluate(() => {
        const idm = location.pathname.match(/\/articles\/(\d+)/);
        const pick = (...sels) => { for (const s of sels) { const el = document.querySelector(s); if (el) return el; } return null; };
        const titleEl = pick('.article-title', 'h1.article-title', '.article-header h1', 'article h1', 'h1');
        const bodyEl = pick('.article-body', '.article__body', '[itemprop="articleBody"]', '.article-content');
        const crumbs = [...document.querySelectorAll('.breadcrumbs a, nav.breadcrumbs a, ol.breadcrumbs a')].map(a => a.textContent.trim()).filter(Boolean);
        const ts = (document.querySelector('time[datetime]') || {}).getAttribute?.('datetime') || null;
        return { id: idm ? Number(idm[1]) : null, title: (titleEl?.textContent || '').trim(), bodyHtml: bodyEl ? bodyEl.innerHTML : '', crumbs, ts };
      }).catch(() => null);
      if (art && art.id && (art.title || art.bodyHtml)) {
        rows.push({
          id: art.id, title: art.title || null,
          body_html: art.bodyHtml || null, body_text: htmlToText(art.bodyHtml),
          section_id: null, category: art.crumbs[0] || null, section: art.crumbs[1] || art.crumbs[art.crumbs.length - 1] || null,
          locale: LOCALE, html_url: au, labels: null,
          updated_at: art.ts || null, pulled_at: new Date().toISOString(),
        });
      }
      if (++n % 20 === 0) console.log(`[kb] …read ${n}/${articleUrls.size} articles`);
    }
    console.log(`[kb] collected ${rows.length} articles`);
    if (!rows.length) { console.error('[kb] no article bodies extracted (theme selectors?) — check kb-01.'); process.exitCode = 1; return; }

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
