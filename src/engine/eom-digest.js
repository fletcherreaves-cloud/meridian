// @ts-nocheck
// src/engine/eom-digest.js — dispatch #215 Task 2: EOM roll-up digest engine.
//
// Rolls per-store EOM count-completion + FOB(+targets) data up the org chart to
// Patch / Org / District, so a Supervisor/DO/Owner gets the SAME "number + decision"
// read dispatch #213's single-store notification gives, one level up.
//
// Pure — no Supabase, no browser globals, no import of constants.js's live-assignment
// singletons. Both consumers (scripts/eom-digest-send.mjs and the EOM Dashboard panel)
// compute each store's `org`/`patch` themselves (Node: via setLiveAssignments() +
// supervisorGroups()/getStoreOrg() after loading the live org_config row; browser:
// already has patchOfLoc()/getStoreOrg() wired in eom-dashboard.js) and pass them in as
// plain fields — this file only groups by whatever string it's handed. That keeps the
// "grouping SOURCE" concern (live vs. stale-seed — see CLAUDE.md's Task 2 gotcha) entirely
// with the callers, where it can differ by environment, and out of the one function both
// share.
//
// ── Input shape: one entry per store in scope ──────────────────────────────────────
//   {
//     loc, name, org, patch,            // patch/org may be null/undefined — see UNASSIGNED_KEY
//     classStatuses: {                  // same shape buildNotificationRow() puts on
//       food:       { status: 'complete'|'in_progress'|'not_started'|'not_applicable', pct },
//       condiment:  { ... }, paper: { ... }, nonproduct: { ... },
//     },
//     uncountedValue: 1234.5,           // $ at risk still open across classes (0 if none)
//     fob: { fobPct, fob, comp, raw, cond, emp, statv, unex, asOf } | null,   // fobSnapshotByStore() shape
//     fobTarget: { fobPct, gapPP, overTarget, comps, topDriver } | null,     // Task 1's buildFobTargetReport() output — fobPct here is the TARGET fraction (buildStoreFobReport()'s own `target`, renamed for symmetry with fob.fobPct above so this file's gap math reads one field name on both sides)
//   }
// classStatusesFromProgress() below adapts computeCountProgress()'s byClass output into
// the classStatuses shape for a caller that only has raw count progress (no notification
// row yet — e.g. a store with no just-fired trigger this run still belongs in the roll-up).

import { lastDayOfPeriod } from './eom-inventory.js';

export const DIGEST_CLASS_ORDER = ['food', 'condiment', 'paper', 'nonproduct'];
export const DIGEST_CLASS_LABELS = { food: 'Food', condiment: 'Condiment', paper: 'Paper', nonproduct: 'Non-Product' };

// Group key used for a store with no live patch/org assignment — lands here rather than
// silently vanishing from every roll-up (dispatch #215 Task 2's explicit unassigned-store
// requirement).
export const UNASSIGNED_KEY = '(unassigned)';

// Whole days remaining until (and including) the period's last calendar day, clamped to
// >= 0. Used for the roll-up headline's "N days left". Returns null with no period.
export function daysLeftInPeriod(period, asOf = new Date()) {
  if (!period) return null;
  const last = lastDayOfPeriod(period);
  const a = asOf instanceof Date ? asOf : new Date(asOf);
  if (isNaN(a)) return null;
  const startOfA = new Date(a); startOfA.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((last.getTime() - startOfA.getTime()) / 86400000));
}

// Adapts computeCountProgress()'s byClass (eom-inventory.js) into the classStatuses shape
// this file's groups expect, for a caller that only has raw count progress on hand (not a
// fired notification row). A class with zero items in scope reads 'not_applicable' — a
// store legitimately has nothing to count in a class (e.g. no Non-Product this cycle),
// matching buildEmailContent()'s own STATUS_LABELS.not_applicable = 'N/A'.
export function classStatusesFromProgress(byClass) {
  const out = {};
  for (const k of DIGEST_CLASS_ORDER) {
    const b = byClass?.[k];
    if (!b || !b.total) { out[k] = { status: 'not_applicable', pct: null }; continue; }
    out[k] = { status: b.done ? 'complete' : (b.counted > 0 ? 'in_progress' : 'not_started'), pct: b.pct };
  }
  return out;
}

const fobPp = (f) => Math.round((f || 0) * 10000) / 100; // fraction -> percentage-points, 2dp — matches fob-report.js's pp()

function orgLabel(key) {
  if (key === 'emerald') return 'Florida (Emerald Arches)';
  if (key === 'mcdok') return 'Oklahoma (MCDOK)';
  return key;
}

