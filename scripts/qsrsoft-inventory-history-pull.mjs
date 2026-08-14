#!/usr/bin/env node
// scripts/qsrsoft-inventory-history-pull.mjs — QSRSoft eBOS physical-inventory count
// history (per-count-session attribution, incl. who counted) → planned qsr_inventory_counts.
//
// STATUS: Step 0 only (issue #257). This file currently implements ONLY the
// INVHIST_PROBE=1 retention probe — NOT the real pull. The issue is explicit: "Do not
// guess the back-pull shape." The owner cannot reach further back in the UI than some
// unknown limit, and whether that's cosmetic (deep server retention), a real retention
// cutoff (empty 200s past some date), or a server range cap (400/403 on a too-wide
// window) is unknown. Guessing wrong means either under-building (missing months that
// were actually available) or wasting calls hammering a range the server rejects. The
// full pull (table schema, upsert, workflow schedule, sync-failure-watch entry, manual
// upload fallback — CLAUDE.md's standing 5-part rule for a new pull) is sized AFTER this
// probe's verdict is read, in a follow-up commit.
//
// The whole point of this endpoint (PR #273 review, 2026-08-14) is reaching further back
// than the owner's UI allows — so the probe's deliverable is the actual retention DEPTH per
// store, not just "did it respond." A deep answer makes this a backfill; a shallow answer
// capped near the UI's own window makes it a forward-only stream and the priority drops.
// That's why this probes N stores (not just one) and reports depth per store, not a single
// pass/fail: a single store's history only goes back as far as when THAT store started using
// physical-inventory counts in eBOS, which can differ store to store and would otherwise be
// misread as a server-wide retention cutoff.
//
// Endpoint (owner-captured, 2026-08-13):
//   GET https://prod.ebos.qsrsoft.com/api/inv/{nsn}/physinv/inventory_history
//       ?start_busn_dt=YYYY-MM-DD&end_busn_dt=YYYY-MM-DD&select_preset=All
//   Headers: x-auth-token, x-current-nsn: {nsn}, origin: https://v3.myqsrsoft.com
//   → { variance_levels, date_range, select_preset, inv_items: [...] }
// Same eBOS host + token as qsrsoft-onhand-pull.mjs / qsrsoft-variance-pull.mjs /
// qsrsoft-ebos-pull.mjs. eBOS auth is its OWN ladder (QSRSOFT_EBOS_TOKEN + an SSO token
// exchange), distinct from the reporting-API ladder other QSRSoft scripts use (QSRSOFT_TOKEN
// read directly, no exchange) — building against the wrong ladder fails in a way that looks
// like a permissions problem. See scripts/lib/ebos-auth.mjs (shared with this script) for the
// full explanation and the ladder itself — extracted from qsrsoft-variance-pull.mjs's copy so
// this, the fourth eBOS pull, extends the existing pattern instead of re-copying it.
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (unused by the probe itself,
//   kept required so this script's env-var contract matches its siblings from day one).
// Optional:
//   INVHIST_PROBE=1        — run the retention probe instead of (future) real pull. The
//                             real pull path does not exist yet — omitting this currently
//                             does nothing but print a message and exit.
//   INVHIST_PROBE_STORE    — NSN(s) to probe, comma-separated (default: 35064,10422 — a
//                             long-tenured store from the issue's own 13-day sample plus a
//                             second store, so one store's own count-adoption date can't be
//                             mistaken for the server's retention limit).
//   QSRSOFT_DEBUG=1
//
// Token refresh: v3.myqsrsoft.com → Inventory → Physical Inventory History → DevTools →
//   Network → any prod.ebos.qsrsoft.com/api/inv/ request → copy X-Auth-Token → update
//   QSRSOFT_EBOS_TOKEN secret.

import { EBOS_BASE, resolveEbosToken } from './lib/ebos-auth.mjs';
import { withRetry } from './_retry.mjs';

const DEBUG        = process.env.QSRSOFT_DEBUG === '1';
const PROBE_STORES = (process.env.INVHIST_PROBE_STORE || '35064,10422').split(',').map(s => s.trim()).filter(Boolean);

const pad2 = n => String(n).padStart(2, '0');
const fmtDate = d => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
function daysAgo(n) { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return fmtDate(d); }
function today() { return fmtDate(new Date()); }

// ── Probe: one (start, end) window against one store ──────────────────────────────────
// Returns { status, ok, count, sample, error }. Never throws to the caller (withRetry
// already absorbed the transient cases) — the whole point is to observe what the server
// does, including the failure shapes, not to bail on the first one.
async function probeWindowOnce(token, nsn, startDate, endDate) {
  const params = new URLSearchParams({ start_busn_dt: startDate, end_busn_dt: endDate, select_preset: 'All' });
  const url = `${EBOS_BASE}/api/inv/${nsn}/physinv/inventory_history?${params}`;
  if (DEBUG) console.log('[probe] GET', url);
  const resp = await fetch(url, {
    headers: {
      'X-Auth-Token': token, 'X-Current-Nsn': String(nsn), 'Accept': 'application/json',
      'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
    },
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    // Status folded into the message (not just the body) so withRetry's isTransient() regex,
    // which matches on "500"/"502"/etc as bare substrings, can see it — a 5xx here should be
    // retried like any other transient failure; a 400/403 should not (and isn't, by the same
    // regex not matching those codes).
    return { error: `HTTP ${resp.status}: ${body.slice(0, 200)}`, status: resp.status };
  }
  const data = await resp.json();
  const items = Array.isArray(data?.inv_items) ? data.inv_items : [];
  return { status: resp.status, count: items.length, sample: items[0] || null };
}

// A transient network/5xx blip misread as "empty" would corrupt the widen-and-bisect logic
// below into reporting a false retention cutoff — this is not just robustness, it's probe
// correctness. withRetry treats a truthy `.error` matching the transient regex as retryable;
// a non-transient error (400/403, or out of retries) passes straight through.
async function probeWindow(token, nsn, startDate, endDate) {
  const r = await withRetry(() => probeWindowOnce(token, nsn, startDate, endDate),
    { tries: 3, baseMs: 1000, label: `probe ${nsn} ${startDate}..${endDate}` }).catch(e => ({ error: e.message, status: null }));
  if (r.error) return { status: r.status ?? null, ok: false, count: null, error: r.error };
  return { status: r.status, ok: true, count: r.count, sample: r.sample };
}

function logResult(label, start, end, r) {
  if (r.ok) {
    console.log(`[probe] ${label.padEnd(22)} ${start}…${end}  → HTTP ${r.status}  ${r.count} inv_items`);
  } else {
    console.log(`[probe] ${label.padEnd(22)} ${start}…${end}  → HTTP ${r.status ?? 'ERR'}  ${r.error || ''}`);
  }
}

// Narrows the earliest date with data inside [emptyStart, dataStart) by bisecting on whole
// months — matches the issue's own framing ("binary-search the earliest month"), not days;
// day-level precision doesn't matter for sizing a back-pull and would cost 4-5x the requests.
async function bisectEarliestMonth(token, nsn, knownEmptyStart, knownDataStart) {
  let lo = new Date(knownEmptyStart + 'T00:00:00Z');   // known empty (or erroring) at/after this
  let hi = new Date(knownDataStart + 'T00:00:00Z');    // known to have data at/after this
  let iterations = 0;
  const MAX_ITER = 8; // months-of-history range here is small enough that 8 halvings is plenty
  while (iterations < MAX_ITER) {
    const midMs = lo.getTime() + (hi.getTime() - lo.getTime()) / 2;
    const mid = new Date(midMs);
    mid.setUTCDate(1); // month granularity
    if (mid.getTime() <= lo.getTime() || mid.getTime() >= hi.getTime()) break; // converged
    const midStr = fmtDate(mid);
    const monthEnd = fmtDate(new Date(Date.UTC(mid.getUTCFullYear(), mid.getUTCMonth() + 1, 0)));
    const r = await probeWindow(token, nsn, midStr, monthEnd);
    logResult(`bisect (${iterations + 1}/${MAX_ITER})`, midStr, monthEnd, r);
    if (r.ok && r.count > 0) hi = mid; else lo = mid;
    iterations++;
  }
  return fmtDate(hi);
}

// PR #273 review (owner, 2026-08-14): bisectEarliestMonth converges to the earliest EMPTY
// probe it saw and reports the month right after it as "earliest month with data" — but
// physical-inventory counts are weekly (memory/notes-58-queue.md: "every weekly count
// requires a full Food AND Condiment count"), so a single missed count-week can make a real
// data month read as empty and make bisect converge later than the true floor, silently
// under-reporting retention depth. A false-shallow answer turns a backfill candidate into a
// "forward-only, priority drops" verdict — the failure mode that matters most for a probe
// whose whole purpose is measuring depth. Confirms from the other side: after convergence,
// probe the month immediately before the reported answer and the month before that. Both
// empty confirms the boundary (~4 count sessions per probed month makes an all-empty pair
// a real signal, not sampling noise). Either returning data means the initial bisect
// stopped early — re-bisects once more between a widened empty bound and the earliest
// confirmed-data point found, bounded to one extra pass rather than recursing indefinitely.
async function confirmEarliestMonth(token, nsn, earliestMonth) {
  const base = new Date(earliestMonth + 'T00:00:00Z');
  const monthWindow = (n) => {
    const m = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - n, 1));
    return { start: fmtDate(m), end: fmtDate(new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0))) };
  };
  const oneBefore = monthWindow(1);
  const twoBefore = monthWindow(2);
  const rOne = await probeWindow(token, nsn, oneBefore.start, oneBefore.end);
  logResult('confirm boundary -1mo', oneBefore.start, oneBefore.end, rOne);
  const rTwo = await probeWindow(token, nsn, twoBefore.start, twoBefore.end);
  logResult('confirm boundary -2mo', twoBefore.start, twoBefore.end, rTwo);
  const oneHasData = rOne.ok && rOne.count > 0;
  const twoHasData = rTwo.ok && rTwo.count > 0;
  if (!oneHasData && !twoHasData) return { earliestMonth, confirmed: true };

  const newDataStart = twoHasData ? twoBefore.start : oneBefore.start;
  const widenedEmpty = monthWindow(3);
  console.log(`[probe] ${nsn}: boundary NOT confirmed — data found before the reported floor; re-bisecting from ${widenedEmpty.start}…${newDataStart}`);
  const corrected = await bisectEarliestMonth(token, nsn, widenedEmpty.start, newDataStart);
  return { earliestMonth: corrected, confirmed: false, correctedFrom: earliestMonth };
}

