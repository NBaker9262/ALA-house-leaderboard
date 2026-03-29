import admin from "firebase-admin";
import { google } from "googleapis";
import crypto from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const argv = process.argv.slice(2);
const showHelp = argv.includes("--help") || argv.includes("-h");
const apply = argv.includes("--apply");
const purgeStudents = argv.includes("--purge-students");

function getArgValue(flag, fallback = "") {
  const matched = argv.find(item => item.startsWith(`${flag}=`));
  if (!matched) return fallback;
  return matched.slice(flag.length + 1);
}

const DEFAULT_SHEET_ID = "1ko1Hhpbv00xsarwFRMgpt9kT5K7c-6td2h34PqtNJGM";
const projectId = getArgValue("--project-id", process.env.FIREBASE_PROJECT_ID || "ala-house-leaderboard");
const sheetId = getArgValue("--sheet-id", process.env.GOOGLE_SHEET_ID || DEFAULT_SHEET_ID);
const pointsTab = getArgValue("--points-tab", process.env.GOOGLE_POINTS_SHEET_TAB || "Automatic Points");
const studentsTab = getArgValue("--students-tab", process.env.GOOGLE_STUDENTS_SHEET_TAB || "Students");
const scoresPath = getArgValue("--scores-path", "leaderboard/scores");
const firebaseToolsConfigPath = path.join(os.homedir(), ".config", "configstore", "firebase-tools.json");

if (showHelp) {
  console.log(`
Usage:
  node scripts/admin/auto-sync.mjs
  node scripts/admin/auto-sync.mjs --apply

Flags:
  --sheet-id=<id>                 Google Sheet ID
  --points-tab=<name>             Points tab (default: Automatic Points)
  --students-tab=<name>           Students tab (default: Students)
  --scores-path=<collection/doc>  Firestore scores doc path (default: leaderboard/scores)
  --project-id=<id>               Firebase project id
  --purge-students                Mark missing student records inactive (only records from this sync source)
  --apply                         Write changes (default is dry-run)
`);
  process.exit(0);
}

if (!sheetId) {
  console.error("Missing sheet id. Pass --sheet-id=... or set GOOGLE_SHEET_ID.");
  process.exit(1);
}

const HOUSE_IDS = ["red", "white", "blue", "silver"];
const HOUSE_LABELS = {
  red: "Red Panda House",
  white: "Polar House",
  blue: "Grizzly House",
  silver: "Kodiak House"
};

const HOUSE_ALIASES = {
  red: ["red", "red panda", "red panda house", "panda", "panda house"],
  white: ["white", "polar", "polar house", "white house"],
  blue: ["blue", "grizzly", "grizzly house", "blue house"],
  silver: ["silver", "kodiak", "kodiak house", "gray", "grey", "silver house"]
};

const POINT_HEADERS = ["House", "Point Amount", "Reason", "Date", "Sync ID", "Timestamp", "Entered By", "Event", "Game"];

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function titleCase(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function normalizeToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDate(rawDate) {
  return String(rawDate || "").trim();
}

function parsePoints(rawPoints) {
  const text = String(rawPoints || "").replace(/,/g, "").trim();
  if (!text) return 0;
  const points = Number.parseInt(text, 10);
  return Number.isFinite(points) ? points : 0;
}

function parseTimestamp(rawTimestamp, fallbackDate = "") {
  const candidate = String(rawTimestamp || "").trim() || String(fallbackDate || "").trim();
  if (!candidate) {
    const now = Date.now();
    return { raw: new Date(now).toISOString(), ms: now };
  }
  const parsed = Date.parse(candidate);
  if (Number.isFinite(parsed)) {
    return { raw: candidate, ms: parsed };
  }
  const now = Date.now();
  return { raw: new Date(now).toISOString(), ms: now };
}

function resolveHouseId(rawHouse) {
  const normalized = normalizeText(rawHouse);
  if (!normalized) return "";

  for (const houseId of HOUSE_IDS) {
    if (HOUSE_ALIASES[houseId].includes(normalized)) return houseId;
  }

  return "";
}

function parseDocPath(pathValue) {
  const parts = String(pathValue || "").split("/").filter(Boolean);
  if (parts.length !== 2) {
    throw new Error(`Invalid scores path: ${pathValue}. Use collection/doc format, e.g. leaderboard/scores`);
  }
  return parts;
}

function sha(prefix, ...parts) {
  const digest = crypto.createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 18);
  return `${prefix}_${digest}`;
}

