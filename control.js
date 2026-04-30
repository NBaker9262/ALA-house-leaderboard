import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  limit,
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
const EVENT_LABEL_CHIP_LIMIT = 8;
const MAX_AUDIT_ENTRIES = 5000;

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
  eventItemName: document.getElementById("eventItemName"),
  checkpointName: document.getElementById("checkpointName"),
  checkpointPreBtn: document.getElementById("checkpointPreBtn"),
  checkpointPostBtn: document.getElementById("checkpointPostBtn"),
  undoEventActionBtn: document.getElementById("undoEventActionBtn"),
  checkpointLegacyBtn: document.getElementById("checkpointLegacyBtn"),
  eventItemRow: document.getElementById("eventItemRow"),
  eventItemHint: document.getElementById("eventItemHint"),
  eventLabelChips: document.getElementById("eventLabelChips"),
  openEventStatus: document.getElementById("openEventStatus"),
  eventActionHint: document.getElementById("eventActionHint"),
  eventStateBar: document.getElementById("eventStateBar"),
  eventStateTitle: document.getElementById("eventStateTitle"),
  eventStateText: document.getElementById("eventStateText"),
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
  auditList: document.getElementById("auditList"),
  toastContainer: document.getElementById("toastContainer"),
  historyHelpBtn: document.getElementById("historyHelpBtn"),
  historyHelpDialog: document.getElementById("historyHelpDialog"),
  historyHelpBackdrop: document.getElementById("historyHelpBackdrop"),
  historyHelpCloseBtn: document.getElementById("historyHelpCloseBtn"),
  
};

let currentScores = null;
let currentHistory = { commits: [], cursor: -1, nextId: 1 };
let activityLog = [];
let currentAudit = { entries: [], nextId: 1 };
let lastLoggedActionKey = null;
let pendingWrites = 0;
let currentUserEmail = "";
let shouldWarnBeforeLeave = false;
const expandedEventWindows = new Set();
const expandedEventGames = new Set();

function normalizeRole(role) {
  const value = String(role || "").toLowerCase();
  if (value === "staff" || value === "helper") return "member";
  return ["superadmin", "admin", "member", "viewer"].includes(value) ? value : "";
}

function roleFromClaims(claims = {}) {
  if (claims.superadmin === true || claims.role === "superadmin") return "superadmin";
  if (claims.admin === true || claims.role === "admin") return "admin";
  if (claims.role === "member" || claims.role === "staff" || claims.role === "helper") return "member";
  if (claims.role === "viewer") return "viewer";
  return "";
}

async function roleFromProfile(user) {
  if (!user?.uid) return "";

  const uidProfile = await getDoc(doc(db, "userProfiles", user.uid));
  if (uidProfile.exists()) {
    return normalizeRole(uidProfile.data()?.role);
  }

  if (!user.email) return "";
  const emailQuery = query(collection(db, "userProfiles"), where("email", "==", user.email.toLowerCase()), limit(1));
  const emailProfiles = await getDocs(emailQuery);
  if (!emailProfiles.empty) {
    return normalizeRole(emailProfiles.docs[0].data()?.role);
  }

  return "";
}

renderHouseCards();
buildPlaceRows();
setPlaceHint();
renderOpenEventStatus();
updateEventLockState();
updateSmartEventControls();

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
          <input id="custom-${house.id}" type="number" min="1" inputmode="numeric" placeholder="Amount" data-action-control data-point-control>
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
        <button class="btn btn-primary" type="button" data-action-control data-point-control data-role="custom-add">Add Custom</button>
        <button class="btn btn-outline" type="button" data-action-control data-point-control data-role="custom-subtract">Subtract Custom</button>
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
  button.dataset.pointControl = "true";
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
    select.dataset.pointControl = "true";

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
      .map(commit => {
        const summary = String(commit.summary || "Manual update");
        const inferredCheckpointKind = summary.startsWith("Checkpoint:") || summary.startsWith("Checkpoint (");

        return {
          id: Number(commit.id) || 0,
          summary,
        authorEmail: String(commit.authorEmail || ""),
        createdAtMs: Number(commit.createdAtMs) || Date.now(),
        commitKind: String(commit.commitKind || (inferredCheckpointKind ? "checkpoint" : "action")),
        checkpointRole: commit.checkpointRole === "pre" || commit.checkpointRole === "post"
          ? commit.checkpointRole
          : null,
        eventWindowId: commit.eventWindowId ? String(commit.eventWindowId) : "",
        eventName: commit.eventName ? String(commit.eventName) : "",
        windowSummary: commit.windowSummary
          ? {
            actionCount: Number(commit.windowSummary.actionCount) || 0,
            netDelta: {
              red: Number(commit.windowSummary.netDelta?.red) || 0,
              white: Number(commit.windowSummary.netDelta?.white) || 0,
              blue: Number(commit.windowSummary.netDelta?.blue) || 0,
              silver: Number(commit.windowSummary.netDelta?.silver) || 0
            }
          }
          : null,
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
        };
      })
    : [];

  const defaultCursor = commits.length - 1;
  const rawCursor = Number.isInteger(raw.cursor) ? raw.cursor : defaultCursor;
  const cursor = Math.max(-1, Math.min(rawCursor, commits.length - 1));
  const nextId = Number.isInteger(raw.nextId) && raw.nextId > 0 ? raw.nextId : commits.length + 1;
  const nextEventWindowId = Number.isInteger(raw.nextEventWindowId) && raw.nextEventWindowId > 0
    ? raw.nextEventWindowId
    : 1;
  const openEventWindow = raw.openEventWindow && raw.openEventWindow.id
    ? {
      id: String(raw.openEventWindow.id),
      eventName: String(raw.openEventWindow.eventName || ""),
      openedAtMs: Number(raw.openEventWindow.openedAtMs) || Date.now(),
      preCommitId: Number(raw.openEventWindow.preCommitId) || 0,
      openedByEmail: String(raw.openEventWindow.openedByEmail || "")
    }
    : null;

  return { commits, cursor, nextId, openEventWindow, nextEventWindowId };
}

function readAuditState(data = {}) {
  const raw = data.editAudit || {};
  const entries = Array.isArray(raw.entries)
    ? raw.entries
      .filter(entry => entry && typeof entry === "object")
      .map(entry => ({
        id: Number(entry.id) || 0,
        createdAtMs: Number(entry.createdAtMs) || Date.now(),
        editorEmail: String(entry.editorEmail || ""),
        actionType: String(entry.actionType || "edit"),
        summary: String(entry.summary || "Edit"),
        details: entry.details && typeof entry.details === "object" ? entry.details : {},
        beforeScores: {
          red: scoreNumber(entry.beforeScores, "red"),
          white: scoreNumber(entry.beforeScores, "white"),
          blue: scoreNumber(entry.beforeScores, "blue"),
          silver: scoreNumber(entry.beforeScores, "silver")
        },
        afterScores: {
          red: scoreNumber(entry.afterScores, "red"),
          white: scoreNumber(entry.afterScores, "white"),
          blue: scoreNumber(entry.afterScores, "blue"),
          silver: scoreNumber(entry.afterScores, "silver")
        }
      }))
    : [];

  const nextId = Number.isInteger(raw.nextId) && raw.nextId > 0 ? raw.nextId : entries.length + 1;
  return { entries, nextId };
}

function writeAuditState(updates, auditState) {
  updates.editAudit = {
    entries: auditState.entries,
    nextId: auditState.nextId
  };
}

