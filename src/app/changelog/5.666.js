// @ts-nocheck
export default {version:'5.666', date:'2026-11-06', changes:[
  '**Knowledge Base: InfoIcon rollout, Phase 1 (task #75).** The `InfoIcon({articleKey})` ' +
  'component already existed (a small "?" control that opens a KB article inline) and was ' +
  'already used in 4 places, but wiring it onto more panel headers had been a flagged, ' +
  'unstarted gap since the first KB batch. First slice: wired it into 5 real `RoutePanelShell`-' +
  'backed panel headers whose titles already have a matching `KB_ARTICLES` key — Needs ' +
  'Attention, Food Cost / End of Month (one component, mode-dependent article), Data Manager, ' +
  'Events, and Inventory Intelligence. 6 new tests mount each real panel and click the real ' +
  'icon. ~109 other panels are deferred to a future slice.',
]};
