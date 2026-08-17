// @ts-nocheck
export default {version:'4.866', date:'2026-08-07', changes:[
  'Count history is now recorded permanently. On-hand data only ever kept each item\'s LAST count date, so a recount erased the previous one — meaning "was the last weekly complete?" was answerable but "were all four weekly counts complete last month?" never could be. A daily snapshot now preserves each count session as it happens. History builds forward from today; counts already overwritten cannot be recovered.',
]};
