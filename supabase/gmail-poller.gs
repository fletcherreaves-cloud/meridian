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
//   Runs every hour. Searches Gmail for emails from QSRSoft/SMG VOICE/the McDonald's
//   corporate Conversion Efficiency program with Excel/PDF attachments that haven't been
//   labeled "meridian-processed". For each attachment found, POSTs the bytes to the Supabase
//   ingest-report Edge Function. Labels the thread when done so it's never processed twice.
//
//   Conversion Efficiency Ratio AND Oil Efficiency reports (processConversionEfficiencyEmails /
//   processOilEfficiencyEmails below) share one sender list, OWNER_OPERATOR_SENDERS -- five real
//   addresses the owner confirmed directly (2026-10-19), same "Owner Operator Reports" program
//   for both report types. Not system addresses like QSRSoft/SMG VOICE above, so a new owner
//   shows up here occasionally; add their address to the list rather than guessing at a pattern.
//   Because these two share one sender list, they do NOT share PROCESSED_LABEL -- see
//   CE_PROCESSED_LABEL/OE_PROCESSED_LABEL below for why.

const EDGE_FUNCTION_URL  = 'https://oiajpwdcihgvhofntjcn.supabase.co/functions/v1/ingest-report';
const SUPABASE_ANON_KEY  = 'sb_publishable_2eafXeOEWmR6aNCqdWC_-A_zJvvJhwa';
const PROCESSED_LABEL    = 'meridian-processed';
// Conversion Efficiency + Oil Efficiency get their OWN labels, not the shared PROCESSED_LABEL
// above. They're the only two processors pulling from the same human sender addresses
// (OWNER_OPERATOR_SENDERS) -- every other processor's senders are disjoint system addresses, so
// a shared label can never cause one processor to hide a thread from another. These two could:
// if one real email/thread ever carried attachments for both report types, whichever processor
// ran first would label the thread and the other would never see it again. Separate labels mean
// each processor tracks only what IT has ingested.
const CE_PROCESSED_LABEL  = 'meridian-processed-conversion-efficiency';
const OE_PROCESSED_LABEL  = 'meridian-processed-oil-efficiency';

const QSR_SENDERS = [
  'scheduled-reports@myqsrsoft.com',
];

// ── Master trigger function — calls all email processors ─────────────────────
function processAllEmails() {
  processQSREmails();
  processSMGVoiceEmails();
  processVoicePerformanceEmails();
  processConversionEfficiencyEmails();
  processOilEfficiencyEmails();
}

