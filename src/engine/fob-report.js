// @ts-nocheck
// ── All-location FOB report (Notes 42 #1, 2026-08-01) ────────────────────────────────────────────
// A reusable, hierarchical Food-Over-Base read: OK/FL summary → biggest opportunities → patch → store,
// each store carrying a trend (improving vs regressing), its worst FOB component, top item losers, a
// masking check (gross loss offset by gains — the QSRSoft Variance-Card pattern), and a plain-language
// action plan of easy real-work steps. Pure + tested; the panel renders it, so numbers are verifiable.
//
// Everything is keyed by the caller's loc string (use one form consistently — unpadded is fine). All
// pct inputs are FRACTIONS of product sales (0.0388 = 3.88%); we surface percentage-points (pp) for reads.

const COMPONENTS = [
  ['statv', 'Variance Stat'], ['comp', 'Completed Waste'], ['raw', 'Raw Waste'],
  ['cond', 'Condiments'], ['emp', 'Emp/Mgr Meals'], ['unex', 'Unexplained'],
];
const pp = f => Math.round((f || 0) * 10000) / 100;   // fraction → percentage-points (2dp)
const money = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n || 0)).toLocaleString();
const abs = v => Math.abs(Number(v) || 0);

// Per-store trend from monthly-final FOB% fractions: { 'YYYY-MM': fracPct }. Improving = FOB fell.
function trendOf(monthly) {
  const entries = Object.entries(monthly || {}).sort((a, b) => a[0].localeCompare(b[0]));
  if (entries.length < 2) return { dir: 'n/a', deltaPP: null, series: entries.map(([m, v]) => ({ month: m, pct: v })) };
  const prev = entries[entries.length - 2][1], last = entries[entries.length - 1][1];
  const deltaPP = pp(last - prev);   // + = FOB rose = worse
  const dir = deltaPP <= -0.05 ? 'improving' : deltaPP >= 0.05 ? 'regressing' : 'flat';
  return { dir, deltaPP, series: entries.map(([m, v]) => ({ month: m, pct: v })) };
}

// One store's report. fob = { fobPct, fob (the $), components:{statv,comp,raw,cond,emp,unex} $ }, target
// = fraction, monthly = trend series, varRows = [{descr, dolDiff}] this period, compTgt = {key:fracTgt}.
export function buildStoreFobReport(loc, { name, org, patch, fob, target, monthly, varRows, compActual, compTarget }) {
  const fobPct = fob && fob.fobPct != null ? fob.fobPct : null;
  const sales = (fob && fob.fob != null && fobPct) ? fob.fob / fobPct : (fob && fob.sales) || null;
  const overTarget = fobPct != null && target != null && fobPct > target;
  const gapPP = (fobPct != null && target != null) ? pp(fobPct - target) : null;
  const oppDollars = (overTarget && sales) ? (fobPct - target) * sales : 0;
  const trend = trendOf(monthly);

  // Worst FOB component vs its target (drives the action plan).
  const comps = COMPONENTS.map(([k, label]) => {
    const a = compActual ? compActual[k] : null, t = compTarget ? compTarget[k] : null;
    return { key: k, label, actualPP: a != null ? pp(a) : null, tgtPP: t != null ? pp(t) : null, deltaPP: (a != null && t != null) ? pp(a - t) : null };
  });
  const overComps = comps.filter(c => c.deltaPP != null && c.deltaPP > 0.02).sort((a, b) => b.deltaPP - a.deltaPP);
  const topDriver = overComps[0] || null;

  // Variance masking: is a healthy-looking net hiding large offsetting +/− (QSRSoft Variance Card)?
  const grossLoss = (varRows || []).filter(v => (v.dolDiff || 0) < 0).reduce((s, v) => s + v.dolDiff, 0);
  const grossGain = (varRows || []).filter(v => (v.dolDiff || 0) > 0).reduce((s, v) => s + v.dolDiff, 0);
  const net = grossLoss + grossGain;
  const masking = abs(grossLoss) > 300 && grossGain > abs(grossLoss) * 0.3;   // gains hide >30% of loss
  const topItems = (varRows || []).filter(v => (v.dolDiff || 0) < 0).sort((a, b) => a.dolDiff - b.dolDiff).slice(0, 4)
    .map(v => ({ descr: v.descr || v.wrin, dolDiff: v.dolDiff }));

  // Action plan — data-driven, easy real-work steps.
  const actions = [];
  if (overTarget) {
    if (topDriver && topDriver.key === 'statv') {
      const items = topItems.slice(0, 3).map(i => i.descr).join(', ');
      actions.push(`Variance Stat is the driver (${topDriver.actualPP}% vs ${topDriver.tgtPP}% target). Audit portioning + waste-recording on the top losers${items ? `: ${items}` : ''}.`);
    } else if (topDriver && (topDriver.key === 'raw' || topDriver.key === 'comp')) {
      actions.push(`${topDriver.label} over target (${topDriver.actualPP}% vs ${topDriver.tgtPP}%). Verify waste is being logged and tighten rotation/prep-to-order.`);
    } else if (topDriver && topDriver.key === 'cond') {
      actions.push(`Condiments over target (${topDriver.actualPP}% vs ${topDriver.tgtPP}%). Check condiment portioning + free-refill discipline.`);
    } else if (topDriver && topDriver.key === 'emp') {
      actions.push(`Emp/Mgr Meals over target (${topDriver.actualPP}% vs ${topDriver.tgtPP}%). Confirm meals are rung and within policy.`);
    } else {
      actions.push(`FOB ${gapPP > 0 ? '+' : ''}${gapPP}pp over target — review the largest contributors first.`);
    }
  }
  if (masking) actions.push(`Net variance looks manageable, but ${money(grossLoss)} of losses are offset by ${money(grossGain)} of gains — verify the offsetting counts are real, not over-counts masking a true shortage.`);
  if (trend.dir === 'regressing') actions.push(`Regressing: FOB rose ${trend.deltaPP}pp vs last month — catch it now before it compounds.`);
  if (!actions.length && trend.dir === 'improving') actions.push(`On/under target and improving (${trend.deltaPP}pp vs last month) — hold the line, this is working.`);

  // Under target = an ACHIEVER banking savings vs target; the leadership math nets these against laggards.
  const underTarget = fobPct != null && target != null && fobPct < target;
  const savingsDollars = (underTarget && sales) ? (target - fobPct) * sales : 0;
  const fobDollars = (fob && fob.fob != null) ? fob.fob : (fobPct != null && sales != null ? fobPct * sales : null);

  const oppScore = (overTarget ? gapPP * 10 : 0) + (trend.dir === 'regressing' ? 5 : 0) + (masking ? 3 : 0);
  return { loc, name, org, patch, fobPct, target, gapPP, overTarget, underTarget, oppDollars, savingsDollars, sales, fobDollars, trend, comps, topDriver, grossLoss, grossGain, net, masking, topItems, actions, oppScore };
}

