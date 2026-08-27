// @ts-nocheck
// src/engine/departure.js — Performance Review continuity, build item #6 (dispatch #162):
// departure/termination handling.
//
// Full design: memory/plan-performance-review-continuity-2026-08-26.md, "Second-pass gap review"
// section, resolved item B. Owner's own words, the exact mechanism this file implements:
//   "Do the auto finalize but require approval in the ability to override it. The approval and
//   potential override should come from a job title code qualified to perform the review or
//   above."
// So: a departure (`termination_entry_date` set, or a detected role change out of the six
// review-eligible roles) auto-finalizes the review's still-open period(s) immediately (no manual
// step for the routine case) via the SAME transitionReview() every human Submit/Approve/Return/
// Reopen action already goes through (dispatch #157) — never a second writer of review.periods.
// The auto-finalize is reviewable/reopenable by whoever the EXISTING decision #4 hierarchy check
// (permissions.js's canApproveDeparture, built on the same levelsAbove()/REVIEW_ROLE_TO_LADDER/
// Admin-Developer-escape-hatch primitives canOverrideLockedActual already uses) says is qualified
// — see performance-reviews.js's StatusActionBar for the UI half of that.
//
// Data source: qsr_employee_tenure (supabase/schema-qsr-employee-tenure.sql, dispatch #57), the
// SAME table dispatch #150's backfill script already reads for role/tenure history. Confirmed by
// grep (dispatch #162 scope item, "check what's already pulled before assuming a new data pull is
// needed") that NOTHING in src/ loaded this table client-side before this dispatch — only the
// backfill script (scripts/backfill-staff-assignments-2026.mjs, service-role, one-time) and its
// own test read it. src/lib/supabase.js's loadEmployeeTenure() (added alongside this file) is the
// first real client-side reader, wired into `ds.tenureRows` in App.js the same way dispatch #157
// wired `ds.assignmentRows` from loadStaffAssignments().
//
// Coverage limit, stated plainly rather than silently assumed away: qsr_employee_tenure rows are
// keyed by `geid`, and per assignment-graph.js's own header comment, `geid` is the review-person
// identity ONLY for roster-sourced GM/AM/DM/SM roles — AS/OM/DO use a plain supervisor NAME
// STRING instead (plan doc decision #5: "no roster job-title code exists for those roles at all").
// So detectDeparture() below can only ever find a matching tenure row for a GM/AM/DM/SM reviewee;
// for an AS/OM/DO reviewee it correctly, harmlessly returns "not departed" every time (no data to
// detect from), not a false claim of coverage it doesn't have. Closing that gap needs a real
// AS/OM/DO identity/tenure source, which does not exist yet (same decision #5 gap #150/#151/#154
// already inherited) — out of THIS dispatch's scope to invent.
//
// Known false-positive risk, documented rather than silently accepted: a person promoted from
// GM/AM/DM/SM INTO Area Supervisor or Operations Manager also has their qsr_employee_tenure
// job_title_code stop matching any of the GM/AM/DM/SM codes classifyRosterAssignment() knows about
// (decision #5: AS/OM have no roster code at all) — so, from tenure data alone, "promoted to AS/
// OM" and "left the reviewable ladder entirely" currently look identical. This is a genuine gap in
// the underlying data (not a shortcut taken here), and it is exactly the failure mode the owner's
// own design already covers: a wrongly-departure-flagged review is reviewable/reopenable by the
// qualified reviewer ("e.g. if the departure record was wrong" — plan doc, resolved item B) rather
// than being a silent, unrecoverable lock. A future fix (once decision #5's AS/OM identity gap is
// closed, or once #150's staff_assignments graph is actually populated in production) could check
// whether the person already holds a current staff_assignments row before calling this a
// departure — deliberately NOT built here, since staff_assignments is still zero rows in
// production (confirmed, this dispatch's own context) and would give a false sense of protection.

import { isActiveTenureRow, classifyRosterAssignment } from './tenure-roles.js';
import { transitionReview } from './review-engine.js';

export const DEPARTURE_REASON = {
  TERMINATED: 'terminated',
  ROLE_EXIT: 'role_exit',
};

// The one tenure row matching a review's unified `person` identity (blankReview's own header
// comment — a geid for GM/AM/DM/SM, a name string for AS/OM/DO), or null if none matches. A plain
// linear find — qsr_employee_tenure is a per-person table (PK tenant_id/loc/geid), never a large
// per-day stream, so this is cheap even unindexed at the sizes this app operates at (dozens of
// rows, not thousands).
export function findTenureRow(person, tenureRows) {
  const want = person != null ? String(person).trim() : '';
  if (!want) return null;
  return (tenureRows || []).find(r => r && String(r.geid || '').trim() === want) || null;
}

