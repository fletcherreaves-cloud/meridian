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
export function normLoc(loc) {
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

// Generic monthly simple-average for a single field from any row array
function monthlyFieldAvg(rows, field) {
  const byKey = {};
  for (const r of rows) {
    const v = r[field];
    if (!r.date || v == null || v === 0 || isNaN(v)) continue;
    const k = normLoc(r.loc || '') + '_' + _mKey(r.date);
    if (!byKey[k]) byKey[k] = { loc: r.loc, date: r.date, sum: 0, n: 0 };
    byKey[k].sum += v; byKey[k].n++;
  }
  return Object.values(byKey).map(b => ({ loc: b.loc, date: b.date, [field]: b.n > 0 ? b.sum / b.n : null }));
}

// Monthly total of a field (e.g. OT hours, drawer opens, refunds)
function monthlyFieldTotal(rows, field) {
  const byKey = {};
  for (const r of rows) {
    const v = r[field];
    if (!r.date || v == null || isNaN(v)) continue;
    const k = normLoc(r.loc || '') + '_' + _mKey(r.date);
    if (!byKey[k]) byKey[k] = { loc: r.loc, date: r.date, total: 0 };
    byKey[k].total += v;
  }
  return Object.values(byKey).map(b => ({ loc: b.loc, date: b.date, [field]: b.total }));
}

// Extended monthly labor summary including avgCheck, gc, avgRate
function monthlyLaborExtended(laborRows) {
  const byKey = {};
  for (const r of laborRows) {
    if (!r.date || !(r.sales > 0)) continue;
    const k = normLoc(r.loc || '') + '_' + _mKey(r.date);
    if (!byKey[k]) byKey[k] = { loc: r.loc, date: r.date, sales: 0, laborW: 0, tpphW: 0, otHrs: 0,
      gcSum: 0, checkSum: 0, checkN: 0, rateSum: 0, rateN: 0, n: 0 };
    const b = byKey[k];
    b.sales   += r.sales;
    b.laborW  += (r.laborPct || 0) * r.sales;
    b.tpphW   += (r.tpph || 0) * r.sales;
    b.otHrs   += (r.otHrs || 0);
    if (r.gc > 0) b.gcSum += r.gc;
    if (r.avgCheck > 0) { b.checkSum += r.avgCheck; b.checkN++; }
    if (r.avgRate > 0) { b.rateSum += r.avgRate; b.rateN++; }
    b.n++;
  }
  return Object.values(byKey).map(b => ({
    ...b,
    laborPct: b.sales > 0 ? b.laborW / b.sales : null,
    tpph:     b.sales > 0 ? b.tpphW / b.sales : null,
    avgCheck: b.checkN > 0 ? b.checkSum / b.checkN : null,
    avgRate:  b.rateN > 0 ? b.rateSum / b.rateN : null,
  }));
}

// ── Signal definitions ────────────────────────────────────────────────────────
// Each signal returns { id, name, description, r, n, strength, direction,
//   expectedDir, confirmed, xLabel, yLabel, pairs[], domain, chain?, note? }
//
// domain values: 'service' | 'labor' | 'sales' | 'food_cost' | 'customer'
// chain: 'scheduling_cascade' marks signals in the scheduling→OEPE→KVS→Sales path

// ── SCHEDULING CASCADE SIGNALS ────────────────────────────────────────────────
// The key cascade: Under-schedule → OEPE up → KVS suffers → Sales down → GC down

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
    domain: 'service',
    chain: 'scheduling_cascade',
    note: pairs.length < 20 ? 'Upload more LifeLenz data to strengthen this signal' : null,
  };
}

function sig_oepeKVS(ds) {
  const { opsRows = [] } = ds;
  const valid = opsRows.filter(r => r.oepe > 0 && (r.kvst > 0 || r.kvsu > 0));
  if (valid.length < 8) return null;
  const pairs = valid.map(r => ({ x: r.oepe, y: r.kvst || r.kvsu, loc: r.loc, date: r.date }));
  const r = pearson(pairs);
  if (r === null) return null;
  return {
    id: 'oepe_kvs',
    name: 'OEPE → KVS Service Time',
    description: 'Drive-thru total time and kitchen assembly time move together — busy days slow both simultaneously.',
    r, n: pairs.length, strength: signalStrength(r),
    direction: r > 0 ? 'positive' : 'negative',
    expectedDir: 'positive',
    confirmed: r > 0.30,
    xLabel: 'OEPE (sec)',
    yLabel: 'KVS Service Time (sec)',
    pairs,
    domain: 'service',
    chain: 'scheduling_cascade',
  };
}

