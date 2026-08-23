// @ts-nocheck
export default {version:'5.121', date:'2026-08-23', changes:[
  'Dispatch #79 -- an autonomous 2-3h queue, five items, none needing the owner.\n\n'
  + '1) Per-panel ErrorBoundary: one runtime error used to blank all 82 panels, because the only '
  + 'ErrorBoundary in the app wrapped the WHOLE thing once in meridian.js. Reused the same class '
  + '(not a new one) inside lazyPanel() -- the exact insertion point that already gives every '
  + "panel its own Suspense boundary for the identical reason. A crash in one panel now stays in "
  + "that panel; nav and every other open panel keep working. The dispatch flagged that the "
  + "existing full-page \"the app crashed\" fallback would itself look broken scoped to one "
  + 'panel, so ErrorBoundary gained an opt-in compact variant (smaller card, no full-page '
  + 'background) plus a real "Close panel" button wired to the crashed panel\'s own onClose -- '
  + '"Try to recover" alone just re-renders into the same crash for a persistent error.\n\n'
  + "2) Daypart/Weekpart thin cells: Visit Patterns' Day of week/Daypart/Weekpart blocks were the "
  + 'last 3 groupings without dispatch #75\'s thin-cell floor (Channel got one, these did not) -- '
  + 'a Dinner cell at n=2 read a confident "0.00%". The dispatch brief explicitly forbade reusing '
  + "Channel's CHANNEL_YEAR_MIN_N=10 for a different, unmeasured distribution -- caught in a "
  + "self-review before this shipped, after an earlier draft did exactly that. Fixed with a "
  + "self-contained RELATIVE floor per block instead (a row under half its OWN block's "
  + 'best-covered row is thin), documented as a chosen floor rather than a finding, per the '
  + "dispatch's own named precedent (dispatch #77's THIN_RELATIVE_FLOOR).\n\n"
  + '3) node -v in CI: prints the resolved Node patch/ICU version explicitly in every CI run, so '
  + 'a green "verify (20)" is evidence the suite actually ran Node 20\'s toolchain, not just the '
  + "matrix label.\n\n"
  + '4) Count Cycle all-27-crit: turned out to be ALREADY FIXED, not a new bug. The backlog entry '
  + "cited a 2026-08-18 measurement, but a LATER-THAT-SAME-DAY PR had already run the exact "
  + 'discriminator the dispatch prescribed and fixed a real logic bug (a zero-active-item class '
  + 'was permanently uncoverable, hitting 17/27 stores via Condiment), measured crit 27 -> 12 on '
  + "the same real 7,347-row pull. Re-verified the fix and its 4 tests are still live and "
  + "passing; corrected the stale backlog entry in place with the settling commit chain, rather "
  + 'than redoing finished work.\n\n'
  + "5) Backlog sweep (scoped to §4/§14 per the dispatch): the Count Cycle correction "
  + "above is the actual yield; further §4 spot-checks either held up as accurate or were "
  + "inconclusive from code alone.\n\n"
  + '2 new test files, 2109/2109 tests passing, build clean, entry-eager payload within budget -- '
  + 'both code fixes touch already-lazy paths only. Full writeup, including the self-caught '
  + 'CHANNEL_YEAR_MIN_N mistake: memory/dispatch-79.md.',
]};
