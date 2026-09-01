// @ts-nocheck
// html2canvas (202 KB raw / ~48 KB gzip, per this repo's own build output) is only used by the
// app-wide panel Screenshot Share button (RoutePanelShell) -- no reason for it to be eager on
// every page load. Same shape as xlsx-lazy.js: a module-scope memoized promise so the FIRST click
// anywhere pays the fetch cost and every later click (same session) is instant, since dynamic
// import() is deduped by specifier per module graph already -- this just also memoizes the
// promise so callers don't need to repeat that. Pinned to its own Rollup chunk via
// vite.config.ts's manualChunks (same reason xlsx is pinned there: without a pin, Rollup's
// automatic chunking can fold a dynamically-imported dependency back into the eager entry chunk
// if the surrounding import graph shape changes elsewhere in the app).
let _html2canvasPromise = null;
export function loadHtml2Canvas() {
  if (!_html2canvasPromise) _html2canvasPromise = import('html2canvas').then(m => m.default || m);
  return _html2canvasPromise;
}
