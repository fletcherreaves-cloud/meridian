// @ts-nocheck
// ── Counting SESSIONS — the binding-final model (Notes 41 refinement, 2026-08-01) ────────────────
// Owner teaching, KB-substantiated:
//   • The QSRSoft Mobile Inventory App counts an item BY AREA. Fries live in 2–3 places (freezer, fry
//     station …), so one honest count of one item is 2–3 submissions. SAVE *adds* to the count (only
//     "Replace Count" overrides) → the ledger shows a running, area-by-area build-up. Art. "Using the
//     Mobile Inventory App" (5624321416471).
//   • Therefore the FIRST entry is never the complete count — only the LAST entry of a session is. For
//     variance, "the most recent count always overrides all previous" → the session's FINAL entry is
//     binding. Earlier entries are process/area steps: keep them for troubleshooting, never grade them.
//   • A count event's `difference` ($) is the IMPACT of that submission (each count resets the expected
//     on-hand), NOT the item's period variance. So a −$1,103 then +$1,106 pair is a normal two-area
//     build-up that nets ≈ $0 — QSRSoft itself calls offsetting +/− swings a counting artifact ("large
//     positive growth and loss offsetting each other … can highlight counting", FOB Variance Card),
//     not real loss. The authoritative number is the period stat variance (qsr_variance_stat).
//
// A "recount" only exists ACROSS sessions: a second, separate count (different day / big time gap) that
// replaces a completed one. Only there does "helped / hurt" apply — final-of-session-N vs final-of-N−1.
// Within a session there is no such thing as hurt/held — that was the bug this module removes.

import { eventTs } from './eom-recount-forensics.js';
import { storeDayWindows, itemRecounts } from './eom-recount-detect.js';

const abs = v => Math.abs(Number(v) || 0);
const ZERO = 1;                         // |$| < ZERO ≈ a $0 net (improbable → soft flag)

// Group an item's count events into sessions. A new session starts when the gap to the previous count
// exceeds `gapHours` (default 4h) — tight enough that an area-by-area burst (minutes apart) stays one
// session, loose enough that a genuine same-day afternoon recount or a next-day recount splits off.
export function itemCountSessions(history, { gapHours = 4, byDay = false } = {}) {
  const counts = (history || [])
    .filter(h => h && h.isCount && h.dt)
    .map(h => ({
      dt: String(h.dt).slice(0, 10), tm: h.tm || null, when: eventTs(h.dt, h.tm),
      dolVar: Number(h.difference) || 0,                         // $ impact of THIS submission
      unitVar: h.variance != null ? Number(h.variance) : null,
      onHand: h.qtyChange != null ? Number(h.qtyChange) : null,  // on-hand value entered at this area
      manager: h.manager || null, method: h.method || h.entryMethod || h.countSource || null,
    }))
    .sort((a, b) => ((a.when ?? 0) - (b.when ?? 0)) || String(`${a.dt} ${a.tm || ''}`).localeCompare(`${b.dt} ${b.tm || ''}`));

  if (!counts.length) return { sessions: [], binding: null, nSessions: 0, nRecounts: 0 };

  // Two grouping modes:
  //  • byDay (Change Monitor): a count SESSION = one day's count-path walkthrough. The counter enters an
  //    item's areas as they walk the store, so entries land hours apart on the SAME day but are ONE count,
  //    not recounts. So all same-day entries = one session; only the last is binding. (A rare same-day
  //    re-count still lands here — the last entry binds either way, which is what QSRSoft honors.)
  //  • gap-based (integrity recount-swing): the tighter time-window (timer proxy) that CAN separate a
  //    deliberate same-day re-count from the walkthrough, for padding/forensic detection.
  const gapMs = gapHours * 3600 * 1000;
  const groups = [];
  for (const c of counts) {
    const g = groups[groups.length - 1];
    const contiguous = byDay
      ? (g && g.day === c.dt)
      : (g && c.when != null && g.lastWhen != null && (c.when - g.lastWhen) <= gapMs);
    if (contiguous) { g.entries.push(c); g.lastWhen = c.when ?? g.lastWhen; g.day = c.dt; }
    else groups.push({ day: c.dt, entries: [c], lastWhen: c.when });
  }

  const sessions = groups.map((g, i) => {
    const entries = g.entries;
    const final = entries[entries.length - 1];
    const netDolVar = entries.reduce((s, e) => s + e.dolVar, 0);   // net $ the whole session moved
    const managers = [...new Set(entries.map(e => e.manager).filter(Boolean))];
    // offsetting = the session's entries swing far but net small → the classic area-by-area build-up
    const grossSwing = entries.reduce((s, e) => s + abs(e.dolVar), 0);
    const offsetting = entries.length > 1 && grossSwing > 0 && abs(netDolVar) < grossSwing * 0.34;
    return {
      index: i, entries, final, nEntries: entries.length,
      start: entries[0], end: final,
      date: final.dt, startTm: entries[0].tm, endTm: final.tm,
      managers, manager: managers[0] || null,
      netDolVar, bindingDolVar: netDolVar, finalOnHand: final.onHand, offsetting,
      areaBuildUp: entries.length > 1,   // multiple submissions in one session = counted area-by-area
    };
  });

  const binding = sessions[sessions.length - 1];   // the last session's net = the binding count
  return { sessions, binding, nSessions: sessions.length, nRecounts: sessions.length - 1 };
}

