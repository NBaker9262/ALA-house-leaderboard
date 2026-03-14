import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getFirestore,
  doc,
  runTransaction,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAAAz2beBA1QnvLPTbaq5LmEnR6m-VvK0s",
  authDomain: "ala-house-leaderboard.firebaseapp.com",
  projectId: "ala-house-leaderboard",
  storageBucket: "ala-house-leaderboard.firebasestorage.app",
  messagingSenderId: "827317744881",
  appId: "1:827317744881:web:c8518ba6523610ab006550"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const scoresDoc = doc(db, "leaderboard", "scores");

const houses = [
  { id: "red", name: "Red Panda House", bg: "#ea0125", text: "#ffffff" },
  { id: "white", name: "Polar House", bg: "#fffeff", text: "#141414" },
  { id: "blue", name: "Grizzly House", bg: "#005ab5", text: "#ffffff" },
  { id: "silver", name: "Kodiak House", bg: "#a7a7aa", text: "#111111" }
];

const QUICK_DELTAS = [10, 20, 50];
const PLACE_POINTS = [50, 30, 15, 10];
const PLACE_BADGES = ["1st", "2nd", "3rd", "4th"];
const MAX_LOG_ENTRIES = 14;
const MAX_HISTORY_COMMITS = 1000;
const HISTORY_LIST_LIMIT = 500;

const dom = {
  loginBox: document.getElementById("loginBox"),
  loginForm: document.getElementById("loginForm"),
  emailInput: document.getElementById("email"),
  passwordInput: document.getElementById("password"),
  signInButton: document.getElementById("emailPassBtn"),
  authError: document.getElementById("authError"),
  mainPanel: document.getElementById("mainPanel"),
  housesContainer: document.getElementById("housesContainer"),
  placeRows: document.getElementById("placeRows"),
  placeHint: document.getElementById("placeHint"),
  placePreview: document.getElementById("placePreview"),
  checkpointName: document.getElementById("checkpointName"),
  checkpointBtn: document.getElementById("checkpointBtn"),
  autoFillBtn: document.getElementById("autoFillBtn"),
  clearPlacesBtn: document.getElementById("clearPlacesBtn"),
  applyPlacesBtn: document.getElementById("applyPlacesBtn"),
  undoBtn: document.getElementById("undoBtn"),
  redoBtn: document.getElementById("redoBtn"),
  resetBtn: document.getElementById("resetBtn"),
  signOutBtn: document.getElementById("signOutBtn"),
  loggedInAs: document.getElementById("loggedInAs"),
  syncStatus: document.getElementById("syncStatus"),
  activityList: document.getElementById("activityList"),
  historyList: document.getElementById("historyList"),
  toastContainer: document.getElementById("toastContainer")
};

let currentScores = null;
let currentHistory = { commits: [], cursor: -1, nextId: 1 };
let activityLog = [];
let lastLoggedActionKey = null;
let pendingWrites = 0;
let currentUserEmail = "";
let shouldWarnBeforeLeave = false;

renderHouseCards();
buildPlaceRows();
setPlaceHint();

function setPlaceHint() {
  dom.placeHint.textContent = PLACE_BADGES
    .map((badge, index) => `${badge} = +${PLACE_POINTS[index]}`)
    .join("  ·  ");
}

