// Meridian — Equipment Survey edge function (Phase 2, Equipment Profile project).
// Public, no-login gateway for the crew walkthrough share link. Unlike eom-share, this link is not
// scoped to one store or period — the SAME token works for all 27 stores — and needs real multi-
// field writes (not just an acknowledge flag), per the Phase 2 design agreed with the owner
// 2026-10-19. The public page never touches equipment_catalog / equipment_survey_entries directly;
// this function validates the token server-side (service role) and is the only gateway.
//
// Routes (token in the JSON body):
//   { token }                              → { catalog, ok }  (full catalog, for the dropdown)
//   { token, action:"entries", loc }       → current entries for one store (latest per instance_id,
//                                             excluding any whose latest action is "removed")
//   { token, action:"submit", entry }      → append one equipment_survey_entries row
//   { token, action:"add_catalog_item", item } → crew "type it in" escape hatch: inserts a new
//                                             equipment_catalog row with flagged=true, source='crew-added'
//   { token, action:"recipients", loc }    → candidate email recipients for a store (Review &
//                                             Share, owner request 2026-10-19): the store's
//                                             current GM (resolved server-side from the live
//                                             gmAssignments timeline in org_config, same data
//                                             management.js's GmAssignmentsEditor writes and
//                                             src/features/morning-brief.js's whoIsGM() reads)
//                                             plus the owner as a standing fallback recipient.
//   { token, action:"email", loc, submittedBy, recipients } → re-fetches the store's own current
//                                             entries server-side (never trusts whatever the
//                                             client had in memory), builds the same rollup the
//                                             client's Review & Share screen shows, and emails it
//                                             via Resend to each validated recipient address.
//
// Deploy: supabase functions deploy equipment-survey --no-verify-jwt   (public, so no JWT)
// Also needs its OWN Resend secret set (separate store from GitHub Action secrets):
//   supabase secrets set RESEND_API_KEY=<same key scripts/lib/resend-notify.mjs uses>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  latestEntriesByInstance, resolveStoreGM, buildEquipmentRollupRows, buildEquipmentRollupText,
} from '../../../src/engine/equipment-survey.js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_URL = 'https://api.resend.com/emails';
const RESEND_FROM = 'Meridian <onboarding@resend.dev>'; // same shared Resend sender resend-notify.mjs uses
const OWNER_CONTACT = { name: 'Fletcher (Owner)', email: 'fletcher.reaves@mcreaves.com' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clean(s: unknown, max = 500): string {
  return String(s ?? '').trim().slice(0, max);
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const b = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const token = clean(b.token, 100);
    const action = clean(b.action, 40);
    if (!UUID_RE.test(token)) return json({ error: 'invalid link' }, 400);

    const { data: link, error: linkErr } = await sb.from('equipment_survey_links').select('*').eq('token', token).maybeSingle();
    if (linkErr) return json({ error: 'lookup failed' }, 500);
    if (!link) return json({ error: 'This link was not found.' }, 404);
    if (link.revoked) return json({ error: 'This link has been turned off.' }, 410);

    // Best-effort view telemetry, fire-and-forget (matches eom-share's own pattern).
    sb.from('equipment_survey_links').update({ view_count: (link.view_count || 0) + 1, last_viewed_at: new Date().toISOString() }).eq('token', token).then(() => {});

    if (action === 'entries') {
      const loc = clean(b.loc, 20);
      if (!loc) return json({ error: 'loc required' }, 400);
      const { data: rows, error } = await sb.from('equipment_survey_entries')
        .select('*').eq('loc', loc).order('submitted_at', { ascending: false });
      if (error) return json({ error: 'lookup failed' }, 500);
      return json({ ok: true, entries: latestEntriesByInstance(rows || []) });
    }

    if (action === 'submit') {
      const e = b.entry || {};
      const loc = clean(e.loc, 20);
      if (!loc) return json({ error: 'loc required' }, 400);
      const catalogItemId = e.catalogItemId && UUID_RE.test(String(e.catalogItemId)) ? e.catalogItemId : null;
      const manualText = clean(e.manualEntryText, 300);
      if (!catalogItemId && !manualText) return json({ error: 'catalogItemId or manualEntryText required' }, 400);
      const instanceId = (e.instanceId && UUID_RE.test(String(e.instanceId))) ? e.instanceId : crypto.randomUUID();
      const row = {
        loc,
        instance_id: instanceId,
        catalog_item_id: catalogItemId,
        manual_entry_text: catalogItemId ? null : manualText,
        placement_zone: clean(e.placementZone, 60) || null,
        serial_number: clean(e.serialNumber, 100) || null,
        cert_date: e.certDate ? clean(e.certDate, 20) : null,
        action: ['added', 'corrected', 'removed'].includes(e.action) ? e.action : 'added',
        submitted_by: clean(e.submittedBy, 100) || null,
        photo_url: clean(e.photoUrl, 500) || null,
        ai_extraction: e.aiExtraction && typeof e.aiExtraction === 'object' ? e.aiExtraction : null,
        position_detail: e.positionDetail && typeof e.positionDetail === 'object' ? {
          side: ['side1_right', 'side1_left', 'side2_right', 'side2_left'].includes(e.positionDetail.side) ? e.positionDetail.side : null,
          relative: ['same_as_grill', 'opposite_of_grill'].includes(e.positionDetail.relative) ? e.positionDetail.relative : null,
        } : null,
      };
      const { data: inserted, error } = await sb.from('equipment_survey_entries').insert(row).select('id,instance_id').single();
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, id: inserted.id, instanceId: inserted.instance_id });
    }

    if (action === 'recipients') {
      const loc = clean(b.loc, 20);
      if (!loc) return json({ error: 'loc required' }, 400);
      const { data: cfg, error: cfgErr } = await sb.from('org_config').select('data').eq('key', 'app_settings').maybeSingle();
      if (cfgErr) return json({ error: 'lookup failed' }, 500);
      const gmAssignments = Array.isArray(cfg?.data?.gmAssignments) ? cfg.data.gmAssignments : [];
      const gm = resolveStoreGM(gmAssignments, loc);
      return json({ ok: true, gm: (gm && gm.email) ? gm : null, owner: OWNER_CONTACT });
    }

    if (action === 'email') {
      const loc = clean(b.loc, 20);
      if (!loc) return json({ error: 'loc required' }, 400);
      const submittedBy = clean(b.submittedBy, 100);
      const recipients = [...new Set((Array.isArray(b.recipients) ? b.recipients : [])
        .map((r: unknown) => clean(r, 200)).filter((r: string) => EMAIL_RE.test(r)))].slice(0, 10);
      if (!recipients.length) return json({ error: 'At least one valid recipient email is required.' }, 400);
      const apiKey = Deno.env.get('RESEND_API_KEY');
      if (!apiKey) return json({ error: 'Email sending is not configured yet (RESEND_API_KEY missing) — ask the owner to set it.' }, 500);

      const [entR, catR] = await Promise.all([
        sb.from('equipment_survey_entries').select('*').eq('loc', loc).order('submitted_at', { ascending: false }),
        sb.from('equipment_catalog').select('id,type,manufacturer,model'),
      ]);
      if (entR.error) return json({ error: 'lookup failed' }, 500);
      const entries = latestEntriesByInstance(entR.data || []);
      const catalogById: Record<string, unknown> = {};
      for (const c of (catR.data || [])) catalogById[(c as { id: string }).id] = c;
      const storeLabel = loc; // the edge function has no STORE_NAMES map; the loc code is still unambiguous
      const rows = buildEquipmentRollupRows(entries, catalogById);
      const text = buildEquipmentRollupText(storeLabel, rows);
      const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:560px">
<p style="margin:0 0 10px;color:#555">${submittedBy ? `Submitted by ${escapeHtml(submittedBy)} via` : 'From'} the Meridian Equipment Survey.</p>
<pre style="white-space:pre-wrap;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;background:#f5f5f5;border:1px solid #ddd;border-radius:6px;padding:12px">${escapeHtml(text)}</pre>
</div>`;

      let sent = 0; const errors: string[] = [];
      for (const to of recipients) {
        try {
          const resp = await fetch(RESEND_URL, {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: RESEND_FROM, to: [to], subject: `Equipment Survey — Store ${storeLabel}`, html }),
          });
          if (resp.ok) sent++; else errors.push(`${to}: ${resp.status}`);
        } catch (e) { errors.push(`${to}: ${String((e as Error)?.message || e)}`); }
      }
      if (!sent) return json({ error: `Send failed for all recipient(s): ${errors.join('; ')}` }, 502);
      return json({ ok: true, sent, errors: errors.length ? errors : undefined });
    }

    if (action === 'add_catalog_item') {
      const item = b.item || {};
      const type = clean(item.type, 60);
      const manufacturer = clean(item.manufacturer, 100);
      const model = clean(item.model, 200);
      if (!type || !manufacturer || !model) return json({ error: 'type, manufacturer, model required' }, 400);
      const { data: inserted, error } = await sb.from('equipment_catalog').insert({
        type, manufacturer, model,
        flagged: true, source: 'crew-added',
        created_by: clean(item.submittedBy, 100) || null,
      }).select('id').single();
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, id: inserted.id });
    }

    // Default: full catalog (for the dropdown) plus its consumables (so the form can show "this
    // item takes WRIN X" context, useful even before Phase 1's cross-reference feature ships).
    const [catR, conR] = await Promise.all([
      sb.from('equipment_catalog').select('id,type,manufacturer,model,model_aliases,needs_serial,needs_cert_date,flagged'),
      sb.from('equipment_catalog_consumables').select('catalog_item_id,consumable_type,wrin,label'),
    ]);
    if (catR.error) return json({ error: 'lookup failed' }, 500);
    return json({ ok: true, catalog: catR.data || [], consumables: conR.data || [] });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
