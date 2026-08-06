// @ts-nocheck
// ── District EOM Summary ───────────────────────────────────────────────────────
// Rolls up the EOM picture across a SCOPED set of stores (the dashboard's All/State/Patch/Store
// filter feeds `rows` already scoped). Produces: a dollar-weighted FOB roll-up + per-component %,
// count completion, the $ opportunity vs target, and a light analysis (biggest driver, worst stores).
// Pure + unit-tested — no I/O, no React. `rows` are the dashboard's per-store rows; `targetsByLoc`
// is DEFAULT_TARGETS (per unpadded loc).

const unpad = s => String(s || '').replace(/^0+/, '') || String(s || '');
const num = v => Number(v) || 0;
const COMP_KEYS = ['comp', 'raw', 'cond', 'emp', 'statv', 'unex'];
// Count-completion classes. Food/Condiment/Paper due by EOD; Non-Product due tomorrow.
export const CLASS_KEYS = ['food', 'condiment', 'paper', 'nonproduct'];
export const CLASS_META = [
  { k: 'food', label: 'Food', short: 'F' }, { k: 'condiment', label: 'Condiment', short: 'C' },
  { k: 'paper', label: 'Paper', short: 'P' }, { k: 'nonproduct', label: 'Non-Product', short: 'N' },
];
// Component → its target key in DEFAULT_TARGETS (all fractions of sales).
export const COMP_META = [
  { k: 'comp', label: 'Comp Waste', tgt: 'tCompWaste' },
  { k: 'raw', label: 'Raw Waste', tgt: 'tRawWaste' },
  { k: 'cond', label: 'Condiments', tgt: 'tCondiment' },
  { k: 'emp', label: 'Emp Meals', tgt: 'tEmpFood' },
  { k: 'statv', label: 'Stat Var', tgt: 'tStatLoss' },
  { k: 'unex', label: 'Unexplained', tgt: 'tUnex' },
];

