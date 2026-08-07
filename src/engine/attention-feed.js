// @ts-nocheck
// ── What Needs My Attention Now ───────────────────────────────────────────────
// Fuses cross-domain signals into ONE ranked feed so the owner can triage the day
// in a single glance instead of opening eight panels. Each detector is a small pure
// function returning attention items; rankAttention orders them (severity, then $).
//
// Item shape: { id, severity:'crit'|'warn'|'info', category, icon, title, detail,
//               dollars, loc?, nav }  — `nav` is the panel/modal id to open on click.
//
// Design: detectors take already-computed inputs (dollar-weighted district rates,
// matched vs-LY, freshness) so the engine stays pure and testable; the panel does
// the data-gathering. District comparisons are dollar-weighted (never average
// averages), matching the app-wide standing rule.

export const SEV = { crit: 3, warn: 2, info: 1 };
export const SEV_META = {
  crit: { word: 'Critical', color: '#f87171' },
  warn: { word: 'Watch', color: '#f5bc00' },
  info: { word: 'FYI', color: '#38bdf8' },
};

const money = (n) => `$${Math.round(Math.abs(n || 0)).toLocaleString()}`;

// FOB outliers — stores whose controllable FOB% runs well above the district
// (dollar-weighted) rate. `dollars` = excess FOB $ vs the district rate (what's at
// stake). Our FOB% is the 6 controllables ÷ sales, so the comparison is relative to
// the district, not an absolute band.
export function fobOutliers(fobByStore = {}, storeName = String, { mult = 1.3, minExcess = 500 } = {}) {
  const entries = Object.entries(fobByStore).filter(([, v]) => v && v.sales > 0 && v.fobPct != null);
  if (entries.length < 3) return [];
  const totFob = entries.reduce((a, [, v]) => a + (v.fob$ || 0), 0);
  const totSales = entries.reduce((a, [, v]) => a + v.sales, 0);
  const distRate = totSales ? totFob / totSales : 0;
  if (distRate <= 0) return [];
  const out = [];
  for (const [loc, v] of entries) {
    if (v.fobPct > distRate * mult) {
      const excess = (v.fobPct - distRate) * v.sales;
      if (excess >= minExcess) out.push({
        id: 'fob-' + loc, severity: v.fobPct > distRate * 1.6 ? 'crit' : 'warn',
        category: 'Food Cost', icon: '🍟',
        title: `${storeName(loc)} — FOB running hot`,
        detail: `${(v.fobPct * 100).toFixed(2)}% vs district ${(distRate * 100).toFixed(2)}% · ~${money(excess)} excess`,
        dollars: excess, loc, nav: 'fob',
      });
    }
  }
  return out;
}

// Stores behind last year on sales (matched period). `rows` = [{loc, cur, ly}].
export function salesBehindLY(rows = [], storeName = String, { minGap = 1000 } = {}) {
  const out = [];
  for (const r of (rows || [])) {
    if (r && r.ly > 0 && r.cur != null) {
      const gap = r.cur - r.ly;
      if (gap < -minGap) out.push({
        id: 'ly-' + r.loc, severity: gap < -r.ly * 0.05 ? 'warn' : 'info',
        category: 'Sales', icon: '📉',
        title: `${storeName(r.loc)} — behind last year`,
        detail: `${money(gap)} vs LY (${((gap / r.ly) * 100).toFixed(2)}%)`,
        dollars: gap, loc: r.loc, nav: 'analytics',
      });
    }
  }
  return out;
}

// Data staleness — auto-sync health.
export function staleData(ageDays) {
  if (ageDays == null) return [];
  if (ageDays > 14) return [{ id: 'stale', severity: 'crit', category: 'Data', icon: '🛰',
    title: `Sales data is ${ageDays} days old`, detail: 'QSRSoft auto-sync may be down — check Signals → Sync.', dollars: 0, nav: 'signals' }];
  if (ageDays > 7) return [{ id: 'stale', severity: 'warn', category: 'Data', icon: '🛰',
    title: `Sales data is ${ageDays} days old`, detail: 'Verify the auto-sync is running.', dollars: 0, nav: 'signals' }];
  return [];
}

