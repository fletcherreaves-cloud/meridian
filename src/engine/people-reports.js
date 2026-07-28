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
