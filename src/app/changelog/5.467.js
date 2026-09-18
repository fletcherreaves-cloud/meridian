// @ts-nocheck
export default {version:'5.467', date:'2026-09-18', changes:[
  'Discussion One-Pager: pre-populates the Supervisor name in its "who <-> whom" line instead ' +
  'of always printing two hand-fill blanks. New resolveDiscussionNames() (engine/one-pager.js) ' +
  'reads whoRan() (constants.js, the same effective-dated org-assignment lookup Management\'s ' +
  'Supervisor Assignments editor is built on), as-of the review period\'s own end date -- a ' +
  'sheet printed for a past period names whoever actually ran the store/patch then, not whoever ' +
  'runs it now if a reassignment happened since.',
  'Only the Supervisor side of a cascade pairing is resolvable this way: Supervisor -> GM fills ' +
  'the first blank, DO -> Supervisor fills the second, and Owner -> DO stays fully blank -- ' +
  'Owner/DO/GM have no equivalent assignment data anywhere in the app, so those are left for ' +
  'hand-fill rather than guessed.',
  '8 new tests (resolveDiscussionNames\'s per-cascade-level resolution, as-of-date correctness ' +
  'across a mid-history reassignment, and the actual printed HTML for both the resolved and ' +
  'still-blank cases) against the real exported functions -- would fail on a revert. Full suite ' +
  '530/530 files, 5049/5049 tests. Build clean, eager payload 551.31 KB gzip (budget 850 KB).',
]};