function safeDocId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 90);
}

function splitReason(reasonRaw = "") {
  const reason = String(reasonRaw || "").trim();
  if (!reason) return { event: "General", game: "" };
  if (reason.includes("-")) {
    const [left, ...rest] = reason.split("-");
    const event = titleCase(left);
    const game = rest.join("-").trim();
    return { event: event || "General", game };
  }
  const match = reason.match(/^(.*?)\((.*?)\)\s*$/);
  if (match) {
    const event = titleCase(match[1]);
    const game = match[2].trim();
    return { event: event || "General", game };
  }
  return { event: titleCase(reason) || "General", game: "" };
}

function buildSearchPrefixes({ name, studentId }) {
  const prefixSet = new Set();

  const tokens = [normalizeToken(name), normalizeToken(studentId)]
    .filter(Boolean)
    .flatMap(text => text.split(" ").filter(Boolean));

  tokens.forEach(token => {
    const upper = Math.min(token.length, 24);
    for (let i = 2; i <= upper; i += 1) {
      prefixSet.add(token.slice(0, i));
    }
  });

  const compact = normalizeToken(name).replace(/ /g, "");
  if (compact.length >= 2) {
    const upper = Math.min(compact.length, 24);
    for (let i = 2; i <= upper; i += 1) {
      prefixSet.add(compact.slice(0, i));
    }
  }

  return Array.from(prefixSet).slice(0, 180);
}

function mapHouseChange(houseId, points) {
  return {
    red: houseId === "red" ? points : 0,
    white: houseId === "white" ? points : 0,
    blue: houseId === "blue" ? points : 0,
    silver: houseId === "silver" ? points : 0
  };
}

