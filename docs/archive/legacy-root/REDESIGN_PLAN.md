# House Points Control - Redesign Plan

**Date:** 2026-03-29
**Status:** Planning Phase
**Owner:** StuGo Tech

---

## Core Problems to Solve

1. **Event Context is a Gate** - Users must configure complex nested menus before scoring
2. **UI is Cluttered** - Too many controls, sections, and options on one screen
3. **Reason Management is Static** - Hard-coded templates don't adapt to actual usage
4. **Tag System Missing** - No flexible way to organize/search scoring entries
5. **Role Flow is Unclear** - Helpers and admins see same complex interface
6. **No Fuzzy Matching** - Manual tag entry causes duplicates (e.g., "Basketball" vs "Basktebal")

---

## Solution: Tag-Based Scoring with Role-First UI

### Key Design Shifts

#### 1. Event Context → Optional Tag
- **Old:** Nested dropdowns that lock out all scoring until filled
- **New:** Simple tag selector attached to each score entry
- **Implementation:**
  - Move from "Start Context" gate to optional post-score tagging
  - Admin-managed tag catalog in Firestore (`eventTags` collection)
  - "Other" option for one-time/custom tags (creates proposal for admin approval)
  - Fuzzy matching for tag input (handle caps, spaces, typos)

#### 2. Role-First UI Layout
- **Helpers see:** House → Amount → Reason → Tag (optional) → Submit
- **Admins see:** Approval queue (left) + Direct-add scoring (right) + all management tools
- **Superadmin sees:** All of above + Backup manager + Tag management + User/role management

#### 3. Firestore Schema Changes
```
pointsEntries/
  ├── {id}
  │   ├── houseId: string
  │   ├── amount: number
  │   ├── reason: string
  │   ├── tags: [{ id, name, matched }]  // Matched tag IDs, custom tag name
  │   ├── createdBy: string (uid)
  │   ├── createdAt: timestamp
  │   ├── status: "active" | "pending" | "rejected"
  │   ├── notes: string
  │   ├── approvedBy: string (admin uid, if status=active & created by helper)
  │   └── approvalNotes: string

eventTags/
  ├── {id}
  │   ├── name: string
  │   ├── normalized: string (lower, no spaces/punctuation - for fuzzy match)
  │   ├── category: string (Sports, Assemblies, Academic, etc)
  │   ├── createdAt: timestamp
  │   ├── createdBy: string
  │   ├── isActive: boolean
  │   └── usage: { count, lastUsed }

tagProposals/
  ├── {id}
  │   ├── proposedName: string
  │   ├── normalized: string
  │   ├── proposedBy: string (helper uid)
  │   ├── createdAt: timestamp
  │   ├── status: "pending" | "approved" | "rejected"
  │   ├── adminNotes: string
  │   └── approvedTag: string (tagId if approved)
```

#### 4. Firestore Rules
- Helpers can: propose points, suggest new tags (becomes proposal)
- Admins can: approve/reject proposals, add/edit/delete tags, direct-add scores
- Superadmins can: all above + manage users + delete/restore backups

#### 5. UI Reorganization

**Main Workspace (always visible):**
- Workspace tabs: Scoring | History | Approvals | Recent

**Scoring Tab (role-specific):**
- **Helper:** House selector → Amount input → Reason input → Tag selector → Submit
- **Admin:** Left sidebar (approval queue) + Right panel (direct-add like helper but instant)

**History Tab:**
- Timeline grouped by tag with expandable details
- Filters: House, Tag, Date range, Status, Author

**Approvals Tab:**
- Pending suggestions (points, tags) with approve/reject/notes controls
- Bulk approve option

**Recent Tab:**
- Real-time activity feed grouped by session

**Admin Drawer (gear icon):**
- Tag Management (CRUD, bulk import/export)
- User/Role Management
- Settings (score presets, reason templates)
- Backup Manager
- Sync Status

---

## Implementation Roadmap

### Phase 1: Schema & Rules (Priority 1)
- [ ] Add `eventTags` collection with indexed `normalized` field
- [ ] Add `tagProposals` collection
- [ ] Update schema of `pointsEntries` to support tags array
- [ ] Update Firestore rules for helper tag proposals
- [ ] Create Firestore indexes for efficient querying

**Files to change:**
- `firestore.rules` - Add tag/proposal rules
- `scripts/admin/init-tags.mjs` - Bootstrap common tags
- `scripts/README.md` - Document tag setup

### Phase 2: Tag Fuzzy Matching & Utilities (Priority 1)
- [ ] Create fuzzy match function (handle caps, spaces, punctuation)
- [ ] Create tag normalization function
- [ ] Create tag suggestion engine (rank by similarity + usage)
- [ ] Test with real tag names

**Files to create:**
- `web/control/tag-utils.js` - Normalization, fuzzy match, suggestion logic

### Phase 3: UI Redesign - Scoring Panel (Priority 1)
- [ ] Redesign helper scoring flow (vertical card layout)
- [ ] Add tag selector with autocomplete + "Other" option
- [ ] Implement tag proposal flow for custom tags
- [ ] Add visual feedback (pending tag proposal badge)
- [ ] Update styles for role-based view

**Files to change:**
- `web/control/index.html` - Helper scoring card, tag selector
- `web/control/control.js` - Helper flow logic, tag selection/proposal
- `web/control/control.css` - Styling for new layout

### Phase 4: Admin Direct-Add & Approval Queue (Priority 2)
- [ ] Redesign admin scoring view (dual panel: queue + direct-add)
- [ ] Add instant-apply scoring for admins (bypass approval)
- [ ] List approval queue with suggestion details
- [ ] Add bulk approve/reject with notes
- [ ] Add tag proposal approval section

