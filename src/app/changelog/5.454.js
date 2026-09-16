// @ts-nocheck
export default {version:'5.454', date:'2026-09-16', changes:[
  'Panel-contract round 2 (Task #72): converted sage.js\'s LogIssueModal ("🐞 Log this as an ' +
  'issue" popup) from a hand-rolled backdrop/card to the shared ModalShell -- the exact pattern ' +
  'src/__tests__/ratchet-modal-backdrop-bypass.test.js\'s R7 ratchet flags. zIndex:2100 preserved ' +
  'explicitly (ModalShell defaults to Z.modal=300) since it and its sibling PromptLibraryModal ' +
  'both stack above SAGE\'s own composer/chat surface.',
  'Ratchet CEILING lowered 40 → 39 to match, with a comment explaining why PromptLibraryModal ' +
  '(large, multi-feature: search + prompt selection + inline scheduling editor) and ' +
  'KbViewerModal (portal-based, a different concern) were deliberately left alone this pass -- ' +
  'per the panel-contract\'s own standing rule, opportunistic conversion, not a sweep.',
  '3 new tests render the real (now-exported) LogIssueModal component directly: title/options ' +
  'render, Cancel closes, backdrop-click closes but inside-card-click doesn\'t, and Create saves ' +
  'through the real saveTask/saveFeatureRequest functions -- verifying the actual wiring survived ' +
  'the conversion, not just that the backdrop-count ratchet moved. Full suite 522/522 files, ' +
  '4996/4996 tests. Build clean, eager payload 550.62 KB / 850 KB.',
]};
