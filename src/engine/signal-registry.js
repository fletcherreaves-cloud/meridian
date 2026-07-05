// @ts-nocheck
// Signal Registry — metric definitions + extraction engine + custom signal computation

// ── Metric Categories ─────────────────────────────────────────────────────────
// source: ds array key; field: row field name; granularity: which modes work;
// better: 'higher'|'lower'|null; aggregate: 'avg'(default)|'sum' for monthly roll-up

export const METRIC_CATEGORIES = [
  {
    key: 'service', label: 'Service', color: '#60a5fa',
    metrics: [
      { key: 'oepe',        label: 'OEPE (sec)',                source: 'opsRows',    field: 'oepe',           granularity: ['daily','monthly'], better: 'lower',  unit: 'sec' },
      { key: 'kvst',        label: 'KVS Time (sec)',             source: 'opsRows',    field: 'kvst',           granularity: ['daily','monthly'], better: 'lower',  unit: 'sec', altField: 'kvsu' },
      { key: 'r2p',         label: 'R2P Front Counter (sec)',    source: 'opsRows',    field: 'r2p',            granularity: ['daily','monthly'], better: 'lower',  unit: 'sec' },
      { key: 'parkPct',     label: 'DT Park Rate (%)',           source: 'opsRows',    field: 'park',           granularity: ['daily','monthly'], better: 'lower',  unit: 'pct' },
      { key: 'dtMixPct',    label: 'DT Mix % of Sales',         source: 'laborRows',  field: 'dtPctTotal',     granularity: ['daily','monthly'], better: null,     unit: 'pct' },
    ],
  },
  {
    key: 'sales', label: 'Sales', color: '#f5bc00',
    metrics: [
      { key: 'sales',       label: 'Daily Sales ($)',            source: 'laborRows',  field: 'sales',          granularity: ['daily','monthly'], better: 'higher', unit: '$' },
      { key: 'gc',          label: 'Guest Count',                source: 'laborRows',  field: 'gc',             granularity: ['daily','monthly'], better: 'higher', unit: 'guests' },
      { key: 'avgCheck',    label: 'Avg Check ($)',              source: 'laborRows',  field: 'avgCheck',       granularity: ['daily','monthly'], better: 'higher', unit: '$' },
      { key: 'salesVsLY',   label: 'Sales vs LY (%)',           source: 'fobRows',    field: 'salesVsLY',      granularity: ['monthly'],        better: 'higher', unit: 'pct' },
    ],
  },
  {
    key: 'labor', label: 'Labor', color: '#a78bfa',
    metrics: [
      { key: 'laborPct',    label: 'Labor % of Sales',          source: 'laborRows',  field: 'laborPct',       granularity: ['daily','monthly'], better: 'lower',  unit: 'pct' },
      { key: 'tpph',        label: 'TPPH (Trans/Person-Hr)',    source: 'laborRows',  field: 'tpph',           granularity: ['daily','monthly'], better: 'higher', unit: 'trans' },
      { key: 'avgRate',     label: 'Avg Wage Rate ($/hr)',      source: 'laborRows',  field: 'avgRate',        granularity: ['daily','monthly'], better: null,     unit: '$/hr' },
      { key: 'otHrs',       label: 'OT Hours',                  source: 'laborRows',  field: 'otHrs',          granularity: ['daily','monthly'], better: 'lower',  unit: 'hrs', aggregate: 'sum' },
      { key: 'schedGap',    label: 'Schedule Gap vs Ideal (hrs)',source: 'schedRows',  field: 'schVsIdealDiff', granularity: ['daily','monthly'], better: null,     unit: 'hrs' },
    ],
  },
  {
    key: 'food_cost', label: 'Food Cost', color: '#f87171',
    metrics: [
      { key: 'fobPct',      label: 'FOB % (Food Over Base)',    source: 'fobRows',    field: 'fobPct',         granularity: ['monthly'],        better: 'lower',  unit: 'pct' },
      { key: 'baseFoodPct', label: 'Base Food %',               source: 'fobRows',    field: 'baseFoodPct',    granularity: ['monthly'],        better: 'lower',  unit: 'pct' },
      { key: 'compWaste',   label: 'Comp Waste %',              source: 'fobRows',    field: 'compWaste',      granularity: ['monthly'],        better: 'lower',  unit: 'pct' },
      { key: 'rawWaste',    label: 'Raw Waste %',               source: 'fobRows',    field: 'rawWaste',       granularity: ['monthly'],        better: 'lower',  unit: 'pct' },
      { key: 'condiment',   label: 'Condiment %',               source: 'fobRows',    field: 'condiment',      granularity: ['monthly'],        better: 'lower',  unit: 'pct' },
      { key: 'empMeal',     label: 'Emp Meal %',                source: 'fobRows',    field: 'empMeal',        granularity: ['monthly'],        better: 'lower',  unit: 'pct' },
      { key: 'statVar',     label: 'Stat Variance %',           source: 'fobRows',    field: 'statVar',        granularity: ['monthly'],        better: 'lower',  unit: 'pct' },
      { key: 'unexplained', label: 'Unexplained Diff %',        source: 'fobRows',    field: 'unexplained',    granularity: ['monthly'],        better: 'lower',  unit: 'pct' },
      { key: 'pLFoodPct',   label: 'P&L Food Cost %',          source: 'fobRows',    field: 'pLFoodPct',      granularity: ['monthly'],        better: 'lower',  unit: 'pct' },
      { key: 'pLPaperPct',  label: 'P&L Paper Cost %',         source: 'fobRows',    field: 'pLPaperPct',     granularity: ['monthly'],        better: 'lower',  unit: 'pct' },
    ],
  },
  {
    key: 'controls', label: 'Controls', color: '#fb923c',
    metrics: [
      { key: 'discPct',     label: 'Discount %',                source: 'ctrlRows',   field: 'discPct',        granularity: ['daily','monthly'], better: 'lower',  unit: 'pct' },
      { key: 'cashOSPct',   label: 'Cash Over/Short %',         source: 'ctrlRows',   field: 'cashOSPct',      granularity: ['daily','monthly'], better: 'lower',  unit: 'pct' },
      { key: 'drawerOpens', label: 'Drawer Opens (count)',       source: 'ctrlRows',   field: 'drawerOpens',    granularity: ['daily','monthly'], better: 'lower',  unit: 'count', aggregate: 'sum' },
      { key: 'manualRefAmt',label: 'Manual Refund ($)',          source: 'ctrlRows',   field: 'manualRefAmt',   granularity: ['daily','monthly'], better: 'lower',  unit: '$',    aggregate: 'sum' },
      { key: 'posOverCnt',  label: 'POS Override Count',         source: 'ctrlRows',   field: 'posOverCnt',     granularity: ['daily','monthly'], better: 'lower',  unit: 'count', aggregate: 'sum' },
      { key: 'tRedBPct',    label: 'Red B %',                   source: 'ctrlRows',   field: 'tRedBPct',       granularity: ['daily','monthly'], better: 'lower',  unit: 'pct' },
    ],
  },
  {
    key: 'customer', label: 'Customer (SMG)', color: '#34d399',
    metrics: [
      { key: 'osat5',       label: 'OSAT 5★ %',                source: 'smgFullscale', field: 'osat5',        granularity: ['monthly'],        better: 'higher', unit: 'pct' },
      { key: 'osatTop2',    label: 'OSAT Top-2 Box %',         source: 'smgFullscale', field: 'osatTop2',     granularity: ['monthly'],        better: 'higher', unit: 'pct' },
      { key: 'osatB2B',     label: 'B2B % (No Problem)',       source: 'smgFullscale', field: 'osatB2B',      granularity: ['monthly'],        better: 'higher', unit: 'pct' },
      { key: 'accuracyB2B', label: 'Accuracy B2B %',           source: 'smgFullscale', field: 'accuracyB2B',  granularity: ['monthly'],        better: 'higher', unit: 'pct' },
      { key: 'dtProblem',   label: 'DT Problem %',             source: 'smgFullscale', field: 'dtProblem',    granularity: ['monthly'],        better: 'lower',  unit: 'pct' },
      { key: 'overallProblem',label:'Overall Problem %',        source: 'smgFullscale', field: 'overallProblem',granularity: ['monthly'],       better: 'lower',  unit: 'pct' },
    ],
  },
];

