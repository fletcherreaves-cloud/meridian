// @ts-nocheck
// src/engine/contact-directory.js — the owner's real GM/supervisor/operator/above-store names
// and emails, plus the scope-based email-routing logic (getReportRecipients) that reads them.
//
// Extracted out of src/features/morning-brief.js (2026-10-29) so a plain Node script
// (scripts/lib/eom-digest-notify.mjs) can import this data directly. morning-brief.js contains
// JSX (MorningBriefPanel) in the same file as this data always lived in, and a raw `node
// script.mjs` run has no JSX transform — importing morning-brief.js itself from a Node script
// would fail on the JSX syntax even though the specific exports needed here (CONTACTS,
// STORE_STAFF, getReportRecipients, ...) are themselves plain JS. This file is the plain-JS-only
// home for them; morning-brief.js now imports + re-exports the same names so every existing
// browser-side caller (pipeline.js, management.js, App.js) needs no changes at all — same
// pattern this project already used for SAGE's cross-boundary modules (paginate.js,
// daily-activity-agg.js, staffing-presence.js): one shared module, two runtimes.
//
// Behavior is byte-for-byte unchanged from what lived in morning-brief.js — this is a move, not
// a rewrite.
import { latestEffective } from '../constants.js';

export const CONTACTS = {
  aboveStore: [
    { name: 'Molly Mcgill', email: 'Molly@mcdok.com', role: 'Above Store' },
    { name: 'Hugh Bonner', email: 'Hugh@mcdok.com', role: 'Above Store' },
    // fletcher.reaves@mcreaves.com, NOT fletcher@mcdok.com -- confirmed 2026-10-29 as the
    // address actually registered on the Resend account. Resend's sandbox sender
    // (onboarding@resend.dev) can only deliver to that exact address, so this one entry has to
    // match it byte-for-byte or the EOM digest's one working delivery -- the copy the owner's
    // own copy/paste stopgap depends on -- silently 403s like every other recipient already
    // does. Matches resend-notify.mjs's EMAIL_TO, which every other automated alert in this app
    // already sends to successfully.
    { name: 'Fletcher Reaves', email: 'fletcher.reaves@mcreaves.com', role: 'Above Store' },
  ],
  operators: {
    'Ryan Thorley': { emails: ['Ryan@mcdok.com', 'Ryan@emeraldarches.com'], org: 'MCDOK/EA' },
    'Gary Mornhinweg': { emails: ['Gary@mcdok.com'], org: 'MCDOK' },
    'Rick/Kathy Thorley': { emails: ['rick@mcdok.com', 'kathy@mcdok.com'], org: 'MCDOK' },
    'Jacob Thorley': { emails: ['Jacob@emeraldarches.com'], org: 'Emerald Arches' },
  },
  supervisors: {
    'Robert Spencer': { email: 'Robert@mcdok.com' },
    'Krystiana Langford': { email: 'Krystiana@mcdok.com' },
    'Ashley Podroza': { email: 'Ashley@mcdok.com' },
    'Steven Vaughn': { email: 'Steven@mcdok.com' },
    'Amanda Estrada': { email: 'Amanda@mcdok.com' },
    'Brad Denley': { email: 'Brad@emeraldarches.com' },
    // FL patch supervisor (Chipley/Defuniak/Bonifay/Mossy Head) -- confirmed by the owner
    // 2026-10-29, closing the gap PR #1571 flagged (her patch's digests previously had no
    // supervisor to resolve at all).
    'Mary Ratliff': { email: 'mary@emeraldarches.com' },
  },
};

// ── Contact registry: Supabase-with-constants-fallback (Track-B onboarding plumbing) ──
// CONTACTS/STORE_STAFF above are this owner's real GM/supervisor/operator names+emails —
// a future tenant's own people live in org_config key 'contact_registry' and are mutated
// IN PLACE onto these same exported objects at login sync (App.js, mirroring the
// setLiveStoreNames pattern in constants.js), so no consumer code needs to change. No row
// for this owner = identical behavior.
export function setLiveStoreStaff(staff) {
  if (staff && typeof staff === 'object' && Object.keys(staff).length) Object.assign(STORE_STAFF, staff);
}
export function setLiveContacts(contacts) {
  if (!contacts || typeof contacts !== 'object') return;
  if (Array.isArray(contacts.aboveStore) && contacts.aboveStore.length) CONTACTS.aboveStore = contacts.aboveStore;
  if (contacts.operators && typeof contacts.operators === 'object') Object.assign(CONTACTS.operators, contacts.operators);
  if (contacts.supervisors && typeof contacts.supervisors === 'object') Object.assign(CONTACTS.supervisors, contacts.supervisors);
}

