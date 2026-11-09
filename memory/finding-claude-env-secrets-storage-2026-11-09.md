---
name: finding-claude-env-secrets-storage-2026-11-09
description: "Open item, owner to revisit: the Claude Code Remote environment's 'Environment variables' settings dialog (cloud environment menu -> Edit) now holds QSRSOFT_USERNAME, QSRSOFT_PASSWORD, and the full Supabase credential set (SUPABASE_ACCESS_TOKEN, SUPABASE_SERVICE_ROLE_KEY, etc.) -- added 2026-11-09 so a scheduled Claude session can run the QSRSoft Security Events pull (see memory/finding-qsrsoft-security-entitlement-request-2026-08-22.md). That dialog's own on-screen caption reads: 'Anyone who uses this environment can see these values, so don't add secrets' -- meaning these are plain, visible values, not a masked/write-only secrets store the way a GitHub Secret is. Owner acknowledged this live and is not worried about it, but wants to look tomorrow at whether a separate, protected 'Network secrets' / 'API credentials' section exists in this environment's settings that these values should move to instead."
sensitivity: open
metadata:
  node_type: memory
  type: finding
---

# Claude Code Remote environment secrets storage (2026-11-09)

## What happened

While standing up a scheduled Claude Code Remote session as a workaround for the QSRSoft
Security Events pull's GitHub-Actions-specific `403` (see
`memory/finding-qsrsoft-security-entitlement-request-2026-08-22.md`), the owner added
`QSRSOFT_USERNAME`, `QSRSOFT_PASSWORD`, and confirmed the pre-existing Supabase credential set
(`SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_SERVICE_ROLE_KEY`,
`VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`) in this environment's **"Environment variables"**
settings dialog (cloud environment menu in the session title bar -> Edit). A screenshot of that
dialog showed the real values in plaintext, with this caption directly under the field:

> One KEY=value per line, in `.env` format. **Anyone who uses this environment can see these
> values, so don't add secrets.**

That's the dialog itself warning that this field is plain/visible, not an encrypted or
write-only store — unlike a GitHub Actions Secret (masked in logs, never readable again once
saved) or a dedicated secrets vault. `SUPABASE_SERVICE_ROLE_KEY` in particular bypasses all RLS
(per CLAUDE.md's own standing description of that key) — it's the single highest-privilege
credential this repo has, and it's now sitting in a field the environment's own UI says anyone
with access to the environment can read.

Flagged live; **owner's response: "understood, not worried about it."** Not blocking anything —
the scheduled pull is live and working with these values — but the owner asked to come back to
this specifically, to check whether a separate, protected section exists.

## What to check tomorrow

- Whether this Claude Code Remote environment offers a distinct **"Network secrets"** / **"API
  credentials"** section (mentioned in this product's own documentation as the preferred,
  protected place for exactly this kind of value, where that section is offered — see
  `mcp__Claude_Code_Remote__read_documentation` topic `environment.secrets`) separate from the
  plain "Environment variables" dialog that was actually used here.
- If such a section exists: move `QSRSOFT_PASSWORD` and `SUPABASE_SERVICE_ROLE_KEY` (and
  probably the rest of the Supabase set) there, and remove them from the plain Environment
  variables field.
- If no such section exists in this environment/plan tier: this plain-variable field is the only
  option, and the current setup is "as good as it gets" here — worth knowing either way rather
  than leaving it an open question.

## Not yet an incident

No evidence this has been read by anyone other than the owner and this session. This is a
standing-posture question (should these live somewhere more protected), not a report of
unauthorized access.
