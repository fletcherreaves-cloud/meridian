// @ts-nocheck
// ── CSAT Driver Scan (v4.535) ────────────────────────────────────────────────
// A laser-focused correlation scan answering ONE question: what moves customer
// satisfaction? It scans every candidate operational driver against each SMG
// CSAT outcome (OSAT, B2B, Accuracy, Problem rates) and reports the relationship
// with the discipline that separates a real driver from a coincidence.
//
// Why this is its own module and not just scanAllPairs:
//   1. SMG/CSAT data is MONTHLY, so n is thin. Per-store you get one point per
//      month — a handful of years is still only ~24 points. Naive pooling across
//      27 stores then mostly measures "big stores differ from small stores"
//      (between-store confound), not "when a store improves X, its CSAT moves."
//   2. So the headline number here is the WITHIN-STORE correlation: center each
//      store on its own mean first, then correlate. That removes every fixed
//      store difference and answers the per-location question directly, while
//      pooling the centered points for the statistical power thin data can't
//      give per store alone.
//   3. A huge share of raw ops correlations are just volume echoes (busy →
//      more of everything). So we also report a partial correlation controlling
//      for guest count, and only trust a driver that survives it.
//
// Grain-agnostic: pass granularity:'weekly' once a weekly CSAT stream exists and
// the exact same machinery runs on the finer, more powerful data — nothing here
// hard-codes monthly.

import { METRIC_CATEGORIES, findMetric, metricConcept, extractMetricValues,
  spearman, pValueFromR, benjaminiHochberg } from './signal-registry.js';

// The SMG CSAT outcomes we explain (the 'customer' registry group).
export const CSAT_OUTCOME_KEYS = (() => {
  const grp = METRIC_CATEGORIES.find(c => c.key === 'customer');
  return grp ? grp.metrics.map(m => m.key) : [];
})();

// ── Small stats helpers (self-contained; signal-registry's pearson isn't exported) ──
function _mean(a) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0; }

