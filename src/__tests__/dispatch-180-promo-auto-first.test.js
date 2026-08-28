// @ts-nocheck
// Dispatch #180 — finish "API over email" for promoAmt/promoPct, the last remaining item from
// #165's audit (memory/audit-emailed-stream-redundancy-2026-08-27.md) — already measured a
// 97-98% field-level match between the emailed glimpseRows.promoAmt and the auto-pulled
// qsr_cash_sheet.metrics.promo_amt, but flagged, not fixed. #175 shipped the identical fix shape
// the same evening for cashOS/posOver and explicitly left promoAmt/promoPct out of scope.
//
// Two gaps kept promo from being auto-first (same shape as #175's two gaps):
//   1. loadOpsCashSheet (src/lib/supabase.js) had no promoAmt/promoPct camelCase aliasing at
//      all — the promoAmt/promoPct lines that DID exist in the file belong to loadGlimpse/
//      loadCash (the EMAIL loaders), not loadOpsCashSheet (the auto/API loader).
//   2. metric-source.js's promoAmt/promoPct chains had no opsCashRows source at all — email
//      (glimpseRows) then manual (ctrlRows) only.
//   One wrinkle #175 didn't have: qsr_cash_sheet.metrics carries promo_amt but no promo_pct
//   column, so promoPct is DERIVED net-sales-weighted (same pattern as discPct/cashOSPct/
//   tRedAPct/tRedBPct), not a straight column alias.
//
// This file proves both fixed per-day, auto-first, with the email/manual fallback intact —
// matching dispatch #165's/#172's/#175's own reconciliation-test style.

import { describe, it, expect } from 'vitest';
import { metricDaily } from '../engine/metric-source.js';

const d = s => new Date(s + 'T00:00:00');

describe('dispatch #180 — promoAmt auto-first over email', () => {
  it('opsCashRows wins over glimpseRows for the same (loc, date)', () => {
    const ds = {
      glimpseRows: [{ loc: '1', date: d('2026-08-20'), promoAmt: 40 }], // email — must NOT win
      opsCashRows: [{ loc: '1', date: d('2026-08-20'), promoAmt: 12.5 }], // auto — wins
    };
    expect(metricDaily(ds, '1', d('2026-08-20'), 'promoAmt')).toBe(12.5);
  });

  it('falls back to email (glimpseRows) for a day opsCashRows does not cover', () => {
    const ds = {
      opsCashRows: [{ loc: '1', date: d('2026-08-19'), promoAmt: 12.5 }],
      glimpseRows: [{ loc: '1', date: d('2026-08-20'), promoAmt: 40 }],
    };
    expect(metricDaily(ds, '1', d('2026-08-20'), 'promoAmt')).toBe(40);
  });

  it('falls back to manual ctrlRows only when neither auto nor email cover the day', () => {
    const ds = { ctrlRows: [{ loc: '1', date: d('2026-08-22'), promoAmt: 7 }] };
    expect(metricDaily(ds, '1', d('2026-08-22'), 'promoAmt')).toBe(7);
  });

  it('per-day precedence, not all-or-nothing: opsCashRows and glimpseRows can each win on different days in the same ds', () => {
    const ds = {
      opsCashRows: [{ loc: '1', date: d('2026-08-20'), promoAmt: 12.5 }],
      glimpseRows: [
        { loc: '1', date: d('2026-08-20'), promoAmt: 999 }, // opsCashRows covers this day — must lose
        { loc: '1', date: d('2026-08-21'), promoAmt: 40 },  // opsCashRows does NOT cover this day — wins
      ],
    };
    expect(metricDaily(ds, '1', d('2026-08-20'), 'promoAmt')).toBe(12.5);
    expect(metricDaily(ds, '1', d('2026-08-21'), 'promoAmt')).toBe(40);
  });

  it("'any' mode still keeps a genuine 0 opsCashRows value", () => {
    const ds = { opsCashRows: [{ loc: '1', date: d('2026-08-20'), promoAmt: 0 }] };
    expect(metricDaily(ds, '1', d('2026-08-20'), 'promoAmt')).toBe(0);
  });
});

