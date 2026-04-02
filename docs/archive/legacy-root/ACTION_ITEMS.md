# Action Items - House Points Redesign

**Last Updated:** 2026-03-29 (UTC)
**Current Phase:** 1 (Schema & Rules)

---

## DO NOW (Today)

### Phase 1: Schema & Rules (IN PROGRESS)
- [ ] Create tag fuzzy matching utility (`web/control/tag-utils.js`)
- [ ] Update Firestore rules for `eventTags` and `tagProposals`
- [ ] Update `pointsEntries` schema with tags field
- [ ] Create tag bootstrap script (`scripts/admin/init-tags.mjs`)
- [ ] Update `scripts/README.md` with tag setup docs
- [ ] Test Firestore indexes

### Phase 2: UI Scoring Redesign (NEXT)
- [ ] Update `web/control/index.html` - New helper scoring card
- [ ] Update `web/control/control.js` - Tag selection + proposal logic
- [ ] Update `web/control/control.css` - New layout + tag styling
- [ ] Test helper scoring flow end-to-end

### Phase 3: Admin Approval Queue (AFTER)
- [ ] Redesign admin view with dual-panel layout
- [ ] Implement approval queue for tag proposals
- [ ] Add bulk approve/reject

---

## Completed (Prior Prompts)

- ✅ Login reset password flow
- ✅ Help modal reliability
- ✅ Student lookup in drawer
- ✅ Sync points from Google Sheet
- ✅ Automatic sync scheduler (GitHub Actions)
- ✅ Superadmin backup manager
- ✅ Role-based permissions (helper, admin, superadmin)

---

## Key Files

| File | Purpose | Status |
|------|---------|--------|
| `firestore.rules` | Security rules | Ready for update |
| `web/control/tag-utils.js` | Fuzzy match logic | To create |
| `web/control/index.html` | UI markup | Ready for redesign |
| `web/control/control.js` | Behavior logic | Ready for refactor |
| `web/control/control.css` | Styling | Ready for redesign |
| `scripts/admin/init-tags.mjs` | Bootstrap tags | To create |
| `REDESIGN_PLAN.md` | Full plan | ✅ Created |

---

## Setup Requirements

Nothing new! All using existing Firebase + Firestore.

---

## Notes

- Do NOT break existing audit log or backup/restore functionality
- Test before deploy: fuzzy matching, schema migration, role gates
- Maintain styling consistency with current UI
- Mobile-first responsive design for tag selector
