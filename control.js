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
  historyFilters: document.getElementById("historyFilters"),
  gameSummaryContent: document.getElementById("gameSummaryContent"),
  gameSummarySubtitle: document.getElementById("gameSummarySubtitle"),
  toastContainer: document.getElementById("toastContainer")
};

let currentScores = null;
let currentHistory = { commits: [], cursor: -1, nextId: 1 };
let activityLog = [];
let lastLoggedActionKey = null;
let pendingWrites = 0;
let currentUserEmail = "";
let shouldWarnBeforeLeave = false;
let historyFilter = "all";
let collapsedGameGroups = new Set();

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

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = String(text);
  return div.innerHTML;
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

function getActionType(commit) {
  const s = commit.summary || "";
  if (s.startsWith("Checkpoint:")) return "checkpoint";
  if (s.startsWith("Place awards:")) return "place";
  if (s === "Reset all scores") return "reset";
  if (s.startsWith("Undo:") || s.startsWith("UNDO:")) return "undo";
  if (s.startsWith("Redo:") || s.startsWith("REDO:")) return "redo";
  if (s.startsWith("Restore:") || s.startsWith("RESTORE:")) return "restore";
  return "delta";
}

function getActionIcon(type) {
  switch (type) {
    case "checkpoint": return "🏁";
    case "place": return "🏆";
    case "reset": return "🔄";
    case "undo": return "↩";
    case "redo": return "↪";
    case "restore": return "⏪";
    default: return "±";
  }
}

function getHouseColor(houseId) {
  const map = { red: "#ea0125", white: "#fffeff", blue: "#005ab5", silver: "#a7a7aa" };
  return map[houseId] || "#999";
}

function getHouseTextColor(houseId) {
  return (houseId === "white" || houseId === "silver") ? "#111" : "#fff";
}

function getHouseShortName(houseId) {
  const map = { red: "Red", white: "Polar", blue: "Grizzly", silver: "Kodiak" };
  return map[houseId] || houseId;
}

function groupCommitsIntoGames(commits) {
  const groups = [];
  let currentGroup = null;

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];
    const isCheckpoint = commit.summary?.startsWith("Checkpoint:");

    if (isCheckpoint) {
      if (currentGroup) {
        currentGroup.endCheckpoint = commit;
        currentGroup.endIndex = i;
        groups.push(currentGroup);
      }
      currentGroup = {
        name: commit.summary.replace("Checkpoint: ", ""),
        startCheckpoint: commit,
        endCheckpoint: null,
        startIndex: i,
        endIndex: i,
        entries: [{ commit, index: i }]
      };
    } else {
      if (!currentGroup) {
        currentGroup = {
          name: "Before First Checkpoint",
          startCheckpoint: null,
          endCheckpoint: null,
          startIndex: i,
          endIndex: i,
          entries: []
        };
      }
      currentGroup.entries.push({ commit, index: i });
      currentGroup.endIndex = i;
    }
  }

  if (currentGroup) {
    groups.push(currentGroup);
  }

  return groups;
}

function computeGameDeltas(group) {
  const first = group.entries[0]?.commit;
  const last = group.entries[group.entries.length - 1]?.commit;
  if (!first || !last) return { red: 0, white: 0, blue: 0, silver: 0 };

  const baseScores = group.startCheckpoint
    ? group.startCheckpoint.scores
    : { red: 0, white: 0, blue: 0, silver: 0 };

  return {
    red: (last.scores.red || 0) - (baseScores.red || 0),
    white: (last.scores.white || 0) - (baseScores.white || 0),
    blue: (last.scores.blue || 0) - (baseScores.blue || 0),
    silver: (last.scores.silver || 0) - (baseScores.silver || 0)
  };
}

function matchesFilter(commit, filter) {
  const type = getActionType(commit);
  switch (filter) {
    case "all": return true;
    case "games": return type === "checkpoint";
    case "points": return type === "delta";
    case "awards": return type === "place";
    default: return true;
  }
}