function sig_oepeSales(ds) {
  const { opsRows = [], schedRows = [] } = ds;
  if (!opsRows.length || !schedRows.length) return null;
  const pairs = joinDaily(opsRows, 'oepe', schedRows, 'sales');
  if (pairs.length < 8) return null;
  const r = pearson(pairs);
  if (r === null) return null;
  return {
    id: 'oepe_sales',
    name: 'OEPE → Daily Sales',
    description: 'Slower drive-thru speed limits throughput and constrains daily sales. Every second of OEPE has a revenue cost.',
    r, n: pairs.length, strength: signalStrength(r),
    direction: r < 0 ? 'negative' : 'positive',
    expectedDir: 'negative',
    confirmed: r < -0.30,
    xLabel: 'OEPE (sec)',
    yLabel: 'Daily Sales ($)',
    pairs,
    domain: 'sales',
    chain: 'scheduling_cascade',
  };
}

function sig_kvsServiceSales(ds) {
  const { opsRows = [], schedRows = [] } = ds;
  if (!opsRows.length || !schedRows.length) return null;
  const opsWithKvs = opsRows.filter(r => (r.kvst > 0 || r.kvsu > 0));
  if (!opsWithKvs.length) return null;
  const mapped = opsWithKvs.map(r => ({ ...r, _kvs: r.kvst || r.kvsu }));
  const pairs = joinDaily(mapped, '_kvs', schedRows, 'sales');
  if (pairs.length < 8) return null;
  const r = pearson(pairs);
  if (r === null) return null;
  return {
    id: 'kvs_service_sales',
    name: 'KVS Service Time → Daily Sales',
    description: 'Faster kitchen assembly unlocks more cars per hour. Slow KVS is a throughput ceiling that shows up in daily sales.',
    r, n: pairs.length, strength: signalStrength(r),
    direction: r < 0 ? 'negative' : 'positive',
    expectedDir: 'negative',
    confirmed: r < -0.30,
    xLabel: 'KVS Service Time (sec)',
    yLabel: 'Daily Sales ($)',
    pairs,
    domain: 'service',
    chain: 'scheduling_cascade',
  };
}

function sig_scheduleGapSales(ds) {
  const { schedRows = [] } = ds;
  const valid = schedRows.filter(r => r.schVsIdealDiff != null && r.sales > 0);
  if (valid.length < 8) return null;
  const pairs = valid.map(r => ({ x: r.schVsIdealDiff, y: r.sales, loc: r.loc, date: r.date }));
  const r = pearson(pairs);
  if (r === null) return null;
  return {
    id: 'schedule_gap_sales',
    name: 'Scheduling Gap → Daily Sales',
    description: 'Under-scheduled shifts constrain sales by slowing service. Positive r = more staff hours directly enables higher sales.',
    r, n: pairs.length, strength: signalStrength(r),
    direction: r > 0 ? 'positive' : 'negative',
    expectedDir: 'positive',
    confirmed: r > 0.30,
    xLabel: 'Crew vs Ideal Hrs (negative = under-staffed)',
    yLabel: 'Daily Sales ($)',
    pairs,
    domain: 'sales',
    chain: 'scheduling_cascade',
  };
}

// ── LABOR SIGNALS ─────────────────────────────────────────────────────────────

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
    domain: 'food_cost',
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
    domain: 'labor',
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
    domain: 'labor',
    note: !exceptionRows.length ? 'Upload Labor Exceptions reports to activate this signal' : null,
  };
}

function sig_dtMixLabor(ds) {
  const { laborRows = [] } = ds;
  if (!laborRows.length) return null;
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
    domain: 'labor',
  };
}

// ── SERVICE — additional signals ──────────────────────────────────────────────

