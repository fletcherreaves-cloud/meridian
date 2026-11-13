// @ts-nocheck
export default {version:'5.744', date:'2026-11-12', changes:[
  '**Knowledge Base InfoIcon rollout, batch 19 (task #75).** Wired the "?" help icon to 3 more ' +
  'already-written panel-level KB articles that the earlier wiring passes (batches 14-18) never ' +
  'reached, because those batches worked off a different named-candidate list: `settings_guide` ' +
  '(Settings’ own ModalShell), `troubleshooting_guide` (Troubleshooting’s own ModalShell, ' +
  'converted its plain-string subtitle to an InfoIcon-carrying node), and `calendar_manager_guide` ' +
  '(Calendar Manager’s hand-rolled header, icon appended directly to the title div). Also wired ' +
  '`quick_capture_guide` at its real mount point — the ModalShell wrapping Quick-Capture in ' +
  'App.js, since the panel component itself has no header of its own (same "wiring lives at the ' +
  'routing gate" situation as `brief_guide`/`proj`/`pvsa`, verified by build + full suite only). ' +
  '`count_cycle_guide` re-confirmed still genuinely unresolved — its real content ' +
  '(`CountCycleSection`, `eom-dashboard.js`) is a body-only component inside a tabbed hub with no ' +
  'dedicated per-tab header to anchor an icon to, unchanged across batches 16-18. 3 new ' +
  'render-level tests (`dispatch-kb-panel-guide-batch19-2026-11-12.test.js`); build clean.',
]};
