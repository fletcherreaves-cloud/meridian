#!/usr/bin/env node
// ── Generate the loader→field map the chain test validates against ───────────
// src/__tests__/metric-chains.test.js asserts that every METRIC_SOURCES chain names a
// field its loader actually emits. That guard has caught a genuine error on EVERY round
// of the 2026-08-08 data-contract work — laborRows.floorMgmtNeeded, laborRows.actHrs,
// ctrlRows.empMealAmt and the Glimpse meal counts would all have shipped as silent zeros.
//
// But its field list was hand-maintained and went stale FOUR times in that one day,
// because the loaders keep gaining fields. A guard that needs manual upkeep to stay
// correct eventually gets loosened instead of fixed. This derives it from the source.
//
// Usage:  node scripts/gen-loader-emits.mjs [--write]
//         --write updates the EMITS block in the test file in place.
import { readFileSync, writeFileSync } from 'node:fs';

const SUPA = 'src/lib/supabase.js';
const TEST = 'src/__tests__/metric-chains.test.js';

// ds key → the loader function that populates it
const LOADERS = {
  laborRows: 'loadLaborRows', ctrlRows: 'loadCtrlRows', opsRows: 'loadOpsRows',
  auditRows: 'loadAuditRows', peaksRows: 'loadPeaksRows', glimpseRows: 'loadGlimpse',
  cashRows: 'loadCash', salesLedgerRows: 'loadSalesLedger', schedRows: 'loadLifeLenzSchedule',
  opsCashRows: 'loadOpsCashSheet', opsLaborRows: 'loadOpsLaborSummary',
  opsServiceRows: 'loadOpsServiceStats', qsrActSummaryRows: 'loadQsrActSummary',
};

const src = readFileSync(SUPA, 'utf8');

/** Fields a loader's returned object literal assigns. */
function emits(fn) {
  // Loaders are declared BOTH ways in this file — `export async function loadX()` and
  // `export const loadX = async () =>`. Matching only the first form silently skipped
  // three real loaders and reported them as missing.
  let i = src.indexOf(`export async function ${fn}`);
  if (i < 0) i = src.indexOf(`export const ${fn} = async`);
  if (i < 0) i = src.indexOf(`export const ${fn} =`);
  if (i < 0) return null;
  // stop at the next top-level export so we only read this function
  const next = src.indexOf('\nexport ', i + 10);
  const body = src.slice(i, next < 0 ? src.length : next);
  // Match keys ANYWHERE, not just at line start — these literals pack several per line
  // (`actHrs: v.actual_punched_hours || 0, needHrs: v.total_needed_hours || 0,`), and a
  // line-anchored pattern reported opsLaborRows as emitting NOTHING. Under-reporting is
  // the dangerous direction here: it makes the guard reject valid chains, and a guard
  // that cries wolf gets disabled. A key must follow `{`, `,` or a line start.
  const out = new Set();
  for (const m of body.matchAll(/[{,\n]\s*([a-zA-Z_$][\w$]*)\s*:/g)) out.add(m[1]);
  // drop obvious non-field keys
  // Structural / option keys that are not row fields.
  for (const k of ['data', 'error', 'value', 'enumerable', 'configurable', 'auth', 'headers',
                   'count', 'head', 'ascending', 'onConflict', 'persistSession', 'body',
                   'method', 'signal', 'apikey', 'Authorization', 'Prefer']) out.delete(k);
  return [...out].sort();
}

// ── Fields static analysis CANNOT see ───────────────────────────────────────
// Some loaders build rows with a spread (`{ ...r, otHrs: ... }`) so most fields arrive
// straight from the DB row, or they delegate to a helper (_finalizeQsrAct, _loadOpsTable)
// that adds fields elsewhere. Those are invisible to a regex over the function body.
//
// This supplement keeps the guard from rejecting VALID chains. Each entry is a field a
// chain legitimately uses that the generator cannot prove — verified by hand against the
// loader when added. Keep it small; if it grows, the loader probably wants an explicit
// return literal instead.
const KNOWN_EXTRA = {
  // _finalizeQsrAct + _qsrActFromSummed compose these after the literal we can see
  qsrActSummaryRows: ['oepe', 'kvst', 'kvsHealthy', 'r2p', 'tpph', 'actVsNeed', 'needHrs', 'gc', 'txns'],
  // loadLaborRows spreads parsed rows; these come from the labor parser, not the literal
  laborRows: ['gc', 'avgCheck', 'dtPctTotal'],
  // `{ ...r, otHrs }` — everything else is the raw qsr_labor_summary row
  opsLaborRows: ['needed', 'actual', 'laborPct'],
};

const map = {};
const missing = [];
for (const [key, fn] of Object.entries(LOADERS)) {
  const f = emits(fn);
  if (!f) { missing.push(`${key} → ${fn}() not found`); continue; }
  map[key] = [...new Set([...f, ...(KNOWN_EXTRA[key] || [])])].sort();
}

const block = 'const EMITS = {\n' +
  Object.entries(map).map(([k, v]) =>
    `  ${k}: [${v.map(x => `'${x}'`).join(', ')}],`).join('\n') +
  '\n};';

if (process.argv.includes('--write')) {
  const t = readFileSync(TEST, 'utf8');
  const start = t.indexOf('const EMITS = {');
  const end = t.indexOf('};', start) + 2;
  if (start < 0) { console.error('EMITS block not found in the test'); process.exit(1); }
  writeFileSync(TEST, t.slice(0, start) + block + t.slice(end));
  console.log(`[gen-emits] wrote ${Object.keys(map).length} loaders into ${TEST}`);
} else {
  console.log(block);
}
if (missing.length) { console.error('\n[gen-emits] could not resolve:'); missing.forEach(m => console.error('  ' + m)); }
