// scripts/lib/eom-digest-notify.mjs — dispatch #215 Task 3: roll-up digest email content + send.
//
// Sibling to resend-notify.mjs, matching how #211/#213 split notification CONTENT+SEND into a
// small, independently-testable lib imported by both the real pull script and its own unit
// tests. Reuses postResend()/EMAIL_TO from resend-notify.mjs (dispatch #215 exported postResend
// for exactly this reuse) rather than a second Resend POST implementation.
import { postResend, EMAIL_TO, fobComponentsTableHtml } from './resend-notify.mjs';
import { safeCreateClient } from './safe-supabase-client.mjs';
import { loadDigestSubscriberEmails } from './email-digest-subscriptions.mjs';
import { getReportRecipients, CONTACTS, STORE_STAFF } from '../../src/engine/contact-directory.js';
import { escapeHtml } from '../../src/utils/fmt.js';

const supabase = safeCreateClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const CLASS_ORDER = ['food', 'condiment', 'paper', 'nonproduct'];
const CLASS_LABELS = { food: 'Food', condiment: 'Condiment', paper: 'Paper', nonproduct: 'Non-Product' };
// dispatch #224 Task 3 — 'operator' joins district/patch/org as a real digest level.
// 2026-10-29 — 'store' joins them too (owner req: resend a digest for just one location).
const LEVEL_LABELS = { district: 'District', org: 'Market', patch: 'Patch', operator: 'Operator', store: 'Store' };

const money = (n) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n || 0)).toLocaleString('en-US');

// dispatch #215 Task 3 (v1) had EVERY (level, group) resolve to the owner's own email — necessary
// bootstrap given Resend's sandbox-sender restriction and no per-user contact registry existing
// yet. 2026-09-01 (owner req, verbatim: "allow anyone to sign up or opt in to whichever reports
// they want emailed to them") added opt-in subscriptions (email_digest_subscriptions,
// scripts/lib/email-digest-subscriptions.mjs) on top, but `level`/`groupKey` stayed unused — every
// subscriber got every level's digest, and nobody got a digest automatically just by being the
// relevant GM/supervisor for it.
//
// 2026-10-29 (owner req, verbatim: "automatically send the email digests to the stores and
// supervisor over it as well as the owner (operator) and hugh... I want to be able to send those
// emails directly to them") — `level`/`groupKey` are used now. For every level, the group's own
// stores' GMs are included (reusing STORE_STAFF, src/engine/contact-directory.js -- real GM
// emails already on file for all 27 stores, nothing new to collect), plus the role-appropriate
// leadership via getReportRecipients() (the SAME scope-based routing already live elsewhere in
// this app -- not a second lookup). CONTACTS.aboveStore (Hugh Bonner + Fletcher Reaves + Molly
// Mcgill) is returned by every getReportRecipients() branch, so "owner and hugh" is covered at
// every level without special-casing; Molly rides along too since this reuses the SAME
// above-store list the rest of the app already treats as one unit, not three individually-opted
// roles -- flag to the owner if that's not what he wants for EOM specifically.
//
// Explicit opt-in subscribers are additive, not replaced: the Sep 1 "anyone can opt in" feature
// still works exactly as before, union'd on top of the new automatic routing, so someone outside
// a patch's own stores/supervisor/leadership can still subscribe to see it.
//
// `stores` (new 3rd param, defaults to [] for callers that only have level+groupKey — e.g. this
// file's own existing tests) should be the group's `stores` array (eom-digest.js's rollupGroup()
// shape: { loc, patch, operator, ... } per store) whenever the caller has it; sendDigestEmail()
// below always passes it.
export async function recipientsFor(level, groupKey, stores = []) {
  const subs = await loadDigestSubscriberEmails(supabase, 'eom_digest');

  let roleBased;
  if (level === 'store' && stores.length) {
    // One store IS the group -- there's no separate supervisor-name groupKey to pass in (groupKey
    // here is just that store's own loc, eom-digest.js's buildEomDigest 'store' branch). The
    // store's own `patch` field already carries its live supervisor's NAME (see
    // scripts/eom-digest-send.mjs's buildStoreRows: `patch: supervisorOf(u)`), same convention
    // the 'patch' branch below relies on via its externally-passed groupKey -- reuse the SAME
    // getReportRecipients('patch', ...) routing (supervisor + operator + leadership), just fed
    // this one store instead of a whole patch's worth.
    roleBased = getReportRecipients('patch', stores.map(s => ({ ...s, sup: s.patch })), {});
  } else if (level === 'patch' && stores.length) {
    // Every store in a patch shares its one supervisor -- groupKey IS that supervisor's name;
    // getReportRecipients()'s 'patch' scope reads stores[0].sup plus each store's own .operator.
    roleBased = getReportRecipients('patch', stores.map(s => ({ ...s, sup: groupKey })), {});
  } else if (level === 'org') {
    const scope = groupKey === 'mcdok' ? 'MCDOK' : groupKey === 'emerald' ? 'Emerald Arches' : null;
    roleBased = scope ? getReportRecipients(scope, [], {}) : getReportRecipients('all', [], {});
  } else if (level === 'operator') {
    const opEmails = CONTACTS.operators[groupKey]?.emails || [];
    roleBased = [...new Set([...opEmails, ...CONTACTS.aboveStore.map(c => c.email)])];
  } else {
    // 'district' (one group, everyone) and any unrecognized level -- district-wide leadership.
    roleBased = getReportRecipients('all', [], {});
  }

  // "The stores" half of the request: every store in this group gets the same email its own
  // supervisor/leadership does, since the body already carries that store's own detail
  // (storeSectionHtml, below) alongside its patch-/org-/district-mates'.
  const gmEmails = stores
    .map(s => STORE_STAFF[String(parseInt(s.loc, 10))]?.gmEmail)
    .filter(Boolean);

  const automatic = [...new Set([...roleBased, ...gmEmails])];
  return subs.length ? [...new Set([...automatic, ...subs])] : automatic;
}

