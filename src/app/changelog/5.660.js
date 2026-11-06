// @ts-nocheck
export default {version:'5.660', date:'2026-11-06', changes:[
  '**Knowledge Base: 6 more Panel Guide articles (task #75) — the Supervisor-section plan doc ' +
  'is now fully exhausted.** Picked, in order: the four remaining named-but-uncovered ' +
  'Reports-Hub deep-dives (`price_change_impact_guide`, `item_velocity_guide`, ' +
  '`channel_mix_guide`, `custom_report_builder_guide`), plus two clearly-daily-use panels no ' +
  'plan doc names directly: `attention_guide` (Needs Attention — the ~17-detector ' +
  '`buildAttentionFeed()` merge, the no-silent-caps `rankAttention()` design, the separate ack ' +
  'row from the swing alarm) and `brief_guide` (Forecast Brief). **Writing `brief_guide` caught ' +
  'a real mix-up, not just a doc gap:** `id:\'brief\'` actually renders `LocationBrief` — a ' +
  'SAGE-written narrative brief over 6 weeks of real trailing performance, on-screen titled ' +
  '"Intelligence Brief" — NOT `DistrictPriorityBrief`, a different component entirely reached ' +
  'through a separate modal. This surfaced and fixed a real stale `panel_index` line that had ' +
  'it backwards ("pre-forecast analysis of the upcoming period" — the panel is entirely ' +
  'retrospective). 13 new tests (2 per article + 1 for the stale-wording fix), 94 KB_ARTICLES ' +
  'keys total; build clean.',
]};
