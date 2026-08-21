// @ts-nocheck
import { exposureRate } from './security-baselines.js';

// ── Security drill-down — dispatch #52, scoped from the store 0013113 investigation ─────────────
// memory/dispatch-52.md: five measurements, in the order they mattered in the real investigation
// (memory/finding-store-13113-packaging-variance-2026-08-21.md), not Part C's original wish list.
// Everything here reads data already in Supabase (qsr_variance_stat / audit_rows / the already-
// loaded security_findings) -- no new source, no new pull.
//
// Pure functions, testable without Supabase -- callers pass already-fetched row arrays. Every
// comparison returns the subject's own number ALONGSIDE the estate/store baseline it's judged
// against (CLAUDE.md's standing "show the number and the decision," sharpened here to "never a
// number with nothing to compare against" per dispatch #52's own closing rule). None of these
// functions labels a mechanism -- they return measurements; SubjectDetail renders them as
// measurements, not causes, matching the investigation's own discipline (a class skew is a hint,
// not a diagnosis).
//
// Domain generalization (dispatch #52: "works for both subject types... do not build it
// inventory-only"): inventory's natural groupings (item `cls`, the item itself) have no literal
// cash equivalent, since audit_rows carries no item/class dimension. Cash substitutes the nearest
// honest analogue at each metric -- documented per-function below, not silently reinterpreted.

// ── Shared stats ──────────────────────────────────────────────────────────────────────────────

export function median(values) {
  const v = (values || []).filter(x => x != null && Number.isFinite(x)).slice().sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

function mean(values) {
  const v = (values || []).filter(x => x != null && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function stdev(values) {
  const v = (values || []).filter(x => x != null && Number.isFinite(x));
  if (v.length < 2) return null;
  const m = mean(v);
  return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / v.length);
}

// Two-proportion z-test (subject's share vs the pooled rest-of-population share), the same shape
// of math the investigation used to call 82.1% vs 47.0% "~3.7 standard deviations" -- pooled
// proportion, standard error from both sample sizes, z = (p1-p2)/SE. Returns null (never NaN/
// Infinity) when either group has zero exposure -- an honest non-answer, not a fabricated 0.
export function twoProportionZ(subjectHits, subjectN, restHits, restN) {
  if (!subjectN || !restN) return null;
  const p1 = subjectHits / subjectN, p2 = restHits / restN;
  const pooled = (subjectHits + restHits) / (subjectN + restN);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / subjectN + 1 / restN));
  if (!se) return null;
  return { p1, p2, z: (p1 - p2) / se };
}

function distinctCountByKey(rows, groupField, distinctField) {
  const byGroup = new Map();
  for (const r of rows) {
    const g = r[groupField];
    if (g == null) continue;
    if (!byGroup.has(g)) byGroup.set(g, new Set());
    byGroup.get(g).add(r[distinctField]);
  }
  return byGroup; // Map<group, Set<distinct values>>
}

// ── 1. Normalized flag rate by store — the check that can dissolve its own premise ──────────────
// Flags per store as a RATE OVER SUBJECTS PRESENT AT THAT STORE, not a raw count -- a store
// carrying more subjects would otherwise look worse for no real reason. `popRows` is the domain's
// full subject population for the comparison window (qsr_variance_stat for one period, all
// stores, for inventory; audit_rows for a window, all stores, for cash) -- distinct wrin/emp_token
// per loc is the denominator. `findings` is the panel's already-loaded security_findings, filtered
// here to the caller's domainRuleIds and pass===true for the numerator. Same shape both domains --
// only the field names (subjectField, popKeyField) differ at the call site.
export function flagRateByStore({ subjectLoc, popRows, findings, domainRuleIds, subjectField, popKeyField }) {
  const byLocPop = distinctCountByKey(popRows, 'loc', popKeyField);
  const flaggedByLoc = new Map(); // loc -> Set<subjectId>
  for (const f of findings) {
    if (!domainRuleIds.has(f.ruleId) || f.pass !== true || f.lifecycleCategory) continue;
    const id = f[subjectField];
    if (!id || !f.loc) continue;
    if (!flaggedByLoc.has(f.loc)) flaggedByLoc.set(f.loc, new Set());
    flaggedByLoc.get(f.loc).add(id);
  }
  const rates = [...byLocPop.entries()].map(([loc, pop]) => {
    const total = pop.size;
    const flagged = flaggedByLoc.get(loc)?.size || 0;
    return { loc, total, flagged, rate: total ? flagged / total : null };
  }).sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1));
  const subject = rates.find(r => r.loc === subjectLoc) || null;
  const otherRates = rates.filter(r => r.loc !== subjectLoc && r.rate != null).map(r => r.rate);
  const otherMean = mean(otherRates), otherStdev = stdev(otherRates);
  const multiple = (subject?.rate != null && otherMean) ? subject.rate / otherMean : null;
  return { subject, rates, otherMean, otherStdev, multiple };
}

