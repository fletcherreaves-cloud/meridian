// @ts-nocheck
// Dispatch #149 — Performance Review continuity, Phase 2: lock auto-populated actuals,
// reason-required override. Covers:
//   1. The autoPopulateKPIs bug fix — a manual correction (now an override RECORD, not a raw
//      field edit) survives autoPopulateKPIs re-running, which is the exact scenario that used
//      to silently destroy it (see review-engine.js's own comment on autoPopulateKPIs).
//   2. Override storage: validateOverrideInput, addReviewOverride, effectiveOverrideFor.
//   3. The resolved-value logic (applyReviewOverrides) for BOTH display (kpis.months) and
//      scoring (computeScores/computeScoreBreakdown/rateMetric all read the same resolved
//      months object — nothing downstream needs its own override-awareness).
// Not covered here (not unit-testable from vitest): supabase/schema.sql's review_overrides RLS
// insert policy — see this dispatch's PR body for what to verify live.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import {
  blankReview, autoPopulateKPIs, computeScores, computeScoreBreakdown, rateMetric,
  DEFAULT_REVIEW_CONFIG,
  OVERRIDE_REASONS, OVERRIDE_REASON_LABEL, validateOverrideInput, addReviewOverride,
  getReviewOverrides, effectiveOverrideFor, applyReviewOverrides,
} from '../engine/review-engine.js';

function installLS() {
  const store = {};
  globalThis.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => { for (const k in store) delete store[k]; },
  };
}

describe('validateOverrideInput', () => {
  it('rejects an unrecognized/missing reason', () => {
    expect(validateOverrideInput({ reason: '' }).ok).toBe(false);
    expect(validateOverrideInput({ reason: 'bogus_reason' }).ok).toBe(false);
  });

  it('accepts inaccurate_data / incomplete_data with no note required', () => {
    expect(validateOverrideInput({ reason: 'inaccurate_data' }).ok).toBe(true);
    expect(validateOverrideInput({ reason: 'incomplete_data', note: '' }).ok).toBe(true);
  });

  it('REQUIRES a non-blank explanation for something_else, rejects blank/whitespace-only', () => {
    expect(validateOverrideInput({ reason: 'something_else' }).ok).toBe(false);
    expect(validateOverrideInput({ reason: 'something_else', note: '' }).ok).toBe(false);
    expect(validateOverrideInput({ reason: 'something_else', note: '   ' }).ok).toBe(false);
    expect(validateOverrideInput({ reason: 'something_else', note: 'Store remodel skewed the numbers' }).ok).toBe(true);
  });

  it('OVERRIDE_REASONS is exactly the 3 options the owner specified, in that order', () => {
    expect(OVERRIDE_REASONS.map(r => r.value)).toEqual(['inaccurate_data', 'incomplete_data', 'something_else']);
    expect(OVERRIDE_REASON_LABEL.inaccurate_data).toBe('Inaccurate Data');
    expect(OVERRIDE_REASON_LABEL.incomplete_data).toBe('Incomplete Data');
    expect(OVERRIDE_REASON_LABEL.something_else).toBe('Something Else');
  });
});

