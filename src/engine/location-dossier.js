// @ts-nocheck
// ── Location Dossier (task #79, Phase 1 + Phase 2) ───────────────────────────────────────────
// "A report for each location... on any and all data we know and trends and results in (current,
// 28 day, lm, l3m, ytd)... factual by ingest or analyzed/discovered... a master collection of the
// data we have." Owner-answered design questions (memory/plan-location-dossier-report-2026-11-04.md
// §5): (1) top 3 actionable findings headline, with the rest reachable via expand — not an
// exhaustive dump, but not hidden from a manager who wants to dig further either; (2) build
// on-demand first, measure before adding caching; (2a) both tables/charts AND a SAGE plain-
// language narrative, not one or the other.
//
// Phase 1 scope: one store at a time (the "primarily location focused" half of the owner's ask —
// the patch/operator/state rollup views are Phase 4, not built here). Factual tier only (§2A) —
// reuses metric-source.js's auto-first registry, the same one every other panel in this app
// already sources from, so this report's numbers can never disagree with any other panel's. The
// "analyzed/discovered" tier here is limited to the store's own already-computed `findings` array
// (same structured output District Priority Brief/the store dashboard already use) — Scanner-
// driven cross-metric correlation curation is a real Phase 2, not duplicated here.
import { metricAvg, metricSumRatio, metricSeries, METRIC_SOURCES } from './metric-source.js';
import { dKey, mwStart, lastClosedBusinessDay } from '../utils/date.js';
import { STORE_KB, unpadLoc } from '../constants.js';
// Phase 2's correlation curation reuses Signals' own auto-scanner as-is (scanAllPairs) rather
// than re-implementing any correlation math here — see dossierCorrelations() below.
import { scanAllPairs } from './signal-registry.js';
// Phase 3 reuses — no new data plumbing, no re-derivation of logic that already exists:
import { buildEquipmentStoreSummary, latestEntriesByInstance, PLACEMENTS } from './equipment-survey.js';
import { isActiveTenureRow, classifyRosterAssignment } from './tenure-roles.js';
import { managementRateChanges, lifelenzRosterRateChanges } from './employee-pay-history.js';
import { computeVisitReadiness } from './visit-readiness.js';
import { visitRisk, csatOpportunityAlerts } from './attention-feed.js';
import { rankCommentOpportunities } from './csat-opportunities.js';

// Rate metrics get metricAvg (mean of daily values — the standard aggregate for a rate).
// Ratio metrics with a declared numerator/denominator (fobPct, laborPct, cashOSPct) get
// metricSumRatio instead, the TRUE period rollup (Σnum/Σden), matching metric-source.js's own
// documented reasoning for why a rate metric must never be averaged as an average of averages.
//
// primeCostPct (relabeled "Labor + FOB %" for display — see finding-prime-cost-rename below) is
// `agg:'avg'`, NOT `'ratio'`, on purpose: metric-source.js's own primeCostPct entry derives from
// two ALREADY-RESOLVED ratios (laborPct + fobPct), not a numerator/denominator pair of its own —
// its own comment there says plainly "metricSumRatio has nothing separate to sum for it; mean-
// of-daily (metricAvg) is the correct rollup here." Routing it through metricSumRatio instead (as
// this file did before 2026-11-13) always returns null, since metricSumRatio bails out the moment
// `derive.kind !== 'ratio'` — confirmed live: every window read "–" for every store, not a data
// gap. Fixed as part of the same dispatch that also fixed the real data gap below.
// `lowerIsBetter` follows this app's existing convention for the same judgment (opportunity.js's
// `bestInClass({higherIsBetter})`, performance-reviews.js's `statusPill(...,lowerIsBetter)`) —
// reused here, not a new scheme, so metricTrend()'s improving/worsening call agrees with how
// every other panel in this app already judges these same 9 metrics. cashOSPct follows the same
// "lower magnitude of variance is better" convention opportunity.js already applies to it.
export const DOSSIER_METRICS = [
  { key: 'sales', label: 'Net Sales', unit: '$', agg: 'avg', lowerIsBetter: false },
  { key: 'gc', label: 'Guest Count', unit: 'n', agg: 'avg', lowerIsBetter: false },
  { key: 'laborPct', label: 'Labor %', unit: 'pct', agg: 'ratio', lowerIsBetter: true },
  { key: 'tpph', label: 'TPPH', unit: 'n2', agg: 'avg', lowerIsBetter: false },
  { key: 'oepe', label: 'OEPE', unit: 'sec', agg: 'avg', lowerIsBetter: true },
  { key: 'kvst', label: 'KVS Time', unit: 'sec', agg: 'avg', lowerIsBetter: true },
  { key: 'cashOSPct', label: 'Cash O/S %', unit: 'pct3', agg: 'ratio', lowerIsBetter: true },
  { key: 'fobPct', label: 'FOB %', unit: 'pct', agg: 'ratio', lowerIsBetter: true },
  { key: 'primeCostPct', label: 'Labor + FOB %', unit: 'pct', agg: 'avg', lowerIsBetter: true },
];

