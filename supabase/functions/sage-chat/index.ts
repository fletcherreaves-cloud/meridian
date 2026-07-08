// Meridian SAGE — Claude API proxy Edge Function v2 (tool use)
// Supports query_daily_activity and query_lifelenz_labor tools.
// Streaming-first: text deltas go to client immediately; tool calls run server-side.
// Deploy: supabase functions deploy sage-chat --no-verify-jwt
// Secrets: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY    = Deno.env.get('ANTHROPIC_API_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const STORE_NAMES: Record<string, string> = {
  '3708':  'Ardmore-Broadway',
  '5183':  'Chickasha-So 4th',
  '5985':  'Durant-US Hwy 70/22',
  '6178':  'Chipley-St Rd 77',
  '6838':  'Defuniak Springs',
  '6972':  'Ada-Country Club',
  '10034': 'Bonifay',
  '10422': 'Atoka-Mississippi',
  '10915': 'Seminole-Milt Phillips',
  '11657': 'Purcell',
  '13113': 'Madill-Hwy 70',
  '18213': 'Lindsay-Wal-Mart',
  '20475': 'OKC-I240/Sooner',
  '24471': 'Ardmore-Cooper/12th',
  '29760': 'Duncan-Hwy 81',
  '31357': 'Pauls Valley-Ballard Rd',
  '32525': 'Sulphur',
  '33109': 'Marietta',
  '33222': 'Elgin',
  '33704': 'Tecumseh',
  '34222': 'Harrah',
  '35064': 'Holdenville',
  '35242': 'Cottondale',
  '37566': 'Mossy Head',
  '38609': 'Freeport',
  '43380': 'Tishomingo-Main & Refuge',
  '43701': 'Ponce de Leon-Hwy 81/I-10',
};

const TOOLS = [
  {
    name: 'query_daily_activity',
    description: `Query live QSRSoft daily activity data from Meridian's database.
Use for any question about: sales performance, drive-thru (DT) speed, daily tracking,
store comparisons, pacing vs projection, or recent trends.
Returns aggregated results per store.
Date fields are YYYY-MM-DD. For "today" use today's date. For "yesterday" subtract 1 day.
DT speed is reported in seconds (avg service time per car). Target: <200s green, 200-240s amber, >240s red.`,
    input_schema: {
      type: 'object',
      properties: {
        start_date: {
          type: 'string',
          description: 'Start date YYYY-MM-DD (inclusive). Required.',
        },
        end_date: {
          type: 'string',
          description: 'End date YYYY-MM-DD (inclusive). Defaults to start_date for single-day queries.',
        },
        locs: {
          type: 'array',
          items: { type: 'string' },
          description: 'Store loc IDs to filter (e.g. ["29760","32525"]). Omit for all 27 stores.',
        },
      },
      required: ['start_date'],
    },
  },
  {
    name: 'query_lifelenz_labor',
    description: `Query LifeLenz scheduling data — scheduled vs needed labor hours by store and date.
Use for questions about: staffing gaps, over/under-scheduling, VLH (variable labor hours).
Returns per-store scheduled vs needed hours summary.`,
    input_schema: {
      type: 'object',
      properties: {
        start_date: {
          type: 'string',
          description: 'Start date YYYY-MM-DD (inclusive). Required.',
        },
        end_date: {
          type: 'string',
          description: 'End date YYYY-MM-DD (inclusive). Defaults to start_date.',
        },
        locs: {
          type: 'array',
          items: { type: 'string' },
          description: 'Store loc IDs to filter. Omit for all stores.',
        },
      },
      required: ['start_date'],
    },
  },
];

