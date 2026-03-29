import admin from "firebase-admin";
import { google } from "googleapis";
import crypto from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const argv = process.argv.slice(2);
const showHelp = argv.includes("--help") || argv.includes("-h");
const listEvents = argv.includes("--list-events");
const showEventOptions = argv.includes("--event-options");
const dryRun = !argv.includes("--apply");
const projectId = process.env.FIREBASE_PROJECT_ID || "ala-house-leaderboard";
const firebaseToolsConfigPath = path.join(os.homedir(), ".config", "configstore", "firebase-tools.json");

function getArgValue(flag, fallback = "") {
  const matched = argv.find(item => item.startsWith(`${flag}=`));
  if (!matched) return fallback;
  return matched.slice(flag.length + 1);
}

function parseDirection(value) {
  if (value === "sheet-to-firestore" || value === "from-sheet") return "sheet-to-firestore";
  if (value === "firestore-to-sheet" || value === "to-sheet") return "firestore-to-sheet";
  return "sheet-to-firestore";
}

const direction = parseDirection(getArgValue("--direction", "sheet-to-firestore"));
const writeMode = getArgValue("--write-mode", "ledger") === "totals" ? "totals" : "ledger";
const searchEvent = normalizeText(getArgValue("--search-event", ""));
const sheetId = getArgValue("--sheet-id", process.env.GOOGLE_SHEET_ID || process.env.SHEET_ID || "");
const sheetTab = getArgValue("--sheet-tab", process.env.GOOGLE_SHEET_TAB || "Automatic Points");
const readRange = getArgValue("--read-range", `${sheetTab}!A:G`);
const writeRange = getArgValue("--write-range", `${sheetTab}!A1`);
const clearRange = getArgValue("--clear-range", `${sheetTab}!A:G`);
const scoresPath = getArgValue("--scores-path", "leaderboard/scores");
const enteredByDefault = getArgValue("--entered-by-default", "sheet-import").trim() || "sheet-import";

if (showHelp) {
  console.log(`
Usage:
  node scripts/admin/sync-sheet.mjs [--direction=sheet-to-firestore|firestore-to-sheet] [--apply]
  node scripts/admin/sync-sheet.mjs --list-events
  node scripts/admin/sync-sheet.mjs --search-event="assembly"
  node scripts/admin/sync-sheet.mjs --event-options

Examples:
  node scripts/admin/sync-sheet.mjs --direction=sheet-to-firestore
  node scripts/admin/sync-sheet.mjs --direction=sheet-to-firestore --apply
  node scripts/admin/sync-sheet.mjs --direction=firestore-to-sheet --write-mode=ledger
  node scripts/admin/sync-sheet.mjs --direction=firestore-to-sheet --write-mode=totals --apply

Flags:
  --sheet-id=<id>                 Google Sheet id
  --sheet-tab=<tab>               Sheet tab name (default: Automatic Points)
  --read-range=<A1>               Read range (default: <tab>!A:G)
  --write-range=<A1>              Write start range (default: <tab>!A1)
  --clear-range=<A1>              Clear range before write (default: <tab>!A:G)
  --scores-path=<collection/doc>  Firestore path (default: leaderboard/scores)
  --write-mode=ledger|totals      Firestore->sheet output mode (default: ledger)
  --entered-by-default=<name>     Default Entered By when missing (default: sheet-import)
  --list-events                    List canonical events and source variants from sheet
  --search-event=<query>           Search event/game/reason text in sheet rows
  --event-options                  Print built-in canonical event options
  --apply                         Actually write changes (default is dry-run)
`);
  process.exit(0);
}

