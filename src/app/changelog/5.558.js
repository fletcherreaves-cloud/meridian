// @ts-nocheck
export default {version:'5.558', date:'2026-10-14', changes:[
  'Lindsay relocation (18213 -> 44689) -- store master data, continuity, and a store-lifecycle ' +
  'toggle. Owner report: 18213 (Lindsay-Wal-Mart, in-store/small-format) last day of operation ' +
  '11/10/26, replaced by a new freestanding build, new store number 44689, projected open ' +
  '11/14-11/15/26 -- exact dates not final ("I won\'t have exact dates until likely week of"). ' +
  'This is a real structural improvement over the original plan (logged in ' +
  'memory/store-events-material-changes.md back in August): a same-number relocation would have ' +
  'been invisible to forecast.js\'s newStore detection (keyed off first-ever-sales-date, and ' +
  '18213 has years of history) -- a new loc number sidesteps that exactly.',
  '44689 added to STORE_NAMES/STORE_COORDS/INV_ORG_COORDS/STORE_KB/supervisorGroups/operators/ ' +
  'doGroups/locality.js, same supervisor (Krystiana Langford), operator (Gary Mornhinweg), and DO ' +
  '(Hugh Bonner) as 18213, per "Supervisor and GM and Owner assignments stay the same." ' +
  'DEFAULT_TARGETS[\'44689\'] is a verbatim copy of 18213\'s current targets, explicitly commented ' +
  'as a placeholder (same crew/GM/menu, different building) -- not fabricated figures, and not an ' +
  'owner-reviewed target. Coords are also placeholder (same as 18213, "on the same property" per ' +
  'the original report) pending the real new-building address. GM is Cora Bahling ' +
  '(morning-brief.js STORE_STAFF) -- confirmed live that Meridian has no actual GM-tracking ' +
  'mechanism populated for ANY store today (gmAssignments is empty in production, zero restricted ' +
  'GM-role profiles exist), so this is tracked the same way every other store\'s GM already is, ' +
  'not a new gap specific to this store.',
  'New: Store Status (Settings -> Store Status, management.js) -- settings.storeLifecycle, a ' +
  'settable {loc: closedDate} map, answers the owner\'s "give me a way to toggle it or set it ' +
  'when needed." Set a store\'s last day of operation ahead of time (even weeks out) or on the ' +
  'day itself -- isStoreClosedOn/activeStoreIds (constants.js) are date-aware, so nothing needs ' +
  'to be remembered or flipped on the actual day. Wired into Smart Targets\' store roster (the ' +
  'first real consumer) -- a closed store stops being computed/graded there once its date is ' +
  'reached. Deliberately NOT swept into the ~50+ other STORE_NAMES-reading call sites across the ' +
  'app in this pass -- that is unscoped follow-up work; closed stores keep their full real history ' +
  'visible everywhere else (Store Dashboard, Analytics, drilldowns) by design, since that data ' +
  'stays real and worth keeping. No behavior change for any store today (storeLifecycle defaults ' +
  'to {}).',
  'New: src/engine/new-store-ramp.js -- a comparable-store ramp-blending forecast tool for 44689, ' +
  'per the owner\'s own read: "volume similar to Tishomingo\'s [43380, also a freestanding ' +
  'small-town opening] adjusted for inflation... Ponce de Leon [43701, gas-station/interstate] ' +
  '... might could" help but less comparable. Pulls each comparable\'s REAL sales trajectory from ' +
  'its own first trading day, expresses it as a fraction of its own mature run-rate (so stores of ' +
  'different sizes blend by SHAPE, not dollars), blends by weight, then applies that shape to a ' +
  'caller-supplied mature-weekly-sales assumption for 44689 -- deliberately not guessed by this ' +
  'engine itself, since sizing the new freestanding format/drive-thru upgrade is a judgment call ' +
  'only the owner can make. 13 tests, synthetic fixtures. Standalone -- not wired into the ' +
  'automatic nightly Model Assignment backtest, which would be a much larger, riskier change for ' +
  'a one-store transition; callable today, UI surface is follow-up work once real open-date data ' +
  'exists.',
  'NOTE -- one piece could not ship this pass: the equivalent LIVE Supabase org_config write ' +
  '(adding 44689 to the live supervisorGroups/operators/doGroups/orgAssignments, so the ' +
  'continuity applies immediately rather than waiting on this deploy) was blocked by the session\'s ' +
  'own permission system as a shared-production-resource write requiring explicit approval. The ' +
  'code-side seed in this commit takes effect for any fresh/reset settings state, but the owner\'s ' +
  'LIVE settings already have real data and will keep showing 18213 without 44689 in supervisor/ ' +
  'operator views until that live write happens (separately, with explicit approval) or the ' +
  'owner adds it manually via Settings -> Patches/Operators/DOs, which already support it today.',
  'Full suite green (602/602 files, 5634/5634 tests), npm run build clean, within the ' +
  'entry-chunk budget. 2 pre-existing count-assertion tests updated from 27 to 28 stores ' +
  '(dispatch-224-operator-plumbing.test.js) and locality.js gained the matching entry ' +
  '(locality.test.js\'s "every STORE_NAMES store has a locality entry" guard).',
]};
