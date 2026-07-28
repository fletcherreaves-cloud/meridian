// @ts-nocheck
// ── QSRSoft People / Digital / Delivery report parsers (Notes 32 data sourcing) ──
// Pure, header-indexed parsers for five QSRSoft workbooks that feed the Performance
// Review People/Sales metrics (+ a future delivery-experience project). Each takes a 2D
// `rows` array (header row first, then data) and returns normalized per-loc / per-employee
// records. Header-indexed (find column by name) so a column reorder doesn't break them.
// The manual-upload path and a future Playwright auto-pull both call these — one source
// of truth for the shape, tested against real sample exports. See
// memory/perf-review-data-sourcing.md.

const unpad = l => String(l == null ? '' : l).trim().replace(/^0+/, '') || String(l || '').trim();
const num = v => { if (v == null || v === '') return null; const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[$,%\s]/g, '')); return isFinite(n) ? n : null; };
// Duration → seconds. Handles "H:MM:SS"/"M:SS" strings AND Excel day-fractions (xlsx
// raw-reads a time cell as a fraction of a day, e.g. 0:12:16 → 0.008518), plus plain
// seconds. A number < 1 is an Excel day-fraction (× 86400); ≥ 1 is already seconds.
export function hmsToSec(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v > 0 && v < 1 ? Math.round(v * 86400) : v;
  const s = String(v).trim();
  if (s.includes(':')) {
    const p = s.split(':').map(x => parseInt(x, 10));
    if (p.some(isNaN)) return null;
    return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : p[0];
  }
  const n = parseFloat(s);
  return isFinite(n) ? (n > 0 && n < 1 ? Math.round(n * 86400) : n) : null;
}
// A QSRSoft "blank date" is 0000-00-00 — treat as empty.
const cleanDate = v => { const s = String(v == null ? '' : v).trim(); return (!s || s.startsWith('0000')) ? null : s; };

// Build a header→index map; hget(row, 'Some Header') returns that cell (case/space tolerant).
function headerIndex(header) {
  const idx = {};
  (header || []).forEach((h, i) => { if (h != null) idx[String(h).trim().toLowerCase()] = i; });
  return idx;
}
const cell = (row, idx, ...names) => {
  for (const n of names) { const i = idx[String(n).trim().toLowerCase()]; if (i != null && row[i] != null && row[i] !== '') return row[i]; }
  return null;
};

// ── Job-code taxonomy (configurable) ──────────────────────────────────────────
// Maps a QSRSoft Job Title Code → a role bucket. Codes seen in the field; the
// description fallback covers new/renamed codes. Buckets drive Shift-Certified-Manager
// count and configurable Headcount composition. Owner-overridable via settings later.
export const DEFAULT_JOB_BUCKETS = {
  crew:        { codes: [650, 648], match: [/crew/i] },                     // Crew Person, Crew Trainer
  shiftMgr:    { codes: [647, 845, 846, 10001, 10002, 20107], match: [/swing/i, /dept\.? *mgr/i, /department manager/i] }, // Cert Swing + Dept Mgrs = shift-certified
  gm:          { codes: [641, 45, 541, 801], match: [/general manager/i, /otp pro/i] },
  maintenance: { codes: [670, 671], match: [/maint/i] },
  admin:       { codes: [681], match: [/admin/i] },
};
export function bucketForJob(code, desc, buckets = DEFAULT_JOB_BUCKETS) {
  const c = num(code);
  for (const [b, spec] of Object.entries(buckets)) if (c != null && spec.codes.includes(c)) return b;
  const d = String(desc || '');
  for (const [b, spec] of Object.entries(buckets)) if ((spec.match || []).some(re => re.test(d))) return b;
  return 'other';
}