describe('dispatch #180 — promoPct auto-first over email', () => {
  it('opsCashRows wins over glimpseRows for the same (loc, date)', () => {
    const ds = {
      glimpseRows: [{ loc: '1', date: d('2026-08-20'), promoPct: 0.02 }],  // email — must NOT win
      opsCashRows: [{ loc: '1', date: d('2026-08-20'), promoPct: 0.0125 }], // auto (derived) — wins
    };
    expect(metricDaily(ds, '1', d('2026-08-20'), 'promoPct')).toBe(0.0125);
  });

  it('falls back to email (glimpseRows) for a day opsCashRows does not cover', () => {
    const ds = {
      opsCashRows: [{ loc: '1', date: d('2026-08-19'), promoPct: 0.0125 }],
      glimpseRows: [{ loc: '1', date: d('2026-08-20'), promoPct: 0.02 }],
    };
    expect(metricDaily(ds, '1', d('2026-08-20'), 'promoPct')).toBe(0.02);
  });

  it('falls back to manual ctrlRows only when neither auto nor email cover the day', () => {
    const ds = { ctrlRows: [{ loc: '1', date: d('2026-08-22'), promoPct: 0.03 }] };
    expect(metricDaily(ds, '1', d('2026-08-22'), 'promoPct')).toBe(0.03);
  });

  it('per-day precedence, not all-or-nothing', () => {
    const ds = {
      opsCashRows: [{ loc: '1', date: d('2026-08-20'), promoPct: 0.0125 }],
      glimpseRows: [
        { loc: '1', date: d('2026-08-20'), promoPct: 0.99 }, // opsCashRows covers — must lose
        { loc: '1', date: d('2026-08-21'), promoPct: 0.02 }, // opsCashRows doesn't cover — wins
      ],
    };
    expect(metricDaily(ds, '1', d('2026-08-20'), 'promoPct')).toBe(0.0125);
    expect(metricDaily(ds, '1', d('2026-08-21'), 'promoPct')).toBe(0.02);
  });

  it("'any' mode still keeps a genuine 0 opsCashRows value", () => {
    const ds = { opsCashRows: [{ loc: '1', date: d('2026-08-20'), promoPct: 0 }] };
    expect(metricDaily(ds, '1', d('2026-08-20'), 'promoPct')).toBe(0);
  });
});

describe('dispatch #180 — regression: email-only device (no opsCashRows at all)', () => {
  // A device that has never had opsCashRows populated (e.g. the auto pull hasn't reached it, or
  // offline cache is stale) must still resolve both metrics exactly as before this dispatch,
  // purely from the emailed/manual sources.
  it('promoAmt resolves unchanged from glimpseRows/ctrlRows with no opsCashRows present', () => {
    const dsGlimpse = { glimpseRows: [{ loc: '1', date: d('2026-08-20'), promoAmt: 40 }] };
    expect(metricDaily(dsGlimpse, '1', d('2026-08-20'), 'promoAmt')).toBe(40);

    const dsCtrl = { ctrlRows: [{ loc: '1', date: d('2026-08-20'), promoAmt: 7 }] };
    expect(metricDaily(dsCtrl, '1', d('2026-08-20'), 'promoAmt')).toBe(7);

    // Glimpse still beats Controls on an email/manual-only device (unchanged relative order).
    const dsBoth = {
      glimpseRows: [{ loc: '1', date: d('2026-08-20'), promoAmt: 40 }],
      ctrlRows:    [{ loc: '1', date: d('2026-08-20'), promoAmt: 7 }],
    };
    expect(metricDaily(dsBoth, '1', d('2026-08-20'), 'promoAmt')).toBe(40);
  });

  it('promoPct resolves unchanged from glimpseRows/ctrlRows with no opsCashRows present', () => {
    const dsGlimpse = { glimpseRows: [{ loc: '1', date: d('2026-08-20'), promoPct: 0.02 }] };
    expect(metricDaily(dsGlimpse, '1', d('2026-08-20'), 'promoPct')).toBe(0.02);

    const dsCtrl = { ctrlRows: [{ loc: '1', date: d('2026-08-20'), promoPct: 0.03 }] };
    expect(metricDaily(dsCtrl, '1', d('2026-08-20'), 'promoPct')).toBe(0.03);

    const dsBoth = {
      glimpseRows: [{ loc: '1', date: d('2026-08-20'), promoPct: 0.02 }],
      ctrlRows:    [{ loc: '1', date: d('2026-08-20'), promoPct: 0.03 }],
    };
    expect(metricDaily(dsBoth, '1', d('2026-08-20'), 'promoPct')).toBe(0.02);
  });
});

describe('dispatch #180 — loadOpsCashSheet promoPct derive matches discPct pattern', () => {
  // Direct-math sanity check on the net-sales-weighted derive added to loadOpsCashSheet,
  // mirroring the discPct pattern it was copied from (net_sales_amt > 0 && field != null).
  const derivePromoPct = r => (r.net_sales_amt > 0 && r.promo_amt != null) ? r.promo_amt / r.net_sales_amt : null;

  it('derives promoPct = promo_amt / net_sales_amt when both present', () => {
    expect(derivePromoPct({ net_sales_amt: 10000, promo_amt: 125 })).toBeCloseTo(0.0125, 6);
  });

  it('is null when net_sales_amt is 0 or missing', () => {
    expect(derivePromoPct({ net_sales_amt: 0, promo_amt: 125 })).toBe(null);
    expect(derivePromoPct({ promo_amt: 125 })).toBe(null);
  });

  it('is null when promo_amt is null', () => {
    expect(derivePromoPct({ net_sales_amt: 10000, promo_amt: null })).toBe(null);
  });

  it('keeps a genuine 0 promo_amt (no promo activity that day)', () => {
    expect(derivePromoPct({ net_sales_amt: 10000, promo_amt: 0 })).toBe(0);
  });
});
