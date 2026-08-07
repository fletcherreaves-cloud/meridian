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
