// @ts-nocheck
export default {version:'5.429', date:'2026-09-11', changes:[
  'Forecast accuracy investigation -- owner asked for a real analysis of why "MBI vs LifeLenz ' +
  'Accuracy" shows LifeLenz winning more often than not, and a theory on the cause. Measured ' +
  'against 6,653 real matched (loc, date) pairs (Jan 1 - Sep 10 2026): LifeLenz wins 57.3% of ' +
  'days, mean |var%| 6.74% vs MBI\'s 7.66%. Full writeup: ' +
  'memory/finding-simple-model-holiday-blindness-2026-09-11.md.',
  'Fixed one concrete, measured contributor: the "simple" model (forecastSimple in ' +
  'src/engine/forecast.js) had zero holiday awareness -- no isHoliday()/getHolidayAdj() call ' +
  'anywhere, unlike the engineered/DOW pipeline which already corrects for holidays. On the 293 ' +
  'holiday days in the sample, MBI\'s disadvantage nearly triples (2.71pp vs 0.92pp overall). Now ' +
  'multiplies by the same getHolidayAdj() the engineered pipeline uses when isHoliday(date) is ' +
  'true -- stays leak-free (getHolidayAdj only ever looks at prior years). 2 new regression tests ' +
  'in forecast.test.js, confirmed to fail against the pre-fix code (exact 0.20 gap).',
  'Holidays are only ~4.4% of days, so this does not explain the bulk of the gap -- the majority ' +
  'is still open. Built the mechanism to actually test the owner\'s own theory ("LifeLenz reacts ' +
  'up to day-of, arguably the crucible") with real data instead of guessing: a new immutable ' +
  '`lifelenz_forecast_captures` table (supabase/schema-lifelenz-forecast-captures.sql) that ' +
  'lifelenz-pull.mjs now writes to daily, one row per (loc, target_date, captured_date), so a ' +
  'lead-time curve accumulates per date going forward. lifelenz_schedule upserts on (loc,date) ' +
  'and destroys prior lead-time state on every pull, so this could not be backfilled -- only ' +
  'captured from here on. Includes the owner\'s specific ask ("Thursday before the work week, 6 ' +
  'days out") as a plain filter on this shape, not a special case. Design + rationale: ' +
  'memory/project-lifelenz-leadtime-capture-2026-09-11.md. 5 new tests in ' +
  'lifelenz-forecast-lead-time-capture.test.js against the real exported buildLeadTimeCaptures().',
  'Needs the owner to run the new schema SQL in the Supabase SQL Editor before captures start ' +
  'writing (fails non-fatally with a warning until then, same as every other secondary write in ' +
  'this script) -- and needs a few weeks of daily pulls before the Thursday/6-day slice has a ' +
  'real sample.',
  'Full suite 503/503 files, 4754/4754 tests, build clean, 541.49 KB / 850 KB eager-payload budget.',
]};
