// @ts-nocheck
// ── Local context for a swing (Notes 58 #4 × Notes 59) ──────────────────────
// When a store's sales collapse, the operational metrics say WHAT happened but never
// WHY. A highway closed beside a restaurant is invisible to sales-per-hour until the
// sales are already gone. This pairs a swing with the local news around it.
//
// ── THE LOOKBACK MUST START BEFORE THE SWING, and that is the whole trick ────
// A cause precedes its effect. Store 10422's swing window is 2026-07-30 → 2026-08-06,
// but the candidate explanation sits WEEKS earlier:
//     2026-06-23  Heavy rain brings flooding to parts of Texoma
//     2026-06-24  Work begins to restore storm-damaged roads in Atoka County
//     2026-06-27  Atoka County tallies storm damage repair costs
// Searching only inside the swing window would find none of that. So the window is
// extended backwards by LEAD_DAYS, and items BEFORE the decline began are ranked
// HIGHER, not lower — they are the ones that could actually explain it.
//
// ⚠️ THIS RANKS CANDIDATES. IT DOES NOT ESTABLISH CAUSE. Roadworks and a sales drop in
// the same month is a coincidence until someone checks. Everything here is framed as
// "worth looking at", and the UI must not phrase it as an explanation.

import { metricAvg, METRIC_SOURCES } from './metric-source.js';
import { STORE_NAMES, getStoreOrg } from '../constants.js';
import { callSageOnce } from '../lib/sage-client.js';

export const LEAD_DAYS = 45;

// Signals that can plausibly move restaurant traffic, weighted by how directly.
// Community events and business news are included but rank low — a school fundraiser
// is context, not a cause.
export const SIGNAL_WEIGHT = {
  roads: 10,      // closures, construction, crashes — the most direct traffic lever
  weather: 7,     // storms, flooding, power outages
  crime: 5,       // a robbery or shooting near a store changes footfall
  business: 4,    // a competitor opening, an employer closing
  health: 4,      // health-department stories
  community: 1,
};

const dk = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d || '').slice(0, 10));
const addDays = (iso, n) => {
  const t = new Date(iso + 'T00:00:00');
  t.setDate(t.getDate() + n);
  return t.toISOString().slice(0, 10);
};

/**
 * News worth looking at for one swing.
 * `rows`   — loadNewsMentions() output
 * `swing`  — { from, to } as YYYY-MM-DD (swingItem's swing object)
 * Returns items ranked by plausibility, each with `whenRelative` and `preceding`.
 */
export function newsContextFor(rows = [], { loc, from, to, leadDays = LEAD_DAYS, max = 6 } = {}) {
  if (!loc || !from) return [];
  const start = addDays(dk(from), -leadDays);
  const end = dk(to || from);

  const hits = [];
  for (const r of (rows || [])) {
    if (!r || !r.published) continue;
    const inScope = r.loc === loc || (r.locs || []).includes(loc);
    if (!inScope) continue;
    const d = dk(r.published);
    if (d < start || d > end) continue;

    const signalScore = (r.signals || []).reduce((a, s) => a + (SIGNAL_WEIGHT[s] || 0), 0);
    if (!signalScore) continue;                       // no traffic-relevant signal — skip

    // Items BEFORE the decline started rank higher: a cause precedes its effect.
    const preceding = d < dk(from);
    hits.push({
      ...r,
      preceding,
      score: signalScore + (preceding ? 6 : 0),
      whenRelative: preceding
        ? `${_daysBetween(d, dk(from))} days before the decline`
        : 'during the decline',
    });
  }
  return hits.sort((a, b) => (b.score - a.score) ||
                             ((b.published?.getTime() || 0) - (a.published?.getTime() || 0)))
             .slice(0, max);
}

function _daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5);
}

/** A one-line summary for the alarm, or null when there is genuinely nothing. */
export function contextSummary(items = []) {
  if (!items.length) return null;
  const kinds = [...new Set(items.flatMap(i => i.signals || []))]
    .filter(s => SIGNAL_WEIGHT[s] >= 5)
    .map(s => s === 'roads' ? 'road' : s);
  if (!kinds.length) return `${items.length} local ${items.length === 1 ? 'story' : 'stories'} in this window`;
  return `${kinds.join(' and ')} activity reported locally around this window`;
}

// ── Cross-metric context (Notes 33 #9, "Operator→DO pulse" survey follow-on, 2026-09-22) ──
// News context (above) explains the outside world; this looks at the STORE'S OWN other
// operational metrics during the swing window, since a sales/guest swing can just as easily
// be operational (a labor cut that also slowed service, a staffing surge, a DT slowdown) as
// external. Auto-sourced via metric-source.js's metricAvg (the SAME freshest-wins resolution
// every other panel uses) — never a bespoke read of a raw stream. Same "worth checking"
// framing as newsContextFor: a metric moving alongside the swing is a candidate to look at,
// not proof of a mechanism, and callers must not phrase it as an explanation.
//
// Deliberately small: the two operational metrics a DO already watches elsewhere in the app
// (labor % and OEPE/DT speed), both well-established in metric-source.js with a real
// numerator/denominator and an explicit `direction`. Wiring an AI-driven cause search (the
// other half of the original ask) is a separate, more judgment-laden piece, not done here.
export const METRIC_CONTEXT_KEYS = [
  // laborPct is a FRACTION (0-1) per metric-source.js's own unit-convention comment — every
  // render site multiplies by 100, so this one does too.
  { key: 'laborPct', label: 'Labor %', fmt: (v) => `${(v * 100).toFixed(1)}%` },
  { key: 'oepe', label: 'OEPE (DT speed)', fmt: (v) => `${Math.round(v)}s` },
];

