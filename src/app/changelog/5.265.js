// @ts-nocheck
export default {version:'5.265', date:'2026-08-30', changes:[
  'Fixes GitHub issue #368: model-health-badge.js had the same var()+hexSuffix bug #351 fixed in ' +
  'patch-heatmap.js. computeModelHealth\'s gradeColor is a hex literal only for a green/excellent ' +
  'grade -- yellow and red grades return \'var(--warn)\'/\'var(--crit)\'. The score pill\'s ' +
  'background/border were built as health.gradeColor+\'22\'/+\'66\', which only produces valid ' +
  'CSS for a hex literal -- concatenating a hex alpha suffix onto a var() reference yields the ' +
  'literal invalid string "var(--crit)22", silently dropped by the browser with no console ' +
  'error. So ModelHealthBadge (used from analytics.js, store-analytics.js, store-dash.js, and ' +
  'at-a-glance.js) lost its tint/border for every store graded below excellent -- only the green ' +
  'case ever rendered correctly.' +
  '\n\n' +
  'Also closed two related, already-fixed GitHub issues found while investigating this one: ' +
  '#351 itself (withAlpha() already shipped and in use at all 4 of its call sites) and #367 (DI ' +
  'Compare\'s Monday-anchored week bug -- the code fix and its 7-day test coverage are confirmed ' +
  'already live, left open only because its own "re-run and report the new MAPEs" ask needs a ' +
  'live production run this environment cannot produce).' +
  '\n\n' +
  'Fix: moved withAlpha(color, hexSuffix) from patch-heatmap.js to utils/fmt.js -- a small, ' +
  'dependency-free shared module -- rather than importing it across view files, since ' +
  'model-health-badge.js was split out of analytics.js specifically to avoid statically pinning ' +
  'a large module into the eager bundle (its own header comment). patch-heatmap.js now imports ' +
  'it from utils/fmt.js and re-exports it unchanged, so its own 6 call sites and the two other ' +
  'existing importers (dt-speedofservice.js, troubleshooting.js) needed no changes. ' +
  'model-health-badge.js\'s two concatenations now go through withAlpha().' +
  '\n\n' +
  'New test src/__tests__/dispatch-368-model-health-badge-alpha.test.js renders the real ' +
  'ModelHealthBadge component (server-rendered via ReactDOMServer, not mounted -- happy-dom\'s ' +
  'CSSStyleDeclaration doesn\'t recognize color-mix() and silently drops it on assignment too, ' +
  'for both the old broken value and the new fixed one, so a mounted element\'s own .style ' +
  'read-back can\'t tell fixed from broken here; the server-rendered style ATTRIBUTE STRING isn\'t ' +
  'filtered through that DOM validation, so the literal value survives either way) against a ' +
  'real never-calibrated-store fixture (a genuine gradeColor=var(--crit) case, not synthetic), ' +
  'and asserts the rendered style contains a valid color-mix() string, not the old invalid ' +
  'concatenation. Confirmed genuinely red against the pre-fix code via git stash before ' +
  'restoring the fix.' +
  '\n\n' +
  'ratchet-color-alpha-concat.test.js\'s own CEILING lowered 89->87 (2 sites converted to ' +
  'withAlpha()) per that ratchet\'s own stated upkeep requirement; its stale references to ' +
  'withAlpha living in patch-heatmap.js corrected to utils/fmt.js in the same pass.' +
  '\n\n' +
  'Full test suite: 3407/3407 passing across 330 files. Build clean; eager payload 526.93 KB ' +
  'gzipped (budget 850 KB, 323.07 KB headroom) -- +0.08 KB, this changelog entry\'s own text.'
]};
