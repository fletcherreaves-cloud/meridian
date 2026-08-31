// @ts-nocheck
export default {version:'5.295', date:'2026-08-31', changes:[
  'EOM Print (Missing Items / Recount Impact / Team Snapshot / Count Swings) -- fixed the ' +
  'underlying blank-print bug the v5.294 "Generating..." banner only explained, not fixed. The ' +
  'owner kept seeing a blank print preview on these four reports after that banner shipped, on ' +
  'both single-store and all-locations scopes, with the actual freeze duration varying wildly run ' +
  'to run (3.8s-11.9s). Three further real-measurement investigations -- a faithful real-Chromium ' +
  'reproduction of App.js\'s exact DOM/CSS shape at realistic scale, a CSS-custom-property-cascade ' +
  'benchmark (0.0-0.1ms even at 60,000 extra DOM elements), and console-timing attribution -- never ' +
  'found a reproducible defect in the in-place body.eom-printing + window.print() mechanism these ' +
  'four reports shared with Supervisor Rollup. Per the owner\'s explicit go-ahead, rather than keep ' +
  'chasing an elusive root cause, these four reports moved OFF that mechanism entirely onto ' +
  '`openPrintWindow()` -- the SAME isolated `window.open()` + static-HTML mechanism already proven ' +
  'reliable elsewhere in this codebase (FOB Report, Count Reliability, Rubber-band, District EOM ' +
  'Summary, Chronic Offenders). A fresh window with plain static HTML + hardcoded print-safe CSS ' +
  'has no live React tree, no CSS custom properties, and no shared DOM with the rest of the app to ' +
  'go wrong -- and the main app tab never blocks, since window.print() now runs against a small, ' +
  'isolated document instead of the whole live app. Each report gained a pure `format*Html()` ' +
  'function (mirroring its existing `format*Text()` Copy-button export) so the printed page can\'t ' +
  'disagree with either the screen or the copied text. Supervisor Rollup was NOT migrated -- its ' +
  'own `forPrint` does more than gate a banner (it expands every row, swaps editable cells for ' +
  'plain text) and was never confirmed broken by the owner\'s testing, so it keeps the original ' +
  'mechanism + PrintGeneratingBanner.',
]};
