// @ts-nocheck
// ── VLH guide engine (Task #56) ──────────────────────────────────────────────
// Turns the 2022 VLH Workbook's actual Drive Thru + In-Store guest-count -> labor-hours
// tables (vlh_guide_hours, seeded from docs/2022_VLH_Workbook_*.pdf) into a real
// "needed hours" number computed from DAR guest counts, instead of only trusting
// QSRSoft's total_needed_hours as an unconfirmed proxy for the guide.
//
// SCOPE: Drive Thru + In-Store only, matching vlh_guide_hours' own scope (see
// supabase/schema-vlh-guide.sql's header for why the other positions aren't wired).
// A store missing a store_vlh_config row, or a guest count outside every tier's
// [guest_start, guest_end] range, returns null for that leg -- never a guessed number.
import { daypartOf } from './labor-standard.js';

// daypartOf() returns labor-standard.js's capitalized labels ('Late Night'); the guide
// table's own daypart column is lowercase snake_case (parsed straight off the PDF's own
// column headers, see scripts/parse-vlh-workbook.py). Map once here rather than either
// re-casing the shared daypartOf() (touches every other caller) or storing two spellings.
const GUIDE_DAYPART = {
  Breakfast: 'breakfast', Lunch: 'lunch', Afternoon: 'afternoon', Dinner: 'dinner', 'Late Night': 'late_night',
};

/**
 * Index vlh_guide_hours rows for O(1) lookup by config+position+daypart. Each entry is
 * the tier list sorted by guest_start (already contiguous 0..9999 in the source data,
 * but sorted defensively rather than assumed).
 * `rows`: the raw table rows (snake_case, as Supabase returns them).
 */
export function buildVlhGuideIndex(rows) {
  const index = new Map();
  for (const r of rows || []) {
    const key = guideKey(r.guide, r.aot, r.dt_type, r.in_store, r.kitchen, r.position, r.daypart);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push({ tier: r.tier, guestStart: r.guest_start, guestEnd: r.guest_end });
  }
  for (const tiers of index.values()) tiers.sort((a, b) => a.guestStart - b.guestStart);
  return index;
}

function guideKey(guide, aot, dtType, inStore, kitchen, position, daypart) {
  return [guide, !!aot, dtType, inStore, kitchen, position, daypart].join('|');
}

/** store_vlh_config row -> the guide key prefix shared by both positions. */
function configKeyParts(cfg) {
  if (!cfg) return null;
  const { vlh_guide, aot, dt_type, in_store, kitchen } = cfg;
  if (!vlh_guide || !dt_type || !in_store || !kitchen) return null;
  return { guide: vlh_guide === 'hpg' ? 'hpg' : 'standard', aot: !!aot, dtType: dt_type, inStore: in_store, kitchen };
}

/**
 * Guest count -> labor hours for one position/daypart, per the guide's own step function:
 * the tier whose [guestStart, guestEnd] contains guestCount. Returns null (never a guess)
 * when the config has no guide row for this position (e.g. Drive Thru on a no_dt store),
 * the daypart/config combo isn't indexed, or guestCount is negative. `daypart` accepts
 * either spelling (labor-standard.js's 'Late Night' or the guide table's 'late_night') --
 * normalized via GUIDE_DAYPART so callers never have to remember which one to pass.
 */
export function lookupTierHours(index, cfg, position, daypart, guestCount) {
  const parts = configKeyParts(cfg);
  if (!parts || guestCount == null || guestCount < 0) return null;
  const dp = GUIDE_DAYPART[daypart] || daypart;
  const tiers = index.get(guideKey(parts.guide, parts.aot, parts.dtType, parts.inStore, parts.kitchen, position, dp));
  if (!tiers || !tiers.length) return null; // e.g. Drive Thru on a no_dt config
  for (const t of tiers) if (guestCount >= t.guestStart && guestCount <= t.guestEnd) return t.tier;
  return null; // guestCount above the top tier's guestEnd (shouldn't happen -- top tier is always 9999) or below 0
}

/**
 * Guide-derived needed hours for ONE hourly DAR row. Sums Drive Thru + In-Store; a
 * position with no guide row (no_dt config's Drive Thru leg) contributes 0, not null --
 * that leg genuinely needs 0 hours, distinct from "couldn't look it up" for a position
 * the config DOES have (which stays null and should not be silently treated as 0).
 * Returns { driveThruHours, inStoreHours, totalHours, daypart } or null if cfg is
 * incomplete (matches lookupTierHours' own null contract). `daypart` on the return value
 * is labor-standard.js's own capitalized spelling (from daypartOf), matching
 * allocationByStoreDaypart's shape -- only the internal guide-table lookups use the
 * lowercase spelling.
 */
export function guideNeededHoursForRow(index, cfg, row) {
  const parts = configKeyParts(cfg);
  if (!parts || !row || !row.hour_slot) return null;
  const daypart = daypartOf(row.hour_slot);
  const guideDp = GUIDE_DAYPART[daypart];
  const dtRows = index.get(guideKey(parts.guide, parts.aot, parts.dtType, parts.inStore, parts.kitchen, 'drive_thru', guideDp));
  const driveThruHours = dtRows && dtRows.length
    ? lookupTierHours(index, cfg, 'drive_thru', daypart, row.dt_transactions)
    : 0; // no_dt config -- Drive Thru genuinely needs 0 hours, not "unknown"
  const inStoreHours = lookupTierHours(index, cfg, 'in_store', daypart, row.is_transactions);
  const totalHours = (driveThruHours == null || inStoreHours == null) ? null : driveThruHours + inStoreHours;
  return { driveThruHours, inStoreHours, totalHours, daypart };
}

const unpad = (l) => String(parseInt(l, 10) || '');

/**
 * Guide-derived needed hours summed per (loc, daypart), for comparison against DAR's own
 * total_needed_hours -- the "measure it" step CLAUDE.md's own caveat calls for (labor-
 * standard.js's file header: total_needed_hours was "assumed to be the VLH guide
 * value... not confirmed against the workbook tables"). Rows for a store with no
 * store_vlh_config entry are skipped (never guessed).
 * `storeConfigs`: { [loc]: store_vlh_config row } keyed by UNPADDED loc, matching
 * store_vlh_config.loc's own convention (see src/lib/supabase.js's loadVlhStoreConfigs).
 * Returns { [loc]: { [daypart]: { guideHours, reportedHours, rowsMissingGuide } } }.
 */
export function guideVsReportedByStoreDaypart(index, storeConfigs, rows) {
  const buckets = new Map(); // "loc|daypart" -> sums
  for (const r of rows || []) {
    if (!r || !r.hour_slot) continue;
    const loc = unpad(r.loc);
    const cfg = (storeConfigs || {})[loc];
    if (!cfg) continue;
    const guide = guideNeededHoursForRow(index, cfg, r);
    if (!guide) continue;
    const k = loc + '|' + guide.daypart;
    if (!buckets.has(k)) buckets.set(k, { loc, dp: guide.daypart, guideHours: 0, reportedHours: 0, rowsMissingGuide: 0 });
    const b = buckets.get(k);
    if (guide.totalHours == null) b.rowsMissingGuide++;
    else b.guideHours += guide.totalHours;
    b.reportedHours += r.total_needed_hours || 0;
  }
  const out = {};
  for (const b of buckets.values()) {
    if (!out[b.loc]) out[b.loc] = {};
    out[b.loc][b.dp] = {
      guideHours: b.guideHours, reportedHours: b.reportedHours,
      diffHours: b.guideHours - b.reportedHours,
      rowsMissingGuide: b.rowsMissingGuide,
    };
  }
  return out;
}
