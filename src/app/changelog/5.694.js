// @ts-nocheck
export default {version:'5.694', date:'2026-11-08', changes:[
  '**Fixed drifted daypart-boundary bugs in DT Speed of Service, Morning Brief, and Store '+
  'Analytics (task #104).** Neither LifeLenz nor QSRSoft\'s DAR carries its own daypart/meal-'+
  'period concept — "daypart" is entirely a Meridian-side grouping of `hour_slot`, and the real '+
  'ground truth is the VLH guide\'s own published boundaries (Breakfast 5a-11a, Lunch 11a-2p, '+
  'Afternoon 2p-5p, Dinner 5p-11p, Late Night 11p-5a), already encoded as the one canonical '+
  'answer in `labor-standard.js`\'s `daypartOf()` since the owner\'s 2026-08-17 correction. Three '+
  'OTHER, independently hand-rolled daypart lists had never been reconciled to it: DT Speed of '+
  'Service\'s own `DAYPARTS` was still on the pre-correction boundaries — every daypart a full '+
  'hour EARLY (Breakfast counted from 4am, Dinner from 4pm, etc.) — plus a dead `00:00` Late '+
  'Night slot that can never match a real `qsr_daily_activity` row (confirmed live: `hour_slot` '+
  'runs `05:00`→`28:00` only). Morning Brief\'s "Today\'s Hourly Pace" and Store Analytics\' '+
  '"Daypart Pace" card both split Dinner/Late Night at 9pm instead of 11pm, silently moving two '+
  'real hours from Dinner into Late Night. All three now source their hour-slot lists from a new '+
  '`DAYPART_SLOTS` export (`labor-standard.js`), generated directly from `daypartOf()` so they '+
  'can never drift onto a different boundary set again. DT Speed of Service\'s daypart chart now '+
  'reflects the full, correct windows; Morning Brief / Store Analytics keep Late Night\'s leading '+
  '`05:00` slot (the tail of the PRIOR business day) excluded on purpose, since both are single-'+
  'business-day cards and Store Analytics\' live/done clock logic needs one contiguous window per '+
  'daypart.',
]};
