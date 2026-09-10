// @ts-nocheck
export default {version:'5.420', date:'2026-09-10', changes:[
  'Fixed the last 2 sites from GH #1221 -- engine/tolerance-status.js\'s tolMergedTarget and its ' +
  'full call chain, the deepest and most consequential of the "ds.targets||DEFAULT_TARGETS ' +
  'bypasses settings.targets" bugs found while fixing #167. Traced the chain end to end: ' +
  'tolMergedTarget -> tolStatusesForStore -> (pipeline.js\'s buildBrief coaching findings, and ' +
  'separately tolStatusesDistrict -> at-a-glance.js\'s ToleranceRollupTile, the district ' +
  'out-of-tolerance rollup a GM/DO actually sees on the daily At-A-Glance dashboard). ' +
  'ToleranceRollupTile had NO settings prop reaching it at all -- a Targets-panel or v2 monthly ' +
  'override to ANY of the 24 tol-based rollup metrics (Comp Waste %, Cash O/S %, T-Reds, etc.) ' +
  'was invisible to both the daily dashboard tile and the coaching-findings text a store\'s ' +
  'buildBrief() produces.',
  'tolMergedTarget(ds, loc, settings) and tolStatusesForStore(ds, loc, {l4wMs, settings, ' +
  'officialTarget}) both widened with settings as a LAST, optional param -- backward compatible ' +
  'with every existing 2-arg caller (verified: settings omitted resolves exactly as before). ' +
  'pipeline.js\'s buildBrief has no settings param of its own to thread in, so it passes its own ' +
  'already-merged `t` (buildStore\'s settings.targets-aware target, fixed this morning) straight ' +
  'through via the new officialTarget param instead -- same merged-target shape, no new plumbing ' +
  'needed there. at-a-glance.js\'s ToleranceRollupTile and store-dash.js\'s UnifiedTargetsPanel ' +
  '(both already had settings in scope) now pass it through to the engine.',
  '5 new tests across 3 files: tolMergedTarget\'s widened signature (settings wins, omitting it ' +
  'is a no-op); buildStore\'s findings end-to-end (a settings.targets override changes which ' +
  'target the tolCompW finding TEXT quotes, not just which finding fires); ToleranceRollupTile ' +
  'rendered via the real AtAGlance consumer (a store moves from "all-clear" to "1 red" purely ' +
  'from the override, reusing dispatch-94-phase2-rollup.test.js\'s own real-store fixture). All ' +
  'confirmed to fail against the pre-fix code (reverted all 4 files, re-ran, restored) before ' +
  'landing. Full suite 4699/4699, build clean, 538.64 KB / 850 KB budget.',
  'This closes GH #1221 -- all 6 confirmed sites found while fixing #167 are now resolved.',
]};
