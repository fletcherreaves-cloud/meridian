// @ts-nocheck
export default {version:'5.119', date:'2026-08-23', changes:[
  'Top/Bottom Performers now says what its numbers actually are. The ranked figure is the mean '
  + 'of each store\'s DAILY values over the window -- correct for counts like Sales, Guest Count '
  + 'and OT Hours, but for a RATIO it is an average-of-averages, where a slow Tuesday weighs the '
  + 'same as a busy Saturday. 10 of the 16 metrics offered are ratios: TPPH, Avg Check, Labor %, '
  + 'Cash O/S %, both T-Reds, Discount %, Comp Waste, Raw Waste and Stat Variance. A bare '
  + '"Labor %" label implied the period figure a P&L would show. It now reads as a daily '
  + 'average, so the basis is on the surface rather than assumed.\n\n'
  + 'The engine comment claimed the "never average averages" rule was satisfied BY CONSTRUCTION '
  + 'with "no aggregate to get wrong". That was true for the cross-store dimension and false '
  + 'across days -- and the confident wording was the more dangerous half, because it would stop '
  + 'the next reader from checking. Corrected and scoped, with the size of the gap cited: it is '
  + 'already measured elsewhere in this repo (metric-source.js\'s rollup caveat -- SPPH on store '
  + '5985 for 2026-08 is $70.18/hr as mean-of-daily vs $67.04/hr as true Sum/Sum, a 4.5% gap).\n\n'
  + 'Consequence to keep in mind while this stands: on those 10 metrics a leaderboard can '
  + 'mis-order two close stores. True Sum/Sum needs metricSeries to return a numerator and '
  + 'denominator rather than the finished ratio, which is real work that would serve every '
  + 'consumer of a ratio rollup rather than just this panel -- deferred with the owner\'s '
  + 'approval and recorded in memory/dispatch-77.md so it is findable later.\n\n'
  + 'Revert-sensitive: the new test renders the actual panel and asserts the caption text, '
  + 'confirmed by reverting the view and watching it fail.\n\n'
  + '1 new test. 195/195 test files, 2099/2099 tests, build clean, entry-eager payload unchanged.',
]};
