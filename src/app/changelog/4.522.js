// @ts-nocheck
export default {version:'4.522', date:'2026-07-24', changes:[
  'Fix (systematic): the "vs LY" comparison was showing almost every store down ~26–33% — inaccurate. The shared pipeline summed the full current 4-week window for this year but last year only over whatever days happened to be in the data, so any gap in last-year coverage looked like a real ~30% decline. It now uses a matched-day comparison: a day only counts when BOTH this year and last year have real sales for it, so the two sides always span the identical calendar days (apples to apples). This corrects the Org Summary district vs-LY AND every per-store vs-LY at once. Where there genuinely isn\'t comparable last-year data, it now honestly shows "unavailable" instead of a false decline.',
]};
