// @ts-nocheck
// parseRGRBulkVisit() / parseCfvBulkVisit() (src/parsers/graded-visits.js) -- the JSON-summary
// path for RGR/RGR-Health&Safety (Propel's getBrandProtectionVisits list rows) and CFV (Propel's
// getCfvHistory list rows), added 2026-09-04 alongside the EcoSure bulk-capture work. Both list
// actions already carry every field parseRGR()/parseCFV() extract from an HTML export -- no
// per-visit detail call needed, unlike EcoSure -- so these parsers map the summary row directly.
// Fixtures below are the REAL shapes measured from a live HAR capture (memory/finding-ecosure-
// propel-api-2026-08-22.md's "bulk visitId enumeration FOUND" addendum), not invented.
import { describe, it, expect } from 'vitest';
import { parseRGRBulkVisit, parseCfvBulkVisit, CFV_BULK_PASS_THRESHOLD, parseApiVisitDate } from '../parsers/graded-visits.js';

const STORE_META = { store: '11657', name: 'PURCELL' };

describe('parseApiVisitDate', () => {
  it('parses the getBrandProtectionVisits ISO-with-time shape', () => {
    expect(parseApiVisitDate('2026-04-22T00:00:00')).toBe('2026-04-22');
  });
  it('parses a bare ISO date', () => {
    expect(parseApiVisitDate('2026-09-01')).toBe('2026-09-01');
  });
  it('returns null for garbage rather than throwing', () => {
    expect(parseApiVisitDate('not a date')).toBeNull();
  });
});

describe('parseRGRBulkVisit', () => {
  function rgrFixture(overrides = {}) {
    return {
      visitYear: 2026, visitTypeId: 105, visitTypeDescription: 'visits.runningGreatRestaurants',
      visitDate: '2026-04-22T00:00:00', visitId: 8456655, scoredByFlag: 0,
      operationsPercentage: null, overallPercentage: '90.8', qualityPercentage: '89.3',
      servicePercentage: '89.2', cleanlinessPercentage: '89.0', shiftLeadershipPercentage: '90.9',
      foodSafetyResult: 'A', foodSafetyPercentage: '92.0', foodSafetyMissedCriticalQuestionQuantity: 0,
      peopleFirstPercentage: null, peoplePercentage: null, healthSafetyPercentage: '100.0',
      visitMeetsTargetFlag: 1,
      ...overrides,
    };
  }

  it('maps the RGR summary row against the real captured example', () => {
    const v = parseRGRBulkVisit(rgrFixture(), STORE_META);
    expect(v.reportType).toBe('RGR');
    expect(v.store).toBe('11657');
    expect(v.name).toBe('PURCELL');
    expect(v.dateISO).toBe('2026-04-22');
    expect(v.score).toBe(90.8);
    expect(v.pass).toBe(true);
    expect(v.modules.Quality.pct).toBe(89.3);
    expect(v.modules.Service.pct).toBe(89.2);
    expect(v.modules.Cleanliness.pct).toBe(89.0);
    expect(v.modules['Shift Leadership'].pct).toBe(90.9);
    expect(v.modules['Food Safety'].pct).toBe(92.0);
    expect(v.status).toBe('A');
  });

  it('THE TRAP: RGR Health & Safety gets its OWN report_type, not folded into RGR', () => {
    const v = parseRGRBulkVisit(rgrFixture({
      visitTypeId: 111, visitTypeDescription: 'visits.rgrHealthAndSafety',
      visitDate: '2022-10-18T00:00:00', overallPercentage: null, qualityPercentage: null,
      servicePercentage: null, cleanlinessPercentage: null, shiftLeadershipPercentage: null,
      foodSafetyResult: null, foodSafetyPercentage: null, healthSafetyPercentage: '91.2',
    }), STORE_META);
    expect(v.reportType).toBe('RGR-HealthSafety');
    expect(v.dateISO).toBe('2022-10-18');
    expect(v.score).toBeNull(); // this program doesn't carry an overall %
    expect(v.modules['Health & Safety'].pct).toBe(91.2);
    // Components this program doesn't score are simply absent, not fabricated as 0/null entries.
    expect(v.modules.Quality).toBeUndefined();
  });

  it('trusts visitMeetsTargetFlag rather than re-deriving pass from score', () => {
    const v = parseRGRBulkVisit(rgrFixture({ visitMeetsTargetFlag: 0, overallPercentage: '95.0' }), STORE_META);
    expect(v.pass).toBe(false); // a high score with the flag false must not read as passing
  });

  it('a missing/empty payload does not throw', () => {
    expect(() => parseRGRBulkVisit({}, {})).not.toThrow();
    expect(parseRGRBulkVisit({}, {}).store).toBeNull();
    expect(parseRGRBulkVisit({}, {}).modules).toEqual({});
  });
});

describe('parseCfvBulkVisit', () => {
  function cfvFixture(overrides = {}) {
    return {
      visitTypeId: 104, visitTypeDescription: 'visits.customerFirstVisit',
      visitDate: '2026-09-01', visitId: 8748189, overallPercentage: '84.1',
      driveThruPercentage: '75.0', inRestaurantPercentage: null, curbsidePercentage: null,
      deliveryPercentage: null, behindTheCounterPercentage: '100.0',
      ...overrides,
    };
  }

  it('maps the CFV summary row against the real captured example', () => {
    const v = parseCfvBulkVisit(cfvFixture(), STORE_META);
    expect(v.reportType).toBe('CFV');
    expect(v.store).toBe('11657');
    expect(v.dateISO).toBe('2026-09-01');
    expect(v.score).toBe(84.1);
    expect(v.channel).toBe('Drive Thru');
    expect(v.modules['Drive Thru'].pct).toBe(75.0);
    expect(v.modules['Behind the Counter'].pct).toBe(100.0);
  });

  it('THE TRAP: pass is derived from CFV_BULK_PASS_THRESHOLD, not returned by the API', () => {
    expect(CFV_BULK_PASS_THRESHOLD).toBe(80);
    expect(parseCfvBulkVisit(cfvFixture({ overallPercentage: '79.9' }), STORE_META).pass).toBe(false);
    expect(parseCfvBulkVisit(cfvFixture({ overallPercentage: '80.0' }), STORE_META).pass).toBe(true);
  });

  it('picks whichever channel field is non-null -- curbside example', () => {
    const v = parseCfvBulkVisit(cfvFixture({
      driveThruPercentage: null, curbsidePercentage: '88.0',
    }), STORE_META);
    expect(v.channel).toBe('Curbside');
    expect(v.modules.Curbside.pct).toBe(88.0);
  });

  it('picks the delivery channel when it is the one populated', () => {
    const v = parseCfvBulkVisit(cfvFixture({
      driveThruPercentage: null, deliveryPercentage: '70.0',
    }), STORE_META);
    expect(v.channel).toBe('Delivery');
  });

  it('a missing/empty payload does not throw', () => {
    expect(() => parseCfvBulkVisit({}, {})).not.toThrow();
    expect(parseCfvBulkVisit({}, {}).channel).toBeNull();
    expect(parseCfvBulkVisit({}, {}).pass).toBeNull();
  });
});
