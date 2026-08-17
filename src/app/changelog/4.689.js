// @ts-nocheck
export default {version:'4.689', date:'2026-07-31', changes:[
  'EOM → count-date EXCEPTIONS: accept a store\'s early count as its EOM count when an above-store leader approves it (e.g., a store that counted on the 28th and won\'t recount). "grant count exception" on the store row records who approved it + a reason; the store then reads complete and the recap stops nudging a recount, but every exception is logged + attributed (green "✓ early count accepted · {approver}" tag) so the pattern stays visible.',
  'EOM integrity checks are now named "Second-Look Signals" (non-accusatory), branded on the recap + a dedicated "verify, don\'t accuse" report section. FOB breakdown matrix colors each component vs its OWN target (red = over / green = under) with a sales-weighted Target row. QSRSoft KB pull (#41) built — crawls the help center for grounding SAGE + diagnostics.',
]};
