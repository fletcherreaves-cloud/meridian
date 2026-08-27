// @ts-nocheck
export default {version:'5.195', date:'2026-08-27', changes:[
  'Fixed FOB % / Food $ showing blank or $0 on weekly-scoped panels (reported live on the '
  + 'Leadership One-Pager\'s "Week of Aug 19" tile, while its own YTD FOB % worked fine). Root '
  + 'cause, confirmed directly against production `qsr_fob`: the underlying QSRSoft "Actual Food '
  + 'Over Base" report settles once near each month\'s start and then holds that exact same '
  + 'cumulative value for the rest of the month (e.g. one store held the identical total unchanged '
  + 'for 26 straight days). `fobByRange()` (`src/engine/one-pager-data.js`) isolates a window\'s '
  + 'own slice by diffing two within-month snapshots -- for any window that starts after that '
  + 'month\'s settle and doesn\'t cross into another month, both snapshots are identical by '
  + 'construction, so the diff is always exactly zero. Not a data gap -- a structural mismatch '
  + 'between this source\'s once-a-month cadence and a sub-month window. Fixed with a narrow '
  + 'fallback: when the entire requested range sits inside a single calendar month and that '
  + 'month\'s diff comes out non-positive despite the month having real settled data, use the '
  + 'month-to-date absolute total instead (the same number already shown correctly for a '
  + 'full-month/YTD window) rather than a fabricated zero. Restricted to single-month windows only '
  + '-- a multi-month-spanning window keeps its exact prior diffing behavior, since a per-segment '
  + 'fallback there would double-count whichever month the window only partially covers (a '
  + 'dedicated test guards this). `fobByRange()` is shared by every panel that shows FOB (At A '
  + 'Glance, Analytics, Signals, SAGE, Opportunity Dollars, the Leadership One-Pager, and others), '
  + 'so this fix reaches all of them, not just the one it was reported on.',
]};
