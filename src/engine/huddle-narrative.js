// @ts-nocheck
// The Huddle -- Phase 1 (owner request 2026-11-08): one short AI-generated narrative line on
// Curated Home, reusing the already-deployed SAGE pipeline (callSageOnce, src/lib/sage-client.js)
// rather than any new infrastructure. Pure logic lives here -- scope keying, the facts fed to the
// model, the role-voice system prompt -- so it's testable without rendering; the component
// wrapper in curated-home.js just calls these and owns the click/cache/loading state.
//
// Deliberately click-to-generate, not auto-fired on every render: an AI call costs real money
// and there's no reason to spend one on a page view that's just checking a number. The result is
// cached per (scope, business day) in user_settings (no new DDL -- same table/pattern every other
// per-user cache in this file already uses), so one click a day is all it costs once someone's
// seen the note for today.
//
// Full design + the bigger "Huddle" vision this is Phase 1 of: memory/plan-huddle-narrative-
// 2026-11-08.md.

// A stable string identifying "whose narrative is this", for the cache key -- NOT the full
// user_settings key by itself (the caller appends the business day via huddleStorageKey).
export function huddleScopeKey(altitude, viewAsScope, operatorGroup) {
  if (operatorGroup) return 'operator:' + operatorGroup;
  if ((altitude === 'store' || altitude === 'patch') && viewAsScope) return altitude + ':' + viewAsScope;
  return altitude; // 'store' | 'patch' | 'district' for a real, non-simulated login
}

export function huddleStorageKey(scopeKey, dateKey) {
  return 'huddle_narrative_' + scopeKey + '_' + dateKey;
}

// Facts fed to the model -- built straight from the same per-store {loc,name,severity,flags}
// shape every Curated Home format already renders from (summarizeStores' own input), never a
// derived/aggregated "pattern item" that could claim something the raw stores don't actually
// support. Capped at the 3 most-severe flagged stores, 2 flags each, so the prompt stays small
// and the model can't ramble through a long list.
const SEV_RANK = { RED: 0, AMBER: 1, GREEN: 2, NODATA: 3 };
// Task #125/#128 (memory/plan-huddle-phase2-2026-11-08.md's "Memory"/"The Save") -- optional
// third argument, additive like task #126's own sessionQualities(extra) pattern: every existing
// caller that omits it keeps getting exactly the original 5-key object. `countCycleHighlights`
// is built by the CALLER (curated-home.js's HuddleNarrative) from count-cycle.js's
// classStreak/classSave over real session history -- this function only shapes and caps what
// reaches the prompt, same "ground truth in, ground truth out" rule flaggedStores already
// follows. Capped at 3, same as flaggedStores, so the prompt can't ramble through every store's
// every class.
export function buildHuddleFacts(stores, altitude, countCycleHighlights) {
  const list = stores || [];
  const red = list.filter(s => s.severity === 'RED').length;
  const amber = list.filter(s => s.severity === 'AMBER').length;
  const green = list.filter(s => s.severity === 'GREEN').length;
  const flaggedStores = list
    .filter(s => (s.flags || []).length > 0)
    .sort((a, b) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9))
    .slice(0, 3)
    .map(s => ({
      store: s.name, severity: s.severity,
      flags: (s.flags || []).slice(0, 2).map(f => ({ headline: f.headline, detail: f.detail, action: f.action })),
    }));
  const base = { altitude, storeCount: list.length, red, amber, green, flaggedStores };
  if (!countCycleHighlights || !countCycleHighlights.length) return base;
  return { ...base, countCycleHighlights: countCycleHighlights.slice(0, 3) };
}

// Role-voice system prompts (owner request 2026-11-08: "keeping things worded appropriately for
// each role"). Mirrors the three lenses from the Huddle concept pitch -- a GM/manager runs the
// shift, a supervisor coaches the coaches, a DO leads through supervisors rather than around them.
// Task #125/#128 -- shared line on how to use countCycleHighlights, appended to every voice
// below rather than duplicated three times: "Memory" (a real streak) reads as a pattern worth
// naming before it gets worse; "The Save" (a streak that just broke) reads as a genuine win,
// same standing as any other win in the facts -- not a bigger deal than it is, but never skipped
// either, since catching an improvement is exactly the point of logging it.
const COUNT_CYCLE_LINE = ' If a count-cycle pattern is in the facts (a streak of under-threshold '+
  'inventory counts, or one that just broke), treat a streak as a real pattern worth naming and a '+
  'break as a genuine, specific win -- never invented, never overstated.';
const ALTITUDE_VOICE = {
  store: 'You are a shift-lead coach writing for a single restaurant\'s GM or manager. Write ONE '+
    'or TWO short sentences, plain restaurant language, saying what to watch for and what to do '+
    'about it today -- a huddle note, not a report. Lead with the most urgent real issue if there '+
    'is one; otherwise say plainly that things are clean and name the one thing worth keeping an '+
    'eye on anyway. Never invent a number, a name, or a cause that wasn\'t given to you in the facts.'+
    COUNT_CYCLE_LINE,
  patch: 'You are writing for an Area Supervisor coaching the GMs in their patch. Write ONE or TWO '+
    'short sentences: which store or situation most deserves a direct conversation this week, and '+
    'lead with a win to recognize if one is in the facts -- a supervisor should always have '+
    'something specific to praise, not only a problem to fix. Never invent a number, a name, or a '+
    'cause that wasn\'t given to you in the facts.'+COUNT_CYCLE_LINE,
  district: 'You are writing for a District Ops lead. Write ONE or TWO short sentences framed '+
    'around leading THROUGH supervisors, not around individual stores -- name a pattern worth a '+
    'supervisor conversation, never a store-level fix list. Never invent a number, a name, or a '+
    'cause that wasn\'t given to you in the facts.'+COUNT_CYCLE_LINE,
};
export function huddleSystemPrompt(altitude) {
  return ALTITUDE_VOICE[altitude] || ALTITUDE_VOICE.store;
}

export function huddleUserMessage(facts) {
  return 'Today\'s facts: ' + JSON.stringify(facts) + '. Write the huddle note now.';
}
