#!/usr/bin/env node
// scripts/migrate-feature-requests-to-tasks.mjs — Dispatch #194 data migration
//
// Copies the live `feature_requests` rows (and, unless --no-seed, the historical SEED_ITEMS
// roadmap entries from src/views/task-queue.js) into `tasks` as type:'feature_request' rows.
//
// ⚠️ RUN THIS AFTER applying supabase/schema-tasks-feature-merge.sql — that migration adds the
// `type`/`submitted_by`/`dev_notes`/`completed_version`/`votes`/`is_seed` columns and widens
// `tasks.status`'s CHECK constraint. Without it, every insert here fails with an "unknown
// column" / CHECK-violation error from PostgREST (which is exactly what this script's own
// dry-run reported when tried before the schema existed — see the commit this shipped in).
//
// This does NOT touch or delete `feature_requests` — it is a pure copy, safe to re-run
// (idempotent: skips any title already present in `tasks`).
//
// Usage:
//   node scripts/migrate-feature-requests-to-tasks.mjs           # copy everything, live
//   node scripts/migrate-feature-requests-to-tasks.mjs --dry-run # print what WOULD be inserted
//   node scripts/migrate-feature-requests-to-tasks.mjs --no-seed # skip the 30 SEED_ITEMS, copy
//                                                                 # only the live feature_requests
//                                                                 # rows (SEED_ITEMS never needed
//                                                                 # this migration in the first
//                                                                 # place -- task-queue.js still
//                                                                 # carries them as a client-side
//                                                                 # overlay regardless of whether
//                                                                 # this script has ever run)
//
// Reads .env.local for VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (falls back to anon key,
// which will not have write access once RLS is in effect -- service role is required for a real
// run).

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '..');

