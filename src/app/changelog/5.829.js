// @ts-nocheck
export default {version:'5.829', date:'2026-11-18', changes:[
  '**Fix: OEPE w/o Parked by Daypart report failing to load live ("DATA INCOMPLETE 137 page(s)").**' +
  ' The v5.828 widening fetched the FULL day\'s hourly rows (all 24 hour_slots) across the entire ' +
  'YTD date range with no hour_slot filter, to let every daypart tab switch instantly with no ' +
  're-query — ~209 pages against qsr_daily_activity in one go, and 137 of them failed live. ' +
  'Each daypart/custom-range change now fetches only the hour_slots that daypart actually needs ' +
  '(2-12, not 24, the same proven inCol/inVals pattern loadDaypartActivity already uses), ' +
  'refetching on tab/range change instead of one giant upfront pull — already-viewed dayparts in ' +
  'the same Run are cached so flipping back to one is still instant. `loadOepeHourlyActivity` now ' +
  'requires an explicit `hourSlots` array (returns `[]` if omitted), guarding against ever ' +
  'regressing to an unfiltered full-day scan.',
]};