function sig_parkOEPE(ds) {
  const { opsRows = [] } = ds;
  const valid = opsRows.filter(r => r.park > 0 && r.oepe > 0);
  if (valid.length < 8) return null;
  const pairs = valid.map(r => ({ x: r.park, y: r.oepe, loc: r.loc, date: r.date }));
  const r = pearson(pairs);
  if (r === null) return null;
  return {
    id: 'park_oepe', name: 'Park Rate → OEPE',
    description: 'Parked cars add to drive-thru cycle time. High park rates inflate OEPE by pulling complex orders out of the window.',
    r, n: pairs.length, strength: signalStrength(r),
    direction: r > 0 ? 'positive' : 'negative', expectedDir: 'positive',
    confirmed: r > 0.30,
    xLabel: 'DT Park %', yLabel: 'OEPE (sec)', pairs, domain: 'service',
  };
}

function sig_parkSales(ds) {
  const { opsRows = [], laborRows = [] } = ds;
  if (!opsRows.length || !laborRows.length) return null;
  const parkRows = opsRows.filter(r => r.park > 0);
  const pairs = joinDaily(parkRows, 'park', laborRows, 'sales');
  if (pairs.length < 8) return null;
  const r = pearson(pairs);
  if (r === null) return null;
  return {
    id: 'park_sales', name: 'Park Rate → Daily Sales',
    description: 'High park rates indicate order complexity and slow throughput — a ceiling on how many cars the store can serve per hour.',
    r, n: pairs.length, strength: signalStrength(r),
    direction: r < 0 ? 'negative' : 'positive', expectedDir: 'negative',
    confirmed: r < -0.30,
    xLabel: 'DT Park %', yLabel: 'Daily Sales ($)', pairs, domain: 'service',
  };
}

function sig_dtMixOEPE(ds) {
  const { laborRows = [], opsRows = [] } = ds;
  if (!laborRows.length || !opsRows.length) return null;
  const dtRows = laborRows.filter(r => r.dtPctTotal > 0);
  const pairs = joinDaily(dtRows, 'dtPctTotal', opsRows, 'oepe');
  if (pairs.length < 8) return null;
  const r = pearson(pairs);
  if (r === null) return null;
  return {
    id: 'dt_mix_oepe', name: 'DT Sales Mix → OEPE',
    description: 'Higher drive-thru concentration puts more pressure on DT operations and may stretch OEPE on high-mix days.',
    r, n: pairs.length, strength: signalStrength(r),
    direction: r > 0 ? 'positive' : 'negative', expectedDir: 'positive',
    confirmed: r > 0.30,
    xLabel: 'DT % of Total Sales', yLabel: 'OEPE (sec)', pairs, domain: 'service',
  };
}

function sig_r2pSales(ds) {
  const { opsRows = [], laborRows = [] } = ds;
  if (!opsRows.length || !laborRows.length) return null;
  const r2pRows = opsRows.filter(r => r.r2p > 0);
  const pairs = joinDaily(r2pRows, 'r2p', laborRows, 'sales');
  if (pairs.length < 8) return null;
  const r = pearson(pairs);
  if (r === null) return null;
  return {
    id: 'r2p_sales', name: 'R2P Pace → Daily Sales',
    description: 'Higher Ready-to-Pull pace (more cars pulled before fully assembled) may reflect throughput pressure. Informational: direction reveals whether this store trades R2P for speed.',
    r, n: pairs.length, strength: signalStrength(r),
    direction: r > 0 ? 'positive' : 'negative', expectedDir: null,
    confirmed: Math.abs(r) > 0.30,
    xLabel: 'R2P Count', yLabel: 'Daily Sales ($)', pairs, domain: 'service',
  };
}

function sig_avgCheckOEPE(ds) {
  const { laborRows = [], opsRows = [] } = ds;
  if (!laborRows.length || !opsRows.length) return null;
  const checkRows = laborRows.filter(r => r.avgCheck > 0);
  const pairs = joinDaily(checkRows, 'avgCheck', opsRows, 'oepe');
  if (pairs.length < 8) return null;
  const r = pearson(pairs);
  if (r === null) return null;
  return {
    id: 'avg_check_oepe', name: 'Avg Check → OEPE',
    description: 'Larger average tickets (more complex orders) may slow drive-thru times. Positive r confirms that high-check days run slower.',
    r, n: pairs.length, strength: signalStrength(r),
    direction: r > 0 ? 'positive' : 'negative', expectedDir: 'positive',
    confirmed: r > 0.30,
    xLabel: 'Avg Check ($)', yLabel: 'OEPE (sec)', pairs, domain: 'service',
  };
}

