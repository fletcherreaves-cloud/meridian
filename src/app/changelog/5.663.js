// @ts-nocheck
export default {version:'5.663', date:'2026-11-06', changes:[
  '**Knowledge Base: 4 more Panel Guide articles (task #75) — closes out the ' +
  'panel-registry.js-sweep candidate pool batches 8/9 worked through.** Added ' +
  '`panel_manager_guide` (visibility toggles are `localStorage`-only, per device, with no ' +
  'Supabase sync — unlike nearly everything in Settings — and never an access restriction), ' +
  '`settings_guide` (documents the opposite persistence model: most sections DO sync via ' +
  '`pushConfigToSupabase(..., \'app_settings\')`, with the Anthropic API key called out as the ' +
  'one deliberate `localStorage`-only exception), `troubleshooting_guide` (the End User / ' +
  'Developer mode split, no separate permission gate on Developer mode, and that its content ' +
  'is seeded from real existing sources — `buildTroubleshootPrompt()`, the `STREAMS` array — ' +
  'not a second hand-typed copy), and `news_guide` (the real nine-outlet nightly RSS pull → ' +
  'classify → locality-attribution pipeline, the deliberate "EITHER store" rendering for ' +
  'genuinely ambiguous stories, and the panel\'s own explicit non-claim to be brand ' +
  'monitoring). **Also found:** two of batch 9\'s own candidate picks (`help`/`admin`) were ' +
  'false positives — `panel-registry.js` `SECTIONS` entries, not real panels — excluded rather ' +
  'than written up as empty guides. 8 new tests, 110 KB_ARTICLES keys total; build clean.',
]};
