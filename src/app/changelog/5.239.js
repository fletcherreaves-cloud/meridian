// @ts-nocheck
export default {version:'5.239', date:'2026-08-28', changes:[
  'Dispatch #198 -- panel-contract sweep: converted all 15 hand-rolled position:fixed/inset:0/' +
  'rgba(0,0,0 backdrops in src/views/eom-dashboard.js (by far the single largest concentration in ' +
  'one file, more than the next two files combined-minus-3) to the shared ModalShell. Measured ' +
  'first, per the standing "measure it, don\'t reason about it" rule, rather than assuming the ' +
  'FOBAnalysisPanel double-chrome pattern dispatch #188 fixed would repeat here: EOMDashboardPanel ' +
  '\'s own top-level chrome is RoutePanelShell (no backdrop of its own, and App.js renders the ' +
  'panel unwrapped -- no outer shell sits above it), so none of the 15 were redundant double ' +
  'chrome. Every one was a genuine secondary popup layered on top of the route panel\'s content ' +
  '(FOB Report, FOB Root-Cause Analysis, Waste Analysis, comms draft, Food-Cost Diagnosis, Item ' +
  'journeys, Count Reliability, Rubber-band, District EOM Summary, Change Monitor, EOM Follow-up, ' +
  'AI Cross-Check, Chronic Offenders, FOB component breakdown, Edit diagnosis flow) that legitimately ' +
  'needs its own backdrop -- so each was converted to ModalShell in place (title/onClose/maxWidth/' +
  'closeOnBackdrop, matching the original close-on-backdrop-click behavior), never deleted outright. ' +
  'The three that carried a look-back-months selector alongside their title (Count Reliability, ' +
  'Rubber-band, Chronic Offenders) now pass it via ModalShell\'s headerExtra slot instead of hand-' +
  'rolling that row. The now-dead MODAL_X close-button style constant (all 15 of its call sites were ' +
  'the hand-rolled close buttons just removed) was deleted as part of the same pass. Every mode/tab ' +
  '(EOM Dashboard, Food Cost, End of Month, Count Cycle) still opens, closes via its shell\'s close ' +
  'button, and shows content -- verified by reading the full converted file, not just a passing ' +
  'build. src/__tests__/ratchet-modal-backdrop-bypass.test.js (R7) CEILING lowered 68 -> 53, freshly ' +
  're-measured against this branch\'s own build (never by arithmetic subtraction from "15 removed") ' +
  'by reproducing the test\'s own exact regex/file-walk scan. Suite 296/296 files, 3090/3090 tests ' +
  'passing (one run showed a single unrelated flake in a different test file under heavy parallel ' +
  'CPU load from several concurrent vitest invocations; reproduced clean, in isolation and in a ' +
  'single fresh full run, confirming it\'s not this change). Build clean; eom-dashboard.js stays a ' +
  'lazy chunk (224.43 KB / 67.77 KB gzip), entry-chunk eager-payload budget unaffected at 546.10 KB ' +
  'gzip (budget 850 KB).',
]}
