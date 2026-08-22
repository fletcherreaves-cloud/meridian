// @ts-nocheck
// Dispatch #71 -- Form Completions panel showed "no data synced" because the pull silently
// no-op'd: forms.home.myqsrsoft.com's auth shape was ASSUMED (never confirmed) to match
// api.reports.myqsrsoft.com, but if it instead returns 200 + [] for a denied token-only request
// (rather than 401/403), the direct path's fallback trigger -- runDirect() throwing AUTH_FAILED --
// can never fire. Zero rows across every chunk of a window independently confirmed (by hand, and
// in the owner's Completion_Details.xlsx) to hold thousands of real rows is never a genuine
// outcome for this estate (27 active stores on QSRSoft Forms daily), so pullWithEscalation()
// retries via Playwright before trusting a direct-path zero.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { pullWithEscalation, fetchWindow, dedupeByConflictKey } from '../../scripts/qsrsoft-forms-completion-pull.mjs';

const chunks = [{ start: '2026-08-19', end: '2026-08-21' }];
const tracker = { fail: vi.fn() };

describe('pullWithEscalation (dispatch #71)', () => {
  it('does NOT call Playwright when the direct path already saved rows', async () => {
    const runDirectFn = vi.fn().mockResolvedValue({ grand: 42, coveredLocs: new Set(['3708']) });
    const viaPlaywrightFn = vi.fn();
    const r = await pullWithEscalation(chunks, tracker, { runDirectFn, viaPlaywrightFn });
    expect(r.grand).toBe(42);
    expect(viaPlaywrightFn).not.toHaveBeenCalled();
  });

  it('escalates to Playwright when the direct path saves exactly 0 rows, and uses its result', async () => {
    // The exact failure mode this dispatch fixes: a 200-with-empty-array direct-path "success"
    // (grand: 0, no thrown AUTH_FAILED) that was previously indistinguishable from a genuinely
    // quiet period.
    const runDirectFn = vi.fn().mockResolvedValue({ grand: 0, coveredLocs: new Set() });
    const viaPlaywrightFn = vi.fn().mockResolvedValue({ grand: 4714, coveredLocs: new Set(['3708', '5183']) });
    const r = await pullWithEscalation(chunks, tracker, { runDirectFn, viaPlaywrightFn });
    expect(viaPlaywrightFn).toHaveBeenCalledTimes(1);
    expect(viaPlaywrightFn).toHaveBeenCalledWith(chunks, tracker);
    expect(r.grand).toBe(4714);
    expect(r.coveredLocs).toEqual(new Set(['3708', '5183']));
  });

  it('still escalates on thrown AUTH_FAILED (the pre-existing 401/403 path), unchanged', async () => {
    const runDirectFn = vi.fn().mockRejectedValue(new Error('AUTH_FAILED:403'));
    const viaPlaywrightFn = vi.fn().mockResolvedValue({ grand: 10, coveredLocs: new Set(['3708']) });
    const r = await pullWithEscalation(chunks, tracker, { runDirectFn, viaPlaywrightFn });
    expect(viaPlaywrightFn).toHaveBeenCalledTimes(1);
    expect(r.grand).toBe(10);
  });

  it('reports the direct path\'s (still zero) result when Playwright ALSO returns nothing -- a genuinely quiet period is not masked as an error', async () => {
    const runDirectFn = vi.fn().mockResolvedValue({ grand: 0, coveredLocs: new Set() });
    const viaPlaywrightFn = vi.fn().mockResolvedValue({ grand: 0, coveredLocs: new Set() });
    const r = await pullWithEscalation(chunks, tracker, { runDirectFn, viaPlaywrightFn });
    expect(viaPlaywrightFn).toHaveBeenCalledTimes(1);
    expect(r.grand).toBe(0);
  });
});

