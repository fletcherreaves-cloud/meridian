// @ts-nocheck
export default {version:'5.339', date:'2026-09-03', changes:[
  'Cleanup: removed the dead withTimeout(promise, ms, fallback) helper from src/db/index.js -- ' +
  'exported and imported into App.js\'s db/index.js import list, but never actually called ' +
  'anywhere in the codebase. Everything else in that import list is live.',
  'Full suite (3957 tests) and build both clean (533.30 KB / 850 KB eager budget, no shift). ' +
  'Smoke-tested via dev server + headless Chromium, zero JS errors.',
]};
