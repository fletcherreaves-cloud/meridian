#!/usr/bin/env node
// scripts/import-ecosure-history.mjs
// CFV-history-style backfill for EcoSure (3rd-party food safety) visits, mirroring
// scripts/import-cfv-history.mjs's own shape: a repeatable, idempotent import from a COMMITTED
// SEED FILE into Supabase graded_visits. NOT a live pull -- see that script's own header and
// memory/finding-ecosure-propel-api-2026-08-22.md: propel.mcd.com is SSO+MFA, no automated pull
// is possible, so this reads whatever visits have been manually captured and committed so far.
//
// 🔒 Same "ONE-TIME/REPEATABLE BACKFILL, not a stream" status as import-cfv-history.mjs. Do NOT
// add this to sync-failure-watch.yml -- there is no schedule to watch.
//
// Unlike import-cfv-history.mjs (whose seed is a PRE-SLIMMED per-visit array, hand-mapped down to
// a few fields before being committed), this seed holds the RAW getThirdPartyFoodSafetyVisitReport
// envelope for each visit -- unmodified from the API response -- and this script maps each one
// through the SAME parseEcoSureVisit() (src/parsers/graded-visits.js) the interactive upload path
// (Graded Visits panel) already uses and already has 10 tests against. One mapper, two entry
// points (interactive upload, this bulk backfill) -- not a second, drifting transformation.
//
// The seed grows one capture at a time by hand, OR in bulk: memory/finding-ecosure-propel-api-
// 2026-08-22.md's own "still open" item 6 ("EcoSure visitIds cannot currently be enumerated in
// bulk") was RESOLVED 2026-09-04 -- getBrandProtectionVisits&locationId=<store node> returns a
// store's full EcoSure visit history (visitId+date per visit), and scripts/browser-ecosure-bulk-
// capture.js (a DevTools-console snippet, not a Node script) walks every store and downloads a
// seed file in this exact shape. See that finding file's "bulk visitId enumeration FOUND" addendum
// for the full chain. Either way: append raw envelope(s) to a seed's `visits` array and re-run;
// already-imported visits upsert in place (same (loc, visit_date, report_type) conflict key every
// graded_visits writer uses), so re-running after appending is always safe.
//
// 🔒 NEVER COMMIT A SEED FILE POPULATED WITH REAL CAPTURED VISITS. Each raw envelope carries
// reviewedWithName -- a real employee's name in plaintext -- until this script's own tokenization
// step (trap 3 below) runs at import time. memory/data/ecosure-visits-seed.json (the DEFAULT path)
// must stay the empty shell it ships as; point ECOSURE_SEED_PATH at a local, gitignored/
// uncommitted file holding real captures instead. (Confirmed workable 2026-09-04: two real visits
// captured in an owner-provided HAR were imported this way, from a scratch path outside the repo,
// and never touched a committed file.)
//
// Traps this script exists to avoid, all inherited from import-cfv-history.mjs's own hard-won
// list (same table, same class of risk):
//   1. loc padding -- graded_visits.loc is 5-digit zero-padded. restaurantNumber in the raw
//      envelope is documented as already zero-padded ("03708"), but padded defensively anyway
//      rather than trusting that holds for every future capture.
//   2. Existing-row field preservation -- daypart/weekpart/owner/manager are never populated by
//      this source (parseEcoSureVisit() always returns them null) and a blind upsert would null
//      out real PDF-sourced values on a key collision with a CFV/RGR row at a DIFFERENT
//      report_type... except report_type is part of the conflict key, so an EcoSure row can only
//      ever collide with a prior EcoSure row for the same store+date. Still preserved defensively
//      (reading the existing row first) in case this store+date was already imported by an
//      earlier, less-complete capture.
//   3. Reviewer-name PII -- reviewedWithName is tokenized via the same
//      get_or_create_employee_token() RPC / tokenizeRows() helper saveGradedVisits()
//      (src/lib/supabase.js) and saveSecurityEventRows() (qsrsoft-security-events-pull.mjs) both
//      already use. No plaintext name is ever logged or written.
//   4. The `results` wrapper -- the live getThirdPartyFoodSafetyVisitReport response is
//      {"results": {...}}, not the flat object the payload docs describe (found 2026-09-04
//      against a real capture; parseEcoSureVisit() now unwraps it, see that function's own
//      comment). Seed entries should stay RAW/wrapped -- do not unwrap before appending.
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional env: ECOSURE_SEED_PATH (default: memory/data/ecosure-visits-seed.json)

import { safeCreateClient } from './lib/safe-supabase-client.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { tokenizeRows } from '../src/engine/identity-vault.js';
import { parseEcoSureVisit } from '../src/parsers/graded-visits.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_PATH = process.env.ECOSURE_SEED_PATH
  ? path.resolve(process.env.ECOSURE_SEED_PATH)
  : path.join(__dirname, '../memory/data/ecosure-visits-seed.json');

