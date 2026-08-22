// @ts-nocheck
// Dispatch #74 -- unit tests for the pure helpers in scripts/import-cfv-history.mjs, guarding
// the three traps measured against live Supabase before this backfill was run (see the script's
// own header comment and memory/dispatch-74.md):
//   1. loc padding (graded_visits.loc is 5-digit zero-padded; getCfvHistory returns bare NSNs)
//   2. daypart/weekpart/owner/manager/visit_by must be carried forward from any existing row,
//      never nulled out by the Propel import (Supabase upsert is a full-row replace on conflict)
//   3. channel vocabulary (camelCase API values -> the PDF parser's own Title Case values)
import { describe, it, expect, vi } from 'vitest';
import { padLoc, mapChannel, buildRow, CFV_PASS_THRESHOLD } from '../../scripts/import-cfv-history.mjs';

describe('padLoc (dispatch #74)', () => {
  it('zero-pads a bare NSN to graded_visits\' 5-digit convention', () => {
    expect(padLoc('3708')).toBe('03708');
    expect(padLoc(3708)).toBe('03708');
  });
  it('leaves an already-padded loc unchanged', () => {
    expect(padLoc('10422')).toBe('10422');
  });
});

describe('mapChannel (dispatch #74)', () => {
  it('maps the three real camelCase Propel values to the PDF parser\'s Title Case vocabulary', () => {
    expect(mapChannel('driveThru')).toBe('Drive Thru');
    expect(mapChannel('curbside')).toBe('Curbside');
    expect(mapChannel('inRestaurant')).toBe('In Restaurant');
  });
  it('passes an unrecognized value through unchanged rather than silently dropping it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(mapChannel('frontCounter')).toBe('frontCounter');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
  it('passes null through as null', () => {
    expect(mapChannel(null)).toBe(null);
  });
});

describe('buildRow (dispatch #74)', () => {
  const seedVisit = { loc: '3708', visitDate: '2026-07-07', reportType: 'CFV', overallPct: 75, channel: 'driveThru' };

  it('derives pass from score >= 80, not from source data (there is none)', () => {
    expect(buildRow(seedVisit, null).pass).toBe(false);
    expect(buildRow({ ...seedVisit, overallPct: 80 }, null).pass).toBe(true);
    expect(buildRow({ ...seedVisit, overallPct: 80 }, null).score).toBe(80);
    expect(CFV_PASS_THRESHOLD).toBe(80);
  });

  it('pads loc and maps channel on a first-time insert (no existing row)', () => {
    const row = buildRow(seedVisit, null);
    expect(row.loc).toBe('03708');
    expect(row.channel).toBe('Drive Thru');
  });

  it('leaves daypart/weekpart/owner/manager/visit_by null when there is no existing row -- never invented', () => {
    const row = buildRow(seedVisit, null);
    expect(row.daypart).toBe(null);
    expect(row.weekpart).toBe(null);
    expect(row.owner).toBe(null);
    expect(row.manager).toBe(null);
    expect(row.visit_by).toBe(null);
  });

  it('THE TRAP: preserves an existing row\'s PDF-sourced daypart/weekpart/owner/manager/visit_by -- never nulls them out on conflict', () => {
    const existing = { daypart: 'Lunch', weekpart: 'Weekday', owner: 'J. Smith', manager: 'A. Jones', visit_by: 'Field Consultant' };
    const row = buildRow(seedVisit, existing);
    expect(row.daypart).toBe('Lunch');
    expect(row.weekpart).toBe('Weekday');
    expect(row.owner).toBe('J. Smith');
    expect(row.manager).toBe('A. Jones');
    expect(row.visit_by).toBe('Field Consultant');
    // The seed's own score/channel still win -- only the PDF-only fields are carried forward.
    expect(row.score).toBe(75);
    expect(row.channel).toBe('Drive Thru');
  });
});
