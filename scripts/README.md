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

`sync-users.mjs` sets user roles/claims and resets all passwords except Noah's to `StuG0!` (Firebase requires 6+ chars).

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
node scripts/admin/sync-users.mjs --email=wp76080@stu.alaschools.org --password=StuG0! --apply
```
