// @ts-nocheck
export default {version:'5.773', date:'2026-11-14', changes:[
  '**New: Food Safety Checklists panel — first UI consumer of the Squadle tablet checklist pull** ' +
  '(task #105 Phase 2 UI). The pull itself shipped 2026-11-13 with deliberately no consuming ' +
  'engine/panel yet; this closes that gap. Verified the real `data` JSONB shape against 42 live ' +
  'records (21 stores, 2 dates) before writing any parsing code — shifts (9-17/record) → tasks ' +
  '(11 real action types: number/toggle/radio/formula/select/readOnly/text/attachment/textarea/' +
  'checkbox/photo) → actions, each with a real `optional` boolean and, where applicable, ' +
  '`triggers` (range/match/formula — only range and match are evaluated; formula triggers ' +
  'reference another action\'s answer and are left unevaluated rather than guessed at). New ' +
  'engine `src/engine/squadle-checklist.js` (flatten → store-day rollup → district summary, Σ/Σ ' +
  'completion rate never a mean of store rates, same discipline forms-completion.js already ' +
  'uses) + new panel `src/views/squadle-checklist-panel.js` (district/store summary cards, ' +
  'worst-completion-first store table, flagged-reading drill-down). kind:\'test-kitchen\', ' +
  'route:true, same treatment forms-completion/forms-reviews got as new/unproven panels. ' +
  'Live-verified end to end against real data: 18,139 real actions, 79.6% district completion, ' +
  '462 flagged readings over the 2 days of history that exist so far. 24 new tests. Full ' +
  'findings: memory/finding-squadle-checklist-shape-2026-11-14.md.',
]};
