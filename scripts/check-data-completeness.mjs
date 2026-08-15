#!/usr/bin/env node
// scripts/check-data-completeness.mjs — the completeness ledger's scheduled comparison (#265).
//
// #263 makes a pull say so when it KNOWS it failed. It cannot catch Sulphur's 8-day
// service-stats outage (2025-09-09→09-16) or Marietta's single-day upstream hole
// (2025-08-03) — in both cases the pull ran cleanly, QSRSoft itself simply had no row to
// return, and nothing anywhere flagged it (memory/store-events-material-changes.md). This
// script is the other half: for each stream below, compare which (store, day) rows SHOULD
// exist against which actually do, over a trailing window, and write any gap to
// data_completeness_incidents (supabase/schema-data-completeness.sql) — tolerating the
// legitimate cases already on record (openings, closures, weather, reduced hours) instead
// of flagging them as outages.
//
// Scope, deliberately: this ships with the two streams that already have DOCUMENTED real
// incidents against them (qsr_service_stats, qsr_daily_activity) — not silently, every
// other stream #263 covers (ebos, onhand, variance, roster, lifelenz) is a real gap in this
// ledger's coverage, left for a follow-up rather than guessed at here without a known
// incident to design the tolerance rules against.
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional: COMPLETENESS_DAYS_BACK (default 60) · COMPLETENESS_DEBUG=1

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const DEBUG = process.env.COMPLETENESS_DEBUG === '1';
const DAYS_BACK = parseInt(process.env.COMPLETENESS_DAYS_BACK || '60', 10);

const STORE_NSNS = [
  3708, 5183, 5985, 6178, 6838, 6972,
  10034, 10422, 10915, 11657, 13113, 18213,
  20475, 24471, 29760, 31357, 32525, 33109,
  33222, 33704, 34222, 35064, 35242, 37566,
  38609, 43380, 43701,
];
const nsn7 = n => String(n).padStart(7, '0');
const ALL_LOCS = STORE_NSNS.map(nsn7);

// First-trading-day exceptions (memory/store-events-material-changes.md, established by
// direct query) -- a store with no rows before this date is not missing data, it didn't
// exist yet. Add here as new stores open; do NOT infer this from row presence (that begs
// the question this script exists to answer).
const FIRST_TRADING_DAY = {
  '0043701': '2026-03-13', // Ponce de Leon
};

// Known-legitimate gaps, sourced from memory/store-events-material-changes.md -- confirmed
// by the owner or by direct query, not inferred. A SEED list: expected to grow as open
// incidents get reviewed and reclassified, not a claim of completeness. `scope:'all'`
// applies to every store; otherwise `loc` is the padded NSN.
const KNOWN_LEGITIMATE = [
  { scope: 'all', date: '2025-12-25', cause: 'holiday_closure', note: 'Christmas — most of the district closes' },
  { loc: '0032525', date: '2025-04-20', cause: 'holiday_closure', note: 'Sulphur Easter closure — confirmed $0/0gc vs $8,699.51 LY' },
  { loc: '0032525', dateStart: '2025-09-09', dateEnd: '2025-09-16', cause: 'upstream_provider_hole', note: 'Sulphur 8-day KVS/timer reporting outage, traded normally' },
  { loc: '0033109', date: '2025-08-03', cause: 'upstream_provider_hole', note: 'Marietta upstream service-stats hole — traded normally ($10,715.51/976gc), QSRSoft had no per-location row' },
  { loc: '0013113', date: '2025-09-06', cause: 'weather', note: 'Madill-Hwy 70, isolated single day' },
  { loc: '0029760', date: '2026-01-20', cause: 'weather', note: 'OK winter storm, confirmed by owner 2026-08-13' },
  { loc: '0032525', date: '2026-01-25', cause: 'weather', note: 'OK winter storm' },
  { loc: '0018213', date: '2026-01-25', cause: 'weather', note: 'OK winter storm' },
  { loc: '0043380', dateStart: '2026-01-25', dateEnd: '2026-01-26', cause: 'weather', note: 'OK winter storm' },
];

const STREAMS = [
  { name: 'qsr_service_stats', table: 'qsr_service_stats', locCol: 'loc', dateCol: 'dt' },
  { name: 'qsr_daily_activity', table: 'qsr_daily_activity', locCol: 'loc', dateCol: 'dt' },
];

