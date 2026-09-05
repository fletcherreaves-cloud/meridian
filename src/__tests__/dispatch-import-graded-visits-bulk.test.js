// @ts-nocheck
// Unit tests for scripts/import-graded-visits-bulk.mjs's buildRow() -- the unified CFV+RGR+EcoSure
// backfill generalizing import-cfv-history.mjs and import-ecosure-history.mjs's own already-tested
// patterns across all three parsers in one run. parseRGRBulkVisit()/parseCfvBulkVisit()/
// parseEcoSureVisit() themselves are covered elsewhere (dispatch-rgr-cfv-bulk-parser.test.js,
// dispatch-ecosure-visit-parser.test.js) -- this file tests buildRow()'s own logic (loc padding,
// existing-row preservation, reviewer-token wiring) working uniformly across all three shapes.
import { describe, it, expect } from 'vitest';
import { padLoc, buildRow } from '../../scripts/import-graded-visits-bulk.mjs';
import { parseRGRBulkVisit, parseCfvBulkVisit, parseEcoSureVisit } from '../parsers/graded-visits.js';

describe('padLoc (unified graded-visits import)', () => {
  it('zero-pads a bare NSN to graded_visits\' 5-digit convention', () => {
    expect(padLoc('3708')).toBe('03708');
    expect(padLoc(3708)).toBe('03708');
  });
});

describe('buildRow (unified graded-visits import) -- RGR', () => {
  const rgrVisit = () => parseRGRBulkVisit({
    visitTypeDescription: 'visits.runningGreatRestaurants', visitDate: '2026-04-22T00:00:00',
    overallPercentage: '90.8', qualityPercentage: '89.3', visitMeetsTargetFlag: 1,
  }, { store: '11657', name: 'PURCELL' });

  it('a first-time insert leaves visit_by/daypart null', () => {
    const row = buildRow(rgrVisit(), null, new Map());
    expect(row.report_type).toBe('RGR');
    expect(row.loc).toBe('11657');
    expect(row.score).toBe(90.8);
    expect(row.visit_by).toBeNull();
    expect(row.daypart).toBeNull();
  });

  it('THE TRAP: preserves an existing row\'s daypart/weekpart/owner/manager on re-import', () => {
    const existing = { daypart: 'Lunch', weekpart: 'Weekday', owner: 'J. Smith', manager: 'A. Jones', visit_by: 'old-tok' };
    const row = buildRow(rgrVisit(), existing, new Map());
    expect(row.daypart).toBe('Lunch');
    expect(row.weekpart).toBe('Weekday');
    expect(row.owner).toBe('J. Smith');
    expect(row.manager).toBe('A. Jones');
    // RGR carries no reviewerName, so a stale visit_by is preserved rather than nulled.
    expect(row.visit_by).toBe('old-tok');
  });
});

describe('buildRow (unified graded-visits import) -- CFV', () => {
  const cfvVisit = () => parseCfvBulkVisit({
    visitDate: '2026-09-01', overallPercentage: '84.1', driveThruPercentage: '75.0',
  }, { store: '3708', name: 'ARDMORE-BROADWAY' });

  it('pads the loc and carries the channel/score through', () => {
    const row = buildRow(cfvVisit(), null, new Map());
    expect(row.report_type).toBe('CFV');
    expect(row.loc).toBe('03708');
    expect(row.channel).toBe('Drive Thru');
    expect(row.score).toBe(84.1);
  });
});

describe('buildRow (unified graded-visits import) -- EcoSure', () => {
  function ecoFixture() {
    return {
      restaurantName: 'Ardmore-Broadway', restaurantNumber: '03708', visitDate: '2026-08-11',
      overallScorePercentage: 86, pointsReceived: 86, pointsPossible: 100,
      visitMeetsTargetFlag: 1, reviewedWithName: 'Jane Manager', visitComments: 'Good visit.',
      questions: [],
    };
  }

  it('writes the TOKEN from the reviewer map, never the plaintext name', () => {
    const v = parseEcoSureVisit(ecoFixture());
    const map = new Map([['Jane Manager', 'tok-abc123']]);
    const row = buildRow(v, null, map);
    expect(row.report_type).toBe('EcoSure');
    expect(row.visit_by).toBe('tok-abc123');
    expect(JSON.stringify(row)).not.toContain('Jane Manager');
  });

  it('falls back to the existing visit_by only when this run has no reviewer token for it', () => {
    const v = parseEcoSureVisit(ecoFixture());
    const existing = { visit_by: 'old-tok' };
    const row = buildRow(v, existing, new Map());
    expect(row.visit_by).toBe('old-tok');
  });
});
