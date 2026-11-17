// @ts-nocheck
export default {version:'5.822', date:'2026-11-17', changes:[
  '**Equipment Results: click a store to see every item on file, grouped by area.** Owner ' +
  'request — the panel only ever showed a per-store rollup count. A store name is now ' +
  'clickable, opening a modal that lists every currently-logged item for that store (equipment, ' +
  'serial #, cert date, logged by), grouped by floor-plan area in the same order the Layout ' +
  'Planner\'s own zone grid uses, with a trailing group for anything logged without an area yet. ' +
  'New pure `buildEquipmentStoreDetail()` (`src/engine/equipment-survey.js`) does the ' +
  'filter/group logic so it stays testable independent of the networked panel.',
]};
