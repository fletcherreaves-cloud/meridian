// @ts-nocheck
// #248 — xlsx (141.56 KB gzip / 424.88 KB raw, the largest eager modulepreloaded file after the
// entry chunk itself) was statically imported by App.js, parsers/index.js, and
// parsers/inventory-parse.js — all three unavoidably eager (App.js is the entry point;
// parsers/index.js and inventory-parse.js are both statically reached from engine/pipeline.js,
// itself statically reached from App.js) — for a library that only runs when someone uploads or
// exports a spreadsheet. pdfjs-dist (145 KB, same job, same size class) is already lazy via
// `await import(...)`; this brings xlsx in line.
//
// loadXLSX() is memoized: the first caller anywhere in the app pays for the dynamic import,
// every subsequent call (any module, any file) gets the same cached module instantly, since
// dynamic import() is deduped by specifier per module graph. Call and await this once — from
// App.js's handleFiles, before the per-file loop — and every downstream synchronous parse
// function (parsers/index.js's parseRaw/sniffSheetType/parseProjectionsFile/parseSMGFullScale,
// inventory-parse.js's parseInventoryData) sees a populated module-scoped XLSX reference by the
// time it runs, without itself needing to become async or await anything — see each file's own
// ensureXLSXReady()-style export for how it plugs in.
let _xlsxPromise = null;
export function loadXLSX() {
  if (!_xlsxPromise) _xlsxPromise = import('xlsx');
  return _xlsxPromise;
}
