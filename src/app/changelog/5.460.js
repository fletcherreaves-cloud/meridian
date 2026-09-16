// @ts-nocheck
export default {version:'5.460', date:'2026-09-16', changes:[
  'Location Demographics: fixed a THIRD live bug in the same feature, found by the owner\'s ' +
  'third real click. After the layers=10 fix, every one of 27 stores failed with "Unexpected ' +
  'token \'<\', \"<html styl\"... is not valid JSON" -- uniform across every store/coordinate, ' +
  'which rules out a per-tract data issue and points at the Edge Function\'s own outbound fetch ' +
  'to census.gov getting a 200-OK HTML page back instead of JSON.',
  'Root cause: census-proxy passed the upstream response through verbatim with a hardcoded ' +
  'Content-Type: application/json header, without ever checking whether the body was actually ' +
  'JSON. Deno\'s fetch sends no realistic User-Agent by default, and .gov sites commonly sit ' +
  'behind a WAF that serves a 200-OK bot-block/challenge page to non-browser clients instead of ' +
  'a 4xx -- so resp.ok alone can\'t tell a real API response from a block page.',
  'Fixed two ways: (1) both outbound fetches (geocoder + ACS) now send a real browser-like ' +
  'User-Agent, the standard fix for this WAF-block class; (2) the response is now JSON.parse-d ' +
  'before being relabeled as application/json -- a non-JSON body now returns a clear 502 naming ' +
  'which upstream call failed plus a 300-char snippet, instead of an opaque client-side parse ' +
  'error. If (1) doesn\'t fully resolve it, the NEXT failure (if any) will self-diagnose instead ' +
  'of requiring another screenshot round-trip.',
  '⚠️ Still not independently verified end-to-end -- same standing gap every Edge Function change ' +
  'in this repo has this session. Needs a third `supabase functions deploy census-proxy ' +
  '--no-verify-jwt`, then a fresh "🔄 Refresh Demographics" click. Full findings: ' +
  'memory/project-location-demographics.md.',
]};
