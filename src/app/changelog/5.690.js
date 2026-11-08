// @ts-nocheck
export default {version:'5.690', date:'2026-11-08', changes:[
  '**View As Role sandbox — pick a specific store or patch to mimic, plus a visible "@" tag '+
  '(owner request).** Previously "View as role" only simulated the nav/panel shape — an admin/'+
  'owner simulating a GM saw whichever store happened to sort first, and simulating a DO saw '+
  'every store in the district as if it were one patch. Now, once a store- or patch-altitude '+
  'role is picked, a second selector narrows it to one real store or one real supervisor\'s '+
  'patch — Game Plan, The Patch, and the Checklist/Bullets/Narrative tiles all reflect exactly '+
  'that narrowed set, including the RED/AMBER/GREEN counts. The always-on "viewing as" banner '+
  'and Curated Home\'s own header both show an "@ <name>" tag confirming what\'s being mimicked. '+
  'Operator-level mimicking already has its own picker (The Ledger, v5.689) and isn\'t duplicated here.',
]};
