// @ts-nocheck
export default {version:'4.723', date:'2026-08-01', changes:[
  'FIX (crash): opening the FOB Report threw "$ is not defined" — the money formatter used by the report modal + print/CSV wasn\'t in scope (it was defined only inside the sibling FOB-Analysis modal). Declared it in the component body so both share it. FOB Report opens again.',
  'EOM "Verify & Clear" pre-close check (task #38, KB-grounded): flags deactivated/obsolete WRINs still holding inventory (submit a zero inventory / waste before close) and the same item carrying inventory under 2+ WRINs (zero the unused one — duplicate WRINs must count down to zero). Matched by DESCRIPTION, not leading digits, so items that merely share a WRIN-family prefix are NOT falsely grouped. Quiet when clean (the usual case) — a pre-close safety net. Engine src/engine/eom-verify-clear.js, +tests.',
]};
