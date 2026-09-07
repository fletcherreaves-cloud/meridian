// @ts-nocheck
// Real behavioral tests of lifelenz-attendance-pull.mjs's CSV parser + rollup, against the
// ACTUAL captured attendance_report shape (job log, 2026-09-06, store 0033222 - Elgin OK,
// one-day window) -- not a re-implementation, the real exported functions. Guarded by
// `if (import.meta.url === ...)` in the script itself, so importing it here does not also
// fire off a live LifeLenz pull (same pattern as qsrsoft-variance-pull-window.test.js).
import { describe, it, expect } from 'vitest';
import { parseAttendanceCSV, rollupEmployees } from '../../scripts/lifelenz-attendance-pull.mjs';

// Verbatim from the live job log (scripts/lifelenz-ta-probe.mjs, LIFELENZ_TA_FULL_CAPTURE=1,
// run https://github.com/fletcherreaves-cloud/meridian/actions/runs/34071184894).
const REAL_SAMPLE = `"","","","",Store,0033222
NAME,SCHEDULED SHIFT #,ACCEPTED SHIFT #,PICK UP #,EXCUSED ABSENCE #,EXCUSED ABSENCE %,UNEXCUSED ABSENCE #,UNEXCUSED ABSENCE %,UNFILLED SHIFT #,UNFILLED SHIFT %,LATE SHIFT START #,LATE SHIFT START %,EARLY SHIFT START #,EARLY SHIFT START %,DROPPED #,DROPPED %,SWAPPED #,SWAPPED %
Adrian Martinez,1,1,0,0,0.0%,0,0.0%,0,0.0%,1,100.0%,0,0.0%,0,0.0%,0,0.0%
Aiden Cantu,1,1,0,0,0.0%,0,0.0%,0,0.0%,0,0.0%,1,100.0%,0,0.0%,0,0.0%
Angellina Ortiz,0,0,0,0,--,0,--,0,--,0,--,0,--,0,--,0,--
Benjamin Burris,1,1,0,0,0.0%,0,0.0%,0,0.0%,0,0.0%,0,0.0%,0,0.0%,0,0.0%
Cameron Haulifar,1,1,0,0,0.0%,0,0.0%,0,0.0%,1,100.0%,0,0.0%,0,0.0%,0,0.0%
`;

describe('parseAttendanceCSV — real captured shape', () => {
  it('extracts and zero-pads the store number from the metadata row', () => {
    const parsed = parseAttendanceCSV(REAL_SAMPLE);
    expect(parsed.loc).toBe('0033222');
  });

  it('parses one row per employee, in order, skipping the metadata + header rows', () => {
    const parsed = parseAttendanceCSV(REAL_SAMPLE);
    expect(parsed.employees).toHaveLength(5);
    expect(parsed.employees[0].name).toBe('Adrian Martinez');
    expect(parsed.employees[2].name).toBe('Angellina Ortiz');
  });

  it('reads the "#" count columns correctly, by header name not position', () => {
    const parsed = parseAttendanceCSV(REAL_SAMPLE);
    const adrian = parsed.employees[0];
    expect(adrian.scheduledShifts).toBe(1);
    expect(adrian.acceptedShifts).toBe(1);
    expect(adrian.lateShiftStarts).toBe(1);
    expect(adrian.earlyShiftStarts).toBe(0);
    const aiden = parsed.employees[1];
    expect(aiden.lateShiftStarts).toBe(0);
    expect(aiden.earlyShiftStarts).toBe(1);
  });

  it('an all-zero row (employee with no shifts in the window) parses as all zeros, not a crash from "--"', () => {
    const parsed = parseAttendanceCSV(REAL_SAMPLE);
    const angellina = parsed.employees[2];
    expect(angellina.scheduledShifts).toBe(0);
    expect(angellina.unexcusedAbsences).toBe(0);
  });

  it('returns null when the header shape has drifted (no recognizable NAME/SCHEDULED SHIFT # columns)', () => {
    const drifted = '"","","","",Store,0033222\nSOME,OTHER,HEADER,SHAPE\nx,1,2,3\n';
    expect(parseAttendanceCSV(drifted)).toBeNull();
  });

  it('returns null on a too-short CSV rather than throwing', () => {
    expect(parseAttendanceCSV('just one line')).toBeNull();
  });
});

