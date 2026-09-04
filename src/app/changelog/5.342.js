// @ts-nocheck
export default {version:'5.342', date:'2026-09-04', changes:[
  'Fix: Open-Meteo weather fetch (fetchOpenMeteoWeather, src/constants.js) requested ' +
  '&temperature_unit=fahrenheit but never set &precipitation_unit or &wind_speed_unit -- Open-' +
  'Meteo\'s defaults for those are millimeters and km/h, not the inches/mph every consumer of ' +
  'weatherRows.rain/wspd assumes (forecast.js\'s getWeatherNote/isWeatherExtreme, signal-' +
  'registry.js\'s wxRain/wxWind Scanner metrics [unit:\'in\'/\'mph\'], and the brand-new ' +
  'measure-weather-impact.mjs [Events Phase 2 (3/3), v5.341]). Found live: the first real ' +
  '(non-proxy-blocked) run of measure-weather-impact.mjs --dry, run by the owner locally right ' +
  'after v5.341 shipped, flagged 18,159 of 44,955 store-day rows (40%) as "notable weather" -- ' +
  'implausibly high for extreme-heat/cold/rain/wind days -- with a suspiciously uniform ~1-5% ' +
  'negative sales lift across all 27 stores. Root cause: 0.5mm of rain (trivial, fires on nearly ' +
  'any rain at all) and 40 km/h max wind (~25mph, an ordinary breezy day) were being compared ' +
  'against thresholds written for 0.5 inches and 40 mph. Pre-existing bug, not introduced this ' +
  'session -- getWeatherNote\'s in-app "🌤 Heavy rain (0.62\\")" / "High winds (43 mph)" notes ' +
  'have been mislabeling raw mm/km-h values as inches/mph the whole time; only surfaced now ' +
  'because this was the first time real weatherRows data got compared against a fixed, ' +
  'measurable threshold at scale rather than judged by eye per-day.',
  'Fix is at the source: added &precipitation_unit=inch&wind_speed_unit=mph to the Open-Meteo ' +
  'request, matching the existing &temperature_unit=fahrenheit pattern -- corrects all three ' +
  'downstream consumers at once, no threshold/label changes needed anywhere else since they ' +
  'already assumed inches/mph.',
  'Full suite (4317 tests) and build both clean (534.31 KB / 850 KB eager budget). ' +
  'dispatch-weather-candidates.test.js unaffected (its fixtures already use correct units -- ' +
  'the bug was upstream of deriveWeatherCandidates, not in it). Could not re-verify the live ' +
  'fetch from this environment (Open-Meteo still proxy-blocked here) -- the owner should re-run ' +
  '`node scripts/measure-weather-impact.mjs --dry` after pulling this fix and confirm the ' +
  'candidate count drops to a plausible single-digit percentage before the first real run.',
]};
