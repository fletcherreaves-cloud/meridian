// trigger-dar-sync — dispatches a data-pull GitHub Actions workflow on demand so
// operators can pull fresh data straight from the app (Data Manager / Live Ops).
//
// Body: { workflow?: 'dar'|'ebos'|'fob'|'lifelenz', inputs?: {...},
//         days_back?, days_recent? }  — top-level days_* kept for backward compat.
// Defaults to 'dar' when no workflow is given.
//
// Deploy:  supabase functions deploy trigger-dar-sync
// Secrets: supabase secrets set GITHUB_PAT=ghp_...
//   (PAT needs `workflow` scope; repo-scoped fine-grained token also works)

const GITHUB_PAT   = Deno.env.get('GITHUB_PAT')!;
const GITHUB_OWNER = 'fletcherreaves-cloud';
const GITHUB_REPO  = 'meridian';

// Allowlist of dispatchable workflows. `inputs` are the ONLY keys forwarded to
// GitHub — sending an input a workflow doesn't declare returns HTTP 422, so each
// entry lists exactly that workflow's dispatch inputs with fast-refresh defaults.
const WORKFLOWS: Record<string, { file: string; inputs: Record<string, string>; label: string }> = {
  dar:      { file: 'qsrsoft-dar-pull.yml',  label: 'Daily Activity',    inputs: { days_back: '7',  days_recent: '1', force_full: '0', debug: '0' } },
  ebos:     { file: 'qsrsoft-ebos-pull.yml', label: 'eBOS Purchases',    inputs: { days_back: '30', days_recent: '2', force_full: '0', debug: '0' } },
  fob:      { file: 'qsrsoft-pull.yml',      label: 'FOB / P&L Cost',    inputs: { days_back: '30', days_recent: '2', debug: '0' } },
  lifelenz: { file: 'lifelenz-pull.yml',     label: 'LifeLenz Schedule', inputs: { days_back: '7', safety_days: '3', days_fwd: '14', debug: '0' } },
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // Verify caller has a valid Supabase session
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_KEY, Authorization: auth },
  });
  if (!userResp.ok) return json({ error: 'Unauthorized' }, 401);

  if (!GITHUB_PAT) return json({ error: 'GITHUB_PAT secret not configured' }, 503);

  // Parse the request body
  let body: Record<string, unknown> = {};
  try { body = (await req.json()) ?? {}; } catch { /* no body — defaults fine */ }

  const key = String(body.workflow ?? 'dar');
  const wf = WORKFLOWS[key];
  if (!wf) return json({ error: `Unknown workflow '${key}'` }, 400);

  // Build inputs from the workflow's declared defaults, overriding only with
  // caller-supplied values for keys that workflow actually accepts (nested
  // `inputs` object, or top-level days_* kept for backward compatibility).
  const override = (body.inputs ?? {}) as Record<string, unknown>;
  const inputs: Record<string, string> = { ...wf.inputs };
  for (const k of Object.keys(wf.inputs)) {
    if (override[k] != null) inputs[k] = String(override[k]);
    else if (body[k] != null) inputs[k] = String(body[k]); // legacy top-level days_back/days_recent
  }

  const dispatch = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${wf.file}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GITHUB_PAT}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main', inputs }),
    }
  );

  if (!dispatch.ok) {
    const msg = await dispatch.text();
    console.error('[trigger-dar-sync] GitHub dispatch failed:', dispatch.status, msg);
    return json({ error: `GitHub API error ${dispatch.status}` }, 502);
  }

  // 204 No Content is the success response from GitHub workflow dispatch
  return json({ status: 'dispatched', workflow: key, message: `${wf.label} sync started — data will refresh in ~10 minutes.` });
});
