// Meridian — QSRSoft Gmail Poller
// Paste this entire file into script.google.com as a new project.
//
// SETUP (one-time):
//   1. In Apps Script editor: Extensions → Apps Script → Project Settings
//      → Script Properties → Add:
//        INGEST_SECRET = [the UUID you set as your Supabase function secret]
//   2. Run setupTrigger() once manually to create the hourly trigger.
//   3. Authorize when prompted (needs Gmail read access + external HTTP).
//
// HOW IT WORKS:
//   Runs every hour. Searches Gmail for emails from QSRSoft with Excel
//   attachments that haven't been labeled "meridian-processed". For each
//   attachment found, POSTs the bytes to the Supabase ingest-report Edge
//   Function. Labels the thread when done so it's never processed twice.

const EDGE_FUNCTION_URL  = 'https://oiajpwdcihgvhofntjcn.supabase.co/functions/v1/ingest-report';
const SUPABASE_ANON_KEY  = 'sb_publishable_2eafXeOEWmR6aNCqdWC_-A_zJvvJhwa';
const PROCESSED_LABEL    = 'meridian-processed';

const QSR_SENDERS = [
  'scheduled-reports@myqsrsoft.com',
];

// ── Main function (runs on hourly trigger) ────────────────────────────────────
function processQSREmails() {
  const secret = PropertiesService.getScriptProperties().getProperty('INGEST_SECRET');
  if (!secret) {
    console.error('INGEST_SECRET not set in Script Properties. Aborting.');
    return;
  }

  // Build Gmail search query
  const fromClause = QSR_SENDERS.map(s => `from:${s}`).join(' OR ');
  const query = `(${fromClause}) has:attachment -label:${PROCESSED_LABEL}`;
  const threads = GmailApp.search(query, 0, 50);

  if (!threads.length) {
    console.log('No unprocessed QSRSoft emails found.');
    return;
  }

  // Get or create the processed label
  let label = GmailApp.getUserLabelByName(PROCESSED_LABEL);
  if (!label) label = GmailApp.createLabel(PROCESSED_LABEL);

  let filesIngested = 0;

  for (const thread of threads) {
    let threadOk = true;
    console.log('Processing thread:', thread.getFirstMessageSubject(), '| msgs:', thread.getMessageCount());

    for (const msg of thread.getMessages()) {
      const attachments = msg.getAttachments({ includeInlineImages: false });
      console.log('  msg attachments:', attachments.length, attachments.map(a=>a.getName()).join(', '));

      for (const att of attachments) {
        const name = att.getName();

        // Only process Excel and CSV files
        if (!name.match(/\.(xlsx|xls|csv)$/i)) continue;

        const contentType = name.match(/\.csv$/i)
          ? 'text/csv'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

        try {
          const response = UrlFetchApp.fetch(EDGE_FUNCTION_URL, {
            method: 'POST',
            headers: {
              'Authorization':   `Bearer ${SUPABASE_ANON_KEY}`,
              'X-Ingest-Secret': secret,
              'X-File-Name':     name,
              'X-Source':        'email',
              'Content-Type':    contentType,
            },
            payload:            att.copyBlob().getBytes(),
            muteHttpExceptions: true,
          });

          const code = response.getResponseCode();
          const body = response.getContentText();

          if (code === 200) {
            console.log(`✓ Ingested: ${name} → ${body}`);
            filesIngested++;
          } else {
            console.warn(`✗ Failed [${code}]: ${name} → ${body}`);
            threadOk = false;
          }
        } catch (e) {
          console.error(`✗ Error sending ${name}:`, e.message);
          threadOk = false;
        }
      }
    }

    // Only label as processed if all attachments in the thread succeeded
    if (threadOk) {
      thread.addLabel(label);
    }
  }

  console.log(`Done. ${filesIngested} file(s) ingested from ${threads.length} thread(s).`);
}

// ── One-time trigger setup ────────────────────────────────────────────────────
// Run this manually once from the Apps Script editor to install the hourly trigger.
function setupTrigger() {
  // Remove any existing triggers for this function first
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'processQSREmails')
    .forEach(t => ScriptApp.deleteTrigger(t));

  // Create new hourly trigger
  ScriptApp.newTrigger('processQSREmails')
    .timeBased()
    .everyHours(1)
    .create();

  console.log('Hourly trigger created for processQSREmails.');
}

// ── Force-reprocess — strips the processed label and re-runs ─────────────────
// Use when emails were labeled but files never landed (e.g. during a Supabase outage).
function forceReprocess() {
  const label = GmailApp.getUserLabelByName(PROCESSED_LABEL);
  if (!label) { console.log('No meridian-processed label found — nothing to reprocess.'); return; }

  const fromClause = QSR_SENDERS.map(s => `from:${s}`).join(' OR ');
  const threads = GmailApp.search(`(${fromClause}) has:attachment label:${PROCESSED_LABEL}`, 0, 50);

  if (!threads.length) { console.log('No previously-processed QSRSoft emails found.'); return; }

  console.log(`Removing label from ${threads.length} thread(s) and reprocessing...`);
  for (const thread of threads) thread.removeLabel(label);

  processQSREmails();
}

// ── Attachment diagnostics — run to see exactly what Gmail sees in each email ─
function debugEmailAttachments() {
  const fromClause = QSR_SENDERS.map(s => `from:${s}`).join(' OR ');
  const threads = GmailApp.search(`(${fromClause}) has:attachment`, 0, 5);

  if (!threads.length) { console.log('No QSRSoft threads found.'); return; }

  for (const thread of threads) {
    for (const msg of thread.getMessages()) {
      console.log('--- Email:', msg.getSubject(), '|', msg.getDate());
      console.log('    From:', msg.getFrom());

      // All attachments (including inline images)
      const allAtts = msg.getAttachments();
      console.log('    Total attachments (incl inline):', allAtts.length);
      for (const a of allAtts) {
        console.log('      name:', a.getName(), '| type:', a.getContentType(), '| size:', a.getSize());
      }

      // What the filter sees
      const filtered = msg.getAttachments({ includeInlineImages: false });
      console.log('    Attachments (excl inline):', filtered.length);
      for (const a of filtered) {
        const name = a.getName();
        const passes = !!name.match(/\.(xlsx|xls|csv)$/i);
        console.log('      name:', name, '| passes filter:', passes);
      }

      // Check for Drive links in body
      const body = msg.getPlainBody();
      const driveLinks = body.match(/https:\/\/drive\.google\.com[^\s]*/g);
      if (driveLinks) console.log('    Drive links in body:', driveLinks);
    }
  }
}

// ── Manual test — run this once to verify the pipeline works ─────────────────
// Searches for the most recent QSRSoft email regardless of processed label.
function testWithLatestEmail() {
  const secret = PropertiesService.getScriptProperties().getProperty('INGEST_SECRET');
  if (!secret) { console.error('Set INGEST_SECRET first.'); return; }

  const fromClause = QSR_SENDERS.map(s => `from:${s}`).join(' OR ');
  const threads = GmailApp.search(`(${fromClause}) has:attachment`, 0, 1);

  if (!threads.length) { console.log('No QSRSoft emails found yet.'); return; }

  const msg = threads[0].getMessages()[0];
  console.log('Found email:', msg.getSubject(), 'from:', msg.getFrom());

  const atts = msg.getAttachments({ includeInlineImages: false });
  console.log('Attachments:', atts.map(a => a.getName()).join(', '));

  // Don't actually send — just confirm the email was found and show attachments
  console.log('Test OK — email found. Run processQSREmails() to actually ingest.');
}
