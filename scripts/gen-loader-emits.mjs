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
// HOW IT WORKS: it parses each loader for explicit `key:` assignments, AND resolves the
// two things a naive regex misses — both mechanically, with no hand-maintained list:
//
//   1. SPREADS. `return rows.map(r => ({ ...r, otHrs }))` passes the raw DB row through,
//      so the emitted fields are that TABLE'S COLUMNS. The script detects the spread,
//      reads the table name from the loader's own .from('x'), and pulls its columns from
//      Supabase (PostgREST, no Vite needed).
//   2. HELPER DELEGATION. `_finalizeQsrAct` / `_qsrActFromSummed` build the row in a
//      different function in the same file. The script follows same-file helper calls and
//      parses their literals too.
//
// An earlier version needed a hand-maintained KNOWN_EXTRA list for exactly these, which
// reintroduced the very maintenance this script exists to remove.
//
// (Importing the loaders and observing their output would be more direct, but
// src/lib/supabase.js reads import.meta.env — Vite-only, absent under plain Node.)
//
// SUPERSEDED NOTE: it RUNS each loader against the real database and records the keys that
// actually come back. Static parsing of the source cannot see fields added by a spread
// (`{ ...r, otHrs }`) or by a helper (_finalizeQsrAct, _loadOpsTable) — an earlier version
// needed a hand-maintained KNOWN_EXTRA supplement for exactly those, which reintroduced
// the hand-maintenance this script exists to remove. Observing the output has no such
// blind spot.
//
// Static parsing remains as a FALLBACK for any loader that returns no rows (an empty
// table teaches us nothing), so the map degrades rather than losing a loader entirely.
//
// Usage:  node scripts/gen-loader-emits.mjs [--write]
//         --write updates the EMITS block in the test file in place.
//         Requires VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (see .env.local).
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
const parsers = readFileSync('src/parsers/index.js', 'utf8');

// A ds.* stream can be fed by TWO paths: the Supabase loader, and the manual-upload
// parser. They do not emit the same fields — loadLaborRows returns 7 columns while
// parseLaborData produces more, because labor_rows never got columns for the rest (the
// same persistence gap that hid the MBI floor-hours fields). A map built from loaders
// alone therefore rejects chains that legitimately resolve from an upload.
const PARSERS = {
  laborRows: 'parseLaborData',
  opsRows:   'parseOpsData',
  ctrlRows:  'parseCtrlData',
};

function parserEmits(fn) {
  const i = parsers.indexOf(`function ${fn}`);
  if (i < 0) return [];
  const next = parsers.indexOf('\nfunction ', i + 10);
  const body = parsers.slice(i, next < 0 ? Math.min(parsers.length, i + 9000) : next);
  const out = new Set();
  for (const m of body.matchAll(/[{,\n]\s*([a-zA-Z_$][\w$]*)\s*:/g)) out.add(m[1]);
  return [...out];
}

/** Fields a loader's returned object literal assigns. */
// Table columns, for loaders that spread the raw row. One request per table.
const colCache = {};
async function tableCols(table) {
  if (colCache[table] !== undefined) return colCache[table];
  const url = process.env.VITE_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return (colCache[table] = []);
  try {
    const r = await fetch(`${url}/rest/v1/${table}?limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    const d = await r.json();
    return (colCache[table] = Array.isArray(d) && d[0] ? Object.keys(d[0]) : []);
  } catch { return (colCache[table] = []); }
}

function bodyOf(fn) {
  let i = src.indexOf(`export async function ${fn}`);
  if (i < 0) i = src.indexOf(`export const ${fn} = async`);
  if (i < 0) i = src.indexOf(`export const ${fn} =`);
  if (i < 0) i = src.indexOf(`function ${fn}(`);
  if (i < 0) return null;
  const next = src.indexOf('\nexport ', i + 10);
  return src.slice(i, next < 0 ? Math.min(src.length, i + 6000) : next);
}

let fnKey = null;
const pendingSpreads = [];
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
  const collect = (text, depth = 0) => {
    for (const m of text.matchAll(/[{,\n]\s*([a-zA-Z_$][\w$]*)\s*:/g)) out.add(m[1]);
    if (depth > 1) return;
    // Follow same-file helpers that build the row (_finalizeQsrAct, _qsrActFromSummed…)
    for (const m of text.matchAll(/\b(_[a-zA-Z][\w$]*)\s*\(/g)) {
      const hb = bodyOf(m[1]);
      if (hb && hb !== text) collect(hb, depth + 1);
    }
  };
  collect(body);
  // A spread of the row passes the table's raw columns straight through.
  if (/\.\.\.(r|row|v)\b/.test(body)) {
    const t = body.match(/\.from\('([a-z_]+)'\)/) || body.match(/_loadOpsTable\('([a-z_]+)'/);
    if (t) pendingSpreads.push([fnKey, t[1]]);
  }
  // drop obvious non-field keys
  // Structural / option keys that are not row fields.
  for (const k of ['data', 'error', 'value', 'enumerable', 'configurable', 'auth', 'headers',
                   'count', 'head', 'ascending', 'onConflict', 'persistSession', 'body',
                   'method', 'signal', 'apikey', 'Authorization', 'Prefer']) out.delete(k);
  return [...out].sort();
}

const map = {};
const missing = [];
for (const [key, fn] of Object.entries(LOADERS)) {
  fnKey = key;
  const f = emits(fn);
  if (!f) { missing.push(`${key} → ${fn}() not found`); continue; }
  map[key] = [...new Set([...f, ...(PARSERS[key] ? parserEmits(PARSERS[key]) : [])])].sort();
}

// Resolve spread-passthrough loaders from their table's real columns.
for (const [key, table] of pendingSpreads) {
  const cols = await tableCols(table);
  if (cols.length) map[key] = [...new Set([...(map[key] || []), ...cols])].sort();
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
