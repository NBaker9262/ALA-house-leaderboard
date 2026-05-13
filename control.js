import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  addDoc,
  collection,
  deleteDoc,
  getDoc,
  getFirestore,
  doc,
  limit,
  orderBy,
  query,
  runTransaction,
  setDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import {
  getDatabase,
  ref,
  set
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

// Maintenance switchboard: update these values at the top when rotating Sheets endpoints/tabs.
const SHEETS_SYNC = {
  endpointUrl: "https://script.google.com/macros/s/AKfycbxCeiau0aJRde_zFEQao4KNS9Z6qvVu7XwDrkQ2KR-gVQjJQm_Xqu33DrGh7QuoRD_J7g/exec", // Required: Google Apps Script web app URL
  secureApiKey: "asdfgvhjtnrtbvwegrhtyjnhgbfvdswdefrghyjhtgrfgrthbgrhtjyntgbfvdgr", // Required: shared secret/API key validated by Apps Script
  spreadsheetId: "1jsCXm5fHWCPkNejatduLjLb6XpvApBUVm6mLSs4ePcI",
  pointsTab: "Points",
  logTab: "Log",
  studentsTab: "Students",
  pollIntervalMs: 10000,
  timeoutMs: 20000
};

const STORAGE_KEYS = {
  pointsCache: "ala.sheet.points.cache",
  logCache: "ala.sheet.log.cache",
  pendingWrites: "ala.sheet.pending.writes",
  systemAlertThrottle: "ala.system.alert.throttle",
  showSystemAlerts: "ala.show.system.alerts",
  sessionMode: "ala.session.mode",
  sessionEventName: "ala.session.event.name"
};

const RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 4000,
  jitterMs: 120
};

const QUEUE_CONFIG = {
  maxItems: 120,
  maxAttempts: 6,
  maxAgeMs: 1000 * 60 * 60 * 72
};

const ALERT_THROTTLE_MS = 1000 * 60 * 10;

const HOUSE_TO_SHEET = {
  red: "Panda",
  white: "Polar",
  blue: "Grizzly",
  silver: "Kodiak",
  gray: "Kodiak"
};

const SHEET_TO_HOUSE = {
  red: "red",
  white: "white",
  blue: "blue",
  silver: "silver",
  gray: "silver",
  panda: "red",
  polar: "white",
  grizzly: "blue",
  kodiak: "silver"
};

const ROLE_ORDER = ["helper", "member", "admin", "superadmin"];

const ROLE_CONFIG = {
  helper: {
    label: "Helper",
    summary: "Can submit suggestions only.",
    canSuggest: true,
    canMutatePoints: false,
    canAwardPlaces: false,
    canUndo: false,
    canCheckpoint: false,
    canReset: false,
    canManageUsers: false
  },
  member: {
    label: "Member",
    summary: "Can manage points and undo their own latest action.",
    canSuggest: false,
    canMutatePoints: true,
    canAwardPlaces: true,
    canUndo: true,
    canCheckpoint: false,
    canReset: false,
    canManageUsers: false
  },
  admin: {
    label: "Admin",
    summary: "Can manage scoring, checkpoints, restores, and resets.",
    canSuggest: false,
    canMutatePoints: true,
    canAwardPlaces: true,
    canUndo: true,
    canCheckpoint: true,
    canReset: true,
    canManageUsers: false
  },
  superadmin: {
    label: "Super Admin",
    summary: "Full access, including user and role management.",
    canSuggest: false,
    canMutatePoints: true,
    canAwardPlaces: true,
    canUndo: true,
    canCheckpoint: true,
    canReset: true,
    canManageUsers: true
  }
};

const firebaseConfig = {
  apiKey: "AIzaSyAAAz2beBA1QnvLPTbaq5LmEnR6m-VvK0s",
  authDomain: "ala-house-leaderboard.firebaseapp.com",
  databaseURL: "https://ala-house-leaderboard-default-rtdb.firebaseio.com",
  projectId: "ala-house-leaderboard",
  storageBucket: "ala-house-leaderboard.firebasestorage.app",
  messagingSenderId: "827317744881",
  appId: "1:827317744881:web:c8518ba6523610ab006550"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const realtimeDb = getDatabase(app);
const leaderboardScoresRef = ref(realtimeDb, "leaderboard/scores");
const auth = getAuth(app);
const scoresDoc = doc(db, "leaderboard", "scores");
const eventDoc = doc(db, "settings", "event");
const usersCollection = collection(db, "users");
const notificationsCollection = collection(db, "notifications");
const suggestionsCollection = collection(db, "suggestions");
const eventLogsCollection = collection(db, "event_logs");

const houses = [
  { id: "red", name: "Red Panda House", bg: "#ea0125", text: "#ffffff" },
  { id: "white", name: "Polar House", bg: "#fffeff", text: "#141414" },
  { id: "blue", name: "Grizzly House", bg: "#005ab5", text: "#ffffff" },
  { id: "silver", name: "Kodiak House", bg: "#a7a7aa", text: "#111111" }
];

const QUICK_DELTAS = [10, 15, 30, 50];
const PLACE_POINTS = [50, 30, 15, 10];
const PLACE_BADGES = ["1st", "2nd", "3rd", "4th"];
const MAX_LOG_ENTRIES = 50;
const MAX_HISTORY_COMMITS = 10000;
const HISTORY_LIST_LIMIT = 5000;

const dom = {
  loginBox: document.getElementById("loginBox"),
  loginForm: document.getElementById("loginForm"),
  emailInput: document.getElementById("email"),
  passwordInput: document.getElementById("password"),
  signInButton: document.getElementById("emailPassBtn"),
  authError: document.getElementById("authError"),
  mainPanel: document.getElementById("mainPanel"),
  housesContainer: document.getElementById("housesContainer"),
  pointReason: document.getElementById("pointReason"),
  longTermEventName: document.getElementById("longTermEventName"),
  longTermDetail: document.getElementById("longTermDetail"),
  modeSwitchPanel: document.getElementById("modeSwitchPanel"),
  modeSwitch: document.querySelector(".mode-switch"),
  eventBanner: document.getElementById("eventBanner"),
  eventBannerTitle: document.getElementById("eventBannerTitle"),
  eventBannerMeta: document.getElementById("eventBannerMeta"),
  eventBannerStop: document.getElementById("eventBannerStop"),
  startEventBtn: document.getElementById("startEventBtn"),
  stopEventBtn: document.getElementById("stopEventBtn"),
  eventStatus: document.getElementById("eventStatus"),
  eventLogStatus: document.getElementById("eventLogStatus"),
  eventLogList: document.getElementById("eventLogList"),
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
  menuBtn: document.getElementById("menuBtn"),
  menuBadge: document.getElementById("menuBadge"),
  noticeBar: document.getElementById("noticeBar"),
  noticeTitle: document.getElementById("noticeTitle"),
  noticeBody: document.getElementById("noticeBody"),
  noticeMeta: document.getElementById("noticeMeta"),
  drawerOverlay: document.getElementById("drawerOverlay"),
  superadminDrawer: document.getElementById("superadminDrawer"),
  closeDrawerBtn: document.getElementById("closeDrawerBtn"),
  jumpNotificationsBtn: document.getElementById("jumpNotificationsBtn"),
  jumpUsersBtn: document.getElementById("jumpUsersBtn"),
  jumpHistoryBtn: document.getElementById("jumpHistoryBtn"),
  toolsMenuBtn: document.getElementById("toolsMenuBtn"),
  toolsDrawer: document.getElementById("toolsDrawer"),
  toolsDrawerOverlay: document.getElementById("toolsDrawerOverlay"),
  closeToolsDrawerBtn: document.getElementById("closeToolsDrawerBtn"),
  jumpStudentsBtn: document.getElementById("jumpStudentsBtn"),
  jumpEventLogBtn: document.getElementById("jumpEventLogBtn"),
  jumpHistoryLogBtn: document.getElementById("jumpHistoryLogBtn"),
  jumpSheetLogBtn: document.getElementById("jumpSheetLogBtn"),
  studentSearchInput: document.getElementById("studentSearchInput"),
  studentSearchStatus: document.getElementById("studentSearchStatus"),
  studentSearchList: document.getElementById("studentSearchList"),
  studentRefreshBtn: document.getElementById("studentRefreshBtn"),
  roleBadge: document.getElementById("roleBadge"),
  roleDescription: document.getElementById("roleDescription"),
  suggestionPanel: document.getElementById("suggestionPanel"),
  suggestionHouse: document.getElementById("suggestionHouse"),
  suggestionDelta: document.getElementById("suggestionDelta"),
  suggestionReason: document.getElementById("suggestionReason"),
  suggestionBtn: document.getElementById("suggestionBtn"),
  suggestionStatus: document.getElementById("suggestionStatus"),
  notificationForm: document.getElementById("notificationForm"),
  notificationTitle: document.getElementById("notificationTitle"),
  notificationBody: document.getElementById("notificationBody"),
  notificationTargetRole: document.getElementById("notificationTargetRole"),
  notificationBtn: document.getElementById("notificationBtn"),
  notificationStatus: document.getElementById("notificationStatus"),
  notificationReviewRole: document.getElementById("notificationReviewRole"),
  notificationList: document.getElementById("notificationList"),
  suggestionReviewPanel: document.getElementById("suggestionReviewPanel"),
  suggestionQueueStatus: document.getElementById("suggestionQueueStatus"),
  suggestionQueueList: document.getElementById("suggestionQueueList"),
  sessionModeLabel: document.getElementById("sessionModeLabel"),
  sessionEventLabel: document.getElementById("sessionEventLabel"),
  changeModeBtn: document.getElementById("changeModeBtn"),
  retryQueueBtn: document.getElementById("retryQueueBtn"),
  systemAlertsToggle: document.getElementById("systemAlertsToggle"),
  userAdminPanel: document.getElementById("userAdminPanel"),
  userCreateForm: document.getElementById("userCreateForm"),
  newUserDisplayName: document.getElementById("newUserDisplayName"),
  newUserEmail: document.getElementById("newUserEmail"),
  newUserPassword: document.getElementById("newUserPassword"),
  newUserRole: document.getElementById("newUserRole"),
  userCreateBtn: document.getElementById("userCreateBtn"),
  userManagementStatus: document.getElementById("userManagementStatus"),
  userList: document.getElementById("userList"),
  syncStatus: document.getElementById("syncStatus"),
  activityList: document.getElementById("activityList"),
  sheetLogList: document.getElementById("sheetLogList"),
  historyList: document.getElementById("historyList"),
  toastContainer: document.getElementById("toastContainer")
};

let currentScores = null;
let currentHistory = { commits: [], cursor: -1, nextId: 1 };
let currentPointRows = [];
let currentLogRows = [];
let currentSuggestions = [];
let activityLog = [];
let pendingWrites = 0;
let currentUserEmail = "";
let currentUserRole = "member";
let currentUserProfile = null;
let currentUsers = [];
let currentNotifications = [];
let currentStudents = [];
let notificationsUnsubscribe = null;
let notificationsBootstrapped = false;
let suggestionsUnsubscribe = null;
let suggestionsBootstrapped = false;
let currentNotificationReviewRole = "all";
let shouldWarnBeforeLeave = false;
let sheetPollHandle = null;
let firebaseReady = false;
let usersUnsubscribe = null;
let currentMode = "";
let currentEventName = "";
let currentEventState = { active: false, name: "" };
let eventLogsUnsubscribe = null;
let showSystemAlerts = true;
let lastSyncStatus = { message: "", tone: "neutral" };
let pollFailureCount = 0;
let queueFlushHandle = null;

renderHouseCards();
buildPlaceRows();
setPlaceHint();

function normalizeRole(role) {
  const cleaned = String(role || "").trim().toLowerCase();
  return ROLE_CONFIG[cleaned] ? cleaned : "";
}

function getRoleRank(role) {
  const normalized = normalizeRole(role);
  const rank = ROLE_ORDER.indexOf(normalized);
  return rank >= 0 ? rank : ROLE_ORDER.indexOf("member");
}

function hasRoleAtLeast(role, minimumRole) {
  return getRoleRank(role) >= getRoleRank(minimumRole);
}

function getRoleConfig(role) {
  return ROLE_CONFIG[normalizeRole(role) || "member"] || ROLE_CONFIG.member;
}

function readJsonStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    console.warn("Storage read failed", error);
    return fallback;
  }
}

function writeJsonStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn("Storage write failed", error);
  }
}

function readStoredBoolean(key, fallback = true) {
  const value = readJsonStorage(key, null);
  if (typeof value === "boolean") return value;
  return fallback;
}

function writeStoredBoolean(key, value) {
  writeJsonStorage(key, Boolean(value));
}

function normalizeMode(mode) {
  const cleaned = String(mode || "").trim().toLowerCase();
  if (cleaned === "longterm" || cleaned === "long-term" || cleaned === "long_term") return "longTerm";
  if (cleaned === "oneoff" || cleaned === "one-off" || cleaned === "one_off") return "oneOff";
  return "";
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function backoffDelay(attempt) {
  const base = RETRY_CONFIG.baseDelayMs * Math.pow(2, Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * RETRY_CONFIG.jitterMs);
  return Math.min(RETRY_CONFIG.maxDelayMs, base + jitter);
}

function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function isRetryableError(error) {
  if (isOffline()) return true;
  const message = String(error?.message || "").toLowerCase();
  if (error?.name === "AbortError") return true;
  return message.includes("network")
    || message.includes("failed to fetch")
    || message.includes("timeout")
    || message.includes("temporarily")
    || message.includes("service unavailable");
}

async function retryWithBackoff(task, maxAttempts = RETRY_CONFIG.maxAttempts) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt === maxAttempts) break;
      await delay(backoffDelay(attempt));
    }
  }
  throw lastError;
}

function loadModeFromSession() {
  const storedMode = normalizeMode(sessionStorage.getItem(STORAGE_KEYS.sessionMode));
  const storedEventName = String(sessionStorage.getItem(STORAGE_KEYS.sessionEventName) || "").trim();
  currentMode = storedMode;
  currentEventName = storedEventName;
}

function storeModeInSession(mode, eventName) {
  sessionStorage.setItem(STORAGE_KEYS.sessionMode, mode);
  sessionStorage.setItem(STORAGE_KEYS.sessionEventName, eventName);
}

function updateModeLabels() {
  if (dom.sessionModeLabel) {
    if (!currentMode) dom.sessionModeLabel.textContent = "Not set";
    else dom.sessionModeLabel.textContent = currentMode === "longTerm" ? "Long-term event" : "One-off point addition";
  }
  if (dom.sessionEventLabel) {
    dom.sessionEventLabel.textContent = currentMode === "longTerm" && currentEventName
      ? `Event: ${currentEventName}`
      : "";
  }
}

function setModeSwitchActive(mode) {
  const normalized = normalizeMode(mode) || "oneOff";
  currentMode = normalized;
  if (dom.modeSwitch) {
    dom.modeSwitch.querySelectorAll(".mode-pill").forEach(button => {
      const isActive = button.getAttribute("data-mode") === normalized;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    });
  }
  document.querySelectorAll("[data-mode-panel]").forEach(panel => {
    const isActive = panel.getAttribute("data-mode-panel") === normalized;
    panel.classList.toggle("is-active", isActive);
  });
  updateModeLabels();
}

function setModeSwitchLocked(isLocked) {
  if (!dom.modeSwitch) return;
  dom.modeSwitch.classList.toggle("is-locked", isLocked);
  dom.modeSwitch.querySelectorAll(".mode-pill").forEach(button => {
    const mode = button.getAttribute("data-mode") || "oneOff";
    button.disabled = isLocked && mode !== "longTerm";
  });
}

function renderEventBanner(state) {
  if (!dom.eventBanner) return;
  if (!state?.active) {
    dom.eventBanner.hidden = true;
    return;
  }
  dom.eventBanner.hidden = false;
  if (dom.eventBannerTitle) dom.eventBannerTitle.textContent = state.name || "Active event";
  if (dom.eventBannerMeta) {
    const startedBy = state.startedBy ? `Started by ${state.startedBy}` : "Event in progress";
    dom.eventBannerMeta.textContent = startedBy;
  }
}

function applyEventState(state) {
  currentEventState = state || { active: false, name: "" };
  const active = Boolean(currentEventState.active);
  if (active) {
    currentMode = "longTerm";
    currentEventName = String(currentEventState.name || "").trim();
    if (dom.longTermEventName) {
      dom.longTermEventName.value = currentEventName;
      dom.longTermEventName.disabled = true;
    }
    setModeSwitchActive("longTerm");
    setModeSwitchLocked(true);
    const oneOffPanel = document.querySelector('[data-mode-panel="oneOff"]');
    if (oneOffPanel) oneOffPanel.classList.add("is-locked");
    void loadEventLogs();
  } else {
    if (dom.longTermEventName) dom.longTermEventName.disabled = false;
    setModeSwitchLocked(false);
    const oneOffPanel = document.querySelector('[data-mode-panel="oneOff"]');
    if (oneOffPanel) oneOffPanel.classList.remove("is-locked");
    clearEventLogs();
  }
  if (dom.eventStatus) {
    dom.eventStatus.textContent = active ? `Event active: ${currentEventName || "Current event"}` : "No active event";
  }
  if (dom.stopEventBtn) dom.stopEventBtn.disabled = !active;
  renderEventBanner(currentEventState);
}

function renderEventLogs(rows = []) {
  if (!dom.eventLogList) return;
  const activeName = String(currentEventState?.name || "").trim();
  const filtered = activeName
    ? rows.filter(row => String(row.eventName || "").trim() === activeName)
    : rows;

  if (!filtered.length) {
    dom.eventLogList.innerHTML = '<li class="log-empty">No event activity yet</li>';
    return;
  }

  dom.eventLogList.innerHTML = filtered.map(row => {
    const timestamp = row.createdAt?.toDate ? row.createdAt.toDate().toLocaleString() : "Just now";
    const actor = escapeHtml(row.user || "system");
    const houseId = String(row.house || "").trim();
    const house = escapeHtml(findHouseName(houseId));
    const houseMeta = houses.find(item => item.id === houseId);
    const delta = Number(row.delta || 0);
    const reason = escapeHtml(row.reason || "");
    const sign = delta > 0 ? "+" : "";
    const queued = row.queued ? "<span class=\"event-chip event-chip-warn\">Queued</span>" : "";

    return `
      <li class="event-log-item">
        <div class="event-log-meta">${timestamp} - ${actor}</div>
        <div class="event-log-detail">
          <span class="event-chip" style="background:${houseMeta?.bg || "#111827"};color:${houseMeta?.text || "#ffffff"}">${house}</span>
          <span class="event-chip event-chip-score">${sign}${delta}</span>
          <span>${reason}</span>
          ${queued}
        </div>
      </li>
    `;
  }).join("");
}

function clearEventLogs() {
  if (eventLogsUnsubscribe) {
    eventLogsUnsubscribe();
    eventLogsUnsubscribe = null;
  }
  if (dom.eventLogStatus) dom.eventLogStatus.textContent = "Waiting for event";
  renderEventLogs([]);
}

function loadEventLogs() {
  if (!currentEventState?.active) return;
  if (eventLogsUnsubscribe) {
    eventLogsUnsubscribe();
    eventLogsUnsubscribe = null;
  }
  if (dom.eventLogStatus) dom.eventLogStatus.textContent = "Live";
  const eventQuery = query(eventLogsCollection, orderBy("createdAt", "desc"), limit(30));
  eventLogsUnsubscribe = onSnapshot(eventQuery, snapshot => {
    const rows = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
    renderEventLogs(rows);
  }, error => {
    console.error(error);
    if (dom.eventLogStatus) dom.eventLogStatus.textContent = "Unavailable";
  });
}