const WINDOWS = [
  { label: 'last 30 days',  start: daysAgo(30),  end: today() },
  { label: 'last 90 days',  start: daysAgo(90),  end: today() },
  { label: 'last 180 days', start: daysAgo(180), end: today() },
  { label: 'last 365 days', start: daysAgo(365), end: today() },
  { label: 'full 2025',     start: '2025-01-01', end: '2025-12-31' },
  { label: 'full 2024',     start: '2024-01-01', end: '2024-12-31' },
  { label: 'full 2023',     start: '2023-01-01', end: '2023-12-31' },
  { label: 'full 2022',     start: '2022-01-01', end: '2022-12-31' },
  { label: 'full 2021',     start: '2021-01-01', end: '2021-12-31' },
  { label: 'full 2020',     start: '2020-01-01', end: '2020-12-31' },
];

// Widens from a known-good recent window outward for ONE store. Order matters: stop early
// (after two consecutive non-productive windows) so a hard retention cutoff or server cap
// doesn't cost N wasted requests once the boundary is already known. Returns a verdict object
// (not just prints it) so the caller can build a cross-store summary at the end.
async function probeStore(token, nsn) {
  console.log(`\n[probe] ── store ${nsn} ──`);
  const results = [];
  let consecutiveDead = 0;
  for (const w of WINDOWS) {
    const r = await probeWindow(token, nsn, w.start, w.end);
    logResult(w.label, w.start, w.end, r);
    results.push({ ...w, ...r });
    const dead = !r.ok || r.count === 0;
    consecutiveDead = dead ? consecutiveDead + 1 : 0;
    if (consecutiveDead >= 2) { console.log('[probe] two consecutive empty/erroring windows — stopping the widen for this store'); break; }
  }

  const lastGoodWithData = [...results].reverse().find(r => r.ok && r.count > 0);
  const firstDeadAfterGood = results.find((r, i) => i > 0 && results[i - 1] === lastGoodWithData && (!r.ok || r.count === 0));
  const anyServerError = results.find(r => !r.ok && r.status && r.status !== 200);

  if (!lastGoodWithData) {
    const msg = `no window returned data at all — even the last-30-days window was empty/erroring`;
    console.log(`[probe] ${nsn} verdict: ${msg}`);
    return { nsn, kind: 'no-data', summary: msg };
  }
  if (anyServerError && anyServerError.start <= lastGoodWithData.start) {
    const msg = `server range cap — HTTP ${anyServerError.status} on "${anyServerError.label}" (${anyServerError.start}…${anyServerError.end}); widest confirmed-working window "${lastGoodWithData.label}" (${lastGoodWithData.count} inv_items)`;
    console.log(`[probe] ${nsn} verdict: ${msg}`);
    return { nsn, kind: 'range-cap', summary: msg, widestWindow: lastGoodWithData.label };
  }
  if (firstDeadAfterGood && firstDeadAfterGood.ok && firstDeadAfterGood.count === 0) {
    console.log(`[probe] ${nsn}: retention cutoff between "${lastGoodWithData.label}" (has data) and "${firstDeadAfterGood.label}" (empty) — bisecting…`);
    const bisected = await bisectEarliestMonth(token, nsn, firstDeadAfterGood.start, lastGoodWithData.start);
    const confirmation = await confirmEarliestMonth(token, nsn, bisected);
    const msg = confirmation.confirmed
      ? `retention cutoff — earliest month with data (confirmed): ${confirmation.earliestMonth}`
      : `retention cutoff — earliest month with data (confirmed): ${confirmation.earliestMonth} (corrected from initial bisect answer ${confirmation.correctedFrom} — data found before it on the boundary check)`;
    console.log(`[probe] ${nsn} verdict: ${msg}`);
    return { nsn, kind: 'cutoff', summary: msg, earliestMonth: confirmation.earliestMonth, confirmed: confirmation.confirmed };
  }
  const deepest = WINDOWS[WINDOWS.length - 1];
  const msg = `deep — every probed window returned data, back to "${deepest.label}" (${deepest.start})`;
  console.log(`[probe] ${nsn} verdict: ${msg}`);
  return { nsn, kind: 'deep', summary: msg, deepestConfirmed: deepest.start };
}