function renderHouseCards() {
  dom.housesContainer.innerHTML = "";

  for (const house of houses) {
    const card = document.createElement("article");
    card.className = "card";
    card.dataset.house = house.id;

    card.innerHTML = `
      <header class="card-head" style="--house-bg:${house.bg};--house-text:${house.text}">
        <h3>${house.name}</h3>
        <span class="rank-pill" id="rank-${house.id}">#--</span>
      </header>

      <div class="score-row">
        <div class="points" id="pts-${house.id}">0</div>
        <label class="custom-field" for="custom-${house.id}">
          <span>Custom Amount</span>
          <input id="custom-${house.id}" type="number" min="1" inputmode="numeric" placeholder="Amount" data-action-control>
        </label>
      </div>

      <div class="quick-groups">
        <section class="quick-group">
          <p class="quick-title">ADD</p>
          <div class="quick-buttons" id="add-${house.id}"></div>
        </section>
        <section class="quick-group">
          <p class="quick-title">SUBTRACT</p>
          <div class="quick-buttons" id="sub-${house.id}"></div>
        </section>
      </div>

      <div class="custom-actions">
        <button class="btn btn-primary" type="button" data-action-control data-role="custom-add">Add Custom</button>
        <button class="btn btn-outline" type="button" data-action-control data-role="custom-subtract">Subtract Custom</button>
      </div>
    `;

    const addContainer = card.querySelector(`#add-${house.id}`);
    const subContainer = card.querySelector(`#sub-${house.id}`);

    for (const delta of QUICK_DELTAS) {
      addContainer.appendChild(createDeltaButton(delta));
      subContainer.appendChild(createDeltaButton(-delta));
    }

    const customInput = card.querySelector(`#custom-${house.id}`);
    customInput.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        card.querySelector('[data-role="custom-add"]').click();
      }
    });

    card.addEventListener("click", event => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const deltaButton = target.closest("button[data-delta]");
      if (deltaButton) {
        const delta = Number(deltaButton.dataset.delta);
        void applyDelta(house.id, delta);
        return;
      }

      const actionButton = target.closest("button[data-role]");
      if (!actionButton) return;

      if (actionButton.dataset.role === "custom-add") {
        void applyCustomAmount(house.id, 1);
      }

      if (actionButton.dataset.role === "custom-subtract") {
        void applyCustomAmount(house.id, -1);
      }
    });

    dom.housesContainer.appendChild(card);
  }
}

function createDeltaButton(delta) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.actionControl = "true";
  button.dataset.delta = String(delta);
  button.className = `btn btn-mini ${delta > 0 ? "btn-score-plus" : "btn-score-minus"}`;
  button.textContent = `${delta > 0 ? "+" : ""}${delta}`;
  return button;
}

function buildPlaceRows() {
  dom.placeRows.innerHTML = "";

  PLACE_POINTS.forEach((points, index) => {
    const row = document.createElement("div");
    row.className = "place-row";

    const select = document.createElement("select");
    select.id = `place-${index + 1}`;
    select.className = "place-select";
    select.dataset.actionControl = "true";

    const blankOption = document.createElement("option");
    blankOption.value = "";
    blankOption.textContent = "Select House";
    select.appendChild(blankOption);

    houses.forEach(house => {
      const option = document.createElement("option");
      option.value = house.id;
      option.textContent = house.name;
      select.appendChild(option);
    });

    select.addEventListener("change", () => {
      applySmartPlaceSelection();
      updatePlacePreview();
    });

    row.innerHTML = `
      <span class="place-medal">${PLACE_BADGES[index]}</span>
      <span class="place-pts">+${points} pts</span>
    `;

    row.appendChild(select);
    dom.placeRows.appendChild(row);
  });

  applySmartPlaceSelection();
  updatePlacePreview();
}

function getPlaceSelects() {
  return PLACE_POINTS.map((_, index) => document.getElementById(`place-${index + 1}`)).filter(Boolean);
}

function applySmartPlaceSelection() {
  const selects = getPlaceSelects();
  const selected = new Set(selects.map(select => select.value).filter(Boolean));

  selects.forEach(select => {
    const current = select.value;
    [...select.options].forEach(option => {
      if (!option.value) return;
      option.disabled = selected.has(option.value) && option.value !== current;
    });
  });

  const empties = selects.filter(select => !select.value);
  const remaining = houses.map(house => house.id).filter(id => !selected.has(id));

  if (empties.length === 1 && remaining.length === 1) {
    empties[0].value = remaining[0];
  }
}

function updatePlacePreview() {
  applySmartPlaceSelection();

  const selections = PLACE_POINTS.map((points, index) => ({
    points,
    badge: PLACE_BADGES[index],
    house: document.getElementById(`place-${index + 1}`)?.value || ""
  })).filter(entry => entry.house);

  if (selections.length === 0) {
    dom.placePreview.innerHTML = "";
    return;
  }

  const chips = selections.map(selection => {
    const house = houses.find(candidate => candidate.id === selection.house);
    return `<span class="preview-chip" style="background:${house?.bg};color:${house?.text}">${selection.badge} ${house?.name} <strong>+${selection.points}</strong></span>`;
  }).join("");

  dom.placePreview.innerHTML = `<span class="preview-label">Will award:</span>${chips}`;
}

