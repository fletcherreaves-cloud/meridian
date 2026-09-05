// @ts-nocheck
export default {version:'5.360', date:'2026-09-05', changes:[
  'New SAGE tool: query_smg(period, locs?) -- SMG VOICE FullScale customer-satisfaction scores ' +
  '(OSAT Top-2/5-only/B2B, Accuracy B2B, DT/Overall problem rate) for one month, live from ' +
  'Supabase instead of a static baked-in summary. Closes a gap flagged independently twice: ' +
  'the backlog\'s "custom reports for non-QSRSoft panels" item and SAGE\'s own self-report both ' +
  'named SMG VOICE as the top candidate for this treatment.',
  'District figures are response-count-weighted (Σ metric×n / Σn) wherever n exists, falling ' +
  'back to a plain mean only when no row in the set has it -- "never average averages." ' +
  'Per-store below_standard flags use the SAME McDonald\'s corporate thresholds src/views/' +
  'smg-voice.js\'s in-app dashboard already uses (Top-2/OSAT B2B ≥90%, Accuracy B2B ≥95%, DT/' +
  'Overall Problem ≤10%), pinned by a test so SAGE and the dashboard can never quietly disagree ' +
  'about which stores are below standard for the same period.',
  'Aggregation logic lives in supabase/functions/sage-chat/smg-agg.js (plain JS, Deno/Node-' +
  'agnostic), same pattern as the existing lifelenz-labor-agg.js -- imported by both the edge ' +
  'function and its Vitest test, so the test exercises the exact code running in production. ' +
  '13 new tests.',
  '⚠️ Needs `supabase functions deploy sage-chat --no-verify-jwt` to go live, matching every ' +
  'prior SAGE tool addition in this repo.',
]};
