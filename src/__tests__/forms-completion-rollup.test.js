// @ts-nocheck
// Forms dashboard Slice 2 -- store-day rollup tests. Operates on already-normalized rows
// (normalizeFormsCompletionRow's own output shape), so fixtures here are plain camelCase objects,
// not raw API payloads -- no PII surface at all, since completedBy/plaintext names never survive
// normalization in the first place (see forms-completion.test.js for that guarantee).
import { describe, it, expect } from 'vitest';
import { computeFormStoreDayRollup, computeFormSummary } from '../engine/forms-completion.js';

const FORM_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const FORM_B = 'aaaaaaaa-0000-4000-8000-000000000002';

// A row at this occurrenceKey, with a given statusState. Store '0006178', local day 2026-08-19
// (05:00Z on the 19th is local midnight CDT -> everything from 2026-08-19T05:00:00Z through
// 2026-08-20T04:59:59Z buckets into '2026-08-19').
function row(formId, occurrenceKey, statusState, formTitle = 'Breakfast Pre-Shift') {
  return { loc: '0006178', formId, formTitle, occurrenceKey, statusState };
}

describe('computeFormStoreDayRollup', () => {
  it('judges only RESOLVED occurrences -- "open" rows are excluded from both numerator and denominator', () => {
    const rows = [
      row(FORM_A, '2026-08-19T11:00:00Z', 'completed'),
      row(FORM_A, '2026-08-19T12:00:00Z', 'open'), // still due -- must not count as unresolved-and-failing
      row(FORM_A, '2026-08-19T13:00:00Z', 'missed'),
    ];
    const out = computeFormStoreDayRollup(rows);
    expect(out).toHaveLength(1);
    expect(out[0].resolvedCount).toBe(2); // NOT 3 -- the open row is excluded entirely
    expect(out[0].completedCount).toBe(1);
    expect(out[0].passRate).toBeCloseTo(0.5, 10);
  });

  it('a store-day with ALL occurrences still open produces NO rollup row at all -- not a spurious 0/0', () => {
    const rows = [row(FORM_A, '2026-08-19T11:00:00Z', 'open')];
    expect(computeFormStoreDayRollup(rows)).toEqual([]);
  });

  it('defaults every form to an 80% threshold when no per-form override is supplied', () => {
    const rows = [
      row(FORM_A, '2026-08-19T11:00:00Z', 'completed'),
      row(FORM_A, '2026-08-19T12:00:00Z', 'completed'),
      row(FORM_A, '2026-08-19T13:00:00Z', 'completed'),
      row(FORM_A, '2026-08-19T14:00:00Z', 'missed'), // 3/4 = 75% -- fails an 80% bar
    ];
    const out = computeFormStoreDayRollup(rows);
    expect(out[0].threshold).toBe(0.8);
    expect(out[0].passRate).toBeCloseTo(0.75, 10);
    expect(out[0].pass).toBe(false);
  });

  it('honors a per-form threshold override -- the whole point of the "per-form, not global" design', () => {
    const rows = [
      row(FORM_A, '2026-08-19T11:00:00Z', 'completed'),
      row(FORM_A, '2026-08-19T12:00:00Z', 'completed'),
      row(FORM_A, '2026-08-19T13:00:00Z', 'completed'),
      row(FORM_A, '2026-08-19T14:00:00Z', 'missed'), // 75%
    ];
    const out = computeFormStoreDayRollup(rows, { thresholds: { [FORM_A]: 0.7 } });
    expect(out[0].threshold).toBe(0.7);
    expect(out[0].pass).toBe(true); // 75% clears a 70% bar, would fail the 80% default
  });

  it('buckets by the LOCAL MIDNIGHT (UTC-5) boundary the API itself uses, not raw UTC calendar days', () => {
    const rows = [
      row(FORM_A, '2026-08-19T04:59:59Z', 'completed'), // one second before local midnight -> still the 18th
      row(FORM_A, '2026-08-19T05:00:01Z', 'completed'), // one second after -> the 19th
    ];
    const out = computeFormStoreDayRollup(rows);
    expect(out.map(g => g.day).sort()).toEqual(['2026-08-18', '2026-08-19']);
  });

  it('rolls up independently per (loc, formId, day) -- different forms and stores never mix', () => {
    const rows = [
      row(FORM_A, '2026-08-19T11:00:00Z', 'completed', 'Breakfast Pre-Shift'),
      { ...row(FORM_B, '2026-08-19T11:00:00Z', 'missed', 'Travel Path'), loc: '0006178' },
      { ...row(FORM_A, '2026-08-19T11:00:00Z', 'missed', 'Breakfast Pre-Shift'), loc: '0037566' },
    ];
    const out = computeFormStoreDayRollup(rows);
    expect(out).toHaveLength(3);
  });

  it('empty or missing input returns an empty array, not a crash', () => {
    expect(computeFormStoreDayRollup([])).toEqual([]);
    expect(computeFormStoreDayRollup(null)).toEqual([]);
    expect(computeFormStoreDayRollup(undefined)).toEqual([]);
  });
});

