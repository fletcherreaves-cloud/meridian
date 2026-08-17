// @ts-nocheck
export default {version:'4.622', date:'2026-07-30', changes:[
  'FIXED the real reason yearly targets weren\'t landing: the yearly-targets file (a "Table 1" layout with an Index row-counter column before the Restaurant column, and a category row above the real header) was parsed as 0 stores — so NONE of the file\'s targets flowed and the app silently fell back to static defaults. The parser now anchors on the Restaurant/Loc/Store column (not the Index counter) and picks the true header row, so every yearly target the file provides — OEPE, KVS time/usage, R2P, TPPH, Labor, FOB, Voice OSAT (5★, from VOICE OSAT PACE) and OSAT B2B (1★, from Overall Satisfaction B2B) — now flows to the reviews and every other target consumer on re-import. Regression test added.',
]};
