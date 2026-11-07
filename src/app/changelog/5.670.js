// @ts-nocheck
export default {version:'5.670', date:'2026-11-07', changes:[
  '**InfoIcon rollout, Phase 3 (task #75) + a real mis-wiring bugfix.** Wired the existing ' +
  '`InfoIcon` "?" control into 9 more real `RoutePanelShell`-backed panels whose title already ' +
  'has a matching Knowledge Base article: Market Intelligence (Location Intelligence), Delivery ' +
  '& Channel Mix, Equipment Results, Reports Hub, My Reports, SMG VOICE, Org Summary (Operator ' +
  'Summary), Performance Reviews, and Store One-Pager Generator. Also fixed a real content ' +
  'mismatch found while re-measuring: Food Cost\'s "End of Month" mode was wired to ' +
  '`eom_dashboard_guide`, whose real article content describes a different, separate panel ' +
  '(Inventory Control / `EOMDashboardPanel`) — both Food Cost modes now correctly wire ' +
  '`food_cost_panel` (which already documents the End-of-Month mode as a tab within itself), ' +
  'and `eom_dashboard_guide` is now wired onto the Inventory Control panel it actually ' +
  'describes. Wiring-only otherwise — no new KB content. 29 of ~114 real `KB_ARTICLES` keys are ' +
  'now wired to a real panel; see `memory/finding-kb-panel-guide-2026-11-03.md` for the running ' +
  'list and deferred candidates.',
]};
