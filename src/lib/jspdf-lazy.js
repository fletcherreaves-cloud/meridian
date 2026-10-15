// @ts-nocheck
// jspdf (+ jspdf-autotable) is only used by the Reports redesign's real PDF export action
// (src/utils/report-export.js's exportReportPDF) -- same "no reason to be eager" shape as
// xlsx-lazy.js/html2canvas-lazy.js. Module-scope memoized promise: the first PDF export anywhere
// in the app pays the fetch cost, every later one (same session) is instant, since dynamic
// import() is deduped by specifier per module graph already -- this just also memoizes the
// promise so callers don't need to repeat that.
//
// jspdf-autotable v5's real API is FUNCTIONAL (confirmed live: `autoTable(doc, opts)`, the
// module's `default` export), not the old doc.autoTable(...) prototype-patch style a plain
// `import 'jspdf-autotable'` side-effect import would assume -- that side-effect-only form was
// tried first and verified NOT to attach anything to jsPDF's prototype under Node's own ESM
// resolution (doc.autoTable read back as undefined). `applyPlugin(jsPDF)` exists too and does
// patch the prototype, confirmed working as an alternative, but the functional form needs no
// prototype mutation at all, so this loader returns both pieces explicitly rather than relying
// on either side effect.
// Deliberately NOT pinned to a manualChunks bucket the way xlsx/html2canvas are -- tried that
// first (the same pattern, same rationale) and MEASURED it to be actively wrong here: pinning
// `jspdf` merged its ~140 KB gzip into the SAME chunk as the app's shared dynamic-import runtime
// helper, which every entry-chunk page load already fetches eagerly -- confirmed by diffing the
// built index.html's <link rel="modulepreload"> list with and without the pin (jspdf present
// only WITH the pin). Left to Rolldown/Vite's automatic chunking, jspdf and jspdf-autotable each
// land in their own real lazy chunk, named after the package, never modulepreloaded. The
// takeaway for the next dependency like this: the xlsx/html2canvas pin pattern is not a
// template to copy by analogy -- build and diff dist/index.html's modulepreload list before
// and after adding a manualChunks entry, the same "measure it, don't reason about it" rule
// CLAUDE.md already states for everything else in this repo.
let _jsPDFPromise = null;
export function loadJsPDF() {
  if (!_jsPDFPromise) {
    _jsPDFPromise = Promise.all([import('jspdf'), import('jspdf-autotable')])
      .then(([jspdfMod, autotableMod]) => ({
        jsPDF: jspdfMod.jsPDF || jspdfMod.default,
        autoTable: autotableMod.default,
      }));
  }
  return _jsPDFPromise;
}
