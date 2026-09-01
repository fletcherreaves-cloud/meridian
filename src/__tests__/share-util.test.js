// @ts-nocheck
// CI FAILURE, root-caused 2026-09-01: this file was written and locally verified in a sandbox
// running Node 22, which ships a built-in global `navigator` object -- so the top-level
// `navigator.share`/`navigator.clipboard` reads below worked there even under this suite's
// default `environment: 'node'` (vite.config.ts), with no real navigator mocked in at all. CI
// runs Node 20 (see CLAUDE.md's own "Node 20 vs 22" warning), which has no such global --
// `navigator` is undefined there under plain `node`, so the whole file threw
// `ReferenceError: navigator is not defined` before a single test ran.
// First fix attempt pinned this file to happy-dom (matching the two real-render suites' own
// convention), but that broke 7/13 tests here: happy-dom's `navigator.clipboard` is a real,
// non-configurable getter-only Clipboard object, so `navigator.clipboard = {...}` / `= undefined`
// below throws `TypeError: Cannot set property clipboard of [object Object] which has only a
// getter`. This file's tests were written and validated against a plain, freely-mutable
// navigator object (Node 22's built-in), so the actual fix is to guarantee that same shape
// exists on Node 20 too, rather than switching environments: polyfill a bare plain object only
// when `navigator` is undefined (Node 20/plain `node` env), leaving Node 22's existing built-in
// untouched (guard is a no-op there).
if (typeof navigator === 'undefined') {
  globalThis.navigator = {};
}
//
// src/utils/share.js — the shared shareOrCopy() helper behind the native OS Share sheet
// (Web Share API) backlog item, brought to life 2026-09-01. This is the one piece of the
// feature that CAN be meaningfully unit-tested: the real OS share sheet itself can't be
// asserted against in a headless test, so these mock navigator.share/navigator.clipboard and
// check the helper picks the right path and returns the right {method, ok, cancelled} shape.
// The per-call-site wiring (status text, fallback NOT firing on the real button) is covered by
// native-share-count-cycle.test.js and native-share-eom-dashboard.test.js — real-render tests
// per this repo's "would this verification still pass if reverted?" standing rule, since a test
// that only imports this helper can't tell "wired in" from "wired in but unused".
import { describe, it, expect, afterEach, vi } from 'vitest';
import { shareOrCopy } from '../utils/share.js';

function restoreNavigator(orig) {
  navigator.share = orig.share;
  navigator.canShare = orig.canShare;
  navigator.clipboard = orig.clipboard;
}

describe('shareOrCopy', () => {
  const orig = { share: navigator.share, canShare: navigator.canShare, clipboard: navigator.clipboard };
  afterEach(() => restoreNavigator(orig));

  it('(a) calls navigator.share with {url,title,text} when it exists, and never touches clipboard', async () => {
    const share = vi.fn(async () => {});
    const writeText = vi.fn(async () => {});
    navigator.share = share;
    navigator.clipboard = { writeText };

    const result = await shareOrCopy({ url: 'https://example.com/x', title: 'T', text: 'Body' });

    expect(share).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledWith({ title: 'T', text: 'Body', url: 'https://example.com/x' });
    expect(writeText).not.toHaveBeenCalled();
    expect(result).toEqual({ method: 'share', ok: true, cancelled: false });
  });

  it('(b) an AbortError (user cancelled the OS sheet) is not an error and does not fall back to clipboard', async () => {
    const abortErr = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    const share = vi.fn(async () => { throw abortErr; });
    const writeText = vi.fn(async () => {});
    navigator.share = share;
    navigator.clipboard = { writeText };

    const result = await shareOrCopy({ url: 'https://example.com/x' });

    expect(share).toHaveBeenCalledTimes(1);
    expect(writeText).not.toHaveBeenCalled();
    expect(result).toEqual({ method: 'share', ok: false, cancelled: true });
  });

  it('(c) falls back to navigator.clipboard.writeText(url) exactly as before when navigator.share does not exist', async () => {
    const writeText = vi.fn(async () => {});
    navigator.share = undefined;
    navigator.clipboard = { writeText };

    const result = await shareOrCopy({ url: 'https://example.com/x', title: 'T' });

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith('https://example.com/x');
    expect(result).toEqual({ method: 'clipboard', ok: true, cancelled: false });
  });

  it('a non-abort navigator.share() failure (e.g. no registered handler) still falls back to clipboard', async () => {
    const share = vi.fn(async () => { throw new Error('no handler'); });
    const writeText = vi.fn(async () => {});
    navigator.share = share;
    navigator.clipboard = { writeText };

    const result = await shareOrCopy({ url: 'https://example.com/x' });

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ method: 'clipboard', ok: true, cancelled: false });
  });

  it('respects navigator.canShare() when present, skipping straight to clipboard on a rejected payload', async () => {
    const share = vi.fn(async () => {});
    const canShare = vi.fn(() => false);
    const writeText = vi.fn(async () => {});
    navigator.share = share;
    navigator.canShare = canShare;
    navigator.clipboard = { writeText };

    const result = await shareOrCopy({ url: 'https://example.com/x' });

    expect(canShare).toHaveBeenCalledTimes(1);
    expect(share).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ method: 'clipboard', ok: true, cancelled: false });
  });

  it('a failed clipboard fallback (permission denied) reports ok:false rather than throwing', async () => {
    navigator.share = undefined;
    navigator.clipboard = { writeText: vi.fn(async () => { throw new Error('denied'); }) };

    const result = await shareOrCopy({ url: 'https://example.com/x' });
    expect(result).toEqual({ method: 'clipboard', ok: false, cancelled: false });
  });

  it('no navigator.share and no navigator.clipboard at all reports method:none rather than throwing', async () => {
    navigator.share = undefined;
    navigator.clipboard = undefined;

    const result = await shareOrCopy({ url: 'https://example.com/x' });
    expect(result).toEqual({ method: 'none', ok: false, cancelled: false });
  });
});
