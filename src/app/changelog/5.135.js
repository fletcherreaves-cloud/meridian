// @ts-nocheck
export default {version:'5.135', date:'2026-08-24', changes:[
  'Fix Food Cost panel flashing a stale month before the cloud stream loads (owner-reported '
  + '2026-08-24, follow-up to the #633 race fix): "Once the cloud data loads it shows August. Just '
  + 'a delay between the two."\n\n'
  + 'The #633 fix corrected the END state -- selMonth now always lands on the cloud stream\'s real '
  + 'newest month once loadQsrFob() settles -- but the panel\'s top-level loading gate only fired '
  + 'on genuinely EMPTY data. While the cloud fetch is still in flight, fobRowsEff already falls '
  + 'back to non-empty manual rows, so the full panel rendered immediately: selMonth was still \'\' '
  + '(unset) at that point, the native <select> (value=\'\' matches no <option>) fell back to '
  + 'displaying its first DOM option -- the manual upload\'s month -- as a visual artifact rather '
  + 'than a real selection, and computeFOBMetrics\'s month filter is a no-op on an empty selMonth, '
  + 'so it silently aggregated every manual month instead of scoping to one.\n\n'
  + 'Fixed by gating the same "Loading FOB data…" screen on qsrFobRows===null too, closing the '
  + 'window entirely -- the panel now waits for the cloud fetch to settle before rendering '
  + 'anything. Confirmed revert-sensitive: reverted the gate, watched the new test fail with the '
  + 'exact reported symptom (full panel renders showing "Period May 2026" before the cloud data '
  + 'arrives), restored it.\n\n'
  + 'Suite 2220/2220, build clean, 518.37 KB gzip eager payload.',
]};
