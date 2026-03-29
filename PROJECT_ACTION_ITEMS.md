# Project Action Items

**Last Updated:** 2026-03-29 (UTC)
**Current Phase:** Tag System Implementation + UI Redesign

---

## ACTIVE NOW - Tag System Core (Phase 1)

### ✅ Completed
- [x] Created tag fuzzy matching utility (`web/control/tag-utils.js`)
- [x] Updated Firestore rules for `eventTags` and `tagProposals` collections
- [x] Created tag bootstrap script (`scripts/admin/init-tags.mjs`)
- [x] Updated scripts README with tag setup docs
- [x] Added tag selector UI markup to `web/control/index.html`
- [x] Added tag selector CSS styling to `web/control/control.css`

### 🔄 In Progress Now
- [ ] **Wire tag selector logic in `control.js`**
  - Load tags from Firestore on page load
  - Implement search/filter with fuzzy matching
  - Handle tag selection and deselection
  - Track recently used tags per user
  - Implement tag proposal flow for custom tags

### ⏭️ Next (Phase 2)

#### UI/UX Redesign
- [ ] Create role-specific scoring forms
  - Helper: simple 3-step form (House → Points → Reason → Tag → Submit)
  - Admin: dual-panel (approval queue + direct-add)
  - Superadmin: all above + management tools
- [ ] Reorganize scoring panel layout for clarity
- [ ] Move place awards to collapsible advanced section
- [ ] Simplify event context controls

#### Tag Management (Admin Drawer)
- [ ] Add tag CRUD UI (create, edit, disable, delete)
- [ ] Add bulk tag import from existing reasons
- [ ] Add tag usage statistics
- [ ] Review and approve tag proposals from helpers

#### History & Filtering
- [ ] Update history view to group by tags
- [ ] Add tag-based filtering
- [ ] Show tag usage metrics

#### Sync & Integration
- [ ] Update sync script to handle tags (`scripts/admin/auto-sync.mjs`)
- [ ] Export tags to Google Sheet `Automatic Points` tab
- [ ] Import tag proposals from manual sheet edits

---

## Prerequisites (Setup)

These must be done before Phase 2:
1. [ ] Deploy updated Firestore rules:
   ```bash
   firebase deploy --only firestore:rules
   ```

2. [ ] Initialize default tags:
   ```bash
   node scripts/admin/init-tags.mjs --apply
   ```

3. [ ] GitHub Actions Secrets (if not done already):
   - `GCP_CREDENTIALS_JSON` (service account JSON)
   - `FIREBASE_PROJECT_ID` (ala-house-leaderboard)
   - `GOOGLE_SHEET_ID` (1ko1Hhpbv00xsarwFRMgpt9kT5K7c-6td2h34PqtNJGM)

4. [ ] Share Google Sheet with service account email

---

## Testing & Validation

- [ ] Test tag fuzzy matching (typos, caps, spacing)
- [ ] Test helper tag proposal workflow
- [ ] Test admin tag approval/rejection
- [ ] Test scoring with tags end-to-end
- [ ] Test backup/restore with tag data
- [ ] Verify sync to Google Sheet includes tags
- [ ] Mobile responsiveness on tag selector

---

## Cleanup & Polish

- [ ] Remove old event context nested menu system (after new flow is live)
- [ ] Visual consistency pass across all UI sections
- [ ] Update help modal with tag system explanation
- [ ] Document tag system in admin guide

---

## Reference

- **Detailed rollout guide:** [ROLLING_CHANGELOG_AND_ACTIONS.md](ROLLING_CHANGELOG_AND_ACTIONS.md)
- **Full redesign plan:** [REDESIGN_PLAN.md](REDESIGN_PLAN.md)
- **File locations:**
  - Fuzzy matching: `web/control/tag-utils.js`
  - Firestore rules: `firestore.rules` (lines 125-147)
  - Tag bootstrap: `scripts/admin/init-tags.mjs`
  - UI markup: `web/control/index.html` (lines 93-110)
  - UI styles: `web/control/control.css` (lines 1471-1543)
