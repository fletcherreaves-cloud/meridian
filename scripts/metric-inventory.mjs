#!/usr/bin/env node
// @ts-nocheck
// Notes 57 — Phase 0: metric & data-lineage inventory generator.
//
// READ-ONLY. Touches no database, calls no network, changes no source. It statically
// inventories what Meridian pulls, stores, and uses, and cross-references those into the
// gap list that Phases 1-5 work from.
//
// Why a generator rather than a written audit: a hand-built catalogue of 72 tables is
// stale the week after it ships. This can be re-run any time, and drift between runs IS
// the signal. See memory/notes-57-metric-registry-plan.md.
//
//   node scripts/metric-inventory.mjs                 → summary to stdout
//   node scripts/metric-inventory.mjs --md out.md     → full markdown report
//   node scripts/metric-inventory.mjs --json out.json → machine-readable
//
// The two registries are imported directly rather than parsed, so this reports what the
// app actually runs on, not what a regex thinks it says.

import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const arg = (f) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : null; };

// ── file walking ─────────────────────────────────────────────────────────────
function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === 'dist' || e.startsWith('.')) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e.endsWith('.js') || e.endsWith('.mjs')) out.push(p);
  }
  return out;
}
function walkTs(dir, out = []) {
  let entries; try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e === 'node_modules' || e.startsWith('.')) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walkTs(p, out);
    else if (e.endsWith('.ts') || e.endsWith('.js') || e.endsWith('.mjs') || e.endsWith('.sql')) out.push(p);
  }
  return out;
}
const SRC_FILES = walk(join(ROOT, 'src'));
// Writers live in three places, not one. Missing the edge functions made an earlier run
// report live tables (cash_sheet_daily, sales_ledger_daily) as unused — a wrong audit is
// worse than no audit, which is the whole argument for generating this rather than
// hand-writing it.
const SCRIPT_FILES = [...walk(join(ROOT, 'scripts')), ...walkTs(join(ROOT, 'supabase'))];
const readAll = (files) => files.map((f) => ({ f, s: readFileSync(f, 'utf8') }));
const SRC = readAll(SRC_FILES);
const SCRIPTS = readAll(SCRIPT_FILES);
const APP_CODE = SRC.filter((x) => !x.f.includes('__tests__'));

// ── 1. Supabase tables + columns ─────────────────────────────────────────────
// ⚠️ SOURCE-OF-TRUTH LIMITATION, found the hard way 2026-08-07.
// This reads CREATE TABLE out of supabase/*.sql — so it only knows tables whose DDL
// was committed there. The live database exposed 78 tables; this saw 67. The eleven
// it missed included qsr_daily_activity (the LARGEST table, 367k rows, DDL lives in
// memory/project-qsrsoft-daily-activity.md) and four ops-pull tables.
//
// That gap caused a real security miss: a per-loc RLS rollout built from this list
// left SIX loc-keyed tables unprotected, and it was only caught because a policy
// count came back 52 instead of the expected 51.
//
// For anything SECURITY- or COVERAGE-related, enumerate from the live API instead:
//   curl "$VITE_SUPABASE_URL/rest/v1/" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"
// and read `definitions` — that is authoritative. This function is fine for
// schema-file archaeology and nothing else.
function sqlTables() {
  const dir = join(ROOT, 'supabase');
  const tables = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql'))) {
    const sql = readFileSync(join(dir, f), 'utf8');
    const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z0-9_]+)\s*\(([\s\S]*?)\n\s*\);/gi;
    let m;
    while ((m = re.exec(sql))) {
      const name = m[1];
      const cols = m[2].split('\n').map((l) => l.trim())
        .filter((l) => l && !/^(primary|unique|constraint|foreign|check|--)/i.test(l))
        .map((l) => (l.match(/^"?([a-z0-9_]+)"?\s/i) || [])[1]).filter(Boolean);
      // Later definitions win, but keep the richer column list.
      if (!tables[name] || cols.length > tables[name].columns.length) {
        tables[name] = { table: name, file: f, columns: [...new Set(cols)] };
      }
    }
  }
  return tables;
}

