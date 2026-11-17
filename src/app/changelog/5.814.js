// @ts-nocheck
export default {version:'5.814', date:'2026-11-17', changes:[
  '**Equipment Layout Planner promoted out of Test Kitchen into main nav, plus two real fixes ' +
  '(owner request).** The in-app, authenticated drag-and-drop floor-plan editor (built ' +
  '2026-10-21) already covered the owner\'s ask to keep adding equipment via the public survey ' +
  'form while also editing it in-app — it was just hidden. Before promoting it, fixed what the ' +
  'owner correctly suspected would break: (1) the Manufacturer/Model dropdown\'s "Type it in ' +
  'instead" option was a dead end — it set nothing and rendered no text input. Replaced with a ' +
  '"+ New" button that adds a real `equipment_catalog` row (flagged, source:\'crew-added\', same ' +
  'provenance pattern the public survey\'s own catalog-review path uses) via a new ' +
  '`addEquipmentCatalogItemDirect()` helper, plus an always-visible "Manual description" field ' +
  'for anything not worth a catalog entry. (2) A deeper bug: a freshly palette-dropped item lost ' +
  'its equipment type permanently, because `buildPlacedItems` derives type only from a resolved ' +
  '`catalog_item_id`, and new drops were saved with `catalog_item_id: null`. Fixed by lazily ' +
  'creating (or reusing) a per-type `(unspecified)` placeholder catalog row on drop, so the ' +
  'inspector can always resolve a type and the real manufacturer/model can be filled in after. ' +
  'Also added an owner-approved "Other / Not Listed" catch-all type (34 real types -> 35) for ' +
  'anything that doesn\'t fit an existing group, backed by the same manual-description field ' +
  'rather than a fabricated manufacturer/model list. `panel-registry.js`: kind:\'test-kitchen\' ' +
  '-> kind:\'nav\' (section was already the correct \'operations\' from day one, per the ' +
  'promotion-is-a-one-field-flip standard).',
]};