// ── 1. Employee Roster → per-employee records ─────────────────────────────────
export function parseEmployeeRoster(rows) {
  if (!rows || rows.length < 2) return [];
  const idx = headerIndex(rows[0]);
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]; if (!row) continue;
    const loc = cell(row, idx, 'Loc'); if (loc == null) continue;
    const code = cell(row, idx, 'Primary Job Title Code');
    const desc = cell(row, idx, 'Primary Job Title Code Description');
    out.push({
      loc: unpad(loc),
      homeLocation: cell(row, idx, 'Home Location'),
      geid: cell(row, idx, 'GEID'),
      name: cell(row, idx, 'Employee Name'),
      startDate: cleanDate(cell(row, idx, 'Start Date')),
      endDate: cleanDate(cell(row, idx, 'End Date')),
      employmentStatus: (cell(row, idx, 'Employment Status') || '').toString().trim(),
      locationType: cell(row, idx, 'Location Type'),
      terminationDate: cleanDate(cell(row, idx, 'Termination Date')),
      terminationReason: cell(row, idx, 'Termination Reason'),
      primaryCode: num(code),
      primaryDesc: (desc || '').toString().trim(),
      jobCodeType: cell(row, idx, 'Job Code Type'),
      jobCodeStartDate: cleanDate(cell(row, idx, 'Job Title Code Start Date')),
      bucket: bucketForJob(code, desc),
    });
  }
  return out;
}
// ── 1a. Employee Roster (JSON API) → same records as parseEmployeeRoster ────────
// The api.reports.myqsrsoft.com `/reporting/v2/people/employee-roster` endpoint
// returns camelCase JSON (a FLAT `result: [...]` array — note: not result.resp like
// roster-statistics), one object per employee. Normalize to the SAME record shape
// parseEmployeeRoster emits so rosterCounts / shiftCertifiedByLoc / the review
// auto-populate all consume one contract. The pull deliberately requests a trimmed
// selectCols (job-code + status only) so PII (SSN/DOB/address) never leaves QSRSoft;
// only these non-sensitive fields are read here, and only aggregate counts persist.
// Key map (JSON → record): storeNum→loc · fullEmployeeName→name · storeStartDate/
// storeEndDate→start/end · terminationEntryDate→terminationDate · jobTitleCode→
// primaryCode · jobTitleCodeDescription→primaryDesc.
export function parseEmployeeRosterApi(payload) {
  const arr = Array.isArray(payload) ? payload
    : Array.isArray(payload?.result) ? payload.result
    : Array.isArray(payload?.result?.resp) ? payload.result.resp : [];
  const out = [];
  for (const r of arr) {
    if (!r) continue;
    const loc = r.storeNum != null ? r.storeNum : r.homeLocation;
    if (loc == null) continue;
    const code = r.jobTitleCode;
    const desc = r.jobTitleCodeDescription;
    out.push({
      loc: unpad(loc),
      homeLocation: r.homeLocation,
      geid: r.geid,
      name: r.fullEmployeeName,
      startDate: cleanDate(r.storeStartDate),
      endDate: cleanDate(r.storeEndDate),
      employmentStatus: (r.employmentStatus || '').toString().trim(),
      locationType: r.locationType,
      terminationDate: cleanDate(r.terminationEntryDate),
      terminationReason: r.terminationReason,
      primaryCode: num(code),
      primaryDesc: (desc || '').toString().trim(),
      jobCodeType: r.jobCodeType,
      jobCodeStartDate: cleanDate(r.jobTitleCodeStartDate),
      bucket: bucketForJob(code, desc),
    });
  }
  return out;
}

// Exact "Active" (NOT substring — "Inactive" contains "active"), and no termination date.
const isActive = e => /^active$/i.test(String(e.employmentStatus || '').trim()) && !e.terminationDate;
// Per-loc role-bucket counts from roster records (active employees only by default).
export function rosterCounts(records, { activeOnly = true } = {}) {
  const map = {};
  for (const e of (records || [])) {
    if (activeOnly && !isActive(e)) continue;
    const m = map[e.loc] || (map[e.loc] = { crew: 0, shiftMgr: 0, gm: 0, maintenance: 0, admin: 0, other: 0, total: 0 });
    m[e.bucket] = (m[e.bucket] || 0) + 1; m.total++;
  }
  return map;
}
// # Shift-Certified Managers per loc = active shiftMgr bucket (optionally + GM, who run shifts).
export function shiftCertifiedByLoc(records, { includeGM = false } = {}) {
  const c = rosterCounts(records);
  const out = {};
  for (const loc in c) out[loc] = c[loc].shiftMgr + (includeGM ? c[loc].gm : 0);
  return out;
}

