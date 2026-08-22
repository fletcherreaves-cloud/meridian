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
// lookupMissEvent is exported and already async; this calls it directly (no React) with a
// realistic affectedStores loc, matching the real call site's shape, and confirms the returned
// promise resolves rather than rejecting on the ReferenceError.
import { describe, it, expect, vi } from 'vitest';
import { lookupMissEvent } from '../engine/why.js';

describe('lookupMissEvent resolves without a free `loc` reference (dispatch #72 C1)', () => {
  it('does not reject, and falls back to the no-API-key search path', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => {});
    let result = null;
    const setResult = r => { result = r; };

    await expect(
      lookupMissEvent(new Date('2026-03-10T12:00:00'), '10422', null, setResult, [])
    ).resolves.toBeUndefined();

    expect(openSpy).toHaveBeenCalled();
    expect(result).toBeTruthy();
    expect(result.error).toContain('No Anthropic API key');
    openSpy.mockRestore();
  });
});
