// @ts-nocheck
// Dispatch #175 — finish "API over email" for cashOS/posOver.
//
// Owner's question (2026-08-27, follow-up to #172): "is this not data that we're auto pulling
// through script now as well? Could it just be rewired to the auto pull rather than the email
// pull?" Measured live: qsr_cash_sheet (ds.opsCashRows) already carries cash_over_or_short and
// overring_amt/overring_qty, but two gaps kept those from being auto-first:
//   1. loadOpsCashSheet (src/lib/supabase.js) aliased every OTHER qsr_cash_sheet field to
//      camelCase except posOverAmt/posOverCnt (r.overring_amt/r.overring_qty) — so no chain
//      could even read them from opsCashRows.
//   2. cashOSAmt/cashOSPct's chain had opsCashRows in third position, behind the two emailed
//      sources — backwards from the auto-first standing rule.
//
// This file proves both fixed per-day, auto-first, with the email fallback intact — matching
// dispatch #165's/#172's own reconciliation-test style.

import { describe, it, expect } from 'vitest';
import { metricDaily } from '../engine/metric-source.js';

const d = s => new Date(s + 'T00:00:00');

describe('dispatch #175 — cashOSAmt auto-first over email', () => {
  it('opsCashRows wins over glimpseRows/cashRows for the same (loc, date)', () => {
    const ds = {
      glimpseRows: [{ loc: '1', date: d('2026-08-20'), cashOS: 12.34 }],   // email — must NOT win
      cashRows:    [{ loc: '1', date: d('2026-08-20'), cashOS: 56.78 }],   // email — must NOT win
      opsCashRows: [{ loc: '1', date: d('2026-08-20'), cashOSAmt: -3.5 }], // auto — wins
    };
    expect(metricDaily(ds, '1', d('2026-08-20'), 'cashOSAmt')).toBe(-3.5);
  });

  it('falls back to email (glimpse then cash) for a day opsCashRows does not cover', () => {
    const ds = {
      opsCashRows: [{ loc: '1', date: d('2026-08-19'), cashOSAmt: -3.5 }],
      glimpseRows: [{ loc: '1', date: d('2026-08-20'), cashOS: 12.34 }],
      cashRows:    [{ loc: '1', date: d('2026-08-21'), cashOS: 56.78 }],
    };
    expect(metricDaily(ds, '1', d('2026-08-20'), 'cashOSAmt')).toBe(12.34);
    expect(metricDaily(ds, '1', d('2026-08-21'), 'cashOSAmt')).toBe(56.78);
  });

  it('falls back to manual ctrlRows only when neither auto nor email cover the day', () => {
    const ds = { ctrlRows: [{ loc: '1', date: d('2026-08-22'), cashOSAmt: 1.11 }] };
    expect(metricDaily(ds, '1', d('2026-08-22'), 'cashOSAmt')).toBe(1.11);
  });

  it('per-day precedence, not all-or-nothing: opsCashRows and glimpseRows can each win on different days in the same ds', () => {
    const ds = {
      opsCashRows: [{ loc: '1', date: d('2026-08-20'), cashOSAmt: -3.5 }],
      glimpseRows: [
        { loc: '1', date: d('2026-08-20'), cashOS: 999 },   // opsCashRows covers this day — must lose
        { loc: '1', date: d('2026-08-21'), cashOS: 12.34 }, // opsCashRows does NOT cover this day — wins
      ],
    };
    expect(metricDaily(ds, '1', d('2026-08-20'), 'cashOSAmt')).toBe(-3.5);
    expect(metricDaily(ds, '1', d('2026-08-21'), 'cashOSAmt')).toBe(12.34);
  });

  it("'any' mode still keeps a genuine 0 or negative opsCashRows value", () => {
    const ds = { opsCashRows: [{ loc: '1', date: d('2026-08-20'), cashOSAmt: 0 }] };
    expect(metricDaily(ds, '1', d('2026-08-20'), 'cashOSAmt')).toBe(0);
  });
});

