// @ts-nocheck
// ── Squadle food-safety checklist normalizer — task #105 Phase 2 UI (2026-11-14) ────────────────
// Pure functions: no Supabase, no fetch, no wall-clock read. Turns one raw `squadle_checklist_records`
// row's JSONB `data` blob into flat, scoreable action rows, then rolls those up the same
// raw-row -> normalized-row -> store-day-rollup -> district-summary shape
// src/engine/forms-completion.js already uses for the (unrelated, QSRSoft) Forms feature — Squadle's
// deferred build note guessed this would be the right shape; this file re-derives it from Squadle's
// OWN real structure rather than assuming the guess was right, then confirms it was.
//
// The real shape (verified live against 42 records / 21 stores / 2 dates, 2026-11-14 — NOT
// invented from the one sample doc'd in memory/finding-hme-squadle-integration-2026-11-06.md):
//   row.data = { brand, squad, location, createdOn, shifts: { "0": <shift>, ..., "9"/"16": <shift> } }
//   shift    = { name, startTime, endTime, tags, meta, tasks: { "0": <task>, ... } }  -- 9-17 shifts/record
//   task     = { kind: 'regular' (the ONLY kind seen across all 3,961 real tasks), name, tags, points,
//                actions: { "0": <action>, ... } }
//   action   = { type, label, using, value, optional, lastEdited, firstEdited, description,
//                triggers: { "0": <trigger>, ... }, attributes, options, formula, attachedFile, ... }
//   trigger  = { type: 'range'|'match'|'formula', lowerRange/upperRange (range) | matchValue (match) }
//
// 11 real action `type`s seen: number, toggle, radio, formula, select, readOnly, text, attachment,
// textarea, checkbox, photo. `readOnly` actions carry no `using`/`value`/`optional` at all (pure
// instructional text, e.g. "Check should be completed approximately one hour after...") -- they are
// NOT completable and are excluded from every rollup here, same as a form's 'open' (not-yet-due)
// rows are excluded in forms-completion.js's computeFormStoreDayRollup, for the same reason: counting
// something that was never meant to be completed would mark every store red by construction.
//
// `optional` is a REAL boolean on the action, present on most (13,139/18,505 = 71% of real non-
// readOnly actions had it explicitly true or false; the other 29% had neither — measured, not a
// typo), e.g. a photo attachment or an "if equipment is broken, select an alternate" fallback field
// that's legitimately blank most of the time. Treated as required UNLESS explicitly `optional:true`
// — same "default to the stricter/safer reading" convention this repo's scope/sensitivity
// classification already uses (see memory/plan-knowledge-backbone-2026-11-03.md §3).
//
// Completion signal is `value` (non-empty), NOT `lastEdited` — measured live: 1,560 of 12,887
// genuinely-completed actions (12%) carry a real value with no `lastEdited` timestamp at all, so
// `lastEdited` alone would silently undercount completion by more than one in ten.

const NON_COMPLETABLE_TYPES = new Set(['readOnly']);

function hasRealValue(v) {
  return v !== undefined && v !== null && v !== '';
}

/**
 * Evaluates one action's `triggers` map against its own `value` to decide whether the action is
 * currently in a FLAGGED state (a measured-bad reading, e.g. a temperature outside its calibration
 * range, or a toggle answered "No" where "No" is the problem answer) — not every action has
 * triggers, and not every trigger type can be evaluated.
 *
 * Only 'range' and 'match' trigger types are evaluated (both measured live, both simple equality/
 * range checks). A 'formula' trigger (also real, e.g. `stringcompare(#0,Shut Down)` referencing
 * ANOTHER action's answer by index) is NOT evaluated here — doing so would require resolving
 * cross-action references this function has no access to, and guessing at the formula language
 * would be inventing behavior, not measuring it (this repo's standing rule). Returns `null` (not
 * `false`) when nothing could be evaluated, so a caller can tell "confirmed fine" from "unknown"
 * rather than silently treating every un-evaluated action as safe.
 */
export function evaluateActionFlag(action) {
  if (!action || !hasRealValue(action.value)) return { flagged: null, reason: null };
  const triggers = action.triggers || {};
  let sawEvaluable = false;
  for (const key of Object.keys(triggers)) {
    const t = triggers[key];
    if (!t || !t.type) continue;
    if (t.type === 'range') {
      sawEvaluable = true;
      const lo = Number(t.lowerRange), hi = Number(t.upperRange), v = Number(action.value);
      if (Number.isFinite(lo) && Number.isFinite(hi) && Number.isFinite(v) && (v < lo || v > hi)) {
        return { flagged: true, reason: `${v} outside ${lo}–${hi}` };
      }
    } else if (t.type === 'match') {
      sawEvaluable = true;
      if (String(action.value) === String(t.matchValue)) {
        return { flagged: true, reason: `answered "${action.value}" (flagged value)` };
      }
    }
    // 'formula' trigger type: real, not evaluated — see function header comment.
  }
  if (!sawEvaluable) return { flagged: null, reason: null };
  return { flagged: false, reason: null };
}

/**
 * Flattens one raw DB row (loc, dt, shard, data) into one flat row PER ACTION — the unit every
 * rollup below is built from. `readOnly` actions are dropped entirely (see file header). Returns
 * [] for a malformed/empty row rather than throwing, so one bad record can't take down a whole
 * district pull's rollup.
 */
