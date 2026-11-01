// @ts-nocheck
// Tests of lifelenz-schedule-variance-pull.mjs's CSV parser. The HEADER shape below is a REAL
// capture (dispatch run 41351238819, window_days=30, LIFELENZ_DEBUG=1's raw-line dump) — three
// metadata lines before the real header, which uses human-readable labels ("Actioned By",
// "Actioned At", ...), not the raw `columns` member names requested in the trigger. Two earlier
// guesses (member names at row 0, then row 1) were both wrong for exactly this reason. DATA row
// content below is still synthetic — every one of the 28 real stores had zero schedule edits
// even across a 30-day window, so no real data row has been captured yet; only the empty-report
// header shape is a real capture. Guarded by `if (import.meta.url === ...)` in the script
// itself, so importing it here does not also fire off a live LifeLenz pull.
import { describe, it, expect } from 'vitest';
import { parseScheduleVarianceCSV, locFromName } from '../../scripts/lifelenz-schedule-variance-pull.mjs';

// Real capture: title line, date-range metadata line, then the real (human-label) header.
const REAL_EMPTY_CSV = `Schedule Variance
Date Range,10/02/2026 - 11/01/2026
Store Name,Scheduled Shift,Assignee,Original Value,Adjusted Value,Actioned By,Actioned At,Hours Variance,Cost Variance
`;

// Same real header shape, with synthetic data rows appended (content not yet captured live).
const SAMPLE_CSV = `Schedule Variance
Date Range,10/02/2026 - 11/01/2026
Store Name,Scheduled Shift,Assignee,Original Value,Adjusted Value,Actioned By,Actioned At,Hours Variance,Cost Variance
0003708 - ARDMORE-BROADWAY,shift-001,Jordan Lee,2026-10-25 09:00,2026-10-25 08:00,Pat Rivera,2026-10-24 19:12:00,1.0,8.50
0003708 - ARDMORE-BROADWAY,shift-002,Casey Nguyen,2026-10-26 17:00,2026-10-26 15:00,Pat Rivera,2026-10-25 11:03:00,-2.0,-17.00
0003708 - ARDMORE-BROADWAY,,Jordan Lee,Cashier,Drive Thru,Taylor Ford,2026-10-25 11:03:00,0,0
`;

describe('parseScheduleVarianceCSV — real empty-report shape', () => {
  it('a real empty report (title + date-range metadata, no data rows) parses as [], not a crash or false match', () => {
    expect(parseScheduleVarianceCSV(REAL_EMPTY_CSV)).toEqual([]);
  });
});

describe('parseScheduleVarianceCSV — data rows (synthetic content, real header shape)', () => {
  it('parses one row per edit event, by the real human-readable header labels', () => {
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

  it('does not mistake a metadata row (right column count, wrong content) for the header', () => {
    // The title/date-range lines each have a different column count than the real header, but
    // this guards the general principle: only an exact label match on the gate columns counts.
    const noisyMetadata = `Schedule Variance
Date Range,10/02/2026 - 11/01/2026
Some Other Report,Field A,Field B,Field C,Field D,Field E,Field F,Field G,Field H
Store Name,Scheduled Shift,Assignee,Original Value,Adjusted Value,Actioned By,Actioned At,Hours Variance,Cost Variance
0003708 - ARDMORE-BROADWAY,shift-001,Jordan Lee,09:00,08:00,Pat Rivera,2026-10-24 19:12:00,1.0,8.50
`;
    const rows = parseScheduleVarianceCSV(noisyMetadata);
    expect(rows).toHaveLength(1);
    expect(rows[0].edited_by).toBe('Pat Rivera');
  });

  it('returns [] when no header row is found in the first 10 lines (shape drifted)', () => {
    const drifted = 'some,other,header,shape\na,b,c,d\n';
    expect(parseScheduleVarianceCSV(drifted)).toEqual([]);
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
