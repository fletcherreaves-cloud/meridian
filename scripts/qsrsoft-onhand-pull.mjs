#!/usr/bin/env node
// scripts/qsrsoft-onhand-pull.mjs — QSRSoft On-Hand Inventory sync (EOM count-progress)
//
// Pulls the On-Hand raw-items report from prod.ebos.qsrsoft.com for all 27 stores.
// On-Hand is the count-progress signal: each item's last_counted / last_submitted
// date tells us if/when it was counted. During the last 3 days of the month we pull
// every 30 minutes (dispatch #210, tightened from hourly) so we can see when each store
// finishes its EOM count.
//
// Endpoint (confirmed 2026-07-26):
//   GET /api/inv/{nsn}/on_hand/rawitems?date=YYYY-MM-DD&type={F|C|P|N}&recipe=all
//       &non_zero_on_hand=false&duplicate=false
//   → { on_hand_records: [...], total_on_hand_amt }
//   `type` is the inventory-class filter (F=Food, C=Condiment, P=Paper, N=Non-Product);
//   pulled per class and tagged by the row's own invty_class.
//
// Required env:
//   VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Auth — same eBOS ladder as scripts/qsrsoft-ebos-pull.mjs (prod.ebos host), tried in order:
//   QSRSOFT_EBOS_TOKEN  — pre-captured eBOS X-Auth-Token (fastest)
//   QSRSOFT_TOKEN       — reporting token → exchanged for an eBOS token via SSO (no browser)
//   QSRSOFT_USERNAME + QSRSOFT_PASSWORD — Playwright fallback (captures eBOS token from the session)
// Optional:
//   ONHAND_FORCE=1        — run even outside the last-3-days window
//   ONHAND_PERIOD=YYYY-MM — override the period label (default: current month)
//   ONHAND_DATE=YYYY-MM-DD— override the business date queried (default: today UTC)
//   ONHAND_TYPES=F,C,P,N  — inventory class types to pull (default: F,C,P,N)
//   QSRSOFT_DEBUG=1
//
// Token refresh: v3.myqsrsoft.com → Inventory → On Hand Inventory → DevTools → Network →
//   any prod.ebos.qsrsoft.com/api/inv/ request → copy X-Auth-Token → update QSRSOFT_EBOS_TOKEN secret.

import { chromium } from 'playwright';
import { COVER_FRAC, sessionQualities, sessionLabel } from '../src/engine/count-cycle.js';
import { safeCreateClient } from './lib/safe-supabase-client.mjs';
import { nextMonthStart } from './lib/month-bounds.mjs';
// Reuse the SAME count-progress engine the app uses (pure ESM, zero drift).
import {
  computeCountProgress, diagnoseIncompleteCount, detectCountNotifications, BELIEVES_DONE_PCT,
  FOB_CLASSES, normClass, countedDate, fobSnapshotByStore,
} from '../src/engine/eom-inventory.js';
// dispatch #215 Task 1 — reuse fob-report.js's own comps/overTarget/gapPP/topDriver math
// (never a third hand-rolled version of it) for the notification's target-vs-actual section.
import { buildStoreFobReport } from '../src/engine/fob-report.js';
import { makeOutcomeTracker } from './lib/pull-outcome.mjs';
import { inCountWindow, inCtBusinessHours, centralWeekday } from './lib/count-window.mjs';
// 2026-09-01 (owner req) — weekly-count-day pull. Reuses the SAME "complete weekly count"
// detection cycleCompliance() already grades stores against, plus the Organization Structure
// fallback ("utilize both" -- owner-directed) for stores the derived signal can't yet call.
import { detectWeeklyCountDay, mergeWeeklyCountDay } from '../src/engine/count-cycle.js';
import { loadWeeklyCountDayFallback } from './lib/weekly-count-day.mjs';
import { sendEmailNotification, sendSmsViaCarrierGateway, triggerLabel } from './lib/resend-notify.mjs';
// dispatch #216 — real OS-level device alerts, the third channel alongside email/SMS above.
import { sendWebPush } from './lib/webpush-notify.mjs';
import { STORE_NAMES, DEFAULT_TARGETS, unpadLoc } from '../src/constants.js';

// dispatch #216 — base URL the push notification's click-through deep-links into. Overridable
// (MERIDIAN_APP_URL) for a future non-prod deploy; CLAUDE.md's own Stack table names this as the
// one real production URL, so it's the correct hardcoded default, not a guess.
const APP_URL = process.env.MERIDIAN_APP_URL || 'https://meridianbi.vercel.app';

// ── Count-completion notifications (dispatch #209) ────────────────────────────
// QSRSoft KB grounding — confirmed LIVE against qsrsoft_kb 2026-08-29 (service-role read,
// real title/html_url from the corpus, not guessed): the corpus has exactly one "Best Counting
// Practices" article. Dispatch #213 replaced its URL with the owner's own corrected
// search-results link (verbatim, including the `utf8=✓` query param — not re-encoded) and
// turned BOTH the Physical Inventory and On-Hand Inventory links from static KB articles into
// live, per-store (and for On-Hand, per-date/per-class) links straight into QSRSoft's own
// counting/reporting tool, since that's what the owner actually asked for over a generic article.
const KB_BEST_COUNTING = { title: 'What are the Best Counting Practices Using the Mobile Inventory App', url: 'https://support.qsrsoft.com/hc/en-us/search?utf8=✓&query=Best+counting+practices' };
// dispatch #213 — normClass()'s own single-letter mapping (F=food, C=condiment, P=paper,
// else=nonproduct — src/engine/eom-inventory.js) confirms food→F/condiment→C/paper→P/
// nonproduct→N is the real QSRSoft class-code vocabulary this script already speaks
// (TYPES/ONHAND_TYPES default 'F,C,P,N'), not an assumption.
const CLASS_LETTER = { food: 'F', condiment: 'C', paper: 'P', nonproduct: 'N' };
// NOT a KB article — a live link into QSRSoft's own counting tool, parameterized by this store's
// own NSN (unpadded, matching the owner's own example `location=3708`).
function physicalInventoryLink(nsn) {
  return { title: 'Physical Inventory (this store)', url: `https://v3.myqsrsoft.com/cimt/inventory/inventory?location=${nsn}&tab=itemsToInventory&countFrequency=A&temperatureZone=all&class=all&rangeIndicator=all&duplicatePrefix=false` };
}
// NOT a KB article either — a live link into QSRSoft's On-Hand report, per store/date/class
// (dispatch #213 amendment). One link per triggered class, since the class param changes the URL.
// dispatch #219 Task 3 — a food_condiment trigger fires this twice (once per class), and both
// used to render as the IDENTICAL title ('On-Hand Inventory (this store)'), so the email showed
// what looked like the same link twice with no way to tell them apart. Title now carries the
// resolved class letter, matching fobToolLinks()'s own '(F)'/'(C)' convention (dispatch #214) —
// reuses the SAME CLASS_LETTER lookup already used for the URL's own class= param, never a
// second mapping. Letters (not spelled-out 'Food'/'Condiment') chosen for consistency with #214's
// existing links, which already appear in the very same email section.
function onHandLink(nsn, cls, dateStr) {
  const classLetter = CLASS_LETTER[cls] || 'F';
  return { title: `On-Hand Inventory (${classLetter})`, url: `https://v3.myqsrsoft.com/cimt/inventory/on-hand-inventory?location=${nsn}&class=${classLetter}&recipe=all&nonzero=true&duplicates=false&date=${dateStr}` };
}
export function kbLinksForClasses(classes, nsn, dateStr) {
  const linksByClass = {
    food:       [KB_BEST_COUNTING, physicalInventoryLink(nsn), onHandLink(nsn, 'food', dateStr)],
    condiment:  [KB_BEST_COUNTING, physicalInventoryLink(nsn), onHandLink(nsn, 'condiment', dateStr)],
    paper:      [physicalInventoryLink(nsn), KB_BEST_COUNTING, onHandLink(nsn, 'paper', dateStr)],
    nonproduct: [onHandLink(nsn, 'nonproduct', dateStr), KB_BEST_COUNTING],
  };
  const seen = new Map();
  for (const c of (classes || [])) for (const link of (linksByClass[c] || [])) seen.set(link.url, link);
  return [...seen.values()];
}