// ── 2. Loaders → tables ──────────────────────────────────────────────────────
function loaders() {
  const s = readFileSync(join(ROOT, 'src/lib/supabase.js'), 'utf8');
  const out = [];
  const re = /export\s+async\s+function\s+(load[A-Za-z0-9_]*)\s*\(([^)]*)\)\s*\{/g;
  let m;
  while ((m = re.exec(s))) {
    const name = m[1], params = m[2].trim();
    // Body = up to the next top-level export.
    const rest = s.slice(m.index);
    const end = rest.indexOf('\nexport ', 1);
    const body = end > -1 ? rest.slice(0, end) : rest;
    // Two call shapes: direct .from('x'), and the _pagedParallel({table:'x'}) helper that
    // every paginated loader uses. Matching only .from() made the paginated loaders look
    // table-less, which wrongly reported live emailed-report tables as unused.
    const tables = [...new Set([
      ...[...body.matchAll(/\.from\(\s*['"]([a-z0-9_]+)['"]/g)].map((x) => x[1]),
      ...[...body.matchAll(/\btable:\s*['"]([a-z0-9_]+)['"]/g)].map((x) => x[1]),
    ])];
    const win = (params.match(/days?\s*=\s*(\d+)/) || [])[1] || null;
    out.push({ name, params, tables, defaultWindowDays: win ? +win : null, paginated: /range\(/.test(body) });
  }
  return out;
}

// ── 3. ds.* fields and how often they're referenced ──────────────────────────
// Reference count is a *usage proxy*, not proof: dynamic access (ds[key]) is invisible
// here, so a low count is a candidate to investigate, never a verdict.
function dsFields() {
  const counts = {};
  for (const { f, s } of APP_CODE) {
    for (const mm of s.matchAll(/\bds\?\?\.|\bds\.([a-zA-Z][a-zA-Z0-9_]*)/g)) {
      const k = mm[1]; if (!k) continue;
      counts[k] = counts[k] || { field: k, refs: 0, files: new Set() };
      counts[k].refs++; counts[k].files.add(relative(ROOT, f));
    }
  }
  return Object.values(counts)
    .map((x) => ({ ...x, files: [...x.files] }))
    .sort((a, b) => a.refs - b.refs);
}

// ── 4. Merge the two registries ──────────────────────────────────────────────
async function metrics() {
  const sig = await import(join(ROOT, 'src/engine/signal-registry.js'));
  const ms = await import(join(ROOT, 'src/engine/metric-source.js'));
  const FLAT = sig.METRIC_FLAT || {};
  const SOURCES = ms.METRIC_SOURCES || {};

  const catOf = {};
  for (const c of sig.METRIC_CATEGORIES || []) {
    for (const m of c.metrics || c.items || []) catOf[m.key] = c.label || c.group || null;
  }

  const keys = [...new Set([...Object.keys(FLAT), ...Object.keys(SOURCES)])].sort();
  return keys.map((key) => {
    const d = FLAT[key] || null;
    const src = SOURCES[key] || null;
    return {
      key,
      label: d?.label ?? null,
      category: catOf[key] ?? null,
      unit: d?.unit ?? null,
      better: d?.better ?? null,
      granularity: d?.granularity ?? null,
      describedInSignalRegistry: !!d,
      // Where signal-registry thinks it lives (single source) vs metric-source's
      // ordered auto-first fallback chain.
      declaredSource: d ? { source: d.source, field: d.field, altField: d.altField ?? null } : null,
      resolutionChain: src ? (src.srcs || []).map(([t, f]) => `${t}.${f}`) : null,
      resolutionMode: src?.mode ?? null,
      hasResolutionChain: !!src,
      sourceCount: src ? (src.srcs || []).length : (d ? 1 : 0),
      isRatio: !!(d && (d.unit === 'pct' || /%|per |rate/i.test(d.label || ''))),
      // Some metrics are single-source BY DESIGN and must not be counted as gaps:
      //   gl* / cs* / sl* / qa*  — deliberately source-pinned views of one report, so
      //                            Scanner can correlate "what Glimpse says" against
      //                            "what Cash Sheet says". Giving them a fallback chain
      //                            would defeat their purpose.
      //   wx* / cal*             — weather and synthetic calendar flags; one origin only.
      //   osat* / vp* / *B2B     — SMG VOICE; only SMG produces them.
      // Counting these as missing chains inflated the gap from 43 to 84.
      sourcePinned: /^(gl|cs|sl|qa|wx|cal|vp|osat|pL)[A-Z0-9]/.test(key)
                    || /B2B$|Problem$/.test(key),
    };
  });
}

// ── 5. Cross-reference into the gap list ─────────────────────────────────────
function gaps({ tables, loads, ds, mets }) {
  // Table references come in at least three call shapes in this codebase:
  //   .from('x')            direct
  //   _pagedParallel({table:'x'})   paginated loaders
  //   _loadOpsTable('x', d)         positional helper
  // Chasing call shapes produced three rounds of false positives (cash_sheet_daily,
  // reviews, qsr_cash_sheet all wrongly reported unused). Since the table names are
  // already known from the schema, just ask whether each name appears as a quoted
  // literal. Shape-agnostic, and over-reporting a table as USED is the safe direction —
  // this list is used to propose deletions.
  const litRefs = (corpus, name) => {
    const re = new RegExp(`['"\`]${name}['"\`]`);
    return corpus.some(({ s: body }) => re.test(body));
  };
  const known = Object.keys(tables);
  const appTables = new Set(known.filter((t) => litRefs(APP_CODE, t)));
  const loadedTables = new Set([...loads.flatMap((l) => l.tables), ...appTables]);
  const scriptTables = new Set(known.filter((t) => litRefs(SCRIPTS, t)));

  const dsByName = Object.fromEntries(ds.map((d) => [d.field, d]));
  const loaderCallCounts = Object.fromEntries(loads.map((l) => {
    const n = APP_CODE.reduce((a, { s }) => a + (s.match(new RegExp(`\\b${l.name}\\s*\\(`, 'g')) || []).length, 0);
    return [l.name, n];
  }));

  return {
    // Metrics described but with no auto-first resolution chain — Phase 1's core gap.
    metricsWithoutResolutionChain: mets.filter((m) => m.describedInSignalRegistry && !m.hasResolutionChain && !m.sourcePinned).map((m) => m.key),
    sourcePinnedByDesign: mets.filter((m) => m.sourcePinned).map((m) => m.key),
    // Resolution chains for metrics nobody described — the reverse drift.
    chainsWithoutDescription: mets.filter((m) => m.hasResolutionChain && !m.describedInSignalRegistry).map((m) => m.key),
    // 2+ sources = both a redundancy candidate AND a free reconciliation oracle.
    multiSourceMetrics: mets.filter((m) => m.sourceCount > 1).map((m) => ({ key: m.key, sources: m.resolutionChain })),
    // Ratio metrics whose components aren't recorded → period rollups impossible.
    // (Registry has no numerator/denominator field yet — that's exactly Phase 2's job.)
    ratioMetricsNeedingComponents: mets.filter((m) => m.isRatio).map((m) => m.key),
    // Tables written by pull scripts but never read by the app.
    tablesWrittenNeverRead: [...scriptTables].filter((t) => tables[t] && !loadedTables.has(t)).sort(),
    // Tables defined in schema with no loader and no script writer.
    tablesDefinedUnused: Object.keys(tables).filter((t) => !loadedTables.has(t) && !scriptTables.has(t)).sort(),
    // Loaders that exist but nothing calls (dead fetch paths).
    loadersNeverCalled: Object.entries(loaderCallCounts).filter(([, n]) => n <= 1).map(([n]) => n).sort(),
    // ds fields barely referenced — investigate, don't assume unused.
    dsFieldsRarelyUsed: ds.filter((d) => d.refs <= 2 && /Rows$|Idx$|ByLoc$/.test(d.field)).map((d) => ({ field: d.field, refs: d.refs, files: d.files })),
    // Wide windows fetched on every login — startup cost.
    widestStartupWindows: loads.filter((l) => l.defaultWindowDays).sort((a, b) => b.defaultWindowDays - a.defaultWindowDays).slice(0, 8)
      .map((l) => ({ loader: l.name, days: l.defaultWindowDays, tables: l.tables })),
  };
}

// ── report ───────────────────────────────────────────────────────────────────
function markdown(inv) {
  const { tables, loads, ds, mets, g } = inv;
  const L = [];
  L.push('# Meridian metric & data inventory', '');
  L.push(`Generated by \`scripts/metric-inventory.mjs\` — read-only static inventory. Re-run any time; drift between runs is the signal.`, '');
  L.push('## Surface area', '');
  L.push('| | count |', '|---|---|');
  L.push(`| Supabase tables defined | ${Object.keys(tables).length} |`);
  L.push(`| \`load*\` functions | ${loads.length} |`);
  L.push(`| distinct \`ds.*\` fields | ${ds.length} |`);
  L.push(`| metrics described (signal-registry) | ${mets.filter((m) => m.describedInSignalRegistry).length} |`);
  L.push(`| metrics with a resolution chain (metric-source) | ${mets.filter((m) => m.hasResolutionChain).length} |`);
  L.push(`| metrics total (union) | ${mets.length} |`, '');

  L.push('## The Phase 1 gap', '');
  L.push(`**${g.metricsWithoutResolutionChain.length} metrics are described but have no auto-first resolution chain**, and are not single-source by design. They resolve from one hard-coded source, so they get no freshest-wins behaviour and no fallback — this is the population the recurring "blank tile / manual-only" bugs come from.`, '');
  L.push('```', g.metricsWithoutResolutionChain.join(', ') || '(none)', '```', '');
  if (g.chainsWithoutDescription.length) {
    L.push(`**${g.chainsWithoutDescription.length} resolution chains have no description** in signal-registry (reverse drift):`, '');
    L.push('```', g.chainsWithoutDescription.join(', '), '```', '');
  }

  L.push('## Multi-source metrics — redundancy *and* reconciliation', '');
  L.push('Each of these resolves from more than one source. Today that buys fallback only. Wired as a reconciliation oracle, any disagreement between sources is an automatically-surfaced pipeline bug — see `memory/systemic-issues-and-next-phase.md` §4.2.', '');
  L.push('| metric | sources |', '|---|---|');
  for (const m of g.multiSourceMetrics) L.push(`| \`${m.key}\` | ${m.sources.map((s) => `\`${s}\``).join(' → ')} |`);
  L.push('');

  L.push('## Startup cost — widest windows fetched on every login', '');
  L.push('| loader | days | tables |', '|---|---|---|');
  for (const w of g.widestStartupWindows) L.push(`| \`${w.loader}\` | ${w.days} | ${w.tables.join(', ')} |`);
  L.push('');

  const sect = (title, arr, fmt = (x) => `\`${x}\``) => {
    L.push(`## ${title} — ${arr.length}`, '');
    L.push(arr.length ? arr.map(fmt).join(', ') : '_(none)_', '');
  };
  L.push(`### Excluded as single-source by design — ${g.sourcePinnedByDesign.length}`, '');
  L.push('`gl*`/`cs*`/`sl*`/`qa*` are deliberately source-pinned views of one report (so Scanner can correlate what Glimpse says against what Cash Sheet says — a fallback chain would defeat that). `wx*`/`cal*` are weather and synthetic calendar flags. `osat*`/`vp*`/`*B2B` come only from SMG.', '');
  L.push('```', g.sourcePinnedByDesign.join(', ') || '(none)', '```', '');
  sect('Tables written by pull scripts but never read by the app', g.tablesWrittenNeverRead);
  sect('Tables defined in schema with no reader and no writer', g.tablesDefinedUnused);
  sect('Loaders defined but never called', g.loadersNeverCalled);
  L.push(`## \`ds.*\` row-fields with ≤2 references — ${g.dsFieldsRarelyUsed.length}`, '');
  L.push('⚠️ Reference count is a **proxy**. Dynamic access (`ds[key]`) is invisible to a static scan, so treat these as candidates to investigate, never as proof of disuse.', '');
  if (g.dsFieldsRarelyUsed.length) {
    L.push('| field | refs | files |', '|---|---|---|');
    for (const d of g.dsFieldsRarelyUsed) L.push(`| \`${d.field}\` | ${d.refs} | ${d.files.join(', ')} |`);
    L.push('');
  }

  L.push('## Full metric table', '');
  L.push('| key | label | category | unit | sources | chain |', '|---|---|---|---|---|---|');
  for (const m of mets) {
    L.push(`| \`${m.key}\` | ${m.label ?? '—'} | ${m.category ?? '—'} | ${m.unit ?? '—'} | ${m.sourceCount} | ${m.resolutionChain ? m.resolutionChain.join(' → ') : (m.declaredSource ? `${m.declaredSource.source}.${m.declaredSource.field}` : '—')} |`);
  }
  L.push('');
  return L.join('\n');
}

// ── main ─────────────────────────────────────────────────────────────────────
const tables = sqlTables();
const loads = loaders();
const ds = dsFields();
const mets = await metrics();
const g = gaps({ tables, loads, ds, mets });
const inv = { generatedFrom: 'scripts/metric-inventory.mjs', tables, loads, ds, mets, g };

const mdPath = arg('--md'), jsonPath = arg('--json');
if (mdPath) { writeFileSync(mdPath, markdown(inv)); console.log(`wrote ${mdPath}`); }
if (jsonPath) { writeFileSync(jsonPath, JSON.stringify(inv, null, 2)); console.log(`wrote ${jsonPath}`); }

console.log(`
Meridian inventory
  tables defined ................ ${Object.keys(tables).length}
  loaders ....................... ${loads.length}
  ds.* fields ................... ${ds.length}
  metrics described ............. ${mets.filter((m) => m.describedInSignalRegistry).length}
  metrics with resolution chain . ${mets.filter((m) => m.hasResolutionChain).length}
  ─ gaps ─
  no resolution chain (real) .... ${g.metricsWithoutResolutionChain.length}
  single-source by design ....... ${g.sourcePinnedByDesign.length}
  chain but no description ...... ${g.chainsWithoutDescription.length}
  multi-source (reconcilable) ... ${g.multiSourceMetrics.length}
  tables written never read ..... ${g.tablesWrittenNeverRead.length}
  tables defined, unused ........ ${g.tablesDefinedUnused.length}
  loaders never called .......... ${g.loadersNeverCalled.length}
  ds row-fields <=2 refs ........ ${g.dsFieldsRarelyUsed.length}
`);
