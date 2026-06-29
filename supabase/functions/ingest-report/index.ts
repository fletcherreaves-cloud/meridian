// Meridian — QSRSoft Email Ingest Edge Function
// Receives an Excel report file (from Google Apps Script Gmail poller),
// stores it in Supabase Storage, and creates a pending_reports record
// so Meridian picks it up and parses it client-side on next login.
//
// Auth: X-Ingest-Secret header must match INGEST_SECRET env var.
// Deploy: supabase functions deploy ingest-report
// Secrets: supabase secrets set INGEST_SECRET=<your-uuid>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const INGEST_SECRET        = Deno.env.get('INGEST_SECRET')!;

// Filename → report type (mirrors detectType logic in parsers/index.js)
function detectReportType(filename: string): string {
  const fn = filename.toLowerCase();
  if (fn.includes('sales ledger'))    return 'sales-ledger';
  if (fn.includes('daily glimpse'))   return 'daily-glimpse';
  if (fn.includes('cash sheet'))      return 'cash-sheet';
  if (fn.includes('labor exception')) return 'labor-exceptions';
  if (fn.includes('labor analysis'))  return 'labor';
  if (fn.includes('operations report')) return 'ops_report';
  return 'unknown';
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-ingest-secret, x-file-name, content-type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Auth: require matching ingest secret
  const secret = req.headers.get('X-Ingest-Secret');
  if (!INGEST_SECRET || secret !== INGEST_SECRET) {
    console.warn('[ingest-report] Unauthorized — bad or missing X-Ingest-Secret');
    return new Response('Unauthorized', { status: 401 });
  }

  const filename = req.headers.get('X-File-Name') || 'report.xlsx';
  const source   = req.headers.get('X-Source')    || 'email';

  const bytes = await req.arrayBuffer();
  if (!bytes.byteLength) {
    return new Response('Empty file', { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const reportType = detectReportType(filename);

  // Path: YYYY-MM-DD/filename (upsert so duplicate sends don't stack up)
  const dateStr = new Date().toISOString().slice(0, 10);
  const storagePath = `${dateStr}/${filename}`;

  const { error: uploadError } = await supabase.storage
    .from('qsr-reports')
    .upload(storagePath, bytes, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: true,
    });

  if (uploadError) {
    console.error('[ingest-report] Storage upload failed:', uploadError);
    return new Response(JSON.stringify({ error: uploadError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Upsert pending_reports row — on conflict (same path) just reset processed flag
  const { error: dbError } = await supabase
    .from('pending_reports')
    .upsert({
      filename,
      storage_path: storagePath,
      report_type:  reportType,
      source,
      processed:    false,
      processed_at: null,
    }, { onConflict: 'storage_path' });

  if (dbError) {
    console.warn('[ingest-report] DB insert error (non-fatal):', dbError);
  }

  console.log(`[ingest-report] ✓ ${filename} → ${storagePath} (${reportType})`);

  return new Response(
    JSON.stringify({ ok: true, path: storagePath, type: reportType }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
