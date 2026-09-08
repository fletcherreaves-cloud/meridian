// @ts-nocheck
export default {version:'5.402', date:'2026-09-08', changes:[
  'SAGE knowledge-grounding: added the mandatory handling notice for restricted memory findings ' +
  '(memory/project-sage-knowledge-grounding.md\'s owner-approved short-form wording). Dispatch ' +
  '#80 (2026-08-23) already shipped the real gating -- admin-only role check, fail-closed ' +
  'sensitivity classification, a hard SQL-level filter, not a prompt instruction -- but its own ' +
  'text explicitly left the notice template out of scope. The backlog item describing this as ' +
  '"designed but not built" had gone stale; only the notice itself was missing.',
  'memory-kb.js\'s buildMemorySearchResult() now prepends the notice to a result\'s excerpt ' +
  'whenever sensitivity===\'restricted\' -- at the same tool-output layer that already shapes ' +
  'every result, so the notice travels with the finding text itself rather than living in a ' +
  'separate field a caller could drop. A row only reaches that branch after rowVisible() has ' +
  'already cleared it for the caller\'s role.',
  '1 new test (sage-memory-kb.test.js, 6 total). Full suite 487/4630, build clean -- server/Deno- ' +
  'side change only, no client bundle impact. Requires a sage-chat redeploy to take effect in ' +
  'production (supabase functions deploy sage-chat --no-verify-jwt).',
]};
