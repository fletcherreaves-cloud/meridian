// ── Eager-payload gzip budget guard (#207, corrected by #244) ───────────────────────────────────
// #207 originally gated on the entry chunk's own printed gzip line. That's not what a fresh page
// load actually pays for: the entry chunk's <script type="module"> triggers the browser to fetch
// every <link rel="modulepreload"> chunk in dist/index.html too, eagerly, before the app can
// render anything — same blocking cost as if they were one file. Gating on the entry line alone
// is blind to that. #244: pre-#238 (commit 1c6e4c7) the entry line read 698.99 KB (722.34 KB in
// the old script's own printed number), reporting 127.66 KB of headroom under an 850 KB budget —
// but the TRUE eager payload (entry + all modulepreload chunks) was 854.81 KB, already OVER
// budget. The old gate was passing an over-budget bundle. #238 (commit 3980e71) dropped the entry
// file to 469.36 KB, but with 6 new modulepreload chunks split out, the true eager total only
// fell to 744.09 KB — a real −110.72 KB, not the −237 KB the entry-only number implied. #238 is
// the fix that took the app from over budget to under budget, not a cosmetic entry-chunk trim.
// The 850 KB budget itself is unchanged by this fix — it was always meant as a proxy for bytes-
// before-interactive, which eager-total measures correctly and entry-only did not. Don't
// recalibrate the number; the metric was wrong, not the threshold.
//
// This script now: builds, parses vite's own printed gzip line for EVERY chunk (not just the
// entry one), reads dist/index.html for the entry <script type="module"> and every
// <link rel="modulepreload"> (explicitly NOT rel="prefetch" — prefetch is low-priority/idle-time,
// not eager), sums their gzip sizes, and gates that sum against the budget. It fails loudly
// (non-zero exit, explicit error) if index.html can't be read, the entry script tag isn't found,
// or any modulepreload target's gzip size isn't in the parsed map — so a reporter-format change
// or an HTML-shape change trips a hard failure instead of silently reporting a small, false-
// passing number.
//
//   node scripts/check-bundle-budget.mjs [--budget-kb=850]

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, '..', 'dist');
const INDEX_HTML = join(DIST_DIR, 'index.html');

const budgetArg = process.argv.find(a => a.startsWith('--budget-kb='));
const BUDGET_KB = budgetArg ? Number(budgetArg.split('=')[1]) : 850;

let output;
try {
  output = execSync('npx vite build', { encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 });
} catch (e) {
  process.stdout.write(e.stdout || '');
  process.stderr.write(e.stderr || '');
  process.exit(e.status || 1);
}
process.stdout.write(output);

// Every "dist/assets/<file> ... NNN.NN kB │ gzip: NNN.NN kB" line vite prints, for any asset —
// not just the entry index-*.js one. Builds a filename → gzip KB map.
const LINE_RE = /dist\/assets\/([\w.-]+\.(?:js|css))\s+[\d,]+\.\d+\s*kB\s*(?:│|\|)\s*gzip:\s*([\d,]+\.\d+)\s*kB/g;
const gzipByFile = new Map();
for (const m of output.matchAll(LINE_RE)) {
  const [, file, gzipKBStr] = m;
  gzipByFile.set(file, Number(gzipKBStr.replace(/,/g, '')));
}
if (gzipByFile.size === 0) {
  console.error('\n✗ Could not find any "dist/assets/<file> ... gzip: NNN.NN kB" lines in vite build output — the reporter format may have changed. Update LINE_RE in scripts/check-bundle-budget.mjs.');
  process.exit(1);
}

let html;
try {
  html = readFileSync(INDEX_HTML, 'utf8');
} catch (e) {
  console.error(`\n✗ Could not read ${INDEX_HTML} — did the build produce it? (${e.message})`);
  process.exit(1);
}

function basename(url) {
  return url.split('/').pop();
}

// Entry: the <script type="module" ... src="..."> tag (attribute order varies — crossorigin can
// come before or after src — so match the whole tag, then pull src out of it).
const scriptTagMatch = html.match(/<script\b[^>]*\btype="module"[^>]*>/);
if (!scriptTagMatch) {
  console.error('\n✗ Could not find a <script type="module"> entry tag in dist/index.html — the HTML shape may have changed. Update the parser in scripts/check-bundle-budget.mjs.');
  process.exit(1);
}
const entrySrcMatch = scriptTagMatch[0].match(/\bsrc="([^"]+)"/);
if (!entrySrcMatch) {
  console.error('\n✗ Entry <script type="module"> tag has no src attribute — cannot determine the entry chunk. dist/index.html:\n' + scriptTagMatch[0]);
  process.exit(1);
}
const entryFile = basename(entrySrcMatch[1]);

// Eagerly-fetched preload chunks: <link rel="modulepreload" href="...">. Explicitly rel=
// "modulepreload" only — rel="prefetch" is idle-time/low-priority, not eager, and must NOT be
// counted here even if a future build adds prefetch links alongside modulepreload ones.
const modulepreloadFiles = [];
for (const linkMatch of html.matchAll(/<link\b[^>]*>/g)) {
  const tag = linkMatch[0];
  if (!/\brel="modulepreload"/.test(tag)) continue;
  const hrefMatch = tag.match(/\bhref="([^"]+)"/);
  if (hrefMatch) modulepreloadFiles.push(basename(hrefMatch[1]));
}

const eagerFiles = [entryFile, ...modulepreloadFiles];
let eagerKB = 0;
const missing = [];
for (const file of eagerFiles) {
  const kb = gzipByFile.get(file);
  if (kb === undefined) { missing.push(file); continue; }
  eagerKB += kb;
}
if (missing.length) {
  console.error(`\n✗ dist/index.html references eager chunk(s) with no matching gzip size in vite's build output: ${missing.join(', ')}`);
  console.error('  Either the reporter format changed or a chunk name mismatch — do not silently skip it.');
  process.exit(1);
}

const entryKB = gzipByFile.get(entryFile);

console.log(`\nEager-payload budget check (entry + ${modulepreloadFiles.length} modulepreload chunk${modulepreloadFiles.length === 1 ? '' : 's'}):`);
console.log(`  entry only: ${entryFile}  gzip: ${entryKB.toFixed(2)} KB  (reference only, not gated)`);
console.log(`  eager total: ${eagerKB.toFixed(2)} KB  (budget ${BUDGET_KB} KB, headroom ${(BUDGET_KB - eagerKB).toFixed(2)} KB)`);

if (eagerKB > BUDGET_KB) {
  console.error(`\n✗ Eager payload gzip (${eagerKB.toFixed(2)} KB = entry + all modulepreload chunks) exceeds the ${BUDGET_KB} KB budget.`);
  console.error('  See CLAUDE.md\'s "Speed check on every change" standing rule. Trim the change,');
  console.error('  move a static import behind lazyPanel(), or raise the budget deliberately —');
  console.error('  do not ship over it silently.');
  process.exit(1);
}
console.log('✓ Within budget.');
