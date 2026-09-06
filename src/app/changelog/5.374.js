// @ts-nocheck
export default {version:'5.374', date:'2026-09-06', changes:[
  'SMG FullScale automation reconnaissance, step 1: user uploaded two real Export-button files ' +
  'from reporting.smg.com (the "more promising avenue" flagged unconfirmed in ' +
  'memory/finding-smg-reporting-api-2026-09-05.md) to verify whether the existing manual-upload ' +
  'parser (parseSMGFullScale, src/parsers/index.js) already handles that exact file shape. It ' +
  'does -- both real files parse as the "legacy Small Graph" layout -- but running the real ' +
  'function against real production files (not a synthetic sample) surfaced two live bugs, ' +
  'fixed in this same pass:',
  '(1) osatB2B/accuracyB2B/dtProblem/overallProblem came back null for every single store in ' +
  'both files. Root cause: the auto-detected column offsets for those four metrics were guessed ' +
  'as `Math.round((rowLength - osatCol) / 5)` -- assuming the row always spans exactly 5 evenly- ' +
  'sized groups out to its last populated cell. But sheet_to_json drops trailing-null columns ' +
  'per row, so rowLength shrinks whenever an export has fewer metrics selected or the sampled ' +
  'row is a thin-volume rollup row, corrupting the guess. Measured directly against both real ' +
  'files: the true stride between metric groups is a FIXED 22 columns (22/44/66/88/110) in both, ' +
  'independent of row length -- so the guess is now `step = osatCol` (itself measured to equal ' +
  '22 in both files) instead of a length-derived estimate.',
  '(2) Both files also list operator/regional rollup rows (e.g. "0218 - WICHITA OK CITY TULSA FT ' +
  'SMITH") that happen to satisfy the store-number regex but are not real stores -- silently ' +
  'parsed as loc 218 with real-looking metric values. Fixed with the same STORE_NAMES-membership ' +
  'guard parseOrgStructure/parseLifeLenzLabor already use for the identical class of orphan/ ' +
  'legend row, applied to both parseSMGFullScale layout branches.',
  'New src/__tests__/smg-fullscale-smallgraph.test.js locks in both fixes for the previously- ' +
  'untested legacy Small Graph branch (only the Data-Only layout had coverage). Re-verified ' +
  'against the real uploaded files after the fix: all 4 previously-null metrics now populate ' +
  'with sane values in the fuller file; the narrower file (which genuinely only carries OSAT+B2B ' +
  'data) correctly keeps accuracyB2B/dtProblem/overallProblem null rather than misreading them ' +
  'from the wrong columns.',
  'Also answered this session: Favorites reports on reporting.smg.com open another Report ' +
  'Builder screen pre-configured to the saved spec (not a direct data render) -- so Favorites- ' +
  'replay does not skip the postback dance. Login auth is passed through from an existing MFA- ' +
  'logged-in atmcd.com session (SSO), not a direct MFA prompt on smg.com itself -- a scripted ' +
  'login would need to replicate that SSO handoff, not just a username/password form. Both ' +
  'answers recorded in memory/finding-smg-reporting-api-2026-09-05.md; full automation feasibility ' +
  '(the Export button\'s underlying HTTP wire protocol is still unconfirmed) remains open.',
]};
