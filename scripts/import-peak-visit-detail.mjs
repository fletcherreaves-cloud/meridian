#!/usr/bin/env node
// scripts/import-peak-visit-detail.mjs
// ENRICHMENT-ONLY import: reads a seed of raw peak.mcd.com RoipSurvey responses and layers their
// full per-question detail (every question, scores, real inspector comments) onto EXISTING
// graded_visits rows, matched by (loc, visit_date, report_type) -- the same key every other
// graded_visits writer in this repo already uses and trusts.
//
// Deliberately does NOT create new rows. PEAK's own VisitId is a different id space than Propel's
// (never confirmed to coincide for the same real-world visit -- see
// memory/finding-peak-visit-detail-api-2026-09-05.md's open questions), so this script only
// touches a row that some OTHER importer (import-graded-visits-bulk.mjs / import-cfv-history.mjs /
// import-ecosure-history.mjs) already created from a source with a proven identity chain. A PEAK
// visit with no matching existing row is skipped and reported, never inserted as a guess.
//
// Applies a TARGETED UPDATE on peak_detail only (never an upsert) -- this can never clobber the
// row's other columns (daypart/weekpart/owner/manager/visit_by/modules/score/...), sidestepping
// the "Supabase upsert is a full-row replace on conflict" trap entirely rather than needing to
// carry every other column forward like the other importers' existing-row-preservation logic does.
//
// 🔒 Same "ONE-TIME/REPEATABLE BACKFILL, not a stream" status as the CFV/EcoSure history scripts --
// peak.mcd.com is SSO+MFA gated like Propel, no automated pull is possible. Do NOT add this to
// sync-failure-watch.yml.
//
// 🔒 NEVER COMMIT A SEED FILE POPULATED WITH REAL CAPTURED VISITS -- same rule as
// memory/data/ecosure-visits-seed.json. RoipSurvey's VisitDetails carries real named individuals
// (auditor, owner-operator, restaurant manager, supervisor) and real per-question comments.
// Point PEAK_VISIT_DETAIL_SEED_PATH at a local, gitignored/uncommitted file for a real capture;
// the committed default path must stay an empty shell.
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional env: PEAK_VISIT_DETAIL_SEED_PATH (default: memory/data/peak-visit-detail-seed.json)

import { safeCreateClient } from './lib/safe-supabase-client.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { tokenizeRows } from '../src/engine/identity-vault.js';
import { parsePeakRoipVisit } from '../src/parsers/graded-visits.js';
import { padLoc } from './import-graded-visits-bulk.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_PATH = process.env.PEAK_VISIT_DETAIL_SEED_PATH
  ? path.resolve(process.env.PEAK_VISIT_DETAIL_SEED_PATH)
  : path.join(__dirname, '../memory/data/peak-visit-detail-seed.json');

// One update-ready peak_detail payload from a parsed visit + its resolved reviewer token.
export function buildPeakDetailPayload(visit, auditorToken) {
  return {
    peakVisitId: visit.peakVisitId,
    auditor: auditorToken ?? null,
    visitComment: visit.visitComment,
    questionCount: visit.questionCount,
    commentedCount: visit.commentedCount,
    questions: visit.questions,
  };
}

async function main() {
  const supabase = (process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
    ? safeCreateClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;
  if (!supabase) { console.error('[import-peak-visit-detail] Missing VITE_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

  let seed;
  try {
    seed = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
  } catch (e) {
    console.error(`[import-peak-visit-detail] failed to read/parse seed at ${SEED_PATH}: ${e.message}`);
    process.exit(1);
  }

  const rawVisits = Array.isArray(seed.visits) ? seed.visits : [];
  console.log(`[import-peak-visit-detail] seed: ${rawVisits.length} raw RoipSurvey response(s) from ${SEED_PATH}`);
  if (!rawVisits.length) {
    console.log('[import-peak-visit-detail] seed is empty -- nothing to import.');
    return;
  }

  const parsed = [];
  const skipped = [];
  for (const raw of rawVisits) {
    const v = parsePeakRoipVisit(raw);
    if (!v) { skipped.push('RoipSurvey Success:false'); continue; }
    if (!v.reportType) { skipped.push(`unmapped VisitTypeId store=${v.store} date=${v.dateISO}`); continue; }
    if (!v.store || !v.dateISO) { skipped.push(`missing store/date peakVisitId=${v.peakVisitId}`); continue; }
    parsed.push(v);
  }
  if (skipped.length) {
    console.warn(`[import-peak-visit-detail] ${skipped.length} entrie(s) skipped at parse time:`);
    for (const s of skipped) console.warn(`  ${s}`);
  }
  if (!parsed.length) { console.log('[import-peak-visit-detail] nothing parseable -- exiting.'); return; }

  const auditorTokenMap = await tokenizeRows(supabase, parsed.map(v => ({ emp: v.auditorName })), 'emp');

  const { enriched, noMatch } = await enrichExistingVisits(supabase, parsed, auditorTokenMap);

  if (noMatch.length) {
    console.warn(`[import-peak-visit-detail] ${noMatch.length} PEAK visit(s) had no matching existing graded_visits row (skipped, not inserted):`);
    for (const s of noMatch) console.warn(`  ${s}`);
  }
  console.log(`[import-peak-visit-detail] enriched ${enriched} of ${parsed.length} parsed visit(s)`);
}

// The actual enrichment loop, extracted so it's testable against a mock Supabase client without
// a real database. Never inserts -- a visit whose (loc, visit_date, report_type) has no existing
// row is reported in `noMatch` and left completely untouched.
export async function enrichExistingVisits(supabase, parsedVisits, auditorTokenMap) {
  let enriched = 0;
  const noMatch = [];
  for (const v of parsedVisits) {
    const loc = padLoc(v.store);
    const { data: existing, error: selErr } = await supabase
      .from('graded_visits')
      .select('id')
      .eq('loc', loc).eq('visit_date', v.dateISO).eq('report_type', v.reportType)
      .maybeSingle();
    if (selErr) { console.warn(`[import-peak-visit-detail] lookup failed loc=${loc} date=${v.dateISO} type=${v.reportType}: ${selErr.message}`); continue; }
    if (!existing) { noMatch.push(`loc=${loc} date=${v.dateISO} type=${v.reportType} peakVisitId=${v.peakVisitId}`); continue; }

    const auditorToken = v.auditorName ? (auditorTokenMap.get(v.auditorName.trim()) ?? null) : null;
    const peak_detail = buildPeakDetailPayload(v, auditorToken);
    const { error: updErr } = await supabase
      .from('graded_visits')
      .update({ peak_detail, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (updErr) { console.warn(`[import-peak-visit-detail] update failed loc=${loc} date=${v.dateISO} type=${v.reportType}: ${updErr.message}`); continue; }
    enriched++;
  }
  return { enriched, noMatch };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error('[import-peak-visit-detail] fatal:', e); process.exit(1); });
}
