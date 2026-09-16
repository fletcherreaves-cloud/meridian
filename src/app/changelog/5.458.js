// @ts-nocheck
export default {version:'5.458', date:'2026-09-16', changes:[
  'Location Demographics: fixed a second live bug in the same feature, found by the owner\'s ' +
  'second real click right after the v5.451 CORS fix deployed. Once census-proxy was reachable, ' +
  'every store failed with "No Census Tract found for coordinates ..." instead -- the proxy\'s ' +
  'geocode request hardcoded an unverified layers=10 parameter (a second guess from the original ' +
  'build, never live-tested for the same reason as the CORS bug: this sandbox blocks *.census.gov ' +
  'outright). Reached the Census Geocoder API\'s own documentation through non-census.gov mirrors: ' +
  '`layers` genuinely defaults to \'all\' when omitted, returning every geography layer keyed by ' +
  'NAME -- including "Census Tracts", the exact key already parsed client-side. Removed the ' +
  'hardcoded layers=10 param entirely rather than guess a second numeric ID.',
  '⚠️ Still not independently verified end-to-end -- same standing gap every Edge Function change ' +
  'in this repo has this session (no way to deploy or call the live function here). Needs a ' +
  'second `supabase functions deploy census-proxy --no-verify-jwt`, then a fresh "🔄 Refresh ' +
  'Demographics" click. Full findings: memory/project-location-demographics.md.',
]};
