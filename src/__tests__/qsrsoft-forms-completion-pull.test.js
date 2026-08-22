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
import { pullWithEscalation, fetchWindow } from '../../scripts/qsrsoft-forms-completion-pull.mjs';

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
