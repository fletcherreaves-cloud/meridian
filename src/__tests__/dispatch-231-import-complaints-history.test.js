// @ts-nocheck
// Unit tests for scripts/import-complaints-history.mjs's padLoc()/buildRow() -- the customer_complaints
// upsert-row builder. parseComplaintEntry() itself is covered separately
// (dispatch-231-complaints-parser.test.js) -- this file tests buildRow()'s own mapping (loc
// padding, column names) working over that parser's output shape.
import { describe, it, expect } from 'vitest';
import { padLoc, buildRow } from '../../scripts/import-complaints-history.mjs';

describe('padLoc (complaints import)', () => {
  it('zero-pads a bare NSN to the 5-digit convention (matches graded_visits)', () => {
    expect(padLoc('3708')).toBe('03708');
    expect(padLoc(3708)).toBe('03708');
    expect(padLoc('03708')).toBe('03708');
  });
});

describe('buildRow (complaints import)', () => {
  const parsedRow = () => ({
    store: '3708', childCaseId: 35139570, parentCaseId: 35139570,
    issueCode: 'Service', issueSubCode: 'Received Wrong Ingredients',
    incidentDate: '2026-01-05', receivedDate: '2026-01-06', caseStatus: 'CLOSED',
    abbreviatedCustomerComments: 'a preview', customerComments: 'the full text',
  });

  it('maps every field to its customer_complaints column name', () => {
    const row = buildRow(parsedRow());
    expect(row).toMatchObject({
      child_case_id: 35139570, parent_case_id: 35139570, loc: '03708',
      issue_code: 'Service', issue_sub_code: 'Received Wrong Ingredients',
      incident_date: '2026-01-05', received_date: '2026-01-06', case_status: 'CLOSED',
      abbreviated_customer_comments: 'a preview', customer_comments: 'the full text',
    });
    expect(row.updated_at).toBeTruthy();
  });

  it('pads loc through to the 5-digit convention', () => {
    const row = buildRow({ ...parsedRow(), store: '689' });
    expect(row.loc).toBe('00689');
  });
});
