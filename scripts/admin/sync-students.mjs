import admin from "firebase-admin";
import { google } from "googleapis";
import crypto from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const argv = process.argv.slice(2);
const showHelp = argv.includes("--help") || argv.includes("-h");
const apply = argv.includes("--apply");
const purgeMissing = argv.includes("--purge-missing");
const projectId = process.env.FIREBASE_PROJECT_ID || "ala-house-leaderboard";
const firebaseToolsConfigPath = path.join(os.homedir(), ".config", "configstore", "firebase-tools.json");

function getArgValue(flag, fallback = "") {
  const matched = argv.find(item => item.startsWith(`${flag}=`));
  if (!matched) return fallback;
  return matched.slice(flag.length + 1);
}

const sheetId = getArgValue("--sheet-id", process.env.GOOGLE_SHEET_ID || process.env.SHEET_ID || "");
const sheetTab = getArgValue("--sheet-tab", process.env.GOOGLE_STUDENT_SHEET_TAB || "Student Houses");
const readRange = getArgValue("--read-range", `${sheetTab}!A:Z`);
const collectionPath = getArgValue("--collection", "studentDirectory");
const rowLimit = Number.parseInt(getArgValue("--limit", "0"), 10);

if (showHelp) {
  console.log(`
Usage:
  node scripts/admin/sync-students.mjs [--sheet-id=<id>] [--sheet-tab="Student Houses"] [--read-range="Student Houses!A:Z"]
  node scripts/admin/sync-students.mjs --apply
  node scripts/admin/sync-students.mjs --apply --purge-missing

Flags:
  --sheet-id=<id>         Google Sheet ID (or set GOOGLE_SHEET_ID)
  --sheet-tab=<name>      Tab name (default: Student Houses)
  --read-range=<A1>       A1 read range (default: <tab>!A:Z)
  --collection=<path>     Firestore collection (default: studentDirectory)
  --limit=<n>             Optional max parsed rows for testing
  --purge-missing         Marks previously known students inactive when missing from sheet
  --apply                 Writes changes (default is dry-run)

Expected columns (case-insensitive, flexible):
  - Student ID (or ID)
  - Name (or Student Name / Full Name, or First Name + Last Name)
  - House
  - Grade (optional)
  - Active/Status (optional)
`);
  process.exit(0);
}

if (!sheetId) {
  console.error("Missing sheet id. Pass --sheet-id=... or set GOOGLE_SHEET_ID.");
  process.exit(1);
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

ensureAdcFromFirebaseCli();

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId
  });
}

const db = admin.firestore();

const HOUSE_ALIASES = {
  red: ["red", "red panda", "red panda house", "panda", "panda house"],
  white: ["white", "polar", "polar house", "white house"],
  blue: ["blue", "grizzly", "grizzly house", "blue house"],
  silver: ["silver", "kodiak", "kodiak house", "gray", "grey", "silver house"]
};

const HOUSE_LABELS = {
  red: "Red Panda House",
  white: "Polar House",
  blue: "Grizzly House",
  silver: "Kodiak House"
};

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeId(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");
}

function normalizeToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeDocId(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}

function hashId(...parts) {
  const hash = crypto.createHash("sha256").update(parts.join("|")).digest("hex");
  return `student_${hash.slice(0, 20)}`;
}

function resolveHouse(houseRaw) {
  const value = normalizeText(houseRaw);
  if (!value) return { houseId: "", houseName: "" };

  for (const [houseId, aliases] of Object.entries(HOUSE_ALIASES)) {
    if (aliases.includes(value)) {
      return { houseId, houseName: HOUSE_LABELS[houseId] };
    }
  }

  return { houseId: "", houseName: "" };
}

function parseBool(value, defaultValue = true) {
  const text = normalizeText(value);
  if (!text) return defaultValue;
  if (["1", "true", "yes", "y", "active", "enrolled"].includes(text)) return true;
  if (["0", "false", "no", "n", "inactive", "withdrawn", "archived"].includes(text)) return false;
  return defaultValue;
}

function buildSearchPrefixes({ name, studentId }) {
  const prefixSet = new Set();

  const sources = [normalizeToken(name), normalizeToken(studentId)]
    .filter(Boolean)
    .flatMap(text => text.split(" ").filter(Boolean));

  sources.forEach(token => {
    const upper = Math.min(token.length, 24);
    for (let i = 2; i <= upper; i += 1) {
      prefixSet.add(token.slice(0, i));
    }
  });

  const fullName = normalizeToken(name).replace(/ /g, "");
  if (fullName.length >= 2) {
    const upper = Math.min(fullName.length, 24);
    for (let i = 2; i <= upper; i += 1) {
      prefixSet.add(fullName.slice(0, i));
    }
  }

  return Array.from(prefixSet).slice(0, 180);
}

function normalizeHeader(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ");
}