function setAuthError(message) {
  dom.authError.textContent = message;
  dom.authError.hidden = !message;
}

function mapAuthError(error) {
  const code = error?.code || "";
  if (code === "auth/invalid-credential") return "Incorrect email or password.";
  if (code === "auth/user-disabled") return "This account is disabled.";
  if (code === "auth/too-many-requests") return "Too many attempts. Wait and try again.";
  if (code === "auth/network-request-failed") return "Network error. Check your connection and try again.";
  return "Sign in failed. Please try again.";
}

function showToast(message, tone = "success") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${tone}`;
  toast.textContent = message;
  dom.toastContainer.appendChild(toast);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add("show"));
  });

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 220);
  }, 3000);
}

function scoreNumber(source, houseId) {
  const value = Number(source?.[houseId]);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function scoresFromDoc(data = {}) {
  const values = {};
  for (const house of houses) {
    values[house.id] = scoreNumber(data, house.id);
  }
  return values;
}

function formatClock(date = new Date()) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function setSyncStatus(message, tone = "neutral") {
  dom.syncStatus.textContent = message;
  dom.syncStatus.dataset.tone = tone;
}

function updateBusyState(delta) {
  pendingWrites = Math.max(0, pendingWrites + delta);
  document.body.classList.toggle("is-busy", pendingWrites > 0);
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
        checkpointDelta: commit.checkpointDelta
          ? {
            red: Number(commit.checkpointDelta.red) || 0,
            white: Number(commit.checkpointDelta.white) || 0,
            blue: Number(commit.checkpointDelta.blue) || 0,
            silver: Number(commit.checkpointDelta.silver) || 0
          }
          : null,
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

function writeHistoryState(updates, history) {
  updates.history = {
    commits: history.commits,
    cursor: history.cursor,
    nextId: history.nextId
  };
}

function applySnapshotToUpdates(updates, snapshotScores) {
  for (const house of houses) {
    updates[house.id] = scoreNumber(snapshotScores, house.id);
  }
}

function getDeltaSinceLastCheckpoint(history, scores) {
  let baseline = { red: 0, white: 0, blue: 0, silver: 0 };

  for (let i = history.cursor; i >= 0; i -= 1) {
    const commit = history.commits[i];
    if (commit?.summary?.startsWith("Checkpoint:")) {
      baseline = {
        red: scoreNumber(commit.scores, "red"),
        white: scoreNumber(commit.scores, "white"),
        blue: scoreNumber(commit.scores, "blue"),
        silver: scoreNumber(commit.scores, "silver")
      };
      break;
    }
  }

  return {
    red: scoreNumber(scores, "red") - baseline.red,
    white: scoreNumber(scores, "white") - baseline.white,
    blue: scoreNumber(scores, "blue") - baseline.blue,
    silver: scoreNumber(scores, "silver") - baseline.silver
  };
}

function appendHistoryCommit(history, scores, summary, authorEmail, extras = {}) {
  let commits = history.commits;

  if (history.cursor < commits.length - 1) {
    commits = commits.slice(0, history.cursor + 1);
  }

  const commit = {
    id: history.nextId,
    summary,
    authorEmail: String(authorEmail || ""),
    createdAtMs: Date.now(),
    scores: {
      red: scoreNumber(scores, "red"),
      white: scoreNumber(scores, "white"),
      blue: scoreNumber(scores, "blue"),
      silver: scoreNumber(scores, "silver")
    },
    ...extras
  };

  commits = [...commits, commit];

  if (commits.length > MAX_HISTORY_COMMITS) {
    const overflow = commits.length - MAX_HISTORY_COMMITS;
    commits = commits.slice(overflow);
  }

  return {
    commits,
    cursor: commits.length - 1,
    nextId: history.nextId + 1,
    commit
  };
}

function updateRedoUndoButtons() {
  const canUndo = currentHistory.cursor > 0;
  const canRedo = currentHistory.cursor >= 0 && currentHistory.cursor < currentHistory.commits.length - 1;
  dom.undoBtn.disabled = !canUndo;
  dom.redoBtn.disabled = !canRedo;
}

function renderHistoryList() {
  const { commits, cursor } = currentHistory;

  if (!commits.length) {
    dom.historyList.innerHTML = '<li class="log-empty">No history yet</li>';
    updateRedoUndoButtons();
    return;
  }

  const items = [];
  for (let i = commits.length - 1; i >= 0 && items.length < HISTORY_LIST_LIMIT; i -= 1) {
    const commit = commits[i];
    const isCurrent = i === cursor;
    const scoreText = `R:${commit.scores.red} W:${commit.scores.white} B:${commit.scores.blue} S:${commit.scores.silver}`;
    const authorText = commit.authorEmail ? ` · by ${commit.authorEmail}` : "";
    const deltaText = commit.summary.startsWith("Checkpoint:") && commit.checkpointDelta
      ? ` · since last save R:${commit.checkpointDelta.red > 0 ? "+" : ""}${commit.checkpointDelta.red} W:${commit.checkpointDelta.white > 0 ? "+" : ""}${commit.checkpointDelta.white} B:${commit.checkpointDelta.blue > 0 ? "+" : ""}${commit.checkpointDelta.blue} S:${commit.checkpointDelta.silver > 0 ? "+" : ""}${commit.checkpointDelta.silver}`
      : "";

    items.push(`
      <li class="history-item">
        <div>
          <div>${isCurrent ? "<strong>Current</strong> · " : ""}#${commit.id} ${commit.summary}</div>
          <div class="history-meta">${new Date(commit.createdAtMs).toLocaleString()}${authorText} · ${scoreText}${deltaText}</div>
        </div>
        ${isCurrent ? "" : `<button class=\"btn btn-outline btn-mini\" type=\"button\" data-action-control data-history-index=\"${i}\">Restore</button>`}
      </li>
    `);
  }

  dom.historyList.innerHTML = items.join("");
  updateRedoUndoButtons();
}

function updateLeaveWarningState() {
  const checkpointDraft = dom.checkpointName?.value.trim() || "";
  if (checkpointDraft) {
    shouldWarnBeforeLeave = true;
    return;
  }

  const { commits, cursor } = currentHistory;
  if (!commits.length || cursor < 0 || cursor >= commits.length) {
    shouldWarnBeforeLeave = false;
    return;
  }

  const currentCommit = commits[cursor];
  shouldWarnBeforeLeave = !currentCommit.summary.startsWith("Checkpoint:");
}

async function withWrite(task) {
  updateBusyState(1);
  try {
    const result = await task();
    setSyncStatus(`Live • Last saved ${formatClock()}`, "live");
    return { ok: true, value: result };
  } catch (error) {
    console.error(error);
    setSyncStatus("Save failed. Retry action.", "warn");
    showToast("Unable to save changes right now.", "warn");
    return { ok: false, value: null };
  } finally {
    updateBusyState(-1);
  }
}

async function commitScoreMutation(mutator) {
  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(scoresDoc);
    const data = snapshot.exists() ? snapshot.data() : {};
    const payload = mutator(data);

    if (!payload?.updates) return { applied: false };

    if (snapshot.exists()) {
      transaction.update(scoresDoc, payload.updates);
    } else {
      transaction.set(scoresDoc, payload.updates, { merge: true });
    }

    return payload.response || { applied: true };
  });
}

async function commitWithHistory({ summary, actionMeta, buildScores, authorEmail = currentUserEmail, extrasBuilder = null }) {
  const write = await withWrite(async () => commitScoreMutation(data => {
    const existingScores = scoresFromDoc(data);
    const nextScores = buildScores(existingScores);
    if (!nextScores) return { response: { applied: false } };

    const history = readHistoryState(data);
    const extras = typeof extrasBuilder === "function" ? extrasBuilder(history, nextScores) : {};
    const nextHistory = appendHistoryCommit(history, nextScores, summary, authorEmail, extras);

    const updates = {
      lastAction: {
        ...actionMeta,
        summary,
        authorEmail,
        timestamp: serverTimestamp()
      }
    };

    applySnapshotToUpdates(updates, nextScores);
    writeHistoryState(updates, nextHistory);

    return { updates, response: { applied: true } };
  }));

  return write;
}

async function applyDelta(house, delta) {
  if (!Number.isFinite(delta) || delta === 0) return;

  await commitWithHistory({
    summary: `${findHouseName(house)} ${delta > 0 ? "+" : ""}${delta}`,
    actionMeta: { type: "delta", house, delta },
    buildScores: current => ({
      ...current,
      [house]: Math.max(0, current[house] + delta)
    })
  });
}

function parseCustomInput(houseId) {
  const input = document.getElementById(`custom-${houseId}`);
  const amount = Number.parseInt(input?.value || "", 10);
  if (!Number.isFinite(amount) || amount <= 0) {
    showToast("Enter a custom amount greater than zero.", "warn");
    return null;
  }
  return amount;
}

async function applyCustomAmount(house, direction) {
  const amount = parseCustomInput(house);
  if (amount === null) return;

  await applyDelta(house, amount * direction);

  const input = document.getElementById(`custom-${house}`);
  if (input) input.value = "";
}

async function applyPlaceAwards() {
  const placements = PLACE_POINTS.map((points, index) => ({
    points,
    badge: PLACE_BADGES[index],
    house: document.getElementById(`place-${index + 1}`)?.value || ""
  })).filter(entry => entry.house);

  if (placements.length === 0) {
    showToast("Select at least one place award.", "warn");
    return;
  }

  const selectedHouseIds = placements.map(entry => entry.house);
  if (new Set(selectedHouseIds).size !== selectedHouseIds.length) {
    showToast("Each house can only be selected once.", "warn");
    return;
  }

  const summary = placements
    .map(entry => `${findHouseName(entry.house)} +${entry.points}`)
    .join(" · ");

  const write = await commitWithHistory({
    summary: `Place awards: ${summary}`,
    actionMeta: {
      type: "place_awards",
      changes: placements.map(entry => ({ house: entry.house, delta: entry.points, place: entry.badge }))
    },
    buildScores: current => {
      const next = { ...current };
      placements.forEach(entry => {
        next[entry.house] = scoreNumber(next, entry.house) + entry.points;
      });
      return next;
    }
  });

  if (!write.ok) return;
  clearPlaceSelections();
  showToast("Place awards applied.", "success");
}

function autoFillPlacesByScore() {
  if (!currentScores) {
    showToast("Live scores are still loading.", "warn");
    return;
  }

  const ranked = [...houses].sort((left, right) => scoreNumber(currentScores, right.id) - scoreNumber(currentScores, left.id));
  ranked.forEach((house, index) => {
    const select = document.getElementById(`place-${index + 1}`);
    if (select) select.value = house.id;
  });

  updatePlacePreview();
  showToast("Places auto-filled by current scores.", "info");
}

function clearPlaceSelections() {
  getPlaceSelects().forEach(select => {
    select.value = "";
  });
  updatePlacePreview();
}

async function moveHistoryCursor(direction) {
  const actionType = direction < 0 ? "undo" : "redo";
  const write = await withWrite(async () => commitScoreMutation(data => {
    const history = readHistoryState(data);
    const targetCursor = history.cursor + direction;
    if (targetCursor < 0 || targetCursor >= history.commits.length) {
      return { response: { applied: false } };
    }

    history.cursor = targetCursor;
    const targetCommit = history.commits[targetCursor];

    const updates = {
      lastAction: {
        type: actionType,
        summary: targetCommit.summary,
        commitId: targetCommit.id,
        authorEmail: currentUserEmail,
        timestamp: serverTimestamp()
      }
    };

    applySnapshotToUpdates(updates, targetCommit.scores);
    writeHistoryState(updates, history);

    return { updates, response: { applied: true, summary: targetCommit.summary } };
  }));

  if (!write.ok) return;
  if (!write.value?.applied) {
    showToast(direction < 0 ? "Nothing left to undo." : "Nothing left to redo.", "warn");
    return;
  }

  showToast(`${actionType === "undo" ? "Undid" : "Redid"}: ${write.value.summary}`, "info");
}

async function restoreHistoryIndex(index) {
  const write = await withWrite(async () => commitScoreMutation(data => {
    const history = readHistoryState(data);
    if (!Number.isInteger(index) || index < 0 || index >= history.commits.length) {
      return { response: { applied: false } };
    }

    if (history.cursor === index) {
      return { response: { applied: false } };
    }

    history.cursor = index;
    const targetCommit = history.commits[index];

    const updates = {
      lastAction: {
        type: "restore",
        summary: targetCommit.summary,
        commitId: targetCommit.id,
        authorEmail: currentUserEmail,
        timestamp: serverTimestamp()
      }
    };

    applySnapshotToUpdates(updates, targetCommit.scores);
    writeHistoryState(updates, history);

    return { updates, response: { applied: true, summary: targetCommit.summary } };
  }));

  if (!write.ok || !write.value?.applied) return;
  showToast(`Restored: ${write.value.summary}`, "info");
}

async function resetScores() {
  const confirmed = window.confirm("Reset all house scores to zero?");
  if (!confirmed) return;

  const write = await commitWithHistory({
    summary: "Reset all scores",
    actionMeta: { type: "reset" },
    buildScores: () => ({ red: 0, white: 0, blue: 0, silver: 0 }),
    authorEmail: currentUserEmail
  });

  if (!write.ok) return;
  showToast("All scores reset to zero.", "warn");
}

function addLogEntry(entry) {
  activityLog.unshift(entry);
  if (activityLog.length > MAX_LOG_ENTRIES) activityLog.pop();
  renderActivityLog();
}

function renderActivityLog() {
  if (activityLog.length === 0) {
    dom.activityList.innerHTML = '<li class="log-empty">No activity yet this session</li>';
    return;
  }

  dom.activityList.innerHTML = activityLog
    .map(entry => `<li class="log-entry"><span class="log-time">${entry.time}</span><span>${entry.desc}</span></li>`)
    .join("");
}

function updateRanks(values) {
  const ranked = [...houses].sort((left, right) => scoreNumber(values, right.id) - scoreNumber(values, left.id));

  ranked.forEach((house, index) => {
    const rankElement = document.getElementById(`rank-${house.id}`);
    if (rankElement) rankElement.textContent = `#${index + 1}`;
  });
}