// ── LABOR — additional signals ─────────────────────────────────────────────────

function sig_tpphLaborPct(ds) {
  const { laborRows = [] } = ds;
  const valid = laborRows.filter(r => r.tpph > 0 && r.laborPct > 0 && r.sales > 0);
  if (valid.length < 8) return null;
  const pairs = valid.map(r => ({ x: r.tpph, y: r.laborPct, loc: r.loc, date: r.date }));
  const r = pearson(pairs);
  if (r === null) return null;
  return {
    id: 'tpph_labor_pct', name: 'TPPH → Labor %',
    description: 'Higher throughput per person hour should drive labor % down — same fixed staff cost spread over more sales. Negative r confirms this efficiency relationship.',
    r, n: pairs.length, strength: signalStrength(r),
    direction: r < 0 ? 'negative' : 'positive', expectedDir: 'negative',
    confirmed: r < -0.30,
    xLabel: 'TPPH', yLabel: 'Crew Labor %', pairs, domain: 'labor',
  };
}

function sig_avgCheckTPPH(ds) {
  const { laborRows = [] } = ds;
  const valid = laborRows.filter(r => r.avgCheck > 0 && r.tpph > 0 && r.sales > 0);
  if (valid.length < 8) return null;
  const pairs = valid.map(r => ({ x: r.avgCheck, y: r.tpph, loc: r.loc, date: r.date }));
  const r = pearson(pairs);
  if (r === null) return null;
  return {
    id: 'avg_check_tpph', name: 'Avg Check ↔ TPPH (Speed/Ticket Tradeoff)',
    description: 'Classic McDonald\'s tension: faster throughput days often have smaller average tickets (less upsell time per customer). Negative r confirms the tradeoff exists.',
    r, n: pairs.length, strength: signalStrength(r),
    direction: r < 0 ? 'negative' : 'positive', expectedDir: 'negative',
    confirmed: r < -0.30,
    xLabel: 'Avg Check ($)', yLabel: 'TPPH', pairs, domain: 'labor',
  };
}

function sig_schedGapOT(ds) {
  const { schedRows = [], ctrlRows = [] } = ds;
  if (!schedRows.length || !ctrlRows.length) return null;
  const gapRows = schedRows.filter(r => r.schVsIdealDiff != null);
  const pairs = joinDaily(gapRows, 'schVsIdealDiff', ctrlRows, 'otHrs');
  if (pairs.length < 8) return null;
  const r = pearson(pairs);
  if (r === null) return null;
  return {
    id: 'sched_gap_ot', name: 'Scheduling Gap → OT Hours',
    description: 'Under-scheduled shifts force remaining crew into overtime to cover. Negative r = less staff scheduled → more OT needed to close the gap.',
    r, n: pairs.length, strength: signalStrength(r),
    direction: r < 0 ? 'negative' : 'positive', expectedDir: 'negative',
    confirmed: r < -0.30,
    xLabel: 'Crew vs Ideal Hrs (neg = under)', yLabel: 'OT Hours', pairs, domain: 'labor',
    chain: 'scheduling_cascade',
  };
}

function sig_avgRateLaborPct(ds) {
  const { laborRows = [] } = ds;
  const monthly = monthlyLaborExtended(laborRows);
  const valid = monthly.filter(m => m.avgRate > 0 && m.laborPct > 0);
  if (valid.length < 8) return null;
  const pairs = valid.map(m => ({ x: m.avgRate, y: m.laborPct, loc: m.loc, date: m.date }));
  const r = pearson(pairs);
  if (r === null) return null;
  return {
    id: 'avg_rate_labor_pct', name: 'Avg Wage Rate → Labor %',
    description: 'Higher average hourly wages mechanically push labor % up — helpful for diagnosing whether labor overage is a scheduling problem or a compensation structure problem.',
    r, n: pairs.length, strength: signalStrength(r),
    direction: r > 0 ? 'positive' : 'negative', expectedDir: 'positive',
    confirmed: r > 0.30,
    xLabel: 'Avg Hourly Rate ($)', yLabel: 'Crew Labor % (monthly)', pairs, domain: 'labor',
  };
}

