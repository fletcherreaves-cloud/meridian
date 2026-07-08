// trigger-dar-sync — dispatches the qsrsoft-dar-pull GitHub Actions workflow
// on demand so operators can pull fresh daily activity data from the Live Ops tab.
//
// Deploy:  supabase functions deploy trigger-dar-sync
// Secrets: supabase secrets set GITHUB_PAT=ghp_...
//   (PAT needs `workflow` scope; repo-scoped fine-grained token also works)

const GITHUB_PAT   = Deno.env.get('GITHUB_PAT')!;
const GITHUB_OWNER = 'fletcherreaves-cloud';
const GITHUB_REPO  = 'meridian';
const WORKFLOW_ID  = 'qsrsoft-dar-pull.yml';

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

  // Parse optional inputs from request body
  let inputs: Record<string, string> = {};
  try { inputs = (await req.json()) ?? {}; } catch { /* no body — defaults fine */ }

  // Dispatch workflow — days_recent=1 by default for a fast on-demand pull
  const dispatch = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${WORKFLOW_ID}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GITHUB_PAT}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          days_back:   inputs.days_back   ?? '7',
          days_recent: inputs.days_recent ?? '1',
          force_full:  inputs.force_full  ?? '0',
          debug:       inputs.debug       ?? '0',
        },
      }),
    }
  );

  if (!dispatch.ok) {
    const msg = await dispatch.text();
    console.error('[trigger-dar-sync] GitHub dispatch failed:', dispatch.status, msg);
    return json({ error: `GitHub API error ${dispatch.status}` }, 502);
  }

  // 204 No Content is the success response from GitHub workflow dispatch
  return json({ status: 'dispatched', message: 'Daily activity sync started — data will refresh in ~10 minutes.' });
});
