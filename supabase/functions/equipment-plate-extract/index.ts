// Meridian — Equipment Data-Plate Extract edge function (Phase 2, Equipment Profile project).
// Public, no-login gateway (same token as equipment-survey) that takes a photo of an equipment
// data plate and asks Claude to read it: model, serial number, manufacturer, and manufacture date
// when printed. Treated as AUTOFILL ONLY by the client — the crew member reviews/corrects every
// field before submitting, per the owner's own "never locked, always correctable" design for this
// whole form (chat, 2026-10-19). All AI calls in this app funnel through the same ANTHROPIC_API_KEY
// secret sage-chat already uses (see that function's own header) — this is a narrow new use of
// existing infrastructure, not a new vendor integration.
//
// Route: { token, imageBase64, mediaType } → { ok, extraction: {model,serial,manufacturer,
//         manufactureDate,confidenceNotes}, raw }   (raw kept for the ai_extraction audit column)
//
// Deploy: supabase functions deploy equipment-plate-extract --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_MEDIA = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);

const SYSTEM_PROMPT = `You are reading a manufacturer data plate photographed on restaurant kitchen equipment (a grill, toaster, fryer, or similar). Data plates are often stamped or embossed metal, sometimes with glare, wear, or an awkward angle — read it as carefully as you can, and say when you're not confident about a character.

Respond with ONLY a JSON object, no other text, in exactly this shape:
{"model": string|null, "serial": string|null, "manufacturer": string|null, "manufactureDate": string|null, "confidenceNotes": string}

- "model" is the model number (often labeled "MODEL", "MOD", or similar).
- "serial" is the serial number (often labeled "S/N", "SERIAL", or similar).
- "manufacturer" is the brand name on the plate, if visible.
- "manufactureDate" is a manufacture date or date code if printed, in whatever format it appears on the plate (don't guess a format).
- Use null for any field you cannot read or that isn't on the plate — never guess a value.
- "confidenceNotes" is one short sentence on anything a human reviewer should double-check (e.g. "serial number partially obscured by glare, last two digits uncertain").`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const b = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const token = String(b.token || '').trim();
    if (!UUID_RE.test(token)) return json({ error: 'invalid link' }, 400);

    const { data: link, error: linkErr } = await sb.from('equipment_survey_links').select('token,revoked').eq('token', token).maybeSingle();
    if (linkErr) return json({ error: 'lookup failed' }, 500);
    if (!link) return json({ error: 'This link was not found.' }, 404);
    if (link.revoked) return json({ error: 'This link has been turned off.' }, 410);

    const imageBase64 = String(b.imageBase64 || '');
    const mediaType = String(b.mediaType || 'image/jpeg');
    if (!imageBase64) return json({ error: 'imageBase64 required' }, 400);
    if (!ALLOWED_MEDIA.has(mediaType)) return json({ error: 'unsupported image type' }, 400);
    // Base64 inflates size ~1.33x; cap the decoded image around 8MB to keep the request fast and
    // avoid the Anthropic API's per-request payload limit.
    if (imageBase64.length > 11_000_000) return json({ error: 'image too large' }, 400);
    if (!ANTHROPIC_API_KEY) return json({ error: 'extraction not configured — ANTHROPIC_API_KEY missing' }, 500);

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-opus-5-5',
        max_tokens: 1024,
        output_config: { effort: 'low' },
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: 'Read this data plate and respond with the JSON object only.' },
          ],
        }],
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      return json({ error: `extraction failed (${res.status})`, detail: errText.slice(0, 300) }, 502);
    }
    const data = await res.json();
    const textBlock = (data.content || []).find((c: Record<string, unknown>) => c.type === 'text');
    const raw = textBlock ? String(textBlock.text || '') : '';
    let extraction: Record<string, unknown> | null = null;
    try {
      // Claude sometimes wraps JSON in a code fence despite the instruction — strip it before parsing.
      const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
      extraction = JSON.parse(stripped);
    } catch { /* leave null — client falls back to blank fields, raw is still returned for review */ }

    // Persist the photo too, regardless of whether extraction succeeded — it's the audit/fallback
    // record a human reviews later. Service role bypasses Storage RLS, so the anonymous share-link
    // client never needs its own storage write access; this function is the only upload path.
    let photoUrl: string | null = null;
    try {
      const ext = mediaType === 'image/png' ? 'png' : mediaType === 'image/webp' ? 'webp' : mediaType === 'image/heic' ? 'heic' : 'jpg';
      const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
      const bytes = Uint8Array.from(atob(imageBase64), c => c.charCodeAt(0));
      const { error: upErr } = await sb.storage.from('equipment-photos').upload(path, bytes, { contentType: mediaType, upsert: false });
      if (!upErr) photoUrl = path;
    } catch { /* photo persistence is best-effort — extraction result still returns either way */ }

    return json({ ok: true, extraction, raw, photoUrl });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
