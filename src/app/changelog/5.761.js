// @ts-nocheck
export default {version:'5.761', date:'2026-11-13', changes:[
  '**New: Location Dossier (task #79 Phase 1) — "everything we know about one store," in one ' +
  'report.** Reports Hub → 📋 Location Dossier. Pick a store, see its factual metrics (Net ' +
  'Sales, GC, Labor %, TPPH, OEPE, KVS Time, Cash O/S %, FOB %, Prime Cost %) across 5 fixed ' +
  'windows side by side — Current (week-to-date), 28-Day, Last Month, L3M, YTD — all sourced ' +
  'from the same auto-first metric registry every other panel already uses, so these numbers ' +
  'can never disagree with another panel. Top 3 actionable findings headline the report with ' +
  '"+N more" to expand the rest (owner\'s own answer: proactive managers should be able to work ' +
  'through as much as they want, not just the top 3). A "🧠 Generate Narrative" button produces ' +
  'a SAGE plain-language summary on demand — both tables/charts AND narrative, not one or the ' +
  'other. Also surfaces the store\'s Census trade-area demographics (now live, see below) and ' +
  'its existing Store KB context note. Single-store only this phase — patch/operator/state ' +
  'rollups are a planned Phase 4. Built on ReportShell, matching every other Reports Hub report\'s ' +
  'chassis (date range, location picker, Print/CSV/Excel/PDF export).',
  '**HME Cloud strip now shows the actual pull time, not just the date** (owner request) — ' +
  '"as of Nov 13" could mean 6am or 6pm for a live-accumulating vendor rollup; now reads ' +
  '"as of Nov 13, 12:29 PM" using the stream\'s own `pulled_at` timestamp (already captured, ' +
  'just not previously surfaced).',
  'Full suite (7979 tests) and build pass clean (699.02 KB eager, budget 850 KB).',
]};
