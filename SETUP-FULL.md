Full Setup — Control Panel, Google Sheets sync, and Email Notifications

This doc collects the end-to-end setup steps for the control panel, including Google Sheets sync and email notification options.

1) Control panel basics
- Project uses Firebase (Firestore + Auth). Ensure you have a Firebase project and the `firebaseConfig` in `public/control.js` matches your project.
- Scores are stored at `leaderboard/scores` and a small config doc is stored at `leaderboard/config` (used for the Sheets webhook URL).
- Admin users must be created in Firebase Auth and optionally added to `userProfiles` with `role` set to `admin` or `superadmin`.

2) Google Sheets sync (quick)
- See: SHEETS-SYNC-SETUP.md for a simple Apps Script webhook that accepts POST JSON and appends rows.
- Steps summary:
  - Create a Google Sheet (create a tab named `Events` with header row: ReceivedAt, EventName, ClosedAt, ActionCount, NetDelta, Tags, Notes, ClosedByEmail).
  - Deploy Apps Script as Web App and copy the web app URL.
  - In the control panel → open Admin → "Google Sheets Sync" and paste the webhook URL then click "Save Webhook".
  - When an event is closed (Post checkpoint), the control panel will POST the event summary JSON to the webhook.

3) Google Sheets sync (recommended production)
- Use a server-side integration (Cloud Function) with a service account instead of deploying an Apps Script with public access.
- Benefits: centralized credentials, better retry handling, stronger access control, and ability to perform batched writes.
- Outline:
  - Create a Google Cloud service account and grant `roles/drive.file` or `roles/spreadsheets` as required.
  - Create a Cloud Function (HTTP) that accepts an event summary payload and uses the Sheets API to append rows.
  - Store the Cloud Function URL and paste it into the control panel webhook field.

4) Email notifications
Option A — Cloud Function + SendGrid (recommended)
- Use a Cloud Function that triggers when `leaderboard/scores` is updated (onWrite or onUpdate). When a post-checkpoint is detected, send an email.
- Example pattern:
  - Cloud Function triggers on `onUpdate` of `leaderboard/scores`.
  - If `change.after.data().latestEventSummary` exists and it has not been notified (create a local marker or check `audit`), compose an email with event summary and send via SendGrid SMTP/API.
  - Optionally, write a small flag back to the `leaderboard/config` doc to avoid duplicate notifications.

Sample Node.js Cloud Function (SendGrid)

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const sgMail = require('@sendgrid/mail');
admin.initializeApp();
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

exports.notifyOnEvent = functions.firestore.document('leaderboard/scores').onUpdate(async (change, context) => {
  const before = change.before.data() || {};
  const after = change.after.data() || {};
  const prev = before.latestEventSummary || {};
  const latest = after.latestEventSummary || {};

  // Only notify when latest changes and has an eventName
  if (!latest.eventName || prev.label === latest.label) return null;

  const msg = {
    to: 'ops@example.org',
    from: 'no-reply@example.org',
    subject: `Event closed: ${latest.label}`,
    text: `Event ${latest.label} closed. Actions: ${latest.actionCount}. Delta: ${JSON.stringify(latest.netDelta)}\nNotes: ${latest.notes || ''}`
  };

  await sgMail.send(msg);
  return null;
});

Notes:
- Replace `ops@example.org` with your admin distribution list.
- Store `SENDGRID_API_KEY` as a secret in your function environment.

Option B — Use Gmail / SMTP directly
- You can use a standard SMTP relay or OAuth2 for Gmail. For scale and reliability, SendGrid or another provider is recommended.

5) Security & best practices
- Protect any webhook with a secret or token. For Apps Script deploys you can add a `?secret=...` query parameter and check it in `doPost`.
- Do not store long-lived service account keys in client-side code.
- Use server-side functions for any sensitive operations (email sending, writing to external services) and keep the service account credential in the server environment.

6) Admin responsibilities
- Superadmins should configure the Sheets webhook and any email distribution.
- If you use Apps Script, ensure the owner account stays active (the script runs as the owner).

7) Troubleshooting
- If rows do not appear, check Apps Script execution logs (Apps Script Editor → Executions) or function logs (Cloud Functions logs).
- If webhook returns 401/403, check deployment access and whether the script requires authentication.

If you want, I can also:
- Add a simple secret-token header check to the control panel and include a configuration field for the secret in `leaderboard/config`.
- Implement a Cloud Function example and a small deployment script (gcloud) for the service-account approach.
