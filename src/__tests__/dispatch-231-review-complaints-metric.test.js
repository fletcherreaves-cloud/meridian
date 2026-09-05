// @ts-nocheck
// Dispatch #231 — mo.complaints (Performance Review Complaint Contacts/100K actual) now sources
// from ds.complaintCases (customer_complaints, Propel Customer Care) — case count for the review
// month ÷ guest count for the same month ('gc' auto-first chain, metric-source.js) × 100,000 —
// instead of staying unset forever under src:'manual' with no actual-data source at all.
//
// Fixtures follow dispatch #174's own convention (dispatch-174-review-sales-auto-source.test.js):
// a `ds` shaped to match each real side of the gap, not a synthetic case invented to fit a theory.
import { describe, it, expect } from 'vitest';
import { autoPopulateKPIs } from '../engine/review-engine.js';

const YEAR = 2026;
const LOC = '3708'; // unpadded, matching how review.loc is used generically elsewhere in this app

function blankMonths() {
  const m = {};
  for (let i = 1; i <= 12; i++) m[i] = {};
  return m;
}
function review() {
  return { loc: LOC, year: YEAR, role: 'gm', name: 'Test GM', kpis: { months: blankMonths() } };
}

describe('dispatch #231 — autoPopulateKPIs complaints (Complaint Contacts/100K) from customer_complaints', () => {
  it('computes case count ÷ guest count × 100,000 for a month with both real complaint cases and guest count', () => {
    const ds = { loaded: true,
      qsrActSummaryRows: [
        { loc: LOC, date: new Date('2026-08-03T00:00:00'), gc: 3000 },
        { loc: LOC, date: new Date('2026-08-04T00:00:00'), gc: 2000 },
      ],
      // customer_complaints' own 5-digit zero-padded convention (schema-customer-complaints.sql) --
      // deliberately DIFFERENT padding than review.loc/qsrActSummaryRows' '3708' above, to prove
      // the _unpadLoc normalization actually runs.
      complaintCases: [
        { loc: '03708', incidentDate: '2026-08-05' },
        { loc: '03708', incidentDate: '2026-08-20' },
      ],
    };
    const filled = autoPopulateKPIs(review(), ds);
    // 2 cases / 5000 guests * 100,000 = 40
    expect(filled.kpis.months[8].complaints).toBeCloseTo(40, 5);
  });

  it('stays unset (falls through to manual) when ds.complaintCases is empty/absent — no capture has been run yet, not a real zero', () => {
    const ds = { loaded: true,
      qsrActSummaryRows: [{ loc: LOC, date: new Date('2026-08-03T00:00:00'), gc: 3000 }],
      // No complaintCases key at all.
    };
    const filled = autoPopulateKPIs(review(), ds);
    expect(filled.kpis.months[8].complaints).toBeUndefined();
  });

  it('excludes cases outside the review month (bucketed by incidentDate, not just present anywhere)', () => {
    const ds = { loaded: true,
      qsrActSummaryRows: [{ loc: LOC, date: new Date('2026-08-03T00:00:00'), gc: 1000 }],
      complaintCases: [
        { loc: '03708', incidentDate: '2026-08-15' },   // inside August
        { loc: '03708', incidentDate: '2026-07-31' },   // outside -- July, must not count
        { loc: '03708', incidentDate: '2026-09-01' },   // outside -- September, must not count
      ],
    };
    const filled = autoPopulateKPIs(review(), ds);
    // 1 case / 1000 guests * 100,000 = 100
    expect(filled.kpis.months[8].complaints).toBeCloseTo(100, 5);
  });

  it('does not leak another store\'s complaint cases into this review\'s loc — real guest count, zero matching cases, correctly resolves to 0 (not unset)', () => {
    const ds = { loaded: true,
      qsrActSummaryRows: [{ loc: LOC, date: new Date('2026-08-03T00:00:00'), gc: 1000 }],
      complaintCases: [
        { loc: '09999', incidentDate: '2026-08-15' }, // different store -- must not count
      ],
    };
    const filled = autoPopulateKPIs(review(), ds);
    expect(filled.kpis.months[8].complaints).toBe(0);
  });

  it('does not divide by zero when guest count resolves to nothing for the month', () => {
    const ds = { loaded: true,
      // No qsrActSummaryRows/glimpseRows/laborRows at all -- 'gc' chain has nothing.
      complaintCases: [{ loc: '03708', incidentDate: '2026-08-05' }],
    };
    const filled = autoPopulateKPIs(review(), ds);
    expect(filled.kpis.months[8].complaints).toBeUndefined();
  });
});