// One item's session-aware progression. Base = the FIRST completed session; each later SESSION is a
// genuine recount step (helped = its net moved toward zero vs the previous session, hurt = away).
// Shape kept compatible with the old itemVarianceProgression consumers (base/steps/final/nRecounts/
// verdict/flags/netVsBase) so fob-recount-analysis + the view keep working — but now session-correct.
export function itemVarianceProgression(history, { baseIndex = 0, gapHours = 4, byDay = false } = {}) {
  const { sessions, nSessions } = itemCountSessions(history, { gapHours, byDay });
  if (!nSessions) return { sessions: [], counts: [], base: null, steps: [], final: null, nRecounts: 0, verdict: 'none', flags: [] };

  const bi = Math.max(0, Math.min(baseIndex, nSessions - 1));
  const nRecounts = nSessions - 1 - bi;   // recount sessions AFTER the chosen base
  const sessVar = s => ({ dt: s.date, tm: s.endTm, when: s.end.when, dolVar: s.netDolVar, unitVar: s.final.unitVar,
    onHand: s.finalOnHand, manager: s.manager, method: s.final.method, nEntries: s.nEntries, areaBuildUp: s.areaBuildUp, offsetting: s.offsetting, index: s.index });
  const base = sessVar(sessions[bi]);

  const steps = sessions.slice(bi + 1).map((s, k) => {
    const prev = sessVar(sessions[bi + k]);
    const cur = sessVar(s);
    return {
      ...cur,
      dVsBase: cur.dolVar - base.dolVar,
      dVsPrev: cur.dolVar - prev.dolVar,
      towardZero: abs(cur.dolVar) < abs(base.dolVar),
      direction: abs(cur.dolVar) < abs(prev.dolVar) ? 'improved' : abs(cur.dolVar) > abs(prev.dolVar) ? 'hurt' : 'held',
      netImprovedVsBase: abs(base.dolVar) - abs(cur.dolVar),
    };
  });

  const final = sessVar(sessions[nSessions - 1]);
  const netVsBase = final.dolVar - base.dolVar;
  const improvedVsBase = abs(final.dolVar) < abs(base.dolVar);
  const worseVsBase = abs(final.dolVar) > abs(base.dolVar) + ZERO;

  const flags = [];
  // $0 flag only matters for a genuine recount ending ~$0, or a single binding count of ~$0.
  if (abs(final.dolVar) < ZERO) flags.push('zero-variance');
  if (nRecounts >= 1 && worseVsBase) flags.push('recount-worsened');   // a real recount ended worse
  if (nRecounts >= 2 && worseVsBase) flags.push('held-worse');

  const verdict = nRecounts === 0
    ? (sessions[bi].areaBuildUp ? 'counted-multi' : 'single-count')
    : improvedVsBase ? 'improved'
    : worseVsBase ? 'worsened'
    : 'held';

  // legacy `counts` = flat entry list (troubleshooting), preserved for any consumer that wants it
  const counts = sessions.flatMap(s => s.entries);
  return { sessions, counts, base, steps, final, nSessions, nRecounts, netVsBase, improvedVsBase, worseVsBase, verdict, flags };
}

// Roll across a store's raw items, ranked flagged-first then by |net effect|. Optional `statVar` map
// (wrin → authoritative period $ variance from qsr_variance_stat) is attached as `officialVar` so the
// view can headline the real number instead of the count-impact chain.
export function storeVarianceProgressions(rawItems, { minAbs = 25, gapHours = 4, byDay = true, statVar = null, priorStatVar = null } = {}) {
  // Store-level count windows (from ALL items' events) drive the walkthrough-vs-recount split: a long
  // area-by-area walkthrough stays ONE count; a genuine same-day re-verify (a later store window, or a
  // back-office correction) splits off as a graded recount. Cross-day = count progression, not recounts.
  const windows = storeDayWindows(rawItems);
  const out = [];
  for (const it of (rawItems || [])) {
    const p = itemVarianceProgression(it.history, { gapHours, byDay });
    if (!p.base) continue;
    const recount = itemRecounts(it.history, windows);
    const finalVar = p.final ? p.final.dolVar : 0;
    const official = statVar ? (statVar[String(it.wrin)] ?? statVar[it.wrin] ?? null) : null;
    // Prior-EOM anchor (last month's authoritative period variance) → month-over-month trend view.
    const priorVar = priorStatVar ? (priorStatVar[String(it.wrin)] ?? priorStatVar[it.wrin] ?? null) : null;
    if (abs(finalVar) < minAbs && abs(p.base.dolVar) < minAbs && official == null && priorVar == null && !p.flags.length) continue;
    // Period-start anchor: the earliest POS Open reading = beginning inventory (carried from last EOM).
    // Variance reconciles point-to-point from here to the binding count. Same qtyChange unit as counts.
    const opens = (it.history || [])
      .filter(h => h && h.source === 'pos_open' && h.dt)
      .map(h => ({ dt: String(h.dt).slice(0, 10), tm: h.tm || null, when: eventTs(h.dt, h.tm), onHand: h.qtyChange != null ? Number(h.qtyChange) : null }))
      .sort((a, b) => (a.when ?? 0) - (b.when ?? 0));
    const periodStart = opens[0] || null;
    out.push({ wrin: it.wrin, descr: it.descr || it.wrin, cls: it.cls, officialVar: official, priorVar, periodStart, recount, ...p });
  }
  out.sort((a, b) =>
    (b.flags.length - a.flags.length) ||
    (Math.max(abs(b.officialVar), abs(b.final?.dolVar), abs(b.base?.dolVar)) - Math.max(abs(a.officialVar), abs(a.final?.dolVar), abs(a.base?.dolVar))));
  return out;
}
