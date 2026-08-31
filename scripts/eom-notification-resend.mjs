#!/usr/bin/env node
// scripts/eom-notification-resend.mjs — dispatch #228: on-demand "regenerate with fresh data and
// resend" for the per-store EOM count-completion notification (email + SMS + push, dispatch
// #209/#211/#216) — NOT the EOM Digest roll-up (that already has its own on-demand resend via
// scripts/eom-digest-send.mjs / trigger-dar-sync's `digest` workflow entry).
//
// Owner request, verbatim (2026-08-30): "Can we also make it so i can regenerate the email with
// fresh data that we are sending per location for the count completion?" A GM can correct a
// count, or the pull can land more data, AFTER the original notification fired — this re-derives
// the row from CURRENT data and sends it again, not a "forward this old email" action.
//
// Reuses every piece qsrsoft-onhand-pull.mjs already exports rather than reimplementing any of
// it: toEngineRows, foodCondimentCountCompletedAt, isFobFresh, fetchFobSnapshotForStore,
// resolveFobTargets, buildFobTargetReport, buildNotificationRow, notifyRow. See
// memory/dispatch-228-resend-count-notification.md for the full spec this implements.
//
// "Current data" here means the CLOUD data already pulled into qsr_onhand for this loc+period —
// the same table scripts/eom-digest-send.mjs's own loadOnHandByLoc() reads (that script's own
// header note: "this script pulls NOTHING from QSRSoft itself"), scoped to one store here rather
// than every store. This resend button does NOT trigger a live QSRSoft pull itself — the
// scheduled/on-demand On-Hand pull (qsrsoft-onhand-pull.yml, every 30 min during the count
// window) is what keeps qsr_onhand fresh; this script's job is to re-derive the notification row
// from whatever qsr_onhand currently holds, which is exactly what "regenerate" means when a GM's
// correction has already landed via the normal pull cadence.
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY (email/SMS),
//   VITE_VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY (push) — same as qsrsoft-onhand-pull.yml's own
//   notification-send env block. No QSRSoft/Playwright credentials needed (no live pull here).
// CLI/env args:
//   RESEND_LOC=<loc>        (or first positional arg)  — required, padded or unpadded NSN
//   RESEND_PERIOD=YYYY-MM   (or second positional arg)  — default: current month
//   RESEND_DATE=YYYY-MM-DD  — override the business date used for On-Hand tool-link URLs
//                             (default: today UTC)
//   QSRSOFT_DEBUG=1

import { safeCreateClient } from './lib/safe-supabase-client.mjs';
import { computeCountProgress, diagnoseIncompleteCount, detectCountNotifications } from '../src/engine/eom-inventory.js';
import {
  toEngineRows, buildNotificationRow, notifyRow,
  foodCondimentCountCompletedAt, isFobFresh,
  fetchFobSnapshotForStore, resolveFobTargets, buildFobTargetReport,
} from './qsrsoft-onhand-pull.mjs';

const DEBUG = process.env.QSRSOFT_DEBUG === '1';

// safeCreateClient — matches every sibling script's own module-scope pattern (never throws on a
// missing/leaked env var; see that helper's own header for the real CI incident this fixes).
const supabase = safeCreateClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const pad2 = n => String(n).padStart(2, '0');
const fmtDate = d => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
function businessDate() { return process.env.RESEND_DATE || fmtDate(new Date()); }
function periodFor(dateStr) { return process.env.RESEND_PERIOD || dateStr.slice(0, 7); }
export function padLoc(loc) { return String(loc).padStart(7, '0'); }

// Loads THIS store's current qsr_onhand rows for the period — same table/columns/toEngineRows
// mapping as eom-digest-send.mjs's own loadOnHandByLoc(), scoped to a single loc (a single-store
// resend has no reason to pull the whole table's worth of stores).
export async function loadOnHandRowsForStore(loc, period) {
  if (!supabase) return [];
  const { data, error } = await supabase.from('qsr_onhand').select('*')
    .eq('period', period).eq('loc', padLoc(loc));
  if (error) { console.warn('[eom-notification-resend] qsr_onhand load error:', error.message); return []; }
  return toEngineRows(data || []);
}

