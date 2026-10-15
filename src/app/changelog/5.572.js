// @ts-nocheck
export default {version:'5.572', date:'2026-10-15', changes:[
  'Reports redesign Phase 2 (owner request, continuing Phase 1\'s metric-catalog reconciliation): ' +
  'a shared Report Shell (src/components/ReportShell.js) -- date range + LocationSelector + Run, ' +
  'then an Export ▾ menu (Print / CSV / Excel / PDF) once a run has produced data -- and the one ' +
  'shared data contract (src/utils/report-export.js: {title, subtitle?, headers, rows}) all four ' +
  'export actions consume, so any NEW report built on the shell gets all four for free instead of ' +
  'hand-rolling its own CSV-via-Blob (the ~20-copy pattern this stops growing). Existing hand-rolled ' +
  'reports are untouched -- they adopt the shell opportunistically later, per the panel-contract ' +
  '"touch it, bring it into line" convention, not a retrofit sweep now.',
  'New: real generated PDF export (jspdf + jspdf-autotable, new dependency, zero new npm audit ' +
  'vulnerabilities) -- not browser print-to-PDF, which is all the app had anywhere before this. ' +
  'Generalized XLSX export too (the one real prior pattern, in sage.js, generalized rather than ' +
  'copied a second time).',
  'Real bundle-budget finding: jspdf is deliberately NOT pinned in vite.config.ts\'s manualChunks, ' +
  'unlike xlsx/html2canvas -- the identical pin pattern was tried first and MEASURED to merge ' +
  'jspdf\'s ~140 KB gzip into the app\'s always-eager shared dynamic-import runtime helper (confirmed ' +
  'by diffing dist/index.html\'s modulepreload list with/without the pin). Left to automatic ' +
  'chunking, it lands in its own real lazy chunk, never preloaded. Documented in jspdf-lazy.js so ' +
  'the next large lazy dependency doesn\'t copy the xlsx/html2canvas pin by analogy without the same ' +
  'before/after measurement.',
  'Proof report: Loss Prevention Summary (new panel, Reports section) -- the first report built on ' +
  'the new shell, reusing exactly the 16 metric-source.js keys Phase 1\'s own audit gave a real, ' +
  'agreed-upon direction to (discount/promo/cash-over-short/refunds/overrides/T-Reds, by store, ' +
  'over any date range). Deliberately a new report rather than a retrofit of an existing one -- ' +
  'proves the shell without regression risk to a live, tested panel.',
  '27 new tests (export-action, shell, and full-panel-integration coverage, including real ' +
  'generated-PDF byte verification -- the %PDF magic header and a real size, not just "didn\'t ' +
  'throw"), full suite green (618/618 files, 5821/5821 tests), build clean, within budget ' +
  '(563.48 KB eager / 850 KB budget -- effectively unchanged from Phase 1\'s baseline). Full ' +
  'writeup: memory/project-reports-redesign.md.',
]};