// ── FOB investigation tool links (dispatch #214) ────────────────────────────────
// NOT KB articles — live links into QSRSoft's own inventory-investigation tools (Variance
// Stat/Yields, Waste, Transfers, Raw Items, Purchases, Inventory Analysis), owner-supplied
// verbatim (memory/dispatch-214.md). Diagnostically tied to a FOB number, not to "how do I
// count" — a SEPARATE array from kbLinksForClasses()'s "Helpful links" set (untouched by this
// dispatch) and rendered only alongside the FOB section itself (resend-notify.mjs's
// fobSectionHtml()), never mixed into "Helpful links". Two of the six (Variance Stat/Yields,
// Inventory Analysis) take a per-class `class=<letter>` param and get one link PER triggered FOB
// class (Food and/or Condiment — reuses CLASS_LETTER, never redefined here); the other four
// (Waste/Transfers/Raw Items/Purchases) are class-agnostic, exactly as the owner's own example
// URLs show — no invented class/date params where his examples had none.
//
// Class-variant judgment call (the dispatch's own open question, raised explicitly rather than
// silently decided): a food_condiment trigger keeps BOTH class letters for Variance Stat and
// Inventory Analysis (up to 8 links total) rather than capping to "the worse offender". Checked
// whether that cap was cheaply derivable from fobTargetReport/buildFobTargetReport()'s
// comps/topDriver (src/engine/fob-report.js) — it is NOT: that data is keyed by FOB dollar
// COMPONENT (statv/comp/raw/cond/emp/unex — cost categories), not by inventory CLASS
// (Food/Condiment); the two axes don't map onto each other, so "worse class" would be a new,
// unproven computation, not a reuse of existing math. The owner asked for these six tools by
// name — trust him to skim 8 links rather than silently under-deliver on an explicit request.
//
// Returns [] ENTIRELY (not just the per-class links) when triggerClasses has no Food/Condiment
// member — all six tools are FOB-diagnostic and irrelevant to a Paper/Non-Product-only trigger,
// same "show nothing rather than something irrelevant" discipline the freshness gate already
// uses. `nsn` = unpadLoc(loc) (owner's own example used the unpadded `3708`); `period` is this
// run's own `YYYY-MM`; `dateStr` is this run's own businessDate(), both already threaded through
// buildNotificationRow since #213.
export function fobToolLinks(nsn, triggerClasses, period, dateStr) {
  const fobClasses = (triggerClasses || []).filter(c => FOB_CLASSES.includes(c));
  if (!fobClasses.length) return [];
  const start = `${period}-01`;
  const links = [];
  for (const c of fobClasses) {
    const letter = CLASS_LETTER[c] || 'F';
    links.push({ title: `Variance Stat/Yields (${letter})`, url: `https://v3.myqsrsoft.com/cimt/inventory/stat-variance?location=${nsn}&tab=varianceStat&start=${start}&period=M&class=${letter}` });
  }
  links.push({ title: 'Waste (this store)', url: `https://v3.myqsrsoft.com/cimt/inventory/waste?location=${nsn}` });
  links.push({ title: 'Transfers (this store)', url: `https://v3.myqsrsoft.com/cimt/inventory/transfers?location=${nsn}&tab=transfers&start=${start}&end=${dateStr}` });
  links.push({ title: 'Raw Items (this store)', url: `https://v3.myqsrsoft.com/cimt/inventory/raw-item-information?location=${nsn}&start=${start}&end=${dateStr}` });
  links.push({ title: 'Purchases (this store)', url: `https://v3.myqsrsoft.com/cimt/inventory/purchases?location=${nsn}&tab=approvePending` });
  for (const c of fobClasses) {
    const letter = CLASS_LETTER[c] || 'F';
    links.push({ title: `Inventory Analysis (${letter})`, url: `https://v3.myqsrsoft.com/cimt/inventory/inventory-analysis?location=${nsn}&class=${letter}&start=${start}&end=${dateStr}` });
  }
  return links;
}

// dispatch #216 — the third delivery channel: a real push to every subscribed device (no
// per-role routing yet, matching #211/#215's own "everyone gets it for now" scope — this app
// doesn't have per-role notification recipients modeled). `supabase` guarded null-check matches
// this file's own module-scope client (see its definition below main()'s helpers) — a test
// importing notifyRow directly with no VITE_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in the
// environment gets a clean no-op here, same as every other supabase-gated function in this file.
async function sendPushNotifications(row, storeInfo) {
  if (!supabase) return;
  const { data, error } = await supabase.from('push_subscriptions').select('id,endpoint,p256dh,auth_key');
  if (error) { console.warn('[onhand-pull] push_subscriptions read error:', error.message); return; }
  const label = storeInfo.name && storeInfo.name !== storeInfo.loc ? `${storeInfo.name} (${storeInfo.loc})` : String(storeInfo.loc);
  const trig = triggerLabel(row.trigger_kind);
  // Same 'eom-dashboard:<loc>' deep-link shape the in-app bell already uses (App.js's
  // eomInitialStore / onOpenModal('eom-dashboard:<loc>'), dispatch #209) — carried as a real
  // URL (?panel=eom-dashboard&store=<loc>) since a push has to open a URL, not call a JS
  // function. App.js reads this same `store` param on mount (see eomInitialStore's own
  // initializer) so the two paths land on the identical panel state.
  const payload = {
    title: `${label} — ${trig} count complete`,
    body: `EOM count update for ${row.period}. Tap to view the Scoreboard.`,
    url: `${APP_URL}/?panel=eom-dashboard&store=${encodeURIComponent(row.loc)}`,
  };
  for (const sub of (data || [])) {
    await sendWebPush({ id: sub.id, endpoint: sub.endpoint, p256dh: sub.p256dh, authKey: sub.auth_key }, payload);
  }
}

// Dispatch #211 — deliver a single fired notification over BOTH channels (email + SMS-via-
// carrier-gateway). Exported (rather than inlined in the run loop below) so the hook-point
// wiring itself is unit-testable against a mocked resend-notify module, per this repo's own
// "would this verification still pass if the change were reverted" rule — a test that only
// exercises resend-notify.mjs directly could not tell "wired in" from "wired in, then deleted".
// dispatch #216 extended this to a THIRD channel (sendPushNotifications, above) — comment left
// as "BOTH" historically accurate to #211's own scope; see the #216 comment above for the add.
export async function notifyRow(row) {
  const storeInfo = { loc: row.loc, name: STORE_NAMES[unpadLoc(row.loc)] || row.loc };
  await sendEmailNotification(row, storeInfo);
  await sendSmsViaCarrierGateway(row, storeInfo);
  await sendPushNotifications(row, storeInfo);
}

// Every fired notification gets BOTH channels (owner asked for both, not a per-notification
// choice) — no per-row filtering or channel selection here.
export async function deliverNotifications(rows) {
  for (const row of (rows || [])) await notifyRow(row);
}

// Build the eom_count_notifications row for a fired detection. `diag` is this store's
// diagnoseIncompleteCount() output for the period (unscoped) — uncounted items are filtered
// down to the trigger class(es) here (Task 3.1): for a just-completed class that's what's left
// of its own residual ~2% (CLASS_DONE_PCT is 98%, not 100%) worth a final glance before close;
// for a stale-timeout event the "done" class is the trigger, so this is that class's own
// leftover items, not the still-in-progress partner's (which is already fully described by its
// %, in class_statuses).
const UNCOUNTED_ITEMS_CAP = 25;
// `fobSnapshot` (dispatch #213 Task 3) — the store's fobSnapshotByStore() output when the
// freshness check passed, or null/undefined when it didn't (or the trigger doesn't touch
// Food/Condiment at all). `dateStr` (dispatch #213 amendment) — this run's own businessDate(),
// threaded through to the per-class On-Hand link. `fobTargetReport` (dispatch #215 Task 1) —
// buildFobTargetReport()'s output (target/gapPP/overTarget/comps/topDriver), or null/undefined
// when no target resolved OR fobSnapshot itself is absent (target math is meaningless without a
// fresh actual to compare it to). `fob_tool_links` (dispatch #214) — the six investigation-tool
// links, built ONLY alongside a fresh fobSnapshot (the same gate fob_snapshot/fob_target already
// use — never a second freshness check), else null; matches the fob_snapshot/fob_target
// null-when-stale pattern so resend-notify.mjs's "empty or absent" check covers this the same way.
export function buildNotificationRow(loc, period, detection, diag, fobSnapshot, dateStr, fobTargetReport) {
  const scoped = (diag.uncounted || [])
    .filter(u => detection.triggerClasses.includes(u.cls))
    .sort((a, b) => b.valueAtRisk - a.valueAtRisk);
  const items = scoped.slice(0, UNCOUNTED_ITEMS_CAP);
  return {
    loc, period,
    trigger_kind: detection.triggerKinds.join('+'),
    class_statuses: { ...detection.classStatuses, lateBulk: diag.lateBulk, lateBulkDay: diag.lateBulkDay },
    uncounted_items: {
      items,
      totalCount: scoped.length,
      totalValue: scoped.reduce((s, u) => s + u.valueAtRisk, 0),
      truncated: scoped.length > items.length,
    },
    kb_links: kbLinksForClasses(detection.triggerClasses, unpadLoc(loc), dateStr),
    fob_snapshot: fobSnapshot || null,
    fob_target: fobTargetReport || null,
    fob_tool_links: fobSnapshot ? fobToolLinks(unpadLoc(loc), detection.triggerClasses, period, dateStr) : null,
  };
}