// The actual root cause, found only after the auth-denial hypothesis above was measured and
// refuted on a live run (a genuinely valid, freshly Playwright-captured token still got 0 rows):
// completionDetail wraps its rows under `results` (plural). `parsed?.result || []` (singular) read
// a key that never existed, so every response -- auth good or bad, direct or Playwright -- silently
// parsed to an empty array. This is the bug pullWithEscalation could never have caught: the
// direct path and the Playwright fallback share this same parser, so escalating just asked the
// same wrong-key bug twice.
describe('fetchWindow response parsing (dispatch #71 root cause)', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('reads rows from the real API shape -- {"results": [...]} -- not an empty array', async () => {
    const row = { formTitle: 'Breakfast Pre-Shift', location: '10034', status: 'MISSED', missed: true };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      text: async () => JSON.stringify({ results: [row] }),
      json: async () => ({ results: [row] }),
    }));
    const rows = await fetchWindow('faketoken', '2026-08-19', '2026-08-21', null);
    expect(rows).toEqual([row]);
  });

  it('still returns [] for a genuinely empty {"results": []} response -- not every empty parse was this bug', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      text: async () => JSON.stringify({ results: [] }),
      json: async () => ({ results: [] }),
    }));
    const rows = await fetchWindow('faketoken', '2026-08-19', '2026-08-21', null);
    expect(rows).toEqual([]);
  });
});

// Found immediately after the `results`-key fix, on the first live run against real data: Postgres
// rejects an upsert batch containing two rows for the same conflict target ("ON CONFLICT DO UPDATE
// command cannot affect row a second time"). Travel Path alone is scheduled 27-45x/store/day and
// ad-hoc (scheduledAt-null) rows key on completedOn instead, so two distinct API rows landing on
// the same (loc, formId, occurrenceKey) within one pull window is expected, not corrupt data.
describe('dedupeByConflictKey (dispatch #71 -- ON CONFLICT batch collision)', () => {
  it('collapses two rows sharing (loc, form_id, occurrence_key), keeping the last', () => {
    const a = { loc: '3708', form_id: 'f1', occurrence_key: '2026-08-19T11:00:00Z', missed: true };
    const b = { loc: '3708', form_id: 'f1', occurrence_key: '2026-08-19T11:00:00Z', missed: false };
    const rows = dedupeByConflictKey([a, b]);
    expect(rows).toEqual([b]);
  });

  it('leaves distinct keys (different loc, form, or occurrence) untouched', () => {
    const rows = [
      { loc: '3708', form_id: 'f1', occurrence_key: '2026-08-19T11:00:00Z' },
      { loc: '5183', form_id: 'f1', occurrence_key: '2026-08-19T11:00:00Z' },
      { loc: '3708', form_id: 'f2', occurrence_key: '2026-08-19T11:00:00Z' },
      { loc: '3708', form_id: 'f1', occurrence_key: '2026-08-20T11:00:00Z' },
    ];
    expect(dedupeByConflictKey(rows)).toEqual(rows);
  });

  // The gap the first version of this dedup left: a live run collapsed 1840+612 same-batch
  // duplicates and the SAME ON CONFLICT error fired again immediately after. occurrence_key is a
  // `timestamptz` column -- Postgres compares the cast instant, not the source string -- so two
  // rows whose occurrence_key strings differ only in sub-second precision are ONE conflict target
  // to the database but were two distinct Map keys under plain string equality.
  it('collapses two rows whose occurrence_key strings differ only in precision but are the same instant', () => {
    const a = { loc: '3708', form_id: 'f1', occurrence_key: '2026-08-19T11:00:00Z' };
    const b = { loc: '3708', form_id: 'f1', occurrence_key: '2026-08-19T11:00:00.000Z' };
    expect(dedupeByConflictKey([a, b])).toEqual([b]);
  });

  it('collapses two rows whose form_id differs only in UUID case', () => {
    const a = { loc: '3708', form_id: '03B62C8F-709C-4B11-AB90-5FFAA03FA989', occurrence_key: '2026-08-19T11:00:00Z' };
    const b = { loc: '3708', form_id: '03b62c8f-709c-4b11-ab90-5ffaa03fa989', occurrence_key: '2026-08-19T11:00:00Z' };
    expect(dedupeByConflictKey([a, b])).toEqual([b]);
  });
});
