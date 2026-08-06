// @ts-nocheck
// ── Retail / shopping event calendar — "Event Lookup" v1 (Notes 56 #4) ───────────────────────────
// The well-defined, date-computable half of Event Lookup: statewide RETAIL/SHOPPING windows that
// plausibly move QSR traffic (tax-free weekends, the Thanksgiving shopping weekend). It produces the
// SAME event records `src/engine/events-import.js` produces, so everything downstream is unchanged:
//
//   expandRetailEvents() → saveOrgEvents() → Supabase `org_events`
//        → App.js hydrate → orgEventsToDayMap() → the per-day `mf_events` map
//        → forecastDay's `_evFactor` (Event Impact Registry → learned → stored expected impact)
//
// NOT in v1 (explicitly deferred per Notes 56 #4 status): per-store retail PROXIMITY (which stores are
// actually near a Walmart/Target/mall — a manual 27-store pass), and micro/pop-up events (not
// web-discoverable; needs a GM/DO quick-add UI).
//
// ── Standing rule: MEASURED lift beats ASSUMED lift ─────────────────────────────────────────────
// Every rule below ships with impact magnitude 'Low' → `impactWeight()` = 0 → these events move NO
// forecast until `event_impact` carries a measured per-store value for the type. That is deliberate:
// `memory/event-impact-registry.md` showed geography did NOT predict football lift, and there is no
// reason to assume a tax-free weekend does either. Grade them first (scripts/measure-retail-impact.mjs),
// then let the registry drive the forecast.
//
// ── Date provenance (every window is either RULE-DERIVED or HARD-DATED — never guessed) ─────────
// Each rule carries `derivation` + `source`; hard-dated windows carry their own per-year citation.
// Anything not verifiable to a primary source was OMITTED rather than invented (see OMITTED, below).

import { getNthDow } from '../utils/holidays.js';

// ── date helpers (local-noon anchored, matching the rest of the codebase) ───────────────────────
const isoOf   = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const fromIso = s => new Date(String(s).slice(0, 10) + 'T12:00:00');
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const dowOnOrAfter = (d, dow) => addDays(d, (dow - d.getDay() + 7) % 7);
const daysBetween  = (a, b) => Math.round((b - a) / 86400000) + 1;

// US Thanksgiving = 4th Thursday of November (federal, fixed formula). Reuses the same helper the
// holiday table uses so Black Friday can never drift apart from `HOLIDAY_MAP`.
export const thanksgiving = year => getNthDow(year, 10, 4, 4);

// ── Long-window anchoring ───────────────────────────────────────────────────────────────────────
// Florida's back-to-school holiday is now a MONTH long. Tagging 31 consecutive days would (a) be bad
// modelling — the whole point of a month-long window is to DE-concentrate the surge — and (b) be
// destructive: `mf_events` holds exactly one event per (loc, day), so a month-long tag would displace
// the football/promo/festival events already imported for those days. So a window longer than
// ANCHOR_MAX_DAYS collapses to its opening Fri–Sun, which is where the retail surge actually lands.
// The full statutory window is preserved verbatim in the event's `note` — nothing is hidden.
export const ANCHOR_MAX_DAYS = 4;
export function shoppingAnchor(startIso, endIso) {
  const s = fromIso(startIso), e = fromIso(endIso);
  if (daysBetween(s, e) <= ANCHOR_MAX_DAYS) return { start: startIso, end: endIso, anchored: false };
  const fri = dowOnOrAfter(s, 5);                       // first Friday on/after the window opens
  if (fri > e) return { start: startIso, end: isoOf(addDays(s, ANCHOR_MAX_DAYS - 1)), anchored: true };
  const end = addDays(fri, 2) > e ? e : addDays(fri, 2); // Fri–Sun, clamped to the window
  return { start: isoOf(fri), end: isoOf(end), anchored: true };
}