// ── 2. Cross-store prevalence of the subject's own discriminators ───────────────────────────────
// ⭐ Not in Part C. Inventory: for each item this subject's store flags, how many OTHER stores
// also flag the same item (INV rules, pass===true) -- mostly-1 is a real local lead, mostly-many
// is the known estate-wide broken-mapping set repeating everywhere. Cash generalization: audit_
// rows carries no repeatable "item" a person can be compared on, so the nearest honest analogue is
// the RULE itself -- for each rule this subject flags, how many other stores have AT LEAST ONE
// employee flagged on that same rule. Same question either way: "is this discriminator local to
// this subject, or does it fire everywhere" -- only the unit of repetition changes.
export function crossStorePrevalence({ subjectFlaggedKeys, findings, domainRuleIds, keyField }) {
  // subjectFlaggedKeys: the values (wrin, or ruleId) this subject is flagged on, deduped by caller.
  const out = subjectFlaggedKeys.map(key => {
    const locsFlagging = new Set();
    for (const f of findings) {
      if (!domainRuleIds.has(f.ruleId) || f.pass !== true || f.lifecycleCategory) continue;
      if (f[keyField] !== key) continue;
      if (f.loc) locsFlagging.add(f.loc);
    }
    return { key, storeCount: locsFlagging.size, isLocalOnly: locsFlagging.size <= 1 };
  });
  const localOnly = out.filter(o => o.isLocalOnly).length;
  return { items: out, localOnly, total: out.length, localOnlyShare: out.length ? localOnly / out.length : null };
}

// ── 3. Composition vs. estate — a class/rule-mix skew, a mechanism HINT never a cause ───────────
// Inventory: paper/food split of the subject's OWN flagged items, vs. the same split across every
// OTHER store's flagged items. `itemsByKey` maps wrin -> cls, built by the caller from the current
// period's qsr_variance_stat rows (already loaded for metric 1/5, no extra fetch). Cash: no `cls`
// exists, so composition is the subject's flag distribution ACROSS RULES vs. the estate's --
// which rule families make up this subject's signal, same "is this one narrow thing or broad"
// question inventory's class split answers. Reports the two shares and, when both classes have
// exposure, a two-proportion z (never labelled a cause -- see the header comment).
export function compositionVsEstate({ subjectClass, subjectFlags, estateFlags }) {
  // subjectFlags / estateFlags: arrays of class labels (cls, or ruleId), one per flagged item.
  const subjectN = subjectFlags.length, estateN = estateFlags.length;
  const subjectHits = subjectFlags.filter(c => c === subjectClass).length;
  const estateHits = estateFlags.filter(c => c === subjectClass).length;
  const subjectShare = subjectN ? subjectHits / subjectN : null;
  const estateShare = estateN ? estateHits / estateN : null;
  const z = twoProportionZ(subjectHits, subjectN, estateHits, estateN);
  return { class: subjectClass, subjectN, subjectHits, subjectShare, estateN, estateHits, estateShare, z: z?.z ?? null };
}

