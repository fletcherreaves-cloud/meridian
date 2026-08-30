// @ts-nocheck
export default {version:'5.269', date:'2026-08-30', changes:[
  'EOM Share view -- the "corrections appear after the next sync" line (shown once a shared ' +
  'link auto-upgrades to a live rebuild) replaced with the actual sync cadence: re-syncs from ' +
  'QSRSoft every ~30 min, 8a-6p CT during EOM close. Owner feedback: a GM opening a shared link ' +
  'had no way to know how long to wait before a recount would show up -- the page already showed ' +
  '"synced through [time]" but the freshness caveat itself was vague. Copy-only change; the ' +
  'live-refresh mechanism (src/views/eom-share-view.js) is unchanged.' +
  '\n\n' +
  'Suite passing, build clean.'
]};
