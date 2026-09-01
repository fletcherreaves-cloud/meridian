// @ts-nocheck
// Native OS Share sheet (Web Share API), with the pre-existing clipboard-copy behavior kept as
// the fallback everywhere it isn't available. Backlog item the owner flagged 2026-09-01 as the
// one he's most curious to see built.
//
// navigator.share is the PRIMARY path on any device/browser that supports it (mobile Safari/
// Chrome mainly — it surfaces the real OS share sheet: Messages, Mail, Slack, AirDrop, etc).
// Desktop browsers mostly don't implement it, or only allow it behind a real user gesture — the
// same constraint the existing clipboard-copy call sites already satisfy (they all fire from an
// onClick), so this is a drop-in swap, not a new UX pattern.
//
// Every "🔗 Share" call site does the same three things after minting a URL: try the OS sheet,
// fall back to clipboard, and show a status line that differs by which one actually ran — so
// that logic lives here once instead of once per call site.
export async function shareOrCopy({ url, title, text } = {}) {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const canUseShare = !!(nav && typeof nav.share === 'function');

  if (canUseShare) {
    const payload = {};
    if (title) payload.title = title;
    if (text) payload.text = text;
    if (url) payload.url = url;
    try {
      // canShare() lets a browser reject a payload (e.g. one it can't hand off) before opening
      // the sheet — skip straight to the catch/fallback rather than flashing an OS UI that would
      // just fail. Not every browser implements canShare(), so only gate on it when present.
      if (typeof nav.canShare === 'function' && !nav.canShare(payload)) {
        throw Object.assign(new Error('payload not shareable'), { name: 'NotShareableError' });
      }
      await nav.share(payload);
      return { method: 'share', ok: true, cancelled: false };
    } catch (e) {
      // AbortError = the user closed the OS share sheet without picking a target. That's a
      // deliberate cancel, not a failure: don't surface an error, and don't silently fall back to
      // clipboard-copying something the user just backed out of.
      if (e && e.name === 'AbortError') return { method: 'share', ok: false, cancelled: true };
      // Any other navigator.share() failure (permission denied, no registered handler, the
      // NotShareableError above) falls through to the same clipboard path used when share()
      // doesn't exist at all.
    }
  }

  if (url && nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
    try {
      await nav.clipboard.writeText(url);
      return { method: 'clipboard', ok: true, cancelled: false };
    } catch {
      return { method: 'clipboard', ok: false, cancelled: false };
    }
  }

  return { method: 'none', ok: false, cancelled: false };
}

function downloadBlob(blob, filename) {
  try {
    const win = typeof window !== 'undefined' ? window : null;
    const doc = typeof document !== 'undefined' ? document : null;
    if (!win || !doc) return false;
    const url = win.URL.createObjectURL(blob);
    const a = doc.createElement('a');
    a.href = url; a.download = filename;
    doc.body.appendChild(a); a.click();
    setTimeout(() => { doc.body.removeChild(a); win.URL.revokeObjectURL(url); }, 300);
    return true;
  } catch {
    return false;
  }
}

// File-sharing counterpart to shareOrCopy() above, for the app-wide panel Screenshot Share
// button (RoutePanelShell) -- a genuinely different fallback chain than the URL case (there is no
// "copy the URL" equivalent for an image: the fallback is copying the IMAGE ITSELF to the
// clipboard, then a plain file download), so it's its own function rather than an overload.
//
// navigator.share({files}) is Web Share API LEVEL 2 -- narrower support than the url/text form
// above (solid on iOS Safari / Android Chrome, the devices GMs actually carry; desktop is uneven
// and desktop Firefox has neither level at all). canShare({files}) is the correct capability gate
// per the spec -- some browsers implement navigator.share for url/text but reject a files payload
// synchronously, so checking canShare first (when present) avoids flashing an OS sheet that would
// just fail. AbortError (user closed the sheet without picking a target) is a deliberate cancel,
// exactly like shareOrCopy() -- not an error, and not a reason to fall back to clipboard/download.
export async function shareFileOrSave({ file, title, text, filename } = {}) {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const canUseShare = !!(nav && typeof nav.share === 'function' && file);

  if (canUseShare) {
    const payload = { files: [file] };
    if (title) payload.title = title;
    if (text) payload.text = text;
    try {
      if (typeof nav.canShare === 'function' && !nav.canShare(payload)) {
        throw Object.assign(new Error('file payload not shareable'), { name: 'NotShareableError' });
      }
      await nav.share(payload);
      return { method: 'share', ok: true, cancelled: false };
    } catch (e) {
      if (e && e.name === 'AbortError') return { method: 'share', ok: false, cancelled: true };
      // Falls through to clipboard-image, then download, exactly like the NotShareableError /
      // no-registered-handler cases above.
    }
  }

  if (file && nav && nav.clipboard && typeof nav.clipboard.write === 'function' && typeof ClipboardItem !== 'undefined') {
    try {
      await nav.clipboard.write([new ClipboardItem({ [file.type]: file })]);
      return { method: 'clipboard', ok: true, cancelled: false };
    } catch {
      // Falls through to download -- a clipboard-image write can fail on a permission prompt the
      // user dismissed, or a MIME type the browser's clipboard implementation won't accept.
    }
  }

  if (file) {
    const ok = downloadBlob(file, filename || file.name || 'share.png');
    return { method: 'download', ok, cancelled: false };
  }

  return { method: 'none', ok: false, cancelled: false };
}