// ── 2. Roster Statistics → per-loc headcount composition ──────────────────────
export function parseRosterStatistics(rows) {
  if (!rows || rows.length < 2) return {};
  const idx = headerIndex(rows[0]);
  const out = {};
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]; if (!row) continue;
    const loc = cell(row, idx, 'Loc'); if (loc == null || !/^\d/.test(String(loc))) continue;
    out[unpad(loc)] = {
      crewStaff: num(cell(row, idx, 'Crew (Staff size)')),
      shiftStaff: num(cell(row, idx, 'Shift (Staff size)')),
      gmdmStaff: num(cell(row, idx, 'GM & DM (Staff size)')),
      crewActive: num(cell(row, idx, 'Crew Active')),
      shiftActive: num(cell(row, idx, 'Shift Active')),
      rosterSize: num(cell(row, idx, 'Roster Size')),
      rosterActive: num(cell(row, idx, 'Roster Active')),
      under18: num(cell(row, idx, 'Under 18 (Staff size)')),
    };
  }
  return out;
}
// ── 2a. Roster Statistics (JSON API) → same shape as parseRosterStatistics ─────
// The api.reports.myqsrsoft.com `/reporting/v2/people/roster-statistics` endpoint
// returns camelCase JSON ({ result: { resp: [...per-store...], totals } }) rather
// than the xlsx 2-D grid. Normalize it to the SAME per-loc record shape
// parseRosterStatistics emits, so the Playwright auto-pull and the manual xlsx
// upload converge on one downstream contract (headcountFromStats, the review
// auto-populate, and saveRosterStatistics all consume this shape). API-key →
// record mapping verified against the owner's 3708 export:
//   crewSize 63 → crewStaff · swingSize 7 → shiftStaff · managerSize 2 → gmdmStaff
//   crewActive 55 · swingActive 7 → shiftActive · totalStaff 72 → rosterSize
//   totalActiveStaff 64 → rosterActive · under18 10   (63+7+2=72; 55+7+2=64)
export function parseRosterStatisticsApi(payload) {
  const arr = Array.isArray(payload) ? payload
    : Array.isArray(payload?.result?.resp) ? payload.result.resp
    : Array.isArray(payload?.resp) ? payload.resp
    : Array.isArray(payload?.result) ? payload.result : [];
  const out = {};
  for (const r of arr) {
    if (!r) continue;
    const nsn = r.nsn;
    // Skip the "Grand Total" summary row (nsn is a label, not a store number).
    if (nsn == null || !/^\d/.test(String(nsn))) continue;
    out[unpad(nsn)] = {
      crewStaff: num(r.crewSize),
      shiftStaff: num(r.swingSize),
      gmdmStaff: num(r.managerSize),
      crewActive: num(r.crewActive),
      shiftActive: num(r.swingActive),
      rosterSize: num(r.totalStaff),
      rosterActive: num(r.totalActiveStaff),
      under18: num(r.under18),
    };
  }
  return out;
}

