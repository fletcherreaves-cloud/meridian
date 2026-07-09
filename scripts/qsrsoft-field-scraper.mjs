#!/usr/bin/env node
// scripts/qsrsoft-field-scraper.mjs — extract QSRSoft field definitions via report ℹ button
//
// Interactive mode: opens a browser, you log in and navigate to each report page,
// press Enter in the terminal after each page. The script clicks the report-level
// ℹ button, captures the dialog, and saves results.
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

// ── Helpers ───────────────────────────────────────────────────────────────────
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const snap = (page, name) => page.screenshot({ path: path.join(SCREENSHOTS, name), fullPage: true }).catch(() => {});

function prompt(msg) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(msg, ans => { rl.close(); resolve(ans.trim()); }));
}

// Supabase setup (--save only)
async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for --save');
  return createClient(url, key);
}

// Click the report-level ℹ button and capture the dialog that appears
async function clickInfoAndCapture(page, pageKey) {
  // The clickable ℹ icon in the report header bar
  // Distinguished from non-clickable info icons by v-icon--clickable class
  const INFO_BTN = 'i.mdi-information.v-icon--clickable, button .mdi-information, .v-btn .mdi-information';
  const DIALOG_SEL = '.v-dialog .v-card, .v-overlay__content .v-card, .v-dialog__content, [role="dialog"]';

  const icons = await page.$$(INFO_BTN);
  console.log(`  ℹ clickable icons found: ${icons.length}`);

  const allFindings = [];

  for (let i = 0; i < icons.length; i++) {
    console.log(`  clicking icon ${i + 1}/${icons.length}…`);
    try {
      await icons[i].scrollIntoViewIfNeeded();

      // Click the parent button if the icon itself isn't the trigger
      const clickTarget = await icons[i].evaluateHandle(el =>
        el.closest('button, [role="button"], .v-btn') || el
      );
      await clickTarget.click();
      await wait(1500);

      // Look for a dialog
      const dialog = await page.$(DIALOG_SEL);
      if (!dialog) {
        console.log(`    no dialog appeared`);
        await page.keyboard.press('Escape');
        await wait(300);
        continue;
      }

      // Extract all text content from the dialog
      const dialogText = await dialog.evaluate(el => el.innerText?.replace(/\s+/g, ' ').trim());
      console.log(`    dialog text (${dialogText?.length} chars): ${dialogText?.slice(0, 200)}`);

      // Try to extract structured field definitions
      // QSRSoft dialogs often have dt/dd pairs, table rows, or labeled sections
      const fields = await dialog.evaluate(el => {
        const results = [];

        // Pattern 1: definition list (dt = field name, dd = description)
        const dts = el.querySelectorAll('dt, .field-name, [class*="field-label"]');
        dts.forEach(dt => {
          const dd = dt.nextElementSibling;
          results.push({
            label: dt.textContent?.replace(/\s+/g, ' ').trim(),
            description: dd?.textContent?.replace(/\s+/g, ' ').trim() || '',
          });
        });

        // Pattern 2: table rows (first cell = label, second = description)
        if (!results.length) {
          el.querySelectorAll('tr').forEach(tr => {
            const cells = tr.querySelectorAll('td, th');
            if (cells.length >= 2) {
              results.push({
                label: cells[0].textContent?.replace(/\s+/g, ' ').trim(),
                description: cells[1].textContent?.replace(/\s+/g, ' ').trim(),
              });
            }
          });
        }

        // Pattern 3: just grab full text as one block
        if (!results.length) {
          results.push({ label: '', description: el.innerText?.replace(/\s+/g, ' ').trim() });
        }

        return results;
      });

      console.log(`    extracted ${fields.length} field definitions`);
      fields.forEach(f => console.log(`      "${f.label}" → "${f.description?.slice(0, 80)}"`));

      allFindings.push(...fields.map(f => ({ page: pageKey, ...f })));

      // Save screenshot of dialog
      await snap(page, `scraper-${pageKey}-dialog-${i}.png`);

      // Close dialog
      await page.keyboard.press('Escape');
      await wait(500);

    } catch (err) {
      console.log(`    error clicking icon ${i}: ${err.message}`);
      await page.keyboard.press('Escape').catch(() => {});
    }
  }

  return allFindings;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: false, slowMo: 30 });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  const allFindings = [];

  try {
    // ── Step 1: Login ──────────────────────────────────────────────────────────
    console.log('\n[scraper] opening QSRSoft…');
    await page.goto('https://v3.myqsrsoft.com', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await prompt('\n>>> Log in to QSRSoft in the browser window, then press Enter here: ');
    console.log('[scraper] logged in — url:', page.url());

    // ── Step 2: Scrape each report page interactively ─────────────────────────
    const reportPages = [
      { key: 'dar',  label: 'Daily Activity Report' },
      { key: 'fob',  label: 'Food Over Base' },
      { key: 'pnl',  label: 'Profit & Loss' },
      { key: 'ebos', label: 'eBOS Purchases' },
      { key: 'cash', label: 'Cash / Controls' },
    ];

    for (const rp of reportPages) {
      console.log(`\n${'─'.repeat(60)}`);
      const ans = await prompt(`>>> Navigate to "${rp.label}" in the browser, then press Enter (or type "skip" to skip): `);
      if (ans.toLowerCase() === 'skip') { console.log('  skipped'); continue; }

      const currentUrl = page.url();
      console.log(`[${rp.key}] url: ${currentUrl}`);
      await snap(page, `scraper-${rp.key}-loaded.png`);

      // Wait a moment for any lazy content
      await wait(2000);

      console.log(`[${rp.key}] looking for ℹ button and clicking…`);
      const findings = await clickInfoAndCapture(page, rp.key);
      allFindings.push(...findings);
      console.log(`[${rp.key}] found ${findings.length} total definitions`);
    }

    // ── Step 3: Save ──────────────────────────────────────────────────────────
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`[scraper] complete — ${allFindings.length} total field definitions`);
    fs.writeFileSync(DISCOVERY_OUT, JSON.stringify(allFindings, null, 2));
    console.log(`[scraper] saved to ${DISCOVERY_OUT}`);

    if (SAVE && allFindings.length > 0) {
      const meaningful = allFindings.filter(f => f.label || f.description);
      console.log(`[scraper] upserting ${meaningful.length} rows to Supabase…`);
      const sb = await getSupabase();
      const { error } = await sb.from('qsr_field_definitions').upsert(
        meaningful.map(f => ({ page_key: f.page, field_label: f.label || '', description: f.description || '' })),
        { onConflict: 'page_key,field_label' }
      );
      if (error) console.error('[supabase] error:', error.message);
      else console.log('[supabase] upsert complete');
    }

    await prompt('\n>>> Done. Press Enter to close the browser: ');

  } catch (err) {
    console.error('[scraper] fatal:', err.message);
    await snap(page, 'scraper-error.png');
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