if (!sheetId && !showEventOptions) {
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

const EVENT_PATTERNS = [
  { event: "Announcements", aliases: ["announcement", "announcements", "anouncement", "anouncements", "anouncemnts", "announcments"] },
  { event: "Assembly", aliases: ["assembly", "assemblies"] },
  { event: "Scavenger Hunt", aliases: ["scavenger hunt", "scavenger"] },
  { event: "RAISE Cards", aliases: ["raise cards", "raise card", "raise"] },
  { event: "Homecoming", aliases: ["homecoming", "hoco", "home coming"] },
  { event: "Dress Code", aliases: ["dress code"] },
  { event: "Academic Awards", aliases: ["academic awards", "academic award"] },
  { event: "Lunch Games", aliases: ["lunch games", "lunch game"] },
  { event: "Powderpuff", aliases: ["powderpuff", "powder puff"] },
  { event: "Dance", aliases: ["dance"] },
  { event: "Spirit Week", aliases: ["spirit week"] }
];

const EVENT_ALIAS_TO_CANONICAL = new Map();
for (const pattern of EVENT_PATTERNS) {
  EVENT_ALIAS_TO_CANONICAL.set(normalizeText(pattern.event), pattern.event);
  for (const alias of pattern.aliases) {
    EVENT_ALIAS_TO_CANONICAL.set(normalizeText(alias), pattern.event);
  }
}

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

function levenshtein(a, b) {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const matrix = Array.from({ length: left.length + 1 }, () => new Array(right.length + 1).fill(0));
  for (let i = 0; i <= left.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[left.length][right.length];
}

function bestEventMatch(rawText) {
  const normalized = normalizeText(rawText);
  if (!normalized) return "";

  if (EVENT_ALIAS_TO_CANONICAL.has(normalized)) {
    return EVENT_ALIAS_TO_CANONICAL.get(normalized) || "";
  }

  let best = { canonical: "", score: Number.POSITIVE_INFINITY };
  for (const [alias, canonical] of EVENT_ALIAS_TO_CANONICAL.entries()) {
    if (normalized.includes(alias) || alias.includes(normalized)) {
      return canonical;
    }

    const score = levenshtein(normalized, alias);
    if (score < best.score) {
      best = { canonical, score };
    }
  }

  const threshold = Math.max(2, Math.floor(normalized.length * 0.2));
  return best.score <= threshold ? best.canonical : "";
}

function splitReasonIntoEventGame(reason) {
  const cleaned = String(reason || "").trim();
  if (!cleaned) {
    return { event: "General", game: "" };
  }

  const canonicalFromWhole = bestEventMatch(cleaned);
  if (canonicalFromWhole && normalizeText(cleaned) === normalizeText(canonicalFromWhole)) {
    return { event: canonicalFromWhole, game: "" };
  }

  if (cleaned.includes("-")) {
    const [left, ...rest] = cleaned.split("-");
    const leftPart = left.trim();
    const rightPart = rest.join("-").trim();
    const event = bestEventMatch(leftPart) || bestEventMatch(cleaned) || titleCase(leftPart) || "General";
    return { event, game: rightPart || "" };
  }

  const parenMatch = cleaned.match(/^(.*?)\((.*?)\)\s*$/);
  if (parenMatch) {
    const base = parenMatch[1].trim();
    const inside = parenMatch[2].trim();
    const event = bestEventMatch(base) || bestEventMatch(cleaned) || titleCase(base) || "General";
    return { event, game: inside || "" };
  }

  const event = bestEventMatch(cleaned);
  if (event) {
    const remaining = cleaned.replace(new RegExp(event, "ig"), "").trim();
    return { event, game: remaining || "" };
  }

  return { event: "General", game: cleaned };
}

function resolveHouseId(rawHouse) {
  const normalized = normalizeText(rawHouse);
  if (!normalized) return "";

  for (const houseId of HOUSE_IDS) {
    if (HOUSE_ALIASES[houseId].includes(normalized)) return houseId;
  }

  return "";
}

function parsePoints(rawPoints) {
  const text = String(rawPoints || "").replace(/,/g, "").trim();
  if (!text) return 0;
  const points = Number.parseInt(text, 10);
  return Number.isFinite(points) ? points : 0;
}

function parseDate(rawDate) {
  const text = String(rawDate || "").trim();
  return text;
}

function parseTimestamp(rawTimestamp, fallbackDate = "") {
  const candidate = String(rawTimestamp || "").trim() || String(fallbackDate || "").trim();
  if (!candidate) {
    return { raw: "", ms: Date.now() };
  }

  const parsed = Date.parse(candidate);
  if (Number.isFinite(parsed)) {
    return { raw: candidate, ms: parsed };
  }

  return { raw: candidate, ms: Date.now() };
}

function isLikelyHeaderRow(firstRow = []) {
  const first = normalizeText(firstRow[0]);
  const second = normalizeText(firstRow[1]);
  if (first !== "house") return false;
  return second === "points" || second === "point amount";
}

function detectSheetFormat(headerRow = []) {
  const normalized = headerRow.map(cell => normalizeText(cell));
  const hasEvent = normalized.includes("event");
  const hasGame = normalized.includes("game");
  const hasReason = normalized.includes("reason");
  return hasEvent || hasGame ? "new" : (hasReason ? "legacy" : "legacy");
}

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
  const authClient = await auth.getClient();
  return google.sheets({ version: "v4", auth: authClient });
}

function parseSheetRows(values = []) {
  if (!Array.isArray(values) || !values.length) return [];

  const dataRows = [...values];
  let format = "legacy";
  if (dataRows.length && isLikelyHeaderRow(dataRows[0])) {
    format = detectSheetFormat(dataRows[0]);
    dataRows.shift();
  }

  const normalizedRows = [];
  for (const [index, row] of dataRows.entries()) {
    const houseId = resolveHouseId(row[0]);
    const points = parsePoints(row[1]);
    let event = "General";
    let game = "";
    let reason = "";
    let date = "";
    let timestampRaw = "";
    let enteredBy = "";

    if (format === "new") {
      event = bestEventMatch(row[2]) || titleCase(String(row[2] || "").trim()) || "General";
      game = String(row[3] || "").trim();
      date = parseDate(row[4]);
      timestampRaw = String(row[5] || "").trim();
      enteredBy = String(row[6] || "").trim() || enteredByDefault;
      reason = [event, game].filter(Boolean).join(" - ") || event;
    } else {
      reason = String(row[2] || "Manual entry").trim() || "Manual entry";
      const split = splitReasonIntoEventGame(reason);
      event = split.event;
      game = split.game;
      date = parseDate(row[3]);
      timestampRaw = String(row[4] || "").trim();
      enteredBy = String(row[5] || "").trim() || enteredByDefault;
    }

    const { raw: timestamp, ms: timestampMs } = parseTimestamp(timestampRaw, date);
    if (!houseId) continue;
    if (!Number.isFinite(points) || points === 0) continue;

    normalizedRows.push({
      rowNumber: index + 2,
      houseId,
      points,
      reason,
      event,
      game,
      date,
      timestamp,
      timestampMs,
      enteredBy
    });
  }

  return normalizedRows;
}

function aggregateTotals(entries) {
  const totals = { red: 0, white: 0, blue: 0, silver: 0 };
  entries.forEach(entry => {
    totals[entry.houseId] += entry.points;
  });
  return totals;
}

function scoreNumber(source, houseId) {
  const value = Number(source?.[houseId]);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function readHistoryState(data = {}) {
  const raw = data.history || {};
  const commits = Array.isArray(raw.commits)
    ? raw.commits
      .filter(commit => commit && commit.scores)
      .map(commit => ({
        id: Number(commit.id) || 0,
        summary: String(commit.summary || "Manual update"),
        authorEmail: String(commit.authorEmail || ""),
        createdAtMs: Number(commit.createdAtMs) || Date.now(),
        scores: {
          red: scoreNumber(commit.scores, "red"),
          white: scoreNumber(commit.scores, "white"),
          blue: scoreNumber(commit.scores, "blue"),
          silver: scoreNumber(commit.scores, "silver")
        }
      }))
    : [];

  const defaultCursor = commits.length - 1;
  const rawCursor = Number.isInteger(raw.cursor) ? raw.cursor : defaultCursor;
  const cursor = Math.max(-1, Math.min(rawCursor, commits.length - 1));
  const nextId = Number.isInteger(raw.nextId) && raw.nextId > 0 ? raw.nextId : commits.length + 1;

  return { commits, cursor, nextId };
}

function normalizeAuditEntry(entry = {}, index = 0) {
  const houseId = resolveHouseId(entry.house || entry.houseId || "");
  if (!houseId) return null;

  const points = parsePoints(entry.points || 0);
  if (!points) return null;

  const reason = String(entry.reason || entry.summary || "Manual entry").trim() || "Manual entry";
  const split = splitReasonIntoEventGame(reason);
  const event = bestEventMatch(entry.event || split.event) || split.event || "General";
  const game = String(entry.game || split.game || "").trim();
  const date = parseDate(entry.date || "");
  const timestampRaw = String(entry.timestamp || "").trim();
  const { raw: timestamp, ms: timestampMs } = parseTimestamp(timestampRaw, date);
  const enteredBy = String(entry.enteredBy || entry.authorEmail || enteredByDefault).trim() || enteredByDefault;

  return {
    rowNumber: Number(entry.rowNumber) || index + 2,
    houseId,
    points,
    reason,
    event,
    game,
    date,
    timestamp,
    timestampMs,
    enteredBy
  };
}

function buildSheetRowsFromAuditEntries(entries = []) {
  return entries.map(entry => [
    HOUSE_LABELS[entry.houseId] || entry.houseId,
    String(entry.points),
    entry.event || "General",
    entry.game || "",
    entry.date || "",
    entry.timestamp || "",
    entry.enteredBy || enteredByDefault
  ]);
}

function buildSheetRowsFromHistory(data = {}, mode = "ledger") {
  const history = readHistoryState(data);

  if (mode === "totals") {
    return HOUSE_IDS.map(houseId => [
      HOUSE_LABELS[houseId],
      String(scoreNumber(data, houseId)),
      "Totals",
      "",
      "",
      new Date().toISOString(),
      "sync-sheet"
    ]);
  }

  if (!history.commits.length) {
    return HOUSE_IDS.map(houseId => [
      HOUSE_LABELS[houseId],
      String(scoreNumber(data, houseId)),
      "Totals",
      "",
      "",
      new Date().toISOString(),
      "sync-sheet"
    ]);
  }

  const rows = [];
  let previous = { red: 0, white: 0, blue: 0, silver: 0 };

  for (const commit of history.commits) {
    for (const houseId of HOUSE_IDS) {
      const delta = scoreNumber(commit.scores, houseId) - scoreNumber(previous, houseId);
      if (delta === 0) continue;
      rows.push([
        HOUSE_LABELS[houseId],
        String(delta),
        "General",
        commit.summary || "History update",
        new Date(commit.createdAtMs).toLocaleDateString(),
        new Date(commit.createdAtMs).toISOString(),
        commit.authorEmail || "sync-sheet"
      ]);
    }

    previous = {
      red: scoreNumber(commit.scores, "red"),
      white: scoreNumber(commit.scores, "white"),
      blue: scoreNumber(commit.scores, "blue"),
      silver: scoreNumber(commit.scores, "silver")
    };
  }

  if (!rows.length) {
    return HOUSE_IDS.map(houseId => [
      HOUSE_LABELS[houseId],
      String(scoreNumber(data, houseId)),
      "Totals",
      "",
      "",
      new Date().toISOString(),
      "sync-sheet"
    ]);
  }

  return rows;
}

function parseDocPath(pathValue) {
  const parts = pathValue.split("/").filter(Boolean);
  if (parts.length !== 2) {
    throw new Error(`Invalid scores path: ${pathValue}. Use collection/doc format, e.g. leaderboard/scores`);
  }
  return parts;
}

function appendHistoryCommit(history, nextScores, summary) {
  let commits = history.commits;
  if (history.cursor < commits.length - 1) {
    commits = commits.slice(0, history.cursor + 1);
  }

  const commit = {
    id: history.nextId,
    summary,
    authorEmail: "sheet-sync-script",
    createdAtMs: Date.now(),
    scores: {
      red: scoreNumber(nextScores, "red"),
      white: scoreNumber(nextScores, "white"),
      blue: scoreNumber(nextScores, "blue"),
      silver: scoreNumber(nextScores, "silver")
    }
  };

  commits = [...commits, commit];

  return {
    commits,
    cursor: commits.length - 1,
    nextId: history.nextId + 1
  };
}

function buildAuditDocId(row) {
  const hash = crypto
    .createHash("sha1")
    .update([
      row.rowNumber,
      row.houseId,
      row.points,
      row.event,
      row.game,
      row.date,
      row.timestamp,
      row.enteredBy
    ].join("|"))
    .digest("hex")
    .slice(0, 24);

  return `sheet-${hash}`;
}

function summarizeEvents(entries = []) {
  const counts = new Map();
  const games = new Map();
  for (const row of entries) {
    const key = row.event || "General";
    counts.set(key, (counts.get(key) || 0) + 1);
    if (row.game) {
      if (!games.has(key)) games.set(key, new Set());
      games.get(key).add(row.game);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([event, count]) => ({
      event,
      count,
      games: [...(games.get(event) || new Set())].sort().slice(0, 8)
    }));
}

async function loadSheetRows() {
  const sheets = await getSheetsClient();
  const readResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: readRange
  });
  return parseSheetRows(readResponse.data.values || []);
}

async function runListEvents() {
  const rows = await loadSheetRows();
  const summary = summarizeEvents(rows);

  console.log(`Found ${summary.length} canonical event(s).`);
  for (const item of summary) {
    console.log(`- ${item.event}: ${item.count} row(s)`);
    if (item.games.length) {
      console.log(`  games: ${item.games.join(" | ")}`);
    }
  }
}

async function runSearchEvent(queryText) {
  const rows = await loadSheetRows();
  const normalizedQuery = normalizeText(queryText);
  if (!normalizedQuery) {
    console.log("Provide a query with --search-event=...");
    return;
  }

  const results = rows.filter(row => {
    const haystack = [row.event, row.game, row.reason].map(normalizeText).join(" ");
    if (haystack.includes(normalizedQuery)) return true;

    const distance = levenshtein(normalizedQuery, normalizeText(row.event));
    const threshold = Math.max(2, Math.floor(normalizedQuery.length * 0.2));
    return distance <= threshold;
  });

  console.log(`Search "${queryText}" matched ${results.length} row(s).`);
  results.slice(0, 80).forEach(row => {
    console.log(`#${row.rowNumber} ${HOUSE_LABELS[row.houseId]} ${row.points > 0 ? "+" : ""}${row.points} | ${row.event} | ${row.game || "(no game)"} | ${row.date || "(no date)"}`);
  });

  if (results.length > 80) {
    console.log(`... and ${results.length - 80} more row(s).`);
  }
}

function runEventOptions() {
  console.log("Canonical event options:");
  EVENT_PATTERNS.forEach(pattern => {
    console.log(`- ${pattern.event} :: aliases: ${pattern.aliases.join(", ")}`);
  });
}

async function runSheetToFirestore() {
  const parsedRows = await loadSheetRows();
  const totals = aggregateTotals(parsedRows);
  const eventSummary = summarizeEvents(parsedRows);

  console.log(`Parsed ${parsedRows.length} spreadsheet row(s).`);
  console.log(`Totals -> red:${totals.red} white:${totals.white} blue:${totals.blue} silver:${totals.silver}`);
  console.log(`Canonical events -> ${eventSummary.map(item => `${item.event}:${item.count}`).join(" | ")}`);

  if (dryRun) {
    console.log("Dry-run mode: Firestore not updated.");
    return;
  }

  const [collectionName, docName] = parseDocPath(scoresPath);
  const scoresRef = db.collection(collectionName).doc(docName);
  const snapshot = await scoresRef.get();
  const current = snapshot.exists ? snapshot.data() : {};
  const history = readHistoryState(current);
  const summary = `Sheet sync import (${parsedRows.length} row${parsedRows.length === 1 ? "" : "s"})`;
  const nextHistory = appendHistoryCommit(history, totals, summary);
  const auditCollectionRef = scoresRef.collection("auditLog");

  let batch = db.batch();
  let ops = 0;
  for (const row of parsedRows) {
    const rowRef = auditCollectionRef.doc(buildAuditDocId(row));
    batch.set(rowRef, {
      source: "google-sheet",
      rowNumber: row.rowNumber,
      house: row.houseId,
      points: row.points,
      reason: row.reason,
      event: row.event,
      game: row.game,
      date: row.date,
      timestamp: row.timestamp,
      timestampMs: row.timestampMs,
      enteredBy: row.enteredBy,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    ops += 1;

    if (ops >= 450) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }

  if (ops > 0) {
    await batch.commit();
  }

  await scoresRef.set({
    red: totals.red,
    white: totals.white,
    blue: totals.blue,
    silver: totals.silver,
    history: nextHistory,
    lastAction: {
      type: "sheet_sync_import",
      summary,
      authorEmail: "sheet-sync-script",
      rowCount: parsedRows.length,
      eventCount: eventSummary.length,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    },
    sheetSync: {
      source: "google-sheets",
      direction: "sheet-to-firestore",
      readRange,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }
  }, { merge: true });

  console.log("Applied sheet totals to Firestore leaderboard document.");
}

async function runFirestoreToSheet() {
  const [collectionName, docName] = parseDocPath(scoresPath);
  const scoresRef = db.collection(collectionName).doc(docName);
  const snapshot = await scoresRef.get();

  if (!snapshot.exists) {
    throw new Error(`Firestore document not found: ${scoresPath}`);
  }

  const data = snapshot.data() || {};
  const auditSnapshot = await scoresRef.collection("auditLog").get();
  const auditEntries = auditSnapshot.docs
    .map((docSnap, index) => normalizeAuditEntry(docSnap.data(), index))
    .filter(Boolean)
    .sort((a, b) => {
      if (a.timestampMs !== b.timestampMs) return a.timestampMs - b.timestampMs;
      return a.rowNumber - b.rowNumber;
    });

  const bodyRows = writeMode === "ledger"
    ? (auditEntries.length ? buildSheetRowsFromAuditEntries(auditEntries) : buildSheetRowsFromHistory(data, "ledger"))
    : buildSheetRowsFromHistory(data, "totals");

  const values = [["House", "Point Amount", "Event", "Game", "Date", "Timestamp", "Entered By"], ...bodyRows];

  console.log(`Prepared ${bodyRows.length} row(s) for spreadsheet write in ${writeMode} mode.`);

  if (dryRun) {
    console.log("Dry-run mode: Spreadsheet not updated.");
    return;
  }

  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.clear({
    spreadsheetId: sheetId,
    range: clearRange
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: writeRange,
    valueInputOption: "RAW",
    requestBody: { values }
  });

  await scoresRef.set({
    sheetSync: {
      source: "google-sheets",
      direction: "firestore-to-sheet",
      writeMode,
      writeRange,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }
  }, { merge: true });

  console.log("Applied Firestore data to Google Sheet.");
}

async function run() {
  if (showEventOptions) {
    runEventOptions();
    return;
  }

  if (listEvents) {
    await runListEvents();
    return;
  }

  if (searchEvent) {
    await runSearchEvent(searchEvent);
    return;
  }

  console.log(dryRun ? "Running dry-run mode." : "Running apply mode.");
  console.log(`Direction: ${direction}`);

  if (direction === "sheet-to-firestore") {
    await runSheetToFirestore();
    return;
  }

  await runFirestoreToSheet();
}

run().catch(error => {
  console.error("Sync failed:", error.message);
  process.exitCode = 1;
});
