// @ts-nocheck
// #230 — the ONE changelog entry App.js needs synchronously: the latest version+date, for the
// footer text ('Meridian. v'+MERIDIAN_VERSION) and window.__MERIDIAN_VERSION__. Deliberately
// standalone — does NOT import from changelog-data.js, and is not imported by it — so App.js's
// static import of this file stays tiny regardless of how large the full changelog grows. The
// full history (including this same entry, duplicated) lives in changelog-data.js, read only by
// the lazy-loaded changelog-panel.js. See changelog-data.js's header for why the two must not
// share a module. Keeping this in sync with changelog-data.js's newest entry is mechanical —
// update both in the same commit — and guarded by src/__tests__/changelog-version.test.js.
export const LATEST_CHANGELOG_ENTRY = {version:'5.026', date:'2026-08-16', changes:[
  'Issue #337 -- CLOSED, but honestly: this PR did not fix it. #338 (v5.024) added only a console.log to laborSec (at-a-glance.js) -- no logic changed. The owner\'s live browser dump, pasted the same day, showed laborPctResolved: 0.2139836621712253 with both derive inputs populated (effectiveDateRange 2026-08-12..2026-08-16, allLocsCount 27, loc formats matching) and the At A Glance tile now renders 21.40% * On Track. Every static-analysis and out-of-browser-reproduction candidate this session tried had already come back clean (see #338\'s own changelog entry) -- the difference between the morning\'s broken screenshot and the evening\'s working dump has to be some change in the underlying data or app state between those two points, not a code change, because none shipped in between. What specifically changed is unknown and is NOT being asserted here -- recording that plainly rather than claiming a fix, per explicit instruction, because a real fix would tell us whether this can regress and this does not.\n\nReverted #338\'s diagnostic block verbatim (the console.log(\'[#337]\', {...}) call and its five lines of setup/comment in laborSec, right after laborPct/tpph are computed) -- it served its one purpose (capturing the dump that let this close) and has no further use. Left the early-return gate it sat next to untouched (that\'s #303\'s fix, unrelated).\n\n1387/1387 tests pass, build clean -- pure deletion in an already-loaded module, no bundle-size impact.',
  ]};
