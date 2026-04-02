# 🚀 Deployment Checklist - Ready to Go Live

**Status:** All code done, ready to deploy
**Time Required:** 15-20 minutes
**Expected Result:** App live + syncing

---

## ✅ Pre-Deployment Checklist

```
□ Syntax verified
□ All functions wired
□ Firebase rules updated
□ GitHub secrets ready (GCP, project ID, sheet ID)
□ Google Sheet shared with service account
□ Init tags script ready

All items checked? → Keep going!
```

---

## 🎯 Deployment - Follow These Steps

### STEP 1️⃣: Deploy Firestore Rules

**What it does:** Locks down the database with security rules

```bash
cd /workspaces/ALA-house-leaderboard
firebase deploy --only firestore:rules
```

**Expected output:**
```
Deploying to project: ala-house-leaderboard

✔  Firestore Rules have been deployed successfully.

Project Console: https://console.firebase.google.com/project/ala-house-leaderboard/firestore
```

✅ **If you see "deployed successfully" → move to Step 2**

---

### STEP 2️⃣: Initialize Event Tags

**What it does:** Creates 20 default tags (Basketball, Assembly, etc.)

```bash
node scripts/admin/init-tags.mjs --apply
```

**Expected output:**
```
📋 Initializing 20 default tags...
Mode: APPLY (writing to Firestore)

✓ Basketball [Sports]
✓ Volleyball [Sports]
✓ Girls Varsity [Sports]
✓ Boys Varsity [Sports]
... (16 more)

✅ Successfully created 20 tags in Firestore
```

✅ **If you see "Successfully created 20 tags" → move to Step 3**

---

### STEP 3️⃣: Manual Workflow Test (Optional but Recommended)

**What it does:** Tests GitHub Actions sync is working

1. Go to: https://github.com/anthropics/ALA-house-leaderboard
2. Click: **Actions**
3. Click: **Sheet Auto Sync**
4. Click: **Run workflow** (blue button)
5. Select branch: `main`
6. Click: **Run workflow**

**Wait 30 seconds...**

Check:
- ✅ Workflow shows green checkmark (completed)
- ✅ Google Sheet has new rows from Firestore

✅ **If both work → move to Step 4**

---

### STEP 4️⃣: Test Locally

**What it does:** Runs app locally to verify everything works before going live

```bash
firebase serve
```

**Expected output:**
```
✔  hosting[ala-house-leaderboard]: Local server started at
   http://localhost:5000

Press Ctrl-C to stop
```

Open in browser: **http://localhost:5000/web/control/**

**Quick Test:**
| Feature | Test | Expected |
|---------|------|----------|
| Login | Enter any email | Shows control panel ✓ |
| Password Reset | Click "Forgot Password?" | Shows "Reset link sent" ✓ |
| Help | Press `?` | Modal appears ✓ |
| Tags | Type "bask" | Finds "Basketball" ✓ |
| Scoring | Click +50 on a house | Points update live ✓ |

✅ **All working? → Ready to deploy!**

Press `Ctrl+C` to stop local server.

---

### STEP 5️⃣: Deploy to Production

**What it does:** Pushes app live to Firebase Hosting

```bash
firebase deploy
```

**Expected output:**
```
Deploying to project: ala-house-leaderboard

✔ Deploy complete!

Project Console: https://console.firebase.google.com/project/ala-house-leaderboard

Hosting URL: https://ala-house-leaderboard.firebaseapp.com
```

✅ **You're live!**

---

## 🎉 You're Done! Access Your App

**Live URL:** `https://ala-house-leaderboard.firebaseapp.com/web/control/`

**OR** (if you have a custom domain set up):

Custom domain (if configured)

---

## 📋 Post-Deployment Checklist

After you deploy:

```
□ Verify app loads in browser
□ Test login with a test account
□ Try scoring a few points
□ Check history displays correctly
□ Verify tags appear in dropdown
□ Test password reset
□ Verify help modal works (?)
□ Check Google Sheet for new data
```