async function appendEventLog(entry) {
  if (!currentEventState?.active) return;
  try {
    await addDoc(eventLogsCollection, {
      eventName: currentEventState.name || "",
      house: entry.house,
      delta: entry.delta,
      reason: entry.reason || "",
      user: currentUserEmail || "",
      role: currentUserRole || "",
      source: entry.source || "",
      queued: Boolean(entry.queued),
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.warn("Event log write failed", error);
  }
}

function applyModeSelection(mode) {
  const normalized = normalizeMode(mode) || "oneOff";
  if (currentEventState?.active && normalized !== "longTerm") {
    showToast("An event is active. Mode is locked to long-term.", "warn");
    setModeSwitchActive("longTerm");
    return;
  }
  currentMode = normalized;
  currentEventName = String(dom.longTermEventName?.value || "").trim();
  try {
    storeModeInSession(currentMode, currentEventName);
  } catch (error) {
    console.warn("Mode storage failed", error);
  }
  setModeSwitchActive(currentMode);
}

async function startEvent() {
  if (!requireRole("member", "Members and above can start events.")) return;
  const name = String(dom.longTermEventName?.value || "").trim();
  if (!name) {
    showToast("Enter an event name before starting.", "warn");
    dom.longTermEventName?.focus();
    return;
  }
  const confirmed = window.confirm(`Start the event "${name}"? This will lock scoring to long-term mode.`);
  if (!confirmed) return;

  await setDoc(eventDoc, {
    active: true,
    name,
    startedBy: currentUserEmail || "",
    startedByRole: currentUserRole || "",
    startedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

async function stopEvent() {
  if (!requireRole("member", "Members and above can stop events.")) return;
  const confirmed = window.confirm("Stop the current event? Scoring will return to one-off mode.");
  if (!confirmed) return;

  await setDoc(eventDoc, {
    active: false,
    name: "",
    endedBy: currentUserEmail || "",
    endedByRole: currentUserRole || "",
    endedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

function ensureModeSwitch() {
  loadModeFromSession();
  if (!currentMode) currentMode = "oneOff";
  if (dom.longTermEventName) dom.longTermEventName.value = currentEventName || "";
  setModeSwitchActive(currentMode);
}

function getPendingWrites() {
  const list = readJsonStorage(STORAGE_KEYS.pendingWrites, []);
  return Array.isArray(list) ? list : [];
}

function savePendingWrites(list) {
  writeJsonStorage(STORAGE_KEYS.pendingWrites, list);
}

function prunePendingWrites(list) {
  const cutoff = Date.now() - QUEUE_CONFIG.maxAgeMs;
  return list.filter(item => Number(item?.createdAt || 0) >= cutoff);
}

function pendingWriteCount() {
  return getPendingWrites().length;
}

function updateSystemAlertsToggle() {
  showSystemAlerts = readStoredBoolean(STORAGE_KEYS.showSystemAlerts, true);
  if (dom.systemAlertsToggle) dom.systemAlertsToggle.checked = showSystemAlerts;
}

function shouldEmitSystemAlert(key) {
  const throttle = readJsonStorage(STORAGE_KEYS.systemAlertThrottle, {});
  const last = Number(throttle[key] || 0);
  if (Date.now() - last < ALERT_THROTTLE_MS) return false;
  throttle[key] = Date.now();
  writeJsonStorage(STORAGE_KEYS.systemAlertThrottle, throttle);
  return true;
}

async function emitSystemAlert({ title, body, severity = "warn", source = "sheets", dedupeKey }) {
  if (dedupeKey && !shouldEmitSystemAlert(dedupeKey)) return;

  try {
    await addDoc(notificationsCollection, {
      title: title || "System alert",
      body: body || "",
      targetRole: "all",
      status: "active",
      type: "system",
      severity,
      source,
      createdBy: currentUserEmail || "system",
      createdByRole: currentUserRole || "member",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.warn("System alert could not be posted", error);
  }
}

function setSuggestionStatus(message, tone = "neutral") {
  if (!dom.suggestionStatus) return;
  dom.suggestionStatus.textContent = message;
  dom.suggestionStatus.dataset.tone = tone;
}

function setUserList(message) {
  if (!dom.userList) return;
  dom.userList.innerHTML = `<li class="log-empty">${escapeHtml(message)}</li>`;
}

function setUserManagementStatus(message, tone = "neutral") {
  if (!dom.userManagementStatus) return;
  dom.userManagementStatus.textContent = message;
  dom.userManagementStatus.dataset.tone = tone;
}

function setNotificationStatus(message, tone = "neutral") {
  if (!dom.notificationStatus) return;
  dom.notificationStatus.textContent = message;
  dom.notificationStatus.dataset.tone = tone;
}

function setStudentStatus(message, tone = "neutral") {
  if (!dom.studentSearchStatus) return;
  dom.studentSearchStatus.textContent = message;
  dom.studentSearchStatus.dataset.tone = tone;

  // Also surface the student status on the Tools menu so it's visible when the
  // drawer is closed. Don't override a numeric menu badge (used elsewhere).
  try {
    if (dom.toolsMenuBtn) dom.toolsMenuBtn.hidden = false;
    if (dom.menuBadge) {
      const existing = String(dom.menuBadge.textContent || "").trim();
      const hasDigits = /\d/.test(existing);
      if (!hasDigits) {
        if (tone === "live") dom.menuBadge.textContent = "";
        else if (tone === "warn") dom.menuBadge.textContent = "!";
        else if (/load/i.test(message)) dom.menuBadge.textContent = "…";
        else dom.menuBadge.textContent = "";
      }
      dom.menuBadge.title = message;
      dom.menuBadge.hidden = false;
    }
  } catch (e) {
    /* best-effort UI hint; ignore errors */
  }
}

function closeToolsDrawer() {
  if (dom.toolsDrawer) {
    dom.toolsDrawer.hidden = true;
    dom.toolsDrawer.setAttribute("aria-hidden", "true");
  }
  if (dom.toolsDrawerOverlay) dom.toolsDrawerOverlay.hidden = true;
  if (dom.toolsMenuBtn) dom.toolsMenuBtn.setAttribute("aria-expanded", "false");
}

function openToolsDrawer() {
  if (!hasRoleAtLeast(currentUserRole, "member")) return;
  if (dom.toolsDrawer) {
    dom.toolsDrawer.hidden = false;
    dom.toolsDrawer.setAttribute("aria-hidden", "false");
  }
  if (dom.toolsDrawerOverlay) dom.toolsDrawerOverlay.hidden = false;
  if (dom.toolsMenuBtn) dom.toolsMenuBtn.setAttribute("aria-expanded", "true");
  closeDrawer();
}

function toggleToolsDrawer() {
  if (dom.toolsDrawer?.hidden) openToolsDrawer();
  else closeToolsDrawer();
}

function normalizeStudentRow(row) {
  if (!row) return null;
  if (Array.isArray(row)) {
    const grade = String(row[0] || "").trim();
    const name = String(row[1] || "").trim();
    const houseRaw = String(row[2] || "").trim();
    if (!name) return null;
    const houseId = normalizeHouseFromSheet(houseRaw) || "";
    return { name, houseId, houseRaw, grade };
  }

  if (row.Student && row.House) {
    const name = String(row.Student || "").trim();
    if (!name) return null;
    const houseRaw = String(row.House || "").trim();
    const grade = String(row.Grade || "").trim();
    const houseId = normalizeHouseFromSheet(houseRaw) || "";
    return { name, houseId, houseRaw, grade };
  }

  const nameKeys = ["Student", "Name", "Student Name", "StudentName", "Full Name", "FullName"];
  const houseKeys = ["Panda", "Polar", "Grizzly", "Kodiak", "Color", "House Color", "HouseColor"];
  let name = "";
  let houseRaw = "";
  let grade = "";
  const gradeKeys = ["Grade", "Grade Level", "GradeLevel", "Class", "Level"];

  for (const key of nameKeys) {
    if (row[key]) {
      name = String(row[key]).trim();
      break;
    }
  }
  for (const key of houseKeys) {
    if (row[key]) {
      houseRaw = String(row[key]).trim();
      break;
    }
  }
  for (const key of gradeKeys) {
    if (row[key]) {
      grade = String(row[key]).trim();
      break;
    }
  }
  if (!name) return null;
  const houseId = normalizeHouseFromSheet(houseRaw) || "";
  return { name, houseId, houseRaw, grade };
}

function normalizeStudentRowsPayload(rows) {
  if (Array.isArray(rows)) return rows;
  if (typeof rows === "string") {
    return rows
      .split(/\r?\n/)
      .map(line => line.trimEnd())
      .filter(line => line.trim().length > 0);
  }
  if (rows && typeof rows === "object") return [rows];
  return [];
}

function parseGroupedStudentExportRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  if (!rows.every(row => row && !Array.isArray(row) && typeof row === "object" && "Student" in row && "House" in row)) {
    return [];
  }

  const houseOrder = [];
  const buckets = new Map();

  for (const row of rows) {
    const houseRaw = String(row.House || "").trim();
    const houseId = normalizeHouseFromSheet(houseRaw) || "";
    if (!houseId) continue;

    if (!buckets.has(houseId)) {
      buckets.set(houseId, { houseRaw: HOUSE_TO_SHEET[houseId] || houseRaw, grades: [], names: [] });
      houseOrder.push(houseId);
    }

    const bucket = buckets.get(houseId);
    const student = String(row.Student || "").trim();
    if (!student) continue;

    if (isLikelyGradeValue(student)) bucket.grades.push(student);
    else bucket.names.push(student);
  }

  const parsed = [];
  for (const houseId of houseOrder) {
    const bucket = buckets.get(houseId);
    const pairCount = Math.min(bucket.grades.length, bucket.names.length);
    for (let index = 0; index < pairCount; index += 1) {
      parsed.push({
        name: bucket.names[index],
        grade: bucket.grades[index],
        houseId,
        houseRaw: bucket.houseRaw
      });
    }
  }

  return parsed;
}

function isLikelyGradeValue(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return false;
  if (value === "k" || value === "kg" || value === "kindergarten") return true;
  return /^\d{1,2}$/.test(value);
}

function extractHouseStudentFromObjectRow(row) {
  if (!row || Array.isArray(row) || typeof row !== "object") return [];
  const parsed = [];
  const entries = Object.entries(row);
  for (const [key, value] of entries) {
    const houseId = normalizeHouseFromSheet(key);
    if (!houseId) continue;
    const rawCell = String(value || "").trim();
    if (!rawCell) continue;
    const match = rawCell.match(/^(k|kg|kindergarten|\d{1,2})\s+(.+)$/i);
    if (!match) continue;
    const grade = String(match[1] || "").trim();
    const name = String(match[2] || "").trim();
    if (!name) continue;
    parsed.push({
      name,
      grade,
      houseId,
      houseRaw: HOUSE_TO_SHEET[houseId] || houseId
    });
  }
  return parsed;
}

function normalizeRowToCells(row) {
  if (Array.isArray(row)) return row;
  if (typeof row === "string") {
    if (row.includes("\t")) return row.split("\t");
    if (row.includes("  ")) return row.trim().split(/\s{2,}/);
    return [row];
  }
  if (row && typeof row === "object") return Object.values(row);
  return [];
}

function findNextNonEmptyCellIndex(cells, startIndex) {
  for (let index = startIndex; index < cells.length; index += 1) {
    if (String(cells[index] || "").trim()) return index;
  }
  return -1;
}

function assignHouseAcrossSpan(houseByColumn, cells, startIndex, houseId) {
  let nextHeaderIndex = cells.length;
  for (let index = startIndex + 1; index < cells.length; index += 1) {
    if (normalizeHouseFromSheet(cells[index])) {
      nextHeaderIndex = index;
      break;
    }
  }

  for (let index = startIndex; index < nextHeaderIndex; index += 1) {
    if (!String(cells[index] || "").trim() || index === startIndex) {
      houseByColumn[index] = houseId;
    }
  }
}

function parseWideHouseRosterRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  const houseByColumn = {};
  const headerColumns = [];
  let sawHouseHeaders = false;
  const parsed = [];

  for (const row of rows) {
    const objectParsed = extractHouseStudentFromObjectRow(row);
    if (objectParsed.length) {
      parsed.push(...objectParsed);
      sawHouseHeaders = true;
      continue;
    }

    const cells = normalizeRowToCells(row);
    if (!cells.length) continue;

    let rowIntroducedHeaders = false;
    for (let index = 0; index < cells.length; index += 1) {
      const houseId = normalizeHouseFromSheet(cells[index]);
      if (houseId) {
        assignHouseAcrossSpan(houseByColumn, cells, index, houseId);
        if (!headerColumns.includes(index)) headerColumns.push(index);
        rowIntroducedHeaders = true;
        sawHouseHeaders = true;
      }
    }
    if (rowIntroducedHeaders) continue;

    for (let index = 0; index < cells.length; index += 1) {
      const grade = String(cells[index] || "").trim();
      if (!isLikelyGradeValue(grade)) continue;

      const nameIndex = findNextNonEmptyCellIndex(cells, index + 1);
      if (nameIndex < 0) continue;
      const name = String(cells[nameIndex] || "").trim();
      if (!name) continue;

      let houseId = houseByColumn[index] || houseByColumn[nameIndex] || "";
      if (!houseId && headerColumns.length) {
        let nearest = -1;
        for (const column of headerColumns) {
          if (column <= index && column > nearest) nearest = column;
        }
        if (nearest >= 0) houseId = houseByColumn[nearest] || "";
      }
      parsed.push({
        name,
        grade,
        houseId,
        houseRaw: houseId ? (HOUSE_TO_SHEET[houseId] || houseId) : ""
      });
      index = nameIndex;
    }
  }

  return sawHouseHeaders ? parsed : [];
}

function parseStudentRows(rows) {
  const normalizedRows = normalizeStudentRowsPayload(rows);
  if (!normalizedRows.length) return [];

  const groupedExportParsed = parseGroupedStudentExportRows(normalizedRows);
  if (groupedExportParsed.length) return groupedExportParsed;

  const wideRosterParsed = parseWideHouseRosterRows(normalizedRows);
  if (wideRosterParsed.length) return wideRosterParsed;
  return normalizedRows.map(normalizeStudentRow).filter(Boolean);
}

function renderStudentSearch(list) {
  if (!dom.studentSearchList) return;
  if (!list.length) {
    dom.studentSearchList.innerHTML = '<li class="log-empty">No results</li>';
    return;
  }
  dom.studentSearchList.innerHTML = list.map(item => {
    const houseName = item.houseId ? findHouseName(item.houseId) : "Unknown house";
    const gradeLabel = item.grade ? `Grade ${escapeHtml(item.grade)}` : "Grade unknown";
    return `
      <li class="student-item">
        <strong>${escapeHtml(item.name)}</strong>
        <div class="student-meta">${gradeLabel} - ${escapeHtml(houseName)}</div>
      </li>
    `;
  }).join("");
}

function filterStudents(queryText) {
  const query = String(queryText || "").trim().toLowerCase();
  if (!query) {
    renderStudentSearch(currentStudents.slice(0, 12));
    return;
  }
  const results = currentStudents.filter(item => item.nameLower.includes(query)).slice(0, 20);
  renderStudentSearch(results);
}

async function loadStudents() {
  setStudentStatus("Loading", "neutral");
  try {
    const result = await callSheetApi({
      action: "getStudents",
      spreadsheetId: SHEETS_SYNC.spreadsheetId,
      tab: SHEETS_SYNC.studentsTab
    });
    const rows = normalizeStudentRowsPayload(result?.rows);
    const parsed = parseStudentRows(rows);
    const missingHouse = parsed.filter(item => !item.houseId).length;
    const missingGrade = parsed.filter(item => !item.grade).length;
    currentStudents = parsed.map(item => ({
      ...item,
      nameLower: item.name.toLowerCase()
    }));
    const summaryParts = [`Loaded ${currentStudents.length}`];
    if (missingHouse > 0) summaryParts.push(`${missingHouse} missing house`);
    if (missingGrade > 0) summaryParts.push(`${missingGrade} missing grade`);
    const summary = summaryParts.join(" - ");
    setStudentStatus(summary, "live");
    filterStudents(dom.studentSearchInput?.value || "");
  } catch (error) {
    const message = error?.message ? `Unable to load (${error.message})` : "Unable to load";
    setStudentStatus(message, "warn");
    renderStudentSearch([]);
  }
}

function closeDrawer() {
  if (dom.superadminDrawer) {
    dom.superadminDrawer.hidden = true;
    dom.superadminDrawer.setAttribute("aria-hidden", "true");
  }
  if (dom.drawerOverlay) dom.drawerOverlay.hidden = true;
  if (dom.menuBtn) dom.menuBtn.setAttribute("aria-expanded", "false");
}

function openDrawer() {
  if (!hasRoleAtLeast(currentUserRole, "admin")) return;
  if (dom.superadminDrawer) {
    dom.superadminDrawer.hidden = false;
    dom.superadminDrawer.setAttribute("aria-hidden", "false");
  }
  if (dom.drawerOverlay) dom.drawerOverlay.hidden = false;
  if (dom.menuBtn) dom.menuBtn.setAttribute("aria-expanded", "true");
}

function toggleDrawer() {
  if (dom.superadminDrawer?.hidden) openDrawer();
  else closeDrawer();
}

function renderUserList(users = []) {
  if (!dom.userList) return;
  currentUsers = users;

  if (!users.length) {
    setUserList("No user profiles loaded yet.");
    return;
  }

  dom.userList.innerHTML = users.map(user => {
    const role = getRoleConfig(user.role);
    const status = user.status || "active";
    const displayName = escapeHtml(user.displayName || user.email || user.uid || "Unknown user");
    const email = escapeHtml(user.email || "");
    const roleOptions = ROLE_ORDER.map(roleKey => {
      const item = getRoleConfig(roleKey);
      const selected = normalizeRole(user.role) === roleKey ? "selected" : "";
      return `<option value="${roleKey}" ${selected}>${item.label}</option>`;
    }).join("");
    return `
      <li class="user-item">
        <div class="user-item-main">
          <strong>${displayName}</strong>
          <span class="user-meta">${email || "No email"}</span>
          <span class="user-meta">UID: ${escapeHtml(user.uid || "")}</span>
        </div>
        <div class="user-item-actions">
          <select class="user-role-select" data-user-role="${escapeHtml(user.uid || "")}">${roleOptions}</select>
          <button class="btn btn-outline btn-mini" type="button" data-user-action="save-role" data-user-uid="${escapeHtml(user.uid || "")}">Save Role</button>
          <button class="btn btn-muted btn-mini" type="button" data-user-action="toggle-status" data-user-uid="${escapeHtml(user.uid || "")}" data-user-status="${escapeHtml(status)}">${status === "disabled" ? "Enable" : "Disable"}</button>
          <button class="btn btn-danger btn-mini" type="button" data-user-action="delete-user" data-user-uid="${escapeHtml(user.uid || "")}">Delete</button>
          <span class="role-chip">${role.label}</span>
          <span class="user-status" data-status="${escapeHtml(status)}">${escapeHtml(status)}</span>
        </div>
      </li>
    `;
  }).join("");
}

function isNotificationForRole(notification, role) {
  const target = normalizeRole(notification.targetRole) || "";
  if (!target || target === "all") return true;
  return getRoleRank(role) >= getRoleRank(target);
}

function canManageNotification(notification, role = currentUserRole) {
  if (hasRoleAtLeast(role, "superadmin")) return true;
  if (!hasRoleAtLeast(role, "admin")) return false;
  return normalizeRole(notification?.targetRole) !== "superadmin";
}

function getNotificationReviewRole() {
  const requested = normalizeRole(dom.notificationReviewRole?.value || currentNotificationReviewRole || "");
  if (!requested || requested === "all") return currentUserRole;
  return requested;
}

function setSuggestionQueueStatus(message, tone = "neutral") {
  if (!dom.suggestionQueueStatus) return;
  dom.suggestionQueueStatus.textContent = message;
  dom.suggestionQueueStatus.dataset.tone = tone;
}

function renderSheetLog(rows = []) {
  if (!dom.sheetLogList) return;

  currentLogRows = rows;
  const visible = rows.filter(row => row.status !== "deleted");

  if (!visible.length) {
    dom.sheetLogList.innerHTML = '<li class="log-empty">No sheet log entries yet</li>';
    return;
  }

  dom.sheetLogList.innerHTML = visible.slice().reverse().map(row => {
    const timestamp = escapeHtml(row.Timestamp || row.timestamp || "");
    const level = escapeHtml(row.Level || row.level || "INFO");
    const eventType = escapeHtml(row.EventType || row.eventType || "EVENT");
    const user = escapeHtml(row.User || row.user || "system");
    const details = escapeHtml(row.Details || row.details || "");

    return `
      <li class="sheet-log-item">
        <div class="sheet-log-meta">${timestamp || "Just now"} · ${user}</div>
        <div class="sheet-log-event">${eventType} <span class="log-time">${level}</span></div>
        <div class="sheet-log-details">${details}</div>
      </li>
    `;
  }).join("");
}

function renderNotificationBanner(notification) {
  if (!dom.noticeBar) return;
  if (!notification) {
    dom.noticeBar.hidden = true;
    return;
  }

  dom.noticeBar.hidden = false;
  if (dom.noticeTitle) dom.noticeTitle.textContent = notification.title || "Notice";
  if (dom.noticeBody) dom.noticeBody.textContent = notification.body || "";
  if (dom.noticeMeta) dom.noticeMeta.textContent = notification.targetRole && notification.targetRole !== "all"
    ? `For ${getRoleConfig(notification.targetRole).label}s`
    : "All roles";
}

function renderNotificationList(notifications = []) {
  if (!dom.notificationList) return;

  currentNotifications = notifications;
  const reviewRole = getNotificationReviewRole();
  currentNotificationReviewRole = reviewRole;
  const visible = notifications.filter(notification => {
    if (notification.status === "deleted") return false;
    if (!isNotificationForRole(notification, reviewRole)) return false;
    const isSystem = String(notification.type || "").toLowerCase() === "system";
    if (!showSystemAlerts && isSystem) return false;
    return true;
  });

  if (!dom.menuBadge) return;
  const count = visible.length;
  dom.menuBadge.textContent = String(count);
  dom.menuBadge.hidden = count === 0;

  if (!visible.length) {
    dom.notificationList.innerHTML = `<li class="log-empty">No notifications yet for ${escapeHtml(reviewRole || "current role")}</li>`;
    renderNotificationBanner(null);
    return;
  }

  dom.notificationList.innerHTML = visible.map(notification => {
    const title = escapeHtml(notification.title || "Notice");
    const body = escapeHtml(notification.body || "");
    const createdAt = notification.createdAt?.toDate ? notification.createdAt.toDate() : null;
    const timestamp = createdAt ? createdAt.toLocaleString() : "Just now";
    const targetRole = notification.targetRole && notification.targetRole !== "all"
      ? getRoleConfig(notification.targetRole).label
      : "All roles";
    const isSystem = String(notification.type || "").toLowerCase() === "system";
    const severity = String(notification.severity || "warn").toLowerCase();
    const systemChip = isSystem
      ? `<span class="notification-type-chip" data-severity="${escapeHtml(severity)}">System</span>`
      : "";

    return `
      <li class="notification-item">
        <div class="notification-item-top">
          <div>
            <strong>${title}</strong>
            <div class="notification-meta">${timestamp} - <span class="notification-review-role-chip">${escapeHtml(reviewRole === currentUserRole ? targetRole : `${targetRole} / as ${getRoleConfig(reviewRole).label}`)}</span> ${systemChip}</div>
          </div>
          ${canManageNotification(notification) ? `
          <div class="notification-actions">
            <button class="btn btn-outline btn-mini" type="button" data-notification-action="delete" data-notification-id="${escapeHtml(notification.id || "")}">Delete</button>
          </div>` : ""}
        </div>
        <div class="notification-body-text">${body}</div>
      </li>
    `;
  }).join("");

  const bannerNotification = visible.find(notification => {
    const isSystem = String(notification.type || "").toLowerCase() === "system";
    return !isSystem && isNotificationForRole(notification, currentUserRole);
  }) || visible.find(notification => String(notification.type || "").toLowerCase() !== "system") || null;
  renderNotificationBanner(bannerNotification);
}

function renderSuggestionQueue(rows = []) {
  if (!dom.suggestionQueueList) return;

  currentSuggestions = rows;
  const visible = rows.filter(row => row.status !== "deleted");

  if (!visible.length) {
    dom.suggestionQueueList.innerHTML = '<li class="log-empty">No suggestions yet</li>';
    setSuggestionQueueStatus("No suggestions", "neutral");
    return;
  }

  setSuggestionQueueStatus(`${visible.filter(row => row.status === "pending").length} pending`, "live");

  dom.suggestionQueueList.innerHTML = visible.map(suggestion => {
    const title = escapeHtml(suggestion.reason || "Point suggestion");
    const author = escapeHtml(suggestion.authorEmail || "Unknown user");
    const house = escapeHtml(findHouseName(suggestion.house || suggestion.houseId || ""));
    const delta = Number(suggestion.delta || 0);
    const status = String(suggestion.status || "pending").toLowerCase();
    const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
    const createdAt = suggestion.createdAt?.toDate ? suggestion.createdAt.toDate() : null;
    const timestamp = createdAt ? createdAt.toLocaleString() : "Just now";
    const canReview = hasRoleAtLeast(currentUserRole, "admin") && status === "pending";

    return `
      <li class="suggestion-item">
        <div class="suggestion-item-top">
          <div>
            <strong>${title}</strong>
            <div class="suggestion-meta">${timestamp} · ${author}</div>
          </div>
          <span class="suggestion-status-chip" data-status="${escapeHtml(status)}">${statusLabel}</span>
        </div>
        <div class="suggestion-item-body">
          <div class="suggestion-meta">${house} · ${delta > 0 ? "+" : ""}${delta} points</div>
          <div>${escapeHtml(suggestion.reason || "")}</div>
        </div>
        ${canReview ? `
        <div class="suggestion-actions">
          <button class="btn btn-primary btn-mini" type="button" data-suggestion-action="approve" data-suggestion-id="${escapeHtml(suggestion.id || "")}">Approve</button>
          <button class="btn btn-outline btn-mini" type="button" data-suggestion-action="reject" data-suggestion-id="${escapeHtml(suggestion.id || "")}">Reject</button>
        </div>` : ""}
      </li>
    `;
  }).join("");
}

function updateUndoRedoButtons() {
  const config = getRoleConfig(currentUserRole);
  const hasHistory = Boolean(currentHistory.commits.length);
  if (dom.undoBtn) dom.undoBtn.disabled = !(config.canUndo && hasHistory);
  if (dom.redoBtn) dom.redoBtn.disabled = true;
}

function applyRoleUi(role) {
  const config = getRoleConfig(role);
  currentUserRole = normalizeRole(role) || "member";
  currentNotificationReviewRole = currentUserRole;

  if (dom.roleBadge) {
    dom.roleBadge.textContent = config.label;
    dom.roleBadge.dataset.role = currentUserRole;
  }

  if (dom.roleDescription) {
    dom.roleDescription.textContent = config.summary;
  }

  if (dom.loggedInAs) {
    dom.loggedInAs.textContent = `${currentUserEmail} - ${config.label}`;
  }

  if (dom.menuBtn) dom.menuBtn.hidden = !hasRoleAtLeast(currentUserRole, "admin");
  if (dom.noticeBar) dom.noticeBar.hidden = false;
  if (dom.notificationReviewRole) dom.notificationReviewRole.value = "all";

  const actionControls = dom.housesContainer.querySelectorAll("[data-action-control]");
  actionControls.forEach(control => {
    if (!(control instanceof HTMLButtonElement || control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) return;
    const isHouseAction = control.closest(".card") !== null;
    const isPlaceAction = control.closest(".place-awards") !== null;
    const isCheckpointAction = control.id === "checkpointBtn" || control.id === "checkpointName";
    const isResetAction = control.id === "resetBtn";

    let enabled = true;
    if (isHouseAction) enabled = config.canMutatePoints;
    if (isPlaceAction) enabled = config.canAwardPlaces;
    if (isCheckpointAction) enabled = config.canCheckpoint;
    if (isResetAction) enabled = config.canReset;
    control.disabled = !enabled;
  });

  if (dom.autoFillBtn) dom.autoFillBtn.disabled = !config.canAwardPlaces;
  if (dom.clearPlacesBtn) dom.clearPlacesBtn.disabled = !config.canAwardPlaces;
  if (dom.applyPlacesBtn) dom.applyPlacesBtn.disabled = !config.canAwardPlaces;
  if (dom.checkpointBtn) dom.checkpointBtn.disabled = !config.canCheckpoint;
  if (dom.checkpointName) dom.checkpointName.disabled = !config.canCheckpoint;
  if (dom.pointReason) dom.pointReason.disabled = !(config.canMutatePoints || config.canAwardPlaces || config.canCheckpoint || config.canUndo);
  if (dom.suggestionHouse) dom.suggestionHouse.disabled = !config.canSuggest;
  if (dom.suggestionDelta) dom.suggestionDelta.disabled = !config.canSuggest;
  if (dom.suggestionReason) dom.suggestionReason.disabled = !config.canSuggest;
  if (dom.suggestionBtn) dom.suggestionBtn.disabled = !config.canSuggest;
  if (dom.undoBtn) dom.undoBtn.disabled = !config.canUndo;
  if (dom.redoBtn) dom.redoBtn.disabled = !config.canUndo;
  if (dom.resetBtn) dom.resetBtn.disabled = !config.canReset;
  if (dom.suggestionPanel) dom.suggestionPanel.hidden = !config.canSuggest;
  if (dom.userAdminPanel) dom.userAdminPanel.hidden = !config.canManageUsers;
  if (dom.suggestionReviewPanel) dom.suggestionReviewPanel.hidden = !hasRoleAtLeast(currentUserRole, "admin");
  if (dom.startEventBtn) dom.startEventBtn.disabled = !hasRoleAtLeast(currentUserRole, "member");
  if (dom.stopEventBtn) dom.stopEventBtn.disabled = !hasRoleAtLeast(currentUserRole, "member");
  if (dom.eventBannerStop) dom.eventBannerStop.disabled = !hasRoleAtLeast(currentUserRole, "member");

  if (dom.notificationTargetRole) {
    [...dom.notificationTargetRole.options].forEach(option => {
      if (option.value !== "superadmin") return;
      option.disabled = !hasRoleAtLeast(currentUserRole, "superadmin");
    });
    if (!hasRoleAtLeast(currentUserRole, "superadmin") && dom.notificationTargetRole.value === "superadmin") {
      dom.notificationTargetRole.value = "admin";
    }
  }

  if (!hasRoleAtLeast(currentUserRole, "admin")) closeDrawer();

  updateUndoRedoButtons();
}

async function resolveCurrentUserRole(user) {
  const token = await user.getIdTokenResult(true);
  const claimedRole = normalizeRole(token.claims.role)
    || (token.claims.superadmin ? "superadmin" : "")
    || (token.claims.admin ? "admin" : "")
    || (token.claims.member ? "member" : "")
    || (token.claims.helper ? "helper" : "");

  const profileSnapshot = await getDoc(doc(db, "users", user.uid));
  const profile = profileSnapshot.exists() ? profileSnapshot.data() : null;
  const profileRole = normalizeRole(profile?.role);

  currentUserProfile = profile;
  return profileRole || claimedRole || "member";
}

async function loadUserDirectory() {
  if (!hasRoleAtLeast(currentUserRole, "superadmin")) return;

  if (usersUnsubscribe) {
    usersUnsubscribe();
    usersUnsubscribe = null;
  }

  const userQuery = query(usersCollection, orderBy("email"), limit(50));
  usersUnsubscribe = onSnapshot(userQuery, snapshot => {
    const users = snapshot.docs.map(document => ({ uid: document.id, ...document.data() }));
    renderUserList(users);
  }, error => {
    console.error(error);
    setUserList("Unable to load user profiles.");
  });
}

async function loadSuggestions() {
  if (suggestionsUnsubscribe) {
    suggestionsUnsubscribe();
    suggestionsUnsubscribe = null;
  }

  if (!hasRoleAtLeast(currentUserRole, "admin")) return;

  const suggestionQuery = query(suggestionsCollection, orderBy("createdAt", "desc"), limit(20));
  suggestionsUnsubscribe = onSnapshot(suggestionQuery, snapshot => {
    const suggestions = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
    if (!suggestionsBootstrapped) {
      suggestionsBootstrapped = true;
    }
    renderSuggestionQueue(suggestions);
  }, error => {
    console.error(error);
    setSuggestionQueueStatus("Unable to load suggestions.", "warn");
  });
}

async function loadNotifications() {
  if (notificationsUnsubscribe) {
    notificationsUnsubscribe();
    notificationsUnsubscribe = null;
  }

  const notificationQuery = query(notificationsCollection, orderBy("createdAt", "desc"), limit(10));
  notificationsUnsubscribe = onSnapshot(notificationQuery, snapshot => {
    const notifications = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
    if (!notificationsBootstrapped) {
      notificationsBootstrapped = true;
    } else if (notifications[0]?.id && notifications[0].id !== currentNotifications[0]?.id) {
      const newest = notifications[0];
      if (isNotificationForRole(newest, currentUserRole)) {
        showToast(newest.title || "New notice posted.", "info");
      }
    }
    renderNotificationList(notifications);
  }, error => {
    console.error(error);
    setNotificationStatus("Unable to load notifications.", "warn");
  });
}

async function fetchSheetLog() {
  try {
    const result = await callSheetApi({
      action: "getPoints",
      spreadsheetId: SHEETS_SYNC.spreadsheetId,
      tab: SHEETS_SYNC.logTab
    });
    const rows = Array.isArray(result?.rows) ? result.rows : [];
    cacheLog(rows);
    return rows;
  } catch (error) {
    const cached = getCachedLog();
    if (cached) return cached.rows;
    throw error;
  }
}

async function postNotification() {
  if (!requireRole("admin", "Admins and superadmins can post notifications.")) return;

  const title = (dom.notificationTitle?.value || "").trim();
  const body = (dom.notificationBody?.value || "").trim();
  const targetRole = normalizeRole(dom.notificationTargetRole?.value || "") || "all";

  if (!title) {
    setNotificationStatus("Enter a notification title.", "warn");
    return;
  }

  if (!body) {
    setNotificationStatus("Enter a notification message.", "warn");
    return;
  }

  if (dom.notificationBtn) dom.notificationBtn.disabled = true;
  setNotificationStatus("Posting notice...", "neutral");

  try {
    await addDoc(notificationsCollection, {
      title,
      body,
      targetRole,
      status: "active",
      createdBy: currentUserEmail,
      createdByRole: currentUserRole,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    await appendSyncLog({
      level: "INFO",
      eventType: "NOTIFICATION_POSTED",
      details: `${currentUserRole}: ${title} → ${targetRole}`
    });

    if (dom.notificationTitle) dom.notificationTitle.value = "";
    if (dom.notificationBody) dom.notificationBody.value = "";
    if (dom.notificationTargetRole) dom.notificationTargetRole.value = "all";
    setNotificationStatus("Notification posted.", "live");
    showToast("Notification posted.", "success");
  } catch (error) {
    console.error(error);
    setNotificationStatus("Could not post the notification.", "warn");
    showToast("Unable to post notification.", "warn");
  } finally {
    if (dom.notificationBtn) dom.notificationBtn.disabled = false;
  }
}

async function deleteNotification(id) {
  if (!requireRole("admin", "Admins and superadmins can delete notifications.")) return;
  if (!id) return;
  await deleteDoc(doc(db, "notifications", id));
  await appendSyncLog({ level: "WARN", eventType: "NOTIFICATION_DELETED", details: `${currentUserRole}: ${id}` });
  showToast("Notification deleted.", "warn");
}

async function createManagedUser() {
  if (!requireRole("superadmin", "Superadmins can create users.")) return;

  const email = (dom.newUserEmail?.value || "").trim();
  const displayName = (dom.newUserDisplayName?.value || "").trim();
  const password = (dom.newUserPassword?.value || "StuG0!").trim();
  const role = normalizeRole(dom.newUserRole?.value || "member") || "member";

  if (!email) {
    setUserManagementStatus("Enter an email address.", "warn");
    return;
  }

  if (password.length < 6) {
    setUserManagementStatus("Password must be at least 6 characters.", "warn");
    return;
  }

  setUserManagementStatus("Creating user...", "neutral");
  if (dom.userCreateBtn) dom.userCreateBtn.disabled = true;

  try {
    const uid = `profile_${email.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`;
    await setDoc(doc(db, "users", uid), {
      uid,
      email: email.toLowerCase(),
      displayName,
      role,
      status: "active",
      startingPassword: password,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
    await appendSyncLog({
      level: "INFO",
      eventType: "USER_PROFILE_CREATED",
      details: `${email.toLowerCase()} => ${role}`
    });
    setUserManagementStatus(`Created profile for ${email}.`, "live");
    showToast(`Created profile for ${email}.`, "success");
    if (dom.newUserEmail) dom.newUserEmail.value = "";
    if (dom.newUserDisplayName) dom.newUserDisplayName.value = "";
    if (dom.newUserPassword) dom.newUserPassword.value = "";
    if (dom.newUserRole) dom.newUserRole.value = "member";
    await loadUserDirectory();
  } catch (error) {
    console.error(error);
    setUserManagementStatus("Could not create the user.", "warn");
    showToast("Unable to create user.", "warn");
  } finally {
    if (dom.userCreateBtn) dom.userCreateBtn.disabled = false;
  }
}

async function updateManagedUserRole(uid, role) {
  if (!requireRole("superadmin", "Superadmins can change roles.")) return;
  try {
    await setDoc(doc(db, "users", uid), { role, updatedAt: serverTimestamp() }, { merge: true });
    await appendSyncLog({ level: "INFO", eventType: "USER_ROLE_UPDATED", details: `${uid} => ${role}` });
    showToast(`Updated ${uid} to ${getRoleConfig(role).label}.`, "success");
    await loadUserDirectory();
  } catch (error) {
    console.error(error);
    showToast("Unable to update role.", "warn");
  }
}

async function toggleManagedUserStatus(uid, currentStatus) {
  if (!requireRole("superadmin", "Superadmins can disable or enable users.")) return;
  const isDisabled = String(currentStatus || "").toLowerCase() === "disabled";
  const row = currentUsers.find(item => String(item.uid || "") === uid);
  const role = normalizeRole(row?.role || "member") || "member";

  try {
    if (isDisabled) {
      await setDoc(doc(db, "users", uid), { status: "active", role, updatedAt: serverTimestamp() }, { merge: true });
      await appendSyncLog({ level: "INFO", eventType: "USER_ENABLED", details: uid });
      showToast(`Enabled ${uid}.`, "success");
    } else {
      await setDoc(doc(db, "users", uid), { status: "disabled", updatedAt: serverTimestamp() }, { merge: true });
      await appendSyncLog({ level: "WARN", eventType: "USER_DISABLED", details: uid });
      showToast(`Disabled ${uid}.`, "warn");
    }
    await loadUserDirectory();
  } catch (error) {
    console.error(error);
    showToast("Unable to change user status.", "warn");
  }
}

async function deleteManagedUser(uid) {
  if (!requireRole("superadmin", "Superadmins can delete users.")) return;
  const confirmed = window.confirm(`Delete ${uid}? This cannot be undone.`);
  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, "users", uid));
    await appendSyncLog({ level: "WARN", eventType: "USER_PROFILE_DELETED", details: uid });
    showToast(`Deleted ${uid}.`, "warn");
    await loadUserDirectory();
  } catch (error) {
    console.error(error);
    showToast("Unable to delete user.", "warn");
  }
}

function setPlaceHint() {
  dom.placeHint.textContent = PLACE_BADGES
    .map((badge, index) => `${badge} = +${PLACE_POINTS[index]}`)
    .join(" · ");
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

      if (actionButton.dataset.role === "custom-add") void applyCustomAmount(house.id, 1);
      if (actionButton.dataset.role === "custom-subtract") void applyCustomAmount(house.id, -1);
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

    row.innerHTML = `<span class="place-medal">${PLACE_BADGES[index]}</span><span class="place-pts">+${points} pts</span>`;
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
}

function updatePlacePreview() {
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
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add("show")));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 220);
  }, 3000);
}

function scoreNumber(source, houseId) {
  const value = Number(source?.[houseId]);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function formatClock(date = new Date()) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatSheetDate(date = new Date()) {
  return date.toLocaleDateString("en-US");
}

function setSyncStatus(message, tone = "neutral") {
  lastSyncStatus = { message, tone };
  const pending = pendingWriteCount();
  const suffix = pending > 0 ? ` - Pending: ${pending}` : "";
  dom.syncStatus.textContent = `${message}${suffix}`;
  dom.syncStatus.dataset.tone = tone;
}

function updateBusyState(delta) {
  pendingWrites = Math.max(0, pendingWrites + delta);
  document.body.classList.toggle("is-busy", pendingWrites > 0);
}

function readHistoryState(data = {}) {
  const raw = data.history || {};
  const commits = Array.isArray(raw.commits) ? raw.commits : [];
  const cursor = Number.isInteger(raw.cursor) ? raw.cursor : commits.length - 1;
  const nextId = Number.isInteger(raw.nextId) && raw.nextId > 0 ? raw.nextId : commits.length + 1;
  return { commits, cursor: Math.max(-1, Math.min(cursor, commits.length - 1)), nextId };
}

function writeHistoryState(updates, history) {
  updates.history = { commits: history.commits, cursor: history.cursor, nextId: history.nextId };
}

function appendHistoryCommit(history, scores, summary, authorEmail, extras = {}) {
  let commits = history.commits;
  if (history.cursor < commits.length - 1) commits = commits.slice(0, history.cursor + 1);

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
  if (commits.length > MAX_HISTORY_COMMITS) commits = commits.slice(commits.length - MAX_HISTORY_COMMITS);
  return { commits, cursor: commits.length - 1, nextId: history.nextId + 1, commit };
}

function updateRedoUndoButtons() {
  updateUndoRedoButtons();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderHistoryList(rows = currentPointRows) {
  if (!rows.length) {
    dom.historyList.innerHTML = '<li class="log-empty">No point history yet</li>';
    updateRedoUndoButtons();
    return;
  }

  const items = rows
    .slice(-HISTORY_LIST_LIMIT)
    .reverse()
    .map((row, index) => {
      const house = escapeHtml(row.House ?? row.house ?? "");
      const amount = parsePointAmount(row["Point Amount"] ?? row.pointAmount ?? row[1]);
      const reason = escapeHtml(row.Reason ?? row.reason ?? "");
      const date = escapeHtml(row.Date ?? row.date ?? "");
      const syncId = escapeHtml(row.SyncID ?? row.syncId ?? "");
      const modified = escapeHtml(row.LastModified ?? row.lastModified ?? "");
      const sign = amount > 0 ? "+" : "";

      return `
      <li class="history-item">
        <div>
          <div><strong>${house}</strong> ${sign}${amount} · ${reason}</div>
          <div class="history-meta">${date}${modified ? ` · ${modified}` : ""}${syncId ? ` · ${syncId}` : ""}</div>
        </div>
      </li>
    `;
    });

  dom.historyList.innerHTML = items.join("");
  updateRedoUndoButtons();
}

function applyOptimisticPointRow(row) {
  if (!row) return;
  currentPointRows = [...currentPointRows, row];
  if (!currentScores) {
    currentScores = aggregateScoresFromRows(currentPointRows);
  } else {
    const house = normalizeHouseFromSheet(row.House ?? row.house ?? row[0]);
    const amount = parsePointAmount(row["Point Amount"] ?? row.pointAmount ?? row[1]);
    if (house && Number.isFinite(amount)) {
      currentScores = {
        ...currentScores,
        [house]: scoreNumber(currentScores, house) + amount
      };
    }
  }
  updateScoreUi(currentScores);
  renderHistoryList(currentPointRows);
  cachePoints(currentPointRows, currentScores);
}

function addLogEntry(entry) {
  activityLog.unshift(entry);
  if (activityLog.length > MAX_LOG_ENTRIES) activityLog.pop();
  dom.activityList.innerHTML = activityLog
    .map(item => `<li class="log-entry"><span class="log-time">${item.time}</span><span>${item.desc}</span></li>`)
    .join("") || '<li class="log-empty">No activity yet this session</li>';
}

function findHouseName(id) {
  return houses.find(house => house.id === id)?.name || id;
}

function updateRanks(values) {
  const ranked = [...houses].sort((left, right) => scoreNumber(values, right.id) - scoreNumber(values, left.id));
  ranked.forEach((house, index) => {
    const rankElement = document.getElementById(`rank-${house.id}`);
    if (rankElement) rankElement.textContent = `#${index + 1}`;
  });
}

function updateScoreUi(values) {
  houses.forEach(house => {
    const pointsElement = document.getElementById(`pts-${house.id}`);
    if (pointsElement) pointsElement.textContent = String(values[house.id]);
  });
  updateRanks(values);
}

function validateReason() {
  const oneOffReason = (dom.pointReason?.value || "").trim();
  const detail = (dom.longTermDetail?.value || "").trim();
  const eventName = String(dom.longTermEventName?.value || "").trim();

  if (currentMode === "longTerm") {
    if (!eventName) {
      showToast("Event name is required for long-term mode.", "warn");
      dom.longTermEventName?.focus();
      return null;
    }
    currentEventName = eventName;
    if (!detail) return eventName.slice(0, 120);
    return `${eventName} - ${detail}`.slice(0, 120);
  }

  if (!oneOffReason) {
    showToast("Reason is required for all point changes.", "warn");
    dom.pointReason?.focus();
    return null;
  }
  return oneOffReason.slice(0, 120);
}

function makeSyncId() {
  return crypto.randomUUID();
}

function cachePoints(rows, totals) {
  if (!Array.isArray(rows) || !totals) return;
  writeJsonStorage(STORAGE_KEYS.pointsCache, { rows, totals, cachedAt: Date.now() });
}

function cacheLog(rows) {
  if (!Array.isArray(rows)) return;
  const limited = rows.slice(-300);
  writeJsonStorage(STORAGE_KEYS.logCache, { rows: limited, cachedAt: Date.now() });
}

function getCachedPoints() {
  const cached = readJsonStorage(STORAGE_KEYS.pointsCache, null);
  if (!cached?.rows || !cached?.totals) return null;
  return cached;
}

function getCachedLog() {
  const cached = readJsonStorage(STORAGE_KEYS.logCache, null);
  if (!cached?.rows) return null;
  return cached;
}

function enqueuePendingWrite(action, payload, errorMessage) {
  const list = prunePendingWrites(getPendingWrites());
  const entry = {
    id: crypto.randomUUID(),
    action,
    payload,
    createdAt: Date.now(),
    attempts: 0,
    nextRetryAt: Date.now(),
    lastError: errorMessage || ""
  };
  list.push(entry);

  if (list.length > QUEUE_CONFIG.maxItems) {
    list.splice(0, list.length - QUEUE_CONFIG.maxItems);
    void emitSystemAlert({
      title: "Pending queue trimmed",
      body: "Old pending writes were dropped to keep the queue size safe.",
      severity: "warn",
      source: "queue",
      dedupeKey: "queue_trimmed"
    });
  }

  savePendingWrites(list);
  setSyncStatus("Offline - write queued", "warn");
  return entry;
}

async function flushQueuedWrites(force = false) {
  if (isOffline()) return;

  const list = prunePendingWrites(getPendingWrites());
  if (!list.length) return;

  const now = Date.now();
  const remaining = [];

  for (const entry of list) {
    if (!force && entry.nextRetryAt > now) {
      remaining.push(entry);
      continue;
    }
    try {
      await callSheetApi(entry.payload);
    } catch (error) {
      const attempts = Number(entry.attempts || 0) + 1;
      if (attempts >= QUEUE_CONFIG.maxAttempts) {
        void emitSystemAlert({
          title: "Pending write failed",
          body: `Dropped queued write after ${attempts} attempts.`,
          severity: "error",
          source: "queue",
          dedupeKey: "queue_drop"
        });
        continue;
      }
      remaining.push({
        ...entry,
        attempts,
        lastError: String(error?.message || error),
        nextRetryAt: now + backoffDelay(attempts)
      });
    }
  }

  savePendingWrites(remaining);
  if (!remaining.length) {
    setSyncStatus(`Live - Flushed ${list.length} queued writes`, "live");
    try {
      await refreshFromSheets();
    } catch (error) {
      console.error(error);
    }
  } else {
    setSyncStatus("Queued writes pending", "warn");
  }
}

function scheduleQueueFlush() {
  if (queueFlushHandle) clearInterval(queueFlushHandle);
  queueFlushHandle = setInterval(() => {
    void flushQueuedWrites().catch(error => console.error(error));
  }, 15000);
}

async function callSheetApiOnce(payload, timeoutMs = SHEETS_SYNC.timeoutMs) {
  if (!SHEETS_SYNC.endpointUrl || !SHEETS_SYNC.secureApiKey) {
    throw new Error("Google Sheets sync is not configured. Set endpointUrl + secureApiKey in control.js");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(SHEETS_SYNC.endpointUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ apiKey: SHEETS_SYNC.secureApiKey, ...payload }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Sheets API failed (${response.status})`);
    const json = await response.json();
    if (json?.ok === false) throw new Error(json?.error || "Sheets API returned an error");
    return json;
  } finally {
    clearTimeout(timeout);
  }
}

async function callSheetApi(payload, timeoutMs = SHEETS_SYNC.timeoutMs) {
  return retryWithBackoff(() => callSheetApiOnce(payload, timeoutMs));
}

async function sendSheetWrite(payload, actionLabel) {
  try {
    await callSheetApi(payload);
    return { ok: true, queued: false };
  } catch (error) {
    if (isRetryableError(error)) {
      enqueuePendingWrite(actionLabel, payload, String(error?.message || error));
      return { ok: false, queued: true };
    }
    throw error;
  }
}

function normalizeHouseFromSheet(rawHouse) {
  const cleaned = String(rawHouse || "").trim().toLowerCase();
  return SHEET_TO_HOUSE[cleaned] || null;
}

function parsePointAmount(raw) {
  const amount = Number(raw);
  return Number.isFinite(amount) ? amount : 0;
}

function aggregateScoresFromRows(rows) {
  const totals = { red: 0, white: 0, blue: 0, silver: 0 };
  for (const row of rows) {
    const house = normalizeHouseFromSheet(row.House ?? row.house ?? row[0]);
    const amount = parsePointAmount(row["Point Amount"] ?? row.pointAmount ?? row[1]);
    if (house && Number.isFinite(amount)) totals[house] += amount;
  }
  return totals;
}

async function fetchSheetPoints() {
  try {
    const result = await callSheetApi({
      action: "getPoints",
      spreadsheetId: SHEETS_SYNC.spreadsheetId,
      tab: SHEETS_SYNC.pointsTab
    });
    const rows = Array.isArray(result?.rows) ? result.rows : [];
    const totals = aggregateScoresFromRows(rows);
    cachePoints(rows, totals);
    return { rows, totals, fromCache: false };
  } catch (error) {
    const cached = getCachedPoints();
    if (cached) {
      setSyncStatus("Offline - using cached scores", "warn");
      return { rows: cached.rows, totals: cached.totals, fromCache: true };
    }
    throw error;
  }
}

async function appendPointRow({ houseId, delta, reason, source }) {
  const now = new Date();
  const row = {
    House: HOUSE_TO_SHEET[houseId] || houseId,
    "Point Amount": Number(delta),
    Reason: reason,
    Date: formatSheetDate(now),
    SyncID: makeSyncId(),
    LastModified: now.toISOString(),
    User: currentUserEmail || "app"
  };

  const payload = {
    action: "appendPoint",
    spreadsheetId: SHEETS_SYNC.spreadsheetId,
    tab: SHEETS_SYNC.pointsTab,
    row
  };

  const result = await sendSheetWrite(payload, "appendPoint");
  if (result.queued) {
    void emitSystemAlert({
      title: "Points write queued",
      body: "A points change was queued and will sync when online.",
      severity: "warn",
      source: "sheets",
      dedupeKey: "points_write_queued"
    });
  }

  await appendSyncLog({
    level: "INFO",
    eventType: "POINT_APPEND",
    details: `${source}: ${row.House} ${delta > 0 ? "+" : ""}${delta} (${reason})`
  });

  await appendEventLog({
    house: houseId,
    delta,
    reason,
    source,
    queued: result.queued
  });

  return { row, queued: result.queued };
}

async function appendSyncLog({ level, eventType, details }) {
  try {
    await sendSheetWrite({
      action: "appendLog",
      spreadsheetId: SHEETS_SYNC.spreadsheetId,
      tab: SHEETS_SYNC.logTab,
      row: {
        Timestamp: new Date().toISOString(),
        Level: level,
        EventType: eventType,
        User: currentUserEmail || "system",
        Details: details
      }
    }, "appendLog");
  } catch (error) {
    console.warn("Sync log append failed", error);
  }
}

async function backupToFirebase({ scores, summary, actionMeta }) {
  if (!firebaseReady) return;

  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(scoresDoc);
    const data = snapshot.exists() ? snapshot.data() : {};
    const history = readHistoryState(data);
    const nextHistory = appendHistoryCommit(history, scores, summary, currentUserEmail);

    const updates = {
      red: scoreNumber(scores, "red"),
      white: scoreNumber(scores, "white"),
      blue: scoreNumber(scores, "blue"),
      silver: scoreNumber(scores, "silver"),
      history: {
        commits: nextHistory.commits,
        cursor: nextHistory.cursor,
        nextId: nextHistory.nextId
      },
      lastAction: {
        ...actionMeta,
        summary,
        authorEmail: currentUserEmail,
        timestamp: serverTimestamp()
      },
      backupLastSyncedAt: serverTimestamp()
    };

    if (snapshot.exists()) transaction.update(scoresDoc, updates);
    else transaction.set(scoresDoc, updates, { merge: true });
  });
}

async function syncLeaderboardScores(scores) {
  if (!scores) return;

  try {
    await set(leaderboardScoresRef, {
      red: scoreNumber(scores, "red"),
      white: scoreNumber(scores, "white"),
      blue: scoreNumber(scores, "blue"),
      silver: scoreNumber(scores, "silver"),
      updatedAt: Date.now(),
      updatedBy: currentUserEmail || "system"
    });
  } catch (error) {
    console.warn("Realtime leaderboard sync failed", error);
  }
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
  shouldWarnBeforeLeave = !String(currentCommit.summary || "").startsWith("Checkpoint:");
}

async function withWrite(task) {
  updateBusyState(1);
  try {
    const result = await task();
    if (result?.queued) {
      setSyncStatus("Offline - write queued", "warn");
    } else {
      setSyncStatus(`Live - Last saved ${formatClock()}`, "live");
    }
    return { ok: true, value: result };
  } catch (error) {
    console.error(error);
    await appendSyncLog({ level: "ERROR", eventType: "WRITE_FAILED", details: String(error?.message || error) });
    setSyncStatus("Save failed. Retry action.", "warn");
    showToast("Unable to save changes right now.", "warn");
    return { ok: false, value: null };
  } finally {
    updateBusyState(-1);
  }
}

async function refreshFromSheets() {
  const { rows, totals, fromCache } = await fetchSheetPoints();
  currentPointRows = rows;
  currentScores = totals;
  updateScoreUi(currentScores);
  renderHistoryList(currentPointRows);
  let logRows = [];
  try {
    logRows = await fetchSheetLog();
  } catch (error) {
    console.error(error);
    setSyncStatus("Log tab unavailable.", "warn");
    void emitSystemAlert({
      title: "Log tab unavailable",
      body: "The Log tab could not be loaded. Cached data may be shown.",
      severity: "warn",
      source: "sheets",
      dedupeKey: "log_tab_unavailable"
    });
    logRows = getCachedLog()?.rows || [];
  }
  renderSheetLog(logRows);
  if (fromCache) {
    setSyncStatus(`Offline - Cached ${formatClock()}`, "warn");
  } else {
    setSyncStatus(`Live - Updated ${formatClock()}`, "live");
  }

  return fromCache;
}

function requireRole(minimumRole, message) {
  if (hasRoleAtLeast(currentUserRole, minimumRole)) return true;
  showToast(message || "This action is not available for your role.", "warn");
  return false;
}

async function applyDelta(house, delta) {
  if (!Number.isFinite(delta) || delta === 0) return;
  if (!requireRole("member", "Members and above can change points.")) return;
  const reason = validateReason();
  if (!reason) return;

  const write = await withWrite(async () => {
    const result = await appendPointRow({ houseId: house, delta, reason, source: "delta" });
    applyOptimisticPointRow(result.row);
    if (result.queued) return { queued: true };
    await syncLeaderboardScores(currentScores);
    await refreshFromSheets();
    await backupToFirebase({
      scores: currentScores,
      summary: `${findHouseName(house)} ${delta > 0 ? "+" : ""}${delta} (${reason})`,
      actionMeta: { type: "delta", house, delta, reason }
    });
    return { queued: false };
  });

  if (!write.ok) return;
  if (write.value?.queued) {
    showToast("Write queued and will sync when online.", "warn");
  }
  addLogEntry({ time: formatClock(), desc: `${findHouseName(house)} ${delta > 0 ? "+" : ""}${delta} (${reason})` });
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
  if (!requireRole("member", "Members and above can award place points.")) return;
  const reason = validateReason();
  if (!reason) return;

  const placements = PLACE_POINTS.map((points, index) => ({
    points,
    badge: PLACE_BADGES[index],
    house: document.getElementById(`place-${index + 1}`)?.value || ""
  })).filter(entry => entry.house);

  if (placements.length === 0) {
    showToast("Select at least one place award.", "warn");
    return;
  }

  const write = await withWrite(async () => {
    let queued = false;
    for (const entry of placements) {
      const result = await appendPointRow({
        houseId: entry.house,
        delta: entry.points,
        reason: `${reason} (${entry.badge})`,
        source: "place_award"
      });
      if (result.queued) queued = true;
      applyOptimisticPointRow(result.row);
    }
    if (!queued) {
      await syncLeaderboardScores(currentScores);
      await refreshFromSheets();
      await backupToFirebase({
        scores: currentScores,
        summary: `Place awards (${reason})`,
        actionMeta: {
          type: "place_awards",
          reason,
          changes: placements.map(entry => ({ house: entry.house, delta: entry.points, place: entry.badge }))
        }
      });
    }
    await appendSyncLog({ level: "INFO", eventType: "PLACE_AWARDS", details: `${currentUserRole}: ${reason}` });
    return { queued };
  });

  if (!write.ok) return;
  if (write.value?.queued) {
    showToast("Some writes were queued and will sync when online.", "warn");
  }
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
}

function clearPlaceSelections() {
  getPlaceSelects().forEach(select => { select.value = ""; });
  updatePlacePreview();
}

async function restoreHistoryIndex(index, reasonOverride = "", minimumRole = "admin") {
  if (!Number.isInteger(index) || index < 0 || index >= currentHistory.commits.length) return;
  if (!requireRole(minimumRole, minimumRole === "admin" ? "Admins and above can restore history." : "Members and above can undo their latest action.")) return;
  const target = currentHistory.commits[index];
  const reason = reasonOverride || validateReason();
  if (!reason) return;

  const write = await withWrite(async () => {
    let queued = false;
    const deltas = houses.map(house => ({
      house: house.id,
      delta: scoreNumber(target.scores, house.id) - scoreNumber(currentScores, house.id)
    })).filter(item => item.delta !== 0);

    for (const item of deltas) {
      const result = await appendPointRow({
        houseId: item.house,
        delta: item.delta,
        reason: `${reason} (restore #${target.id})`,
        source: "restore"
      });
      if (result.queued) queued = true;
      applyOptimisticPointRow(result.row);
    }

    if (!queued) {
      await syncLeaderboardScores(currentScores);
      await refreshFromSheets();
      await backupToFirebase({
        scores: currentScores,
        summary: `Restore #${target.id} (${reason})`,
        actionMeta: { type: "restore", commitId: target.id, reason }
      });
    }
    await appendSyncLog({ level: "WARN", eventType: "UNDO_RESTORE", details: `#${target.id} by ${currentUserEmail}` });
    return { queued };
  });

  if (!write.ok) return;
  if (write.value?.queued) {
    showToast("Restore queued and will sync when online.", "warn");
  }
  showToast(`Restored using compensating rows for #${target.id}.`, "info");
}

async function resetScores() {
  if (!requireRole("admin", "Admins and above can reset scores.")) return;
  const reason = validateReason();
  if (!reason) return;
  const confirmed = window.confirm("Reset all house scores to zero?");
  if (!confirmed) return;

  const write = await withWrite(async () => {
    let queued = false;
    for (const house of houses) {
      const current = scoreNumber(currentScores, house.id);
      if (current !== 0) {
        const result = await appendPointRow({
          houseId: house.id,
          delta: -current,
          reason: `${reason} (reset)`,
          source: "reset"
        });
        if (result.queued) queued = true;
        applyOptimisticPointRow(result.row);
      }
    }
    if (!queued) {
      await syncLeaderboardScores(currentScores);
      await refreshFromSheets();
      await backupToFirebase({
        scores: currentScores,
        summary: `Reset all scores (${reason})`,
        actionMeta: { type: "reset", reason }
      });
    }
    return { queued };
  });

  if (!write.ok) return;
  if (write.value?.queued) {
    showToast("Reset queued and will sync when online.", "warn");
  }
  showToast("All scores reset to zero.", "warn");
}

async function createNamedCheckpoint() {
  if (!requireRole("admin", "Admins and above can create checkpoints.")) return;
  const raw = dom.checkpointName.value.trim();
  if (!raw) {
    showToast("Enter a checkpoint name first.", "warn");
    return;
  }

  const summary = `Checkpoint: ${raw.slice(0, 60)}`;
  const write = await withWrite(async () => {
    await backupToFirebase({
      scores: currentScores || { red: 0, white: 0, blue: 0, silver: 0 },
      summary,
      actionMeta: { type: "checkpoint" }
    });
    await appendSyncLog({ level: "INFO", eventType: "CHECKPOINT", details: summary });
  });

  if (!write.ok) return;
  dom.checkpointName.value = "";
  updateLeaveWarningState();
  showToast("Checkpoint created.", "success");
}

function findUndoTargetIndex() {
  const { commits } = currentHistory;
  if (!commits.length) return -1;
  if (hasRoleAtLeast(currentUserRole, "admin")) return commits.length - 1;

  for (let index = commits.length - 1; index >= 0; index -= 1) {
    const commit = commits[index];
    if (String(commit.authorEmail || "").toLowerCase() === String(currentUserEmail || "").toLowerCase()) {
      return index;
    }
  }

  return -1;
}

async function undoLastAction() {
  if (!requireRole("member", "Members and above can undo their latest action.")) return;
  const targetIndex = findUndoTargetIndex();
  if (targetIndex < 0) {
    showToast("No undo target found for this account.", "warn");
    return;
  }

  const undoReason = validateReason();
  if (!undoReason) return;

  await restoreHistoryIndex(targetIndex, `${undoReason} (undo)`, "member");
}

async function approveSuggestion(suggestion) {
  if (!requireRole("admin", "Admins and superadmins can approve suggestions.")) return;
  if (!suggestion?.id) return;

  const house = String(suggestion.house || suggestion.houseId || "").trim();
  const delta = Number(suggestion.delta || 0);
  const reason = String(suggestion.reason || "Suggestion approval").trim();

  if (!house || !Number.isFinite(delta) || delta === 0) {
    showToast("Suggestion is missing a house or point amount.", "warn");
    return;
  }

  const write = await withWrite(async () => {
    const result = await appendPointRow({ houseId: house, delta, reason, source: "suggestion_approval" });
    applyOptimisticPointRow(result.row);
    await setDoc(doc(db, "suggestions", suggestion.id), {
      status: "approved",
      reviewedBy: currentUserEmail,
      reviewedByRole: currentUserRole,
      reviewedAt: serverTimestamp()
    }, { merge: true });
    if (!result.queued) {
      await syncLeaderboardScores(currentScores);
      await refreshFromSheets();
      await backupToFirebase({
        scores: currentScores,
        summary: `Approved suggestion for ${findHouseName(house)} (${reason})`,
        actionMeta: { type: "suggestion_approve", suggestionId: suggestion.id, house, delta, reason }
      });
    }
    await appendSyncLog({
      level: "INFO",
      eventType: "SUGGESTION_APPROVED",
      details: `${suggestion.authorEmail || "unknown"}: ${findHouseName(house)} ${delta > 0 ? "+" : ""}${delta}`
    });
    return { queued: result.queued };
  });

  if (!write.ok) return;
  if (write.value?.queued) {
    showToast("Approval queued and will sync when online.", "warn");
  }
  showToast("Suggestion approved.", "success");
}

async function rejectSuggestion(suggestion) {
  if (!requireRole("admin", "Admins and superadmins can reject suggestions.")) return;
  if (!suggestion?.id) return;

  try {
    await setDoc(doc(db, "suggestions", suggestion.id), {
      status: "rejected",
      reviewedBy: currentUserEmail,
      reviewedByRole: currentUserRole,
      reviewedAt: serverTimestamp()
    }, { merge: true });
    await appendSyncLog({
      level: "WARN",
      eventType: "SUGGESTION_REJECTED",
      details: `${suggestion.authorEmail || "unknown"}: ${suggestion.reason || "No reason"}`
    });
    showToast("Suggestion rejected.", "warn");
  } catch (error) {
    console.error(error);
    showToast("Unable to reject suggestion.", "warn");
  }
}

async function submitSuggestion() {
  if (!currentUserEmail) return;

  const house = dom.suggestionHouse?.value || "";
  const delta = Number.parseInt(dom.suggestionDelta?.value || "", 10);
  const reason = (dom.suggestionReason?.value || "").trim();

  if (!house) {
    setSuggestionStatus("Choose a house.", "warn");
    return;
  }

  if (!Number.isFinite(delta) || delta === 0) {
    setSuggestionStatus("Enter a non-zero point amount.", "warn");
    return;
  }

  if (!reason) {
    setSuggestionStatus("Add a reason for the suggestion.", "warn");
    return;
  }

  if (!requireRole("helper", "Helpers and above can submit suggestions.")) return;

  if (dom.suggestionBtn) dom.suggestionBtn.disabled = true;
  setSuggestionStatus("Submitting suggestion...", "neutral");

  try {
    await addDoc(suggestionsCollection, {
      house,
      delta,
      reason: reason.slice(0, 120),
      authorEmail: currentUserEmail,
      authorRole: currentUserRole,
      authorUid: auth.currentUser?.uid || "",
      status: "pending",
      createdAt: serverTimestamp()
    });
    await appendSyncLog({
      level: "INFO",
      eventType: "SUGGESTION_SUBMITTED",
      details: `${currentUserEmail}: ${findHouseName(house)} ${delta > 0 ? "+" : ""}${delta}`
    });

    setSuggestionStatus("Suggestion submitted for review.", "live");
    showToast("Suggestion submitted.", "success");
    if (dom.suggestionDelta) dom.suggestionDelta.value = "";
    if (dom.suggestionReason) dom.suggestionReason.value = "";
  } catch (error) {
    console.error(error);
    setSuggestionStatus("Could not submit the suggestion.", "warn");
    showToast("Unable to submit suggestion right now.", "warn");
  } finally {
    if (dom.suggestionBtn) dom.suggestionBtn.disabled = false;
  }
}

function scheduleNextPoll(delayMs) {
  if (sheetPollHandle) clearTimeout(sheetPollHandle);
  sheetPollHandle = setTimeout(async () => {
    try {
      await refreshFromSheets();
      pollFailureCount = 0;
      scheduleNextPoll(SHEETS_SYNC.pollIntervalMs);
    } catch (error) {
      console.error(error);
      pollFailureCount += 1;
      const backoff = Math.min(SHEETS_SYNC.pollIntervalMs * Math.pow(2, pollFailureCount), 60000);
      setSyncStatus("Disconnected from Google Sheets sync.", "warn");
      void emitSystemAlert({
        title: "Sheets sync delayed",
        body: "Live sync failed and will retry with backoff.",
        severity: "warn",
        source: "sheets",
        dedupeKey: "sheets_sync_backoff"
      });
      scheduleNextPoll(backoff);
    }
  }, delayMs);
}

function startSheetPolling() {
  scheduleNextPoll(SHEETS_SYNC.pollIntervalMs);
}

onSnapshot(
  scoresDoc,
  snapshot => {
    firebaseReady = true;
    if (!snapshot.exists()) return;
    const data = snapshot.data();
    currentHistory = readHistoryState(data);
    updateLeaveWarningState();
    updateUndoRedoButtons();
  },
  error => {
    console.error(error);
    setSyncStatus("Firebase backup unavailable.", "warn");
  }
);

onSnapshot(
  eventDoc,
  snapshot => {
    const data = snapshot.exists() ? snapshot.data() : {};
    applyEventState({
      active: Boolean(data?.active),
      name: String(data?.name || "").trim(),
      startedBy: data?.startedBy || ""
    });
  },
  error => {
    console.error(error);
  }
);

if (dom.menuBtn) {
  dom.menuBtn.addEventListener("click", toggleDrawer);
}
if (dom.toolsMenuBtn) {
  dom.toolsMenuBtn.addEventListener("click", toggleToolsDrawer);
}

dom.modeSwitch?.addEventListener("click", event => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest(".mode-pill");
  if (!button) return;
  const mode = button.getAttribute("data-mode") || "oneOff";
  applyModeSelection(mode);
});

dom.changeModeBtn?.addEventListener("click", () => {
  dom.modeSwitchPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
  closeDrawer();
});
dom.retryQueueBtn?.addEventListener("click", () => {
  void flushQueuedWrites(true);
});
dom.systemAlertsToggle?.addEventListener("change", () => {
  showSystemAlerts = Boolean(dom.systemAlertsToggle?.checked);
  writeStoredBoolean(STORAGE_KEYS.showSystemAlerts, showSystemAlerts);
  renderNotificationList(currentNotifications);
});
dom.startEventBtn?.addEventListener("click", () => { void startEvent(); });
dom.stopEventBtn?.addEventListener("click", () => { void stopEvent(); });
dom.eventBannerStop?.addEventListener("click", () => { void stopEvent(); });

if (dom.closeDrawerBtn) dom.closeDrawerBtn.addEventListener("click", closeDrawer);
if (dom.drawerOverlay) dom.drawerOverlay.addEventListener("click", closeDrawer);
if (dom.closeToolsDrawerBtn) dom.closeToolsDrawerBtn.addEventListener("click", closeToolsDrawer);
if (dom.toolsDrawerOverlay) dom.toolsDrawerOverlay.addEventListener("click", closeToolsDrawer);
if (dom.jumpNotificationsBtn) dom.jumpNotificationsBtn.addEventListener("click", () => {
  closeDrawer();
  dom.notificationForm?.scrollIntoView({ behavior: "smooth", block: "start" });
});
if (dom.jumpUsersBtn) dom.jumpUsersBtn.addEventListener("click", () => {
  closeDrawer();
  dom.userAdminPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
});
if (dom.jumpHistoryBtn) dom.jumpHistoryBtn.addEventListener("click", () => {
  closeDrawer();
  openToolsDrawer();
  dom.historyList?.scrollIntoView({ behavior: "smooth", block: "start" });
});
if (dom.jumpStudentsBtn) dom.jumpStudentsBtn.addEventListener("click", () => {
  closeToolsDrawer();
  dom.studentSearchInput?.scrollIntoView({ behavior: "smooth", block: "start" });
});
if (dom.jumpEventLogBtn) dom.jumpEventLogBtn.addEventListener("click", () => {
  closeToolsDrawer();
  dom.eventLogList?.scrollIntoView({ behavior: "smooth", block: "start" });
});
if (dom.jumpHistoryLogBtn) dom.jumpHistoryLogBtn.addEventListener("click", () => {
  closeToolsDrawer();
  dom.historyList?.scrollIntoView({ behavior: "smooth", block: "start" });
});
if (dom.jumpSheetLogBtn) dom.jumpSheetLogBtn.addEventListener("click", () => {
  closeToolsDrawer();
  dom.sheetLogList?.scrollIntoView({ behavior: "smooth", block: "start" });
});

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

dom.signOutBtn.addEventListener("click", () => { void signOut(auth); });
dom.autoFillBtn.addEventListener("click", autoFillPlacesByScore);
dom.clearPlacesBtn.addEventListener("click", clearPlaceSelections);
dom.applyPlacesBtn.addEventListener("click", () => { void applyPlaceAwards(); });
dom.undoBtn.addEventListener("click", () => { void undoLastAction(); });
dom.redoBtn.addEventListener("click", () => showToast("Redo is disabled in Sheets-primary mode.", "warn"));
dom.resetBtn.addEventListener("click", () => { void resetScores(); });
dom.checkpointBtn.addEventListener("click", () => { void createNamedCheckpoint(); });
dom.suggestionBtn?.addEventListener("click", () => { void submitSuggestion(); });
dom.notificationForm?.addEventListener("submit", event => {
  event.preventDefault();
  void postNotification();
});
if (dom.notificationReviewRole) {
  dom.notificationReviewRole.addEventListener("change", () => renderNotificationList(currentNotifications));
}
dom.userCreateForm?.addEventListener("submit", event => {
  event.preventDefault();
  void createManagedUser();
});

dom.notificationList?.addEventListener("click", event => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest("button[data-notification-action]");
  if (!button) return;
  if (button.dataset.notificationAction === "delete") void deleteNotification(button.dataset.notificationId || "");
});

dom.suggestionQueueList?.addEventListener("click", event => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const button = target.closest("button[data-suggestion-action]");
  if (!button) return;

  const suggestion = currentSuggestions.find(item => item.id === button.dataset.suggestionId);
  if (!suggestion) return;

  if (button.dataset.suggestionAction === "approve") void approveSuggestion(suggestion);
  if (button.dataset.suggestionAction === "reject") void rejectSuggestion(suggestion);
});

dom.userList?.addEventListener("click", event => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const button = target.closest("button[data-user-action]");
  if (!button) return;

  const uid = button.dataset.userUid || "";
  const action = button.dataset.userAction || "";
  const row = button.closest("li.user-item");
  const currentStatus = button.dataset.userStatus || row?.querySelector(".user-status")?.textContent || "active";
  const selectedRole = row?.querySelector("[data-user-role]")?.value || "member";

  if (action === "save-role") void updateManagedUserRole(uid, selectedRole);
  if (action === "toggle-status") void toggleManagedUserStatus(uid, currentStatus);
  if (action === "delete-user") void deleteManagedUser(uid);
});

