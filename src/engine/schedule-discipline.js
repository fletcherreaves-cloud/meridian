// @ts-nocheck
// src/engine/schedule-discipline.js — Schedule Discipline metrics from LifeLenz's Data Explorer
// "Schedule Variance" report (scripts/lifelenz-schedule-variance-pull.mjs,
// supabase/schema-lifelenz-schedule-variance.sql).
//
// Each raw row is ONE edit event made to a published schedule: who made it (editedBy), what
// value changed (originalValue -> updatedValue), when (occurredAt), and the resulting
// scheduled-hours and cost impact. This is a genuinely new signal for Meridian — not a
// duplicate of lifelenz-pull.mjs's existing lead-time-snapshot capture (which measures how far
// in advance a shift was published/edited relative to its OWN start time, a timing axis) or of
// lifelenz_punch_edits (which is clock-PUNCH edits, not schedule edits).
//
// "Good use" this file exists for: a store/GM that edits its published schedule heavily, and
// especially one whose edits keep ADDING cost (positive costVarianceSum) after the schedule was
// already published, is a real planning-discipline signal — the schedule wasn't right the first
// time, and someone is paying for the correction in both hours and dollars. Per CLAUDE.md's
// "Voice by role" rule, every function here returns the plain count/dollar figure — the "this
// needs a decision" framing happens in the consuming panel
// (src/views/labor-tools.js's ScheduleDisciplinePanel), not here.

const dateOfOccurredAt = occurredAt => {
  if (!occurredAt) return null;
  // occurredAt is a naive timestamp ("YYYY-MM-DD HH:MM:SS" or an ISO string) -- take the date
  // portion directly rather than parsing through Date() and re-formatting, which would silently
  // apply the RUNTIME's local timezone to a value that was never timezone-qualified to begin
  // with (same trap this repo's own lifelenz_punch_edits/qsr_punch_times already document).
  const s = String(occurredAt);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
};

const num = v => (typeof v === 'number' && Number.isFinite(v)) ? v : 0;

/** Per-(loc, date) aggregate: {loc, date, editCount, hoursVarianceSum, costVarianceSum}[].
 *  This is what powers Signals' metric registry (daily, per-store) and stream-freshness. */
export function dailyScheduleVariance(rows) {
  const byKey = new Map();
  for (const r of (rows || [])) {
    if (!r) continue;
    const date = dateOfOccurredAt(r.occurredAt);
    if (!r.loc || !date) continue;
    const key = r.loc + '|' + date;
    const cur = byKey.get(key) || { loc: r.loc, date, editCount: 0, hoursVarianceSum: 0, costVarianceSum: 0 };
    cur.editCount += 1;
    cur.hoursVarianceSum += num(r.hoursVariance);
    cur.costVarianceSum += num(r.costVariance);
    byKey.set(key, cur);
  }
  return [...byKey.values()];
}

/** Per-store summary across whatever window `rows` already covers (the caller filters the
 *  window, this just aggregates it) — {loc, editCount, hoursVarianceSum, costVarianceSum,
 *  lastEditAt}[], sorted by |costVarianceSum| descending so the stores with the biggest cost
 *  impact from post-publish edits surface first. */
export function storeScheduleDisciplineSummary(rows) {
  const byLoc = new Map();
  for (const r of (rows || [])) {
    if (!r || !r.loc) continue;
    const cur = byLoc.get(r.loc) || { loc: r.loc, editCount: 0, hoursVarianceSum: 0, costVarianceSum: 0, lastEditAt: null };
    cur.editCount += 1;
    cur.hoursVarianceSum += num(r.hoursVariance);
    cur.costVarianceSum += num(r.costVariance);
    if (r.occurredAt && (!cur.lastEditAt || r.occurredAt > cur.lastEditAt)) cur.lastEditAt = r.occurredAt;
    byLoc.set(r.loc, cur);
  }
  return [...byLoc.values()].sort((a, b) => Math.abs(b.costVarianceSum) - Math.abs(a.costVarianceSum));
}

/** Per-editor rollup — {editedBy, editCount, costVarianceSum, hoursVarianceSum, locs: string[]}[],
 *  sorted by editCount descending. Mirrors lifelenz_punch_edits' manager_modified-centric
 *  analysis (the existing manual-edit-pattern security rules), applied to SCHEDULE edits
 *  instead of punch edits — same "who is editing, how often" question, different data domain. */
export function editorBreakdown(rows) {
  const byEditor = new Map();
  for (const r of (rows || [])) {
    if (!r || !r.editedBy) continue;
    const cur = byEditor.get(r.editedBy) || { editedBy: r.editedBy, editCount: 0, hoursVarianceSum: 0, costVarianceSum: 0, locs: new Set() };
    cur.editCount += 1;
    cur.hoursVarianceSum += num(r.hoursVariance);
    cur.costVarianceSum += num(r.costVariance);
    if (r.loc) cur.locs.add(r.loc);
    byEditor.set(r.editedBy, cur);
  }
  return [...byEditor.values()]
    .map(e => ({ ...e, locs: [...e.locs] }))
    .sort((a, b) => b.editCount - a.editCount);
}
