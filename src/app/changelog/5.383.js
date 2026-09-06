// @ts-nocheck
export default {version:'5.383', date:'2026-09-06', changes:[
  'Second docs-only correction in the same pass as v5.382 (the #228/#231 mixup fix): that PR ' +
  'also claimed, wrongly, that bisectEarliestMonth "doesn\'t even appear in scripts/ anymore" ' +
  'for GitHub issue #285. It does -- the grep behind that claim only tested for the filename via ' +
  'a loose OR pattern and never actually tested for the function name, so "not found" was never ' +
  'really measured. Re-verified properly this time by reading the actual function.',
  'GitHub issue #285 (the inventory_history retention-probe\'s false-verdict bug) is ALSO already ' +
  'fixed -- through several owner review rounds (referenced in-file as PR #273, PR #284, and a ' +
  'further pass tied to #294), none ever closed this issue. confirmEarliestMonth now two-sidedly ' +
  'probes the month before and two months before any reported floor, widens outward hunting a ' +
  'genuinely-empty bound to re-bisect against when either has data, and returns unresolved:true ' +
  'rather than a wrong date if no widen probe ever comes back empty -- every return path labeled ' +
  'distinctly so a caller can\'t mistake "corrected but not reconfirmed" for "confirmed", exactly ' +
  'the overconfidence #285 was filed about. Closed with this evidence.',
  'Also corrected #289\'s real blocker: the issue claims its source workbook is committed at ' +
  'data/org-structure/ -- checked, and that\'s wrong (or refers to a different file). Only ' +
  'Organization_Structure.xlsx lives there (an unrelated org-roster file), and no targets ' +
  'workbook exists anywhere in the repo. Building the missing target fields without it would ' +
  'mean fabricating numbers -- not attempted. Left open, correctly, with the real blocker named.',
  'No code changes. Bundle: unchanged.',
]};