// District dollar-weighted FOB + the laggard-vs-achiever math (for a leadership summary): achievers bank
// savings under target, laggards burn excess over target — net tells whether the achievers' gains survive.
export function leadershipMath(reports) {
  const withFob = (reports || []).filter(r => r.fobPct != null && r.sales);
  const totFob = withFob.reduce((s, r) => s + (r.fobDollars || 0), 0);
  const totSales = withFob.reduce((s, r) => s + (r.sales || 0), 0);
  const totTgt = withFob.reduce((s, r) => s + ((r.target || 0) * (r.sales || 0)), 0);
  const districtFobPct = totSales ? totFob / totSales : null;
  const districtTarget = totSales ? totTgt / totSales : null;
  const laggards = withFob.filter(r => r.overTarget).sort((a, b) => b.oppDollars - a.oppDollars);
  const achievers = withFob.filter(r => r.underTarget).sort((a, b) => b.savingsDollars - a.savingsDollars);
  const excess = laggards.reduce((s, r) => s + (r.oppDollars || 0), 0);       // $/mo over target
  const savings = achievers.reduce((s, r) => s + (r.savingsDollars || 0), 0); // $/mo under target
  const net = excess - savings;                                              // + = district net over target
  const erased = Math.min(excess, savings);                                  // achiever savings laggards ate
  return { districtFobPct, districtTarget, districtGapPP: (districtFobPct != null && districtTarget != null) ? pp(districtFobPct - districtTarget) : null,
    totFob, totSales, laggards, achievers, excess, savings, net, erased, nStores: withFob.length };
}

// Roll all scoped stores into the hierarchical report.
export function buildFobReport({ stores, get }) {
  const reports = [];
  for (const s of stores) {
    const r = buildStoreFobReport(String(s.loc), get(s));
    if (r.fobPct == null) continue;   // no FOB data yet
    reports.push(r);
  }
  const byOrg = {};
  for (const r of reports) (byOrg[r.org] || (byOrg[r.org] = [])).push(r);

  const orgSummary = (list) => {
    const withFob = list.filter(r => r.fobPct != null && r.sales);
    // Dollar-weighted district FOB (Σ FOB$ ÷ Σ sales) — NEVER a simple average of per-store %s.
    const totF = withFob.reduce((s, r) => s + (r.fobDollars || 0), 0);
    const totS = withFob.reduce((s, r) => s + (r.sales || 0), 0);
    const avg = totS ? totF / totS : null;
    return {
      nStores: list.length, avgFobPP: avg != null ? pp(avg) : null,
      overTarget: list.filter(r => r.overTarget).length,
      regressing: list.filter(r => r.trend.dir === 'regressing').length,
      improving: list.filter(r => r.trend.dir === 'improving').length,
      oppDollars: list.reduce((s, r) => s + (r.oppDollars || 0), 0),
    };
  };

  const orgs = Object.keys(byOrg).sort().map(org => {
    const list = byOrg[org].sort((a, b) => b.oppScore - a.oppScore);
    const patches = {};
    for (const r of list) (patches[r.patch || '—'] || (patches[r.patch || '—'] = [])).push(r);
    return {
      org, label: org === 'FL' ? 'Florida' : org === 'OK' ? 'Oklahoma' : org,
      summary: orgSummary(list),
      patches: Object.keys(patches).sort().map(p => ({ patch: p, stores: patches[p] })),
      stores: list,
    };
  });

  const opportunities = reports.filter(r => r.oppScore > 0).sort((a, b) => b.oppScore - a.oppScore);
  const summary = {
    nStores: reports.length, ...orgSummary(reports),
    byOrg: Object.fromEntries(orgs.map(o => [o.org, o.summary])),
  };
  return { orgs, stores: Object.fromEntries(reports.map(r => [r.loc, r])), opportunities, summary, leadership: leadershipMath(reports) };
}
