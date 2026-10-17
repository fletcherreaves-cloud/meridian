#!/usr/bin/env node
// scripts/qsrsoft-backfill-driver.mjs — meters a multi-year QSRSoft historical backfill.
//
// Owner, live, 2026-10-15: "QSRSoft retains data only for 7 years on a rolling cycle. Every day
// drops a day... I will eventually want to backfill all stores data for that period. Set it up
// whenever convenient and meter the data in if that works best for limits and such."
//
// ⚠️ CORRECTED 2026-10-17 — the "7 years" part of that quote was the owner's own belief going
// in, stated as the reason to build this; it is NOT what a direct, live retention probe measured
// (owner-requested, same day). Real DAR/OPS data came back for a 2019-09 window -- genuinely
// more than 7 years old as of today -- while a 2018-02 window came back confirmed empty; the
// real floor is somewhere in that ~18-month gap, not a clean 7-year mark, and EBOS (purchases)
// is governed by a completely different, per-store "ebos_activation_date" with no relation to
// retention at all. Full findings: memory/finding-qsrsoft-retention-2026-10-17.md. This file's
// own YEARS_BACK/CONSECUTIVE_EMPTY_STOP constants below were corrected in the same pass -- the
// fixed-7-year target this script originally walked toward no longer governs where it stops.
//
// WHY A DRIVER, NOT JUST A BIGGER start_date: DAR and OPS already accept an explicit
// QSRSOFT_*_START_DATE/END_DATE window (qsrsoft-dar-pull.mjs, qsrsoft-ops-pull.mjs) and EBOS now
// does too (this dispatch), but nothing in this repo has ever metered a multi-YEAR, multi-
// report-type, all-27-store backfill — every past backfill (the ops-pull 27-month one CLAUDE.md
// cites) was a human manually re-dispatching workflow_dispatch, chunk by chunk, by hand. GitHub
// Actions' 6h-per-job ceiling (DAR's own workflow already raises its timeout to 330 min for
// exactly this reason) rules out a single run covering 7 years anyway: at the one measured rate
// in this repo (ops-pull's ~6.6 s/day/store-set), 7 years alone is ~4.7 hours for ONE of the
// three report types. This script is the missing auto-advancing cursor so nobody has to babysit
// that by hand for months.
//
// WHAT IT DOES, each invocation (meant to run on a schedule — see
// .github/workflows/qsrsoft-backfill.yml):
//   For each of EBOS / DAR / OPS, independently:
//     1. Read (or bootstrap, on first run, from the real destination table's own MIN(date)) a
//        cursor row in qsrsoft_backfill_cursor — the oldest date successfully pulled so far.
//     2. Compute the next ~90-day chunk walking BACKWARD from that cursor toward "today minus
//        QSRSOFT_BACKFILL_YEARS" (default 7) — see nextChunk() below, a pure function so the
//        chunk-picking logic is unit-testable without any network/Supabase access.
//     3. If there's a chunk left, spawn the existing pull script AS A SUBPROCESS with that
//        chunk's START_DATE/END_DATE env vars (each pull script runs its own main() top-level
//        and calls process.exit() — importing it in-process would kill the driver on exit, so
//        subprocess is the only safe reuse here, not a refactor of three production scripts).
//     4. On success, advance the cursor to the chunk's start (so the NEXT run picks up exactly
//        where this one left off). On failure, leave the cursor untouched — the next run safely
//        retries the SAME chunk, same idempotent-upsert property every pull script already has.
//     5. Once a type's cursor reaches the target floor, mark it `done` and stop touching it.
//
// "Meter it": one ~90-day chunk per report type per invocation, on a DAILY schedule — a
// deliberately conservative pace (full history finishes in ~1 month per type) chosen because
// this repo has NO measured QSRSoft rate limit to design against (confirmed by the research
// behind this dispatch — only self-imposed politeness delays exist in the pull scripts
// themselves, already respected since this driver changes nothing about THEIR internal pacing).
// Faster is a one-line change (QSRSOFT_BACKFILL_CHUNK_DAYS / the workflow's cron) if the owner
// wants it sped up once real-world behavior is observed.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { readFileSync, rmSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const CHUNK_DAYS = parseInt(process.env.QSRSOFT_BACKFILL_CHUNK_DAYS || '90', 10);
// ⚠️ CORRECTED 2026-10-17 — bumped from 7. The owner's own 2026-10-15 framing ("QSRSoft retains
// data only for 7 years on a rolling cycle") was this script's original design basis and is now
// measured WRONG: a direct >7-year retention probe (owner request) found real, retrievable DAR
// (daily sales/activity) and OPS (cash/labor/service/sales-mix/peaks) data as recently-tested as
// 2019-09 — genuinely >7 years old as of today — while a 2018-02 window came back confirmed
// empty. The real floor sits somewhere in that ~18-month gap, not at a clean 7-year mark, and
// may differ per report type or even per store (EBOS/purchases is a separate case again — its
// own activation date varies per store, unrelated to retention at all). See
// memory/finding-qsrsoft-retention-2026-10-17.md for the full measured findings. 15 is a
// generous ceiling now, not the real target — CONSECUTIVE_EMPTY_STOP below is what actually
// finds and stops at each report type's real floor; this is just the backstop so a genuinely
// confused run can't grind forever.
const YEARS_BACK = parseInt(process.env.QSRSOFT_BACKFILL_YEARS || '15', 10);
const DRY_RUN = process.env.QSRSOFT_BACKFILL_DRY_RUN === '1';
const ONLY_TYPE = (process.env.QSRSOFT_BACKFILL_ONLY || '').trim(); // '' = all three
// How many CONSECUTIVE confirmed-empty chunks (zero rows, zero per-unit errors -- see
// scripts/lib/pull-outcome.mjs's QSRSOFT_BACKFILL_PROBE mode) in a row mean "this is the real
// floor, stop here" rather than "today-minus-YEARS_BACK, stop here".
// 3 chunks * 90 days ≈ 9 months is comfortably inside that ~18-month band rather than past it --
// deliberately so, since a real floor sitting anywhere in that range should trip this well before
// the walk reaches YEARS_BACK. The actual guard against one isolated empty chunk inside otherwise-
// real history is the CONSECUTIVE requirement itself (a single stray empty chunk resets to 0, not
// 1-and-done) — the threshold's job is only to turn "a few consecutive empties" into "stop," not
// to outlast the uncertainty band in days.
const CONSECUTIVE_EMPTY_STOP = parseInt(process.env.QSRSOFT_BACKFILL_EMPTY_STOP || '3', 10);

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

