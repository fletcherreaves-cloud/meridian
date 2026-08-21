// @ts-nocheck
// Forms dashboard Slice 1 -- normalizer tests.
//
// ⚠️ HARD CONSTRAINT: every fixture below is SYNTHETIC. None of it is copied from the real
// captured completionDetail response (memory/finding-qsrsoft-forms-completion-endpoint-2026-08-21.md)
// -- that response carries plaintext employee names, and nothing from it belongs in a test file.
// Names here ("Fixture Employee") and UUIDs are made up for this test only. The one place a real
// captured NUMBER is echoed is the illustrative 93/94 completion ratio (0.9893617021276596), which
// is a public arithmetic fact already published in the finding file, not PII.
import { describe, it, expect } from 'vitest';
import { normalizeFormsCompletionRow, normalizeFormsCompletionRows } from '../engine/forms-completion.js';

const MISSED_ROW = {
  formTitle: 'Breakfast Pre-Shift', formId: 'aaaaaaaa-0000-4000-8000-000000000001', location: '6178',
  status: 'MISSED', missed: true, hasResponse: false,
  scheduledAt: '2026-08-19T11:00:00Z',
};

const OPEN_ROW = {
  formTitle: 'Lunch Pre-Shift', formId: 'aaaaaaaa-0000-4000-8000-000000000002', location: '6178',
  status: '--', missed: false, hasResponse: false,
  scheduledAt: '2026-08-21T17:00:00Z',
};

const COMPLETED_ROW = {
  formTitle: 'Breakfast Pre-Shift ', formId: 'aaaaaaaa-0000-4000-8000-000000000001', location: '37566',
  status: 0.9893617021276596, missed: false, hasResponse: true,
  scheduledAt: '2026-08-19T11:00:00Z',
  startedAt: '2026-08-19T10:09:24.638Z', completedOn: '2026-08-19T10:16:49.097Z',
  timeToComplete: 444444,
  completedBy: 'Fixture Employee', // synthetic -- see file header
  userId: 'bbbbbbbb-1111-4111-8111-111111111111',
  score: null, reviewedWith: 'N/A',
  assignedTo: [{ name: 'General Manager', type: 'group' }],
};

const AD_HOC_ROW = {
  formTitle: 'Red Bull Tracking', formId: 'aaaaaaaa-0000-4000-8000-000000000003', location: '20475',
  status: 1, missed: false, hasResponse: true,
  scheduledAt: null,
  startedAt: '2026-08-20T15:00:00.000Z', completedOn: '2026-08-20T15:02:00.000Z',
  timeToComplete: 120000,
  completedBy: 'Another Fixture Person', userId: 'bbbbbbbb-2222-4222-8222-222222222222',
  score: null, reviewedWith: 'N/A', assignedTo: [],
};

describe('normalizeFormsCompletionRow — status is polymorphic, three states not two', () => {
  it('missed: string "MISSED", missed=true -> statusState "missed", no completion ratio', () => {
    const r = normalizeFormsCompletionRow(MISSED_ROW);
    expect(r.statusState).toBe('missed');
    expect(r.missed).toBe(true);
    expect(r.completionRatio).toBe(null);
  });

  it('"--" is STILL OPEN, not a miss -- the whole point of the three-state read', () => {
    const r = normalizeFormsCompletionRow(OPEN_ROW);
    expect(r.statusState).toBe('open');
    expect(r.missed).toBe(false);
    expect(r.hasResponse).toBe(false);
    expect(r.completionRatio).toBe(null);
  });

  it('a numeric status (0-1) with hasResponse=true -> "completed", ratio extracted exactly', () => {
    const r = normalizeFormsCompletionRow(COMPLETED_ROW);
    expect(r.statusState).toBe('completed');
    expect(r.completionRatio).toBeCloseTo(93 / 94, 10);
  });

  it('a numeric status stored as a string still parses (defensive -- API sends this field two ways already)', () => {
    const r = normalizeFormsCompletionRow({ ...COMPLETED_ROW, status: '0.5' });
    expect(r.statusState).toBe('completed');
    expect(r.completionRatio).toBe(0.5);
  });

  it('a non-numeric, non-"MISSED" status on a hasResponse row -> ratio null rather than NaN', () => {
    const r = normalizeFormsCompletionRow({ ...COMPLETED_ROW, status: 'garbage' });
    expect(r.statusState).toBe('completed');
    expect(r.completionRatio).toBe(null);
  });
});

describe('normalizeFormsCompletionRow — occurrence_key survives a null scheduledAt', () => {
  it('an ad-hoc completed row (scheduledAt null) keys on completedOn instead', () => {
    const r = normalizeFormsCompletionRow(AD_HOC_ROW);
    expect(r.scheduledAt).toBe(null);
    expect(r.occurrenceKey).toBe(AD_HOC_ROW.completedOn);
  });

  it('a normal scheduled row keys on scheduledAt', () => {
    const r = normalizeFormsCompletionRow(MISSED_ROW);
    expect(r.occurrenceKey).toBe(MISSED_ROW.scheduledAt);
  });

  it('neither scheduledAt nor completedOn present -> the row is dropped (null), not fabricated', () => {
    const malformed = { ...MISSED_ROW, scheduledAt: null };
    expect(normalizeFormsCompletionRow(malformed)).toBe(null);
  });
});

