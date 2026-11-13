// @ts-nocheck
export default {version:'5.759', date:'2026-11-13', changes:[
  '**KB cleanup (task #75, second batch 20 follow-up): located and wired `priority_brief`.** ' +
  'This article was flagged in batch 20 as a candidate whose real on-screen render target ' +
  'wasn\'t conclusively located. Traced it: panel id `priority-brief` (registry label "Priority ' +
  'Actions" — a known naming mismatch the article itself already documents) routes to ' +
  '`DistrictPriorityBrief`, whose own header reads "District Priority Brief" — an exact match ' +
  'for the article\'s documented on-screen title. Added the InfoIcon there. 1 render test ' +
  'mounting the real component and clicking the real icon. Full suite (7965 tests) and build ' +
  'pass clean (698.90 KB eager, budget 850 KB). Running total: 91 of 119 KB_ARTICLES keys wired.',
]};
