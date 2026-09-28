// @ts-nocheck
export default {version:'5.487', date:'2026-09-28', changes:[
  'EOM Inventory: the native-share "🔗 Share" link no longer bundles a report title into the ' +
  'copied text. Root cause (owner report): src/utils/share.js\'s shareOrCopy() passes {title, ' +
  'text, url} to navigator.share() when the OS Share sheet exists; on desktop, that sheet\'s own ' +
  '"Copy" affordance concatenates text+url (dropping title) into the clipboard -- Meridian\'s own ' +
  'code never wrote to the clipboard directly on this path, the combining happened one layer up, ' +
  'in the OS sheet itself. Fix: eom-dashboard.js\'s createShare() and count-cycle-panel.js\'s share ' +
  'call both drop the `text` field, leaving only {title, url} -- title still shows in the OS ' +
  'sheet\'s own preview, and the plain desktop clipboard-fallback path (no navigator.share) was ' +
  'already url-only and is unchanged. 2 tests updated (native-share-eom-dashboard.test.js, ' +
  'native-share-count-cycle.test.js) assert payload.text is undefined.',
  'Signals/Scanner/Trend Explorer: avgCheck now derives sales÷gc ahead of any manual value, same ' +
  'as every other auto-first metric (owner: "adopt it"). signal-registry.js\'s AUTO_FIRST_KEY_MAP ' +
  'previously excluded avgCheck as a deliberate carve-out -- dispatch #182 already built the full ' +
  'derive-before-manual chain in metric-source.js, this just routes the correlation/signal-scanning ' +
  'callers through it too. csat-signals.test.js updated: avgCheck is no longer zero-variance in its ' +
  'fixture (gc varies by design) and now surfaces with a strong raw within-store r that the volume ' +
  'partial correctly discounts to noise (withinR≈0.99, partialR≈-0.01, tier: watch) -- real measured ' +
  'numbers pinned, not guessed.',
  'EOM recap (the abbreviated day-of GM message): re-reordered a second time in two days (owner: ' +
  '"this is my fault for mis directing you yesterday") -- now Missed/uncounted items first, Recount ' +
  'Candidates second, Waste flags third (was Recount Candidates -> Waste flags -> Missed/uncounted, ' +
  'shipped 2026-09-27). Content/caps/filters of all three sections are unchanged, only the order. ' +
  'dispatch-eom-recap-priority-2026-09-27.test.js and eom-diagnosis.test.js updated to the new order.',
  'Investigated (not shipped): filtering the recap\'s Waste Flags section to Food/Condiment only, ' +
  'as requested. Not possible with current data -- qsr_waste (the sole source for the waste-' +
  'inflation/waste-session checks that feed this section) is event-level with no WRIN, item, or ' +
  'class field at all (confirmed against scripts/security-rules-run.mjs\'s own comment). These ' +
  'findings are inherently store-wide across every class combined; there is no class dimension in ' +
  'the data to filter on. Documented in eom-diagnosis.js rather than faked or silently dropped.',
  'Non-Product uncounted-item messaging (report text, dashboard tooltips, class chips, printed ' +
  'district summary): reworded every reference from "not due until tomorrow" to "not due until the ' +
  'last day of the month" -- Non-Product\'s real due date (eom-inventory.js\'s nonProductDueToday(), ' +
  'unchanged) is the period\'s actual last calendar day, not literally "tomorrow" relative to ' +
  'today, and the old phrasing read as inaccurate/confusing (owner report). Compact on-screen chip ' +
  'abbreviation changed "tmrw" -> "EOM". No logic changed, only wording.',
  'EOM diagnosis dollar-severity tiers: MODERATE\'s window relabeled from "within 48-72h" to ' +
  '"within 24-48h" (owner request) -- CRITICAL (>=$200, immediate) and HIGH (24h, $100-199) ' +
  'unchanged.',
  'Full suite: 544/547 test files, 5147/5150 tests passing (88/88 in the files touched by this ' +
  'change). The 3 failing tests are unrelated, pre-existing, and previously reported on PR #1343 -- ' +
  'not touched here. Build clean, eager payload 552.88 KB gzip (budget 850 KB).',
]};