describe('addReviewOverride / getReviewOverrides', () => {
  beforeEach(() => installLS());
  afterAll(() => { try { delete globalThis.localStorage; } catch {} });

  it('throws (does not silently no-op) on invalid reason/note, matching validateOverrideInput', () => {
    expect(() => addReviewOverride('rev1', { month: 1, metricKey: 'oepe', value: 130, reason: 'something_else', note: '' }))
      .toThrow();
    expect(getReviewOverrides('rev1')).toEqual([]); // nothing persisted on the throw
  });

  it('throws on a non-numeric value', () => {
    expect(() => addReviewOverride('rev1', { month: 1, metricKey: 'oepe', value: null, reason: 'inaccurate_data' }))
      .toThrow();
  });

  it('persists a valid override and it round-trips via getReviewOverrides', () => {
    const rec = addReviewOverride('rev1', {
      month: 3, metricKey: 'oepe', value: 128, reason: 'inaccurate_data',
      previousValue: 145, overriddenByRole: 'om',
    });
    expect(rec.id).toBeTruthy();
    expect(rec.reviewId).toBe('rev1');
    expect(rec.month).toBe(3);
    expect(rec.metricKey).toBe('oepe');
    expect(rec.value).toBe(128);
    expect(rec.previousValue).toBe(145);
    expect(rec.overriddenByRole).toBe('om');
    expect(typeof rec.overriddenAt).toBe('string');

    const list = getReviewOverrides('rev1');
    expect(list.length).toBe(1);
    expect(list[0]).toEqual(rec);
  });

  it('scopes overrides per reviewId — one review\'s overrides never leak into another\'s', () => {
    addReviewOverride('rev1', { month: 1, metricKey: 'oepe', value: 100, reason: 'inaccurate_data' });
    addReviewOverride('rev2', { month: 1, metricKey: 'oepe', value: 200, reason: 'incomplete_data' });
    expect(getReviewOverrides('rev1').length).toBe(1);
    expect(getReviewOverrides('rev2').length).toBe(1);
    expect(getReviewOverrides('rev1')[0].value).toBe(100);
    expect(getReviewOverrides('rev2')[0].value).toBe(200);
  });

  it('appends rather than replaces — multiple overrides on the same cell all persist (audit trail)', () => {
    addReviewOverride('rev1', { month: 2, metricKey: 'r2p', value: 30, reason: 'inaccurate_data' });
    addReviewOverride('rev1', { month: 2, metricKey: 'r2p', value: 32, reason: 'incomplete_data' });
    expect(getReviewOverrides('rev1').length).toBe(2);
  });
});

describe('effectiveOverrideFor', () => {
  it('returns null when there is no matching override', () => {
    expect(effectiveOverrideFor([], 1, 'oepe')).toBeNull();
    expect(effectiveOverrideFor([{ month: 2, metricKey: 'oepe', value: 1, overriddenAt: '2026-01-01T00:00:00Z' }], 1, 'oepe')).toBeNull();
  });

  it('returns the LATEST record by overriddenAt when several exist for the same cell', () => {
    const overrides = [
      { id: 'a', month: 1, metricKey: 'oepe', value: 100, overriddenAt: '2026-01-01T00:00:00Z' },
      { id: 'b', month: 1, metricKey: 'oepe', value: 105, overriddenAt: '2026-01-03T00:00:00Z' }, // latest
      { id: 'c', month: 1, metricKey: 'oepe', value: 102, overriddenAt: '2026-01-02T00:00:00Z' },
      { id: 'd', month: 2, metricKey: 'oepe', value: 999, overriddenAt: '2026-01-05T00:00:00Z' }, // different month, ignored
    ];
    const ov = effectiveOverrideFor(overrides, 1, 'oepe');
    expect(ov.id).toBe('b');
    expect(ov.value).toBe(105);
  });
});

