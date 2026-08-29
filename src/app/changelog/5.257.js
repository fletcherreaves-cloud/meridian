// @ts-nocheck
export default {version:'5.257', date:'2026-08-29', changes:[
  'Dispatch #214 -- EOM notifications: 6 FOB investigation-tool links ("Investigate further"), ' +
  'the last of 7 real QSRSoft tool links the owner sent in one message on 2026-08-29 (#213 ' +
  'shipped Physical Inventory + On-Hand Inventory; these 5 -- Variance Stat/Yields, Transfers, ' +
  'Waste, Purchases, Raw Items -- plus Inventory Analysis were explicitly deferred to this ' +
  'dispatch).' +
  '\n\n' +
  'New fobToolLinks(nsn, triggerClasses, period, dateStr) in scripts/qsrsoft-onhand-pull.mjs, ' +
  'alongside kbLinksForClasses/physicalInventoryLink/onHandLink (reuses CLASS_LETTER, never ' +
  'redefined). Deliberately a SEPARATE fob_tool_links array, not folded into kb_links -- these ' +
  'are FOB-diagnostic tools, not "how do I count" articles, so a Paper/Non-Product-only trigger ' +
  'gets none of them (fobToolLinks returns [] entirely, not just the class-specific links, when ' +
  'triggerClasses has no Food/Condiment member). Wired into buildNotificationRow() gated by the ' +
  'SAME freshness condition fob_snapshot/fob_target already use (a fresh FOB snapshot resolved ' +
  'this run) -- no second freshness check, threaded through the existing boolean.' +
  '\n\n' +
  'Class-variant judgment call (the dispatch\'s own open question, raised rather than silently ' +
  'decided): a food_condiment trigger keeps BOTH class letters for Variance Stat/Yields and ' +
  'Inventory Analysis (up to 8 links total), not capped to "the worse offender". Checked whether ' +
  'that cap was cheaply derivable from fobTargetReport/buildFobTargetReport()\'s comps/topDriver ' +
  '(src/engine/fob-report.js) and it is NOT -- that data is keyed by FOB dollar COMPONENT ' +
  '(statv/comp/raw/cond/emp/unex, i.e. cost categories), not by inventory CLASS (Food/Condiment); ' +
  'the two axes don\'t map onto each other, so a "worse class" derivation would be a new, ' +
  'unproven computation rather than a reuse of existing math. The owner asked for these six ' +
  'tools by name -- trusting him to skim 8 links beats silently under-delivering on an explicit ' +
  'request.' +
  '\n\n' +
  'New supabase/schema-eom-fob-tool-links.sql (alter table ... add column if not exists ' +
  'fob_tool_links jsonb -- same idempotent, handoff-comment pattern as schema-eom-fob-snapshot.sql, ' +
  'needs a manual SQL-editor run post-merge). resend-notify.mjs\'s fobSectionHtml() gained a new ' +
  'fobToolLinksHtml() sub-renderer -- an "Investigate further" list directly under the FOB ' +
  'components, its own visually distinct sub-section, separate from the existing "Helpful links" ' +
  'block at the email\'s bottom. Renders nothing (no header, no placeholder) when fob_tool_links ' +
  'is empty or absent, same discipline as the rest of this feature.' +
  '\n\n' +
  'Out of scope, untouched: KB_BEST_COUNTING/KB_PHYSICAL_INVENTORY/onHandLink/KB_ON_HAND, ' +
  'FOB_CLASSES, and surfacing these links anywhere besides the per-store notification email (not ' +
  'the #215 roll-up digest, not an in-app panel).' +
  '\n\n' +
  '21 new unit tests: fobToolLinks() (food-only, food_condiment both-letters, paper-only and ' +
  'nonproduct-only empty arrays, given-nsn/period/dateStr not hardcoded, exact URL shapes vs the ' +
  'owner-supplied examples) and buildNotificationRow()\'s fob_tool_links null-when-no-fobSnapshot ' +
  'passthrough, in eom-count-notifications-pull.test.js; 5 more in resend-notify.test.js for the ' +
  '"Investigate further" render/no-render cases (present, empty array, null, absent, and FOB ' +
  'section itself absent). Full suite green (3327/3327 outside one pre-existing, unrelated ' +
  'failure -- eom-notification-delivery-pull.test.js\'s mock is missing the triggerLabel export ' +
  'dispatch #216\'s push-notification hook now calls; reproduced on main before this change too, ' +
  'flagged for the PM rather than fixed here as out of scope), build clean.',
]};