// Configurable headcount: sum the chosen buckets from a Roster-Statistics record.
// buckets default to all active hourly (crew + shift + gm&dm) = Roster Active.
export function headcountFromStats(stat, { include = ['crew', 'shift', 'gmdm'] } = {}) {
  if (!stat) return null;
  if (include.length === 3 && include.includes('crew') && include.includes('shift') && include.includes('gmdm') && stat.rosterActive != null)
    return stat.rosterActive; // exact roster-active when all buckets selected
  const map = { crew: stat.crewActive, shift: stat.shiftActive, gmdm: stat.gmdmStaff };
  const vals = include.map(b => map[b]).filter(v => v != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
}

// ── 3. Turnover → per-loc (all columns captured; 0-90 mapping owner-confirmed later) ──
export function parseTurnover(rows) {
  if (!rows || rows.length < 2) return {};
  const idx = headerIndex(rows[0]);
  const out = {};
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]; if (!row) continue;
    const loc = cell(row, idx, 'Loc'); if (loc == null || !/^\d/.test(String(loc))) continue;
    const retained90Pct = num(cell(row, idx, 'Retained > 90 Pct'));
    out[unpad(loc)] = {
      month: cell(row, idx, 'Month'),
      hires: num(cell(row, idx, 'Hires')),
      rosterSize: num(cell(row, idx, 'Roster Size')),
      terms: num(cell(row, idx, 'Terms')),
      termsUnder90: num(cell(row, idx, 'Terms < 90')),
      retainedOver90: num(cell(row, idx, 'Retained > 90')),
      retainedOver90Pct: retained90Pct,
      monthlyAnnualTurnover: num(cell(row, idx, 'Monthly Annual Turnover')),
      ttmTurnover: num(cell(row, idx, 'TTM Turnover')),
      threeMonthTurnover: num(cell(row, idx, '3-Month Turnover')),
      // 0-90 turnover % proxy = share of the 90-day cohort NOT retained (1 − retained>90%).
      // Owner to confirm the canonical definition before this scores.
      turnover090Pct: retained90Pct == null ? null : 1 - retained90Pct,
    };
  }
  return out;
}

// ── 3a. Turnover (JSON API) → per-(loc, month) records for turnover_monthly ─────
// The api.reports.myqsrsoft.com `/reporting/v2/people/turnover-report` endpoint
// returns { result: { resp: [ {nsn, month, totalHire, terminations, term90,
// retained90Days, retained90Pct, monthlyAnnualTurnOver, ttmTurnover,
// threeMonthTurnover, …}, … per store × month … ], totals } }. With nsd=d each row
// is one store-month (nsd=s aggregates every store to nsn "All Selected" — skipped
// here). Returns a FLAT ARRAY (not keyed by loc) because the API is multi-month per
// store, unlike the single-month xlsx parseTurnover. Feeds saveTurnoverMonthly's
// row shape per record. 0-90 turnover = 1 − retained90Pct (== the report's term90Pct).
// Key map: totalHire→hires · totalStaff→rosterSize · terminations→terms · term90→
// termsUnder90 · retained90Days→retainedOver90 · monthlyAnnualTurnOver (capital O).
export function parseTurnoverApi(payload) {
  const arr = Array.isArray(payload) ? payload
    : Array.isArray(payload?.result?.resp) ? payload.result.resp
    : Array.isArray(payload?.result) ? payload.result
    : Array.isArray(payload?.resp) ? payload.resp : [];
  const out = [];
  for (const r of arr) {
    if (!r) continue;
    const nsn = r.nsn;
    if (nsn == null || !/^\d/.test(String(nsn))) continue;      // skip "All Selected"/"Grand Total"
    const month = String(r.month == null ? '' : r.month).trim();
    if (!/^\d{4}-\d{2}$/.test(month)) continue;                 // need a real YYYY-MM (totals month is "13")
    const ret90 = num(r.retained90Pct);
    out.push({
      loc: unpad(nsn),
      month,
      hires: num(r.totalHire),
      rosterSize: num(r.totalStaff),
      terms: num(r.terminations),
      termsUnder90: num(r.term90),
      retainedOver90: num(r.retained90Days),
      retainedOver90Pct: ret90,
      monthlyAnnualTurnover: num(r.monthlyAnnualTurnOver),
      ttmTurnover: num(r.ttmTurnover),
      threeMonthTurnover: num(r.threeMonthTurnover),
      turnover090Pct: ret90 == null ? null : 1 - ret90,
    });
  }
  return out;
}