const dkey = d => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const r = new Date(d); r.setUTCDate(r.getUTCDate() + n); return r; };

function isKnownLegitimate(loc, date) {
  for (const k of KNOWN_LEGITIMATE) {
    if (k.scope !== 'all' && k.loc !== loc) continue;
    if (k.date && k.date === date) return k;
    if (k.dateStart && date >= k.dateStart && date <= k.dateEnd) return k;
  }
  return null;
}

// Fetch every distinct (loc, date) that HAS a row for this stream, in the window.
async function fetchActualDays(stream, startDate, endDate) {
  const seen = new Set(); // `${loc}|${date}`
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(stream.table)
      .select(`${stream.locCol},${stream.dateCol}`)
      .gte(stream.dateCol, startDate).lte(stream.dateCol, endDate)
      // #269 review: Postgres doesn't guarantee row order across separate paged queries
      // without an explicit ORDER BY — a row skipped or repeated between pages surfaces as
      // a false gap, indistinguishable from a real one (the same class of bug that already
      // cost this repo a real incident: loadQsrActSummary's 1000-row truncation).
      .order(stream.locCol, { ascending: true }).order(stream.dateCol, { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    if (!data || !data.length) break;
    for (const r of data) seen.add(`${r[stream.locCol]}|${r[stream.dateCol]}`);
    if (data.length < 1000) break;
  }
  return seen;
}

// Same paging/ordering contract as fetchActualDays, scoped to a specific loc set and date
// range instead of ALL_LOCS × the run's own window — used by closeRecoveredIncidents to
// re-check old, out-of-window incidents without re-fetching the whole district.
async function fetchActualDaysForLocs(stream, locs, startDate, endDate) {
  const seen = new Set();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(stream.table)
      .select(`${stream.locCol},${stream.dateCol}`)
      .in(stream.locCol, locs)
      .gte(stream.dateCol, startDate).lte(stream.dateCol, endDate)
      .order(stream.locCol, { ascending: true }).order(stream.dateCol, { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    if (!data || !data.length) break;
    for (const r of data) seen.add(`${r[stream.locCol]}|${r[stream.dateCol]}`);
    if (data.length < 1000) break;
  }
  return seen;
}

// Group a sorted list of missing dates for one loc into contiguous [start,end] runs, so a
// week-long outage is one incident, not seven.
function groupConsecutive(dates) {
  const runs = [];
  let start = null, prev = null;
  for (const d of dates) {
    if (start === null) { start = d; prev = d; continue; }
    const gapDays = Math.round((new Date(d) - new Date(prev)) / 86400000);
    if (gapDays === 1) { prev = d; continue; }
    runs.push([start, prev]);
    start = d; prev = d;
  }
  if (start !== null) runs.push([start, prev]);
  return runs;
}

// #269 review (owner, 2026-08-14): nothing ever closed an incident. The only writes were
// the 'open' default on a new row and a carry-forward of a prior row's own status —
// recovered_at appeared in the schema and in no code path. Worse than "the happy path
// isn't wired": checkStream's incident query below is scoped to Object.keys(incidentsByLoc)
// — the locs that STILL have a gap — so a loc whose gap was fully backfilled is never even
// looked at, and its row stays 'open' permanently. Partial recovery is the same shape and
// hits sooner: gap Aug1-8 writes date_start=2026-08-01; Aug1 gets backfilled; the next run
// groups the remainder as date_start=2026-08-02 and inserts a SECOND row (the unique key is
// loc+stream+date_start) — the Aug1 row stays open forever. That lands squarely on
// printRanking()'s headline output, which sorts open incidents oldest-first: the entries
// most likely to already be fixed were permanently pinned to the top.
//
// #269 review round 2 (owner, 2026-08-15): the first fix above still had a gap in the same
// direction. It checked every prior 'open' incident, but only against `actual` — the fetch
// bounded to THIS run's [startDate,endDate] window — and SKIPPED any incident whose range
// fell outside it. printRanking() sorts oldest-first, so the incidents this skip can never
// reach are exactly the ones sitting at the top of that ranked list: the older an incident
// gets, the more certain this pass becomes that it will never be reconsidered, however long
// ago it actually recovered. Fixed by fetching those out-of-window incidents' own ranges
// directly — ONE extra query per stream (their combined min..max envelope, scoped to just
// the locs with an out-of-window incident), not one query per incident.
async function closeRecoveredIncidents(stream, actual, startDate, endDate) {
  const { data: priorOpen, error } = await supabase.from('data_completeness_incidents')
    .select('loc,date_start,date_end')
    .eq('stream', stream.name).eq('recovery_status', 'open');
  if (error) { console.warn(`[completeness]   recovery check failed: ${error.message}`); return 0; }
  if (!priorOpen || !priorOpen.length) return 0;

  const inWindow = priorOpen.filter(inc => inc.date_start >= startDate && inc.date_end <= endDate);
  const outOfWindow = priorOpen.filter(inc => inc.date_start < startDate || inc.date_end > endDate);

  let outOfWindowActual = null;
  if (outOfWindow.length) {
    const locs = [...new Set(outOfWindow.map(inc => inc.loc))];
    const minDate = outOfWindow.reduce((m, inc) => inc.date_start < m ? inc.date_start : m, outOfWindow[0].date_start);
    const maxDate = outOfWindow.reduce((m, inc) => inc.date_end > m ? inc.date_end : m, outOfWindow[0].date_end);
    if (DEBUG) console.log(`[completeness]   ${outOfWindow.length} out-of-window open incident(s) — re-checking ${minDate}…${maxDate} for ${locs.length} loc(s)`);
    outOfWindowActual = await fetchActualDaysForLocs(stream, locs, minDate, maxDate);
  }

  let closed = 0;
  for (const inc of [...inWindow, ...outOfWindow]) {
    const coverage = (inc.date_start >= startDate && inc.date_end <= endDate) ? actual : outOfWindowActual;
    if (!coverage) continue; // outOfWindowActual only fetched when outOfWindow is non-empty; guards a stray null
    let fullyPresent = true;
    for (let d = new Date(inc.date_start + 'T00:00:00Z'); dkey(d) <= inc.date_end; d = addDays(d, 1)) {
      if (!coverage.has(`${inc.loc}|${dkey(d)}`)) { fullyPresent = false; break; }
    }
    if (!fullyPresent) continue;
    const { error: updErr } = await supabase.from('data_completeness_incidents')
      .update({ recovery_status: 'backfilled', recovered_at: new Date().toISOString() })
      .eq('stream', stream.name).eq('loc', inc.loc).eq('date_start', inc.date_start);
    if (updErr) { console.warn(`[completeness]   ✗ recovery update failed for ${inc.loc} ${inc.date_start}: ${updErr.message}`); continue; }
    closed++;
  }
  if (closed) console.log(`[completeness]   ✓ ${closed} incident(s) recovered — marked backfilled`);
  return closed;
}

async function checkStream(stream, startDate, endDate) {
  console.log(`[completeness] ${stream.name}: ${startDate} → ${endDate} × ${ALL_LOCS.length} stores`);
  const actual = await fetchActualDays(stream, startDate, endDate);

  // Recovery pass runs UNCONDITIONALLY, before any early return below — the common case is
  // exactly "zero new incidents this run, but an old one just got backfilled," and an early
  // return on an empty `rows` array must never skip this.
  await closeRecoveredIncidents(stream, actual, startDate, endDate);

  const incidentsByLoc = {}; // loc -> [date, date, ...] missing, tolerated ones excluded up front
  let tolerated = 0;
  for (const loc of ALL_LOCS) {
    const opened = FIRST_TRADING_DAY[loc];
    const missing = [];
    for (let d = new Date(startDate + 'T00:00:00Z'); dkey(d) <= endDate; d = addDays(d, 1)) {
      const date = dkey(d);
      if (opened && date < opened) continue; // store didn't exist yet -- not a gap
      if (actual.has(`${loc}|${date}`)) continue;
      const known = isKnownLegitimate(loc, date);
      if (known) { tolerated++; continue; } // recorded as tolerated, not written as an incident
      missing.push(date);
    }
    if (missing.length) incidentsByLoc[loc] = missing;
  }

  const rows = [];
  for (const [loc, missing] of Object.entries(incidentsByLoc)) {
    for (const [s, e] of groupConsecutive(missing)) {
      rows.push({
        loc, stream: stream.name, date_start: s, date_end: e,
        classification: 'unclassified', cause: 'unknown', recovery_status: 'open',
      });
    }
  }

  if (DEBUG) console.log(`[completeness]   tolerated ${tolerated} known-legitimate day(s)`);
  if (!rows.length) { console.log(`[completeness]   ✓ no unexplained gaps`); return 0; }

  console.log(`[completeness]   ${rows.length} unclassified incident(s):`);
  for (const r of rows) console.log(`     ${r.loc} ${r.date_start}${r.date_start === r.date_end ? '' : '…' + r.date_end}`);

  // Upsert on (tenant_id,loc,stream,date_start) — an existing 'legitimate'/'outage'
  // classification a human already applied is preserved; only date_end and updated_at
  // refresh, so re-running never clobbers a review someone already did.
  const { data: existing } = await supabase.from('data_completeness_incidents')
    .select('loc,stream,date_start,classification,cause,recovery_status')
    .eq('stream', stream.name).in('loc', Object.keys(incidentsByLoc));
  const already = new Map((existing || []).map(e => [`${e.loc}|${e.date_start}`, e]));

  const toUpsert = rows.map(r => {
    const prior = already.get(`${r.loc}|${r.date_start}`);
    return prior
      ? { ...r, classification: prior.classification, cause: prior.cause, recovery_status: prior.recovery_status, updated_at: new Date().toISOString() }
      : { ...r, updated_at: new Date().toISOString() };
  });

  const { error } = await supabase.from('data_completeness_incidents')
    .upsert(toUpsert, { onConflict: 'tenant_id,loc,stream,date_start' });
  if (error) { console.error(`[completeness]   ✗ upsert failed: ${error.message}`); return 1; }
  console.log(`[completeness]   ✓ ${toUpsert.length} incident(s) upserted to data_completeness_incidents`);
  return 0;
}

// Ranked by UNRECOVERED DAYS (days an 'open' incident has sat undetected/unfixed), not by
// how long the outage itself ran — a 1-day gap open for 200 days outranks a 30-day gap
// fixed yesterday, per the issue's own framing.
async function printRanking() {
  const { data, error } = await supabase.from('data_completeness_incidents')
    .select('loc,stream,date_start,date_end,classification,recovery_status,detected_at')
    .eq('recovery_status', 'open').neq('classification', 'legitimate')
    .order('detected_at', { ascending: true });
  if (error) { console.warn('[completeness] ranking query failed:', error.message); return; }
  if (!data || !data.length) { console.log('[completeness] ranking: nothing open.'); return; }
  console.log('\n[completeness] ── open incidents, ranked by unrecovered days ──');
  const now = Date.now();
  for (const r of data) {
    const unrecoveredDays = Math.floor((now - new Date(r.detected_at).getTime()) / 86400000);
    console.log(`  ${unrecoveredDays}d unrecovered  ·  ${r.loc}  ${r.stream}  ${r.date_start}${r.date_start === r.date_end ? '' : '…' + r.date_end}  [${r.classification}]`);
  }
}

async function main() {
  const today = new Date();
  // #269 review (owner, 2026-08-14): the window must never reach today. An in-progress day
  // has no completeness guard, and this repo already hit exactly this bug once —
  // qsrsoft-ops-pull.mjs's cash-anomaly check compares against `.lt('dt', todayStr)` under
  // the comment "it looked wildly anomalous vs closed days for 23 of 27 stores
  // simultaneously on first run — a systematic false-positive, not real anomalies. Only
  // ever evaluate the most recent COMPLETE (yesterday-or-earlier) day." Same comparison,
  // same partial-current-day cause, same 27-store blast radius here. This also makes the
  // workflow's shared 13:00 UTC cron minute with qsrsoft-dar-pull.yml harmless rather than
  // a race: once the window stops at yesterday, this check depends only on data that had
  // an entire prior day's worth of DAR runs to land, never on today's still-running pull.
  const endDate = dkey(addDays(today, -1));
  const startDate = dkey(addDays(today, -DAYS_BACK));

  let worst = 0;
  for (const stream of STREAMS) {
    const code = await checkStream(stream, startDate, endDate);
    if (code) worst = code;
  }
  await printRanking();
  if (worst) process.exit(worst);
}

main().catch(err => { console.error('[completeness] FATAL:', err); process.exit(1); });
