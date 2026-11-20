// @ts-nocheck
export default {version:'5.838', date:'2026-11-20', changes:[
  '**Correction: Holdenville\'s flagged "sustained decline" (v5.837, same day) was a comp-base ' +
  'artifact, not real — owner-identified.** A nearby Sonic was closed 2025-10-03 through 2025-12-30 ' +
  'for remodel (already logged in `org_events`, loc 35064); Holdenville absorbed that overflow ' +
  'traffic, inflating its own Oct-Dec 2025 base well above normal. Sonic reopened before this year\'s ' +
  'equivalent window, so 2026 was being measured against that artificially-high 2025 figure — ' +
  'producing the apparent "-13.4% sales / -19.5% transactions vs LY" reading flagged a few hours ' +
  'earlier the same day. Re-measured against the clean (non-Sonic) 2023/2024 baseline instead: ' +
  'Sept26-Nov17 transactions this year (36,890) are nearly IDENTICAL to 2023/2024 (36,976/36,568) — ' +
  '2025\'s 46,836 was the outlier, not this year\'s number. **There is no real decline at Holdenville.** ' +
  '`org_events` id 6528 corrected to `verification: "Confirmed"` with the real cause (was ' +
  '"Unconfirmed"/no-cause-found). `monthly_targets` Nov/Dec 2026 re-corrected using the clean ' +
  '2023/2024 baseline instead of the contaminated 2025 ratio: Nov $201,855 (was $200,660, a 0.6% ' +
  'difference — that one was close by coincidence), Dec $221,128 (was $211,030 — a real, larger fix; ' +
  'December needed almost no correction at all from the ORIGINAL pre-flag target once the real ' +
  'baseline is used). `DEFAULT_MODEL_ASSIGNMENTS`\' note for loc 35064 corrected to match — ' +
  'recalibration is still worth doing eventually, since the Sep2025-May2026 backtest window still ' +
  'straddles the Sonic-contaminated period, but not for the "unexplained decline" reason first given. ' +
  'Cottondale\'s separate flag (also v5.837) is untouched — no equivalent explanation has surfaced for ' +
  'it. Full suite (8450 tests) + build both clean.',
]};
