// @ts-nocheck
// ── Quick-Capture Phase 1 (memory/plan-overnight-notes-72-2026-11-06.md §1, task #101) ──────────
// Pure helpers behind the front-screen "+ Log Something" entry point (src/views/quick-capture.js)
// and SAGE's log_event tool (supabase/functions/sage-chat/index.ts). Deliberately NOT a new
// schema or a new write path — buildQuickCaptureEvent() produces the exact event shape
// saveOrgEvents() (src/lib/supabase.js) already consumes, the same one the Events Calendar's
// manual/bulk entry points write, so a quick-captured event and a hand-typed calendar event are
// indistinguishable to every downstream consumer (Event Impact Registry, Scanner, the Events
// panel's own impact lookup).

/**
 * Assemble a single org_events-shaped event from a quick-capture submission.
 * loc/label are required; type defaults to 'other' (the app's existing fallback type).
 * dateStart is the caller's responsibility (pass businessDate()-derived "today" from the UI,
 * or an explicit date) — this function does no date math itself.
 */
export function buildQuickCaptureEvent({ loc, type, label, note, dateStart, enteredBy }) {
  const locStr = String(loc || '').trim();
  const labelStr = String(label || '').trim();
  if (!locStr || !labelStr || !dateStart) return null;
  return {
    loc: locStr,
    dateStart,
    dateEnd: dateStart,
    span: false,
    type: type || 'other',
    label: labelStr,
    scope: 'store',
    note: note ? String(note).trim() : null,
    enteredBy: enteredBy || null,
    method: 'quick-capture',
  };
}

// Same key convention src/views/events-panel.js's impactGlyph() already uses to join a logged
// event back to the Event Impact Registry (event_impact table): loc with any leading zeros
// stripped + '|' + event_type. Kept here as the single shared implementation rather than a
// second hand-copy, since this function and impactGlyph() now both need it.
export function impactLookupKey(loc, type) {
  return String(loc || '').replace(/^0+/, '') + '|' + (type || 'other');
}

/**
 * Look up the real measured impact for one (loc, type) from the Event Impact Registry rows
 * (loadEventImpact()'s return shape — homeImpact/measuredHome/nHome/source). Returns null when
 * nothing has been measured for this exact store×type combo yet — the caller must show that
 * honestly ("no history yet"), never fabricate a number for a first-time occurrence.
 */
export function lookupMeasuredImpact(impactRows, loc, type) {
  const key = impactLookupKey(loc, type);
  const row = (impactRows || []).find(r => impactLookupKey(r.loc, r.eventType) === key);
  if (!row || row.homeImpact == null) return null;
  return {
    pct: row.homeImpact,
    n: row.nHome || 0,
    measured: row.source === 'measured' || row.source == null,
  };
}