// dispatch #224 Task 6 — one store's full FOB+components table + recount-opportunities list,
// reusing fobComponentsTableHtml() (resend-notify.mjs, extracted in this same dispatch) rather
// than a second table renderer. Decision 2 (full detail everywhere, no leaner rollup variant) is
// why this renders for EVERY store in the group unconditionally — a 27-store District email gets
// long, and that's accepted per the dispatch, not capped preemptively (see main() below for
// whether that has actually hit a real delivery-size problem).
function storeSectionHtml(s) {
  const table = fobComponentsTableHtml(s.fob, s.fobTarget, s.countComplete);
  const items = s.recountItems || [];
  const recountRows = items.map(it =>
    `<tr><td style="padding:3px 10px 3px 0;border-bottom:1px solid #eee">${it.wrin || '—'}</td>` +
    `<td style="padding:3px 10px 3px 0;border-bottom:1px solid #eee">${it.descr || '—'}</td>` +
    `<td style="padding:3px 10px 3px 0;border-bottom:1px solid #eee">${CLASS_LABELS[it.cls] || it.cls || '—'}</td>` +
    `<td style="padding:3px 0;border-bottom:1px solid #eee">${money(it.valueAtRisk)}</td></tr>`
  ).join('');
  const recountHtml = items.length
    ? `<p style="margin:8px 0 4px;font-weight:600">Recount opportunities (${items.length})</p>
<table style="border-collapse:collapse;width:100%;font-size:12.5px;margin:0 0 4px">
<thead><tr style="text-align:left;border-bottom:2px solid #ccc"><th style="padding:3px 10px 3px 0">WRIN</th><th style="padding:3px 10px 3px 0">Description</th><th style="padding:3px 10px 3px 0">Class</th><th style="padding:3px 0">$ at risk</th></tr></thead>
<tbody>${recountRows}</tbody>
</table>`
    : `<p style="margin:8px 0 4px;color:#4a4">No uncounted-item gaps flagged — not a signal to skip the routine of recounting top stat/variance items for consistency.</p>`;
  return `<div style="margin:14px 0;padding-top:10px;border-top:1px solid #ddd">
<h4 style="margin:0 0 6px">${s.name || s.loc}</h4>
${table || '<p style="margin:0 0 8px;color:#888">No FOB data on record for this store yet.</p>'}
${recountHtml}
</div>`;
}

