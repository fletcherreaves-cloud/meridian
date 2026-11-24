// @ts-nocheck
export default {version:'5.858', date:'2026-11-24', changes:[
  '**`[sweep:dead-code]` — removed 2 proven-dead Supabase write helpers (`savePmixRows`, ' +
  '`saveRosterRoleCounts`), the first run of this rotation dimension.** Weekly self-maintenance ' +
  'sweep (dead-code dimension, never run before this firing). Both had zero real callers anywhere ' +
  'in the repo — confirmed by a whole-codebase occurrence count (not a src/-only scan, which would ' +
  'have missed a caller living in `scripts/`), each superseded by an equivalent inline upsert the ' +
  'real pull script (`qsrsoft-pmix-pull.mjs` / `qsrsoft-employee-roster-pull.mjs`) already runs ' +
  'instead, with its own comment explaining the deliberate bypass. Their read-side counterparts ' +
  '(`loadPmixRows` via `qsr_product_mix`, `loadRosterRoleCounts`) are untouched and still live — ' +
  'this removes only the unused write path, not the feature. ' +
  'A first pass over the same codebase also flagged `PER_THOUSAND`, `LOCALITY_BY_LOC`, and ' +
  '`DEFAULT_JOB_BUCKETS` as zero-reference — re-measured and found WRONG (a bug in the scanner\'s ' +
  'own heuristic: each is genuinely used as a default parameter value on a sibling exported ' +
  'function\'s signature, which a naive "starts with export" line check miscounted as the same ' +
  'declaration). Left untouched; see commit body for the full correction. ' +
  '8 other true zero-reference exports were found and deliberately NOT removed — `loadMyTenantId`/' +
  '`loadTenants`/`loadTenantStores` read as scaffolding for the roadmap\'s own future multi-tenant ' +
  'milestone, and the rest (`IMPACT_MAGNITUDES`/`IMPACT_DAYPARTS`/`DAYPART_LABELS`, ' +
  '`LIFELENZ_ROLE_CATEGORIES`, `loadEquipmentCatalogSettingsDirect`, `getNotificationConsent`, ' +
  '`loadQsrOnHandItemHistory`) plausibly back a half-built or forward-looking feature rather than ' +
  'confirmed abandonment — a product-judgment call, Tier C per `memory/sweep-dimensions.md`, ' +
  'reported rather than touched. Full suite 940 files / 8580 tests green, build clean, 722.71 KB ' +
  'gzipped eager payload (pure removal, no new static import).',
]};
