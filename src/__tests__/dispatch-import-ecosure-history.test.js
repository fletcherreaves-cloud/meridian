// @ts-nocheck
// Unit tests for the pure helpers in scripts/import-ecosure-history.mjs -- the CFV-history-style
// backfill for EcoSure visits (mirrors dispatch #74's own test file for import-cfv-history.mjs).
// Guards the same class of trap: loc padding, and preserving an existing row's fields (never
// nulling them out on a re-import). parseEcoSureVisit() itself (the actual JSON->row mapping) is
// already covered by dispatch-ecosure-visit-parser.test.js -- this file tests buildRow()'s own
// logic (existing-row preservation, reviewer tokenization wiring) on top of that.
import { describe, it, expect } from 'vitest';
import { padLoc, buildRow } from '../../scripts/import-ecosure-history.mjs';
import { parseEcoSureVisit } from '../parsers/graded-visits.js';

describe('padLoc (EcoSure import)', () => {
  it('zero-pads a bare NSN to graded_visits\' 5-digit convention', () => {
    expect(padLoc('3708')).toBe('03708');
    expect(padLoc(3708)).toBe('03708');
  });
  it('leaves an already-padded loc unchanged', () => {
    expect(padLoc('10422')).toBe('10422');
  });
});

describe('buildRow (EcoSure import)', () => {
  // Same real, verified fixture as dispatch-ecosure-visit-parser.test.js (Ardmore-Broadway,
  // 86/100, four cited items) -- run through the actual parseEcoSureVisit() rather than a
  // hand-built stand-in, so this test exercises the real seam between the two files.
  function fixture() {
    return {
      restaurantName: 'Ardmore-Broadway', restaurantNumber: '03708', visitDate: '2026-08-11',
      overallScorePercentage: 86, pointsReceived: 86, pointsPossible: 100,
      visitMeetsTargetFlag: 1, reviewedWithName: 'Jane Manager', visitComments: 'Good visit.',
      questions: [
        { questionCode: 'FS15-US', questionSection: 'Storage', criticalFlag: 0, pointsReceived: 0, pointsPossible: 3, result: 1, reasons: [] },
      ],
    };
  }

  it('a first-time insert (no existing row, no reviewer map) leaves visit_by null', () => {
    const v = parseEcoSureVisit(fixture());
    const row = buildRow(v, null, new Map());
    expect(row.report_type).toBe('EcoSure');
    expect(row.loc).toBe('03708');
    expect(row.visit_date).toBe('2026-08-11');
    expect(row.score).toBe(86);
    expect(row.pass).toBe(true);
    expect(row.visit_by).toBeNull();
    expect(row.daypart).toBeNull();
  });

  it('writes the TOKEN from the reviewer map, never the plaintext name', () => {
    const v = parseEcoSureVisit(fixture());
    const map = new Map([['Jane Manager', 'tok-abc123']]);
    const row = buildRow(v, null, map);
    expect(row.visit_by).toBe('tok-abc123');
    expect(JSON.stringify(row)).not.toContain('Jane Manager');
  });

  it('THE TRAP: preserves an existing row\'s daypart/weekpart/owner/manager on a re-import conflict', () => {
    const v = parseEcoSureVisit(fixture());
    const existing = { daypart: 'Lunch', weekpart: 'Weekday', owner: 'J. Smith', manager: 'A. Jones', visit_by: 'old-tok' };
    const row = buildRow(v, existing, new Map());
    expect(row.daypart).toBe('Lunch');
    expect(row.weekpart).toBe('Weekday');
    expect(row.owner).toBe('J. Smith');
    expect(row.manager).toBe('A. Jones');
    // The seed's own score still wins -- only the fields this source never carries are preserved.
    expect(row.score).toBe(86);
  });

  it('a freshly-tokenized reviewer name on re-import overrides a stale existing visit_by', () => {
    const v = parseEcoSureVisit(fixture());
    const existing = { visit_by: 'stale-tok' };
    const map = new Map([['Jane Manager', 'fresh-tok']]);
    const row = buildRow(v, existing, map);
    expect(row.visit_by).toBe('fresh-tok');
  });

  it('falls back to the existing visit_by only when this run has no reviewer token for it', () => {
    const v = parseEcoSureVisit(fixture());
    const existing = { visit_by: 'old-tok' };
    const row = buildRow(v, existing, new Map()); // empty map -- this run couldn't tokenize
    expect(row.visit_by).toBe('old-tok');
  });

  it('carries the full modules payload (citedItems, criticalFailCount) through unmodified', () => {
    const v = parseEcoSureVisit(fixture());
    const row = buildRow(v, null, new Map());
    expect(row.modules.citedCount).toBe(1);
    expect(row.modules.citedItems[0].code).toBe('FS15-US');
  });
});
