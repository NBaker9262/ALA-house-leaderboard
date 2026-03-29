# Complete Setup & Deployment Guide

**Last Updated:** 2026-03-29
**Project:** ALA House Leaderboard - Points Tracking System

---

## Table of Contents

1. [Quick Start (5 min)](#quick-start)
2. [Firebase & Firestore Setup](#firebase-setup)
3. [Google Cloud Service Account Setup](#gcp-setup) ← **START HERE if new**
4. [GitHub Actions Automation](#github-actions)
5. [First-Time Deployment](#first-deployment)
6. [Testing Checklist](#testing)

---

## Quick Start

If you have credentials already set up:

```bash
# 1. Deploy Firestore rules
firebase deploy --only firestore:rules

# 2. Initialize event tags
node scripts/admin/init-tags.mjs --apply

# 3. Done! Start the app
firebase serve
```

---

## Firebase Setup

### Already Done ✅

- Firebase project created: `ala-house-leaderboard`
- Firestore database initialized
- Firebase Authentication enabled
- Web app registered
- Firestore rules written with tag collections

### What This Means

- You have a production-ready backend
- Security rules protect data
- Only authorized users can access control panel

---

## GCP Setup - Complete Guide

⚠️ **IMPORTANT**: This is the automation service account for GitHub Actions. It's DIFFERENT from your Firebase login.

### Why You Need This

Your app syncs data to Google Sheets automatically (every 10 minutes). To do that, the sync script needs special credentials:
- `GCP_CREDENTIALS_JSON` = Service account key (JSON file)
- `FIREBASE_PROJECT_ID` = Project ID
- `GOOGLE_SHEET_ID` = Your sheet URL

**The service account is:**
- Only for GitHub Actions (not for anyone to log in with)
- Has minimal permissions (Firestore read/write only)
- Separate from your personal Firebase login

---

## Step-by-Step GCP Service Account Setup

### Step 1: Open Google Cloud Console

1. Go to: https://console.cloud.google.com/
2. At the top, click the project dropdown
3. Search for or select: **ala-house-leaderboard**
4. Click it to open the project

### Step 2: Create Service Account

1. In left sidebar, click **IAM & Admin** → **Service Accounts**
2. Click **+ CREATE SERVICE ACCOUNT**
3. Fill in:
   - **Service account name:** `sheet-sync-bot`
   - **Service account ID:** `sheet-sync-bot` (auto-generates)
   - **Description:** `GitHub Actions sync bot for Firestore + Google Sheets`
4. Click **CREATE AND CONTINUE**
5. Skip "Grant this service account access to project" (we'll do it next)
6. Click **CONTINUE** → **DONE**

You should now see `sheet-sync-bot` in the service accounts list.

### Step 3: Grant IAM Role

1. In the service accounts list, click **sheet-sync-bot**
2. Go to **KEYS** tab
3. Click **ADD KEY** → **Create new key** → **JSON**
4. A JSON file downloads automatically (`xxxxxxx.json`)
5. Save this file securely (don't share!)

### Step 4: Grant Permissions

1. Back in Google Cloud Console, go **IAM & Admin** → **IAM**
2. Click **GRANT ACCESS** (top area)
3. In "New principals" field, paste: `sheet-sync-bot@ala-house-leaderboard.iam.gserviceaccount.com`
4. In "Select a role" dropdown, search for: **Cloud Datastore User**
5. Click it
6. Click **SAVE**

Now the service account can read/write to Firestore ✓

### Step 5: Share Google Sheet with Service Account

1. Open your Google Sheet: https://docs.google.com/spreadsheets/d/1ko1Hhpbv00xsarwFRMgpt9kT5K7c-6td2h34PqtNJGM/edit
2. Click **Share** (top right)
3. Open the JSON file you downloaded
4. Find the line: `"client_email": "sheet-sync-bot@xxxxxxxxx.iam.gserviceaccount.com"`
5. Copy that email address
6. Go back to Google Sheet → Share dialog
7. Paste the email
8. Set permission to **Editor**
9. **Send** (or uncheck if no email needed)

Now the sync bot can edit your sheet ✓

---

## GitHub Actions Setup

### Step 1: Copy JSON Credentials to GitHub

1. Open the JSON file you downloaded from GCP (from Step 4 above)
2. Copy ALL the contents (the entire JSON)
3. Go to GitHub: https://github.com/anthropics/ALA-house-leaderboard
4. Click **Settings** → **Secrets and variables** → **Actions**
5. Click **New repository secret**
6. Name: `GCP_CREDENTIALS_JSON`
7. Value: Paste the entire JSON file contents
8. Click **Add secret**

### Step 2: Add Project ID Secret

1. In the same Secrets page, click **New repository secret**
2. Name: `FIREBASE_PROJECT_ID`
3. Value: `ala-house-leaderboard`
4. Click **Add secret**

### Step 3: Add Sheet ID Secret

1. Click **New repository secret**
2. Name: `GOOGLE_SHEET_ID`
3. Value: `1ko1Hhpbv00xsarwFRMgpt9kT5K7c-6td2h34PqtNJGM`
4. Click **Add secret**

All three secrets should now appear in the Secrets list ✓

---

## First-Time Deployment

### Deploy Firestore Rules

The rules protect your data with role-based access:

```bash
# Make sure you're logged in
firebase login

# Deploy
firebase deploy --only firestore:rules
```

Expected output:
```
✔ Deploy complete!
✔ firestore rules updated
```

### Initialize Event Tags

Bootstrap 20 default tags (Sports, Assemblies, Academic, etc.):

```bash
# Dry run first (see what will happen)
node scripts/admin/init-tags.mjs

# Apply if it looks good
node scripts/admin/init-tags.mjs --apply
```

You should see tags created in Firestore ✓

### Run Manual Sync Once

Test the GitHub Actions workflow manually:

1. Go to GitHub → **Actions**
2. Click **Sheet Auto Sync** workflow
3. Click **Run workflow** button
4. Select branch: `main`
5. Click **Run workflow**

Wait 30 seconds, then check:
- Workflow completes (green checkmark)
- Google Sheet has new rows from Firestore
- No errors in logs

---

## Testing Checklist

### Part 1: Authentication

- [ ] Open app: http://localhost:5000/web/control/
- [ ] Click "Forgot Password?"
- [ ] Enter admin email
- [ ] Check email for Firebase reset link
- [ ] Reset password works
- [ ] Login with new password works
- [ ] Help modal (?) opens and closes
- [ ] Profile menu shows logged-in user
- [ ] Sign out works

### Part 2: Tag System

- [ ] Open app as admin
- [ ] Go to Scoring tab
- [ ] Scroll down to "Event Tags (Optional)"
- [ ] Type "basket" in tag search
- [ ] See "Basketball" suggestion appear
- [ ] Click "Basketball" → appears as chip
- [ ] Type "basktebal" (misspelled)
- [ ] Still finds "Basketball" (fuzzy matching)
- [ ] Remove tag chip (× button)
- [ ] Type custom text like "My Event"
- [ ] See "✚ Create new tag" option
- [ ] Click it → shows "submitted for approval"

### Part 3: Scoring

- [ ] Score points to a house
- [ ] Points update in real-time
- [ ] History shows new entry
- [ ] Tag is displayed in history
- [ ] Helper can propose points
- [ ] Admin can approve proposals

### Part 4: Sync

- [ ] Admin panel → "Sync Points Now"
- [ ] Status shows "Syncing..."
- [ ] After 5 sec, shows "Last synced: 1 min ago"
- [ ] Check Google Sheet
- [ ] New rows appeared from Firestore

---

## Troubleshooting

### "GCP_CREDENTIALS_JSON not found" in GitHub Actions

**Fix:**
1. Go to GitHub Settings → Secrets
2. Verify all 3 secrets are present
3. Check spelling: must be exactly `GCP_CREDENTIALS_JSON`

### Password reset email doesn't arrive

**Check:**
1. Is user registered in Firebase Auth?
   - GitHub → Actions → any successful run shows email
2. Check spam/promotions folder
3. Try a different email if testing
4. Firebase has a rate limit (1 reset per email per 5 minutes)

### Help modal doesn't open

**Fix:**
1. Press `?` key (or click ? button in top right)
2. Check browser console (F12) for JavaScript errors
3. If stuck, close all drawers first

### Tags don't appear

**Fix:**
1. Have you run `node scripts/admin/init-tags.mjs --apply`?
2. Check Firestore → `eventTags` collection
3. Should have 20 documents
4. If empty, re-run the script

### Sync doesn't work

**Check:**
1. Are all 3 GitHub secrets set? (see above)
2. Is Google Sheet shared with service account email?
3. Run manually: go to GitHub Actions → `Sheet Auto Sync` → Run workflow

---

## File Reference

| Purpose | Location |
|---------|----------|
| **Setup scripts** | `scripts/admin/` |
| **Control panel** | `web/control/index.html` |
| **Logic** | `web/control/control.js` |
| **Styling** | `web/control/control.css` |
| **Tag matching** | `web/control/tag-utils.js` |
| **Fire base rules** | `firestore.rules` |
| **Automation** | `.github/workflows/sheet_auto_sync.yml` |
| **Front-end** | `web/leaderboard/` (public view) |

---

## Getting Help

Check these files:
1. `docs/IMPLEMENTATION_PROGRESS.md` - What's done
2. `scripts/README.md` - Admin script details
3. `PROJECT_ACTION_ITEMS.md` - Current to-do items
4. GitHub Issues - Common problems

---

## What's Next

After first deployment:
1. Create test user accounts
2. Have StuGo team test scoring
3. Import historical points from Google Sheet
4. Fine-tune permissions as needed
5. Train users on tag system

---

**Questions?** Check the troubleshooting section or see `docs/REFERENCE.md` for technical details.
