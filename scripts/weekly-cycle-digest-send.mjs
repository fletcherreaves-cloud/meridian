#!/usr/bin/env node
// scripts/weekly-cycle-digest-send.mjs — daily digest for weekly Count Cycle status.
//
// Owner req, verbatim (2026-09-01): "I would also like to see the automatic emails work with
// weekly counts." Companion to qsrsoft-onhand-pull.mjs's new 'weekly-count-day' runMode() branch
// (dispatch same day): that pull runs hourly 8am-5pm CT on each store's detected count day; this
// script runs ONCE daily, after that window closes, and emails ONE digest listing every store
// expected to count TODAY (detectWeeklyCountDay(), src/engine/count-cycle.js) plus its real
// cycleCompliance() status. Content reuses formatWeeklyComplianceReport()'s own header line
// (status + last-count wording) so this email can't disagree with what the Count Cycle panel or
// its own share link (dispatch same day) shows for the same store.
//
// Self-gated like eom-digest-send.mjs: the workflow's cron fires hourly, this only does real work
// when the current UTC hour matches configured sendHourUtc (org_config key
// 'weekly_digest_config', separate from EOM's own 'eom_digest_config'). Default 23:00 UTC
// (~6pm CDT / 5pm CST) — right after the pull window's 5pm CT close.
//
// Recipients: real per-user opt-in (owner req, 2026-09-01, verbatim: "allow anyone to sign up or
// opt in to whichever reports they want emailed to them") — email_digest_subscriptions
// (scripts/lib/email-digest-subscriptions.mjs), falling back to EMAIL_TO (resend-notify.mjs) only
// when nobody has subscribed to 'weekly_cycle_digest' yet, so this never silently sends to zero
// people mid-rollout. Replaces the earlier hardcoded-to-EMAIL_TO decision this comment used to
// describe (dispatch #215 Task 3's "send to the owner for now" convention, which eom-digest-
// notify.mjs's recipientsFor() went through the same replacement in the same pass).
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY
// Optional: WKDIGEST_FORCE=1 (send regardless of the hour gate), WKDIGEST_DATE=YYYY-MM-DD
//           (override "today"), WKDIGEST_DEBUG=1

import { safeCreateClient } from './lib/safe-supabase-client.mjs';
import { postResend, EMAIL_TO } from './lib/resend-notify.mjs';
import { detectWeeklyCountDay, mergeWeeklyCountDay, cycleCompliance, formatWeeklyComplianceReport } from '../src/engine/count-cycle.js';
import { loadWeeklyCountDayFallback } from './lib/weekly-count-day.mjs';
import { loadDigestSubscriberEmails } from './lib/email-digest-subscriptions.mjs';
import { centralWeekday } from './lib/count-window.mjs';
import { STORE_NAMES, unpadLoc } from '../src/constants.js';
import { STORE_NSNS, recentPeriodKeys } from './qsrsoft-onhand-pull.mjs';

const DEBUG = process.env.WKDIGEST_DEBUG === '1';
const FORCE = process.env.WKDIGEST_FORCE === '1';
const supabase = safeCreateClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const pad2 = n => String(n).padStart(2, '0');
const fmtDate = d => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
function businessDate() { return process.env.WKDIGEST_DATE || fmtDate(new Date()); }
function periodFor(dateStr) { return dateStr.slice(0, 7); }

export const DEFAULT_WEEKLY_DIGEST_CONFIG = { sendHourUtc: 23 };

// Mirrors eom-digest-send.mjs's own hourGatePasses() exactly (same shape, own file so a schedule
// change to one never silently changes the other) — explicit `now` so tests can pin an instant.
export function hourGatePasses(sendHourUtc, now = new Date(), force = false) {
  if (force) return true;
  return now.getUTCHours() === sendHourUtc;
}

export async function loadDigestConfig() {
  if (!supabase) return DEFAULT_WEEKLY_DIGEST_CONFIG;
  const { data, error } = await supabase.from('org_config').select('data').eq('key', 'weekly_digest_config').maybeSingle();
  if (error) { console.warn('[weekly-cycle-digest-send] weekly_digest_config load error:', error.message); return DEFAULT_WEEKLY_DIGEST_CONFIG; }
  if (!data?.data) return DEFAULT_WEEKLY_DIGEST_CONFIG;
  const sendHourUtc = Number.isInteger(data.data.sendHourUtc) ? data.data.sendHourUtc : DEFAULT_WEEKLY_DIGEST_CONFIG.sendHourUtc;
  return { sendHourUtc };
}

async function loadOnHandForPeriod(period) {
  if (!supabase) return [];
  const { data, error } = await supabase.from('qsr_onhand').select('loc,cls,wrin,last_counted,active,recipe_item').eq('period', period);
  if (error) { console.warn(`[weekly-cycle-digest-send] qsr_onhand load error for ${period}:`, error.message); return []; }
  return (data || []).map(r => ({ ...r, recipeItem: r.recipe_item }));
}
async function loadOnHandHistoryByPeriod(periods) {
  const out = [];
  for (const p of periods) out.push(await loadOnHandForPeriod(p));
  return out;
}

const STATUS_LABEL = { crit: '🔴 Critical', warn: '🟡 Watch', ok: '🟢 On cycle' };