// The departure-detection function (dispatch #162 scope item 1): given a review (for its unified
// `person` identity) and the current qsr_employee_tenure rows, determines whether that person has
// departed. Two triggers only, matching the plan doc's own wording exactly — a role CHANGE within
// the six review-eligible roles (e.g. GM -> SM) is a promotion/transfer, already handled by
// dispatch #154's segmented scoring, never a departure:
//   1. termination_entry_date is set on their tenure row, OR employment_status reads inactive by
//      any other means (people-reports.js's own isActive() already treats these as one combined
//      "gone" signal — termination_entry_date can lag the status flip in real QSRSoft data).
//   2. Still active, but job_title_code no longer classifies into ANY of GM/AM/DM/SM (only those
//      four have a roster code at all, per decision #5) — exited the ladder entirely.
// Returns { departed, reason, tenureRow } — reason is null when departed is false. Cheap/correct
// for the common case: no matching tenure row (most reviews today, since no person-picker UI
// exists yet — Phase 4b gap) or a matching ACTIVE row that still classifies -> one early return,
// no further work, `departed:false`.
export function detectDeparture(review, tenureRows) {
  const tenureRow = findTenureRow(review?.person, tenureRows);
  if (!tenureRow) return { departed: false, reason: null, tenureRow: null };

  if (!isActiveTenureRow(tenureRow)) {
    return { departed: true, reason: DEPARTURE_REASON.TERMINATED, tenureRow };
  }
  if (classifyRosterAssignment(tenureRow) === null) {
    return { departed: true, reason: DEPARTURE_REASON.ROLE_EXIT, tenureRow };
  }
  return { departed: false, reason: null, tenureRow };
}

// Machine-greppable prefix on the `notes` transitionReview() stores for an auto-triggered
// transition — the audit-trail half of "distinguishable from a human transition when read back"
// (dispatch #162 scope item 2). The OTHER half is the `auto_finalized` status value itself
// (review-engine.js's REVIEW_STATUSES) never being reachable from a human action button.
export const AUTO_FINALIZE_NOTE_PREFIX = '[AUTO-FINALIZE]';

export function isAutoFinalizeNote(notes) {
  return typeof notes === 'string' && notes.startsWith(AUTO_FINALIZE_NOTE_PREFIX);
}

function departureAutoFinalizeNote(reason, tenureRow) {
  const reasonText = reason === DEPARTURE_REASON.ROLE_EXIT
    ? `role change out of the reviewable ladder (job_title_code ${tenureRow?.job_title_code ?? 'n/a'}`
      + `${tenureRow?.job_title_code_description ? ' — ' + tenureRow.job_title_code_description : ''})`
    : 'termination on record';
  return `${AUTO_FINALIZE_NOTE_PREFIX} Departure detected (${reasonText}) — review provisionally `
    + `finalized. Reviewable or reopenable by this person's qualified reviewer (per the reviewer `
    + `hierarchy) or above.`;
}

// Auto-finalize (dispatch #162 scope item 2): when a departure is detected for `review`, transition
// every currently OPEN (non-terminal-status) half — draft/submitted/returned, i.e. anything not
// already 'approved' or already 'auto_finalized' — to 'auto_finalized', via the EXISTING
// transitionReview(id, half, newStatus, notes) 4-arg writer (dispatch #157), never a second writer
// of review.periods. Already-'approved' halves are left untouched (a human already finished that
// conversation; the departure doesn't retroactively unwind it) and an already-'auto_finalized'
// half is skipped too (idempotent — calling this again for the same still-departed person, e.g. on
// every panel load, does not append a fresh statusHistory entry every time).
export function applyDepartureAutoFinalize(review, tenureRows) {
  if (!review) return { departed: false, reason: null, transitioned: [] };
  const { departed, reason, tenureRow } = detectDeparture(review, tenureRows);
  if (!departed) return { departed: false, reason: null, transitioned: [] };

  const periods = review.periods || {};
  const transitioned = [];
  for (const half of ['h1', 'h2']) {
    const status = periods[half]?.status || 'draft';
    if (status === 'approved' || status === 'auto_finalized') continue;
    transitionReview(review.id, half, 'auto_finalized', departureAutoFinalizeNote(reason, tenureRow));
    transitioned.push(half);
  }
  return { departed: true, reason, transitioned };
}

// The "auto-clear" signal (dispatch #162 scope item 5): whatever a future new-manager panel
// (build item #7, NOT built here — confirmed by grep, zero matches for new-manager/NewManagerPanel
// anywhere in src/) would filter a departed person OUT on, so they never show up needing a
// successor assignment. A computed flag derived purely from `review.periods.h1/h2.statusHistory`
// — no new field added to the review record itself.
//
// Walks each half's statusHistory from the END backward: the most recent `to:'draft'` (a human
// Reopen) means the CURRENT state of that half is no longer the result of an auto-finalize (e.g.
// "the departure record was wrong" — plan doc's own example — and a normal review resumed), so
// that half reports NOT handled, even if an auto_finalized entry sits earlier in its history. The
// most recent `to:'auto_finalized'` with no Reopen after it means this half's current state (still
// 'auto_finalized', OR since confirmed 'approved' with no reopen in between) traces directly back
// to that departure event, so it reports handled. This deliberately does NOT mean "status is
// approved" -- a review approved through the ordinary human submit/approve flow, with no
// auto_finalized entry ever in its history, correctly reports NOT handled (they were never
// detected as departed; the new-manager panel must still see them).
function halfDepartureHandled(period) {
  const hist = period?.statusHistory || [];
  for (let i = hist.length - 1; i >= 0; i--) {
    if (hist[i].to === 'draft') return false;
    if (hist[i].to === 'auto_finalized') return true;
  }
  return false;
}

export function isDepartureHandled(review) {
  return halfDepartureHandled(review?.periods?.h1) || halfDepartureHandled(review?.periods?.h2);
}
