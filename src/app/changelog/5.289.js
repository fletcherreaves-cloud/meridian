// @ts-nocheck
export default {version:'5.289', date:'2026-08-31', changes:[
  'EOM Diagnose -- new soft-drink / fountain yield rollup (owner request, verbatim: "give a roll up ' +
  'for all soft drinks on yields... where durant shows it is missing 11 cases. The reality is they ' +
  'are probably legitimately missing some, but not all, due to something else being over, like Bulk ' +
  'Coke in their case... add a rule to check for it to not have it flagged as a massive opportunity"). ' +
  'Any store with 2+ material fountain/BIB items in a period now gets a "Soft-drink / fountain yield ' +
  'rollup" section netting the whole group\'s $ and listing each item\'s own case-converted quantity, ' +
  'shown for every store (not just self-serve towers). A fountain item that\'s part of such a group ' +
  'no longer takes the single "Investigate X" headline slot or a Top-5 fill slot (a real Food/Condiment ' +
  'issue takes the spotlight instead when one exists) -- it still shows in full via the rollup table ' +
  'and the Reference detail table, with its cause/action text reframed toward "check BIB connections / ' +
  'syrup ratios" instead of "recount". Verified against Durant\'s real August variance data (7 fountain ' +
  'items netting -$480, DR PEPPER/BIB alone reading -11.22 cases -- an almost exact match to the ' +
  'owner\'s own "missing 11 cases" example, resolved by COKE/BULK running +0.94 cases the same period).',
  'EOM Recount-Impact report -- fixed a real print bug ("print still does not work"): the report\'s ' +
  'text sets its color via the app\'s theme tokens (var(--text) etc.), and on a dark-mode session ' +
  '(the persisted default for long-standing users) those tokens resolve to light colors meant for a ' +
  'dark surface. Print forces the PAGE to white but never touched the tokens, so every cell rendered ' +
  'near-white text on a white page -- invisible, not just faint, which is what actually produced a ' +
  'blank print preview. Reproduced and confirmed fixed in an actual Chromium print-media render ' +
  '(computed color went from rgb(255,255,255) on white to rgb(17,17,17)), not just read. Also fixed a ' +
  'legacy, unconditional `th{background:#1a2332;color:#fff}` print rule (left over from the old ' +
  'Projections PDF export) that put one dark navy header row on an otherwise white printout.',
  'EOM Recount-Impact report -- fixed column misalignment across a store\'s stacked result-group ' +
  'tables ("need to align column headers and data please"): each "Helped: corrected a $X..." group ' +
  'renders its own <table>, and under the default auto layout each one sized its columns off its own ' +
  'longest item name, so the SAME column landed at a different x-position table to table. Switched to ' +
  'table-layout:fixed with a shared column-width set (long item names now truncate with an ellipsis ' +
  'instead of pushing the rest of the row over) so every group\'s table lines up with the next.',
  'EOM Recount-Impact report -- the "Helped"/"Hurt" verdict line now spells out which direction the ' +
  'correction actually moves food cost, not just the count. Owner: "we may need to be more descriptive ' +
  'to make sure someone reading this fully understands what is happening as a result of the recount." ' +
  'Correcting an OVERcount means the recount found LESS product on hand than the first count claimed ' +
  '(ending inventory drops), which RAISES the item\'s computed food cost for the period even though the ' +
  'count itself is now more accurate -- the old one-clause text read as unambiguously good and didn\'t ' +
  'say that.',
]};