// Pure: today -> the 5 fixed windows the owner named (current/28d/lm/l3m/ytd), each {id,label,s,e}
// (same {s,e} YYYY-MM-DD shape metric-source.js's range param already accepts). "Current" is
// week-to-date against this app's own configured week-start day (mwStart() — McDonald's period
// convention, Wednesday by default), through the last CLOSED business day (never a naive
// "today", which would silently include a still-filling, structurally-incomplete day — the same
// completeness trap CLAUDE.md's 4am-business-day section already documents).
export function dossierWindows(today = new Date()) {
  const e = lastClosedBusinessDay(today);
  const eKey = dKey(e);

  const wkStart = mwStart();
  const current = { id: 'current', label: 'Current (WTD)', s: dKey(wkStart), e: eKey };

  const d28 = new Date(e); d28.setDate(d28.getDate() - 27);
  const win28 = { id: '28d', label: '28-Day', s: dKey(d28), e: eKey };

  // Last month = the most recently completed full calendar month.
  const lmEnd = new Date(e.getFullYear(), e.getMonth(), 0);
  const lmStart = new Date(lmEnd.getFullYear(), lmEnd.getMonth(), 1);
  const lm = { id: 'lm', label: 'Last Month', s: dKey(lmStart), e: dKey(lmEnd) };

  // L3M = the 3 most recently completed full calendar months (ending the same month as LM).
  const l3mStart = new Date(lmEnd.getFullYear(), lmEnd.getMonth() - 2, 1);
  const l3m = { id: 'l3m', label: 'L3M', s: dKey(l3mStart), e: dKey(lmEnd) };

  const ytdStart = new Date(e.getFullYear(), 0, 1);
  const ytd = { id: 'ytd', label: 'YTD', s: dKey(ytdStart), e: eKey };

  return [current, win28, lm, l3m, ytd];
}

// Pure: one metric spec + one window -> its computed value for this store, or null if nothing
// resolves (metric-source.js's own "null is a real signal, never guessed" contract preserved —
// a dossier cell reads "—", never a silently wrong number).
export function dossierMetricValue(ds, loc, window, metricSpec) {
  if (metricSpec.agg === 'ratio') {
    const r = metricSumRatio(ds, loc, window, metricSpec.key);
    return r ? r.value : null;
  }
  return metricAvg(ds, [loc], window, metricSpec.key);
}

// Pure: the full factual-tier grid for one store — one row per DOSSIER_METRICS entry, one column
// per dossierWindows() entry. Shape: [{key,label,unit,values:{[windowId]:number|null}}].
export function buildFactualGrid(ds, loc, windows = dossierWindows()) {
  return DOSSIER_METRICS.map(spec => ({
    key: spec.key, label: spec.label, unit: spec.unit,
    values: Object.fromEntries(windows.map(w => [w.id, dossierMetricValue(ds, loc, w, spec)])),
  }));
}

