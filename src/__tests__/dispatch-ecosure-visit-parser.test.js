// @ts-nocheck
// EcoSure (3rd-party food safety) graded-visit ingestion — graded-visits.js's own parser
// comment ("add Ecosure the same way once its format is known") is now actionable:
// memory/finding-ecosure-propel-api-2026-08-22.md fully documented the
// getThirdPartyFoodSafetyVisitReport JSON shape (owner-captured 2026-08-22). This tests
// parseEcoSureVisit() against a fixture built from that documentation, anchored to the finding's
// own verified arithmetic example: Ardmore-Broadway 2026-08-11, 86/100, four cited items
// (FS15 -3, FS18 -5, FS25 -3, FS26 -3 = -14 lost, 100-14=86).
import { describe, it, expect } from 'vitest';
import { parseEcoSureVisit } from '../parsers/graded-visits.js';

function fixture(overrides = {}) {
  return {
    restaurantName: 'Ardmore-Broadway',
    restaurantNumber: '03708',
    visitDate: '2026-08-11',
    overallScorePercentage: 86,
    pointsReceived: 86,
    pointsPossible: 100,
    completedBy: 'Ecosure',
    visitMeetsTargetFlag: 1,
    reviewedWithName: 'Jane Manager',
    visitComments: 'Good visit overall.',
    questions: [
      { questionCode: 'FS1-US', questionSection: 'CRITICAL FOOD SAFETY', criticalFlag: 1, pointsReceived: 0, pointsPossible: 0, result: 0, reasons: [] },
      { questionCode: 'FS-A-US ', questionSection: 'General', criticalFlag: 0, pointsReceived: 20, pointsPossible: 20, result: 0, reasons: [] }, // trailing space, per the finding
      { questionCode: 'FS5-US', questionSection: 'Cooking', criticalFlag: 0, pointsReceived: 0, pointsPossible: 0, result: -1, reasons: [] }, // breakfast not served -> N/A
      { questionCode: 'FS15-US', questionSection: 'Storage', criticalFlag: 0, pointsReceived: 0, pointsPossible: 3, result: 1, reasons: [{ reasonCode: '345286', reasonText: 'state of repair' }] },
      { questionCode: 'FS18-US', questionSection: 'Contamination Prevention', criticalFlag: 0, pointsReceived: 0, pointsPossible: 5, result: 1, reasons: [{ reasonCode: '345311', reasonText: 'raw-food handling' }] },
      { questionCode: 'FS25-US', questionSection: 'Storage', criticalFlag: 0, pointsReceived: 0, pointsPossible: 3, result: 1, reasons: [{ reasonCode: '345400', reasonText: 'shelf lives' }] },
      { questionCode: 'FS26-US', questionSection: 'Storage', criticalFlag: 0, pointsReceived: 0, pointsPossible: 3, result: 1, reasons: [{ reasonCode: '345401', reasonText: 'leftover heated foods' }] },
    ],
    ...overrides,
  };
}

