// @ts-nocheck
// Follow-on to dispatch #231 (2026-09-05) — mo.fsEcoSure (Performance Review Food Safety
// EcoSure (%) actual) now sources from ds.gradedVisits (graded_visits, report_type='EcoSure')
// instead of staying unset forever under src:'manual' with no actual-data source at all, the
// same gap dispatch #231 closed for `complaints`. See
// memory/finding-ecosure-propel-api-2026-08-22.md for why the real EcoSure score exists and
// should feed this slot.
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

describe('dispatch #231 follow-on — autoPopulateKPIs fsEcoSure (Food Safety EcoSure %) from graded_visits', () => {
  it('converts a single EcoSure visit score (0-100 scale) to the pctInput fraction convention', () => {
    const ds = { loaded: true,
      // graded_visits' own convention (schema/loadGradedVisits) -- deliberately DIFFERENTLY
      // padded than review.loc ('3708') above, to prove the _unpadLoc normalization actually runs.
      gradedVisits: [
        { store: '03708', reportType: 'EcoSure', dateISO: '2026-08-11', score: 86 },
      ],
    };
    const filled = autoPopulateKPIs(review(), ds);
    expect(filled.kpis.months[8].fsEcoSure).toBeCloseTo(0.86, 5);
  });

  it('averages multiple EcoSure visits in the same review month', () => {
    const ds = { loaded: true,
      gradedVisits: [
        { store: '03708', reportType: 'EcoSure', dateISO: '2026-08-05', score: 80 },
        { store: '03708', reportType: 'EcoSure', dateISO: '2026-08-20', score: 90 },
      ],
    };
    const filled = autoPopulateKPIs(review(), ds);
    expect(filled.kpis.months[8].fsEcoSure).toBeCloseTo(0.85, 5);
  });

  it('stays unset (falls through to manual) when ds.gradedVisits is empty/absent — no visit yet, not a real zero', () => {
    const filled = autoPopulateKPIs(review(), { loaded: true });
    expect(filled.kpis.months[8].fsEcoSure).toBeUndefined();
  });

  it('ignores non-EcoSure report types (CFV/RGR) — this metric is food-safety specific', () => {
    const ds = { loaded: true,
      gradedVisits: [
        { store: '03708', reportType: 'CFV', dateISO: '2026-08-11', score: 95 },
        { store: '03708', reportType: 'RGR', dateISO: '2026-08-12', score: 88 },
      ],
    };
    const filled = autoPopulateKPIs(review(), ds);
    expect(filled.kpis.months[8].fsEcoSure).toBeUndefined();
  });

  it('excludes visits outside the review month (bucketed by dateISO, not just present anywhere)', () => {
    const ds = { loaded: true,
      gradedVisits: [
        { store: '03708', reportType: 'EcoSure', dateISO: '2026-08-15', score: 90 }, // inside August
        { store: '03708', reportType: 'EcoSure', dateISO: '2026-07-31', score: 50 }, // outside -- must not count
        { store: '03708', reportType: 'EcoSure', dateISO: '2026-09-01', score: 50 }, // outside -- must not count
      ],
    };
    const filled = autoPopulateKPIs(review(), ds);
    expect(filled.kpis.months[8].fsEcoSure).toBeCloseTo(0.90, 5);
  });

  it('does not leak another store\'s EcoSure visit into this review\'s loc', () => {
    const ds = { loaded: true,
      gradedVisits: [
        { store: '09999', reportType: 'EcoSure', dateISO: '2026-08-15', score: 50 }, // different store
      ],
    };
    const filled = autoPopulateKPIs(review(), ds);
    expect(filled.kpis.months[8].fsEcoSure).toBeUndefined();
  });
});
