// @ts-nocheck
export default {version:'5.125', date:'2026-08-23', changes:[
  'Dispatch #81 -- rebuilt the security-events pull on in-browser fetch; both of its old auth '
  + 'paths could never have worked. memory/finding-api-security-transport-fingerprint-2026-08-23.md '
  + 'proved api.security.myqsrsoft.com 403s on TLS/HTTP-2 client fingerprint, not credential -- '
  + "the owner's own working browser token 403'd from Node on the owner's own machine and network, "
  + "with Chrome's full header set. scripts/qsrsoft-security-events-pull.mjs's \"primary\" bare "
  + 'Node fetch and its \"Playwright fallback\" (which captured a token in-browser but then handed '
  + 'it BACK to a Node-side fetch) both always hit that wall -- the script has never once been '
  + 'able to succeed.\n\n'
  + 'Rewrite: the ONLY auth/fetch path is now real Chromium SPA login -> capture X-Auth-Token from '
  + 'a live request -> one page.evaluate() PER (store, date, event_token) unit, the actual fetch() '
  + 'running inside the page context with an explicit X-Auth-Token header and no '
  + "credentials:'include' -- mirroring qsrsoft-dar-pull.mjs's proven pattern for the sibling host "
  + 'api.reports.myqsrsoft.com. No token ever crosses back into a Node-side fetch. This is a '
  + "deliberate, documented exception to the repo's normal two-path auth rule -- there is no "
  + 'viable direct-token path for this host, so keeping a bare-fetch primary would only make every '
  + 'failure look like a token problem. Same 27 stores, same 8 EVENT_TOKENS, same date-range/gap '
  + 'detection, same parse/tokenize/save pipeline, same buildUrl/buildBody/extractRows pure '
  + 'helpers -- unchanged signatures, still covered by the existing (unmodified) test file. '
  + 'Corrected two stale comments the dispatch named: the script header no longer states the '
  + 'refuted "network-origin restriction" theory as settled fact, and the workflow file '
  + "(qsrsoft-security-events-pull.yml) no longer repeats it either.\n\n"
  + 'NOT live-verified -- this sandbox has no QSRSoft credentials and no QSRSoft network access at '
  + 'all, so the real fix (does the in-browser fetch actually reach the API) is unproven from here. '
  + 'Also explicitly skipped, both needing the actual self-hosted qsr-security runner: testing '
  + 'whether a hosted ubuntu-latest runner now works (the network-origin theory that justified '
  + 'self-hosting is refuted, but that is a separate, later test per the dispatch), and probing '
  + 'api.reports routes to correct CLAUDE.md\'s "requires browser session cookies" claim. Owner '
  + 'action items for both are in memory/dispatch-81.md\'s Resolution section. Verification bar met '
  + 'here: node --check clean, existing qsrsoft-security-events-pull.test.js passes unmodified, '
  + '2114/2114 tests passing, build clean.',
]};
