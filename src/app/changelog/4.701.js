// @ts-nocheck
export default {version:'4.701', date:'2026-07-31', changes:[
  'Share links are now LIVE, not frozen: a shared EOM report opens on the as-sent snapshot instantly, then re-pulls the freshest synced data and rebuilds itself — with a 🔄 Refresh button and a "synced through / refreshed at" line. So after a GM corrects counts, they (or anyone with the link) can hit Refresh and watch FOB + the uncounted list update, no re-send. The report is rebuilt client-side with the SAME engine the dashboard uses (new shared builder eom-report-build.js); the eom-share edge function serves live rows strictly scoped to that one store+period; the frozen snapshot remains a safe fallback. Corrections appear after the next sync (noted on the page).',
]};