function formatActionDescription(action) {
  if (!action) return "";

  if (action.type === "place_awards" && Array.isArray(action.changes)) {
    return `Place awards: ${action.changes
      .map(change => `${findHouseName(change.house)} +${change.delta} (${change.place})`)
      .join(" · ")}`;
  }

  if (action.type === "undo" || action.type === "redo" || action.type === "restore") {
    return `${action.type.toUpperCase()}: ${action.summary || "snapshot"}${action.authorEmail ? ` (${action.authorEmail})` : ""}`;
  }

  if (action.type === "reset") {
    return `Reset all scores${action.authorEmail ? ` (${action.authorEmail})` : ""}`;
  }

  if (action.house) {
    const delta = Number(action.delta || 0);
    return `${findHouseName(action.house)} ${delta > 0 ? "+" : ""}${delta}${action.authorEmail ? ` (${action.authorEmail})` : ""}`;
  }

  return action.summary || "Score update";
}

function buildActionKey(action) {
  if (!action) return "";

  const stamp = action.timestamp?.seconds
    ? `${action.timestamp.seconds}:${action.timestamp.nanoseconds}`
    : "no-ts";

  return `${action.type || "action"}:${stamp}:${action.summary || ""}:${action.commitId || ""}`;
}

function findHouseName(id) {
  return houses.find(house => house.id === id)?.name || id;
}

