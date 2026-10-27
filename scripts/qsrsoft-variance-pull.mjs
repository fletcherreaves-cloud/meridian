#!/usr/bin/env node
// scripts/qsrsoft-variance-pull.mjs — QSRSoft EOM diagnosis data sync
//
// Pulls the food-cost diagnosis inputs from prod.ebos.qsrsoft.com for all 27
// stores and upserts them to Supabase, so the EOM Dashboard + diagnosis engine
// (src/engine/eom-diagnosis.js) are cloud-fresh on every device:
//   • Variance Stat (monthly)  → qsr_variance_stat   (top-5 by $, ±$50, yield band)
//   • Yields                    → merged onto variance rows (yield-band cause)
//   • Waste (raw_waste_promo)   → qsr_waste           (manager/pencil-whip patterns)
//   • Transfers                 → qsr_transfers       (In/Out, unposted)
//   • Raw Item Info (raw_info)  → qsr_raw_item_info   (recipe/BOM + current cost snapshot,
//                                                       top-50 actionable WRINs, dispatch #184)
//
// Parsed with the SAME src/engine/eom-parsers.js mappers the client uses (zero
// drift — the standing rule for cloud streams).
//
// Endpoints (all confirmed 2026-07-26, auth = eBOS x-auth-token):
//   GET /api/inv/{nsn}/stat_variance/monthly/{YYYY-MM-01}
//   GET /api/inv/{nsn}/stat_variance/yields?start_date=&end_date=
//   GET /api/inv/{nsn}/raw_waste_promo?start_date=&end_date=
//   GET /api/inv/{nsn}/transfers?start_date=&end_date=
//   GET /api/inv/{nsn}/raw_detail/{rawItemId}?start_date=&end_date=   (top-50 actionable WRINs)
//   GET /api/inv/{nsn}/raw_info/{rawItemId}?start_date=&end_date=     (same WRIN set, dispatch #184)
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Auth — scripts/lib/ebos-auth.mjs's shared resolveEbosToken() ladder (fresh SSO exchange →
// static QSRSOFT_EBOS_TOKEN fallback, verified against a real probe before being trusted
// (issue #1555/#1554) → Playwright last resort). Used to carry its own duplicated ~115-line
// copy of this ladder -- removed in favor of the shared one (same migration
// qsrsoft-onhand-pull.mjs got under issue #1539); see that lib's header for why an UNVERIFIED
// static token (always present in CI as a persistent GitHub Secret) was silently skipping
// Playwright on every run once SSO started failing.
// Optional:
//   VARIANCE_PERIOD=YYYY-MM  — override the period (default: current month UTC)
//   VARIANCE_STORES=3708,... — subset of NSNs (default: all 27)
//   VARIANCE_FORCE=1         — run even outside the count-window/daily-slot gate (dispatch #210)
//   QSRSOFT_DEBUG=1
//
// Cadence (dispatch #210): once daily year-round (~10:00-12:00 UTC slot), accelerated to
// hourly during the EOM count window (last 3 days of month, 8am-10pm CT) — the SAME gate
// qsrsoft-onhand-pull.mjs uses, reused from scripts/lib/count-window.mjs. See runMode().
//
// Token refresh: v3.myqsrsoft.com → Inventory → Variance Stat → DevTools → Network →
//   any prod.ebos.qsrsoft.com/api/inv/ request → copy X-Auth-Token → update QSRSOFT_EBOS_TOKEN.

import { safeCreateClient } from './lib/safe-supabase-client.mjs';
import { withRetry } from './_retry.mjs';
import { makeOutcomeTracker } from './lib/pull-outcome.mjs';
import { EBOS_BASE, resolveEbosToken } from './lib/ebos-auth.mjs';
import { inCountWindow, inCtBusinessHours } from './lib/count-window.mjs';
import {
  mapVarianceRows, mapYieldGroups, yieldBandFor,
  mapWasteEvents, mapTransferLines, mapRawItemHistory, mapRawItemInfo, mergeRawItemHistory,
} from '../src/engine/eom-parsers.js';
import { tokenizeRows } from '../src/engine/identity-vault.js';

