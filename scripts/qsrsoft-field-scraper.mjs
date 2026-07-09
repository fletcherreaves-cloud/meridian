#!/usr/bin/env node
// scripts/qsrsoft-field-scraper.mjs — discover & extract QSRSoft field info-icon definitions
//
// Phase 1 (default): discovery — logs into QSRSoft, visits each report page,
//   dumps every potential info icon it finds to console + screenshots/field-discovery.json
//
// Phase 2 (--save): after discovery confirms selectors, re-runs and upserts
//   all found definitions to Supabase qsr_field_definitions table.
//
// Run:
//   QSRSOFT_USERNAME=x QSRSOFT_PASSWORD=y node scripts/qsrsoft-field-scraper.mjs
//   QSRSOFT_USERNAME=x QSRSOFT_PASSWORD=y node scripts/qsrsoft-field-scraper.mjs --save
//   QSRSOFT_USERNAME=x QSRSOFT_PASSWORD=y node scripts/qsrsoft-field-scraper.mjs --headless --save
//
// With --save also requires: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS = path.join(__dir, '..', 'screenshots');
const DISCOVERY_OUT = path.join(SCREENSHOTS, 'field-discovery.json');

const HEADLESS = process.argv.includes('--headless');
const SAVE     = process.argv.includes('--save');

const u  = process.env.QSRSOFT_USERNAME;
const pw = process.env.QSRSOFT_PASSWORD;
if (!u || !pw) {
  console.error('QSRSOFT_USERNAME and QSRSOFT_PASSWORD required');
  process.exit(1);
}

// ── Report pages to scrape ────────────────────────────────────────────────────
// Each entry: { key, label, url }
// url may be null → will be discovered by clicking nav links matching `navText`
const REPORT_PAGES = [
  { key: 'dar',  label: 'Daily Activity',        url: 'https://v3.myqsrsoft.com/reports/mcd/shift/dailyActivity' },
  { key: 'fob',  label: 'Food Over Base',         url: 'https://v3.myqsrsoft.com/reports/mcd/food/actualFoodOverBase' },
  { key: 'pnl',  label: 'Profit & Loss',          url: null, navText: 'P&L' },
  { key: 'ebos', label: 'eBOS Purchases',         url: null, navText: 'eBOS' },
  { key: 'cash', label: 'Cash / Controls',        url: null, navText: 'Cash' },
];

// ── Selectors to probe for info icons ────────────────────────────────────────
const INFO_SELECTORS = [
  'i.fa-info-circle',
  'i.fa-info',
  'i[class*="info"]',
  'span[class*="info-icon"]',
  'span[class*="infoIcon"]',
  '.info-icon',
  '.infoIcon',
  '[data-toggle="tooltip"]',
  '[data-bs-toggle="tooltip"]',
  '[data-tippy-content]',
  'th [title]',
  'td [title]',
  '[aria-label]',
  'button[class*="info"]',
  'svg[class*="info"]',
].join(', ');

// ── Supabase setup (only needed with --save) ──────────────────────────────────
async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for --save');
  return createClient(url, key);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const wait  = (ms) => new Promise(r => setTimeout(r, ms));
const snap  = (page, name) => page.screenshot({ path: path.join(SCREENSHOTS, name), fullPage: true }).catch(() => {});

// Extract all info-icon elements on the current page and their context
async function extractInfoIcons(page, pageKey) {
  return page.evaluate(({ selectors, pageKey }) => {
    const results = [];
    const seen = new Set();

    // Try each selector
    const els = document.querySelectorAll(selectors);
    els.forEach(el => {
      // Get tooltip text from various attributes and siblings
      const tooltip =
        el.getAttribute('data-tippy-content') ||
        el.getAttribute('data-original-title') ||
        el.getAttribute('title') ||
        el.getAttribute('aria-label') ||
        el.getAttribute('data-content') ||
        el.closest('[data-tippy-content]')?.getAttribute('data-tippy-content') ||
        el.closest('[title]')?.getAttribute('title') || '';

      // Get field label from nearest header context
      const th = el.closest('th, td, .column-header, [class*="header"], [class*="col"]');
      const label = (th?.textContent || el.parentElement?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);

      // Also grab the element's own text
      const elText = el.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) || '';

      // CSS classes of the element
      const cls = el.className || '';

      // Outer HTML snippet for inspection
      const html = el.outerHTML?.slice(0, 200) || '';

      const key = `${tooltip}::${label}`;
      if (seen.has(key)) return;
      seen.add(key);

      results.push({ page: pageKey, label, tooltip, elText, cls, html });
    });

    return results;
  }, { selectors: INFO_SELECTORS, pageKey });
}