function sig_gcLaborPct(ds) {
  const { laborRows = [] } = ds;
  const monthly = monthlyLaborExtended(laborRows);
  const valid = monthly.filter(m => m.gcSum > 0 && m.laborPct > 0 && m.sales > 0);
  if (valid.length < 8) return null;
  const pairs = valid.map(m => ({ x: m.gcSum, y: m.laborPct, loc: m.loc, date: m.date }));
  const r = pearson(pairs);
  if (r === null) return null;
  return {
    id: 'gc_labor_pct', name: 'Guest Count → Labor % (Volume Leverage)',
    description: 'Higher guest counts spread fixed labor cost over more transactions, improving labor %. Strong negative r = this store has good labor leverage when volume is up.',
    r, n: pairs.length, strength: signalStrength(r),
    direction: r < 0 ? 'negative' : 'positive', expectedDir: 'negative',
    confirmed: r < -0.30,
    xLabel: 'Monthly Guest Count', yLabel: 'Crew Labor % (monthly)', pairs, domain: 'labor',
  };
}

// ── FINANCIAL / CONTROLS signals ───────────────────────────────────────────────

function sig_discountSales(ds) {
  const { ctrlRows = [], laborRows = [] } = ds;
  if (!ctrlRows.length || !laborRows.length) return null;
  const discRows = ctrlRows.filter(r => r.discPct > 0);
  const pairs = joinDaily(discRows, 'discPct', laborRows, 'sales');
  if (pairs.length < 8) return null;
  const r = pearson(pairs);
  if (r === null) return null;
  return {
    id: 'discount_sales', name: 'Discount % → Daily Sales',
    description: 'Reveals whether discount-heavy days drive incremental sales or mask slow periods. Positive r = discounts correlate with higher sales (promotional lift). Negative r = heavy discounting on slower days (damage control).',
    r, n: pairs.length, strength: signalStrength(r),
    direction: r > 0 ? 'positive' : 'negative', expectedDir: null,
    confirmed: Math.abs(r) > 0.30,
    xLabel: 'Discount %', yLabel: 'Daily Sales ($)', pairs, domain: 'food_cost',
  };
}

function sig_drawerCashOS(ds) {
  const { ctrlRows = [] } = ds;
  const valid = ctrlRows.filter(r => r.drawerOpens > 0 && r.cashOSPct != null);
  if (valid.length < 8) return null;
  const pairs = valid.map(r => ({ x: r.drawerOpens, y: Math.abs(r.cashOSPct), loc: r.loc, date: r.date }));
  const r = pearson(pairs);
  if (r === null) return null;
  return {
    id: 'drawer_cash_os', name: 'Drawer Opens → Cash Over/Short',
    description: 'Excess unauthorized drawer opens are a control signal. Positive r = more drawer opens correlate with larger cash variances — an audit flag.',
    r, n: pairs.length, strength: signalStrength(r),
    direction: r > 0 ? 'positive' : 'negative', expectedDir: 'positive',
    confirmed: r > 0.30,
    xLabel: 'Unauthorized Drawer Opens', yLabel: '|Cash O/S %|', pairs, domain: 'food_cost',
  };
}

function sig_manRefLaborPct(ds) {
  const { ctrlRows = [], laborRows = [] } = ds;
  if (!ctrlRows.length || !laborRows.length) return null;
  const manRows = ctrlRows.filter(r => r.manualRefAmt > 0);
  if (manRows.length < 8) return null;
  const pairs = joinDaily(manRows, 'manualRefAmt', laborRows, 'laborPct');
  if (pairs.length < 8) return null;
  const r = pearson(pairs);
  if (r === null) return null;
  return {
    id: 'man_ref_labor_pct', name: 'Manual Refund Amt → Labor %',
    description: 'High manual refund activity on high-labor days may indicate management quality issues — both tend to be elevated when operational discipline is under pressure.',
    r, n: pairs.length, strength: signalStrength(r),
    direction: r > 0 ? 'positive' : 'negative', expectedDir: 'positive',
    confirmed: r > 0.30,
    xLabel: 'Manual Refund/Overring ($)', yLabel: 'Crew Labor %', pairs, domain: 'food_cost',
  };
}

