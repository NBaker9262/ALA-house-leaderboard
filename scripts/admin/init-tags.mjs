#!/usr/bin/env node
/**
 * init-tags.mjs - Initialize default event tags in Firestore
 *
 * Usage:
 *   node scripts/admin/init-tags.mjs [--apply]
 *
 * With --apply: writes to Firestore
 * Without --apply: dry-run (prints what would be written)
 */

import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const CREDS_PATH = path.join(PROJECT_ROOT, "service-account-key.json");

// Initialize Firebase Admin
if (!fs.existsSync(CREDS_PATH)) {
  console.error("❌ service-account-key.json not found. See scripts/README.md");
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8"));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const db = admin.firestore();
const DRY_RUN = !process.argv.includes("--apply");

// Default event tags organized by category
const DEFAULT_TAGS = [
  // Sports
  {
    name: "Basketball",
    category: "Sports",
    normalized: "basketball",
  },
  {
    name: "Volleyball",
    category: "Sports",
    normalized: "volleyball",
  },
  {
    name: "Girls Varsity",
    category: "Sports",
    normalized: "girlsvarsity",
  },
  {
    name: "Boys Varsity",
    category: "Sports",
    normalized: "boysvarsity",
  },
  {
    name: "Swimming",
    category: "Sports",
    normalized: "swimming",
  },
  {
    name: "Track & Field",
    category: "Sports",
    normalized: "trackfield",
  },

  // Assemblies
  {
    name: "School Assembly",
    category: "Assemblies",
    normalized: "schoolassembly",
  },
  {
    name: "Spirit Week",
    category: "Assemblies",
    normalized: "spiritweek",
  },
  {
    name: "Homecoming",
    category: "Assemblies",
    normalized: "homecoming",
  },
  {
    name: "Pep Rally",
    category: "Assemblies",
    normalized: "peprally",
  },

  // Academic
  {
    name: "Academic Awards",
    category: "Academic",
    normalized: "academicawards",
  },
  {
    name: "Honor Roll",
    category: "Academic",
    normalized: "honorroll",
  },

  // Community
  {
    name: "Scavenger Hunt",
    category: "Community",
    normalized: "scavengerhunt",
  },
  {
    name: "RAISE Cards",
    category: "Community",
    normalized: "raisecards",
  },
  {
    name: "Dress Code",
    category: "Community",
    normalized: "dresscode",
  },
  {
    name: "Lunch Games",
    category: "Community",
    normalized: "lunchgames",
  },

  // Special Events
  {
    name: "Field Day",
    category: "Special Events",
    normalized: "fieldday",
  },
  {
    name: "Powder Puff",
    category: "Special Events",
    normalized: "powderpuff",
  },
  {
    name: "Dance",
    category: "Special Events",
    normalized: "dance",
  },
];

async function initTags() {
  console.log(`📋 Initializing ${DEFAULT_TAGS.length} default tags...`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (preview only)" : "APPLY (writing to Firestore)"}\n`);

  const batch = db.batch();
  let count = 0;

  for (const tag of DEFAULT_TAGS) {
    const tagRef = db.collection("eventTags").doc();
    const tagDoc = {
      name: tag.name,
      category: tag.category,
      normalized: tag.normalized,
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: "system-init",
      usage: {
        count: 0,
        lastUsed: null,
      },
    };

    if (DRY_RUN) {
      console.log(`✓ ${tag.name} [${tag.category}]`);
    } else {
      batch.set(tagRef, tagDoc);
      console.log(`✓ Creating ${tag.name} [${tag.category}] → ${tagRef.id}`);
      count++;
    }
  }

  if (!DRY_RUN) {
    try {
      await batch.commit();
      console.log(`\n✅ Successfully created ${count} tags in Firestore`);
    } catch (err) {
      console.error(`❌ Error writing tags: ${err.message}`);
      process.exit(1);
    }
  } else {
    console.log(`\n📋 Dry run complete. To apply, run with --apply flag`);
  }

  await admin.app().delete();
}

initTags().catch((err) => {
  console.error("❌ Fatal error:", err.message);
  process.exit(1);
});
