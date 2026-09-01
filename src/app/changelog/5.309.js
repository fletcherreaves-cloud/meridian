// @ts-nocheck
export default {version:'5.309', date:'2026-09-01', changes:[
  'Native OS Share sheet (Web Share API) -- the standing backlog item the owner flagged as the ' +
  'one he\'s most curious to see built. Every "🔗 Share" button that mints a share link (Count ' +
  'Cycle store card, EOM Scoreboard) used to just copy the URL to the clipboard. It now tries ' +
  'the real OS share sheet (Messages, Mail, Slack, AirDrop, etc) first on any device that ' +
  'supports it -- mobile Safari/Chrome mainly -- and falls back to the pre-existing ' +
  'clipboard-copy everywhere else (desktop browsers mostly don\'t implement navigator.share). ' +
  'Both paths already require a real user gesture, true at every call site since they all fire ' +
  'from an onClick, so this is a drop-in swap, not a new UX pattern.',
  'New src/utils/share.js: shareOrCopy({url,title,text}) -- tries navigator.share first, treats ' +
  'a user-cancelled OS sheet (AbortError) as a normal cancel (no error toast, no silent ' +
  'clipboard fallback of a link the user just backed out of), and falls back to ' +
  'navigator.clipboard.writeText(url) on any environment without navigator.share or when ' +
  'share() itself fails for another reason. Returns {method:\'share\'|\'clipboard\'|\'none\', ' +
  'ok, cancelled} so each call site can show the right status text.',
  'Wired into the two call sites that actually create a share LINK: count-cycle-panel.js\'s ' +
  '"🔗 Share" (weekly Count Cycle report) and eom-dashboard.js\'s "🔗 Share" (EOM FOB report). ' +
  'Status text now reads "✓ Shared -- <store>" when the OS sheet ran vs the existing ' +
  '"✓ Read-only link copied -- <store>" when clipboard-copy ran, so a user can tell which ' +
  'actually happened. Every other navigator.clipboard.writeText(...) call site in src/views/ ' +
  'was audited and left alone -- they copy report TEXT (recap/full diagnosis, recount-impact, ' +
  'missing-items, swing-ledger, op-supplies table, SAGE message, settings JSON export, a shell ' +
  'command) for pasting elsewhere, not a URL meant to leave the app, so they are a different ' +
  'affordance and out of scope for this pass.',
  'Tests: src/__tests__/share-util.test.js unit-tests shareOrCopy() directly (share called with ' +
  'the right payload and clipboard untouched; AbortError surfaces neither an error nor a ' +
  'fallback copy; no-navigator.share falls back exactly as before; a rejected canShare() ' +
  'payload and a failed clipboard write are both handled without throwing). Per this repo\'s ' +
  '"would this verification still pass if reverted?" standing rule, two new real-render suites ' +
  '-- src/__tests__/native-share-count-cycle.test.js and native-share-eom-dashboard.test.js -- ' +
  'drive the actual "🔗 Share" button click on each panel with navigator.share mocked, so a ' +
  'revert of the call-site wiring (back to a direct navigator.clipboard.writeText) fails them, ' +
  'not just an isolated helper test. Full suite green (359 files / 3644 tests); entry-chunk ' +
  'budget unaffected (eager total 530.77 KB gzip vs the 850 KB budget -- the new helper is a ' +
  'few hundred bytes inside two already-lazy panels).',
]};
