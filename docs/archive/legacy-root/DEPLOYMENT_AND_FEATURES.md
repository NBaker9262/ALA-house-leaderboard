# Deployment Guide + Feature Selection

**Status:** Ready to Deploy & Plan Phase 2
**Date:** 2026-03-29

---

## Part A: Deployment (Do This First)

### Step 1: Deploy Firestore Rules (2 minutes)

```bash
cd /workspaces/ALA-house-leaderboard
firebase deploy --only firestore:rules
```

**What you should see:**
```
✔ Deploy complete!
✔ Firestore rules updated
```

**What this does:** Locks down database - only authenticated users with right roles can read/write.

---

### Step 2: Initialize Event Tags (1 minute)

```bash
node scripts/admin/init-tags.mjs --apply
```

**What you should see:**
```
✓ Creating Basketball [Sports] → ...
✓ Creating Volleyball [Sports] → ...
✓ Creating School Assembly [Assemblies] → ...
... (20 tags total)
✅ Successfully created 20 tags in Firestore
```

**What this does:** Sets up 20 default tags (Basketball, Assembly, RAISE Cards, etc.)

---

### Step 3: Verify GitHub Actions Setup

**Check these three secrets exist in GitHub:**

Go to: https://github.com/anthropics/ALA-house-leaderboard
→ Settings → Secrets and variables → Actions

You should see:
- ✅ `GCP_CREDENTIALS_JSON`
- ✅ `FIREBASE_PROJECT_ID`
- ✅ `GOOGLE_SHEET_ID`

**If missing:** Go back to `FINAL_ANSWERS.md` § Q2 Step 7 and add them.

---

### Step 4: Trigger Sync Workflow (Manual Test)

1. Go to GitHub: Actions → Sheet Auto Sync
2. Click "Run workflow"
3. Select branch: `main`
4. Click "Run workflow"

**Wait 30 seconds...**

Check:
- ✅ Workflow shows green checkmark
- ✅ Google Sheet has new rows from Firestore

---

### Step 5: Test Locally (5 minutes)

```bash
firebase serve
```

Open in browser: http://localhost:5000/web/control/

**Test each feature:**

| Feature | How to Test | Expected Result |
|---------|-----------|-----------------|
| **Login** | Enter any email/password | Shows control panel |
| **Password Reset** | Click "Forgot Password?" | Shows "Reset link sent" |
| **Help** | Press `?` key | Help modal appears |
| **Tags** | Type "bask" in tag search | Finds "Basketball" |
| **Tag Typo** | Type "basktebal" | Still finds "Basketball" |
| **Score Points** | Select house, click +50 | Points update in real-time |
| **History** | Scroll down | Shows your scores |
| **Sync Button** | Click "Sync Points Now" | Shows "Syncing..." then success |

---

### Step 6: Deploy to Production (3 minutes)

```bash
firebase deploy
```

**What you should see:**
```
✔ Deploy complete!
✔ Realtime Database updated
✔ Firestore updated
✔ Firestore Rules updated
✔ functions deployed
```

**🎉 You're live!**

Access app at: `https://ala-house-leaderboard.firebaseapp.com/web/control/`

---

## Part B: Production Feature Selection

### Quick Overview

You have **22 potential features** organized in 6 tiers.

**Most impactful for StuGo:**
1. Batch operations (speed)
2. Analytics dashboard (impact)
3. Mobile UX (accessibility)
4. Advanced approval (experience)

---

### Tier 1: Must Have (Pick 1-2 of These)

#### Option A: **Batch Operations** ⚡
**What:** Score multiple houses at once, bulk import CSV

**Time to build:** 1 week
**Impact:** "Give all houses +5pts" in 1 click instead of 4

**Code needed:**
- New "Batch" button in scoring panel
- CSV parser
- Validation (prevent duplicates)
- Undo support

**Who wants this:** Anyone who scores the same thing to all houses

**Revenue/value:** +30% faster workflow

---

#### Option B: **Analytics Dashboard** 📊
**What:** Charts showing points by house, by tag, trends

