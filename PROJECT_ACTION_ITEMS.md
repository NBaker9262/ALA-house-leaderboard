# Project Action Items

Last updated: 2026-04-02 (UTC)
Purpose: rolling checklist to update after each major Codex prompt.

## Done This Pass
- Fixed Codespaces forwarded-port PWA issue by disabling manifest/service-worker on `*.app.github.dev` / `*.github.dev`.
- Added event-first quick scoring:
  - event tag live search with fuzzy matching and custom tag fallback
  - lower-case normalization for event matching
  - fast event chips (`announcements`, `assembly`, `basketball`, etc.)
  - reason step shown only after event selection
- Simplified house card scoring UX:
  - removed repetitive per-card `Tag Score +` button
  - primary flow is now "select amount -> click house"
- Redesigned timeline readability:
  - grouped by event path
  - group-level net delta chips
  - clearer reason/notes visibility per entry
- Reorganized workspace navigation:
  - moved `Scoring / Timeline / Approvals / Recent / Analytics` into hamburger drawer
  - added current workspace strip with quick switch button
- Moved contact/help actions into floating assist buttons (`Help`, `Contact`).
- Hardened UI overlay controls to include workspace drawer open/close handling.
- Added push safety guardrails:
  - new `scripts/admin/prepush-safety-check.mjs`
  - `npm run safety:check`
  - strengthened `.gitignore` patterns for key/credential formats.
- Fixed `web/control/index.html` structure and restored missing `Help` trigger.
- Fixed runtime ID mismatches (`recentReasons`, `helpOpenBtn`) and added safe help handlers.
- Fixed Firestore import gaps in `web/control/control.js` (`addDoc`, `updateDoc`, `increment`).
- Replaced broken blob service-worker registration with stable `./service-worker.js`.
- Simplified and hardened `web/control/service-worker.js`.
- Updated `web/control/manifest.json` to use portable relative URLs.
- Updated `firestore.rules` to align with app collections and auth patterns:
  - `userProfiles/{uid}`
  - `eventTags`
  - `eventTagProposals` (+ backward-compatible `tagProposals`)
  - `contactMessages`
- Added root redirects for local live-server convenience:
  - `control.html`
  - `leaderboard.html`
- Updated `scripts/admin/init-tags.mjs` to use modern ADC + schema-compatible tags.
- Cleaned root clutter by archiving legacy markdowns to `docs/archive/legacy-root/`.
- Removed unused duplicates:
  - `web/manifest.json`
  - `web/control/control-single-file.html`
  - `scripts/admin/bootstrap-tags.mjs`

## Open (Do Next)
1. Deploy Firestore rules:
   - `firebase deploy --only firestore:rules`
2. Initialize event tags in Firestore:
   - `node scripts/admin/init-tags.mjs --apply`
3. Verify GitHub Actions secrets are present:
   - `GCP_CREDENTIALS_JSON`
   - `FIREBASE_PROJECT_ID`
   - `GOOGLE_SHEET_ID`
4. Confirm Google Sheet is shared with service-account `client_email`.
5. Run `Sheet Auto Sync` workflow once manually from GitHub Actions.
6. Smoke-test production:
   - `/control/` login + scoring
   - reset-password email
   - student lookup
   - manual sync request
   - proposal approval
7. Optional UX cleanup phase:
   - remove legacy hidden form fields and old tag modal once event-first scoring is fully accepted
   - split `web/control/control.js` into modules (`workspace`, `scoring`, `history`, `admin`) for maintainability

## Local Run (Codespaces)
- Firebase local hosting:
  - `firebase serve`
  - open `http://localhost:5000/control/`
- VS Code Live Server / static server:
  - open `/control.html`
  - open `/leaderboard.html`

## Reference Files
- Setup: `docs/SETUP_GUIDE.md`
- Full implementation context: `COMPREHENSIVE_IMPLEMENTATION_GUIDE.md`
- Admin script docs: `scripts/README.md`
