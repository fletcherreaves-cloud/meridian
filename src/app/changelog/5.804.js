// @ts-nocheck
export default {version:'5.804', date:'2026-11-16', changes:[
  '**QSRSoft Labor Analysis + Labor Exceptions email parsing** — part of the Operator ' +
  'Security Notice compliance triage. Both reports were already scheduled to the owner\'s ' +
  'inbox daily but never parsed; the existing manual-upload labor parser (parseLaborData) ' +
  'matched the real file exactly, and a real, previously-never-exercised bug in ' +
  'parseLaborExceptions (built for the wrong file shape) is fixed and tested against the real ' +
  'sample. New tables labor_analysis_daily/labor_exceptions_daily/labor_exceptions_detail_daily ' +
  '— not yet merged into the live ds.laborRows/ds.exceptionRows startup data-merge, a deliberate ' +
  'follow-on. Full writeup: memory/finding-qsrsoft-security-notice-2026-11-16.md.',
]};
