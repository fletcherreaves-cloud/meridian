// @ts-nocheck
export default {version:'5.462', date:'2026-09-17', changes:[
  'Location Demographics: found the real root cause of the fourth failure, thanks to the ' +
  'diagnostic detail v5.461 added -- the ACS step\'s error message now showed Census\'s own upstream ' +
  'HTML page, titled "Missing Key." That is NOT a bot/WAF block: the Census Bureau made an API key ' +
  'mandatory for every Census Data API request as of 2026-05-12 (previously only required for ' +
  'high-volume use), which is why this app\'s original "both APIs are keyless" assumption was true ' +
  'when written and quietly went stale without this app changing anything. The Geocoder ' +
  '(TIGERweb) is a separate Census service, unaffected -- that\'s why the earlier User-Agent fix ' +
  'fully resolved the geocoder step and only ACS kept failing.',
  'Fix: census-proxy\'s ACS request now appends a key, read from a new CENSUS_API_KEY Supabase ' +
  'secret. A missing secret now fails with a clear, actionable error (the signup URL + the exact ' +
  '`supabase secrets set` command) instead of silently re-hitting the same Missing Key page.',
  '⚠️ Needs real owner action this time, not just a redeploy: (1) sign up for a free key at ' +
  'api.census.gov/data/key_signup.html and click the activation link in the confirmation email, ' +
  '(2) `supabase secrets set CENSUS_API_KEY=<key>`, (3) `supabase functions deploy census-proxy ' +
  '--no-verify-jwt`, (4) a fresh Refresh Demographics click. Full findings + sources: ' +
  'memory/project-location-demographics.md.',
]};
