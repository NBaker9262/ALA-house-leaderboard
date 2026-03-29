import admin from "firebase-admin";
import { readFileSync, writeFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const projectId = process.env.FIREBASE_PROJECT_ID || "ala-house-leaderboard";
const outDir = path.resolve("backups");
const firebaseToolsConfigPath = path.join(os.homedir(), ".config", "configstore", "firebase-tools.json");
const scoresDocPath = "leaderboard/scores";

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

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function readHistory(data) {
  const raw = data?.history || {};
  const commits = Array.isArray(raw.commits) ? raw.commits : [];
  return {
    commits,
    cursor: Number.isInteger(raw.cursor) ? raw.cursor : commits.length - 1,
    nextId: Number.isInteger(raw.nextId) ? raw.nextId : 1
  };
}

function isTargetDateUtc(createdAtMs) {
  if (!Number.isFinite(createdAtMs)) return false;
  const isoDay = new Date(createdAtMs).toISOString().slice(0, 10);
  return isoDay === "2026-03-13";
}

function isAddedPointsSummary(summary) {
  const text = String(summary || "");
  return /\+[0-9]+/.test(text);
}

async function writeBackup(label, payload) {
  await fs.mkdir(outDir, { recursive: true });
  const filePath = path.join(outDir, `history-${label}-${stamp()}.json`);
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  return filePath;
}

async function run() {
  ensureAdcFromFirebaseCli();

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId
    });
  }

  const db = admin.firestore();
  const scoresRef = db.doc(scoresDocPath);

  const snap = await scoresRef.get();
  if (!snap.exists) throw new Error(`${scoresDocPath} document not found`);

  const before = snap.data() || {};
  const beforeHistory = readHistory(before);

  const preBackup = await writeBackup("rollback-pre", {
    exportedAt: new Date().toISOString(),
    projectId,
    path: scoresDocPath,
    data: before
  });

  const keptCommits = beforeHistory.commits
    .filter(commit => isTargetDateUtc(safeNumber(commit?.createdAtMs)) && isAddedPointsSummary(commit?.summary))
    .sort((a, b) => safeNumber(a.createdAtMs) - safeNumber(b.createdAtMs));

  if (!keptCommits.length) {
    throw new Error("No commits matched 2026-03-13 added-points-only filter.");
  }

  const lastCommit = keptCommits[keptCommits.length - 1];
  const maxId = keptCommits.reduce((m, c) => Math.max(m, safeNumber(c.id)), 0);
  const history = {
    commits: keptCommits,
    cursor: keptCommits.length - 1,
    nextId: maxId + 1
  };

  const nextScores = {
    red: safeNumber(lastCommit?.scores?.red),
    white: safeNumber(lastCommit?.scores?.white),
    blue: safeNumber(lastCommit?.scores?.blue),
    silver: safeNumber(lastCommit?.scores?.silver)
  };

  await scoresRef.set({
    ...nextScores,
    history,
    lastAction: {
      type: "restore_history",
      summary: "Restored to 2026-03-13 added points only",
      authorEmail: "admin-script",
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    }
  }, { merge: true });

  const afterSnap = await scoresRef.get();
  const after = afterSnap.data() || {};

  const postBackup = await writeBackup("rollback-post", {
    exportedAt: new Date().toISOString(),
    projectId,
    path: scoresDocPath,
    data: after
  });

  console.log(`Pre-rollback backup: ${preBackup}`);
  console.log(`Post-rollback backup: ${postBackup}`);
  console.log(`Kept commits: ${keptCommits.length}`);
  console.log(`Final scores: R:${nextScores.red} W:${nextScores.white} B:${nextScores.blue} S:${nextScores.silver}`);
}

run().catch(error => {
  console.error("Rollback failed:", error.message);
  process.exitCode = 1;
});
