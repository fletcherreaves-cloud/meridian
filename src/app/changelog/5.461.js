// @ts-nocheck
export default {version:'5.461', date:'2026-09-17', changes:[
  'Location Demographics: closed a diagnostic gap the previous fix (v5.460) introduced but never ' +
  'finished. The owner\'s fourth click showed the geocoder step now succeeds (no more WAF-block ' +
  'HTML), but the ACS step failed uniformly across all 27 stores with a bare "Census ACS HTTP ' +
  '502" -- census-proxy\'s v5.460 fix started returning a real {error, upstreamSnippet} diagnostic ' +
  'body on a bad response, but census-demographics.js\'s client-side error handling discarded it ' +
  'on every !resp.ok branch and threw only the bare HTTP status.',
  'Fixed: both geocodeToTract and fetchAcsForTract now read the proxy\'s error body and include ' +
  'its message + a snippet of the actual upstream response in the thrown error. Whatever the next ' +
  'failure (if any) actually is -- a real Census-side 502, a still-blocking WAF, or something new ' +
  '-- it will now say so directly instead of requiring another screenshot round-trip.',
  'Client-side only -- no Edge Function change, so no `supabase functions deploy` needed this ' +
  'time. Ships on the normal merge-to-main deploy. 2 new tests (the diagnostic detail surfacing, ' +
  'and the safe fallback when the error body is missing/unreadable). Full suite 526/526 files, ' +
  '5030/5030 tests. Build clean, eager payload 551.26 KB gzip (budget 850 KB).',
]};