// ── 3b. Turnover (WIDE org rollup) → { month: { category: value } } ───────────
// The annual export is pivoted: row = category (Hires/Terms/…), column = month + Total,
// org-wide (no per-loc). Useful for an org turnover trend; reviews use the per-loc monthly
// format above. Row 1 = month headers (col0 blank), row 2 = "Value" labels, data from row 3.
export function parseTurnoverWide(rows) {
  if (!rows || rows.length < 3) return { months: [], byCategory: {} };
  const monthsRow = rows[0] || [];
  const months = monthsRow.slice(1).map(m => (m == null ? '' : String(m).trim())).filter(Boolean);
  const byCategory = {};
  for (let r = 2; r < rows.length; r++) {
    const row = rows[r]; if (!row || row[0] == null) continue;
    const cat = String(row[0]).trim(); if (!cat) continue;
    byCategory[cat] = {};
    months.forEach((mo, i) => { byCategory[cat][mo] = num(row[i + 1]); });
  }
  return { months, byCategory };
}

// ── 4. Digital App → per-loc (uses the clean "Digital App" summary sheet) ─────
export function parseDigitalApp(rows) {
  if (!rows || rows.length < 2) return {};
  const idx = headerIndex(rows[0]);
  const out = {};
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]; if (!row) continue;
    const loc = cell(row, idx, 'Loc'); if (loc == null || !/^\d/.test(String(loc))) continue;
    out[unpad(loc)] = {
      sales: num(cell(row, idx, 'Digital App Sales')),
      gcs: num(cell(row, idx, 'Digital App GCs')),
      avgCheck: num(cell(row, idx, 'Digital App Average Check', 'Digital App Average')),
      pctOfSales: num(cell(row, idx, 'Digital App % of Total Sales', 'Digital App Percent')),
      gcPerRestDay: num(cell(row, idx, 'Digital App GC/R/D')),
    };
  }
  return out;
}

// ── 4a. Digital App (JSON API) → same per-loc records as parseDigitalApp ────────
// The api.reports.myqsrsoft.com `/reporting/v2/sales/qtr-hr-sales` endpoint (the
// mobileApp report) returns granular components, NOT a "Digital App" rollup. QSRSoft
// composes Digital App = Mobile Order Ahead + Scanned Offers (all 3 variants) +
// Loyalty Self-ID Earn + Internal/GMA Delivery. Reconciled EXACTLY (sales AND GCs)
// against the owner's 2026-07-27 export across 4 stores — e.g. 3708:
//   Sales 1690.3+61.09+880.17+0+228.11+125.51 = 2985.18; GCs 180+13+61+0+23+6 = 283.
// Review metric = Digital App GC/R/D = Digital App GCs ÷ qualified rest-days
// (per-store, single day → restDays=1 → GC/R/D = GCs).
const DIGITAL_SALES_FIELDS = ['mobileOrderAheadAllNetSales', 'scannedOfferOnlyRewardsAllNetSales', 'scannedOfferNoRewardsAllNetSales', 'scannedOfferRewardsAndOfferAllNetSales', 'loyaltySelfIDEarnAllNetSales', 'intDeliveryAllNetSales'];
const DIGITAL_GC_FIELDS = ['mobileOrderAheadTransactions', 'scannedOfferOnlyRewardsTransactions', 'scannedOfferNoRewardsTransactions', 'scannedOfferRewardsAndOfferTransactions', 'loyaltySelfIDEarnTransactions', 'intDeliveryTransactions'];
const sumFields = (r, fields) => { let s = 0, any = false; for (const f of fields) { const v = num(r[f]); if (v != null) { s += v; any = true; } } return any ? s : null; };
export function parseDigitalAppApi(payload) {
  const arr = Array.isArray(payload) ? payload
    : Array.isArray(payload?.result) ? payload.result
    : Array.isArray(payload?.result?.resp) ? payload.result.resp
    : Array.isArray(payload?.resp) ? payload.resp : [];
  const out = {};
  for (const r of arr) {
    if (!r) continue;
    const nsn = r.storeNum != null ? r.storeNum : r.nsn;
    if (nsn == null || !/^\d/.test(String(nsn))) continue;   // skip aggregate/total rows
    const sales = sumFields(r, DIGITAL_SALES_FIELDS);
    const gcs = sumFields(r, DIGITAL_GC_FIELDS);
    const total = num(r.allNetSales);
    const restDays = num(r.qualifiedDay) != null ? num(r.qualifiedDay) : num(r.numberOfDays);
    out[unpad(nsn)] = {
      sales,
      gcs,
      avgCheck: (sales != null && gcs) ? sales / gcs : null,
      pctOfSales: (sales != null && total) ? sales / total : null,
      gcPerRestDay: (gcs != null && restDays) ? gcs / restDays : gcs,   // restDays=1 → = gcs
      restDays,
    };
  }
  return out;
}