// ── The bug fix itself ──────────────────────────────────────────────────────────
describe('autoPopulateKPIs bug fix — a correction survives re-population', () => {
  it('REGRESSION: without the override mechanism, a raw manual edit to mo[key] used to be ' +
     'destroyed by autoPopulateKPIs re-running (target fields checked mo[slot]==null first; ' +
     'actual fields did not) — this pins that autoPopulateKPIs STILL overwrites the raw field ' +
     'unconditionally (by design now, see its own header comment), which is exactly why the ' +
     'override must live somewhere else', () => {
    const review = blankReview('Jane GM', 'GM', '3708', 2026, DEFAULT_REVIEW_CONFIG);
    const ds = {
      loaded: true,
      laborRows: [{ loc: '3708', date: '2026-01-15', sales: 100000 }],
    };
    // First auto-populate run.
    let filled = autoPopulateKPIs(review, ds);
    const firstValue = filled.kpis.months[1].salesVsTgt;
    expect(firstValue).toBe(100000);

    // Simulate a raw edit directly to the field (the OLD, pre-#149 behavior a user could do
    // before actual cells became read-only).
    filled.kpis.months[1].salesVsTgt = 55555;

    // Re-running autoPopulateKPIs overwrites it right back — proving the raw field alone can
    // never durably hold a correction, which is why dispatch #149 moves corrections to a
    // separate override record instead of trying to "fix" this overwrite.
    const refilled = autoPopulateKPIs(filled, ds);
    expect(refilled.kpis.months[1].salesVsTgt).toBe(100000);
    expect(refilled.kpis.months[1].salesVsTgt).not.toBe(55555);
  });

  it('THE FIX: a correction stored as an override record survives autoPopulateKPIs re-running, ' +
     'because applyReviewOverrides resolves it AFTER auto-populate, from storage auto-populate ' +
     'never touches', () => {
    const review = blankReview('Jane GM', 'GM', '3708', 2026, DEFAULT_REVIEW_CONFIG);
    const ds = {
      loaded: true,
      laborRows: [{ loc: '3708', date: '2026-01-15', sales: 100000 }],
    };
    let filled = autoPopulateKPIs(review, ds);
    expect(filled.kpis.months[1].salesVsTgt).toBe(100000);

    // A correction — NOT a raw field edit, an override record (what the read-only KPIGrid cell
    // now produces via the override form).
    const overrides = [{
      id: 'ov1', reviewId: filled.id, month: 1, metricKey: 'salesVsTgt', value: 92000,
      reason: 'inaccurate_data', overriddenAt: '2026-01-20T00:00:00Z',
    }];

    // Re-run auto-populate AGAIN (simulating the exact "review reopened / refreshed" scenario
    // the original bug happened in) — the raw field goes right back to the auto value...
    const refilled = autoPopulateKPIs(filled, ds);
    expect(refilled.kpis.months[1].salesVsTgt).toBe(100000);

    // ...but the RESOLVED review (what display and scoring actually use) still shows the
    // override, completely unaffected by the re-run. This is the fix.
    const resolved = applyReviewOverrides(refilled, overrides);
    expect(resolved.kpis.months[1].salesVsTgt).toBe(92000);
  });
});

describe('applyReviewOverrides', () => {
  it('returns the SAME review object (identity) when there are no overrides — cheap no-op', () => {
    const review = blankReview('X', 'GM', '3708', 2026, DEFAULT_REVIEW_CONFIG);
    expect(applyReviewOverrides(review, [])).toBe(review);
    expect(applyReviewOverrides(review, null)).toBe(review);
  });

  it('patches only the overridden (month, metricKey) cells, leaving every other value untouched', () => {
    const review = blankReview('X', 'GM', '3708', 2026, DEFAULT_REVIEW_CONFIG);
    review.kpis.months[3].oepe = 150;
    review.kpis.months[3].r2p = 40;
    review.kpis.months[4].oepe = 148;
    const overrides = [
      { month: 3, metricKey: 'oepe', value: 130, overriddenAt: '2026-01-01T00:00:00Z' },
    ];
    const resolved = applyReviewOverrides(review, overrides);
    expect(resolved.kpis.months[3].oepe).toBe(130);   // overridden
    expect(resolved.kpis.months[3].r2p).toBe(40);      // untouched
    expect(resolved.kpis.months[4].oepe).toBe(148);    // untouched (different month)
    // Original review object is never mutated.
    expect(review.kpis.months[3].oepe).toBe(150);
  });

  it('resolves to the LATEST override when several exist for the same cell', () => {
    const review = blankReview('X', 'GM', '3708', 2026, DEFAULT_REVIEW_CONFIG);
    review.kpis.months[2].kvs = 20;
    const overrides = [
      { month: 2, metricKey: 'kvs', value: 18, overriddenAt: '2026-01-01T00:00:00Z' },
      { month: 2, metricKey: 'kvs', value: 16, overriddenAt: '2026-01-05T00:00:00Z' }, // latest
    ];
    expect(applyReviewOverrides(review, overrides).kpis.months[2].kvs).toBe(16);
  });

  it('never touches the Tgt sibling field — overrides are actual-only', () => {
    const review = blankReview('X', 'GM', '3708', 2026, DEFAULT_REVIEW_CONFIG);
    review.kpis.months[1].oepe = 150;
    review.kpis.months[1].oepeTgt = 140;
    const resolved = applyReviewOverrides(review, [
      { month: 1, metricKey: 'oepe', value: 130, overriddenAt: '2026-01-01T00:00:00Z' },
    ]);
    expect(resolved.kpis.months[1].oepeTgt).toBe(140); // target untouched by an actual override
  });
});

