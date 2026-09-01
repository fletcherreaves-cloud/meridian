// @ts-nocheck
// Captures a DOM node as a PNG, INCLUDING content scrolled out of view -- the backbone of the
// app-wide RoutePanelShell "📸 Share" button (owner request 2026-09-01: "even better if it
// screenshots the whole screen (even the part unviewable due to scrolling)").
//
// Uses html2canvas (lazy-loaded, see src/lib/html2canvas-lazy.js) rather than any
// window.print()/window.open()-based approach on purpose. eom-supervisor.js's own history (see
// its openPrintWindow comment) already hit a real fidelity bug from a SIMILAR-sounding idea: an
// earlier print mechanism tried resolving this app's theme CSS custom properties
// (var(--bg)/var(--surf)/etc.) inside a SEPARATE window.open('', ...) document with no
// stylesheets and no data-theme/data-mode attributes -- those tokens resolved to nothing, which
// on dark mode meant near-invisible white-on-white text. html2canvas avoids that failure mode
// structurally: it clones the LIVE document (same stylesheets, same <html data-theme data-mode>
// attributes) into an offscreen iframe rather than starting a blank one, so CSS custom properties
// resolve exactly as they do on screen. Verified directly (not just reasoned about, per this
// repo's "measure it" rule) in both themes -- see memory/project-share-screenshot.md.
import { loadHtml2Canvas } from '../lib/html2canvas-lazy.js';

// Find the nearest ancestor that is ACTUALLY scrolled (not just overflow:auto in CSS -- many
// containers set that defensively but never grow past their own height). RoutePanelShell's own
// body div carries no overflow of its own (confirmed by reading ModalShell.js): the real scroll
// container is an ancestor several levels up (App.js's '.mf-main-content' wrapper). A scrolled
// ancestor is a documented source of blank/offset html2canvas renders (its internal geometry
// sampling can pick up a distant ancestor's scroll offset) -- resetting it to the top before
// capture removes the ambiguity entirely rather than trying to compensate for it after the fact.
function findScrolledAncestor(node) {
  let el = node?.parentElement;
  while (el && el !== document.body) {
    const style = getComputedStyle(el);
    if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1) return el;
    el = el.parentElement;
  }
  return null;
}

// Returns a PNG Blob of `node`'s FULL rendered content (its real scrollHeight, not just the
// currently-visible slice), or null if `node` is falsy / capture fails.
export async function capturePanelScreenshot(node) {
  if (!node || typeof node.getBoundingClientRect !== 'function') return null;

  const html2canvas = await loadHtml2Canvas();
  const scrolledAncestor = findScrolledAncestor(node);
  const savedScrollTop = scrolledAncestor ? scrolledAncestor.scrollTop : null;
  if (scrolledAncestor) scrolledAncestor.scrollTop = 0;

  try {
    const bg = getComputedStyle(node).backgroundColor;
    const canvas = await html2canvas(node, {
      backgroundColor: bg && bg !== 'rgba(0, 0, 0, 0)' ? bg : getComputedStyle(document.body).backgroundColor,
      useCORS: true,
      scrollX: 0,
      scrollY: 0,
      windowWidth: node.scrollWidth,
      windowHeight: node.scrollHeight,
    });
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
  } catch (e) {
    console.warn('[panel-screenshot] capture failed', e);
    return null;
  } finally {
    if (scrolledAncestor && savedScrollTop != null) scrolledAncestor.scrollTop = savedScrollTop;
  }
}