async function runTool(name: string, input: Record<string, unknown>): Promise<string> {
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  if (name === 'query_daily_activity') {
    const today = new Date().toISOString().slice(0, 10);
    const startDate = (input.start_date as string) || today;
    const endDate   = (input.end_date   as string) || startDate;
    const locs      = input.locs as string[] | undefined;

    let q = sb
      .from('qsr_daily_activity')
      .select('loc,dt,product_sales,proj_sales_dollars,dt_untilserve,dt_trans_cnt')
      .gte('dt', startDate)
      .lte('dt', endDate)
      .limit(100000);

    if (locs?.length) q = q.in('loc', locs);

    const { data, error } = await q;
    if (error) return `Database error: ${error.message}`;
    if (!data?.length) return `No sales data found for ${startDate}${endDate !== startDate ? ` to ${endDate}` : ''}. The data may not be available yet for this date range.`;

    // Aggregate by store
    const byStore: Record<string, {
      sales: number; proj: number; dtMs: number; dtTrans: number; days: Set<string>;
    }> = {};

    for (const row of data) {
      if (!byStore[row.loc]) byStore[row.loc] = { sales: 0, proj: 0, dtMs: 0, dtTrans: 0, days: new Set() };
      const s = byStore[row.loc];
      s.sales += row.product_sales || 0;
      s.proj  += row.proj_sales_dollars || 0;
      if ((row.dt_trans_cnt || 0) > 0) {
        s.dtMs    += row.dt_untilserve || 0;
        s.dtTrans += row.dt_trans_cnt;
      }
      s.days.add(row.dt);
    }

    const stores = Object.entries(byStore).map(([loc, s]) => ({
      loc,
      name:       STORE_NAMES[loc] || `Store ${loc}`,
      sales:      Math.round(s.sales),
      qsr_proj:   Math.round(s.proj),
      vs_proj_pct: s.proj > 0 ? +((s.sales / s.proj - 1) * 100).toFixed(1) : null,
      dt_avg_sec: s.dtTrans > 0 ? Math.round(s.dtMs / s.dtTrans / 1000) : null,
      days:       s.days.size,
    })).sort((a, b) => b.sales - a.sales);

    const totalSales = stores.reduce((s, r) => s + r.sales, 0);
    const totalProj  = stores.reduce((s, r) => s + r.qsr_proj, 0);

    return JSON.stringify({
      date_range: startDate === endDate ? startDate : `${startDate} to ${endDate}`,
      district_total_sales:    totalSales,
      district_total_proj:     totalProj,
      district_vs_proj_pct:    totalProj > 0 ? +((totalSales / totalProj - 1) * 100).toFixed(1) : null,
      stores,
      note: 'sales = product_sales (net sales). dt_avg_sec = seconds per car. Target <200s.',
    });
  }

  if (name === 'query_lifelenz_labor') {
    const today = new Date().toISOString().slice(0, 10);
    const startDate = (input.start_date as string) || today;
    const endDate   = (input.end_date   as string) || startDate;
    const locs      = input.locs as string[] | undefined;

    let q = sb
      .from('lifelenz_schedules')
      .select('loc,date,sch_vlh,need_vlh,sch_crew,need_crew')
      .gte('date', startDate)
      .lte('date', endDate)
      .limit(50000);

    if (locs?.length) q = q.in('loc', locs);

    const { data, error } = await q;
    if (error) return `Database error: ${error.message}`;
    if (!data?.length) return `No LifeLenz schedule data found for ${startDate}${endDate !== startDate ? ` to ${endDate}` : ''}.`;

    const byStore: Record<string, { schVLH: number; needVLH: number; days: number }> = {};
    for (const row of data) {
      if (!byStore[row.loc]) byStore[row.loc] = { schVLH: 0, needVLH: 0, days: 0 };
      const s = byStore[row.loc];
      s.schVLH  += row.sch_vlh  || 0;
      s.needVLH += row.need_vlh || 0;
      s.days++;
    }

    const stores = Object.entries(byStore).map(([loc, s]) => ({
      loc,
      name:         STORE_NAMES[loc] || `Store ${loc}`,
      sch_vlh:      +s.schVLH.toFixed(1),
      need_vlh:     +s.needVLH.toFixed(1),
      gap_vlh:      +(s.schVLH - s.needVLH).toFixed(1),
      avg_daily_gap: +(( s.schVLH - s.needVLH) / (s.days || 1)).toFixed(1),
      days:         s.days,
    })).sort((a, b) => Math.abs(b.gap_vlh) - Math.abs(a.gap_vlh));

    return JSON.stringify({
      date_range: startDate === endDate ? startDate : `${startDate} to ${endDate}`,
      stores,
      note: 'gap_vlh = sch_vlh - need_vlh. Positive = over-scheduled. Negative = under-staffed.',
    });
  }

  return `Unknown tool: ${name}`;
}

