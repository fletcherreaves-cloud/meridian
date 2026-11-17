// @ts-nocheck
export default {version:'5.820', date:'2026-11-17', changes:[
  '**Fixed: dragging a palette item (e.g. "Marinator") into a Layout Planner zone failed with ' +
  '"null value in column \'instance_id\'".** `equipment_survey_entries.instance_id` is `uuid not ' +
  'null` with **no column default** — only `id` gets `default gen_random_uuid()`. ' +
  '`saveEquipmentEntryDirect()` wrongly assumed a DB default existed and sent nothing at all for ' +
  'a brand-new item (`instance_id: row.instance_id || undefined`). The public equipment-survey ' +
  'edge function already generates a fresh `crypto.randomUUID()` client-side for exactly this ' +
  'reason — `saveEquipmentEntryDirect()` now does the same.',
]};