describe('computeFormSummary', () => {
  it('aggregates Σcompleted/Σresolved across store-days -- NEVER a mean of the individual rates (never-average-averages)', () => {
    // Store 1: 1/1 resolved, completed (100%). Store 2: 1/40 resolved, completed (2.5%).
    // A mean-of-rates summary would read (100%+2.5%)/2 = 51.25%; the correct weighted answer
    // sums numerator and denominator first: 2/41 = 4.9%.
    const rollup = [
      { formId: FORM_A, formTitle: 'Breakfast Pre-Shift', threshold: 0.8, loc: '0006178', day: '2026-08-19', resolvedCount: 1, completedCount: 1, passRate: 1, pass: true },
      { formId: FORM_A, formTitle: 'Breakfast Pre-Shift', threshold: 0.8, loc: '0037566', day: '2026-08-19', resolvedCount: 40, completedCount: 1, passRate: 0.025, pass: false },
    ];
    const out = computeFormSummary(rollup);
    expect(out).toHaveLength(1);
    expect(out[0].resolvedCount).toBe(41);
    expect(out[0].completedCount).toBe(2);
    expect(out[0].passRate).toBeCloseTo(2 / 41, 10);
    expect(out[0].passRate).not.toBeCloseTo(0.5125, 2); // the wrong, mean-of-rates answer
  });

  it('storeDaysPassRate is a DIFFERENT reading from passRate, and both are reported', () => {
    // Two store-days that individually pass an 80% threshold (100% and 90%), but the aggregate
    // is dragged down by a third store-day with a huge denominator and a low rate.
    const rollup = [
      { formId: FORM_A, formTitle: 'X', threshold: 0.8, loc: '0006178', day: '2026-08-19', resolvedCount: 1, completedCount: 1, passRate: 1, pass: true },
      { formId: FORM_A, formTitle: 'X', threshold: 0.8, loc: '0037566', day: '2026-08-19', resolvedCount: 10, completedCount: 9, passRate: 0.9, pass: true },
      { formId: FORM_A, formTitle: 'X', threshold: 0.8, loc: '0020475', day: '2026-08-19', resolvedCount: 100, completedCount: 10, passRate: 0.1, pass: false },
    ];
    const out = computeFormSummary(rollup);
    expect(out[0].storeDaysTotal).toBe(3);
    expect(out[0].storeDaysPassed).toBe(2);
    expect(out[0].storeDaysPassRate).toBeCloseTo(2 / 3, 10);
    expect(out[0].passRate).toBeCloseTo(20 / 111, 10); // a very different number from 2/3
  });

  it('sorts worst-performing form first -- the number that actually names a decision', () => {
    const rollup = [
      { formId: FORM_A, formTitle: 'Good Form', threshold: 0.8, loc: '0006178', day: '2026-08-19', resolvedCount: 10, completedCount: 9, passRate: 0.9, pass: true },
      { formId: FORM_B, formTitle: 'Bad Form', threshold: 0.8, loc: '0006178', day: '2026-08-19', resolvedCount: 10, completedCount: 1, passRate: 0.1, pass: false },
    ];
    const out = computeFormSummary(rollup);
    expect(out.map(f => f.formId)).toEqual([FORM_B, FORM_A]);
  });

  it('empty or missing input returns an empty array, not a crash', () => {
    expect(computeFormSummary([])).toEqual([]);
    expect(computeFormSummary(null)).toEqual([]);
    expect(computeFormSummary(undefined)).toEqual([]);
  });
});