describe('rollupEmployees — store-level aggregation', () => {
  it('matches the exact values the real parser+rollup produce against the full 50-employee capture', () => {
    // Values verified by running the actual parseAttendanceCSV/rollupEmployees against the
    // full real job-log capture (all 50 employee rows) before writing this assertion --
    // not hand-computed, to avoid a transcription arithmetic error on 18 summed columns.
    const parsed = parseAttendanceCSV(FULL_CAPTURE);
    const rollup = rollupEmployees(parsed.employees);
    expect(rollup).toEqual({
      employee_count: 23,
      scheduled_shifts: 23,
      accepted_shifts: 23,
      pickup_shifts: 0,
      excused_absences: 0,
      unexcused_absences: 0,
      unfilled_shifts: 0,
      late_shift_starts: 11,
      early_shift_starts: 5,
      dropped_shifts: 0,
      swapped_shifts: 0,
    });
  });

  it('employee_count only counts employees with at least one scheduled shift, not the whole roster', () => {
    const parsed = parseAttendanceCSV(REAL_SAMPLE);
    // 5 employees in the fixture, but Angellina has 0 scheduled shifts
    const rollup = rollupEmployees(parsed.employees);
    expect(parsed.employees).toHaveLength(5);
    expect(rollup.employee_count).toBe(4);
  });

  it('sums the "#" columns across every employee row, including zero rows', () => {
    const parsed = parseAttendanceCSV(REAL_SAMPLE);
    const rollup = rollupEmployees(parsed.employees);
    expect(rollup.scheduled_shifts).toBe(4); // Adrian, Aiden, Benjamin, Cameron
    expect(rollup.late_shift_starts).toBe(2); // Adrian, Cameron
    expect(rollup.early_shift_starts).toBe(1); // Aiden
  });

  it('an empty employee list rolls up to all zeros, not a crash', () => {
    expect(rollupEmployees([])).toEqual({
      employee_count: 0, scheduled_shifts: 0, accepted_shifts: 0, pickup_shifts: 0,
      excused_absences: 0, unexcused_absences: 0, unfilled_shifts: 0,
      late_shift_starts: 0, early_shift_starts: 0, dropped_shifts: 0, swapped_shifts: 0,
    });
  });
});