export function pearson(pairs) {
  const n = pairs.length;
  if (n < 3) return null;
  const mx = _mean(pairs.map(p => p.x)), my = _mean(pairs.map(p => p.y));
  let sxy = 0, sxx = 0, syy = 0;
  for (const p of pairs) { const dx = p.x - mx, dy = p.y - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  if (sxx <= 0 || syy <= 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

// Partial correlation of x,y controlling for z, via the first-order formula.
// Returns null when any component correlation is undefined or the denominator
// collapses (z perfectly explains x or y).
export function partialPearson(triples) {
  const xy = pearson(triples.map(t => ({ x: t.x, y: t.y })));
  const xz = pearson(triples.map(t => ({ x: t.x, y: t.z })));
  const yz = pearson(triples.map(t => ({ x: t.y, y: t.z })));
  if (xy == null || xz == null || yz == null) return null;
  const denom = Math.sqrt((1 - xz * xz) * (1 - yz * yz));
  if (!(denom > 0)) return null;
  return (xy - xz * yz) / denom;
}

// Center each store on its own mean (fixed-effects style). Points that belong to
// a store with <2 observations can't be centered meaningfully and are dropped —
// a single monthly point carries no within-store variation. Returns the centered
// points plus how many distinct stores contributed (for the effective-N / DOF).
export function withinStoreCenter(points) {
  const byLoc = {};
  for (const p of points) { (byLoc[p.loc] = byLoc[p.loc] || []).push(p); }
  const out = [];
  let locsUsed = 0;
  for (const loc in byLoc) {
    const ps = byLoc[loc];
    if (ps.length < 2) continue;
    locsUsed++;
    const mx = _mean(ps.map(p => p.x)), my = _mean(ps.map(p => p.y));
    const hasZ = ps.every(p => p.z != null && !isNaN(p.z));
    const mz = hasZ ? _mean(ps.map(p => p.z)) : null;
    for (const p of ps) out.push({ loc, x: p.x - mx, y: p.y - my, z: hasZ ? p.z - mz : null });
  }
  return { points: out, locsUsed };
}

// Tiering — the honest bar. The WITHIN-store r is the number that matters; the
// pooled r is only shown for context. Thresholds account for monthly thinness:
// effective N = centered points − stores (within-store degrees of freedom).
//   slam-dunk : |within| ≥ .5, agrees with Spearman sign, survives FDR q ≤ .01,
//               survives the volume partial (≥ .3 when computable), replicates
//               out-of-sample, and effective N ≥ 24
//   strong    : |within| ≥ .4, q ≤ .05, effective N ≥ 12, volume-partial ≥ .25
//   watch     : |within| ≥ .3 and (fdrSig OR q ≤ .1)
//   noise     : everything else
export function csatTier(r) {
  const aw = Math.abs(r.withinR ?? 0);
  const signAgree = r.spearman == null || r.withinR == null || Math.sign(r.spearman) === Math.sign(r.withinR);
  const partialOK = r.partialR == null ? true : Math.abs(r.partialR) >= 0.25; // computable + survives
  const partialStrong = r.partialR == null ? false : Math.abs(r.partialR) >= 0.3;
  const q = r.qValue == null ? 1 : r.qValue;
  if (aw >= 0.5 && signAgree && q <= 0.01 && (r.partialR == null || partialStrong)
      && r.replicated === true && (r.effN || 0) >= 24) return 'slam-dunk';
  if (aw >= 0.4 && signAgree && q <= 0.05 && (r.effN || 0) >= 12 && partialOK) return 'strong';
  if (aw >= 0.3 && (r.fdrSig || q <= 0.1)) return 'watch';
  return 'noise';
}

// Human direction, using each metric's `better` sense so the UI can say
// "higher OEPE → lower OSAT (hurts CSAT)".
function _directionText(driverMeta, csatMeta, r) {
  if (r == null) return '';
  // Always phrase as raising the driver; the outcome then moves the SAME way for
  // r>0 and the OPPOSITE way for r<0. (The old code set both to "lower" for r<0,
  // which reads as a positive relationship — the exact inverse of the truth.)
  const csatUp = r >= 0 ? 'higher' : 'lower';
  // Is a higher CSAT metric good? OSAT/B2B/Accuracy: higher better; Problem: lower better.
  const csatGood = csatMeta.better === 'higher';
  const helps = (csatUp === 'higher') === csatGood; // does the co-move help CSAT?
  return `higher ${driverMeta.label} → ${csatUp} ${csatMeta.label} (${helps ? 'helps' : 'hurts'})`;
}

// ── Plain-English, operator-facing translation of a driver result ────────────
// Turns the stats (within r, tier, replication, sample) into sentences a GM can
// read without knowing what a correlation is. Deliberately no jargon.
const _strengthWord = w => Math.abs(w) >= 0.5 ? 'strong' : Math.abs(w) >= 0.4 ? 'clear' : Math.abs(w) >= 0.3 ? 'moderate' : 'slight';

export function tierWord(tier) {
  return tier === 'slam-dunk' ? 'Dependable'
    : tier === 'strong' ? 'Likely real'
    : tier === 'watch' ? 'Worth watching'
    : 'Too weak to trust';
}

export function describeDriver(r) {
  const w = r.withinR ?? 0;
  const outcomeDown = w < 0;
  const strength = _strengthWord(w);
  const helps = / helps\)/.test(r.direction || '') || /\(helps/.test(r.direction || '');
  // What moves with what, in plain terms.
  const headline = `When ${r.driverLabel} goes up, ${r.csatLabel} tends to go ${outcomeDown ? 'DOWN' : 'UP'}.`;
  const goodBad = helps ? 'That works in your favor.' : 'That pulls the guest score the wrong way.';
  // How much to trust it.
  let trust;
  if (r.tier === 'slam-dunk') trust = `This is a ${strength}, dependable pattern — it held up when we re-checked it on data it had never seen.`;
  else if (r.tier === 'strong') trust = `This is a ${strength} pattern that is very likely real.`;
  else if (r.tier === 'watch') trust = r.replicated
    ? `A ${strength} pattern that held up on a fresh test — worth keeping an eye on.`
    : `An early ${strength} pattern — it hasn't been re-confirmed on new data yet, so treat it as a lead, not a fact.`;
  else trust = `A ${strength} pattern that's probably just noise — don't act on it yet.`;
  const coverage = `Seen across ${r.locsUsed} store${r.locsUsed === 1 ? '' : 's'}.`;
  const caveat = `This is a pattern we noticed, not proof that one causes the other.`;
  return { headline, goodBad, trust, coverage, caveat, tierWord: tierWord(r.tier) };
}

// Split points into an earlier and later half by period and check the within-store
// correlation replicates (same sign, both |r| ≥ .2). Needs enough points on both
// sides or returns null (not enough to judge).
function _replicates(points) {
  if (points.length < 12) return null;
  const sorted = [...points].sort((a, b) => a._ord - b._ord);
  const mid = Math.floor(sorted.length / 2);
  const a = withinStoreCenter(sorted.slice(0, mid)).points;
  const b = withinStoreCenter(sorted.slice(mid)).points;
  if (a.length < 4 || b.length < 4) return null;
  const ra = pearson(a), rb = pearson(b);
  if (ra == null || rb == null) return null;
  return Math.sign(ra) === Math.sign(rb) && Math.abs(ra) >= 0.2 && Math.abs(rb) >= 0.2;
}

// ── Main scan ────────────────────────────────────────────────────────────────
// opts: { granularity:'monthly'|'weekly', minN, scopeLoc, alpha, volumeKey }
// Returns { granularity, minN, csatOutcomes, driversTested, tested, results, byOutcome, tierCounts }
export function scanCsatDrivers(ds, opts = {}) {
  const gran = opts.granularity || 'monthly';
  const minN = opts.minN || 6;               // absolute floor to attempt a correlation
  const scopeLoc = opts.scopeLoc || null;    // null = pooled within-store (recommended)
  const alpha = opts.alpha || 0.05;
  const volumeKey = opts.volumeKey || 'gc';  // control variable for the partial
  const empty = { granularity: gran, minN, csatOutcomes: [], driversTested: 0, tested: 0, results: [], byOutcome: {}, tierCounts: {} };
  if (!ds) return empty;

  // Which CSAT outcomes actually have data?
  const outcomeVals = {};
  for (const key of CSAT_OUTCOME_KEYS) {
    const m = findMetric(key);
    if (!m || !m.granularity.includes(gran)) continue;
    const vals = extractMetricValues(key, ds, gran, scopeLoc);
    if (vals.length >= minN) outcomeVals[key] = vals;
  }
  const csatOutcomes = Object.keys(outcomeVals);
  if (!csatOutcomes.length) return empty;

  // Candidate drivers: every non-customer, non-calendar metric with data at this grain.
  const driverVals = {};
  for (const cat of METRIC_CATEGORIES) {
    if (cat.key === 'customer' || cat.key === 'calendar') continue;
    for (const m of cat.metrics) {
      if (!m.granularity.includes(gran)) continue;
      const vals = extractMetricValues(m.key, ds, gran, scopeLoc);
      if (vals.length >= minN) driverVals[m.key] = vals;
    }
  }

  // Volume control map (loc_period → guest count), for the partial correlation.
  const volMap = {};
  {
    const vv = extractMetricValues(volumeKey, ds, gran, scopeLoc);
    for (const v of vv) volMap[v.loc + '_' + _period(v.date, gran)] = v.value;
  }

  const all = [];
  for (const cKey of csatOutcomes) {
    const cMap = {};
    for (const v of outcomeVals[cKey]) cMap[v.loc + '_' + _period(v.date, gran)] = { loc: v.loc, val: v.value, date: v.date };
    const cMeta = findMetric(cKey);

    for (const dKey in driverVals) {
      if (metricConcept(dKey) === metricConcept(cKey)) continue; // never a CSAT-vs-itself concept
      const dMap = {};
      for (const v of driverVals[dKey]) dMap[v.loc + '_' + _period(v.date, gran)] = v.value;

      // Intersect on shared loc_period keys
      const points = [];
      for (const k in cMap) {
        const dv = dMap[k];
        if (dv == null || isNaN(dv)) continue;
        const c = cMap[k];
        points.push({ loc: c.loc, x: dv, y: c.val, z: volMap[k] != null ? volMap[k] : null, _ord: +new Date(c.date) });
      }
      if (points.length < minN) continue;

      const pooledR = pearson(points.map(p => ({ x: p.x, y: p.y })));
      const { points: cen, locsUsed } = withinStoreCenter(points);
      const withinR = cen.length >= 3 ? pearson(cen.map(p => ({ x: p.x, y: p.y }))) : null;
      const effN = Math.max(0, cen.length - locsUsed);
      // Partial control for volume, on the centered points that carry a z.
      const cenZ = cen.filter(p => p.z != null && !isNaN(p.z));
      const partialR = cenZ.length >= 4 ? partialPearson(cenZ) : null;
      const rho = pooledR != null ? spearman(points.map(p => ({ x: p.x, y: p.y }))) : null;
      const p = withinR != null ? pValueFromR(withinR, effN + 2) : null;
      const dMeta = findMetric(dKey);

      all.push({
        csatKey: cKey, csatLabel: cMeta.label, csatCat: cMeta.categoryLabel, csatBetter: cMeta.better,
        driverKey: dKey, driverLabel: dMeta.label, driverCat: dMeta.categoryLabel,
        pooledR: pooledR != null ? +pooledR.toFixed(3) : null,
        withinR: withinR != null ? +withinR.toFixed(3) : null,
        partialR: partialR != null ? +partialR.toFixed(3) : null,
        spearman: rho != null ? +rho.toFixed(3) : null,
        n: points.length, effN, locsUsed, p,
        replicated: _replicates(points),
        direction: _directionText(dMeta, cMeta, withinR),
        _within: withinR,
      });
    }
  }

  // FDR across the whole CSAT-driver test space, using the within-store p-values.
  benjaminiHochberg(all, alpha);
  for (const r of all) r.tier = csatTier(r);

  const results = all
    .filter(r => r.withinR != null)
    .sort((a, b) => Math.abs(b._within || 0) - Math.abs(a._within || 0))
    .map(r => { delete r._within; return r; });

  const byOutcome = {};
  for (const r of results) (byOutcome[r.csatKey] = byOutcome[r.csatKey] || []).push(r);
  const tierCounts = results.reduce((acc, r) => { acc[r.tier] = (acc[r.tier] || 0) + 1; return acc; }, {});

  return {
    granularity: gran, minN,
    csatOutcomes, driversTested: Object.keys(driverVals).length,
    tested: all.length, results, byOutcome, tierCounts,
  };
}

// Period key matching signal-registry's _mKey (monthly) / a Mon-anchored ISO week
// for weekly. Kept local so this module has no dependency on non-exported internals.
function _period(d, gran) {
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(+dt)) return '';
  if (gran === 'weekly') {
    const tmp = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
    const day = tmp.getUTCDay() || 7;                 // Mon=1..Sun=7
    tmp.setUTCDate(tmp.getUTCDate() + 4 - day);        // nearest Thursday (ISO)
    const yStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    const wk = Math.ceil((((tmp - yStart) / 86400000) + 1) / 7);
    return tmp.getUTCFullYear() + '-W' + String(wk).padStart(2, '0');
  }
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
}
