// @ts-nocheck
export default {version:'5.542', date:'2026-10-13', changes:[
  '3 Peaks tab (Store Analytics) -- added a dedicated date-range filter, independent of the ' +
  'global weeksBack setting every other store-dash tab shares. Default behavior unchanged ' +
  '(trailing weeksBack average); picking a preset or custom range via the shared ' +
  'DateRangeControl now filters the underlying 3 Peaks rows to exactly that window (no ' +
  'silent fall-back to "all data" the default trailing-window path uses when a window is ' +
  'sparse -- an explicit pick is honored exactly as given, even if it returns a thin result).',
  'SAGE -- fixed a second real bug surfaced by the same owner query (store 3708 labor %): 6 of ' +
  'SAGE\'s data tools (query_daily_activity, query_lifelenz_labor, query_labor_summary [both ' +
  'legs], query_forecast_snapshots, query_smg) filtered the model\'s own `locs` tool input ' +
  '(typically an unpadded store number, e.g. "3708") against the zero-padded 7-char loc column ' +
  'verbatim -- matching nothing. The model had to burn most of its tool-call-round budget ' +
  'self-diagnosing the exact padding mismatch (confirmed live) before it could retry, and often ' +
  'ran out of rounds before it could. Two sibling tools (query_eom_recount_impact, query_forms) ' +
  'already padded correctly -- propagated the same fix to the other six. ⚠️ Requires ' +
  '`supabase functions deploy sage-chat --no-verify-jwt` to go live, same as the earlier ' +
  'web_search fix this session.',
]};
