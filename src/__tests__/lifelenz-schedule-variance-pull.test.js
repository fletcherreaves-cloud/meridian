// @ts-nocheck
// Tests of lifelenz-schedule-variance-pull.mjs's CSV parser against a SYNTHETIC CSV built from
// the confirmed column shape (owner-captured DevTools curl, 2026-11-01 — the `columns` list is
// real, requested verbatim off the live Data Explorer UI; the actual ROW CONTENT below is
// constructed, not a real capture, since no real downloaded CSV body has been seen yet — see
// scripts/lifelenz-schedule-variance-pull.mjs's own header for what still needs a live dispatch
// to confirm). Guarded by `if (import.meta.url === ...)` in the script itself, so importing it
// here does not also fire off a live LifeLenz pull.
import { describe, it, expect } from 'vitest';
import { parseScheduleVarianceCSV, locFromName } from '../../scripts/lifelenz-schedule-variance-pull.mjs';

// Header row matches the exact confirmed `columns` request order; data rows are synthetic.
const SAMPLE_CSV = `locations_location_name,scheduled_shifts_scheduled_shift_id,employees_employee_name,original_value,updated_value,schedule_event_actors_employee_name,occurred_at,scheduled_hours_variance,cost_variance
0003708 - ARDMORE-BROADWAY,shift-001,Jordan Lee,2026-10-25 09:00,2026-10-25 08:00,Pat Rivera,2026-10-24 19:12:00,1.0,8.50
0003708 - ARDMORE-BROADWAY,shift-002,Casey Nguyen,2026-10-26 17:00,2026-10-26 15:00,Pat Rivera,2026-10-25 11:03:00,-2.0,-17.00
0003708 - ARDMORE-BROADWAY,,Jordan Lee,Cashier,Drive Thru,Taylor Ford,2026-10-25 11:03:00,0,0
`;

describe('parseScheduleVarianceCSV', () => {
  it('parses one row per edit event, by header name', () => {
    const rows = parseScheduleVarianceCSV(SAMPLE_CSV);
    expect(rows).toHaveLength(3);
    expect(rows[0].employee_name).toBe('Jordan Lee');
    expect(rows[0].edited_by).toBe('Pat Rivera');
    expect(rows[0].original_value).toBe('2026-10-25 09:00');
    expect(rows[0].updated_value).toBe('2026-10-25 08:00');
    expect(rows[0].hours_variance).toBe(1.0);
    expect(rows[0].cost_variance).toBe(8.5);
  });

  it('assigns a per-(edited_by,occurred_at) seq so true-duplicate timestamps from one save action do not collide', () => {
    const rows = parseScheduleVarianceCSV(SAMPLE_CSV);
    // rows[1] and rows[2] share edited_by? No -- rows[1] is Pat Rivera, rows[2] is Taylor Ford,
    // different editors, different occurred_at too, so each gets seq 0. Verify the counter is
    // actually scoped per (edited_by, occurred_at), not global, by checking a real collision.
    const collidingCsv = SAMPLE_CSV + '0003708 - ARDMORE-BROADWAY,shift-003,Jordan Lee,A,B,Pat Rivera,2026-10-24 19:12:00,0.5,4.00\n';
    const withCollision = parseScheduleVarianceCSV(collidingCsv);
    const sameGroup = withCollision.filter(r => r.edited_by === 'Pat Rivera' && r.occurred_at === '2026-10-24 19:12:00');
    expect(sameGroup).toHaveLength(2);
    expect(sameGroup.map(r => r.seq).sort()).toEqual([0, 1]);
  });

  it('handles a null scheduled_shift_id (a non-shift-scoped edit, e.g. a role change) without dropping the row', () => {
    const rows = parseScheduleVarianceCSV(SAMPLE_CSV);
    expect(rows[2].scheduled_shift_id).toBeNull();
    expect(rows[2].edited_by).toBe('Taylor Ford');
  });

  it('skips a row missing edited_by or occurred_at rather than crashing', () => {
    const csv = SAMPLE_CSV.replace('Pat Rivera,2026-10-24 19:12:00', ',2026-10-24 19:12:00');
    const rows = parseScheduleVarianceCSV(csv);
    expect(rows.length).toBeLessThan(3);
  });

  it('returns [] when the header shape has drifted (no recognizable edited_by/occurred_at columns)', () => {
    const drifted = 'some,other,header,shape\na,b,c,d\n';
    expect(parseScheduleVarianceCSV(drifted)).toEqual([]);
  });

  it('returns [] on a header-only CSV', () => {
    expect(parseScheduleVarianceCSV(SAMPLE_CSV.split('\n')[0])).toEqual([]);
  });
});

describe('parseScheduleVarianceCSV — title-row shape (measured live 2026-11-01)', () => {
  // Confirmed live (dispatch run 41350595837, after the download fix): the real downloaded CSV
  // is NOT header-first like the synthetic fixture above -- line 0 is a report title
  // ("Schedule Variance"), matching every other LifeLenz report this repo already pulls
  // (metadata/title row, then header, then data). The real header's exact cell TEXT at row 1
  // (member names vs. human shortTitle labels) is still unconfirmed -- every store had zero
  // edits in the validating window, so no real data row has been seen yet. This fixture tests
  // only what's confirmed: a title row must not be mistaken for the header, and the real header
  // (assumed here to echo the requested member names, matching every other LifeLenz CSV report)
  // is found at row 1, not row 0.
  const TITLE_ROW_CSV = `Schedule Variance
locations_location_name,scheduled_shifts_scheduled_shift_id,employees_employee_name,original_value,updated_value,schedule_event_actors_employee_name,occurred_at,scheduled_hours_variance,cost_variance
0003708 - ARDMORE-BROADWAY,shift-001,Jordan Lee,2026-10-25 09:00,2026-10-25 08:00,Pat Rivera,2026-10-24 19:12:00,1.0,8.50
`;

  it('does not mistake the title row for the header, and finds the real header at row 1', () => {
    const rows = parseScheduleVarianceCSV(TITLE_ROW_CSV);
    expect(rows).toHaveLength(1);
    expect(rows[0].edited_by).toBe('Pat Rivera');
    expect(rows[0].employee_name).toBe('Jordan Lee');
  });

  it('a title-only CSV with no data rows at all parses as empty, not a crash', () => {
    const titleOnly = 'Schedule Variance\nlocations_location_name,scheduled_shifts_scheduled_shift_id,employees_employee_name,original_value,updated_value,schedule_event_actors_employee_name,occurred_at,scheduled_hours_variance,cost_variance\n';
    expect(parseScheduleVarianceCSV(titleOnly)).toEqual([]);
  });
});

describe('locFromName', () => {
  it('extracts and zero-pads the store number from a schedule name', () => {
    expect(locFromName('0003708 - ARDMORE-BROADWAY')).toBe('0003708');
    expect(locFromName('33222 - ELGIN, OK')).toBe('0033222');
  });
  it('returns null when no store number is present', () => {
    expect(locFromName('MCDOK/Emerald Arches/MCDOK')).toBeNull();
  });
});
