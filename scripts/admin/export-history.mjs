import admin from "firebase-admin";
import { readFileSync, writeFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const projectId = process.env.FIREBASE_PROJECT_ID || "ala-house-leaderboard";
const outDir = path.resolve("backups");
const firebaseToolsConfigPath = path.join(os.homedir(), ".config", "configstore", "firebase-tools.json");

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

  const tmpAdcPath = path.join(os.tmpdir(), "ala-house-leaderboard-firebase-cli-adc.json");
  const adcPayload = {
    type: "authorized_user",
    client_id: process.env.FIREBASE_CLIENT_ID || "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com",
    client_secret: process.env.FIREBASE_CLIENT_SECRET || "j9iVZfS8kkCEFUPaAeJV0sAi",
    refresh_token: refreshToken
  };
  writeFileSync(tmpAdcPath, JSON.stringify(adcPayload, null, 2), "utf8");
  process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpAdcPath;
}

if (!admin.apps.length) {
  ensureAdcFromFirebaseCli();
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId
  });
}

const db = admin.firestore();
const scoresRef = db.doc("leaderboard/scores");

async function run() {
  const snap = await scoresRef.get();
  if (!snap.exists) {
    throw new Error("leaderboard/scores document not found");
  }

  const data = snap.data() || {};
  const payload = {
    exportedAt: new Date().toISOString(),
    projectId,
    path: "leaderboard/scores",
    history: data.history || null,
    lastAction: data.lastAction || null,
    scores: {
      red: data.red ?? 0,
      white: data.white ?? 0,
      blue: data.blue ?? 0,
      silver: data.silver ?? 0
    }
  };

  await fs.mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = path.join(outDir, `history-backup-${stamp}.json`);
  await fs.writeFile(outFile, JSON.stringify(payload, null, 2), "utf8");

  console.log(`Backup written: ${outFile}`);
  console.log(`Commits: ${payload.history?.commits?.length ?? 0}`);
}

run().catch(error => {
  console.error("Export failed:", error.message);
  process.exitCode = 1;
});
