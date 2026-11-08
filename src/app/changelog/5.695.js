// @ts-nocheck
export default {version:'5.695', date:'2026-11-08', changes:[
  '**Wired 12 more Knowledge Base articles into their real panels (task #75, ongoing KB-coverage '+
  'backlog).** Re-measured the real gap first: of 117 `KB_ARTICLES` keys, only 43 had a clickable '+
  '"?" `InfoIcon` anywhere — 74 existed with no way to reach them from the panel they describe. '+
  '12 of those 74 shared one real mechanical cause rather than being 12 separate oversights: '+
  '`ReportShell` (the shared date-range + LocationSelector + Run/export chrome behind every '+
  '"Reports Hub deep-dive" panel) had no `articleKey` prop at all, so none of its 12 real '+
  'consumers could ever surface one. Added an optional `articleKey` prop to `ReportShell` itself '+
  '(renders the icon next to the existing subtitle, same convention every other wiring in this '+
  'backlog uses) and wired it on all 12 call sites, each confirmed against its own already-'+
  'written, title-matching article rather than guessed from the key name: Cash Variance Pattern, '+
  'Channel Mix, Controls ↔ Food Cost Linkage, Conversion Efficiency Ratio, Custom Report Builder, '+
  'FOB Reference Table, Item Velocity, Labor Opportunity Cost, Loss Prevention Summary, Oil '+
  'Efficiency, Price Change Impact, Weather Impact. 55 of 117 keys now wired. No new article '+
  'content written this pass — pure wiring of already-good, already-unlinked articles.',
]};
