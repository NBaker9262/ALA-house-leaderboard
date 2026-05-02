Google Sheets Sync (Apps Script webhook)

Overview

This document explains how to receive closed-event summaries from the control panel and write them to a Google Sheets tab using an Apps Script Web App. The control panel posts a JSON payload to a webhook URL when a post-checkpoint (event close) occurs. The Apps Script appends that payload as a row in a sheet.

Recommended columns (Events sheet)
- ReceivedAt (timestamp when script receives the POST)
- EventName
- ClosedAt (ISO datetime or ms)
- ActionCount
- NetDelta (JSON string)
- Tags (semicolon-separated)
- Notes
- ClosedByEmail

Apps Script: simple receiver

1. Open Google Drive → New → More → Google Apps Script (or go to script.google.com and create a new project).
2. Replace Code.gs contents with the snippet below.
3. Edit `SPREADSHEET_ID` and the `SHEET_NAME` constants or create the sheet/tab named `Events`.
4. Deploy → New deployment → Select `Web app` → Execute as: `Me` (script owner) → Who has access: `Anyone` (or `Anyone with link`) — note security considerations below.
5. Copy the web app URL and paste it into the control panel admin → Google Sheets Sync → Webhook URL.

Code (Apps Script)

function doPost(e) {
  try {
    var SPREADSHEET_ID = "REPLACE_WITH_YOUR_SPREADSHEET_ID"; // from sheet URL q=<id>
    var SHEET_NAME = "Events";

    var payload = {};
    try { payload = JSON.parse(e.postData.contents || '{}'); } catch (err) { payload = {}; }

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

    // Ensure header row exists
    var header = ["ReceivedAt","EventName","ClosedAt","ActionCount","NetDelta","Tags","Notes","ClosedByEmail"];
    if (sheet.getLastRow() === 0) sheet.appendRow(header);

    var row = [
      new Date(),
      payload.eventName || "",
      payload.closedAtMs ? new Date(Number(payload.closedAtMs)) : "",
      payload.actionCount || "",
      payload.netDelta ? JSON.stringify(payload.netDelta) : "",
      (payload.tags || []).join("; "),
      payload.notes || "",
      payload.closedByEmail || ""
    ];

    sheet.appendRow(row);
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) })).setMimeType(ContentService.MimeType.JSON);
  }
}

Security notes

- Deploying a web app with "Anyone" access will allow anyone with the URL to post rows. Protect the URL.
- For modest security, add a shared secret query parameter or header and check it inside `doPost`.
- For stronger control, use a Cloud Function or service account-based approach.

Alternative: Cloud Function with Service Account

If you prefer server-side control (recommended for production), create a Cloud Function that accepts events from the control panel and writes to Sheets using the Google Sheets API and a service account. This requires a small server component and IAM configuration but offers better security and retry handling.

That's it — once the webhook URL is configured in the control panel, closed events will be posted automatically when a post-checkpoint is created.
