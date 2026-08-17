// @ts-nocheck
export default {version:'4.497', date:'2026-07-24', changes:[
  'Fix: the "This Week — District Projection" table on the home screen had its OK/FL state tags inverted — every Florida store was labeled OK and every Oklahoma store FL. Root cause was a local org-mapping helper that was backwards relative to the rest of the app (canonical: MCDOK = Oklahoma, Emerald Arches = Florida). Labels now match each store\'s real state.',
]};