// Flat lookup by key
export const METRIC_FLAT = {};
for (const cat of METRIC_CATEGORIES) {
  for (const m of cat.metrics) {
    METRIC_FLAT[m.key] = { ...m, category: cat.key, categoryLabel: cat.label, categoryColor: cat.color };
  }
}

export function findMetric(key) { return METRIC_FLAT[key] || null; }

// ── Period helpers ────────────────────────────────────────────────────────────
function _normLoc(l) { return String(parseInt(String(l||'').replace(/\D/g,''),10)||''); }
function _mKey(d) {
  const dt = d instanceof Date ? d : new Date(String(d));
  return dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0');
}
function _dKey(d) {
  const dt = d instanceof Date ? d : new Date(String(d));
  return dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0');
}
function _smgDate(r) { return new Date(r.year, (r.month||1)-1, 1); }

// ── Extraction ────────────────────────────────────────────────────────────────
// Returns [{loc, date, value}] for a given metric key, ds, granularity, optional scopeLoc
export function extractMetricValues(metricKey, ds, granularity, scopeLoc) {
  const meta = findMetric(metricKey);
  if (!meta) return [];
  const field = meta.field;
  const altField = meta.altField;
  const src = ds[meta.source] || [];
  const rows = scopeLoc ? src.filter(r => _normLoc(r.loc) === _normLoc(scopeLoc)) : src;

  if (meta.source === 'smgFullscale') {
    return rows
      .filter(r => r[field] != null && !isNaN(r[field]) && r.year && r.month)
      .map(r => ({ loc: _normLoc(r.loc), date: _smgDate(r), value: r[field] }));
  }

  if (granularity === 'daily') {
    return rows
      .filter(r => r.date)
      .flatMap(r => {
        const v = r[field] != null ? r[field] : (altField ? r[altField] : null);
        if (v == null || isNaN(v) || v === 0) return [];
        return [{ loc: _normLoc(r.loc), date: r.date, value: v }];
      });
  }

  // Monthly aggregation
  const byKey = {};
  for (const r of rows) {
    if (!r.date) continue;
    const v = r[field] != null ? r[field] : (altField ? r[altField] : null);
    if (v == null || isNaN(v)) continue;
    const k = _normLoc(r.loc) + '_' + _mKey(r.date);
    if (!byKey[k]) byKey[k] = { loc: _normLoc(r.loc), date: r.date, sum: 0, n: 0 };
    byKey[k].sum += v;
    byKey[k].n++;
  }
  return Object.values(byKey)
    .filter(b => b.n > 0)
    .map(b => ({ loc: b.loc, date: b.date, value: meta.aggregate === 'sum' ? b.sum : b.sum / b.n }));
}

