// @ts-nocheck
export default {version:'5.853', date:'2026-11-22', changes:[
  '**Egress Wave 1 delta-sync pilots #7/#8: `hmeDt` and `squadle` now watermark-sync too — ' +
  'closing every Phase-1.5-cached stream except `lifelenz_attendance_summary` (Wave 2).** Task ' +
  '#190 (`memory/plan-egress-reduction-2026-11-20.md` Section 17/23/24). Both tables only needed ' +
  '`updatedAt` exposed on their loaders, but each had a wrinkle: `hme_dt_daily` carries BOTH ' +
  '`pulled_at` (already exposed) and a separate `updated_at` — the watermark needed the latter. ' +
  '`squadle_checklist_records`\'s real primary key is `(squadle_location_id, dt)`, NOT `(loc, ' +
  'dt)` — the schema file\'s own header explains `loc` is derived from the record\'s `tags` ' +
  'field, not an independently-unique identifier — so `mergeSquadleDelta` keys on ' +
  '`squadleLocationId`, with a dedicated test proving two rows sharing one `loc` on the same ' +
  'date stay distinct (the exact case a `(loc,dt)` key would have silently collapsed). Both ' +
  'confirmed upsert-only before building on them. `_stHmeDt`/`_stSquadle` now read a ' +
  '`localStorage` watermark and merge the delta into `ds.hmeDtRows`/`ds.squadleChecklistRows` ' +
  'instead of replacing the whole array every login. 10 new tests ' +
  '(`dispatch-egress-wave1-pilot7-hmedt-watermark-2026-11-22.test.js`, ' +
  '`dispatch-egress-wave1-pilot8-squadle-watermark-2026-11-22.test.js`). No further Wave 1 ' +
  'delta-sync candidates remain. See `memory/plan-egress-reduction-2026-11-20.md` Section 24. ' +
  'Full suite + build both clean.',
]};