// report_type -> { script, startVar, endVar, destTable, destDateCol }
// destTable/destDateCol are read-only, used ONLY to bootstrap a cursor row on its very first
// run (so the campaign starts from the real current floor, not a guess). 'ops' pulls 6
// endpoints across 5 tables per call but always the SAME date range for all of them
// (qsrsoft-ops-pull.mjs's single getDates()) — qsr_cash_sheet is representative, not a gap.
// Exported so tests can cross-check destDateCol against the real column name each pull script
// itself queries by (see qsrsoft-backfill-driver.test.js) -- a live dry-run already caught one
// of these wrong once (ops's destDateCol was 'date'; qsr_cash_sheet's real column is 'dt', same
// as qsr_daily_activity's) and that class of bug has no other guard, since it only surfaces on
// a real Supabase read, not from nextChunk()/targetStartDate()'s pure logic.
export const TYPES = {
  ebos: { script: 'qsrsoft-ebos-pull.mjs', startVar: 'QSRSOFT_EBOS_START_DATE', endVar: 'QSRSOFT_EBOS_END_DATE', destTable: 'qsr_ebos_daily', destDateCol: 'date' },
  dar:  { script: 'qsrsoft-dar-pull.mjs',  startVar: 'QSRSOFT_DAR_START_DATE',  endVar: 'QSRSOFT_DAR_END_DATE',  destTable: 'qsr_daily_activity', destDateCol: 'dt' },
  ops:  { script: 'qsrsoft-ops-pull.mjs',  startVar: 'QSRSOFT_OPS_START_DATE',  endVar: 'QSRSOFT_OPS_END_DATE',  destTable: 'qsr_cash_sheet', destDateCol: 'dt' },
};

const pad2 = n => String(n).padStart(2, '0');
const fmtDate = d => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
const addDay = (d, n) => { const r = new Date(d); r.setUTCDate(r.getUTCDate() + n); return r; };

