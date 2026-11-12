// @ts-nocheck
export default {version:'5.745', date:'2026-11-12', changes:[
  '**HME Cloud + Squadle automated pulls (task #105), Phase 1.** Both new data sources are ' +
  'built and live-validated end-to-end against real credentials: `scripts/hme-cloud-pull.mjs` ' +
  '(drive-thru timer/DT timing, all stores, two-step REST login) and `scripts/squadle-pull.mjs` ' +
  '(food-safety checklist, item-level daily records). Squadle’s real auth chain needed a ' +
  'step the public docs never mention — a `createRealtimePermissionSession` exchange before ' +
  'the sharded `sqdl-prod-cd-NNN` databases will accept a token — and its real wire protocol ' +
  'fragments large responses across multiple WebSocket frames, which this pull now reassembles ' +
  'correctly (see `memory/finding-hme-squadle-integration-2026-11-06.md` for the full account). ' +
  'New Supabase tables `hme_dt_daily` / `squadle_checklist_records` ' +
  '(`supabase/schema-hme-cloud-dt.sql` / `schema-squadle-checklist-records.sql` — **owner ' +
  'DDL run still pending**), two new GitHub Actions workflows, both registered in ' +
  '`sync-failure-watch.yml`. `stream-freshness.js` STREAMS entries deliberately deferred ' +
  '(commented-out placeholders, same precedent as payrollReadiness/payHistory) — surfacing ' +
  'the data in a real panel is Phase 2, not started here. 11 new tests ' +
  '(`hme-cloud-pull.test.js`, `squadle-pull.test.js`); build clean. Needs new GitHub Secrets: ' +
  '`HME_USERNAME`, `HME_PASSWORD`, `SQUADLE_USERNAME`, `SQUADLE_PASSWORD`.',
]};