const EBOS_BASE   = 'https://prod.ebos.qsrsoft.com';
const EBOS_ORG_ID = 'a546d4ef-684a-4f25-8bc0-6580af068875';
const DEBUG       = process.env.QSRSOFT_DEBUG === '1';
const FORCE       = process.env.ONHAND_FORCE === '1';
const TYPES       = (process.env.ONHAND_TYPES || 'F,C,P,N').split(',').map(s => s.trim()).filter(Boolean);

// Exported (dispatch #215 Task 3) — scripts/eom-digest-send.mjs reads the exact same 27-store
// list rather than a second copy that could drift.
export const STORE_NSNS = [
  3708, 5183, 5985, 6178, 6838, 6972,
  10034, 10422, 10915, 11657, 13113, 18213,
  20475, 24471, 29760, 31357, 32525, 33109,
  33222, 33704, 34222, 35064, 35242, 37566,
  38609, 43380, 43701,
];

// safeCreateClient (scripts/lib/safe-supabase-client.mjs) — dispatch #209's own tests import this
// module directly for buildNotificationRow()/buildStatusRow()/kbLinksForClasses() (no supabase/
// fetch dependency in those functions themselves), matching the pattern
// scripts/qsrsoft-register-audit-pull.mjs already uses for the identical reason. Never throws,
// even on a leaked dummy-but-truthy env var from an unrelated test file's stub — see that
// helper's own header for the real CI incident this fixes (a leaked value once let a sibling
// guarded script construct a real SupabaseClient, which crashed on Node 20's missing native
// WebSocket support).
const supabase = safeCreateClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ── Date + count-window helpers ───────────────────────────────────────────────
const pad2 = n => String(n).padStart(2, '0');
const fmtDate = d => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;

function businessDate() {
  return process.env.ONHAND_DATE || fmtDate(new Date());
}
function periodFor(dateStr) {
  return process.env.ONHAND_PERIOD || dateStr.slice(0, 7); // 'YYYY-MM'
}

// inCountWindow/centralHour/inCtBusinessHours moved to ./lib/count-window.mjs (dispatch
// #210) so qsrsoft-variance-pull.mjs can reuse the EXACT same gate instead of a second
// copy — this file still owns CT_START/CT_END/the env-tunable defaults below.

// Year-round "progress mode" snapshot: outside the count window we still take ONE
// light On-Hand pull per day (in a morning UTC WINDOW) so `last_counted` freshness
// stays current all month — feeding the dashboard's year-round Progress mode.
// Inside the count window we keep the hourly cadence (count-completion tracking).
// Owner's two-modes idea (Notes 29); the workflow fires hourly and this gate picks
// which hours actually do work. IMPORTANT: GitHub's scheduled runs are sparse and
// delayed (gaps of hours are common), so requiring an EXACT hour would miss the
// snapshot on days no run lands in that hour. We use a WINDOW [HOUR, HOUR+WINDOW)
// so at least one sparse run catches it; the upsert is idempotent, so the handful
// of possible extra pulls in-window are harmless. ONHAND_PROGRESS=0 disables it.
const PROGRESS_SNAPSHOT_HOUR = Number(process.env.ONHAND_PROGRESS_HOUR ?? 10);
const PROGRESS_SNAPSHOT_WINDOW = Number(process.env.ONHAND_PROGRESS_WINDOW ?? 4); // hours
const PROGRESS_ENABLED = process.env.ONHAND_PROGRESS !== '0';
function isProgressSnapshotHour() {
  if (!PROGRESS_ENABLED) return false;
  const h = new Date().getUTCHours();
  return h >= PROGRESS_SNAPSHOT_HOUR && h < PROGRESS_SNAPSHOT_HOUR + PROGRESS_SNAPSHOT_WINDOW;
}
// Intraday count-window pulls are restricted to Central business hours (Notes 35): managers
// count during the day, so hourly pulls overnight are wasted egress + noise. 8am–10pm CT,
// DST-safe via America/Chicago. A manual/on-demand run (FORCE=1) overrides this anytime.
// End extended 6pm->10pm (owner, 2026-08-30): closing-shift counts (esp. Non-Product on the
// last day) commonly land after 6pm, and the cron already fires every 30 min around the
// clock (qsrsoft-onhand-pull.yml) -- this gate was the only thing turning those runs into
// no-ops, so widening it costs nothing extra in cron entries or workflow changes.
const CT_START = Number(process.env.ONHAND_CT_START ?? 8);
const CT_END = Number(process.env.ONHAND_CT_END ?? 22);
// 2026-09-01 (owner req, verbatim): "we have the days of week that each store counts. Let's pull
// data for those days between 8am and 5pm, hourly to start." Narrower than the EOM count-window's
// 8a-10p (owner's own explicit hours here), and every-store-outside-the-EOM-window scoped down to
// just the stores actually expected to be counting today — see the per-store filter in main().
const WEEKLY_CT_START = Number(process.env.ONHAND_WEEKLY_CT_START ?? 8);
const WEEKLY_CT_END = Number(process.env.ONHAND_WEEKLY_CT_END ?? 17);
const WEEKLY_PULL_ENABLED = process.env.ONHAND_WEEKLY_PULL !== '0';
// Should this invocation do a pull at all, and in which mode?
// Cadence (dispatch #210): the workflow's own cron now fires every 30 min during the
// count window (see qsrsoft-onhand-pull.yml) — this gate is still the sole authority on
// whether a landed run does real work; the cron change only makes MORE runs land, it
// carries none of the window logic itself.
function runMode() {
  if (FORCE) return 'forced';
  if (inCountWindow()) return inCtBusinessHours(new Date(), CT_START, CT_END) ? 'count-window' : null; // every 30 min, last 3 days, 8a–10p CT only
  // Outside the EOM window (last 3 days), every OTHER day the workflow's own hourly cron lands on
  // still fires this check — 'weekly-count-day' below then narrows it to just today's stores, so
  // this doesn't pull all 27 stores every hour, only whichever few are expected to count today.
  if (WEEKLY_PULL_ENABLED && inCtBusinessHours(new Date(), WEEKLY_CT_START, WEEKLY_CT_END)) return 'weekly-count-day';
  if (isProgressSnapshotHour()) return 'progress'; // one daily snapshot, year-round
  return null;                                   // skip
}

// ── Weekly-count-day store filter ──────────────────────────────────────────────
// detectWeeklyCountDay() (src/engine/count-cycle.js) needs one qsr_onhand row-array PER PERIOD
// (see its own doc comment for why a flat multi-period blob would silently break the coverage
// math) — this loads the last WEEKLY_HISTORY_PERIODS months, one query per period, mapping
// `recipe_item` -> `recipeItem` (the one field toEngineRows() below doesn't carry, since that
// mapper is built for a single already-known store, not a cross-store/cross-period detector).
const WEEKLY_HISTORY_PERIODS = Number(process.env.ONHAND_WEEKLY_HISTORY_PERIODS ?? 6);
function recentPeriodKeys(period, n) {
  const [y, m] = period.split('-').map(Number);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`);
  }
  return out;
}
async function loadOnHandHistoryByPeriod(periods) {
  const rowsByPeriod = [];
  for (const p of periods) {
    const { data, error } = await supabase.from('qsr_onhand').select('loc,cls,wrin,last_counted,active,recipe_item').eq('period', p);
    if (error) { console.warn(`[weekly-count-day] qsr_onhand load error for ${p}:`, error.message); continue; }
    rowsByPeriod.push((data || []).map(r => ({ ...r, recipeItem: r.recipe_item })));
  }
  return rowsByPeriod;
}
// Which NSNs are expected to count TODAY (Central calendar date), per detectWeeklyCountDay()'s
// own confidence — CONFIDENCE_FLOOR (majority agreement, not just "saw it once") avoids pulling a
// store all week off one historical outlier. Deliberately does NOT fall back to the full store
// list when nothing matches (e.g. a data gap, or every store's detected day is some other day) --
// the owner's own framing was "let's pull data for those days... hourly TO START", a narrow,
// deliberately-scoped-down pull; silently widening to all 27 stores on a detection gap would be
// the opposite of that, and 'count-window'/'progress' mode already cover every store on their own
// (more thorough) schedules regardless of what this returns.
const WEEKLY_CONFIDENCE_FLOOR = Number(process.env.ONHAND_WEEKLY_CONFIDENCE_FLOOR ?? 0.5);
async function storesCountingToday(period) {
  const rowsByPeriod = await loadOnHandHistoryByPeriod(recentPeriodKeys(period, WEEKLY_HISTORY_PERIODS));
  const detected = detectWeeklyCountDay(rowsByPeriod);
  // "Utilize both" (owner-directed, 2026-09-01): the derived signal alone, gated on
  // WEEKLY_CONFIDENCE_FLOOR; below that (or absent), fall back to the real, owner-entered
  // Organization Structure weekly count day (org_config 'weekly_count_day_overrides') --
  // mergeWeeklyCountDay() (src/engine/count-cycle.js) does the actual precedence, reused as-is.
  const fallback = await loadWeeklyCountDayFallback(supabase);
  const merged = mergeWeeklyCountDay(detected, fallback, { confidenceFloor: WEEKLY_CONFIDENCE_FLOOR });
  const todayWd = centralWeekday();
  return STORE_NSNS.filter(nsn => {
    // detectWeeklyCountDay()/mergeWeeklyCountDay() key their output by UNPADDED loc (detectSessions'
    // own `unpad(r.loc)`, count-cycle.js) even though qsr_onhand itself stores `loc` zero-padded to
    // 7 chars (this file's own upsert, `loc: String(nsn).padStart(7,'0')`) -- a padded lookup key
    // here silently matched nothing, so this filter always returned an empty array. Fixed alongside
    // the fallback merge above since both land in the same review; verified live against real
    // qsr_onhand session data during this same investigation.
    const loc = String(nsn);
    const d = merged[loc];
    return d && d.weekday === todayWd;
  });
}

// ── eBOS auth: SSO token exchange (mirrors qsrsoft-ebos-pull.mjs) ──────────────
async function getEbosTokenViaSso(qsrsoftToken) {
  const url = `https://api.sso.myqsrsoft.com/token/ebosByOrg?orgId=${EBOS_ORG_ID}`;
  const resp = await fetch(url, {
    headers: {
      'X-Auth-Token': qsrsoftToken, 'Accept': 'application/json',
      'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
    },
  });
  if (!resp.ok) { console.log(`[auth] SSO exchange HTTP ${resp.status}`); return null; }
  const data = await resp.json();
  const token = data.token || data.accessToken || data.access_token || data.ebosByOrg
             || data.ebosToken || data.x_auth_token || (typeof data === 'string' ? data : null);
  if (!token) console.log('[auth] SSO response keys:', Object.keys(data).join(', '));
  return token || null;
}