export function flattenSquadleRecord(row) {
  const out = [];
  const shifts = row?.data?.shifts;
  if (!shifts || typeof shifts !== 'object') return out;
  for (const shiftKey of Object.keys(shifts)) {
    const shift = shifts[shiftKey] || {};
    const tasks = shift.tasks || {};
    for (const taskKey of Object.keys(tasks)) {
      const task = tasks[taskKey] || {};
      const actions = task.actions || {};
      for (const actionKey of Object.keys(actions)) {
        const action = actions[actionKey] || {};
        if (NON_COMPLETABLE_TYPES.has(action.type)) continue;
        const { flagged, reason } = evaluateActionFlag(action);
        out.push({
          loc: row.loc,
          dt: row.dt,
          shard: row.shard,
          shiftKey, shiftName: shift.name || null,
          taskKey, taskName: task.name || null,
          actionKey, actionType: action.type || null,
          label: action.label || null,
          optional: action.optional === true,
          value: hasRealValue(action.value) ? action.value : null,
          hasValue: hasRealValue(action.value),
          lastEdited: action.lastEdited || null,
          flagged, flagReason: reason,
        });
      }
    }
  }
  return out;
}

/** Flattens a batch of raw DB rows — the loader's own output (loadSquadleChecklistRecords). */
export function flattenSquadleRecords(rows) {
  return (Array.isArray(rows) ? rows : []).flatMap(flattenSquadleRecord);
}

/**
 * Rolls flattened action rows up to one entry per (loc, dt) — a "checklist-day." Required actions
 * (not `optional`) drive `completionRate`; optional actions are tracked separately
 * (`optionalCompletedCount`/`optionalTotalCount`) so a legitimately-blank optional field never
 * drags a store's required-completion number down. `flaggedCount` counts EVERY action with
 * `flagged===true` regardless of optional-ness — a flagged food-safety reading matters whether or
 * not the field itself was marked optional.
 */
export function computeSquadleStoreDayRollup(flatRows) {
  const groups = new Map();
  for (const r of (flatRows || [])) {
    if (!r) continue;
    const key = `${r.loc}|${r.dt}`;
    if (!groups.has(key)) {
      groups.set(key, {
        loc: r.loc, dt: r.dt,
        requiredCount: 0, requiredCompletedCount: 0,
        optionalCount: 0, optionalCompletedCount: 0,
        flaggedCount: 0, flaggedItems: [],
      });
    }
    const g = groups.get(key);
    if (r.optional) {
      g.optionalCount++;
      if (r.hasValue) g.optionalCompletedCount++;
    } else {
      g.requiredCount++;
      if (r.hasValue) g.requiredCompletedCount++;
    }
    if (r.flagged === true) {
      g.flaggedCount++;
      g.flaggedItems.push({
        shiftName: r.shiftName, taskName: r.taskName, label: r.label,
        value: r.value, reason: r.flagReason, lastEdited: r.lastEdited,
      });
    }
  }
  return [...groups.values()].map(g => ({
    ...g,
    completionRate: g.requiredCount ? g.requiredCompletedCount / g.requiredCount : null,
  })).sort((a, b) => b.dt.localeCompare(a.dt) || a.loc.localeCompare(b.loc));
}

/**
 * District-wide (or any filtered set's) summary across store-day rollup rows. `completionRate`
 * here is Σcompleted / Σrequired across every included store-day — NEVER a mean of the individual
 * store-day rates (CLAUDE.md's standing "never average averages" rule; a store with 20 required
 * actions and a store with 400 must not count equally toward the estate number). Sorted worst-
 * completion-first, same "the number that names a decision goes first" convention
 * forms-completion.js's computeFormSummary uses.
 */
export function computeSquadleSummary(rollupRows) {
  let requiredCount = 0, requiredCompletedCount = 0, flaggedCount = 0;
  const byStore = new Map();
  for (const g of (rollupRows || [])) {
    requiredCount += g.requiredCount;
    requiredCompletedCount += g.requiredCompletedCount;
    flaggedCount += g.flaggedCount;
    if (!byStore.has(g.loc)) byStore.set(g.loc, { loc: g.loc, requiredCount: 0, requiredCompletedCount: 0, flaggedCount: 0, days: 0 });
    const s = byStore.get(g.loc);
    s.requiredCount += g.requiredCount;
    s.requiredCompletedCount += g.requiredCompletedCount;
    s.flaggedCount += g.flaggedCount;
    s.days++;
  }
  const perStore = [...byStore.values()].map(s => ({
    ...s,
    completionRate: s.requiredCount ? s.requiredCompletedCount / s.requiredCount : null,
  })).sort((a, b) => (a.completionRate ?? 1) - (b.completionRate ?? 1));
  return {
    requiredCount, requiredCompletedCount, flaggedCount,
    completionRate: requiredCount ? requiredCompletedCount / requiredCount : null,
    perStore,
  };
}

/**
 * All flagged items across a set of flattened rows, most-recently-edited first — the drill-down
 * list for "what actually needs attention," same role as forms-completion.js's
 * sortOccurrencesForDisplay. `lastEdited` can be null (measured: 2/18,505 flagged-eligible actions
 * had a value with no lastEdited) — those sort last rather than crashing a string compare.
 */
export function extractFlaggedItems(flatRows) {
  return (flatRows || [])
    .filter(r => r && r.flagged === true)
    .sort((a, b) => (b.lastEdited || '').localeCompare(a.lastEdited || ''));
}