function renderHistoryEntry(commit, index, cursor) {
  const isCurrent = index === cursor;
  const type = getActionType(commit);
  const icon = getActionIcon(type);

  const scoreChips = houses.map(h => {
    const bg = getHouseColor(h.id);
    const textC = getHouseTextColor(h.id);
    return `<span class="history-score-chip" style="background:${bg};color:${textC}">${getHouseShortName(h.id)}:${commit.scores[h.id]}</span>`;
  }).join("");

  const authorText = commit.authorEmail ? escapeHtml(commit.authorEmail) : "";
  const timeText = new Date(commit.createdAtMs).toLocaleString();

  const currentTag = isCurrent ? `<span class="history-entry-current-tag">CURRENT</span>` : "";
  const restoreBtn = isCurrent ? "" : `<button class="btn btn-outline btn-mini" type="button" data-action-control data-history-index="${index}">Restore</button>`;

  const rawSummary = commit.summary.startsWith("Checkpoint: ")
    ? commit.summary.replace("Checkpoint: ", "")
    : commit.summary;
  const summaryDisplay = escapeHtml(rawSummary);

  return `
    <div class="history-entry">
      <div class="history-entry-icon type-${type}" title="${type}">${icon}</div>
      <div class="history-entry-body">
        <div class="history-entry-title">
          ${currentTag}
          <span>#${commit.id} ${summaryDisplay}</span>
        </div>
        <div class="history-entry-meta">
          <span>${timeText}</span>
          ${authorText ? `<span>· ${authorText}</span>` : ""}
          <span>· </span>
          <span class="history-entry-scores">${scoreChips}</span>
        </div>
      </div>
      <div class="history-entry-actions">${restoreBtn}</div>
    </div>
  `;
}

function renderDeltaChips(deltas) {
  return houses.map(h => {
    const d = deltas[h.id] || 0;
    const bg = getHouseColor(h.id);
    const textC = getHouseTextColor(h.id);
    const sign = d > 0 ? "+" : "";
    return `<span class="game-group-delta-chip" style="background:${bg};color:${textC}">${getHouseShortName(h.id)} ${sign}${d}</span>`;
  }).join("");
}

function renderHistoryList() {
  const { commits, cursor } = currentHistory;

  if (!commits.length) {
    dom.historyList.innerHTML = '<div class="log-empty">No history yet</div>';
    updateRedoUndoButtons();
    renderGameSummary([]);
    return;
  }

  const groups = groupCommitsIntoGames(commits);
  renderGameSummary(groups);

  if (historyFilter === "games") {
    renderCheckpointsOnlyView(commits, cursor);
    updateRedoUndoButtons();
    return;
  }

  let html = "";
  let entryCount = 0;

  for (let g = groups.length - 1; g >= 0 && entryCount < HISTORY_LIST_LIMIT; g--) {
    const group = groups[g];
    const isCheckpointGroup = group.startCheckpoint !== null;
    const groupKey = `game-${g}`;
    const isCollapsed = collapsedGameGroups.has(groupKey);

    const filteredEntries = group.entries.filter(e => matchesFilter(e.commit, historyFilter));
    if (filteredEntries.length === 0 && !isCheckpointGroup) continue;

    if (isCheckpointGroup) {
      const deltas = group.endCheckpoint?.checkpointDelta || computeGameDeltas(group);
      const entryCountInGroup = filteredEntries.length;
      const collapsedClass = isCollapsed ? " collapsed" : "";

      html += `<div class="history-game-group">`;
      html += `<div class="game-group-head${collapsedClass}" data-game-group="${groupKey}">`;
      html += `<span class="game-group-chevron">▼</span>`;
      html += `<span class="game-group-title"><span class="checkpoint-icon">🏁</span>${escapeHtml(group.name)}</span>`;
      html += `<span class="game-group-meta">${entryCountInGroup} action${entryCountInGroup !== 1 ? "s" : ""}</span>`;
      html += `</div>`;

      if (!isCollapsed) {
        html += `<div class="game-group-delta-summary">${renderDeltaChips(deltas)}</div>`;
      }

      html += `<div class="game-group-entries"${isCollapsed ? ' style="display:none"' : ""}>`;

      for (let e = filteredEntries.length - 1; e >= 0 && entryCount < HISTORY_LIST_LIMIT; e--) {
        const { commit, index } = filteredEntries[e];
        html += renderHistoryEntry(commit, index, cursor);
        entryCount++;
      }

      html += `</div></div>`;
    } else {
      for (let e = filteredEntries.length - 1; e >= 0 && entryCount < HISTORY_LIST_LIMIT; e--) {
        const { commit, index } = filteredEntries[e];
        html += renderHistoryEntry(commit, index, cursor);
        entryCount++;
      }
    }
  }

  dom.historyList.innerHTML = html || '<div class="log-empty">No matching history entries</div>';
  updateRedoUndoButtons();
}