export function buildDistrictSummary(rows = [], targetsByLoc = {}) {
  const stores = (rows || []).map(r => {
    const c = r.components || {};
    const tg = targetsByLoc[unpad(r.loc)] || {};
    const sales = num(c.sales);
    const fobD = num(r.fob$ ?? c.fob);
    const fobPct = r.fobPct != null ? r.fobPct : (sales ? fobD / sales : null);
    const fobTgt = tg.tFOBTarget != null ? Number(tg.tFOBTarget) : null;
    const deltaPp = (fobPct != null && fobTgt != null) ? (fobPct - fobTgt) * 100 : null;
    const over$ = (fobPct != null && fobTgt != null) ? (fobPct - fobTgt) * sales : null;
    const countPct = r.prog ? (r.prog.earlyPctCounted ?? r.prog.pctCounted ?? null) : null;
    // Raw item counts behind countPct, so district completion can be item-weighted
    // (Σcounted/Σtotal) instead of a mean of store percentages. Mirrors countPct's OWN
    // basis: early classes (Food+Condiment+Paper — today's target) when there are any,
    // else all classes. Using a different basis would make the district figure
    // incomparable to the per-store percentages shown beside it.
    const _useEarly = !!(r.prog && num(r.prog.earlyTotal) > 0);
    const countedItems = r.prog ? num(_useEarly ? r.prog.earlyCounted : r.prog.itemsCounted) : 0;
    const totalItems   = r.prog ? num(_useEarly ? r.prog.earlyTotal   : r.prog.itemsTotal)   : 0;
    let uncountedFC = 0;
    // Per-class count completion (owner req): Food / Condiment / Paper / Non-Product each.
    const classPct = {}, classCounted = {}, classTotal = {};
    for (const k of CLASS_KEYS) {
      const b = r.prog && r.prog.byClass && r.prog.byClass[k];
      classCounted[k] = b ? num(b.counted) : 0;
      classTotal[k] = b ? num(b.total) : 0;
      classPct[k] = (b && num(b.total)) ? num(b.counted) / num(b.total) : null;
      if ((k === 'food' || k === 'condiment') && b) uncountedFC += Math.max(0, num(b.total) - num(b.counted));
    }
    const comps = {}; for (const k of COMP_KEYS) comps[k] = num(c[k]);
    return {
      loc: r.loc, name: r.name, sales, fobD, fobPct, fobTgt, deltaPp, over$, comps,
      countPct, countedItems, totalItems,
      believesDone: !!(r.prog && r.prog.believesDone), uncountedFC,
      classPct, classCounted, classTotal,
      diagnosis: r.diagnosis, comms: r.comms,
    };
  });

  const sum = f => stores.reduce((s, x) => s + f(x), 0);
  const totSales = sum(s => s.sales), totFob = sum(s => s.fobD);
  const rollupComps = {}; for (const k of COMP_KEYS) rollupComps[k] = sum(s => s.comps[k]);
  const rollupCompPct = {}; for (const k of COMP_KEYS) rollupCompPct[k] = totSales ? rollupComps[k] / totSales : null;
  // Sales-weighted average FOB target across the scope.
  const wTgtNum = sum(s => (s.fobTgt != null ? s.fobTgt * s.sales : 0));
  const wTgtDen = sum(s => (s.fobTgt != null ? s.sales : 0));
  // Sales-weighted target + ±pp vs target PER COMPONENT (owner Notes 38 — targets in the summary too).
  const rollupCompTgt = {}, rollupCompDeltaPp = {};
  for (const m of COMP_META) {
    let n = 0, d = 0;
    for (const s of stores) { const t = (targetsByLoc[unpad(s.loc)] || {})[m.tgt]; if (t != null && s.sales) { n += Number(t) * s.sales; d += s.sales; } }
    rollupCompTgt[m.k] = d ? n / d : null;
    rollupCompDeltaPp[m.k] = (rollupCompTgt[m.k] != null && rollupCompPct[m.k] != null) ? (rollupCompPct[m.k] - rollupCompTgt[m.k]) * 100 : null;
  }
  const rollup = {
    nStores: stores.length, sales: totSales, fob$: totFob,
    fobPct: totSales ? totFob / totSales : null,
    fobTgt: wTgtDen ? wTgtNum / wTgtDen : null,
    comps: rollupComps, compPct: rollupCompPct, compTgt: rollupCompTgt, compDeltaPp: rollupCompDeltaPp,
  };

  const withProg = stores.filter(s => s.countPct != null);
  const completion = {
    nStores: stores.length,
    ready: stores.filter(s => s.believesDone).length,
    counting: stores.filter(s => !s.believesDone && num(s.countPct) > 0.01).length,
    notStarted: stores.filter(s => num(s.countPct) <= 0.01).length,
    // Item-weighted, not a mean of store percentages (owner 2026-08-06): total items
    // counted across the stores divided by total items in those stores. A 40-item store
    // at 100% no longer offsets a 400-item store at 50%. Same Σcounted/Σtotal shape the
    // byClass block below already used.
    avgCountPct: (() => {
      const cnt = sum(s => s.countedItems || 0), tot = sum(s => s.totalItems || 0);
      if (tot > 0) return cnt / tot;
      // No item counts available — fall back to the old mean so the tile still reports.
      return withProg.length ? withProg.reduce((a, s) => a + s.countPct, 0) / withProg.length : null;
    })(),
    storesWithUncountedFC: stores.filter(s => s.uncountedFC > 0).length,
    totalUncountedFC: stores.reduce((a, s) => a + (num(s.uncountedFC) || 0), 0),
    // District per-class completion = Σ counted / Σ total across stores (item-weighted).
    byClass: Object.fromEntries(CLASS_KEYS.map(k => {
      const cnt = sum(s => s.classCounted[k] || 0), tot = sum(s => s.classTotal[k] || 0);
      return [k, tot ? cnt / tot : null];
    })),
  };

  // Opportunity = stores OVER their FOB target, ranked by $ over target (the recoverable gap).
  const opportunity = stores.filter(s => s.over$ != null && s.over$ > 0).sort((a, b) => b.over$ - a.over$);
  const totalOver$ = opportunity.reduce((a, s) => a + s.over$, 0);

  // Component OPPORTUNITY = $ OVER each component's OWN target (owner Notes 38): ranking by raw $ wrongly
  // crowns Condiments, which is structurally large (1.6–2.2% of sales, targeted accordingly) and carries
  // no opportunity when it's on target. A component under its target is NOT an opportunity ($0). So we
  // rank by (actual% − target%) × sales, positive only. Components with no target fall back to raw $ as a
  // last resort (so they're not silently dropped), but real (over-target) opportunities always sort first.
  const compOpp = COMP_KEYS.map(k => {
    const label = (COMP_META.find(m => m.k === k) || {}).label;
    const hasTgt = rollupCompTgt[k] != null && rollupCompPct[k] != null;
    const over$ = hasTgt ? Math.max(0, (rollupCompPct[k] - rollupCompTgt[k]) * totSales) : 0;
    const deltaPp = hasTgt ? (rollupCompPct[k] - rollupCompTgt[k]) * 100 : null;
    return { k, label, amt: rollupComps[k], over$, deltaPp, hasTgt };
  }).sort((a, b) => (b.over$ - a.over$) || (b.amt - a.amt));
  const biggestComp = compOpp[0];                                   // biggest opportunity vs target
  const anyOverTarget = compOpp.some(c => c.over$ > 0);
  const worstFob = stores.filter(s => s.fobPct != null).sort((a, b) => b.fobPct - a.fobPct).slice(0, 5);

  return { stores, rollup, completion, opportunity, totalOver$, analysis: { biggestComp, compOpp, anyOverTarget, worstFob } };
}
