// @ts-nocheck
// ── Recount detection & grading (owner-finalized model, 2026-08-01) ──────────────────────────────
// A count DAY = the original count session (the walkthrough) + optionally N deliberate recounts (the
// manager re-verifies a flagged item after reviewing the variance). We detect the recounts and GRADE
// them (did re-verifying move the variance toward zero → good diagnosing, or away → hurt). Last entry
// still binds; cross-day counts are the count PROGRESSION (weekly cadence), NEVER recounts.
//
// The split (walkthrough vs recount) uses STORE-LEVEL count windows, not a per-item time gap:
//   • the store's whole count timeline for a day clusters into a MAIN count window (dense, continuous —
//     the walkthrough) and, after a real gap, one or more RECOUNT PASSES (sparse, later re-verifies).
//   • An item's entries in its FIRST window = the original count (last of that window binds); entries in
//     a LATER window = recounts. This keeps a long area-by-area walkthrough (hours, same window) as ONE
//     count while splitting a genuine recount off.
// Recount signals (confidence order): (1) countSource ≠ MobileApp (BOS/Web/InfoRecorder = a back-office
// correction) → CONFIRMED; (2) a later store window → LIKELY; (3) replace-not-accumulate → LIKELY.
// See memory/reference-inventory-count-mechanics.

import { eventTs } from './eom-recount-forensics.js';

const abs = v => Math.abs(Number(v) || 0);
// A MobileApp recount must be ≥ this long after the count it re-verifies — otherwise a slow area-by-area
// walkthrough (areas entered hours apart, e.g. Lindsay COKE/BIB at 2h21m) gets mis-split into a "recount".
// A genuine re-verify is "counted, walked away, came back". Back-office corrections are recounts at any gap.
const RECOUNT_MIN_GAP_MS = 4 * 3600 * 1000;   // 4h
const DEFAULT_FLOOR = 25;                       // $ materiality floor for grading (matches the change-monitor)

