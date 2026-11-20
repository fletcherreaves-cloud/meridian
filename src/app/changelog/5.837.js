// @ts-nocheck
export default {version:'5.837', date:'2026-11-20', changes:[
  '**Holdenville (35064) and Cottondale (35242): same impact-review treatment as Bonifay, two days ' +
  'later — but with an honest open verdict instead of a confirmed cause.** A district-wide scan for ' +
  'other stores showing Bonifay\'s shape (a real, sustained break vs LY, traffic falling faster than ' +
  'sales) surfaced these two. Measured against real `qsr_daily_activity_rollup` data: both show a ' +
  'real, sustained step down starting **2026-09-26** (53 days measured) -- Holdenville sales -13.4% / ' +
  'transactions -19.5% vs LY (was roughly flat-to-soft, -3.3%, in the 45 days before); Cottondale ' +
  'sales -6.7% / transactions -13.1% vs LY (already running soft on transactions, -9.2%, before -- ' +
  'this is a real acceleration, not a brand-new trend). ' +
  '**Unlike Bonifay, neither has a confirmed external cause.** Checked `org_events` for both stores ' +
  'over the window -- only routine school-calendar and football entries overlap, nothing that ' +
  'explains a 7-week sustained drop. Holdenville has a known GM-in-training transition on file (new ' +
  'GM on-site reset/training 2026-10-30), but that **postdates** the 2026-09-26 onset by five weeks, ' +
  'so it does not explain the *start* of the decline -- logged as a thing to watch for a turnaround, ' +
  'not a cause. Cottondale has nothing on file at all; genuinely open, worth asking the store/' +
  'supervisor directly. Both `org_events` entries are logged `verification: "Unconfirmed"`, not ' +
  '"Confirmed" -- this file doesn\'t fabricate a cause just because one is expected. ' +
  'Same two mechanical corrections as Bonifay, applied either way since the DATA itself doesn\'t ' +
  'depend on knowing why: `monthly_targets` Nov/Dec 2026 corrected for both (Holdenville $200,660 / ' +
  '$211,030, down from $215,055 / $221,845; Cottondale $247,447 / $269,260, down from $289,874 / ' +
  '$277,263 -- same post-break trailing-rate x matched-LY-seasonal-shape method); ' +
  '`DEFAULT_MODEL_ASSIGNMENTS` notes for both locs (`constants.js`) flagged for recalibration once ' +
  '90+ days of post-break history exists (~2027-01-01+). Full suite (8450 tests) + build both clean.',
]};