// "Today minus YEARS_BACK" — computed FRESH each call, not a frozen campaign-start value. The
// floor itself recedes forward one day per calendar day exactly as QSRSoft's own retention does,
// and each daily chunk (90 days) advances the cursor far faster than the floor recedes, so the
// campaign still reaches it and finishes — a frozen anchor would either stop early (if set too
// conservatively) or silently stop meaning "7 years" the longer the campaign ran.
export function targetStartDate(today = new Date(), yearsBack = YEARS_BACK) {
  const d = new Date(today);
  d.setUTCFullYear(d.getUTCFullYear() - yearsBack);
  return fmtDate(d);
}

/**
 * Pure decision logic, no I/O — given the cursor's current earliest-pulled date (or null if
 * this type has never been bootstrapped) and "today," returns the next {start,end} chunk to
 * pull walking BACKWARD from the day immediately before what's already covered, or null once
 * the type has reached (or passed) the target floor.
 */
export function nextChunk({ earliestDatePulled, today = new Date(), chunkDays = CHUNK_DAYS, yearsBack = YEARS_BACK }) {
  const target = targetStartDate(today, yearsBack);
  const chunkEnd = earliestDatePulled
    ? fmtDate(addDay(new Date(earliestDatePulled + 'T00:00:00Z'), -1))
    : fmtDate(addDay(today, -1));
  if (chunkEnd < target) return null; // already caught up to (or past) the floor
  const candidateStart = fmtDate(addDay(new Date(chunkEnd + 'T00:00:00Z'), -(chunkDays - 1)));
  const chunkStart = candidateStart < target ? target : candidateStart;
  return { start: chunkStart, end: chunkEnd };
}

function supa() {
  const url = process.env.VITE_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required');
  return createClient(url, key);
}

async function getOrBootstrapCursor(db, reportType) {
  const { data, error } = await db.from('qsrsoft_backfill_cursor').select('*').eq('report_type', reportType).maybeSingle();
  if (error) throw new Error(`[backfill-driver] cursor read failed for ${reportType}: ${error.message}`);
  if (data) return data;

  // First run for this type — seed from the real destination table's own earliest date, so the
  // campaign starts from what's ACTUALLY already pulled, not an assumption.
  const { destTable, destDateCol } = TYPES[reportType];
  const { data: minRow, error: minErr } = await db.from(destTable).select(destDateCol).order(destDateCol, { ascending: true }).limit(1).maybeSingle();
  if (minErr) throw new Error(`[backfill-driver] bootstrap read failed for ${reportType} (${destTable}): ${minErr.message}`);
  const earliest = minRow ? String(minRow[destDateCol]).slice(0, 10) : null;
  console.log(`[backfill-driver] ${reportType}: no cursor yet — bootstrapping from ${destTable}.${destDateCol} = ${earliest || '(table empty)'}`);
  const { data: inserted, error: insErr } = await db.from('qsrsoft_backfill_cursor')
    .insert({ report_type: reportType, earliest_date_pulled: earliest, done: earliest == null })
    .select('*').single();
  if (insErr) throw new Error(`[backfill-driver] cursor bootstrap insert failed for ${reportType}: ${insErr.message}`);
  return inserted;
}

