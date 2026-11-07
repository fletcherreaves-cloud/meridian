// @ts-nocheck
export default {version:'5.679', date:'2026-11-07', changes:[
  '**KB: new `security_panel_guide` article, wired into the Security panel.** The previous KB ' +
  'finding log (2026-11-03) had flagged this panel as lacking a clean `RoutePanelShell` header ' +
  'and no key written at all — re-reading `App.js`’s actual routing found that `security` ' +
  'already wraps in `RoutePanelShell` (at the App.js route gate, same pattern as several other ' +
  'panels), so wiring the new article in was a one-line `subtitle:h(InfoIcon,...)` add, not a ' +
  'structural change. Article covers the panel’s real subject-grouped (not rule-grouped) ' +
  'design, its four verdict states (flagged/clear/undetermined/hygiene), its RBAC gate matching ' +
  '`security_findings`’ own RLS, and how to read cross-store prevalence before treating a flag ' +
  'as subject-specific.',
]};