function storeSectionHtml(name, c) {
  const md = formatWeeklyComplianceReport(c, { storeName: name });
  const headline = md.split('\n').find(l => l.startsWith('**Status:')) || '';
  const exceptions = (c.exceptions || []).map(e => `<li>${e.detail}</li>`).join('');
  return `<div style="margin:10px 0;padding-top:8px;border-top:1px solid #eee">
<h4 style="margin:0 0 4px">${STATUS_LABEL[c.status] || c.status} — ${name}</h4>
<p style="margin:0 0 4px;color:#555;font-size:13px">${headline.replace(/\*\*/g, '')}</p>
${exceptions ? `<ul style="margin:0;padding-left:18px;font-size:12.5px">${exceptions}</ul>` : ''}
</div>`;
}

export function buildWeeklyDigestEmail(storesToday, dateStr) {
  const subject = `Meridian — Weekly Count Cycle Digest: ${storesToday.length} store${storesToday.length === 1 ? '' : 's'} today`;
  const crit = storesToday.filter(s => s.c.status === 'crit').length;
  const warn = storesToday.filter(s => s.c.status === 'warn').length;
  const ok = storesToday.filter(s => s.c.status === 'ok').length;
  const sections = storesToday
    .sort((a, b) => (a.c.status === b.c.status ? 0 : a.c.status === 'crit' ? -1 : b.c.status === 'crit' ? 1 : a.c.status === 'warn' ? -1 : 1))
    .map(s => storeSectionHtml(s.name, s.c)).join('');
  const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:600px">
<h2 style="margin:0 0 4px">Weekly Count Cycle Digest — ${dateStr}</h2>
<p style="margin:0 0 12px;color:#555">${storesToday.length} store${storesToday.length === 1 ? '' : 's'} expected to count today · ${crit} critical · ${warn} watch · ${ok} on cycle</p>
${sections || '<p style="color:#888">No store\'s detected weekly count day is today.</p>'}
</div>`;
  return { subject, html };
}

async function main() {
  const config = await loadDigestConfig();
  const now = new Date();
  if (!FORCE && !hourGatePasses(config.sendHourUtc, now)) {
    console.log(`[weekly-cycle-digest-send] skipping — current UTC hour ${now.getUTCHours()} != configured sendHourUtc ${config.sendHourUtc}. WKDIGEST_FORCE=1 to override.`);
    return;
  }
  const dateStr = businessDate();
  const period = periodFor(dateStr);

  const rowsByPeriod = await loadOnHandHistoryByPeriod(recentPeriodKeys(period, 6));
  const detected = detectWeeklyCountDay(rowsByPeriod);
  // "Utilize both" (owner-directed, 2026-09-01) -- same derived+Organization-Structure-fallback
  // merge as qsrsoft-onhand-pull.mjs's storesCountingToday(), reused via mergeWeeklyCountDay()
  // (src/engine/count-cycle.js) rather than a second copy of the precedence logic.
  const fallback = await loadWeeklyCountDayFallback(supabase);
  const merged = mergeWeeklyCountDay(detected, fallback);
  const todayWd = centralWeekday(now);
  const todayNsns = STORE_NSNS.filter(nsn => {
    // Keyed by UNPADDED loc -- see qsrsoft-onhand-pull.mjs's storesCountingToday() for why a
    // padded lookup here previously matched nothing.
    const loc = String(nsn);
    const d = merged[loc];
    return d && d.weekday === todayWd;
  });
  console.log(`[weekly-cycle-digest-send] date ${dateStr} · ${todayNsns.length}/${STORE_NSNS.length} stores expected to count today`);
  if (!todayNsns.length) { console.log('[weekly-cycle-digest-send] nothing to send'); return; }

  // TODAY's own on-hand rows (the current period's most recent snapshot — the same table the new
  // 'weekly-count-day' pull mode just refreshed for these exact stores) to grade compliance now.
  const currentRows = await loadOnHandForPeriod(period);
  const compliance = cycleCompliance(currentRows, { asOf: dateStr });
  const complianceByLoc = {}; for (const c of compliance) complianceByLoc[c.loc] = c;

  const storesToday = [];
  for (const nsn of todayNsns) {
    const u = unpadLoc(nsn);
    const c = complianceByLoc[u] || complianceByLoc[String(nsn).padStart(7, '0')];
    if (!c) { if (DEBUG) console.log(`[weekly-cycle-digest-send] ${nsn}: no compliance row (no qsr_onhand data this period yet)`); continue; }
    storesToday.push({ name: STORE_NAMES[u] || u, c });
  }
  if (!storesToday.length) { console.log('[weekly-cycle-digest-send] nothing to send — no store had gradable data'); return; }

  const { subject, html } = buildWeeklyDigestEmail(storesToday, dateStr);
  const subs = await loadDigestSubscriberEmails(supabase, 'weekly_cycle_digest');
  const recipients = subs.length ? subs : [EMAIL_TO];
  const results = await Promise.all(recipients.map(to => postResend({ to, subject, html })));
  const ok = results.every(Boolean);
  console.log(`[weekly-cycle-digest-send] ${ok ? '✓ sent' : '✗ FAILED'} — ${storesToday.length} stores, ${recipients.length} recipient${recipients.length === 1 ? '' : 's'}`);
  if (!ok) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error('[weekly-cycle-digest-send] fatal:', err); process.exit(1); });
}