function appendAuditEntry(auditState, entry) {
  let entries = auditState.entries;
  const item = {
    id: auditState.nextId,
    createdAtMs: Date.now(),
    editorEmail: String(entry.editorEmail || currentUserEmail || ""),
    actionType: String(entry.actionType || "edit"),
    summary: String(entry.summary || "Edit"),
    details: entry.details && typeof entry.details === "object" ? entry.details : {},
    beforeScores: {
      red: scoreNumber(entry.beforeScores, "red"),
      white: scoreNumber(entry.beforeScores, "white"),
      blue: scoreNumber(entry.beforeScores, "blue"),
      silver: scoreNumber(entry.beforeScores, "silver")
    },
    afterScores: {
      red: scoreNumber(entry.afterScores, "red"),
      white: scoreNumber(entry.afterScores, "white"),
      blue: scoreNumber(entry.afterScores, "blue"),
      silver: scoreNumber(entry.afterScores, "silver")
    }
  };

  entries = [...entries, item];
  if (entries.length > MAX_AUDIT_ENTRIES) {
    entries = entries.slice(entries.length - MAX_AUDIT_ENTRIES);
  }

  return {
    entries,
    nextId: auditState.nextId + 1
  };
}

function writeHistoryState(updates, history) {
  updates.history = {
    commits: history.commits,
    cursor: history.cursor,
    nextId: history.nextId,
    nextEventWindowId: history.nextEventWindowId || 1,
    openEventWindow: history.openEventWindow || null
  };
}

function applySnapshotToUpdates(updates, snapshotScores) {
  for (const house of houses) {
    updates[house.id] = scoreNumber(snapshotScores, house.id);
  }
}

function emptyDelta() {
  return { red: 0, white: 0, blue: 0, silver: 0 };
}

function diffScores(endScores, startScores) {
  return {
    red: scoreNumber(endScores, "red") - scoreNumber(startScores, "red"),
    white: scoreNumber(endScores, "white") - scoreNumber(startScores, "white"),
    blue: scoreNumber(endScores, "blue") - scoreNumber(startScores, "blue"),
    silver: scoreNumber(endScores, "silver") - scoreNumber(startScores, "silver")
  };
}