// Playwright login — mint a FRESH eBOS token from a live browser session. eBOS tokens
// are HS256, minted per-request and die in ~minutes, so there is no reusable stored token;
// this is the ONLY reliable path (SSO /token/ebosByOrg is a confirmed 403 dead end). Ported
// verbatim from the confirmed-working qsrsoft-variance-pull.mjs (2026-07-26) — Amplify's
// React inputs need pressSequentially (page.fill leaves them empty) + the EXACT "Sign in".
async function getEbosTokenViaPlaywright() {
  const u = process.env.QSRSOFT_USERNAME, p = process.env.QSRSOFT_PASSWORD;
  if (!u || !p) { console.error('[auth] no QSRSOFT_USERNAME/PASSWORD for Playwright fallback'); return null; }
  const fs = await import('node:fs');
  try { fs.mkdirSync('screenshots', { recursive: true }); } catch {}
  const shot = async (page, name) => { try { await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true }); console.log(`[pw] 📸 ${name}`); } catch (e) { console.log(`[pw] screenshot ${name} failed: ${e.message}`); } };
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36' });
  const page = await context.newPage();
  let ebosToken = null;
  const grab = (t, where) => { if (!ebosToken && t && t.length > 40) { ebosToken = t; console.log(`[pw] ✓ captured eBOS token from ${where}`); } };
  page.on('request', req => { if (req.url().includes('ebos.qsrsoft.com')) grab(req.headers()['x-auth-token'], 'request header'); });
  page.on('response', async resp => {
    if (ebosToken) return;
    const url = resp.url();
    if (!/sso\.myqsrsoft|ebos\.qsrsoft|token/i.test(url)) return;
    try { const body = await resp.text(); const m = body.match(/eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9[\w.\-]+/); if (m) grab(m[0], `response ${url.slice(0, 80)}`); } catch {}
  });
  try {
    console.log('[pw] goto v3.myqsrsoft.com …');
    await page.goto('https://v3.myqsrsoft.com', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {});
    console.log(`[pw] landed at: ${page.url()} — title: "${await page.title().catch(() => '?')}"`);
    await shot(page, '01-landing');
    const userSel = 'input[name="username"], input[name="email"], input[type="email"], #username, #email';
    const passSel = 'input[name="password"], input[type="password"], #password';
    const foundUser = await page.waitForSelector(userSel, { timeout: 20000 }).then(() => true).catch(() => false);
    if (!foundUser) { console.log('[pw] ✗ no username field found — login UI not recognized'); await shot(page, '02-no-login'); }
    else {
      console.log('[pw] filling credentials (char-by-char for React/Amplify)…');
      const userLoc = page.locator(userSel).first();
      const passLoc = page.locator(passSel).first();
      await userLoc.click({ clickCount: 3 }); await userLoc.pressSequentially(u, { delay: 12 });
      await passLoc.click({ clickCount: 3 }).catch(() => {}); await passLoc.pressSequentially(p, { delay: 12 }).catch(() => {});
      await shot(page, '02-filled');
      const signIn = page.getByRole('button', { name: 'Sign in', exact: true });
      const clicked = await signIn.click({ timeout: 8000 }).then(() => true).catch(() => false);
      if (!clicked) { console.log('[pw] exact Sign in button not clickable — pressing Enter in password'); await passLoc.press('Enter').catch(() => {}); }
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 2500));
      const stillLogin = await page.$(passSel).then(Boolean);
      console.log(`[pw] post-login at: ${page.url()} — stillOnLogin: ${stillLogin}`);
      await shot(page, '03-post-login');
    }
    // Trigger an eBOS request by navigating inventory pages (token is org-wide).
    for (const url of ['https://v3.myqsrsoft.com/inventory/on-hand', 'https://v3.myqsrsoft.com/inventory/variance', 'https://v3.myqsrsoft.com/inventory', 'https://v3.myqsrsoft.com/']) {
      if (ebosToken) break;
      await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 5000));
    }
    if (!ebosToken) await shot(page, '04-no-token');
  } catch (e) { console.error('[auth] Playwright error:', e.message); } finally { await browser.close(); }
  if (!ebosToken) console.error('[auth] ✗ Playwright could not capture an eBOS token (see screenshots artifact above)');
  return ebosToken;
}

async function resolveEbosToken() {
  // eBOS tokens die in ~minutes → a stored QSRSOFT_EBOS_TOKEN is stale by CI time, and the
  // SSO /token/ebosByOrg exchange is a confirmed 403 dead end. The ONLY reliable path is a
  // fresh Playwright login (mirrors qsrsoft-variance-pull.mjs, which works). An explicit
  // static token, if ever set, is honored first purely as a manual override.
  const envToken = (process.env.QSRSOFT_EBOS_TOKEN || '').trim();
  if (envToken) { console.log('[auth] using QSRSOFT_EBOS_TOKEN override'); return envToken; }
  const t = await getEbosTokenViaPlaywright();
  if (!t) { console.error('[onhand-pull] ✗ no eBOS token'); process.exit(1); }
  return t;
}

// ── Fetch one store's On-Hand items for one class type ────────────────────────
let dumpedRawFields = false; // #357-B2/3 — see DUMP_RAW_FIELDS note below; fire once per run.
// #357-B2/3 — the one-shot single-record dump (below) confirmed `active_in_recipe` exists,
// but one record can't tell us whether it actually VARIES (a flag that's always 1 is useless
// as a filter). Tally it across every item this run touches and print the distribution once
// at the end of main(), gated behind the same DUMP_RAW_FIELDS flag — still read-only.
const rawFieldTally = { total: 0, activeVals: new Map(), staleActive1: 0, staleTotal: 0 };
async function fetchOnHand(token, nsn, dateStr, type) {
  const params = new URLSearchParams({
    date: dateStr, type, recipe: 'all', non_zero_on_hand: 'false', duplicate: 'false',
  });
  const url = `${EBOS_BASE}/api/inv/${nsn}/on_hand/rawitems?${params}`;
  if (DEBUG) console.log('[onhand] GET', url);
  const resp = await fetch(url, {
    headers: {
      'X-Auth-Token': token, 'X-Current-Nsn': String(nsn), 'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
    },
  });
  if (resp.status === 401 || resp.status === 403) throw new Error(`AUTH_FAILED:${resp.status}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 160)}`);
  const data = await resp.json();
  const items = Array.isArray(data?.on_hand_records) ? data.on_hand_records : [];
  // #357-B2/3 — one-shot probe: does the On-Hand API already carry an active/status/
  // discontinued flag? mapOnHandRow keeps 13 fields and silently drops whatever else
  // the API returns; log the full field set + one record ONCE per run so this is a
  // `grep`-able answer instead of re-guessing. DUMP_RAW_FIELDS=1, read-only (no schema
  // or upsert change — mapOnHandRow is untouched by this).
  if (process.env.DUMP_RAW_FIELDS === '1' && items.length) {
    if (!dumpedRawFields) {
      dumpedRawFields = true;
      console.log('[DUMP_RAW_FIELDS] on_hand_records[0] keys:', Object.keys(items[0]));
      console.log('[DUMP_RAW_FIELDS] on_hand_records[0] full record:', JSON.stringify(items[0]));
    }
    const periodPrefix = dateStr.slice(0, 7); // "2026-08"
    for (const it of items) {
      rawFieldTally.total++;
      const v = it.active_in_recipe;
      rawFieldTally.activeVals.set(v, (rawFieldTally.activeVals.get(v) || 0) + 1);
      // "stale" per eom-inventory.js's own definition: last_counted falls in a PRIOR period.
      // Parse MM/DD/YYYY and compare month/year to the query date's period.
      const lc = String(it.last_counted || '');
      const m = lc.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (m) {
        const lcPeriod = `${m[3]}-${String(m[1]).padStart(2, '0')}`;
        if (lcPeriod !== periodPrefix) {
          rawFieldTally.staleTotal++;
          if (v === 1 || v === '1') rawFieldTally.staleActive1++;
        }
      }
    }
  }
  return items;
}

