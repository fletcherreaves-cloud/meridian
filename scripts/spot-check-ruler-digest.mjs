#!/usr/bin/env node
// scripts/spot-check-ruler-digest.mjs — the weekly "needs a deep dive" digest (task #129,
// owner request 2026-11-09).
//
// SAME per-store computation as the on-demand Spot-Check Ruler (src/engine/spot-check-ruler.js's
// buildSpotCheckRuler()) — this is NOT a second engine. It runs that computation across every
// store for the prior period, ranks by rankStoresByGap() (a hard impossibility first, then a
// flagged counterfactual gap, then raw swing size), and emails the ranked list so the owner can
// "deep dive and send out communication to locations" without building the worksheet by hand for
// 27 stores.
//
// CONFIGURABLE SCHEDULE, SAGE's own pattern (scripts/sage-run.mjs / .github/workflows/sage-run.yml):
// this workflow runs HOURLY, and this script self-gates on whether the current UTC hour AND
// day-of-week match a small stored config (org_config key 'spot_check_ruler_config' — day-of-
// week + hour + enabled + topN, edited in-app via SpotCheckRulerDigestSettings,
// src/views/spot-check-ruler-view.js / src/lib/supabase.js's loadSpotCheckRulerConfig/
// saveSpotCheckRulerConfig). NOT a hardcoded cron for the actual fire time — changing "Monday"
// to "Tuesday" is a Settings click, never a new PR, matching exactly how eom-digest-send.mjs's
// own sendHourUtc gate already works (just with a day-of-week added, since this digest is
// weekly, not daily-within-a-window).
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY.
// Optional:
//   RULER_DIGEST_FORCE=1   — send now regardless of the configured day/hour (on-demand trigger)
//   RULER_DIGEST_TOP=N     — override how many stores to include in the ranked list (default:
//                            the configured topN's sibling setting — see RULER_TOP_STORES below,
//                            distinct from the counterfactual's own topN movers-per-store)
//   RULER_DIGEST_PERIOD=YYYY-MM — override the period (default: the PRIOR month, since this is a
//                            look-back digest — "identify the locations needing a deep dive... for
//                            the previous week (period at EOM)")
//   QSRSOFT_DEBUG=1

import { safeCreateClient } from './lib/safe-supabase-client.mjs';
import {
  STORE_NSNS, STORE_NAMES, unpadLoc, setLiveSupervisorGroups, setLiveOperators, setLiveAssignments, seedAssignmentsFromGroups,
} from '../src/constants.js';
import { fetchFobSnapshotForStore, resolveFobTargets, buildFobTargetReport } from './qsrsoft-onhand-pull.mjs';
import { sessionsFromLog } from '../src/engine/count-cycle.js';
import { buildSpotCheckRuler, rankStoresByGap } from '../src/engine/spot-check-ruler.js';
import { postResend } from './lib/resend-notify.mjs';
import { recipientsFor } from './lib/eom-digest-notify.mjs';

const DEBUG = process.env.QSRSOFT_DEBUG === '1';
const FORCE = process.env.RULER_DIGEST_FORCE === '1';
const TOP_OVERRIDE = Number.parseInt(process.env.RULER_DIGEST_TOP || '', 10);
const RULER_TOP_STORES = Number.isInteger(TOP_OVERRIDE) && TOP_OVERRIDE > 0 ? TOP_OVERRIDE : 8; // how many ranked stores the email body lists in full

const DEFAULT_SPOT_CHECK_RULER_CONFIG = { enabled: true, dowUtc: 1, hourUtc: 12, topN: 3 }; // Monday 12:00 UTC

const supabase = safeCreateClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ── Live org-chart bootstrap — same pattern eom-digest-send.mjs's bootstrapLiveOrg() uses, only
// needed here for storeName/sort-order purposes, not for routing (recipientsFor() below handles
// its own recipient resolution independently). ────────────────────────────────────────────────
async function bootstrapLiveOrg() {
  if (!supabase) return false;
  const { data, error } = await supabase.from('org_config').select('data').eq('key', 'app_settings').maybeSingle();
  if (error || !data?.data) return false;
  const remote = data.data;
  setLiveSupervisorGroups(remote.supervisorGroups);
  const a = (remote.orgAssignments && remote.orgAssignments.length) ? remote.orgAssignments : seedAssignmentsFromGroups(remote.supervisorGroups);
  setLiveAssignments(a);
  setLiveOperators(remote.operators);
  return true;
}