// Pure: a store's already-computed `findings` array (the same shape District Priority Brief/the
// store dashboard already consume — {t:'crit'|'watch'|'ok', m:string}) -> {headline, rest}. The
// owner's own answer to "how many show, and how are they picked": top 3 by severity (crit before
// watch before ok, stable within each tier), with everything past that reachable via "+N more"
// rather than dropped — "some managers are more proactive... and should be able to work on as
// much as possible."
export function topFindings(findings, max = 3) {
  const list = findings || [];
  const rank = { crit: 0, watch: 1, ok: 2 };
  const sorted = [...list].sort((a, b) => (rank[a.t] ?? 3) - (rank[b.t] ?? 3));
  return { headline: sorted.slice(0, max), rest: sorted.slice(max) };
}

// Pure: loc -> the free-text store context card (constants.js's STORE_KB — already-existing
// "general context about this location" infrastructure, surfaced directly rather than
// duplicated, per this plan's own §2C note).
export function dossierStoreContext(loc) {
  return STORE_KB[String(loc)] || null;
}

// Phase 1.5 (owner request, 2026-11-13 — "the initial dream was way more broad in scope... give
// an overwhelming display... Charts, spark lines, whatever it takes to tell the story in a single
// view"). A continuous daily series for one metric, ending on the last closed business day — the
// data behind every sparkline/trend chart in the view. Reuses metricSeries (auto-first per day,
// the SAME resolver buildFactualGrid's cells already go through), so a sparkline's shape can never
// disagree with the number next to it. Returns [{date, value}], sorted ascending, gaps (no day in
// range resolved) simply absent rather than interpolated or zero-filled.
export function dossierSparklineSeries(ds, loc, metricSpec, days = 90) {
  const e = lastClosedBusinessDay(new Date());
  const s = new Date(e); s.setDate(s.getDate() - (days - 1));
  const range = { s: dKey(s), e: dKey(e) };
  const series = metricSeries(ds, loc, range, metricSpec.key);
  return Object.keys(series).filter(dk => series[dk] != null).sort()
    .map(dk => ({ date: dk, value: series[dk] }));
}

// ── Phase 2: trend reads ──────────────────────────────────────────────────────────────────────
// Owner's own example in the plan doc: "is this store's labor % trending up or down over L3M."
// Split the L3M window into two contiguous halves and compare the SAME auto-first-resolved value
// (dossierMetricValue — the exact function the factual grid's own cells use) for each half, so a
// trend read can never disagree with the grid's own L3M number. A plain first-half-vs-second-half
// split is the simplest trend read that still can't be gamed by a single noisy day at either end
// (unlike comparing two single days), and keeps this reading on the SAME auto-first sourcing path
// as every other number in this report — no new data plumbing, no slope-fitting machinery pulled
// in just for a two-point comparison.
function _splitWindowInHalf(window) {
  const s = new Date(window.s + 'T00:00:00'), e = new Date(window.e + 'T00:00:00');
  const totalDays = Math.round((e - s) / 86400000) + 1;
  if (totalDays < 14) return null; // too short a window for a first-half/second-half read to mean anything
  const midDays = Math.floor(totalDays / 2);
  const mid1 = new Date(s); mid1.setDate(mid1.getDate() + midDays - 1);
  const mid2 = new Date(s); mid2.setDate(mid2.getDate() + midDays);
  return {
    first: { s: dKey(s), e: dKey(mid1) },
    second: { s: dKey(mid2), e: dKey(e) },
  };
}

