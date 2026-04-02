# ALA House Leaderboard - Points Tracking System

**Status:** Active Production Project (stabilized April 2026)

---

## Quick Links

- **Setup Guide:** [`docs/SETUP_GUIDE.md`](docs/SETUP_GUIDE.md) ← **START HERE**
- **Comprehensive Guide:** [`COMPREHENSIVE_IMPLEMENTATION_GUIDE.md`](COMPREHENSIVE_IMPLEMENTATION_GUIDE.md)
- **Action Items:** [`PROJECT_ACTION_ITEMS.md`](PROJECT_ACTION_ITEMS.md)
- **Admin Scripts:** [`scripts/README.md`](scripts/README.md)

---

## What Is This?

A real-time house points leaderboard system for ALA student government. Students can:
- Score points for competitions, assemblies, academic achievements
- Leave comments and notes
- Search by house, tag, or date
- (Admin) Manage users, approve suggestions, sync with Google Sheets
- (Helper Role) Suggest points for admin approval

---

## Quick Start

### First Time? (15 minutes)

1. Read [`docs/SETUP_GUIDE.md`](docs/SETUP_GUIDE.md) thoroughly
   - Set up GCP service account
   - Configure GitHub secrets
   - Deploy Firebase rules

2. Initialize event tags:
   ```bash
   node scripts/admin/init-tags.mjs --apply
   ```

3. Test in browser (Firebase local hosting):
   ```bash
   firebase serve
   # Open: http://localhost:5000/control/
   ```

### Already Set Up?

```bash
firebase serve
# http://localhost:5000/control/
```

### Before Any Push (Safety)

```bash
npm run safety:check
```

This blocks tracked service-account/private-key files before you push.

### GitHub Codespaces + Live Server

```bash
# Open these in the browser when using VS Code Live Server:
# /control.html
# /leaderboard.html
```

---

## Key Features

✅ **Real-Time Scoring**
- Instant point updates across all connected users
- Optional event tags for organization
- Support for place awards (1st-4th)

✅ **Role-Based Access**
- Superadmin: Full control
- Admin: Score, approve suggestions
- Staff: Score directly
- Helper: Suggest points (needs admin approval)

✅ **Google Sheets Sync**
- Automated every 10 minutes (GitHub Actions)
- Manual sync button in app
- Bidirectional mirroring

✅ **Tag System**
- Fuzzy matching: "Basktebal" → "Basketball"
- Custom tags with admin approval
- Usage statistics & grouping

✅ **History & Audit**
- Immutable activity log
- Filterable by house, tag, date, author
- Savepoints & restore functionality

---

## File Structure

```
├── docs/
│   ├── SETUP_GUIDE.md          ← All deployment instructions
│   ├── setup/                  ← Detailed topic guides
│   ├── guides/                 ← How-to articles
│   └── reference/              ← Technical reference & archives
├── web/
│   ├── control/                ← Admin panel
│   │   ├── index.html          (markup)
│   │   ├── control.js          (application logic)
│   │   ├── control.css         (responsive styling)
│   │   └── tag-utils.js        (tag matching utilities)
│   └── leaderboard/            ← Public view
├── scripts/
│   ├── admin/
│   │   ├── init-tags.mjs       (bootstrap tags)
│   │   ├── sync-users.mjs      (user roles)
│   │   ├── sync-students.mjs   (student directory)
│   │   └── auto-sync.mjs       (sheet ↔ firestore)
│   └── README.md               (script details)
├── firestore.rules             ← Security model
├── firebase.json               ← Firebase config
├── .github/workflows/          ← GitHub Actions automation
├── PROJECT_ACTION_ITEMS.md     ← Current open tasks
└── docs/archive/legacy-root/   ← Archived older writeups
```

---

##  Current Status

### ✅ Implemented
- [x] Firestore database & rules
- [x] Firebase Authentication (email/password)
- [x] Password reset flow
- [x] Real-time scoring with live updates
- [x] Helper approval workflow
- [x] Tag system with fuzzy matching
- [x] Google Sheets bi-directional sync
- [x] Automated sync (GitHub Actions)
- [x] Student lookup
- [x] Backup manager (superadmin)
- [x] Role-based permissions
- [x] Activity auditing

### 🔄 Next Phase
- [ ] Test suite
- [ ] UI polish pass
- [ ] Admin dashboard analytics
- [ ] Batch approval UI
- [ ] Mobile app (native React Native)

---

## Deployment

### Local Development (Firebase)
```bash
npm install
firebase login
firebase serve
```

### Local Development (Simple Static Server)
Use the root redirect files:
- `control.html` → `web/control/index.html`
- `leaderboard.html` → `web/leaderboard/index.html`

### Production Deploy
```bash
firebase login
firebase deploy
```

See [`docs/SETUP_GUIDE.md`](docs/SETUP_GUIDE.md) for detailed instructions.

---

## Support

### Common Issues?

See **Troubleshooting** in [`docs/SETUP_GUIDE.md`](docs/SETUP_GUIDE.md)

### How to...

- Set up Google credentials? → `docs/SETUP_GUIDE.md` § GCP Setup (detailed!)
- Fix password reset email? → `docs/SETUP_GUIDE.md` § Troubleshooting
- Load historical data? → `scripts/README.md`
- Manage users/roles? → `scripts/admin/sync-users.mjs`

### Questions?

Open [`PROJECT_ACTION_ITEMS.md`](PROJECT_ACTION_ITEMS.md) - it has all current work.

---

## Technical Stack

- **Frontend:** Vanilla JavaScript (no build step)
- **Backend:** Google Cloud Firestore
- **Auth:** Firebase Authentication
- **Sync:** Google Sheets API + GitHub Actions
- **Hosting:** Firebase Hosting / Cloud Run
- **Security:** Firestore rules with role-based access

---

## License

Internal project for ALA Student Government. Not for public distribution.

---

**Last Updated:** 2026-04-02
**Maintainers:** StuGo Tech Team
