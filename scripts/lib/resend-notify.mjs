// scripts/lib/resend-notify.mjs — Resend email + SMS-via-carrier-gateway delivery (dispatch #211)
//
// Wires real delivery into the FUTURE HOOK dispatch #209 left in
// scripts/qsrsoft-onhand-pull.mjs (search that file for "FUTURE HOOK"). Both functions POST to
// the SAME Resend API (https://api.resend.com/emails) with different recipients/formatting —
// "SMS" here is a short plain-text email sent through the AT&T email-to-SMS gateway
// (3346722598@txt.att.net), per the owner's own framing ("email and SMS" = one Resend
// integration, two sends). No Twilio, no second provider.
//
// Neither send function throws on a delivery failure — matching this file's own sibling
// insert-error pattern in qsrsoft-onhand-pull.mjs (console.warn + continue, never crash the
// whole pull run over a non-critical side effect). No retry within the run (dispatch #211 Task
// 1.3) — a known gap, not something to build here; the next scheduled run's own fire-once guard
// (notified_classes on eom_count_status) prevents a duplicate DETECTION, but a failed SEND for
// an already-fired notification currently has no retry path.
//
// Kept as a standalone lib (rather than inline in qsrsoft-onhand-pull.mjs) so the request-shape
// and content-building logic can be unit tested with a mocked fetch, and so the future smoke-test
// script (scripts/test-eom-notification-send.mjs) can import the exact same functions the real
// pull run calls — one implementation, two callers.

const RESEND_URL = 'https://api.resend.com/emails';
const RESEND_FROM = 'Meridian <onboarding@resend.dev>'; // Resend's shared sender — no domain verified yet
export const EMAIL_TO = 'fletcher.reaves@mcreaves.com';
export const SMS_TO = '3346722598@txt.att.net'; // AT&T email-to-SMS gateway

const CLASS_ORDER = ['food', 'condiment', 'paper', 'nonproduct'];
const CLASS_LABELS = { food: 'Food', condiment: 'Condiment', paper: 'Paper', nonproduct: 'Non-Product' };
const STATUS_LABELS = { complete: 'Complete', in_progress: 'In Progress', not_started: 'Not Started', not_applicable: 'N/A' };

const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const pctOf = (cs) => (cs && cs.pct != null) ? `${Math.round(cs.pct * 100)}%` : '—';

// dispatch #213 Task 3 — FOB + components section, matching src/engine/fob-report.js's own
// money()/pp() formatting conventions verbatim (that file's consts aren't exported, so mirrored
// here rather than diverging on a third format for the same data — pp() rounds a FRACTION to
// percentage-points at 2dp, money() signs negatives as "-$N" not "$-N").
const fobPp = (f) => Math.round((f || 0) * 10000) / 100;
const fobMoney = (n) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n || 0)).toLocaleString('en-US');
// Same order/labels as fob-report.js's own COMPONENTS — the six components fobSnapshotByStore
// (eom-inventory.js) returns per store.
const FOB_COMPONENTS = [
  ['statv', 'Variance Stat'], ['comp', 'Completed Waste'], ['raw', 'Raw Waste'],
  ['cond', 'Condiments'], ['emp', 'Emp/Mgr Meals'], ['unex', 'Unexplained'],
];

// Renders nothing when row.fob_snapshot is absent (stale/missing FOB pull, per the owner's
// freshness rule) — no caveat, no placeholder header, just skip the section entirely.
//
// dispatch #215 Task 1 — row.fob_target (buildFobTargetReport()'s output from
// qsrsoft-onhand-pull.mjs, reusing fob-report.js's own comps/overTarget/gapPP/topDriver math —
// no target math re-derived here) adds target-vs-actual alongside each number when present;
// absent (no resolvable target for this store/period) falls back to the actual-only rendering
// #213 shipped, unchanged.
function fobSectionHtml(row) {
  const fs = row.fob_snapshot;
  if (!fs) return '';
  const tgt = row.fob_target || null;
  const headlinePct = fs.fobPct != null ? `${fobPp(fs.fobPct)}%` : '—';
  const targetLine = tgt && tgt.fobPct != null
    ? ` <span style="color:#666">(target ${fobPp(tgt.fobPct)}%, ${tgt.gapPP > 0 ? '+' : ''}${tgt.gapPP}pp ${tgt.overTarget ? 'OVER' : 'under'})</span>`
    : '';
  const compByKey = new Map((tgt?.comps || []).map(c => [c.key, c]));
  const compLines = FOB_COMPONENTS.map(([k, label]) => {
    const c = compByKey.get(k);
    const targetBit = c && c.tgtPP != null
      ? ` <span style="color:#666">(target ${c.tgtPP}%, ${c.deltaPP > 0 ? '+' : ''}${c.deltaPP}pp)</span>`
      : '';
    return `<li>${label}: ${fobMoney(fs[k])}${targetBit}</li>`;
  }).join('');
  return `<h3 style="margin:16px 0 8px">FOB (Food Over Base)</h3>
<p style="margin:0 0 8px">${headlinePct} of sales${targetLine} — ${fobMoney(fs.fob)} total${fs.asOf ? ` (as of ${fs.asOf})` : ''}</p>
<ul style="margin:0 0 4px;padding-left:20px">${compLines}</ul>`;
}

// 'food_condiment' -> 'Food + Condiment', 'paper' -> 'Paper'
export function triggerLabel(triggerKind) {
  return String(triggerKind || '')
    .split('+').flatMap(k => k.split('_'))
    .map(k => CLASS_LABELS[k] || k)
    .join(' + ');
}