**Files to change:**
- `web/control/index.html` - Admin scoring dual-panel, approval queue
- `web/control/control.js` - Admin scoring, approval queue logic
- `web/control/control.css` - Dual-panel styling

### Phase 5: Tag Management UI (Priority 2)
- [ ] Create tag manager in admin drawer
- [ ] Add CRUD for tags (create, rename, disable, delete)
- [ ] Add bulk import from existing entries
- [ ] Add tag usage stats
- [ ] Add tag category grouping

**Files to change:**
- `web/control/index.html` - Tag manager section
- `web/control/control.js` - Tag CRUD logic
- `web/control/control.css` - Tag manager styling

### Phase 6: History & Filtering (Priority 3)
- [ ] Redesign history view grouped by tag
- [ ] Add tag-based filtering
- [ ] Add tag timeline visualization
- [ ] Export filtered data

**Files to change:**
- `web/control/index.html` - Updated history layout
- `web/control/control.js` - History filtering, grouping
- `web/control/control.css` - History styling

### Phase 7: Sync Updates (Priority 3)
- [ ] Update sync script to handle tags
- [ ] Export tags to Google Sheet
- [ ] Import tag proposals from manual entries in sheet

**Files to change:**
- `scripts/admin/auto-sync.mjs` - Add tag sync logic
- `scripts/README.md` - Document tag sync

### Phase 8: Testing & Cleanup (Priority 3)
- [ ] Test fuzzy matching edge cases
- [ ] Test helper → admin flow end-to-end
- [ ] Test backup/restore with new schema
- [ ] Load test with many tags and entries
- [ ] Visual polish and responsive testing

---

## What Needs Setup

### New Services / Tokens
- None! Using existing Firestore and Firebase Auth

### Configuration Changes
- None yet - will add tag bootstrap script

### GitHub Secrets
- No new secrets needed

### Google Sheet Changes
- Add optional `Tags` column to `Automatic Points` sheet
- Create new `Event Tags` sheet for tag catalog
- Update sync script to import tag definitions

---

## File Changes Summary

### New Files
- `web/control/tag-utils.js` - Tag utilities (fuzzy match, normalize, suggest)
- `scripts/admin/init-tags.mjs` - Bootstrap default tags

### Modified Files
- `firestore.rules` - Add `eventTags` and `tagProposals` rules
- `web/control/index.html` - New scoring UI, tag selector, tag manager
- `web/control/control.js` - Tag logic, role-first flows, approval queue refactor
- `web/control/control.css` - Redesigned layout, tag styling, responsive improvements
- `scripts/admin/auto-sync.mjs` - Add tag sync to sheet and proposals from sheet
- `scripts/README.md` - Document tag setup and usage
- `ROLLING_CHANGELOG_AND_ACTIONS.md` - Update with progress
- `PROJECT_ACTION_ITEMS.md` - Current action items

---

## UI Mockup Concepts

### Helper Scoring Flow
```
┌─ House Selector ─────────────────┐
│ [Select a house...▼]              │
├─ Points ───────────────────────────┤
│ [+50] [+30] [+15] [+10]           │
│ │ Custom amount │                  │
├─ Reason ───────────────────────────┤
│ [Sports | Attendance     ...]      │
├─ Tag (Optional) ────────────────────┤
│ [Select tag...▼]                   │
│ [🔍 Basketball    🏀 3 times]      │
│ [🔍 Volleyball    ⚡ 1 time]       │
│ ─ or create new                    │
│ [Other: _________]                 │
├─ ─────────────────────────────────┤
│ [Submit for Approval]              │
└──────────────────────────────────┘
```

### Admin Approval Queue (Left) + Direct-Add (Right)
```
┌─────────────────────┬──────────────────────┐
│ PENDING (3)         │ DIRECT ADD           │
├─────────────────────┼──────────────────────┤
│ Red Panda +20pts    │ House:   [▼]         │
│ by Jacob Sm...      │ Amount:  [▼]         │
│ Reason: Assembly    │ Reason:  [_______]   │
│ Tag: [+ Athletics]  │ Tag:     [▼]         │
│ [✓ Approve]         │ [✕ Clear]            │
│ [✕ Reject]          │                      │
│ [Notes...]          │ [ADD (instant)]      │
├─────────────────────┤                      │
│ Blue +50pts         │                      │
│ by Emily Ni...      │                      │
│ Reason: Sports      │                      │
│ Tag: [+ Basketball] │                      │
│ [✓ Approve]         │                      │
│ [✕ Reject]          │                      │
│ [Notes...]          │                      │
└─────────────────────┴──────────────────────┘
```

---

## Success Criteria

- [ ] Helpers can score in < 10 clicks without understanding event context
- [ ] Tags are optional but suggested intelligently
- [ ] Fuzzy matching prevents duplicate/misspelled tags (e.g., "Basketball" matches "Basktebal")
- [ ] Admins see approval queue front-and-center
- [ ] Admins can bulk-approve/reject proposals
- [ ] History is filterable by tag with usage stats
- [ ] No breaking changes to existing audit log
- [ ] All UI styled consistently with existing design language
- [ ] Sync to Google Sheet includes tags and tag proposals

---

## Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Schema change breaks existing data | High | Test backup/restore before deploy; add data migration script |
| Fuzzy match too permissive (wrong matches) | Medium | Manual review of matches; admin can override/split tags |
| Tag proposals create spam | Medium | Superadmin approval gate; prevent duplicate proposals |
| Performance with many tags | Medium | Add Firestore indexes; cache tag list in UI state |

---

## Notes

- Keep immutable audit log intact (no changes to existing history)
- Preserve all existing scoring/approval functionality
- Maintain current styling and color scheme
- Test on mobile (tag selector UX on small screens)
- Consider future: tag hierarchies, custom tag categories, scoring rules based on tags
