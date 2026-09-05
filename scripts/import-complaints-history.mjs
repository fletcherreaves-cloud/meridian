#!/usr/bin/env node
// scripts/import-complaints-history.mjs
// Bulk backfill for customer_complaints, reading a seed produced by
// scripts/browser-complaints-bulk-capture.js. Dispatch #231
// (memory/dispatch-231-complaints-metric.md).
//
// 🔒 ONE-TIME/REPEATABLE BACKFILL, not a stream -- propel.mcd.com is SSO+MFA, no automated pull
// is possible (same status as every other Propel-sourced table in this repo). Do NOT add this to
// sync-failure-watch.yml.
//
// 🔒 NEVER COMMIT A SEED FILE POPULATED WITH REAL CAPTURED COMPLAINTS -- same rule as
// memory/data/ecosure-visits-seed.json / peak-visit-detail-seed.json. Real customer-submitted
// free text is in the raw payload. Point COMPLAINTS_SEED_PATH at a local, gitignored/uncommitted
// file for a real capture; the committed default path must stay an empty shell.
//
// Idempotent: upserts on customer_complaints' own child_case_id primary key (the API's own
// globally-unique per-case id, including each flattened childCases[] entry -- see
// src/parsers/complaints.js), so re-running never duplicates rows.
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional env: COMPLAINTS_SEED_PATH (default: memory/data/complaints-seed.json)

import { safeCreateClient } from './lib/safe-supabase-client.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseComplaintEntry } from '../src/parsers/complaints.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_PATH = process.env.COMPLAINTS_SEED_PATH
  ? path.resolve(process.env.COMPLAINTS_SEED_PATH)
  : path.join(__dirname, '../memory/data/complaints-seed.json');

export const padLoc = loc => String(loc).padStart(5, '0');

// One upsert-ready row from a parsed case (src/parsers/complaints.js's output shape).
// incident_date falls back to received_date when the API omits incidentDate -- measured on the
// first real capture (2026-09-05, 3033 raw entries): some cases (a mix of OPEN and CLOSED) come
// back with no incidentDate at all, which the NOT NULL constraint on customer_complaints rejects
// outright. received_date is the date the case was logged, which every real case has, and is the
// closest available proxy for "which month does this belong to" when the true incident date is
// unknown -- better than dropping the row (loses a real complaint) or relaxing the column to
// nullable (defeats the whole point of the column: review-engine.js buckets by it).
export function buildRow(row) {
  return {
    child_case_id: row.childCaseId,
    parent_case_id: row.parentCaseId,
    loc: padLoc(row.store),
    issue_code: row.issueCode,
    issue_sub_code: row.issueSubCode,
    incident_date: row.incidentDate || row.receivedDate || null,
    received_date: row.receivedDate,
    case_status: row.caseStatus,
    abbreviated_customer_comments: row.abbreviatedCustomerComments,
    customer_comments: row.customerComments,
    updated_at: new Date().toISOString(),
  };
}

// The same real-world case can appear twice in one raw capture: once as the top-level case entry,
// once again inside its own childCases[] (dispatch #231's parser test documents this as real API
// behavior, not a parser bug -- see dispatch-231-complaints-parser.test.js's "Multiple Issues"
// case). Both copies share the same real child_case_id, so a single upsert statement can't touch
// both -- measured 2026-09-05 on the real capture: "ON CONFLICT DO UPDATE command cannot affect
// row a second time" once the incident_date fix got past the first error. It's one case described
// twice, not two complaints, so collapsing to one row is correct, not lossy -- keeps the LAST
// occurrence, since parseComplaintEntry() always pushes the top-level entry first and its
// childCases[] entries after, and the childCases[] version carries the more specific per-issue
// issueCode/issueSubCode rather than the generic parent-case wrapper's.
export function dedupeByChildCaseId(rows) {
  const map = new Map();
  for (const row of rows) map.set(row.child_case_id, row);
  return [...map.values()];
}

async function main() {
  const supabase = (process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
    ? safeCreateClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;
  if (!supabase) { console.error('[import-complaints-history] Missing VITE_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

  let seed;
  try {
    seed = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
  } catch (e) {
    console.error(`[import-complaints-history] failed to read/parse seed at ${SEED_PATH}: ${e.message}`);
    process.exit(1);
  }

  const entries = Array.isArray(seed.cases) ? seed.cases : [];
  console.log(`[import-complaints-history] seed: ${entries.length} raw case entrie(s) from ${SEED_PATH}`);
  if (!entries.length) {
    console.log('[import-complaints-history] seed is empty -- nothing to import.');
    return;
  }

  const parsed = [];
  const skipped = [];
  for (const e of entries) {
    const rows = parseComplaintEntry(e);
    if (!rows.length) { skipped.push(`store=${e?.store} childCaseId=${e?.case?.childCaseId}`); continue; }
    parsed.push(...rows);
  }
  if (skipped.length) {
    console.warn(`[import-complaints-history] ${skipped.length} entrie(s) skipped (missing store or childCaseId):`);
    for (const s of skipped) console.warn(`  ${s}`);
  }
  if (!parsed.length) { console.log('[import-complaints-history] nothing parseable -- exiting.'); return; }

  // Dispatch #231's open data question -- resolve it from real capture data, not in advance.
  const statusesSeen = [...new Set(parsed.map(r => r.caseStatus))];
  console.log(`[import-complaints-history] caseStatus value(s) seen: ${JSON.stringify(statusesSeen)}`);

  const missingIncidentDate = parsed.filter(r => !r.incidentDate).length;
  if (missingIncidentDate) {
    console.warn(`[import-complaints-history] ${missingIncidentDate} case(s) had no incidentDate -- falling back to receivedDate for those (see buildRow's comment).`);
  }

  const allRows = parsed.map(buildRow);

  const deduped = dedupeByChildCaseId(allRows);
  const duplicateCount = allRows.length - deduped.length;
  if (duplicateCount) {
    console.warn(`[import-complaints-history] ${duplicateCount} duplicate child_case_id row(s) collapsed (same case listed twice in the raw capture -- kept the more specific entry).`);
  }

  // Backstop for the case neither date is present (not observed 2026-09-05, but incident_date is
  // NOT NULL and a row missing both would fail the whole chunk otherwise) -- skip and report it
  // rather than losing every row in that chunk to one bad case.
  const rows = deduped.filter(r => r.incident_date);
  const noDateAtAll = deduped.length - rows.length;
  if (noDateAtAll) {
    console.warn(`[import-complaints-history] ${noDateAtAll} case(s) had neither incidentDate nor receivedDate -- skipped (child_case_id: ${deduped.filter(r => !r.incident_date).map(r => r.child_case_id).join(', ')}).`);
  }
  const CHUNK = 500;
  let saved = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from('customer_complaints').upsert(chunk, { onConflict: 'child_case_id' });
    if (error) { console.error(`[import-complaints-history] upsert failed on chunk starting at ${i}: ${error.message}`); process.exit(1); }
    saved += chunk.length;
  }
  console.log(`[import-complaints-history] upserted ${saved} row(s) (${parsed.length} parsed from ${entries.length} raw entries, including flattened childCases, minus ${duplicateCount} duplicate(s) and ${noDateAtAll} dateless skip(s))`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error('[import-complaints-history] fatal:', e); process.exit(1); });
}
