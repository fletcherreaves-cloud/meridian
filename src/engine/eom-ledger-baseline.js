// @ts-nocheck
// ── Ledger-derived baseline (the manual-lock replacement) ────────────────────────────────────────
// Owner insight (2026-08-01): the Change Monitor's frozen snapshot recorded $0 baselines because it
// captured the ledger variance `asOf: now` AT LOCK TIME — before some stores had counted. The variance
// was never missing; the raw item detail logs it the instant a count is submitted. So we DON'T freeze —
// we DERIVE the baseline straight from the ledger: each item's variance AS OF its count-completion date.
//
// baseline var = latest count ≤ count-complete date  (the state we flagged the store on)
// current  var = latest count now                     (after any recount)
// The DIFF is therefore exactly the qualifying recounts — no lock, no $0 ghosts, same basis both sides.
// The recount itself is graded by the anchored engine (itemRecounts → officialVar). Pure + unit-tested.
// See docs/eom-recount-grading-spec.md §5b and memory/project-count-cycle-vision.md.

import { latestVarianceByWrin } from './eom-variance-raw.js';
import { storeDayWindows, itemRecounts } from './eom-recount-detect.js';

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

const dayOf = d => String(d || '').slice(0, 10);

// Ledger-derived baseline diff for ONE store.
//   rawItems          — qsr_raw_item_detail rows for the store (already loaded for the Progression view)
//   countCompleteDate — the store's bulk/count-complete day (eom-inventory fullCountDate) → the baseline asOf
//   officialVarByWrin — authoritative period variance per wrin (qsr_variance_stat) → anchors the recount grade
export function ledgerBaselineDiff(rawItems, { countCompleteDate = null, officialVarByWrin = {}, floor = LEDGER_MATERIAL_FLOOR } = {}) {
  const baseAsOf = countCompleteDate ? new Date(`${dayOf(countCompleteDate)}T23:59:59`) : null;
  const baseVar = latestVarianceByWrin(rawItems, { asOf: baseAsOf });   // variance at count-completion
  const curVar = latestVarianceByWrin(rawItems, { asOf: null });        // latest ledger count (now)
  const windows = storeDayWindows(rawItems);
  const ccDay = countCompleteDate ? dayOf(countCompleteDate) : null;

  const items = [];
  for (const it of (rawItems || [])) {
    const w = String(it.wrin);
    const bv = baseVar[w]?.dolDiff ?? null;
    const cv = curVar[w]?.dolDiff ?? null;
    if (bv == null && cv == null) continue;
    const official = officialVarByWrin[w] ?? officialVarByWrin[it.wrin] ?? null;
    const rc = itemRecounts(it.history || [], windows, { officialVar: official });
    // A recount "since baseline" = the item's latest count landed AFTER count-completion.
    const recounted = !!(ccDay && curVar[w]?.lastCounted && curVar[w].lastCounted > ccDay);
    const v = verdict(bv, cv, floor);
    items.push({
      wrin: w, descr: it.descr || w, cls: it.cls || null,
      baseVar: bv, curVar: cv,
      dMag: (bv != null && cv != null) ? abs(cv) - abs(bv) : null,   // + = grew (hurting), − = toward zero (helping)
      verdict: v, recounted,
      baseCounted: baseVar[w]?.lastCounted ?? null, curCounted: curVar[w]?.lastCounted ?? null,
      officialVar: official, recount: rc,
    });
  }
  items.sort((a, b) => abs(b.dMag || 0) - abs(a.dMag || 0));
  const helped = items.filter(i => i.verdict === 'helping');
  const hurt = items.filter(i => i.verdict === 'hurting');
  return {
    items, countCompleteDate: ccDay,
    nHelped: helped.length, nHurt: hurt.length,
    nRecounted: items.filter(i => i.recounted).length,
    helpedDol: helped.reduce((s, i) => s + Math.max(0, abs(i.baseVar) - abs(i.curVar)), 0),
    hurtDol: hurt.reduce((s, i) => s + Math.max(0, abs(i.curVar) - abs(i.baseVar)), 0),
    anyMove: helped.length + hurt.length > 0,
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
