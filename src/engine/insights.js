// @ts-nocheck
// Meridian Signals Engine — cross-metric correlation analysis
// Runs after every data upload to surface statistical patterns across
// scheduling, labor, service, food cost, and customer satisfaction.

// ── Math helpers ──────────────────────────────────────────────────────────────
function pearson(pairs) {
  const n = pairs.length;
  if (n < 8) return null;
  const mx = pairs.reduce((s, p) => s + p.x, 0) / n;
  const my = pairs.reduce((s, p) => s + p.y, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (const p of pairs) {
    const dx = p.x - mx, dy = p.y - my;
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
  }
  const den = Math.sqrt(dx2 * dy2);
  return den === 0 ? null : num / den;
}

function signalStrength(r) {
  const a = Math.abs(r || 0);
  if (a >= 0.70) return 'strong';
  if (a >= 0.50) return 'moderate';
  if (a >= 0.30) return 'plausible';
  return 'weak';
}

function _dKey(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d + 'T12:00:00');
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
}

function _mKey(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d + 'T12:00:00');
  return dt.getFullYear() + '_' + (dt.getMonth() + 1);
}

// ── Data join helpers ─────────────────────────────────────────────────────────

// Normalize loc to short unpadded format ('0003708' → '3708') so all parsers join correctly
function normLoc(loc) {
  const n = parseInt(String(loc || '').replace(/\D/g, ''), 10);
  return isNaN(n) ? String(loc || '') : String(n);
}

// Join two row arrays on loc + date (daily granularity)
function joinDaily(aRows, aField, bRows, bField) {
  const idx = {};
  for (const r of bRows) {
    if (!r.loc || !r.date) continue;
    idx[normLoc(r.loc) + '_' + _dKey(r.date)] = r;
  }
  const pairs = [];
  for (const r of aRows) {
    if (!r.loc || !r.date) continue;
    const m = idx[normLoc(r.loc) + '_' + _dKey(r.date)];
    if (!m) continue;
    const x = r[aField], y = m[bField];
    if (x != null && !isNaN(x) && x !== 0 && y != null && !isNaN(y) && y !== 0)
      pairs.push({ x, y, loc: r.loc, date: r.date });
  }
  return pairs;
}

// Join two row arrays on loc + month (monthly granularity)
function joinMonthly(aRows, aFn, bRows, bFn) {
  const idx = {};
  for (const r of bRows) {
    if (!r.loc || !r.date) continue;
    idx[normLoc(r.loc) + '_' + _mKey(r.date)] = r;
  }
  const pairs = [];
  for (const r of aRows) {
    if (!r.loc || !r.date) continue;
    const m = idx[normLoc(r.loc) + '_' + _mKey(r.date)];
    if (!m) continue;
    const x = aFn(r), y = bFn(m);
    if (x != null && !isNaN(x) && x !== 0 && y != null && !isNaN(y) && y !== 0)
      pairs.push({ x, y, loc: r.loc, date: r.date });
  }
  return pairs;
}

// Aggregate daily laborRows into monthly summaries (sales-weighted averages)
function monthlyLaborSummary(laborRows) {
  const byKey = {};
  for (const r of laborRows) {
    if (!r.date || !(r.sales > 0)) continue;
    const k = r.loc + '_' + _mKey(r.date);
    if (!byKey[k]) byKey[k] = { loc: r.loc, date: r.date, sales: 0, laborW: 0, tpphW: 0, otHrs: 0, n: 0 };
    const b = byKey[k];
    b.sales += r.sales;
    b.laborW += (r.laborPct || 0) * r.sales;
    b.tpphW  += (r.tpph     || 0) * r.sales;
    b.otHrs  += (r.otHrs    || 0);
    b.n++;
  }
  return Object.values(byKey).map(b => ({
    ...b,
    laborPct: b.sales > 0 ? b.laborW / b.sales : null,
    tpph:     b.sales > 0 ? b.tpphW  / b.sales : null,
  }));
}

// Monthly average OEPE per store
function monthlyOEPESummary(opsRows) {
  const byKey = {};
  for (const r of opsRows) {
    if (!r.date || !(r.oepe > 0)) continue;
    const k = r.loc + '_' + _mKey(r.date);
    if (!byKey[k]) byKey[k] = { loc: r.loc, date: r.date, oepeSum: 0, n: 0 };
    byKey[k].oepeSum += r.oepe; byKey[k].n++;
  }
  return Object.values(byKey).map(b => ({ ...b, oepe: b.n > 0 ? b.oepeSum / b.n : null }));
}

