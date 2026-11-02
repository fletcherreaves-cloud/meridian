// @ts-nocheck
// Tests of lifelenz-compliance-audit-pull.mjs's dynamic label-map builder + CSV parser.
//
// Unlike Schedule Variance's test fixtures (which use a REAL captured header), this report's
// real CSV header labels have never been captured live -- only the column MEMBER names are
// confirmed real (memory/lifelenz-session.md's "BUILT 2026-11-01" section). So these fixtures
// use a synthetic `name` (display label) per member to prove the MECHANISM (deriving the
// label→member map from a live GetReportMeta call, then using it to parse an arbitrary header
// row) works correctly for ANY labeling the real report turns out to use -- not a claim about
// what the real labels are. Guarded by `if (import.meta.url === ...)` in the script itself, so
// importing it here does not also fire off a live LifeLenz pull.
import { describe, it, expect } from 'vitest';
import { parseComplianceAuditCSV, buildLabelMap, locFromName } from '../../scripts/lifelenz-compliance-audit-pull.mjs';

// Representative subset of the 42 real confirmed column members (memory/lifelenz-session.md),
// each paired with a synthetic test-only display label. One extra member
// (locations_location_name) with no PROMOTED_MEMBERS entry, to exercise the `raw` JSONB path.
const META_COLUMNS = [
  { member: 'compliance_warning_id', name: 'Warning Id' },
  { member: 'employees_employee_name', name: 'Employee' },
  { member: 'employees_geid', name: 'GEID' },
  { member: 'shift_date', name: 'Shift Date' },
  { member: 'category', name: 'Category' },
  { member: 'title', name: 'Title' },
  { member: 'description', name: 'Description' },
  { member: 'source', name: 'Source' },
  { member: 'cost_penalty', name: 'Cost Penalty' },
  { member: 'hour_penalty', name: 'Hour Penalty' },
  { member: 'warning_time', name: 'Warning Time' },
  { member: 'is_dismissed', name: 'Dismissed' },
  { member: 'dismissal_reason', name: 'Dismissal Reason' },
  { member: 'dismissed_by', name: 'Dismissed By' },
  { member: 'dismissed_on', name: 'Dismissed On' },
  { member: 'locations_location_name', name: 'Location' },
];

const HEADER_ROW = META_COLUMNS.map(c => c.name).join(',');

const CSV_WITH_DATA = `Compliance Audit
Date Range,10/02/2026 - 11/01/2026
${HEADER_ROW}
cwid-001,Jordan Lee,G1001,2026-10-25,Meal Break,Missed meal break,Clocked out late for meal,system,12.50,0.25,13:05,false,,,,Ardmore-Broadway
cwid-002,Casey Nguyen,G1002,2026-10-26,Rest Break,Missed rest break,No rest break taken,system,5.00,0.0,,true,Approved by manager,Pat Rivera,2026-10-27,Ardmore-Broadway
`;

describe('buildLabelMap', () => {
  it('maps each real display label (case-insensitively) to its member', () => {
    const map = buildLabelMap(META_COLUMNS);
    expect(map.get('warning id')).toBe('compliance_warning_id');
    expect(map.get('WARNING ID'.toLowerCase())).toBe('compliance_warning_id');
    expect(map.get('shift date')).toBe('shift_date');
    expect(map.get('location')).toBe('locations_location_name');
  });

  it('falls back to the raw member name when no name/shortTitle is present', () => {
    const map = buildLabelMap([{ member: 'some_weird_field' }]);
    expect(map.get('some_weird_field')).toBe('some_weird_field');
  });

  it('returns an empty map for no columns', () => {
    expect(buildLabelMap([]).size).toBe(0);
    expect(buildLabelMap(null).size).toBe(0);
  });
});

describe('parseComplianceAuditCSV — data rows', () => {
  it('parses one row per violation, resolving promoted fields via the dynamic label map', () => {
    const rows = parseComplianceAuditCSV(CSV_WITH_DATA, META_COLUMNS);
    expect(rows).toHaveLength(2);
    expect(rows[0].compliance_warning_id).toBe('cwid-001');
    expect(rows[0].employee_name).toBe('Jordan Lee');
    expect(rows[0].geid).toBe('G1001');
    expect(rows[0].shift_date).toBe('2026-10-25');
    expect(rows[0].category).toBe('Meal Break');
    expect(rows[0].cost_penalty).toBe(12.5);
    expect(rows[0].hour_penalty).toBe(0.25);
    expect(rows[0].is_dismissed).toBe(false);
  });

  it('parses is_dismissed truthy variants and a dismissed row\'s dismissal fields', () => {
    const rows = parseComplianceAuditCSV(CSV_WITH_DATA, META_COLUMNS);
    expect(rows[1].is_dismissed).toBe(true);
    expect(rows[1].dismissal_reason).toBe('Approved by manager');
    expect(rows[1].dismissed_by).toBe('Pat Rivera');
    expect(rows[1].dismissed_on).toBe('2026-10-27');
  });

  it('puts unmapped columns (not in PROMOTED_MEMBERS) into `raw`', () => {
    const rows = parseComplianceAuditCSV(CSV_WITH_DATA, META_COLUMNS);
    expect(rows[0].raw).toEqual({ locations_location_name: 'Ardmore-Broadway' });
  });

  it('assigns a per-compliance_warning_id seq so a repeated id does not collide', () => {
    const csv = CSV_WITH_DATA + 'cwid-001,Jordan Lee,G1001,2026-10-25,Meal Break,Second row same id,,system,0,0,,false,,,,Ardmore-Broadway\n';
    const rows = parseComplianceAuditCSV(csv, META_COLUMNS);
    const sameId = rows.filter(r => r.compliance_warning_id === 'cwid-001');
    expect(sameId).toHaveLength(2);
    expect(sameId.map(r => r.seq).sort()).toEqual([0, 1]);
  });

  it('skips a row missing compliance_warning_id or shift_date rather than crashing', () => {
    const csv = CSV_WITH_DATA.replace('cwid-002,Casey Nguyen,G1002,2026-10-26', ',Casey Nguyen,G1002,');
    const rows = parseComplianceAuditCSV(csv, META_COLUMNS);
    expect(rows.length).toBeLessThan(2);
  });

  it('does not mistake a metadata row (right column count, wrong content) for the header', () => {
    const noisyMetadata = `Compliance Audit
Date Range,10/02/2026 - 11/01/2026
Some Other Report,Field A,Field B,Field C,Field D,Field E,Field F,Field G,Field H,Field I,Field J,Field K,Field L,Field M,Field N,Field O
${HEADER_ROW}
cwid-001,Jordan Lee,G1001,2026-10-25,Meal Break,Missed meal break,,system,12.50,0.25,,false,,,,Ardmore-Broadway
`;
    const rows = parseComplianceAuditCSV(noisyMetadata, META_COLUMNS);
    expect(rows).toHaveLength(1);
    expect(rows[0].compliance_warning_id).toBe('cwid-001');
  });

  it('returns [] when no header row is found in the first 10 lines (shape drifted)', () => {
    const drifted = 'some,other,header,shape\na,b,c,d\n';
    expect(parseComplianceAuditCSV(drifted, META_COLUMNS)).toEqual([]);
  });

  it('a real empty report (no data rows) parses as []', () => {
    const emptyReport = `Compliance Audit\nDate Range,10/02/2026 - 11/01/2026\n${HEADER_ROW}\n`;
    expect(parseComplianceAuditCSV(emptyReport, META_COLUMNS)).toEqual([]);
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
