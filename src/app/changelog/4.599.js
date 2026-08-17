// @ts-nocheck
export default {version:'4.599', date:'2026-07-29', changes:[
  'EOM uncounted-item diagnosis now explains WHY each item reads uncounted: NEVER counted (a true blank), counted EARLY this period (QSRSoft shows it counted — a cascade discussion, not free money), or STALE / prior-period (likely an obsolete / discontinued / inactive item carrying a residual on-hand). The class-chip hover shows each item\'s state + last-counted date, and the engine now separates true blanks from early/stale so value-at-risk isn\'t overstated. Resolves the "12 uncounted that QSRSoft doesn\'t flag" question.',
]};
