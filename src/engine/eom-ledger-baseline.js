// @ts-nocheck
// ── Ledger-derived baseline — the CLOSE-WINDOW model (the manual-lock replacement) ───────────────
// Owner insight (2026-08-01): the frozen snapshot recorded $0 baselines because it captured the ledger
// variance asOf-lock-time, before stores had counted. The variance was never missing — the ledger logs it
// the instant a count is submitted. So we DON'T freeze; we DERIVE from the ledger. Refined 2026-08-02:
//
//   Within the EOM CLOSE WINDOW (the last ~few days), an item's FIRST count = its SESSION count (the
//   baseline we'd flag it on), and any LATER count in the window = a RECOUNT (they went back and re-verified
//   before EOD). baseline = session-day binding; current = final-day binding; a store "did a recount" when an
//   item was counted on ≥2 days in the window. This also SIMULATES a live close from historical data — e.g.
//   Ada 07/30 session → 07/31 recounts (SWEETENER 129→22, ICE CREAM 171→40 …) all graded helped.
//
// Weekly progression BEFORE the close window (07/02, 09, 16, 23) is excluded — it's not a recount.
// Same-day area entries collapse to that day's binding (last count of the day). Pure + unit-tested.
// See docs/eom-recount-grading-spec.md §5b and memory/project-count-cycle-vision.md.

const abs = v => Math.abs(Number(v) || 0);
export const LEDGER_MATERIAL_FLOOR = 25;   // $ a move must clear to grade helping/hurting (matches change-monitor)

// helping = |current| moved toward zero by ≥ floor; hurting = away; flat within floor. No 'var posted'
// case is needed — a ledger baseline is never a false $0 (that was the snapshot bug this replaces).
function verdict(baseVar, curVar, floor) {
  if (baseVar == null || curVar == null) return 'unknown';
  const b = abs(baseVar), c = abs(curVar);
  if (c < b - floor) return 'helping';
  if (c > b + floor) return 'hurting';
  return 'flat';
}

// Normalize MM/DD/YYYY or ISO → YYYY-MM-DD (the ledger stores MM/DD/YYYY; a caller may pass either).
const isoDay = d => {
  const s = String(d || '');
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : s.slice(0, 10);
};
const tsOf = (dt, tm) => {
  const d = isoDay(dt); if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return 0;
  const [y, mo, da] = d.split('-').map(Number);
  const t = String(tm || '').match(/^(\d{1,2}):(\d{2})/);
  return new Date(y, mo - 1, da, t ? +t[1] : 0, t ? +t[2] : 0).getTime();
};
// The close window = the last `days` calendar days of a YYYY-MM period (default 3). During a live close the
// caller can pass the real count-window start; for a historical simulation this brackets the EOM count+recounts.
export function closeWindowStartFor(period, days = 3) {
  const m = String(period || '').match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return null;
  const y = +m[1], mo = +m[2];
  const lastDay = new Date(y, mo, 0).getDate();
  const start = Math.max(1, lastDay - days + 1);
  return `${y}-${String(mo).padStart(2, '0')}-${String(start).padStart(2, '0')}`;
}

// Ledger-derived close-window diff for ONE store.
//   rawItems         — qsr_raw_item_detail rows for the store
//   closeWindowStart — first day of the EOM close window (ISO or MM/DD/YYYY). Counts on/after = the EOM
//                      count + recounts; the first is the session, later days are recounts.
// Per-ITEM close-window recount analysis from a raw count history. Reusable so the Progression view and
// the Baseline-diff share ONE definition of "was a recount detected". Returns the session vs final binding,
// the graded recount chain, and a recounted flag (counted on ≥2 days in the close window). null if no counts.
export function itemCloseWindowRecount(history, { closeWindowStart = null, floor = LEDGER_MATERIAL_FLOOR } = {}) {
  const winStart = closeWindowStart ? isoDay(closeWindowStart) : null;
  const counts = (history || []).filter(h => h && h.isCount && h.dt).map(h => ({
    day: isoDay(h.dt), when: tsOf(h.dt, h.tm), tm: h.tm || null,
    dolVar: Number(h.difference) || 0, unitVar: h.variance != null ? Number(h.variance) : null,
    onHand: h.qtyChange != null ? Number(h.qtyChange) : null, manager: h.manager || null, countSource: h.countSource || 'MobileApp',
  })).sort((a, b) => a.when - b.when);
  if (!counts.length) return null;
  // Day-bindings: the last count of each day (same-day area entries collapse to the binding).
  const byDay = {}; for (const c of counts) byDay[c.day] = c;
  const allDayBindings = Object.keys(byDay).sort().map(d => byDay[d]);
  const winBindings = winStart ? allDayBindings.filter(b => b.day >= winStart) : allDayBindings;
  // If never counted in the close window, its EOM number = its last overall count → flat, not recounted.
  const usable = winBindings.length ? winBindings : allDayBindings.slice(-1);
  const sessionB = usable[0], finalB = usable[usable.length - 1];
  const recounted = winBindings.length >= 2;
  // Recount chain: session → each later window day, graded toward zero (captures MULTIPLE recounts).
  const recounts = []; let prev = sessionB;
  for (const b of usable.slice(1)) {
    const delta = abs(prev.dolVar) - abs(b.dolVar);   // + = toward zero = helped
    recounts.push({ day: b.day, tm: b.tm, dolVar: b.dolVar, onHand: b.onHand, manager: b.manager, countSource: b.countSource,
      direction: delta > floor ? 'helped' : delta < -floor ? 'hurt' : 'held', deltaDollars: delta, prevDolVar: prev.dolVar });
    prev = b;
  }
  return {
    sessionB, finalB, baseVar: sessionB.dolVar, curVar: finalB.dolVar,
    baseCounted: sessionB.day, curCounted: finalB.day,
    recounted, nRecounts: recounts.length, recounts,
    nRecHelped: recounts.filter(r => r.direction === 'helped').length,
    nRecHurt: recounts.filter(r => r.direction === 'hurt').length,
    verdict: verdict(sessionB.dolVar, finalB.dolVar, floor),
  };
}