// Stream one Anthropic call. Forwards text_delta events to the SSE stream.
// Returns the full assistant content + stop_reason (for tool detection).
async function streamAnthropicCall(
  messages: unknown[],
  systemPrompt: string,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  withTools = true,
): Promise<{ stopReason: string; assistantContent: unknown[]; toolUses: Array<{ id: string; name: string; input: unknown }> }> {
  const body: Record<string, unknown> = {
    model: 'claude-opus-4-8',
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    system: systemPrompt,
    messages,
    stream: true,
  };
  if (withTools) body.tools = TOOLS;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic ${res.status}: ${errText}`);
  }

  const reader  = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  let stopReason = 'end_turn';
  const contentByIdx = new Map<number, Record<string, unknown>>();
  const toolUses: Array<{ id: string; name: string; inputJson: string }> = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw === '[DONE]') continue;

      try {
        const ev = JSON.parse(raw);

        if (ev.type === 'content_block_start') {
          const cb = ev.content_block || {};
          const block: Record<string, unknown> = { type: cb.type };
          if (cb.type === 'text')     { block.text = ''; }
          if (cb.type === 'thinking') { block.thinking = ''; }
          if (cb.type === 'tool_use') {
            block.id   = cb.id;
            block.name = cb.name;
            block.input = {};
            toolUses.push({ id: cb.id, name: cb.name, inputJson: '' });
          }
          contentByIdx.set(ev.index, block);
        }

        else if (ev.type === 'content_block_delta') {
          const block = contentByIdx.get(ev.index);
          const delta = ev.delta || {};
          if (delta.type === 'text_delta' && delta.text) {
            if (block) block.text = ((block.text as string) || '') + delta.text;
            // Forward to SSE client immediately
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: delta.text })}\n\n`));
          }
          if (delta.type === 'thinking_delta' && block) {
            block.thinking = ((block.thinking as string) || '') + (delta.thinking || '');
          }
          if (delta.type === 'input_json_delta' && toolUses.length) {
            toolUses[toolUses.length - 1].inputJson += delta.partial_json || '';
          }
        }

        else if (ev.type === 'content_block_stop') {
          const block = contentByIdx.get(ev.index);
          if (block?.type === 'tool_use' && toolUses.length) {
            const tu = toolUses[toolUses.length - 1];
            try { block.input = JSON.parse(tu.inputJson); } catch { block.input = {}; }
          }
        }

        else if (ev.type === 'message_delta') {
          stopReason = ev.delta?.stop_reason || stopReason;
        }

      } catch { /* malformed SSE event — skip */ }
    }
  }

  const assistantContent = Array.from(contentByIdx.entries())
    .sort(([a], [b]) => a - b)
    .map(([, block]) => block);

  const parsedToolUses = toolUses.map(tu => ({
    id: tu.id,
    name: tu.name,
    input: assistantContent.find(b => b.type === 'tool_use' && (b as Record<string, unknown>).id === tu.id)?.input || {},
  }));

  return { stopReason, assistantContent, toolUses: parsedToolUses };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST')   return new Response('Method not allowed', { status: 405, headers: CORS });

  if (!ANTHROPIC_API_KEY) {
    console.error('[sage-chat] ANTHROPIC_API_KEY not set');
    return new Response(JSON.stringify({ error: 'SAGE not configured — ANTHROPIC_API_KEY missing' }), {
      status: 503, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // Verify Supabase session
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return new Response('Unauthorized — session token required', { status: 401, headers: CORS });

  try {
    const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user }, error } = await sbAdmin.auth.getUser(token);
    if (error || !user) {
      console.warn('[sage-chat] Auth failed:', error?.message);
      return new Response('Unauthorized', { status: 401, headers: CORS });
    }
  } catch (e) {
    console.warn('[sage-chat] Auth check error:', e);
    return new Response('Unauthorized', { status: 401, headers: CORS });
  }

  let body: { messages: unknown[]; systemPrompt: string };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400, headers: CORS });
  }

  const { messages = [], systemPrompt = '' } = body;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let conversationMessages = [...messages];
        const MAX_TOOL_ROUNDS = 3;

        for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
          const isLastRound = round === MAX_TOOL_ROUNDS;

          const { stopReason, assistantContent, toolUses } = await streamAnthropicCall(
            conversationMessages,
            systemPrompt,
            controller,
            encoder,
            !isLastRound, // no tools on last round to force a text answer
          );

          if (stopReason !== 'tool_use' || !toolUses.length) break;

          // Execute each tool call and emit status events
          const toolResults: unknown[] = [];
          for (const tu of toolUses) {
            const label = tu.name === 'query_daily_activity' ? 'sales & DT data'
                        : tu.name === 'query_lifelenz_labor' ? 'labor schedules'
                        : tu.name.replace(/_/g, ' ');
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: `Querying ${label}…` })}\n\n`));

            try {
              const result = await runTool(tu.name, tu.input as Record<string, unknown>);
              toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: result });
            } catch (e) {
              toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: `Error: ${e}`, is_error: true });
            }
          }

          conversationMessages = [
            ...conversationMessages,
            { role: 'assistant', content: assistantContent },
            { role: 'user',      content: toolResults },
          ];
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (e) {
        console.error('[sage-chat] stream error:', e);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(e) })}\n\n`));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...CORS,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
});
