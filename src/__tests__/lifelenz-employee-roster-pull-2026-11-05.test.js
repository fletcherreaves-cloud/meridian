// @ts-nocheck
// scripts/lifelenz-pull.mjs's new crew pay-rate ground-truth pull (owner request 2026-11-05) --
// see supabase/schema-lifelenz-employee-roster.sql's header for the full why. These test the
// pure parsing/matching logic directly (no I/O), same reasoning the existing
// lifelenz-punch-edit-audit test file already gives for testing this scripts/ module this way.
//
// All fixtures below are 100% synthetic (fake names, fake ids, fake SSN/DOB/address/phone/email)
// -- matching this repo's standing PII-fixture discipline. The SSN/DOB/address/phone/email
// columns are deliberately INCLUDED in the fixture CSV (exactly like the real LifeLenz report)
// specifically to prove parseEmployeeRosterCSV() never reads them into a row.
import { describe, it, expect } from 'vitest';
import { parseEmployeeRosterCSV, resolveRosterPersonKeys, normalizeRosterName } from '../../scripts/lifelenz-pull.mjs';

// Matches the real employee_roster_report CSV shape 1:1 (confirmed via a live owner-captured
// DevTools request, 2026-11-05): row0 "...,Store,NNNNNNN", row1 the full real header (including
// every PII column), row2+ data.
const HEADER =
  'Home Store NSN,First Name,Last Name,Nickname,DOB,Minor Age,SSN,Street Address,City,State,' +
  'Zip Code,Home Phone,Cellphone,Emergency Contact,Emergency Contact Consent,Date of Consent,' +
  'Email,Hire Date,Restaurant Start Date,Primary JTC,Pay Rate,Last PR Rating,Last PR Date,' +
  'Next PR Due Date,LOA Start Date,LOA Proposed End Date,Status,Termination Date,Termination Reason';

function csv(rows) {
  return '﻿"","","","",Store,0099999\n' + HEADER + '\n' + rows.join('\n');
}

describe('parseEmployeeRosterCSV()', () => {
  it('extracts only the allowed fields, from a row carrying every real PII column', () => {
    const text = csv([
      '0099999,Jordan,Rivera,,01/15/1995,,555-00-1234,123 Fake St,Faketown,OK,73000,' +
      '5551234567,5557654321,Pat Rivera,Y,01/01/2024,jordan.rivera@example.test,' +
      '2026-01-10,2026-01-10,00650,13.50,,,,,,Active,,',
    ]);
    const rows = parseEmployeeRosterCSV(text);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.loc).toBe('0099999');
    expect(r.firstName).toBe('Jordan');
    expect(r.lastName).toBe('Rivera');
    expect(r.fullName).toBe('Jordan Rivera');
    expect(r.payRate).toBe(13.5);
    expect(r.jobTitleCode).toBe('00650');
    expect(r.status).toBe('Active');
    expect(r.hireDate).toBeInstanceOf(Date);

    // The real point of this test: none of the PII columns the CSV carries ever make it into
    // the parsed row object at all -- not as a named field, not under any key.
    const json = JSON.stringify(r).toLowerCase();
    expect(json).not.toContain('555-00-1234'); // SSN
    expect(json).not.toContain('01/15/1995');   // DOB
    expect(json).not.toContain('123 fake st');  // street address
    expect(json).not.toContain('5551234567');   // phone
    expect(json).not.toContain('jordan.rivera@example.test'); // email
    expect(json).not.toContain('pat rivera');   // emergency contact
  });

  it('parses a terminated employee row (termination date/reason)', () => {
    const text = csv([
      '0099999,Casey,Nguyen,,,,,,,,,,,,,,,2025-06-01,2025-06-01,00650,12.75,,,,,,Terminated,2026-10-05,Attendance',
    ]);
    const r = parseEmployeeRosterCSV(text)[0];
    expect(r.status).toBe('Terminated');
    expect(r.terminationReason).toBe('Attendance');
    expect(r.terminationDate).toBeInstanceOf(Date);
  });

  it('skips a row with no first/last name at all', () => {
    const text = csv(['0099999,,,,,,,,,,,,,,,,,,,,,,,,,,,']);
    expect(parseEmployeeRosterCSV(text)).toEqual([]);
  });

  it('returns [] when the store-number preamble row is missing', () => {
    expect(parseEmployeeRosterCSV('just one line, nothing else')).toEqual([]);
  });
});

describe('normalizeRosterName()', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeRosterName('  Jordan  ', 'Rivera')).toBe('jordan rivera');
  });
  it('handles a missing half gracefully', () => {
    expect(normalizeRosterName('Jordan', '')).toBe('jordan');
  });
});

describe('resolveRosterPersonKeys()', () => {
  const nameToId = new Map([
    ['jordan rivera', 'emp-real-id-1'],
    ['pat lee', 'AMBIGUOUS'],
  ]);

  it('resolves a row to a real employment id on an exact name match', () => {
    const { rows, ambiguous, unresolved } = resolveRosterPersonKeys(
      [{ firstName: 'Jordan', lastName: 'Rivera' }], nameToId,
    );
    expect(rows[0].personKey).toBe('emp-real-id-1');
    expect(rows[0].resolved).toBe(true);
    expect(ambiguous).toBe(0);
    expect(unresolved).toBe(0);
  });

  it('falls back to a synthetic name: key when two different ids share a name at this store', () => {
    const { rows, ambiguous } = resolveRosterPersonKeys(
      [{ firstName: 'Pat', lastName: 'Lee' }], nameToId,
    );
    expect(rows[0].personKey).toBe('name:pat lee');
    expect(rows[0].resolved).toBe(false);
    expect(ambiguous).toBe(1);
  });

  it('falls back to a synthetic name: key when no shift-assignment match exists at all (new hire)', () => {
    const { rows, unresolved } = resolveRosterPersonKeys(
      [{ firstName: 'Brand', lastName: 'Newhire' }], nameToId,
    );
    expect(rows[0].personKey).toBe('name:brand newhire');
    expect(rows[0].resolved).toBe(false);
    expect(unresolved).toBe(1);
  });
});