// ── The pure row-building core ──────────────────────────────────────────────────────────────
// Exported and Supabase-free (onHandRows/fobSnapshot/fobTargetReport are passed in as data, not
// fetched here) so a test can exercise it against a synthetic on-hand fixture — this dispatch's
// own verification bar — mirroring buildNotificationRow()'s own purity one level up.
//
// Trigger-classes scope (this dispatch's own explicit judgment call, spelled out in its doc
// rather than silently decided): a manual resend shows a FULL current-state snapshot across all
// four classes, not scoped to whichever single class most recently completed the way an
// automated fire is. detectCountNotifications({}, progress) — empty prevStatus, since the
// fire-once logic is irrelevant to a manual trigger — still supplies classStatuses (built once,
// off the real per-class math in eom-inventory.js's own classNotifyStatus()/NOTIFY_CLASS_KEYS;
// never hand-rolled a second time here) and confirms at least one class currently reads complete
// (Food+Condiment both done, or Paper done) — if NOTHING currently qualifies, there is nothing
// coherent to regenerate, and this returns null rather than fabricating a snapshot. When it does
// qualify, triggerClasses widens to every class classStatuses names (not just the ones that
// "fired"), which is what makes uncounted_items/kb_links/fob_tool_links cover the full current
// picture instead of staying scoped to the original trigger. trigger_kind is tagged
// 'manual_resend' (distinct from the automated 'food_condiment'/'paper'/'food_condiment+paper'
// kinds) so a later reader of eom_count_notifications history can tell a manual resend apart from
// an automatic fire, per the dispatch's own explicit requirement.
export function buildResendRow(loc, period, onHandRows, { fobSnapshot = null, fobTargetReport = null, dateStr, asOf = new Date() } = {}) {
  const progress = computeCountProgress(onHandRows, { period, asOf });
  const detection = detectCountNotifications({}, progress, { asOf });
  if (!detection) return null; // nothing currently reads complete for this store/period
  const diag = diagnoseIncompleteCount(onHandRows, { period, minValue: 0, asOf });
  const resendDetection = {
    ...detection,
    triggerClasses: Object.keys(detection.classStatuses),
    triggerKinds: ['manual_resend'],
    reasons: ['manual_resend'],
  };
  return buildNotificationRow(loc, period, resendDetection, diag, fobSnapshot, dateStr, fobTargetReport);
}

// ── Full orchestration for one store ────────────────────────────────────────────────────────
// Loads current qsr_onhand + qsr_fob data from Supabase, builds the row, logs it to
// eom_count_notifications (same table/insert shape the automated path uses — trigger_kind
// distinguishes a manual resend in the history), and sends it (notifyRow — all three channels,
// verbatim, same as the automated path).
export async function resendNotificationForStore(loc, period, { dateStr = businessDate(), asOf = new Date() } = {}) {
  const padded = padLoc(loc);
  const onHandRows = await loadOnHandRowsForStore(padded, period);
  if (!onHandRows.length) {
    console.log(`[eom-notification-resend] no qsr_onhand rows for ${padded}/${period} — nothing to resend`);
    return null;
  }

  // FOB freshness gate — same sequence/logic qsrsoft-onhand-pull.mjs's main() uses for the
  // automated path (foodCondimentCountCompletedAt → fetchFobSnapshotForStore → isFobFresh →
  // resolveFobTargets → buildFobTargetReport), reused verbatim rather than re-derived.
  let fobSnapshot = null, fobTargetReport = null;
  const completedAt = foodCondimentCountCompletedAt(onHandRows);
  if (completedAt) {
    const fobResult = await fetchFobSnapshotForStore(padded, period);
    if (fobResult && isFobFresh(fobResult.updatedAt, completedAt)) {
      fobSnapshot = fobResult.snap;
      const t = await resolveFobTargets(padded, period);
      fobTargetReport = buildFobTargetReport(padded, period, fobSnapshot, t);
    } else if (DEBUG) {
      console.log(`[eom-notification-resend] ${padded}: FOB snapshot present=${!!fobResult} but stale/absent — omitting fob_snapshot`);
    }
  }

  const row = buildResendRow(padded, period, onHandRows, { fobSnapshot, fobTargetReport, dateStr, asOf });
  if (!row) {
    console.log(`[eom-notification-resend] no class currently reads complete for ${padded}/${period} — nothing to resend`);
    return null;
  }

  // Log to the same history table the automated path writes (supabase/schema-eom-count-
  // notifications.sql) — a plain insert, not upsert, matching that table's own "one row per
  // fired EVENT" semantics; trigger_kind:'manual_resend' is what marks this one apart.
  if (supabase) {
    const { error } = await supabase.from('eom_count_notifications').insert(row);
    if (error) console.warn('[eom_count_notifications] insert error:', error.message);
    else console.log(`[eom-notification-resend] logged manual resend for ${padded}/${period}`);
  }

  await notifyRow(row);
  console.log(`[eom-notification-resend] ✓ resent count-completion notification for ${padded}/${period} (${row.trigger_kind})`);
  return row;
}

async function main() {
  const loc = process.env.RESEND_LOC || process.argv[2];
  if (!loc) {
    console.error('[eom-notification-resend] usage: RESEND_LOC=<loc> [RESEND_PERIOD=YYYY-MM] node scripts/eom-notification-resend.mjs  (or positional: node scripts/eom-notification-resend.mjs <loc> [period])');
    process.exit(1);
    return;
  }
  const dateStr = businessDate();
  const period = process.env.RESEND_PERIOD || process.argv[3] || periodFor(dateStr);
  console.log(`[eom-notification-resend] loc=${padLoc(loc)} · period ${period} · date ${dateStr}`);
  const row = await resendNotificationForStore(loc, period, { dateStr });
  if (!row) process.exit(1);
}

// CLI-run guard — matches every other script in this repo (qsrsoft-onhand-pull.mjs,
// eom-digest-send.mjs, etc.): lets test files import the exports above without also firing a
// live run on import.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error('[eom-notification-resend] fatal:', err); process.exit(1); });
}