try {
  const env = readFileSync(join(ROOT, '.env.local'), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY      = process.env.VITE_SUPABASE_ANON_KEY;
const ACTIVE_KEY   = SERVICE_KEY || ANON_KEY;

if (!SUPABASE_URL || !ACTIVE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_ANON_KEY) in .env.local');
  process.exit(1);
}
if (!SERVICE_KEY) console.warn('Note: using anon key — insert will fail under RLS. Set SUPABASE_SERVICE_ROLE_KEY for a real run.\n');

const sb = createClient(SUPABASE_URL, ACTIVE_KEY);

const DRY_RUN  = process.argv.includes('--dry-run');
const NO_SEED  = process.argv.includes('--no-seed');

// Same string→int priority mapping sage.js's LogIssueModal and task-queue.js's normalizeFRRow
// already use, so a migrated row displays identically to one saved via either of those paths.
const PRI_STR_TO_INT = { high:1, medium:2, low:3 };

// Same 5-item vocab task-queue.js's FR_STATUSES uses (idea/planned/in-progress/completed/
// declined) -- these pass the widened CHECK constraint the schema migration adds; the app's
// status buttons for a type:'feature_request' row use this exact set.
const VALID_FR_STATUS = new Set(['idea','planned','in-progress','completed','declined']);

// Kept in sync by hand with src/views/task-queue.js's SEED_ITEMS (harvested from
// feature-requests.js, dispatch #194). Not imported directly -- this is a plain Node script,
// task-queue.js is a React/JSX-via-h() browser module -- so this is a deliberate, documented
// duplication rather than a build-time import. If SEED_ITEMS changes, update both.
const SEED_ITEMS = [
  { id:'seed-sage',    title:'SAGE AI Chat Assistant',                       category:'AI',          status:'completed', priority:'high',   completed_version:'v4.281', votes:0, submitted_by:'Fletcher Reaves', description:'Claude Opus-powered AI advisor with streaming, JWT-verified Edge Function, adaptive thinking.' },
  { id:'seed-sb-ops',  title:'Supabase persistence — operational data',       category:'Data',        status:'completed', priority:'high',   completed_version:'v4.301', votes:0, submitted_by:'Fletcher Reaves', description:'Move fobRows, opsRows, ctrlRows, darRows, smgFullscale from OPFS to Supabase for true cross-device access.' },
  { id:'seed-smg-cal', title:'SMG VOICE auto-calibrate thresholds',           category:'Guest Voice', status:'completed', priority:'medium', completed_version:'v4.310', votes:0, submitted_by:'Fletcher Reaves', description:'p75/p25 percentile engine derives OSAT, B2B, and problem rate thresholds from historical data automatically.' },
  { id:'seed-grid',    title:'District grid Option A+C tile layout',          category:'UI',          status:'completed', priority:'medium', completed_version:'v4.311', votes:0, submitted_by:'Fletcher Reaves', description:'4px accent bar, FL/OK chip, 4-metric rows (Sales, Labor, OEPE, TPPH), model health score per store card.' },
  { id:'seed-orgsum',  title:'Org Summary group selector',                    category:'Analytics',   status:'completed', priority:'medium', completed_version:'v4.314', votes:0, submitted_by:'Fletcher Reaves', description:'Renamed from Operator Summary. Groups: Company (all stores), Org (FL/OK), Operator, Patch (supervisor territory).' },
  { id:'seed-dm',      title:'Data Manager cloud-first update',               category:'Data',        status:'completed', priority:'low',    completed_version:'v4.315', votes:0, submitted_by:'Fletcher Reaves', description:'Supabase section now shows operational row coverage. Header updated to reflect cloud-first architecture.' },
  { id:'seed-fr',      title:'Feature Requests module',                       category:'UI',          status:'completed', priority:'low',    completed_version:'v4.316', votes:0, submitted_by:'Fletcher Reaves', description:'Track feature ideas from all users. Pre-seeded with roadmap history. Supabase-backed for cross-user submissions.' },
  { id:'seed-ebos',    title:'QSRSoft eBOS purchases automation',             category:'Data',        status:'completed', priority:'high',   completed_version:'v4.340', votes:0, submitted_by:'Fletcher Reaves', description:'Daily GitHub Actions sync of op supplies purchases via Playwright auth → qsr_ebos_daily table.' },
  { id:'seed-dar',     title:'QSRSoft Daily Activity (DAR) automation',       category:'Data',        status:'completed', priority:'high',   completed_version:'v4.356', votes:0, submitted_by:'Fletcher Reaves', description:'Hourly intraday data for all 27 stores, quarter-hour granularity → qsr_daily_activity. Runs daily 5am CDT.' },
  { id:'seed-daypart', title:'Store Dashboard daypart card',                  category:'Analytics',   status:'completed', priority:'high',   completed_version:'v4.357', votes:0, submitted_by:'Fletcher Reaves', description:'Aggregates hour slots to Breakfast/Lunch/PM/Dinner/Late from qsr_daily_activity. Shows vs projection, vs LY.' },
  { id:'seed-pace',    title:'Morning Brief district hourly pace',            category:'Analytics',   status:'completed', priority:'high',   completed_version:'v4.358', votes:0, submitted_by:'Fletcher Reaves', description:'TodayPaceCard: today sales pace vs 30-day mean by hour slot from qsr_daily_activity.' },
  { id:'seed-signals', title:'Signals LiveOps panel',                        category:'Analytics',   status:'completed', priority:'high',   completed_version:'v4.360', votes:0, submitted_by:'Fletcher Reaves', description:'Live operational alerts from qsr_daily_activity: sales pace, DT serve time, labor vs needed hours.' },
  { id:'seed-qsrproj', title:'Projections QSRSoft baseline column',          category:'Analytics',   status:'completed', priority:'medium', completed_version:'v4.369', votes:0, submitted_by:'Fletcher Reaves', description:'Adds proj_sales_dollars from qsr_daily_activity as a second comparison line in Projections grid.' },
  { id:'seed-sage-tl', title:'SAGE tool use — live Supabase queries',         category:'AI',          status:'completed', priority:'high',   completed_version:'v4.379', votes:0, submitted_by:'Fletcher Reaves', description:'SAGE queries Supabase directly for live numbers (query_daily_activity, query_lifelenz_labor, query_forecast_snapshots) instead of context-window injection.' },
  { id:'seed-mape',    title:'MAPE daily — three-way forecast accuracy',      category:'Analytics',   status:'completed', priority:'high',   completed_version:'v4.379', votes:0, submitted_by:'Fletcher Reaves', description:'Proj vs Actuals report: Meridian forecast vs QSRSoft proj vs actual, MAPE over held-out weeks (forecast_snapshots).' },
  { id:'seed-dt-sos',  title:'DT Speed-of-Service Analytics panel',          category:'Analytics',   status:'completed', priority:'high',   completed_version:'v4.37', votes:0, submitted_by:'Fletcher Reaves', description:'All-station speed panel (DT/front-counter/kitchen-MFY/beverage), cross-store, by hour, 90-day trend, best slots + worst stores.' },
  { id:'seed-sage-mm', title:'SAGE cross-device session memory',              category:'AI',          status:'planned',   priority:'medium', completed_version:'', votes:0, submitted_by:'Fletcher Reaves', description:'Conversation retention and context across devices and sessions for continuity.' },
  { id:'seed-osat',    title:'Performance Review OSAT auto-fill polish',      category:'Analytics',   status:'planned',   priority:'medium', completed_version:'', votes:0, submitted_by:'Fletcher Reaves', description:'Preview SMG data being auto-filled; show which months have coverage; handle multi-month reviews cleanly.' },
  { id:'seed-beta',    title:'Beta operator onboarding',                      category:'Data',        status:'planned',   priority:'high',   completed_version:'', votes:0, submitted_by:'Fletcher Reaves', description:'Onboard a second trusted operator to Meridian beta. RBAC, restricted panel set, their own Supabase RLS config.' },
  { id:'seed-fob-p',   title:'FOB multi-location variance analysis',          category:'Finance',     status:'completed', priority:'medium', completed_version:'v4.543', votes:0, submitted_by:'Fletcher Reaves', description:'Side-by-side FOB component breakdown across stores (EOM Dashboard → 📊 FOB breakdown): 6 controllable components as %/$, dollar-weighted district comparison, outlier + primary-driver flags — spots where food cost overruns originate.' },
  { id:'seed-eom',     title:'EOM Dashboard + food-cost diagnosis engine',    category:'Finance',     status:'completed', priority:'high',   completed_version:'v4.542', votes:0, submitted_by:'Fletcher Reaves', description:'All-stores End-of-Month view: count progress, FOB $/% + components, editable diagnosis flow, recount+action-plan comms, and the Item Journey visual guide (per-item count-cycle timeline with verified-fact vs likely-inference signals). Two modes: EOM count-completion + year-round progress.' },
  { id:'seed-st-model', title:'Smart Targets model — median-of-simple + deeper backtest', category:'Analytics', status:'completed', priority:'high', completed_version:'v4.483', votes:0, submitted_by:'Fletcher Reaves', description:'27-store backtest proved simple trailing beats engineered models for monthly sales; recommended = median of T3M/T6W/T3W · recent-3wk · 3-mo-avg. Engineered models preserved as diagnostics.' },
  { id:'seed-st-metrics', title:'Smart Targets — Labor % / DT speed / FOB % metrics', category:'Analytics', status:'completed', priority:'high', completed_version:'v4.489', votes:0, submitted_by:'Fletcher Reaves', description:'Ratio metrics (dollar/volume-weighted trailing levels, direction lower). FOB % matches the At-A-Glance formula.' },
  { id:'seed-st-adj',  title:'Smart Targets — known-event (+/-) adjustments',  category:'Analytics',   status:'completed', priority:'medium', completed_version:'v4.486', votes:0, submitted_by:'Fletcher Reaves', description:'Per-store exclude one-off days from learning + add a signed event delta to the target (smart_target_adjustments).' },
  { id:'seed-st-apply', title:'Smart Targets — Apply as Official',             category:'Analytics',   status:'completed', priority:'high',   completed_version:'v4.489', votes:0, submitted_by:'Fletcher Reaves', description:'Per-store + bulk write of the Smart number into monthly_targets (partial upsert) for the upcoming month; feeds Projections.' },
  { id:'seed-ll-labor', title:'LifeLenz Labor Analysis auto-pull',            category:'Labor',       status:'completed', priority:'high',   completed_version:'v4.485', votes:0, submitted_by:'Fletcher Reaves', description:'Weekly Band-1 derived from the daily lifelenz_schedule (Hours Fcst = Proj VLH+Fixed+Floor); auto wins, manual MBI gap-fills.' },
  { id:'seed-sage-log', title:'SAGE — log a data issue → Task / Feature Request', category:'AI',       status:'completed', priority:'medium', completed_version:'v4.487', votes:0, submitted_by:'Fletcher Reaves', description:'🐞 Log on any answer: detects the data source, suggests Task vs FR, drafts a troubleshooting prompt into the ticket.' },
  { id:'seed-sage-lib', title:'SAGE — saved prompt library + auto-scheduling', category:'AI',         status:'completed', priority:'medium', completed_version:'v4.488', votes:0, submitted_by:'Fletcher Reaves', description:'📚 save/run prompts; ⏰ schedule daily/weekly (GitHub Action runner); 🧭 Scheduled-Runs At-A-Glance tile.' },
  { id:'seed-pace',    title:'Pace to Target — monthly MTD actual vs official', category:'Analytics',  status:'completed', priority:'high',   completed_version:'v4.490', votes:0, submitted_by:'Fletcher Reaves', description:'Dedicated view: MTD actual vs the official monthly target, run-rate pace + % ahead/behind, Store/Patch/Operator toggle.' },
  { id:'seed-gc-pace', title:'Signals — guest-count tracking-to-plan',         category:'Analytics',   status:'completed', priority:'medium', completed_version:'v4.491', votes:0, submitted_by:'Fletcher Reaves', description:'GC pace alongside $ pace, with a traffic-vs-sales divergence flag (leading indicator of a check-average slip).' },
  { id:'seed-yearly',  title:'Yearly Projections view',                       category:'Analytics',   status:'completed', priority:'medium', completed_version:'v4.492', votes:0, submitted_by:'Fletcher Reaves', description:'Annual target (Σ monthly) vs YTD actual (prorated), Projected Full Year, FY-vs-target, OK/FL/grand subtotals.' },
  { id:'seed-sage-rbac', title:'SAGE — RBAC awareness',                       category:'AI',          status:'completed', priority:'medium', completed_version:'v4.494', votes:0, submitted_by:'Fletcher Reaves', description:'Scope what SAGE sees + recommends by the caller’s role / accessible_locs. Shipped — needs a sage-chat edge-function redeploy to take effect.' },
  { id:'seed-gvp',     title:'Graded-Visit Predictor (CFV / RGR / EcoSure)',  category:'Analytics',   status:'idea',      priority:'high',   completed_version:'', votes:0, submitted_by:'Fletcher Reaves', description:'Flagship: learn the operational pattern preceding graded visits → score pass-likelihood + levers. BLOCKED on an EcoSure data sample.' },
  { id:'seed-dar-more', title:'DAR secondary fields — channel splits, GC anomalies, product-volume', category:'Data', status:'idea', priority:'low', completed_version:'', votes:0, submitted_by:'Fletcher Reaves', description:'Surface dt/is channel splits, GC baseline anomalies, sandwich/fry/beverage projections. Each needs a loader-SELECT widening first.' },
];

async function main() {
  console.log(`Target: ${SUPABASE_URL}  (${SERVICE_KEY ? 'service role' : 'ANON — writes will likely fail'})${DRY_RUN ? '  [DRY RUN]' : ''}\n`);

  const { data: existingTasks, error: taskErr } = await sb.from('tasks').select('title,type');
  if (taskErr) {
    console.error('Could not read `tasks` — has supabase/schema-tasks-feature-merge.sql been applied yet?');
    console.error(taskErr.message);
    process.exit(1);
  }
  const existingTitles = new Set(existingTasks.map(t => t.title));

  const { data: frRows, error: frErr } = await sb.from('feature_requests').select('*');
  if (frErr) { console.error('Could not read `feature_requests`:', frErr.message); process.exit(1); }
  console.log(`feature_requests: ${frRows.length} live row(s) measured.`);

  const toInsert = [];
  for (const r of frRows) {
    if (existingTitles.has(r.title)) { console.log(`  skip (already in tasks): ${r.title}`); continue; }
    toInsert.push({
      title: r.title, description: r.description, category: r.category,
      status: r.status, priority: PRI_STR_TO_INT[r.priority] || 2,
      submitted_by: r.submitted_by, dev_notes: r.dev_notes,
      completed_version: r.completed_version, votes: r.votes || 0,
      is_seed: false, type: 'feature_request',
      created_at: r.created_at, updated_at: r.updated_at,
    });
    existingTitles.add(r.title);
  }

  if (!NO_SEED) {
    for (const s of SEED_ITEMS) {
      if (existingTitles.has(s.title)) { console.log(`  skip (already in tasks): ${s.title}`); continue; }
      const status = VALID_FR_STATUS.has(s.status) ? s.status : 'idea';
      toInsert.push({
        title: s.title, description: s.description, category: s.category,
        status, priority: PRI_STR_TO_INT[s.priority] || 2,
        submitted_by: s.submitted_by, dev_notes: null,
        completed_version: s.completed_version || null, votes: 0,
        is_seed: true, type: 'feature_request',
      });
      existingTitles.add(s.title);
    }
  }

  console.log(`\n${toInsert.length} row(s) to insert (${frRows.length} live + ${NO_SEED?0:SEED_ITEMS.length} seed, minus already-present titles).`);
  if (DRY_RUN) { console.log('\nDry run — nothing written. Row(s):'); for (const r of toInsert) console.log(`  [${r.type}] ${r.status.padEnd(12)} ${r.title}`); return; }
  if (toInsert.length === 0) { console.log('Nothing to do.'); return; }

  const { data: inserted, error: insErr } = await sb.from('tasks').insert(toInsert).select('id,title');
  if (insErr) { console.error('Insert failed:', insErr.message); process.exit(1); }
  console.log(`\nInserted ${inserted.length} row(s) into tasks:`);
  for (const r of inserted) console.log(`  [${r.id}] ${r.title}`);
}

main();