describe('normalizeFormsCompletionRow — fields present only on completed rows are nullable, not assumed', () => {
  it('a missed row has null completedBy-adjacent fields (startedAt/completedOn/userId/timeToCompleteMs)', () => {
    const r = normalizeFormsCompletionRow(MISSED_ROW);
    expect(r.startedAt).toBe(null);
    expect(r.completedOn).toBe(null);
    expect(r.userId).toBe(null);
    expect(r.timeToCompleteMs).toBe(null);
  });

  it('timeToComplete is passed through as milliseconds of ACTIVE time -- never derived from completedOn - startedAt', () => {
    const r = normalizeFormsCompletionRow(COMPLETED_ROW);
    expect(r.timeToCompleteMs).toBe(444444);
    // Sanity: this is deliberately NOT equal to (completedOn - startedAt) in this fixture, proving
    // the function reads timeToComplete verbatim rather than recomputing it.
    const wallClockMs = new Date(COMPLETED_ROW.completedOn) - new Date(COMPLETED_ROW.startedAt);
    expect(r.timeToCompleteMs).not.toBe(wallClockMs);
  });
});

describe('normalizeFormsCompletionRow — PII: completedBy never reaches the output', () => {
  it('the normalized row has no completedBy key at all', () => {
    const r = normalizeFormsCompletionRow(COMPLETED_ROW);
    expect(Object.prototype.hasOwnProperty.call(r, 'completedBy')).toBe(false);
  });

  it('the synthetic fixture name never appears anywhere in the serialized output', () => {
    const r = normalizeFormsCompletionRow(COMPLETED_ROW);
    expect(JSON.stringify(r)).not.toMatch(/Fixture Employee/);
  });

  it('userId (the stable QSRSoft person key) IS carried through -- the safe alternative to a name', () => {
    const r = normalizeFormsCompletionRow(COMPLETED_ROW);
    expect(r.userId).toBe('bbbbbbbb-1111-4111-8111-111111111111');
  });
});

describe('normalizeFormsCompletionRow — everything else', () => {
  it('loc is padded to 7 chars, matching every other QSRSoft-sourced table', () => {
    expect(normalizeFormsCompletionRow(MISSED_ROW).loc).toBe('0006178');
  });

  it('location "noLocation" (a real request member, 28/27 in the capture) normalizes to the NOLOC sentinel, never the garbage "0000NaN"', () => {
    const r = normalizeFormsCompletionRow({ ...MISSED_ROW, location: 'noLocation' });
    expect(r.loc).toBe('NOLOC');
    expect(r.loc).not.toMatch(/NaN/);
  });

  it('form_title is trimmed for display (dirty titles carry trailing spaces) but form_id is the real key', () => {
    const r = normalizeFormsCompletionRow(COMPLETED_ROW);
    expect(r.formTitle).toBe('Breakfast Pre-Shift');
    expect(r.formId).toBe('aaaaaaaa-0000-4000-8000-000000000001');
  });

  it('assignedTo defaults to an empty array when absent or malformed, never null', () => {
    expect(normalizeFormsCompletionRow({ ...MISSED_ROW, assignedTo: undefined }).assignedTo).toEqual([]);
    expect(normalizeFormsCompletionRow({ ...MISSED_ROW, assignedTo: 'not-an-array' }).assignedTo).toEqual([]);
  });

  it('assignedTo is preserved as role groups when present, never collapsed to a person', () => {
    const r = normalizeFormsCompletionRow(COMPLETED_ROW);
    expect(r.assignedTo).toEqual([{ name: 'General Manager', type: 'group' }]);
  });

  it('score/reviewedWith pass through as captured (currently always null / "N/A" estate-wide, but not hardcoded here)', () => {
    const r = normalizeFormsCompletionRow({ ...COMPLETED_ROW, score: 0.75, reviewedWith: 'Shift Manager' });
    expect(r.score).toBe(0.75);
    expect(r.reviewedWith).toBe('Shift Manager');
  });

  it('missing required fields (no formId, no location, no formTitle) -> dropped, not thrown', () => {
    expect(normalizeFormsCompletionRow({ ...MISSED_ROW, formId: undefined })).toBe(null);
    expect(normalizeFormsCompletionRow({ ...MISSED_ROW, location: undefined })).toBe(null);
    expect(normalizeFormsCompletionRow({ ...MISSED_ROW, formTitle: undefined })).toBe(null);
    expect(normalizeFormsCompletionRow(null)).toBe(null);
    expect(normalizeFormsCompletionRow(undefined)).toBe(null);
  });
});

describe('normalizeFormsCompletionRows — batch', () => {
  it('normalizes every usable row and drops unusable ones, preserving order', () => {
    const malformed = { ...MISSED_ROW, scheduledAt: null }; // undroppable key -- gets dropped
    const out = normalizeFormsCompletionRows([MISSED_ROW, malformed, OPEN_ROW, COMPLETED_ROW]);
    expect(out).toHaveLength(3);
    expect(out.map(r => r.statusState)).toEqual(['missed', 'open', 'completed']);
  });

  it('a non-array input returns an empty array rather than throwing', () => {
    expect(normalizeFormsCompletionRows(null)).toEqual([]);
    expect(normalizeFormsCompletionRows(undefined)).toEqual([]);
    expect(normalizeFormsCompletionRows('not an array')).toEqual([]);
  });

  it('no completedBy or plaintext name from any fixture leaks into a batch result', () => {
    const out = normalizeFormsCompletionRows([COMPLETED_ROW, AD_HOC_ROW]);
    const serialized = JSON.stringify(out);
    expect(serialized).not.toMatch(/Fixture Employee/);
    expect(serialized).not.toMatch(/Another Fixture Person/);
  });
});
