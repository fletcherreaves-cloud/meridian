// @ts-nocheck
export default {version:'5.567', date:'2026-10-15', changes:[
  'Pay raise / review-cycle tracking (owner, live, 2026-10-15): "We need to have ability to add ' +
  'review cycle dates and effective dates for any pay increases earned by employees... tied to ' +
  'Labor & Scheduling tab in store tiles in district view to notate for reason for average rate ' +
  'of pay jumping... if you can run analysis in a report I can pull that shows impact of those ' +
  'raises to labor and profitability." Store-level (not per-employee -- Meridian has no ' +
  'per-employee hourly-crew roster pulled at all, and PII rules bar pulling one broadly), the ' +
  'same identify -> log -> measure loop as the coaching feedback loop (#208), applied to AROP ' +
  '(Average Rate Of Pay) instead of a coached finding.',
  'New engine/pay-events.js: detectAropJumps() flags a store whose trailing 14-day AROP stepped ' +
  'up by $0.20/hr or more with no logged reason yet (a nudge, not an alarm -- never flags a ' +
  'DROP, and a jump within a logged event\'s lookback window stops re-flagging). payRaiseImpact() ' +
  'computes a plain before/after snapshot around a logged event\'s effective date -- AROP and ' +
  'labor% before vs after, weekly and annualized labor-$ impact -- not a synthetic-control DiD ' +
  'like the competitive-closure engine (AROP has no peer-store control group; every store sets ' +
  'its own pay independently).',
  'New pay_events table (schema-pay-events.sql, tenant_id + RLS, same shape as coaching_cycles) ' +
  '-- effective date, optional review date, raise type, $/hr, free-text "who/what," note. ' +
  'loadPayEvents()/savePayEvent() in lib/supabase.js; ds.payEvents loads eagerly alongside ' +
  'coachingCycles/coachingCycleNotes.',
  'New PayEventModal (views/pay-event-modal.js) -- logs an event against a store, shows the ' +
  'current trailing AROP for context. Wired into THREE places: Patch Heatmap\'s store-detail ' +
  'Labor dimension row gets a "💰 Log Raise" button next to the existing "🎯 Coach" one; the ' +
  'Labor & Scheduling hub gets a new "💰 Pay Events" tab (PayEventsReportPanel) listing every ' +
  'unexplained jump + every logged event with its before/after impact table; Needs Attention ' +
  'gets a new "💰 Unexplained Rate Jumps" collapsible section (same shape as Open Coaching) so a ' +
  'real AROP step shows up there without having to go looking for it on the Labor tab.',
  '18 new tests across pay-events.test.js (engine), pay-event-modal.test.js, ' +
  'unexplained-rate-jumps-section.test.js, and pay-events-report-panel.test.js (all three ' +
  'render the real exported components, not mocks, per this repo\'s "would this verification ' +
  'still pass if reverted" rule). Full suite green (610/610 files, 5682/5682 tests), npm run ' +
  'build clean, within the entry-chunk budget.',
  '⚠️ Needs a one-time manual step: run schema-pay-events.sql in the Supabase SQL editor to ' +
  'create the table. Until then, the report is simply empty (no crash) and logging fails ' +
  'silently via the normal error path, same as any other not-yet-migrated table in this codebase.',
]};
