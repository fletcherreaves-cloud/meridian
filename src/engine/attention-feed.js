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
  crit: { word: 'Critical', color: 'var(--crit)' },
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

// Merge two loc-keyed sales-vs-LY row sets, keeping whichever shows the WORSE (more
// negative) relative gap per loc. Lets a caller feed salesBehindLY both a single-period
// view and a rolling multi-week window, so a real decline surfaces whichever window
// catches it — a trend that never clears the threshold in one specific week (the panel's
// currently-selected dateRange) still surfaces via the rolling window, and a genuine
// single-week collapse still surfaces even if the rolling window hasn't caught up yet
// (Notes 63 part 2 — attention-now.js previously only evaluated the current dateRange).
export function mergeWorstSalesLY(a = [], b = []) {
  const byLoc = new Map();
  for (const r of (a || [])) if (r && r.ly > 0) byLoc.set(r.loc, r);
  for (const r of (b || [])) {
    if (!r || !(r.ly > 0)) continue;
    const existing = byLoc.get(r.loc);
    if (!existing || (r.cur - r.ly) / r.ly < (existing.cur - existing.ly) / existing.ly) byLoc.set(r.loc, r);
  }
  return [...byLoc.values()];
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
      // Dispatch28 -- was a generic "coach before the next CFV/RGR" regardless of store; now
      // the same per-store verdict the Visit Readiness panel itself shows (visit-readiness.js's
      // buildVerdict), so the two surfaces never disagree about what to coach (the "diff the
      // two computations" lesson -- this reads s.verdict rather than re-deriving its own text).
      detail: `Readiness ${Math.round(s.readiness)}/100 (at-risk) — ${s.verdict || 'coach before the next CFV/RGR'}`,
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

// Adapts buildBrief's per-store findings into feed items so buildBrief and this engine's
// other detectors can share ONE ranked list (the Needs Attention / Attention Now merge).
// buildBrief's findings already carry severity/category/icon/dollars/title/detail/loc —
// engine/finding-rules.js's attachFindingMeta attaches them (called from buildStore right
// after buildBrief returns), so this is reshaping, not re-deriving. `t:'ok'`/`t:'fc'` map to
// severity:'info' via T_TO_SEVERITY and are dropped here — a strength note or a forecast
// projection isn't something that needs attention.
// Coaching reviews due (#208) — items arrive PRE-BUILT in this exact shape from
// engine/coaching-loop.js's dueForReview()+toAttentionItem() (a separate, freely-importable
// module), so this stays a passthrough validator rather than duplicating that item-building
// logic here — keeps this file's zero-import convention intact.
export function coachingReviewFeedItems(items = []) {
  return (items || []).filter(Boolean);
}

export function findingsToFeedItems(findings = [], nav = 'analytics') {
  return (findings || [])
    .filter(f => f && (f.severity === 'crit' || f.severity === 'warn'))
    .map(f => ({
      id: `finding-${f.loc}-${f.rule || f.title}`,
      loc: f.loc, severity: f.severity, category: f.category || 'Other', icon: f.icon || '•',
      title: f.title, detail: f.detail, dollars: f.dollars || 0, nav,
    }));
}

// Rank + cap. Severity desc, then |dollars| desc. No-silent-caps: a caller that hits the cap
// gets a console warning naming what was dropped, instead of items quietly vanishing — a
// flat top-N feels safe for a "top issues" list but would silently drop whole STORES from a
// store-grouped consumer (e.g. AttentionPanel), which is why callers that need every item
// pass an effectively unbounded max rather than relying on this to be forgiving.
export function rankAttention(items = [], { max = 15, label = 'rankAttention' } = {}) {
  const sorted = (items || []).filter(Boolean)
    .sort((a, b) => (SEV[b.severity] - SEV[a.severity]) || (Math.abs(b.dollars || 0) - Math.abs(a.dollars || 0)));
  if (sorted.length > max) {
    const dropped = sorted.slice(max);
    console.warn(`[Meridian] ${label} truncated ${dropped.length} item(s) at max=${max} — dropped: ` +
      dropped.map(d => `${d.loc || '—'}:${d.title || d.id}`).join(', '));
  }
  return sorted.slice(0, max);
}

// Group a feed into store buckets (worst finding first), for a store-grouped consumer
// (AttentionPanel — the Needs Attention merge, issue #115). Loc-less items (staleData,
// signalDecay) have nowhere to live here and are skipped — the caller pins those in a
// separate strip instead of dropping them. `normLoc` lets the caller normalize `item.loc`
// to match however `storesByLoc` was keyed (e.g. unpad, stripping a leading zero-pad).
export function groupAttentionByStore(items = [], storesByLoc = new Map(), normLoc = String) {
  const byLoc = new Map();
  for (const item of (items || [])) {
    if (item.loc == null) continue;
    const loc = normLoc(item.loc);
    const store = storesByLoc.get(loc);
    if (!store) continue;   // feed references a store outside the currently loaded set
    let bucket = byLoc.get(loc);
    if (!bucket) { bucket = { store, crits: [], warns: [] }; byLoc.set(loc, bucket); }
    if (item.severity === 'crit') bucket.crits.push(item);
    else if (item.severity === 'warn') bucket.warns.push(item);
  }
  return [...byLoc.values()]
    .map(x => ({ ...x, total: x.crits.length + x.warns.length, worst: x.crits[0] || x.warns[0] }))
    .sort((a, b) => b.crits.length - a.crits.length || b.warns.length - a.warns.length);
}

// Convenience aggregator. `briefFindings` is the flattened findings array across ALL stores
// (stores.flatMap(s => s.findings || [])) — adapted via findingsToFeedItems and merged in
// alongside the other detectors, so one ranked list contains everything either panel used to
// show separately.
export function buildAttentionFeed({ fobByStore, targetsByLoc, salesLY, dtRows, ageDays, visitStores, savedCorrelations, countExceptionRows, integrityItems, briefFindings, coachingItems, storeName = String, max = 15, onFireVolume } = {}) {
  const bySource = {
    staleData: staleData(ageDays),
    fobOutliers: fobOutliers(fobByStore || {}, storeName),
    fobOverTarget: fobOverTarget(fobByStore || {}, targetsByLoc || {}, storeName),
    salesBehindLY: salesBehindLY(salesLY || [], storeName),
    slowDT: slowDT(dtRows || [], storeName),
    visitRisk: visitRisk(visitStores || [], storeName),
    signalDecay: signalDecay(savedCorrelations || []),
    countExceptions: countExceptions(countExceptionRows || [], storeName),
    integrityFlags: integrityFlags(integrityItems || [], storeName),
    findingsToFeedItems: findingsToFeedItems(briefFindings || []),
    coachingReviews: coachingReviewFeedItems(coachingItems || []),
  };
  // Object.values on string keys preserves insertion order, so this is the exact same flat
  // list (and order) the old literal array-spread produced — byte-identical to callers.
  const items = Object.values(bySource).flat();
  // issue #143 — Insight Ledger step 0: measure real fire volume before building anything.
  // Optional, additive, off the critical path: every existing caller omits onFireVolume, so
  // it's undefined and this is a no-op — nothing about ranking/ordering/rendering changes.
  // Kept out of this engine file's own dependencies (no Supabase/blob-sync import here,
  // keeping attention-feed.js pure); the one caller that wires it in
  // (attention-now.js's useAttentionFeed) supplies engine/insight-ledger-measure.js's
  // recordFireVolume as this callback.
  if (onFireVolume) { try { onFireVolume(bySource, max); } catch { /* scaffolding, never breaks the feed */ } }
  return rankAttention(items, { max, label: 'buildAttentionFeed' });
}
