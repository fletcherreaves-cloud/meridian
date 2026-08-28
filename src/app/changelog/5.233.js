// @ts-nocheck
export default {version:'5.233', date:'2026-08-28', changes:[
  'Dispatch #192 -- URL migration batch 1: converted six panels (Needs Attention, Signals, ' +
  'Security, Rankings, Promo/Discount ROI, Daily Brief) from modal-only to route:true ' +
  '(RoutePanelShell), per the owner-affirmed standing default "convert pages to urls except ' +
  'where specified or you have a strong opinion otherwise." Attention/Ranking/Promo-ROI each had ' +
  'their own hand-rolled position:fixed/inset:0/rgba(0,0,0 backdrop refactored to RoutePanelShell ' +
  'internally (backdrop-bypass ratchet: 73 -> 70); Security/Signals/Morning Brief had no internal ' +
  'chrome and are wrapped in RoutePanelShell directly at the App.js call site. Promo/Discount ROI ' +
  'and Daily Brief were also lazy-wrapped (previously static top-level imports in App.js) as part ' +
  'of the same change. Measured: the Promo ROI lazy-wrap genuinely shrinks the entry chunk; the ' +
  'Daily Brief one does not, because src/engine/pipeline.js (unrelated, statically imported by ' +
  'App.js) separately imports STORE_STAFF/CONTACTS from the same module -- left untouched, out of ' +
  'scope for a presentation/routing-only dispatch. Data Manager\'s route:true classification is ' +
  'intentionally left open for the owner, not decided here.',
]}
