// scripts/lib/qsrsoft-mcp-client.mjs
// Thin MCP (Model Context Protocol) JSON-RPC client for the QSRSoft Native MCP Server
// (https://mcp.myqsrsoft.com). Streamable-HTTP transport: one POST per call, stateless — this
// server does not require/return an Mcp-Session-Id (confirmed live, 2026-11-16: tools/list and
// tools/call both work with no prior session-establishing call).
//
// Not a generic MCP client — just enough to call this one server's tools/call method, matching
// the shape every other qsrsoft-*.mjs pull script uses for its own target API.

const MCP_URL = 'https://mcp.myqsrsoft.com/';

export async function callTool(accessToken, name, args = {}) {
  const body = {
    jsonrpc: '2.0',
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    method: 'tools/call',
    params: { name, arguments: args },
  };
  const resp = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`[qsrsoft-mcp] HTTP ${resp.status} calling ${name}: ${text.slice(0, 300)}`);
  }
  const data = await resp.json();
  if (data.error) throw new Error(`[qsrsoft-mcp] JSON-RPC error calling ${name}: ${JSON.stringify(data.error).slice(0, 300)}`);
  const result = data.result;
  if (result?.isError) {
    const msg = result.content?.[0]?.text || JSON.stringify(result).slice(0, 300);
    throw new Error(`[qsrsoft-mcp] tool ${name} returned an error: ${msg}`);
  }
  // Return the whole result, not just structuredContent — for this server's post_queryReport,
  // the actual row DATA lives only in content[0].text (a CSV block); structuredContent carries
  // column metadata only (name/type/rowCount), never row values. See qsrsoft-mcp-pull.mjs's
  // parseReportCsv() header comment for the measured proof.
  return result;
}
