// @ts-nocheck
// ── Staffing-events workbook parser (Notes 46) ───────────────────────────────────────────────────
// Parse the "All Staffing Events" sheet (school calendars, HS/College football, festivals — 27 stores)
// into normalized org-calendar event records for the Supabase-backed calendar + forecast. Pure + tested.
//
// Sheet columns: Store# | City | State | Category | Event Name | Date(s) | Expected Impact | Verify URL.
// The confirmation flag lives in the DATE for school/sports ("2026-08-13 (Confirmed)") and in the NAME for
// festivals ("Carter County Free Fair (Confirmed)" / "A2A Marathon (Est)"). Only Confirmed events import.

// ── Impact taxonomy: the sheet's "Expected Impact" decomposes into magnitude × daypart, each with a
// conservative default forecast weight (owner-tunable; a manual expectedSalesDelta overrides it). ────
export const IMPACT_MAGNITUDES = ['High', 'Medium', 'Low'];
export const IMPACT_DAYPARTS = ['breakfast', 'afternoon', 'day', 'dinner', 'all', 'gameday'];
export const DAYPART_LABELS = {
  breakfast: 'Breakfast / Morning', afternoon: 'Afternoon', day: 'Day Shift',
  dinner: 'Dinner / Late Night', all: 'All Shifts', gameday: 'Game Day',
};
// Day-level sales multiplier defaults (starter values — clearly editable, never override a manual delta).
export const IMPACT_WEIGHTS = { High: 0.08, Medium: 0.03, Low: 0.0 };
export const GAMEDAY_WEIGHT = 0.10;

// "High - Morning / Breakfast", "High - Afternoon Rush", "High - Day Shift", "High - Dinner/Late Night",
// "High - All Shifts", "Game Day Traffic", "Medium", "Low" → { magnitude, daypart, gameDay, raw, parsed }.
export function parseImpact(text) {
  const s = String(text || '').trim();
  if (!s) return { magnitude: 'Medium', daypart: 'all', gameDay: false, raw: s, parsed: false };
  if (/game\s*day/i.test(s)) return { magnitude: 'High', daypart: 'gameday', gameDay: true, raw: s, parsed: true };
  const magnitude = /high/i.test(s) ? 'High' : /medium/i.test(s) ? 'Medium' : /low/i.test(s) ? 'Low' : null;
  const daypart = /breakfast|morning/i.test(s) ? 'breakfast'
    : /dinner|late\s*night/i.test(s) ? 'dinner'
    : /afternoon/i.test(s) ? 'afternoon'
    : /day\s*shift/i.test(s) ? 'day'
    : /all\s*shifts/i.test(s) ? 'all' : null;
  return { magnitude: magnitude || 'Medium', daypart: daypart || 'all', gameDay: false, raw: s, parsed: magnitude != null || daypart != null };
}

// Day-level forecast multiplier for an event's impact (before any manual override).
export function impactWeight(impact) {
  if (!impact) return 0;
  if (impact.gameDay) return GAMEDAY_WEIGHT;
  return IMPACT_WEIGHTS[impact.magnitude] ?? 0;
}

// "(Confirmed)" / "(Est…)" may be in the date OR the name.
export function parseConfirmation(dateStr, nameStr) {
  const both = `${dateStr || ''} ${nameStr || ''}`;
  if (/\(\s*confirmed\s*\)/i.test(both)) return 'Confirmed';
  if (/\(\s*est/i.test(both)) return 'Estimated';
  return 'Unknown';
}

const strip = s => String(s || '').replace(/\s*\((confirmed|est[^)]*)\)\s*$/i, '').trim();

// "2026-08-13" or "2026-08-06 to 2026-08-11" → { start, end, span }.
export function parseDates(dateStr) {
  const s = strip(dateStr);
  const found = [...s.matchAll(/(\d{4})-(\d{2})-(\d{2})/g)].map(m => m[0]);
  if (!found.length) return null;
  return { start: found[0], end: found[found.length - 1] || found[0], span: found.length > 1 || / to /.test(s) };
}

// Category (+ school event name) → an EVENT_TYPES key. Sports → 'sports' (new), festivals → 'event',
// school → the school_* subtype inferred from the event name.
export function eventTypeFor(category, name) {
  const c = String(category || '').toLowerCase();
  if (c.includes('sport')) return 'sports';
  if (c.includes('festival') || c.includes('fair')) return 'event';
  if (c.includes('school')) {
    const n = String(name || '').toLowerCase();
    if (/first day/.test(n)) return 'school_start';
    if (/last day/.test(n)) return 'school_end';
    if (/early (release|dismiss)/.test(n)) return 'school_early_release';
    if (/in-?service|professional|holiday|no school|closed|recess|vacation/.test(n)) return 'school_no_school';
    return 'school_break';
  }
  return 'event';
}

