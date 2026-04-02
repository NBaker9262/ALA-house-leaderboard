# Final Deployment Checklist

**Date:** 2026-03-29
**Status:** Code Complete, Ready for Testing & Deployment

---

## What's Done (100% Complete)

### Core Infrastructure ✅
- [x] Firestore database (active)
- [x] Firebase Authentication
- [x] Security rules with role-based access
- [x] Tag system with fuzzy matching
- [x] Event listeners wired
- [x] Firestore tag loading on auth

### UI/UX ✅
- [x] Admin control panel (1700+ lines of logic)
- [x] Login & password reset flow
- [x] Help modal with keyboard shortcut (?)
- [x] Real-time scoring interface
- [x] Tag selector with autocomplete
- [x] Place awards & position scoring
- [x] Activity history & filtering
- [x] Student lookup
- [x] Approval queue for helpers
- [x] Backup manager (superadmin)

### Backend Automation ✅
- [x] Google Sheets sync script
- [x] GitHub Actions workflow (scheduled every 10 min)
- [x] Student directory sync
- [x] User roles sync
- [x] Tag initialization script

### Documentation ✅
- [x] Complete setup guide with GCP instructions
- [x] Troubleshooting guide
- [x] API script documentation
- [x] Architecture notes

---

## Step-By-Step Deployment

### Phase 1: Local Testing (Today)

```bash
# 1. Test the app locally
firebase serve
# Open: http://localhost:5000/web/control/

# 2. Test login
# Email: (any@test.com)
# Password: (test)
# ✓ Should show login screen

# 3. Test password reset
# Click "Forgot Password?"
# Enter email → Should show "Reset link sent"
# Check email for Firebase reset link

# 4. Test help
# Press "?" key → Help modal opens
# Click "?" again → Modal closes
# Click close button → Also works
```

### Phase 2: Firebase Deployment

```bash
# 1. Deploy security rules
firebase deploy --only firestore:rules
# Expected: ✔ Deploy complete!

# 2. Initialize event tags
node scripts/admin/init-tags.mjs --apply
# Expected: ✓ Successfully created 20 tags

# 3. Verify in Firestore console
# Open: https://console.firebase.google.com
# Project: ala-house-leaderboard
# Check: Firestore → eventTags collection
# Should have 20 documents
```

### Phase 3: GitHub Actions Setup

If not done:

```bash
# 1. Go to GitHub repo
# Settings → Secrets and variables → Actions

# 2. Add three secrets:
# GCP_CREDENTIALS_JSON  (from GCP service account JSON file)
# FIREBASE_PROJECT_ID   (ala-house-leaderboard)
# GOOGLE_SHEET_ID       (1ko1Hhpbv00xsarwFRMgpt9kT5K7c-6td2h34PqtNJGM)

# 3. Test sync workflow
#github Actions → Sheet Auto Sync → Run workflow
# Wait 30 sec → Should complete with ✓
```

### Phase 4: Feature Testing

#### Authentication
- [ ] Login works
- [ ] Password reset email received
- [ ] Password reset link works
- [ ] Help modal opens/closes (? key)
- [ ] Log out works

#### Scoring
- [ ] Select house → add points → appears in real-time
- [ ] Tag selector appears & shows tags
- [ ] Fuzzy matching: type "bask" → finds "Basketball"
- [ ] Typo matching: type "basktebal" → finds "Basketball"
- [ ] Create custom tag → shows "submitted for approval"
- [ ] Admin can approve custom tags

#### Helpers & Approval
- [ ] Login as helper account
- [ ] Can propose points (not direct scoring)
- [ ] Admin sees proposal in approval queue
- [ ] Admin can approve/reject with notes

#### History
- [ ] Points appear in activity history
- [ ] Can filter by date/house/tag
- [ ] Can search by author name
- [ ] Immutable (can't edit history)

#### Sync
- [ ] "Sync Points Now" button appears
- [ ] Shows "Syncing..." status
- [ ] After 5 sec: "Last synced: 1 min ago"
- [ ] Google Sheet has new rows from this session

---

## Testing Script

Create test user accounts (in Firebase console or via script):

```javascript
// Admin user
Email: admin@ala.test
Password: AdminTest123!
Role: admin

// Helper user
Email: helper@ala.test
Password: HelperTest123!
Role: helper

// Staff user
Email: staff@ala.test
Password: StaffTest123!
Role: staff
```

Then in app:
1. Login as each role
2. Verify you can/cannot do actions per permissions
3. Verify scoring shows their name in history

---

## Known Limitations (Document for Users)

- Tags are optional (can score without selecting)
- Custom tags require admin approval
- History is immutable (for audit integrity)
- Backup/restore doesn't include audit log
- Password reset takes 1-2 minutes for email delivery
- Sheet sync runs every 10 minutes (up to 5 min delay)

---

## Performance Targets

- [ ] Page load: < 2 sec
- [ ] Tag search: < 100ms
- [ ] Score submission: < 500ms
- [ ] Real-time update: < 1 sec
- [ ] History load: < 2 sec

---

## Security Checklist

- [x] No secrets in code
- [x] Firebase rules enforce access
- [x] Service account has minimal permissions
- [x] Password reset uses Firebase sendPasswordResetEmail
- [x] Help modal properly focused
- [x] Tags are validated before save
- [x] Audit log immutable
- [x] User roles verified on every action

---

## Go-Live Checklist

1. [ ] All local tests pass
2. [ ] Firestore rules deployed
3. [ ] Event tags initialized
4. [ ] GitHub secrets configured
5. [ ] Sync workflow tested
6. [ ] All user accounts created
7. [ ] Training complete
8. [ ] Backup created (superadmin)
9. [ ] Monitor logs for 24 hours
10. [ ] Lock down Sheet (admin only)

---

## Rollback Plan

If something goes wrong:

1. **App issues?**
   ```bash
   firebase deploy --only hosting | --only firestore:rules
   ```

2. **Data corrupted?**
   ```bash
   App → Admin → Backups → Restore
   ```

3. **Lost data?**
   - Google Sheet has copy (sync from there)
   - Audit log has history

---

## Post-Launch Support

### First Week
- Monitor error logs
- Gather user feedback
- Fix bugs discovered during pilot

### Ongoing
- Weekly backup
- Monthly review of tag usage
- Quarterly feature requests

---

## Questions Before Deployment?

Check:
1. `docs/SETUP_GUIDE.md` - Complete setup instructions
2. `PROJECT_ACTION_ITEMS.md` - Current work
3. `scripts/README.md` - Admin script details

All files in `/docs/` folder have detailed information for every feature.

---

**Ready to deploy? Follow the step-by-step guide above.**
**Questions? See docs/SETUP_GUIDE.md**