if (dom.suggestionReason) {
  dom.suggestionReason.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      void submitSuggestion();
    }
  });
}

if (dom.studentSearchInput) {
  dom.studentSearchInput.addEventListener("input", event => {
    const value = event.target instanceof HTMLInputElement ? event.target.value : "";
    filterStudents(value);
  });
}
dom.studentRefreshBtn?.addEventListener("click", () => { void loadStudents(); });

dom.checkpointName.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    void createNamedCheckpoint();
  }
});

dom.checkpointName.addEventListener("input", updateLeaveWarningState);
dom.historyList.addEventListener("click", event => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest("button[data-history-index]");
  if (!button) return;
  const index = Number.parseInt(button.dataset.historyIndex || "", 10);
  void restoreHistoryIndex(index);
});

onAuthStateChanged(auth, async user => {
  if (!user) {
    dom.loginBox.style.display = "grid";
    dom.mainPanel.style.display = "none";
    dom.passwordInput.value = "";
    closeToolsDrawer();
    if (sheetPollHandle) clearTimeout(sheetPollHandle);
    if (queueFlushHandle) clearInterval(queueFlushHandle);
    if (usersUnsubscribe) {
      usersUnsubscribe();
      usersUnsubscribe = null;
    }
    if (notificationsUnsubscribe) {
      notificationsUnsubscribe();
      notificationsUnsubscribe = null;
    }
    if (suggestionsUnsubscribe) {
      suggestionsUnsubscribe();
      suggestionsUnsubscribe = null;
    }
    clearEventLogs();
    return;
  }

  const resolvedRole = await resolveCurrentUserRole(user);
  if (!resolvedRole) {
    await signOut(auth);
    setAuthError("This account does not have an assigned role.");
    return;
  }

  setAuthError("");
  dom.loginBox.style.display = "none";
  dom.mainPanel.style.display = "none";
  currentUserEmail = user.email || "";
  applyRoleUi(resolvedRole);
  updateSystemAlertsToggle();
  ensureModeSwitch();
  dom.mainPanel.style.display = "block";
  scheduleQueueFlush();
  void flushQueuedWrites();

  try {
    const fromCache = await refreshFromSheets();
    if (!fromCache) {
      await syncLeaderboardScores(currentScores);
    }
    startSheetPolling();
    await appendSyncLog({ level: "INFO", eventType: "SESSION_START", details: "Control panel signed in" });
    await loadStudents();
    await loadNotifications();
    await loadSuggestions();
    await loadUserDirectory();
  } catch (error) {
    console.error(error);
    setSyncStatus("Google Sheets sync not configured.", "warn");
  }

  updateLeaveWarningState();
});

window.addEventListener("beforeunload", event => {
  if (!shouldWarnBeforeLeave || dom.mainPanel.style.display !== "block") return;
  event.preventDefault();
  event.returnValue = "";
});

window.addEventListener("online", () => {
  setSyncStatus("Online - syncing queued writes", "live");
  void flushQueuedWrites(true);
});

window.addEventListener("offline", () => {
  setSyncStatus("Offline - writes will queue", "warn");
});