function renderCheckpointsOnlyView(commits, cursor) {
  const checkpoints = [];
  let prevCheckpointScores = { red: 0, white: 0, blue: 0, silver: 0 };

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];
    if (commit.summary?.startsWith("Checkpoint:")) {
      const deltas = commit.checkpointDelta || {
        red: (commit.scores.red || 0) - prevCheckpointScores.red,
        white: (commit.scores.white || 0) - prevCheckpointScores.white,
        blue: (commit.scores.blue || 0) - prevCheckpointScores.blue,
        silver: (commit.scores.silver || 0) - prevCheckpointScores.silver
      };

      checkpoints.push({ commit, index: i, deltas });
      prevCheckpointScores = { ...commit.scores };
    }
  }

  if (checkpoints.length === 0) {
    dom.historyList.innerHTML = '<div class="log-empty">No checkpoints/games recorded yet</div>';
    return;
  }

  let html = "";
  for (let c = checkpoints.length - 1; c >= 0; c--) {
    const { commit, index, deltas } = checkpoints[c];
    const isCurrent = index === cursor;
    const gameName = escapeHtml(commit.summary.replace("Checkpoint: ", ""));

    const maxDelta = Math.max(
      Math.abs(deltas.red), Math.abs(deltas.white),
      Math.abs(deltas.blue), Math.abs(deltas.silver), 1
    );

    const deltaBars = houses.map(h => {
      const d = deltas[h.id] || 0;
      const pct = Math.round((Math.abs(d) / maxDelta) * 100);
      const cls = d > 0 ? "positive" : d < 0 ? "negative" : "zero";
      const sign = d > 0 ? "+" : "";
      return `
        <div class="game-delta-bar">
          <div class="game-delta-bar-label">${getHouseShortName(h.id)}</div>
          <div class="game-delta-bar-track">
            <div class="game-delta-bar-fill" style="height:${pct}%;background:${getHouseColor(h.id)};opacity:0.7"></div>
          </div>
          <div class="game-delta-bar-value ${cls}">${sign}${d}</div>
        </div>
      `;
    }).join("");

    const allDeltas = [deltas.red, deltas.white, deltas.blue, deltas.silver];
    const maxGain = Math.max(...allDeltas);
    const winnerIds = houses.filter(h => (deltas[h.id] || 0) === maxGain && maxGain > 0);
    const winnerBadge = winnerIds.length > 0
      ? winnerIds.map(w => `<span class="game-winner-badge" style="background:${getHouseColor(w.id)};color:${getHouseTextColor(w.id)}">🏆 ${w.name}</span>`).join(" ")
      : "";

    const currentTag = isCurrent ? `<span class="history-entry-current-tag">CURRENT</span>` : "";
    const restoreBtn = isCurrent ? "" : `<button class="btn btn-outline btn-mini" type="button" data-action-control data-history-index="${index}">Restore</button>`;

    html += `
      <div class="history-game-group">
        <div class="game-group-head" style="cursor:default">
          <span class="game-group-title"><span class="checkpoint-icon">🏁</span>${gameName} ${currentTag}</span>
          <span class="game-group-meta">${new Date(commit.createdAtMs).toLocaleDateString()}</span>
          ${restoreBtn}
        </div>
        <div class="game-group-entries">
          <div style="padding: 10px 12px;">
            <div class="game-delta-bars">${deltaBars}</div>
            ${winnerBadge}
          </div>
        </div>
      </div>
    `;
  }

  dom.historyList.innerHTML = html;
}