// ── 4. Period trend — chronic, or datable? ───────────────────────────────────────────────────────
// Median value (variance % for inventory, the subject's own flagged-rule rate for cash) per
// period, oldest to newest. Deliberately just the numbers -- classifying flat/step/improving is
// left to the reader, same as the finding write-up did ("came back flat-and-improving" was a
// description of the table, not a label the query itself asserted).
export function periodTrend(periodValues) {
  // periodValues: [{period, values: [n, n, ...]}] oldest→newest, already grouped by caller.
  return periodValues.map(p => ({ period: p.period, medianValue: median(p.values), n: p.values.length }));
}

// ── 5. Secondary-metric comparison vs. estate — "is this subject's store unusual on anything
// ELSE," and where a mechanism hypothesis actually comes from ────────────────────────────────────
// Generic: a set of named {label, subjectValue, estateMedian} rows. The caller computes each
// metric's subject value and the estate's per-store median for that same metric (inventory:
// item count / uncounted rate / waste $ / median variance, from qsr_variance_stat; cash: the
// subject's OTHER audit_rows rates, from security-baselines.js's exposureRate against
// store/estate). This function does no domain-specific math itself -- it exists so every
// secondary-metric comparison renders through the SAME table shape, baseline always beside the
// number, per dispatch #52's standing rule.
export function secondaryMetrics(rows) {
  return rows.map(r => ({
    ...r,
    ratio: (r.subjectValue != null && r.estateMedian) ? r.subjectValue / r.estateMedian : null,
  }));
}

// ── 6. Subject flag-shape + cross-rule history — dispatch #56 Part D ────────────────────────────
// "A first-time flag and a fifth consecutive flag are completely different situations and the
// panel currently presents them identically." Two pieces, both pure over data the panel already
// has loaded (security_findings, via groupFindingsBySubject's own historyByRule) -- no new fetch,
// per the dispatch's own "extend security-drilldown.js rather than writing a parallel history
// calculation" instruction.

// classifySubjectShape: names the SHAPE of one rule's own flag history for one subject --
// deliberately a different question from dispatch #46's classifySubjectTrend (security-panel.js),
// which only asks "is the LATEST verdict flagged, and was ANY prior verdict flagged" (a two-state
// chronic/new/improving/clear). This asks how many times, and in what arrangement:
//   instance = flagged exactly once.
//   pattern  = flagged 2+ times with at least one clear/undetermined window between two flags
//              (recurring, not a running streak) -- asserted even at n=2, since it is a factual
//              count, not a directional claim.
//   trend    = flagged in an UNBROKEN run of `minTrendWindows`+ consecutive windows, direction
//              from the run's first value vs its last.
//   insufficient-history = a consecutive flagged run exists but is shorter than minTrendWindows --
//              exactly the "do not label a shape from two windows" case dispatch #56 itself warns
//              against (the same discipline dispatch #52 already applied by declining a z-test on
//              1-4 flagged cash rules). The caller shows the raw history, not a shape word.
// history: one rule's own windows for one subject, oldest->newest -- groupFindingsBySubject's own
// historyByRule[ruleId] shape ({pass, value, windowStart, windowEnd, computedAt, ...}).
export function classifySubjectShape(history, { minTrendWindows = 3 } = {}) {
  const h = Array.isArray(history) ? history : [];
  const flaggedIdx = [];
  h.forEach((w, i) => { if (w.pass === true) flaggedIdx.push(i); });
  const flaggedCount = flaggedIdx.length;
  if (flaggedCount === 0) return { shape: 'never-flagged', flaggedCount: 0 };
  if (flaggedCount === 1) return { shape: 'instance', flaggedCount: 1 };
  const isConsecutiveRun = flaggedIdx[flaggedIdx.length - 1] - flaggedIdx[0] + 1 === flaggedCount;
  if (!isConsecutiveRun) return { shape: 'pattern', flaggedCount };
  if (flaggedCount < minTrendWindows) return { shape: 'insufficient-history', flaggedCount, minTrendWindows };
  const run = flaggedIdx.map(i => h[i]);
  const first = run[0].value, last = run[run.length - 1].value;
  const direction = (first == null || last == null) ? null : last > first ? 'rising' : last < first ? 'falling' : 'flat';
  return { shape: 'trend', flaggedCount, direction };
}