export function ledgerBaselineDiff(rawItems, { closeWindowStart = null, officialVarByWrin = {}, floor = LEDGER_MATERIAL_FLOOR } = {}) {
  const winStart = closeWindowStart ? isoDay(closeWindowStart) : null;
  const items = [];
  for (const it of (rawItems || [])) {
    const r = itemCloseWindowRecount(it.history, { closeWindowStart: winStart, floor });
    if (!r) continue;
    const official = officialVarByWrin[String(it.wrin)] ?? officialVarByWrin[it.wrin] ?? null;
    items.push({
      wrin: String(it.wrin), descr: it.descr || String(it.wrin), cls: it.cls || null,
      baseVar: r.baseVar, curVar: r.curVar, dVar: r.curVar - r.baseVar, dMag: abs(r.curVar) - abs(r.baseVar),
      baseQtyVar: r.sessionB.unitVar, curQtyVar: r.finalB.unitVar,
      verdict: r.verdict, recounted: r.recounted, nRecounts: r.nRecounts, recounts: r.recounts,
      nRecHelped: r.nRecHelped, nRecHurt: r.nRecHurt, isNew: false, isGone: false,
      baseCounted: r.baseCounted, curCounted: r.curCounted, officialVar: official,
    });
  }
  items.sort((a, b) => abs(b.dMag || 0) - abs(a.dMag || 0));
  const helped = items.filter(i => i.verdict === 'helping');
  const hurt = items.filter(i => i.verdict === 'hurting');
  return {
    items, closeWindowStart: winStart,
    nHelped: helped.length, nHurt: hurt.length,
    nRecounted: items.filter(i => i.recounted).length,
    helpedDol: helped.reduce((s, i) => s + Math.max(0, abs(i.baseVar) - abs(i.curVar)), 0),
    hurtDol: hurt.reduce((s, i) => s + Math.max(0, abs(i.curVar) - abs(i.baseVar)), 0),
    anyMove: helped.length + hurt.length > 0,
  };
}