const DEBUG       = process.env.QSRSOFT_DEBUG === '1';
const FORCE       = process.env.VARIANCE_FORCE === '1';

// ── Cadence gate (dispatch #210) ───────────────────────────────────────────────
// Daily year-round PLUS hourly during the EOM count window (last 3 days of month,
// 8am-10pm CT) — the exact same window/business-hours gate qsrsoft-onhand-pull.mjs uses,
// reused (not reimplemented) from scripts/lib/count-window.mjs. The workflow's cron
// fires hourly year-round now (qsrsoft-variance-pull.yml); this gate is the sole
// authority on whether a landed run actually does work outside the count window, so the
// rest-of-month cadence stays once-daily. End extended 6pm->10pm alongside
// qsrsoft-onhand-pull.mjs's identical change (owner, 2026-08-30) — same env var
// (ONHAND_CT_END), same rationale: closing-shift counts land after 6pm and the cron
// already fires that late, this gate was just discarding the run.
const CT_START = Number(process.env.ONHAND_CT_START ?? 8);
const CT_END = Number(process.env.ONHAND_CT_END ?? 22);
// Outside the count window, only fire in a WINDOW around the original once-daily slot
// (10:30 UTC), not an exact-minute match — GitHub's scheduled runs are sparse and
// delayed (see qsrsoft-onhand-pull.mjs's own PROGRESS_SNAPSHOT_WINDOW precedent), so an
// exact-hour check could miss the daily pull entirely on a day no run lands in that
// hour. The now-hourly cron (":15" past the hour, offset from on-hand's :00/:30 to avoid
// clustering both pulls at the same instant) gives multiple chances to land in-window.
const DAILY_SLOT_HOUR = Number(process.env.VARIANCE_DAILY_HOUR ?? 10);
const DAILY_SLOT_WINDOW = Number(process.env.VARIANCE_DAILY_WINDOW ?? 2); // hours
function isDailySlot(now = new Date()) {
  const h = now.getUTCHours();
  return h >= DAILY_SLOT_HOUR && h < DAILY_SLOT_HOUR + DAILY_SLOT_WINDOW;
}
// Should this invocation do a pull at all, and in which mode?
function runMode(now = new Date()) {
  if (FORCE) return 'forced';
  if (inCountWindow(now)) return inCtBusinessHours(now, CT_START, CT_END) ? 'count-window' : null; // hourly, last 3 days, 8a–10p CT only
  return isDailySlot(now) ? 'daily' : null; // once daily the rest of the month
}

const STORE_NSNS = (process.env.VARIANCE_STORES
  ? process.env.VARIANCE_STORES.split(',').map(s => s.trim())
  : [
    3708, 5183, 5985, 6178, 6838, 6972,
    10034, 10422, 10915, 11657, 13113, 18213,
    20475, 24471, 29760, 31357, 32525, 33109,
    33222, 33704, 34222, 35064, 35242, 37566,
    38609, 43380, 43701,
  ]).map(String);

// safeCreateClient (scripts/lib/safe-supabase-client.mjs) — dispatch #210's own test
// (qsrsoft-variance-pull-window.test.js) imports this module directly for runMode()/
// isDailySlot() (no supabase/fetch dependency in those functions themselves), matching the
// pattern qsrsoft-onhand-pull.mjs already uses for the identical reason. Never throws, even on a
// leaked dummy-but-truthy env var from an unrelated test file's stub — see that helper's own
// header for the real CI incident this fixes.
const supabase = safeCreateClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const pad2 = n => String(n).padStart(2, '0');
function currentPeriod() {
  if (process.env.VARIANCE_PERIOD) return process.env.VARIANCE_PERIOD;
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}
// period 'YYYY-MM' → { first: 'YYYY-MM-01', last: 'YYYY-MM-DD' (month end, capped at today) }
function periodRange(period) {
  const [y, m] = period.split('-').map(Number);
  const first = `${period}-01`;
  const monthEnd = new Date(Date.UTC(y, m, 0));
  const today = new Date();
  const end = (today.getUTCFullYear() === y && today.getUTCMonth() + 1 === m && today < monthEnd) ? today : monthEnd;
  const last = `${end.getUTCFullYear()}-${pad2(end.getUTCMonth() + 1)}-${pad2(end.getUTCDate())}`;
  return { first, last };
}

