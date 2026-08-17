// @ts-nocheck
export default {version:'4.263', date:'2026-07-02', changes:[
  'SMG VOICE Performance Reports: full pipeline wired up — Gmail poller detects monthly "Voice Performance Report" emails (SMGMailMgr@whysmg.com), downloads operator PDFs, stores in Supabase. Browser auto-parses PDFs using PDF.js, extracts per-store data (DT Sat, DT Dissat, IR Sat, IR Dissat, Accuracy B2B, Quality B2B, Fries B2B, Snack Wrap B2B) for all 3 report types (Monthly / Trailing 90d / YTD), saves to new smg_voice_performance Supabase table.',
  'SMG VOICE panel: new Performance tab shows all-store ranking table with color-coded metrics, period selector (6 months), and report type toggle (Monthly / T90 / YTD). Metric columns are clickable to re-sort.',
]};