// buildSubjectTimeline: flattens historyByRule (every rule's own window history for one subject)
// into a single oldest->newest list across ALL rules -- "has this subject been flagged before, on
// which rules, in which windows." Pure flattening + sort, no classification -- the reader reads
// the list, same discipline as periodTrend's own undecorated medians.
export function buildSubjectTimeline(historyByRule) {
  const rows = [];
  for (const [ruleId, windows] of Object.entries(historyByRule || {})) {
    for (const w of (windows || [])) rows.push({ ruleId, ...w });
  }
  rows.sort((a, b) => (a.windowEnd || '').localeCompare(b.windowEnd || '') || (a.computedAt || '').localeCompare(b.computedAt || ''));
  const flaggedCount = rows.filter(r => r.pass === true).length;
  const firstWindowStart = rows.reduce((m, r) => (!m || (r.windowStart && r.windowStart < m)) ? r.windowStart : m, null);
  return { rows, totalWindows: rows.length, flaggedCount, firstWindowStart };
}

// corroboratingFlags: for a flagged verdict on one rule, which of that rule's corroboration_rules
// (schema-security-findings-exoneration.sql; mapped by loadSecurityRules() as of dispatch #56 Part
// A) are ALSO currently flagged for the SAME subject. Part A already mapped + surfaced
// corroboration_rules in the static rule directory; this is Part D's own "free win" half --
// "on a finding where a corroborating rule actually fired on the same subject."
// rule: the security_rules row for the verdict's own ruleId (carries `corroborationRules`).
// subjectVerdicts: the subject's own group.verdicts (one per rule, latest window).
export function corroboratingFlags(rule, subjectVerdicts) {
  const ids = Array.isArray(rule?.corroborationRules) ? rule.corroborationRules : [];
  if (!ids.length) return [];
  const flaggedIds = new Set((subjectVerdicts || [])
    .filter(v => v.pass === true && !v.lifecycleCategory)
    .map(v => v.ruleId));
  return ids.filter(id => flaggedIds.has(id));
}

// ── Assembly — wires the five primitives above into one result per domain ───────────────────────
// Still pure: callers (the panel) fetch the on-demand rows and pass them in here. Each function
// below is what a render-based test exercises through the actual UI, per dispatch #52's own
// closing rule ("verification must render -- a test asserting a query's shape passes with the
// panel unwired").

// numField/denField per cash rule, hardcoded rather than derived from security_rules.logic_
// expression -- same call already made for RULE_UNITS in security-panel.js ("a lookup table this
// small"; the panel doesn't load logic_expression at all today, and adding that fetch for four
// rows would cost more than it buys). Verified against the live seeds (schema-security-rules-
// phase1.sql, -phase1e.sql): CASH-001 manualRefAmt/drawerSales, CASH-002 posOverCnt/drawerGC,
// CASH-003 manualRefCnt/drawerGC (inactive), CASH-004 promoAmt/drawerSales, all scale 1000.
export const CASH_RULE_FIELDS = {
  'CASH-001': { numField: 'manualRefAmt', denField: 'drawerSales' },
  'CASH-002': { numField: 'posOverCnt', denField: 'drawerGC' },
  'CASH-003': { numField: 'manualRefCnt', denField: 'drawerGC' },
  'CASH-004': { numField: 'promoAmt', denField: 'drawerSales' },
};