// ── eBOS auth ──────────────────────────────────────────────────────────────────
// resolveEbosToken() (fresh SSO exchange → static QSRSOFT_EBOS_TOKEN fallback, now
// VERIFIED via a real probe before being trusted (issue #1555/#1554) → Playwright last
// resort) now comes from the shared scripts/lib/ebos-auth.mjs. This script used to carry
// its own ~115-line duplicate of the exact same ladder (it was in fact the ORIGINAL copy
// that lib was extracted from, per that file's own header comment) -- removed in favor of
// the one shared copy, same migration qsrsoft-onhand-pull.mjs got under issue #1539.

// ── Fetch one endpoint for one store ──────────────────────────────────────────
async function ebosGet(token, nsn, path) {
  const url = `${EBOS_BASE}/api/inv/${nsn}/${path}`;
  if (DEBUG) console.log('[GET]', url);
  const resp = await fetch(url, {
    headers: {
      'X-Auth-Token': token, 'X-Current-Nsn': String(nsn), 'Accept': 'application/json',
      'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
    },
  });
  if (resp.status === 401 || resp.status === 403) throw new Error(`AUTH_FAILED:${resp.status}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 160)}`);
  const data = await resp.json();
  return Array.isArray(data) ? data : [];
}

// raw_detail returns an OBJECT (not an array) — fetch it as-is.
async function ebosGetObj(token, nsn, path) {
  const url = `${EBOS_BASE}/api/inv/${nsn}/${path}`;
  if (DEBUG) console.log('[GET]', url);
  const resp = await fetch(url, {
    headers: {
      'X-Auth-Token': token, 'X-Current-Nsn': String(nsn), 'Accept': 'application/json',
      'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
    },
  });
  if (resp.status === 401 || resp.status === 403) throw new Error(`AUTH_FAILED:${resp.status}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

// "07/20/2026" or "2026-07-20" → "2026-07-20"
function toISO(v) {
  if (!v) return null;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${pad2(+m[1])}-${pad2(+m[2])}` : null;
}

async function upsert(table, rows, onConflict) {
  if (!rows.length) return 0;
  const CHUNK = 500; let saved = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await withRetry(() => supabase.from(table).upsert(chunk, { onConflict }), { label: `${table} upsert` });
    if (error) console.warn(`[${table}] upsert error:`, error.message);
    else saved += chunk.length;
  }
  return saved;
}

// Which period(s) to pull. Default = current month. VARIANCE_PERIOD=YYYY-MM pins one month.
// VARIANCE_BACKFILL=N backfills the last N months (current + N-1 prior) so the Chronic-Offenders
// and Count-Reliability scans have multi-period history to compare (they need >=2 periods).
function lastNPeriods(n) {
  const d = new Date();
  const out = [];
  for (let i = 0; i < n; i++) {
    const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push(`${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}`);
  }
  return out; // most-recent first
}
function periodsToRun() {
  if (process.env.VARIANCE_PERIOD) return [process.env.VARIANCE_PERIOD];
  const bf = Number(process.env.VARIANCE_BACKFILL || 0);
  if (bf > 1) return lastNPeriods(bf);
  return [currentPeriod()];
}

