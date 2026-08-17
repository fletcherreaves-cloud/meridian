// @ts-nocheck
export default {version:'4.657', date:'2026-07-30', changes:[
  'EOM count timing is now class-aware: Food, Condiment AND Paper are due to 100% by EOD; Non-Product isn\'t counted until tomorrow — so it no longer holds a store below 100%, shows as "N tmrw" (muted) on the chips, and is framed as expected (not a gap) in the diagnosis. Progress %, "believes done", and the scoreboard all reflect TODAY\'s target.',
  'No more "no waste logged / verify waste" flags on Paper / Non-Product — waste is a Food/Condiment concern only. "Counted over N days" now uses each item\'s most-recent count date (a store that re-counted everything today reads 1 day). Obsolete / to-count / early tables now show On-hand qty alongside On-hand $.',
]};
