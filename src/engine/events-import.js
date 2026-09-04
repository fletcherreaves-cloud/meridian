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

// Combine two org-sourced day-map entries that landed on the same (loc, dk) — org_events legitimately
// allows multiple rows per (loc, date_start) with different labels (a school closure AND a sports game
// on the same day is real, common data: measured 261 such same-day pairs across all 27 stores on
// 2026-08-10, issue #142). A bare `map[loc][dk] = entry` overwrite here silently dropped whichever
// event lost the race — real data loss, not a cosmetic duplicate. Keep BOTH: join the display fields so
// nothing vanishes from what the owner sees, and carry a `tags` array (the same shape calendar.js's own
// multi-type hand-tag already writes) so forecast.js's event-impact factor (`_evTag.tags.map(t=>t.type)`)
// averages both types' registry impact instead of only ever seeing one. `orgEventId`/edit-relevant fields
// stay pointed at the FIRST event so the existing single-event edit/delete UI (calendar.js, keyed off
// orgEventId) keeps working unchanged; `combinedEvents` carries each full original event so nothing is
// lost even for the fields the top-level entry doesn't have room to represent.
function combineOrgEntries(a, b) {
  const evs = [...(a.combinedEvents || [a]), b];
  return {
    ...a,
    label: [a.label, b.label].filter(Boolean).join(' + '),
    note: [a.note, b.note].filter(Boolean).join(' · '),
    icon: [...new Set([a.icon, b.icon].filter(Boolean))].join(' '),
    tags: evs.map(e => ({ type: e.type || 'other' })),
    combinedEvents: evs,
  };
}

// Down-project cloud org_events (one row per event, spans as a range, and — Dispatch24 Workstream
// B (#388) — scope as a store LIST, not a store) into the calendar's per-day map shape
// `{ loc: { 'YYYY-MM-DD': entry } }` that every existing consumer (calendar/pipeline/forecast)
// already reads from localStorage `mf_events`. Spans expand to one entry per day sharing a rangeId
// (matching applyEventToStores). Org-sourced entries are tagged so hydration can refresh them from
// the cloud without clobbering hand-entered events. `iconFor(type)` supplies the display icon.
//
// Scope expansion (the ONE piece Workstream B adds — forecastDay/computeEventFactors are
// unchanged, they only ever read this function's output, same shape as before): a row with
// `scope !== 'store'` carries the real store list in `scope_locs` (collapseScopedEvents below is
// the write-side counterpart that produces it) instead of a single `loc`. Every matching store
// gets its own day-map entry, same as if N per-store rows had been materialized — except there's
// only ever one row backing all of them. A `scope==='store'` row (the default, and every row that
// predates this migration) is unaffected: expands to exactly `[e.loc]`, byte-identical to the old
// behavior.
//
// `exceptions` (optional, from org_event_exceptions — open design question #1's per-store
// override mechanism) is a `{ [eventId]: { [loc]: {status, overrides} } }` map. A 'canceled'
// exception drops that one store's entry entirely (the other stores in the same scoped event are
// untouched); a 'modified' exception merges `overrides` onto that store's entry only. Omitting
// `exceptions` (every pre-existing call site) is a no-op — full expansion, no skips — so this is
// purely additive.
export function orgEventsToDayMap(events, iconFor = () => '📌', exceptions = null) {
  const map = {};
  for (const e of (events || [])) {
    const targetLocs = (e.scope && e.scope !== 'store' && Array.isArray(e.scopeLocs) && e.scopeLocs.length)
      ? e.scopeLocs.map(String)
      : [String(e.loc)];
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
    for (const loc of targetLocs) {
      const exc = exceptions && e.id != null ? (exceptions[e.id] || {})[loc] : null;
      if (exc && exc.status === 'canceled') continue;
      days.forEach((dk, i) => {
        if (!map[loc]) map[loc] = {};
        const entry = {
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
          // Phase 2 of memory/project-events-calendar-redesign-2026-09-04.md. Raw pass-through,
          // same as status/opponent/kickoff above -- `visibility` here is null unless the row
          // explicitly set one; resolving the effective value (falling back to the type's
          // default) is the consumer's job via defaultVisibilityFor(entry.type)
          // (src/constants.js), kept out of this file deliberately dependency-free.
          visibility: e.visibility ?? null, relevance: e.relevance ?? null,
          expectedImpact: e.expectedImpact ?? null, impactConfidence: e.impactConfidence ?? null,
          impactN: e.impactN ?? null, leadDays: e.leadDays ?? 0, lagDays: e.lagDays ?? 0,
          rrule: e.rrule ?? null,
          ...(e.scope && e.scope !== 'store' ? { scope: e.scope, scopeState: e.scopeState ?? null } : {}),
          ...(multi ? { rangeId, rangeDayNum: i + 1, rangeTotalDays: days.length } : {}),
          ...(exc && exc.status === 'modified' && exc.overrides ? exc.overrides : {}),
        };
        map[loc][dk] = map[loc][dk] ? combineOrgEntries(map[loc][dk], entry) : entry;
      });
    }
  }
  return map;
}