// ── Statistics ────────────────────────────────────────────────────────────────
function pearson(pairs) {
  const n = pairs.length;
  if (n < 5) return null;
  const mx = pairs.reduce((s,p)=>s+p.x,0)/n;
  const my = pairs.reduce((s,p)=>s+p.y,0)/n;
  let num=0, dx2=0, dy2=0;
  for (const {x,y} of pairs) { const dx=x-mx,dy=y-my; num+=dx*dy; dx2+=dx*dx; dy2+=dy*dy; }
  if (!dx2||!dy2) return null;
  return Math.max(-1, Math.min(1, num/Math.sqrt(dx2*dy2)));
}

export function linearRegression(pairs) {
  const n = pairs.length;
  if (n < 5) return null;
  const mx = pairs.reduce((s,p)=>s+p.x,0)/n;
  const my = pairs.reduce((s,p)=>s+p.y,0)/n;
  let num=0, den=0;
  for (const {x,y} of pairs) { const dx=x-mx; num+=dx*(y-my); den+=dx*dx; }
  if (!den) return null;
  const slope = num/den;
  return { slope, intercept: my - slope*mx, mx, my };
}

// ── Conditional filtering ─────────────────────────────────────────────────────
// Conditions narrow the data before Pearson is computed.
// 'high'/'low' split at the median or average of the chosen axis values.
// 'positive'/'negative' split at zero (useful for gap/variance metrics).
function computeThreshold(values, reference) {
  if (!values.length) return null;
  if (reference === 'average') return values.reduce((a,b)=>a+b,0)/values.length;
  const sorted = [...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

function filterPairsByCondition(pairs, axis, condition, reference) {
  if (!condition || condition === 'all') return pairs;
  const get = p => axis === 'x' ? p.x : p.y;
  if (condition === 'positive') return pairs.filter(p => get(p) > 0);
  if (condition === 'negative') return pairs.filter(p => get(p) < 0);
  const threshold = computeThreshold(pairs.map(get), reference || 'median');
  if (threshold == null) return pairs;
  if (condition === 'high') return pairs.filter(p => get(p) > threshold);
  if (condition === 'low')  return pairs.filter(p => get(p) < threshold);
  return pairs;
}

export function getConditionLabel(condition, reference, metaMeta) {
  if (!condition || condition === 'all') return null;
  const ref = reference === 'average' ? 'avg' : 'median';
  if (condition === 'positive') return '> 0';
  if (condition === 'negative') return '< 0';
  if (condition === 'high') return metaMeta?.better === 'lower' ? `Above ${ref} (worse)` : `Above ${ref}`;
  if (condition === 'low')  return metaMeta?.better === 'higher' ? `Below ${ref} (worse)` : `Below ${ref}`;
  return condition;
}

// ── Custom Signal Computation ─────────────────────────────────────────────────
// def: { id, name, xMetric, yMetric, granularity, scope,
//        xCondition?, xReference?, yCondition?, yReference? }
// scope: 'district' or a loc string for per-store
// xCondition/yCondition: 'all'|'high'|'low'|'positive'|'negative'
// xReference/yReference: 'median'|'average'
export function computeCustomSignal(def, ds) {
  const xMeta = findMetric(def.xMetric);
  const yMeta = findMetric(def.yMetric);
  if (!xMeta || !yMeta) return null;

  const gran = def.granularity || 'daily';
  const scopeLoc = (!def.scope || def.scope === 'district') ? null : def.scope;

  const xVals = extractMetricValues(def.xMetric, ds, gran, scopeLoc);
  const yVals = extractMetricValues(def.yMetric, ds, gran, scopeLoc);
  if (!xVals.length || !yVals.length) return { r: null, n: 0, pairs: [], regression: null };

  const keyFn = gran === 'daily' ? _dKey : _mKey;
  const yIdx = {};
  for (const r of yVals) yIdx[_normLoc(r.loc) + '_' + keyFn(r.date)] = r.value;

  let pairs = [];
  for (const r of xVals) {
    const yv = yIdx[_normLoc(r.loc) + '_' + keyFn(r.date)];
    if (yv != null && !isNaN(yv)) pairs.push({ x: r.value, y: yv, loc: r.loc, date: r.date });
  }

  // Apply optional conditions
  const xCond = def.xCondition || 'all';
  const yCond = def.yCondition || 'all';
  const xRef  = def.xReference || 'median';
  const yRef  = def.yReference || 'median';
  if (xCond !== 'all') pairs = filterPairsByCondition(pairs, 'x', xCond, xRef);
  if (yCond !== 'all') pairs = filterPairsByCondition(pairs, 'y', yCond, yRef);

  const r = pearson(pairs);
  const regression = r != null ? linearRegression(pairs) : null;
  const confirmed = r != null && Math.abs(r) >= 0.50 && pairs.length >= 20;

  const xCondLabel = getConditionLabel(xCond, xRef, xMeta);
  const yCondLabel = getConditionLabel(yCond, yRef, yMeta);
  const condDesc = [xCondLabel ? `X: ${xCondLabel}` : null, yCondLabel ? `Y: ${yCondLabel}` : null].filter(Boolean).join(' · ');

  return {
    id: def.id,
    name: def.name || `${xMeta.label} → ${yMeta.label}`,
    xLabel: xMeta.label, yLabel: yMeta.label,
    xMeta, yMeta,
    r, n: pairs.length, pairs, regression, confirmed,
    domain: 'custom', granularity: gran,
    xCondition: xCond, yCondition: yCond,
    description: condDesc
      ? `${xMeta.categoryLabel} → ${yMeta.categoryLabel} · ${gran} · ${condDesc}`
      : `${xMeta.categoryLabel} → ${yMeta.categoryLabel} · ${gran}`,
  };
}

export function computeAllCustomSignals(defs, ds) {
  if (!defs?.length || !ds) return [];
  const results = [];
  for (const def of defs) {
    if (def.status === 'graveyard') continue;
    try {
      const sig = computeCustomSignal(def, ds);
      if (sig) results.push({ ...sig, defId: def.id, status: def.status || 'active', promotedTo: def.promoted_to || [] });
    } catch(e) { console.warn('[signal-registry] compute error', def.id, e); }
  }
  return results;
}

// ── Retirement detection ──────────────────────────────────────────────────────
// Propose graveyard when n ≥ 50 AND |r| < 0.15 for 3+ consecutive computations
export function shouldRetire(def, currentR, currentN) {
  if (currentN == null || currentN < 50) return false;
  if (Math.abs(currentR || 0) >= 0.15) return false;
  const history = def.history || [];
  if (history.length < 3) return false;
  return history.slice(-3).every(h => Math.abs(h.r || 0) < 0.15);
}

// ── Projection influence ──────────────────────────────────────────────────────
// For a promoted custom signal where Y is a sales/GC outcome, estimate
// the projected deviation given the current X value for a store.
// Returns { signal, projectedDelta, unit } or null
const OUTCOME_METRICS = new Set(['sales','gc','avgCheck','laborPct','fobPct','baseFoodPct']);

export function getProjectionInfluence(customSig, def, currentXValue) {
  if (!def?.promoted_to?.includes('projections')) return null;
  if (!OUTCOME_METRICS.has(def.yMetric)) return null;
  if (!customSig?.regression || !customSig.confirmed) return null;
  const { slope, mx, my } = customSig.regression;
  const predictedY = slope * currentXValue + (my - slope * mx);
  const delta = predictedY - my;
  return { signal: customSig, predictedY, delta, baselineY: my };
}
