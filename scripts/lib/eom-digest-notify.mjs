// scripts/lib/eom-digest-notify.mjs — dispatch #215 Task 3: roll-up digest email content + send.
//
// Sibling to resend-notify.mjs, matching how #211/#213 split notification CONTENT+SEND into a
// small, independently-testable lib imported by both the real pull script and its own unit
// tests. Reuses postResend()/EMAIL_TO from resend-notify.mjs (dispatch #215 exported postResend
// for exactly this reuse) rather than a second Resend POST implementation.
import { postResend, EMAIL_TO } from './resend-notify.mjs';

const CLASS_ORDER = ['food', 'condiment', 'paper', 'nonproduct'];
const CLASS_LABELS = { food: 'Food', condiment: 'Condiment', paper: 'Paper', nonproduct: 'Non-Product' };
const LEVEL_LABELS = { district: 'District', org: 'Market', patch: 'Patch' };

const money = (n) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n || 0)).toLocaleString('en-US');

// dispatch #215 Task 3 — for now EVERY (level, group) resolves to the owner's own email, matching
// his own "we can test through my email for now" and Resend's existing sandbox-sender restriction
// (deliver only to the account's own address until the domain is verified — no new blocker, #211
// already lives with this same restriction). Kept as a function keyed by (level, groupKey) — not
// a bare constant — so real per-role delivery later (a Supervisor's own digest reaching THEIR own
// inbox) is a body swap here once Resend's domain is verified AND this app has a real per-user
// contact registry (neither exists yet), not a rewrite of the send path. `groupKey` is unused
// today but kept in the signature for that reason.
export function recipientFor(level, groupKey) {
  return EMAIL_TO;
}

// One roll-up GROUP (buildEomDigest()'s per-group shape, src/engine/eom-digest.js) -> one email.
export function buildDigestEmailContent(group, level) {
  const levelLabel = LEVEL_LABELS[level] || level;
  const subject = `Meridian — ${levelLabel} EOM Digest: ${group.label}`;

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

  const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:600px">
<h2 style="margin:0 0 4px">${levelLabel} EOM Digest — ${group.label}</h2>
<p style="margin:0 0 16px;color:#555">${group.storeCount} store${group.storeCount === 1 ? '' : 's'}${group.daysLeft != null ? ` · ${group.daysLeft} day${group.daysLeft === 1 ? '' : 's'} left in the count window` : ''}</p>
<p style="margin:0 0 12px;font-weight:600">${group.headline}</p>
<table style="border-collapse:collapse;margin-bottom:16px">${classRows}</table>
${openList ? `<h3 style="margin:0 0 8px">Still open — Food/Condiment</h3><ul style="margin:0 0 12px;padding-left:20px">${openList}</ul>` : ''}
${group.uncountedValue ? `<p style="margin:0 0 12px">Open uncounted-item risk: ${money(group.uncountedValue)} (from each store's most recent fired notification this period — a store that hasn't fired one yet reads $0 here, which is "not yet observed," not "confirmed clean").</p>` : ''}
${group.fob.nWithFobData ? `<h3 style="margin:16px 0 8px">FOB vs target</h3>
<p style="margin:0 0 8px">Avg gap ${group.fob.avgGapPP != null ? `${group.fob.avgGapPP > 0 ? '+' : ''}${group.fob.avgGapPP}pp` : '—'} across ${group.fob.nWithFobData} store${group.fob.nWithFobData === 1 ? '' : 's'} with fresh FOB data — ${group.fob.overTargetCount} over target, ${group.fob.underTargetCount} at/under.</p>
${worstList ? `<ul style="margin:0 0 4px;padding-left:20px">${worstList}</ul>` : ''}` : ''}
</div>`;

  return { subject, html };
}

export async function sendDigestEmail(group, level) {
  const { subject, html } = buildDigestEmailContent(group, level);
  const to = recipientFor(level, group.key);
  return postResend({ to, subject, html });
}
