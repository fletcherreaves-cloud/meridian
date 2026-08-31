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

// dispatch #214 — the six FOB investigation-tool links (row.fob_tool_links, built by
// qsrsoft-onhand-pull.mjs's fobToolLinks()) as their own visually distinct "Investigate further"
// sub-section directly under the FOB components — NOT mixed into the existing "Helpful links"
// block at the bottom of the email (buildEmailContent()'s own row.kb_links rendering, untouched).
// Renders nothing (no header, no placeholder) when the array is empty or absent — same
// no-caveat-no-placeholder discipline as fobSectionHtml() itself.
function fobToolLinksHtml(links) {
  if (!links || !links.length) return '';
  const items = links.map(l => `<li><a href="${l.url}">${l.title}</a></li>`).join('');
  return `<h4 style="margin:12px 0 6px;font-size:13px;color:#444">Investigate further</h4>
<ul style="margin:0 0 4px;padding-left:20px;font-size:13px">${items}</ul>`;
}

// dispatch #215 Task 1 — row.fob_target (buildFobTargetReport()'s output from
// qsrsoft-onhand-pull.mjs, reusing fob-report.js's own comps/overTarget/gapPP/topDriver math —
// no target math re-derived here) adds target-vs-actual alongside each number when present;
// absent (no resolvable target for this store/period) falls back to the actual-only rendering
// #213 shipped, unchanged.
//
// dispatch #219 Task 2 — owner: "add the result as a percent also... present this section as a
// table." The per-component breakdown is now an HTML <table> (Component | Actual $ | Actual % |
// Target % | Δ) instead of a <ul>; the headline paragraph above it is untouched prose. Actual %
// is `c.actualPP` off row.fob_target.comps[i] — already computed by buildStoreFobReport() the
// same way the headline % is, never re-derived here. Judgment call: when row.fob_target is
// itself entirely absent (#215's "no resolvable target" case), there is no comps array to read
// actualPP from at all, yet the owner's ask ("Actual $ AND Actual %") still applies in that case
// too (see this dispatch's own verification bar) — so `actualFrac` falls back to fs[k]/fs.sales,
// literally the same fraction buildFobTargetReport() itself feeds into buildStoreFobReport() as
// compActual (qsrsoft-onhand-pull.mjs), just evaluated here instead of there, through this file's
// own existing fobPp() rounding (already used for the headline %) rather than a divergent
// formula. Target %/Δ still show "—" in that case — those genuinely don't exist without a target.
// dispatch #224 Task 6 — the headline paragraph + 5-column table extracted out of fobSectionHtml()
// below into its own function, taking `fs`/`tgt` directly rather than a wrapping `row`, so it's
// callable per-store inside the EOM Digest roll-up's loop over group.stores (eom-digest-notify.mjs)
// as well as here for the single-store #213 notification email. Checked before extracting: the two
// contexts want the IDENTICAL table (same fs/tgt shape, same columns, per decision 2 — full detail
// everywhere, no leaner rollup variant) — no divergence to force apart, so extraction is the clean
// call, not a stretch. Returns '' when `fs` is absent (no fresh FOB snapshot), matching
// fobSectionHtml()'s own no-caveat-no-placeholder discipline.
// `countComplete` (dispatch #224 follow-up, owner feedback): whether THIS store's own count is
// finished yet. A store still finishing its count still has whatever FOB snapshot exists for
// this period — show it captioned "count in progress" instead of the caller hiding the whole
// section until completion (the #213 single-store caller doesn't pass this — it never gated on
// count completion in the first place, only on fs itself being present).
export function fobComponentsTableHtml(fs, tgt, countComplete) {
  if (!fs) return '';
  const headlinePct = fs.fobPct != null ? `${fobPp(fs.fobPct)}%` : '—';
  const targetLine = tgt && tgt.fobPct != null
    ? ` <span style="color:#666">(target ${fobPp(tgt.fobPct)}%, ${tgt.gapPP > 0 ? '+' : ''}${tgt.gapPP}pp ${tgt.overTarget ? 'OVER' : 'under'})</span>`
    : '';
  const caveat = countComplete === false ? ' <span style="color:#a60">(count in progress, not yet complete)</span>' : '';
  const compByKey = new Map((tgt?.comps || []).map(c => [c.key, c]));
  const cell = (s) => `<td style="padding:4px 10px 4px 0;border-bottom:1px solid #eee">${s}</td>`;
  const compRows = FOB_COMPONENTS.map(([k, label]) => {
    const c = compByKey.get(k);
    const actualPctStr = c && c.actualPP != null
      ? `${c.actualPP}%`
      : (fs.sales ? `${fobPp(fs[k] / fs.sales)}%` : '—');
    const tgtPctStr = c && c.tgtPP != null ? `${c.tgtPP}%` : '—';
    const deltaStr = c && c.deltaPP != null ? `${c.deltaPP > 0 ? '+' : ''}${c.deltaPP}pp` : '—';
    return `<tr>${cell(label)}${cell(fobMoney(fs[k]))}${cell(actualPctStr)}${cell(tgtPctStr)}` +
      `<td style="padding:4px 0;border-bottom:1px solid #eee">${deltaStr}</td></tr>`;
  }).join('');
  return `<p style="margin:0 0 8px">${headlinePct} of sales${targetLine} — ${fobMoney(fs.fob)} total${fs.asOf ? ` (as of ${fs.asOf})` : ''}${caveat}</p>
<table style="border-collapse:collapse;width:100%;font-size:13px;margin:0 0 4px">
<thead><tr style="text-align:left;border-bottom:2px solid #ccc">` +
`<th style="padding:4px 10px 4px 0">Component</th><th style="padding:4px 10px 4px 0">Actual $</th>` +
`<th style="padding:4px 10px 4px 0">Actual %</th><th style="padding:4px 10px 4px 0">Target %</th>` +
`<th style="padding:4px 0">Δ</th></tr></thead>
<tbody>${compRows}</tbody>
</table>`;
}

// Renders nothing when row.fob_snapshot is absent (stale/missing FOB pull, per the owner's
// freshness rule) — no caveat, no placeholder header, just skip the section entirely.
function fobSectionHtml(row) {
  const fs = row.fob_snapshot;
  if (!fs) return '';
  const table = fobComponentsTableHtml(fs, row.fob_target || null);
  return `<h3 style="margin:16px 0 8px">FOB (Food Over Base)</h3>
${table}
${fobToolLinksHtml(row.fob_tool_links)}`;
}

// 'food_condiment' -> 'Food + Condiment', 'paper' -> 'Paper'
// dispatch #228 — 'manual_resend' (scripts/eom-notification-resend.mjs's trigger_kind, tagging a
// manual "regenerate and resend" apart from an automated fire) is a special case, not a class
// name: the generic split-on-'_'-and-map-through-CLASS_LABELS below would render it as the raw
// words "manual + resend" (CLASS_LABELS has no entry for either), which is legible but reads as
// noise in the subject/body/push-title templates that all splice this straight in (e.g.
// "${trig} count complete"). Handled as its own literal case rather than adding fake 'manual'/
// 'resend' CLASS_LABELS entries, which would misleadingly suggest those are real inventory classes.
export function triggerLabel(triggerKind) {
  if (triggerKind === 'manual_resend') return 'Current Status';
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
