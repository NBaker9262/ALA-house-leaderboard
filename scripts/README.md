# Admin CLI scripts

These scripts use Firebase Admin SDK and `GOOGLE_APPLICATION_CREDENTIALS`.
If that variable is not set, they also try your local Firebase CLI login token (`firebase login`).

## 1) Install dependency

```bash
npm install firebase-admin
```

## 2) Export history backup (read-only)

```bash
node scripts/admin/export-history.mjs
```

## 3) Dry run user sync

```bash
node scripts/admin/sync-users.mjs
```

## 4) Apply user sync

```bash
node scripts/admin/sync-users.mjs --apply
```

`sync-users.mjs` sets user roles/claims from a local user config file.

Create your local user config (ignored by git):

```bash
cp scripts/admin/users.sample.json scripts/admin/users.local.json
```

Optional defaults:

```bash
export SYNC_USERS_FILE="scripts/admin/users.local.json"
export SYNC_USERS_DEFAULT_PASSWORD="choose-a-strong-temp-password"
```

It also supports linked-account metadata in `userProfiles` (for example, two logins that represent the same person) using:
- `accountGroupId`
- `primaryEmail`

## Granular user edits

List current profile records:

```bash
node scripts/admin/sync-users.mjs --list
```

Edit one existing user:

```bash
node scripts/admin/sync-users.mjs \
  --email=wp76080@stu.alaschools.org \
  --set-role=staff \
  --grant=historyAccess \
  --revoke=placeAwards \
  --name="Wyatt Pulaski" \
  --apply
```

Reset a single user's password:

```bash
node scripts/admin/sync-users.mjs --email=wp76080@stu.alaschools.org --password='<new_password>' --apply
```

## 5) Sync Google Sheet <-> Firestore leaderboard

Install required dependency:

```bash
npm install
```

Set sheet configuration:

```bash
export GOOGLE_SHEET_ID="<your_sheet_id>"
export GOOGLE_SHEET_TAB="Automatic Points"
```

`sync-sheet.mjs` is dry-run by default.
This is a manual sync tool (it does not run automatically from the web app by itself).

Spreadsheet -> Firestore (source-of-truth import):

```bash
node scripts/admin/sync-sheet.mjs --direction=sheet-to-firestore
node scripts/admin/sync-sheet.mjs --direction=sheet-to-firestore --apply
```

Firestore -> Spreadsheet (push app state back to sheet):

```bash
node scripts/admin/sync-sheet.mjs --direction=firestore-to-sheet
node scripts/admin/sync-sheet.mjs --direction=firestore-to-sheet --apply
```

Supported sheet schemas:

- Legacy: `House`, `Point Amount` (or `Points`), `Reason`, `Date`
- Preferred: `House`, `Point Amount`, `Event`, `Game`, `Date`, `Timestamp`, `Entered By`

For legacy rows, `Reason` is auto-split into canonical `Event` + `Game` when possible.

Event tooling:

```bash
node scripts/admin/sync-sheet.mjs --event-options
node scripts/admin/sync-sheet.mjs --list-events --read-range="Automatic Points!A:G"
node scripts/admin/sync-sheet.mjs --search-event="announcements" --read-range="Automatic Points!A:G"
```

The event parser auto-normalizes common variants and misspellings (for example `Announcements`, `announcements`, `anouncemnts`) to canonical event names.

Optional flags:

- `--sheet-id=<id>`
- `--sheet-tab=<tab_name>`
- `--read-range=<A1_range>`
- `--write-range=<A1_start_cell>`
- `--clear-range=<A1_range>`
- `--scores-path=leaderboard/scores`
- `--write-mode=ledger|totals` (used for Firestore -> sheet)
- `--entered-by-default=<name>`
- `--list-events`
- `--search-event=<query>`
- `--event-options`

## 6) Sync private student directory (Google Sheet -> Firestore)

Use this when you need fast student-house lookup in control panel without publishing student info.

```bash
node scripts/admin/sync-students.mjs
node scripts/admin/sync-students.mjs --apply
```

Optional flags:

- `--sheet-id=<id>`
- `--sheet-tab=<tab_name>` (default: `Student Houses`)
- `--read-range=<A1_range>` (default: `<tab>!A:Z`)
- `--collection=studentDirectory`
- `--limit=<n>` (test with only first N rows)
- `--purge-missing` (marks missing students as inactive)

Recommended flow:

1. Keep the student sheet private (not published to web).
2. Run dry-run first and verify row counts.
3. Run with `--apply`.
4. Use Firestore as the lookup source in app.
5. Re-run sync when registrar data changes.

## 7) Automatic two-way sync (Students + Points)

Use this for production auto-sync between:
- `Students` tab -> Firestore `studentDirectory`
- `Automatic Points` tab <-> Firestore `leaderboard/scores` + `auditLog`

Dry-run:

```bash
node scripts/admin/auto-sync.mjs
```

Apply:

```bash
node scripts/admin/auto-sync.mjs --apply --purge-students
```

What it does:

1. Reads points rows from sheet.
2. Assigns/normalizes a `Sync ID` for each points row.
3. Imports new sheet rows into Firestore audit log and updates house totals.
4. Exports new Firestore point deltas back as new sheet rows.
5. Reads Students tab and updates Firestore student directory lookup records.

GitHub Actions automation:

- Workflow file: `.github/workflows/sheet_auto_sync.yml`
- Schedule: every 10 minutes + manual run support
- Required GitHub repository secrets:
  - `GCP_CREDENTIALS_JSON` (service account JSON)
  - `FIREBASE_PROJECT_ID`
  - `GOOGLE_SHEET_ID`

### Which service account should you use?

Use a dedicated automation service account for this project only.

Recommended:
- Name: `sheet-sync-bot`
- ID: `sheet-sync-bot`
- Project: same GCP/Firebase project as Firestore (`ala-house-leaderboard`)

### Exact setup steps (one time)

1. Enable APIs in Google Cloud Console (project `ala-house-leaderboard`):
   - `Firestore API`
   - `Google Sheets API`

2. Create service account:
   - Google Cloud Console -> `IAM & Admin` -> `Service Accounts` -> `Create Service Account`
   - Name: `sheet-sync-bot`
   - Description: `GitHub Actions sync bot for Firestore + Google Sheets`

3. Grant IAM role to service account:
   - Role: `Cloud Datastore User` (`roles/datastore.user`)
   - This is needed for Firestore document reads/writes via Admin SDK in `auto-sync.mjs`.

4. Create JSON key for the service account:
   - Open service account -> `Keys` -> `Add Key` -> `Create new key` -> JSON
   - Download the JSON file (keep it private, never commit it).

5. Share your Google Sheet with service account email:
   - Open the sheet -> `Share`
   - Add the `client_email` from the JSON key
   - Permission: `Editor`

6. Add GitHub repository secrets:
   - GitHub -> Repo -> `Settings` -> `Secrets and variables` -> `Actions`
   - Add:
     - `GCP_CREDENTIALS_JSON` = full raw JSON file content
     - `FIREBASE_PROJECT_ID` = `ala-house-leaderboard`
     - `GOOGLE_SHEET_ID` = `1ko1Hhpbv00xsarwFRMgpt9kT5K7c-6td2h34PqtNJGM`

7. Run workflow once manually:
   - GitHub -> `Actions` -> `Sheet Auto Sync` -> `Run workflow`
   - Confirm it succeeds and writes sync status.

### Security notes for service-account key

- Never commit JSON keys to git.
- Rotate/delete old keys immediately if exposed.
- Keep only one active key for this bot unless there is a migration window.
- Use this account only for automation (not interactive admin work).

Important:
- Share your Google Sheet with the service account email from `GCP_CREDENTIALS_JSON`.
- Keep `Students` tab private and never publish it publicly.

## Initialize Event Tags (Bootstrap)

The tag system organizes house points into categories like "Sports", "Assemblies", "Academic", etc.

### One-time setup

1. **Dry run** (see what would be created):
   ```bash
   node scripts/admin/init-tags.mjs
   ```

2. **Apply** (write to Firestore):
   ```bash
   node scripts/admin/init-tags.mjs --apply
   ```

This creates ~20 default tags. You can add more manually in the admin drawer once logged into the control panel.

### Admin tag management

Once initialized, superadmins and admins can:
- Add new tags
- Disable/delete tags
- View usage statistics
- Import tags from existing scoring entries
- Review tag proposals from helpers

See `web/control/index.html` → Admin drawer → "Tag Management" section.

---

## Sensitive data safety

- Do not commit `scripts/admin/users.local.json` or `.env*` files.
- Keep `FIREBASE_CLIENT_ID`, `FIREBASE_CLIENT_SECRET`, sheet IDs, and passwords in environment variables.
- API keys in frontend Firebase config are public identifiers; never store admin/service-account credentials in repo files.