// ── 5. McDelivery 3PO → per-loc (3PO GC + delivery-experience fields) ──────────
export function parseMcDelivery3PO(rows) {
  if (!rows || rows.length < 2) return {};
  const idx = headerIndex(rows[0]);
  const out = {};
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]; if (!row) continue;
    const loc = cell(row, idx, 'Loc'); if (loc == null || !/^\d/.test(String(loc))) continue;
    out[unpad(loc)] = {
      vendor: cell(row, idx, 'Vendor'),
      posMcDeliveryGC: num(cell(row, idx, 'POS McDelivery GC')),
      pos3poSales: num(cell(row, idx, 'POS 3PO Delivery Sales')),
      threePoGC: num(cell(row, idx, '3PO GC')),                      // → Delivery GC/Rest/Day
      csat: num(cell(row, idx, 'CSAT')),
      ordersMissingItemsPct: num(cell(row, idx, 'Orders with Missing Items')),
      incorrectOrders: num(cell(row, idx, 'Incorrect Orders')),
      mcDeliveryTimeSec: hmsToSec(cell(row, idx, 'McDelivery Time')),
      restaurantTimeSec: hmsToSec(cell(row, idx, 'Restaurant Time')),
      totalExperienceTimeSec: hmsToSec(cell(row, idx, 'Total Experience Time')),
    };
  }
  return out;
}

// ── 5a. McDelivery 3PO (JSON API) → same per-loc records as parseMcDelivery3PO ──
// The api.reports.myqsrsoft.com `/reports/mcd/sales/mcDeliveryReport` endpoint returns
// { resp: [ {nsn, vendor, deliveryTransactions, deliveryAllNetSales, avgDeliveryTime,
// avgRestaurantTime, avgTotalTime, ordersMissingItemsPct, "3POTrans", avgCSat,
// entireOrderIncorrect, qualifiedReviews, …} ], totals } — top-level `resp` (NOT
// result.resp). Times are DECIMAL MINUTES (×60 → seconds). Verified 1:1 against the
// owner's 3708 sample: deliveryTransactions 69 = POS McDelivery GC, 3POTrans 79 =
// 3PO GC, deliveryAllNetSales 1182.92, avgDeliveryTime 12.26 → 736s = "0:12:16",
// avgCSat 4.5 = CSAT. Review metric = Delivery GC/R/D (3PO GC per restaurant-day).
const minToSec = m => { const n = num(m); return n == null ? null : Math.round(n * 60); };
export function parseMcDelivery3POApi(payload) {
  const arr = Array.isArray(payload) ? payload
    : Array.isArray(payload?.resp) ? payload.resp
    : Array.isArray(payload?.result?.resp) ? payload.result.resp
    : Array.isArray(payload?.result) ? payload.result : [];
  const out = {};
  for (const r of arr) {
    if (!r) continue;
    const nsn = r.nsn;
    if (nsn == null || !/^\d/.test(String(nsn))) continue;   // skip "All Selected" totals row
    out[unpad(nsn)] = {
      vendor: r.vendor,
      posMcDeliveryGC: num(r.deliveryTransactions),
      pos3poSales: num(r.deliveryAllNetSales),
      threePoGC: num(r['3POTrans']),                          // → Delivery GC/Rest/Day
      csat: num(r.avgCSat),
      ordersMissingItemsPct: num(r.ordersMissingItemsPct),
      incorrectOrders: num(r.entireOrderIncorrect),
      mcDeliveryTimeSec: minToSec(r.avgDeliveryTime),
      restaurantTimeSec: minToSec(r.avgRestaurantTime),
      totalExperienceTimeSec: minToSec(r.avgTotalTime),
      qualifiedReviews: num(r.qualifiedReviews),
    };
  }
  return out;
}
