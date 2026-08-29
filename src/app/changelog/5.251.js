// @ts-nocheck
export default {version:'5.251', date:'2026-08-29', changes:[
  'Dispatch #209 -- EOM count-completion notifications: the app\'s FIRST real in-app notification ' +
  'system, built during an active 3-day EOM count cycle. Owner, live: "can we setup a smart ' +
  'notification for when a store is perceived to complete with any class of count?"' +
  '\n\n' +
  'Detection: new detectCountNotifications(prevStatus, newProgress) in src/engine/eom-inventory.js ' +
  '-- a pure transition-detection layer on top of the ALREADY-BUILT computeCountProgress()/ ' +
  'diagnoseIncompleteCount() engine (no math changed there). Implements the owner\'s exact rules, ' +
  'transcribed verbatim in memory/dispatch-209.md: Food+Condiment wait for BOTH complete before ' +
  'notifying, UNLESS the done one has been sitting >3h (NOTIFY_STALE_HOURS) with the other still ' +
  'incomplete, in which case it fires anyway showing the stalled class\'s REAL % (never a fake ' +
  '"not started" just because it\'s holding the pair up); Paper fires independently the moment it ' +
  'completes, and that notification ALWAYS carries Food/Condiment/Non-Product\'s current status too ' +
  '(every notification is a full-cycle snapshot, not just the trigger class); every relevant class ' +
  'gets one of four honest statuses on every notification -- not_applicable (zero items in the ' +
  'store\'s catalog), not_started (real items, zero counted), in_progress (real %), complete -- ' +
  'never blank/missing for an untouched-but-real class. Fire-once via a new notified_classes jsonb ' +
  'array on eom_count_status (generalizes the existing notified_90 pattern from one shared flag to ' +
  'one marker per trigger-kind), plus new food_done_at/condiment_done_at/paper_done_at/ ' +
  'nonproduct_done_at timestamp columns (stamped once, never overwritten) that the stale-timeout ' +
  'rule reasons against. 18 unit tests (src/__tests__/eom-count-notifications.test.js) cover every ' +
  'named rule combination: both-together-immediate, one-then-stale, one-then-other-arrives-before- ' +
  'stale (fires as both_complete, not stale_timeout), paper-alone, not-started-vs-not-applicable, ' +
  'and no-refire.' +
  '\n\n' +
  'Schema (supabase/schema-eom-count-notifications.sql, ⚠️ NEEDS THE OWNER TO RUN IT MANUALLY in ' +
  'the Supabase SQL editor before real rows can be written -- same handoff pattern as every other ' +
  'new-table dispatch): the five eom_count_status columns above, plus a new eom_count_notifications ' +
  'table (trigger_kind, class_statuses jsonb, uncounted_items jsonb capped to the top 25 by ' +
  'valueAtRisk with a totalCount/totalValue/truncated flag so nothing silently drops, kb_links jsonb, ' +
  'read_at), tenant_id + full tenant-scoped RLS replicating schema-qsr-menu-item-activity.sql\'s exact ' +
  'pattern (current_tenant_id()/set_tenant_id()). Idempotent; also folded into schema.sql\'s own ' +
  'eom_count_status CREATE TABLE so the schema-drift ratchet stays green.' +
  '\n\n' +
  'Wiring (scripts/qsrsoft-onhand-pull.mjs): computeCountProgress() is now computed ONCE per store ' +
  'per run and shared between detectCountNotifications() and the existing status-row builder (no ' +
  'more double pass over the same on-hand rows); a fired detection calls diagnoseIncompleteCount() ' +
  'scoped to the trigger class(es) for the uncounted-items payload and inserts into ' +
  'eom_count_notifications. QSRSoft KB grounding is LIVE-CONFIRMED against qsrsoft_kb (service-role ' +
  'read, 2026-08-29) -- "What are the Best Counting Practices Using the Mobile Inventory App" and ' +
  '"Physical Inventory" are the two real matching articles in the corpus (no Paper- or Non-Product- ' +
  'specific article exists, so those classes point at the same two general-counting links plus, for ' +
  'Non-Product, "On Hand Inventory"); real titles/URLs, not guessed. diagnoseIncompleteCount\'s ' +
  'already-computed lateBulk/lateBulkDay signal rides along inside class_statuses (no new column). ' +
  'An explicit named comment marks the exact future send_email(row)/send_sms(row) hook point right ' +
  'after the insert -- out of scope for this dispatch per the owner\'s own message, no fake provider ' +
  'code stubbed. A scoped integration test (eom-count-notifications-pull.test.js) proves a real ' +
  'notification row lands with the right shape end-to-end, including the fire-once path across two ' +
  'simulated runs.' +
  '\n\n' +
  'UI (src/app/shell.js): a bell + unread-count badge in the top bar (NotificationBell, next to the ' +
  'SAGE/Pre-Brief quick-access buttons, same "always one tap away" placement), 60s poll for the ' +
  'unread count -- not a real-time push system. Clicking opens a lightweight dropdown (NOT a ' +
  'RoutePanelShell page) listing eom_count_notifications newest-first: store name, trigger class(es), ' +
  'every relevant class\'s status/%, collapsed uncounted-item count + $ at risk, and the real KB ' +
  'link(s). Clicking a row marks it read and deep-links into that store\'s EOM Dashboard Scoreboard ' +
  'entry (new eom-dashboard:<loc> colon-arg, App.js\'s eomInitialStore state seeding ' +
  'EOMDashboardPanel\'s existing oneStore filter -- reuses the existing Scoreboard view per the ' +
  'owner\'s own "don\'t build a second detail surface" instruction, does not build a new one). ' +
  'Render-level test (eom-count-notification-bell.test.js) mounts the REAL component with fixture ' +
  'data -- unread badge, dropdown open/load, rule-3 not_started-vs-in_progress rendering on the same ' +
  'row, KB link real title/url, mark-read + deep-link on click, no double mark-read on an already- ' +
  'read row.' +
  '\n\n' +
  'Speed check: entry+eager-preload payload 523.77 KB gzip vs the 850 KB budget (326 KB headroom); ' +
  'recent baseline was ~522 KB -- the bell/badge is a new always-loaded shell component (not lazy- ' +
  'loadable the way a panel is), so this is real, small, expected growth, reported per the standing ' +
  'speed-check rule rather than left unmeasured.' +
  '\n\n' +
  'Full suite: 3168/3168 (one unrelated retention-rollup test flaked under full-suite parallel load ' +
  'and passed clean in isolation -- not touched by this change, not re-run to hide it).',
]};