const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
// "07/21/2026 08:59" → "2026-07-21"
function toISODate(v) {
  if (!v) return null;
  const m = String(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${pad2(+m[1])}-${pad2(+m[2])}` : null;
}

// #357-B2/3 — active_in_recipe → boolean. Measured (DUMP_RAW_FIELDS probe, 2026-08-17,
// 7127 items): a real, varying status flag {1: 4807, 0: 2320}, not a constant. Preserves
// null for a genuinely missing field (rather than defaulting to true/false) so
// count-cycle.js's `r.active !== false` check treats "field absent" the same as historical
// rows pulled before this column existed -- included in the denominator, not silently
// dropped.
const activeFlag = v => v == null ? null : !!Number(v);

// Dispatch16 (#374 KB verification, 2026-08-18) — active_in_recipe=0 alone is not "safe to
// exclude": the QSRSoft KB (Inventory Analysis Report) splits it into Topic 3 ("not in any
// recipe, inventory > 0" -- legacy/obsolete, correctly excluded) vs Topic 6 ("not active but
// part of an ACTIVE recipe" -- still real to-count work). Measured live (2026-08-17, all 27
// stores): of 2316 active_in_recipe=0 items, 144 (6.2%) are recipe_item='Yes' -- genuine
// Topic 6, concentrated in 23/27 stores (Harrah/43701 worst at 13). Small but real, so
// persisting the second field rather than accepting the miscategorization.
const recipeItemFlag = v => v == null ? null : v === 'Yes';

// Map a raw On-Hand record → qsr_onhand row (fields confirmed 2026-07-26).
function mapOnHandRow(item, nsn, period) {
  return {
    loc:            String(nsn).padStart(7, '0'),
    period,
    wrin:           String(item.full_wrin || '').trim(),
    descr:          item.long_desc ?? null,
    cls:            item.invty_class ?? null,          // "Food" / "Condiment" / "Paper" / "Non-Product"
    cases:          num(item.case_count),
    packs:          num(item.inner_pack_count),
    loose:          num(item.loose_count),
    total_units:    num(item.total_units),
    unit_price:     num(item.unit_price),
    on_hand_amt:    Number.isFinite(item.nonRoundedOnHandAmt) ? item.nonRoundedOnHandAmt : num(item.on_hand_amt),
    active:         activeFlag(item.active_in_recipe),  // #357-B2/3 — denominator status flag
    recipe_item:    recipeItemFlag(item.recipe_item),   // dispatch16 — Topic 6 rescue flag
    last_counted:   toISODate(item.last_counted),
    last_submitted: toISODate(item.last_submitted),
    updated_at:     new Date().toISOString(),
  };
}

// dispatch #219 Task 1 — DB-shaped `deduped` rows → the camelCase shape the engine
// (computeCountProgress/diagnoseIncompleteCount, src/engine/eom-inventory.js) expects. Exported
// (not left inline in main()'s loop) so an end-to-end test exercises the REAL mapping — including
// the `descr` fix below — rather than a test re-implementing it, which couldn't tell "fixed" from
// "fixed then reverted" (this repo's own "would this verification still pass if the change were
// reverted" rule). Previously omitted `descr` entirely even though mapOnHandRow() (above) already
// captures it correctly and diagnoseIncompleteCount() already reads it — so every uncounted item
// in a live notification carried zero descr keys, and resend-notify.mjs's "show descr+wrin
// together" rendering (#213) had nothing to render. `descr: r.descr` is the whole data-side fix.
export function toEngineRows(deduped) {
  return (deduped || []).map(r => ({
    wrin: r.wrin, cls: r.cls, onHandAmt: r.on_hand_amt, unitPrice: r.unit_price, totalUnits: r.total_units,
    cases: r.cases, packs: r.packs, loose: r.loose, descr: r.descr,
    lastCounted: r.last_counted ? new Date(r.last_counted + 'T00:00:00') : null,
    lastSubmitted: r.last_submitted ? new Date(r.last_submitted + 'T00:00:00') : null,
    // 2026-08-31 fix -- these two were silently dropped here, which made diagnoseIncompleteCount()'s
    // active===false / droppedFromCurrentPull() deactivation signals inert for every server-side
    // caller of toEngineRows() (eom-digest-send.mjs, eom-notification-resend.mjs): both signals
    // read r.active / r.updatedAt directly, and a missing field silently reads as "no signal" rather
    // than throwing, so this went unnoticed until traced. src/lib/supabase.js's loadQsrOnHand()
    // (the browser-side loader) already carried both through; this brings the server-side mapping
    // in line with it so the emailed digest/notifications see the same deactivation state the
    // in-app dashboard does.
    active: r.active, updatedAt: r.updated_at,
  }));
}

async function upsertRows(rows) {
  if (!rows.length) return 0;
  const CHUNK = 500; let saved = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from('qsr_onhand').upsert(rows.slice(i, i + CHUNK), { onConflict: 'loc,period,wrin' });
    if (error) console.warn('[supabase] upsert error:', error.message);
    else saved += Math.min(CHUNK, rows.length - i);
  }
  return saved;
}

// Existing per-store status rows for the period (preserve diagnosis/comms/notified_90).
async function loadExistingStatus(period) {
  const { data, error } = await supabase.from('eom_count_status').select('*').eq('period', period);
  if (error) { console.warn('[eom_count_status] load error:', error.message); return {}; }
  const m = {}; (data || []).forEach(r => { m[String(r.loc)] = r; });
  return m;
}

// A class's `*_done_at` (dispatch #209): stamped the FIRST time `done` flips true this run,
// preserved unchanged forever after — never overwritten once set, matching notified_90/
// notified_at's own fire-once spirit on this same table.
export function classDoneAtStamp(prevStamp, isDoneNow, nowIso) {
  if (prevStamp) return prevStamp;       // already stamped — never move it
  return isDoneNow ? nowIso : null;       // first time true this run — stamp it; else still null
}

// Build the per-store status row from the app's engine (zero drift), preserving
// human-set fields and firing the ~90% "believes done" trigger exactly once.
// `p` is this store's ALREADY-COMPUTED computeCountProgress() output (dispatch #209: computed
// once in main()'s loop so detectCountNotifications() and this function share it — no duplicate
// pass over the same rows). `notifyTriggerKinds` is detectCountNotifications()'s triggerKinds
// for THIS run (or undefined/[] if nothing fired) — folded into notified_classes so the next
// run's fire-once guard sees it.
export function buildStatusRow(loc, period, prev, p, notifyTriggerKinds) {
  const believes = p.itemsTotal > 0 && p.pctCounted >= BELIEVES_DONE_PCT;
  const alreadyNotified = prev?.notified_90 === true;
  const fireNow = believes && !alreadyNotified;
  const nowIso = new Date().toISOString();
  const notifiedClasses = Array.from(new Set([...(Array.isArray(prev?.notified_classes) ? prev.notified_classes : []), ...(notifyTriggerKinds || [])]));
  return {
    loc, period,
    items_total:      p.itemsTotal,
    items_counted:    p.itemsCounted,
    pct_counted:      p.pctCounted,
    food_done:        !!p.byClass.food?.done,
    condiment_done:   !!p.byClass.condiment?.done,
    paper_done:        !!p.byClass.paper?.done,
    nonproduct_done:  !!p.byClass.nonproduct?.done,
    food_done_at:       classDoneAtStamp(prev?.food_done_at, !!p.byClass.food?.done, nowIso),
    condiment_done_at:  classDoneAtStamp(prev?.condiment_done_at, !!p.byClass.condiment?.done, nowIso),
    paper_done_at:      classDoneAtStamp(prev?.paper_done_at, !!p.byClass.paper?.done, nowIso),
    nonproduct_done_at: classDoneAtStamp(prev?.nonproduct_done_at, !!p.byClass.nonproduct?.done, nowIso),
    notified_classes: notifiedClasses,
    last_activity_at: p.lastActivityAt instanceof Date ? p.lastActivityAt.toISOString() : (prev?.last_activity_at ?? null),
    notified_90:      alreadyNotified || fireNow,
    notified_at:      fireNow ? nowIso : (prev?.notified_at ?? null),
    // preserve human-set fields
    diagnosis_status: prev?.diagnosis_status ?? 'pending',
    comms_status:     prev?.comms_status ?? 'none',
    comms_recipient:  prev?.comms_recipient ?? null,
    comms_sent_at:    prev?.comms_sent_at ?? null,
    comms_note:       prev?.comms_note ?? null,
    fob_pct:          prev?.fob_pct ?? null,
    total_fc_pct:     prev?.total_fc_pct ?? null,
    updated_at:       nowIso,
    _fireNow:         fireNow, // internal, stripped before upsert
    // Timestamped completion snapshot for the per-location progress LOG (owner req 2026-07-30):
    // builds a trajectory of when each store counts each class through the cycle. Stripped
    // before the eom_count_status upsert; written to eom_count_progress_log instead.
    _log: {
      pct_counted:     p.pctCounted,
      items_counted:   p.itemsCounted,
      items_total:     p.itemsTotal,
      believes_done:   believes,
      food_pct:        p.byClass.food?.pct ?? null,
      condiment_pct:   p.byClass.condiment?.pct ?? null,
      paper_pct:       p.byClass.paper?.pct ?? null,
      nonproduct_pct:  p.byClass.nonproduct?.pct ?? null,
      food_done:       !!p.byClass.food?.done,
      condiment_done:  !!p.byClass.condiment?.done,
      paper_done:      !!p.byClass.paper?.done,
      nonproduct_done: !!p.byClass.nonproduct?.done,
    },
  };
}

// #210 Task 4 / memory/project-eom-scoreboard-notify.md: the instant a store crosses
// "believes done" (>=90% counted), nudge the FOB pull immediately instead of waiting for
// its own 3x/day schedule (qsrsoft-pull.yml) — an EOM count finalizing is exactly the
// kind of intraday change that pull's own schedule comment already anticipates catching
// "within hours, not next morning". Wired off the SAME notified_90 trigger
// buildStatusRow() already computes (fireNow = crossed BELIEVES_DONE_PCT and wasn't
// already notified) — dispatch #209 (EOM count-completion notifications) was still
// doc-only on `main` as of this dispatch (checked live: only memory/dispatch-209.md
// exists, no script changes), so there are no finer-grained per-class fire-once events to
// hook yet. A per-class version (food/condiment/paper/nonproduct each independently
// crossing done) can follow once #209 lands those triggers — note left here rather than
// duplicating trigger-detection logic ahead of that work.
//
// At most once per SCRIPT RUN even if multiple stores cross this run — qsrsoft-pull.yml
// has no per-store subset input, so a second dispatch in the same run would only be a
// wasted duplicate call, not a mistake, but there's no reason to make it.
async function triggerFobPullIfPossible() {
  const token = process.env.GITHUB_TOKEN;
  const repoFull = process.env.GITHUB_REPOSITORY;
  if (!token || !repoFull) {
    console.log('[onhand-pull] believes-done fired but no GITHUB_TOKEN/GITHUB_REPOSITORY in this environment — skipping FOB pull nudge');
    return;
  }
  const [owner, repo] = repoFull.split('/');
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/qsrsoft-pull.yml/dispatches`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    });
    if (res.ok) console.log('[onhand-pull] ✓ nudged QSRSoft FOB Pull (qsrsoft-pull.yml) via workflow_dispatch — a store just crossed believes-done');
    else console.warn(`[onhand-pull] FOB pull nudge HTTP ${res.status}`);
  } catch (e) {
    console.warn(`[onhand-pull] FOB pull nudge failed: ${e.message}`);
  }
}