function storeLabel(storeInfo) {
  const loc = storeInfo?.loc || '';
  const name = storeInfo?.name;
  return name && name !== loc ? `${name} (${loc})` : String(loc);
}

// ── Email body (HTML) — full 4-class snapshot + top uncounted items + KB links ────────────────
export function buildEmailContent(row, storeInfo) {
  const label = storeLabel(storeInfo);
  const trig = triggerLabel(row.trigger_kind);
  const subject = `Meridian — ${label}: ${trig} count complete`;

  const classRows = CLASS_ORDER.map(cls => {
    const cs = row.class_statuses?.[cls];
    const status = cs ? (STATUS_LABELS[cs.status] || cs.status) : 'N/A';
    return `<tr><td style="padding:4px 12px 4px 0"><strong>${CLASS_LABELS[cls]}</strong></td>` +
      `<td style="padding:4px 12px">${status}</td><td style="padding:4px">${pctOf(cs)}</td></tr>`;
  }).join('');

  const ui = row.uncounted_items || { items: [], totalCount: 0, totalValue: 0, truncated: false };
  const topItems = (ui.items || []).slice(0, 10);
  const itemLines = topItems.length
    ? topItems.map(it => `<li>${it.descr ? `${it.descr} (${it.wrin})` : it.wrin}${it.cls ? ` [${CLASS_LABELS[it.cls] || it.cls}]` : ''} — ${money(it.valueAtRisk)}</li>`).join('')
    : '<li>None — nothing outstanding for the triggering class(es).</li>';
  const moreNote = ui.totalCount > topItems.length
    ? `<p>Showing top ${topItems.length} of ${ui.totalCount} uncounted item(s), ${money(ui.totalValue)} total at risk.</p>`
    : (ui.totalCount ? `<p>Total: ${ui.totalCount} item(s), ${money(ui.totalValue)} at risk.</p>` : '');

  const links = (row.kb_links || []).map(l => `<li><a href="${l.url}">${l.title}</a></li>`).join('');

  const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:560px">
<h2 style="margin:0 0 4px">${label}</h2>
<p style="margin:0 0 16px;color:#555">EOM count update — <strong>${trig}</strong> just finished (${row.period}).</p>
<table style="border-collapse:collapse;margin-bottom:16px">${classRows}</table>
<h3 style="margin:0 0 8px">Uncounted items — ${trig}</h3>
<ul style="margin:0 0 4px;padding-left:20px">${itemLines}</ul>
${moreNote}
${fobSectionHtml(row)}
${links ? `<h3 style="margin:16px 0 8px">Helpful links</h3><ul style="padding-left:20px">${links}</ul>` : ''}
</div>`;

  return { subject, html };
}

// ── SMS body (carrier email-to-SMS gateway) — short plain text, no HTML, no links ─────────────
export function buildSmsBody(row, storeInfo) {
  const label = storeInfo?.name || storeInfo?.loc || '';
  const trig = triggerLabel(row.trigger_kind);
  const ui = row.uncounted_items || { totalCount: 0, totalValue: 0 };

  // Pick the single most decision-relevant status line: the trigger class(es)' own status,
  // since that's what just happened — the other classes' detail belongs in the email, not a text.
  const trigClasses = String(row.trigger_kind || '').split('+').flatMap(k => k.split('_')).filter(k => CLASS_LABELS[k]);
  const statusBits = trigClasses.map(cls => {
    const cs = row.class_statuses?.[cls];
    return `${CLASS_LABELS[cls]} ${STATUS_LABELS[cs?.status] || '—'}${cs?.pct != null ? ` (${pctOf(cs)})` : ''}`;
  }).join(', ');

  let body = `Meridian: ${label} — ${trig} complete. ${statusBits}.`;
  if (ui.totalCount) body += ` ${ui.totalCount} item(s) left (${money(ui.totalValue)}).`;
  // Hard cap ~300 chars per dispatch #211 Task 1.2 — carrier gateways often truncate/reject long text.
  return body.length > 300 ? body.slice(0, 297) + '...' : body;
}

// Exported (dispatch #215 Task 3) so scripts/lib/eom-digest-notify.mjs's roll-up digest send
// reuses the exact same Resend POST implementation rather than a second copy.
export async function postResend({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[resend-notify] RESEND_API_KEY not set — skipping send to', to);
    return false;
  }
  const payload = { from: RESEND_FROM, to: [to], subject };
  if (html) payload.html = html; else payload.text = text;
  try {
    const resp = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      let detail = '';
      try { detail = await resp.text(); } catch { /* ignore */ }
      console.warn(`[resend-notify] Resend API returned ${resp.status} for ${to}: ${detail}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[resend-notify] Resend send to ${to} threw: ${e.message}`);
    return false;
  }
}

// row: an eom_count_notifications row shape from buildNotificationRow() (trigger_kind,
// class_statuses, uncounted_items, kb_links). storeInfo: { loc, name }.
export async function sendEmailNotification(row, storeInfo) {
  const { subject, html } = buildEmailContent(row, storeInfo);
  return postResend({ to: EMAIL_TO, subject, html });
}

export async function sendSmsViaCarrierGateway(row, storeInfo) {
  const body = buildSmsBody(row, storeInfo);
  // Carrier gateways are picky — no subject line beyond something minimal, plain text body.
  return postResend({ to: SMS_TO, subject: 'Meridian', text: body });
}
