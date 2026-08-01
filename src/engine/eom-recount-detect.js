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
    if (!h || h.source !== 'inventory' || !h.dt) continue;
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
export function itemRecounts(itemHistory, storeWindows = {}, { minEffect = 1 } = {}) {
  const counts = (itemHistory || [])
    .filter(h => h && h.isCount && h.dt)
    .map(h => ({
      dt: dayOf(h.dt), tm: h.tm || null, when: eventTs(h.dt, h.tm),
      dolVar: Number(h.difference) || 0, unitVar: h.variance != null ? Number(h.variance) : null,
      onHand: h.qtyChange != null ? Number(h.qtyChange) : null,
      manager: h.manager || null, countSource: h.countSource || 'MobileApp',
    }))
    .sort((a, b) => ((a.when ?? 0) - (b.when ?? 0)));
  if (!counts.length) return { days: [], nRecounts: 0, nHelped: 0, nHurt: 0 };

  const byDay = {};
  for (const c of counts) (byDay[c.dt] || (byDay[c.dt] = [])).push(c);

  const days = [];
  for (const day of Object.keys(byDay).sort()) {
    const entries = byDay[day];
    const windows = storeWindows[day] || [];
    for (const e of entries) e.win = windowIndexOf(windows, e.when);
    const firstWin = Math.min(...entries.map(e => e.win));

    // Original count = the item's entries in its FIRST window via the mobile walkthrough. A back-office
    // (non-MobileApp) entry is never "original" — it's a correction. Last original entry binds the day.
    const original = entries.filter(e => e.win === firstWin && !isBackOffice(e.countSource));
    const originalBinding = original.length ? original[original.length - 1] : entries[0];

    // A recount = a later-window entry OR any back-office entry (that isn't the sole original).
    const recountEntries = entries.filter(e => e !== originalBinding && (e.win > firstWin || isBackOffice(e.countSource)))
      .filter(e => !original.includes(e) || isBackOffice(e.countSource));

    let prev = originalBinding;
    const recounts = recountEntries.map(e => {
      const effect = abs(prev.dolVar) - abs(e.dolVar);   // + = toward zero = the recount helped
      const direction = effect > minEffect ? 'helped' : effect < -minEffect ? 'hurt' : 'held';
      const back = isBackOffice(e.countSource);
      const r = {
        dt: e.dt, tm: e.tm, dolVar: e.dolVar, onHand: e.onHand, manager: e.manager, countSource: e.countSource,
        effect, direction, vsPrior: e.dolVar - prev.dolVar,
        signal: back ? `back-office (${e.countSource})` : 'later count window',
        confidence: back ? 'confirmed' : 'likely',
      };
      prev = e; return r;
    });

    days.push({ day, original: originalBinding, recounts, binding: entries[entries.length - 1], nEntries: entries.length });
  }

  const allRe = days.flatMap(d => d.recounts);
  return {
    days, nRecounts: allRe.length,
    nHelped: allRe.filter(r => r.direction === 'helped').length,
    nHurt: allRe.filter(r => r.direction === 'hurt').length,
  };
}
