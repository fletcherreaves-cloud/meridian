// @ts-nocheck
export default {version:'5.116', date:'2026-08-23', changes:[
  'Dispatch #76 -- the Forms pull was collapsing ~52% of every batch, and the constant ratio '
  + '(2.109x / 2.094x across two independently-sized chunks) looked systematic enough to worry '
  + "the completion-percent denominator was silently halved. Measured before touching anything, "
  + "widened from the dispatch's own \"dump one colliding group\" to every colliding group in a "
  + 'real 27-store/1-day pull (612 groups) once a single sample proved too small to generalize '
  + 'from. Two findings: the noLocation hypothesis (LOCATIONS=[...STORE_NSNS,\'noLocation\']) is '
  + 'REFUTED -- every collision shares the SAME real store location, never noLocation; and 65% '
  + '(398/612) of collisions are byte-identical true duplicates, where the dedup was already '
  + 'correct.\n\n'
  + 'The real finding, in the other 35%: 14 of 117 sampled differing groups (~12%) carry a '
  + 'genuine conflict, but not the "distinct occurrences, widen the key" shape the dispatch\'s own '
  + 'second branch expected -- the SAME scheduled occurrence (identical loc/formId/scheduledAt) '
  + 'reported as one or two stale MISSED role-group placeholders alongside one real completion '
  + '(completedBy/userId/startedAt/completedOn/timeToComplete all populated). The key is correct '
  + 'in every case. What was wrong: dedupeByConflictKey picked whichever row the API happened to '
  + 'return LAST -- a plain Map overwrite with no ordering guarantee. In all 14 measured cases the '
  + 'completed row was last (so production data for this window was already right, by luck), but '
  + 'nothing in the code enforced that -- a future response-order change could silently discard a '
  + "real completion in favour of a stale miss with zero error, the same failure shape dispatch "
  + "#71's escalation bug was about one layer in.\n\n"
  + 'Fixed by ranking colliding rows on outcome instead of array position: a genuine completion '
  + 'always outranks a missed/open row for the same occurrence; ties (the common case) still keep '
  + 'the last one, so all 4 of dispatch #71\'s original dedup tests pass unchanged. 5 new tests '
  + 'pin the fix at every array position (first/middle/last) using the real captured row shape, '
  + 'revert-sensitive by measurement (stashed the fix, watched the first/middle-position tests '
  + 'fail exactly as predicted while last-position and the tie-break case still passed). Re-ran '
  + 'the real pull over the full currently-covered window (2026-08-19 -> 08-23) with the fix live '
  + '-- 7,861 raw rows, 4,134 collapsed, 3,727 saved, 27/27 stores, to guarantee every stored row '
  + 'now reflects the deterministic rule rather than accidental ordering. The collapse log line is '
  + 'reworded (not deleted, per the dispatch\'s explicit instruction) to say what it resolves.\n\n'
  + "Panel completion percentages do not move from this fix -- the lucky ordering already held for "
  + "what's stored. No table constraint change, no key widening, no backfill beyond the routine "
  + 're-pull. Full writeup in memory/dispatch-76.md.\n\n'
  + '5 new tests. 192/192 test files, 2087/2087 tests, build clean, entry-eager payload unchanged '
  + '(Node-only pull script).',
]};