// ── Schedule config — mirrors eom-digest-send.mjs's loadDigestConfig()/hourGatePasses() exactly,
// with a day-of-week added (this digest is weekly, not daily-within-a-window). Same org_config
// read pattern/key shape as src/lib/supabase.js's loadSpotCheckRulerConfig() (the browser-side
// reader for the in-app settings control) — a fresh install with no saved row behaves identically
// whether read from the browser or from this script. ───────────────────────────────────────────
export async function loadDigestConfig() {
  if (!supabase) return DEFAULT_SPOT_CHECK_RULER_CONFIG;
  const { data, error } = await supabase.from('org_config').select('data').eq('key', 'spot_check_ruler_config').maybeSingle();
  if (error) { console.warn('[spot-check-ruler-digest] org_config load error:', error.message); return DEFAULT_SPOT_CHECK_RULER_CONFIG; }
  if (!data?.data) return DEFAULT_SPOT_CHECK_RULER_CONFIG;
  const d = data.data;
  return {
    enabled: d.enabled !== false,
    dowUtc: Number.isInteger(d.dowUtc) ? d.dowUtc : DEFAULT_SPOT_CHECK_RULER_CONFIG.dowUtc,
    hourUtc: Number.isInteger(d.hourUtc) ? d.hourUtc : DEFAULT_SPOT_CHECK_RULER_CONFIG.hourUtc,
    topN: Number.isInteger(d.topN) && d.topN > 0 ? d.topN : DEFAULT_SPOT_CHECK_RULER_CONFIG.topN,
  };
}

// Pure (no env reads) so a test can pin now/force explicitly — same shape as
// eom-digest-send.mjs's own hourGatePasses().
export function scheduleGatePasses(config, now = new Date(), force = false) {
  if (force) return true;
  if (!config.enabled) return false;
  return now.getUTCDay() === config.dowUtc && now.getUTCHours() === config.hourUtc;
}

const pad2 = n => String(n).padStart(2, '0');
function priorPeriod(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return process.env.RULER_DIGEST_PERIOD || `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

// ── Per-store data loads ──────────────────────────────────────────────────────────────────────
async function loadVarianceStatByLoc(period) {
  if (!supabase) return {};
  const { data, error } = await supabase.from('qsr_variance_stat').select('*').eq('period', period);
  if (error) { console.warn('[qsr_variance_stat] load error:', error.message); return {}; }
  const m = {};
  for (const r of (data || [])) {
    const loc = String(parseInt(r.loc, 10));
    (m[loc] || (m[loc] = [])).push({
      loc, period: r.period, wrin: r.wrin, cls: r.cls, descr: r.descr,
      variance: r.variance, dolDiff: r.dol_diff,
    });
  }
  return m;
}

async function loadSessionLogRows(periods) {
  if (!supabase) return [];
  const { data, error } = await supabase.from('inv_count_sessions').select('*').in('period', periods);
  if (error) { console.warn('[inv_count_sessions] load error:', error.message); return []; }
  return (data || []).map(r => ({
    loc: String(parseInt(r.loc, 10)), countDate: r.count_date, cls: r.cls, period: r.period,
    itemsCounted: r.items_counted, classTotal: r.class_total, covered: r.covered,
  }));
}

// Builds one store's Ruler for `period`, or null when there's nothing to spot-check yet (no
// qualifying weekly/EOM session on record this period — nothing to deep-dive against).
export async function buildStoreRuler(loc, period, { varianceByLoc, sessionLogRows, topN } = {}) {
  const u = unpadLoc(loc);
  const { sessions } = sessionsFromLog(sessionLogRows.filter(r => String(parseInt(r.loc, 10)) === String(parseInt(loc, 10))));
  const storeSessions = sessions[u] || sessions[String(parseInt(loc, 10))] || [];
  // Code-review finding (2026-11-09): must be scoped to THIS period's own month, not just "the
  // latest qualifying session across every loaded period" — sessionLogRows also carries the
  // prior month (for recount-detection's across-session lookback), and fetchFobSnapshotForStore/
  // resolveFobTargets below are both strictly windowed to `period`. Picking a prior-month session
  // here would pair that session's countDate/variance story with THIS period's FOB figure (or
  // report "no FOB data" for a store that actually has it, just filed under the wrong month).
  const lastQualifying = [...storeSessions].reverse().find(s => (s.satisfiesWeekly || s.isEom) && s.date.slice(0, 7) === period);
  if (!lastQualifying) return null;

  const fobResult = await fetchFobSnapshotForStore(loc, period);
  const fobSnap = fobResult?.snap || null;
  const targets = await resolveFobTargets(loc, period);
  const varianceRows = varianceByLoc[String(parseInt(loc, 10))] || [];

  return buildSpotCheckRuler({
    loc, storeName: STORE_NAMES[u] || loc, period, periodType: lastQualifying.isEom ? 'eom' : 'weekly',
    countDate: lastQualifying.date, fobSnap, targets, varianceRows, sessionLogRows, topN,
  });
}

// ── Email body ────────────────────────────────────────────────────────────────────────────────

export function buildDigestEmailHtml(ranked, period) {
  const rows = ranked.slice(0, RULER_TOP_STORES).map((r, i) => {
    const cf = r.counterfactual || {};
    const flagWord = r.impossibilities.length ? '🚫 impossible value' : (cf.flagged ? '⚠ flagged' : '—');
    return `<tr><td style="padding:4px 10px 4px 0;border-bottom:1px solid #eee">${i + 1}</td>` +
      `<td style="padding:4px 10px 4px 0;border-bottom:1px solid #eee">${r.storeName || r.loc}</td>` +
      `<td style="padding:4px 10px 4px 0;border-bottom:1px solid #eee">${r.periodType === 'eom' ? 'EOM' : 'Weekly'} · ${r.countDate || ''}</td>` +
      `<td style="padding:4px 10px 4px 0;border-bottom:1px solid #eee">${cf.swingPts != null ? `${cf.swingPts > 0 ? '+' : ''}${cf.swingPts.toFixed(2)}pp` : '—'}</td>` +
      `<td style="padding:4px 10px 4px 0;border-bottom:1px solid #eee">${flagWord}</td>` +
      `<td style="padding:4px 0;border-bottom:1px solid #eee">${(r.counterfactual.topMovers || []).map(v => v.descr).join(', ') || '—'}</td></tr>`;
  }).join('');
  const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:680px">
<h2 style="margin:0 0 4px">Spot-Check Ruler — Weekly Deep-Dive List</h2>
<p style="margin:0 0 14px;color:#555">Period ${period} · ranked by counterfactual FOB gap (a hard impossible value first, then a flagged target-masking/material swing, then raw swing size). ${ranked.length} store${ranked.length === 1 ? '' : 's'} have a qualifying count session to spot-check this period.</p>
<table style="border-collapse:collapse;width:100%;font-size:12.5px">
<thead><tr style="text-align:left;border-bottom:2px solid #ccc"><th style="padding:4px 10px 4px 0">#</th><th style="padding:4px 10px 4px 0">Store</th><th style="padding:4px 10px 4px 0">Count</th><th style="padding:4px 10px 4px 0">Swing</th><th style="padding:4px 10px 4px 0">Flag</th><th style="padding:4px 0">Top movers</th></tr></thead>
<tbody>${rows}</tbody>
</table>
<p style="margin:14px 0 0;font-size:11.5px;color:#888">Open each store's full worksheet (the 5-question Ruler + counterfactual box) in Meridian's Count Cycle tab for the real FOB/On-Hand/Variance report links and to log the conversation.</p>
</div>`;
  return { subject: `Meridian — Spot-Check Ruler deep-dive list (${period})`, html };
}