// ── FOB freshness check (dispatch #213 Task 3) ─────────────────────────────────
// The store-level "count-completion time" that feeds FOB: the max last_counted/last_submitted
// across this store's Food+Condiment on-hand items (FOB_CLASSES) THIS run — reuses
// eom-inventory.js's own countedDate()/normClass() rather than re-deriving "counted or
// submitted, whichever is later" a second time.
export function foodCondimentCountCompletedAt(ohForEngineRows) {
  let latest = null;
  for (const r of (ohForEngineRows || [])) {
    if (!FOB_CLASSES.includes(normClass(r.cls))) continue;
    const d = countedDate(r);
    if (d && (!latest || d > latest)) latest = d;
  }
  return latest;
}

// The literal freshness rule, exactly as the owner stated it: the FOB pull is "as recent or
// newer than the in-hand [count]" iff its updated_at falls AT OR AFTER the count's own
// completion time. Both real timestamps, compared directly — no fudge/grace window (out of
// scope per dispatch #213 unless a concrete reason surfaces). Pulled out as its own pure,
// exported function so it's unit-testable without a live Supabase round-trip.
export function isFobFresh(fobUpdatedAt, countCompletedAt) {
  if (!fobUpdatedAt || !countCompletedAt) return false;
  const a = fobUpdatedAt instanceof Date ? fobUpdatedAt : new Date(fobUpdatedAt);
  const b = countCompletedAt instanceof Date ? countCompletedAt : new Date(countCompletedAt);
  if (isNaN(a) || isNaN(b)) return false;
  return a.getTime() >= b.getTime();
}

// Fetches this store's qsr_fob rows for the period and reduces them through the SAME
// fobSnapshotByStore() aggregation the app uses everywhere else (never a second hand-rolled sum
// — the FOB-30x bug this function's own doc-comment warns about). Also surfaces the LATEST row's
// own `updated_at` (the real per-row pull timestamp — explicitly set on every upsert in
// scripts/qsrsoft-pull.mjs, not just a DB default) since fobSnapshotByStore's return shape
// doesn't carry it — needed here purely for the freshness comparison below, not a second
// aggregation of the FOB dollars themselves.
export async function fetchFobSnapshotForStore(loc, period) {
  if (!supabase) return null;
  // NOT `.lte('date', \`${period}-31\`)` -- that literal is an invalid date for any month with
  // fewer than 31 days and Postgres rejects it outright ("date/time field value out of range").
  // Found live-armed 2026-09-04 while fixing the identical bug (already crashing in production)
  // in scripts/eom-snapshot-pull.mjs -- see scripts/lib/month-bounds.mjs for why this is a shared
  // helper now, the third independent occurrence of the same mistake in this repo.
  const { data, error } = await supabase.from('qsr_fob')
    .select('loc,date,prod_sales_amt,comp_waste_amt,raw_waste_amt,condiments_amt,emp_mgr_meals_amt,stat_variance_amt,unexplained_amt,updated_at')
    .eq('loc', loc)
    .gte('date', `${period}-01`)
    .lt('date', nextMonthStart(period))
    .order('date', { ascending: false });
  if (error) { console.warn('[qsr_fob] load error:', error.message); return null; }
  if (!data || !data.length) return null;
  const rows = data.map(r => ({
    loc: r.loc, date: r.date,
    prodSalesAmt: r.prod_sales_amt, compWasteAmt: r.comp_waste_amt, rawWasteAmt: r.raw_waste_amt,
    condimentsAmt: r.condiments_amt, empMgrMealsAmt: r.emp_mgr_meals_amt,
    statVarianceAmt: r.stat_variance_amt, unexplainedAmt: r.unexplained_amt,
  }));
  const snap = fobSnapshotByStore(rows, period)[loc];
  if (!snap) return null;
  const latestRow = data.reduce((best, r) => (!best || r.date > best.date) ? r : best, null);
  return { snap, updatedAt: latestRow?.updated_at ? new Date(latestRow.updated_at) : null };
}

