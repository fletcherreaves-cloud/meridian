// @ts-nocheck
export default {version:'5.557', date:'2026-10-14', changes:[
  'Security panel -- Labor tab now defaults to Min Signals: All, matching the owner-reported ' +
  'live experience of "Cash and Inventory now show results. Labor still does not" after v5.556\'s ' +
  'loading fix. Not a loading bug: measured directly against the live table, LABOR-001/002 both ' +
  'have 330 real rows, every single one a CLEAR verdict (0 flagged) -- every employee evaluated ' +
  'came back clean on both post-termination-edit and self-approved-edit checks. The panel\'s ' +
  'default Min Signals floor (1+) hides any subject with zero FLAGGED verdicts, which is every ' +
  'subject in a 100%-clear domain -- exactly the scenario the 2026-10-12 "All" pill was built to ' +
  'rescue, but that dispatch only added the escape hatch, it never changed the default, so the ' +
  'owner still hit the "looks exactly like broken" empty state on first click.',
  'DOMAIN_DEFAULT_MIN_SIGNALS (src/views/security-panel.js) makes each domain tab set Min Signals ' +
  'to its own default on click -- Labor: 0 (All), Cash/Inventory: 1 (unchanged, both have real ' +
  'flagged findings today so defaulting to "here\'s what needs attention" is still right there). ' +
  'Re-applied on every tab switch, not just the first visit, so Labor -> Cash -> Labor keeps ' +
  'opening clear every time rather than remembering a stale 1+ from the last visit.',
  '3 new tests (security-panel.test.js): Labor tab shows its real clear subject on first click ' +
  'with no extra "All" click; Cash still defaults to 1+ unchanged; switching domains re-applies ' +
  'the right default each time, not just once. Confirmed via a temporary revert that all three ' +
  'fail without the fix wired into the tab-click handler. Full suite green (600/600 files, ' +
  '5614/5614 tests), npm run build clean, within the entry-chunk budget.',
]};
