#!/usr/bin/env node
// scripts/qsrsoft-onhand-pull.mjs — QSRSoft On-Hand Inventory sync (EOM count-progress)
//
// Pulls the On-Hand raw-items report from prod.ebos.qsrsoft.com for all 27 stores.
// On-Hand is the count-progress signal: each item's last_counted / last_submitted
// date tells us if/when it was counted. During the last 3 days of the month we pull
// hourly so we can see when each store finishes its EOM count.
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
import { COVER_FRAC, sessionKind } from '../src/engine/count-cycle.js';
import { createClient } from '@supabase/supabase-js';
// Reuse the SAME count-progress engine the app uses (pure ESM, zero drift).
import { computeCountProgress, BELIEVES_DONE_PCT } from '../src/engine/eom-inventory.js';

const EBOS_BASE   = 'https://prod.ebos.qsrsoft.com';
const EBOS_ORG_ID = 'a546d4ef-684a-4f25-8bc0-6580af068875';
const DEBUG       = process.env.QSRSOFT_DEBUG === '1';
const FORCE       = process.env.ONHAND_FORCE === '1';
const TYPES       = (process.env.ONHAND_TYPES || 'F,C,P,N').split(',').map(s => s.trim()).filter(Boolean);

const STORE_NSNS = [
  3708, 5183, 5985, 6178, 6838, 6972,
  10034, 10422, 10915, 11657, 13113, 18213,
  20475, 24471, 29760, 31357, 32525, 33109,
  33222, 33704, 34222, 35064, 35242, 37566,
  38609, 43380, 43701,
];

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ── Date + count-window helpers ───────────────────────────────────────────────
const pad2 = n => String(n).padStart(2, '0');
const fmtDate = d => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;

function businessDate() {
  return process.env.ONHAND_DATE || fmtDate(new Date());
}
function periodFor(dateStr) {
  return process.env.ONHAND_PERIOD || dateStr.slice(0, 7); // 'YYYY-MM'
}

// True only in the last 3 calendar days of the month.
function inCountWindow() {
  const now = new Date();
  const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  return now.getUTCDate() >= lastDay - 2;
}

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
// count during the day, so hourly pulls overnight are wasted egress + noise. 8am–6pm CT,
// DST-safe via America/Chicago. A manual/on-demand run (FORCE=1) overrides this anytime.
const CT_START = Number(process.env.ONHAND_CT_START ?? 8);
const CT_END = Number(process.env.ONHAND_CT_END ?? 18);
function centralHour() {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false }).format(new Date()));
}
function inCtBusinessHours() { const h = centralHour(); return h >= CT_START && h < CT_END; }
// Should this invocation do a pull at all, and in which mode?
function runMode() {
  if (FORCE) return 'forced';
  if (inCountWindow()) return inCtBusinessHours() ? 'count-window' : null; // hourly, last 3 days, 8a–6p CT only
  if (isProgressSnapshotHour()) return 'progress'; // one daily snapshot, year-round
  return null;                                   // skip
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
  return Array.isArray(data?.on_hand_records) ? data.on_hand_records : [];
}