function sig_redBFoodCost(ds) {
  const { ctrlRows = [], fobRows = [] } = ds;
  if (!ctrlRows.length || !fobRows.length) return null;
  const redBRows = ctrlRows.filter(r => r.tRedBPct > 0);
  if (redBRows.length < 8) return null;
  const monthlyWaste = monthlyFieldAvg(redBRows, 'tRedBPct');
  const pairs = joinMonthly(monthlyWaste, r => r.tRedBPct, fobRows, r => r.baseFoodPct || r.fobPct);
  if (pairs.length < 8) return null;
  const r = pearson(pairs);
  if (r === null) return null;
  return {
    id: 'redb_food_cost', name: 'Waste (Red B) Rate → Food Cost %',
    description: 'Red B (waste/discard) percentage directly drives food cost. Strong positive r is expected — confirms that waste reduction is the primary food cost lever.',
    r, n: pairs.length, strength: signalStrength(r),
    direction: r > 0 ? 'positive' : 'negative', expectedDir: 'positive',
    confirmed: r > 0.30,
    xLabel: 'Red B Waste %', yLabel: 'Base Food Cost %', pairs, domain: 'food_cost',
  };
}

function sig_posOverTPPH(ds) {
  const { ctrlRows = [], laborRows = [] } = ds;
  if (!ctrlRows.length || !laborRows.length) return null;
  const posRows = ctrlRows.filter(r => r.posOverCnt > 0);
  if (posRows.length < 8) return null;
  const pairs = joinDaily(posRows, 'posOverCnt', laborRows, 'tpph');
  if (pairs.length < 8) return null;
  const r = pearson(pairs);
  if (r === null) return null;
  return {
    id: 'pos_over_tpph', name: 'POS Overrides → TPPH',
    description: 'POS overrides (void/price changes) on high-throughput days may indicate speed-driven shortcuts. Positive r = busy shifts see more overrides — a training or control flag.',
    r, n: pairs.length, strength: signalStrength(r),
    direction: r > 0 ? 'positive' : 'negative', expectedDir: null,
    confirmed: Math.abs(r) > 0.30,
    xLabel: 'POS Override Count', yLabel: 'TPPH', pairs, domain: 'food_cost',
  };
}

// ── SALES / FOOD COST — additional signals ─────────────────────────────────────

function sig_salesFoodCostLeverage(ds) {
  const { laborRows = [], fobRows = [] } = ds;
  if (!laborRows.length || !fobRows.length) return null;
  const monthly = monthlyLaborExtended(laborRows);
  const pairs = joinMonthly(monthly, r => r.sales, fobRows, r => r.baseFoodPct || r.fobPct);
  if (pairs.length < 8) return null;
  const r = pearson(pairs);
  if (r === null) return null;
  return {
    id: 'sales_food_cost_leverage', name: 'Monthly Sales → Food Cost % (Leverage)',
    description: 'Higher sales months should produce lower food cost % as fixed waste and comps spread over more revenue. Strong negative r = this store benefits significantly from volume leverage.',
    r, n: pairs.length, strength: signalStrength(r),
    direction: r < 0 ? 'negative' : 'positive', expectedDir: 'negative',
    confirmed: r < -0.30,
    xLabel: 'Monthly Net Sales ($)', yLabel: 'Food Cost %', pairs, domain: 'food_cost',
  };
}

function sig_tpphFoodCost(ds) {
  const { laborRows = [], fobRows = [] } = ds;
  if (!laborRows.length || !fobRows.length) return null;
  const monthly = monthlyLaborExtended(laborRows);
  const valid = monthly.filter(m => m.tpph > 0);
  const pairs = joinMonthly(valid, r => r.tpph, fobRows, r => r.baseFoodPct || r.fobPct);
  if (pairs.length < 8) return null;
  const r = pearson(pairs);
  if (r === null) return null;
  return {
    id: 'tpph_food_cost', name: 'TPPH → Food Cost %',
    description: 'Higher throughput efficiency may reduce per-transaction handling time and waste. Negative r = efficient stores manage food cost better.',
    r, n: pairs.length, strength: signalStrength(r),
    direction: r < 0 ? 'negative' : 'positive', expectedDir: 'negative',
    confirmed: r < -0.30,
    xLabel: 'TPPH (monthly avg)', yLabel: 'Food Cost %', pairs, domain: 'food_cost',
  };
}

