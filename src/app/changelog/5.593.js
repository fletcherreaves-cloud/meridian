// @ts-nocheck
export default {version:'5.593', date:'2026-11-01', changes:[
  '**Version bump had drifted -- 11 commits landed on main since v5.592 (2026-10-27) with no ' +
  'changelog entry, including real feature work.** Not a decision, an oversight across several ' +
  "PRs in a row; this entry catches it up and folds in everything that shipped unversioned.",
  '**Count Timing Report** -- new "⏱ Count Timing Report" in Inventory Control\'s Reports▾ menu: ' +
  'district-wide, sortable, three modes (latest count day / all count sessions / trailing-' +
  'monthly) on top of eom-item-journey.js\'s existing count-duration logic, extracted into a ' +
  'shared summarizeDaySession() so this report and the single-store 🔬 Food-Cost Diagnosis modal ' +
  'can never disagree about what a count day looked like.',
  '**Missed on Current Count report** -- new "🗓 Missed on Current Count" report: lists, by ' +
  "location and grouped by product class, every item whose own last-counted/last-submitted date " +
  "doesn't match the store's current count-cycle date (different, blank, or N/A all count as " +
  '"not physically counted this cycle" -- the owner\'s own definition). Deliberately a stricter, ' +
  "different lens than the existing window-based Missing Items tab -- both stay, answering " +
  'different questions. Location/date selectable, with a manual "force count date" override, ' +
  'Print/Copy/CSV export.',
  "**PanelChrome mobile overflow fix** -- band 3 (the Reports/Scans/Monitor/Pulls action menus + " +
  "view tabs) was running off the right edge on phone with no way to reach what was cut off, and " +
  "disappearing entirely on some report tabs. Root cause: a flex item's default min-width:auto " +
  "makes overflowX:'auto' alone a no-op. Fixed with minWidth:0 alongside it, each of the " +
  "actions/tabs groups scrolling independently. Documented in memory/panel-contract.md as the " +
  "pattern to reach for first on any other panel's overflowing control row.",
  '**Store Dashboard Sales Trend chart now overlays LifeLenz\'s own forecast** (owner req, from a ' +
  'screenshot of the Tishomingo chart) -- a new dashed "LifeLenz Forecast" line alongside the ' +
  'existing Actual/AI Forecast/Goal/LY Sales, sourced from ds.schedRows (already loaded app-wide, ' +
  'no new fetch). Same loc+date matching convention lifelenz.js\'s "MBI vs LifeLenz Accuracy" ' +
  "panel already uses for its own Accuracy mode -- that panel's own precedent is to treat " +
  "ds.schedRows as the reference LifeLenz number for past dates too (continuously overwritten by " +
  "LifeLenz, not point-in-time), not the separate lead-time-matched lifelenz_forecast_captures " +
  'table (still has no UI consumer). A caveat line renders under the chart whenever a past date ' +
  "is plotted, saying exactly that.",
  'Full suite green, build clean before each of these shipped.',
]};