// Try clicking an info icon to reveal a tooltip/modal, then capture the popup text
async function clickAndCapture(page, el) {
  try {
    await el.hover();
    await wait(600);
    // Look for newly visible tooltip/popover
    const popText = await page.evaluate(() => {
      const selectors = [
        '.tippy-content', '.tooltip-inner', '.popover-body',
        '[class*="tooltip"]:not([class*="icon"])', '[role="tooltip"]',
        '.tooltip', '.popover', '[class*="popover"]',
        '.modal-body', '.info-popup', '[class*="info-popup"]',
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) { // visible
          const text = el.textContent?.replace(/\s+/g, ' ').trim();
          if (text && text.length > 3) return text;
        }
      }
      return null;
    });
    if (popText) return popText;

    // Try click instead of hover
    await el.click().catch(() => {});
    await wait(500);
    const popText2 = await page.evaluate(() => {
      const selectors = ['.tippy-content','.tooltip-inner','.popover-body','[role="tooltip"]','.modal-body'];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) {
          const text = el.textContent?.replace(/\s+/g, ' ').trim();
          if (text && text.length > 3) return text;
        }
      }
      return null;
    });
    return popText2;
  } catch (_) { return null; }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: HEADLESS, slowMo: HEADLESS ? 0 : 50 });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);

  const allFindings = [];

  try {
    // ── Login ──────────────────────────────────────────────────────────────────
    console.log('[scraper] logging in to v3.myqsrsoft.com…');
    await page.goto('https://v3.myqsrsoft.com', { waitUntil: 'networkidle', timeout: 45000 });
    await snap(page, 'scraper-01-landing.png');

    const userSel = [
      'input[name="username"]','input[name="email"]','input[type="email"]',
      '#username','#email','input[autocomplete="username"]',
      'input[placeholder*="email" i]','input[placeholder*="username" i]',
    ].join(', ');

    await page.waitForSelector(userSel, { timeout: 20000 });
    await page.fill(userSel, u);
    await page.fill('input[type="password"], input[name="password"]', pw);
    await page.click('button[type="submit"], input[type="submit"], .btn-primary, button:has-text("Login"), button:has-text("Sign in")');
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    await snap(page, 'scraper-02-post-login.png');
    console.log('[scraper] logged in — url:', page.url());

    // ── Discover nav links (for pages without direct URLs) ──────────────────
    const navLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a, [role="menuitem"], [role="option"]'))
        .map(a => ({ text: a.textContent?.replace(/\s+/g,' ').trim(), href: a.href || '' }))
        .filter(a => a.text && a.href && a.href.includes('myqsrsoft.com'))
        .slice(0, 100);
    });
    console.log('[scraper] nav links found:', navLinks.length);
    if (navLinks.length) {
      console.log('  sample:', navLinks.slice(0,5).map(l=>l.text).join(' | '));
    }

    // Fill in missing URLs from nav
    for (const rp of REPORT_PAGES) {
      if (!rp.url && rp.navText) {
        const match = navLinks.find(l => l.text.toLowerCase().includes(rp.navText.toLowerCase()));
        if (match) {
          rp.url = match.href;
          console.log(`[scraper] resolved ${rp.key} → ${rp.url}`);
        }
      }
    }

    // ── Scrape each report page ─────────────────────────────────────────────
    for (const rp of REPORT_PAGES) {
      if (!rp.url) {
        console.log(`[scraper] SKIP ${rp.key} — no URL found`);
        continue;
      }

      console.log(`\n[scraper] → ${rp.label} (${rp.url})`);
      try {
        await page.goto(rp.url, { waitUntil: 'networkidle', timeout: 30000 });
        await wait(2000); // let lazy-loaded content render
        await snap(page, `scraper-${rp.key}.png`);

        // Quick page structure dump
        const structure = await page.evaluate(() => ({
          title: document.title,
          headings: Array.from(document.querySelectorAll('h1,h2,h3')).map(h=>h.textContent?.trim()).slice(0,5),
          thCount: document.querySelectorAll('th').length,
          tdCount: document.querySelectorAll('td').length,
          bodySnippet: document.body.innerHTML.slice(0, 500),
        }));
        console.log(`  title: ${structure.title}`);
        console.log(`  headings: ${structure.headings.join(' | ')}`);
        console.log(`  table cells: ${structure.thCount} th, ${structure.tdCount} td`);

        // ── Static extraction ──
        const staticFindings = await extractInfoIcons(page, rp.key);
        console.log(`  static info icons found: ${staticFindings.length}`);
        staticFindings.forEach(f => {
          console.log(`    label="${f.label}" tooltip="${f.tooltip?.slice(0,80)}" cls="${f.cls}"`);
        });

        // ── Click/hover each to get dynamic tooltips ──
        const iconEls = await page.$$(INFO_SELECTORS);
        console.log(`  clickable elements matching selectors: ${iconEls.length}`);

        const dynamicFindings = [];
        for (let i = 0; i < Math.min(iconEls.length, 30); i++) {
          const el = iconEls[i];
          const popText = await clickAndCapture(page, el);
          if (popText && popText.length > 5) {
            const label = await el.evaluate(node => {
              const ctx = node.closest('th, td, .column-header, [class*="header"]');
              return (ctx?.textContent || node.parentElement?.textContent || '').replace(/\s+/g,' ').trim().slice(0,80);
            }).catch(() => '');
            const existing = staticFindings.find(f => f.label === label);
            if (!existing?.tooltip) {
              dynamicFindings.push({ page: rp.key, label, tooltip: popText, source: 'click' });
              console.log(`    [click] label="${label}" → "${popText.slice(0,80)}"`);
            }
          }
        }

        const pageFindings = [...staticFindings, ...dynamicFindings];
        allFindings.push(...pageFindings);

        // Also dump raw HTML of first few th elements for analysis
        const thSamples = await page.evaluate(() =>
          Array.from(document.querySelectorAll('th')).slice(0,10).map(th => th.outerHTML.slice(0,300))
        );
        if (thSamples.length) {
          console.log(`  th samples:`);
          thSamples.forEach((s,i) => console.log(`    [${i}] ${s.replace(/\n/g,' ')}`));
        }

      } catch (err) {
        console.error(`  [error] ${rp.key}: ${err.message}`);
        await snap(page, `scraper-${rp.key}-error.png`);
      }
    }

    // ── Save discovery output ─────────────────────────────────────────────────
    fs.mkdirSync(SCREENSHOTS, { recursive: true });
    fs.writeFileSync(DISCOVERY_OUT, JSON.stringify(allFindings, null, 2));
    console.log(`\n[scraper] discovery complete — ${allFindings.length} total findings`);
    console.log(`[scraper] saved to ${DISCOVERY_OUT}`);
    console.log('[scraper] screenshots saved to screenshots/');

    // ── Save to Supabase (--save) ─────────────────────────────────────────────
    if (SAVE && allFindings.length > 0) {
      const meaningful = allFindings.filter(f => f.tooltip && f.tooltip.length > 5);
      console.log(`\n[scraper] upserting ${meaningful.length} definitions to Supabase…`);
      const sb = await getSupabase();
      const rows = meaningful.map(f => ({
        page_key:    f.page,
        field_label: f.label,
        description: f.tooltip,
      }));
      const { error } = await sb.from('qsr_field_definitions').upsert(rows, {
        onConflict: 'page_key,field_label',
        ignoreDuplicates: false,
      });
      if (error) console.error('[supabase] error:', error.message);
      else console.log('[supabase] upsert complete');
    }

  } catch (err) {
    console.error('[scraper] fatal:', err.message);
    await snap(page, 'scraper-error.png');
  } finally {
    if (!HEADLESS) await wait(2000); // let user see final state
    await browser.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