// One roll-up row: per-class completion tally, open uncounted-$ risk, and the FOB-vs-target
// read (avg gap, over/under counts, worst offenders) — plus the plain-language headline
// this repo's "say the number and the decision" UI-voice rule asks for.
function rollupGroup(key, label, stores, { period, asOf } = {}) {
  const completion = {};
  for (const k of DIGEST_CLASS_ORDER) {
    let complete = 0, inProgress = 0, notStarted = 0, na = 0;
    for (const s of stores) {
      const st = s.classStatuses?.[k]?.status;
      if (st === 'complete') complete++;
      else if (st === 'in_progress') inProgress++;
      else if (st === 'not_applicable') na++;
      else notStarted++; // covers 'not_started' and a missing/unknown status — never silently drops a store
    }
    completion[k] = { complete, inProgress, notStarted, na, total: stores.length };
  }

  const uncountedValue = stores.reduce((s, st) => s + (Number(st.uncountedValue) || 0), 0);

  // FOB-vs-target aggregation — only over stores with BOTH a fresh FOB snapshot and a
  // resolved target (Task 1). Simple (unweighted) average gap-pp across those stores, not
  // dollar-weighted — a roll-up of PER-STORE gaps, mirroring fob-report.js's own per-store
  // gapPP; dollar-weighting the district FOB% itself is a materially different number
  // (leadershipMath()'s job, out of scope here — reuse that engine if a dollar-weighted
  // district FOB% is ever needed at this level, don't duplicate it).
  const gapRows = stores
    .filter(s => s.fob && s.fob.fobPct != null && s.fobTarget && s.fobTarget.fobPct != null)
    .map(s => ({ loc: s.loc, name: s.name, gapPP: fobPp(s.fob.fobPct - s.fobTarget.fobPct) }));
  const overTarget = gapRows.filter(g => g.gapPP > 0).sort((a, b) => b.gapPP - a.gapPP);
  const underTarget = gapRows.filter(g => g.gapPP <= 0);
  const avgGapPP = gapRows.length ? Math.round((gapRows.reduce((s, g) => s + g.gapPP, 0) / gapRows.length) * 100) / 100 : null;

  // Food+Condiment completion is the decision-relevant read for a leader (matches #213's own
  // FOB_CLASSES pairing — those are the classes that feed FOB and the ones an EOM close hinges
  // on). Paper/Non-Product stay in `completion` above for the full picture but don't drive the headline.
  const openFC = stores.filter(s => {
    const f = s.classStatuses?.food?.status, c = s.classStatuses?.condiment?.status;
    const openF = f && f !== 'complete' && f !== 'not_applicable';
    const openC = c && c !== 'complete' && c !== 'not_applicable';
    return openF || openC;
  });
  const doneFC = stores.length - openFC.length;
  const daysLeft = daysLeftInPeriod(period, asOf);

  let headline = `${label}: ${doneFC}/${stores.length} store${stores.length === 1 ? '' : 's'} Food+Cond complete`;
  if (openFC.length) {
    const names = openFC.slice(0, 3).map(s => s.name || s.loc).join(', ');
    headline += `, ${names}${openFC.length > 3 ? ` +${openFC.length - 3} more` : ''} still open`;
  }
  if (daysLeft != null) headline += ` — ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;
  if (overTarget.length) {
    const worst = overTarget[0];
    headline += `. FOB: ${overTarget.length} store${overTarget.length === 1 ? '' : 's'} over target (worst: ${worst.name || worst.loc} +${worst.gapPP}pp).`;
  } else if (gapRows.length) {
    headline += `. FOB: all ${gapRows.length} store${gapRows.length === 1 ? '' : 's'} with data at/under target.`;
  }

  return {
    key, label, storeCount: stores.length,
    completion, uncountedValue,
    fob: {
      avgGapPP, overTargetCount: overTarget.length, underTargetCount: underTarget.length,
      worstStores: overTarget.slice(0, 5), nWithFobData: gapRows.length,
    },
    doneFoodCond: doneFC, openFoodCond: openFC.map(s => ({ loc: s.loc, name: s.name })),
    daysLeft, headline,
    stores: stores.map(s => ({
      loc: s.loc, name: s.name, org: s.org, patch: s.patch,
      classStatuses: s.classStatuses, uncountedValue: Number(s.uncountedValue) || 0,
      fob: s.fob || null, fobTarget: s.fobTarget || null,
    })),
  };
}

// buildEomDigest(storeRows, { level, period, asOf }) — level: 'patch' | 'org' | 'district'.
// 'district' rolls every row into ONE group; 'patch'/'org' group by the store's own `patch`/
// `org` field (a store with a null/blank value lands under UNASSIGNED_KEY, never dropped).
export function buildEomDigest(storeRows, { level, period, asOf = new Date() } = {}) {
  const rows = Array.isArray(storeRows) ? storeRows : [];

  if (level === 'district') {
    return { level, period: period || null, groups: [rollupGroup('district', 'District', rows, { period, asOf })] };
  }

  const field = level === 'org' ? 'org' : 'patch';
  const byKey = new Map();
  for (const s of rows) {
    const raw = s?.[field];
    const key = (raw == null || raw === '') ? UNASSIGNED_KEY : String(raw);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(s);
  }
  const keys = [...byKey.keys()].sort((a, b) => {
    if (a === UNASSIGNED_KEY) return 1;
    if (b === UNASSIGNED_KEY) return -1;
    return a.localeCompare(b);
  });
  const groups = keys.map(key => rollupGroup(key, level === 'org' ? orgLabel(key) : key, byKey.get(key), { period, asOf }));
  return { level, period: period || null, groups };
}