async function runPeriod(period, token) {
  const { first, last } = periodRange(period);
  const range = `start_date=${first}&end_date=${last}`;
  console.log(`[variance-pull] period ${period} (${first}…${last}) × ${STORE_NSNS.length} stores`);

  let vSaved = 0, wSaved = 0, tSaved = 0, rSaved = 0, iSaved = 0, storesOk = 0, authFailed = false;
  const tracker = makeOutcomeTracker('variance-pull');
  for (const nsn of STORE_NSNS) {
    if (authFailed) break;
    const loc = String(nsn).padStart(7, '0');
    try {
      // Variance + yields (merge yield band onto each variance row for the cause overlay)
      const [rawVar, rawYields] = await Promise.all([
        ebosGet(token, nsn, `stat_variance/monthly/${first}`),
        ebosGet(token, nsn, `stat_variance/yields?${range}`).catch(() => []),
      ]);
      const yieldLookup = mapYieldGroups(rawYields);
      const varRows = mapVarianceRows(rawVar).map(v => {
        const band = yieldBandFor(v.wrin, yieldLookup);
        return { ...v, loc, period, expUsage: v.expectedUsage, actUsage: v.actualUsage, yieldBand: band };
      });
      vSaved += await upsert('qsr_variance_stat', varRows.map(v => ({
        loc, period, wrin: v.wrin, cls: v.cls, descr: v.descr,
        raw_waste: v.rawWaste, comp_waste: v.compWaste, exp_usage: v.expectedUsage,
        act_usage: v.actualUsage, variance: v.unitVar, dol_diff: v.dolDiff,
        yield_val: v.yield, pct_sales: v.pctOfSales, raw_item_id: v.rawItemId,
        // Yield STANDARD band (lo/hi) so the diagnosis can show actual-vs-standard %
        // (CoachQ-style over-portioning fingerprint). Computed above but wasn't persisted.
        yield_lo: v.yieldBand?.lo ?? null, yield_hi: v.yieldBand?.hi ?? null,
      })).filter(r => r.wrin), 'loc,period,wrin');

      // Waste. manager is tokenized before it ever reaches qsr_waste -- dispatch #48's own
      // requirement ("security_findings' subject is emp_token or wrin, never a plaintext
      // identifier") applies at the SOURCE table too, same treatment audit_rows.emp already gets
      // (schema-identity-vault.sql). NOTE: w.manager is an eID string (mapWasteEvents() maps it
      // from r.eID, eom-parsers.js), not a name -- tokenizing it lands in a SEPARATE identity
      // space from audit_rows.emp's name-keyed tokens for the same real person. See
      // schema-identity-vault-qsr-waste.sql's own header for why that gap is not closed this
      // pass (no eID->name mapping exists anywhere in this codebase to close it with).
      // REGRESSION FIX: cab407e (dispatch #48) refactored the two lines below into the
      // tokenized form and dropped this fetch in the process, leaving `rawWaste` undefined --
      // a ReferenceError on every store, every run, silently until the pull's own 25%
      // failure-rate guard caught it. Restored verbatim from that commit's own deletion.
      const rawWaste = await ebosGet(token, nsn, `raw_waste_promo?${range}`).catch(() => []);
      const wasteEvents = mapWasteEvents(rawWaste);
      const wasteTokenMap = await tokenizeRows(supabase, wasteEvents, 'manager');
      const wasteRows = wasteEvents.map((w, i) => ({
        loc, period, event_id: rawWaste[i]?.id ?? null,
        busn_dt: toISO(w.dt), busn_tm: w.tm, wtype: w.type, amount: w.amount,
        manager: w.manager, emp_token: wasteTokenMap.get((w.manager || '').trim()) ?? null,
        wsource: w.source, edited: w.edited, reason: w.reason,
      })).filter(r => r.event_id != null);
      wSaved += await upsert('qsr_waste', wasteRows, 'loc,event_id');

      // Transfers
      const rawXfer = await ebosGet(token, nsn, `transfers?${range}`).catch(() => []);
      const xferRows = mapTransferLines(rawXfer).map(t => ({
        loc, period, transfer_id: t.id, wrin: t.wrin, dir: t.dir,
        counterparty: t.counterpartyNsn, busn_dt: toISO(t.dt), status: t.status,
        line_amt: t.lineAmt, transfer_amt: t.transferTotal, manager: t.manager,
        descr: t.descr, cls: t.cls, units: t.units,
      })).filter(r => r.transfer_id != null && r.wrin);
      tSaved += await upsert('qsr_transfers', xferRows, 'loc,transfer_id,wrin');

      // Raw-item forensic register — only for actionable WRINs (|$| >= 50, has an itemId),
      // top ~50 by |$| to bound request volume (widened from 20, dispatch #179 — measured via
      // real GitHub Actions run history that the full 27-store loop, incl. this fetch, has never
      // exceeded ~5 min against a 60-min workflow timeout, so 2.5x the requests still leaves a
      // large margin). Feeds the Diagnose count-timing drill-down.
      const actionable = varRows
        .filter(v => v.rawItemId != null && Math.abs(v.dolDiff || 0) >= 50)
        .sort((a, b) => Math.abs(b.dolDiff || 0) - Math.abs(a.dolDiff || 0))
        .slice(0, 50);
      // Pre-fetch this store's EXISTING stored history for the WRINs we're about to re-fetch, so
      // the upsert below can MERGE rather than blindly replace (mergeRawItemHistory,
      // eom-parsers.js) — an item that drops out of the top-50 for a few days and re-enters
      // otherwise has its stored history frozen mid-gap by a straight overwrite. One batched
      // query per store, not one per item.
      const existingByWrin = new Map();
      if (actionable.length) {
        const { data: existingRows, error: existingErr } = await withRetry(
          () => supabase.from('qsr_raw_item_detail').select('wrin,history')
            .eq('loc', loc).eq('period', period).in('wrin', actionable.map(v => v.wrin)),
          { label: 'qsr_raw_item_detail existing-history fetch' },
        );
        if (existingErr) console.warn('[qsr_raw_item_detail] existing-history fetch error:', existingErr.message);
        else for (const r of (existingRows || [])) existingByWrin.set(r.wrin, r.history || []);
      }
      const detailRows = [];
      const infoRows = [];
      for (const v of actionable) {
        // raw_detail (forensic history) + raw_info (recipe/BOM + current cost, dispatch #184) —
        // fired CONCURRENTLY per item (not sequential awaits) so this second call keeps the
        // per-store loop's wall time close to raw_detail-alone, not double it (both are
        // independent GETs to the same host; see the PR body for the measured before/after).
        const [detailRes, infoRes] = await Promise.allSettled([
          ebosGetObj(token, nsn, `raw_detail/${v.rawItemId}?${range}`),
          ebosGetObj(token, nsn, `raw_info/${v.rawItemId}?${range}`),
        ]);

        if (detailRes.status === 'fulfilled') {
          const detail = detailRes.value;
          // One-time raw-field dump (DUMP_RAW_FIELDS=1) — reveal any hidden columns (e.g. a Replace/
          // count-type flag) we don't currently map, so we can nail the walkthrough-vs-recount split.
          if (process.env.DUMP_RAW_FIELDS === '1' && !globalThis.__rawDumped && Array.isArray(detail.history) && detail.history.length) {
            globalThis.__rawDumped = true;
            console.log('[RAW-FIELDS] detail top-level keys:', Object.keys(detail).join(', '));
            const invs = detail.history.filter(h => h.source === 'inventory');
            console.log(`[RAW-FIELDS] inventory-event keys:`, Object.keys((invs[0] || detail.history[0]) || {}).join(', '));
            for (const h of invs.slice(0, 5)) console.log('[RAW-FIELDS] inv event:', JSON.stringify(h));
          }
          const m = mapRawItemHistory(detail);
          const mergedHistory = mergeRawItemHistory(existingByWrin.get(v.wrin) || [], m.history);
          detailRows.push({ loc, period, wrin: v.wrin, descr: m.descr || v.descr, item_class: m.itemClass || v.classCode, history: mergedHistory });
        } else {
          const e = detailRes.reason;
          if (String(e.message).startsWith('AUTH_FAILED')) throw e;
          if (DEBUG) console.warn(`    raw_detail ${v.wrin}: ${e.message}`);
        }

        if (infoRes.status === 'fulfilled') {
          const info = infoRes.value;
          const mi = mapRawItemInfo(info);
          infoRows.push({
            loc, wrin: v.wrin, full_wrin: mi.wrin || null, long_desc: mi.descr || v.descr || null,
            invty_category_type: mi.invtyCategoryType, case_qty: mi.caseQty,
            latest_case_price: mi.latestCasePrice, case_price_avg: mi.casePriceAvg,
            primary_vdr_name: mi.primaryVdrName, primary_vdr: mi.primaryVdr,
            mid_range_yield: mi.midRangeYield, recipe_item: mi.recipeItem, current_upt: mi.currentUpt,
            menu_items: mi.menuItems, menu_item_combos: mi.menuItemCombos, upt_hist: mi.uptHist,
          });
        } else {
          const e = infoRes.reason;
          if (String(e.message).startsWith('AUTH_FAILED')) throw e;
          if (DEBUG) console.warn(`    raw_info ${v.wrin}: ${e.message}`);
        }
      }
      rSaved += await upsert('qsr_raw_item_detail', detailRows.filter(r => r.wrin), 'loc,period,wrin');
      iSaved += await upsert('qsr_raw_item_info', infoRows.filter(r => r.wrin), 'loc,wrin');

      storesOk++;
      if (DEBUG) console.log(`  ${nsn}: ${varRows.length} var · ${wasteRows.length} waste · ${xferRows.length} xfer · ${detailRows.length} raw-detail · ${infoRows.length} raw-info`);
    } catch (e) {
      if (e.message.startsWith('AUTH_FAILED')) { authFailed = true; console.error('[variance-pull] auth failed — refresh QSRSOFT_EBOS_TOKEN'); break; }
      console.warn(`  ${nsn}: ${e.message}`);
      tracker.fail(nsn, e.message);
    }
  }

  console.log(`[variance-pull] ✓ ${storesOk}/${STORE_NSNS.length} stores · ${vSaved} variance · ${wSaved} waste · ${tSaved} transfer · ${rSaved} raw-detail · ${iSaved} raw-info rows for ${period}`);
  const code = authFailed ? 0 : tracker.finalize({
    // authFailed already short-circuits main() to exit 1 -- don't also run the
    // zero-rows/threshold check against a period this loop broke out of early.
    requestedUnits: STORE_NSNS, totalSaved: vSaved + wSaved + tSaved + rSaved + iSaved,
    formatRerun: failedStores => `VARIANCE_STORES=${failedStores.join(',')} VARIANCE_PERIOD=${period}`,
  });
  return { authFailed, code };
}