// Full 50-employee capture, verbatim from the same job log as REAL_SAMPLE above.
const FULL_CAPTURE = `"","","","",Store,0033222
NAME,SCHEDULED SHIFT #,ACCEPTED SHIFT #,PICK UP #,EXCUSED ABSENCE #,EXCUSED ABSENCE %,UNEXCUSED ABSENCE #,UNEXCUSED ABSENCE %,UNFILLED SHIFT #,UNFILLED SHIFT %,LATE SHIFT START #,LATE SHIFT START %,EARLY SHIFT START #,EARLY SHIFT START %,DROPPED #,DROPPED %,SWAPPED #,SWAPPED %
Adrian Martinez,1,1,0,0,0.0%,0,0.0%,0,0.0%,1,100.0%,0,0.0%,0,0.0%,0,0.0%
Aiden Cantu,1,1,0,0,0.0%,0,0.0%,0,0.0%,0,0.0%,1,100.0%,0,0.0%,0,0.0%
Angellina Ortiz,0,0,0,0,--,0,--,0,--,0,--,0,--,0,--,0,--
Ayla Perez,0,0,0,0,--,0,--,0,--,0,--,0,--,0,--,0,--
Benjamin Burris,1,1,0,0,0.0%,0,0.0%,0,0.0%,0,0.0%,0,0.0%,0,0.0%,0,0.0%
Bri Morales,0,0,0,0,--,0,--,0,--,0,--,0,--,0,--,0,--
Brynna Moreno,0,0,0,0,--,0,--,0,--,0,--,0,--,0,--,0,--
Cameron Haulifar,1,1,0,0,0.0%,0,0.0%,0,0.0%,1,100.0%,0,0.0%,0,0.0%,0,0.0%
Carol Escusa,0,0,0,0,--,0,--,0,--,0,--,0,--,0,--,0,--
Dalton Morgan,1,1,0,0,0.0%,0,0.0%,0,0.0%,0,0.0%,1,100.0%,0,0.0%,0,0.0%
Dathan Pierce,1,1,0,0,0.0%,0,0.0%,0,0.0%,0,0.0%,0,0.0%,0,0.0%,0,0.0%
Daymien Hernandez,0,0,0,0,--,0,--,0,--,0,--,0,--,0,--,0,--
Diego Bustamante,0,0,0,0,--,0,--,0,--,0,--,0,--,0,--,0,--
Donald Smith,0,0,0,0,--,0,--,0,--,0,--,0,--,0,--,0,--
Elijah Hardimon,1,1,0,0,0.0%,0,0.0%,0,0.0%,1,100.0%,0,0.0%,0,0.0%,0,0.0%
Emma Holt,1,1,0,0,0.0%,0,0.0%,0,0.0%,0,0.0%,0,0.0%,0,0.0%,0,0.0%
Gabriella Morales,1,1,0,0,0.0%,0,0.0%,0,0.0%,0,0.0%,1,100.0%,0,0.0%,0,0.0%
Jadon Caves,1,1,0,0,0.0%,0,0.0%,0,0.0%,1,100.0%,0,0.0%,0,0.0%,0,0.0%
Jaedyn Collins,1,1,0,0,0.0%,0,0.0%,0,0.0%,0,0.0%,0,0.0%,0,0.0%,0,0.0%
James Jackson,0,0,0,0,--,0,--,0,--,0,--,0,--,0,--,0,--
Jayden Regalado,0,0,0,0,--,0,--,0,--,0,--,0,--,0,--,0,--
Jonathan Flores,1,1,0,0,0.0%,0,0.0%,0,0.0%,0,0.0%,0,0.0%,0,0.0%,0,0.0%
Jonavin Mullins,1,1,0,0,0.0%,0,0.0%,0,0.0%,0,0.0%,1,100.0%,0,0.0%,0,0.0%
Joshua Evans,0,0,0,0,--,0,--,0,--,0,--,0,--,0,--,0,--
Juliana Santiago,0,0,0,0,--,0,--,0,--,0,--,0,--,0,--,0,--
Julian Bustamante,0,0,0,0,--,0,--,0,--,0,--,0,--,0,--,0,--
Kaiven Reyes,1,1,0,0,0.0%,0,0.0%,0,0.0%,0,0.0%,1,100.0%,0,0.0%,0,0.0%
Kayleigh Coleman,0,0,0,0,--,0,--,0,--,0,--,0,--,0,--,0,--
Kay Stone,0,0,0,0,--,0,--,0,--,0,--,0,--,0,--,0,--
Keelan Phillips,0,0,0,0,--,0,--,0,--,0,--,0,--,0,--,0,--
Keeyona Wise-Talamasy,1,1,0,0,0.0%,0,0.0%,0,0.0%,1,100.0%,0,0.0%,0,0.0%,0,0.0%
Kestrel Svec,1,1,0,0,0.0%,0,0.0%,0,0.0%,0,0.0%,0,0.0%,0,0.0%,0,0.0%
Kimberly Murphy,0,0,0,0,--,0,--,0,--,0,--,0,--,0,--,0,--
KIM Booker,0,0,0,0,--,0,--,0,--,0,--,0,--,0,--,0,--
LADONNA MABRY,1,1,0,0,0.0%,0,0.0%,0,0.0%,1,100.0%,0,0.0%,0,0.0%,0,0.0%
Marlee Aguilera,1,1,0,0,0.0%,0,0.0%,0,0.0%,0,0.0%,0,0.0%,0,0.0%,0,0.0%
Matthew Sutton,0,0,0,0,--,0,--,0,--,0,--,0,--,0,--,0,--
Matt Timperley,0,0,0,0,--,0,--,0,--,0,--,0,--,0,--,0,--
Maya Mota,1,1,0,0,0.0%,0,0.0%,0,0.0%,1,100.0%,0,0.0%,0,0.0%,0,0.0%
Michael Cooper,0,0,0,0,--,0,--,0,--,0,--,0,--,0,--,0,--
Miela Maldonado,1,1,0,0,0.0%,0,0.0%,0,0.0%,1,100.0%,0,0.0%,0,0.0%,0,0.0%
Mike Middlebrooks,0,0,0,0,--,0,--,0,--,0,--,0,--,0,--,0,--
Robert Meredith,0,0,0,0,--,0,--,0,--,0,--,0,--,0,--,0,--
Rogelio Oregon,0,0,0,0,--,0,--,0,--,0,--,0,--,0,--,0,--
Ryan Vodry,0,0,0,0,--,0,--,0,--,0,--,0,--,0,--,0,--
Stephanie Lane-Baker,0,0,0,0,--,0,--,0,--,0,--,0,--,0,--,0,--
Tammy Gardner,0,0,0,0,--,0,--,0,--,0,--,0,--,0,--,0,--
Temprence Webb,1,1,0,0,0.0%,0,0.0%,0,0.0%,1,100.0%,0,0.0%,0,0.0%,0,0.0%
Terrance Little,1,1,0,0,0.0%,0,0.0%,0,0.0%,1,100.0%,0,0.0%,0,0.0%,0,0.0%
Tristyn Escusa,1,1,0,0,0.0%,0,0.0%,0,0.0%,1,100.0%,0,0.0%,0,0.0%,0,0.0%
`;