// Email routing for reports
export function getReportRecipients(scope, stores, settings) {
  const above = CONTACTS.aboveStore.map(c => c.email);
  const allOps = Object.values(CONTACTS.operators).flatMap(o => o.emails);
  if (scope === 'all') return [...new Set([...above, ...allOps])];
  if (scope === 'MCDOK') {
    const ops = Object.values(CONTACTS.operators).filter(o => o.org === 'MCDOK').flatMap(o => o.emails);
    return [...new Set([...above, ...ops])];
  }
  if (scope === 'Emerald Arches') {
    const ops = Object.values(CONTACTS.operators).filter(o => o.org === 'Emerald Arches').flatMap(o => o.emails);
    return [...new Set([...above, ...ops])];
  }
  if (scope === 'patch' && stores.length) {
    const supName = stores[0].sup;
    const supEmail = supName ? CONTACTS.supervisors[supName]?.email : '';
    const opEmails = stores.flatMap(s => {
      const op = Object.entries(CONTACTS.operators).find(([k]) => k === s.operator || k.replace(' (EA)', '') === s.operator);
      return op ? op[1].emails : [];
    });
    return [...new Set([...above, ...(supEmail ? [supEmail] : []), ...opEmails])];
  }
  if (scope === 'store' && stores.length) {
    const s = stores[0];
    const gmEmail = s.gmEmail ? [s.gmEmail] : [];
    const supEmail = s.supEmail ? [s.supEmail] : [];
    return [...new Set([...gmEmail, ...supEmail, ...above])];
  }
  return above;
}

// #363 — sup/supEmail dropped (were a frozen loc->supervisor-name literal, the same class of
// staleness bug SUPERVISOR_PATCHES had above — this table's copy happened to still agree
// with the live org, but nothing kept it that way). pipeline.js resolves sup/supEmail LIVE
// via whoRan + CONTACTS.supervisors now, so gm/gmEmail (person data that doesn't move with
// org reassignments) is all this table carries.
export const STORE_STAFF = {
  '3708': { gm: 'Cinthya Armedariz', gmEmail: 'Cinthya@mcdok.com' },
  '5183': { gm: 'Mukarram Norman', gmEmail: 'Mukarram@mcdok.com' },
  '5985': { gm: 'Stacey Hyatt', gmEmail: 'Stacey@mcdok.com' },
  '6972': { gm: 'Nick Rice', gmEmail: 'Nick@mcdok.com' },
  '10422': { gm: 'Ashleyh Hegwer', gmEmail: 'Ashleyh@mcdok.com' },
  '10915': { gm: 'Caleb Nunnelley', gmEmail: 'Caleb@mcdok.com' },
  '11657': { gm: 'Jessie Hiatt', gmEmail: 'Jessie@mcdok.com' },
  '13113': { gm: 'Chris Abbey', gmEmail: 'Chris@mcdok.com' },
  '18213': { gm: 'Cora Bahling', gmEmail: 'Cora@mcdok.com' },
  '20475': { gm: 'Derek McGirt', gmEmail: 'Derek@mcdok.com' },
  '24471': { gm: 'Mystykal Abbey', gmEmail: 'Mystykal@mcdok.com' },
  '29760': { gm: 'Heather Danforth', gmEmail: 'Heather@mcdok.com' },
  '31357': { gm: 'Brady Giambaresi', gmEmail: 'Brady@mcdok.com' },
  '32525': { gm: 'Aliyah Richardson', gmEmail: 'Aliyah@mcdok.com' },
  '33109': { gm: 'Rey Araiz', gmEmail: 'Rey@mcdok.com' },
  '33222': { gm: 'Carol Escusa', gmEmail: 'Carol@mcdok.com' },
  '33704': { gm: 'Candy Barksdale', gmEmail: 'Candy@mcdok.com' },
  '34222': { gm: 'Hunter McKee', gmEmail: 'Hunter@mcdok.com' },
  '35064': { gm: 'Lynsey Yahola', gmEmail: 'Lynsey@mcdok.com' },
  // Zukarr Eaves promoted to Supervisor (Ardmore-Broadway/NEC Cooper/Tishomingo patch),
  // effective 2026-10-05 -- see src/constants.js DEF_SETTINGS.supervisorGroups and the live
  // orgAssignments reassignment of the same date. Sabrina Turner is the new GM here.
  '43380': { gm: 'Sabrina Turner', gmEmail: 'Sabrina@mcdok.com' },
  '6178': { gm: 'Janet Jeter', gmEmail: 'Janet@emeraldarches.com' },
  '6838': { gm: 'Stephanie Harris', gmEmail: 'Stephanie@emeraldarches.com' },
  // Melissa Hagerman is the real, current GM as of the owner's 2026-10-14 org-chart correction
  // (confirmed against a re-uploaded, corrected workbook) -- Harlee Yates moved on/transferred.
  '10034': { gm: 'Melissa Hagerman', gmEmail: 'Melissa@emeraldarches.com' },
  '35242': { gm: 'Michele Nixon', gmEmail: 'Michele@emeraldarches.com' },
  '37566': { gm: 'Debra Herndon', gmEmail: 'Debra@emeraldarches.com' },
  '38609': { gm: 'Christina Bencokzy', gmEmail: 'Christina@emeraldarches.com' },
  '43701': { gm: 'Shannon Hardin', gmEmail: 'Shannon@emeraldarches.com' },
};

