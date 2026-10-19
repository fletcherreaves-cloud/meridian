// Shared guard for the four bulk-import scripts' SEED_PATH override pattern
// (import-ecosure-history.mjs, import-complaints-history.mjs, import-graded-visits-bulk.mjs,
// import-peak-visit-detail.mjs). Each script reads ITS OWN env var to point at a local,
// gitignored/uncommitted seed file; every other env var name falls through to that script's
// own intentionally-empty committed default (memory/data/*-seed.json), which makes a typo'd
// var name silently "succeed" against zero real rows instead of failing loudly.
//
// Real incident, 2026-10-19: all four scripts were run with the SAME env var name
// (GRADED_VISITS_SEED_PATH) -- which matches NONE of the four real names (ECOSURE_SEED_PATH,
// COMPLAINTS_SEED_PATH, GRADED_VISITS_BULK_SEED_PATH, PEAK_VISIT_DETAIL_SEED_PATH; note the
// missing "_BULK"). The ecosure run caught itself (0 raw envelopes, obviously wrong); the other
// three had enough baseline data already in Supabase that "0 new rows" read as a plausible,
// successful re-run rather than a dead giveaway. Caught only by re-running each script against
// the real file with the correct var name and diffing the result.
//
// A list of the four "real" names alone would have MISSED this exact incident -- the var that
// was actually set (GRADED_VISITS_SEED_PATH) isn't one of them, it just LOOKS like one. So the
// check below matches any env var shaped like `*_SEED_PATH` (not just the four known ones) and
// flags it as a likely typo when it isn't this script's own.

const SEED_PATH_VAR_RE = /^[A-Z_]*_SEED_PATH$/;

/** Call right after computing a script's own SEED_PATH (whether or not its own env var was
 *  set). `scriptEnvVar` is the name THIS script reads; `label` is the script's own log prefix
 *  (e.g. '[import-ecosure-history]'), matching every console.log line it already writes. Warns
 *  on stderr (never silent, never throws) when some OTHER `*_SEED_PATH`-shaped var is set but
 *  this script's own var is not -- the exact shape of the 2026-10-19 incident, whether that
 *  other var is one of the three sibling scripts' real names or a plausible-looking typo. */
export function warnOnSeedPathMismatch(scriptEnvVar, label) {
  if (process.env[scriptEnvVar]) return; // this script's own var IS set -- nothing to warn about
  const others = Object.keys(process.env).filter(k => k !== scriptEnvVar && SEED_PATH_VAR_RE.test(k));
  if (!others.length) return; // no seed-path-shaped var set at all -- a deliberate default-path run, not a typo
  console.warn(
    `${label} ⚠️  ${others.join(', ')} ${others.length > 1 ? 'are' : 'is'} set, but this script reads ` +
    `${scriptEnvVar} -- falling back to the default (intentionally empty) seed file. ` +
    `If you meant to point this run at a real capture, set ${scriptEnvVar} instead.`
  );
}