// One roll-up GROUP (buildEomDigest()'s per-group shape, src/engine/eom-digest.js) -> one email.
//
// `recipients` (owner req, 2026-10-29: "create a way for me to copy the context that's actually
// emailed to me currently... so I can just paste in the emails and email it out myself") -- while
// Resend's sandbox sender can only deliver to the owner's own address, every other recipient
// recipientsFor() resolves to silently 403s. Rendering the full resolved list INSIDE the one copy
// that does land (the owner's) turns that copy into a stopgap: open it, select the monospace
// list, paste into To/Bcc, forward the rest of the body. No separate tool or UI needed -- it's
// already the exact content being emailed, just made copyable. Harmless once a domain is
// verified and every recipient starts receiving their own copy directly (optional to remove then,
// not required to).
export function buildDigestEmailContent(group, level, recipients = []) {
  const levelLabel = LEVEL_LABELS[level] || level;
  const subject = `Meridian — ${levelLabel} EOM Digest: ${group.label}`;
  const recipientsBlock = recipients.length ? `<div style="margin:0 0 14px;padding:10px 14px;background:#fff8e1;border:1px dashed #f5bc00;border-radius:8px;font-size:11.5px;color:#555">
<strong>📬 Intended recipients (${recipients.length})</strong> — Resend's sandbox sender can currently only deliver this one copy, to you. Copy the list below into your email client's To/Bcc field and forward/paste the rest of this message to send it yourself; once a real sending domain is verified with Resend, every recipient gets their own copy automatically and this block goes away.<br>
<span style="font-family:ui-monospace,Menlo,monospace">${recipients.map(escapeHtml).join(', ')}</span>
</div>` : '';

  const classRows = CLASS_ORDER.map(k => {
    const c = group.completion[k];
    const extra = [c.inProgress ? `${c.inProgress} in progress` : null, c.notStarted ? `${c.notStarted} not started` : null, c.na ? `${c.na} n/a` : null]
      .filter(Boolean).join(' · ');
    return `<tr><td style="padding:4px 12px 4px 0"><strong>${CLASS_LABELS[k]}</strong></td>` +
      `<td style="padding:4px 12px">${c.complete}/${c.total} complete</td>` +
      `<td style="padding:4px">${extra}</td></tr>`;
  }).join('');

  const openList = (group.openFoodCond || []).map(s => `<li>${s.name || s.loc}</li>`).join('');
  const worstList = (group.fob.worstStores || []).map(s => `<li>${s.name || s.loc}: +${s.gapPP}pp over target</li>`).join('');
  // dispatch #224 Task 6 — per-store detail, EVERY store in the group (decision 2: full detail
  // everywhere, not just District's own worst-5).
  const storesHtml = (group.stores || []).map(storeSectionHtml).join('');

  const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:600px">
<h2 style="margin:0 0 4px">${levelLabel} EOM Digest — ${group.label}</h2>
${recipientsBlock}
<p style="margin:0 0 16px;color:#555">${group.storeCount} store${group.storeCount === 1 ? '' : 's'}${group.daysLeft != null ? ` · ${group.daysLeft} day${group.daysLeft === 1 ? '' : 's'} left in the count window` : ''}</p>
<p style="margin:0 0 12px;font-weight:600">${group.headline}</p>
<table style="border-collapse:collapse;margin-bottom:16px">${classRows}</table>
${openList ? `<h3 style="margin:0 0 8px">Still open — Food/Condiment</h3><ul style="margin:0 0 12px;padding-left:20px">${openList}</ul>` : ''}
${group.uncountedValue ? `<p style="margin:0 0 12px">Open uncounted-item risk: ${money(group.uncountedValue)} (from each store's most recent fired notification this period — a store that hasn't fired one yet reads $0 here, which is "not yet observed," not "confirmed clean").</p>` : ''}
${group.fob.nWithFobData ? `<h3 style="margin:16px 0 8px">FOB vs target</h3>
<p style="margin:0 0 8px">Avg gap ${group.fob.avgGapPP != null ? `${group.fob.avgGapPP > 0 ? '+' : ''}${group.fob.avgGapPP}pp` : '—'} across ${group.fob.nWithFobData} store${group.fob.nWithFobData === 1 ? '' : 's'} with fresh FOB data — ${group.fob.overTargetCount} over target, ${group.fob.underTargetCount} at/under.</p>
${worstList ? `<ul style="margin:0 0 4px;padding-left:20px">${worstList}</ul>` : ''}` : ''}
${group.stores && group.stores.length ? `<h3 style="margin:20px 0 4px;border-top:2px solid #ccc;padding-top:12px">Per-store detail</h3>${storesHtml}` : ''}
</div>`;

  return { subject, html };
}

export async function sendDigestEmail(group, level) {
  const recipients = await recipientsFor(level, group.key, group.stores || []);
  const { subject, html } = buildDigestEmailContent(group, level, recipients);
  const results = await Promise.all(recipients.map(to => postResend({ to, subject, html })));
  return results.every(Boolean);
}
