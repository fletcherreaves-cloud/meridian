#!/usr/bin/env node
// scripts/import-graded-visits-bulk.mjs
// Unified bulk backfill for CFV + RGR (+RGR Health & Safety) + EcoSure, reading ONE consolidated
// seed produced by scripts/browser-graded-visits-bulk-capture.js. Generalizes
// scripts/import-ecosure-history.mjs's own pattern (raw API rows -> the SAME parsers the
// interactive upload path and this repo's other bulk scripts already use -> upsert) across all
// three report types in a single run, so a person doesn't have to run three separate captures and
// three separate imports.
//
// 🔒 Same "ONE-TIME/REPEATABLE BACKFILL, not a stream" status as the CFV/EcoSure history scripts
// this generalizes -- Propel is SSO+MFA, no automated pull is possible. Do NOT add this to
// sync-failure-watch.yml.
//
// 🔒 NEVER COMMIT A SEED FILE POPULATED WITH REAL CAPTURED VISITS -- same rule as
// memory/data/ecosure-visits-seed.json. RGR/CFV summary rows carry no PII (measured: no
// reviewer/manager/owner name field in either getBrandProtectionVisits or getCfvHistory), but
// EcoSure's reviewedWithName does, tokenized below exactly as import-ecosure-history.mjs already
// does. Point GRADED_VISITS_BULK_SEED_PATH at a local, gitignored/uncommitted file for a real
// capture; the committed default path must stay an empty shell.
//
// Idempotent: upserts on graded_visits' own (loc, visit_date, report_type) conflict key, so
// re-running (or re-running import-cfv-history.mjs / import-ecosure-history.mjs afterward) cannot
// duplicate rows -- all three writers share the same key.
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional env: GRADED_VISITS_BULK_SEED_PATH (default: memory/data/graded-visits-bulk-seed.json)

import { safeCreateClient } from './lib/safe-supabase-client.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { tokenizeRows } from '../src/engine/identity-vault.js';
import { parseEcoSureVisit, parseRGRBulkVisit, parseCfvBulkVisit } from '../src/parsers/graded-visits.js';
import { fetchExistingGradedVisitsByKey, chunkedUpsertGradedVisits } from './lib/graded-visits-upsert.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_PATH = process.env.GRADED_VISITS_BULK_SEED_PATH
  ? path.resolve(process.env.GRADED_VISITS_BULK_SEED_PATH)
  : path.join(__dirname, '../memory/data/graded-visits-bulk-seed.json');

export const padLoc = loc => String(loc).padStart(5, '0');

// Builds one upsert-ready row from a parsed visit (any of the three parsers' output shape --
// they're deliberately uniform: reportType/store/dateISO/daypart/weekpart/owner/manager/visitBy/
// score/pass/channel/mobileApp/status/completionTime/modules/title) + whatever existing row (if
// any) already occupies its key + the batch's reviewer-token map (only EcoSure rows carry
// reviewerName; RGR/CFV always resolve to null there, so the ?? chain falls through to
// existing?.visit_by unaffected).
export function buildRow(visit, existing, reviewerTokenMap) {
  const loc = padLoc(visit.store);
  const reviewerToken = visit.reviewerName ? (reviewerTokenMap.get(visit.reviewerName.trim()) ?? null) : null;
  return {
    report_type: visit.reportType,
    loc,
    visit_date: visit.dateISO,
    daypart:  existing?.daypart  ?? null,
    weekpart: existing?.weekpart ?? null,
    owner:    existing?.owner    ?? null,
    manager:  existing?.manager  ?? null,
    visit_by: reviewerToken ?? existing?.visit_by ?? null,
    score: visit.score,
    pass: visit.pass,
    channel: visit.channel ?? null,
    mobile_app: visit.mobileApp ?? null,
    status: visit.status ?? null,
    completion_time: visit.completionTime ?? null,
    modules: visit.modules,
    raw_title: visit.title,
    updated_at: new Date().toISOString(),
  };
}

