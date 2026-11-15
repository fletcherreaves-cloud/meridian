// @ts-nocheck
// Catch-up entry (owner report, live, 2026-11-15): "looks like version numbers are not updating
// again. I am on v5.795." Confirmed via git history -- every commit since 5.795 (v5.796 through
// v5.804 in their own commit messages) shipped without adding the required src/app/changelog/
// entry file that actually drives the in-app version badge (App.js's LATEST_CHANGELOG_ENTRY, see
// its own header: "Adding a changelog entry IS the version bump now"), so the badge never moved
// even though eight real commits landed. This one entry catches the display up to reality and
// covers everything that shipped in that gap.
export default {version:'5.796', date:'2026-11-15', changes:[
  '**Targets vs Actual: Monthly tab targets blend across a month boundary.** A 7/14/21/28D ' +
  'window that crosses from one month into the next now blends both months\' real targets -- ' +
  'day-weighted for %/rate/sec metrics, day-prorated-and-summed for $ metrics -- instead of ' +
  'silently reading just one month\'s number. A small "Blended: Xd Mon + Yd Mon" line under the ' +
  'Target makes this explicit.',
  '**Targets vs Actual: Yearly tab rolls up Sales $ / Crew Labor % from Monthly Targets when the ' +
  'yearly workbook has no value**, and computes a real year-to-date actual (completed months\' ' +
  'real totals + a month-end pace projection for the current month) instead of comparing a narrow ' +
  'picker window against a full annual target.',
  '**Fixed: Yearly targets were wildly inaccurate for sales.** Owner report: "It looks like most ' +
  'yearly targets, especially for sales, are not even remotely accurate." Root causes: the ' +
  'monthly-rollup wiring never reached the Yearly tab\'s own call site, and the month-end pace ' +
  'projection divided by the wrong day count for any window that didn\'t start on day 1 of the ' +
  'month (a 28-day window spanning two months produced a pace roughly DOUBLE the true run rate). ' +
  'Both fixed; pace now uses the window\'s own day span.',
  '**Clarified: Variance is always Actual minus Target.** Owner follow-up: "Seems like actual vs ' +
  'target would be ideal and easy for anyone to understand." It used to be the PACED figure minus ' +
  'Target for a paced metric (Sales $), which could show a number far larger than Target and ' +
  'Actual visibly subtract to. Status still grades against the pace where one applies -- that\'s a ' +
  'deliberate, separate judgment call ("are we pacing to hit it") from what Variance answers ("how ' +
  'far off is what\'s actually posted").',
  '**Fixed: Variance\'s color could flatly contradict its own number.** Owner report, live: a real ' +
  '$168,968 Sales $ shortfall rendered in GREEN, right next to a green "On Target" Status -- ' +
  'because Variance\'s color was borrowed from Status (which grades the PACED projection), not the ' +
  'plain actual-vs-target gap Variance itself displays. Variance now gets its own color, graded on ' +
  'its own plain gap -- it reads red for a real miss even when Status still says On Target, and the ' +
  'two are explained as answering different, equally honest questions rather than looking like a ' +
  'contradiction.',
  '**FOB Bonus Food Threshold % removed** (owner follow-up: it graded a figure the stores aren\'t ' +
  'actually tasked or charged to deliver). **FOB components now visually grouped** -- a soft gold ' +
  'accent marks Comp/Raw Waste, Condiment, Emp Food, Stat Loss and Unexplained Diff as one group, ' +
  'with the two summary rows they roll up into (FOB Target %, Total Food Cost %) called out in the ' +
  'full McDonald\'s-gold accent + bold -- then narrowed on owner feedback to drop the shading from ' +
  'Base Food %, Disc Coupon % and Total Food Cost % ("this will help the stores focus on only what ' +
  'they are tasked or charged to deliver").',
  '**Fixed: a UTC-midnight date-parsing bug** that could read a month boundary as the previous ' +
  'calendar day in a non-UTC timezone, silently skewing the cross-month blend\'s day counts.',
  '**Roles & Assignments: the "oversees person" target is now a dropdown of real names**, not a ' +
  'free-text box. Owner report: typing "supervisor zukaar" (following the field\'s own placeholder ' +
  'wording) matched no real person, so the row\'s "Resolved scope" silently stayed "--" with no ' +
  'error to explain why. The dropdown only offers real, matchable names (and excludes the person ' +
  'whose own row is being added), so this typo class is no longer possible.',
  '**PDF export on Targets vs Actual rebuilt to match Print exactly.** The "Print/PDF fixes never ' +
  'reached PDF" reports ("shading is good now on targets vs actual. print/pdf still not fixed") ' +
  'traced to PDF always rendering a generic flat table, completely independent of Print\'s bespoke, ' +
  'styled HTML. PDF now rasterizes the SAME HTML Print uses (one page per store), so the two can ' +
  'never again visually diverge. Also fixed a 164 MB file size on a 28-store export (PNG at 2x ' +
  'scale was wildly oversized for a plain table) by switching to JPEG -- the same export is now ' +
  '4.2 MB.',
  '**PDF export now gives visible on-screen feedback.** Owner report: "i was able to successfully ' +
  'run one pdf report, subsequent attempts yield nothing." The export button gave zero feedback ' +
  'while it rendered (several real seconds for a multi-store report) or if it failed, so a slow ' +
  'run and a silent failure looked identical. It now shows "Generating PDF..." while in flight, a ' +
  'visible error if it throws, and a "PDF ready" confirmation once done -- including a note to ' +
  'check for a browser download-permission icon, since Chrome/Edge silently block a page\'s ' +
  'second-plus automatic download without an explicit "Allow," which matches "one worked, then ' +
  'nothing" exactly and can\'t be detected or bypassed from the page itself.',
]};