async function advanceOne(db, reportType) {
  const cursor = await getOrBootstrapCursor(db, reportType);
  if (cursor.done) { console.log(`[backfill-driver] ${reportType}: already done. Skipping.`); return; }

  const chunk = nextChunk({ earliestDatePulled: cursor.earliest_date_pulled });
  if (!chunk) {
    console.log(`[backfill-driver] ${reportType}: cursor (${cursor.earliest_date_pulled}) has reached the ${YEARS_BACK}-year ceiling (${targetStartDate()}) without finding ${CONSECUTIVE_EMPTY_STOP} consecutive confirmed-empty chunks first. Marking done.`);
    await db.from('qsrsoft_backfill_cursor').update({ done: true, updated_at: new Date().toISOString() }).eq('report_type', reportType);
    return;
  }

  const { script, startVar, endVar } = TYPES[reportType];
  console.log(`[backfill-driver] ${reportType}: pulling chunk ${chunk.start} → ${chunk.end}`);
  if (DRY_RUN) { console.log(`[backfill-driver] ${reportType}: DRY RUN — not actually spawning ${script}`); return; }

  // QSRSOFT_BACKFILL_PROBE tells the pull script's shared outcome tracker (scripts/lib/
  // pull-outcome.mjs) that a clean zero-rows/zero-errors result for THIS invocation is a
  // confirmed-empty historical window, not a failure -- exit 0 instead of 1, so execFileSync
  // doesn't throw and the cursor still advances past it. QSRSOFT_BACKFILL_OUTCOME_FILE is how
  // this process learns, after the fact, whether that chunk actually saved real rows or was
  // empty -- stdio stays 'inherit' (full live log in the Action run) so this can't be read from
  // captured stdout; a dropped sidecar file is the only channel.
  const outcomeFile = path.join(os.tmpdir(), `qsrsoft-backfill-outcome-${reportType}-${Date.now()}.json`);
  try { rmSync(outcomeFile, { force: true }); } catch {}

  try {
    execFileSync('node', [path.join(SCRIPT_DIR, script)], {
      env: {
        ...process.env, [startVar]: chunk.start, [endVar]: chunk.end,
        QSRSOFT_BACKFILL_PROBE: '1', QSRSOFT_BACKFILL_OUTCOME_FILE: outcomeFile,
      },
      stdio: 'inherit',
    });

    let chunkTotalSaved = null;
    try { chunkTotalSaved = JSON.parse(readFileSync(outcomeFile, 'utf8')).totalSaved; } catch { /* outcome file is best-effort on the script side too */ }
    try { rmSync(outcomeFile, { force: true }); } catch {}
    const wasConfirmedEmpty = chunkTotalSaved === 0;
    const consecutiveEmpty = wasConfirmedEmpty ? (cursor.consecutive_empty_chunks || 0) + 1 : 0;
    const foundRealFloor = wasConfirmedEmpty && consecutiveEmpty >= CONSECUTIVE_EMPTY_STOP;

    await db.from('qsrsoft_backfill_cursor').update({
      earliest_date_pulled: chunk.start, last_chunk_start: chunk.start, last_chunk_end: chunk.end,
      last_status: 'ok', last_error: null, last_run_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      consecutive_empty_chunks: consecutiveEmpty,
      ...(foundRealFloor ? { done: true } : {}),
    }).eq('report_type', reportType);

    if (foundRealFloor) {
      console.log(`[backfill-driver] ${reportType}: ${consecutiveEmpty} consecutive confirmed-empty chunks (${CONSECUTIVE_EMPTY_STOP} required) -- real floor found around ${chunk.end}. Marking done.`);
    } else if (wasConfirmedEmpty) {
      console.log(`[backfill-driver] ${reportType}: chunk ${chunk.start}→${chunk.end} confirmed-empty (${consecutiveEmpty}/${CONSECUTIVE_EMPTY_STOP} consecutive) -- cursor advanced past it to ${chunk.start}.`);
    } else {
      console.log(`[backfill-driver] ${reportType}: cursor advanced to ${chunk.start}`);
    }
  } catch (e) {
    // Leave earliest_date_pulled UNCHANGED — the next run retries this exact chunk, same
    // idempotent-upsert safety every pull script already relies on for its own daily re-pulls.
    console.error(`[backfill-driver] ${reportType}: chunk ${chunk.start}→${chunk.end} FAILED: ${e.message}`);
    await db.from('qsrsoft_backfill_cursor').update({
      last_chunk_start: chunk.start, last_chunk_end: chunk.end,
      last_status: 'error', last_error: String(e.message || e).slice(0, 2000), last_run_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('report_type', reportType);
  }
}

async function main() {
  const types = ONLY_TYPE ? [ONLY_TYPE] : Object.keys(TYPES);
  for (const t of types) {
    if (!TYPES[t]) { console.error(`[backfill-driver] unknown report type "${t}" — expected one of ${Object.keys(TYPES).join(', ')}`); continue; }
  }
  const db = supa();
  for (const t of types.filter(t => TYPES[t])) {
    await advanceOne(db, t);
  }
}

// Only auto-run when invoked directly (not when imported for its pure functions, e.g. by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error('[backfill-driver] FATAL:', e); process.exit(1); });
}
