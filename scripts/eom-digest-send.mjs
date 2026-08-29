#!/usr/bin/env node
// scripts/eom-digest-send.mjs — dispatch #215 Task 3: EOM roll-up digest, scheduled + on-demand.
//
// Rolls per-store EOM count-completion + FOB(+target) data up to District / Patch (Org optional
// via DIGEST_LEVEL, see below) via src/engine/eom-digest.js's buildEomDigest(), then emails ONE
// digest per (level, group) through scripts/lib/eom-digest-notify.mjs's sendDigestEmail() — a
// Supervisor's own patch, the district as a whole, etc., not one giant combined email.
//
// Data sources — reads ONLY tables scripts/qsrsoft-onhand-pull.mjs already writes; this script
// pulls NOTHING from QSRSoft itself:
//   eom_count_status        — per-class done flags + food_done_at/condiment_done_at (this
//                              script's FOB-freshness anchor, see buildStoreRows below).
//   eom_count_progress_log  — latest per-class pct_counted snapshot per store this period, so a
//                              still-open class reads 'in_progress' rather than a flat
//                              'not_started' (eom_count_status alone only has the done boolean).
//   eom_count_notifications — latest FIRED notification per store this period, for its
//                              uncounted_items.totalValue (the $ risk figure — see
//                              loadLatestUncountedValueByLoc's own note: a store with no fired
//                              notification yet this period has no persisted $ figure anywhere in
//                              this data model, so it reads 0, not a guess).
//   qsr_fob                 — via fetchFobSnapshotForStore()/resolveFobTargets()/
//                              buildFobTargetReport() (all imported unchanged from
//                              qsrsoft-onhand-pull.mjs — dispatch #213/#215 Task 1), freshness-
//                              gated the SAME way #213 gates the single-store notification, using
//                              food_done_at/condiment_done_at (already persisted) as the "count
//                              completed at" anchor instead of re-scanning raw qsr_onhand rows a
//                              second time.
//
// Live org-chart grouping — the Node-script gotcha dispatch #215 calls out explicitly:
// supervisorGroups()/supervisorOf() (src/constants.js) are populated CLIENT-SIDE at app startup
// (App.js's useEffect calling setLiveSupervisorGroups()/setLiveAssignments(), fed by a Supabase
// org_config 'app_settings' row read). A bare Node import of constants.js does NOT get that for
// free — bootstrapLiveOrg() below reads the SAME org_config row and calls the SAME two setters,
// mirroring App.js's useEffect line for line, before this script calls
// supervisorGroups()/getStoreOrg() for real. VERIFIED LIVE (not assumed) during this dispatch's
// own build: a Node script run WITHOUT this bootstrap silently falls back to the stale
// INV_ORG_COORDS seed; run WITH it, supervisorGroups() returned the real 7-supervisor/27-store
// live assignment and every spot-checked store matched CLAUDE.md's own FL/OK store list. See the
// dispatch's PR body for the exact measurement.
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY.
// Optional:
//   DIGEST_FORCE=1        — send even outside the active count window
//   DIGEST_LEVEL=district|patch|org|all — which level(s) to send (default: district + patch)
//   DIGEST_PERIOD=YYYY-MM — override the period (default: current month)
//   DIGEST_DATE=YYYY-MM-DD— override the business date queried (default: today UTC)
//   QSRSOFT_DEBUG=1

import { createClient } from '@supabase/supabase-js';
import {
  STORE_NAMES, unpadLoc, getStoreOrg, supervisorOf,
  setLiveSupervisorGroups, setLiveAssignments, seedAssignmentsFromGroups,
} from '../src/constants.js';
import { buildEomDigest, DIGEST_CLASS_ORDER } from '../src/engine/eom-digest.js';
import {
  STORE_NSNS, fetchFobSnapshotForStore, isFobFresh, resolveFobTargets, buildFobTargetReport,
} from './qsrsoft-onhand-pull.mjs';
import { inCountWindow } from './lib/count-window.mjs';
import { sendDigestEmail } from './lib/eom-digest-notify.mjs';