// ── SMG VOICE Customer Comment Report emails (weekly, Monday mornings) ────────
function processSMGVoiceEmails() {
  const secret = PropertiesService.getScriptProperties().getProperty('INGEST_SECRET');
  if (!secret) {
    console.error('INGEST_SECRET not set in Script Properties. Aborting.');
    return;
  }

  const query = `from:SMGMailMgr@whysmg.com subject:"Weekly VOICE Customer Comments" has:attachment -label:${PROCESSED_LABEL}`;
  const threads = GmailApp.search(query, 0, 20);

  if (!threads.length) {
    console.log('No unprocessed SMG VOICE emails found.');
    return;
  }

  let label = GmailApp.getUserLabelByName(PROCESSED_LABEL);
  if (!label) label = GmailApp.createLabel(PROCESSED_LABEL);

  let filesIngested = 0;

  for (const thread of threads) {
    let threadOk = true;
    console.log('Processing SMG VOICE thread:', thread.getFirstMessageSubject(), '| msgs:', thread.getMessageCount());

    for (const msg of thread.getMessages()) {
      const attachments = msg.getAttachments({ includeInlineImages: false });

      for (const att of attachments) {
        const name = att.getName();
        if (!name.match(/^eu\d+\.pdf$/i)) continue; // only SMG VOICE PDFs

        try {
          const response = UrlFetchApp.fetch(EDGE_FUNCTION_URL, {
            method: 'POST',
            headers: {
              'Authorization':   `Bearer ${SUPABASE_ANON_KEY}`,
              'X-Ingest-Secret': secret,
              'X-File-Name':     name,
              'X-Source':        'email',
              'Content-Type':    'application/pdf',
            },
            payload:            att.copyBlob().getBytes(),
            muteHttpExceptions: true,
          });

          const code = response.getResponseCode();
          const body = response.getContentText();

          if (code === 200) {
            console.log(`✓ Ingested SMG VOICE: ${name} → ${body}`);
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

    if (threadOk) thread.addLabel(label);
  }

  console.log(`Done. ${filesIngested} SMG VOICE file(s) ingested from ${threads.length} thread(s).`);
}

// ── SMG VOICE Operator Performance Report emails (monthly, ~2nd of month) ─────
// Sender: SMGMailMgr@whysmg.com  Subject: "Voice Performance Report"
// Attachments: McDonalds_VOICE_Operator_Performance_<operatorId>.PDF (one per operator)
function processVoicePerformanceEmails() {
  const secret = PropertiesService.getScriptProperties().getProperty('INGEST_SECRET');
  if (!secret) {
    console.error('INGEST_SECRET not set in Script Properties. Aborting.');
    return;
  }

  const query = `from:SMGMailMgr@whysmg.com subject:"Voice Performance Report" has:attachment -label:${PROCESSED_LABEL}`;
  const threads = GmailApp.search(query, 0, 20);

  if (!threads.length) {
    console.log('No unprocessed VOICE Performance emails found.');
    return;
  }

  let label = GmailApp.getUserLabelByName(PROCESSED_LABEL);
  if (!label) label = GmailApp.createLabel(PROCESSED_LABEL);

  let filesIngested = 0;

  for (const thread of threads) {
    let threadOk = true;
    console.log('Processing VOICE Performance thread:', thread.getFirstMessageSubject(), '| msgs:', thread.getMessageCount());

    for (const msg of thread.getMessages()) {
      const attachments = msg.getAttachments({ includeInlineImages: false });

      for (const att of attachments) {
        const name = att.getName();
        // Only process operator performance PDFs
        if (!name.match(/^McDonalds_VOICE_Operator_Performance_\d+\.PDF$/i)) continue;

        try {
          const response = UrlFetchApp.fetch(EDGE_FUNCTION_URL, {
            method: 'POST',
            headers: {
              'Authorization':   `Bearer ${SUPABASE_ANON_KEY}`,
              'X-Ingest-Secret': secret,
              'X-File-Name':     name,
              'X-Source':        'email',
              'Content-Type':    'application/pdf',
            },
            payload:            att.copyBlob().getBytes(),
            muteHttpExceptions: true,
          });

          const code = response.getResponseCode();
          const body = response.getContentText();

          if (code === 200) {
            console.log(`✓ Ingested VOICE Performance: ${name} → ${body}`);
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

    if (threadOk) thread.addLabel(label);
  }

  console.log(`Done. ${filesIngested} VOICE Performance file(s) ingested from ${threads.length} thread(s).`);
}

// ── Conversion Efficiency Ratio emails (monthly, "Owner Operator Reports") ────
// McDonald's corporate sends these from real people's mailboxes (owner-confirmed 2026-10-19),
// not a system address like QSRSoft/SMG VOICE above.
const OWNER_OPERATOR_SENDERS = [
  'kathy.lopez-thorley@partners.mcd.com',
  'rick.thorley@partners.mcd.com',
  'gary.mornhinweg@partners.mcd.com',
  'ryan.thorley@partners.mcd.com',
  'jacob.thorley@partners.mcd.com',
];

function processConversionEfficiencyEmails() {
  if (!OWNER_OPERATOR_SENDERS.length) {
    console.log('OWNER_OPERATOR_SENDERS not configured yet — skipping.');
    return;
  }
  const secret = PropertiesService.getScriptProperties().getProperty('INGEST_SECRET');
  if (!secret) {
    console.error('INGEST_SECRET not set in Script Properties. Aborting.');
    return;
  }

  const fromClause = OWNER_OPERATOR_SENDERS.map(s => `from:${s}`).join(' OR ');
  const query = `(${fromClause}) has:attachment -label:${CE_PROCESSED_LABEL}`;
  const threads = GmailApp.search(query, 0, 20);

  if (!threads.length) {
    console.log('No unprocessed Conversion Efficiency emails found.');
    return;
  }

  let label = GmailApp.getUserLabelByName(CE_PROCESSED_LABEL);
  if (!label) label = GmailApp.createLabel(CE_PROCESSED_LABEL);

  let filesIngested = 0;

  for (const thread of threads) {
    let threadOk = true;
    console.log('Processing Conversion Efficiency thread:', thread.getFirstMessageSubject(), '| msgs:', thread.getMessageCount());

    for (const msg of thread.getMessages()) {
      const attachments = msg.getAttachments({ includeInlineImages: false });

      for (const att of attachments) {
        const name = att.getName();
        if (!name.match(/^Owner_Operator_.*\.pdf$/i)) continue; // only Owner Operator Report PDFs

        try {
          const response = UrlFetchApp.fetch(EDGE_FUNCTION_URL, {
            method: 'POST',
            headers: {
              'Authorization':   `Bearer ${SUPABASE_ANON_KEY}`,
              'X-Ingest-Secret': secret,
              'X-File-Name':     name,
              'X-Source':        'email',
              'Content-Type':    'application/pdf',
            },
            payload:            att.copyBlob().getBytes(),
            muteHttpExceptions: true,
          });

          const code = response.getResponseCode();
          const body = response.getContentText();

          if (code === 200) {
            console.log(`✓ Ingested Conversion Efficiency: ${name} → ${body}`);
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

    if (threadOk) thread.addLabel(label);
  }

  console.log(`Done. ${filesIngested} Conversion Efficiency file(s) ingested from ${threads.length} thread(s).`);
}

// ── Oil Efficiency ("Oil Management Report", Cargill) emails ─────────────────
// Same sender list as Conversion Efficiency above -- same "Owner Operator Reports" program,
// different report. Attachment filename: <operatorId>_Cargill_food_oil_report_<Mon>_<YYYY>.pdf.
function processOilEfficiencyEmails() {
  if (!OWNER_OPERATOR_SENDERS.length) {
    console.log('OWNER_OPERATOR_SENDERS not configured yet — skipping.');
    return;
  }
  const secret = PropertiesService.getScriptProperties().getProperty('INGEST_SECRET');
  if (!secret) {
    console.error('INGEST_SECRET not set in Script Properties. Aborting.');
    return;
  }

  const fromClause = OWNER_OPERATOR_SENDERS.map(s => `from:${s}`).join(' OR ');
  const query = `(${fromClause}) has:attachment -label:${OE_PROCESSED_LABEL}`;
  const threads = GmailApp.search(query, 0, 20);

  if (!threads.length) {
    console.log('No unprocessed Oil Efficiency emails found.');
    return;
  }

  let label = GmailApp.getUserLabelByName(OE_PROCESSED_LABEL);
  if (!label) label = GmailApp.createLabel(OE_PROCESSED_LABEL);

  let filesIngested = 0;

  for (const thread of threads) {
    let threadOk = true;
    console.log('Processing Oil Efficiency thread:', thread.getFirstMessageSubject(), '| msgs:', thread.getMessageCount());

    for (const msg of thread.getMessages()) {
      const attachments = msg.getAttachments({ includeInlineImages: false });

      for (const att of attachments) {
        const name = att.getName();
        if (!name.match(/cargill_food_oil_report.*\.pdf$/i)) continue; // only Oil Management Report PDFs

        try {
          const response = UrlFetchApp.fetch(EDGE_FUNCTION_URL, {
            method: 'POST',
            headers: {
              'Authorization':   `Bearer ${SUPABASE_ANON_KEY}`,
              'X-Ingest-Secret': secret,
              'X-File-Name':     name,
              'X-Source':        'email',
              'Content-Type':    'application/pdf',
            },
            payload:            att.copyBlob().getBytes(),
            muteHttpExceptions: true,
          });

          const code = response.getResponseCode();
          const body = response.getContentText();

          if (code === 200) {
            console.log(`✓ Ingested Oil Efficiency: ${name} → ${body}`);
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

    if (threadOk) thread.addLabel(label);
  }

  console.log(`Done. ${filesIngested} Oil Efficiency file(s) ingested from ${threads.length} thread(s).`);
}

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
    .filter(t => ['processQSREmails','processAllEmails'].includes(t.getHandlerFunction()))
    .forEach(t => ScriptApp.deleteTrigger(t));

  // Create new hourly trigger
  ScriptApp.newTrigger('processAllEmails')
    .timeBased()
    .everyHours(1)
    .create();

  console.log('Hourly trigger created for processAllEmails (QSRSoft + SMG VOICE).');
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