// ── Resolved value feeds scoring, not just display ──────────────────────────────
describe('resolved value reaches scoring (rateMetric / computeScores / computeScoreBreakdown)', () => {
  // rateMetric itself is generic (actual, target, metricCfg) -- it has no idea whether its
  // `actual` came from an override or the raw auto-populated field. The dispatch's requirement
  // ("check every call site, don't just fix the input cell") is satisfied by feeding it the
  // RESOLVED months object, never the raw one, at every call site (KPIGrid, computeScores,
  // computeScoreBreakdown, the print exports) -- this test proves the rating itself flips when
  // the resolved value is used instead of the raw one, for the exact same metric config.
  it('rateMetric returns a DIFFERENT rating for the raw value vs. the resolved (overridden) value', () => {
    const m = DEFAULT_REVIEW_CONFIG.metrics.rgr.find(x => x.key === 'oepe');
    const target = 140; // t:[-5,5,10], better:'lower'
    const rawRating = rateMetric(160, target, m);      // far above target -> low rating
    const resolvedRating = rateMetric(132, target, m); // corrected, below target -> high rating
    expect(rawRating).not.toBe(resolvedRating);
    expect(resolvedRating).toBeGreaterThan(rawRating);
  });

  it('computeScores scores the RESOLVED review differently than the raw one when an override exists', () => {
    const review = blankReview('X', 'GM', '3708', 2026, DEFAULT_REVIEW_CONFIG);
    // A bad auto-sourced OEPE reading, far off target, dragging the score down.
    for (const m of [1, 2, 3, 4, 5, 6]) {
      review.kpis.months[m].oepe = 300;
      review.kpis.months[m].oepeTgt = 140;
    }
    const rawScores = computeScores(review, DEFAULT_REVIEW_CONFIG);

    const overrides = [1, 2, 3, 4, 5, 6].map(m => ({
      month: m, metricKey: 'oepe', value: 138, overriddenAt: '2026-01-01T00:00:00Z',
    }));
    const resolved = applyReviewOverrides(review, overrides);
    const resolvedScores = computeScores(resolved, DEFAULT_REVIEW_CONFIG);

    expect(resolvedScores.h1.metrics).not.toBe(null);
    expect(rawScores.h1.metrics).not.toBe(null);
    expect(resolvedScores.h1.metrics).toBeGreaterThan(rawScores.h1.metrics);
  });

  it('computeScoreBreakdown reflects the resolved actual/rating for an overridden month, not the raw one', () => {
    const review = blankReview('X', 'GM', '3708', 2026, DEFAULT_REVIEW_CONFIG);
    review.kpis.months[1].oepe = 300;
    review.kpis.months[1].oepeTgt = 140;
    const resolved = applyReviewOverrides(review, [
      { month: 1, metricKey: 'oepe', value: 132, overriddenAt: '2026-01-01T00:00:00Z' },
    ]);
    // Dispatch #152: computeScoreBreakdown now returns every period (q1..q4, h1, h2, year) from
    // one call, keyed the same way computeScores() is — January falls in q1 (and rolls up
    // through h1/year), so this reads the q1 breakdown, the direct generalization of the old
    // half-only `bd.categories`.
    const bd = computeScoreBreakdown(resolved, DEFAULT_REVIEW_CONFIG);
    const rgrCat = bd.q1.categories.find(c => c.key === 'rgr');
    const oepeRow = rgrCat.metrics.find(mm => mm.key === 'oepe');
    const janEntry = oepeRow.monthlyData.find(d => d.month === 1);
    expect(janEntry.actual).toBe(132); // resolved value, not the raw 300
    expect(janEntry.rating).toBe(4);   // dev = 132-140 = -8 <= t4(-5), better:'lower' -> Exceeds
  });
});