// ── Signal definitions ────────────────────────────────────────────────────────
// Each signal returns { id, name, description, r, n, strength, direction,
//                       expectedDir, confirmed, xLabel, yLabel, pairs[], note? }

function sig_scheduleGapOEPE(ds) {
  const { schedRows = [], opsRows = [] } = ds;
  if (!schedRows.length || !opsRows.length) return null;
  // schVsIdealDiff = crewHrs - idealTotHrs; negative = under-scheduled
  // Under-scheduled → higher OEPE → expect negative r
  const pairs = joinDaily(schedRows, 'schVsIdealDiff', opsRows, 'oepe');
  const r = pearson(pairs);
  if (r === null) return null;
  return {
    id: 'schedule_gap_oepe',
    name: 'Scheduling Gap → OEPE',
    description: 'When crew hours fall below ideal, drive-thru slows. Negative r = under-staffing drives longer OEPE.',
    r, n: pairs.length, strength: signalStrength(r),
    direction: r < 0 ? 'negative' : 'positive',
    expectedDir: 'negative',
    confirmed: r < -0.30,
    xLabel: 'Crew vs Ideal Hrs (negative = under-staffed)',
    yLabel: 'OEPE (sec)',
    pairs,
    note: pairs.length < 20 ? 'Upload more LifeLenz data to strengthen this signal' : null,
  };
}

function sig_laborFoodCost(ds) {
  const { laborRows = [], fobRows = [] } = ds;
  if (!laborRows.length || !fobRows.length) return null;
  const monthly = monthlyLaborSummary(laborRows);
  const pairs = joinMonthly(
    monthly, r => r.laborPct,
    fobRows, r => r.baseFoodPct || r.fobPct
  );
  const r = pearson(pairs);
  if (r === null) return null;
  return {
    id: 'labor_food_cost',
    name: 'Crew Labor % → Food Cost %',
    description: 'High crew labor rates may signal rushed operations that drive elevated food cost and waste.',
    r, n: pairs.length, strength: signalStrength(r),
    direction: r > 0 ? 'positive' : 'negative',
    expectedDir: 'positive',
    confirmed: r > 0.30,
    xLabel: 'Crew Labor % (monthly avg)',
    yLabel: 'Base Food Cost %',
    pairs,
  };
}

function sig_tpphOSAT(ds) {
  const { laborRows = [], smgFullscale = [] } = ds;
  if (!laborRows.length || !smgFullscale.length) return null;
  const monthly = monthlyLaborSummary(laborRows);
  const pairs = joinMonthly(
    monthly, r => r.tpph,
    smgFullscale, r => r.osatTop2
  );
  const r = pearson(pairs);
  if (r === null) return null;
  return {
    id: 'tpph_osat',
    name: 'TPPH → OSAT Score',
    description: 'Higher throughput per person hour may correlate with better customer satisfaction. Upload FullScale reports to test.',
    r, n: pairs.length, strength: signalStrength(r),
    direction: r > 0 ? 'positive' : 'negative',
    expectedDir: 'positive',
    confirmed: r > 0.30,
    xLabel: 'TPPH (monthly avg)',
    yLabel: 'OSAT Top 2 Box %',
    pairs,
    note: smgFullscale.length < 5 ? 'Upload more SMG FullScale reports for a meaningful sample' : null,
  };
}

function sig_oepeOSAT(ds) {
  const { opsRows = [], smgFullscale = [] } = ds;
  if (!opsRows.length || !smgFullscale.length) return null;
  const monthlyOps = monthlyOEPESummary(opsRows);
  const pairs = joinMonthly(
    monthlyOps, r => r.oepe,
    smgFullscale, r => r.osatTop2
  );
  const r = pearson(pairs);
  if (r === null) return null;
  return {
    id: 'oepe_osat',
    name: 'OEPE → OSAT Score',
    description: 'Slower drive-thru times may reduce customer satisfaction. Negative r confirms the relationship.',
    r, n: pairs.length, strength: signalStrength(r),
    direction: r < 0 ? 'negative' : 'positive',
    expectedDir: 'negative',
    confirmed: r < -0.30,
    xLabel: 'Avg OEPE (sec)',
    yLabel: 'OSAT Top 2 Box %',
    pairs,
  };
}

