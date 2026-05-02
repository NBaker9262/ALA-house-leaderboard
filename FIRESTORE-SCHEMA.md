Firestore schema — ALA House Leaderboard

Primary document: `leaderboard/scores` (single doc)

Example structure:

{
  scores: { red: 1200, white: 1100, blue: 900, silver: 850 },
  history: {
    cursor: 42,
    nextId: 1001,
    commits: [
      {
        id: 1,
        summary: "Checkpoint (Pre): Sports Day",
        authorEmail: "admin@example.org",
        timestamp: 1650000000000,
        commitKind: "checkpoint",
        checkpointRole: "pre",
        eventWindowId: "ev_1",
        eventName: "Sports Day",
        scores: { red: 1000, white: 1000, blue: 900, silver: 800 },
        tags: ["sports","varsity"],
        notes: "Pre-checkpoint before awards"
      }
    ],
    openEventWindow: {
      id: "ev_2",
      eventName: "Assembly Awards",
      openedAtMs: 1650001000000,
      preCommitId: 900,
      openedByEmail: "scorer@school.org"
    }
  },
  latestEventSummary: {
    label: "Assembly Awards",
    closedAtMs: 1650002000000,
    actionCount: 5,
    netDelta: { red: 50, white: -10 },
    tags: ["assembly"],
    notes: "Quick awards",
    closedByEmail: "scorer@school.org"
  },
  lastAction: { /* audit */ }
}

Other docs/collections

- `leaderboard/config` (single doc)
  - sheetsWebhookUrl: string
  - notifyFunctionUrl: string
  - notificationRecipients: string (comma-separated)
  - other runtime flags

- `pendingProposals` (collection)
  - Documents representing proposed edits or new event templates
  - Fields: proposerEmail, summary, details, createdAt, status (pending/approved/rejected), resolvedBy, resolvedAt

- `userProfiles` (collection)
  - uid, email, role (superadmin|admin|member|viewer)

Notes

- Keeping everything in a single `leaderboard/scores` doc simplifies snapshotting and transactionality but requires careful concurrency control (transactions already used in control.js).
- `pendingProposals` is suitable as a collection so approvals can be processed independently and audited.