describe('dispatch #175 — posOverAmt/posOverCnt auto-first over email', () => {
  it('opsCashRows wins over glimpseRows/cashRows for the same (loc, date)', () => {
    const ds = {
      glimpseRows: [{ loc: '1', date: d('2026-08-20'), posOverAmt: 40, posOverCnt: 4 }], // email — must NOT win
      cashRows:    [{ loc: '1', date: d('2026-08-20'), posOverAmt: 41, posOverCnt: 5 }], // email — must NOT win
      opsCashRows: [{ loc: '1', date: d('2026-08-20'), posOverAmt: 12.5, posOverCnt: 2 }], // auto — wins
    };
    expect(metricDaily(ds, '1', d('2026-08-20'), 'posOverAmt')).toBe(12.5);
    expect(metricDaily(ds, '1', d('2026-08-20'), 'posOverCnt')).toBe(2);
  });

  it('falls back to email (glimpse then cash) for a day opsCashRows does not cover', () => {
    const ds = {
      opsCashRows: [{ loc: '1', date: d('2026-08-19'), posOverAmt: 12.5, posOverCnt: 2 }],
      glimpseRows: [{ loc: '1', date: d('2026-08-20'), posOverAmt: 40, posOverCnt: 4 }],
      cashRows:    [{ loc: '1', date: d('2026-08-21'), posOverAmt: 41, posOverCnt: 5 }],
    };
    expect(metricDaily(ds, '1', d('2026-08-20'), 'posOverAmt')).toBe(40);
    expect(metricDaily(ds, '1', d('2026-08-20'), 'posOverCnt')).toBe(4);
    expect(metricDaily(ds, '1', d('2026-08-21'), 'posOverAmt')).toBe(41);
    expect(metricDaily(ds, '1', d('2026-08-21'), 'posOverCnt')).toBe(5);
  });

  it('falls back to manual ctrlRows only when neither auto nor email cover the day (parseCtrlData does emit this field)', () => {
    const ds = { ctrlRows: [{ loc: '1', date: d('2026-08-22'), posOverAmt: 7, posOverCnt: 1 }] };
    expect(metricDaily(ds, '1', d('2026-08-22'), 'posOverAmt')).toBe(7);
    expect(metricDaily(ds, '1', d('2026-08-22'), 'posOverCnt')).toBe(1);
  });

  it('per-day precedence, not all-or-nothing', () => {
    const ds = {
      opsCashRows: [{ loc: '1', date: d('2026-08-20'), posOverAmt: 12.5, posOverCnt: 2 }],
      glimpseRows: [
        { loc: '1', date: d('2026-08-20'), posOverAmt: 999, posOverCnt: 99 }, // opsCashRows covers — must lose
        { loc: '1', date: d('2026-08-21'), posOverAmt: 40, posOverCnt: 4 },   // opsCashRows doesn't cover — wins
      ],
    };
    expect(metricDaily(ds, '1', d('2026-08-20'), 'posOverAmt')).toBe(12.5);
    expect(metricDaily(ds, '1', d('2026-08-21'), 'posOverAmt')).toBe(40);
  });

  it("'any' mode still keeps a genuine 0 opsCashRows value", () => {
    const ds = { opsCashRows: [{ loc: '1', date: d('2026-08-20'), posOverAmt: 0, posOverCnt: 0 }] };
    expect(metricDaily(ds, '1', d('2026-08-20'), 'posOverAmt')).toBe(0);
    expect(metricDaily(ds, '1', d('2026-08-20'), 'posOverCnt')).toBe(0);
  });
});

describe('dispatch #175 — regression: email-only device (no opsCashRows at all)', () => {
  // #271's original bug class: a device that has never had opsCashRows populated (e.g. the
  // auto pull hasn't reached it, or offline cache is stale) must still resolve both metrics
  // exactly as before this dispatch, purely from the emailed/manual sources.
  it('cashOSAmt resolves unchanged from glimpseRows/cashRows/ctrlRows with no opsCashRows present', () => {
    const dsGlimpse = { glimpseRows: [{ loc: '1', date: d('2026-08-20'), cashOS: 12.34 }] };
    expect(metricDaily(dsGlimpse, '1', d('2026-08-20'), 'cashOSAmt')).toBe(12.34);

    const dsCash = { cashRows: [{ loc: '1', date: d('2026-08-20'), cashOS: 56.78 }] };
    expect(metricDaily(dsCash, '1', d('2026-08-20'), 'cashOSAmt')).toBe(56.78);

    const dsCtrl = { ctrlRows: [{ loc: '1', date: d('2026-08-20'), cashOSAmt: 1.11 }] };
    expect(metricDaily(dsCtrl, '1', d('2026-08-20'), 'cashOSAmt')).toBe(1.11);

    // Glimpse still beats Cash Sheet on an email-only device (unchanged relative order).
    const dsBothEmail = {
      glimpseRows: [{ loc: '1', date: d('2026-08-20'), cashOS: 12.34 }],
      cashRows:    [{ loc: '1', date: d('2026-08-20'), cashOS: 56.78 }],
    };
    expect(metricDaily(dsBothEmail, '1', d('2026-08-20'), 'cashOSAmt')).toBe(12.34);
  });

  it('posOverAmt/posOverCnt resolve unchanged from glimpseRows/cashRows/ctrlRows with no opsCashRows present', () => {
    const dsGlimpse = { glimpseRows: [{ loc: '1', date: d('2026-08-20'), posOverAmt: 40, posOverCnt: 4 }] };
    expect(metricDaily(dsGlimpse, '1', d('2026-08-20'), 'posOverAmt')).toBe(40);
    expect(metricDaily(dsGlimpse, '1', d('2026-08-20'), 'posOverCnt')).toBe(4);

    const dsCash = { cashRows: [{ loc: '1', date: d('2026-08-20'), posOverAmt: 41, posOverCnt: 5 }] };
    expect(metricDaily(dsCash, '1', d('2026-08-20'), 'posOverAmt')).toBe(41);

    const dsCtrl = { ctrlRows: [{ loc: '1', date: d('2026-08-20'), posOverAmt: 7, posOverCnt: 1 }] };
    expect(metricDaily(dsCtrl, '1', d('2026-08-20'), 'posOverAmt')).toBe(7);

    // Glimpse still beats Cash Sheet on an email-only device (unchanged relative order).
    const dsBothEmail = {
      glimpseRows: [{ loc: '1', date: d('2026-08-20'), posOverAmt: 40, posOverCnt: 4 }],
      cashRows:    [{ loc: '1', date: d('2026-08-20'), posOverAmt: 41, posOverCnt: 5 }],
    };
    expect(metricDaily(dsBothEmail, '1', d('2026-08-20'), 'posOverAmt')).toBe(40);
  });
});
