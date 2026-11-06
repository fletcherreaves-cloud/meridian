// @ts-nocheck
export default {version:'5.655', date:'2026-11-06', changes:[
  '**Customize Fields: reorder + explicit category add/retire** (task #89, items 1-3). The ' +
  'Customize Fields editor (Monthly Projections + Yearly Targets) already let you hide, rename, ' +
  'and regroup a metric — the underlying engine (`target-field-config.js`) has always supported ' +
  'an explicit `order` per field and per category, it just wasn\'t exposed in the UI. Up/down ' +
  'buttons now reorder a field within its category, or reorder categories themselves, each move ' +
  'renumbering every sibling to a clean sequential rank. "+ Add category" creates a real, empty, ' +
  'named category a field can be moved into later, instead of only existing implicitly once a ' +
  'field happens to be retyped into it. "Retire category" bulk-moves (or hides) every field in a ' +
  'category to a chosen destination in one click, rather than dragging each field out one at a ' +
  'time — the category then empties out and disappears exactly as it always has once nothing ' +
  'points to it. A field\'s category dropdown now also offers every real known category — ' +
  'original, custom, or currently empty — not just the originals, so moving into an existing ' +
  'custom category no longer means retyping its exact name. Items 4 (a picker for brand-new ' +
  'metrics never in the fixed field lists) and 5 (daypart-split targets, likely needing its own ' +
  'schema decision) are explicitly out of scope here — real new capabilities, tracked as a ' +
  'follow-up.',
]};
