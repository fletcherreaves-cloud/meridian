#!/usr/bin/env node
// scripts/qsrsoft-field-scraper.mjs — capture QSRSoft field definitions from ℹ dialogs
//
// YOU click the ℹ button; this script watches for a dialog and captures the content.
//
// Run:
//   node scripts/qsrsoft-field-scraper.mjs
//   node scripts/qsrsoft-field-scraper.mjs --save   (also upsert to Supabase)
//
// With --save requires: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS = path.join(__dir, '..', 'screenshots');
const DISCOVERY_OUT = path.join(SCREENSHOTS, 'field-discovery.json');
const SAVE = process.argv.includes('--save');

fs.mkdirSync(SCREENSHOTS, { recursive: true });

const wait = (ms) => new Promise(r => setTimeout(r, ms));
const snap = (page, name) => page.screenshot({ path: path.join(SCREENSHOTS, name), fullPage: true }).catch(() => {});

function prompt(msg) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(msg, ans => { rl.close(); resolve(ans.trim()); }));
}

// Poll for a visible dialog and capture its content
async function waitForDialog(page, timeoutMs = 8000) {
  const DIALOG_SELS = [
    '.v-dialog .v-card',
    '.v-overlay__content .v-card',
    '[role="dialog"]',
    '.v-dialog__content',
    '.v-overlay.v-overlay--active .v-card',
  ];

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const sel of DIALOG_SELS) {
      const el = await page.$(sel);
      if (el) {
        const visible = await el.isVisible().catch(() => false);
        if (visible) return el;
      }
    }
    await wait(200);
  }
  return null;
}

async function captureDialog(page, pageKey, idx) {
  const dialog = await waitForDialog(page);
  if (!dialog) {
    console.log('  no dialog detected within 8 seconds');
    return null;
  }

  await snap(page, `scraper-${pageKey}-dialog-${idx}.png`);

  const raw = await dialog.evaluate(el => el.innerText?.replace(/\s+/g, ' ').trim() || '');
  console.log(`  dialog captured (${raw.length} chars):`);
  console.log(`  ${raw.slice(0, 300)}`);

  // Try to parse structured fields: look for label:description patterns
  const fields = await dialog.evaluate(el => {
    const results = [];

    // dt/dd pairs
    el.querySelectorAll('dt').forEach(dt => {
      const dd = dt.nextElementSibling;
      if (dd?.tagName === 'DD') {
        results.push({
          label: dt.innerText?.replace(/\s+/g, ' ').trim(),
          description: dd.innerText?.replace(/\s+/g, ' ').trim(),
        });
      }
    });

    // table rows (2-column)
    if (!results.length) {
      el.querySelectorAll('tr').forEach(tr => {
        const cells = tr.querySelectorAll('td, th');
        if (cells.length >= 2) {
          results.push({
            label: cells[0].innerText?.replace(/\s+/g, ' ').trim(),
            description: cells[1].innerText?.replace(/\s+/g, ' ').trim(),
          });
        }
      });
    }

    // heading + paragraph pairs
    if (!results.length) {
      el.querySelectorAll('h3, h4, h5, strong, b').forEach(h => {
        const next = h.nextElementSibling || h.parentElement?.nextElementSibling;
        if (next) {
          results.push({
            label: h.innerText?.replace(/\s+/g, ' ').trim(),
            description: next.innerText?.replace(/\s+/g, ' ').trim(),
          });
        }
      });
    }

    // Fallback: full text block
    if (!results.length) {
      const text = el.innerText?.replace(/\s+/g, ' ').trim();
      if (text) results.push({ label: '', description: text });
    }

    return results;
  });

  console.log(`  parsed ${fields.length} field entries`);
  fields.slice(0, 5).forEach(f => console.log(`    "${f.label}" → "${f.description?.slice(0, 80)}"`));

  return fields.map(f => ({ page: pageKey, ...f }));
}

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for --save');
  return createClient(url, key);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: false, slowMo: 0 });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  const allFindings = [];

  try {
    await page.goto('https://v3.myqsrsoft.com', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await prompt('\n>>> Log in to QSRSoft, then press Enter: ');

    const reportPages = [
      { key: 'dar',  label: 'Daily Activity Report' },
      { key: 'fob',  label: 'Food Over Base' },
      { key: 'pnl',  label: 'Profit & Loss' },
      { key: 'ebos', label: 'eBOS Purchases' },
      { key: 'cash', label: 'Cash / Controls' },
    ];

    for (const rp of reportPages) {
      console.log(`\n${'─'.repeat(60)}`);
      const ans = await prompt(`>>> Navigate to "${rp.label}", then press Enter (or "skip"): `);
      if (ans.toLowerCase() === 'skip') continue;

      await snap(page, `scraper-${rp.key}-page.png`);

      // Allow multiple ℹ dialogs per page (some pages may have several)
      let iconIdx = 0;
      while (true) {
        const action = await prompt(
          `>>> Click a ℹ button in the browser, then press Enter — or type "done" to move to next page: `
        );
        if (action.toLowerCase() === 'done') break;

        console.log(`  waiting for dialog…`);
        const findings = await captureDialog(page, rp.key, iconIdx++);

        if (findings) {
          allFindings.push(...findings);
          // Press Escape to close dialog before next click
          await page.keyboard.press('Escape');
          await wait(400);
        }
      }

      console.log(`  [${rp.key}] done — ${allFindings.filter(f => f.page === rp.key).length} definitions so far`);
    }

    // ── Save ──────────────────────────────────────────────────────────────────
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`[scraper] complete — ${allFindings.length} total definitions`);
    fs.writeFileSync(DISCOVERY_OUT, JSON.stringify(allFindings, null, 2));
    console.log(`[scraper] saved to ${DISCOVERY_OUT}`);

    if (SAVE && allFindings.length > 0) {
      const rows = allFindings.filter(f => f.label || f.description)
        .map(f => ({ page_key: f.page, field_label: f.label || '', description: f.description || '' }));
      console.log(`[scraper] upserting ${rows.length} rows to Supabase…`);
      const sb = await getSupabase();
      const { error } = await sb.from('qsr_field_definitions').upsert(rows, { onConflict: 'page_key,field_label' });
      if (error) console.error('[supabase]', error.message);
      else console.log('[supabase] upsert complete');
    }

    await prompt('\n>>> Press Enter to close the browser: ');

  } catch (err) {
    console.error('[scraper] fatal:', err.message);
    await snap(page, 'scraper-error.png');
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