**Time to build:** 1 week
**Impact:** Leadership sees "Red winning +200pts this month"

**Code needed:**
- Charts library (use Chart.js - free)
- Monthly/weekly aggregation
- Export as PDF report

**Who wants this:** StuGo president, board

**Revenue/value:** Show impact to school

---

#### Option C: **Advanced Approval** ✅
**What:** Helpers get feedback when rejected, admins bulk approve

**Time to build:** 3 days
**Impact:** Smoother helper→admin workflow

**Code needed:**
- Rejection reason templates
- Comment thread UI
- Bulk approve/reject with filters

**Who wants this:** Admins (faster), Helpers (feedback)

**Revenue/value:** +40% approval speed

---

#### Option D: **Data Quality Controls** 🛡️
**What:** Warn on duplicates, outliers, invalid amounts

**Time to build:** 3 days
**Impact:** Prevent accidental scoring mistakes

**Code needed:**
- Duplicate detection (same score within 5 min)
- Outlier warnings (+500pts = "sure?")
- Amount validation (1-999)

**Who wants this:** Everyone (prevents mess-ups)

**Revenue/value:** Stop bad data before it locks in

---

### Tier 2: Should Have (Pick 1-2)

#### Option E: **Quick Templates** 🎯
**What:** Save scoring combos (Red +50 Athletics), apply with 1 click

**Time to build:** 2 days
**Impact:** Most common scores take 1 second

**Code needed:**
- Template store (UI to create/edit)
- Quick apply button
- Usage counter

**Who wants this:** Anyone scoring repeatedly

---

#### Option F: **Event Sessions v2** ⏱️
**What:** Live timer, auto-close after time, status indicators

**Time to build:** 3 days
**Impact:** Prevents late-night scoring creep, more organized

**Code needed:**
- Timer UI (countdown)
- Auto-lock when time expires
- Session status: Pending → Running → Closed

**Who wants this:** Event coordinators

---

#### Option G: **Mobile UX** 📱
**What:** Bigger buttons, vertical layout, touch-friendly on phones

**Time to build:** 3-4 days
**Impact:** Can score from phone at assembly

**Code needed:**
- CSS rewrite (responsive)
- Touch targets 48px+
- PWA manifest (can install as app)

**Who wants this:** Admins on the go

---

#### Option H: **Smart Tag Suggestions** 🧠
**What:** Auto-suggest tags based on reason text

**Time to build:** 2 days
**Impact:** Less clicking, better tagging

**Code needed:**
- Keyword matching (Basketball in reason → suggest Basketball tag)
- Learning from history (you used this combo 5x)

**Who wants this:** Everyone (less friction)

---

### My Recommendation

**If you pick ONE tier 1 feature, pick: Analytics Dashboard**

**Why:**
- Highest business impact (show to school leadership)
- Moderate complexity (1 week)
- Reusable for future reporting
- Makes you look professional

**Then follow with:** Mobile UX (accessibility) + Quick Templates (speed)

---

## Feature Comparison Matrix

| Feature | Time | Impact | Difficulty | User Base |
|---------|------|--------|-----------|-----------|
| **Batch Ops** | 1 wk | 8/10 | Medium | Admins |
| **Analytics** | 1 wk | 9/10 | Medium | Leadership |
| **Mobile UX** | 3-4d | 7/10 | Medium | Everyone |
| **Templates** | 2d | 7/10 | Easy | Admins |
| **Sessions v2** | 3d | 6/10 | Medium | Event coord |
| **Approval v2** | 3d | 7/10 | Medium | Admins/Helpers |
| **Quality Control** | 3d | 8/10 | Medium | Everyone |
| **Smart Tags** | 2d | 6/10 | Easy | Everyone |

---

## Recommended Roadmap (Next 4 Weeks)

### Week 1: Deploy + Foundation
- [x] Deploy to production
- [x] Initialize tags
- [ ] Setup monitoring (track errors, usage)
- [ ] Collect StuGo feedback

