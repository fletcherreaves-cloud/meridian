// @ts-nocheck
export default {version:'5.108', date:'2026-08-22', changes:[
  'Dispatch #69 -- Visit Readiness overstated its own certainty, in both directions. '
  + "Fixed the \"Food Safety\" mislabel: the flag reads waste/inventory-variance proxies "
  + '(stat variance %, raw waste %), which has zero overlap with what an EcoSure Food Safety '
  + "visit actually assesses (temperatures, pests, handwashing, shelf life, checklist "
  + "competence -- confirmed against McDonald's own PACE Food Safety guide). Renamed to "
  + '"Waste & variance" throughout, and fixed the real bug the mislabel was hiding: an '
  + "elevated flag used to PRE-EMPT the store's actual coaching verdict as the headline, even "
  + 'for a store whose readiness band was \'ready\' (the two are computed independently by '
  + 'design). Displaced the real blocker on 10/27 stores -- Ardmore-Broadway showed FS '
  + 'elevated while its real EcoSure audit scored 86/100 and met target. Now the band-driven '
  + 'verdict always leads; an elevated flag is a secondary note, never the headline.\n\n'
  + 'Fixed the Model Check caption the opposite direction: it asserted "Weak agreement so far" '
  + 'off a 27-visit sample whose own 95% CI (rank corr -0.16 to 0.56) cannot distinguish a '
  + 'useless model from a good one -- that is evidence of a small sample, not a weak model. '
  + 'Below the statistical-power threshold (46 pairs, an 80%-power calculation for detecting '
  + 'rank corr >= 0.4 -- not invented, taken from a prior field-notes analysis), the panel now '
  + 'reports progress toward enough data instead of a verdict: "27 of ~46 visits needed to '
  + 'tell -- next check ~<month>," using the district\'s settled 81 visits/yr cadence (27 '
  + 'stores x 3 CFV visits/yr). The rank-corr and direction-match numbers are unchanged and '
  + 'still shown -- only the caption\'s claim changed.\n\n'
  + 'Also: the "Report detail" toggle used to sit among the scope filter pills, styled '
  + 'identically to All/OK/FL (which DO change the view) while only affecting the print '
  + 'report -- reads as broken. Moved to a split dropdown on the Report button itself '
  + '(Report ▾ -> Full audit / Summary), each option printing immediately.\n\n'
  + 'Revert-sensitive test renders the actual panel and confirms it (not just the engine) '
  + 'shows the honest caption. 2036/2036 tests (7 new), build clean, no entry-chunk change '
  + '(lazy-loaded panel). Full writeup in memory/dispatch-69.md.',
]};