function sig_otLaborOverage(ds) {
  const { laborRows = [], monthlyTargets = {} } = ds;
  if (!laborRows.length || !Object.keys(monthlyTargets).length) return null;
  const monthly = monthlyLaborSummary(laborRows);
  const pairs = [];
  for (const r of monthly) {
    if (!r.laborPct || !r.otHrs) continue;
    const t = monthlyTargets[r.loc] || {};
    const proj = t.tCrewLabor || t.tLabor;
    if (!proj) continue;
    const projNorm = proj > 1 ? proj / 100 : proj;
    pairs.push({ x: r.otHrs, y: r.laborPct - projNorm, loc: r.loc, date: r.date });
  }
  const r = pearson(pairs);
  if (r === null) return null;
  return {
    id: 'ot_labor_overage',
    name: 'OT Hours → Labor % vs Target',
    description: 'Stores accumulating overtime tend to run labor % above their monthly target. OT is a leading indicator.',
    r, n: pairs.length, strength: signalStrength(r),
    direction: r > 0 ? 'positive' : 'negative',
    expectedDir: 'positive',
    confirmed: r > 0.30,
    xLabel: 'Monthly OT Hours',
    yLabel: 'Labor % − Target',
    pairs,
  };
}

function sig_exceptionsOT(ds) {
  const { exceptionRows = [], laborRows = [] } = ds;
  if (!exceptionRows.length || !laborRows.length) return null;
  const pairs = joinDaily(exceptionRows, 'totalExceptions', laborRows, 'otHrs');
  const r = pearson(pairs);
  if (r === null) return null;
  return {
    id: 'exceptions_ot',
    name: 'Labor Exceptions → OT Hours',
    description: 'Missed breaks and late punches may indicate scheduling pressure that also drives overtime accumulation.',
    r, n: pairs.length, strength: signalStrength(r),
    direction: r > 0 ? 'positive' : 'negative',
    expectedDir: 'positive',
    confirmed: r > 0.30,
    xLabel: 'Total Exceptions',
    yLabel: 'OT Hours',
    pairs,
    note: !exceptionRows.length ? 'Upload Labor Exceptions reports to activate this signal' : null,
  };
}

function sig_dtMixLabor(ds) {
  const { laborRows = [] } = ds;
  if (!laborRows.length) return null;
  // DT-heavy stores may run different labor profiles
  const valid = laborRows.filter(r => r.dtPctTotal != null && r.dtPctTotal > 0 && r.laborPct > 0 && r.sales > 0);
  if (valid.length < 8) return null;
  const pairs = valid.map(r => ({ x: r.dtPctTotal, y: r.laborPct, loc: r.loc, date: r.date }));
  const r = pearson(pairs);
  if (r === null) return null;
  return {
    id: 'dt_mix_labor',
    name: 'DT Sales Mix → Labor %',
    description: 'Drive-thru heavy stores may run structurally different labor profiles than dine-in focused stores.',
    r, n: pairs.length, strength: signalStrength(r),
    direction: r > 0 ? 'positive' : 'negative',
    expectedDir: null, // direction is informational, not prescriptive
    confirmed: Math.abs(r) > 0.30,
    xLabel: 'DT % of Total Sales',
    yLabel: 'Crew Labor %',
    pairs,
  };
}

// ── Main export ────────────────────────────────────────────────────────────────

export function computeInsights(ds) {
  const runners = [
    sig_scheduleGapOEPE,
    sig_laborFoodCost,
    sig_tpphOSAT,
    sig_oepeOSAT,
    sig_otLaborOverage,
    sig_exceptionsOT,
    sig_dtMixLabor,
  ];
  const results = [];
  for (const fn of runners) {
    try {
      const sig = fn(ds);
      if (sig) {
        results.push(sig);
        console.log(`[signals] ${sig.id}: r=${sig.r?.toFixed(3)} n=${sig.n} strength=${sig.strength}`);
      } else {
        console.log(`[signals] ${fn.name}: null (insufficient data or no matching pairs)`);
      }
    } catch (e) {
      console.warn('[insights]', fn.name, e);
    }
  }
  // Sort: confirmed first, then by |r| descending
  results.sort((a, b) => {
    if (a.confirmed !== b.confirmed) return a.confirmed ? -1 : 1;
    return Math.abs(b.r || 0) - Math.abs(a.r || 0);
  });
  return results;
}

export { signalStrength };