### Week 2: Quick Wins
- [ ] Add "Undo last score" button (prominence)
- [ ] Add keyboard shortcuts (?, E for edit, D for delete)
- [ ] Add last sync time display
- [ ] Dark mode toggle

### Week 3: Feature #1 (Pick One)
- [ ] **Analytics Dashboard** (recommended)
  OR
- [ ] **Batch Operations**
  OR
- [ ] **Quality Controls**

### Week 4: Feature #2
- [ ] **Mobile UX** (everyone benefits)
  OR
- [ ] **Quick Templates** (speed)

---

## Decision Framework

**Ask yourself:**

1. **What's the biggest pain point for StuGo right now?**
   - "Scoring each house separately takes too long" → Batch operations
   - "Leadership doesn't know our impact" → Analytics
   - "Too many mistakes" → Quality controls
   - "Admins are overloaded" → Advanced approval

2. **What would generate the most excitement?**
   - Analytics (shows you're organized)
   - Mobile app (modern/cool)
   - Templates (feels faster)

3. **What's the quickest win?**
   - Templates (2 days)
   - Quality controls (3 days)
   - Smart tags (2 days)

4. **What helps everyone vs. just admins?**
   - Mobile UX (everyone)
   - Quality controls (everyone)
   - Analytics (leadership)

---

## Quick Implementation Paths

### Fastest Route (4 days)
1. Smart tags (2d)
2. Quick templates (2d)
3. Deploy
4. Gather feedback

### Best Impact (14 days)
1. Quality controls (3d)
2. Analytics dashboard (7d)
3. Mobile UX (3d)
4. Deploy
5. Monitor + iterate

### Most Professional (10 days)
1. Analytics dashboard (7d)
2. Advanced approval workflow (3d)
3. Deploy
4. Show board

---

## Where to Start

**Option 1: Let's Build Analytics Dashboard**
```
Start Monday morning:
- Select Chart.js (lightweight)
- Build monthly aggregation query
- Create 4 charts (by house, by tag, top scorers, trend)
- Deploy Friday
- Show board next week
```

**Option 2: Let's Build Batch Operations**
```
Start Monday morning:
- Build CSV parser
- Add validation rules
- Create UI for bulk scoring
- Test edge cases
- Deploy Friday
- StuGo loves the speed
```

**Option 3: Let's Build Mobile + Quick Wins**
```
Start Monday morning:
- Fix responsive CSS
- Make buttons bigger
- Add PWA manifest
- Add keyboard shortcuts
- Deploy Wednesday
- It's ready to use
```

---

## My Vote

**Go with Analytics Dashboard** because:

✅ Highest business impact (show leadership)
✅ Most professional appearance
✅ Foundation for future reports
✅ Everyone wants data
✅ Reasonable scope (1 week)
✅ You learn charting + queries

**Then Mobile UX** because:
✅ Everyone benefits
✅ Modern feel (impressive)
✅ Enables off-device scoring

**Then Quick Templates** because:
✅ Easiest to build (2 days)
✅ Everyone appreciates speed

---

## What You Need to Know

### Chart.js Setup (for Analytics)
```javascript
// NPM install (already have)
npm install chart.js

// In control.js
import Chart from 'chart.js/auto';

// Create chart
new Chart(canvasElement, {
  type: 'doughnut',
  data: { /* your data */ },
  options: { /* config */ }
});
```

### CSV Parser (for Batch Ops)
```javascript
// Use existing CSV.js or write simple parser
const parseCSV = (text) => {
  return text.split('\n').map(line =>
    line.split(',').map(v => v.trim())
  );
};
```

### PWA Manifest (for Mobile)
```json
{
  "name": "ALA House Points",
  "short_name": "Points",
  "start_url": "/web/control/",
  "display": "standalone",
  "icons": [...]
}
```

---

## Decision Time

**Pick one to build next:**

1. ✅ **Analytics Dashboard** (impact)
2. ✅ **Batch Operations** (speed)
3. ✅ **Mobile UX** (accessibility)
4. ✅ **Quality Controls** (reliability)
5. ✅ **Advanced Approval** (experience)

---

**They're all good. Pick which one makes you most excited.**