function sig_avgCheckSales(ds) {
  const { laborRows = [] } = ds;
  const valid = laborRows.filter(r => r.avgCheck > 0 && r.sales > 0);
  if (valid.length < 8) return null;
  const pairs = valid.map(r => ({ x: r.avgCheck, y: r.sales, loc: r.loc, date: r.date }));
  const r = pearson(pairs);
  if (r === null) return null;
  return {
    id: 'avg_check_sales', name: 'Avg Check → Daily Sales',
    description: 'On high-sales days does this store win via higher avg check, more guests, or both? Reveals whether the store\'s top-line growth is check-driven or volume-driven.',
    r, n: pairs.length, strength: signalStrength(r),
    direction: r > 0 ? 'positive' : 'negative', expectedDir: null,
    confirmed: Math.abs(r) > 0.30,
    xLabel: 'Avg Check ($)', yLabel: 'Daily Sales ($)', pairs, domain: 'sales',
  };
}

// ── CUSTOMER — additional signals ──────────────────────────────────────────────

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
    domain: 'customer',
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
    domain: 'customer',
  };
}

function sig_parkOSAT(ds) {
  const { opsRows = [], smgFullscale = [] } = ds;
  if (!opsRows.length || !smgFullscale.length) return null;
  const parkRows = monthlyFieldAvg(opsRows.filter(r => r.park > 0), 'park');
  if (!parkRows.length) return null;
  const pairs = joinMonthly(parkRows, r => r.park, smgFullscale, r => r.osatTop2);
  if (pairs.length < 4) return null;
  const r = pearson(pairs);
  if (r === null) return null;
  return {
    id: 'park_osat', name: 'Park Rate → OSAT Score',
    description: 'Frequent parking erodes perceived speed of service and drops OSAT. Strong negative r = parking is a customer experience lever.',
    r, n: pairs.length, strength: signalStrength(r),
    direction: r < 0 ? 'negative' : 'positive', expectedDir: 'negative',
    confirmed: r < -0.30,
    xLabel: 'DT Park % (monthly avg)', yLabel: 'OSAT Top 2 Box %', pairs, domain: 'customer',
    note: smgFullscale.length < 5 ? 'Upload more SMG FullScale reports for a meaningful sample' : null,
  };
}

function sig_avgCheckOSAT(ds) {
  const { laborRows = [], smgFullscale = [] } = ds;
  if (!laborRows.length || !smgFullscale.length) return null;
  const monthly = monthlyLaborExtended(laborRows);
  const valid = monthly.filter(m => m.avgCheck > 0);
  const pairs = joinMonthly(valid, r => r.avgCheck, smgFullscale, r => r.osatTop2);
  if (pairs.length < 4) return null;
  const r = pearson(pairs);
  if (r === null) return null;
  return {
    id: 'avg_check_osat', name: 'Avg Check → OSAT Score',
    description: 'Higher average check months may reflect upsell success and engaged crew — which also drives better service scores. Or it may indicate slower, complex orders that frustrate customers.',
    r, n: pairs.length, strength: signalStrength(r),
    direction: r > 0 ? 'positive' : 'negative', expectedDir: null,
    confirmed: Math.abs(r) > 0.30,
    xLabel: 'Avg Check ($, monthly avg)', yLabel: 'OSAT Top 2 Box %', pairs, domain: 'customer',
    note: smgFullscale.length < 5 ? 'Upload more SMG FullScale reports for a meaningful sample' : null,
  };
}

function sig_schedGapOSAT(ds) {
  const { schedRows = [], smgFullscale = [] } = ds;
  if (!schedRows.length || !smgFullscale.length) return null;
  const gapRows = schedRows.filter(r => r.schVsIdealDiff != null);
  if (!gapRows.length) return null;
  const pairs = joinMonthly(gapRows, r => r.schVsIdealDiff, smgFullscale, r => r.osatTop2);
  if (pairs.length < 4) return null;
  const r = pearson(pairs);
  if (r === null) return null;
  return {
    id: 'sched_gap_osat', name: 'Scheduling Gap → OSAT Score',
    description: 'Under-staffed shifts drive slower service and stressed crew — both hurt OSAT. Positive r (more staff = better score) confirms the link.',
    r, n: pairs.length, strength: signalStrength(r),
    direction: r > 0 ? 'positive' : 'negative', expectedDir: 'positive',
    confirmed: r > 0.30,
    xLabel: 'Crew vs Ideal Hrs (monthly avg)', yLabel: 'OSAT Top 2 Box %', pairs, domain: 'customer',
    note: smgFullscale.length < 5 ? 'Upload more SMG FullScale reports for a meaningful sample' : null,
  };
}