// Unit cost for an item, from difference = variance × unit cost (proven on Durant). Used to convert an
// on-hand delta into a variance-$ delta when anchoring the grade to the authoritative period variance.
function unitCostOf(counts) {
  for (const c of (counts || [])) if (c.unitVar && Math.abs(c.unitVar) > 1e-6 && c.dolVar) return abs(c.dolVar / c.unitVar);
  return null;
}
const dayOf = d => {                     // normalize MM/DD/YYYY or ISO → YYYY-MM-DD
  const s = String(d || '');
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}` : s.slice(0, 10);
};
const isBackOffice = src => !!src && String(src).toLowerCase() !== 'mobileapp';

// Store-level count windows per day, from ALL items' inventory events. A window = a run of count
// activity; a gap > gapMin minutes between consecutive events starts a NEW window (a recount pass).
export function storeDayWindows(rawItems, { gapMin = 90 } = {}) {
  const byDay = {};
  for (const it of (rawItems || [])) for (const h of (it.history || [])) {
    if (!h || !h.dt || !(h.source === 'inventory' || h.isCount)) continue;   // count events only
    const when = eventTs(h.dt, h.tm);
    if (when == null) continue;
    (byDay[dayOf(h.dt)] || (byDay[dayOf(h.dt)] = [])).push(when);
  }
  const gapMs = gapMin * 60 * 1000;
  const out = {};
  for (const day of Object.keys(byDay)) {
    const times = byDay[day].sort((a, b) => a - b);
    const windows = [];
    for (const t of times) {
      const w = windows[windows.length - 1];
      if (w && t - w.end <= gapMs) { w.end = t; w.n++; }
      else windows.push({ idx: windows.length, start: t, end: t, n: 1 });
    }
    // the densest window is the main count; every window AFTER it is a recount pass.
    let mainIdx = 0; for (const w of windows) if (w.n > windows[mainIdx].n) mainIdx = w.idx;
    for (const w of windows) w.isMain = w.idx === mainIdx;
    out[day] = windows;
  }
  return out;
}

// Which store-window a timestamp belongs to (the window whose range contains it, else the latest window
// it comes at/after). Returns the window idx, or 0 if there are no windows.
function windowIndexOf(windows, when) {
  if (!windows || !windows.length) return 0;
  for (const w of windows) if (when >= w.start && when <= w.end) return w.idx;
  let idx = 0; for (const w of windows) if (when >= w.start) idx = w.idx;
  return idx;
}

// Per-item recount analysis for the period. storeWindows = storeDayWindows(...) for this item's store.
// Returns per count-DAY: the original binding + a graded recount CHAIN (each vs the prior state), plus
// period totals. Cross-day = the count progression (each day's binding), not recounts.
export function itemRecounts(itemHistory, storeWindows = {}, { officialVar = null, floor = DEFAULT_FLOOR } = {}) {
  const counts = (itemHistory || [])
    .filter(h => h && h.isCount && h.dt)
    .map(h => ({
      dt: dayOf(h.dt), tm: h.tm || null, when: eventTs(h.dt, h.tm),
      dolVar: Number(h.difference) || 0, unitVar: h.variance != null ? Number(h.variance) : null,
      onHand: h.qtyChange != null ? Number(h.qtyChange) : null,
      manager: h.manager || null, countSource: h.countSource || 'MobileApp',
      sourceId: h.sourceId != null ? Number(h.sourceId) : null,
    }))
    // Order by business time, then source_id (creation order) so same-minute entries bind deterministically.
    .sort((a, b) => ((a.when ?? 0) - (b.when ?? 0)) || ((a.sourceId ?? 0) - (b.sourceId ?? 0)));
  if (!counts.length) return { days: [], nRecounts: 0, nHelped: 0, nHurt: 0, nEomRecounts: 0, nEomHelped: 0, nEomHurt: 0, eomRecounts: [], eomDay: null };

  const cost = unitCostOf(counts);
  const byDay = {};
  for (const c of counts) (byDay[c.dt] || (byDay[c.dt] = [])).push(c);
  const dayKeys = Object.keys(byDay).sort();
  const lastDay = dayKeys[dayKeys.length - 1];

  const days = [];
  for (const day of dayKeys) {
    const entries = byDay[day];
    const windows = storeWindows[day] || [];
    for (const e of entries) e.win = windowIndexOf(windows, e.when);
    const firstWin = Math.min(...entries.map(e => e.win));
    const binding = entries[entries.length - 1];
    const isEom = day === lastDay;

    // Original count = the item's entries in its FIRST window via the mobile walkthrough. A back-office
    // (non-MobileApp) entry is never "original" — it's a correction. Last original entry binds the day.
    const original = entries.filter(e => e.win === firstWin && !isBackOffice(e.countSource));
    const originalBinding = original.length ? original[original.length - 1] : entries[0];

    // A recount = a back-office correction (any gap), OR a genuine re-verify: a later-window entry that
    // lands ≥ RECOUNT_MIN_GAP after the count it follows. The gap guard stops a slow area-by-area
    // walkthrough (areas hours apart, straddling the store's window boundary) from reading as a recount.
    const recountEntries = entries.filter(e => {
      if (e === originalBinding || original.includes(e)) return isBackOffice(e.countSource) && e !== originalBinding;
      if (isBackOffice(e.countSource)) return true;
      if (e.win <= firstWin) return false;
      return e.when != null && originalBinding.when != null && (e.when - originalBinding.when) >= RECOUNT_MIN_GAP_MS;
    });

    // Grade against the AUTHORITATIVE period variance (spec, owner-approved): only the ending on-hand
    // differs between two counts, and variance is linear in ending inventory, so var_at(onHand) =
    // officialVar + (onHand − onHandFinal) × cost. Helped = |var| moved toward zero. Anchored only on the
    // EOM/binding day (officialVar corresponds to the period binding); earlier days = direction-only.
    const anchored = isEom && officialVar != null && cost != null && binding.onHand != null;
    const varAt = oh => officialVar + (oh - binding.onHand) * cost;
    let prev = originalBinding;
    const recounts = recountEntries.map(e => {
      const back = isBackOffice(e.countSource);
      let direction, deltaDollars, basis;
      if (anchored && e.onHand != null && prev.onHand != null) {
        const vPrev = varAt(prev.onHand), vCur = varAt(e.onHand);
        deltaDollars = abs(vPrev) - abs(vCur);                       // + = toward zero = helped
        direction = deltaDollars > floor ? 'helped' : deltaDollars < -floor ? 'hurt' : 'held';
        basis = 'anchored';
      } else {                                                        // variance not posted (or earlier day)
        direction = 'pending';                                       // don't invent a helped/hurt grade
        deltaDollars = (e.onHand != null && prev.onHand != null && cost != null) ? (e.onHand - prev.onHand) * cost : (e.dolVar - prev.dolVar);
        basis = 'direction-only';
      }
      const r = {
        dt: e.dt, tm: e.tm, when: e.when, dolVar: e.dolVar, onHand: e.onHand, manager: e.manager, countSource: e.countSource,
        prevDolVar: prev.dolVar, prevOnHand: prev.onHand, prevManager: prev.manager, prevWhen: prev.when,
        direction, deltaDollars, basis, vsPrior: e.dolVar - prev.dolVar,
        signal: back ? `back-office (${e.countSource})` : 'later count window (≥4h)',
        confidence: back ? 'confirmed' : 'likely',
      };
      prev = e; return r;
    });

    days.push({ day, original: originalBinding, recounts, binding, nEntries: entries.length });
  }

  const allRe = days.flatMap(d => d.recounts);
  // Period-specific view (owner, 2026-08-01): when the period is EOM/monthly, the only recount that MATTERS
  // for grading is a same-day recount on the FINAL (EOM-binding) count day. Recounts on earlier weekly
  // count-days are informational (that count doesn't bind the period). `eom*` = the binding-day recount(s).
  const eomDay = days.length ? days[days.length - 1] : null;
  const eomRecounts = eomDay ? eomDay.recounts : [];
  return {
    days, nRecounts: allRe.length,
    nHelped: allRe.filter(r => r.direction === 'helped').length,
    nHurt: allRe.filter(r => r.direction === 'hurt').length,
    // Binding-day (EOM) recounts — the period-specific set to grade/surface.
    eomDay: eomDay ? eomDay.day : null, eomRecounts,
    nEomRecounts: eomRecounts.length,
    nEomHelped: eomRecounts.filter(r => r.direction === 'helped').length,
    nEomHurt: eomRecounts.filter(r => r.direction === 'hurt').length,
  };
}