export const padLoc = loc => String(loc).padStart(5, '0');

// Builds one upsert-ready row from a parsed visit (parseEcoSureVisit()'s output) + whatever
// existing row (if any) already occupies its (loc, visit_date, report_type) key, and the
// tokenized reviewer map computed once for the whole batch. `existing` carries
// daypart/weekpart/owner/manager/visit_by from a PRIOR read of the live table.
export function buildRow(visit, existing, reviewerTokenMap) {
  const loc = padLoc(visit.store);
  const reviewerToken = visit.reviewerName ? (reviewerTokenMap.get(visit.reviewerName.trim()) ?? null) : null;
  return {
    report_type: 'EcoSure',
    loc,
    visit_date: visit.dateISO,
    daypart:  existing?.daypart  ?? null,
    weekpart: existing?.weekpart ?? null,
    owner:    existing?.owner    ?? null,
    manager:  existing?.manager  ?? null,
    visit_by: reviewerToken ?? existing?.visit_by ?? null,
    score: visit.score,
    pass: visit.pass,
    channel: null,
    mobile_app: null,
    status: null,
    completion_time: null,
    modules: visit.modules,
    raw_title: visit.title,
    updated_at: new Date().toISOString(),
  };
}

async function fetchExistingEcoSureByKey(supabase) {
  const byKey = new Map();
  const PAGE = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('graded_visits')
      .select('loc,visit_date,report_type,daypart,weekpart,owner,manager,visit_by')
      .eq('report_type', 'EcoSure')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`[import-ecosure-history] failed to read existing rows: ${error.message}`);
    if (!data?.length) break;
    for (const r of data) byKey.set(`${r.loc}|${r.visit_date}|${r.report_type}`, r);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return byKey;
}

async function main() {
  const supabase = (process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
    ? safeCreateClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;
  if (!supabase) { console.error('[import-ecosure-history] Missing VITE_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

  let seed;
  try {
    seed = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
  } catch (e) {
    console.error(`[import-ecosure-history] failed to read/parse seed at ${SEED_PATH}: ${e.message}`);
    process.exit(1);
  }
  const rawVisits = Array.isArray(seed.visits) ? seed.visits : [];
  console.log(`[import-ecosure-history] seed: ${rawVisits.length} raw visit envelope(s) from ${SEED_PATH}`);
  if (!rawVisits.length) {
    console.log('[import-ecosure-history] seed is empty -- nothing to import. Append a captured '
      + 'getThirdPartyFoodSafetyVisitReport response to the seed\'s `visits` array and re-run.');
    return;
  }

  const parsed = [];
  const skipped = [];
  for (const raw of rawVisits) {
    const v = parseEcoSureVisit(raw);
    if (v.store && v.dateISO) parsed.push(v);
    else skipped.push(`restaurantNumber=${JSON.stringify(raw?.restaurantNumber)} visitDate=${JSON.stringify(raw?.visitDate)}`);
  }
  if (skipped.length) {
    console.warn(`[import-ecosure-history] ${skipped.length} envelope(s) skipped (missing store or unparseable date):`);
    for (const s of skipped) console.warn(`  ${s}`);
  }
  if (!parsed.length) { console.log('[import-ecosure-history] nothing parseable -- exiting.'); return; }

  const existingByKey = await fetchExistingEcoSureByKey(supabase);
  console.log(`[import-ecosure-history] ${existingByKey.size} existing EcoSure row(s) already in graded_visits`);

  const reviewerTokenMap = await tokenizeRows(supabase, parsed, 'reviewerName');

  let newCount = 0, updatedCount = 0;
  const rows = parsed.map(v => {
    const key = `${padLoc(v.store)}|${v.dateISO}|EcoSure`;
    const existing = existingByKey.get(key);
    if (existing) updatedCount++; else newCount++;
    return buildRow(v, existing, reviewerTokenMap);
  });
  console.log(`[import-ecosure-history] ${newCount} new row(s), ${updatedCount} existing row(s) will be refreshed`);

  const CHUNK = 100;
  let saved = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from('graded_visits').upsert(chunk, { onConflict: 'loc,visit_date,report_type' });
    if (error) { console.error(`[import-ecosure-history] upsert failed at offset ${i}:`, error.message); process.exit(1); }
    saved += chunk.length;
  }
  console.log(`[import-ecosure-history] upserted ${saved} row(s)`);

  // Idempotency spot-check: a second run over the same seed should report 0 new / N existing.
  const { count, error: cErr } = await supabase.from('graded_visits')
    .select('*', { count: 'exact', head: true }).eq('report_type', 'EcoSure');
  if (cErr) { console.error('[import-ecosure-history] verification count failed:', cErr.message); process.exit(1); }
  console.log(`[import-ecosure-history] graded_visits now holds ${count} total EcoSure row(s).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error('[import-ecosure-history] fatal:', e); process.exit(1); });
}