/**
 * The store's own other operational metrics during a swing window, each compared to the
 * equal-length window immediately before it (apples-to-apples span, not a fixed lookback).
 * `ds` — the app's live data store (same shape metric-source.js's other callers pass).
 * `{ loc, from, to }` — the swing window (swingItem's swing object).
 * Returns only metrics with both a during- and before-window reading; skips anything with no
 * data on either side rather than showing a misleading blank comparison.
 */
export function metricContextFor(ds, { loc, from, to } = {}) {
  if (!ds || !loc || !from) return [];
  const end = to || from;
  const spanDays = _daysBetween(from, end) + 1;      // inclusive of both endpoints
  const beforeTo = addDays(from, -1);
  const beforeFrom = addDays(beforeTo, -(spanDays - 1));

  const out = [];
  for (const { key, label, fmt } of METRIC_CONTEXT_KEYS) {
    // metric-source.js's range shape is { s, e } (start/end), NOT { from, to }.
    const during = metricAvg(ds, loc, { s: from, e: end }, key);
    const before = metricAvg(ds, loc, { s: beforeFrom, e: beforeTo }, key);
    if (during == null || before == null) continue;
    const direction = METRIC_SOURCES[key]?.direction || 'higher';
    const delta = during - before;
    // "worse" per the metric's own direction: a 'lower' metric (labor%, OEPE) worsens when it
    // rises; a 'higher' metric would worsen when it falls. Purely descriptive (drives a color),
    // never a claim that the movement caused or was caused by the sales swing.
    const worse = direction === 'lower' ? delta > 0 : delta < 0;
    out.push({ key, label, during, before, delta, worse, duringFmt: fmt(during), beforeFmt: fmt(before) });
  }
  return out;
}

// ── AI scour (Notes 58 #4, the 4th and last requirement) ─────────────────────
// Requirements 1-3 (detect, click-ack, local-metric/news context above) all shipped.
// This is the one explicitly deferred by this file's own 2026-09-22 comment: "Wiring an
// AI-driven cause search... is a separate, more judgment-laden piece, not done here."
// On demand (a button, not auto-fired on every swing — this costs a real API call), it
// routes through the same sage-chat web-search pattern `lookupMissEvent` (engine/why.js)
// already proved out for forecast-miss lookups: hand Claude what's already been found
// (news + the store's own metric context) and ask it to use web search for whatever
// those two mechanical scans couldn't catch — a closed road with no news coverage, a
// competitor promo, a local event calendar entry. Same standing rule as the rest of this
// file: candidates only, never a claimed cause.
export async function aiScourForSwing(item, { context = [], metricContext = [] } = {}, setResult) {
  const s = item?.swing || {};
  const loc = item?.loc;
  const storeName = STORE_NAMES[loc] || loc || 'this store';
  const region = getStoreOrg(loc) === 'emerald' ? 'Florida Panhandle' : 'south-central Oklahoma';
  const dirWord = s.direction === 'down' ? 'decline' : 'swing';

  const newsLines = context.length
    ? context.slice(0, 5).map(n => `- ${n.title} (${n.whenRelative})`).join('\n')
    : '(none found by the local-news scan)';
  const metricLines = metricContext.length
    ? metricContext.map(m => `- ${m.label}: ${m.beforeFmt} -> ${m.duringFmt}${m.worse ? ' (worse)' : ''}`).join('\n')
    : '(no other operational metric moved alongside it)';

  const prompt = `${storeName} (McDonald's, ${region}) had a sustained sales ${dirWord}: `
    + `${(s.pct || 0).toFixed(1)}% vs LY${s.guestPct != null ? `, ${(s.guestPct).toFixed(1)}% guest count` : ''}, `
    + `over ${s.run || '?'} consecutive weeks (${s.from} -> ${s.to}).\n\n`
    + `Already checked, for reference — don't just repeat these:\n`
    + `Local news/road/weather scan found:\n${newsLines}\n\n`
    + `This store's own other operational metrics during the window:\n${metricLines}\n\n`
    + `Use web search to look for anything those two checks could have missed — road closures, `
    + `construction, weather, a nearby competitor opening or running a promotion, a local event, `
    + `a school calendar change, a plant/employer layoff or closure — near ${storeName} around `
    + `and shortly before ${s.from}. List 2-4 candidates ranked by plausibility, each framed as `
    + `"worth checking", never as a confirmed cause. If nothing turns up beyond what's already `
    + `listed above, say so plainly rather than padding the answer.`;

  try {
    setResult({ loading: true, text: '', error: null });
    const text = await callSageOnce(
      [{ role: 'user', content: prompt }],
      'You are a McDonald\'s district analytics assistant. Use web search to find out what happened. Report candidates, never claim certainty.',
    );
    setResult({ loading: false, text: text || 'No analysis generated.', error: null });
  } catch (e) {
    setResult({ loading: false, text: '', error: 'AI scour failed: ' + e.message });
  }
}
