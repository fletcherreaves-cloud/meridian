// @ts-nocheck
export default {version:'5.491', date:'2026-10-02', changes:[
  'Monthly Projections: laid the groundwork for the owner-requested Jan-Mar 2026 ' +
  'monthly_targets backfill (those months were never uploaded; "flag them clearly" so a ' +
  'reconstructed row is never mistaken for a real approved target). Added a dedicated ' +
  'nullable monthly_targets.data_source column (supabase/schema-monthly-targets-data-source-' +
  'flag.sql) -- updated_by is a uuid FK to profiles(id), not a free-text marker, so it ' +
  'couldn\'t carry this. saveMonthlyTargets() now explicitly clears the flag on every real ' +
  'upload (self-healing retry if the column is not yet migrated, same shape as smg_fullscale\'s ' +
  '`n` column); loadMonthlyTargets()/loadAllMonthlyTargets() map it to _dataSource. The Monthly ' +
  'Projections grid shows a period-level "⚠ Reconstructed" / "⚠ Partially Reconstructed" ' +
  'banner plus a per-store row badge whenever any visible store-month carries the flag.',
  'Fixed a loc-format bug found while preparing the actual backfill data: qsr_fob.loc is ' +
  'zero-padded to 7 chars (NSN convention) while labor_rows/STORE_NAMES use the bare store ' +
  'number -- an unpadded comparison silently matched zero FOB rows for every store. Also ' +
  'found store 43701 (Ponce de Leon-Hwy 81/I-10, opened 2026-03-13) has no real history before ' +
  'the reconstruction window and must be excluded from it entirely, not backfilled with a ' +
  'fabricated pre-opening number. Full methodology: memory/finding-jan-mar-2026-' +
  'reconstruction-2026-10-02.md. ⚠️ Pending owner action: run the migration above, then the ' +
  'already-computed, sanity-checked 78 store-months (26 real stores × 3 months) can be ' +
  'inserted -- see that memory file for the exact next step.',
  '8 new tests (dispatch-jan-mar-reconstruction-flag-2026-10-02.test.js, dispatch-jan-mar-' +
  'reconstruction-ui-badge-2026-10-02.test.js). Full suite: 5246/5246 passing. Build clean, ' +
  'eager payload 555.46 KB gzip (budget 850 KB).',
]};
