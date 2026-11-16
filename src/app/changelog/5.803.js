// @ts-nocheck
export default {version:'5.803', date:'2026-11-16', changes:[
  '**QSRSoft Native MCP Server connection (first migration slice)** — response to QSRSoft\'s ' +
  'Operator Security Notice Letter. Connected via real OAuth2 (not credential login) and added ' +
  'an automated pull for the 2 report types it exposes today (Time Slice Summary, Service Time ' +
  'Statistics) into new parallel Supabase tables. This is ADDITIVE, not a replacement — all ' +
  'existing QSRSoft pull scripts are deliberately retained and untouched, and nothing in the ' +
  'app reads the new tables yet. Full context, the gap analysis of what email/MCP cover vs. ' +
  'what would be lost if scraping stopped, and a draft (unsent) response letter are in ' +
  'memory/finding-qsrsoft-security-notice-2026-11-16.md.',
]};