async function main() {
  const config = await loadDigestConfig();
  const now = new Date();
  if (!scheduleGatePasses(config, now, FORCE)) {
    console.log(`[spot-check-ruler-digest] skipping — now (UTC day ${now.getUTCDay()}, hour ${now.getUTCHours()}) does not match the configured dowUtc=${config.dowUtc}/hourUtc=${config.hourUtc} (enabled=${config.enabled}). RULER_DIGEST_FORCE=1 to override.`);
    return;
  }
  await bootstrapLiveOrg();
  const period = priorPeriod(now);
  console.log(`[spot-check-ruler-digest] period ${period} · topN ${config.topN}`);

  const priorMonthPeriod = (() => { const [y, m] = period.split('-').map(Number); const d = new Date(Date.UTC(y, m - 2, 1)); return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`; })();
  const [varianceByLoc, sessionLogRows] = await Promise.all([
    loadVarianceStatByLoc(period),
    loadSessionLogRows([period, priorMonthPeriod]),
  ]);

  const rulers = [];
  for (const nsn of STORE_NSNS) {
    const loc = String(nsn).padStart(7, '0');
    try {
      const ruler = await buildStoreRuler(loc, period, { varianceByLoc, sessionLogRows, topN: config.topN });
      if (ruler) rulers.push(ruler);
      else if (DEBUG) console.log(`[spot-check-ruler-digest] ${loc}: no qualifying session on record for ${period} — skipped`);
    } catch (e) {
      console.warn(`[spot-check-ruler-digest] ${loc}: ${e.message}`);
    }
  }
  console.log(`[spot-check-ruler-digest] ${rulers.length}/${STORE_NSNS.length} stores have a qualifying session for ${period}`);
  if (!rulers.length) { console.log('[spot-check-ruler-digest] nothing to send'); return; }

  const ranked = rankStoresByGap(rulers);
  const { subject, html } = buildDigestEmailHtml(ranked, period);
  const recipients = await recipientsFor('district', 'ALL', [], []);
  const results = await Promise.all(recipients.map(to => postResend({ to, subject, html })));
  const ok = results.filter(Boolean).length;
  console.log(`[spot-check-ruler-digest] ✓ ${ok}/${recipients.length} sent — top store: ${ranked[0]?.storeName || ranked[0]?.loc} (${ranked[0]?.counterfactual?.swingPts?.toFixed?.(2) ?? '—'}pp swing)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error('[spot-check-ruler-digest] fatal:', err); process.exit(1); });
}