function renderGameSummary(groups) {
  const checkpointGroups = groups.filter(g => g.startCheckpoint !== null);

  if (checkpointGroups.length === 0) {
    dom.gameSummaryContent.innerHTML = '<div class="game-summary-empty">No games recorded yet. Create checkpoints to track games.</div>';
    dom.gameSummarySubtitle.textContent = "Points breakdown across games";
    return;
  }

  const wins = { red: 0, white: 0, blue: 0, silver: 0 };
  const totalGameDeltas = { red: 0, white: 0, blue: 0, silver: 0 };
  let prevScores = { red: 0, white: 0, blue: 0, silver: 0 };

  const gameData = [];
  for (const group of checkpointGroups) {
    const cp = group.endCheckpoint || group.startCheckpoint;
    const deltas = cp.checkpointDelta || {
      red: (cp.scores.red || 0) - prevScores.red,
      white: (cp.scores.white || 0) - prevScores.white,
      blue: (cp.scores.blue || 0) - prevScores.blue,
      silver: (cp.scores.silver || 0) - prevScores.silver
    };

    for (const h of houses) {
      totalGameDeltas[h.id] += deltas[h.id] || 0;
    }

    const allDeltas = houses.map(h => deltas[h.id] || 0);
    const maxGain = Math.max(...allDeltas);
    if (maxGain > 0) {
      for (const h of houses) {
        if ((deltas[h.id] || 0) === maxGain) wins[h.id]++;
      }
    }

    gameData.push({ name: group.name, deltas, checkpoint: cp });
    prevScores = { ...cp.scores };
  }

  dom.gameSummarySubtitle.textContent = `${checkpointGroups.length} game${checkpointGroups.length !== 1 ? "s" : ""} tracked`;

  const statsHtml = `
    <div class="game-summary-stats">
      <div class="game-stat-card">
        <div class="game-stat-value">${checkpointGroups.length}</div>
        <div class="game-stat-label">Games Played</div>
      </div>
      ${houses.map(h => `
        <div class="game-stat-card" style="border-top: 3px solid ${getHouseColor(h.id)}">
          <div class="game-stat-value">${wins[h.id]}</div>
          <div class="game-stat-label">${getHouseShortName(h.id)} Wins</div>
        </div>
      `).join("")}
    </div>
  `;

  const gameCards = gameData.slice().reverse().map((game, idx) => {
    const maxDelta = Math.max(
      Math.abs(game.deltas.red), Math.abs(game.deltas.white),
      Math.abs(game.deltas.blue), Math.abs(game.deltas.silver), 1
    );

    const allDeltas = houses.map(h => game.deltas[h.id] || 0);
    const maxGain = Math.max(...allDeltas);
    const winnerHouses = houses.filter(h => (game.deltas[h.id] || 0) === maxGain && maxGain > 0);
    const winnerText = winnerHouses.length > 0
      ? `🏆 ${winnerHouses.map(w => getHouseShortName(w.id)).join(", ")}`
      : "No winner";

    const deltaBars = houses.map(h => {
      const d = game.deltas[h.id] || 0;
      const pct = Math.round((Math.abs(d) / maxDelta) * 100);
      const cls = d > 0 ? "positive" : d < 0 ? "negative" : "zero";
      const sign = d > 0 ? "+" : "";
      return `
        <div class="game-delta-bar">
          <div class="game-delta-bar-label">${getHouseShortName(h.id)}</div>
          <div class="game-delta-bar-track">
            <div class="game-delta-bar-fill" style="height:${pct}%;background:${getHouseColor(h.id)};opacity:0.7"></div>
          </div>
          <div class="game-delta-bar-value ${cls}">${sign}${d}</div>
        </div>
      `;
    }).join("");

    return `
      <div class="game-card">
        <div class="game-card-head" data-summary-toggle="${idx}">
          <div class="game-card-title">
            <span class="game-badge">GAME ${gameData.length - idx}</span>
            <span>${escapeHtml(game.name)}</span>
          </div>
          <span class="game-card-meta">${winnerText}</span>
        </div>
        <div class="game-card-body" id="summary-body-${idx}">
          <div class="game-delta-bars">${deltaBars}</div>
        </div>
      </div>
    `;
  }).join("");

  dom.gameSummaryContent.innerHTML = statsHtml + gameCards;
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
  if (button) {
    const index = Number.parseInt(button.dataset.historyIndex || "", 10);
    void restoreHistoryIndex(index);
    return;
  }

  const gameGroupHead = target.closest("[data-game-group]");
  if (gameGroupHead) {
    const groupKey = gameGroupHead.dataset.gameGroup;
    if (collapsedGameGroups.has(groupKey)) {
      collapsedGameGroups.delete(groupKey);
    } else {
      collapsedGameGroups.add(groupKey);
    }
    renderHistoryList();
    return;
  }
});

dom.historyFilters.addEventListener("click", event => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const tab = target.closest(".filter-tab");
  if (!tab) return;

  const filter = tab.dataset.filter;
  if (!filter) return;

  historyFilter = filter;
  dom.historyFilters.querySelectorAll(".filter-tab").forEach(t => t.classList.remove("active"));
  tab.classList.add("active");
  renderHistoryList();
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
