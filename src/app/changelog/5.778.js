// @ts-nocheck
export default {version:'5.778', date:'2026-11-14', changes:[
  '**Register Audit: target-relative egregious/repetitive flagging + %-of-sales surfacing** ' +
  '(Notes 61 items #10/#11, owner-approved 2026-11-14). Owner, verbatim: *"as far as we have ' +
  'data for reference and trends, but realistically the recent items are what is acted upon. ' +
  'Flags triggered by variation from target or being highly repetitive or egregious... Goal is ' +
  'to identify true opportunities that need to be acted upon"* and *"the big ones are cash +/-, ' +
  'T-Reds before and after, Refunds and Overrings."* New `computeTargetAwareRegisterFlags()` ' +
  '(register-audit.js) replaces the old flat magic-number thresholds as the panel\'s primary ' +
  'risk signal: each of the 5 named metrics is compared against the SAME store\'s own real ' +
  'DEFAULT_TARGETS %-field, fed the employee\'s FULL row history (not whatever date range the ' +
  'toolbar happens to have selected) so a single-day blowout ("egregious", 3x target deviation ' +
  'or more) and a recent pattern ("repetitive", ≥3 of the trailing 6 weeks\' worked days over ' +
  'target, ≥50% share) are told apart and weighted differently (25 vs 15 points) rather than ' +
  'folded into one flat score — a single blowout needs same-week attention regardless of history. ' +
  'The trailing-6-weeks window reuses the exact cadence store-cockpit.js\'s own Cash Controls ' +
  'Cockpit already established for Cash O/S, not a fresh number. Full-history reference stats ' +
  '(the owner\'s own "for reference and trends") stay computed and exposed alongside the recent-' +
  'window-driven flags. Overview table now shows $ AND % together for Cash O/S, T-Red Before, ' +
  'T-Red After, Refund, and Overring (previously $ or count only, no %); the Risk badge\'s ' +
  'hover text states which specific metric and failure mode triggered it. 12 new tests. Full ' +
  'design + threshold rationale: see register-audit.js\'s own header comment on ' +
  'computeTargetAwareRegisterFlags, and memory/finding-register-audit-target-flags-2026-11-14.md.',
]};
