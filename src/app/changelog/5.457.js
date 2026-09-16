// @ts-nocheck
export default {version:'5.457', date:'2026-09-16', changes:[
  'SAGE comprehensive app-awareness, first slice (Task #74): corrected a real documentation ' +
  'drift -- CLAUDE.md claimed SAGE has "7 tools" and the client system prompt claimed "nine" ' +
  'but only wrote up 8; the live Edge Function actually already had 9, including ' +
  '"search_project_memory" (searches this repo\'s own curated internal notes) which had NO ' +
  'system-prompt writeup at all, meaning Claude had no guidance on when to reach for it.',
  'New tool: query_data_health -- checks whether Meridian\'s ~21 automated data streams (DAR, ' +
  'FOB, eBOS, LifeLenz, the 3 emailed streams, Inventory Summary, Forecast Week Cache, 6 ' +
  'monthly Performance-Review streams) are current, reusing the exact same registry and ' +
  'thresholds as the in-app At-A-Glance freshness checklist so SAGE\'s answer always agrees ' +
  'with what the app shows. Never returns store-level figures -- pipeline health only, no RBAC ' +
  'scoping needed. System prompt now tells SAGE to check this before concluding a surprisingly ' +
  'low/zero query result means something is operationally wrong.',
  'Query/classify logic split into supabase/functions/sage-chat/data-health.js specifically so ' +
  'it\'s testable from Vitest -- this session cannot deploy or exercise the live Deno Edge ' +
  'Function (see memory/finding-sage-metric-resolver-not-a-small-port-2026-09-16.md), so this ' +
  'is the only part of the addition verifiable here; the actual Supabase queries in index.ts ' +
  'are static-review-only. 11 new tests including the same month-keyed-stream false-alarm trap ' +
  'Task #70 fixed for the in-app checklist. Full findings + deferred scope: ' +
  'memory/finding-sage-app-awareness-2026-09-16.md.',
  '⚠️ Needs supabase functions deploy sage-chat --no-verify-jwt before query_data_health ' +
  'actually works -- ships inert until redeployed. Full suite 524/524 files, 5017/5017 tests. ' +
  'Build clean, eager payload 550.91 KB / 850 KB.',
]};