// ── GM assignments: effective-dated timeline (2026-10-06 follow-up to the Supervisor one) ────
// STORE_STAFF above is a flat "current" snapshot -- swapping a GM (like Tishomingo's
// Zukarr Eaves -> Sabrina Turner) just overwrote the name with no record of who held it before
// or when the change took effect. This mirrors constants.js's orgAssignments()/whoRan() pattern
// for Supervisor exactly, reusing the SAME "latest start ≤ date wins" primitive
// (latestEffective(), constants.js) rather than a second copy of that tie-break loop: a row is
// { loc, gm, gmEmail, start }, '' start = since-always, a later row's start implicitly ends the
// prior one. The flat STORE_STAFF table is the seed/default (same role DEF_SETTINGS.
// supervisorGroups plays for orgAssignments); the live timeline lives in app settings
// (settings.gmAssignments, org_config 'app_settings', same blob orgAssignments already lives
// in) and management.js's GmAssignmentsEditor writes to it + logs to org_assignment_audit
// (assignment_type:'gm') exactly like SupervisorAssignmentsEditor does.
export function seedGmAssignmentsFromStaff(staff) {
  const out = [];
  for (const [loc, s] of Object.entries(staff || {})) {
    if (s?.gm) out.push({ loc: String(parseInt(loc, 10)), gm: s.gm, gmEmail: s.gmEmail || '', start: '' });
  }
  return out;
}
let _liveGmAssignments = null;
// Sets the live timeline AND mutates STORE_STAFF in place to today's resolved gm/gmEmail per
// loc -- the SAME "sync a live singleton onto the existing flat table" technique
// setLiveStoreStaff() above already uses for the (currently unused, future-tenant)
// contact_registry overlay, so every existing STORE_STAFF[loc].gm/.gmEmail reader (pipeline.js,
// getReportRecipients above, etc.) sees the current holder with no call-site changes, while
// whoIsGM()/gmAssignments() stay available for anyone who needs the FULL history or an
// as-of-a-past-date answer.
export function setLiveGmAssignments(list) {
  if (!Array.isArray(list) || !list.length) return;
  _liveGmAssignments = list;
  const today = new Date().toISOString().slice(0, 10);
  const current = {};
  for (const loc of [...new Set(list.map(a => String(parseInt(a.loc, 10))))]) {
    const rec = whoIsGM(loc, today, list);
    if (rec) current[loc] = { ...(STORE_STAFF[loc] || {}), gm: rec.gm, gmEmail: rec.gmEmail || '' };
  }
  if (Object.keys(current).length) Object.assign(STORE_STAFF, current);
}
export function gmAssignments() {
  if (_liveGmAssignments && _liveGmAssignments.length) return _liveGmAssignments;
  return seedGmAssignmentsFromStaff(STORE_STAFF);
}
// GM (+ email) of a store as-of a date -- same precedence rule as constants.js's whoRan(),
// via the shared latestEffective() primitive. Returns {gm, gmEmail} or null.
export function whoIsGM(loc, date, list) {
  return latestEffective(loc, date, list || gmAssignments(), a => ({ gm: a.gm, gmEmail: a.gmEmail || '' }));
}