// Full parse. rows = array-of-arrays incl. header. urlByRowIndex = { dataRowIndex → real hyperlink URL }.
// Returns Confirmed events only (owner rule) + counts of what was skipped.
export function parseStaffingEvents(rows, urlByRowIndex = {}) {
  if (!rows || rows.length < 2) return { events: [], estimated: 0, skipped: 0 };
  // Optional richer columns (opponent / kickoff time) — read by header name if present so the owner
  // can enrich the Sports sheet without changing the fixed first 7 columns. Blank/absent → omitted.
  const header = (rows[0] || []).map(h => String(h == null ? '' : h).toLowerCase());
  const oppCol  = header.findIndex(h => /opponent|versus|\bvs\b/.test(h));
  const kickCol = header.findIndex(h => /kick\s*off|kickoff|\btime\b|game\s*time/.test(h));
  const urlCol  = header.findIndex(h => /url|verif|source|link/.test(h));
  const data = rows.slice(1).filter(r => r && r[0] !== '' && r[0] != null);
  const events = []; let estimated = 0, skipped = 0;
  data.forEach((r, i) => {
    const [store, city, state, category, name, dates, impactTxt] = r;
    const verification = parseConfirmation(dates, name);
    if (verification !== 'Confirmed') { if (verification === 'Estimated') estimated++; else skipped++; return; }
    const d = parseDates(dates);
    if (!d) { skipped++; return; }
    const impact = parseImpact(impactTxt);
    const clean = v => { const s = String(v == null ? '' : v).trim(); return s && s !== '**' ? s : null; };
    events.push({
      loc: String(store).replace(/\D/g, '') || String(store),
      city: city || null, state: state || null,
      category: category || null, type: eventTypeFor(category, name),
      label: strip(name), dateStart: d.start, dateEnd: d.end, span: d.span,
      impact, impactRaw: String(impactTxt || ''),
      opponent: oppCol >= 0 ? clean(r[oppCol]) : null,
      kickoff:  kickCol >= 0 ? clean(r[kickCol]) : null,
      expectedSalesDelta: null, expectedGcDelta: null,   // owner-tunable later
      // Prefer the real cell hyperlink; else accept the URL column's text value if it looks like a URL
      // (the original workbook stores "Verify Source" text + a hyperlink; a generated sheet may store the
      // bare URL as text). Never treat non-URL link text like "Verify Source" as the url.
      url: urlByRowIndex[i] || (urlCol >= 0 && /^https?:\/\//i.test(String(r[urlCol] || '').trim()) ? String(r[urlCol]).trim() : null),
      verification,
    });
  });
  return { events, estimated, skipped };
}

// Down-project cloud org_events (one row per event, spans as a range) into the calendar's per-day
// map shape `{ loc: { 'YYYY-MM-DD': entry } }` that every existing consumer (calendar/pipeline/
// forecast) already reads from localStorage `mf_events`. Spans expand to one entry per day sharing a
// rangeId (matching applyEventToStores). Org-sourced entries are tagged so hydration can refresh them
// from the cloud without clobbering hand-entered events. `iconFor(type)` supplies the display icon.
export function orgEventsToDayMap(events, iconFor = () => '📌') {
  const map = {};
  for (const e of (events || [])) {
    const loc = String(e.loc);
    const start = e.dateStart; const end = e.dateEnd || e.dateStart;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(start || ''))) continue;
    // enumerate ISO days start..end (noon anchor avoids DST/timezone slips)
    const days = [];
    let d = new Date(start + 'T12:00:00');
    const last = new Date(end + 'T12:00:00');
    for (let guard = 0; d <= last && guard < 400; guard++) {
      days.push(d.toISOString().slice(0, 10));
      d = new Date(d.getTime() + 86400000);
    }
    const multi = days.length > 1;
    const rangeId = multi ? `org_${e.id ?? e.label}_${start}_${end}` : null;
    days.forEach((dk, i) => {
      if (!map[loc]) map[loc] = {};
      map[loc][dk] = {
        type: e.type || 'event',
        label: multi ? `${e.label} (Day ${i + 1} of ${days.length})` : e.label,
        note: e.note || e.label,
        icon: iconFor(e.type || 'event'),
        source: e.method === 'bulk upload' ? 'Bulk Import' : (e.method || 'Bulk Import'),
        orgSourced: true, orgEventId: e.id ?? null,
        url: e.url || null,
        impact: e.impact || null,
        opponent: e.opponent ?? null,
        kickoff: e.kickoff ?? null,
        status: e.status ?? null,
        expectedSalesDelta: e.expectedSalesDelta ?? null,
        expectedGcDelta: e.expectedGcDelta ?? null,
        verification: e.verification || null,
        ...(multi ? { rangeId, rangeDayNum: i + 1, rangeTotalDays: days.length } : {}),
      };
    });
  }
  return map;
}

// School District Overview sheet → per-store config (term dates + bell times) for the daypart signal.
// Columns: Store# | City | State | District | First Day | Last Day | Start | Stop | Status | URL.
export function parseSchoolDistricts(rows, urlByRowIndex = {}) {
  if (!rows || rows.length < 2) return [];
  return rows.slice(1).filter(r => r && r[0] !== '' && r[0] != null).map((r, i) => ({
    loc: String(r[0]).replace(/\D/g, '') || String(r[0]),
    city: r[1] || null, state: r[2] || null, district: r[3] || null,
    firstDay: (String(r[4] || '').match(/\d{4}-\d{2}-\d{2}/) || [])[0] || null,
    lastDay: (String(r[5] || '').match(/\d{4}-\d{2}-\d{2}/) || [])[0] || null,
    startTime: r[6] || null, stopTime: r[7] || null,
    verification: /confirmed/i.test(String(r[8] || '')) ? 'Confirmed' : (r[8] || null),
    url: urlByRowIndex[i] || null,
  }));
}