// ── Florida back-to-school: HARD-DATED per year ─────────────────────────────────────────────────
// Florida legislates its sales tax holidays year by year and has changed them in every recent year,
// so these are explicit dated entries from the Florida Dept. of Revenue / the enacting bill — NOT a
// recurrence rule. Years we could not verify to a primary source are absent (see OMITTED).
//   [startIso, endIso, verification, citation]
const FL_BTS_WINDOWS = {
  2023: [['2023-07-24', '2023-08-06', 'Confirmed', 'FL DOR 2023-24 Back-to-School Sales Tax Holidays FAQ']],
  2024: [
    ['2024-01-01', '2024-01-14', 'Confirmed', 'FL DOR — 2nd back-to-school holiday for the 2023-24 school year'],
    ['2024-07-29', '2024-08-11', 'Confirmed', 'FL DOR TIP 24A01-03'],
  ],
  2025: [['2025-08-01', '2025-08-31', 'Confirmed', 'FL DOR TIP 25A01-08 — HB 7031 (2025) made it an annual month-long August holiday']],
  2026: [['2026-07-20', '2026-08-20', 'Confirmed', 'FL DOR TIP 26A01-11 — HB 7031E, signed 2026-06-29, moved the annual window to Jul 20–Aug 20']],
};
// 2027+ : HB 7031E writes "July 20 through August 20 each year" into statute, but Florida has revised
// these dates in each of the last four sessions — so forward years are emitted as ESTIMATED, flagged
// in the calendar, and must be re-verified against floridarevenue.com annually.
const FL_BTS_FORWARD_FROM = 2027;

// ── The rule set ────────────────────────────────────────────────────────────────────────────────
// `instances(year)` → [{ start, end, verification, note }] in the event's TRUE window; anchoring to a
// shopping weekend happens in expandRetailEvents so `note` can always cite the full window.
export const RETAIL_EVENT_RULES = [
  {
    key: 'ok_tax_free',
    type: 'tax_free',
    label: 'Oklahoma Tax-Free Weekend',
    states: ['OK'],
    derivation: 'rule',
    ruleText: 'Begins 12:01 a.m. on the FIRST FRIDAY in August and ends at midnight the following Sunday (statutory, unchanged since 2007).',
    source: 'Okla. Stat. tit. 68, § 1357.10 / Oklahoma Tax Commission "Sales Tax Holiday"',
    instances(year) {
      const fri = getNthDow(year, 7, 1, 5);            // 1st Friday of August (month is 0-indexed)
      return [{ start: isoOf(fri), end: isoOf(addDays(fri, 2)), verification: 'Confirmed', note: this.ruleText }];
    },
  },
  {
    key: 'fl_back_to_school',
    type: 'tax_free',
    label: 'Florida Back-to-School Tax Holiday',
    states: ['FL'],
    derivation: 'hard-dated',
    ruleText: 'Legislated year by year — dates below are explicit per-year entries from the Florida Dept. of Revenue, not a recurrence rule.',
    source: 'floridarevenue.com Tax Information Publications',
    instances(year) {
      const rows = FL_BTS_WINDOWS[year];
      if (rows) return rows.map(([start, end, verification, cite]) => ({ start, end, verification, note: 'Source: ' + cite + '.' }));
      if (year >= FL_BTS_FORWARD_FROM) return [{
        start: year + '-07-20', end: year + '-08-20', verification: 'Estimated',
        note: 'PROJECTED from the statutory "July 20 – August 20 each year" window set by HB 7031E (2026). Florida has revised these dates in each of the last four sessions — re-verify at floridarevenue.com before trusting this year.',
      }];
      return [];                                        // pre-2023: not verified → omitted, never guessed
    },
  },
  {
    key: 'black_friday',
    type: 'black_friday',
    label: 'Black Friday',
    states: ['OK', 'FL'],
    derivation: 'rule',
    ruleText: 'The day after US Thanksgiving (Thanksgiving = 4th Thursday of November).',
    source: 'US federal holiday calendar',
    instances(year) {
      const d = addDays(thanksgiving(year), 1);
      return [{ start: isoOf(d), end: isoOf(d), verification: 'Confirmed', note: this.ruleText }];
    },
  },
  {
    key: 'small_biz_sat',
    type: 'small_biz_sat',
    label: 'Small Business Saturday',
    states: ['OK', 'FL'],
    derivation: 'rule',
    ruleText: 'The Saturday after US Thanksgiving. Held annually since 2010.',
    source: 'American Express / US SBA',
    instances(year) {
      if (year < 2010) return [];
      const d = addDays(thanksgiving(year), 2);
      return [{ start: isoOf(d), end: isoOf(d), verification: 'Confirmed', note: this.ruleText }];
    },
  },
  {
    key: 'cyber_monday',
    type: 'cyber_monday',
    label: 'Cyber Monday',
    states: ['OK', 'FL'],
    derivation: 'rule',
    ruleText: 'The Monday after US Thanksgiving. Held annually since 2005.',
    source: 'National Retail Federation / Shop.org',
    instances(year) {
      if (year < 2005) return [];
      const d = addDays(thanksgiving(year), 4);
      return [{ start: isoOf(d), end: isoOf(d), verification: 'Confirmed', note: this.ruleText }];
    },
  },
];

