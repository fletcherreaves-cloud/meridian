// @ts-nocheck
export default {version:'5.706', date:'2026-11-09', changes:[
  '**🧭 The Spot-Check Ruler — a 5-question follow-up conversation + counterfactual FOB check, '+
  'for every weekly and EOM count (task #129).** Modeled verbatim on a real conversation the '+
  'owner had with a GM: what was FOB after you counted, what were your biggest variance/stat '+
  'items, what did you recount, how confident are you, did you look at your reports. The real '+
  'point is the counterfactual box — strip the top-N variance movers back out of reported FOB '+
  'and show the swing (the owner\'s own example: $800 across 3 items moved FOB 1.72 points). A '+
  'tiny gap means the count and the report agree on their own merits; a big one, or one that '+
  'masks the store\'s own FOB target, is flagged as worth a real conversation. Recount detection '+
  'is honest about its limit — a second dated count-session IS detected; whether a specific item '+
  'was re-entered within one submission is reported as "not detectable from today\'s data" '+
  '(task #130, logged separately) rather than guessed at. Two surfaces: a 📋 Ruler button per '+
  'store in Count Cycle (on-demand, any past period), and a Curated Home prompt that fires when '+
  'a store just logged a fresh qualifying count.',
  '**Weekly "needs a deep dive" digest, day/hour configurable in-app (owner request 2026-11-09).** '+
  'Runs the SAME per-store Ruler computation across every store for the prior period and emails '+
  'the ranked list (a hard impossible value first, then a flagged counterfactual gap, then raw '+
  'swing size) — scripts/spot-check-ruler-digest.mjs. The schedule itself is a stored setting '+
  '(org_config, editable from the Count Cycle tab), not a hardcoded cron — same self-gating '+
  'pattern SAGE\'s own Scheduled Prompts already use, so changing the day/time is a click, never '+
  'a new PR.',
]};