async function runProbe() {
  const token = await resolveEbosToken();
  if (!token) { console.error('[invhist-pull] ✗ no eBOS token'); process.exit(1); }
  console.log(`[probe] stores [${PROBE_STORES.join(', ')}] — widening-window retention probe, ${today()} UTC`);

  const perStore = [];
  for (const nsn of PROBE_STORES) perStore.push(await probeStore(token, nsn));

  console.log('\n═══ VERDICT (per store) ═══');
  for (const v of perStore) console.log(`  ${v.nsn}: ${v.summary}`);

  const anyDeep = perStore.some(v => v.kind === 'deep');
  const allCutoffOrCap = perStore.length > 0 && perStore.every(v => v.kind === 'cutoff' || v.kind === 'range-cap');
  console.log('');
  if (anyDeep) {
    console.log('At least one store returned data all the way to the oldest probed window — real retention likely goes deep. This is a BACKFILL candidate. Re-run with earlier years hand-added to WINDOWS to confirm how much further back it goes before sizing the pull.');
  } else if (allCutoffOrCap) {
    console.log('Every store hit a retention cutoff or server cap within the probed range. If the earliest months line up across stores, that is likely the server\'s real limit (a FORWARD-ONLY stream, priority drops); if they differ per store, it is more likely each store\'s own count-adoption date, not a server limit — worth probing one or two more long-tenured stores before concluding either way.');
  } else {
    console.log('Mixed or inconclusive result across stores — read the per-store verdicts above before deciding backfill vs. forward-only.');
  }
  console.log('═══════════════════════════');
}

async function main() {
  if (process.env.INVHIST_PROBE === '1') { await runProbe(); return; }
  console.log('[invhist-pull] INVHIST_PROBE=1 not set — the real pull is not built yet (issue #257 step 0). Nothing to do.');
}

main().catch(err => { console.error('[invhist-pull] fatal:', err); process.exit(1); });
