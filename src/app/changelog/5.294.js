// @ts-nocheck
export default {version:'5.294', date:'2026-08-31', changes:[
  'EOM Print (Missing Items / Recount Impact / Team Snapshot / Count Swings / Supervisor Rollup) -- ' +
  'a visible "Generating the print preview..." banner now appears the instant Print is clicked, ' +
  'before the browser\'s own print layout runs. Root-caused live (owner-reported): window.print() ' +
  'is a SYNCHRONOUS browser call that freezes the tab while it lays out the full printable DOM -- ' +
  'measured on a real "all stores" report at ~12 seconds (Chrome\'s own "[Violation] \'setTimeout\' ' +
  'handler took 11941ms", attributed by a "[click-trace] ... blocked ... button Print" entry ' +
  'directly to the Print button\'s handler). Owner confirmed waiting it out DOES eventually produce ' +
  'a correct printout on every one of these reports -- nothing was actually broken, it was just ' +
  'silent during a multi-second freeze that reads exactly like a failure. `forPrint` was already ' +
  'being set true right before every report\'s window.print() call; it just had nothing rendering ' +
  'off of it. New shared `PrintGeneratingBanner` (src/views/eom-supervisor.js, alongside the shared ' +
  'PRINT_STYLE these five reports already reuse) fixes that -- shown on screen through the freeze, ' +
  'excluded from the actual printed/PDF output via the same eom-no-print class the report chrome ' +
  'already uses. Verified via a real render test that the banner text reaches the screen on the ' +
  'SAME tick Print is clicked, before window.print() itself has even fired.',
  'Still investigating (not yet resolved): the owner separately reported a wait of 30-60+ seconds ' +
  'on a real report that still looked blank -- well beyond the ~12s measured, so this may be a real ' +
  'performance problem at production scale (not just a missing wait indicator), or a second issue ' +
  'underneath it. Root-caused a faithful, real-Chromium reproduction of App.js\'s exact DOM/CSS shape ' +
  '(inline mf-app-root height:100vh/overflow:hidden included) at realistic scale (27 stores x 3 ' +
  'items) and confirmed Chromium\'s real print/PDF pipeline correctly produces a full 9-page PDF with ' +
  'real text on every page for that scale -- so the underlying print mechanism itself is NOT ' +
  'structurally broken; whatever is happening at full production data volume needs further ' +
  'investigation with the owner.',
]};