function scoreNumber(source, houseId) {
  const value = Number(source?.[houseId]);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function applyChanges(scores, changes = {}) {
  return {
    red: Math.max(0, scoreNumber(scores, "red") + Number(changes.red || 0)),
    white: Math.max(0, scoreNumber(scores, "white") + Number(changes.white || 0)),
    blue: Math.max(0, scoreNumber(scores, "blue") + Number(changes.blue || 0)),
    silver: Math.max(0, scoreNumber(scores, "silver") + Number(changes.silver || 0))
  };
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

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
  const authClient = await auth.getClient();
  return google.sheets({ version: "v4", auth: authClient });
}

function hasPointsHeader(firstRow = []) {
  const first = normalizeText(firstRow[0]);
  const second = normalizeText(firstRow[1]);
  return first === "house" && (second === "point amount" || second === "points");
}

function normalizePointRows(values = []) {
  const rows = Array.isArray(values) ? values : [];
  const hasHeader = rows.length > 0 && hasPointsHeader(rows[0]);
  const start = hasHeader ? 1 : 0;

  const normalized = [];
  for (let i = start; i < rows.length; i += 1) {
    const row = rows[i] || [];
    const rowNumber = i + 1;
    const houseId = resolveHouseId(row[0]);
    const points = parsePoints(row[1]);
    if (!houseId || !Number.isFinite(points) || points === 0) continue;

    const reason = String(row[2] || "Manual entry").trim() || "Manual entry";
    const date = parseDate(row[3]);
    const timestampRaw = String(row[5] || "").trim();
    const enteredBy = String(row[6] || "sheet-import").trim() || "sheet-import";

    const split = splitReason(reason);
    const event = String(row[7] || split.event || "General").trim() || "General";
    const game = String(row[8] || split.game || "").trim();

    let syncId = String(row[4] || "").trim();
    if (!syncId) {
      syncId = sha("sh", rowNumber, houseId, points, reason, date, timestampRaw, enteredBy);
    }

    const timestamp = parseTimestamp(timestampRaw, date);

    normalized.push({
      rowNumber,
      houseId,
      points,
      reason,
      date,
      timestampRaw: timestamp.raw,
      timestampMs: timestamp.ms,
      enteredBy,
      event,
      game,
      syncId
    });
  }

  return normalized;
}

function pointsRowToSheetValues(row) {
  return [
    HOUSE_LABELS[row.houseId] || row.houseId,
    String(row.points),
    row.reason || "Manual entry",
    row.date || "",
    row.syncId || "",
    row.timestampRaw || "",
    row.enteredBy || "sheet-import",
    row.event || "General",
    row.game || ""
  ];
}

function buildKnownSyncIdSet(auditDocs = []) {
  const known = new Set();
  auditDocs.forEach(doc => {
    const single = String(doc.sheetSyncId || "").trim();
    if (single) known.add(single);
    if (Array.isArray(doc.sheetSyncIds)) {
      doc.sheetSyncIds.forEach(item => {
        const id = String(item || "").trim();
        if (id) known.add(id);
      });
    }
  });
  return known;
}

function isExportableAuditType(type) {
  return ["delta", "place_awards", "proposal_approved", "reset", "restore_savepoint"].includes(String(type || ""));
}

async function syncPoints({ sheets, scoresRef, applyWrites }) {
  const readRange = `${pointsTab}!A:I`;
  const response = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: readRange });
  const existingValues = response.data.values || [];
  const pointRows = normalizePointRows(existingValues);

  const auditSnap = await scoresRef.collection("auditLog").orderBy("createdAtMs", "asc").limit(5000).get();
  const auditDocs = auditSnap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
  const knownSyncIds = buildKnownSyncIdSet(auditDocs);

  const toImport = pointRows.filter(row => !knownSyncIds.has(row.syncId));
  const importTotals = { red: 0, white: 0, blue: 0, silver: 0 };

  const nowMs = Date.now();
  let importedRows = 0;

  if (applyWrites && toImport.length) {
    let batch = db.batch();
    let ops = 0;

    for (const row of toImport) {
      const docId = safeDocId(`sheet_${row.syncId}`) || sha("sheet", row.syncId);
      const entryRef = scoresRef.collection("auditLog").doc(docId);
      const changes = mapHouseChange(row.houseId, row.points);
      const summary = `${HOUSE_LABELS[row.houseId]} ${row.points > 0 ? "+" : ""}${row.points} · [${row.reason}]`;

      batch.set(entryRef, {
        type: "delta",
        status: "applied",
        summary,
        actorEmail: row.enteredBy,
        actorUid: "sheet-sync",
        reason: row.reason,
        notes: "Imported from Google Sheet",
        context: {
          categoryId: "sheet_import",
          categoryName: "Sheet Import",
          eventId: safeDocId(row.event) || "general",
          eventName: row.event || "General",
          subeventId: safeDocId(row.game || "general") || "general",
          subeventName: row.game || "General",
          pathLabel: `Sheet Import > ${row.event || "General"} > ${row.game || "General"}`
        },
        changes,
        createdAtMs: row.timestampMs,
        createdAt: admin.firestore.Timestamp.fromMillis(row.timestampMs),
        source: "google-sheet",
        sheetSyncId: row.syncId,
        sheetDirection: "sheet_to_firestore",
        sheetTab: pointsTab,
        sheetRowNumber: row.rowNumber,
        importedAtMs: nowMs
      }, { merge: true });

      importTotals[row.houseId] += row.points;
      importedRows += 1;
      knownSyncIds.add(row.syncId);
      ops += 1;

      if (ops >= 420) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }

    if (ops > 0) await batch.commit();
  }

  if (applyWrites && importedRows > 0) {
    await db.runTransaction(async transaction => {
      const snap = await transaction.get(scoresRef);
      const current = snap.exists ? snap.data() : {};
      const nextScores = applyChanges({
        red: scoreNumber(current, "red"),
        white: scoreNumber(current, "white"),
        blue: scoreNumber(current, "blue"),
        silver: scoreNumber(current, "silver")
      }, importTotals);

      transaction.set(scoresRef, {
        ...nextScores,
        lastAction: {
          type: "sheet_sync_import",
          summary: `Sheet import (${importedRows} new row${importedRows === 1 ? "" : "s"})`,
          actorEmail: "sheet-sync-script",
          actorUid: "sheet-sync-script",
          createdAtMs: nowMs,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        }
      }, { merge: true });
    });
  }

  const existingSheetIds = new Set(pointRows.map(row => row.syncId));
  const toExportRows = [];
  const exportAuditUpdates = new Map();

  for (const entry of auditDocs) {
    if (!isExportableAuditType(entry.type)) continue;
    if (String(entry.source || "") === "google-sheet") continue;
    const changes = entry.changes || {};

    for (const houseId of HOUSE_IDS) {
      const delta = Number(changes[houseId] || 0);
      if (!Number.isFinite(delta) || delta === 0) continue;
      const syncId = `fs_${entry.id}_${houseId}`;
      if (existingSheetIds.has(syncId)) continue;

      const createdMs = Number(entry.createdAtMs || nowMs);
      const dateValue = new Date(createdMs).toLocaleDateString();
      const eventName = String(entry.context?.eventName || "General");
      const subeventName = String(entry.context?.subeventName || "");
      const reason = String(entry.reason || entry.summary || "Control panel update").trim() || "Control panel update";
      const enteredBy = String(entry.actorEmail || "control-panel").trim() || "control-panel";

      toExportRows.push({
        houseId,
        points: delta,
        reason,
        date: dateValue,
        syncId,
        timestampRaw: new Date(createdMs).toISOString(),
        enteredBy,
        event: eventName,
        game: subeventName
      });

      existingSheetIds.add(syncId);
      if (!exportAuditUpdates.has(entry.id)) exportAuditUpdates.set(entry.id, []);
      exportAuditUpdates.get(entry.id).push(syncId);
    }
  }

  const mergedRows = [...pointRows, ...toExportRows];
  const outputValues = [POINT_HEADERS, ...mergedRows.map(pointsRowToSheetValues)];

  if (applyWrites) {
    await sheets.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range: `${pointsTab}!A:I`
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${pointsTab}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: outputValues }
    });

    if (exportAuditUpdates.size > 0) {
      let batch = db.batch();
      let ops = 0;
      for (const [auditId, syncIds] of exportAuditUpdates.entries()) {
        const entryRef = scoresRef.collection("auditLog").doc(auditId);
        batch.set(entryRef, {
          sheetSyncIds: admin.firestore.FieldValue.arrayUnion(...syncIds),
          sheetExportedAtMs: nowMs
        }, { merge: true });
        ops += 1;
        if (ops >= 420) {
          await batch.commit();
          batch = db.batch();
          ops = 0;
        }
      }
      if (ops > 0) await batch.commit();
    }
  }

  return {
    readRows: pointRows.length,
    importedRows,
    exportedRows: toExportRows.length,
    finalRows: mergedRows.length
  };
}

