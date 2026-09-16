// @ts-nocheck
export default {version:'5.451', date:'2026-09-16', changes:[
  'Fixed Location Demographics live bug (Task #58 follow-up): the owner\'s first real click of ' +
  '"🔄 Refresh Demographics" failed for all 27 stores with "Census geocoder request failed: ' +
  'Failed to fetch" -- the standard browser symptom of a cross-origin fetch the target server ' +
  'never sends Access-Control-Allow-Origin for. The original build\'s claim that the Census ' +
  'Geocoder/ACS5 APIs are "CORS-enabled" was never actually verified (this session\'s sandbox ' +
  'blocks *.census.gov outright, so it shipped on an unmeasured assumption) and turned out wrong.',
  'Fixed by routing both Census calls through a new Edge Function, supabase/functions/' +
  'census-proxy (server-to-server, no browser CORS involved) -- keyless, no secrets needed. ' +
  'Every line of the actual parsing/shaping logic (shapeAcsRow, the -666666666 null-sentinel ' +
  'handling) is unchanged; only the URL the two fetches hit changed. ⚠️ Needs `supabase ' +
  'functions deploy census-proxy --no-verify-jwt` before the button works.',
  '15 tests in census-demographics.test.js (2 new: a proxy network-failure case and the ' +
  'missing-auth guard), 6 in location-intel-demographics.test.js, updated to assert the proxy ' +
  'call shape. Full suite 521/521 files, 4993/4993 tests. Build clean, eager payload 550.62 KB ' +
  '/ 850 KB. Full write-up: memory/project-location-demographics.md.',
]};