// EVENT_TYPES keys this module can emit — the Event Impact Registry keys on (loc, event_type), so a
// separate type per event is what lets each one carry its OWN measured per-store lift.
export const RETAIL_EVENT_TYPES = ['tax_free', 'black_friday', 'small_biz_sat', 'cyber_monday'];

// ── OMITTED ON PURPOSE (a wrong date is worse than a missing event) ─────────────────────────────
// · Florida disaster-preparedness holiday — the 2024 pair (Jun 1–14 / Aug 24–Sep 6) is the only
//   window we could verify; 2025 replaced it with a PERMANENT year-round exemption, so there is no
//   recurring window to forecast, and the one remaining 2024 anchor weekend collides with Labor Day.
// · Florida "Tool Time" / Freedom Month — eliminated in the 2026 HB 7031E restructuring and the
//   historical windows could not be pinned to a primary source.
// · Florida hunting/fishing/camping (Sep 1 – Dec 31, 2026) — a one-off four-month window, not a
//   shopping day; meaningless as a dated traffic event.
// · Back-to-school WINDOW (first day of school) — deliberately skipped: it is already in Meridian as
//   real per-district data (`org_school_config.first_day` + the `school_start` events imported in
//   Notes 46). Re-deriving it from a guessed statewide rule would be strictly worse.

// ── Expansion ───────────────────────────────────────────────────────────────────────────────────
// `stores` = [{ loc, state, city? }] (build from INV_ORG_COORDS at the call site — this module stays
// pure/registry-free so scripts and tests can drive it). Returns records in the exact shape
// `parseStaffingEvents()` returns, which is what saveOrgEvents()/orgEventsToDayMap() consume.
export function expandRetailEvents(stores, opts = {}) {
  const years = opts.years && opts.years.length ? opts.years : defaultRetailYears();
  const includeEstimated = opts.includeEstimated !== false;
  const out = [];
  for (const rule of RETAIL_EVENT_RULES) {
    for (const year of years) {
      for (const inst of rule.instances(year)) {
        if (!includeEstimated && inst.verification !== 'Confirmed') continue;
        const anchor = shoppingAnchor(inst.start, inst.end);
        const label = rule.label + (anchor.anchored ? ' — Opening Weekend' : '');
        const note = (anchor.anchored
          ? 'Opening shopping weekend of the ' + inst.start + ' → ' + inst.end + ' window. '
          : '') + inst.note;
        for (const st of stores || []) {
          if (!st || !st.loc) continue;
          if (!rule.states.includes(String(st.state || '').toUpperCase())) continue;
          out.push({
            loc: String(st.loc), city: st.city || null, state: String(st.state).toUpperCase(),
            category: 'Retail / Shopping',
            type: rule.type,
            label,
            dateStart: anchor.start, dateEnd: anchor.end, span: anchor.start !== anchor.end,
            // Low ⇒ impactWeight()=0 ⇒ zero forecast movement until the registry has a MEASURED value.
            impact: { magnitude: 'Low', daypart: 'day', gameDay: false, raw: 'Low — observational until measured', parsed: true },
            impactRaw: 'Low — observational until measured',
            expectedSalesDelta: null, expectedGcDelta: null,
            url: null,
            verification: inst.verification,
            note: note + ' [' + rule.derivation + '; ' + rule.source + ']',
            ruleKey: rule.key, derivation: rule.derivation, fullWindow: { start: inst.start, end: inst.end },
          });
        }
      }
    }
  }
  return out.sort((a, b) => a.dateStart.localeCompare(b.dateStart) || String(a.loc).localeCompare(String(b.loc)));
}

