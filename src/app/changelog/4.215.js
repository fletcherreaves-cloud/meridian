// @ts-nocheck
export default {version:'4.215', date:'2026-06-19', changes:[
  'Stopped patching the restore mechanism and fixed the actual design flaw: session restore was automatic and blocking — if it hung for any reason, the app gave you no way to interact with anything, including closing a stuck modal',
  'Session restore is now opt-in. The app loads instantly and empty on every load. A lightweight, hard-timeout-bounded check (count() only, 3-second cap, cannot block the shell no matter what) detects a previous session and shows a dismissible banner — you click Restore Session when ready, instead of it happening automatically before you can do anything else',
  'Added a universal Escape-key handler that closes every modal in the app unconditionally — does not depend on diagnosing why something got stuck, just guarantees a way out',
  'This directly resolves the stuck Dialed-In Comparison modal — that flag (showDICompare) is included in the Escape handler',
  'All prior fixes this session (compute6wk indexing, getModelAssignment caching, AtAGlance/StoreDash/OrgView modal-gating, the IDB schema and race-condition fixes) remain in place — none of that work is lost, this addresses the structural risk sitting on top of it',
]};