async function main() {
  const mode = runMode();
  if (!mode) {
    console.log(`[variance-pull] skipping — outside count window and not the daily slot (${DAILY_SLOT_HOUR}:00-${DAILY_SLOT_HOUR + DAILY_SLOT_WINDOW}:00 UTC). VARIANCE_FORCE=1 to override.`);
    return;
  }
  console.log(`[variance-pull] mode=${mode}`);
  const periods = periodsToRun();
  if (periods.length > 1) console.log(`[variance-pull] backfill ${periods.length} periods: ${periods.join(', ')}`);
  // Issue #1555/#1554 (2026-10-27, live): resolveEbosToken() used to accept a stale
  // QSRSOFT_EBOS_TOKEN unconditionally -- always present in CI, so once SSO failed the
  // ladder handed back an unverified static token and never tried Playwright at all. The
  // `verify` callback runs ONE real, cheap probe (this run's first period, first store)
  // against each candidate before trusting it.
  const verifyEbosToken = async (t) => {
    try { await ebosGet(t, STORE_NSNS[0], `stat_variance/monthly/${periodRange(periods[0]).first}`); return true; }
    catch (e) { return !String(e.message).startsWith('AUTH_FAILED'); }
  };
  const token = await resolveEbosToken(verifyEbosToken);
  if (!token) { console.error('[variance-pull] ✗ no eBOS token'); process.exit(1); }
  let worstCode = 0;
  for (const period of periods) {
    const { authFailed, code } = await runPeriod(period, token);
    if (authFailed) process.exit(1);
    if (code) worstCode = code;
  }
  if (worstCode) process.exit(worstCode);
}

// Exported for src/__tests__/qsrsoft-variance-pull-window.test.js — a real behavioral test of
// the dispatch #210 gate, not just a source-text regex. Guarded the same way
// qsrsoft-punch-times-pull.mjs already is, so importing this module for its pure functions
// doesn't also fire off a live Playwright/eBOS run.
export { runMode, isDailySlot };
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error('[variance-pull] fatal:', err); process.exit(1); });
}