function parseStudentsWide(values = []) {
  if (!Array.isArray(values) || values.length < 2) return [];
  const header = values[0] || [];

  const houseColumns = [];
  for (let i = 0; i < header.length; i += 1) {
    const houseId = resolveHouseId(header[i]);
    if (houseId) {
      houseColumns.push({ houseId, gradeCol: i, nameCol: i + 1 });
    }
  }

  if (!houseColumns.length) return [];

  const students = [];
  for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex] || [];
    houseColumns.forEach(mapping => {
      const grade = String(row[mapping.gradeCol] || "").trim();
      const name = String(row[mapping.nameCol] || "").trim();
      if (!name) return;

      const sourceKey = `${mapping.houseId}|${normalizeText(grade)}|${normalizeText(name)}`;
      const docId = sha("stu", sourceKey);

      students.push({
        docId,
        name,
        grade,
        houseId: mapping.houseId,
        houseName: HOUSE_LABELS[mapping.houseId],
        sourceKey,
        searchPrefixes: buildSearchPrefixes({ name, studentId: "" })
      });
    });
  }

  return students;
}

function chunk(array, size) {
  const output = [];
  for (let i = 0; i < array.length; i += size) {
    output.push(array.slice(i, i + size));
  }
  return output;
}

async function syncStudents({ sheets, applyWrites }) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${studentsTab}!A:Z`
  });

  const students = parseStudentsWide(response.data.values || []);
  const now = admin.firestore.FieldValue.serverTimestamp();
  const source = "students-tab-sync";

  if (applyWrites && students.length) {
    for (const group of chunk(students, 350)) {
      const batch = db.batch();
      group.forEach(student => {
        const ref = db.collection("studentDirectory").doc(student.docId);
        batch.set(ref, {
          name: student.name,
          studentId: null,
          grade: student.grade || null,
          houseId: student.houseId,
          houseName: student.houseName,
          active: true,
          source,
          sourceKey: student.sourceKey,
          searchPrefixes: student.searchPrefixes,
          updatedAt: now
        }, { merge: true });
      });
      await batch.commit();
    }

    if (purgeStudents) {
      const existing = await db.collection("studentDirectory").where("source", "==", source).get();
      const importedIds = new Set(students.map(item => item.docId));
      const missing = existing.docs.filter(docSnap => !importedIds.has(docSnap.id));
      for (const group of chunk(missing, 350)) {
        const batch = db.batch();
        group.forEach(docSnap => {
          batch.set(docSnap.ref, { active: false, updatedAt: now }, { merge: true });
        });
        await batch.commit();
      }
    }
  }

  return { importedStudents: students.length };
}

async function run() {
  const mode = apply ? "apply" : "dry-run";
  console.log(`Starting auto sync (${mode}).`);
  console.log(`Sheet: ${sheetId}`);
  console.log(`Points tab: ${pointsTab}`);
  console.log(`Students tab: ${studentsTab}`);

  const sheets = await getSheetsClient();
  const [collectionName, docName] = parseDocPath(scoresPath);
  const scoresRef = db.collection(collectionName).doc(docName);
  const pendingRequestsSnap = await scoresRef.collection("syncRequests").where("status", "==", "queued").limit(25).get();
  const pendingRequests = pendingRequestsSnap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
  console.log(`Queued sync requests: ${pendingRequests.length}`);

  const pointsResult = await syncPoints({ sheets, scoresRef, applyWrites: apply });
  const studentsResult = await syncStudents({ sheets, applyWrites: apply });

  const nowMs = Date.now();
  const summary = {
    pointsResult,
    studentsResult,
    runAtMs: nowMs,
    mode
  };

  console.log(`Points rows read: ${pointsResult.readRows}`);
  console.log(`Points imported to Firestore: ${pointsResult.importedRows}`);
  console.log(`Points exported to Sheet: ${pointsResult.exportedRows}`);
  console.log(`Student rows imported: ${studentsResult.importedStudents}`);

  if (apply) {
    if (pendingRequests.length) {
      let batch = db.batch();
      let ops = 0;
      for (const docSnap of pendingRequestsSnap.docs) {
        batch.set(docSnap.ref, {
          status: "completed",
          processedAtMs: nowMs,
          processedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        ops += 1;
        if (ops >= 420) {
          await batch.commit();
          batch = db.batch();
          ops = 0;
        }
      }
      if (ops > 0) {
        await batch.commit();
      }
    }

    await scoresRef.set({
      sheetSync: {
        lastRunAtMs: nowMs,
        lastRunAt: admin.firestore.FieldValue.serverTimestamp(),
        lastImportedRows: pointsResult.importedRows,
        lastExportedRows: pointsResult.exportedRows,
        lastImportedStudents: studentsResult.importedStudents,
        pointsTab,
        studentsTab,
        mode,
        request: pendingRequests.length
          ? {
              status: "completed",
              processedAtMs: nowMs,
              processedAt: admin.firestore.FieldValue.serverTimestamp(),
              processedCount: pendingRequests.length
            }
          : {
              status: "idle",
              processedAtMs: nowMs,
              processedAt: admin.firestore.FieldValue.serverTimestamp(),
              processedCount: 0
            }
      }
    }, { merge: true });
  }

  console.log("Auto sync complete.");
  if (!apply) {
    console.log("Dry-run only. No writes were committed.");
  }

  return summary;
}

run().catch(error => {
  console.error("Auto sync failed:", error.message);
  process.exitCode = 1;
});
