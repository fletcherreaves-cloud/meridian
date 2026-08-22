#!/usr/bin/env node
// scripts/import-cfv-history.mjs
// Dispatch #74 — one-time backfill: import memory/data/cfv-history-2023-2026.json (217 CFV
// visits, 2023-01-18 -> 2026-08-18, all 27 stores, captured from Propel's getCfvHistory) into
// Supabase graded_visits. ds.gradedVisits was previously fed only by manually-dropped PDFs;
// this is the first time the full series lands in the app.
//
// 🔒 This is a ONE-TIME BACKFILL, not a stream — Propel is SSO+MFA, no automated pull is
// possible (memory/finding-ecosure-propel-api-2026-08-22.md). Do NOT add this to
// sync-failure-watch.yml.
//
// Idempotent: upserts on the table's own (loc, visit_date, report_type) unique constraint
// (supabase/graded_visits.sql:25), so re-running cannot duplicate rows.
//
// Three traps this script exists to avoid (all measured against live data before writing a
// line of upsert logic — see memory/dispatch-74.md):
//   1. loc padding — graded_visits.loc is "NSN, zero-padded as in report" (5 digits: '03708',
//      not '3708'). getCfvHistory returns bare NSNs. Measured against the live table: without
//      padding, every 4-digit loc in the seed would silently create a DUPLICATE row alongside
//      its real PDF-sourced counterpart instead of updating it.
//   2. daypart/weekpart — NOT present in getCfvHistory at all. A blind upsert with these left
//      undefined/null would NULL OUT a PDF-sourced row's real values on every key collision
//      (Supabase upsert does a full-row replace on conflict, not a column-level coalesce).
//      Measured live: 51/67 existing rows carry a real daypart. Fixed by reading the existing
//      row first and carrying its daypart/weekpart/owner/manager/visit_by forward untouched —
//      the same class of risk applies to those three PDF-only fields, even though the dispatch
//      only named daypart/weekpart explicitly.
//   3. channel vocabulary — getCfvHistory returns camelCase ('driveThru'/'curbside'/
//      'inRestaurant'); the PDF parser (src/parsers/graded-visits.js channelOf()) emits
//      whatever the report prints verbatim. Measured the live table's actual values rather
//      than guessing a mapping: 'Drive Thru' / 'Curbside' / 'In Restaurant' (NOT 'Front
//      Counter', which the parser's own comment mentions as a possible value elsewhere but
//      which never actually appears in this dataset).
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_PATH = path.join(__dirname, '../memory/data/cfv-history-2023-2026.json');

// loc must match graded_visits' own zero-padded convention — measured live (all 27 existing
// locs are exactly 5 digits), not assumed.
export const padLoc = loc => String(loc).padStart(5, '0');

// getCfvHistory's camelCase channel values -> the PDF parser's own vocabulary, measured
// against the live table (not the parser's source comment, which lists a value — 'Front
// Counter' — that isn't actually used for this store set). An unrecognized value passes
// through unchanged rather than being silently dropped, and is logged so it doesn't hide.
const CHANNEL_MAP = { driveThru: 'Drive Thru', curbside: 'Curbside', inRestaurant: 'In Restaurant' };
export function mapChannel(raw) {
  if (raw == null) return null;
  if (CHANNEL_MAP[raw]) return CHANNEL_MAP[raw];
  console.warn(`[import-cfv-history] unrecognized channel value ${JSON.stringify(raw)} — passing through unmapped`);
  return raw;
}

// Dispatch #74 — pass is NOT a field Propel's getCfvHistory returns; it is a DERIVATION, not
// source data. Propel's own Customer First card reports "% Meeting 80%", so 80 is the
// programme's own bar and score >= 80 is the defensible reading (matches the PDF parser's own
// parseCFV() rule verbatim: `pass: score != null ? score >= passThreshold : null`). Recorded
// here explicitly rather than left implicit, per the dispatch's own warning: if this reading
// is ever wrong, the whole pass-rate column is wrong.
export const CFV_PASS_THRESHOLD = 80;