const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
// "07/21/2026 08:59" → "2026-07-21"
function toISODate(v) {
  if (!v) return null;
  const m = String(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${pad2(+m[1])}-${pad2(+m[2])}` : null;
}

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
    last_counted:   toISODate(item.last_counted),
    last_submitted: toISODate(item.last_submitted),
    updated_at:     new Date().toISOString(),
  };
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

// Build the per-store status row from the app's engine (zero drift), preserving
// human-set fields and firing the ~90% "believes done" trigger exactly once.
function buildStatusRow(loc, period, ohRows, prev) {
  const p = computeCountProgress(ohRows, { period, asOf: new Date() });
  const believes = p.itemsTotal > 0 && p.pctCounted >= BELIEVES_DONE_PCT;
  const alreadyNotified = prev?.notified_90 === true;
  const fireNow = believes && !alreadyNotified;
  return {
    loc, period,
    items_total:      p.itemsTotal,
    items_counted:    p.itemsCounted,
    pct_counted:      p.pctCounted,
    food_done:        !!p.byClass.food?.done,
    condiment_done:   !!p.byClass.condiment?.done,
    paper_done:       !!p.byClass.paper?.done,
    nonproduct_done:  !!p.byClass.nonproduct?.done,
    last_activity_at: p.lastActivityAt instanceof Date ? p.lastActivityAt.toISOString() : (prev?.last_activity_at ?? null),
    notified_90:      alreadyNotified || fireNow,
    notified_at:      fireNow ? new Date().toISOString() : (prev?.notified_at ?? null),
    // preserve human-set fields
    diagnosis_status: prev?.diagnosis_status ?? 'pending',
    comms_status:     prev?.comms_status ?? 'none',
    comms_recipient:  prev?.comms_recipient ?? null,
    comms_sent_at:    prev?.comms_sent_at ?? null,
    comms_note:       prev?.comms_note ?? null,
    fob_pct:          prev?.fob_pct ?? null,
    total_fc_pct:     prev?.total_fc_pct ?? null,
    updated_at:       new Date().toISOString(),
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

async function main() {
  const mode = runMode();
  if (!mode) {
    console.log(`[onhand-pull] skipping — outside count window and not the daily progress-snapshot hour (${PROGRESS_SNAPSHOT_HOUR}:00 UTC). ONHAND_FORCE=1 to override.`);
    return;
  }
  const dateStr = businessDate();
  const period  = periodFor(dateStr);
  let token = await resolveEbosToken();
  const prevStatus = await loadExistingStatus(period);
  console.log(`[onhand-pull] mode=${mode} · date ${dateStr} · period ${period} · types [${TYPES.join(',')}] × ${STORE_NSNS.length} stores`);

  let totalSaved = 0, storesWithData = 0, authFailed = false;
  const statusRows = [];
  const progressLog = [];   // timestamped per-store completion snapshots (one row / store / hour)
  const sessionRows = [];   // append-only count-session history (one row / store / count date / class)
  for (const nsn of STORE_NSNS) {
    if (authFailed) break;
    const rows = [];
    for (const type of TYPES) {
      try {
        const items = await fetchOnHand(token, nsn, dateStr, type);
        rows.push(...items.map(it => mapOnHandRow(it, nsn, period)).filter(r => r.wrin));
      } catch (e) {
        if (e.message.startsWith('AUTH_FAILED')) { authFailed = true; console.error('[onhand-pull] auth failed — refresh QSRSOFT_EBOS_TOKEN'); break; }
        console.warn(`  ${nsn} type ${type}: ${e.message}`);
      }
    }
    // de-dup by wrin within the store (a wrin should map to one class)
    const byWrin = new Map();
    for (const r of rows) byWrin.set(r.wrin, r);
    const deduped = [...byWrin.values()];
    if (deduped.length) {
      totalSaved += await upsertRows(deduped);
      storesWithData++;
      const loc = String(nsn).padStart(7, '0');
      // engine expects camelCase (lastCounted as Date); map from the DB-shaped rows
      const ohForEngine = deduped.map(r => ({
        wrin: r.wrin, cls: r.cls, onHandAmt: r.on_hand_amt, unitPrice: r.unit_price, totalUnits: r.total_units,
        cases: r.cases, packs: r.packs, loose: r.loose,
        lastCounted: r.last_counted ? new Date(r.last_counted + 'T00:00:00') : null,
        lastSubmitted: r.last_submitted ? new Date(r.last_submitted + 'T00:00:00') : null,
      }));
      const st = buildStatusRow(loc, period, ohForEngine, prevStatus[loc]);
      if (st._fireNow) console.log(`  🔔 ${nsn}: crossed ${Math.round(BELIEVES_DONE_PCT * 100)}% — store believes count is done`);
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

  console.log(`[onhand-pull] ✓ ${totalSaved} item-rows across ${storesWithData} stores for ${period}`);
  if (authFailed) process.exit(1);
}

main().catch(err => { console.error('[onhand-pull] fatal:', err); process.exit(1); });

// ── Count-session derivation ─────────────────────────────────────────────────
// Groups a store's on-hand rows into sessions by last_counted, one row per class, and
// tags coverage using the SAME threshold as src/engine/count-cycle.js. Imported from the
// engine rather than redefined so the script and the UI can never disagree about what
// "a complete count" means.
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
    const kind = sessionKind(date, covered, n);
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
