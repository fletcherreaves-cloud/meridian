// @ts-nocheck
export default {version:'5.110', date:'2026-08-22', changes:[
  'Dispatch #69 follow-up -- the Model Check caption fixed earlier today (from "Weak agreement '
  + 'so far" to a countdown toward a power threshold) itself claimed more than the data '
  + 'supports. memory/finding-cfv-predictability-ceiling-2026-08-22.md measured, on 217 real '
  + 'CFV visits, that store identity explains only ~9% of visit-to-visit variance (marginal, '
  + "p=0.092) -- capping ANY store-level predictor's rank correlation near ~0.30. The "
  + 'countdown was powering toward rank corr >= 0.4, which is ABOVE that ceiling and '
  + "unreachable at any sample size, so \"you'll know by <month>\" was an unsafe promise, not "
  + 'just an unreachable one -- re-pointing it at a lower threshold would have repeated the '
  + 'same error.\n\n'
  + 'Retired the whole countdown mechanism. In its place: "Part D0" (also named the same day) '
  + 'splits the Model Check pairs by graded-visit reportType before computing anything -- CFV '
  + 'and RGR are different instruments with very different pass rates (CFV 55.3% meeting 80% '
  + 'in 2026, RGR ~100%), and pooling them depresses a correlation on its own, independent of '
  + "model quality. The panel now shows each instrument's own rank corr, and for CFV "
  + 'specifically, its measured ceiling beside it: "CFV: 0.23 (n=27) against an estimated '
  + 'ceiling of ~0.30 -- ~77% of the achievable maximum, not weak." No strength ladder, no '
  + "countdown, no promise the data can't back.\n\n"
  + "Also fixed the print/PDF report's OWN separate strength-ladder text (\"Weak agreement so "
  + 'far"), which the original same-day fix never touched since it only changed the on-screen '
  + 'caption -- the panel and the printed report were about to disagree in their CLAIM about '
  + 'one number, the same class of defect as this project\'s standing "diff the two '
  + 'computations" lesson, just in wording instead of arithmetic.\n\n'
  + '10 changed/new tests across 2 files, all demonstrated revert-sensitive (fail cleanly '
  + 'against the pre-fix code). 2040/2040 full suite, build clean, no entry-chunk change. Full '
  + "writeup in memory/dispatch-69.md's Resolution section.",
]};
