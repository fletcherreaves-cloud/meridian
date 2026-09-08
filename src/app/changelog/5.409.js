// @ts-nocheck
export default {version:'5.409', date:'2026-09-08', changes:[
  'Count Cycle now leads with a decision, not just a diagnosis -- dispatch28 Workstream F ' +
  '("voice by role", the owner\'s own standing principle: "an analyst needs a number, an ' +
  'operator needs a decision"). The dispatch\'s own cited evidence of the gap was this exact ' +
  'panel: \'Count Cycle said "No complete weekly count on record" to a store that had counted.\'',
  'buildCycleVerdict() (count-cycle.js) answers "so what do I do" in one imperative line -- ' +
  '"Count Food and Condiment today -- N days since the last complete count," "Finish the ' +
  'Condiment count from [date]," "Also do a Paper count." Shown ALONGSIDE the existing ' +
  'diagnostic exceptions text (never replacing it, per the standing rule\'s explicit both/and) ' +
  'in the in-app StoreCard headline and in the shareable weekly-compliance report (read on a ' +
  'phone, often without the app open at all).',
  '7 new regression tests (count-cycle.test.js) plus one against the real CountCycleSection -> ' +
  'StoreCard render (this repo\'s "verification must touch the call site" rule). Full suite ' +
  '4658/4658, build clean, 538.15 KB / 850 KB budget.',
]};