describe('parseEcoSureVisit', () => {
  it('maps the header fields against the documented, verified Ardmore-Broadway example', () => {
    const v = parseEcoSureVisit(fixture());
    expect(v.reportType).toBe('EcoSure');
    expect(v.store).toBe('03708');
    expect(v.name).toBe('Ardmore-Broadway');
    expect(v.dateISO).toBe('2026-08-11');
    expect(v.score).toBe(86);
    expect(v.pass).toBe(true);
    expect(v.reviewerName).toBe('Jane Manager'); // tokenized at SAVE time, not here -- see the save-path test
  });

  it('counts exactly the 4 cited items from the verified example, none critical', () => {
    const v = parseEcoSureVisit(fixture());
    expect(v.modules.citedCount).toBe(4);
    expect(v.modules.criticalFailCount).toBe(0);
    const codes = v.modules.citedItems.map(c => c.code).sort();
    expect(codes).toEqual(['FS15-US', 'FS18-US', 'FS25-US', 'FS26-US']);
  });

  it('computes pointsLost per cited item matching the finding\'s own reconciled arithmetic (3+5+3+3=14, 100-14=86)', () => {
    const v = parseEcoSureVisit(fixture());
    const lost = v.modules.citedItems.reduce((a, c) => a + c.pointsLost, 0);
    expect(lost).toBe(14);
    expect(v.modules.pointsPossible - lost).toBe(v.score);
  });

  it('trims a trailing-space questionCode on ingest (the finding\'s own documented trap)', () => {
    // FS-A-US carries a trailing space in the raw fixture, matching the finding's own recorded
    // trap ("FS-A-US ", "FS-B-US "). Make it CITED so its code actually surfaces in citedItems.
    const withCitedSpacedCode = fixture({
      questions: fixture().questions.map(q => q.questionCode === 'FS-A-US ' ? { ...q, result: 1, pointsReceived: 0 } : q),
    });
    const v = parseEcoSureVisit(withCitedSpacedCode);
    const spacedItem = v.modules.citedItems.find(c => c.section === 'General');
    expect(spacedItem).toBeTruthy();
    expect(spacedItem.code).toBe('FS-A-US'); // trailing space trimmed
  });

  it('a critical item cited (result:1, criticalFlag:1) is counted in criticalFailCount separately from score', () => {
    const withCriticalFail = fixture({
      questions: [
        ...fixture().questions,
        { questionCode: 'FS3-US', questionSection: 'CRITICAL FOOD SAFETY', criticalFlag: 1, pointsReceived: 0, pointsPossible: 0, result: 1, reasons: [{ reasonCode: '999', reasonText: 'cold holding temp fail' }] },
      ],
    });
    const v = parseEcoSureVisit(withCriticalFail);
    expect(v.modules.criticalFailCount).toBe(1);
    expect(v.modules.citedCount).toBe(5); // 4 non-critical + 1 critical
  });

  it('N/A items (result: -1) are neither cited nor counted as pass/fail', () => {
    const v = parseEcoSureVisit(fixture());
    expect(v.modules.sections['Cooking'].naCount).toBe(1);
    expect(v.modules.sections['Cooking'].citedCount).toBe(0);
  });

  it('trusts visitMeetsTargetFlag as-is rather than re-deriving pass from score or critical fails', () => {
    // A store could conceivably fail the target despite no critical fail captured here (e.g. an
    // aggregate-score rule this file never documented) -- the parser must not override the flag.
    const failedDespiteNoCriticalCaptured = fixture({ visitMeetsTargetFlag: 0 });
    expect(parseEcoSureVisit(failedDespiteNoCriticalCaptured).pass).toBe(false);
  });

  it('accepts a JSON string (matching a plain file.text() read) as well as a parsed object', () => {
    const asString = JSON.stringify(fixture());
    expect(parseEcoSureVisit(asString).store).toBe('03708');
  });

  it('an unparseable visitDate degrades to dateISO: null, not a throw', () => {
    const v = parseEcoSureVisit(fixture({ visitDate: 'not a date' }));
    expect(v.dateISO).toBeNull();
  });

  it('a missing/empty payload does not throw', () => {
    expect(() => parseEcoSureVisit({})).not.toThrow();
    expect(parseEcoSureVisit({}).store).toBeNull();
    expect(parseEcoSureVisit({}).modules.citedCount).toBe(0);
  });

  // THE TRAP (found 2026-09-04 against a real captured getThirdPartyFoodSafetyVisitReport
  // response): the live endpoint wraps the report in {results: {...}}, not flat -- this file's own
  // fixture above was hand-built flat and never caught it. A caller feeding the raw HTTP response
  // body straight through (the bulk-capture path, and any future direct-API path) must still parse.
  it('unwraps a {results: {...}} envelope, matching the real API response shape', () => {
    const wrapped = { results: fixture() };
    const v = parseEcoSureVisit(wrapped);
    expect(v.store).toBe('03708');
    expect(v.score).toBe(86);
    expect(v.modules.citedCount).toBe(4);
  });

  it('unwraps a {results: {...}} envelope given as a JSON string too', () => {
    const wrapped = JSON.stringify({ results: fixture() });
    const v = parseEcoSureVisit(wrapped);
    expect(v.store).toBe('03708');
  });

  it('a flat (unwrapped) object with no results key still parses as before (back-compat)', () => {
    const v = parseEcoSureVisit(fixture());
    expect(v.store).toBe('03708');
  });
});
