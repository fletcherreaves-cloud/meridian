// @ts-nocheck
export default {version:'5.497', date:'2026-10-06', changes:[
  'Audited recent failed-pull emails (owner: "I am getting a lot of emails"). Top cause is NOT ' +
  'new: QSRSoft Security Events Pull (32 of the last 100 failures, 12 runs/day) has been failing ' +
  '100% of units with AUTH_FAILED:403 and qsr_security_events still has zero rows ever -- this is ' +
  'the same unresolved issue from dispatches #81/83/91/95; the 2-hour-cadence fix tried there has ' +
  'not worked. QSRSoft Register Audit Pull shows the identical fully-authenticated-still-denied ' +
  'signature on a sibling Controls report. Both need the owner to check QSRSoft account/role ' +
  'permissions for the Controls report category -- not fixable from this repo. "Sync Failure ' +
  'Watch" showing up as a top failure source is a false alarm (concurrency cancellations, not ' +
  'real errors).',
  'Found and fixed a real, different bug: YouTube Mentions Pull crashed on every run that found ' +
  'new content, silently losing it, because its workflow pinned Node 20 and a bare createClient() ' +
  'throws setting up Supabase\'s Realtime sub-client on Node 20 (no native WebSocket) -- right ' +
  'before the real upsert ever ran. A run with nothing new returned early and looked fine, which ' +
  'is why this read as intermittent rather than systemic. Fixed by bumping node-version to 22, ' +
  'matching every other active pull workflow (news-rss-pull.yml already on 22). Checked the other ' +
  'two Node-20-pinned workflows (lifelenz-vlh-explore/sync) -- neither touches createClient, not ' +
  'exposed to this bug.',
  'Full writeup: memory/finding-failed-pull-email-audit-2026-10-06.md. No src/ changes -- ' +
  'workflow YAML only. Full suite: 5268/5268 passing (unaffected).',
]};
