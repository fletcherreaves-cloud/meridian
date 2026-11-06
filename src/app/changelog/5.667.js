// @ts-nocheck
export default {version:'5.667', date:'2026-11-06', changes:[
  '**New Store Launch Planner.** A reusable day-by-day sales plan for a newly opening or ' +
  'relocating store — Planning hub → "Launch Planner" — seeded from the comparable-store ramp ' +
  'model (`src/engine/new-store-ramp.js`) and editable in-app: pick comparables + weights, a ' +
  'mature weekly sales assumption, and an open date; it projects a day-by-day forecast you can ' +
  'override per day (manual edits are never clobbered by "Regenerate from ramp model"), with a ' +
  'Suggested Labor Hours column (sales ÷ the store\'s own TPPH target) and a Grand Opening date ' +
  'flag. First used for Lindsay (44689, opening 2026-11-14, grand opening 2026-11-17) but every ' +
  'input is caller-set, not Lindsay-specific — reusable for the next relocation/opening. New ' +
  'table `new_store_launch_plan` (owner migration: `supabase/schema-new-store-launch-plan.sql`); ' +
  'self-heals until it runs. See `memory/project-new-store-launch-planner.md`.',
]};