// n consecutive 'YYYY-MM' periods ending at `period`, oldest first. Pure given its `period`
// argument (no wall-clock read) -- safe to call from a workflow script or a component alike.
export function monthsBack(period, n) {
  const [y, m] = period.split('-').map(Number);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

function groupBy(rows, keyFn) {
  const g = new Map();
  for (const r of rows) { const k = keyFn(r); if (!g.has(k)) g.set(k, []); g.get(k).push(r); }
  return g;
}

// popRows: loadQsrVarianceStat({period}) for the SUBJECT's own latest period, ALL stores (already
// carries cls/rawWaste/compWaste/expUsage/actUsage/variance -- one fetch covers metrics 1/3/5).
// histRows: loadQsrVarianceHistoryAll({periods}) for `periods` (metric 4's own look-back window).
export function assembleInventoryDrilldown({ subjectLoc, findings, domainRuleIds, popRows, histRows, periods }) {
  const flagRate = flagRateByStore({
    subjectLoc, popRows, findings, domainRuleIds, subjectField: 'wrin', popKeyField: 'wrin',
  });

  const isSubjectInvFlag = f => domainRuleIds.has(f.ruleId) && f.pass === true && !f.lifecycleCategory && f.wrin;
  const flaggedWrins = [...new Set(findings.filter(f => f.loc === subjectLoc && isSubjectInvFlag(f)).map(f => f.wrin))];

  const prevalence = crossStorePrevalence({
    subjectFlaggedKeys: flaggedWrins, findings, domainRuleIds, keyField: 'wrin',
  });

  const clsByKey = new Map(popRows.map(r => [r.loc + '::' + r.wrin, r.cls || 'unknown']));
  const subjectFlagsCls = findings.filter(f => f.loc === subjectLoc && isSubjectInvFlag(f))
    .map(f => clsByKey.get(f.loc + '::' + f.wrin)).filter(Boolean);
  const estateFlagsCls = findings.filter(f => f.loc !== subjectLoc && isSubjectInvFlag(f))
    .map(f => clsByKey.get(f.loc + '::' + f.wrin)).filter(Boolean);
  const classesPresent = [...new Set([...subjectFlagsCls, ...estateFlagsCls])];
  const composition = classesPresent
    .map(cls => compositionVsEstate({ subjectClass: cls, subjectFlags: subjectFlagsCls, estateFlags: estateFlagsCls }))
    .sort((a, b) => (b.subjectShare ?? -1) - (a.subjectShare ?? -1));

  // Median variance, per period, of the subject's CURRENTLY-flagged items at this store -- a
  // simplification vs. re-deriving "which items were flagged that period" retroactively (the
  // finding itself tracked the same item set across its four-period table).
  const trend = periodTrend(periods.map(period => ({
    period,
    values: histRows.filter(r => r.loc === subjectLoc && r.period === period && flaggedWrins.includes(r.wrin)).map(r => r.variance),
  })));

  const byLoc = groupBy(popRows, r => r.loc);
  const storeAgg = loc => {
    const rows = byLoc.get(loc) || [];
    const exposed = rows.filter(r => (r.expUsage ?? 0) > 10); // matches the finding's own exp_usage>10 methodology
    const uncounted = exposed.filter(r => r.actUsage === 0);
    return {
      itemCount: rows.length,
      uncountedRate: exposed.length ? uncounted.length / exposed.length : null,
      wasteLogged: rows.reduce((a, r) => a + (Number(r.rawWaste) || 0) + (Number(r.compWaste) || 0), 0),
      medianVariance: median(rows.map(r => r.variance)),
    };
  };
  const subjectAgg = storeAgg(subjectLoc);
  const otherAggs = [...byLoc.keys()].filter(l => l !== subjectLoc).map(storeAgg);
  const estMedian = field => median(otherAggs.map(a => a[field]));
  const secondary = secondaryMetrics([
    { label: 'Item count', subjectValue: subjectAgg.itemCount, estateMedian: estMedian('itemCount') },
    { label: 'Uncounted rate (act_usage=0, exp_usage>10)', subjectValue: subjectAgg.uncountedRate, estateMedian: estMedian('uncountedRate') },
    { label: 'Waste logged ($, raw+comp)', subjectValue: subjectAgg.wasteLogged, estateMedian: estMedian('wasteLogged') },
    { label: 'Median variance %', subjectValue: subjectAgg.medianVariance, estateMedian: estMedian('medianVariance') },
  ]);

  return { flagRate, prevalence, composition, trend, secondary };
}

// rows: loadAuditRowsWindow({start,end}) for the drill-down's own window, ALL stores (one fetch
// covers metrics 1/4/5). months: monthsBack() over the same window, for metric 4's trend.
export function assembleCashDrilldown({ subjectLoc, subjectEmpToken, findings, domainRuleIds, rows, months }) {
  const flagRate = flagRateByStore({
    subjectLoc, popRows: rows, findings, domainRuleIds, subjectField: 'empToken', popKeyField: 'empToken',
  });

  const isSubjectCashFlag = f => domainRuleIds.has(f.ruleId) && f.pass === true && !f.lifecycleCategory;
  const subjectRuleIds = [...new Set(findings
    .filter(f => f.loc === subjectLoc && f.empToken === subjectEmpToken && isSubjectCashFlag(f))
    .map(f => f.ruleId))];

  const prevalence = crossStorePrevalence({
    subjectFlaggedKeys: subjectRuleIds, findings, domainRuleIds, keyField: 'ruleId',
  });

  // Rule-mix, descriptive only -- a two-proportion z on n=1-4 flagged rules per subject would be
  // exactly the "confident-sounding wrong answer" CLAUDE.md warns against, so this reports the
  // estate's share of each rule the subject IS flagged on (excluding the subject's own flags from
  // that estate count) rather than claiming statistical significance from a handful of rules.
  const estateFlagCounts = {};
  let estateFlagTotal = 0;
  for (const f of findings) {
    if (!isSubjectCashFlag(f) || f.empToken === subjectEmpToken) continue;
    estateFlagCounts[f.ruleId] = (estateFlagCounts[f.ruleId] || 0) + 1;
    estateFlagTotal++;
  }
  const ruleMix = subjectRuleIds.map(ruleId => ({
    ruleId, estateShare: estateFlagTotal ? (estateFlagCounts[ruleId] || 0) / estateFlagTotal : null,
  }));

  const trendByRule = subjectRuleIds.map(ruleId => {
    const fields = CASH_RULE_FIELDS[ruleId];
    if (!fields) return { ruleId, months: [] };
    const subjectRows = rows.filter(r => r.loc === subjectLoc && r.empToken === subjectEmpToken);
    return {
      ruleId,
      months: months.map(month => {
        const monthRows = subjectRows.filter(r => String(r.date).slice(0, 7) === month);
        return { period: month, value: monthRows.length ? exposureRate(monthRows, fields) : null };
      }),
    };
  });

  // Secondary metrics -- the subject's OTHER cash rates (not the ones they're flagged on) vs.
  // their own store's peer average, the same "is this store/person unusual on anything else"
  // check the inventory side runs, restricted to peers at the same store (cash rules are already
  // peer-baselined, unlike inventory's store-baselined rules -- matching that convention here).
  const subjectRows = rows.filter(r => r.loc === subjectLoc && r.empToken === subjectEmpToken);
  const peerByEmp = groupBy(rows.filter(r => r.loc === subjectLoc && r.empToken !== subjectEmpToken), r => r.empToken);
  const otherRuleIds = Object.keys(CASH_RULE_FIELDS)
    .filter(id => domainRuleIds.has(id) && !subjectRuleIds.includes(id));
  const secondary = secondaryMetrics(otherRuleIds.map(ruleId => {
    const fields = CASH_RULE_FIELDS[ruleId];
    const subjectValue = subjectRows.length ? exposureRate(subjectRows, fields) : null;
    const peerRates = [...peerByEmp.values()].map(er => exposureRate(er, fields));
    return { label: ruleId, subjectValue, estateMedian: median(peerRates) };
  }));

  return { flagRate, prevalence, ruleMix, trendByRule, secondary };
}