function pickHeaderIndex(headers, aliases) {
  for (const alias of aliases) {
    const idx = headers.indexOf(alias);
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseRows(values = []) {
  if (!Array.isArray(values) || !values.length) return [];

  const [headerRow, ...rawRows] = values;
  const headers = headerRow.map(cell => normalizeHeader(cell));

  const idxStudentId = pickHeaderIndex(headers, ["student id", "id", "sis id", "sis number", "student number"]);
  const idxName = pickHeaderIndex(headers, ["name", "student name", "full name"]);
  const idxFirstName = pickHeaderIndex(headers, ["first name", "firstname"]);
  const idxLastName = pickHeaderIndex(headers, ["last name", "lastname"]);
  const idxHouse = pickHeaderIndex(headers, ["house", "house name"]);
  const idxGrade = pickHeaderIndex(headers, ["grade", "grade level"]);
  const idxActive = pickHeaderIndex(headers, ["active", "status", "enrollment status"]);

  if (idxHouse === -1 || (idxName === -1 && idxFirstName === -1 && idxLastName === -1)) {
    throw new Error("Sheet is missing required columns. Need House and either Name or First/Last Name.");
  }

  const rows = [];

  for (const raw of rawRows) {
    if (!Array.isArray(raw)) continue;

    const firstName = idxFirstName >= 0 ? String(raw[idxFirstName] || "").trim() : "";
    const lastName = idxLastName >= 0 ? String(raw[idxLastName] || "").trim() : "";
    const fullFromSplit = `${firstName} ${lastName}`.trim();
    const name = (idxName >= 0 ? String(raw[idxName] || "").trim() : "") || fullFromSplit;
    const studentId = idxStudentId >= 0 ? normalizeId(raw[idxStudentId]) : "";
    const grade = idxGrade >= 0 ? String(raw[idxGrade] || "").trim() : "";
    const active = idxActive >= 0 ? parseBool(raw[idxActive], true) : true;

    if (!name && !studentId) continue;

    const { houseId, houseName } = resolveHouse(raw[idxHouse]);
    if (!houseId) continue;

    const docId = safeDocId(studentId) || hashId(name, grade, houseId);
    rows.push({
      docId,
      name,
      studentId,
      grade,
      houseId,
      houseName,
      active,
      searchPrefixes: buildSearchPrefixes({ name, studentId })
    });
  }

  return rowLimit > 0 ? rows.slice(0, rowLimit) : rows;
}

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({ scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
  const authClient = await auth.getClient();
  return google.sheets({ version: "v4", auth: authClient });
}

function chunk(items, size) {
  const output = [];
  for (let i = 0; i < items.length; i += size) {
    output.push(items.slice(i, i + size));
  }
  return output;
}

async function loadExistingDocIds(collectionRef) {
  const snap = await collectionRef.get();
  return new Set(snap.docs.map(docSnap => docSnap.id));
}

async function applyWrites(collectionRef, rows, shouldPurgeMissing) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const rowChunks = chunk(rows, 350);

  for (const group of rowChunks) {
    const batch = db.batch();
    group.forEach(row => {
      const ref = collectionRef.doc(row.docId);
      batch.set(ref, {
        name: row.name,
        studentId: row.studentId || null,
        grade: row.grade || null,
        houseId: row.houseId,
        houseName: row.houseName,
        active: row.active,
        searchPrefixes: row.searchPrefixes,
        updatedAt: now,
        source: "sync-students-script"
      }, { merge: true });
    });
    await batch.commit();
  }

  if (!shouldPurgeMissing) return { purged: 0 };

  const incomingIds = new Set(rows.map(row => row.docId));
  const existingIds = await loadExistingDocIds(collectionRef);
  const missing = Array.from(existingIds).filter(id => !incomingIds.has(id));

  for (const group of chunk(missing, 350)) {
    const batch = db.batch();
    group.forEach(id => {
      const ref = collectionRef.doc(id);
      batch.set(ref, { active: false, updatedAt: now, source: "sync-students-script-purge" }, { merge: true });
    });
    await batch.commit();
  }

  return { purged: missing.length };
}

async function run() {
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: readRange
  });

  const values = response.data.values || [];
  const rows = parseRows(values);

  const uniqueDocIds = new Set(rows.map(row => row.docId));
  const duplicateCount = rows.length - uniqueDocIds.size;

  const activeRows = rows.filter(row => row.active);
  const byHouse = {
    red: rows.filter(row => row.houseId === "red").length,
    white: rows.filter(row => row.houseId === "white").length,
    blue: rows.filter(row => row.houseId === "blue").length,
    silver: rows.filter(row => row.houseId === "silver").length
  };

  console.log(apply ? "Apply mode: Firestore will be updated." : "Dry-run mode: no Firestore writes.");
  console.log(`Parsed rows: ${rows.length}`);
  console.log(`Active rows: ${activeRows.length}`);
  console.log(`Duplicates by doc id: ${duplicateCount}`);
  console.log(`House counts: red=${byHouse.red}, white=${byHouse.white}, blue=${byHouse.blue}, silver=${byHouse.silver}`);

  if (rows.length) {
    const preview = rows.slice(0, 5).map(row => ({
      docId: row.docId,
      name: row.name,
      studentId: row.studentId,
      houseId: row.houseId,
      grade: row.grade,
      active: row.active,
      prefixCount: row.searchPrefixes.length
    }));
    console.log("Sample rows:");
    console.table(preview);
  }

  if (!apply) {
    console.log("Dry-run complete.");
    return;
  }

  const collectionRef = db.collection(collectionPath);
  const writeResult = await applyWrites(collectionRef, rows, purgeMissing);
  console.log(`Write complete. Upserted ${rows.length} records into ${collectionPath}.`);
  if (purgeMissing) {
    console.log(`Marked ${writeResult.purged} missing records inactive.`);
  }
}

run().catch(error => {
  console.error("sync-students failed:", error.message);
  process.exitCode = 1;
});