// Diff a whole SCOPE from the ledger — the lock-free replacement for diffScope (spec §5b). Returns the
// same shape the Change-Monitor view already renders, plus a per-store engagement verdict.
//   rawByLoc — { normLoc → rawItems[] } (already loaded for the Progression view)
//   perLoc   — { normLoc → { name, countCompleteDate, statVar:{wrin→$}, baseFobPct, curFobPct, basePct, curPct } }
export function ledgerScopeDiff(rawByLoc = {}, perLoc = {}, { floor = LEDGER_MATERIAL_FLOOR } = {}) {
  const norm = s => String(s || '').replace(/^0+/, '') || String(s || '');
  const stores = [];
  for (const [loc, rawItems] of Object.entries(rawByLoc)) {
    const p = perLoc[norm(loc)] || perLoc[loc] || {};
    const statVar = p.statVar || {};
    const diff = ledgerBaselineDiff(rawItems, { closeWindowStart: p.closeWindowStart, officialVarByWrin: statVar, floor });
    const dFobPct = (p.curFobPct != null && p.baseFobPct != null) ? p.curFobPct - p.baseFobPct : null;
    const fobVerdict = dFobPct == null ? 'unknown' : dFobPct < -0.0001 ? 'helping' : dFobPct > 0.0001 ? 'hurting' : 'flat';
    const flaggedWrins = Object.entries(statVar).filter(([, v]) => Math.abs(v) >= 50).map(([w]) => w);
    const engagement = storeEngagement(diff, { flaggedWrins, fobDeltaPct: dFobPct, minNet: floor });
    stores.push({
      loc, name: p.name || null,
      fob: { baseFobPct: p.baseFobPct ?? null, curFobPct: p.curFobPct ?? null, dFobPct, verdict: fobVerdict },
      count: { basePct: p.basePct ?? null, curPct: p.curPct ?? null },
      countCompleteDate: diff.countCompleteDate,
      items: diff.items, nHelped: diff.nHelped, nHurt: diff.nHurt, nRecounted: diff.nRecounted,
      helpedDol: diff.helpedDol, hurtDol: diff.hurtDol, anyActivity: diff.nRecounted > 0 || diff.anyMove,
      baselineIncomplete: false, engagement,
    });
  }
  stores.sort((a, b) => {
    const rank = { worsened: 0, mixed: 1, 'no-action': 2, improving: 3 };
    return (rank[a.engagement.verdict] - rank[b.engagement.verdict]) || (b.nRecounted - a.nRecounted) || (b.hurtDol - a.hurtDol);
  });
  return {
    stores, nStores: stores.length,
    improved: stores.filter(s => s.engagement.verdict === 'improving').length,
    worsened: stores.filter(s => s.engagement.verdict === 'worsened').length,
    noAction: stores.filter(s => s.engagement.verdict === 'no-action').length,
    totalHelped: stores.reduce((s, x) => s + x.helpedDol, 0),
    totalHurt: stores.reduce((s, x) => s + x.hurtDol, 0),
    active: stores.filter(s => s.anyActivity).length,
  };
}

// ── Store-engagement verdict (the north-star payoff, memory/project-count-cycle-vision.md) ──────────
// Roll a store's ledger diff + FOB direction into ONE read: did the store actively try to diagnose and
// improve FOB after we flagged its recount-worthy items — and if it failed, is it SKILL (needs training)
// or WILL (don't-care / no follow-up)? This is a first-pass, TUNABLE scaffold — thresholds are the owner's
// to dial. It NEVER accuses of integrity (a "helped" store can still be padding — that's a separate layer);
// it only reads engagement + technique.
//   diff          — ledgerBaselineDiff(...) for the store
//   flaggedWrins  — the recount-worthy items we asked the store to act on (±$50, mid-cycle-filtered)
//   fobDeltaPct   — FOB now − FOB at count-complete (negative = FOB improved = good), optional
export function storeEngagement(diff, { flaggedWrins = [], fobDeltaPct = null, minNet = 25 } = {}) {
  const flagged = new Set((flaggedWrins || []).map(String));
  const flaggedItems = (diff.items || []).filter(i => flagged.has(i.wrin));
  const recountedFlagged = flaggedItems.filter(i => i.recounted).length;
  const netDol = (diff.helpedDol || 0) - (diff.hurtDol || 0);          // + = net variance toward zero
  const fobImproved = fobDeltaPct != null && fobDeltaPct < -0.0001;
  const fobWorse = fobDeltaPct != null && fobDeltaPct > 0.0001;
  const acted = (diff.nRecounted || 0) > 0;

  // Direction: did the store's moves net toward zero (better) or away (worse)?
  const netBetter = netDol > minNet || fobImproved;
  const netWorse = netDol < -minNet || fobWorse;

  let verdict;                                    // what the store DID
  if (!acted) verdict = 'no-action';
  else if (netBetter && !netWorse) verdict = 'improving';
  else if (netWorse && !netBetter) verdict = 'worsened';
  else verdict = 'mixed';                         // recounted but no material net move (or offsetting)

  let read;                                       // WHY — skill vs will
  if (verdict === 'improving') read = 'good';                              // tried and it worked
  else if (verdict === 'no-action' && flagged.size > 0) read = 'will';     // flagged items, did nothing → follow-through gap
  else if (verdict === 'no-action') read = 'none';                          // nothing was flagged → nothing to judge
  else read = 'training';                                                   // acted but wrong result → technique gap

  const LABEL = {
    improving: 'Actively improving', worsened: 'Made it worse', mixed: 'Acted, no net gain', 'no-action': 'No meaningful action',
  };
  const READ = {
    good: 'Diagnosed + corrected well', training: 'Trying but off — coach the technique',
    will: 'Flagged items untouched — follow-through gap', none: 'Nothing flagged to act on',
  };
  return {
    verdict, read, label: LABEL[verdict], readLabel: READ[read],
    acted, recountedFlagged, flaggedTotal: flagged.size,
    netDol, fobDeltaPct, nRecounted: diff.nRecounted || 0,
  };
}