// ── FOB targets alongside components (dispatch #215 Task 1) ───────────────────
// `t` shape below is the SAME one computeFoodCostHeadline() (src/views/store-cockpit.js) reads:
// target: t.tFOBTarget (headline), compTarget: {statv,comp,raw,cond,emp,unex} from
// t.tStatLoss/tCompWaste/tRawWaste/tCondiment/tEmpFood/tUnex. This resolves that same `t` for a
// bare Node script, which (unlike the browser) has no `settings.targets`/App.js startup merge.
//
// SCOPE (a real judgment call, not mechanical — stated per the dispatch): resolves
// DEFAULT_TARGETS[loc] (src/constants.js, imported the same way this file already imports
// STORE_NAMES/unpadLoc from it) with a LIVE monthly_targets override for this exact (loc, year,
// month) layered on top when one exists — monthly_targets is the table Projections/Performance
// Review already treat as the current-period source of truth for these exact fields (see
// src/lib/supabase.js's loadMonthlyTargets, same column names used below). Deliberately does
// NOT also consult yearly_targets or target_overrides (the separate company/state/patch/store
// cascade, src/engine/target-overrides.js) — those sit at other tiers of the app's real
// precedence (review-engine.js's mergedTargetsForLocMonth: DEFAULT_TARGETS < yearly <
// monthly < target_overrides), but pulling that whole 4-tier resolution into this script for a
// v1 email section risks importing review-engine.js's heavier transitive graph (metric-source.js,
// one-pager-data.js, schedule-summary.js, assignment-graph.js) into a Playwright pull script for
// a nice-to-have upgrade. monthly_targets is the tier an owner/GM actually edits mid-month
// (Projections' own "apply Smart Targets to the OFFICIAL monthly_targets" flow), so it's the one
// most likely to matter here. Report this scope choice in the PR body — a later dispatch can
// extend to the full cascade if a store's Targets-editor override should also show here.
async function fetchMonthlyTargetOverride(unpaddedLoc, year, month) {
  if (!supabase) return null;
  const { data, error } = await supabase.from('monthly_targets')
    .select('comp_waste_pct,raw_waste_pct,condiment_pct,emp_food_pct,stat_loss_pct,unex_diff_pct,fob_target_pct')
    .eq('loc', unpaddedLoc).eq('year', year).eq('month', month).maybeSingle();
  if (error) { console.warn('[monthly_targets] load error:', error.message); return null; }
  return data || null;
}

export async function resolveFobTargets(loc, period) {
  const u = unpadLoc(loc);
  const base = { ...(DEFAULT_TARGETS[u] || {}) };
  const [year, month] = String(period).split('-').map(Number);
  const override = await fetchMonthlyTargetOverride(u, year, month);
  if (override) {
    // Never let a present-but-null column erase a good default (same _stripNullTargets
    // discipline src/lib/supabase.js's loadMonthlyTargets uses).
    if (override.comp_waste_pct  != null) base.tCompWaste = override.comp_waste_pct;
    if (override.raw_waste_pct   != null) base.tRawWaste  = override.raw_waste_pct;
    if (override.condiment_pct   != null) base.tCondiment = override.condiment_pct;
    if (override.emp_food_pct    != null) base.tEmpFood   = override.emp_food_pct;
    if (override.stat_loss_pct   != null) base.tStatLoss  = override.stat_loss_pct;
    if (override.unex_diff_pct   != null) base.tUnex      = override.unex_diff_pct;
    if (override.fob_target_pct  != null) base.tFOBTarget = override.fob_target_pct;
  }
  return base;
}

// Builds the target-vs-actual read for the notification's FOB section, via buildStoreFobReport()
// (src/engine/fob-report.js) — the SAME comps/overTarget/gapPP/topDriver math the FOB Report
// panel and Store Cockpit already show, never a second hand-rolled version. `fobSnap` is
// fobSnapshotByStore()'s per-store output (the same object attached as fob_snapshot); `t` is
// resolveFobTargets()'s output. Returns null when no FOB% target is resolvable — omit the
// target comparison rather than guess, matching #213's own freshness-gate philosophy (show
// nothing sooner than show something wrong).
export function buildFobTargetReport(loc, period, fobSnap, t) {
  if (!fobSnap || !t || t.tFOBTarget == null) return null;
  const compActual = fobSnap.sales ? {
    statv: fobSnap.statv / fobSnap.sales, comp: fobSnap.comp / fobSnap.sales, raw: fobSnap.raw / fobSnap.sales,
    cond: fobSnap.cond / fobSnap.sales, emp: fobSnap.emp / fobSnap.sales, unex: fobSnap.unex / fobSnap.sales,
  } : null;
  const compTarget = { statv: t.tStatLoss, comp: t.tCompWaste, raw: t.tRawWaste, cond: t.tCondiment, emp: t.tEmpFood, unex: t.tUnex };
  const report = buildStoreFobReport(String(loc), {
    name: STORE_NAMES[unpadLoc(loc)] || loc, org: null, patch: null,
    fob: fobSnap, target: Number(t.tFOBTarget), monthly: { [period]: fobSnap.fobPct },
    varRows: [], compActual, compTarget,
  });
  // `fobPct` (not `target`) — matches src/engine/eom-digest.js's roll-up shape (Task 2), which
  // reads `s.fobTarget.fobPct` when computing a group's avg gap/over-target count; keeping both
  // Task 1 and Task 2 consumers on the same field name avoids a silent shape mismatch where the
  // roll-up's FOB-vs-target aggregation would quietly exclude every store.
  return { fobPct: report.target, gapPP: report.gapPP, overTarget: report.overTarget, comps: report.comps, topDriver: report.topDriver };
}

