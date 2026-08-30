// @ts-nocheck
export default {version:'5.264', date:'2026-08-30', changes:[
  'Dispatch #223 -- Fixes GitHub issue #362: src/views/at-a-glance.js\'s labInRange and ' +
  'channelRows both inverted this repo\'s standing "auto-first, manual as last-resort fill" rule ' +
  '(CLAUDE.md) -- a stale manual upload was silently overriding fresher auto-pulled data for the ' +
  'same (loc,date) instead of the other way around. Manual data is device-local IndexedDB (blank ' +
  'on every other device, frozen at the last upload), so this was wrong on every device except ' +
  'the one that uploaded, and indistinguishable from a real data problem once noticed.' +
  '\n\n' +
  'labInRange: swapped its two-loop merge so manual fills the map first and auto runs second ' +
  '(auto wins on a shared day). Read the block\'s own comment before touching it, per the issue\'s ' +
  'own instruction -- it narrated the Jul-2026 "reverts to old date" bug as the reason manual ' +
  'wins per-day, but that historical bug was actually about the OLD all-or-nothing code dropping ' +
  'every auto day once ANY manual row fell in range; the per-(loc,date)-key Map merge that fixed ' +
  'it only depends on both sides being unioned by day, not on which side is last-write-wins. ' +
  'Rewrote the comment to state that, rather than silently deleting the reasoning.' +
  '\n\n' +
  'channelRows: swapped its mergeFresh(lab, mergeFresh(led, mix)) call to ' +
  'mergeFresh(mergeFresh(led, mix), lab) -- the auto-combined Sales-Ledger/Sales-Mix layer is now ' +
  'primary (wins on a shared day), manual laborRows is secondary (gap-fill only). mergeFresh\'s ' +
  'own doc comment no longer hard-codes "primary=manual, secondary=auto" as the function\'s fixed ' +
  'meaning -- it\'s a generic (loc,day) union merge; each call site\'s own comment now states which ' +
  'real array it passes as which.' +
  '\n\n' +
  'Judgment call (flagged by the dispatch, not guessed at): mergeFresh\'s third caller, ' +
  'ctrlEffective, had the identical manual-primary inversion but issue #362 didn\'t name it. Fixed ' +
  'it here too -- neither ctrlAuto\'s own header comment nor anything else in the file documents ' +
  'manual-wins as an intentional Controls-specific choice, and laborSec\'s own nearby comment ' +
  '("mergeFresh\'s whole-row override meant that manual $0 TPPH row entirely replaced the day\'s ' +
  'ctrlAuto row [with real TPPH]") already documents this exact inversion causing a real bug that ' +
  'was worked around at the consumption site instead of fixed at the source. Same bug, fixed the ' +
  'same way: auto wins on a shared day, manual only fills a day auto doesn\'t cover.' +
  '\n\n' +
  'New file src/__tests__/dispatch-223-autofirst-merge.test.js (6 tests) renders the actual ' +
  'AtAGlance panel (not just the merge helper) for all three functions, each with a shared-day ' +
  'case (stale manual + fresh auto covering the same (loc,date) -- must resolve to auto) and a ' +
  'manual-only-day case (gap-fill must still work). Each shared-day case was run against the ' +
  'CURRENT unfixed code first and confirmed genuinely red (manual value showing, not just ' +
  'asserted) before the fix landed; all 6 pass after it. One test-authoring trap surfaced and was ' +
  'fixed in the test itself, not the code: a placeholder auto row added purely to satisfy the ' +
  'panel\'s top-level noData gate had been placed on the SAME day as the ctrlEffective gap-fill ' +
  'case\'s manual-only row, which (correctly, post-fix) let a field-empty auto row win and wipe ' +
  'the manual value -- exactly the whole-row-replace trap the laborSec TPPH comment already warns ' +
  'about, not a bug in the fix. Moved the placeholder to an unrelated day.' +
  '\n\n' +
  'Full test suite: 3404/3404 passing across 329 files. Build clean; eager payload 526.85 KB ' +
  'gzipped (budget 850 KB, 323.15 KB headroom) -- unchanged in shape, no new dependency.'
]};
