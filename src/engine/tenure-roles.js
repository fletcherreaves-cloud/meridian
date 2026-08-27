// @ts-nocheck
// src/engine/tenure-roles.js — qsr_employee_tenure job-code -> review-role classification.
//
// Extracted from scripts/backfill-staff-assignments-2026.mjs (dispatch #150) under dispatch #162
// (Performance Review continuity, build item #6, departure/termination handling): #162's
// departure-detection needs the EXACT SAME "is this row still in a review-eligible role" logic
// #150's backfill already worked out (plan doc decision #5, measured 2026-08-26), and this
// project's own standing rule is "check whether a helper exists before writing one" — duplicating
// the job-code lists here would be exactly the kind of drift risk that rule exists to prevent.
//
// Lives in src/engine/, not scripts/, because it is now a REAL SHARED dependency of a src/
// module (departure.js) as well as a scripts/ one -- this repo's own established direction is
// "scripts import from src/" (e.g. scripts/qsrsoft-email-parse.mjs importing src/parsers so client
// and server-side parsing never drift, per CLAUDE.md's Data-Refresh sprint notes), never the
// reverse. A plain scripts/*.mjs file is unsafe to import from browser-bundled src/ code anyway --
// backfill-staff-assignments-2026.mjs's own module top-level references `process.env` to build a
// supabase client, which throws in a browser bundle (no `process` global) the moment anything in
// src/ imports it. scripts/backfill-staff-assignments-2026.mjs now re-exports these names from
// here instead of defining them, so its own existing test
// (src/__tests__/backfill-staff-assignments-2026.test.js) keeps importing from the same path,
// unchanged, and both consumers share one definition.
//
// Everything below is moved verbatim (logic unchanged) from the backfill script -- see that
// file's git history / dispatch-150.md for the original derivation and reasoning.

// ── Job-title-code -> review-role classification (plan doc decision #5, measured 2026-08-26) ──
export const GM_JOB_CODES    = [45, 641];
export const DM_AM_JOB_CODES = [845, 846, 10001, 20107];
export const SM_JOB_CODES    = [647];

// Exact "Active" (not substring -- "Inactive" contains "active"), and no termination date --
// same discipline as people-reports.js's own isActive(), applied to the DB row shape
// (qsr_employee_tenure's snake_case columns) rather than parseEmployeeRosterApi()'s camelCase.
export function isActiveTenureRow(row) {
  return !!row && /^active$/i.test(String(row.employment_status || '').trim()) && !row.termination_entry_date;
}

// A tenure row -> { role: DEFAULT_ROLES ladder id, reviewRole: review-engine.js ROLE_KEYS value }
// or null if the row's job_title_code isn't a review-eligible bucket (GM/AM/DM/SM only -- AS/OM/
// DO have no roster code at all, per decision #5). AM vs DM: same functional job in this org,
// split by pay classification, not job code (owner's own words, decision #5) -- hourly_pay_rate
// 0/null suggests AM (salaried), nonzero suggests DM (hourly). Both fold onto the SAME ladder rung
// ('sm_am_dm'), matching REVIEW_ROLE_TO_LADDER (permissions.js) exactly.
export function classifyRosterAssignment(row) {
  const code = row && row.job_title_code != null ? Number(row.job_title_code) : null;
  if (code == null || Number.isNaN(code)) return null;
  if (GM_JOB_CODES.includes(code)) return { role: 'gm', reviewRole: 'GM' };
  if (SM_JOB_CODES.includes(code)) return { role: 'sm_am_dm', reviewRole: 'SM' };
  if (DM_AM_JOB_CODES.includes(code)) {
    const rate = row.hourly_pay_rate;
    const isHourly = rate != null && Number(rate) !== 0;
    return { role: 'sm_am_dm', reviewRole: isHourly ? 'DM' : 'AM' };
  }
  return null;
}
