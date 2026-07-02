# Meridian — QSRSoft Email Ingest Pipeline Setup

Automated pipeline that ingests QSRSoft scheduled reports from Gmail into Meridian
without any manual file handling. Reports arrive at 10:30 AM, Meridian picks them
up automatically on next login.

## Architecture

```
QSRSoft (scheduled email)
  → fletcher.reaves@mcreaves.com  (Google Workspace)
  → Google Apps Script             (hourly Gmail poller)
  → Supabase Edge Function         (stores raw Excel file)
  → Supabase Storage               (qsr-reports bucket)
  → pending_reports table          (tracks what's waiting)
  → Meridian app on login          (downloads, parses, merges)
```

## QSRSoft Schedule Configuration

All reports set to recipient: fletcher.reaves@mcreaves.com

| Report            | Frequency | Day       | Time    |
|-------------------|-----------|-----------|---------|
| Sales Ledger      | Daily     | Every day | 10:30AM |
| Sales Ledger      | Weekly    | Wednesday | 10:30AM |
| Sales Ledger      | Monthly   | 2nd       | 10:30AM |
| Labor Analysis    | Daily     | Every day | 10:30AM |
| Labor Analysis    | Weekly    | Wednesday | 10:30AM |
| Labor Analysis    | Monthly   | 2nd       | 10:30AM |
| Cash Sheet        | Daily     | Every day | 10:30AM |
| Cash Sheet        | Weekly    | Wednesday | 10:30AM |
| Cash Sheet        | Monthly   | 2nd       | 10:30AM |
| Daily Glimpse     | Daily     | Every day | 10:30AM |
| Daily Glimpse     | Weekly    | Wednesday | 10:30AM |
| Daily Glimpse     | Monthly   | 2nd       | 10:30AM |
| Labor Exceptions  | Weekly    | Wednesday | 10:30AM |

**Why layered schedules:** Daily pulls may have incomplete data if a store hasn't
completed ABC (Automated Business Cutover, ~7-8 AM). Weekly and monthly reports
automatically correct bad daily data — Meridian's deduplication keeps the last-loaded
row per store+date, so the weekly report overwrites any bad daily row.

## One-Time Setup Steps

### 1. Supabase SQL (run once in SQL Editor)
SQL is in `supabase/schema.sql` under "QSRSoft EMAIL INGEST PIPELINE".
Creates: `qsr-reports` storage bucket + `pending_reports` table + RLS policies.

### 2. Deploy Edge Function
```bash
cd [project directory]
npx supabase login   # only needed once per machine
npx supabase functions deploy ingest-report --project-ref oiajpwdcihgvhofntjcn
npx supabase secrets set INGEST_SECRET=[secret] --project-ref oiajpwdcihgvhofntjcn
```
The INGEST_SECRET value is stored separately (see credentials note below).
Function code: `supabase/functions/ingest-report/index.ts`

### 3. Google Apps Script
1. Go to script.google.com → New project
2. Paste contents of `supabase/gmail-poller.gs`
3. Project Settings → Script Properties → add:
   - Key: `INGEST_SECRET` / Value: [same secret as above]
4. Run `setupTrigger()` once — installs hourly trigger, prompts Gmail authorization
5. Run `testWithLatestEmail()` to verify once a QSRSoft email has arrived

Script searches Gmail for emails from QSRSoft senders with .xlsx attachments,
POSTs each file to the Edge Function, labels thread `meridian-processed`.

## Credentials & Secrets

**Never commit these to git.**

| Secret | Where stored | Notes |
|--------|-------------|-------|
| INGEST_SECRET | Supabase function secrets + Apps Script properties | UUID generated at setup |
| Supabase service role key | Apps Script properties only | Full DB access, keep private |
| Supabase anon key | .env.local (gitignored) | Safe for client-side use |

To retrieve INGEST_SECRET if lost:
Supabase Dashboard → Project Settings → Edge Functions → ingest-report → Secrets

## QSRSoft Sender & File Format

Confirmed sender: `scheduled-reports@myqsrsoft.com`
Confirmed file format: `.csv` (not `.xlsx` as originally assumed)

`gmail-poller.gs` is already set correctly. Both `.xlsx` and `.csv` attachments
are accepted in case any reports differ.

## How Meridian Consumes Reports

On every login (when Supabase is connected), App.js checks `pending_reports`
for unprocessed rows, downloads each file from Storage, feeds through the same
`handleFiles()` pipeline used for manual uploads, then marks rows processed.
No separate UI — it's invisible and automatic.

## Troubleshooting

**No data appearing after 10:30 AM:**
1. Check Apps Script execution log (Executions tab, left sidebar) for errors
2. Check Supabase Dashboard → Edge Functions → ingest-report → Logs
3. Check Supabase Dashboard → Storage → qsr-reports bucket for uploaded files
4. Check `pending_reports` table in Supabase Table Editor

**Wrong sender address — emails not found:**
Update `QSR_SENDERS` in gmail-poller.gs with the real From address.
Run `testWithLatestEmail()` to verify it finds the email.

**Re-process an already-labeled email:**
In Gmail, remove the `meridian-processed` label from the thread,
then run `processQSREmails()` manually in Apps Script.
