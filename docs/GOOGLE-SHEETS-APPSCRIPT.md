Google Sheets two-way sync — Google Apps Script samples

This file contains a minimal Google Apps Script (server-side) example to accept closed-event POSTs from the leaderboard and to return stored events via GET for imports.

Instructions

- Create a new Google Apps Script project (script.google.com).
- Replace the code with the snippet below.
- Set the `SPREADSHEET_ID` constant to your target spreadsheet's ID (found in the sheet URL).
- Deploy → New deployment → Select "Web app" and grant access to anyone with the link (or to your domain depending on security needs).
- Use the resulting URL as the `sheetsWebhookUrl` in the leaderboard admin settings.

Example Apps Script

```javascript
// Replace with your spreadsheet id (from the sheet URL)
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';
const SHEET_NAME = 'Events';

function ensureSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  // Ensure header row
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['label', 'createdAtMs', 'closedByEmail', 'actionCount', 'payload']);
  }
  return sheet;
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    const sheet = ensureSheet();
    const label = body.label || '';
    const createdAt = body.createdAtMs || Date.now();
    const closedBy = body.closedByEmail || '';
    const actionCount = body.actionCount || (body.actions ? body.actions.length : 0);
    const payload = JSON.stringify(body);
    sheet.appendRow([label, createdAt, closedBy, actionCount, payload]);
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  // Supports: ?action=export to return JSON array of stored rows
  try {
    const action = (e.parameter && e.parameter.action) || '';
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
    if (!sheet) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
    const values = sheet.getDataRange().getValues();
    const rows = [];
    for (let i = 1; i < values.length; i += 1) {
      const r = values[i];
      try {
        rows.push({ label: r[0], createdAtMs: Number(r[1]) || Date.now(), closedByEmail: r[2], actionCount: Number(r[3]) || 0, payload: JSON.parse(r[4] || '{}') });
      } catch (e) {
        rows.push({ label: r[0], createdAtMs: Number(r[1]) || Date.now(), closedByEmail: r[2], actionCount: Number(r[3]) || 0, payload: r[4] });
      }
    }
    return ContentService.createTextOutput(JSON.stringify(rows)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) })).setMimeType(ContentService.MimeType.JSON);
  }
}
```

Notes

- Security: publishing the script to allow "anyone, even anonymous" is the simplest for cross-origin calls. For higher security, protect the script behind authentication and/or use a middle proxy.
- The leaderboard client uses a simple `fetch()` GET to pull data; the sample `doGet` returns a JSON array of stored event rows.
- Imported rows are stored as drafts in the leaderboard (client saves them to `eventDrafts` collection). Review drafts in the admin UI before applying them to the live scores.

Example flow

1. Leaderboard admin configures `sheetsWebhookUrl` with the Apps Script web app URL.
2. Leaderboard `test` sends a `doPost` test (used by `testSheetsWebhook`).
3. When ready to import, admin clicks `Import From Sheets` which calls `doGet?action=export`, the client saves each returned row to `eventDrafts` for review.

This gives a safe two-way sync: the leaderboard can post closures to the sheet, and admins can pull sheet rows back into the app as drafts for inspection and manual apply.
