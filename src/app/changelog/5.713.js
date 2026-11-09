// @ts-nocheck
export default {version:'5.713', date:'2026-11-09', changes:[
  '**🔖 Rolling Forecast — Commit & Drift, v1 (owner-directed 2026-11-09): "does the lock even '+
  'need to exist in this scenario... simpler is always better... just never lose the power '+
  'behind it."** Generalizes the proven LifeLenz-captures pattern (a daily snapshot, never '+
  'overwritten) to Meridian\'s own forecast engine. A new daily job (`scripts/forecast-rolling-'+
  'capture.mjs`, GitHub Action, 13:00 UTC) appends today\'s forecast read for every store — 60 '+
  'days forward daily, 12 weeks forward weekly (summed from 7 daily reads; no separate '+
  '`forecastWeek()` exists) — to `forecast_rolling_captures`. **"Committing" a period no longer '+
  'freezes a number — it names which captured day is the official plan**, a thin pointer in '+
  '`forecast_commits` (append-only history in `forecast_commit_history`). Drift is the live '+
  'comparison between the freshest capture and the committed one, reusing the existing '+
  '`settings.tolerance||5` forecast-tolerance convention for its tiers: on-track '+
  '(≤tolerance), watching (≤2×tolerance), alert (beyond). An alert fires both in-app and push '+
  '(`app_notifications`, same framework/dedupe `movers-alert-run.mjs` already proved), checked '+
  'right after each day\'s captures are written.\n\n'+
  '**Deliberately additive — the existing Week/Month Lock (`locked_projections`) is untouched '+
  'in this pass.** It turned out to be far more deeply embedded than a simple UI relabel (org-'+
  'wide `org_config`, 5+ Knowledge Base articles/tests, `App.js` state, localStorage export '+
  'keys) — migrating or replacing it is real, separate follow-up work once Commit & Drift has '+
  'proven out, not something to risk in the same pass that introduces the new system. Projection '+
  'Workspace\'s left rail gets a new "🔖 Commit & Drift" card (district-wide worst-tier status) '+
  'and a Commit & Drift panel: a "🔖 Commit this week" action that points every store at its own '+
  'freshest captured weekly forecast (skipping any store the capture job hasn\'t reached yet — '+
  'self-heals, never fabricates a number), plus a live drift table across both daily and weekly '+
  'periods (the day-level surface the directive asked for, folded into the same read-only view '+
  'rather than a separate screen). A full revision-history browser ("View forecast history") is '+
  'a deliberate v1 stub — the underlying log is already complete in `forecast_rolling_captures`; '+
  'only the dedicated viewer UI is deferred.\n\n'+
  '**At A Glance\'s projection-lock surfaces are re-pointed, not duplicated (owner\'s own call, '+
  'same session: "you can decide its fate").** The Action Checklist\'s "missing this week\'s '+
  'projection lock" item and the Forecast Accuracy tile\'s "N/27 locked" stat now read '+
  '`forecast_commits` (period_type=\'weekly\', target_period=this week\'s Monday) instead of the '+
  'old `lockedProjections` blob, with the label text changed Lock→Commit in both spots — same '+
  'slot, same shape, one pointer swapped rather than a second parallel system. Every other '+
  '`lockedProjections` consumer in that panel is untouched.\n\n'+
  '45 new tests (`dispatch-rolling-forecast-capture-2026-11-09.test.js`): drift-tier boundaries '+
  'both directions (including the exact on-track/watching/alert edges), freshestCapture/'+
  'committedCapture edge cases, `saveCommit`\'s upsert+history-append (and its self-heal/partial-'+
  'failure behavior), and the capture job\'s pure date-window math (Monday anchoring, forward-'+
  'window sizing) — no network mocking needed for the last group since those helpers have zero '+
  'IO. Schema: `supabase/schema-forecast-rolling-captures.sql` (already applied live). Full '+
  'design in `memory/project-rolling-forecast-snapshots-2026-11-09.md`.',
]};
