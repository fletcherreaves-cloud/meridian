// ── Derive "notable weather day" candidates from raw daily observations ────────────────────────────
// Extracted from measure-weather-impact.mjs into its own pure/testable module (this environment's
// outbound proxy blocks archive-api.open-meteo.com — confirmed via its own status endpoint,
// `connect_rejected`/policy denial — so this logic can't be sanity-checked against a live fetch
// from here; unit tests against fixture data are the verification instead).
//
// Thresholds mirror getWeatherNote (src/engine/forecast.js) exactly — see that function's own
// comment for the rationale. Not imported from there directly: forecast.js pulls in `react` and
// other browser-oriented modules at import time and isn't Node-safe. If those thresholds ever
// change, update both spots.
export const WEATHER_THRESHOLDS = {
  extremeHeatTmax: 100,   // °F
  severeColdTmin: 20,     // °F
  monthNormDeviation: 15, // °F, |tavg - monthly norm|
  heavyRainIn: 0.5,       // inches
  highWindMph: 40,        // mph
};

// weatherRows: [{loc, date: Date, tmax, tmin, tavg, rain, wspd}, ...] (fetchOpenMeteoWeather's shape).
// Returns { [loc]: ['YYYY-MM-DD', ...] } — one entry per notable day, ready for
// measureEventLift's eventDatesByLoc parameter (src/engine/retail-events.js).
export function deriveWeatherCandidates(weatherRows, thresholds = WEATHER_THRESHOLDS) {
  const normKey = (loc, month) => loc + '_' + month;
  const monthSums = {};
  for (const r of weatherRows || []) {
    if (r.tavg == null) continue;
    const k = normKey(r.loc, r.date.getMonth() + 1);
    if (!monthSums[k]) monthSums[k] = { sum: 0, n: 0 };
    monthSums[k].sum += r.tavg; monthSums[k].n++;
  }
  const monthNorm = {};
  for (const [k, v] of Object.entries(monthSums)) monthNorm[k] = v.sum / v.n;

  const candidatesByLoc = {};
  for (const r of weatherRows || []) {
    const norm = monthNorm[normKey(r.loc, r.date.getMonth() + 1)];
    const notable =
      (r.tmax != null && r.tmax > thresholds.extremeHeatTmax) ||
      (r.tmin != null && r.tmin < thresholds.severeColdTmin) ||
      (norm != null && r.tavg != null && Math.abs(r.tavg - norm) >= thresholds.monthNormDeviation) ||
      (r.rain != null && r.rain > thresholds.heavyRainIn) ||
      (r.wspd != null && r.wspd > thresholds.highWindMph);
    if (!notable) continue;
    const dk = r.date.toISOString().slice(0, 10);
    (candidatesByLoc[r.loc] = candidatesByLoc[r.loc] || []).push(dk);
  }
  return candidatesByLoc;
}
