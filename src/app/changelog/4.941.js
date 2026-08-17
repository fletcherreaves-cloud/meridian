// @ts-nocheck
export default {version:'4.941', date:'2026-08-10', changes:[
  'FIXED — "Attention Now"\'s sales-behind-LY check only looked at whichever single week you had selected, so a real multi-week decline could slip through if that one week happened to look okay (and vice versa, a genuinely bad single week could get buried under a longer-term average). It now also checks the trailing 4 weeks and surfaces whichever view — this week or the last month — shows the worse decline, so a real trend can\'t hide behind a decent week.',
]};
