// @ts-nocheck
// src/utils/share.js's shareFileOrSave() — the file-sharing counterpart to shareOrCopy(), behind
// the app-wide "📸 Share" button on RoutePanelShell (owner request 2026-09-01: "include in the
// share menu the ability to share a screenshot"). Same Node 20/22 navigator guard as
// share-util.test.js (see that file's own comment for the full story) — this file also needs a
// bare ClipboardItem constructor polyfilled, since that global doesn't exist under plain `node`
// at all (browser-only), unlike navigator which Node 22 happens to ship.
if (typeof navigator === 'undefined') {
  globalThis.navigator = {};
}
if (typeof ClipboardItem === 'undefined') {
  globalThis.ClipboardItem = class ClipboardItem {
    constructor(items) { this.items = items; }
  };
}
import { describe, it, expect, afterEach, vi } from 'vitest';
import { shareFileOrSave } from '../utils/share.js';

const fakeFile = () => ({ type: 'image/png', name: 'shot.png' });

function restoreNavigator(orig) {
  navigator.share = orig.share;
  navigator.canShare = orig.canShare;
  navigator.clipboard = orig.clipboard;
}

describe('shareFileOrSave', () => {
  const orig = { share: navigator.share, canShare: navigator.canShare, clipboard: navigator.clipboard };
  afterEach(() => restoreNavigator(orig));

  it('calls navigator.share with {files:[file]} when it exists, and never touches clipboard/download', async () => {
    const share = vi.fn(async () => {});
    const write = vi.fn(async () => {});
    navigator.share = share;
    navigator.clipboard = { write };
    const file = fakeFile();

    const result = await shareFileOrSave({ file, title: 'T', filename: 'x.png' });

    expect(share).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledWith({ files: [file], title: 'T' });
    expect(write).not.toHaveBeenCalled();
    expect(result).toEqual({ method: 'share', ok: true, cancelled: false });
  });

  it('an AbortError (user cancelled the OS sheet) is not an error and does not fall back to clipboard/download', async () => {
    const abortErr = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    const share = vi.fn(async () => { throw abortErr; });
    const write = vi.fn(async () => {});
    navigator.share = share;
    navigator.clipboard = { write };

    const result = await shareFileOrSave({ file: fakeFile() });

    expect(write).not.toHaveBeenCalled();
    expect(result).toEqual({ method: 'share', ok: false, cancelled: true });
  });

  it('respects navigator.canShare({files}) when present, skipping straight to clipboard-image on a rejected payload', async () => {
    const share = vi.fn(async () => {});
    const canShare = vi.fn(() => false);
    const write = vi.fn(async () => {});
    navigator.share = share;
    navigator.canShare = canShare;
    navigator.clipboard = { write };

    const result = await shareFileOrSave({ file: fakeFile() });

    expect(canShare).toHaveBeenCalledTimes(1);
    expect(share).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ method: 'clipboard', ok: true, cancelled: false });
  });

  it('falls back to clipboard.write([ClipboardItem]) when navigator.share does not exist', async () => {
    const write = vi.fn(async () => {});
    navigator.share = undefined;
    navigator.clipboard = { write };
    const file = fakeFile();

    const result = await shareFileOrSave({ file });

    expect(write).toHaveBeenCalledTimes(1);
    const [items] = write.mock.calls[0];
    expect(items[0].items['image/png']).toBe(file);
    expect(result).toEqual({ method: 'clipboard', ok: true, cancelled: false });
  });

  it('a failed clipboard-image write (e.g. denied permission) falls back to a plain download', async () => {
    navigator.share = undefined;
    navigator.clipboard = { write: vi.fn(async () => { throw new Error('denied'); }) };
    // downloadBlob is unexported/internal — verify via the DOM side effect instead: a real <a>
    // click with a download attribute. happy-dom isn't loaded for this file (plain `node` env,
    // matching share-util.test.js), so window/document/URL.createObjectURL are all undefined here
    // — downloadBlob's own guard (`if (!win || !doc) return false`) makes this deterministic: it
    // reports method:'download', ok:false rather than throwing when there's no real DOM to use.
    const result = await shareFileOrSave({ file: fakeFile(), filename: 'x.png' });
    expect(result).toEqual({ method: 'download', ok: false, cancelled: false });
  });

  it('no navigator.share and no navigator.clipboard at all still resolves to method:download (ok:false under plain node, no DOM)', async () => {
    navigator.share = undefined;
    navigator.clipboard = undefined;

    const result = await shareFileOrSave({ file: fakeFile() });
    expect(result.method).toBe('download');
    expect(result.cancelled).toBe(false);
  });

  it('no file at all reports method:none rather than throwing', async () => {
    navigator.share = undefined;
    navigator.clipboard = undefined;

    const result = await shareFileOrSave({});
    expect(result).toEqual({ method: 'none', ok: false, cancelled: false });
  });
});
