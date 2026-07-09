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

// No credentials needed — script opens a browser and waits for manual login

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

// ag-Grid + Vuetify: info icons are mdi-information elements inside header cells
const INFO_ICON_SEL  = 'i.mdi-information, .mdi-information';
const HEADER_CELL_SEL = '.ag-header-cell';
// Vuetify 3 tooltip appears in .v-overlay__content when hovered
const TOOLTIP_SEL = '.v-overlay__content, .v-tooltip__content, [class*="v-tooltip"] .v-overlay__content';

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

// Wait for ag-Grid to finish loading on the current page
async function waitForGrid(page) {
  try {
    // Wait for at least one header cell to appear
    await page.waitForSelector(HEADER_CELL_SEL, { timeout: 15000 });
    // Wait for loading overlay to disappear
    await page.waitForFunction(
      () => !document.querySelector('.ag-loading, .ag-overlay-loading-wrapper, .v-skeleton-loader'),
      { timeout: 15000, polling: 500 },
    ).catch(() => {}); // grid may not have a loading overlay
    await wait(1000); // final settle
  } catch (_) {
    console.log('  (no ag-grid detected — continuing anyway)');
  }
}

// Hover an mdi-information icon and capture the Vuetify tooltip text
async function hoverInfoIcon(page, el) {
  try {
    await el.scrollIntoViewIfNeeded();
    await el.hover();
    await wait(800);
    const text = await page.evaluate((tooltipSel) => {
      const tips = Array.from(document.querySelectorAll(tooltipSel));
      for (const t of tips) {
        const txt = t.textContent?.replace(/\s+/g, ' ').trim();
        if (txt && txt.length > 3) return txt;
      }
      return null;
    }, TOOLTIP_SEL);
    // Move mouse away to close tooltip
    await page.mouse.move(0, 0);
    await wait(200);
    return text;
  } catch (_) { return null; }
}

// Get the column header label for an mdi-information icon
async function getHeaderLabel(el) {
  return el.evaluate(node => {
    const cell = node.closest('.ag-header-cell, .ag-header-group-cell, th, [class*="header"]');
    if (!cell) return node.parentElement?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) || '';
    // ag-Grid: the label text is in .ag-header-cell-text
    const labelEl = cell.querySelector('.ag-header-cell-text, .ag-header-group-cell-label');
    if (labelEl) return labelEl.textContent?.replace(/\s+/g, ' ').trim();
    return cell.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) || '';
  }).catch(() => '');
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
    // ── Login — manual ────────────────────────────────────────────────────────
    console.log('[1/6] opening v3.myqsrsoft.com…');
    await page.goto('https://v3.myqsrsoft.com', { waitUntil: 'domcontentloaded', timeout: 45000 });
    console.log('[1/6] page loaded — please log in manually, then press Enter in this terminal');

    // Wait for Enter keypress — simplest possible "are you done?" signal
    await new Promise(resolve => {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.once('data', () => { process.stdin.setRawMode(false); process.stdin.pause(); resolve(); });
    });

    console.log('[2/6] resuming — current url:', page.url());
    await snap(page, 'scraper-02-post-login.png');

    // ── Scrape each report page ─────────────────────────────────────────────
    for (const rp of REPORT_PAGES) {
      if (!rp.url) {
        console.log(`[scraper] SKIP ${rp.key} — no URL`);
        continue;
      }

      console.log(`\n[scraper] → ${rp.label}`);
      try {
        console.log(`  [a] navigating…`);
        await page.goto(rp.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        console.log(`  [b] waiting 4s for content…`);
        await wait(4000);
        console.log(`  [c] taking screenshot…`);
        await snap(page, `scraper-${rp.key}.png`);

        console.log(`  [d] waiting for ag-grid to load…`);
        await waitForGrid(page);

        const url = page.url();
        console.log(`  url: ${url}`);

        console.log(`  [e] finding mdi-information icons in header cells…`);
        const iconEls = await page.$$(INFO_ICON_SEL);
        console.log(`  info icons found: ${iconEls.length}`);

        const pageFindings = [];
        for (let i = 0; i < iconEls.length; i++) {
          const el = iconEls[i];
          console.log(`  hovering icon ${i + 1}/${iconEls.length}…`);
          const label   = await getHeaderLabel(el);
          const tooltip = await hoverInfoIcon(page, el);
          console.log(`    label="${label}" tooltip="${(tooltip || '').slice(0, 80)}"`);
          if (label || tooltip) {
            pageFindings.push({ page: rp.key, label, tooltip: tooltip || '', source: 'hover' });
          }
        }

        allFindings.push(...pageFindings);
        console.log(`  [f] done — ${pageFindings.length} definitions from ${rp.key}`);

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