const DEBUG = process.env.QSRSOFT_DEBUG === '1';
const FORCE = process.env.DIGEST_FORCE === '1';
const LEVEL_ARG = (process.env.DIGEST_LEVEL || '').trim().toLowerCase();
const ALL_LEVELS = ['district', 'patch', 'org'];
// Default = district + patch (dispatch #215 Task 3's own "at minimum: district-wide + every
// patch" — org-level was explicitly left as an easy opt-in, not on by default, for a first pass).
function levelsToRun() {
  if (LEVEL_ARG === 'all') return ALL_LEVELS;
  if (ALL_LEVELS.includes(LEVEL_ARG)) return [LEVEL_ARG];
  return ['district', 'patch'];
}

// Guarded, not unconditional — matches qsrsoft-onhand-pull.mjs's own module-scope pattern (its
// tests import pure functions from this module without a live Supabase/RESEND credential).
const supabase = (process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

const pad2 = n => String(n).padStart(2, '0');
const fmtDate = d => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
function businessDate() { return process.env.DIGEST_DATE || fmtDate(new Date()); }
function periodFor(dateStr) { return process.env.DIGEST_PERIOD || dateStr.slice(0, 7); }

// ── Live org-chart bootstrap (see header) ──────────────────────────────────────
export async function bootstrapLiveOrg() {
  if (!supabase) return false;
  const { data, error } = await supabase.from('org_config').select('data').eq('key', 'app_settings').maybeSingle();
  if (error) { console.warn('[eom-digest-send] org_config load error:', error.message); return false; }
  if (!data?.data) { console.warn('[eom-digest-send] no org_config app_settings row — supervisorGroups() will fall back to the stale INV_ORG_COORDS seed'); return false; }
  const remote = data.data;
  setLiveSupervisorGroups(remote.supervisorGroups);
  const a = (remote.orgAssignments && remote.orgAssignments.length) ? remote.orgAssignments : seedAssignmentsFromGroups(remote.supervisorGroups);
  setLiveAssignments(a);
  return true;
}

// ── Per-store data loads ────────────────────────────────────────────────────────
async function loadEomCountStatusByLoc(period) {
  if (!supabase) return {};
  const { data, error } = await supabase.from('eom_count_status').select('*').eq('period', period);
  if (error) { console.warn('[eom_count_status] load error:', error.message); return {}; }
  const m = {}; for (const r of (data || [])) m[String(r.loc)] = r;
  return m;
}

// Latest progress-log snapshot per store this period (per-class pct_counted). Ordered
// newest-first so the FIRST row seen per loc is the latest one.
async function loadLatestProgressLogByLoc(period) {
  if (!supabase) return {};
  const { data, error } = await supabase.from('eom_count_progress_log').select('*')
    .eq('period', period).order('snapshot_at', { ascending: false });
  if (error) { console.warn('[eom_count_progress_log] load error:', error.message); return {}; }
  const m = {};
  for (const r of (data || [])) { const k = String(r.loc); if (!(k in m)) m[k] = r; }
  return m;
}

// Latest FIRED notification's uncounted_items.totalValue per store this period — the only place
// a dollar figure for "still open" risk is persisted anywhere in this data model. A store that
// hasn't fired a notification yet this period has NO persisted $ figure (not zero risk, just
// nothing observed yet) — callers must read a 0 here as "not yet observed," never "confirmed
// clean," matching this file's own email-rendering note.
async function loadLatestUncountedValueByLoc(period) {
  if (!supabase) return {};
  const { data, error } = await supabase.from('eom_count_notifications')
    .select('loc,uncounted_items,created_at').eq('period', period).order('created_at', { ascending: false });
  if (error) { console.warn('[eom_count_notifications] load error:', error.message); return {}; }
  const m = {};
  for (const r of (data || [])) { const k = String(r.loc); if (!(k in m)) m[k] = (r.uncounted_items && r.uncounted_items.totalValue) || 0; }
  return m;
}

// Combines eom_count_status's done booleans with eom_count_progress_log's per-class pct into
// eom-digest.js's classStatuses shape. Neither source alone carries both "is it done" AND "how
// far along if not" — status has the fire-once-accurate done flag, the log has the finer pct.
// A class absent from BOTH sources reads 'not_applicable' (nothing pulled for it, not "zero
// counted") — never fabricated as not_started.
export function classStatusesFromStatusAndLog(status, log) {
  const out = {};
  for (const k of DIGEST_CLASS_ORDER) {
    const hasStatus = status && (`${k}_done` in status);
    const hasLog = log && (`${k}_pct` in log) && log[`${k}_pct`] != null;
    if (!hasStatus && !hasLog) { out[k] = { status: 'not_applicable', pct: null }; continue; }
    const done = hasStatus ? !!status[`${k}_done`] : false;
    const pct = hasLog ? log[`${k}_pct`] : null;
    out[k] = { status: done ? 'complete' : ((pct || 0) > 0 ? 'in_progress' : 'not_started'), pct };
  }
  return out;
}

// Assembles buildEomDigest()'s per-store input shape (src/engine/eom-digest.js) for every store
// in STORE_NSNS that has SOME data for this period — a store with neither an eom_count_status nor
// an eom_count_progress_log row yet this period is skipped (out of scope, not a fabricated
// all-zero row).
export async function buildStoreRows(period, asOf = new Date()) {
  await bootstrapLiveOrg();
  const [statusByLoc, logByLoc, uncountedByLoc] = await Promise.all([
    loadEomCountStatusByLoc(period), loadLatestProgressLogByLoc(period), loadLatestUncountedValueByLoc(period),
  ]);

  const rows = [];
  for (const nsn of STORE_NSNS) {
    const loc = String(nsn).padStart(7, '0');
    const u = unpadLoc(loc);
    const status = statusByLoc[loc] || statusByLoc[u] || null;
    const log = logByLoc[loc] || logByLoc[u] || null;
    if (!status && !log) continue;

    const classStatuses = classStatusesFromStatusAndLog(status, log);

    // FOB, freshness-gated the same way #213 gates it — food_done_at/condiment_done_at (already
    // persisted on eom_count_status) stand in for "count completed at" here rather than
    // re-scanning raw qsr_onhand rows a second time (see this file's header note).
    let fob = null, fobTarget = null;
    const doneAts = [status?.food_done_at, status?.condiment_done_at].filter(Boolean).map(d => new Date(d)).filter(d => !isNaN(d));
    const completedAt = doneAts.length ? new Date(Math.max(...doneAts.map(d => d.getTime()))) : null;
    if (completedAt) {
      const fobResult = await fetchFobSnapshotForStore(loc, period);
      if (fobResult && isFobFresh(fobResult.updatedAt, completedAt)) {
        fob = fobResult.snap;
        const t = await resolveFobTargets(loc, period);
        fobTarget = buildFobTargetReport(loc, period, fob, t);
      }
    }

    rows.push({
      loc, name: STORE_NAMES[u] || loc, org: getStoreOrg(u), patch: supervisorOf(u),
      classStatuses, uncountedValue: uncountedByLoc[loc] || uncountedByLoc[u] || 0,
      fob, fobTarget,
    });
  }
  return rows;
}

async function main() {
  if (!FORCE && !inCountWindow()) {
    console.log('[eom-digest-send] skipping — outside the active EOM count window. DIGEST_FORCE=1 to override.');
    return;
  }
  const dateStr = businessDate();
  const period = periodFor(dateStr);
  console.log(`[eom-digest-send] period ${period} · date ${dateStr} · levels [${levelsToRun().join(',')}]`);

  const gotLiveOrg = await bootstrapLiveOrg();
  if (DEBUG) console.log('[eom-digest-send] live org bootstrap:', gotLiveOrg ? 'OK' : 'fell back to seed');

  const rows = await buildStoreRows(period, new Date());
  console.log(`[eom-digest-send] ${rows.length}/${STORE_NSNS.length} stores have data for ${period}`);
  if (!rows.length) { console.log('[eom-digest-send] nothing to send'); return; }

  let sent = 0, failed = 0;
  for (const level of levelsToRun()) {
    const digest = buildEomDigest(rows, { level, period, asOf: new Date() });
    for (const group of digest.groups) {
      const ok = await sendDigestEmail(group, level);
      if (ok) sent++; else failed++;
      console.log(`[eom-digest-send] ${level}/${group.key}: ${ok ? '✓ sent' : '✗ FAILED'} — ${group.headline}`);
    }
  }
  console.log(`[eom-digest-send] ✓ ${sent} sent, ${failed} failed`);
  if (failed && !sent) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error('[eom-digest-send] fatal:', err); process.exit(1); });
}
