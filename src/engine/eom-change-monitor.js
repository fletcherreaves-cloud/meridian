// @ts-nocheck
// ── EOM Change Monitor ─────────────────────────────────────────────────────────
// Diff a LOCKED baseline snapshot of a store's EOM state against its CURRENT state, so tomorrow we
// can watch what changed after comms went out and judge whether each move HELPED (variance moved
// toward $0 / FOB down) or HURT (moved away / FOB up). Baseline is stored in eom_snapshots; current
// comes from the live pull. Pure + unit-tested — no I/O, no React.
//
// Snapshot shape (both baseline and current):
//   { loc, fob:{ sales, fob, fobPct, comp, raw, cond, emp, statv, unex },
//     count:{ earlyPctCounted, byClass:{food:{counted,total},...} },
//     items:[{ wrin, descr, cls, qty, onHandAmt, dolDiff, variance, lastCounted, state }] }

const num = v => Number(v) || 0;
const COMP = ['comp', 'raw', 'cond', 'emp', 'statv', 'unex'];

// Judge a variance move: helping = |current| smaller than |baseline| (toward zero); hurting = larger.
// 'counted' = the baseline was ~empty for this item (the store hadn't entered its count when the
// baseline locked) but now it carries a real value → the COUNT LANDED, not a move that helped or hurt.
// A near-zero item-by-item variance almost never reflects a real count (owner Notes 38: Tishomingo all
// zeroes) — it means "uncounted at lock", so we label it neutrally instead of scoring it as hurting.
function verdict(baseVar, curVar, tol = 1) {
  if (baseVar == null || curVar == null) return 'unknown';
  const b = Math.abs(baseVar), c = Math.abs(curVar);
  if (b < tol && c >= tol) return 'counted';   // empty baseline → first real count appeared
  if (c < b - tol) return 'helping';
  if (c > b + tol) return 'hurting';
  return 'flat';
}

export function diffSnapshot(baseline = {}, current = {}, { itemTol = 1 } = {}) {
  const bf = baseline.fob || {}, cf = current.fob || {};
  const dFobPct = (cf.fobPct != null && bf.fobPct != null) ? cf.fobPct - bf.fobPct : null;
  const dFobD = (cf.fob != null && bf.fob != null) ? cf.fob - bf.fob : null;
  // FOB helping = % went DOWN (lower food cost is better).
  const fobVerdict = dFobPct == null ? 'unknown' : dFobPct < -0.0001 ? 'helping' : dFobPct > 0.0001 ? 'hurting' : 'flat';
  const compDelta = {}; for (const k of COMP) compDelta[k] = (cf[k] != null && bf[k] != null) ? num(cf[k]) - num(bf[k]) : null;

  const bItems = new Map((baseline.items || []).map(i => [String(i.wrin), i]));
  const cItems = new Map((current.items || []).map(i => [String(i.wrin), i]));
  const items = [];
  for (const w of new Set([...bItems.keys(), ...cItems.keys()])) {
    const b = bItems.get(w), c = cItems.get(w);
    const bv = b ? num(b.dolDiff) : null, cv = c ? num(c.dolDiff) : null;
    const dVar = (bv != null && cv != null) ? cv - bv : null;
    const recounted = !!(b && c && String(b.lastCounted || '') !== String(c.lastCounted || ''));
    const changed = (dVar != null && Math.abs(dVar) >= itemTol) || (b?.qty !== c?.qty) || recounted || !b || !c;
    if (!changed) continue;
    // Qty (unit) variance base→now too (owner Notes 38 — helps see what they physically found).
    const bq = b ? num(b.variance) : null, cq = c ? num(c.variance) : null;
    items.push({
      wrin: w, descr: (c || b).descr, cls: (c || b).cls,
      baseVar: bv, curVar: cv, dVar, verdict: verdict(bv, cv, itemTol),
      baseQtyVar: bq, curQtyVar: cq, dQtyVar: (b && c) ? cq - bq : null,
      baseQty: b ? num(b.qty) : null, curQty: c ? num(c.qty) : null,
      baseCounted: b?.lastCounted ?? null, curCounted: c?.lastCounted ?? null, recounted,
      isNew: !b, isGone: !c,
    });
  }
  // Biggest movers first (by |dVar|), then new/gone.
  items.sort((a, b2) => (Math.abs(b2.dVar || 0) - Math.abs(a.dVar || 0)));
  const helped = items.filter(i => i.verdict === 'helping');
  const hurt = items.filter(i => i.verdict === 'hurting');
  const counted = items.filter(i => i.verdict === 'counted');   // first-count-landing (empty baseline)
  const nRecounted = items.filter(i => i.recounted).length;
  // Baseline looks INCOMPLETE (store hadn't entered its count at lock) if most items with a real
  // current variance had a ~zero baseline. Then the diff shows the count landing, not moves — so
  // helping/hurting is meaningless for this store and the UI should say so (owner Notes 38 var-0).
  const withCur = items.filter(i => i.curVar != null && Math.abs(i.curVar) >= itemTol);
  const baselineIncomplete = withCur.length >= 5 && (counted.length / withCur.length) >= 0.6;
  return {
    loc: baseline.loc || current.loc,
    fob: { baseFobPct: bf.fobPct ?? null, curFobPct: cf.fobPct ?? null, dFobPct, baseFob: bf.fob ?? null, curFob: cf.fob ?? null, dFobD, verdict: fobVerdict },
    compDelta,
    count: { basePct: (baseline.count || {}).earlyPctCounted ?? null, curPct: (current.count || {}).earlyPctCounted ?? null },
    items,
    nHelped: helped.length, nHurt: hurt.length, nCounted: counted.length, nRecounted, baselineIncomplete,
    helpedDol: helped.reduce((s, i) => s + Math.max(0, Math.abs(i.baseVar || 0) - Math.abs(i.curVar || 0)), 0),
    hurtDol: hurt.reduce((s, i) => s + Math.max(0, Math.abs(i.curVar || 0) - Math.abs(i.baseVar || 0)), 0),
    newlyCountedDol: counted.reduce((s, i) => s + Math.abs(i.curVar || 0), 0),
    anyActivity: items.length > 0,
  };
}

// Diff a whole scope: baselines + currents keyed by loc → per-store diffs + a district roll-up.
export function diffScope(baselinesByLoc = {}, currentsByLoc = {}, opts = {}) {
  const norm = s => String(s || '').replace(/^0+/, '') || String(s || '');
  // Re-key both sides by normalized (unpadded) loc so a padded baseline matches an unpadded current.
  const byNorm = obj => Object.fromEntries(Object.entries(obj || {}).map(([k, v]) => [norm(k), v]));
  const bMap = byNorm(baselinesByLoc), cMap = byNorm(currentsByLoc);
  const locs = new Set([...Object.keys(bMap), ...Object.keys(cMap)]);
  const stores = [];
  for (const loc of locs) {
    const b = bMap[loc], c = cMap[loc];
    if (!b && !c) continue;
    stores.push(diffSnapshot(b || { loc }, c || { loc }, opts));
  }
  stores.sort((a, b) => (b.nHurt - a.nHurt) || ((b.fob.dFobPct || 0) - (a.fob.dFobPct || 0)));
  const improved = stores.filter(s => s.fob.verdict === 'helping').length;
  const worsened = stores.filter(s => s.fob.verdict === 'hurting').length;
  return {
    stores, nStores: stores.length, improved, worsened,
    totalHelped: stores.reduce((s, x) => s + x.helpedDol, 0),
    totalHurt: stores.reduce((s, x) => s + x.hurtDol, 0),
    active: stores.filter(s => s.anyActivity).length,
  };
}
