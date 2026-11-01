// @ts-nocheck
export default {version:'5.594', date:'2026-11-01', changes:[
  '**Custom location groups + consolidated "Performance Summary" tile.** Owner, from a ' +
  'screenshot of the District View Enterprise Overview plus two QSRSoft screenshots of its own ' +
  'Locations/Patches multi-select picker: "let\'s move the total company performance off of the ' +
  'individual location tiles under district tile view... give that a tile of its own that could ' +
  'be dynamically viewed by selecting the grouping... a selected group of restaurants of user ' +
  'choice... incorporate that throughout the app as well."',
  'Replaced the three fixed, near-duplicate Supervisor/Operator/Organization Performance Summary ' +
  'sections in the Store Dashboard\'s Enterprise Overview with ONE "📊 Performance Summary" tile: ' +
  'Location / Patch / Operator / Organization / Custom Group pills. State and Organization ' +
  'collapse to one mode -- for this fleet they are the same 1:1 partition (MCDOK=Oklahoma, ' +
  'Emerald Arches=Florida), so a separate mode would just relabel identical groups.',
  'Fixed a real latent bug in the same pass: the old Operator section read the static ' +
  'INV_ORG_COORDS[loc].op directly; the new one uses the live operatorOf() resolver (the same ' +
  'dispatch #139 pattern the Patch tier already used). Confirmed live in testing that ' +
  'INV_ORG_COORDS[\'3708\'].sup (static seed) actually disagrees with the live supervisorGroups() ' +
  'for at least one real store -- not a no-op fix.',
  'New: src/engine/location-groups.js (pure CRUD + grouping math), src/components/' +
  'LocationGroupPicker.js (QSRSoft-style Locations/Patches multi-select modal). Saved groups are ' +
  'shared (not per-user) in org_config key custom_location_groups -- same table/RLS tier ' +
  'supervisorGroups/operators/eom_digest_config already use -- so a saved group is reusable by ' +
  'everyone, cross-device, immediately.',
  'LocationSelector/buildLocationHierarchy (PanelControls.js) gained an optional customGroups ' +
  'prop and a new "group" value level -- fully additive, every existing caller that doesn\'t pass ' +
  'it is unaffected. Only the new Performance Summary tile passes it today; wiring it into other ' +
  'LocationSelector consumers is opportunistic follow-on work, not a sweep done in this pass.',
  '31 new tests across 3 files, including a render test of the real StoreDash Enterprise ' +
  'Overview (not just the engine function in isolation). Full suite green, build clean. ' +
  'memory/project-backlog.md updated -- §A (the dropdown-vs-flat-list mode sweep) stays open and ' +
  'separate from this.',
]};
