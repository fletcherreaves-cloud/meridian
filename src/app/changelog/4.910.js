// @ts-nocheck
export default {version:'4.910', date:'2026-08-08', changes:[
  'FIXED — Dialed-In calibration and the 6W/4W/2W/1W trend columns. A last-year comparison was skipped whenever the day it pointed at carried an event tag, and one store had 450 tagged days, so every candidate was rejected and the comparison came back empty for 146 of 146 days. Real sales existed on every one of those days. Last-year lookups now fall back to using a tagged day rather than giving up; genuine closures are still excluded.',
  'The version shown in the footer is now taken from the top of this changelog instead of being typed separately. The two had drifted 20 versions apart, so a hard refresh looked like it had failed.',
]};