// History deep enough to MEASURE against (labor_rows is backfilled to 2022) plus next year to forecast.
export function defaultRetailYears(now = new Date()) {
  const y = now.getFullYear();
  const out = [];
  for (let i = y - 4; i <= y + 1; i++) out.push(i);
  return out;
}

// ── Measurement — the point of the whole exercise ───────────────────────────────────────────────
// Same method the football seed used (memory/event-impact-registry.md): per event day, compare the
// store's actual sales to the MEDIAN of its own same-day-of-week sales within ±28 days, excluding
// other days of the same event and any holiday closure. Median baseline + same-DOW is what keeps a
// single closed Christmas or an adjacent promo from masquerading as a shopping lift.
//   salesRows       : [{ loc, date:'YYYY-MM-DD', sales }]
//   eventDatesByLoc : { loc: ['YYYY-MM-DD', …] }  — ONE event type at a time
// → { loc: { measured, n, lifts:[…] } }
const _median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export function measureEventLift(salesRows, eventDatesByLoc, opts = {}) {
  const windowDays  = opts.windowDays ?? 28;
  const minBaseline = opts.minBaseline ?? 3;
  const excludeDates = opts.excludeDates instanceof Set ? opts.excludeDates : new Set(opts.excludeDates || []);
  const byLoc = {};
  for (const r of salesRows || []) {
    if (!r || !r.loc || !r.date || !(r.sales > 0)) continue;
    const loc = String(r.loc).replace(/^0+/, '');
    (byLoc[loc] = byLoc[loc] || []).push({ t: fromIso(r.date).getTime(), dow: fromIso(r.date).getDay(), d: String(r.date).slice(0, 10), sales: +r.sales });
  }
  const out = {};
  for (const [rawLoc, dates] of Object.entries(eventDatesByLoc || {})) {
    const loc = String(rawLoc).replace(/^0+/, '');
    const rows = byLoc[loc]; if (!rows || !rows.length) continue;
    const evSet = new Set(dates);
    const lifts = [];
    for (const d of dates) {
      const hit = rows.find(r => r.d === d); if (!hit) continue;         // no sales that day → skip
      const lo = hit.t - windowDays * 86400000, hi = hit.t + windowDays * 86400000;
      const base = rows.filter(r => r.dow === hit.dow && r.t >= lo && r.t <= hi && r.d !== d
        && !evSet.has(r.d) && !excludeDates.has(r.d)).map(r => r.sales);
      if (base.length < minBaseline) continue;                           // too thin to grade honestly
      const med = _median(base);
      if (!(med > 0)) continue;
      lifts.push(hit.sales / med - 1);
    }
    if (lifts.length) out[loc] = { measured: lifts.reduce((a, b) => a + b, 0) / lifts.length, n: lifts.length, lifts };
  }
  return out;
}

// n-shrinkage toward the district mean, identical to the football seed (K=10): a store with 2
// observations should not swing its own forecast on noise. shrunk = D + (measured − D)·n/(n+K).
export function shrinkLifts(perLoc, K = 10) {
  const entries = Object.entries(perLoc || {});
  if (!entries.length) return { district: null, byLoc: {} };
  const totN = entries.reduce((a, [, v]) => a + v.n, 0);
  const district = totN ? entries.reduce((a, [, v]) => a + v.measured * v.n, 0) / totN : 0;
  const byLoc = {};
  for (const [loc, v] of entries) byLoc[loc] = { ...v, shrunk: district + (v.measured - district) * (v.n / (v.n + K)) };
  return { district, byLoc };
}
