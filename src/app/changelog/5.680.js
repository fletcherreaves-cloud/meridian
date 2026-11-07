// @ts-nocheck
export default {version:'5.680', date:'2026-11-07', changes:[
  '**KB: 3 more dangling InfoIcon articles wired in** (task #75, closing out the original ' +
  'judgment-call-tier list). `anomaly_scan_guide` → `AIBacktestScanner` (it turned out to ' +
  'already be wrapped in a `ModalShell`, not a bare embed with no header as previously ' +
  'assumed — wired via that shell’s `subtitle` slot). `performance_calculator_guide` → ' +
  'Performance Reviews → Customize → Calculator sub-tab, its own hand-rolled header. ' +
  '`review_target_overrides_guide` → Customize → Targets sub-tab, which had no title div ' +
  'at all — added the icon next to its existing description line instead. All three had real ' +
  '`KB_ARTICLES` entries written in earlier batches that no panel ever actually linked to.',
]};
