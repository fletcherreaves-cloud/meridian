// @ts-nocheck
// #230 — the ONE changelog entry App.js needs synchronously: the latest version+date, for the
// footer text ('Meridian. v'+MERIDIAN_VERSION) and window.__MERIDIAN_VERSION__. Deliberately
// standalone — does NOT import from changelog-data.js, and is not imported by it — so App.js's
// static import of this file stays tiny regardless of how large the full changelog grows. The
// full history (including this same entry, duplicated) lives in changelog-data.js, read only by
// the lazy-loaded changelog-panel.js. See changelog-data.js's header for why the two must not
// share a module. Keeping this in sync with changelog-data.js's newest entry is mechanical —
// update both in the same commit — and guarded by src/__tests__/changelog-version.test.js.
export const LATEST_CHANGELOG_ENTRY = {version:'5.032', date:'2026-08-16', changes:[
  'Issue #351 (Patch Heatmap) -- owner-reported: critical (! FOB) cells had no tinted background or outline, while amber (bullet) cells rendered correctly with both. Root cause: CRIT_COLOR changed from the hex literal \'#f87171\' to \'var(--crit)\' in v5.023 (#276/#286). Every severity tint in patch-heatmap.js was built by string-concatenating a 2-digit hex alpha suffix onto the color -- valid only for a hex literal; onto a var() reference it produces the literal invalid string "var(--crit)18", silently dropped by the browser.\n\nFix: added an exported withAlpha(color, hexSuffix) helper -- hex literals unchanged, var() references switch to color-mix(). All 4 call sites now go through it.\n\nIssue #352 (Forecast Accuracy) -- owner-reported: Run Backtest showed "Computing... 0 / 0 records" forever, Cancel did not help. Root cause: a temporal-dead-zone ReferenceError -- runBacktest\'s rows= filter called dateKey(r.date) while dateKey was declared later in the same scope, thrown with no enclosing try/catch, so the unhandled rejection left running stuck true forever.\n\nFix: hoisted dateKey above its first use, wrapped the function body in try/finally so any future throw still clears running, and made Cancel call setRunning(false) directly.\n\n1401/1401 tests pass (3 new), build clean (507.66 KB gzip eager, 342.34 KB headroom).',
  ]};
