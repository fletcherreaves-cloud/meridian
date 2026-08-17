// @ts-nocheck
export default {version:'4.912', date:'2026-08-08', changes:[
  'FIXED — the 6-Week Performance chart could plot impossible numbers (a y-axis reaching 1,200,000%). Year-over-year growth was measured against last year\'s same weekday even when that day was a closure with almost no sales — Christmas, Thanksgiving, the January ice storm. Dividing by an $8.98 day turns a normal day into a six-figure percentage. Those days are now left out of the trend instead of being treated as a real comparison.',
  'The cutoff is drawn from the data, not picked: of 40,000 store-days, 98.4% fall at or above 70% of their own store\'s typical day and only 76 fall below 25%. Genuine strong years and real declines are still reported in full.',
]};