// Builds one upsert-ready row from a seed visit + whatever existing row (if any) already
// occupies its (loc, visit_date, report_type) key. `existing` carries daypart/weekpart/owner/
// manager/visit_by from a PRIOR read of the live table -- undefined/missing fields on it are
// treated as "no existing row", same as a first-time insert.
export function buildRow(seedVisit, existing) {
  const loc = padLoc(seedVisit.loc);
  return {
    report_type: seedVisit.reportType,
    loc,
    visit_date: seedVisit.visitDate,
    // Never invented, never overwritten with null over a real value -- see trap #2 above.
    daypart: existing?.daypart ?? null,
    weekpart: existing?.weekpart ?? null,
    owner: existing?.owner ?? null,
    manager: existing?.manager ?? null,
    visit_by: existing?.visit_by ?? null,
    score: seedVisit.overallPct,
    pass: seedVisit.overallPct >= CFV_PASS_THRESHOLD,
    channel: mapChannel(seedVisit.channel),
    updated_at: new Date().toISOString(),
  };
}

async function fetchExistingCfvByKey(supabase) {
  const byKey = new Map();
  const PAGE = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('graded_visits')
      .select('loc,visit_date,report_type,daypart,weekpart,owner,manager,visit_by')
      .eq('report_type', 'CFV')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`[import-cfv-history] failed to read existing rows: ${error.message}`);
    if (!data?.length) break;
    for (const r of data) byKey.set(`${r.loc}|${r.visit_date}|${r.report_type}`, r);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return byKey;
}

async function main() {
  const supabase = (process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
    ? createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;
  if (!supabase) { console.error('[import-cfv-history] Missing VITE_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

  const seed = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
  console.log(`[import-cfv-history] seed: ${seed.count} visits, ${seed.from} -> ${seed.to} (${seed._source})`);
  if (seed.visits.length !== seed.count) {
    console.error(`[import-cfv-history] seed count mismatch: header says ${seed.count}, array has ${seed.visits.length} — aborting`);
    process.exit(1);
  }

  const existingByKey = await fetchExistingCfvByKey(supabase);
  console.log(`[import-cfv-history] ${existingByKey.size} existing CFV row(s) already in graded_visits`);

  let newCount = 0, updatedCount = 0;
  const rows = seed.visits.map(v => {
    const key = `${padLoc(v.loc)}|${v.visitDate}|${v.reportType}`;
    const existing = existingByKey.get(key);
    if (existing) updatedCount++; else newCount++;
    return buildRow(v, existing);
  });
  console.log(`[import-cfv-history] ${newCount} new row(s), ${updatedCount} existing row(s) will be refreshed (daypart/weekpart/owner/manager/visit_by preserved)`);

  const CHUNK = 100;
  let saved = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from('graded_visits').upsert(chunk, { onConflict: 'loc,visit_date,report_type' });
    if (error) { console.error(`[import-cfv-history] upsert failed at offset ${i}:`, error.message); process.exit(1); }
    saved += chunk.length;
  }
  console.log(`[import-cfv-history] upserted ${saved} row(s)`);

  // Verification bar (dispatch #74): the app's own 2026 CFV figures must read 55.3% / 44.7%.
  const { data: y2026, error: vErr } = await supabase
    .from('graded_visits')
    .select('score')
    .eq('report_type', 'CFV')
    .gte('visit_date', '2026-01-01')
    // Bounded to the SEED's own capture window (seed.to), not open-ended through year-end.
    // Measured live (2026-08-22): the table already carries 4 real, newer CFV visits from
    // PDF uploads dated after this seed's 2026-08-18 cutoff -- an open-ended range pulls
    // those in too and shifts the aggregate away from the figure this dispatch validated
    // against Propel's own published card. The point of this check is "did THIS IMPORT land
    // correctly", not "what does the table say today" — those are different questions once
    // more data keeps arriving after the seed was captured.
    .lte('visit_date', seed.to);
  if (vErr) { console.error('[import-cfv-history] verification read failed:', vErr.message); process.exit(1); }
  const n = y2026.length;
  const meeting = y2026.filter(r => r.score >= CFV_PASS_THRESHOLD).length;
  const meetingPct = (meeting / n * 100).toFixed(1);
  const belowPct = ((n - meeting) / n * 100).toFixed(1);
  console.log(`[import-cfv-history] VERIFY 2026 CFV (through ${seed.to}): n=${n}, meeting80=${meetingPct}%, below80=${belowPct}% (expect 55.3% / 44.7%)`);
  if (meetingPct !== '55.3' || belowPct !== '44.7') {
    console.error('[import-cfv-history] VERIFICATION FAILED — does not match the pre-commit validation. Do not trust this import.');
    process.exit(1);
  }
  console.log('[import-cfv-history] verification passed.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error('[import-cfv-history] fatal:', e); process.exit(1); });
}