async function main() {
  const supabase = (process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
    ? safeCreateClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;
  if (!supabase) { console.error('[import-graded-visits-bulk] Missing VITE_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

  let seed;
  try {
    seed = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
  } catch (e) {
    console.error(`[import-graded-visits-bulk] failed to read/parse seed at ${SEED_PATH}: ${e.message}`);
    process.exit(1);
  }

  const cfvEntries = Array.isArray(seed.cfv) ? seed.cfv : [];
  const rgrEntries = Array.isArray(seed.rgr) ? seed.rgr : [];
  const ecosureRaw = Array.isArray(seed.ecosure) ? seed.ecosure : [];
  console.log(`[import-graded-visits-bulk] seed: ${cfvEntries.length} CFV, ${rgrEntries.length} RGR, ${ecosureRaw.length} EcoSure raw entries from ${SEED_PATH}`);
  if (!cfvEntries.length && !rgrEntries.length && !ecosureRaw.length) {
    console.log('[import-graded-visits-bulk] seed is empty -- nothing to import.');
    return;
  }

  const parsed = [];
  const skipped = [];
  for (const e of cfvEntries) {
    const v = parseCfvBulkVisit(e.visit, { store: e.store, name: e.name });
    if (v.store && v.dateISO) parsed.push(v); else skipped.push(`CFV store=${e.store} date=${e.visit?.visitDate}`);
  }
  for (const e of rgrEntries) {
    const v = parseRGRBulkVisit(e.visit, { store: e.store, name: e.name });
    if (v.store && v.dateISO) parsed.push(v); else skipped.push(`RGR store=${e.store} date=${e.visit?.visitDate}`);
  }
  for (const raw of ecosureRaw) {
    const v = parseEcoSureVisit(raw);
    if (v.store && v.dateISO) parsed.push(v); else skipped.push(`EcoSure restaurantNumber=${JSON.stringify(raw?.results?.restaurantNumber ?? raw?.restaurantNumber)}`);
  }
  if (skipped.length) {
    console.warn(`[import-graded-visits-bulk] ${skipped.length} entrie(s) skipped (missing store or unparseable date):`);
    for (const s of skipped) console.warn(`  ${s}`);
  }
  if (!parsed.length) { console.log('[import-graded-visits-bulk] nothing parseable -- exiting.'); return; }

  const reportTypesPresent = [...new Set(parsed.map(v => v.reportType))];
  const existingByKey = await fetchExistingGradedVisitsByKey(supabase, reportTypesPresent);
  console.log(`[import-graded-visits-bulk] ${existingByKey.size} existing row(s) already in graded_visits across ${reportTypesPresent.join(', ')}`);

  // Only EcoSure visits carry reviewerName (measured: RGR/CFV summary rows have no PII field at
  // all) -- tokenizeRows() is a no-op over the rest since it filters on the field name.
  const reviewerTokenMap = await tokenizeRows(supabase, parsed, 'reviewerName');

  let newCount = 0, updatedCount = 0;
  const byTypeCount = {};
  const rows = parsed.map(v => {
    const key = `${padLoc(v.store)}|${v.dateISO}|${v.reportType}`;
    const existing = existingByKey.get(key);
    if (existing) updatedCount++; else newCount++;
    byTypeCount[v.reportType] = (byTypeCount[v.reportType] || 0) + 1;
    return buildRow(v, existing, reviewerTokenMap);
  });
  console.log(`[import-graded-visits-bulk] by report_type: ${JSON.stringify(byTypeCount)}`);
  console.log(`[import-graded-visits-bulk] ${newCount} new row(s), ${updatedCount} existing row(s) will be refreshed`);

  const saved = await chunkedUpsertGradedVisits(supabase, rows);
  console.log(`[import-graded-visits-bulk] upserted ${saved} row(s)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error('[import-graded-visits-bulk] fatal:', e); process.exit(1); });
}