// Slow drive-thru — stores over their DT serve-time target. `rows` = [{loc, dt, target}].
export function slowDT(rows = [], storeName = String, { minOver = 15 } = {}) {
  const out = [];
  for (const r of (rows || [])) {
    if (r && r.dt != null && r.target != null && r.dt > r.target + minOver) {
      out.push({
        id: 'dt-' + r.loc, severity: r.dt > r.target + 45 ? 'warn' : 'info',
        category: 'Speed', icon: '🚗',
        title: `${storeName(r.loc)} — drive-thru slow`,
        detail: `${Math.round(r.dt)}s OEPE vs ${Math.round(r.target)}s target (+${Math.round(r.dt - r.target)}s)`,
        dollars: 0, loc: r.loc, nav: 'signals',
      });
    }
  }
  return out;
}

// Visit-readiness risk — stores at risk of failing a graded visit, or carrying an
// elevated food-safety flag. `stores` = computeVisitReadiness() output rows.
export function visitRisk(stores = [], storeName = String) {
  const out = [];
  // Accept either the array of store rows or computeVisitReadiness()'s full result object.
  // Passing the object crashed the Attention Now panel with "(e||[]) is not iterable";
  // a detector should degrade, never take a panel down.
  const list = Array.isArray(stores) ? stores : (stores && Array.isArray(stores.stores) ? stores.stores : []);
  for (const s of list) {
    if (!s || !s.loc) continue;
    if (s.fsFlag === 'elevated') out.push({
      id: 'fs-' + s.loc, severity: 'crit', category: 'Food Safety', icon: '🧊',
      title: `${storeName(s.loc)} — food-safety risk elevated`,
      detail: `Waste / holding proxies elevated${s.fsScore != null ? ` (score ${Math.round(s.fsScore)})` : ''}`,
      dollars: 0, loc: s.loc, nav: 'analytics',
    });
    if (s.band === 'at-risk') out.push({
      id: 'visit-' + s.loc, severity: 'warn', category: 'Visit Readiness', icon: '🎓',
      title: `${storeName(s.loc)} — visit-readiness at risk`,
      detail: `Readiness ${Math.round(s.readiness)}/100 (at-risk) — coach before the next CFV/RGR`,
      dollars: 0, loc: s.loc, nav: 'analytics',
    });
  }
  return out;
}

// Signal decay — saved correlations (watching/confirmed) whose stored history shows
// the relationship weakening: latest |within_r| well below its historical peak.
export function signalDecay(saved = [], { dropFrac = 0.35 } = {}) {
  const out = [];
  for (const c of (saved || [])) {
    if (!c || (c.status !== 'watching' && c.status !== 'confirmed')) continue;
    const hist = (c.history || []).filter(h => h && h.withinR != null);
    if (hist.length < 2) continue;
    const peak = Math.max(...hist.map(h => Math.abs(h.withinR)));
    const latest = Math.abs(hist[hist.length - 1].withinR);
    if (peak > 0 && latest < peak * (1 - dropFrac)) out.push({
      id: 'decay-' + (c.outcomeKey || '') + '-' + (c.driverKey || ''), severity: 'info',
      category: 'Signal Decay', icon: '🔗',
      title: `Fading link: ${c.driverLabel} → ${c.outcomeLabel}`,
      detail: `Strength ${latest.toFixed(2)} now vs ${peak.toFixed(2)} peak — re-check this saved signal`,
      dollars: 0, nav: 'signals',
    });
  }
  return out;
}

