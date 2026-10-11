// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #72 C1 -- src/engine/why.js's async lookupMissEvent read a bare `loc` at three
// spots (thisCoord, and firstLoc's/storeCoords' fallback) without `loc` ever being one of its
// parameters (date, affectedStores, wRow, setResult, affectedLocs). Because the function is
// `async`, the synchronous ReferenceError doesn't throw at the call site -- it turns the
// returned promise into a silent rejection, which store-dash.js's fire-and-forget
// onClick:()=>lookupMissEvent(...) never awaits or catches, so the AI Lookup button did
// nothing and logged an unhandled rejection instead.
//
// Read the caller (store-dash.js:746) before fixing: it passes its own `loc` positionally as
// the SECOND argument, `affectedStores` -- and the function already derived the identical value
// from `affectedStores` a few lines further down as `firstLoc` (itself falling back to the
// same nonexistent `loc`). The fix computes that value once, at the top, from `affectedStores`
// -- not by adding a new parameter no caller would populate.
//
// UPDATED 2026-10-11 (SAGE web-search migration): this test used to assert the old
// no-personal-API-key fallback (window.open + "No Anthropic API key" error) -- that path no
// longer exists now that lookupMissEvent routes through sage-chat's callSageOnce instead of a
// direct api.anthropic.com call. Re-pointed at the real current behavior (mocking only the
// network boundary, per this repo's "would this verification still pass if reverted" rule) so
// it still proves the same thing dispatch #72 C1 cared about: the promise resolves rather than
// rejecting on a free `loc` reference.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/sage-client.js', () => ({
  callSageOnce: vi.fn(),
}));

describe('lookupMissEvent resolves without a free `loc` reference (dispatch #72 C1)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('does not reject, and calls callSageOnce (not a free `loc` reference crashing it)', async () => {
    const { callSageOnce } = await import('../lib/sage-client.js');
    callSageOnce.mockResolvedValue('Nothing notable found near this store on that date.');
    const { lookupMissEvent } = await import('../engine/why.js');

    let result = null;
    const setResult = r => { result = r; };

    await expect(
      lookupMissEvent(new Date('2026-03-10T12:00:00'), '10422', null, setResult, [])
    ).resolves.toBeUndefined();

    expect(callSageOnce).toHaveBeenCalledTimes(1);
    expect(result).toBeTruthy();
    expect(result.error).toBeNull();
    expect(result.text).toBe('Nothing notable found near this store on that date.');
  });
});