---

## ✅ Verify Production is Working

### Test Real-Time Updates

1. Open app in 2 browser windows (side by side)
2. In window 1, give Red +50 points
3. In window 2, watch it update LIVE (no refresh needed)

✅ **If scores update live → Real-time is working!**

### Test Google Sheets Sync

1. In app, score some points
2. Click "Sync Points Now"
3. Wait 5 seconds
4. Open Google Sheet: https://docs.google.com/spreadsheets/d/1ko1Hhpbv00xsarwFRMgpt9kT5K7c-6td2h34PqtNJGM/edit

✅ **New rows appeared? → Sync is working!**

### Test Helper Approval Workflow

1. Create a helper account (or login as helper if available)
2. Have helper propose points
3. Login as admin
4. Approve the proposal
5. Check history

✅ **Appears in history? → Approval flow is working!**

---

## 🐛 If Something Goes Wrong

### App not loading?
```bash
firebase deploy --only hosting
# This redeploys just the web files
```

### Database issues?
```bash
firebase deploy --only firestore:rules
# This redeploys security rules
```

### Need to rollback?
```bash
# Go to Firebase Console
# Firestore → Rules → Revisions
# Click an older version → Publish
```

### Check logs for errors
```bash
firebase functions:log
# Shows any backend errors
```

---

## 🔒 Security Checklist - Post Deploy

After app is live, verify:

```
□ Non-admins cannot access sensitive data
□ Helpers can only propose (not direct-score)
□ Staff can score but not manage users
□ Superadmin access works
□ Audit log shows all actions
□ History is immutable (can't edit/delete)
```

---

## 📢 Tell StuGo They Can Use It

**You can now send this link to StuGo:**

```
🎉 House Points System is Live!

Go to: https://ala-house-leaderboard.firebaseapp.com/web/control/

Login with your student council email/password

Questions? Ask [your email]
```

---

## 🎯 What's Next?

**After going live, pick ONE feature to build:**

1. **📊 Analytics Dashboard** (my recommendation)
   - Show leadership the impact
   - 1 week to build
   - Very impressive

2. **⚡ Batch Operations**
   - Speed up admins
   - 1 week to build

3. **📱 Mobile UX**
   - Works on any device
   - 3-4 days to build

4. **🛡️ Quality Controls**
   - Prevent mistakes
   - 3 days to build

**See:** `FEATURE_DECISION_GUIDE.md` for detailed comparison

---

## 📊 Monitoring (First Week)

After you go live, monitor:

```
□ Check Firebase Console daily for errors
□ Ask StuGo for feedback
□ Monitor scoring patterns (any anomalies?)
□ Watch Firestore database size growth
□ Verify sync is running (check sheet daily)
```

---

## 🎊 Celebration Moment

When deployment is complete:

✅ Real-time scoring app
✅ Tag system with fuzzy matching
✅ Role-based access control
✅ Google Sheets sync
✅ History/audit logging
✅ Backup manager
✅ Student lookup
✅ Secured with Firestore rules

**You built this! 🎉**

---

## Questions During Deployment?

| Problem | Solution |
|---------|----------|
| "Deploy command not found" | Make sure you ran `firebase login` first |
| "Tags not showing up" | Check Firestore console - should have 20 docs in eventTags |
| "Google Sheet not syncing" | Verify 3 GitHub secrets are set (GCP, project ID, sheet ID) |
| "Can't login to app" | Check Firebase Auth has users (Console → Authentication → Users) |
| "Rules error" | Check firestore.rules for syntax (line 125-147) |

---

**Ready? Run the commands above in order. You'll be live in 15 minutes. 🚀**

**Which feature should I start building next after you deploy?**
- 📊 Analytics
- ⚡ Batch Ops
- 📱 Mobile
- 🛡️ Quality Controls

**Tell me and I'll start coding!**