async function main() {
  const mode = runMode();
  if (!mode) {
    console.log(`[onhand-pull] skipping — outside count window and not the daily progress-snapshot hour (${PROGRESS_SNAPSHOT_HOUR}:00 UTC). ONHAND_FORCE=1 to override.`);
    return;
  }
  const dateStr = businessDate();
  const period  = periodFor(dateStr);
  // weekly-count-day mode narrows the store list to just today's expected counters BEFORE
  // touching auth/API at all — an empty match means nothing to do this run, not a fallback to
  // everyone (see storesCountingToday()'s own comment).
  const targetNsns = mode === 'weekly-count-day' ? await storesCountingToday(period) : STORE_NSNS;
  if (!targetNsns.length) {
    console.log('[onhand-pull] weekly-count-day: no store expected to count today — skipping this run');
    return;
  }
  let token = await resolveEbosToken();
  const prevStatus = await loadExistingStatus(period);
  console.log(`[onhand-pull] mode=${mode} · date ${dateStr} · period ${period} · types [${TYPES.join(',')}] × ${targetNsns.length} stores`);

  let totalSaved = 0, storesWithData = 0, authFailed = false;
  let anyBelievesDoneFired = false; // #210 Task 4 — nudge the FOB pull if any store crosses this run
  let anyFoodCondimentTriggerFired = false; // dispatch #213 Task 3.5 — also nudge on a food/condiment-only trigger
  const statusRows = [];
  const progressLog = [];   // timestamped per-store completion snapshots (one row / store / hour)
  const sessionRows = [];   // append-only count-session history (one row / store / count date / class)
  const notificationRows = []; // dispatch #209 — fired count-completion notifications this run
  // #263: a store with zero on-hand items could be legitimately between count
  // cycles (nothing to report) or could be a fetch that errored on every type and
  // silently produced nothing. Only the second case is a failed unit -- track a
  // store as failed ONLY if at least one of its type requests actually threw.
  const tracker = makeOutcomeTracker('onhand-pull');
  for (const nsn of targetNsns) {
    if (authFailed) break;
    const rows = [];
    const storeErrors = [];
    for (const type of TYPES) {
      try {
        const items = await fetchOnHand(token, nsn, dateStr, type);
        rows.push(...items.map(it => mapOnHandRow(it, nsn, period)).filter(r => r.wrin));
      } catch (e) {
        if (e.message.startsWith('AUTH_FAILED')) { authFailed = true; console.error('[onhand-pull] auth failed — refresh QSRSOFT_EBOS_TOKEN'); break; }
        console.warn(`  ${nsn} type ${type}: ${e.message}`);
        storeErrors.push(`${type}: ${e.message}`);
      }
    }
    // de-dup by wrin within the store (a wrin should map to one class)
    const byWrin = new Map();
    for (const r of rows) byWrin.set(r.wrin, r);
    const deduped = [...byWrin.values()];
    if (!deduped.length && storeErrors.length) tracker.fail(nsn, storeErrors.join('; '));
    if (deduped.length) {
      totalSaved += await upsertRows(deduped);
      storesWithData++;
      const loc = String(nsn).padStart(7, '0');
      // engine expects camelCase (lastCounted as Date); map from the DB-shaped rows (dispatch
      // #219 Task 1 — extracted to toEngineRows() above, which now also carries descr).
      const ohForEngine = toEngineRows(deduped);
      // Dispatch #209 — count-completion notifications. Computed ONCE here (against
      // prevStatus[loc], the store's row from BEFORE this run's eom_count_status upsert) and
      // shared with buildStatusRow below so the pure detection function and the status-row
      // builder never disagree about what "done" means this run.
      const p = computeCountProgress(ohForEngine, { period, asOf: new Date() });
      const detection = detectCountNotifications(prevStatus[loc], p);
      if (detection) {
        const diag = diagnoseIncompleteCount(ohForEngine, { period, minValue: 0 });
        // dispatch #213 Task 3 — FOB + components section, freshness-gated: only when this run's
        // trigger touches Food and/or Condiment (FOB_CLASSES — the only classes that feed FOB),
        // and only when the store's latest qsr_fob pull is at least as recent as the count itself.
        let fobSnapshot = null;
        let fobTargetReport = null; // dispatch #215 Task 1 — only ever set alongside a fresh fobSnapshot
        const fobRelevant = detection.triggerClasses.some(c => FOB_CLASSES.includes(c));
        if (fobRelevant) {
          // Nudge the FOB pull regardless of whether THIS run's freshness check passes below —
          // that's what gives a LATER run's check a real chance to pass (Task 3.5).
          anyFoodCondimentTriggerFired = true;
          const completedAt = foodCondimentCountCompletedAt(ohForEngine);
          if (completedAt) {
            const fobResult = await fetchFobSnapshotForStore(loc, period);
            if (fobResult && isFobFresh(fobResult.updatedAt, completedAt)) {
              fobSnapshot = fobResult.snap;
              const t = await resolveFobTargets(loc, period);
              fobTargetReport = buildFobTargetReport(loc, period, fobSnapshot, t);
            }
          }
        }
        notificationRows.push(buildNotificationRow(loc, period, detection, diag, fobSnapshot, dateStr, fobTargetReport));
        console.log(`  🔔 ${nsn}: count-completion notification — ${detection.triggerKinds.join('+')} (${detection.reasons.join('/')})${fobSnapshot ? ' + fresh FOB snapshot' : ''}${fobTargetReport ? ' + target' : ''}`);
      }
      const st = buildStatusRow(loc, period, prevStatus[loc], p, detection?.triggerKinds);
      // #210 Task 4: nudge the FOB pull the instant a store crosses believes-done this run.
      if (st._fireNow) { console.log(`  🔔 ${nsn}: crossed ${Math.round(BELIEVES_DONE_PCT * 100)}% — store believes count is done`); anyBelievesDoneFired = true; }
      delete st._fireNow;
      // Append a timestamped snapshot to the progress log (deduped to one row per store per hour).
      const nowIso = new Date().toISOString();
      progressLog.push({ loc, period, snapshot_hour: nowIso.slice(0, 13), snapshot_at: nowIso, ...st._log });
      delete st._log;
      statusRows.push(st);
      // Snapshot the count SESSIONS visible right now. qsr_onhand.last_counted is
      // rolling-latest — a recount overwrites the prior date — so unless we append them
      // here, history is lost and "were all four weekly counts complete?" can never be
      // answered. Idempotent: the same session seen on consecutive days upserts the
      // same (loc, count_date, cls) row rather than duplicating.
      sessionRows.push(...deriveSessionRows(loc, period, deduped));
    }
    if (DEBUG) console.log(`  ${nsn}: ${deduped.length} items`);
  }

  // Upsert per-store status (count %, class-done flags, ~90% notify trigger).
  if (statusRows.length) {
    const { error } = await supabase.from('eom_count_status').upsert(statusRows, { onConflict: 'loc,period' });
    if (error) console.warn('[eom_count_status] upsert error:', error.message);
    else console.log(`[onhand-pull] status upserted for ${statusRows.length} stores`);
  }
  if (anyBelievesDoneFired || anyFoodCondimentTriggerFired) await triggerFobPullIfPossible(); // #210 Task 4 + dispatch #213 Task 3.5

  // Append the timestamped completion snapshots (per store per hour) — builds the trajectory.
  if (progressLog.length) {
    const { error } = await supabase.from('eom_count_progress_log').upsert(progressLog, { onConflict: 'loc,period,snapshot_hour' });
    if (error) console.warn('[eom_count_progress_log] upsert error (table may not exist yet):', error.message);
    else console.log(`[onhand-pull] progress-log: ${progressLog.length} snapshots`);
  }

  // Append the count-session history (supabase/schema-inv-count-sessions.sql).
  if (sessionRows.length) {
    const CH = 500;
    let saved = 0, failed = 0;
    for (let i = 0; i < sessionRows.length; i += CH) {
      const { error } = await supabase.from('inv_count_sessions')
        .upsert(sessionRows.slice(i, i + CH), { onConflict: 'loc,count_date,cls' });
      if (error) { failed++; console.warn('[inv_count_sessions] upsert error (table may not exist yet):', error.message); }
      else saved += Math.min(CH, sessionRows.length - i);
    }
    if (!failed) console.log(`[onhand-pull] count-sessions: ${saved} rows`);
  }

  // Insert fired count-completion notifications (dispatch #209, supabase/schema-eom-count-
  // notifications.sql). Plain insert, not upsert — each row is a distinct fired EVENT, not a
  // per-store-per-period snapshot; detectCountNotifications()'s fire-once guard (notified_classes
  // on eom_count_status, folded in above) is what stops a duplicate row from ever being built,
  // not a DB constraint here.
  if (notificationRows.length) {
    const { error } = await supabase.from('eom_count_notifications').insert(notificationRows);
    if (error) console.warn('[eom_count_notifications] insert error (table may not exist yet — run supabase/schema-eom-count-notifications.sql):', error.message);
    else console.log(`[onhand-pull] notifications: ${notificationRows.length} fired`);
    // ── Email/SMS delivery (dispatch #211) — real Resend sends, once per row, after the insert
    // above succeeds. See notifyRow()/deliverNotifications() above and scripts/lib/resend-
    // notify.mjs for the send functions themselves. Neither send throws; a delivery failure is
    // logged and does not affect the insert already committed above or the rest of this run.
    await deliverNotifications(notificationRows);
  }

  console.log(`[onhand-pull] ✓ ${totalSaved} item-rows across ${storesWithData} stores for ${period}`);
  if (process.env.DUMP_RAW_FIELDS === '1' && rawFieldTally.total) {
    const dist = [...rawFieldTally.activeVals.entries()].map(([k, n]) => `${JSON.stringify(k)}:${n}`).join(', ');
    console.log(`[DUMP_RAW_FIELDS] active_in_recipe distribution across ${rawFieldTally.total} items: { ${dist} }`);
    console.log(`[DUMP_RAW_FIELDS] stale items (last_counted in a prior period): ${rawFieldTally.staleTotal} / ${rawFieldTally.total}, of which active_in_recipe===1: ${rawFieldTally.staleActive1}`);
  }
  if (authFailed) process.exit(1);

  // requestedUnits is the list THIS RUN actually attempted -- targetNsns, not the full district
  // roster -- so weekly-count-day mode's deliberately-narrowed store list doesn't read as 20+
  // "missing" stores to the outcome tracker. No manual store-subset override exists for this
  // script otherwise (unlike ROSTER_STORES on the people-report pulls).
  const code = tracker.finalize({
    requestedUnits: targetNsns, totalSaved,
    formatRerun: () => `ONHAND_DATE=${dateStr} node scripts/qsrsoft-onhand-pull.mjs (no store-subset flag exists yet — reruns all stores in the resolved mode)`,
  });
  if (code) process.exit(code);
}

// Only run main() when executed directly (not when imported for unit tests) — same guard
// scripts/qsrsoft-register-audit-pull.mjs uses. Exported for both dispatch #209's and #210's
// own test suites, which import this module directly for its pure/network-mockable functions
// without also firing off a live run.
export { runMode, triggerFobPullIfPossible, recentPeriodKeys, storesCountingToday };
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error('[onhand-pull] fatal:', err); process.exit(1); });
}

// ── Count-session derivation ─────────────────────────────────────────────────
// Groups a store's on-hand rows into sessions by last_counted, one row per class, and
// tags coverage using the SAME threshold as src/engine/count-cycle.js. Imported from the
// engine rather than redefined so the script and the UI can never disagree about what
// "a complete count" means.
//
// #357-D — session_kind is stored for display convenience only; it is derived from
// sessionQualities/sessionLabel (the same independent-flags logic the panel now uses),
// but it is NOT the source of truth for compliance. count-cycle.js's own header (#357-D
// correction) says it plainly: this table is built from qsr_onhand's rolling-latest
// last_counted, the same structural blind spot documented there (a recount overwrites
// the prior count's date, so an EARLIER session in the same period can silently vanish
// from this table too). Anything reading inv_count_sessions for compliance should treat
// session_kind as advisory and recompute qualities at read time if it matters.
function deriveSessionRows(loc, period, rows) {
  const totals = {};
  for (const r of rows) if (r.cls) totals[r.cls] = (totals[r.cls] || 0) + 1;

  const byDate = {};
  for (const r of rows) {
    if (!r.cls || !r.last_counted) continue;
    ((byDate[r.last_counted] || (byDate[r.last_counted] = {})));
    byDate[r.last_counted][r.cls] = (byDate[r.last_counted][r.cls] || 0) + 1;
  }

  const out = [];
  for (const [date, counts] of Object.entries(byDate)) {
    const n = Object.values(counts).reduce((a, b) => a + b, 0);
    const covered = Object.keys(counts).filter(c =>
      counts[c] >= (totals[c] || Infinity) * COVER_FRAC);
    const kind = sessionLabel(sessionQualities(date, covered, n));
    for (const [cls, items] of Object.entries(counts)) {
      out.push({
        loc, count_date: date, cls, period,
        items_counted: items,
        class_total: totals[cls] || 0,
        covered: items >= (totals[cls] || Infinity) * COVER_FRAC,
        session_kind: kind,
        updated_at: new Date().toISOString(),
      });
    }
  }
  return out;
}