// Write-side counterpart to the scope expansion above — groups a FLAT per-store event array (the
// shape expandRetailEvents() and applyEventToStores' cloud-sync diff already produce; deliberately
// NOT rebuilt, per the dispatch's explicit constraint) into one row per (dateStart, dateEnd, label,
// type, category) key, computing the scope that row should carry. A single-store group is left
// completely alone (scope:'store', unchanged shape) — only a group spanning 2+ stores collapses.
//
// `allLocs` is the full store roster; `stateOfLoc(loc)` resolves a loc to its state ('OK'/'FL').
// Both are passed in (not imported from constants.js) so this stays pure/dependency-free and
// testable, matching diffUserEventsForCloudSync's own pattern in this file.
//
// scope is 'all' when the group's loc set is exactly every store in allLocs; 'state' when it's
// exactly every store of one state (scope_state records which); otherwise 'list' — an explicit,
// possibly-partial store set (e.g. a manual multi-select tag that isn't a clean state/district
// split). All three carry the resolved list in `scopeLocs`, so orgEventsToDayMap's expansion above
// doesn't need to special-case which of the three it is.
export function collapseScopedEvents(events, { allLocs, stateOfLoc } = {}) {
  const groups = new Map();
  for (const e of (events || [])) {
    const key = [e.dateStart, e.dateEnd || e.dateStart, e.label, e.type || '', e.category || ''].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  const out = [];
  for (const group of groups.values()) {
    if (group.length === 1) { out.push({ ...group[0], scope: 'store', scopeState: null, scopeLocs: null }); continue; }
    const locs = [...new Set(group.map(g => String(g.loc)))].sort();
    const base = group[0];
    let scope = 'list', scopeState = null;
    if (allLocs && locs.length === allLocs.length && locs.every(l => allLocs.includes(l))) {
      scope = 'all';
    } else if (stateOfLoc) {
      const states = new Set(locs.map(stateOfLoc));
      if (states.size === 1 && allLocs) {
        const [st] = states;
        const fullState = allLocs.filter(l => stateOfLoc(l) === st).sort();
        if (fullState.length === locs.length && fullState.every((l, i) => l === locs[i])) { scope = 'state'; scopeState = st; }
      }
    }
    const sentinelLoc = scope === 'all' ? '*ALL*' : scope === 'state' ? `*STATE:${scopeState}*` : `*LIST:${locs.join(',')}*`;
    out.push({ ...base, loc: sentinelLoc, scope, scopeState, scopeLocs: locs });
  }
  return out;
}

// Diff two `mf_events` day-maps (prev → next) into the org_events cloud writes needed to upload
// the delta — the write half of the org_events round-trip (orgEventsToDayMap above is the read
// half). Pure: takes a `typeLabelFor(type)` resolver instead of importing EVENT_TYPES, so this
// stays dependency-free and testable like the rest of this file. Entries already `orgSourced`
// are skipped as an upsert source — they came FROM org_events, re-uploading them is a no-op.
// Every delete is scoped to the OLD entry's own label, not just (loc, date) — org_events allows
// multiple rows per day (a sports game AND a school closure on the same date), so a bare
// date-only delete would also destroy an unrelated same-day event still on the cloud (v4.927 —
// found live: editing or deleting one event on a multi-event day could silently wipe a sibling).
//
// KNOWN GAP (PR #101 review, lower severity — inert, not destructive): orgEventsToDayMap suffixes
// each day of a multi-day org-sourced span with " (Day N of M)", a label the underlying org_events
// row never carries (nor does that row's date_start match any day but the first of the span). So a
// delete/stale-cleanup derived from a multi-day org-sourced entry's local (label, dk) here matches
// zero cloud rows — silently does nothing, rather than the wrong thing. Not a live risk in practice:
// calendar.js's dedicated edit/delete UI for org-sourced events (saveEdit/deleteEvt/quickStatus)
// already writes/deletes those rows correctly by orgEventId BEFORE this diff ever runs, so this path
// is only reachable for a hand-tag override of one day of a multi-day span (rare), where the effect
// is an orphaned-but-harmless cloud row, not data loss. Deferred rather than fixed here — fixing it
// needs the range's true (date_start, date_end) threaded through per-day entries, which is a real
// design change to orgEventsToDayMap's shape, not a one-line guard.
export function diffUserEventsForCloudSync(prev, next, typeLabelFor = () => null) {
  const upserts = []; const deleteKeys = []; const staleKeys = [];
  const locs = new Set([...Object.keys(prev || {}), ...Object.keys(next || {})]);
  for (const loc of locs) {
    const p = (prev && prev[loc]) || {}; const n = (next && next[loc]) || {};
    const dks = new Set([...Object.keys(p), ...Object.keys(n)]);
    for (const dk of dks) {
      const pe = p[dk], ne = n[dk];
      if (pe && !ne) { deleteKeys.push({ loc, dk, label: pe.label }); continue; }
      if (ne && !ne.orgSourced && JSON.stringify(ne) !== JSON.stringify(pe)) {
        upserts.push({ loc, dateStart: dk, dateEnd: dk, span: false,
          type: ne.type || 'other', label: ne.label || typeLabelFor(ne.type) || 'Event',
          note: ne.note || null,
          method: ne.autoTagged ? 'holiday-auto-tag' : (ne.source === 'ai_search' ? 'ai search' : 'manual') });
        // Only a genuine EDIT (a prior local entry already existed here) risks leaving a
        // stale duplicate under the old label — org_events allows >1 event/day, this
        // registry allows exactly 1. A brand-new day has nothing to clear, so Auto-Tag
        // Holidays (hundreds of new entries, zero prior local entries) skips this entirely
        // instead of paying a serial delete round-trip per row before the bulk upsert.
        if (pe) staleKeys.push({ loc, dk, label: pe.label });
      }
    }
  }
  return { upserts, deleteKeys, staleKeys };
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