function formatDurationMs(durationMs) {
  const safeMs = Math.max(0, Number(durationMs) || 0);
  const totalMinutes = Math.floor(safeMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function buildOpenEventPreview(history, scores) {
  const openEvent = history.openEventWindow;
  if (!openEvent?.id) return null;

  const preIndex = history.commits.findIndex(commit => commit.id === openEvent.preCommitId);
  if (preIndex < 0) return null;

  const preScores = history.commits[preIndex].scores;
  const netDelta = diffScores(scores, preScores);
  const actionCount = history.commits.filter(commit => commit.eventWindowId === openEvent.id && commit.commitKind === "action").length;
  const durationMs = Date.now() - (Number(openEvent.openedAtMs) || Date.now());

  return {
    eventName: openEvent.eventName,
    actionCount,
    netDelta,
    durationMs
  };
}

function buildCloseConfirmMessage(preview) {
  const net = preview.netDelta;
  const netText = `R:${formatSignedDelta(net.red)} W:${formatSignedDelta(net.white)} B:${formatSignedDelta(net.blue)} S:${formatSignedDelta(net.silver)}`;
  if (window.innerWidth <= 560) {
    return `Close ${preview.eventName}?\n${preview.actionCount} actions · ${formatDurationMs(preview.durationMs)}\n${netText}`;
  }
  return [
    `Close event \"${preview.eventName}\"?`,
    `${preview.actionCount} action${preview.actionCount === 1 ? "" : "s"}`,
    `Duration: ${formatDurationMs(preview.durationMs)}`,
    `Net: ${netText}`
  ].join("\n");
}

function renderOpenEventStatus() {
  if (!dom.openEventStatus) return;
  const open = currentHistory.openEventWindow;
  if (!open) {
    dom.openEventStatus.textContent = "No open event window. Point controls are locked.";
    return;
  }
  const owner = open.openedByEmail ? ` by ${open.openedByEmail}` : "";
  dom.openEventStatus.textContent = `Open event: ${open.eventName} (started ${new Date(open.openedAtMs).toLocaleString()}${owner})`;
}

function isEventOpen() {
  return Boolean(currentHistory.openEventWindow?.id);
}

function updateEventLockState() {
  const unlocked = isEventOpen();
  document.body.classList.toggle("event-locked", !unlocked);

  const controls = document.querySelectorAll("[data-point-control]");
  controls.forEach(control => {
    if (!(control instanceof HTMLButtonElement || control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) {
      return;
    }

    const lockReason = "Scoring is locked. Start Event first.";
    if (!unlocked) {
      control.dataset.lockReason = lockReason;
      control.title = lockReason;
    } else {
      delete control.dataset.lockReason;
      control.removeAttribute("title");
    }

    if (control instanceof HTMLButtonElement) {
      control.disabled = false;
      return;
    }

    control.disabled = !unlocked;
  });

  if (!dom.eventStateBar || !dom.eventStateTitle || !dom.eventStateText) return;
  dom.eventStateBar.classList.toggle("event-state-open", unlocked);
  dom.eventStateBar.classList.toggle("event-state-locked", !unlocked);
  dom.eventStateTitle.textContent = unlocked ? "Event Open" : "Event Locked";
  dom.eventStateText.textContent = unlocked
    ? "Scoring is live on all signed-in devices."
    : "Start an event to unlock scoring controls.";
}

function updateSmartEventControls() {
  const open = isEventOpen();
  const legacy = findLegacyPreCheckpoint(currentHistory);

  dom.checkpointPreBtn.classList.toggle("is-hidden", open);
  dom.checkpointPostBtn.classList.toggle("is-hidden", !open);
  dom.undoEventActionBtn?.classList.toggle("is-hidden", !open);
  dom.eventItemRow?.classList.toggle("is-hidden", !open);
  dom.eventItemHint?.classList.toggle("is-hidden", !open);
  dom.eventLabelChips?.classList.toggle("is-hidden", !open);

  if (dom.checkpointLegacyBtn) {
    dom.checkpointLegacyBtn.hidden = open || !legacy;
  }

  if (open && currentHistory.openEventWindow?.eventName) {
    dom.checkpointName.value = currentHistory.openEventWindow.eventName;
    dom.checkpointName.readOnly = true;
    dom.checkpointName.placeholder = "Event is running";
  } else {
    dom.checkpointName.readOnly = false;
    dom.checkpointName.placeholder = "Event name (example: Spring Sports Assembly)";
  }

  if (!dom.eventActionHint) return;
  dom.eventActionHint.innerHTML = open
    ? "Step 2: Add points. Step 3: Click <strong>Close Event</strong> when done."
    : "Step 1: Enter event name, then click <strong>Start Event</strong>.";
}

function ensureEventOpenForPoints() {
  if (isEventOpen()) return true;
  showToast("Start an event first with Start Event.", "warn");
  return false;
}

function confirmNoLabelProceed(actionName) {
  const label = getEventItemName();
  if (label) return true;
  return window.confirm(`No game label is set for ${actionName}. Continue anyway?`);
}

function getEventItemName() {
  return String(dom.eventItemName?.value || "").trim().slice(0, 40);
}

function normalizeEventLabelKey(label) {
  return String(label || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCaseLabel(label) {
  return label
    .split(" ")
    .map(word => word ? `${word[0].toUpperCase()}${word.slice(1)}` : "")
    .join(" ");
}

function extractEventItemLabel(summary) {
  if (typeof summary !== "string") return "";
  const separatorIndex = summary.indexOf(":");
  if (separatorIndex <= 0) return "";
  const candidate = summary.slice(0, separatorIndex).trim();
  if (!candidate) return "";
  const houseMention = houses.some(house => candidate.includes(house.name));
  if (candidate.toLowerCase().startsWith("checkpoint") || houseMention) return "";
  return candidate;
}

function replaceSummaryPrefix(summary, oldLabel, newLabel) {
  if (typeof summary !== "string") return summary;
  const separator = summary.indexOf(":");
  if (separator <= 0) return summary;
  const prefix = summary.slice(0, separator).trim();
  if (normalizeEventLabelKey(prefix) !== normalizeEventLabelKey(oldLabel)) return summary;
  const rest = summary.slice(separator + 1).trim();
  return newLabel ? `${newLabel}: ${rest}` : rest;
}

function findEventWindowIdsByName(history, eventName) {
  const desired = normalizeEventLabelKey(eventName);
  const ids = new Set();
  if (!desired) return ids;

  history.commits.forEach(commit => {
    if (!commit.eventWindowId) return;
    const label = normalizeEventLabelKey(commit.eventName || checkpointEventNameFromSummary(commit.summary));
    if (label === desired) ids.add(commit.eventWindowId);
  });

  if (history.openEventWindow?.id && normalizeEventLabelKey(history.openEventWindow.eventName) === desired) {
    ids.add(history.openEventWindow.id);
  }

  return ids;
}

function snapshotFromHistory(history, fallbackScores) {
  const commit = history.cursor >= 0 && history.cursor < history.commits.length
    ? history.commits[history.cursor]
    : null;
  return commit?.scores || fallbackScores || { red: 0, white: 0, blue: 0, silver: 0 };
}

function renderEventLabelChips() {
  if (!dom.eventLabelChips) return;
  const counts = new Map();

  currentHistory.commits.forEach(commit => {
    if (commit.commitKind !== "action") return;
    const extracted = extractEventItemLabel(commit.summary);
    const key = normalizeEventLabelKey(extracted);
    if (!key) return;

    const existing = counts.get(key) || { count: 0 };
    existing.count += 1;
    counts.set(key, existing);
  });

  const chips = [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, EVENT_LABEL_CHIP_LIMIT)
    .map(([key]) => `
      <button class="event-label-chip" type="button" data-action-control data-event-chip="${key}">${titleCaseLabel(key)}</button>
    `)
    .join("");

  dom.eventLabelChips.innerHTML = chips;
}


function checkpointEventNameFromSummary(summary = "") {
  if (summary.startsWith("Checkpoint (Pre):")) return summary.slice("Checkpoint (Pre):".length).trim();
  if (summary.startsWith("Checkpoint:")) return summary.slice("Checkpoint:".length).trim();
  return "";
}

function findLegacyPreCheckpointIndex(history, preferredName = "", limitIndex = history.commits.length - 1) {
  const nameFilter = preferredName.trim().toLowerCase();
  const maxIndex = Math.max(0, Math.min(limitIndex, history.commits.length - 1));

  for (let i = maxIndex; i >= 0; i -= 1) {
    const commit = history.commits[i];
    if (!commit || commit.commitKind !== "checkpoint") continue;
    if (commit.checkpointRole === "post") continue;
    if (commit.eventWindowId) continue;

    const checkpointName = checkpointEventNameFromSummary(commit.summary);
    if (!checkpointName) continue;
    if (nameFilter && checkpointName.toLowerCase() !== nameFilter) continue;
    return i;
  }

  return -1;
}

function resolveLegacyOpenEvent(history, preferredName = "") {
  const maxIndex = Math.max(0, Math.min(history.cursor, history.commits.length - 1));
  const preIndex = findLegacyPreCheckpointIndex(history, preferredName, maxIndex);
  if (preIndex < 0) return null;

  const preCommit = history.commits[preIndex];
  const checkpointName = checkpointEventNameFromSummary(preCommit.summary);
  const eventWindowId = `event-${history.nextEventWindowId || 1}`;

  const migratedCommits = history.commits.map((entry, index) => {
    if (index < preIndex || index > maxIndex) return entry;
    if (entry.eventWindowId) return entry;

    if (index === preIndex) {
      return {
        ...entry,
        commitKind: "checkpoint",
        checkpointRole: "pre",
        eventWindowId,
        eventName: checkpointName
      };
    }

    if (entry.commitKind === "checkpoint") return entry;

    return {
      ...entry,
      eventWindowId,
      eventName: checkpointName
    };
  });

  return {
    history: {
      ...history,
      commits: migratedCommits,
      nextEventWindowId: (history.nextEventWindowId || 1) + 1,
      openEventWindow: {
        id: eventWindowId,
        eventName: checkpointName,
        openedAtMs: Number(preCommit.createdAtMs) || Date.now(),
        preCommitId: preCommit.id,
        openedByEmail: preCommit.authorEmail || ""
      }
    },
    usedLegacyPre: true
  };
}

function findLegacyPreCheckpoint(history) {
  const index = findLegacyPreCheckpointIndex(history, "", history.cursor);
  if (index < 0) return null;
  return { index, name: checkpointEventNameFromSummary(history.commits[index].summary) };
}

function moveLatestLegacyPreIntoOpenEvent(history, preferredName = "") {
  return resolveLegacyOpenEvent(history, preferredName);
}

function getDeltaSinceLastCheckpoint(history, scores) {
  let baseline = { red: 0, white: 0, blue: 0, silver: 0 };

  for (let i = history.cursor; i >= 0; i -= 1) {
    const commit = history.commits[i];
    const isCheckpoint = commit?.commitKind === "checkpoint"
      || commit?.summary?.startsWith("Checkpoint:")
      || commit?.summary?.startsWith("Checkpoint (");
    if (isCheckpoint) {
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
    nextEventWindowId: history.nextEventWindowId || 1,
    openEventWindow: history.openEventWindow || null,
    commit
  };
}

function updateRedoUndoButtons() {
  const canUndo = currentHistory.cursor > 0;
  const canRedo = currentHistory.cursor >= 0 && currentHistory.cursor < currentHistory.commits.length - 1;
  dom.undoBtn.disabled = !canUndo;
  dom.redoBtn.disabled = !canRedo;
}

function formatSignedDelta(value) {
  const numeric = Number(value) || 0;
  return `${numeric > 0 ? "+" : ""}${numeric}`;
}

function formatScoreSnapshot(scores) {
  return `R:${scores.red} W:${scores.white} B:${scores.blue} S:${scores.silver}`;
}

function getClosedEventWindows(commits) {
  const grouped = new Map();

  commits.forEach((commit, index) => {
    if (!commit.eventWindowId) return;
    const existing = grouped.get(commit.eventWindowId) || { indices: [], preIndex: -1, postIndex: -1 };
    existing.indices.push(index);
    if (commit.commitKind === "checkpoint" && commit.checkpointRole === "pre") existing.preIndex = index;
    if (commit.commitKind === "checkpoint" && commit.checkpointRole === "post") existing.postIndex = index;
    grouped.set(commit.eventWindowId, existing);
  });

  const closed = new Map();
  grouped.forEach((group, windowId) => {
    if (group.preIndex < 0 || group.postIndex < 0 || group.preIndex > group.postIndex) return;
    const indices = group.indices.filter(index => index >= group.preIndex && index <= group.postIndex);
    closed.set(windowId, {
      preIndex: group.preIndex,
      postIndex: group.postIndex,
      indices
    });
  });

  return closed;
}

function getOpenEventWindows(commits) {
  const grouped = new Map();

  commits.forEach((commit, index) => {
    if (!commit.eventWindowId) return;
    const existing = grouped.get(commit.eventWindowId) || { indices: [], preIndex: -1, postIndex: -1, maxIndex: -1 };
    existing.indices.push(index);
    existing.maxIndex = Math.max(existing.maxIndex, index);
    if (commit.commitKind === "checkpoint" && commit.checkpointRole === "pre") existing.preIndex = index;
    if (commit.commitKind === "checkpoint" && commit.checkpointRole === "post") existing.postIndex = index;
    grouped.set(commit.eventWindowId, existing);
  });

  const open = new Map();
  grouped.forEach((group, windowId) => {
    if (group.preIndex < 0) return;
    if (group.postIndex >= 0) return;
    const indices = group.indices.filter(index => index >= group.preIndex && index <= group.maxIndex);
    open.set(windowId, {
      ...group,
      indices
    });
  });

  return open;
}

function renderCommitItem(commit, index, isCurrent, compact = false) {
  const scoreText = formatScoreSnapshot(commit.scores);
  const authorText = commit.authorEmail ? ` · by ${commit.authorEmail}` : "";
  const deltaText = commit.commitKind === "checkpoint" && commit.checkpointDelta
    ? ` · since last save R:${formatSignedDelta(commit.checkpointDelta.red)} W:${formatSignedDelta(commit.checkpointDelta.white)} B:${formatSignedDelta(commit.checkpointDelta.blue)} S:${formatSignedDelta(commit.checkpointDelta.silver)}`
    : "";
  const roleTag = commit.commitKind === "checkpoint" && commit.checkpointRole
    ? ` <span class="history-tag">${commit.checkpointRole.toUpperCase()}</span>`
    : "";
  const gameLabel = commit.commitKind === "action" ? extractEventItemLabel(commit.summary) : "";
  const gameKey = normalizeEventLabelKey(gameLabel);
  const gameManage = gameKey
    ? `<div class="history-manage-row">
        <button class="manage-chip-small" type="button" data-action-control data-game-action="rename" data-game-name="${gameKey}">Rename Game</button>
        <button class="manage-chip-small delete" type="button" data-action-control data-game-action="delete" data-game-name="${gameKey}">Delete Label</button>
      </div>`
    : "";

  return `
    <li class="history-item${compact ? " history-item-sub" : ""}">
      <div>
        <div>${isCurrent ? "<strong>Current</strong> · " : ""}#${commit.id} ${commit.summary}${roleTag}</div>
        <div class="history-meta">${new Date(commit.createdAtMs).toLocaleString()}${authorText} · ${scoreText}${deltaText}</div>
        ${gameManage}
      </div>
      ${isCurrent ? "" : `<button class=\"btn btn-outline btn-mini\" type=\"button\" data-action-control data-history-index=\"${index}\">Restore</button>`}
    </li>
  `;
}

function buildEventGameGroups(commits, indices) {
  const groups = new Map();

  indices.forEach(index => {
    const commit = commits[index];
    if (!commit || commit.commitKind !== "action") return;

    const rawLabel = extractEventItemLabel(commit.summary) || "General";
    const key = normalizeEventLabelKey(rawLabel) || "general";
    const displayLabel = key === "general" ? "General" : titleCaseLabel(key);
    const existing = groups.get(key) || {
      key,
      label: displayLabel,
      indices: [],
      newestIndex: -1
    };

    existing.indices.push(index);
    existing.newestIndex = Math.max(existing.newestIndex, index);
    groups.set(key, existing);
  });

  return [...groups.values()]
    .sort((left, right) => right.newestIndex - left.newestIndex)
    .map(group => ({
      ...group,
      indices: group.indices.slice().sort((left, right) => right - left)
    }));
}

function renderGameGroup(commits, cursor, windowId, group) {
  const gameToken = `${windowId}::${group.key}`;
  const isExpanded = expandedEventGames.has(gameToken);
  const isGeneralGroup = group.key === "general";
  const rows = isExpanded
    ? group.indices
      .map(index => renderCommitItem(commits[index], index, index === cursor, true))
      .join("")
    : "";

  return `
    <li class="history-game-group">
      <div class="history-game-head">
        <div class="history-meta"><strong>${group.label}</strong> · ${group.indices.length} change${group.indices.length === 1 ? "" : "s"}</div>
        <div class="history-group-actions">
          <button class="btn btn-outline btn-mini" type="button" data-action-control data-game-group-toggle="${gameToken}">${isExpanded ? "Collapse" : "Expand"}</button>
          <button class="manage-chip-small" type="button" data-action-control data-game-action="rename" data-game-name="${group.key}" data-game-window="${windowId}">${isGeneralGroup ? "Name Group" : "Rename Game"}</button>
          ${isGeneralGroup ? "" : `<button class="manage-chip-small delete" type="button" data-action-control data-game-action="delete" data-game-name="${group.key}" data-game-window="${windowId}">Delete Label</button>`}
        </div>
      </div>
      ${isExpanded ? `<ul class="history-sublist">${rows}</ul>` : ""}
    </li>
  `;
}

function renderEventWindowGroup(commits, cursor, windowId, group) {
  const postCommit = commits[group.postIndex];
  const preCommit = commits[group.preIndex];
  const eventName = postCommit?.eventName || preCommit?.eventName || `Event ${windowId}`;
  const summary = postCommit?.windowSummary;
  const net = summary?.netDelta || postCommit?.checkpointDelta || { red: 0, white: 0, blue: 0, silver: 0 };
  const durationText = summary?.durationMs ? ` · duration ${formatDurationMs(summary.durationMs)}` : "";
  const netText = `R:${formatSignedDelta(net.red)} W:${formatSignedDelta(net.white)} B:${formatSignedDelta(net.blue)} S:${formatSignedDelta(net.silver)}`;
  const actionCount = Number(summary?.actionCount) || Math.max(0, group.indices.length - 2);
  const isCurrent = group.indices.includes(cursor);
  const isExpanded = expandedEventWindows.has(windowId);
  const eventKey = normalizeEventLabelKey(eventName);

  const gameGroups = buildEventGameGroups(commits, group.indices);
  const nested = isExpanded
    ? gameGroups.map(gameGroup => renderGameGroup(commits, cursor, windowId, gameGroup)).join("")
    : "";

  return `
    <li class="history-group">
      <div class="history-item history-group-head">
        <div>
          <div>${isCurrent ? "<strong>Current</strong> · " : ""}${eventName} <span class="history-tag">EVENT</span></div>
          <div class="history-meta">Closed ${new Date(postCommit.createdAtMs).toLocaleString()} · ${actionCount} action${actionCount === 1 ? "" : "s"}${durationText} · net ${netText}</div>
          <div class="history-manage-row">
            <button class="manage-chip-small" type="button" data-action-control data-event-action="rename" data-event-name="${eventKey}">Rename Event</button>
            <button class="manage-chip-small delete" type="button" data-action-control data-event-action="delete" data-event-name="${eventKey}">Delete Event</button>
          </div>
        </div>
        <div class="history-group-actions">
          <button class="btn btn-outline btn-mini" type="button" data-action-control data-window-toggle="${windowId}">${isExpanded ? "Collapse" : "Expand"}</button>
          ${group.postIndex === cursor ? "" : `<button class="btn btn-outline btn-mini" type="button" data-action-control data-history-index="${group.postIndex}">Restore</button>`}
        </div>
      </div>
      ${isExpanded ? `<ul class="history-sublist">${nested || '<li class="log-empty">No game-level point changes yet</li>'}</ul>` : ""}
    </li>
  `;
}

function renderOpenEventWindowGroup(commits, cursor, windowId, group) {
  const preCommit = commits[group.preIndex];
  const eventName = preCommit?.eventName || `Event ${windowId}`;
  const latestIndex = group.maxIndex;
  const latestCommit = commits[latestIndex];
  const net = latestCommit?.scores && preCommit?.scores ? diffScores(latestCommit.scores, preCommit.scores) : emptyDelta();
  const netText = `R:${formatSignedDelta(net.red)} W:${formatSignedDelta(net.white)} B:${formatSignedDelta(net.blue)} S:${formatSignedDelta(net.silver)}`;
  const actionCount = group.indices.filter(index => commits[index]?.commitKind === "action").length;
  const isCurrent = group.indices.includes(cursor);
  const isExpanded = expandedEventWindows.has(windowId);
  const eventKey = normalizeEventLabelKey(eventName);

  const gameGroups = buildEventGameGroups(commits, group.indices);
  const nested = isExpanded
    ? gameGroups.map(gameGroup => renderGameGroup(commits, cursor, windowId, gameGroup)).join("")
    : "";

  return `
    <li class="history-group">
      <div class="history-item history-group-head">
        <div>
          <div>${isCurrent ? "<strong>Current</strong> · " : ""}${eventName} <span class="history-tag">OPEN EVENT</span></div>
          <div class="history-meta">In progress · ${actionCount} action${actionCount === 1 ? "" : "s"} · net ${netText}</div>
          <div class="history-manage-row">
            <button class="manage-chip-small" type="button" data-action-control data-event-action="rename" data-event-name="${eventKey}">Rename Event</button>
            <button class="manage-chip-small delete" type="button" data-action-control data-event-action="delete" data-event-name="${eventKey}">Delete Event</button>
          </div>
        </div>
        <div class="history-group-actions">
          <button class="btn btn-outline btn-mini" type="button" data-action-control data-window-toggle="${windowId}">${isExpanded ? "Collapse" : "Expand"}</button>
          <button class="btn btn-muted btn-mini" type="button" data-action-control data-close-open-window="true">Close Now</button>
        </div>
      </div>
      ${isExpanded ? `<ul class="history-sublist">${nested || '<li class="log-empty">No game-level point changes yet</li>'}</ul>` : ""}
    </li>
  `;
}

function renderHistoryList() {
  const { commits, cursor } = currentHistory;

  if (!commits.length) {
    dom.historyList.innerHTML = '<li class="log-empty">No history yet</li>';
    updateRedoUndoButtons();
    return;
  }

  const closedWindows = getClosedEventWindows(commits);
  const openWindows = getOpenEventWindows(commits);
  const consumedWindows = new Set();
  const items = [];

  for (let i = commits.length - 1; i >= 0 && items.length < HISTORY_LIST_LIMIT; i -= 1) {
    const commit = commits[i];

    if (commit.eventWindowId && closedWindows.has(commit.eventWindowId)) {
      const group = closedWindows.get(commit.eventWindowId);
      if (group.postIndex === i && !consumedWindows.has(commit.eventWindowId)) {
        items.push(renderEventWindowGroup(commits, cursor, commit.eventWindowId, group));
        consumedWindows.add(commit.eventWindowId);
      }
      continue;
    }

    if (commit.eventWindowId && openWindows.has(commit.eventWindowId)) {
      const group = openWindows.get(commit.eventWindowId);
      if (group.maxIndex === i && !consumedWindows.has(commit.eventWindowId)) {
        items.push(renderOpenEventWindowGroup(commits, cursor, commit.eventWindowId, group));
        consumedWindows.add(commit.eventWindowId);
      }
      continue;
    }

    items.push(renderCommitItem(commit, i, i === cursor));
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

  if (currentHistory.openEventWindow?.id) {
    shouldWarnBeforeLeave = true;
    return;
  }

  const { commits, cursor } = currentHistory;
  if (!commits.length || cursor < 0 || cursor >= commits.length) {
    shouldWarnBeforeLeave = false;
    return;
  }

  const currentCommit = commits[cursor];
  shouldWarnBeforeLeave = currentCommit.commitKind !== "checkpoint";
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

    const auditBefore = readAuditState(data);
    const beforeScores = scoresFromDoc(data);
    const afterScores = scoresFromDoc(payload.updates);
    const auditBase = payload.auditEntry || {};
    const lastAction = payload.updates.lastAction || {};
    const auditNext = appendAuditEntry(auditBefore, {
      editorEmail: currentUserEmail,
      actionType: String(auditBase.actionType || lastAction.type || "edit"),
      summary: String(auditBase.summary || lastAction.summary || "Edit"),
      details: {
        ...auditBase.details,
        beforeCursor: Number(data?.history?.cursor ?? -1),
        afterCursor: Number(payload?.updates?.history?.cursor ?? data?.history?.cursor ?? -1),
        beforeOpenEvent: data?.history?.openEventWindow?.eventName || "",
        afterOpenEvent: payload?.updates?.history?.openEventWindow?.eventName || "",
        userAgent: navigator.userAgent
      },
      beforeScores,
      afterScores
    });

    writeAuditState(payload.updates, auditNext);

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
    const commitExtras = {
      commitKind: "action",
      ...extras
    };

    if (history.openEventWindow?.id && !commitExtras.eventWindowId) {
      commitExtras.eventWindowId = history.openEventWindow.id;
      commitExtras.eventName = history.openEventWindow.eventName;
    }

    const nextHistory = appendHistoryCommit(history, nextScores, summary, authorEmail, commitExtras);
    const finalHistory = {
      ...nextHistory,
      openEventWindow: history.openEventWindow || null,
      nextEventWindowId: history.nextEventWindowId || 1
    };

    const updates = {
      lastAction: {
        ...actionMeta,
        summary,
        authorEmail,
        timestamp: serverTimestamp()
      }
    };

    applySnapshotToUpdates(updates, nextScores);
    writeHistoryState(updates, finalHistory);

    return { updates, response: { applied: true } };
  }));

  return write;
}

async function applyDelta(house, delta) {
  if (!Number.isFinite(delta) || delta === 0) return;
  if (!ensureEventOpenForPoints()) return;
  if (!confirmNoLabelProceed("this score update")) return;

  const itemName = getEventItemName();
  const summary = `${findHouseName(house)} ${delta > 0 ? "+" : ""}${delta}`;

  const write = await commitWithHistory({
    summary: itemName ? `${itemName}: ${summary}` : summary,
    actionMeta: { type: "delta", house, delta, eventItemName: itemName || "" },
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
  if (!ensureEventOpenForPoints()) return;
  if (!confirmNoLabelProceed("place awards")) return;
  const itemName = getEventItemName();
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
    summary: itemName ? `${itemName}: Place awards: ${summary}` : `Place awards: ${summary}`,
    actionMeta: {
      type: "place_awards",
      eventItemName: itemName || "",
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

function renderAuditList() {
  if (!dom.auditList) return;
  const entries = currentAudit.entries;

  if (!entries.length) {
    dom.auditList.innerHTML = '<li class="log-empty">No edits logged yet</li>';
    return;
  }

  dom.auditList.innerHTML = entries
    .slice()
    .reverse()
    .slice(0, 120)
    .map(entry => {
      const d = entry.details || {};
      const eventText = d.afterOpenEvent ? ` · event:${d.afterOpenEvent}` : "";
      return `<li class="log-entry"><span class="log-time">${new Date(entry.createdAtMs).toLocaleTimeString()}</span><span>${entry.summary}${entry.editorEmail ? ` (${entry.editorEmail})` : ""}${eventText}</span></li>`;
    })
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

function openHistoryHelp() {
  if (!dom.historyHelpDialog) return;
  dom.historyHelpDialog.hidden = false;
  dom.historyHelpDialog.setAttribute("aria-hidden", "false");
  dom.historyHelpDialog.style.display = "grid";
  document.body.style.overflow = "hidden";
}

function closeHistoryHelp() {
  if (!dom.historyHelpDialog) return;
  dom.historyHelpDialog.hidden = true;
  dom.historyHelpDialog.setAttribute("aria-hidden", "true");
  dom.historyHelpDialog.style.display = "none";
  document.body.style.overflow = "";
}

async function migrateLatestLegacyPreToOpenEvent(preferredName = "") {
  const write = await withWrite(async () => commitScoreMutation(data => {
    const history = readHistoryState(data);

    if (history.openEventWindow?.id) {
      return { response: { applied: true, alreadyOpen: true, eventName: history.openEventWindow.eventName } };
    }

    const migrated = moveLatestLegacyPreIntoOpenEvent(history, preferredName);
    if (!migrated) {
      return { response: { applied: false, reason: "no_legacy_pre" } };
    }

    const updates = {
      lastAction: {
        type: "legacy_migrate",
        summary: `Legacy pre moved into event: ${migrated.history.openEventWindow.eventName}`,
        eventWindowId: migrated.history.openEventWindow.id,
        eventName: migrated.history.openEventWindow.eventName,
        authorEmail: currentUserEmail,
        timestamp: serverTimestamp()
      }
    };

    const latestCommit = migrated.history.commits[migrated.history.cursor];
    applySnapshotToUpdates(updates, latestCommit?.scores || scoresFromDoc(data));
    writeHistoryState(updates, migrated.history);

    return {
      updates,
      response: {
        applied: true,
        migrated: true,
        eventName: migrated.history.openEventWindow.eventName
      }
    };
  }));

  return write;
}

async function closeMostRecentLegacyPre() {
  const migrate = await migrateLatestLegacyPreToOpenEvent(dom.checkpointName.value.trim());
  if (!migrate.ok) return;

  if (!migrate.value?.applied) {
    if (migrate.value?.reason === "no_legacy_pre") {
      showToast("No legacy pre checkpoint found to move.", "warn");
      return;
    }
    showToast("Unable to move legacy pre into event.", "warn");
    return;
  }

  if (migrate.value?.eventName) {
    dom.checkpointName.value = migrate.value.eventName;
  }

  await createPostEventCheckpoint();
}

async function undoLastEventAction() {
  const openEvent = currentHistory.openEventWindow;
  if (!openEvent?.id) {
    showToast("No open event to undo from.", "warn");
    return;
  }

  const maxIndex = Math.min(currentHistory.cursor, currentHistory.commits.length - 1);
  let actionIndex = -1;
  for (let i = maxIndex; i >= 0; i -= 1) {
    const commit = currentHistory.commits[i];
    if (commit.eventWindowId === openEvent.id && commit.commitKind === "action") {
      actionIndex = i;
      break;
    }
  }

  if (actionIndex < 0) {
    showToast("No event action found to undo.", "warn");
    return;
  }

  const targetIndex = Math.max(0, actionIndex - 1);
  await restoreHistoryIndex(targetIndex);
}

async function renameEventByName(oldNameInput, newNameInput) {
  const oldName = titleCaseLabel(normalizeEventLabelKey(oldNameInput || "")).slice(0, 60);
  const newName = titleCaseLabel(normalizeEventLabelKey(newNameInput || "")).slice(0, 60);
  if (!oldName || !newName) {
    showToast("Enter both old and new event names.", "warn");
    return;
  }

  const write = await withWrite(async () => commitScoreMutation(data => {
    const history = readHistoryState(data);
    const windowIds = findEventWindowIdsByName(history, oldName);
    if (!windowIds.size) {
      return { response: { applied: false, reason: "not_found" } };
    }

    const commits = history.commits.map(commit => {
      if (!windowIds.has(commit.eventWindowId)) return commit;
      const updated = { ...commit, eventName: newName };
      if (commit.commitKind === "checkpoint" && commit.checkpointRole === "pre") {
        updated.summary = `Checkpoint (Pre): ${newName}`;
      }
      if (commit.commitKind === "checkpoint" && commit.checkpointRole === "post") {
        updated.summary = `Checkpoint (Post): ${newName}`;
      }
      return updated;
    });

    const openEventWindow = history.openEventWindow && windowIds.has(history.openEventWindow.id)
      ? { ...history.openEventWindow, eventName: newName }
      : history.openEventWindow;

    const updates = {
      lastAction: {
        type: "rename_event",
        summary: `Renamed event: ${oldName} → ${newName}`,
        authorEmail: currentUserEmail,
        timestamp: serverTimestamp()
      }
    };

    const latest = data.latestEventSummary;
    if (latest?.label && normalizeEventLabelKey(latest.label) === normalizeEventLabelKey(oldName)) {
      updates.latestEventSummary = {
        ...latest,
        label: newName
      };
    }

    const nextHistory = { ...history, commits, openEventWindow };
    applySnapshotToUpdates(updates, snapshotFromHistory(nextHistory, scoresFromDoc(data)));
    writeHistoryState(updates, nextHistory);

    return { updates, response: { applied: true } };
  }));

  if (!write.ok) return;
  if (!write.value?.applied) {
    showToast("Event not found.", "warn");
    return;
  }

  showToast("Event renamed.", "success");
}

async function deleteEventByName(eventNameInput) {
  const eventName = titleCaseLabel(normalizeEventLabelKey(eventNameInput || "")).slice(0, 60);
  if (!eventName) {
    showToast("Enter an event name to delete.", "warn");
    return;
  }

  const confirmed = window.confirm(`Delete event \"${eventName}\" and all its tracked actions?`);
  if (!confirmed) return;

  const write = await withWrite(async () => commitScoreMutation(data => {
    const history = readHistoryState(data);
    const ids = findEventWindowIdsByName(history, eventName);
    if (!ids.size) {
      return { response: { applied: false, reason: "not_found" } };
    }

    const commits = history.commits.filter(commit => !ids.has(commit.eventWindowId));
    const cursor = Math.max(-1, Math.min(history.cursor, commits.length - 1));
    const nextId = commits.length ? Math.max(...commits.map(commit => commit.id)) + 1 : 1;
    const openEventWindow = history.openEventWindow && ids.has(history.openEventWindow.id) ? null : history.openEventWindow;
    const nextHistory = {
      ...history,
      commits,
      cursor,
      nextId,
      openEventWindow
    };

    const updates = {
      lastAction: {
        type: "delete_event",
        summary: `Deleted event: ${eventName}`,
        authorEmail: currentUserEmail,
        timestamp: serverTimestamp()
      }
    };

    const fallbackScores = scoresFromDoc(data);
    const snapshot = snapshotFromHistory(nextHistory, fallbackScores);
    applySnapshotToUpdates(updates, snapshot);
    writeHistoryState(updates, nextHistory);

    return { updates, response: { applied: true } };
  }));

  if (!write.ok) return;
  if (!write.value?.applied) {
    showToast("Event not found.", "warn");
    return;
  }

  showToast("Event deleted.", "success");
}

async function renameGameLabel(oldLabelInput, newLabelInput, eventWindowId = "") {
  const oldLabelKey = normalizeEventLabelKey(oldLabelInput || "");
  const oldLabel = titleCaseLabel(oldLabelKey).slice(0, 40);
  const newLabel = titleCaseLabel(normalizeEventLabelKey(newLabelInput || "")).slice(0, 40);

  if (!oldLabel || !newLabel) {
    showToast("Enter both old and new game labels.", "warn");
    return;
  }

  const write = await withWrite(async () => commitScoreMutation(data => {
    const history = readHistoryState(data);
    let changed = false;
    const scopeToEvent = Boolean(eventWindowId);

    const commits = history.commits.map(commit => {
      if (commit.commitKind !== "action") return commit;

      if (scopeToEvent && commit.eventWindowId !== eventWindowId) return commit;

      if (oldLabelKey === "general") {
        const existingLabel = extractEventItemLabel(commit.summary);
        if (existingLabel) return commit;
        changed = true;
        return { ...commit, summary: `${newLabel}: ${commit.summary}` };
      }

      const updatedSummary = replaceSummaryPrefix(commit.summary, oldLabel, newLabel);
      if (updatedSummary === commit.summary) return commit;
      changed = true;
      return { ...commit, summary: updatedSummary };
    });

    if (!changed) {
      return { response: { applied: false, reason: "not_found" } };
    }

    const updates = {
      lastAction: {
        type: "rename_game_label",
        summary: `Renamed game label: ${oldLabel} → ${newLabel}`,
        authorEmail: currentUserEmail,
        timestamp: serverTimestamp()
      }
    };

    const nextHistory = { ...history, commits };
    applySnapshotToUpdates(updates, snapshotFromHistory(nextHistory, scoresFromDoc(data)));
    writeHistoryState(updates, nextHistory);
    return { updates, response: { applied: true } };
  }));

  if (!write.ok) return;
  if (!write.value?.applied) {
    showToast("Game label not found in event actions.", "warn");
    return;
  }

  showToast("Game label renamed.", "success");
}

async function deleteGameLabelPrefix(oldLabelInput, eventWindowId = "") {
  const oldLabel = titleCaseLabel(normalizeEventLabelKey(oldLabelInput || "")).slice(0, 40);
  if (!oldLabel) {
    showToast("Enter a game label to remove.", "warn");
    return;
  }

  if (normalizeEventLabelKey(oldLabel) === "general") {
    showToast("General group has no label to remove.", "warn");
    return;
  }

  const write = await withWrite(async () => commitScoreMutation(data => {
    const history = readHistoryState(data);
    let changed = false;

    const commits = history.commits.map(commit => {
      if (commit.commitKind !== "action") return commit;
      if (eventWindowId && commit.eventWindowId !== eventWindowId) return commit;
      const updatedSummary = replaceSummaryPrefix(commit.summary, oldLabel, "");
      if (updatedSummary === commit.summary) return commit;
      changed = true;
      return { ...commit, summary: updatedSummary };
    });

    if (!changed) {
      return { response: { applied: false, reason: "not_found" } };
    }

    const updates = {
      lastAction: {
        type: "delete_game_label_prefix",
        summary: `Removed game label prefix: ${oldLabel}`,
        authorEmail: currentUserEmail,
        timestamp: serverTimestamp()
      }
    };

    const nextHistory = { ...history, commits };
    applySnapshotToUpdates(updates, snapshotFromHistory(nextHistory, scoresFromDoc(data)));
    writeHistoryState(updates, nextHistory);
    return { updates, response: { applied: true } };
  }));

  if (!write.ok) return;
  if (!write.value?.applied) {
    showToast("Game label not found in event actions.", "warn");
    return;
  }

  showToast("Game label prefix removed.", "success");
}

async function createPreEventCheckpoint() {
  const raw = dom.checkpointName.value.trim();
  if (!raw) {
    showToast("Enter an event name first.", "warn");
    return;
  }

  const eventName = raw.slice(0, 60);
  const write = await withWrite(async () => commitScoreMutation(data => {
    const scores = scoresFromDoc(data);
    const history = readHistoryState(data);

    if (history.openEventWindow?.id) {
      return { response: { applied: false, reason: "already_open", eventName: history.openEventWindow.eventName } };
    }

    const eventWindowId = `event-${history.nextEventWindowId || 1}`;
    const commitExtras = {
      commitKind: "checkpoint",
      checkpointRole: "pre",
      eventWindowId,
      eventName,
      checkpointDelta: getDeltaSinceLastCheckpoint(history, scores)
    };

    const nextHistory = appendHistoryCommit(
      {
        ...history,
        nextEventWindowId: (history.nextEventWindowId || 1) + 1
      },
      scores,
      `Checkpoint (Pre): ${eventName}`,
      currentUserEmail,
      commitExtras
    );

    nextHistory.openEventWindow = {
      id: eventWindowId,
      eventName,
      openedAtMs: Date.now(),
      preCommitId: nextHistory.commit.id,
      openedByEmail: currentUserEmail
    };

    const updates = {
      lastAction: {
        type: "checkpoint_pre",
        summary: `Checkpoint (Pre): ${eventName}`,
        eventWindowId,
        eventName,
        authorEmail: currentUserEmail,
        timestamp: serverTimestamp()
      }
    };

    applySnapshotToUpdates(updates, scores);
    writeHistoryState(updates, nextHistory);

    return { updates, response: { applied: true, eventName } };
  }));

  if (!write.ok) return;
  if (!write.value?.applied) {
    if (write.value?.reason === "already_open") {
      showToast(`Close the open event first: ${write.value.eventName}`, "warn");
      return;
    }
    showToast("Unable to start event window.", "warn");
    return;
  }

  dom.checkpointName.value = "";
  updateLeaveWarningState();
  showToast(`Pre checkpoint started for ${write.value.eventName}.`, "success");
}

async function createPostEventCheckpoint() {
  if (currentHistory.openEventWindow?.id && currentScores) {
    const preview = buildOpenEventPreview(currentHistory, currentScores);
    if (preview) {
      const message = buildCloseConfirmMessage(preview);

      if (!window.confirm(message)) return;
    }
  }

  const write = await withWrite(async () => commitScoreMutation(data => {
    const scores = scoresFromDoc(data);
    const history = readHistoryState(data);
    const preferredName = dom.checkpointName.value.trim();

    let workingHistory = history;
    let usedLegacyPre = false;

    if (!workingHistory.openEventWindow?.id) {
      const rescue = resolveLegacyOpenEvent(workingHistory, preferredName);
      if (!rescue) {
        return { response: { applied: false, reason: "no_open_event" } };
      }
      workingHistory = rescue.history;
      usedLegacyPre = rescue.usedLegacyPre;
    }

    const openEvent = workingHistory.openEventWindow;

    const preIndex = workingHistory.commits.findIndex(commit => commit.id === openEvent.preCommitId);
    const preScores = preIndex >= 0 ? workingHistory.commits[preIndex].scores : emptyDelta();
    const netDelta = diffScores(scores, preScores);
    const actionCount = workingHistory.commits.filter(commit => commit.eventWindowId === openEvent.id && commit.commitKind === "action").length;
    const durationMs = Date.now() - (Number(openEvent.openedAtMs) || Date.now());

    const commitExtras = {
      commitKind: "checkpoint",
      checkpointRole: "post",
      eventWindowId: openEvent.id,
      eventName: openEvent.eventName,
      checkpointDelta: getDeltaSinceLastCheckpoint(history, scores),
      windowSummary: {
        actionCount,
        netDelta,
        durationMs
      }
    };

    const nextHistory = appendHistoryCommit(
      workingHistory,
      scores,
      `Checkpoint (Post): ${openEvent.eventName}`,
      currentUserEmail,
      commitExtras
    );

    nextHistory.openEventWindow = null;
    const updates = {
      lastAction: {
        type: "checkpoint_post",
        summary: `Checkpoint (Post): ${openEvent.eventName}`,
        eventWindowId: openEvent.id,
        eventName: openEvent.eventName,
        authorEmail: currentUserEmail,
        timestamp: serverTimestamp()
      },
      latestEventSummary: {
        label: openEvent.eventName,
        closedAtMs: Date.now(),
        actionCount,
        netDelta
      }
    };

    applySnapshotToUpdates(updates, scores);
    writeHistoryState(updates, nextHistory);

    return { updates, response: { applied: true, eventName: openEvent.eventName, usedLegacyPre } };
  }));

  if (!write.ok) return;
  if (!write.value?.applied) {
    if (write.value?.reason === "no_open_event") {
      showToast("No open event window to close.", "warn");
      return;
    }
    showToast("Unable to close event window.", "warn");
    return;
  }

  dom.checkpointName.value = "";
  updateLeaveWarningState();
  showToast(
    write.value.usedLegacyPre
      ? `Post checkpoint created for ${write.value.eventName} (legacy pre linked).`
      : `Post checkpoint created for ${write.value.eventName}.`,
    "success"
  );
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
dom.historyHelpBtn?.addEventListener("click", openHistoryHelp);
dom.historyHelpCloseBtn?.addEventListener("click", closeHistoryHelp);
dom.historyHelpBackdrop?.addEventListener("click", closeHistoryHelp);
dom.historyHelpDialog?.addEventListener("click", event => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target === dom.historyHelpDialog) {
    closeHistoryHelp();
    return;
  }
  if (!target.closest("[data-help-close]")) return;
  closeHistoryHelp();
});
dom.checkpointLegacyBtn?.addEventListener("click", () => {
  void closeMostRecentLegacyPre();
});
dom.undoEventActionBtn?.addEventListener("click", () => {
  void undoLastEventAction();
});
dom.eventLabelChips?.addEventListener("click", event => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const chip = target.closest("button[data-event-chip]");
  if (!chip || !dom.eventItemName) return;
  const key = String(chip.dataset.eventChip || "").trim();
  if (!key) return;
  dom.eventItemName.value = titleCaseLabel(key);
  dom.eventItemName.focus();
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
dom.checkpointPreBtn.addEventListener("click", () => {
  void createPreEventCheckpoint();
});
dom.checkpointPostBtn.addEventListener("click", () => {
  void createPostEventCheckpoint();
});
dom.checkpointName.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    if (isEventOpen()) {
      void createPostEventCheckpoint();
      return;
    }
    void createPreEventCheckpoint();
  }
});
dom.checkpointName.addEventListener("input", () => {
  updateLeaveWarningState();
});
dom.historyList.addEventListener("click", event => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const gameToggleButton = target.closest("button[data-game-group-toggle]");
  if (gameToggleButton) {
    const token = String(gameToggleButton.dataset.gameGroupToggle || "");
    if (!token) return;
    if (expandedEventGames.has(token)) {
      expandedEventGames.delete(token);
    } else {
      expandedEventGames.add(token);
    }
    renderHistoryList();
    return;
  }

  const eventManageButton = target.closest("button[data-event-action][data-event-name]");
  if (eventManageButton) {
    const action = String(eventManageButton.dataset.eventAction || "");
    const name = titleCaseLabel(String(eventManageButton.dataset.eventName || "").trim());
    if (action === "rename") {
      const next = window.prompt(`Rename event \"${name}\" to:`, name);
      if (!next) return;
      void renameEventByName(name, next);
      return;
    }
    if (action === "delete") {
      void deleteEventByName(name);
      return;
    }
  }

  const gameManageButton = target.closest("button[data-game-action][data-game-name]");
  if (gameManageButton) {
    const action = String(gameManageButton.dataset.gameAction || "");
    const name = titleCaseLabel(String(gameManageButton.dataset.gameName || "").trim());
    const windowId = String(gameManageButton.dataset.gameWindow || "").trim();
    if (action === "rename") {
      const promptText = name.toLowerCase() === "general"
        ? "Name this General group as:"
        : `Rename game label \"${name}\" to:`;
      const defaultValue = name.toLowerCase() === "general" ? "" : name;
      const next = window.prompt(promptText, defaultValue);
      if (!next) return;
      void renameGameLabel(name, next, windowId);
      return;
    }
    if (action === "delete") {
      void deleteGameLabelPrefix(name, windowId);
      return;
    }
  }

  const closeNowButton = target.closest("button[data-close-open-window]");
  if (closeNowButton) {
    void createPostEventCheckpoint();
    return;
  }

  const toggleButton = target.closest("button[data-window-toggle]");
  if (toggleButton) {
    const windowId = String(toggleButton.dataset.windowToggle || "");
    if (expandedEventWindows.has(windowId)) {
      expandedEventWindows.delete(windowId);
    } else {
      expandedEventWindows.add(windowId);
    }
    renderHistoryList();
    return;
  }

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
    currentAudit = readAuditState(data);
    renderHistoryList();
    renderEventLabelChips();
    renderAuditList();
    renderOpenEventStatus();
    updateEventLockState();
    updateSmartEventControls();
    dom.checkpointPostBtn.disabled = !currentHistory.openEventWindow?.id;
    dom.undoEventActionBtn.disabled = !currentHistory.openEventWindow?.id;
    const legacy = findLegacyPreCheckpoint(currentHistory);
    dom.checkpointLegacyBtn.disabled = Boolean(currentHistory.openEventWindow?.id) || !legacy;
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

  try {
    const token = await user.getIdTokenResult();
    const role = roleFromClaims(token.claims) || await roleFromProfile(user);

    if (!["superadmin", "admin", "member"].includes(role)) {
      await signOut(auth);
      setAuthError("This account does not have control-panel access.");
      return;
    }

    setAuthError("");
    dom.loginBox.style.display = "none";
    dom.mainPanel.style.display = "block";
    currentUserEmail = user.email || "";
    dom.loggedInAs.textContent = `${currentUserEmail} (${role})`;
    updateLeaveWarningState();
  } catch (error) {
    console.error(error);
    await signOut(auth);
    setAuthError("Unable to verify account permissions.");
  }
});

window.addEventListener("beforeunload", event => {
  if (!shouldWarnBeforeLeave || dom.mainPanel.style.display !== "block") return;
  event.preventDefault();
  event.returnValue = "";
});

window.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;
  if (dom.historyHelpDialog?.hidden) return;
  closeHistoryHelp();
});

document.addEventListener("click", event => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (dom.historyHelpDialog?.hidden) return;
  if (target.id === "historyHelpCloseBtn" || target.id === "historyHelpBackdrop") {
    closeHistoryHelp();
  }
}, true);
