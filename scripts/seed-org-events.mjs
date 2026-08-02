// ── Seed org_events + org_school_config from the staffing-events workbook (Notes 46) ─────────────
// One-time bulk import. Run AFTER creating the tables (supabase/schema-org-events.sql).
//
//   node scripts/seed-org-events.mjs "/path/to/All Staffing Events.xlsx"
//   node scripts/seed-org-events.mjs "…xlsx" --dry     # parse + report only, no writes
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (service role bypasses RLS for the bulk load).
// Uses the SAME parser the app uses (src/engine/events-import.js) → zero drift. Only Confirmed events
// import. Real cell hyperlinks are extracted and aligned to the parser's post-filter row index.

import fs from 'node:fs';
import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { parseStaffingEvents, parseSchoolDistricts } from '../src/engine/events-import.js';

const FILE = process.argv[2];
const DRY = process.argv.includes('--dry');
if (!FILE) { console.error('Usage: node scripts/seed-org-events.mjs "<workbook.xlsx>" [--dry]'); process.exit(1); }
if (!fs.existsSync(FILE)) { console.error('File not found:', FILE); process.exit(1); }

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!DRY && (!URL || !KEY)) { console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (use --dry to parse only)'); process.exit(1); }

// Read a worksheet into { rows: array-of-arrays (incl. header), urls: parallel hyperlink Target per row }.
// XLSX.readFile preserves cell hyperlinks in cell.l.Target. We locate the URL column by header name.
function readSheet(ws) {
  const range = XLSX.utils.decode_range(ws['!ref']);
  const rows = [], urls = [];
  // header first, to find the URL column index
  const header = [];
  for (let C = range.s.c; C <= range.e.c; C++) {
    const cell = ws[XLSX.utils.encode_cell({ r: range.s.r, c: C })];
    header.push(cell ? String(cell.v) : '');
  }
  const urlCol = header.findIndex(hName => /url|verif|source|link/i.test(hName));
  for (let R = range.s.r; R <= range.e.r; R++) {
    const row = []; let url = null;
    for (let C = range.s.c; C <= range.e.c; C++) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      row.push(cell ? cell.v : '');
      if (cell && cell.l && cell.l.Target && (urlCol < 0 || C === urlCol)) url = cell.l.Target;
    }
    rows.push(row); urls.push(url);
  }
  return { rows, urls };
}

// Align hyperlink URLs to the parser's internal filter: rows.slice(1).filter(r[0] present).
function urlMapFor(rows, urls) {
  const dataUrls = urls.slice(1);
  const map = {}; let fi = 0;
  rows.slice(1).forEach((r, rawIdx) => {
    if (r && r[0] !== '' && r[0] != null) { if (dataUrls[rawIdx]) map[fi] = dataUrls[rawIdx]; fi++; }
  });
  return map;
}

const wb = XLSX.readFile(FILE, { cellHTML: false });
console.log('Sheets:', wb.SheetNames.join(' | '));

// Events sheet: name contains "event" or "staffing" (but not "district"/"overview").
const evSheetName = wb.SheetNames.find(n => /event|staffing/i.test(n) && !/district|overview/i.test(n));
const scSheetName = wb.SheetNames.find(n => /district|school|overview/i.test(n));

let events = [], districts = [], estimated = 0, skipped = 0;
if (evSheetName) {
  const { rows, urls } = readSheet(wb.Sheets[evSheetName]);
  const urlMap = urlMapFor(rows, urls);
  const res = parseStaffingEvents(rows, urlMap);
  events = res.events; estimated = res.estimated; skipped = res.skipped;
  console.log(`\nEvents sheet "${evSheetName}": ${events.length} confirmed  (${estimated} estimated skipped, ${skipped} other skipped)`);
  const byType = {}; let withUrl = 0, spans = 0;
  for (const e of events) { byType[e.type] = (byType[e.type] || 0) + 1; if (e.url) withUrl++; if (e.span) spans++; }
  console.log('  types:', JSON.stringify(byType));
  console.log(`  ${withUrl} with URL, ${spans} spans`);
} else console.warn('No events sheet found.');

if (scSheetName) {
  const { rows, urls } = readSheet(wb.Sheets[scSheetName]);
  districts = parseSchoolDistricts(rows, urlMapFor(rows, urls));
  console.log(`\nSchool config sheet "${scSheetName}": ${districts.length} districts`);
} else console.warn('No school-district sheet found.');

if (DRY) { console.log('\n[--dry] parsed only, no writes.'); process.exit(0); }

const sb = createClient(URL, KEY, { auth: { persistSession: false } });
const nowIso = new Date().toISOString();

// org_events
if (events.length) {
  const rows = events.map(e => ({
    loc: String(e.loc), date_start: e.dateStart, date_end: e.dateEnd || e.dateStart, span: !!e.span,
    category: e.category ?? null, event_type: e.type ?? null, label: e.label,
    impact_magnitude: e.impact?.magnitude ?? null, impact_daypart: e.impact?.daypart ?? null,
    impact_gameday: !!e.impact?.gameDay, impact_raw: e.impactRaw ?? e.impact?.raw ?? null,
    expected_sales_delta: null, expected_gc_delta: null,
    url: e.url ?? null, verification: e.verification ?? null, note: null,
    entered_by: 'seed-org-events', entered_at: nowIso, method: 'bulk upload', updated_at: nowIso,
  }));
  let saved = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error, count } = await sb.from('org_events').upsert(chunk, { onConflict: 'loc,date_start,label', count: 'exact' });
    if (error) { console.error('org_events upsert error:', error.message); process.exit(1); }
    saved += count ?? chunk.length;
  }
  console.log(`\n✓ Upserted ${saved} org_events`);
}

// org_school_config
if (districts.length) {
  const rows = districts.map(c => ({
    loc: String(c.loc), city: c.city ?? null, state: c.state ?? null, district: c.district ?? null,
    first_day: c.firstDay ?? null, last_day: c.lastDay ?? null, start_time: c.startTime ?? null,
    stop_time: c.stopTime ?? null, verification: c.verification ?? null, url: c.url ?? null, updated_at: nowIso,
  }));
  const { error } = await sb.from('org_school_config').upsert(rows, { onConflict: 'loc' });
  if (error) { console.error('org_school_config upsert error:', error.message); process.exit(1); }
  console.log(`✓ Upserted ${rows.length} org_school_config`);
}

console.log('\nDone. Events hydrate into the calendar on next app load (non-destructive — hand-entered events are preserved).');
