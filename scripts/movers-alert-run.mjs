// ── Movers Alerts runner (task #91) ─────────────────────────────────────────────────────────────
// Fires GENERAL app_notifications rows (supabase/schema-app-notifications.sql) when a store's
// daily sales-vs-LY% trips the measured thresholds in src/engine/movers-alert.js — see that
// file's own header and memory/plan-movers-alerts-2026-11-07.md for the full measurement and the
// owner's live decisions (GM/AS/DO only, on-occurrence, push with store+severity+top-cause).
//
// Triggered ON OCCURRENCE — .github/workflows/movers-alert-run.yml fires via workflow_run right
// after "QSRSoft Daily Activity Pull" completes, not on its own independent schedule, so a bad
// day is flagged as soon as that day's real DAR data lands rather than waiting for a digest.
//
// Reads qsr_daily_activity_rollup directly (service-role), computing salesVsLYPct with the SAME
// guard logic lib/supabase.js's own `_yoyPct` + at-a-glance.js's `moversStrip` use (±75%/+300%
// sanity band, LY sales >= $1,000, |pct| <= 200%) — duplicated here deliberately, matching this
// repo's own established precedent for this exact piece of math (lib/supabase.js's `_yoyPct`
// comment: "Reused verbatim from forecast.js's getDOWTrend fix" — each consumer keeps its own
// tiny copy rather than a shared import across the lib/engine/scripts boundary for two constants).
//
// Dedupe: one event per (loc, date) ever — checked via app_notifications' own
// (type, resolve_key) index before inserting, never by re-running the whole history (a store
// already alerted for 2026-11-05 doesn't get a second row for the same day on a later run that
// still sees that day in its lookback window).
import { safeCreateClient } from './lib/safe-supabase-client.mjs';
import { deliverAppNotification } from './lib/app-notification-delivery.mjs';
import { buildAppNotification } from '../src/engine/app-notifications.js';
import { evaluateMoversAlert, buildMoversAlertContent, MOVERS_TARGET_ROLES } from '../src/engine/movers-alert.js';
import { STORE_NAMES } from '../src/constants.js';

const supabase = safeCreateClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const LOOKBACK_DAYS = Number(process.env.MOVERS_ALERT_LOOKBACK_DAYS || 10); // >= warnMinRun(3) + margin for a short/missing-day gap
const YOY_MAX = 3.0, YOY_MIN = -0.75; // see header — duplicated by this repo's own established precedent, not an oversight

function yoyPct(cur, ly) {
  if (!(cur > 0) || !(ly > 0)) return null;
  const g = (cur - ly) / ly;
  return (g > YOY_MAX || g < YOY_MIN) ? null : g * 100;
}

function unpadLoc(loc) { const n = parseInt(loc, 10); return Number.isNaN(n) ? String(loc) : String(n); }
function storeName(loc) { return STORE_NAMES[unpadLoc(loc)] || loc; }

export async function fetchRecentRollup(days) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('qsr_daily_activity_rollup')
    .select('loc,dt,product_sales,ly_product_sales,transactions,ly_transactions')
    .gte('dt', cutoffStr)
    .order('loc').order('dt');
  if (error) { console.warn('[movers-alert-run] rollup read error:', error.message); return []; }
  return data || [];
}

/** Pure — groups raw rollup rows into one guard-filtered {date,pct,guestPct} series per loc. */
export function buildSeriesByLoc(rows) {
  const byLoc = {};
  for (const r of rows || []) {
    const pct = yoyPct(r.product_sales, r.ly_product_sales);
    if (pct == null) continue;
    if ((r.ly_product_sales || 0) < 1000) continue;
    if (Math.abs(pct) > 200) continue;
    const guestPct = yoyPct(r.transactions, r.ly_transactions);
    (byLoc[r.loc] ||= []).push({ date: r.dt, pct, guestPct });
  }
  return byLoc;
}

async function alreadyFired(loc, date) {
  const resolveKey = `movers_down:${loc}:${date}`;
  const { data, error } = await supabase.from('app_notifications').select('id').eq('type', 'movers_down').eq('resolve_key', resolveKey).limit(1);
  if (error) { console.warn('[movers-alert-run] dedupe check error:', error.message); return true; } // fail closed — never double-fire on a read error
  return (data || []).length > 0;
}

async function main() {
  if (!supabase) { console.warn('[movers-alert-run] no Supabase client — missing env vars'); return; }
  const rows = await fetchRecentRollup(LOOKBACK_DAYS);
  const byLoc = buildSeriesByLoc(rows);
  let fired = 0;
  for (const [loc, series] of Object.entries(byLoc)) {
    const alert = evaluateMoversAlert(series);
    if (!alert) continue;
    if (await alreadyFired(loc, alert.date)) continue;

    const { title, body, causeKind } = buildMoversAlertContent({ storeName: storeName(loc), alert });
    const row = {
      ...buildAppNotification({
        type: 'movers_down', loc, severity: alert.severity, title, detail: body,
        link: 'analytics', resolveKey: `movers_down:${loc}:${alert.date}`,
        payload: { swingPct: alert.swingPct, consecutiveDays: alert.consecutiveDays, rule: alert.rule, causeKind, date: alert.date },
        notifyPush: true, notifyEmail: false,
      }),
      target_roles: MOVERS_TARGET_ROLES,
    };
    const { error } = await supabase.from('app_notifications').insert([row]);
    if (error) { console.warn(`[movers-alert-run] insert error for ${loc}:`, error.message); continue; }
    await deliverAppNotification(row, { supabase });
    fired++;
    console.log(`[movers-alert-run] ${loc} (${storeName(loc)}): ${alert.severity.toUpperCase()} ${alert.swingPct.toFixed(1)}% — ${title}`);
  }
  console.log(`[movers-alert-run] done — ${fired} alert(s) fired across ${Object.keys(byLoc).length} store(s) with qualifying data`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error('[movers-alert-run] fatal:', e); process.exitCode = 1; });
}