// A relative-change floor before calling a direction at all, rather than per-metric absolute
// thresholds (coaching.js's trendOf() uses those, but its thresholds are hand-tuned per metric —
// not reusable across 9 differently-scaled metrics here). 3% is a modest, metric-agnostic bar:
// small enough to catch a real drift, large enough that ordinary day-to-day noise mostly nets
// out between two multi-week halves rather than reading as a false "trend."
const DOSSIER_TREND_THRESHOLD = 0.03;

// Pure: one metric, one store, the dossier's own L3M window -> {dir:'up'|'down'|'flat', better,
// v1, v2, delta} or null (not enough data / window too short to split). `better` is null when
// dir is 'flat' (no direction to judge); otherwise true/false per the metric's own
// `lowerIsBetter` flag (the same good/bad convention opportunity.js and performance-reviews.js
// already use for these metrics).
export function metricTrend(ds, loc, l3mWindow, metricSpec) {
  const halves = _splitWindowInHalf(l3mWindow);
  if (!halves) return null;
  const v1 = dossierMetricValue(ds, loc, halves.first, metricSpec);
  const v2 = dossierMetricValue(ds, loc, halves.second, metricSpec);
  if (v1 == null || v2 == null) return null;
  const delta = v2 - v1;
  const relDelta = v1 !== 0 ? delta / Math.abs(v1) : (v2 !== 0 ? Math.sign(v2) : 0);
  const dir = relDelta > DOSSIER_TREND_THRESHOLD ? 'up' : relDelta < -DOSSIER_TREND_THRESHOLD ? 'down' : 'flat';
  const better = dir === 'flat' ? null : (metricSpec.lowerIsBetter ? delta < 0 : delta > 0);
  return { key: metricSpec.key, dir, better, v1, v2, delta };
}

// Pure: every DOSSIER_METRICS row's trend read for one store, keyed by metric key. Looks up the
// L3M window from whatever windows[] was passed (dossierWindows()'s own shape) rather than
// recomputing it, so the trend read is always over the SAME L3M window the grid's L3M column used.
export function dossierTrends(ds, loc, windows, metrics = DOSSIER_METRICS) {
  const l3m = windows.find(w => w.id === 'l3m');
  const out = {};
  if (!l3m) return out;
  for (const spec of metrics) out[spec.key] = metricTrend(ds, loc, l3m, spec);
  return out;
}

// ── Phase 2: curated cross-metric correlations ───────────────────────────────────────────────
// The dossier's job here is curation, not discovery (plan doc §2B): Signals' Scanner already
// does the actual cross-metric auto-correlation for a store (scanAllPairs — Pearson + Spearman,
// the SAME |r|>=0.35 effect-size floor and Benjamini-Hochberg FDR guardrail every other Scanner
// surface already applies). Reused here AS-IS via its own `scopeLoc` option — no new correlation
// math, no new materiality threshold invented for the dossier.
export function dossierCorrelations(ds, loc, opts = {}) {
  return scanAllPairs(ds, { ...opts, scopeLoc: loc });
}

// Pure: a scanAllPairs() result -> {headline, rest}, same "top-N + N more reachable" shape
// topFindings() already established for findings. Ordering: an FDR-significant pair always
// outranks a merely-large-|r| one (scanAllPairs's own sort is |r| desc only, with no FDR
// preference) — "most material" for an already-materiality-floored list means "survived the
// multiple-comparisons correction," not just "biggest number." Defaults to 5, not findings'
// 3, because every candidate here already cleared scanAllPairs's own effect-size+FDR floor
// before reaching this list — a slightly more generous headline is reasonable once the list is
// already pre-filtered to genuine signals rather than an unfiltered dump.
export function topCorrelations(scanResult, max = 5) {
  const results = scanResult?.results || [];
  const sorted = [...results].sort((a, b) =>
    (b.fdrSig ? 1 : 0) - (a.fdrSig ? 1 : 0) || Math.abs(b.r) - Math.abs(a.r));
  return { headline: sorted.slice(0, max), rest: sorted.slice(max) };
}

