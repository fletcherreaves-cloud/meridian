// @ts-nocheck
export default {version:'4.255', date:'2026-07-01', changes:[
  'Operations Report date parsing hardened: now accepts single-date filenames (was requiring 2+ dates — silently ignored "Operations Report 2026-06-30.xlsx" style names), handles MM/DD/YYYY and MM-DD-YYYY filename formats, adds month-name fallback ("June 2026 Operations Report" → uses last day of June), and validates all extracted dates before using them. Fixes bug where June 30 rows were being assigned June 29 as their date.',
]};
