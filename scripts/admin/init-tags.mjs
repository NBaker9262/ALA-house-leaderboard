#!/usr/bin/env node
/**
 * Initialize default event tags in Firestore.
 *
 * Usage:
 *   node scripts/admin/init-tags.mjs
 *   node scripts/admin/init-tags.mjs --apply
 *
 * Default mode is dry-run.
 */

import admin from "firebase-admin";
import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const DRY_RUN = !process.argv.includes("--apply");
const projectId = process.env.FIREBASE_PROJECT_ID || "ala-house-leaderboard";
const firebaseToolsConfigPath = path.join(os.homedir(), ".config", "configstore", "firebase-tools.json");

const DEFAULT_TAGS = [
  { name: "Basketball", category: "Sports", description: "Basketball activity or result" },
  { name: "Volleyball", category: "Sports", description: "Volleyball activity or result" },
  { name: "Girls Varsity", category: "Sports", description: "Girls varsity participation" },
  { name: "Boys Varsity", category: "Sports", description: "Boys varsity participation" },
  { name: "Swimming", category: "Sports", description: "Swimming event participation" },
  { name: "Track & Field", category: "Sports", description: "Track and field participation" },
  { name: "School Assembly", category: "Assemblies", description: "General school assembly points" },
  { name: "Spirit Week", category: "Assemblies", description: "Spirit week participation and wins" },
  { name: "Homecoming", category: "Assemblies", description: "Homecoming event participation" },
  { name: "Pep Rally", category: "Assemblies", description: "Pep rally participation and wins" },
  { name: "Academic Awards", category: "Academic", description: "Academic awards and recognitions" },
  { name: "Honor Roll", category: "Academic", description: "Honor roll recognition" },
  { name: "Scavenger Hunt", category: "Community", description: "Scavenger hunt activity" },
  { name: "RAISE Cards", category: "Community", description: "RAISE card challenge points" },
  { name: "Dress Code", category: "Community", description: "Dress code challenge points" },
  { name: "Lunch Games", category: "Community", description: "Lunch game activity points" },
  { name: "Field Day", category: "Special Events", description: "Field day events and results" },
  { name: "Powder Puff", category: "Special Events", description: "Powder puff event points" },
  { name: "Dance", category: "Special Events", description: "Dance participation or attendance" },
  { name: "School Spirit", category: "Community", description: "General school spirit points" }
];

function normalizeTag(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "");
}

function firebaseCliRefreshToken() {
  try {
    const raw = readFileSync(firebaseToolsConfigPath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed?.tokens?.refresh_token || "";
  } catch {
    return "";
  }
}

function ensureAdcFromFirebaseCli() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return;
  const refreshToken = firebaseCliRefreshToken();
  if (!refreshToken) return;
  const clientId = process.env.FIREBASE_CLIENT_ID || "";
  const clientSecret = process.env.FIREBASE_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) {
    console.warn("Firebase CLI token found, but FIREBASE_CLIENT_ID/FIREBASE_CLIENT_SECRET are missing. Skipping temporary ADC generation.");
    return;
  }

  const tmpAdcPath = path.join(os.tmpdir(), "ala-house-leaderboard-firebase-cli-adc.json");
  const adcPayload = {
    type: "authorized_user",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken
  };
  writeFileSync(tmpAdcPath, JSON.stringify(adcPayload, null, 2), "utf8");
  process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpAdcPath;
}

function validateNoDuplicates(tags) {
  const seen = new Set();
  const duplicates = [];
  for (const tag of tags) {
    const normalized = normalizeTag(tag.name);
    if (!normalized) {
      throw new Error(`Invalid tag name: "${tag.name}"`);
    }
    if (seen.has(normalized)) {
      duplicates.push(tag.name);
    }
    seen.add(normalized);
  }
  if (duplicates.length) {
    throw new Error(`Duplicate normalized tags: ${duplicates.join(", ")}`);
  }
}

async function run() {
  validateNoDuplicates(DEFAULT_TAGS);

  console.log(`📋 Initializing ${DEFAULT_TAGS.length} default tags...`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (preview only)" : "APPLY (writing to Firestore)"}`);

  if (DRY_RUN) {
    DEFAULT_TAGS.forEach(tag => {
      console.log(`✓ ${tag.name} [${tag.category}]`);
    });
    console.log("\n📋 Dry run complete. Use --apply to write tags.");
    return;
  }

  ensureAdcFromFirebaseCli();

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId
    });
  }

  const db = admin.firestore();
  const batch = db.batch();

  DEFAULT_TAGS.forEach(tag => {
    const normalizedName = normalizeTag(tag.name);
    const docId = `tag_${normalizedName}`;
    const ref = db.collection("eventTags").doc(docId);
    const categoryPath = `${tag.category} > General`;

    batch.set(ref, {
      name: tag.name,
      normalizedName,
      description: tag.description,
      category: tag.category,
      subcategory: "General",
      categoryPath,
      approved: true,
      isActive: true,
      archived: false,
      deprecated: false,
      createdBy: "system-init",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      usage: {
        count: 0,
        lastUsed: null,
        byHouse: { red: 0, white: 0, blue: 0, silver: 0 }
      },
      notes: ""
    }, { merge: true });
  });

  await batch.commit();
  console.log(`\n✅ Successfully initialized ${DEFAULT_TAGS.length} tags in Firestore.`);
}

run().catch(error => {
  console.error("❌ init-tags failed:", error?.message || error);
  process.exit(1);
});
