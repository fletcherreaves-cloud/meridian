// @ts-nocheck
export default {version:'5.255', date:'2026-08-29', changes:[
  'Dispatch #215 -- EOM roll-up digest (Patch/Market/District) + FOB targets alongside components, ' +
  'the owner\'s two follow-on asks right after seeing #213\'s FOB-section work: "roll up the stores ' +
  'by patch and operator and organization levels" (timed emails + an in-panel on-demand report) and ' +
  '"put targets alongside the fob and components."' +
  '\n\n' +
  'Task 1 -- FOB targets alongside components. scripts/qsrsoft-onhand-pull.mjs gained ' +
  'resolveFobTargets()/buildFobTargetReport(): resolves DEFAULT_TARGETS[loc] with a LIVE ' +
  'monthly_targets override for the exact (loc, year, month) layered on top when one exists, then ' +
  'calls buildStoreFobReport() (src/engine/fob-report.js) for the real comps/overTarget/gapPP/' +
  'topDriver read -- never a third hand-rolled target computation. scripts/lib/resend-notify.mjs\'s ' +
  'FOB section now shows each component\'s target + delta-pp alongside its actual, and the headline ' +
  'gap-vs-target, falling back to #213\'s actual-only rendering when no target resolves. SCOPE ' +
  '(judgment call, stated per the dispatch): monthly_targets only, not yearly_targets or ' +
  'target_overrides (the separate company/state/patch/store cascade) -- the real 4-tier precedence ' +
  '(review-engine.js\'s mergedTargetsForLocMonth) risked pulling that file\'s heavier transitive graph ' +
  'into a Playwright pull script for a v1 email upgrade; monthly_targets is the tier an owner/GM ' +
  'actually edits mid-month. LIVE measurement (SUPABASE_SERVICE_ROLE_KEY, real REST call): store ' +
  '3708\'s monthly_targets row for 2026-08 carries fob_target_pct 0.0415, genuinely overriding ' +
  'DEFAULT_TARGETS\' 0.0385 seed -- the tier is real, not theoretical.' +
  '\n\n' +
  'Task 2 -- new src/engine/eom-digest.js, buildEomDigest(storeRows, {level, period}) rolls per-store ' +
  'completion + FOB(+target) up to patch / org / district. Pure -- callers (Node script or panel) ' +
  'compute each store\'s own org/patch and pass them in as plain fields, so the file never touches ' +
  'the live-vs-seed grouping question itself. A store with no patch lands under a stable ' +
  'UNASSIGNED_KEY, never dropped. Each group gets a "number + decision" headline per the standing ' +
  'UI-voice rule (e.g. "Patch P1: 4/6 stores Food+Cond complete, Ardmore and Sulphur still open -- 2 ' +
  'days left. FOB: 1 store over target."). Caught and fixed a real Task-1-to-Task-2 shape mismatch ' +
  'during build (buildFobTargetReport originally returned the target fraction as `target`; the ' +
  'digest engine reads `fobTarget.fobPct` -- silently emptied every group\'s FOB aggregate with no ' +
  'error). Now guarded by an explicit contract test wiring Task 1\'s real output into Task 2\'s real ' +
  'engine.' +
  '\n\n' +
  'Task 3 -- new scripts/eom-digest-send.mjs + .github/workflows/eom-digest-send.yml. Reads ONLY ' +
  'tables qsrsoft-onhand-pull.mjs already writes (eom_count_status, eom_count_progress_log, ' +
  'eom_count_notifications, qsr_fob) -- no re-pull from QSRSoft. Sends ONE email per (level, group) ' +
  'via scripts/lib/eom-digest-notify.mjs\'s sendDigestEmail() (reuses resend-notify.mjs\'s postResend, ' +
  'now exported). recipientFor(level, groupKey) resolves every group to the owner\'s own email for ' +
  'now (matches his "test through my email for now" + Resend\'s sandbox-sender restriction) but is ' +
  'structured so real per-role delivery later is a body swap, not a rewrite. Cadence: daily 6pm CT ' +
  '(23:00 UTC), gated by count-window.mjs\'s inCountWindow() the same way the onhand pull gates ' +
  'itself -- a STARTING GUESS per the dispatch, not locked in. Added to sync-failure-watch.yml\'s ' +
  'watched list (enforced by the existing ratchet test). The Node-script live-org gotcha the dispatch ' +
  'called out explicitly was real and verified: supervisorGroups()/getStoreOrg() are populated ' +
  'CLIENT-SIDE at app startup from a Supabase org_config row; bootstrapLiveOrg() mirrors App.js\'s ' +
  'own useEffect (same org_config read, same two setters) before this script calls them. LIVE ' +
  'end-to-end run against production Supabase during this build: 27/27 stores loaded, live org ' +
  'bootstrap confirmed, all 7 real supervisor patches (Robert Spencer/Krystiana Langford/Ashley ' +
  'Podroza/Steven Vaughn/Amanda Estrada/Mary Ratliff/Brad Denley, 27 stores total) + district rolled ' +
  'up correctly with real headlines; every spot-checked store\'s org matched CLAUDE.md\'s own FL/OK ' +
  'list.' +
  '\n\n' +
  'Task 4 -- trigger-dar-sync\'s WORKFLOWS allowlist gained a `digest` entry (needs ' +
  '`supabase functions deploy trigger-dar-sync` post-merge). EOM Dashboard\'s Reports action group ' +
  'gained "📧 Generate Report": opens a modal that renders the roll-up INLINE immediately (pure ' +
  'buildEomDigest() call on data already in the panel -- reuses fobReport.stores[loc], already ' +
  'computed above, for fobTarget; classStatusesFromProgress() for the SAME prog.byClass every row ' +
  'already carries) with District/Patch/Market tabs defaulting to whatever the panel\'s existing ' +
  'scope/patch filter already narrows to, and a SEPARATE "📧 Email N groups" button that calls the ' +
  'digest workflow via trigger-dar-sync -- viewing never silently emails.' +
  '\n\n' +
  '77 new unit tests: eom-digest.test.js (16, patch/org/district grouping, unassigned-store, ' +
  'FOB-vs-target aggregation), dispatch-215-fob-targets.test.js (12, target resolution incl. a real ' +
  'live monthly_targets measurement, buildFobTargetReport, the Task1->Task2 contract test, resend ' +
  'rendering), eom-digest-send.test.js (5, the pure status+log adapter), eom-digest-notify.test.js ' +
  '(17, mocked-fetch Resend request shape matching #211\'s own pattern). Data-loading paths that go ' +
  'through the live supabase-js client (bootstrapLiveOrg/buildStoreRows) were verified with a REAL ' +
  'live run instead of a mocked wire-protocol simulation, matching this repo\'s existing precedent ' +
  '(fetchFobSnapshotForStore is untested the same way). Full suite 3306/3306, build clean.' +
  '\n\n' +
  'No change to the eager entry chunk -- eom-dashboard.js is lazy-loaded (523.90 KB gzip eager total, ' +
  'unchanged from v5.254\'s baseline; the panel\'s own chunk grew to 75.63 KB gzip, off the critical path).',
]};
