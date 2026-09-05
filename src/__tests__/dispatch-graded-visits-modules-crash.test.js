// @ts-nocheck
// Live production crash (reported 2026-09-05, iOS): "This panel hit an error: null is not an
// object (evaluating 't.pct')" in the Graded Visits panel, the moment real EcoSure data first
// existed in graded_visits (244 visits imported that same session, dispatch v5.350/v5.351/v5.352).
//
// Root cause: graded-visits.js's table row / CSV export / print-report code all read `.pct` off
// every entry in `v.modules`, an assumption that held while only CFV/RGR data existed (their
// modules ARE a map of category -> {pct}) but breaks for EcoSure, whose modules shape is
// completely different (pointsReceived/citedItems/sections/comments) -- and `comments` can be
// `null`, so `Object.values(modules).filter(m => m.pct < 80)` threw on `null.pct` (Safari/
// JavaScriptCore's exact wording for that access, matching the iOS report). This never triggered
// before because EcoSure rows never existed in the table until this session's real import.
//
// moduleEntries() is the fix: filter to entries that actually look like {pct: number} before any
// .pct read, so a report type with a different modules shape is excluded from "components"
// displays instead of crashing them.
import { describe, it, expect } from 'vitest';
import { moduleEntries } from '../views/graded-visits.js';
import { parseEcoSureVisit } from '../parsers/graded-visits.js';

describe('moduleEntries (graded-visits.js)', () => {
  it('THE CRASH: a real EcoSure visit with comments:null must not throw when read the way the table row does', () => {
    const v = parseEcoSureVisit({
      restaurantName: 'Ardmore-Broadway', restaurantNumber: '03708', visitDate: '2026-08-11',
      overallScorePercentage: 86, pointsReceived: 86, pointsPossible: 100,
      visitMeetsTargetFlag: 1, visitComments: null, // <- the exact null that crashed .pct
      questions: [{ questionCode: 'FS1-US', questionSection: 'General', criticalFlag: 0, pointsReceived: 0, pointsPossible: 0, result: 0, reasons: [] }],
    });
    expect(v.modules.comments).toBeNull(); // confirms this fixture reproduces the real null
    expect(() => moduleEntries(v).filter(([, m]) => m.pct < 80).length).not.toThrow();
    // EcoSure's modules carry no {pct}-shaped entries at all -- none should survive the filter.
    expect(moduleEntries(v)).toEqual([]);
  });

  it('an EcoSure visit with real cited items also produces zero {pct}-shaped entries', () => {
    const v = parseEcoSureVisit({
      restaurantNumber: '03708', visitDate: '2026-08-11', overallScorePercentage: 70,
      visitMeetsTargetFlag: 0,
      questions: [{ questionCode: 'FS15-US', questionSection: 'Storage', criticalFlag: 0, pointsReceived: 0, pointsPossible: 3, result: 1, reasons: [] }],
    });
    expect(() => moduleEntries(v)).not.toThrow();
    expect(moduleEntries(v)).toEqual([]);
  });

  it('CFV/RGR-shaped modules (the pre-existing, always-worked case) pass through unaffected', () => {
    const v = { modules: { 'Drive Thru': { pct: 75.0 }, 'Behind the Counter': { pct: 100.0 } } };
    const entries = moduleEntries(v);
    expect(entries.length).toBe(2);
    expect(entries.filter(([, m]) => m.pct < 80).length).toBe(1); // only Drive Thru
  });

  it('a visit with no modules at all does not throw', () => {
    expect(() => moduleEntries({})).not.toThrow();
    expect(moduleEntries({})).toEqual([]);
  });
});