// FOB over the store's OWN target (distinct from fobOutliers, which compares to the district). `dollars`
// = FOB $ above target. `targetsByLoc` = DEFAULT_TARGETS keyed by loc (padded or unpadded).
export function fobOverTarget(fobByStore = {}, targetsByLoc = {}, storeName = String, { minExcess = 500 } = {}) {
  const out = [];
  for (const [loc, v] of Object.entries(fobByStore)) {
    if (!v || !(v.sales > 0) || v.fobPct == null) continue;
    const tg = targetsByLoc[loc] || targetsByLoc[String(loc).replace(/^0+/, '')] || {};
    const tgt = tg.tFOBTarget != null ? Number(tg.tFOBTarget) : null;
    if (tgt == null) continue;
    const overPp = (v.fobPct - tgt) * 100;
    const excess = (v.fobPct - tgt) * v.sales;
    if (overPp > 0.05 && excess >= minExcess) out.push({
      id: 'fobtgt-' + loc, severity: overPp > 0.5 ? 'warn' : 'info',
      category: 'Food Cost', icon: '🎯',
      title: `${storeName(loc)} — FOB over target`,
      detail: `${(v.fobPct * 100).toFixed(2)}% vs ${(tgt * 100).toFixed(2)}% target (+${overPp.toFixed(2)}pp) · ~${money(excess)} over`,
      dollars: excess, loc, nav: 'fob',
    });
  }
  return out;
}

// Integrity — a granted early-count exception (awareness that a store's EOM count was off standard
// process). `rows` = [{ loc, acceptedDate, approvedBy }].
export function countExceptions(rows = [], storeName = String) {
  return (rows || []).filter(Boolean).map(e => ({
    id: 'exc-' + e.loc, severity: 'info', category: 'Integrity', icon: '📅',
    title: `${storeName(e.loc)} — early-count exception granted`,
    detail: `EOM count accepted from an early count${e.acceptedDate ? ` (${e.acceptedDate})` : ''}${e.approvedBy ? ` · ${e.approvedBy}` : ''} — off standard process, logged.`,
    dollars: 0, loc: e.loc, nav: 'analytics',
  }));
}

// Integrity — pass-through for pre-computed flags (e.g. implausible recount-swing batches from the
// forensic scan / diagnosis). Each flag: { id?, loc, title, detail, dollars?, severity?, nav? }.
export function integrityFlags(flags = [], storeName = String) {
  return (flags || []).filter(Boolean).map(f => ({
    id: f.id || ('intg-' + f.loc), severity: f.severity || 'warn', category: 'Integrity', icon: '🔍',
    title: f.title || `${storeName(f.loc)} — integrity flag`,
    detail: f.detail || '', dollars: f.dollars || 0, loc: f.loc, nav: f.nav || 'analytics',
  }));
}

// Rank + cap. Severity desc, then |dollars| desc.
export function rankAttention(items = [], { max = 15 } = {}) {
  return (items || []).filter(Boolean)
    .sort((a, b) => (SEV[b.severity] - SEV[a.severity]) || (Math.abs(b.dollars || 0) - Math.abs(a.dollars || 0)))
    .slice(0, max);
}

// Convenience aggregator.
export function buildAttentionFeed({ fobByStore, targetsByLoc, salesLY, dtRows, ageDays, visitStores, savedCorrelations, countExceptionRows, integrityItems, storeName = String, max = 15 } = {}) {
  const items = [
    ...staleData(ageDays),
    ...fobOutliers(fobByStore || {}, storeName),
    ...fobOverTarget(fobByStore || {}, targetsByLoc || {}, storeName),
    ...salesBehindLY(salesLY || [], storeName),
    ...slowDT(dtRows || [], storeName),
    ...visitRisk(visitStores || [], storeName),
    ...signalDecay(savedCorrelations || []),
    ...countExceptions(countExceptionRows || [], storeName),
    ...integrityFlags(integrityItems || [], storeName),
  ];
  return rankAttention(items, { max });
}