async function createNamedCheckpoint() {
  const raw = dom.checkpointName.value.trim();
  if (!raw) {
    showToast("Enter a checkpoint name first.", "warn");
    return;
  }

  const summary = `Checkpoint: ${raw.slice(0, 60)}`;
  const write = await commitWithHistory({
    summary,
    actionMeta: { type: "checkpoint" },
    buildScores: current => ({ ...current }),
    authorEmail: currentUserEmail,
    extrasBuilder: (history, scores) => ({
      checkpointDelta: getDeltaSinceLastCheckpoint(history, scores)
    })
  });

  if (!write.ok) return;
  dom.checkpointName.value = "";
  updateLeaveWarningState();
  showToast("Checkpoint created.", "success");
}

dom.loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  setAuthError("");

  const email = dom.emailInput.value.trim();
  const password = dom.passwordInput.value;

  if (!email || !password) {
    setAuthError("Enter your email and password.");
    return;
  }

  dom.signInButton.disabled = true;
  dom.signInButton.textContent = "Signing In...";

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    setAuthError(mapAuthError(error));
  } finally {
    dom.signInButton.disabled = false;
    dom.signInButton.textContent = "Sign In";
  }
});

dom.signOutBtn.addEventListener("click", () => {
  void signOut(auth);
});