function sig_discountOSAT(ds) {
  const { ctrlRows = [], smgFullscale = [] } = ds;
  if (!ctrlRows.length || !smgFullscale.length) return null;
  const discRows = ctrlRows.filter(r => r.discPct > 0);
  if (discRows.length < 8) return null;
  const monthly = monthlyFieldAvg(discRows, 'discPct');
  const pairs = joinMonthly(monthly, r => r.discPct, smgFullscale, r => r.osatTop2);
  if (pairs.length < 4) return null;
  const r = pearson(pairs);
  if (r === null) return null;
  return {
    id: 'discount_osat', name: 'Discount % → OSAT Score',
    description: 'High discount months may coincide with complaint resolution and service recovery — a negative r would suggest discounting follows poor experience, not vice versa.',
    r, n: pairs.length, strength: signalStrength(r),
    direction: r < 0 ? 'negative' : 'positive', expectedDir: null,
    confirmed: Math.abs(r) > 0.30,
    xLabel: 'Discount % (monthly avg)', yLabel: 'OSAT Top 2 Box %', pairs, domain: 'customer',
    note: smgFullscale.length < 5 ? 'Upload more SMG FullScale reports for a meaningful sample' : null,
  };
}

function sig_gcAvgCheck(ds) {
  const { laborRows = [] } = ds;
  const monthly = monthlyLaborExtended(laborRows);
  const valid = monthly.filter(m => m.gcSum > 0 && m.avgCheck > 0);
  if (valid.length < 8) return null;
  const pairs = valid.map(m => ({ x: m.gcSum, y: m.avgCheck, loc: m.loc, date: m.date }));
  const r = pearson(pairs);
  if (r === null) return null;
  return {
    id: 'gc_avg_check', name: 'Guest Count ↔ Avg Check (Traffic/Ticket Tradeoff)',
    description: 'Classic McDonald\'s tradeoff: high-volume months may see lower average checks (speed-focused, less upsell time). Negative r confirms a traffic-vs-ticket tension at this store.',
    r, n: pairs.length, strength: signalStrength(r),
    direction: r < 0 ? 'negative' : 'positive', expectedDir: 'negative',
    confirmed: r < -0.30,
    xLabel: 'Monthly Guest Count', yLabel: 'Avg Check ($)', pairs, domain: 'customer',
  };
}

// ── Main export ────────────────────────────────────────────────────────────────

export function computeInsights(ds) {
  const runners = [
    // Cascade chain (scheduling → service → sales)
    sig_scheduleGapOEPE,
    sig_oepeKVS,
    sig_oepeSales,
    sig_kvsServiceSales,
    sig_scheduleGapSales,
    // Labor
    sig_laborFoodCost,
    sig_otLaborOverage,
    sig_exceptionsOT,
    sig_dtMixLabor,
    // Service — additional
    sig_parkOEPE,
    sig_parkSales,
    sig_dtMixOEPE,
    sig_r2pSales,
    sig_avgCheckOEPE,
    // Labor — additional
    sig_tpphLaborPct,
    sig_avgCheckTPPH,
    sig_schedGapOT,
    sig_avgRateLaborPct,
    sig_gcLaborPct,
    // Financial / Controls
    sig_discountSales,
    sig_drawerCashOS,
    sig_manRefLaborPct,
    sig_redBFoodCost,
    sig_posOverTPPH,
    // Sales / Food Cost
    sig_salesFoodCostLeverage,
    sig_tpphFoodCost,
    sig_avgCheckSales,
    // Customer
    sig_tpphOSAT,
    sig_oepeOSAT,
    sig_parkOSAT,
    sig_avgCheckOSAT,
    sig_schedGapOSAT,
    sig_discountOSAT,
    sig_gcAvgCheck,
  ];
  const results = [];
  for (const fn of runners) {
    try {
      const sig = fn(ds);
      if (sig) {
        results.push(sig);
        console.log(`[signals] ${sig.id}: r=${sig.r?.toFixed(3)} n=${sig.n} strength=${sig.strength} domain=${sig.domain}`);
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
