// @ts-nocheck
export default {version:'4.868', date:'2026-08-07', changes:[
  'NEW — Count Cycle panel (Operations → Count Cycle). Enforces the count rules per store: every weekly count needs a full Food AND Condiment count, and Paper is mandatory on the mid-month count. The mid-month count floats with each store\'s own count day, so it is identified by Paper being counted outside the close window rather than by a fixed date. Opens on the stores that need chasing, with the rest collapsed. Reads the full item universe (qsr_onhand) rather than the top-variance table, which carries no Condiment items at all.',
]};
