// @ts-nocheck
export default {version:'4.875', date:'2026-08-07', changes:[
  'Inventory variance trace now loops back to the last ACTUAL PHYSICAL COUNT instead of the calendar month, so the chart brackets the window a variance actually occurred in. The header names the window ("since the last count (Aug 5)"). It deliberately walks back past a count taken in the last few days — anchoring on yesterday would collapse the chart to two points. Note the trace still cannot cross a month boundary: qsr_fob snapshots are month-to-date cumulative and reset at month start.',
]};