// ── Phase 3: Equipment / Layout reference (read-only summary, not the editor) ───────────────────
// equipment-survey.js already owns the one definition of "current state" for a store
// (latestEntriesByInstance) and the cross-store rollup math (buildEquipmentStoreSummary) — reused
// here as-is. `entries` is this ONE store's own equipment_survey_entries rows, loaded by the view
// via the SAME per-store loader (loadEquipmentEntriesDirect(loc)) the real Layout Planner editor
// already uses — no new data plumbing, no re-derivation of "how many items does this store have."
export function dossierEquipmentSummary(entries) {
  const rows = buildEquipmentStoreSummary(entries || []);
  return rows[0] || null; // one store's own entries -> at most one row
}

// Zone breakdown for the Layout reference — a count per placement zone, not the full visual
// floor-plan (the plan doc's own "do not duplicate the editor" instruction). Placement-zone
// labels come from equipment-survey.js's own PLACEMENTS catalog, the same labels the real Layout
// Planner editor renders, so a zone name here can never drift from what the editor calls it.
export function dossierLayoutZoneCounts(entries) {
  const current = latestEntriesByInstance(entries || []);
  const counts = {};
  for (const e of current) {
    if (!e.placement_zone) continue;
    counts[e.placement_zone] = (counts[e.placement_zone] || 0) + 1;
  }
  return PLACEMENTS.map(p => ({ zone: p.value, label: p.label, count: counts[p.value] || 0 })).filter(z => z.count > 0);
}

// ── Phase 3: Personnel summary (owner-resolved PII posture, 2026-11-11 — CLAUDE.md's PII
// section + memory/finding-dossier-coaching-library-2026-11-11.md §7: names follow this app's
// EXISTING role/scope gates, never a stricter rule invented just for a report). qsr_employee_
// tenure's own select list (lib/supabase.js's loadEmployeeTenure) carries `geid`, never a name
// column — unlike Security findings' crew_token/mgr_token, geid has no name-resolution path
// anywhere in this app. So this card is headcount-by-role only, never a name roster — a data-
// availability fact, not a PII decision. Active rows only (isActiveTenureRow's own "Active" +
// no termination date definition). `hourly_pay_rate` is read here ONLY because
// classifyRosterAssignment's own existing AM-vs-DM disambiguation needs it — never surfaced as a
// value; real wage FIGURES stay behind dossierPayRateChanges() below, gated the same way pay-
// rate-history.js's own nav entry already is (payroll.view) — a deliberately separate function,
// so a caller can never show wage data by forgetting a flag check inside one bigger function.
export function dossierPersonnelSummary(tenureRows, loc) {
  const key = unpadLoc(loc);
  const mine = (tenureRows || []).filter(r => r && unpadLoc(r.loc) === key && isActiveTenureRow(r));
  if (!mine.length) return null;
  const counts = { gm: 0, am: 0, dm: 0, sm: 0, crew: 0 };
  for (const r of mine) {
    const c = classifyRosterAssignment(r);
    const bucket = c?.reviewRole === 'GM' ? 'gm' : c?.reviewRole === 'AM' ? 'am' : c?.reviewRole === 'DM' ? 'dm' : c?.reviewRole === 'SM' ? 'sm' : 'crew';
    counts[bucket]++;
  }
  return { total: mine.length, ...counts };
}

// Skills Matrix coverage for one store — same "proficient means rating >= 3" convention
// skills-matrix.js's own coverage column already uses (reused, not re-thresholded).
// employee_skills DOES carry a plain name field (e.employee), but this summary stays at
// counts/coverage — the dossier's job here is "is this store covered," not a roster view (the
// real Skills Matrix panel, same analytics.store gate, is one click away for names).
export function dossierSkillsSummary(skillsRows, loc) {
  const key = unpadLoc(loc);
  const mine = (skillsRows || []).filter(e => e && unpadLoc(e.loc) === key);
  if (!mine.length) return null;
  const jobs = new Set();
  for (const e of mine) for (const j of Object.keys(e.skills || {})) jobs.add(j);
  const coveredJobs = [...jobs].filter(j => mine.some(e => ((e.skills || {})[j] || 0) >= 3));
  return { crewCount: mine.length, jobCount: jobs.size, coveredJobCount: coveredJobs.length };
}

