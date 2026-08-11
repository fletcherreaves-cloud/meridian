// ── Entry-chunk gzip budget guard (#207) ────────────────────────────────────────────────────
// CLAUDE.md's standing rule ("Speed check on every change") has enforced an 850 KB gzip
// ceiling on the entry chunk by convention since it was set — a human runs `vite build`,
// reads the printed number, and remembers to flag it. That is exactly how headroom quietly
// fell to 8.28 KB by v4.983: nothing failed, nothing blocked, a human just had to notice a
// number in build output across dozens of commits. This makes the same check load-bearing.
//
// Runs vite build itself (via `npm run build`'s replacement of the bare `vite build` call)
// and parses its OWN printed gzip figure for the entry chunk, rather than re-gzipping the
// output file independently — measured (not assumed): a plain `gzip -9` recompression of the
// same file production comes in ~10 KB LOWER than what vite/rolldown's build reporter prints,
// so an independent re-measurement would silently enforce a different, more lenient number
// than every "XXX.XX KB gzip" figure already cited in this repo's commit history. Parsing
// vite's own line keeps this script and every human-read build log in agreement.
//
//   node scripts/check-bundle-budget.mjs [--budget-kb=850]

import { execSync } from 'child_process';

const budgetArg = process.argv.find(a => a.startsWith('--budget-kb='));
const BUDGET_KB = budgetArg ? Number(budgetArg.split('=')[1]) : 850;

let output;
try {
  output = execSync('npx vite build', { encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 });
} catch (e) {
  // vite build itself failed — surface its output and fail the same way `vite build` would.
  process.stdout.write(e.stdout || '');
  process.stderr.write(e.stderr || '');
  process.exit(e.status || 1);
}
process.stdout.write(output);

// The entry chunk is the hashed index-*.js file printed directly under dist/assets (not a
// lazy panel chunk, which vite names after its own view file — labor-tools-*.js, sage-*.js).
const m = output.match(/dist\/assets\/(index-[\w.-]+\.js)\s+([\d,]+\.\d+)\s*kB\s*(?:│|\|)\s*gzip:\s*([\d,]+\.\d+)\s*kB/);
if (!m) {
  console.error('\n✗ Could not find an "index-*.js ... gzip: NNN.NN kB" line in vite build output — the reporter format may have changed. Update the regex in scripts/check-bundle-budget.mjs.');
  process.exit(1);
}
const [, file, rawKBStr, gzipKBStr] = m;
const gzipKB = Number(gzipKBStr.replace(/,/g, ''));

console.log(`\nEntry chunk budget check: ${file}`);
console.log(`  gzip: ${gzipKB.toFixed(2)} KB  (budget ${BUDGET_KB} KB, headroom ${(BUDGET_KB - gzipKB).toFixed(2)} KB)`);

if (gzipKB > BUDGET_KB) {
  console.error(`\n✗ Entry chunk gzip (${gzipKB.toFixed(2)} KB) exceeds the ${BUDGET_KB} KB budget.`);
  console.error('  See CLAUDE.md\'s "Speed check on every change" standing rule. Trim the change,');
  console.error('  move a static import behind lazyPanel(), or raise the budget deliberately —');
  console.error('  do not ship over it silently.');
  process.exit(1);
}
console.log('✓ Within budget.');
