// Shared retry-with-backoff for the GitHub Actions data pulls (hardening, 2026-07-30).
// A transient Supabase/network blip during a cron used to fail the whole job; the next scheduled
// run backfilled it (multi-day windows + idempotent upserts), but retrying WITHIN the run means a
// short outage self-heals immediately instead of leaving a same-day gap.
//
// supabase-js reports two failure shapes: a THROWN error (network/fetch failed) or a returned
// `{ error }` (HTTP 5xx / rate limit). We retry the transient ones on exponential backoff and pass
// non-transient results straight back to the caller (which logs them, unchanged behavior).

const TRANSIENT = /fetch failed|network|socket|timeout|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|EPIPE|503|502|504|500|Service Unavailable|Gateway|Bad Gateway|too many requests|rate.?limit|unhealthy|starting up/i;

export function isTransient(msg) { return TRANSIENT.test(String(msg || '')); }

// fn should return a supabase-js result (may contain `.error`) or throw. On a transient failure we
// retry up to `tries` times; otherwise (success, or a non-transient `.error`) we return the result.
export async function withRetry(fn, { tries = 4, baseMs = 800, label = 'op' } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const r = await fn();
      if (r && r.error && isTransient(r.error.message || r.error) && attempt < tries) {
        throw new Error('RETRYABLE: ' + (r.error.message || r.error));
      }
      return r; // success, or a non-transient error, or out of retries → let the caller handle it
    } catch (e) {
      lastErr = e;
      const msg = String(e && e.message || e);
      // Non-transient thrown error with retries left? Still retry once or twice — a thrown error at
      // the fetch layer is almost always transient (the {error} path carries the real HTTP status).
      if (attempt >= tries) break;
      const wait = baseMs * Math.pow(2, attempt - 1);
      console.warn(`[retry] ${label} attempt ${attempt}/${tries} failed (${msg}); retrying in ${wait}ms`);
      await new Promise(res => setTimeout(res, wait));
    }
  }
  throw lastErr;
}