// Pay rate changes — the one genuinely wage-sensitive slice of Personnel. The view gates this
// behind payroll.view (the exact permission pay-rate-history.js's own nav entry already uses,
// per the directive's "gated the same way the existing panels already gate it"). Reuses pay-
// rate-history.js's own two reshapers verbatim — employee_pay_rate_changes IS the change log,
// nothing here to re-derive.
export function dossierPayRateChanges(payRateRows, loc, window) {
  const key = unpadLoc(loc);
  const all = [...managementRateChanges(payRateRows), ...lifelenzRosterRateChanges(payRateRows)]
    .filter(r => r && unpadLoc(r.loc) === key);
  if (!window) return all;
  return all.filter(r => r.effectiveDate >= window.s && r.effectiveDate <= window.e);
}

// ── Phase 3: broadened Important Findings (Visit Readiness/EcoSure + Guest Voice) ───────────────
// topFindings() above only ever drew from a store's finding-rules.js output (Controls/Labor/
// Speed/Sales) — confirmed via grep that finding-rules.js has zero references to visit
// readiness, graded visits, EcoSure, or customer complaints. attention-now.js already solved
// exactly this for the real Attention Now panel via visitRisk()/csatOpportunityAlerts()
// (attention-feed.js) — reused here AS-IS, scoped to one store via computeVisitReadiness's own
// opts.locs filter, and normalized onto topFindings()'s {t:'crit'|'watch'|'ok', m:string} shape
// so both sources merge into ONE strip rather than needing a second UI section. The storeName
// resolver passed in is blanked (not sNameC) because every title these two functions generate is
// prefixed "<store> — ...", and this report is already scoped to one store — repeating its own
// name on every chip would be noise the factual grid/trend charts don't carry either.
// Security-panel findings (storeHealthList, security-health.js) are deliberately NOT included
// here — that function needs rulesById/driftContributions/persistenceContributions pre-built
// elsewhere in security-panel.js's own large pipeline, disproportionate new plumbing for this
// phase. Flagged as a follow-on in memory/plan-location-dossier-report-2026-11-04.md, not
// silently dropped.
const _blankStoreName = () => '';
function _fromAlert(a) {
  const title = (a.title || '').replace(/^\s*—\s*/, '');
  return { t: a.severity === 'crit' ? 'crit' : 'watch', m: title + (a.detail ? ' — ' + a.detail : '') };
}

// This store's own computeVisitReadiness() object — the same per-store fields the Visit
// Readiness panel itself shows (band, fsFlag/fsScore/fsSource/fsAsOf/fsEcoSure, lastVisit) — so
// a "Last Graded Visit" display card and dossierExtraFindings() below can never disagree about
// what this store's own readiness/food-safety state is.
export function dossierVisitReadiness(ds, loc) {
  const stores = computeVisitReadiness({ ...ds, gradedVisits: ds?.gradedVisits || [] }, { locs: [loc] })?.stores || [];
  return stores.find(s => unpadLoc(s.loc) === unpadLoc(loc)) || null;
}

export function dossierExtraFindings(ds, loc) {
  const out = [];
  const mine = dossierVisitReadiness(ds, loc);
  if (mine) out.push(...visitRisk([mine], _blankStoreName).map(_fromAlert));
  const smgMine = (ds?.smgRows || []).filter(r => r && unpadLoc(r.loc) === unpadLoc(loc));
  const csat = rankCommentOpportunities(smgMine, { storeName: _blankStoreName });
  out.push(...csatOpportunityAlerts(csat, _blankStoreName).map(_fromAlert));
  return out;
}