dom.autoFillBtn.addEventListener("click", autoFillPlacesByScore);
dom.clearPlacesBtn.addEventListener("click", clearPlaceSelections);
dom.applyPlacesBtn.addEventListener("click", () => {
  void applyPlaceAwards();
});
dom.undoBtn.addEventListener("click", () => {
  void moveHistoryCursor(-1);
});
dom.redoBtn.addEventListener("click", () => {
  void moveHistoryCursor(1);
});
dom.resetBtn.addEventListener("click", () => {
  void resetScores();
});
dom.checkpointBtn.addEventListener("click", () => {
  void createNamedCheckpoint();
});
dom.checkpointName.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    void createNamedCheckpoint();
  }
});
dom.checkpointName.addEventListener("input", () => {
  updateLeaveWarningState();
});
dom.historyList.addEventListener("click", event => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest("button[data-history-index]");
  if (!button) return;
  const index = Number.parseInt(button.dataset.historyIndex || "", 10);
  void restoreHistoryIndex(index);
});

onSnapshot(
  scoresDoc,
  snapshot => {
    if (!snapshot.exists()) {
      setSyncStatus("No score document found.", "warn");
      return;
    }

    const data = snapshot.data();
    const values = scoresFromDoc(data);

    houses.forEach(house => {
      const pointsElement = document.getElementById(`pts-${house.id}`);
      if (pointsElement) pointsElement.textContent = String(values[house.id]);
    });

    updateRanks(values);

    const history = readHistoryState(data);
    currentHistory = history;
    renderHistoryList();
    updateLeaveWarningState();

    if (currentScores !== null) {
      const action = data.lastAction;
      const key = buildActionKey(action);
      if (key && key !== lastLoggedActionKey) {
        lastLoggedActionKey = key;
        const description = formatActionDescription(action);
        if (description) {
          addLogEntry({
            time: formatClock(),
            desc: description
          });
        }
      }
    }

    currentScores = values;
    setSyncStatus(`Live • Updated ${formatClock()}`, "live");
  },
  error => {
    console.error(error);
    setSyncStatus("Disconnected from live scores.", "warn");
  }
);

onAuthStateChanged(auth, async user => {
  if (!user) {
    dom.loginBox.style.display = "grid";
    dom.mainPanel.style.display = "none";
    dom.passwordInput.value = "";
    return;
  }

  const token = await user.getIdTokenResult();
  if (!token.claims.admin) {
    await signOut(auth);
    setAuthError("This account does not have admin access.");
    return;
  }

  setAuthError("");
  dom.loginBox.style.display = "none";
  dom.mainPanel.style.display = "block";
  currentUserEmail = user.email || "";
  dom.loggedInAs.textContent = currentUserEmail;
  updateLeaveWarningState();
});

window.addEventListener("beforeunload", event => {
  if (!shouldWarnBeforeLeave || dom.mainPanel.style.display !== "block") return;
  event.preventDefault();
  event.returnValue = "";
});
