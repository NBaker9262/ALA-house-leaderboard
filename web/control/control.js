import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  addDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  limit,
  writeBatch,
  runTransaction,
  onSnapshot,
  serverTimestamp,
  increment,
  orderBy
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
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

const MODE_PARAM = new URLSearchParams(window.location.search).get("mode");
const TEST_MODE = MODE_PARAM === "test";
const HOSTNAME = String(window.location.hostname || "").toLowerCase();
const IS_CODESPACES_TUNNEL = HOSTNAME.endsWith(".app.github.dev") || HOSTNAME.endsWith(".github.dev");
const ENABLE_PWA = !TEST_MODE && !IS_CODESPACES_TUNNEL;
const TEST_STORAGE_KEY = "ala.house.leaderboard.local.test.v2";

if (ENABLE_PWA) {
  if (!document.querySelector('link[rel="manifest"]')) {
    const manifestLink = document.createElement("link");
    manifestLink.rel = "manifest";
    manifestLink.href = "manifest.json";
    document.head.appendChild(manifestLink);
  }
} else {
  document.querySelector('link[rel="manifest"]')?.remove();
  if ("serviceWorker" in navigator) {
    void navigator.serviceWorker.getRegistrations()
      .then(registrations => Promise.all(registrations.map(registration => registration.unregister())))
      .catch(() => undefined);
  }
}

const houses = [
  { id: "red", name: "Red Panda House", bg: "#ea0125", text: "#ffffff" },
  { id: "white", name: "Polar House", bg: "#fffeff", text: "#141414" },
  { id: "blue", name: "Grizzly House", bg: "#005ab5", text: "#ffffff" },
  { id: "silver", name: "Kodiak House", bg: "#a7a7aa", text: "#111111" }
];

const QUICK_DELTAS = [50, 30, 15, 10];
const PLACE_POINTS = [50, 30, 15, 10];
const PLACE_BADGES = ["1st", "2nd", "3rd", "4th"];
const MAX_ACTIVITY_ENTRIES = 300;
const MAX_ACTIVITY_PREVIEW = 14;
const MAX_BACKUP_LIST = 40;
const MAX_CONTACT_MESSAGES = 40;
const REASON_TEMPLATE_BANK = [
  "attendance",
  "participation",
  "sportsmanship",
  "game win",
  "second place",
  "third place",
  "fourth place",
  "spirit challenge",
  "scavenger hunt",
  "dress code",
  "announcement bonus"
];

const QUICK_EVENT_TAGS = [
  "announcements",
  "assembly",
  "basketball",
  "volleyball",
  "spirit week",
  "prom",
  "attendance",
  "scavenger hunt"
];

const DEFAULT_EVENT_CATALOG = {
  categories: [
    {
      id: "sports",
      name: "Sports",
      events: [
        { id: "basketball", name: "Basketball", subevents: [{ id: "girls_varsity", name: "Girls Varsity" }, { id: "boys_varsity", name: "Boys Varsity" }] },
        { id: "volleyball", name: "Volleyball", subevents: [{ id: "girls_varsity", name: "Girls Varsity" }] }
      ]
    },
    {
      id: "assemblies",
      name: "Assemblies",
      events: [
        { id: "school_assembly", name: "School Assembly", subevents: [{ id: "general", name: "General" }] }
      ]
    },
    {
      id: "announcements",
      name: "Announcements",
      events: [
        { id: "daily_announcements", name: "Daily Announcements", subevents: [{ id: "participation", name: "Participation" }] }
      ]
    }
  ]
};

const ROLE_DEFAULTS = {
  superadmin: {
    scoreEdit: true,
    proposePoints: true,
    placeAwards: true,
    studentLookup: true,
    historyAccess: true,
    restoreHistory: true,
    checkpoint: true,
    downloadBackup: true,
    resetAll: true,
    passwordReset: true,
    manageUsers: true,
    approveProposals: true,
    manageCatalog: true
  },
  admin: {
    scoreEdit: true,
    proposePoints: true,
    placeAwards: true,
    studentLookup: true,
    historyAccess: true,
    restoreHistory: true,
    checkpoint: true,
    downloadBackup: true,
    resetAll: false,
    passwordReset: true,
    manageUsers: false,
    approveProposals: true,
    manageCatalog: false
  },
  staff: {
    scoreEdit: true,
    proposePoints: false,
    placeAwards: true,
    studentLookup: true,
    historyAccess: true,
    restoreHistory: false,
    checkpoint: true,
    downloadBackup: false,
    resetAll: false,
    passwordReset: true,
    manageUsers: false,
    approveProposals: false,
    manageCatalog: false
  },
  helper: {
    scoreEdit: true,
    proposePoints: false,
    placeAwards: false,
    studentLookup: false,
    historyAccess: false,
    restoreHistory: false,
    checkpoint: false,
    downloadBackup: false,
    resetAll: false,
    passwordReset: false,
    manageUsers: false,
    approveProposals: false,
    manageCatalog: false
  }
};

const PERMISSION_DEFINITIONS = [
  { key: "scoreEdit", label: "Direct Scoring" },
  { key: "proposePoints", label: "Suggest Scoring" },
  { key: "placeAwards", label: "Place Awards" },
  { key: "studentLookup", label: "Student Lookup" },
  { key: "approveProposals", label: "Approve Suggestions" },
  { key: "historyAccess", label: "Activity Access" },
  { key: "restoreHistory", label: "Restore Savepoints" },
  { key: "checkpoint", label: "Create Savepoints" },
  { key: "downloadBackup", label: "Download Backup" },
  { key: "resetAll", label: "Reset Scores" },
  { key: "passwordReset", label: "Password Reset" },
  { key: "manageUsers", label: "Manage Users" },
  { key: "manageCatalog", label: "Manage Event Catalog" }
];

const dom = {
  loginBox: document.getElementById("loginBox"),
  loginForm: document.getElementById("loginForm"),
  emailInput: document.getElementById("email"),
  passwordInput: document.getElementById("password"),
  loginResetBtn: document.getElementById("loginResetBtn"),
  loginResetStatus: document.getElementById("loginResetStatus"),
  signInButton: document.getElementById("emailPassBtn"),
  authError: document.getElementById("authError"),
  mainPanel: document.getElementById("mainPanel"),
  housesContainer: document.getElementById("housesContainer"),
  placeRows: document.getElementById("placeRows"),
  placeHint: document.getElementById("placeHint"),
  placePreview: document.getElementById("placePreview"),
  autoFillBtn: document.getElementById("autoFillBtn"),
  clearPlacesBtn: document.getElementById("clearPlacesBtn"),
  applyPlacesBtn: document.getElementById("applyPlacesBtn"),
  reasonInput: document.getElementById("reasonInput"),
  notesInput: document.getElementById("notesInput"),
  reasonTemplateSelect: document.getElementById("reasonTemplateSelect"),
  reasonDetailInput: document.getElementById("reasonDetailInput"),
  useReasonTemplateBtn: document.getElementById("useReasonTemplateBtn"),
  usedReasonSelect: document.getElementById("usedReasonSelect"),
  customReasonInput: document.getElementById("customReasonInput"),
  applyUsedReasonBtn: document.getElementById("applyUsedReasonBtn"),
  recentReasons: document.getElementById("recentReasons"),
  reasonCommitBtn: document.getElementById("reasonCommitBtn"),
  reasonClearBtn: document.getElementById("reasonClearBtn"),
  applyEventDraftBtn: document.getElementById("applyEventDraftBtn"),
  endEventBtn: document.getElementById("endEventBtn"),
  reasonLockState: document.getElementById("contextStatus"),
  reasonTracker: document.getElementById("reasonTracker"),
  contextSummary: document.getElementById("contextSummary"),
  categorySelect: document.getElementById("categorySelect"),
  eventSelect: document.getElementById("eventSelect"),
  subeventSelect: document.getElementById("subeventSelect"),
  eventModeSelect: document.getElementById("eventModeSelect"),
  seasonInput: document.getElementById("seasonInput"),
  sessionInput: document.getElementById("sessionInput"),
  requestPathBtn: document.getElementById("requestPathBtn"),
  checkpointName: document.getElementById("checkpointName"),
  checkpointBtn: document.getElementById("checkpointBtn"),
  undoBtn: document.getElementById("undoBtn"),
  redoBtn: document.getElementById("redoBtn"),
  resetBtn: document.getElementById("resetBtn"),
  accountBtn: document.getElementById("profileMenuBtn"),
  workspaceMenuBtn: document.getElementById("workspaceMenuBtn"),
  workspaceSwitchBtn: document.getElementById("workspaceSwitchBtn"),
  adminBtn: document.getElementById("adminMenuBtn"),
  workspaceLabel: document.getElementById("workspaceLabel"),
  helpBtn: document.getElementById("helpOpenBtn"),
  helpDialog: document.getElementById("helpDialog"),
  closeHelpBtn: document.getElementById("closeHelpBtn"),
  workspaceDialog: document.getElementById("workspaceDialog"),
  closeWorkspaceBtn: document.getElementById("closeWorkspaceBtn"),
  accountDialog: document.getElementById("accountDialog"),
  closeAccountBtn: document.getElementById("closeAccountBtn"),
  adminDialog: document.getElementById("adminDialog"),
  closeAdminBtn: document.getElementById("closeAdminBtn"),
  loggedInAs: document.getElementById("loggedInAs"),
  profileInitials: document.getElementById("profileInitials"),
  signOutBtn: document.getElementById("signOutBtn"),
  syncStatus: document.getElementById("syncStatus"),
  workspaceNav: document.getElementById("workspaceNav"),
  permissionGrid: document.getElementById("permissionGrid"),
  resetEmailInput: document.getElementById("resetEmail"),
  resetPasswordBtn: document.getElementById("resetPasswordBtn"),
  passwordResetStatus: document.getElementById("passwordResetStatus"),
  studentLookupPanel: document.getElementById("studentLookupPanel"),
  studentLookupInput: document.getElementById("studentLookupInput"),
  studentLookupStatus: document.getElementById("studentLookupStatus"),
  studentLookupResults: document.getElementById("studentLookupResults"),
  historyList: document.getElementById("historyList"),
  historyStats: document.getElementById("historyStats"),
  historySearch: document.getElementById("historySearch"),
  historyPreset: document.getElementById("historyPreset"),
  historyStart: document.getElementById("historyStart"),
  historyEnd: document.getElementById("historyEnd"),
  historySort: document.getElementById("historySort"),
  historyType: document.getElementById("historyType"),
  historyLimit: document.getElementById("historyLimit"),
  commitLabel: document.getElementById("commitLabel"),
  jumpTime: document.getElementById("jumpTime"),
  jumpBtn: document.getElementById("jumpBtn"),
  backupBtn: document.getElementById("backupBtn"),
  activityList: document.getElementById("activityList"),
  proposalPanel: document.getElementById("proposalPanel"),
  proposalList: document.getElementById("proposalList"),
  userAdminPanel: document.getElementById("userAdminPanel"),
  userNameInput: document.getElementById("userName"),
  userEmailInput: document.getElementById("userEmail"),
  userPasswordInput: document.getElementById("userPassword"),
  userRoleSelect: document.getElementById("userRole"),
  createUserBtn: document.getElementById("createUserBtn"),
  refreshUsersBtn: document.getElementById("refreshUsersBtn"),
  userSearch: document.getElementById("userSearch"),
  userList: document.getElementById("userList"),
  userAdminStatus: document.getElementById("userAdminStatus"),
  catalogCategoryInput: document.getElementById("catalogCategoryInput"),
  catalogEventInput: document.getElementById("catalogEventInput"),
  catalogSubeventInput: document.getElementById("catalogSubeventInput"),
  catalogAddPathBtn: document.getElementById("catalogAddPathBtn"),
  catalogList: document.getElementById("catalogList"),
  sheetSyncPanel: document.getElementById("sheetSyncPanel"),
  syncPointsBtn: document.getElementById("syncPointsBtn"),
  syncPointsStatus: document.getElementById("syncPointsStatus"),
  contactInboxStatus: document.getElementById("contactInboxStatus"),
  contactInboxList: document.getElementById("contactInboxList"),
  refreshContactBtn: document.getElementById("refreshContactBtn"),
  demoRoleCard: document.getElementById("demoRoleCard"),
  demoRoleSelect: document.getElementById("demoRoleSelect"),
  applyDemoRoleBtn: document.getElementById("applyDemoRoleBtn"),
  clearDemoRoleBtn: document.getElementById("clearDemoRoleBtn"),
  demoRoleStatus: document.getElementById("demoRoleStatus"),
  demoRoleBanner: document.getElementById("demoRoleBanner"),
  demoRoleBannerText: document.getElementById("demoRoleBannerText"),
  exitDemoRoleBtn: document.getElementById("exitDemoRoleBtn"),
  notificationsBtn: document.getElementById("notificationsBtn"),
  notificationsBadge: document.getElementById("notificationsBadge"),
  notificationsPanel: document.getElementById("notificationsPanel"),
  notificationsList: document.getElementById("notificationsList"),
  closeNotificationsBtn: document.getElementById("closeNotificationsBtn"),
  clearNotificationsBtn: document.getElementById("clearNotificationsBtn"),
  backupManagerPanel: document.getElementById("backupManagerPanel"),
  dangerZonePanel: document.getElementById("dangerZonePanel"),
  backupLabelInput: document.getElementById("backupLabelInput"),
  createBackupBtn: document.getElementById("createBackupBtn"),
  refreshBackupsBtn: document.getElementById("refreshBackupsBtn"),
  backupStatus: document.getElementById("backupStatus"),
  backupList: document.getElementById("backupList"),
  eventSearchInput: document.getElementById("eventSearchInput"),
  quickEventTags: document.getElementById("quickEventTags"),
  eventSuggestions: document.getElementById("eventSuggestions"),
  eventSelectedDisplay: document.getElementById("eventSelectedDisplay"),
  reasonStep: document.getElementById("reasonStep"),
  tagSearchInput: document.getElementById("tagSearchInput"),
  tagSuggestions: document.getElementById("tagSuggestions"),
  selectedTags: document.getElementById("selectedTags"),
  toastContainer: document.getElementById("toastContainer")
};

let app = null;
let db = null;
let auth = null;
let scoresDoc = null;

let unsubScores = null;
let unsubAudit = null;
let unsubProposals = null;

let pendingWrites = 0;
let currentScores = { red: 0, white: 0, blue: 0, silver: 0 };
let eventCatalog = normalizeEventCatalog(DEFAULT_EVENT_CATALOG);
let currentRole = "";
let authenticatedRole = "";
let demoRolePreview = "";
let currentPermissions = { ...ROLE_DEFAULTS.staff };
let currentUserEmail = "";
let currentUserUid = "";
let activeContext = null;
let tagLibrary = null;
let tagModalController = null;
let auditEntries = [];
let pendingProposals = [];
let userProfiles = [];
let studentLookupResults = [];
let studentLookupTimer = null;
let studentLookupNonce = 0;
let activeWorkspace = "scoring";
let backupEntries = [];
let highlightEntryId = "";
let lastActionKey = "";

// Tag system state
let allEventTags = [];
let selectedTags = [];
let userRecentTags = [];
let tagSearchTimer = null;
let selectedEventTag = "";
let localState = defaultLocalState();
let lastHelpFocus = null;
let eventDraftChanges = { red: 0, white: 0, blue: 0, silver: 0 };
let eventDraftCount = 0;
const CONTACT_RATE_LIMIT_KEY = "ala.contactForm.lastSendMs";
const CONTACT_RATE_LIMIT_MS = 60_000;
const NOTIFICATIONS_STORAGE_KEY = "ala.notifications.feed";
let notificationsFeed = (() => {
  try {
    const stored = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed.slice(0, 60);
    }
  } catch {
    // ignore parse errors
  }
  return [];
})();

// Offline support
let isOnline = navigator.onLine;
let pendingOfflineActions = [];
const OFFLINE_STORAGE_KEY = 'house-points-pending-actions';
const OFFLINE_SYNC_INTERVAL = 5000; // Check for sync every 5 seconds

// Track online/offline status
window.addEventListener('online', handleOnline);
window.addEventListener('offline', handleOffline);

// Listen for service worker messages
if ('serviceWorker' in navigator && ENABLE_PWA) {
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data.type === 'OFFLINE_STATUS_CHANGED') {
      isOnline = event.data.isOnline;
      updateOfflineIndicator();
      if (event.data.isOnline) {
        syncPendingOfflineActions();
      }
    }
  });
}

if (!TEST_MODE) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  scoresDoc = doc(db, "leaderboard", "scores");
  // Load any pending offline actions
  pendingOfflineActions = loadPendingActionsFromStorage();
}

renderHouseCards();
buildPlaceRows();
setPlaceHint();
renderPermissionGrid();
renderCatalogSelects();
renderCatalogList();
renderReasonTemplateOptions();
renderRecentReasonChips();
renderReasonTracker();
renderSimplifiedReasonCombo();
renderSimplifiedCatalog();
renderQuickEventTags();
setSelectedEventTag("");
attachSimplifiedFormListeners();
updateQuickStats();
updateContextSummary();
setLoginResetStatus("");
setPasswordResetStatus("Password reset links are available after sign in.");
setStudentLookupStatus("Type to search the secure student directory.");
renderStudentLookupResults();
setSheetSyncStatus("No sync request yet.");
setBackupStatus("Backups are only visible to superadmins.");
renderBackupList();
renderWorkspace();
setSyncStatus(TEST_MODE ? "Local test mode is active" : "Connecting to live scores...", TEST_MODE ? "local" : "neutral");
syncPermissionControlledUi();

setupEventListeners();
renderNotifications();
bootAuth();

function defaultLocalState() {
  return {
    scores: { red: 0, white: 0, blue: 0, silver: 0 },
    eventCatalog: normalizeEventCatalog(DEFAULT_EVENT_CATALOG),
    auditLog: [],
    pendingProposals: [],
    lastAction: null,
    savepoints: []
  };
}

function scoreNumber(source, houseId) {
  const value = Number(source?.[houseId]);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function scoresFromDoc(data = {}) {
  return {
    red: scoreNumber(data, "red"),
    white: scoreNumber(data, "white"),
    blue: scoreNumber(data, "blue"),
    silver: scoreNumber(data, "silver")
  };
}

function normalizeRole(role) {
  return role === "superadmin" || role === "admin" || role === "staff" || role === "helper" ? role : "staff";
}

function resolveRolePermissions(role) {
  return { ...(ROLE_DEFAULTS[normalizeRole(role)] || ROLE_DEFAULTS.staff) };
}

function can(permission) {
  return Boolean(currentPermissions?.[permission]);
}

function formatClock(date = new Date()) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function initialsFromEmail(email) {
  const text = String(email || "").trim();
  if (!text) return "--";
  const stem = text.split("@")[0] || text;
  const bits = stem.split(/[._-]+/).filter(Boolean);
  const chars = bits.length > 1 ? `${bits[0][0] || ""}${bits[1][0] || ""}` : stem.slice(0, 2);
  return chars.toUpperCase();
}

function roleDisplayLabel(role) {
  if (role === "superadmin") return "Super Admin";
  if (role === "admin") return "Admin";
  if (role === "helper") return "Helper";
  return "Staff";
}

function isDemoRoleActive() {
  return Boolean(demoRolePreview && normalizeRole(demoRolePreview) !== normalizeRole(authenticatedRole));
}

function effectiveRole() {
  if (isDemoRoleActive()) return normalizeRole(demoRolePreview);
  return authenticatedRole ? normalizeRole(authenticatedRole) : "";
}

function updateDemoRoleUi() {
  const canPreview = authenticatedRole === "superadmin";
  if (dom.demoRoleCard) dom.demoRoleCard.hidden = !canPreview;
  if (dom.demoRoleSelect) {
    dom.demoRoleSelect.disabled = !canPreview;
    dom.demoRoleSelect.value = isDemoRoleActive() ? normalizeRole(demoRolePreview) : "";
  }
  if (dom.applyDemoRoleBtn) dom.applyDemoRoleBtn.disabled = !canPreview;
  if (dom.clearDemoRoleBtn) dom.clearDemoRoleBtn.disabled = !canPreview || !isDemoRoleActive();

  if (dom.demoRoleStatus) {
    if (!canPreview) {
      dom.demoRoleStatus.textContent = "Only superadmin can use demo role preview.";
    } else if (isDemoRoleActive()) {
      dom.demoRoleStatus.textContent = `Previewing as ${roleDisplayLabel(effectiveRole())}.`;
    } else {
      dom.demoRoleStatus.textContent = "Preview mode is off.";
    }
  }

  if (dom.demoRoleBanner) dom.demoRoleBanner.hidden = !isDemoRoleActive();
  if (dom.demoRoleBannerText) {
    dom.demoRoleBannerText.textContent = isDemoRoleActive()
      ? `Previewing ${roleDisplayLabel(effectiveRole())}`
      : "Preview mode";
  }
}

function applyEffectiveRoleState() {
  const role = effectiveRole();
  currentRole = role;
  currentPermissions = resolveRolePermissions(role || "staff");
  applyRoleClass(role);
  if (currentUserEmail) {
    const label = role ? roleDisplayLabel(role) : "No Role";
    dom.loggedInAs.textContent = `${currentUserEmail} (${label})`;
  } else {
    dom.loggedInAs.textContent = "-";
  }
  updateDemoRoleUi();
}

function houseById(houseId) {
  return houses.find(house => house.id === houseId) || null;
}

function normalizeLookupToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function applyRoleClass(role) {
  document.body.classList.remove("role-staff", "role-admin", "role-superadmin", "role-helper");
  if (role) document.body.classList.add(`role-${role}`);
}

function setAuthError(message) {
  dom.authError.textContent = message;
  dom.authError.hidden = !message;
}

function setSyncStatus(message, tone = "neutral") {
  dom.syncStatus.textContent = message;
  dom.syncStatus.dataset.tone = tone;
}

function setPasswordResetStatus(message, tone = "neutral") {
  dom.passwordResetStatus.textContent = message;
  dom.passwordResetStatus.dataset.tone = tone;
}

function setLoginResetStatus(message, tone = "neutral") {
  if (!dom.loginResetStatus) return;
  const next = String(message || "").trim();
  dom.loginResetStatus.textContent = next;
  dom.loginResetStatus.dataset.tone = tone;
  dom.loginResetStatus.hidden = !next;
}

function setStudentLookupStatus(message) {
  dom.studentLookupStatus.textContent = message;
}

function setSheetSyncStatus(message) {
  if (dom.syncPointsStatus) dom.syncPointsStatus.textContent = message;
}

function setBackupStatus(message) {
  if (dom.backupStatus) dom.backupStatus.textContent = message;
}

function renderWorkspace() {
  if (!dom.workspaceNav) return;
  const tabs = dom.workspaceNav.querySelectorAll("[data-workspace-tab]");
  tabs.forEach(tab => {
    const key = String(tab.dataset.workspaceTab || "");
    tab.classList.toggle("is-active", key === activeWorkspace);
  });

  if (dom.workspaceLabel) {
    const label = activeWorkspace === "history"
      ? "Timeline"
      : activeWorkspace === "queue"
        ? "Approvals"
        : activeWorkspace === "activity"
          ? "Recent"
          : activeWorkspace === "support"
            ? "Support"
          : activeWorkspace === "analytics"
            ? "Analytics"
            : "Scoring";
    dom.workspaceLabel.textContent = label;
  }

  document.querySelectorAll("[data-workspace-panel]").forEach(panel => {
    const key = String(panel.getAttribute("data-workspace-panel") || "");
    const visible = key === activeWorkspace;
    panel.toggleAttribute("hidden", !visible);
    panel.classList.toggle("workspace-hidden", !visible);
  });

  if (activeWorkspace === "support") {
    void refreshContactInbox();
  }
}

function openWorkspaceDialog() {
  if (!dom.workspaceDialog) return;
  closeHelpDialog({ restoreFocus: false });
  closeAccountDialog();
  closeAdminDialog();
  document.body.classList.add("overlay-open");
  dom.workspaceDialog.hidden = false;
}

function closeWorkspaceDialog() {
  if (!dom.workspaceDialog) return;
  dom.workspaceDialog.hidden = true;
  clearOverlayClassIfNoDialogs();
}

function renderNotifications() {
  if (!dom.notificationsList) return;
  if (!notificationsFeed.length) {
    dom.notificationsList.innerHTML = '<li class="log-empty">No notifications yet.</li>';
  } else {
    dom.notificationsList.innerHTML = notificationsFeed.map(item => {
      const d = new Date(item.createdAt);
      const isToday = d.toDateString() === new Date().toDateString();
      const timeLabel = isToday ? d.toLocaleTimeString() : d.toLocaleDateString() + " " + d.toLocaleTimeString();
      return `
        <li class="notification-item notification-${escapeHtml(item.tone)}">
          <div class="notification-message">${escapeHtml(item.message)}</div>
          <div class="notification-meta">${timeLabel}</div>
        </li>
      `;
    }).join("");
  }

  const count = notificationsFeed.length;
  if (dom.notificationsBadge) {
    dom.notificationsBadge.hidden = count === 0;
    dom.notificationsBadge.textContent = String(Math.min(count, 99));
  }
}

function pushNotification(message, tone = "info") {
  notificationsFeed.unshift({
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    message: String(message || "").trim(),
    tone,
    createdAt: Date.now()
  });
  notificationsFeed = notificationsFeed.slice(0, 60);
  try {
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(notificationsFeed));
  } catch {
    // storage quota exceeded or unavailable
  }
  renderNotifications();
}

function openNotificationsPanel() {
  if (!dom.notificationsPanel) return;
  dom.notificationsPanel.hidden = false;
}

function closeNotificationsPanel() {
  if (!dom.notificationsPanel) return;
  dom.notificationsPanel.hidden = true;
}

function showToast(message, tone = "success") {
  if (!dom.toastContainer) return;
  pushNotification(message, tone);
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

function updateBusyState(delta) {
  pendingWrites = Math.max(0, pendingWrites + delta);
  document.body.classList.toggle("is-busy", pendingWrites > 0);
}

function handleOnline() {
  isOnline = true;
  updateOfflineIndicator();
  syncPendingOfflineActions();
}

function handleOffline() {
  isOnline = false;
  updateOfflineIndicator();
}

function updateOfflineIndicator() {
  const syncStatus = document.getElementById("syncStatus");
  if (!syncStatus) return;

  if (!isOnline) {
    syncStatus.textContent = "Offline - Changes will sync when online";
    syncStatus.setAttribute("data-tone", "warn");
    document.body.classList.add("is-offline");
  } else if (pendingOfflineActions.length > 0) {
    syncStatus.textContent = `Syncing ${pendingOfflineActions.length} pending action${pendingOfflineActions.length !== 1 ? 's' : ''}...`;
    syncStatus.setAttribute("data-tone", "neutral");
  } else {
    syncStatus.textContent = "Connected to live scores...";
    syncStatus.setAttribute("data-tone", "success");
    document.body.classList.remove("is-offline");
  }
}

function queueOfflineAction(actionData) {
  if (isOnline) {
    return Promise.resolve(true);
  }

  const action = {
    id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    ...actionData
  };

  pendingOfflineActions.push(action);
  savePendingActionsToStorage();
  updateOfflineIndicator();

  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    const channel = new MessageChannel();
    navigator.serviceWorker.controller.postMessage(
      { type: 'QUEUE_OFFLINE_ACTION', action },
      [channel.port2]
    );
  }

  return Promise.resolve(false);
}

function savePendingActionsToStorage() {
  try {
    localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(pendingOfflineActions));
  } catch (e) {
    console.warn('Failed to save pending actions to storage:', e);
  }
}

function loadPendingActionsFromStorage() {
  try {
    const stored = localStorage.getItem(OFFLINE_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.warn('Failed to load pending actions from storage:', e);
    return [];
  }
}

async function syncPendingOfflineActions() {
  if (pendingOfflineActions.length === 0) {
    updateOfflineIndicator();
    return;
  }

  updateOfflineIndicator();
  let syncedCount = 0;

  for (const action of pendingOfflineActions) {
    try {
      if (action.type === 'score') {
        await withWrite(async () => {
          await submitHouseDelta(action.house, action.delta);
        });
        syncedCount++;
      } else if (action.type === 'proposal') {
        await withWrite(async () => {
          await submitProposal(action.proposal);
        });
        syncedCount++;
      }
    } catch (e) {
      console.warn(`Failed to sync offline action ${action.id}:`, e);
    }
  }

  pendingOfflineActions = pendingOfflineActions.slice(syncedCount);
  savePendingActionsToStorage();
  updateOfflineIndicator();

  if (syncedCount > 0) {
    showToast(`Synced ${syncedCount} pending action${syncedCount !== 1 ? 's' : ''}`, "success");
  }
}

function normalizeId(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function safeId(value) {
  return normalizeId(value);
}

function chunkArray(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

// ============ TAG NORMALIZATION & FUZZY MATCHING ============

function normalizeTag(tag) {
  return String(tag || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 100);
}

function levenshteinDistance(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  const matrix = Array(a.length + 1).fill(null).map(() => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

function calculateTagSimilarity(input, candidate) {
  const a = normalizeTag(input);
  const b = normalizeTag(candidate);
  if (!a || !b) return 0;
  const dist = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  return 1 - (dist / maxLen);
}

function fuzzyMatchEventTag(input, eventCatalog) {
  if (!input || !eventCatalog?.categories) {
    return { match: null, confidence: 0, matches: [] };
  }

  const candidates = [];
  eventCatalog.categories.forEach(cat => {
    cat.events?.forEach(evt => {
      candidates.push({ name: evt.name, type: "event" });
      evt.subevents?.forEach(sub => {
        candidates.push({ name: sub.name, type: "subevent" });
      });
    });
  });

  const scored = candidates.map(cand => ({
    ...cand,
    similarity: calculateTagSimilarity(input, cand.name)
  })).sort((a, b) => b.similarity - a.similarity);

  const topMatches = scored.slice(0, 3).filter(m => m.similarity > 0.6);
  const best = topMatches[0];

  return {
    match: best || null,
    confidence: best?.similarity || 0,
    matches: topMatches
  };
}

function createActionTimestamp() {
  if (!TEST_MODE) return serverTimestamp();
  const now = Date.now();
  return {
    seconds: Math.floor(now / 1000),
    nanoseconds: (now % 1000) * 1000000
  };
}

function mapAuthError(error) {
  const code = error?.code || "";
  if (code === "auth/invalid-credential") return "Incorrect email or password. Contact Noah Baker (admin) if you need help resetting your password.";
  if (code === "auth/user-disabled") return "This account is disabled. Contact Noah Baker (admin).";
  if (code === "auth/too-many-requests") return "Too many attempts. Wait a few minutes and try again.";
  if (code === "auth/network-request-failed") return "Network error. Check your connection and try again.";
  if (code === "auth/user-not-found") return "Account not found. Contact Noah Baker (admin) to verify your account exists.";
  return "Sign in failed. If the issue persists, contact Noah Baker (admin) at nb72258@stu.alaschools.org.";
}

function mapPasswordResetError(error) {
  const code = String(error?.code || "");
  if (code === "auth/invalid-email") return "Enter a valid email address.";
  if (code === "auth/user-not-found") return "No account was found with that email. Contact Noah Baker (admin) to verify your account exists.";
  if (code === "auth/missing-email") return "Email is required.";
  if (code === "auth/too-many-requests") return "Too many reset attempts. Wait a few minutes and retry.";
  if (code === "auth/network-request-failed") return "Network error. Please try again or contact Noah Baker (admin).";
  if (code === "auth/unauthorized-continue-uri") return "Email domain not configured. Contact Noah Baker (admin).";
  if (code === "auth/invalid-continue-uri") return "Reset link configuration error. Contact Noah Baker (admin).";
  return "Unable to send reset link. Check your email (including spam/junk folders) or contact Noah Baker (admin) at nb72258@stu.alaschools.org.";
}

function isLikelyEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function buildResetActionCodeSettings() {
  const origin = String(window.location.origin || "").trim();
  const pathname = String(window.location.pathname || "/web/control/index.html").trim() || "/web/control/index.html";
  const url = `${origin}${pathname}`;
  return {
    url,
    handleCodeInApp: false
  };
}

async function sendResetEmailWithFallback(email) {
  const settings = buildResetActionCodeSettings();
  try {
    await sendPasswordResetEmail(auth, email, settings);
    return { fallbackUsed: false };
  } catch (error) {
    const code = String(error?.code || "");
    if (code === "auth/unauthorized-continue-uri" || code === "auth/invalid-continue-uri" || code === "auth/missing-continue-uri") {
      await sendPasswordResetEmail(auth, email);
      return { fallbackUsed: true };
    }
    throw error;
  }
}

function mapActionTypeLabel(type) {
  if (type === "delta") return "Score Edit";
  if (type === "place_awards") return "Place Awards";
  if (type === "reset") return "Reset";
  if (type === "savepoint") return "Savepoint";
  if (type === "restore_savepoint") return "Restore";
  if (type === "proposal_submitted") return "Suggestion";
  if (type === "proposal_approved") return "Suggestion Approved";
  if (type === "proposal_rejected") return "Suggestion Rejected";
  if (type === "path_request_submitted") return "Path Request";
  if (type === "path_request_approved") return "Path Approved";
  if (type === "path_request_rejected") return "Path Rejected";
  return "Action";
}

function changeMagnitude(changes = {}) {
  return Math.abs(Number(changes.red || 0)) + Math.abs(Number(changes.white || 0)) + Math.abs(Number(changes.blue || 0)) + Math.abs(Number(changes.silver || 0));
}

function applyChanges(scores, changes = {}) {
  return {
    red: Math.max(0, scoreNumber(scores, "red") + Number(changes.red || 0)),
    white: Math.max(0, scoreNumber(scores, "white") + Number(changes.white || 0)),
    blue: Math.max(0, scoreNumber(scores, "blue") + Number(changes.blue || 0)),
    silver: Math.max(0, scoreNumber(scores, "silver") + Number(changes.silver || 0))
  };
}

function changesFromHouseDelta(house, delta) {
  return {
    red: house === "red" ? delta : 0,
    white: house === "white" ? delta : 0,
    blue: house === "blue" ? delta : 0,
    silver: house === "silver" ? delta : 0
  };
}

function normalizeEventCatalog(raw = {}) {
  const categories = Array.isArray(raw?.categories) ? raw.categories : [];
  const normalized = categories
    .map(category => {
      const categoryId = safeId(category.id || category.name);
      const categoryName = String(category.name || "").trim();
      const eventsRaw = Array.isArray(category.events) ? category.events : [];
      const events = eventsRaw
        .map(event => {
          const eventId = safeId(event.id || event.name);
          const eventName = String(event.name || "").trim();
          const subeventsRaw = Array.isArray(event.subevents) ? event.subevents : [];
          const subevents = subeventsRaw
            .map(subevent => {
              const subeventId = safeId(subevent.id || subevent.name);
              const subeventName = String(subevent.name || "").trim();
              if (!subeventId || !subeventName) return null;
              return { id: subeventId, name: subeventName };
            })
            .filter(Boolean);
          if (!eventId || !eventName) return null;
          return {
            id: eventId,
            name: eventName,
            subevents: subevents.length ? subevents : [{ id: "general", name: "General" }]
          };
        })
        .filter(Boolean);
      if (!categoryId || !categoryName || !events.length) return null;
      return { id: categoryId, name: categoryName, events };
    })
    .filter(Boolean);

  if (normalized.length) {
    return { categories: normalized };
  }
  return structuredClone(DEFAULT_EVENT_CATALOG);
}

function getCategoryById(categoryId) {
  return eventCatalog.categories.find(category => category.id === categoryId) || null;
}

function getEventById(category, eventId) {
  if (!category) return null;
  return category.events.find(event => event.id === eventId) || null;
}

function getSubeventById(event, subeventId) {
  if (!event) return null;
  return event.subevents.find(subevent => subevent.id === subeventId) || null;
}

function selectedRoute() {
  if (selectedEventTag) {
    const normalizedEvent = String(selectedEventTag || "").trim().toLowerCase();
    return {
      categoryId: "events",
      categoryName: "Events",
      eventId: safeId(normalizedEvent) || "general_event",
      eventName: normalizedEvent,
      subeventId: "general",
      subeventName: "general"
    };
  }

  const classification = String(document.getElementById("classificationSelect")?.value || "").trim();
  if (classification.includes("|")) {
    const [categoryId, eventId, subeventId] = classification.split("|");
    const category = getCategoryById(categoryId);
    const event = getEventById(category, eventId);
    const subevent = getSubeventById(event, subeventId);
    if (category && event && subevent) {
      return {
        categoryId: category.id,
        categoryName: category.name,
        eventId: event.id,
        eventName: event.name,
        subeventId: subevent.id,
        subeventName: subevent.name
      };
    }
  }

  if (!dom.categorySelect || !dom.eventSelect || !dom.subeventSelect) return null;
  const category = getCategoryById(dom.categorySelect.value);
  const event = getEventById(category, dom.eventSelect.value);
  const subevent = getSubeventById(event, dom.subeventSelect.value);
  if (!category || !event || !subevent) return null;
  return {
    categoryId: category.id,
    categoryName: category.name,
    eventId: event.id,
    eventName: event.name,
    subeventId: subevent.id,
    subeventName: subevent.name
  };
}

function buildContextFromInputs() {
  if (!dom.notesInput || !dom.eventModeSelect || !dom.seasonInput || !dom.sessionInput) return null;
  const route = selectedRoute();
  if (!route) return null;
  const simplifiedReason = String(document.getElementById("reasonComboInput")?.value || "").trim();
  const legacyReason = String(dom.reasonInput?.value || "").trim();
  const reason = simplifiedReason || legacyReason;
  const notes = String(dom.notesInput.value || "").trim();
  const eventMode = dom.eventModeSelect.value === "session" ? "session" : "recurring";
  const season = String(dom.seasonInput.value || "").trim().slice(0, 30);
  const sessionName = String(dom.sessionInput.value || "").trim().slice(0, 40);
  if (!reason) return null;
  if (eventMode === "session" && !sessionName) return null;
  if (dom.reasonInput) dom.reasonInput.value = reason;
  return {
    ...route,
    eventMode,
    season,
    sessionName,
    reason,
    notes,
    pathLabel: `${route.categoryName} > ${route.eventName} > ${route.subeventName}`
  };
}

function updateContextSummary() {
  if (!dom.contextSummary || !dom.reasonLockState) return;
  if (!activeContext) {
    if (selectedEventTag) {
      dom.contextSummary.textContent = `Event selected: ${selectedEventTag}. Add a reason and start event.`;
      dom.reasonLockState.textContent = "Ready";
      dom.reasonLockState.className = "status-chip status-queued";
      return;
    }
    dom.contextSummary.textContent = "No active event context.";
    dom.reasonLockState.textContent = "Locked";
    dom.reasonLockState.className = "status-chip status-failed";
    return;
  }
  const modeLabel = activeContext.eventMode === "session" ? `Session: ${activeContext.sessionName}` : "Recurring";
  const seasonLabel = activeContext.season ? ` • ${activeContext.season}` : "";
  const pendingLabel = hasEventDraftChanges() ? ` • Pending: ${eventDraftCount} change${eventDraftCount === 1 ? "" : "s"}` : "";
  dom.contextSummary.textContent = `${activeContext.pathLabel} • ${modeLabel}${seasonLabel} • ${activeContext.reason}${pendingLabel}`;
  dom.reasonLockState.textContent = "Active";
  dom.reasonLockState.className = "status-chip status-sent";
}

function updateQuickStats() {
  renderQuickStats();
}

// ============ TAG LIBRARY ============

class TagLibrary {
  constructor() {
    this.tags = [];
    this.index = {}; // normalized name → tag object
    this.byCategory = {}; // category path → tags array
    this.lastSync = null;
  }

  async load() {
    try {
      console.log("📚 Loading tag library from Firestore...");
      const querySnap = await getDocs(query(collection(db, "eventTags"), where("approved", "==", true)));
      this.tags = querySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Build index and category grouping
      this.index = {};
      this.byCategory = {};
      this.tags.forEach(tag => {
        const norm = String(tag.normalizedName || "").toLowerCase();
        this.index[norm] = tag;
        const cat = tag.categoryPath || "Other";
        if (!this.byCategory[cat]) this.byCategory[cat] = [];
        this.byCategory[cat].push(tag);
      });

      // Sort by usage count within each category
      Object.values(this.byCategory).forEach(arr => {
        arr.sort((a, b) => (b.usage?.count || 0) - (a.usage?.count || 0));
      });

      this.lastSync = Date.now();
      console.log(`✅ Loaded ${this.tags.length} tags into library`);
      return true;
    } catch (error) {
      console.error("❌ Failed to load tag library:", error);
      return false;
    }
  }

  search(query) {
    if (!query || query.trim().length === 0) {
      // Return top tags by category if no query
      return this.getTopTags();
    }

    const results = [];
    const queryLower = query.toLowerCase().trim();

    // Use fuzzyMatchScore from tag-utils.js if available
    this.tags.forEach(tag => {
      const score = typeof fuzzyMatchScore === "function" ?
        fuzzyMatchScore(tag.normalizedName, queryLower) :
        (tag.name.toLowerCase().includes(queryLower) ? 100 : 0);

      if (score > 30) {
        results.push({ ...tag, _score: score });
      }
    });

    // Sort by score, then by usage
    results.sort((a, b) => {
      const scoreDiff = b._score - a._score;
      if (Math.abs(scoreDiff) > 10) return scoreDiff;
      return (b.usage?.count || 0) - (a.usage?.count || 0);
    });

    return results.slice(0, 20); // Return top 20 matches
  }

  getTopTags() {
    const results = [];
    Object.values(this.byCategory).forEach(tags => {
      results.push(...tags.slice(0, 3)); // Top 3 per category
    });
    return results.slice(0, 20);
  }

  getGroupedTags(searchQuery) {
    const results = this.search(searchQuery);
    const grouped = {};

    results.forEach(tag => {
      const cat = tag.categoryPath || "Other";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(tag);
    });

    return grouped;
  }

  async recordUsage(tagId, houseId) {
    try {
      const tagRef = doc(db, "eventTags", tagId);
      await updateDoc(tagRef, {
        "usage.count": increment(1),
        "usage.lastUsed": serverTimestamp(),
        [`usage.byHouse.${houseId}`]: increment(1),
      });
    } catch (error) {
      console.warn("Could not record tag usage:", error);
    }
  }

  async proposeCustomTag(name, category = "Custom") {
    try {
      const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "");

      // Check for similar existing tags
      const similar = this.tags.filter(t => {
        const score = typeof fuzzyMatchScore === "function" ?
          fuzzyMatchScore(t.normalizedName, normalized) : 0;
        return score > 85;
      });

      const docRef = await addDoc(collection(db, "eventTagProposals"), {
        tagName: name,
        normalizedName: normalized,
        category,
        proposedBy: currentUserEmail || "anonymous",
        proposedAt: serverTimestamp(),
        status: "auto-approved", // Based on user decision: auto-approve for now
        similarTags: similar.map(t => t.id),
        usageCount: 0,
      });

      console.log("✅ Custom tag proposal created:", docRef.id);
      return docRef.id;
    } catch (error) {
      console.error("❌ Failed to propose custom tag:", error);
      return null;
    }
  }
}

// ============ TAG MODAL CONTROLLER ============

class TagModalController {
  constructor(tagLibrary) {
    this.tagLibrary = tagLibrary;
    this.selectedHouseId = null;
    this.selectedTags = [];
    this.selectedAmount = 0;
    this.selectedNotes = "";
    this.modal = document.getElementById("tagModalOverlay");
    this.setupEventListeners();
  }

  setupEventListeners() {
    if (!this.modal) return;

    const closeBtn = document.getElementById("closeTagModalBtn");
    const cancelBtn = document.getElementById("cancelTagModalBtn");
    const applyBtn = document.getElementById("applyTagsBtn");
    const searchField = document.getElementById("tagSearchField");
    const customAmountInput = document.getElementById("modalCustomAmount");
    const notesInput = document.getElementById("modalNotesInput");
    const amountButtons = document.querySelectorAll(".btn-amount-modal");

    closeBtn?.addEventListener("click", () => this.close());
    cancelBtn?.addEventListener("click", () => this.close());
    applyBtn?.addEventListener("click", () => this.apply());

    // Search with debounce
    let searchTimer = null;
    searchField?.addEventListener("input", (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        this.renderTags(e.target.value);
      }, 150);
    });

    // Amount buttons
    amountButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".btn-amount-modal").forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        this.selectedAmount = Number(btn.dataset.amount || 0);
        customAmountInput.value = "";
      });
    });

    // Custom amount input
    customAmountInput?.addEventListener("input", (e) => {
      document.querySelectorAll(".btn-amount-modal").forEach(b => b.classList.remove("selected"));
      this.selectedAmount = Number(e.target.value || 0);
    });

    // Notes input
    notesInput?.addEventListener("input", (e) => {
      this.selectedNotes = String(e.target.value || "").trim();
    });

    // Modal backdrop click to close
    const scrim = this.modal.querySelector(".tag-modal-scrim");
    scrim?.addEventListener("click", () => this.close());
  }

  async open(houseId) {
    this.selectedHouseId = houseId;
    this.selectedTags = [];
    this.selectedAmount = 0;
    this.selectedNotes = "";

    // Update house name
    const house = houses.find(h => h.id === houseId);
    const houseName = document.getElementById("tagModalHouseName");
    if (houseName && house) houseName.textContent = house.name;

    // Reset form
    const searchField = document.getElementById("tagSearchField");
    const customAmount = document.getElementById("modalCustomAmount");
    const notesInput = document.getElementById("modalNotesInput");
    const saveCheckbox = document.getElementById("saveCustomTagCheckbox");

    if (searchField) searchField.value = "";
    if (customAmount) customAmount.value = "";
    if (notesInput) notesInput.value = "";
    if (saveCheckbox) saveCheckbox.checked = false;

    document.querySelectorAll(".btn-amount-modal").forEach(b => b.classList.remove("selected"));
    this.renderSelectedChips();

    // Render initial tags
    this.renderTags("");

    // Focus search field
    setTimeout(() => searchField?.focus(), 150);

    // Show modal
    if (this.modal) this.modal.hidden = false;
  }

  close() {
    if (this.modal) this.modal.hidden = true;
    this.selectedTags = [];
    this.selectedAmount = 0;
  }

  renderTags(searchQuery) {
    const grouped = this.tagLibrary.getGroupedTags(searchQuery);
    const container = document.getElementById("tagCategoryGroups");
    if (!container) return;

    container.innerHTML = "";

    Object.entries(grouped).sort().forEach(([category, tags]) => {
      const groupDiv = document.createElement("div");
      groupDiv.className = "tag-category-group";

      const label = document.createElement("div");
      label.className = "tag-category-label";
      label.textContent = category;
      groupDiv.appendChild(label);

      const rowDiv = document.createElement("div");
      rowDiv.className = "tag-options-row";

      tags.forEach(tag => {
        const btn = document.createElement("button");
        btn.className = `tag-option ${this.selectedTags.includes(tag.id) ? "selected" : ""}`;
        btn.type = "button";
        btn.textContent = tag.name;
        btn.dataset.tagId = tag.id;

        btn.addEventListener("click", () => this.toggleTag(tag.id, tag.name));
        rowDiv.appendChild(btn);
      });

      groupDiv.appendChild(rowDiv);
      container.appendChild(groupDiv);
    });
  }

  toggleTag(tagId, tagName) {
    if (this.selectedTags.includes(tagId)) {
      this.selectedTags = this.selectedTags.filter(id => id !== tagId);
    } else {
      this.selectedTags.push(tagId);
    }

    // Update UI
    const buttons = document.querySelectorAll(`[data-tag-id]`);
    buttons.forEach(btn => {
      if (btn.dataset.tagId === tagId) {
        btn.classList.toggle("selected");
      }
    });

    this.renderSelectedChips();
  }

  renderSelectedChips() {
    const container = document.getElementById("selectedTagsChips");
    if (!container) return;

    container.innerHTML = "";

    if (this.selectedTags.length === 0) {
      container.innerHTML = '<span style="font-size: 12px; color: var(--muted);">No tags selected</span>';
      return;
    }

    this.selectedTags.forEach(tagId => {
      const tag = this.tagLibrary.tags.find(t => t.id === tagId);
      if (!tag) return;

      const chip = document.createElement("div");
      chip.className = "tag-chip";

      const text = document.createElement("span");
      text.className = "tag-chip-text";
      text.textContent = tag.name;

      const removeBtn = document.createElement("button");
      removeBtn.className = "tag-chip-remove";
      removeBtn.type = "button";
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", () => this.toggleTag(tagId));

      chip.appendChild(text);
      chip.appendChild(removeBtn);
      container.appendChild(chip);
    });
  }

  async apply() {
    if (!this.selectedHouseId) {
      showToast("No house selected", "warn");
      return;
    }

    if (this.selectedTags.length === 0) {
      showToast("Select at least one tag", "warn");
      return;
    }

    if (this.selectedAmount <= 0) {
      showToast("Enter an amount greater than 0", "warn");
      return;
    }

    try {
      updateBusyState(1);

      // Record usage for selected tags
      this.selectedTags.forEach(tagId => {
        void this.tagLibrary.recordUsage(tagId, this.selectedHouseId);
      });

      // Submit the scoring action
      await submitScoringActionWithTags({
        house: this.selectedHouseId,
        amount: this.selectedAmount,
        tags: this.selectedTags,
        notes: this.selectedNotes,
      });

      showToast("✅ Points scored!", "success");
      this.close();
    } catch (error) {
      console.error("Failed to apply tags:", error);
      showToast("Failed to score points: " + error.message, "warn");
    } finally {
      updateBusyState(-1);
    }
  }
}

// ============ EMAIL CONTACT FORM HANDLERS ============

function getCurrentUserDisplayName() {
  const profile = userProfiles.find(p => p.email === currentUserEmail) || null;
  const authName = auth.currentUser?.displayName || "";
  const displayName = String(profile?.name || authName || "").trim();
  if (displayName && currentUserEmail) return `${displayName} (${currentUserEmail})`;
  if (currentUserEmail) return currentUserEmail;
  return "Not signed in";
}

function openEmailContactForm() {
  const modal = document.getElementById("emailContactFormModal");
  const purposeSelect = document.getElementById("emailContactPurpose");
  const identity = document.getElementById("emailContactIdentity");
  const subjectInput = document.getElementById("emailContactSubject");
  const messageInput = document.getElementById("emailContactMessage");
  const statusDiv = document.getElementById("emailFormStatus");

  if (purposeSelect) purposeSelect.value = "help";
  if (identity) identity.textContent = getCurrentUserDisplayName();
  if (subjectInput) subjectInput.value = "";
  if (messageInput) messageInput.value = "";
  if (statusDiv) statusDiv.textContent = "";

  if (modal) modal.hidden = false;
}

function closeEmailContactForm() {
  const modal = document.getElementById("emailContactFormModal");
  if (modal) modal.hidden = true;
}

async function sendEmailContactForm() {
  const purpose = String(document.getElementById("emailContactPurpose")?.value || "help");
  const subject = String(document.getElementById("emailContactSubject")?.value || "").trim();
  const message = String(document.getElementById("emailContactMessage")?.value || "").trim();
  const statusDiv = document.getElementById("emailFormStatus");

  if (!currentUserEmail) {
    if (statusDiv) {
      statusDiv.className = "email-form-status error";
      statusDiv.textContent = "Please sign in before sending a message.";
    }
    return;
  }

  if (!subject || !message) {
    if (statusDiv) {
      statusDiv.className = "email-form-status error";
      statusDiv.textContent = "Please fill in all fields";
    }
    return;
  }

  // Rate limiting: prevent submissions within 60 seconds
  try {
    const lastSend = Number(localStorage.getItem(CONTACT_RATE_LIMIT_KEY) || "0");
    const elapsed = Date.now() - lastSend;
    if (elapsed < CONTACT_RATE_LIMIT_MS) {
      const waitSec = Math.ceil((CONTACT_RATE_LIMIT_MS - elapsed) / 1000);
      if (statusDiv) {
        statusDiv.className = "email-form-status error";
        statusDiv.textContent = `Please wait ${waitSec} more second${waitSec === 1 ? "" : "s"} before sending another message.`;
      }
      return;
    }
  } catch {
    // localStorage unavailable, proceed without rate limiting
  }

  try {
    updateBusyState(1);

    // Store contact message in Firestore for admin review
    const identity = getCurrentUserDisplayName();
    await addDoc(collection(db, "contactMessages"), {
      name: identity,
      email: currentUserEmail,
      purpose,
      subject,
      message,
      userId: currentUserUid || "anonymous",
      userEmail: currentUserEmail,
      createdAt: serverTimestamp(),
      read: false,
    });

    if (statusDiv) {
      statusDiv.className = "email-form-status success";
      statusDiv.textContent = "✅ Message sent! We'll get back to you soon.";
    }

    try { localStorage.setItem(CONTACT_RATE_LIMIT_KEY, String(Date.now())); } catch { /* ignore */ }
    showToast("Message sent to Noah Baker", "success");

    // Close after a short delay
    setTimeout(() => {
      closeEmailContactForm();
    }, 2000);
  } catch (error) {
    console.error("Failed to send contact message:", error);
    const permissionDenied = String(error?.code || "").includes("permission");
    if (statusDiv) {
      statusDiv.className = "email-form-status error";
      statusDiv.textContent = permissionDenied
        ? "Permission denied by Firestore rules. Deploy the updated rules, then retry."
        : `Failed: ${error.message}`;
    }
    showToast("Failed to send message", "warn");
  } finally {
    updateBusyState(-1);
  }
}

// ============ REASON TRACKER ============

function renderReasonTracker() {
  const total = Number(eventDraftChanges.red || 0) + Number(eventDraftChanges.white || 0) + Number(eventDraftChanges.blue || 0) + Number(eventDraftChanges.silver || 0);
  dom.reasonTracker.innerHTML = houses.map(house => {
    const value = Number(eventDraftChanges[house.id] || 0);
    const polarityClass = value > 0 ? "delta-pos" : (value < 0 ? "delta-neg" : "");
    const signed = `${value > 0 ? "+" : ""}${value}`;
    return `<span class="history-delta-chip ${polarityClass}">${house.id[0].toUpperCase()} ${signed}</span>`;
  }).join("") + `<span class="history-delta-chip ${total > 0 ? "delta-pos" : total < 0 ? "delta-neg" : ""}">Total ${total > 0 ? "+" : ""}${total}</span>`;
}

function hasEventDraftChanges() {
  return houses.some(house => Number(eventDraftChanges[house.id] || 0) !== 0);
}

function resetEventDraft() {
  eventDraftChanges = { red: 0, white: 0, blue: 0, silver: 0 };
  eventDraftCount = 0;
  updateContextSummary();
  renderReasonTracker();
  renderHouseCards();
  syncPermissionControlledUi();
}

async function applyEventDraftChanges({ endAfterApply = false } = {}) {
  if (!activeContext) {
    showToast("Start an event first.", "warn");
    return;
  }
  if (!hasEventDraftChanges()) {
    if (endAfterApply) {
      clearContext({ quiet: true });
      showToast("Event ended with no pending changes.", "info");
      return;
    }
    showToast("No pending changes to apply.", "warn");
    return;
  }

  const changes = { ...eventDraftChanges };
  const total = Number(changes.red || 0) + Number(changes.white || 0) + Number(changes.blue || 0) + Number(changes.silver || 0);
  const summary = `${activeContext.reason} · event batch (${eventDraftCount} changes, total ${total > 0 ? "+" : ""}${total})`;

  await submitScoringAction({ type: "delta", summary, changes });
  resetEventDraft();
  if (endAfterApply) {
    clearContext({ quiet: true });
    showToast("Event ended and saved.", "success");
  }
}

function queueHouseDeltaInDraft(house, delta) {
  if (!activeContext) {
    showToast("Start an event first.", "warn");
    return;
  }
  if (!Number.isFinite(delta) || delta === 0) return;
  eventDraftChanges[house] = Number(eventDraftChanges[house] || 0) + delta;
  eventDraftCount += 1;
  updateContextSummary();
  renderReasonTracker();
  renderHouseCards();
  syncPermissionControlledUi();
}

function renderCatalogSelects() {
  // Safety check: only render if elements exist
  if (!dom.categorySelect || !dom.eventSelect || !dom.subeventSelect) {
    return;
  }

  const selectedCategory = dom.categorySelect.value;
  dom.categorySelect.innerHTML = "";
  eventCatalog.categories.forEach(category => {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    dom.categorySelect.appendChild(option);
  });

  if (selectedCategory && eventCatalog.categories.some(category => category.id === selectedCategory)) {
    dom.categorySelect.value = selectedCategory;
  }

  const category = getCategoryById(dom.categorySelect.value) || eventCatalog.categories[0] || null;
  dom.eventSelect.innerHTML = "";
  if (category) {
    category.events.forEach(event => {
      const option = document.createElement("option");
      option.value = event.id;
      option.textContent = event.name;
      dom.eventSelect.appendChild(option);
    });
  }

  const event = getEventById(category, dom.eventSelect.value) || category?.events?.[0] || null;
  dom.subeventSelect.innerHTML = "";
  if (event) {
    event.subevents.forEach(subevent => {
      const option = document.createElement("option");
      option.value = subevent.id;
      option.textContent = subevent.name;
      dom.subeventSelect.appendChild(option);
    });
  }

  syncContextModeUi();
  renderReasonTemplateOptions();
  renderUsedReasonSelect();
  renderRecentReasonChips();
}

function syncContextModeUi() {
  if (!dom.eventModeSelect || !dom.sessionInput || !dom.seasonInput) {
    return;
  }
  const sessionMode = dom.eventModeSelect.value === "session";
  dom.sessionInput.disabled = !sessionMode;
  if (!sessionMode) {
    dom.sessionInput.value = "";
  }
}

function reasonTemplateSuggestions(route) {
  if (!route) return REASON_TEMPLATE_BANK;
  const eventWords = [route.eventName, route.subeventName]
    .map(item => String(item || "").trim())
    .filter(Boolean);
  const dynamic = eventWords.map(word => `${String(word).toLowerCase()} participation`);
  return [...REASON_TEMPLATE_BANK, ...dynamic];
}

function renderReasonTemplateOptions() {
  if (!dom.reasonTemplateSelect) return;
  const route = selectedRoute();
  const options = reasonTemplateSuggestions(route);
  const previous = String(dom.reasonTemplateSelect.value || "");
  dom.reasonTemplateSelect.innerHTML = '<option value="">Quick reason template</option>';
  options.forEach(optionText => {
    const option = document.createElement("option");
    option.value = optionText;
    option.textContent = optionText;
    dom.reasonTemplateSelect.appendChild(option);
  });
  if (previous && options.includes(previous)) {
    dom.reasonTemplateSelect.value = previous;
  }
}

function applyReasonTemplate() {
  const template = String(dom.reasonTemplateSelect.value || "").trim();
  const detail = String(dom.reasonDetailInput.value || "").trim();
  if (!template) {
    showToast("Select a template first.", "warn");
    return;
  }
  dom.reasonInput.value = detail ? `${template} - ${detail}` : template;
  showToast("Reason filled from template.", "success");
}

function routeKey(context = null) {
  if (!context?.categoryId || !context?.eventId || !context?.subeventId) return "";
  return `${context.categoryId}|${context.eventId}|${context.subeventId}`;
}

function recentReasonsForRoute(limitCount = 24) {
  const route = selectedRoute();
  if (!route) {
    return [];
  }
  const key = routeKey(route);
  const seen = new Set();
  const reasons = [];
  [...auditEntries]
    .sort((a, b) => Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0))
    .forEach(entry => {
      if (reasons.length >= 8) return;
      if (!entry?.context || routeKey(entry.context) !== key) return;
      const reason = String(entry.reason || "").trim();
      if (!reason || seen.has(reason)) return;
      seen.add(reason);
      reasons.push(reason);
    });

  return reasons;
}

function renderUsedReasonSelect() {
  if (!dom.usedReasonSelect) return;
  const reasons = recentReasonsForRoute(24);
  const currentValue = String(dom.usedReasonSelect.value || "");
  dom.usedReasonSelect.innerHTML = '<option value="">Previously used reasons</option>';
  reasons.forEach(reason => {
    const option = document.createElement("option");
    option.value = reason;
    option.textContent = reason;
    dom.usedReasonSelect.appendChild(option);
  });
  if (currentValue && reasons.includes(currentValue)) {
    dom.usedReasonSelect.value = currentValue;
  }
}

function applySelectedReason() {
  if (!dom.customReasonInput || !dom.usedReasonSelect || !dom.reasonInput) return;
  const customReason = String(dom.customReasonInput.value || "").trim();
  const usedReason = String(dom.usedReasonSelect.value || "").trim();
  const selected = customReason || usedReason;
  if (!selected) {
    showToast("Pick a used reason or type a custom reason.", "warn");
    return;
  }
  dom.reasonInput.value = selected;
  showToast("Reason applied.", "success");
}

function renderRecentReasonChips() {
  if (!dom.recentReasons) return;
  const route = selectedRoute();
  if (!route) {
    dom.recentReasons.innerHTML = "";
    return;
  }
  const reasons = recentReasonsForRoute(8);

  if (!reasons.length) {
    dom.recentReasons.innerHTML = '<span class="log-empty">No recent reasons for this path yet.</span>';
    return;
  }

  dom.recentReasons.innerHTML = reasons.map(reason => `<button type="button" class="reason-pill-btn" data-reason-chip="${reason.replace(/"/g, "&quot;")}">${reason}</button>`).join("");
}

function renderTagSuggestions(input) {
  const suggestionsDiv = document.getElementById("tagSuggestions");
  if (!suggestionsDiv) return;

  if (!input || input.length < 1) {
    suggestionsDiv.innerHTML = "";
    return;
  }

  const result = fuzzyMatchEventTag(input, eventCatalog);
  const matches = result.matches || [];

  if (!matches.length) {
    suggestionsDiv.innerHTML = `<div class="tag-suggestion-item" data-tag="other">Other: "${input.slice(0, 30)}"</div>`;
    return;
  }

  suggestionsDiv.innerHTML = matches.map((match, idx) => {
    const name = match.name || "";
    const conf = (match.similarity * 100).toFixed(0);
    return `<div class="tag-suggestion-item" data-tag="${name}" data-confidence="${conf}">${name} (${conf}%)</div>`;
  }).join("");

  // Add "Other" option
  if (input && !matches.some(m => normalizeTag(m.name) === normalizeTag(input))) {
    suggestionsDiv.innerHTML += `<div class="tag-suggestion-item" data-tag="other">Other: "${input.slice(0, 30)}"</div>`;
  }

  // Wire click handlers
  suggestionsDiv.querySelectorAll(".tag-suggestion-item").forEach(item => {
    item.addEventListener("click", () => {
      const tag = item.dataset.tag;
      if (tag === "other") {
        addTagChip(String(input || "").trim());
      } else {
        addTagChip(tag);
      }
      const searchInput = document.getElementById("tagSearchInput");
      if (searchInput) searchInput.value = "";
      suggestionsDiv.innerHTML = "";
    });
  });
}

function addTagChip(tag) {
  const chipsDiv = document.getElementById("selectedTags");
  if (!chipsDiv) return;

  const normalized = normalizeTag(tag);
  if (!normalized) return;

  // Check if already added
  if (Array.from(chipsDiv.querySelectorAll(".tag-chip")).some(chip => normalizeTag(chip.textContent) === normalized)) {
    return;
  }

  const chip = document.createElement("div");
  chip.className = "tag-chip";
  chip.dataset.tag = tag;
  chip.innerHTML = `
    <span>${tag}</span>
    <button type="button" class="tag-chip-remove">×</button>
  `;

  chip.querySelector(".tag-chip-remove").addEventListener("click", () => {
    chip.remove();
  });

  chipsDiv.appendChild(chip);
}

function getSelectedTags() {
  const chipsDiv = document.getElementById("selectedTags");
  if (!chipsDiv) return [];
  return Array.from(chipsDiv.querySelectorAll(".tag-chip")).map(chip => chip.dataset.tag || "");
}

function renderCatalogList() {
  if (!dom.catalogList) return;
  const rows = [];
  eventCatalog.categories.forEach(category => {
    category.events.forEach(event => {
      event.subevents.forEach(subevent => {
        rows.push(`<li class="catalog-item"><div><strong>${category.name} > ${event.name} > ${subevent.name}</strong><div class="catalog-meta">${category.id} / ${event.id} / ${subevent.id}</div></div></li>`);
      });
    });
  });

  dom.catalogList.innerHTML = rows.length ? rows.join("") : '<li class="log-empty">No catalog entries loaded yet.</li>';
}

function renderPermissionGrid() {
  dom.permissionGrid.innerHTML = PERMISSION_DEFINITIONS.map(({ key, label }) => {
    const allowed = can(key);
    return `<div class="perm-row"><span>${label}</span><span class="perm-chip ${allowed ? "perm-yes" : "perm-no"}">${allowed ? "Allowed" : "Blocked"}</span></div>`;
  }).join("");
}

function renderHouseCards() {
  dom.housesContainer.innerHTML = "";
  houses.forEach(house => {
    const pending = Number(eventDraftChanges[house.id] || 0);
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
        <div class="pending-wrap" id="pending-wrap-${house.id}" ${pending === 0 ? 'hidden' : ''}>
          <span class="pending-label">Pending</span>
          <span class="pending-value ${pending > 0 ? "delta-pos" : "delta-neg"}" id="pending-${house.id}">${pending > 0 ? "+" : ""}${pending}</span>
        </div>
      </div>
      <div class="score-row">
        <label class="custom-field" for="custom-${house.id}">
          <span>Custom Amount</span>
          <input id="custom-${house.id}" type="number" min="1" inputmode="numeric" placeholder="Amount" data-action-control>
        </label>
        <div class="custom-actions">
          <button class="btn btn-primary btn-mini" type="button" data-role="custom-add" data-house="${house.id}" data-action-control>Add</button>
          <button class="btn btn-outline btn-mini" type="button" data-role="custom-subtract" data-house="${house.id}" data-action-control>Subtract</button>
        </div>
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
    `;

    const addContainer = card.querySelector(`#add-${house.id}`);
    const subContainer = card.querySelector(`#sub-${house.id}`);
    QUICK_DELTAS.forEach(delta => {
      addContainer.appendChild(createDeltaButton(delta));
      subContainer.appendChild(createDeltaButton(-delta));
    });

    card.addEventListener("click", event => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const deltaButton = target.closest("button[data-delta]");
      if (deltaButton) {
        const delta = Number(deltaButton.dataset.delta || "0");
        queueHouseDeltaInDraft(house.id, delta);
        return;
      }
      const customBtn = target.closest("button[data-role]");
      if (customBtn) {
        const role = String(customBtn.dataset.role || "");
        const direction = role === "custom-subtract" ? -1 : 1;
        void submitCustomDelta(house.id, direction);
      }
    });

    dom.housesContainer.appendChild(card);
  });
}

function renderSimplifiedReasonCombo() {
  const input = document.getElementById("reasonComboInput");
  const datalist = document.getElementById("reasonSuggestions");
  if (!input || !datalist) return;

  const recent = recentReasonsForRoute(8);
  const templates = REASON_TEMPLATE_BANK;
  const combined = [...new Set([...recent, ...templates])].slice(0, 12);

  datalist.innerHTML = combined.map(reason =>
    `<option value="${reason.replace(/"/g, '&quot;')}">`
  ).join("");
}

function renderSimplifiedCatalog() {
  const select = document.getElementById("classificationSelect");
  if (!select || !eventCatalog) return;

  const previous = String(select.value || "");
  select.innerHTML = '<option value="">Select event...</option>';

  eventCatalog.categories.forEach(category => {
    category.events.forEach(event => {
      event.subevents.forEach(subevent => {
        const option = document.createElement("option");
        option.value = `${category.id}|${event.id}|${subevent.id}`;
        option.textContent = `${category.name} • ${event.name} • ${subevent.name}`;
        select.appendChild(option);
      });
    });
  });

  if (previous && Array.from(select.options).some(option => option.value === previous)) {
    select.value = previous;
  }
}

function collectEventCandidates(queryText = "") {
  const query = String(queryText || "").trim().toLowerCase();
  const candidates = [];

  QUICK_EVENT_TAGS.forEach(tag => {
    candidates.push({ label: tag.toLowerCase(), source: "quick" });
  });

  allEventTags.forEach(tag => {
    const name = String(tag?.name || "").trim().toLowerCase();
    if (!name) return;
    candidates.push({ label: name, source: "firestore" });
  });

  eventCatalog?.categories?.forEach(category => {
    category.events.forEach(event => {
      const eventName = String(event.name || "").trim().toLowerCase();
      if (eventName) candidates.push({ label: eventName, source: "catalog" });
      event.subevents.forEach(subevent => {
        const subName = String(subevent.name || "").trim().toLowerCase();
        if (subName) candidates.push({ label: subName, source: "catalog" });
      });
    });
  });

  auditEntries.forEach(entry => {
    const eventName = String(entry?.context?.eventName || "").trim().toLowerCase();
    if (eventName) candidates.push({ label: eventName, source: "history" });
  });

  const seen = new Set();
  const deduped = candidates.filter(candidate => {
    const key = normalizeTag(candidate.label);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (!query) return deduped.slice(0, 18);

  return deduped
    .map(candidate => {
      const lower = candidate.label;
      const contains = lower.includes(query) ? 1 : 0;
      const starts = lower.startsWith(query) ? 1 : 0;
      const similarity = calculateTagSimilarity(query, lower);
      const score = (starts * 2) + contains + similarity;
      return { ...candidate, score };
    })
    .filter(candidate => candidate.score >= 0.45)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
}

function canonicalizeEventTag(rawValue) {
  const normalizedInput = String(rawValue || "").trim().toLowerCase();
  if (!normalizedInput) return "";
  const candidates = collectEventCandidates(normalizedInput);
  if (!candidates.length) return normalizedInput;

  const best = candidates
    .map(candidate => ({
      label: candidate.label,
      similarity: calculateTagSimilarity(normalizedInput, candidate.label),
      contains: candidate.label.includes(normalizedInput) || normalizedInput.includes(candidate.label)
    }))
    .sort((a, b) => b.similarity - a.similarity)[0];

  if (best && (best.similarity >= 0.62 || best.contains)) {
    return best.label.toLowerCase();
  }
  return normalizedInput;
}

function setSelectedEventTag(rawValue) {
  const canonical = canonicalizeEventTag(rawValue);
  selectedEventTag = canonical;

  if (dom.eventSelectedDisplay) {
    if (canonical) {
      dom.eventSelectedDisplay.hidden = false;
      dom.eventSelectedDisplay.innerHTML = `
        <span class="event-selected-label">event</span>
        <strong>${escapeHtml(canonical)}</strong>
        <button id="clearEventTagBtn" class="btn btn-ghost btn-mini" type="button">Clear</button>
      `;
      dom.eventSelectedDisplay.querySelector("#clearEventTagBtn")?.addEventListener("click", () => {
        setSelectedEventTag("");
      });
    } else {
      dom.eventSelectedDisplay.hidden = true;
      dom.eventSelectedDisplay.innerHTML = "";
    }
  }

  if (dom.reasonStep) dom.reasonStep.hidden = !canonical;
  if (dom.eventSearchInput && canonical) dom.eventSearchInput.value = canonical;
  if (dom.eventSuggestions) dom.eventSuggestions.innerHTML = "";

  if (canonical && dom.classificationSelect) {
    const options = Array.from(dom.classificationSelect.options).filter(option => option.value);
    const bestOption = options
      .map(option => ({
        value: option.value,
        text: String(option.textContent || "").toLowerCase(),
        score: calculateTagSimilarity(canonical, String(option.textContent || "").toLowerCase())
      }))
      .sort((a, b) => b.score - a.score)[0];
    if (bestOption && bestOption.score >= 0.35) {
      dom.classificationSelect.value = bestOption.value;
    }
  }

  if (!canonical) {
    activeContext = null;
    renderReasonTracker();
  }
  renderRecentReasonChips();
  renderSimplifiedReasonCombo();
  updateContextSummary();
  syncPermissionControlledUi();
}

function renderQuickEventTags() {
  if (!dom.quickEventTags) return;
  dom.quickEventTags.innerHTML = QUICK_EVENT_TAGS.map(tag => (
    `<button class="reason-pill-btn" type="button" data-event-quick="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`
  )).join("");

  dom.quickEventTags.querySelectorAll("button[data-event-quick]").forEach(button => {
    button.addEventListener("click", () => {
      const tag = String(button.dataset.eventQuick || "").trim();
      setSelectedEventTag(tag);
    });
  });
}

function renderEventSuggestions(inputText) {
  if (!dom.eventSuggestions) return;
  const input = String(inputText || "").trim().toLowerCase();
  if (!input) {
    dom.eventSuggestions.innerHTML = "";
    return;
  }

  const matches = collectEventCandidates(input);
  const hasExact = matches.some(match => normalizeTag(match.label) === normalizeTag(input));
  const suggestions = matches.map(match => (
    `<button class="tag-suggestion-item" type="button" data-event-suggestion="${escapeHtml(match.label)}">${escapeHtml(match.label)}</button>`
  ));

  if (!hasExact) {
    suggestions.push(`<button class="tag-suggestion-item" type="button" data-event-custom="${escapeHtml(input)}">+ use custom: ${escapeHtml(input)}</button>`);
  }

  dom.eventSuggestions.innerHTML = suggestions.join("");
  dom.eventSuggestions.querySelectorAll("button[data-event-suggestion]").forEach(button => {
    button.addEventListener("click", () => {
      const tag = String(button.dataset.eventSuggestion || "").trim();
      setSelectedEventTag(tag);
    });
  });

  dom.eventSuggestions.querySelectorAll("button[data-event-custom]").forEach(button => {
    button.addEventListener("click", () => {
      const tag = String(button.dataset.eventCustom || "").trim();
      setSelectedEventTag(tag);
    });
  });
}

function buildSimplifiedContext() {
  const reasonInput = document.getElementById("reasonComboInput");
  const classSelect = document.getElementById("classificationSelect");
  if (!reasonInput || !classSelect) return null;

  const reason = String(reasonInput.value || "").trim();
  const classification = String(classSelect.value || "").trim();
  if (!reason || !classification) return null;

  const [catId, evId, subId] = classification.split("|");
  const category = getCategoryById(catId);
  const event = getEventById(category, evId);
  const subevent = getSubeventById(event, subId);

  if (!category || !event || !subevent) return null;

  return {
    categoryId: category.id,
    categoryName: category.name,
    eventId: event.id,
    eventName: event.name,
    subeventId: subevent.id,
    subeventName: subevent.name,
    reason,
    pathLabel: `${category.name} > ${event.name} > ${subevent.name}`
  };
}

function attachSimplifiedFormListeners() {
  dom.eventSearchInput?.addEventListener("input", event => {
    const value = String(event.target.value || "").trim().toLowerCase();
    if (event.target && event.target.value !== value) {
      event.target.value = value;
    }
    if (value && normalizeTag(value) === normalizeTag(selectedEventTag)) {
      renderEventSuggestions("");
      return;
    }
    renderEventSuggestions(value);
    syncPermissionControlledUi();
  });

  dom.eventSearchInput?.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const raw = String(dom.eventSearchInput?.value || "").trim().toLowerCase();
    if (!raw) return;
    setSelectedEventTag(raw);
    syncPermissionControlledUi();
  });

  document.getElementById("reasonComboInput")?.addEventListener("input", () => {
    const reasonValue = String(document.getElementById("reasonComboInput")?.value || "").trim();
    if (dom.reasonInput) dom.reasonInput.value = reasonValue;
    renderSimplifiedReasonCombo();
    syncPermissionControlledUi();
  });

  document.getElementById("classificationSelect")?.addEventListener("change", () => {
    renderSimplifiedReasonCombo();
    syncPermissionControlledUi();
  });

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

function setPlaceHint() {
  dom.placeHint.textContent = PLACE_BADGES.map((badge, index) => `${badge} = +${PLACE_POINTS[index]}`).join("  ·  ");
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

    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "Select House";
    select.appendChild(blank);

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

  const empty = selects.filter(select => !select.value);
  const remaining = houses.map(house => house.id).filter(id => !selected.has(id));
  if (empty.length === 1 && remaining.length === 1) {
    empty[0].value = remaining[0];
  }
}

function updatePlacePreview() {
  applySmartPlaceSelection();
  const selected = PLACE_POINTS.map((points, index) => ({
    points,
    badge: PLACE_BADGES[index],
    house: document.getElementById(`place-${index + 1}`)?.value || ""
  })).filter(item => item.house);

  if (!selected.length) {
    dom.placePreview.innerHTML = "";
    return;
  }

  const chips = selected.map(item => {
    const house = houses.find(candidate => candidate.id === item.house);
    return `<span class="preview-chip" style="background:${house?.bg};color:${house?.text}">${item.badge} ${house?.name} <strong>+${item.points}</strong></span>`;
  }).join("");

  dom.placePreview.innerHTML = `<span class="preview-label">Will apply:</span>${chips}`;
}

function openHelpDialog() {
  if (!dom.helpDialog) return;
  closeAccountDialog();
  closeAdminDialog();
  closeWorkspaceDialog();
  lastHelpFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  document.body.classList.add("overlay-open");
  dom.helpDialog.hidden = false;
  dom.helpBtn?.setAttribute("aria-expanded", "true");
  const helpCard = dom.helpDialog.querySelector(".help-modal-card");
  if (helpCard instanceof HTMLElement) helpCard.focus();
}

function closeHelpDialog(options = {}) {
  if (!dom.helpDialog) return;
  const { restoreFocus = true } = options;
  dom.helpDialog.hidden = true;
  dom.helpBtn?.setAttribute("aria-expanded", "false");
  clearOverlayClassIfNoDialogs();
  if (restoreFocus) {
    if (lastHelpFocus && typeof lastHelpFocus.focus === "function") {
      lastHelpFocus.focus();
    } else if (dom.helpBtn) {
      dom.helpBtn.focus();
    }
  }
  lastHelpFocus = null;
}

function openAccountDialog() {
  closeHelpDialog({ restoreFocus: false });
  closeWorkspaceDialog();
  closeAdminDialog();
  document.body.classList.add("overlay-open");
  dom.accountDialog.hidden = false;
}

function closeAccountDialog() {
  dom.accountDialog.hidden = true;
  clearOverlayClassIfNoDialogs();
}

function openAdminDialog() {
  if (!can("manageUsers") && !can("manageCatalog") && !can("approveProposals") && currentRole !== "superadmin") {
    showToast("Your role cannot open admin tools.", "warn");
    return;
  }
  closeHelpDialog({ restoreFocus: false });
  closeWorkspaceDialog();
  closeAccountDialog();
  document.body.classList.add("overlay-open");
  dom.adminDialog.hidden = false;
  void refreshUserList();
  void refreshContactInbox();
  void refreshBackupList();
}

function closeAdminDialog() {
  dom.adminDialog.hidden = true;
  clearOverlayClassIfNoDialogs();
}

function closeAllDialogs() {
  closeHelpDialog({ restoreFocus: false });
  closeAccountDialog();
  closeAdminDialog();
  closeWorkspaceDialog();
}

function clearOverlayClassIfNoDialogs() {
  const helpOpen = dom.helpDialog ? !dom.helpDialog.hidden : false;
  const accountOpen = dom.accountDialog ? !dom.accountDialog.hidden : false;
  const adminOpen = dom.adminDialog ? !dom.adminDialog.hidden : false;
  const workspaceOpen = dom.workspaceDialog ? !dom.workspaceDialog.hidden : false;
  if (helpOpen || accountOpen || adminOpen || workspaceOpen) return;
  document.body.classList.remove("overlay-open");
}

function updateRanks(scores) {
  const ranked = [...houses].sort((a, b) => scoreNumber(scores, b.id) - scoreNumber(scores, a.id));
  ranked.forEach((house, index) => {
    const rankEl = document.getElementById(`rank-${house.id}`);
    if (rankEl) rankEl.textContent = `#${index + 1}`;
  });
}

function applyScoresToUi(scores) {
  currentScores = scores;
  houses.forEach(house => {
    const el = document.getElementById(`pts-${house.id}`);
    if (el) el.textContent = String(scores[house.id]);
  });
  updateRanks(scores);
}

function actionKey(action = {}) {
  return `${action.type || ""}:${action.summary || ""}:${action.actorEmail || ""}:${action.createdAtMs || 0}`;
}

function applySessionIdentity({ email, uid, role }) {
  currentUserEmail = email;
  currentUserUid = uid;
  authenticatedRole = normalizeRole(role);
  demoRolePreview = "";
  applyEffectiveRoleState();
  dom.profileInitials.textContent = initialsFromEmail(email);
  dom.resetEmailInput.value = email;
  const identity = document.getElementById("emailContactIdentity");
  if (identity) identity.textContent = getCurrentUserDisplayName();
  renderPermissionGrid();
  renderHouseCards();
  syncPermissionControlledUi();
  setStudentLookupStatus(can("studentLookup") ? "Type to search the secure student directory." : "Student lookup is blocked for this account.");
  clearStudentLookupResults(true);
  setPasswordResetStatus(can("passwordReset") ? "Send reset links to help staff regain access." : "Password reset is blocked for this account.", can("passwordReset") ? "neutral" : "warn");
}

function resetSignedOutUi() {
  currentUserEmail = "";
  currentUserUid = "";
  authenticatedRole = "";
  demoRolePreview = "";
  currentRole = "";
  currentPermissions = { ...ROLE_DEFAULTS.staff };
  applyRoleClass("");
  dom.loggedInAs.textContent = "-";
  dom.profileInitials.textContent = "--";
  dom.resetEmailInput.value = "";
  const identity = document.getElementById("emailContactIdentity");
  if (identity) identity.textContent = getCurrentUserDisplayName();
  updateDemoRoleUi();
  dom.studentLookupInput.value = "";
  setStudentLookupStatus("Type to search the secure student directory.");
  clearStudentLookupResults();
  setSheetSyncStatus("No sync request yet.");
  setBackupStatus("Backups are only visible to superadmins.");
  backupEntries = [];
  renderBackupList();
  activeWorkspace = "scoring";
  renderWorkspace();
  activeContext = null;
  resetEventDraft();
  selectedEventTag = "";
  if (dom.eventSearchInput) dom.eventSearchInput.value = "";
  if (dom.reasonStep) dom.reasonStep.hidden = true;
  if (dom.reasonInput) dom.reasonInput.value = "";
  if (document.getElementById("reasonComboInput")) document.getElementById("reasonComboInput").value = "";
  if (dom.eventSuggestions) dom.eventSuggestions.innerHTML = "";
  if (dom.eventSelectedDisplay) {
    dom.eventSelectedDisplay.hidden = true;
    dom.eventSelectedDisplay.innerHTML = "";
  }
  updateContextSummary();
  renderPermissionGrid();
  syncPermissionControlledUi();
  closeAllDialogs();
}

function syncPermissionControlledUi() {
  const hasContext = Boolean(activeContext);
  const hasReadyContext = Boolean(activeContext || buildContextFromInputs());
  const canDirectScore = can("scoreEdit");
  const canSuggest = can("proposePoints");
  const canContextSetup = canDirectScore || canSuggest;
  const canScoreLikeAction = hasReadyContext && (canDirectScore || canSuggest);
  const canUsePlace = hasReadyContext && (can("placeAwards") || canSuggest);

  dom.housesContainer?.querySelectorAll("button[data-delta],button[data-role],input[id^='custom-']").forEach(el => {
    el.disabled = !canScoreLikeAction;
  });

  getPlaceSelects().forEach(select => {
    select.disabled = !canUsePlace;
  });

  if (dom.autoFillBtn) dom.autoFillBtn.disabled = !canUsePlace;
  if (dom.clearPlacesBtn) dom.clearPlacesBtn.disabled = !canUsePlace;
  if (dom.applyPlacesBtn) dom.applyPlacesBtn.disabled = !canUsePlace;

  if (dom.checkpointName) dom.checkpointName.disabled = !can("checkpoint");
  if (dom.checkpointBtn) dom.checkpointBtn.disabled = !can("checkpoint");
  if (dom.resetBtn) dom.resetBtn.disabled = !can("resetAll");

  // legacy controls removed from new model
  if (dom.undoBtn) {
    dom.undoBtn.disabled = true;
    dom.undoBtn.style.display = "none";
  }
  if (dom.redoBtn) {
    dom.redoBtn.disabled = true;
    dom.redoBtn.style.display = "none";
  }

  if (dom.reasonCommitBtn) dom.reasonCommitBtn.disabled = !canContextSetup;
  if (dom.reasonClearBtn) dom.reasonClearBtn.disabled = !hasContext;
  if (dom.applyEventDraftBtn) dom.applyEventDraftBtn.disabled = !hasContext || !hasEventDraftChanges();
  if (dom.endEventBtn) dom.endEventBtn.disabled = !hasContext;
  if (dom.requestPathBtn) dom.requestPathBtn.disabled = !(can("proposePoints") || can("manageCatalog"));
  if (dom.reasonTemplateSelect) dom.reasonTemplateSelect.disabled = !canContextSetup;
  if (dom.reasonDetailInput) dom.reasonDetailInput.disabled = !canContextSetup;
  if (dom.useReasonTemplateBtn) dom.useReasonTemplateBtn.disabled = !canContextSetup;
  if (dom.usedReasonSelect) dom.usedReasonSelect.disabled = !canContextSetup;
  if (dom.customReasonInput) dom.customReasonInput.disabled = !canContextSetup;
  if (dom.applyUsedReasonBtn) dom.applyUsedReasonBtn.disabled = !canContextSetup;
  if (dom.eventModeSelect) dom.eventModeSelect.disabled = !canContextSetup;
  if (dom.seasonInput) dom.seasonInput.disabled = !canContextSetup;
  if (dom.sessionInput) dom.sessionInput.disabled = (dom.eventModeSelect?.value !== "session") || !canContextSetup;

  if (dom.resetEmailInput) dom.resetEmailInput.disabled = !can("passwordReset") || TEST_MODE;
  if (dom.resetPasswordBtn) dom.resetPasswordBtn.disabled = !can("passwordReset") || TEST_MODE;
  if (dom.studentLookupInput) dom.studentLookupInput.disabled = !can("studentLookup") || TEST_MODE;
  if (dom.studentLookupPanel) dom.studentLookupPanel.hidden = !can("studentLookup");

  if (dom.adminBtn) dom.adminBtn.disabled = !(can("manageUsers") || can("manageCatalog") || can("approveProposals") || currentRole === "superadmin") || TEST_MODE;
  if (dom.createUserBtn) dom.createUserBtn.disabled = !can("manageUsers") || TEST_MODE;
  if (dom.refreshUsersBtn) dom.refreshUsersBtn.disabled = !can("manageUsers") || TEST_MODE;
  if (dom.userSearch) dom.userSearch.disabled = !can("manageUsers") || TEST_MODE;
  if (dom.catalogAddPathBtn) dom.catalogAddPathBtn.disabled = !can("manageCatalog") || TEST_MODE;
  if (dom.syncPointsBtn) dom.syncPointsBtn.disabled = !can("approveProposals") || TEST_MODE;
  if (dom.refreshContactBtn) dom.refreshContactBtn.disabled = !["admin", "superadmin"].includes(currentRole) || TEST_MODE;
  if (dom.createBackupBtn) dom.createBackupBtn.disabled = currentRole !== "superadmin" || TEST_MODE;
  if (dom.refreshBackupsBtn) dom.refreshBackupsBtn.disabled = currentRole !== "superadmin" || TEST_MODE;
  if (dom.backupLabelInput) dom.backupLabelInput.disabled = currentRole !== "superadmin" || TEST_MODE;
  if (dom.sheetSyncPanel) dom.sheetSyncPanel.hidden = !can("approveProposals");
  if (dom.backupManagerPanel) dom.backupManagerPanel.hidden = currentRole !== "superadmin";
  if (dom.dangerZonePanel) dom.dangerZonePanel.hidden = currentRole !== "superadmin";
  if (dom.demoRoleCard) dom.demoRoleCard.hidden = authenticatedRole !== "superadmin" || TEST_MODE;
  if (dom.demoRoleSelect) dom.demoRoleSelect.disabled = authenticatedRole !== "superadmin" || TEST_MODE;
  if (dom.applyDemoRoleBtn) dom.applyDemoRoleBtn.disabled = authenticatedRole !== "superadmin" || TEST_MODE;
  if (dom.clearDemoRoleBtn) dom.clearDemoRoleBtn.disabled = authenticatedRole !== "superadmin" || TEST_MODE || !isDemoRoleActive();

  const historyAllowed = can("historyAccess");
  [dom.historySearch, dom.historyPreset, dom.historyStart, dom.historyEnd, dom.historySort, dom.historyType, dom.historyLimit, dom.jumpTime, dom.jumpBtn].forEach(control => {
    if (control) control.disabled = !historyAllowed;
  });

  if (dom.backupBtn) dom.backupBtn.disabled = !can("downloadBackup");

  if (dom.userAdminPanel) dom.userAdminPanel.hidden = !(can("manageUsers") && !TEST_MODE);
  if (dom.proposalPanel) dom.proposalPanel.hidden = !(can("approveProposals") || can("proposePoints"));

  const tabs = dom.workspaceNav?.querySelectorAll("[data-workspace-tab]") || [];
  tabs.forEach(tab => {
    const key = String(tab.dataset.workspaceTab || "");
    if (key === "history") tab.disabled = !can("historyAccess");
    if (key === "queue") tab.disabled = !(can("approveProposals") || can("proposePoints"));
    if (key === "activity") tab.disabled = false;
    if (key === "support") tab.disabled = !["admin", "superadmin"].includes(currentRole);
    if (key === "scoring") tab.disabled = false;
  });

  if (activeWorkspace === "history" && !can("historyAccess")) activeWorkspace = "scoring";
  if (activeWorkspace === "queue" && !(can("approveProposals") || can("proposePoints"))) activeWorkspace = "scoring";
  if (activeWorkspace === "support" && !["admin", "superadmin"].includes(currentRole)) activeWorkspace = "scoring";
  renderWorkspace();
}

function renderQuickStats() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayStartMs = todayStart.getTime();

  // Calculate today's points
  const appliedEntries = auditEntries.filter(entry => String(entry.status || "applied") === "applied");
  const todayTotalPoints = appliedEntries
    .filter(entry => Number(entry.createdAtMs || 0) >= todayStartMs)
    .reduce((sum, entry) => sum + changeMagnitude(entry.changes || {}), 0);

  // Find current leader
  let leaderName = "--";
  let leaderPoints = -1;
  for (const [house, points] of Object.entries(currentScores)) {
    if (points > leaderPoints) {
      leaderPoints = points;
      leaderName = house.charAt(0).toUpperCase() + house.slice(1);
    }
  }

  // Calculate week trend
  const weekCutoff = now.getTime() - (7 * 24 * 60 * 60 * 1000);
  const weekPoints = appliedEntries
    .filter(entry => Number(entry.createdAtMs || 0) >= weekCutoff)
    .reduce((sum, entry) => sum + changeMagnitude(entry.changes || {}), 0);

  const lastWeekCutoff = weekCutoff - (7 * 24 * 60 * 60 * 1000);
  const lastWeekPoints = appliedEntries
    .filter(entry => Number(entry.createdAtMs || 0) >= lastWeekCutoff && Number(entry.createdAtMs || 0) < weekCutoff)
    .reduce((sum, entry) => sum + changeMagnitude(entry.changes || {}), 0);

  let trend = "→";
  if (weekPoints > lastWeekPoints) {
    trend = "↑";
  } else if (weekPoints < lastWeekPoints) {
    trend = "↓";
  }

  // Count active houses (with any points)
  const activeHouses = Object.values(currentScores).filter(pts => pts > 0).length;

  // Update DOM
  const todayEl = document.getElementById("todayPointsCount");
  if (todayEl) todayEl.innerHTML = String(todayTotalPoints);

  const leaderEl = document.getElementById("currentLeaderName");
  if (leaderEl) leaderEl.innerHTML = leaderName;

  const trendEl = document.getElementById("weekTrendIndicator");
  if (trendEl) trendEl.innerHTML = trend;

  const activeEl = document.getElementById("activeHousesCount");
  if (activeEl) activeEl.innerHTML = String(activeHouses);
}

function renderHistoryStats() {
  const applied = auditEntries.filter(entry => String(entry.status || "applied") === "applied");
  const pending = pendingProposals.filter(proposal => proposal.status === "pending");
  const thisWeekCutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const weekPoints = applied
    .filter(entry => Number(entry.createdAtMs || 0) >= thisWeekCutoff)
    .reduce((sum, entry) => sum + changeMagnitude(entry.changes || {}), 0);

  const routeKeys = new Set(applied
    .map(entry => entry?.context)
    .filter(Boolean)
    .map(context => `${context.categoryId}|${context.eventId}|${context.subeventId}`));

  dom.historyStats.innerHTML = `
    <article class="history-stat-card"><span>Applied Entries</span><strong>${applied.length}</strong></article>
    <article class="history-stat-card"><span>Pending Suggestions</span><strong>${pending.length}</strong></article>
    <article class="history-stat-card"><span>Points This Week</span><strong>${weekPoints}</strong></article>
    <article class="history-stat-card"><span>Active Paths</span><strong>${routeKeys.size}</strong></article>
  `;
}

function resolveDateRange() {
  const now = new Date();
  let startMs = Number.NEGATIVE_INFINITY;
  let endMs = Number.POSITIVE_INFINITY;

  if (dom.historyPreset.value === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    startMs = start.getTime();
  } else if (dom.historyPreset.value === "week") {
    startMs = now.getTime() - (7 * 24 * 60 * 60 * 1000);
  } else if (dom.historyPreset.value === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    startMs = start.getTime();
  }

  const manualStart = Date.parse(String(dom.historyStart.value || ""));
  const manualEnd = Date.parse(String(dom.historyEnd.value || ""));
  if (Number.isFinite(manualStart)) startMs = manualStart;
  if (Number.isFinite(manualEnd)) endMs = manualEnd;

  return { startMs, endMs };
}

function buildVirtualPendingEntries() {
  return pendingProposals
    .filter(proposal => proposal.status === "pending")
    .map(proposal => ({
      id: `pending_${proposal.id}`,
      type: proposal.actionType === "path_request" ? "path_request_submitted" : "proposal_submitted",
      status: "proposal",
      createdAtMs: Number(proposal.createdAtMs || 0),
      actorEmail: proposal.createdByEmail || "",
      summary: proposal.actionType === "path_request"
        ? `Path request: ${proposal.pathRequest?.categoryName || ""} > ${proposal.pathRequest?.eventName || ""} > ${proposal.pathRequest?.subeventName || ""}`
        : `Suggestion: ${proposal.reason || "Point suggestion"}`,
      context: proposal.context || null,
      changes: proposal.changes || {},
      proposalId: proposal.id,
      notes: proposal.notes || ""
    }));
}

function historyContextLabel(entry) {
  const context = entry?.context || null;
  if (!context) return "General / Uncategorized";
  const pathLabel = String(context.pathLabel || "").trim();
  if (pathLabel) return pathLabel;
  const categoryName = String(context.categoryName || "").trim();
  const eventName = String(context.eventName || "").trim();
  const subeventName = String(context.subeventName || "").trim();
  const parts = [categoryName, eventName, subeventName].filter(Boolean);
  return parts.length ? parts.join(" > ") : "General / Uncategorized";
}

function buildDeltaChips(changes = {}) {
  const houseIds = ["red", "white", "blue", "silver"];
  return houseIds.map(houseId => {
    const value = Number(changes?.[houseId] || 0);
    const polarity = value > 0 ? "delta-pos" : value < 0 ? "delta-neg" : "";
    const shorthand = houseId === "red" ? "R" : houseId === "white" ? "W" : houseId === "blue" ? "B" : "S";
    const signed = `${value > 0 ? "+" : ""}${value}`;
    return `<span class="history-delta-chip ${polarity}">${shorthand} ${signed}</span>`;
  }).join("");
}

function renderHistoryList() {
  renderHistoryStats();

  const search = String(dom.historySearch.value || "").trim().toLowerCase();
  const requestedType = String(dom.historyType.value || "all");
  const sortMode = String(dom.historySort.value || "newest");
  const limitCount = Number.parseInt(dom.historyLimit.value || "12", 10) || 12;
  const { startMs, endMs } = resolveDateRange();

  const combined = [...auditEntries, ...buildVirtualPendingEntries()];

  let entries = combined.filter(entry => {
    const stamp = Number(entry.createdAtMs || 0);
    if (stamp < startMs || stamp > endMs) return false;
    if (requestedType !== "all") {
      if (requestedType === "applied" && String(entry.status || "applied") !== "applied") return false;
      if (requestedType === "proposal" && String(entry.status || "") !== "proposal") return false;
      if (!["applied", "proposal"].includes(requestedType) && entry.type !== requestedType) return false;
    }

    if (!search) return true;
    const haystack = `${entry.summary || ""} ${entry.actorEmail || ""} ${(entry.context?.pathLabel || "")}`.toLowerCase();
    return haystack.includes(search);
  });

  if (sortMode === "oldest") {
    entries.sort((a, b) => Number(a.createdAtMs || 0) - Number(b.createdAtMs || 0));
  } else if (sortMode === "largest") {
    entries.sort((a, b) => changeMagnitude(b.changes || {}) - changeMagnitude(a.changes || {}));
  } else {
    entries.sort((a, b) => Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0));
  }

  entries = entries.slice(0, limitCount);

  if (!entries.length) {
    dom.historyList.innerHTML = '<li class="log-empty">No activity entries match current filters.</li>';
    return;
  }

  const grouped = new Map();
  entries.forEach(entry => {
    const label = historyContextLabel(entry);
    const key = label.toLowerCase();
    if (!grouped.has(key)) {
      grouped.set(key, {
        label,
        latestMs: 0,
        net: { red: 0, white: 0, blue: 0, silver: 0 },
        entries: []
      });
    }
    const group = grouped.get(key);
    group.entries.push(entry);
    group.latestMs = Math.max(group.latestMs, Number(entry.createdAtMs || 0));
    group.net.red += Number(entry.changes?.red || 0);
    group.net.white += Number(entry.changes?.white || 0);
    group.net.blue += Number(entry.changes?.blue || 0);
    group.net.silver += Number(entry.changes?.silver || 0);
  });

  const sortedGroups = Array.from(grouped.values()).sort((a, b) => b.latestMs - a.latestMs);
  dom.historyList.innerHTML = sortedGroups.map(group => {
    const groupEntries = group.entries.sort((a, b) => Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0));
    return `
      <li class="history-group">
        <div class="history-group-head">
          <div>
            <div class="history-group-title">${escapeHtml(group.label)}</div>
            <div class="history-meta">${groupEntries.length} entr${groupEntries.length === 1 ? "y" : "ies"} · latest ${new Date(group.latestMs || Date.now()).toLocaleString()}</div>
          </div>
          <div class="history-delta-strip">${buildDeltaChips(group.net)}</div>
        </div>
        <ul class="history-group-list">
          ${groupEntries.map(entry => {
            const highlightClass = highlightEntryId && highlightEntryId === entry.id ? " history-subitem" : "";
            const reasonLine = entry.reason ? `<div class="history-meta"><strong>Reason:</strong> ${escapeHtml(String(entry.reason || ""))}</div>` : "";
            const notesLine = entry.notes ? `<div class="history-meta"><strong>Notes:</strong> ${escapeHtml(String(entry.notes || ""))}</div>` : "";
            return `
              <li class="history-item${highlightClass}">
                <div>
                  <div class="history-row-top">
                    <span class="history-type">${escapeHtml(mapActionTypeLabel(entry.type))}</span>
                    <span>${escapeHtml(String(entry.summary || "Untitled action"))}</span>
                  </div>
                  <div class="history-meta">${new Date(Number(entry.createdAtMs || Date.now())).toLocaleString()} · ${escapeHtml(String(entry.actorEmail || "unknown"))}</div>
                  <div class="history-delta-strip">${buildDeltaChips(entry.changes || {})}</div>
                  ${reasonLine}
                  ${notesLine}
                </div>
                <div class="history-item-actions">
                  ${entry.type === "savepoint" && can("restoreHistory") ? `<button class="btn btn-outline btn-mini" type="button" data-restore-savepoint="${entry.id}">Restore</button>` : ""}
                </div>
              </li>
            `;
          }).join("")}
        </ul>
      </li>
    `;
  }).join("");

  highlightEntryId = "";
}

function renderActivityList() {
  const entries = [...auditEntries]
    .sort((a, b) => Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0))
    .slice(0, MAX_ACTIVITY_PREVIEW);

  if (!entries.length) {
    dom.activityList.innerHTML = '<li class="log-empty">No activity yet this session</li>';
    return;
  }

  dom.activityList.innerHTML = entries.map(entry => {
    const when = new Date(Number(entry.createdAtMs || Date.now()));
    const summary = escapeHtml(String(entry.summary || mapActionTypeLabel(entry.type)));
    const actor = escapeHtml(String(entry.actorEmail || "unknown"));
    return `<li class="log-entry"><span class="log-time">${formatClock(when)}</span><span>${summary} (${actor})</span></li>`;
  }).join("");
}

function renderProposalList() {
  renderProposalListEnhanced();
}

function renderUserList() {
  if (!dom.userList) return;
  const queryText = String(dom.userSearch.value || "").trim().toLowerCase();

  // Deduplicate by email (unique identifier)
  const seen = new Set();
  const deduped = [];
  userProfiles.forEach(profile => {
    const key = profile.email || profile.uid;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(profile);
    }
  });

  const filtered = deduped.filter(profile => {
    if (!queryText) return true;
    const haystack = `${profile.name || ""} ${profile.email || ""} ${profile.role || ""}`.toLowerCase();
    return haystack.includes(queryText);
  });

  if (!filtered.length) {
    dom.userList.innerHTML = '<li class="log-empty">No users found.</li>';
    return;
  }

  dom.userList.innerHTML = filtered.map(profile => {
    const editId = String(profile.uid || profile.id || "");
    return `
      <li class="user-item">
        <div>
          <strong>${profile.name || "(No Name)"}</strong>
          <div class="user-meta">${profile.email || profile.uid || profile.id} · role=${normalizeRole(profile.role)}</div>
        </div>
        <div class="user-actions">
          <button class="btn btn-outline btn-mini" type="button" data-user-edit="${escapeHtml(editId)}">Edit</button>
        </div>
      </li>
    `;
  }).join("");
}

function renderBackupList() {
  if (!dom.backupList) return;
  if (!backupEntries.length) {
    dom.backupList.innerHTML = '<li class="log-empty">No backups loaded yet.</li>';
    return;
  }

  dom.backupList.innerHTML = backupEntries.map(item => {
    const createdAt = Number(item.createdAtMs || 0);
    const createdLabel = createdAt ? new Date(createdAt).toLocaleString() : "Unknown time";
    const counts = item.counts || {};
    return `
      <li class="backup-item">
        <div>
          <strong>${item.label || "Untitled Backup"}</strong>
          <div class="backup-meta">${createdLabel} · by ${item.createdByEmail || "unknown"}</div>
          <div class="backup-meta">userProfiles:${Number(counts.userProfiles || 0)} · students:${Number(counts.studentDirectory || 0)} · proposals:${Number(counts.pendingProposals || 0)}</div>
        </div>
        <div class="backup-actions">
          <button class="btn btn-outline btn-mini" type="button" data-backup-rename="${item.id}">Rename</button>
          <button class="btn btn-primary btn-mini" type="button" data-backup-restore="${item.id}">Restore</button>
          <button class="btn btn-danger btn-mini" type="button" data-backup-delete="${item.id}">Delete</button>
        </div>
      </li>
    `;
  }).join("");
}

function renderStudentLookupResults() {
  const queryText = normalizeLookupToken(dom.studentLookupInput.value);
  if (!queryText) {
    dom.studentLookupResults.innerHTML = '<li class="log-empty">No results yet.</li>';
    return;
  }

  if (!studentLookupResults.length) {
    dom.studentLookupResults.innerHTML = '<li class="log-empty">No students matched this search.</li>';
    return;
  }

  dom.studentLookupResults.innerHTML = studentLookupResults.map(row => {
    const house = houseById(row.houseId);
    const houseName = row.houseName || house?.name || "House not set";
    const houseColor = house?.bg || "#d7dbe6";
    const houseText = house?.text || "#1c2941";
    const studentId = row.studentId ? `ID ${row.studentId}` : "ID unavailable";
    const grade = row.grade ? `Grade ${row.grade}` : "Grade n/a";
    const name = row.name || "Unnamed student";
    return `
      <li class="student-item">
        <div>
          <strong>${name}</strong>
          <div class="student-meta">${studentId} · ${grade}</div>
        </div>
        <span class="house-chip" style="background:${houseColor};color:${houseText}">${houseName}</span>
      </li>
    `;
  }).join("");
}

function refreshAllUi() {
  renderQuickStats();
  renderHistoryStats();
  renderHistoryList();
  renderActivityList();
  renderProposalListEnhanced();
  renderAnalyticsDashboard();
  updateApprovalBadge();
  renderReasonTracker();
  renderUsedReasonSelect();
  renderRecentReasonChips();
  syncPermissionControlledUi();
}

function renderSheetSyncStatus(syncData = null) {
  if (!syncData || typeof syncData !== "object") {
    setSheetSyncStatus("No sync request yet.");
    return;
  }

  const lastRunMs = Number(syncData.lastRunAtMs || 0);
  const importCount = Number(syncData.lastImportedRows || 0);
  const exportCount = Number(syncData.lastExportedRows || 0);
  const requestStatus = String(syncData.request?.status || "").trim();

  const parts = [];
  if (lastRunMs > 0) parts.push(`Last run ${new Date(lastRunMs).toLocaleString()}`);
  if (importCount > 0 || exportCount > 0) parts.push(`Imported ${importCount} · Exported ${exportCount}`);
  if (requestStatus) parts.push(`Request ${requestStatus}`);
  setSheetSyncStatus(parts.length ? parts.join(" • ") : "No sync request yet.");
}

function updateFromScoresDoc(data = {}) {
  currentScores = scoresFromDoc(data);
  eventCatalog = normalizeEventCatalog(data.eventCatalog || DEFAULT_EVENT_CATALOG);
  applyScoresToUi(currentScores);
  renderCatalogSelects();
  renderCatalogList();

  const key = actionKey(data.lastAction || {});
  if (key && key !== lastActionKey) {
    lastActionKey = key;
    showToast(data.lastAction?.summary || "Scores updated", "info");
  }

  renderSheetSyncStatus(data.sheetSync || null);
  setSyncStatus(`Live • Updated ${formatClock()}`, "live");
}

function localReadState() {
  try {
    const raw = localStorage.getItem(TEST_STORAGE_KEY);
    if (!raw) return defaultLocalState();
    const parsed = JSON.parse(raw);
    return {
      ...defaultLocalState(),
      ...parsed,
      scores: scoresFromDoc(parsed?.scores || {}),
      eventCatalog: normalizeEventCatalog(parsed?.eventCatalog || DEFAULT_EVENT_CATALOG),
      auditLog: Array.isArray(parsed?.auditLog) ? parsed.auditLog : [],
      pendingProposals: Array.isArray(parsed?.pendingProposals) ? parsed.pendingProposals : []
    };
  } catch {
    return defaultLocalState();
  }
}

function localWriteState(next) {
  localState = {
    ...defaultLocalState(),
    ...next,
    scores: scoresFromDoc(next?.scores || {}),
    eventCatalog: normalizeEventCatalog(next?.eventCatalog || DEFAULT_EVENT_CATALOG),
    auditLog: Array.isArray(next?.auditLog) ? next.auditLog : [],
    pendingProposals: Array.isArray(next?.pendingProposals) ? next.pendingProposals : []
  };
  localStorage.setItem(TEST_STORAGE_KEY, JSON.stringify(localState));
}

async function withWrite(task) {
  updateBusyState(1);
  try {
    const result = await task();
    setSyncStatus(`${TEST_MODE ? "Local test mode" : "Live"} • Last saved ${formatClock()}`, TEST_MODE ? "local" : "live");
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

function activeContextOrWarn() {
  if (activeContext) return activeContext;

  const autoContext = buildContextFromInputs();
  if (autoContext) {
    activeContext = autoContext;
    updateContextSummary();
    renderReasonTracker();
    syncPermissionControlledUi();
    showToast("Context started from selected reason and event.", "info");
    return activeContext;
  }

  showToast("Select an event tag and reason, then click Start Context.", "warn");
  return null;
}

function currentCommitLabel() {
  return String(dom.commitLabel.value || "").trim().slice(0, 40);
}

function summaryWithLabel(summary) {
  const label = currentCommitLabel();
  return label ? `${summary} · {${label}}` : summary;
}

function buildAppliedAuditEntry({ type, summary, changes = null, context = null, reason = "", notes = "", eventTag = "", beforeScores = null, afterScores = null, extra = {} }) {
  return {
    type,
    status: "applied",
    summary,
    changes: changes || { red: 0, white: 0, blue: 0, silver: 0 },
    context,
    reason,
    notes,
    eventTag: eventTag || "",  // Optional event tag for organization
    eventTagNormalized: normalizeTag(eventTag),  // Normalized for matching
    actorEmail: currentUserEmail,
    actorUid: currentUserUid,
    createdAtMs: Date.now(),
    createdAt: createActionTimestamp(),
    beforeScores,
    afterScores,
    ...extra
  };
}

async function appendAuditLog(entry) {
  if (TEST_MODE) {
    const id = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    localState.auditLog.unshift({ ...entry, id, createdAtMs: Date.now() });
    localState.auditLog = localState.auditLog.slice(0, MAX_ACTIVITY_ENTRIES);
    localWriteState(localState);
    auditEntries = localState.auditLog;
    refreshAllUi();
    return id;
  }

  const auditRef = doc(collection(scoresDoc, "auditLog"));
  await setDoc(auditRef, entry);
  return auditRef.id;
}

async function applyDirectScoreAction({ type, summary, changes, context, reason, notes, extra = {} }) {
  const labeledSummary = summaryWithLabel(summary);

  if (TEST_MODE) {
    const before = { ...localState.scores };
    const after = applyChanges(before, changes);
    localState.scores = after;
    localState.lastAction = {
      type,
      summary: labeledSummary,
      actorEmail: currentUserEmail,
      timestamp: createActionTimestamp(),
      createdAtMs: Date.now()
    };

    await appendAuditLog(buildAppliedAuditEntry({
      type,
      summary: labeledSummary,
      changes,
      context,
      reason,
      notes,
      beforeScores: before,
      afterScores: after,
      extra
    }));

    localWriteState(localState);
    updateFromScoresDoc({ ...localState.scores, eventCatalog: localState.eventCatalog, lastAction: localState.lastAction });
    return { applied: true };
  }

  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(scoresDoc);
    const data = snapshot.exists() ? snapshot.data() : {};
    const before = scoresFromDoc(data);
    const after = applyChanges(before, changes);
    const auditRef = doc(collection(scoresDoc, "auditLog"));

    transaction.set(scoresDoc, {
      ...after,
      lastAction: {
        type,
        summary: labeledSummary,
        actorEmail: currentUserEmail,
        actorUid: currentUserUid,
        timestamp: serverTimestamp(),
        createdAtMs: Date.now(),
        context,
        changes
      }
    }, { merge: true });

    transaction.set(auditRef, buildAppliedAuditEntry({
      type,
      summary: labeledSummary,
      changes,
      context,
      reason,
      notes,
      beforeScores: before,
      afterScores: after,
      extra
    }));

    return { applied: true };
  });
}

async function submitProposal({ actionType, summary, changes = null, context = null, reason = "", notes = "", eventTag = "", pathRequest = null }) {
  const proposal = {
    actionType,
    status: "pending",
    summary: summaryWithLabel(summary),
    changes: changes || { red: 0, white: 0, blue: 0, silver: 0 },
    context,
    reason,
    notes,
    eventTag: eventTag || "",
    pathRequest,
    createdByUid: currentUserUid,
    createdByEmail: currentUserEmail,
    createdAtMs: Date.now(),
    createdAt: createActionTimestamp(),
    reviewedByUid: null,
    reviewedByEmail: null,
    reviewedAtMs: null,
    reviewedAt: null
  };

  if (TEST_MODE) {
    const id = `proposal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    localState.pendingProposals.unshift({ ...proposal, id });
    localState.pendingProposals = localState.pendingProposals.slice(0, 200);
    localWriteState(localState);
    pendingProposals = localState.pendingProposals;
    await appendAuditLog({
      type: actionType === "path_request" ? "path_request_submitted" : "proposal_submitted",
      status: "applied",
      summary: proposal.summary,
      changes: proposal.changes,
      context: proposal.context,
      reason: proposal.reason,
      notes: proposal.notes,
      actorEmail: currentUserEmail,
      actorUid: currentUserUid,
      createdAtMs: Date.now(),
      createdAt: createActionTimestamp(),
      proposalId: id
    });
    refreshAllUi();
    return;
  }

  const proposalRef = doc(collection(scoresDoc, "pendingProposals"));
  await setDoc(proposalRef, proposal);

  await appendAuditLog({
    type: actionType === "path_request" ? "path_request_submitted" : "proposal_submitted",
    status: "applied",
    summary: proposal.summary,
    changes: proposal.changes,
    context: proposal.context,
    reason: proposal.reason,
    notes: proposal.notes,
    actorEmail: currentUserEmail,
    actorUid: currentUserUid,
    createdAtMs: Date.now(),
    createdAt: createActionTimestamp(),
    proposalId: proposalRef.id
  });
}

async function submitScoringAction({ type, summary, changes }) {
  const context = activeContextOrWarn();
  if (!context) return;

  const reason = context.reason;
  const notes = context.notes;
  const selectedTags = getSelectedTags();
  const eventTag = selectedTags.length > 0 ? selectedTags[0] : "";  // Use first selected tag

  if (can("scoreEdit")) {
    const write = await withWrite(() => applyDirectScoreAction({
      type, summary, changes, context, reason, notes,
      extra: { eventTag }
    }));
    if (write.ok && write.value?.applied) {
      showToast("Score applied.", "success");
    }
    return;
  }

  if (can("proposePoints")) {
    const write = await withWrite(() => submitProposal({
      actionType: "score_change",
      summary,
      changes,
      context,
      reason,
      notes,
      eventTag
    }));
    if (write.ok) showToast("Suggestion submitted for admin review.", "info");
    return;
  }

  showToast("Your role cannot score or suggest points.", "warn");
}

async function submitScoringActionWithTags({ house, amount, tags, notes }) {
  if (!can("scoreEdit") && !can("proposePoints")) {
    showToast("Your role cannot score or suggest points.", "warn");
    return;
  }

  if (!house || amount <= 0 || !tags || tags.length === 0) {
    showToast("Missing required information", "warn");
    return;
  }

  const baseContext = activeContextOrWarn();
  if (!baseContext) return;

  const changes = {
    [house]: amount,
    red: house === "red" ? amount : 0,
    white: house === "white" ? amount : 0,
    blue: house === "blue" ? amount : 0,
    silver: house === "silver" ? amount : 0,
  };

  const houseInfo = houses.find(h => h.id === house);
  const tagNames = tags.map(id => {
    const tag = tagLibrary?.tags.find(t => t.id === id);
    return tag?.name || id;
  });
  const tagReason = tagNames.join(", ");
  const summary = `${houseInfo?.name || house} ${amount > 0 ? "+" : ""}${amount} · [${tagReason}]`;
  const context = {
    ...baseContext,
    reason: baseContext.reason || tagReason,
    notes: notes || baseContext.notes || "",
    tags
  };

  if (can("scoreEdit")) {
    const write = await withWrite(() => applyDirectScoreAction({
      type: "delta",
      summary,
      changes,
      context,
      reason: tagReason || context.reason,
      notes: context.notes,
      extra: { tags, eventTag: tags[0] }
    }));
    if (write.ok && write.value?.applied) {
      showToast("✅ Points scored!", "success");
    }
    return;
  }

  if (can("proposePoints")) {
    const write = await withWrite(() => submitProposal({
      actionType: "score_change",
      summary,
      changes,
      context,
      reason: tagReason || context.reason,
      notes: context.notes,
      eventTag: tags[0],
      tags
    }));
    if (write.ok) showToast("✅ Scoring submitted for review", "info");
    return;
  }
}

async function submitHouseDelta(house, delta) {
  if (!Number.isFinite(delta) || delta === 0) return;
  queueHouseDeltaInDraft(house, delta);
}

function parseCustomAmount(houseId) {
  const input = document.getElementById(`custom-${houseId}`);
  const amount = Number.parseInt(String(input?.value || ""), 10);
  if (!Number.isFinite(amount) || amount <= 0) {
    showToast("Enter a custom amount greater than zero.", "warn");
    return null;
  }
  return amount;
}

async function submitCustomDelta(house, direction) {
  const amount = parseCustomAmount(house);
  if (amount === null) return;
  await submitHouseDelta(house, amount * direction);
  const input = document.getElementById(`custom-${house}`);
  if (input) input.value = "";
}

async function applyPlaceAwards() {
  const selected = PLACE_POINTS.map((points, index) => ({
    points,
    badge: PLACE_BADGES[index],
    house: document.getElementById(`place-${index + 1}`)?.value || ""
  })).filter(item => item.house);

  if (!selected.length) {
    showToast("Select at least one place award.", "warn");
    return;
  }

  const unique = new Set(selected.map(item => item.house));
  if (unique.size !== selected.length) {
    showToast("Each house can only be selected once.", "warn");
    return;
  }

  const changes = { red: 0, white: 0, blue: 0, silver: 0 };
  selected.forEach(item => {
    changes[item.house] += item.points;
  });

  const summary = `Place awards: ${selected.map(item => `${houses.find(h => h.id === item.house)?.name} +${item.points}`).join(" · ")}`;
  await submitScoringAction({ type: "place_awards", summary, changes });
  clearPlaceSelections();
}

function clearPlaceSelections() {
  getPlaceSelects().forEach(select => {
    select.value = "";
  });
  updatePlacePreview();
}

function autoFillPlacesByScore() {
  const ranked = [...houses].sort((left, right) => scoreNumber(currentScores, right.id) - scoreNumber(currentScores, left.id));
  ranked.forEach((house, index) => {
    const select = document.getElementById(`place-${index + 1}`);
    if (select) select.value = house.id;
  });
  updatePlacePreview();
  showToast("Places auto-filled by current scores.", "info");
}

async function resetScores() {
  if (!can("resetAll")) {
    showToast("Your role cannot reset all scores.", "warn");
    return;
  }
  if (!window.confirm("Reset all house scores to zero?")) return;

  const changes = {
    red: -scoreNumber(currentScores, "red"),
    white: -scoreNumber(currentScores, "white"),
    blue: -scoreNumber(currentScores, "blue"),
    silver: -scoreNumber(currentScores, "silver")
  };

  const write = await withWrite(() => applyDirectScoreAction({
    type: "reset",
    summary: "Reset all scores",
    changes,
    context: activeContext,
    reason: activeContext?.reason || "Reset",
    notes: activeContext?.notes || ""
  }));

  if (write.ok && write.value?.applied) {
    showToast("All scores reset.", "warn");
  }
}

async function createSavepoint() {
  if (!can("checkpoint")) {
    showToast("Your role cannot create savepoints.", "warn");
    return;
  }

  const label = String(dom.checkpointName.value || "").trim().slice(0, 60);
  if (!label) {
    showToast("Enter a savepoint name first.", "warn");
    return;
  }

  const snapshot = { ...currentScores };
  const write = await withWrite(() => appendAuditLog(buildAppliedAuditEntry({
    type: "savepoint",
    summary: summaryWithLabel(`Savepoint: ${label}`),
    changes: { red: 0, white: 0, blue: 0, silver: 0 },
    context: activeContext,
    reason: activeContext?.reason || label,
    notes: activeContext?.notes || "",
    beforeScores: snapshot,
    afterScores: snapshot,
    extra: { snapshot }
  })));

  if (write.ok) {
    dom.checkpointName.value = "";
    showToast("Savepoint created.", "success");
  }
}

async function restoreFromSavepoint(entryId) {
  if (!can("restoreHistory")) {
    showToast("Your role cannot restore savepoints.", "warn");
    return;
  }

  const entry = auditEntries.find(item => item.id === entryId && item.type === "savepoint");
  if (!entry?.snapshot) {
    showToast("Savepoint not found.", "warn");
    return;
  }

  if (!window.confirm("Restore scores from this savepoint?")) return;

  const target = scoresFromDoc(entry.snapshot);
  const changes = {
    red: target.red - currentScores.red,
    white: target.white - currentScores.white,
    blue: target.blue - currentScores.blue,
    silver: target.silver - currentScores.silver
  };

  const write = await withWrite(() => applyDirectScoreAction({
    type: "restore_savepoint",
    summary: `Restored savepoint: ${entry.summary}`,
    changes,
    context: activeContext,
    reason: activeContext?.reason || "Restore savepoint",
    notes: activeContext?.notes || ""
  }));

  if (write.ok && write.value?.applied) {
    showToast("Savepoint restored.", "success");
  }
}

function startContextFromInputs() {
  const nextContext = buildContextFromInputs();
  if (!nextContext) {
    showToast("Pick an event tag and enter a reason to start context.", "warn");
    return;
  }

  const switchingContext = Boolean(activeContext) && (
    routeKey(activeContext) !== routeKey(nextContext) ||
    String(activeContext.reason || "").trim().toLowerCase() !== String(nextContext.reason || "").trim().toLowerCase()
  );
  if (switchingContext && hasEventDraftChanges()) {
    const discard = window.confirm("You have pending event changes. Discard them and switch events?");
    if (!discard) return;
    resetEventDraft();
  }

  activeContext = nextContext;
  updateContextSummary();
  syncPermissionControlledUi();
  renderReasonTracker();
  renderHouseCards();
  showToast(can("scoreEdit") ? "Event context started." : "Event context ready for suggestions.", "success");
}

function clearContext(options = {}) {
  const quiet = Boolean(options.quiet);
  if (hasEventDraftChanges()) {
    const discard = window.confirm("Discard pending event changes and end this event?");
    if (!discard) return;
  }
  resetEventDraft();
  activeContext = null;
  updateContextSummary();
  syncPermissionControlledUi();
  renderReasonTracker();
  if (!quiet) showToast("Event context locked.", "info");
}

async function requestNewPath() {
  if (!can("proposePoints") && !can("manageCatalog")) {
    showToast("Your role cannot request new paths.", "warn");
    return;
  }

  const categoryName = String(window.prompt("Requested category name:", dom.catalogCategoryInput?.value || "") || "").trim();
  const eventName = String(window.prompt("Requested event name:", dom.catalogEventInput?.value || "") || "").trim();
  const subeventName = String(window.prompt("Requested subevent name:", dom.catalogSubeventInput?.value || "") || "").trim();

  if (!categoryName || !eventName || !subeventName) {
    showToast("Category, event, and subevent are required.", "warn");
    return;
  }

  if (can("manageCatalog")) {
    await addCatalogPath(categoryName, eventName, subeventName);
    return;
  }

  const write = await withWrite(() => submitProposal({
    actionType: "path_request",
    summary: `Path request: ${categoryName} > ${eventName} > ${subeventName}`,
    pathRequest: {
      categoryId: safeId(categoryName),
      categoryName,
      eventId: safeId(eventName),
      eventName,
      subeventId: safeId(subeventName),
      subeventName
    },
    context: activeContext,
    reason: activeContext?.reason || "Path request",
    notes: activeContext?.notes || ""
  }));

  if (write.ok) showToast("Path request submitted for review.", "info");
}

async function addCatalogPath(categoryName, eventName, subeventName) {
  if (!can("manageCatalog")) {
    showToast("Your role cannot manage event catalog.", "warn");
    return;
  }

  const categoryId = safeId(categoryName);
  const eventId = safeId(eventName);
  const subeventId = safeId(subeventName);
  if (!categoryId || !eventId || !subeventId) {
    showToast("Invalid path values.", "warn");
    return;
  }

  const write = await withWrite(async () => {
    if (TEST_MODE) {
      localState.eventCatalog = upsertCatalogPath(localState.eventCatalog, {
        categoryId,
        categoryName,
        eventId,
        eventName,
        subeventId,
        subeventName
      });
      localWriteState(localState);
      eventCatalog = localState.eventCatalog;
      renderCatalogSelects();
      renderCatalogList();
      return;
    }

    await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(scoresDoc);
      const data = snapshot.exists() ? snapshot.data() : {};
      const nextCatalog = upsertCatalogPath(normalizeEventCatalog(data.eventCatalog || DEFAULT_EVENT_CATALOG), {
        categoryId,
        categoryName,
        eventId,
        eventName,
        subeventId,
        subeventName
      });

      transaction.set(scoresDoc, {
        eventCatalog: nextCatalog,
        lastAction: {
          type: "catalog_update",
          summary: `Catalog updated: ${categoryName} > ${eventName} > ${subeventName}`,
          actorEmail: currentUserEmail,
          actorUid: currentUserUid,
          createdAtMs: Date.now(),
          timestamp: serverTimestamp()
        }
      }, { merge: true });
    });

    await appendAuditLog({
      type: "path_request_approved",
      status: "applied",
      summary: `Catalog updated: ${categoryName} > ${eventName} > ${subeventName}`,
      actorEmail: currentUserEmail,
      actorUid: currentUserUid,
      context: null,
      changes: { red: 0, white: 0, blue: 0, silver: 0 },
      notes: "Catalog manager",
      createdAtMs: Date.now(),
      createdAt: createActionTimestamp()
    });
  });

  if (write.ok) {
    showToast("Catalog path saved.", "success");
    dom.catalogCategoryInput.value = "";
    dom.catalogEventInput.value = "";
    dom.catalogSubeventInput.value = "";
  }
}

function upsertCatalogPath(catalog, path) {
  const next = normalizeEventCatalog(catalog);
  let category = next.categories.find(item => item.id === path.categoryId);
  if (!category) {
    category = { id: path.categoryId, name: path.categoryName, events: [] };
    next.categories.push(category);
  }

  let event = category.events.find(item => item.id === path.eventId);
  if (!event) {
    event = { id: path.eventId, name: path.eventName, subevents: [] };
    category.events.push(event);
  }

  let subevent = event.subevents.find(item => item.id === path.subeventId);
  if (!subevent) {
    subevent = { id: path.subeventId, name: path.subeventName };
    event.subevents.push(subevent);
  }

  category.name = path.categoryName;
  event.name = path.eventName;
  subevent.name = path.subeventName;

  next.categories.sort((a, b) => a.name.localeCompare(b.name));
  next.categories.forEach(categoryItem => {
    categoryItem.events.sort((a, b) => a.name.localeCompare(b.name));
    categoryItem.events.forEach(eventItem => {
      eventItem.subevents.sort((a, b) => a.name.localeCompare(b.name));
    });
  });

  return next;
}

async function handleProposalDecision(proposalId, decision) {
  if (!can("approveProposals")) {
    showToast("Your role cannot review suggestions.", "warn");
    return;
  }

  const proposal = pendingProposals.find(item => item.id === proposalId);
  if (!proposal || proposal.status !== "pending") {
    showToast("Suggestion is no longer pending.", "warn");
    return;
  }

  const approved = decision === "approve";
  const reviewType = approved
    ? (proposal.actionType === "path_request" ? "path_request_approved" : "proposal_approved")
    : (proposal.actionType === "path_request" ? "path_request_rejected" : "proposal_rejected");

  const write = await withWrite(async () => {
    if (TEST_MODE) {
      const index = localState.pendingProposals.findIndex(item => item.id === proposalId);
      if (index === -1) return;
      const next = { ...localState.pendingProposals[index] };
      next.status = approved ? "approved" : "rejected";
      next.reviewedByUid = currentUserUid;
      next.reviewedByEmail = currentUserEmail;
      next.reviewedAtMs = Date.now();
      localState.pendingProposals[index] = next;

      if (approved && proposal.actionType === "score_change") {
        const before = { ...localState.scores };
        const after = applyChanges(before, proposal.changes || {});
        localState.scores = after;
        localState.lastAction = {
          type: "proposal_approved",
          summary: proposal.summary,
          actorEmail: currentUserEmail,
          createdAtMs: Date.now(),
          timestamp: createActionTimestamp()
        };
        await appendAuditLog({
          type: "proposal_approved",
          status: "applied",
          summary: proposal.summary,
          actorEmail: currentUserEmail,
          actorUid: currentUserUid,
          context: proposal.context,
          reason: proposal.reason,
          notes: proposal.notes,
          changes: proposal.changes || { red: 0, white: 0, blue: 0, silver: 0 },
          proposalId,
          createdAtMs: Date.now(),
          createdAt: createActionTimestamp(),
          beforeScores: before,
          afterScores: after
        });
      } else if (approved && proposal.actionType === "path_request") {
        localState.eventCatalog = upsertCatalogPath(localState.eventCatalog, proposal.pathRequest || {});
        await appendAuditLog({
          type: "path_request_approved",
          status: "applied",
          summary: proposal.summary,
          actorEmail: currentUserEmail,
          actorUid: currentUserUid,
          context: proposal.context,
          changes: { red: 0, white: 0, blue: 0, silver: 0 },
          proposalId,
          createdAtMs: Date.now(),
          createdAt: createActionTimestamp()
        });
      } else {
        await appendAuditLog({
          type: reviewType,
          status: "applied",
          summary: proposal.summary,
          actorEmail: currentUserEmail,
          actorUid: currentUserUid,
          context: proposal.context,
          changes: proposal.changes || { red: 0, white: 0, blue: 0, silver: 0 },
          proposalId,
          createdAtMs: Date.now(),
          createdAt: createActionTimestamp()
        });
      }

      localWriteState(localState);
      pendingProposals = localState.pendingProposals;
      updateFromScoresDoc({ ...localState.scores, eventCatalog: localState.eventCatalog, lastAction: localState.lastAction });
      refreshAllUi();
      return;
    }

    await runTransaction(db, async transaction => {
      const proposalRef = doc(collection(scoresDoc, "pendingProposals"), proposalId);
      const proposalSnap = await transaction.get(proposalRef);
      if (!proposalSnap.exists()) return;
      const liveProposal = { id: proposalSnap.id, ...proposalSnap.data() };
      if (liveProposal.status !== "pending") return;

      const nowMs = Date.now();
      transaction.set(proposalRef, {
        status: approved ? "approved" : "rejected",
        reviewedByUid: currentUserUid,
        reviewedByEmail: currentUserEmail,
        reviewedAtMs: nowMs,
        reviewedAt: serverTimestamp()
      }, { merge: true });

      if (!approved) {
        return;
      }

      if (liveProposal.actionType === "path_request") {
        const scoresSnap = await transaction.get(scoresDoc);
        const scoreData = scoresSnap.exists() ? scoresSnap.data() : {};
        const nextCatalog = upsertCatalogPath(normalizeEventCatalog(scoreData.eventCatalog || DEFAULT_EVENT_CATALOG), liveProposal.pathRequest || {});
        transaction.set(scoresDoc, {
          eventCatalog: nextCatalog,
          lastAction: {
            type: "path_request_approved",
            summary: liveProposal.summary || "Path request approved",
            actorEmail: currentUserEmail,
            actorUid: currentUserUid,
            createdAtMs: nowMs,
            timestamp: serverTimestamp()
          }
        }, { merge: true });
        return;
      }

      if (liveProposal.actionType === "score_change") {
        const scoresSnap = await transaction.get(scoresDoc);
        const data = scoresSnap.exists() ? scoresSnap.data() : {};
        const before = scoresFromDoc(data);
        const after = applyChanges(before, liveProposal.changes || {});

        transaction.set(scoresDoc, {
          ...after,
          lastAction: {
            type: "proposal_approved",
            summary: liveProposal.summary || "Suggestion approved",
            actorEmail: currentUserEmail,
            actorUid: currentUserUid,
            createdAtMs: nowMs,
            timestamp: serverTimestamp(),
            context: liveProposal.context || null,
            changes: liveProposal.changes || { red: 0, white: 0, blue: 0, silver: 0 }
          }
        }, { merge: true });

        const auditRef = doc(collection(scoresDoc, "auditLog"));
        transaction.set(auditRef, {
          type: "proposal_approved",
          status: "applied",
          summary: liveProposal.summary || "Suggestion approved",
          actorEmail: currentUserEmail,
          actorUid: currentUserUid,
          context: liveProposal.context || null,
          reason: liveProposal.reason || "",
          notes: liveProposal.notes || "",
          changes: liveProposal.changes || { red: 0, white: 0, blue: 0, silver: 0 },
          proposalId,
          createdAtMs: nowMs,
          createdAt: serverTimestamp(),
          beforeScores: before,
          afterScores: after
        });
      }
    });

    await appendAuditLog({
      type: reviewType,
      status: "applied",
      summary: proposal.summary,
      actorEmail: currentUserEmail,
      actorUid: currentUserUid,
      context: proposal.context || null,
      changes: proposal.changes || { red: 0, white: 0, blue: 0, silver: 0 },
      proposalId,
      createdAtMs: Date.now(),
      createdAt: createActionTimestamp()
    });
  });

  if (write.ok) {
    showToast(approved ? "Suggestion approved." : "Suggestion rejected.", approved ? "success" : "warn");
  }
}

async function requestPointsSync() {
  if (!can("approveProposals")) {
    showToast("Only admins can request a points sync.", "warn");
    return;
  }
  if (TEST_MODE) {
    showToast("Points sync is disabled in local test mode.", "warn");
    return;
  }

  const requestedAtMs = Date.now();
  const write = await withWrite(async () => {
    const requestRef = doc(collection(scoresDoc, "syncRequests"));
    await setDoc(requestRef, {
      status: "queued",
      requestedAtMs,
      requestedByUid: currentUserUid,
      requestedByEmail: currentUserEmail,
      requestedAt: serverTimestamp(),
      source: "control-panel"
    });
    await setDoc(scoresDoc, {
      sheetSync: {
        request: {
          status: "queued",
          requestedAtMs,
          requestedAt: serverTimestamp(),
          requestedByEmail: currentUserEmail
        }
      }
    }, { merge: true });
  });

  if (write.ok) {
    setSheetSyncStatus(`Request queued at ${new Date(requestedAtMs).toLocaleString()}.`);
    showToast("Points sync requested. It will run automatically shortly.", "success");
  }
}

let csvPreviewData = [];

function handleCsvImportClick(event) {
  const file = event.target.files?.[0];
  if (!file) {
    document.getElementById("importPreviewStatus").textContent = "No file selected.";
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const content = String(e.target?.result || "").trim();
      const lines = content.split("\n");
      csvPreviewData = lines.slice(0, 20).map(line => {
        const parts = line.split("\t");
        return { house: parts[0]?.trim() || "", points: parts[1]?.trim() || "", reason: parts[2]?.trim() || "", date: parts[3]?.trim() || "" };
      }).filter(row => row.house && row.points);

      const statusEl = document.getElementById("importPreviewStatus");
      const listEl = document.getElementById("importPreviewList");
      const btnEl = document.getElementById("importPointsBtn");

      if (csvPreviewData.length === 0) {
        statusEl.textContent = "No valid rows found in CSV.";
        listEl.innerHTML = "";
        btnEl.hidden = true;
        return;
      }

      statusEl.textContent = `Ready to import ${csvPreviewData.length} entries: Red, White, Blue, Silver houses with points and reasons.`;
      listEl.innerHTML = csvPreviewData.map(row => `<li style="padding:6px; border-bottom:1px solid #e0e0e0; font-size:12px;">${row.house.toUpperCase()} +${row.points} • ${row.reason} (${row.date})</li>`).join("");
      btnEl.hidden = false;
    } catch (err) {
      showToast(`CSV parse error: ${err.message}`, "warn");
      document.getElementById("importPreviewStatus").textContent = "Error parsing CSV file.";
      document.getElementById("importPointsBtn").hidden = true;
    }
  };
  reader.readAsText(file);
}

async function submitCsvImport() {
  if (csvPreviewData.length === 0) {
    showToast("No preview data. Select a CSV file first.", "warn");
    return;
  }

  if (!can("approveProposals")) {
    showToast("Only admins can import point data.", "warn");
    return;
  }

  showToast("Importing points... (processing)", "info");

  try {
    const batch = writeBatch(db);
    let totalRed = 0, totalWhite = 0, totalBlue = 0, totalSilver = 0;

    csvPreviewData.forEach(row => {
      const houseId = row.house.toLowerCase();
      if (!["red", "white", "blue", "silver"].includes(houseId)) return;

      const points = parseInt(row.points, 10);
      const dateStr = row.date.trim();
      const [m, d, y] = dateStr.split("/").map(x => parseInt(x, 10));
      const fullYear = y < 50 ? 2000 + y : 1900 + y;
      const date = new Date(fullYear, m - 1, d);
      const timeMs = date.getTime();

      const auditEntry = {
        type: "imported",
        status: "applied",
        summary: `${row.reason} (+${points})`,
        changes: {
          red: houseId === "red" ? points : 0,
          white: houseId === "white" ? points : 0,
          blue: houseId === "blue" ? points : 0,
          silver: houseId === "silver" ? points : 0
        },
        createdAtMs: timeMs,
        createdAt: serverTimestamp(),
        actorEmail: "csv-import",
        actorUid: currentUserUid
      };

      if (houseId === "red") totalRed += points;
      if (houseId === "white") totalWhite += points;
      if (houseId === "blue") totalBlue += points;
      if (houseId === "silver") totalSilver += points;

      const docRef = doc(collection(scoresDoc, "auditLog"), `${timeMs}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
      batch.set(docRef, auditEntry);
    });

    batch.update(scoresDoc, { red: totalRed, white: totalWhite, blue: totalBlue, silver: totalSilver });
    await batch.commit();

    showToast(`✅ Imported ${csvPreviewData.length} point entries successfully!`, "success");
    document.getElementById("importPreviewList").innerHTML = "";
    document.getElementById("importPreviewStatus").textContent = "Import complete!";
    document.getElementById("importPointsBtn").hidden = true;
    csvPreviewData = [];
  } catch (err) {
    showToast(`Import failed: ${err.message}`, "warn");
  }
}

async function sendPasswordResetLink() {
  if (!can("passwordReset")) {
    showToast("Your role cannot send password reset links.", "warn");
    return;
  }

  if (TEST_MODE) {
    setPasswordResetStatus("Password reset is disabled in local test mode.", "warn");
    return;
  }

  const email = String(dom.resetEmailInput.value || "").trim().toLowerCase();
  if (!email) {
    setPasswordResetStatus("Enter an email address to send a reset link.", "warn");
    return;
  }
  if (!isLikelyEmail(email)) {
    setPasswordResetStatus("Enter a valid email address first.", "warn");
    return;
  }
  if (!auth) {
    setPasswordResetStatus("Auth is not ready yet. Retry in a moment.", "warn");
    return;
  }

  try {
    const result = await sendResetEmailWithFallback(email);
    const suffix = result.fallbackUsed ? " (sent with default Firebase redirect)." : "";
    setPasswordResetStatus(`Password reset link sent to ${email}.${suffix}`, "success");
    showToast("Password reset email sent.", "success");
  } catch (error) {
    console.error(error);
    setPasswordResetStatus(mapPasswordResetError(error), "warn");
    showToast("Failed to send password reset email.", "warn");
  }
}

async function sendLoginPasswordResetLink() {
  if (TEST_MODE) {
    setLoginResetStatus("Password reset email is disabled in local test mode.", "warn");
    return;
  }

  const email = String(dom.emailInput?.value || "").trim().toLowerCase();
  if (!email) {
    setLoginResetStatus("Enter your email above, then click Forgot Password.", "warn");
    return;
  }
  if (!isLikelyEmail(email)) {
    setLoginResetStatus("Enter a valid email address first.", "warn");
    return;
  }
  if (!auth) {
    setLoginResetStatus("Auth is not ready yet. Retry in a moment.", "warn");
    return;
  }

  try {
    const result = await sendResetEmailWithFallback(email);
    const suffix = result.fallbackUsed ? " (default Firebase redirect)" : "";
    setLoginResetStatus(`Reset link sent to ${email}${suffix}.`, "success");
    showToast("Password reset email sent.", "success");
  } catch (error) {
    console.error(error);
    setLoginResetStatus(mapPasswordResetError(error), "warn");
    showToast("Failed to send password reset email.", "warn");
  }
}

function roleFromClaims(claims = {}) {
  if (claims.superadmin === true || claims.role === "superadmin") return "superadmin";
  if (claims.admin === true || claims.role === "admin") return "admin";
  if (claims.role === "helper") return "helper";
  if (claims.role === "staff") return "staff";
  return "";
}

async function roleFromProfile(uid, email) {
  if (TEST_MODE || !uid) return "";
  try {
    // First try UID-based lookup (faster, no index needed)
    console.log("🔎 Looking up profile by UID:", uid);
    const profileRef = doc(db, "userProfiles", uid);
    const snapshot = await getDoc(profileRef);
    if (snapshot.exists()) {
      const role = normalizeRole(snapshot.data()?.role || "");
      console.log("✅ Found profile by UID with role:", role);
      return role;
    }
    console.log("❌ No profile found by UID, trying email lookup");

    // Fallback to email-based lookup (requires index)
    if (email) {
      console.log("🔎 Looking up profile by email:", email);
      const profilesRef = collection(db, "userProfiles");
      const findQuery = query(profilesRef, where("email", "==", email), limit(1));
      const snapshot = await getDocs(findQuery);
      if (!snapshot.empty) {
        const role = normalizeRole(snapshot.docs[0].data()?.role || "");
        console.log("✅ Found profile by email with role:", role);
        return role;
      }
      console.log("❌ No profile found by email");
    }
    return "";
  } catch (error) {
    console.error("❌ Error fetching profile:", error);
    return "";
  }
}

async function resolveAccessRole(user, claims = {}) {
  const claimRole = roleFromClaims(claims);
  if (claimRole) return claimRole;
  const profileRole = await roleFromProfile(user.uid, user.email);
  if (profileRole) return profileRole;
  return "";
}

async function getProfileByEmail(email) {
  const profilesRef = collection(db, "userProfiles");
  const findQuery = query(profilesRef, where("email", "==", email), limit(1));
  const snapshot = await getDocs(findQuery);
  if (snapshot.empty) return null;
  const docSnap = snapshot.docs[0];
  return { id: docSnap.id, ...docSnap.data() };
}

async function createAuthUserWithoutSwitchingSession({ email, password, name }) {
  const secondaryApp = initializeApp(firebaseConfig, `ala-control-user-admin-${Date.now()}`);
  const secondaryAuth = getAuth(secondaryApp);
  try {
    const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    if (name) {
      await updateProfile(credential.user, { displayName: name });
    }
    return credential.user.uid;
  } finally {
    try {
      await signOut(secondaryAuth);
    } catch {
      // no-op
    }
    await deleteApp(secondaryApp);
  }
}

async function createOrUpdateUserFromPanel() {
  if (TEST_MODE) {
    showToast("User management is disabled in local test mode.", "warn");
    return;
  }

  if (!can("manageUsers")) {
    showToast("Your role cannot manage users.", "warn");
    return;
  }

  const name = String(dom.userNameInput.value || "").trim();
  const email = String(dom.userEmailInput.value || "").trim().toLowerCase();
  const password = String(dom.userPasswordInput.value || "");
  const role = normalizeRole(dom.userRoleSelect.value);

  if (!name || !email) {
    showToast("Enter name and email.", "warn");
    return;
  }

  if (password && password.length < 6) {
    showToast("Password must be at least 6 characters.", "warn");
    return;
  }

  setUserAdminStatus("Saving user...");

  const write = await withWrite(async () => {
    let uid = "";
    let createdAuth = false;

    if (password) {
      try {
        uid = await createAuthUserWithoutSwitchingSession({ email, password, name });
        createdAuth = true;
      } catch (error) {
        if (error?.code !== "auth/email-already-in-use") {
          throw error;
        }
      }
    }

    if (!uid) {
      const existing = await getProfileByEmail(email);
      const existingUid = String(existing?.uid || existing?.id || "").trim();
      if (!existingUid) {
        throw new Error("No existing account found for this email. Provide a password to create one.");
      }
      uid = existingUid;
    }

    const permissions = resolveRolePermissions(role);
    const profileRef = doc(db, "userProfiles", uid);
    await setDoc(profileRef, {
      uid,
      name,
      email,
      role,
      permissions,
      permissionOverrides: {},
      updatedBy: currentUserEmail,
      updatedAt: serverTimestamp(),
      source: "control-superadmin"
    }, { merge: true });

    dom.userPasswordInput.value = "";
    setUserAdminStatus(createdAuth ? `Created user ${email} (${role}).` : `Updated user ${email} (${role}).`);
    showToast(createdAuth ? "User created." : "User updated.", "success");
    await refreshUserList();
  });

  if (!write.ok) {
    setUserAdminStatus("User update failed.");
  }
}

function setUserAdminStatus(message) {
  dom.userAdminStatus.textContent = message;
}

async function refreshUserList() {
  if (!can("manageUsers") || TEST_MODE) {
    userProfiles = [];
    renderUserList();
    return;
  }

  try {
    const snapshot = await getDocs(query(collection(db, "userProfiles"), limit(250)));
    userProfiles = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
    userProfiles.sort((a, b) => String(a.name || a.email || "").localeCompare(String(b.name || b.email || "")));
    renderUserList();
  } catch (error) {
    console.error(error);
    showToast("Failed to load users list.", "warn");
  }
}

function setContactInboxStatus(message) {
  if (dom.contactInboxStatus) dom.contactInboxStatus.textContent = message;
}

function formatContactMessageTime(entry) {
  if (!entry) return "Unknown time";
  const raw = entry.createdAtMs || entry.createdAt?.toMillis?.();
  if (!raw) return "Unknown time";
  return new Date(raw).toLocaleString();
}

function renderContactInboxMessages(messages = []) {
  if (!dom.contactInboxList) return;
  if (!messages.length) {
    dom.contactInboxList.innerHTML = "<li class=\"log-empty\">No messages yet.</li>";
    return;
  }

  dom.contactInboxList.innerHTML = messages.map(msg => {
    const name = escapeHtml(String(msg.name || msg.userEmail || "Unknown"));
    const purpose = escapeHtml(String(msg.purpose || "other"));
    const subject = escapeHtml(String(msg.subject || "No subject"));
    const message = escapeHtml(String(msg.message || ""));
    const time = escapeHtml(formatContactMessageTime(msg));
    return `
      <li class="mini-list-item">
        <div>
          <strong>${subject}</strong>
          <div class="muted">${purpose} · ${name} · ${time}</div>
          <div>${message}</div>
        </div>
        ${can("approveProposals") ? `<button class="btn btn-outline btn-mini" type="button" data-contact-delete="${escapeHtml(msg.id || "")}">Delete</button>` : ""}
      </li>
    `;
  }).join("");
}

async function deleteContactMessage(messageId) {
  const id = String(messageId || "").trim();
  if (!id) return;
  if (!can("approveProposals")) {
    showToast("Only admins can delete support messages.", "warn");
    return;
  }
  const confirmed = window.confirm("Delete this support message?");
  if (!confirmed) return;
  try {
    await deleteDoc(doc(db, "contactMessages", id));
    showToast("Support message deleted.", "success");
    await refreshContactInbox();
  } catch (error) {
    console.error(error);
    showToast("Failed to delete support message.", "warn");
  }
}

async function refreshContactInbox() {
  if (!dom.contactInboxList) return;
  if (TEST_MODE || !["admin", "superadmin"].includes(currentRole)) {
    dom.contactInboxList.innerHTML = "<li class=\"log-empty\">Contact inbox is only for admins.</li>";
    setContactInboxStatus("Contact inbox is only available to admins.");
    return;
  }

  try {
    setContactInboxStatus("Loading messages...");
    const snapshot = await getDocs(
      query(collection(db, "contactMessages"), orderBy("createdAt", "desc"), limit(MAX_CONTACT_MESSAGES))
    );
    const messages = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
    renderContactInboxMessages(messages);
    setContactInboxStatus(`Loaded ${messages.length} message${messages.length === 1 ? "" : "s"}.`);
  } catch (error) {
    console.error(error);
    if (String(error?.code || "").includes("permission") && currentUserUid) {
      try {
        const ownSnapshot = await getDocs(
          query(collection(db, "contactMessages"), where("userId", "==", currentUserUid), limit(MAX_CONTACT_MESSAGES))
        );
        const ownMessages = ownSnapshot.docs
          .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
          .sort((a, b) => Number(b.createdAtMs || b.createdAt?.toMillis?.() || 0) - Number(a.createdAtMs || a.createdAt?.toMillis?.() || 0));
        renderContactInboxMessages(ownMessages);
        setContactInboxStatus("Loaded your own messages. Full inbox requires admin/superadmin rule access.");
        return;
      } catch (fallbackError) {
        console.error(fallbackError);
      }
    }
    dom.contactInboxList.innerHTML = "<li class=\"log-empty\">Failed to load inbox.</li>";
    setContactInboxStatus("Failed to load contact inbox.");
  }
}

function applyDemoRolePreview() {
  if (authenticatedRole !== "superadmin") {
    showToast("Only superadmin can preview other roles.", "warn");
    return;
  }

  const raw = String(dom.demoRoleSelect?.value || "").trim();
  if (!raw) {
    clearDemoRolePreview();
    return;
  }
  const selected = normalizeRole(raw);
  if (selected === authenticatedRole) {
    clearDemoRolePreview();
    return;
  }

  demoRolePreview = selected;
  applyEffectiveRoleState();
  renderPermissionGrid();
  syncPermissionControlledUi();
  if (activeWorkspace === "support") void refreshContactInbox();
  showToast(`Previewing ${roleDisplayLabel(selected)} role.`, "info");
}

function clearDemoRolePreview(options = {}) {
  const quiet = Boolean(options.quiet);
  const wasActive = isDemoRoleActive();
  demoRolePreview = "";
  applyEffectiveRoleState();
  renderPermissionGrid();
  syncPermissionControlledUi();
  if (dom.demoRoleSelect) dom.demoRoleSelect.value = "";
  if (!quiet && wasActive) showToast("Returned to your real role.", "success");
}

async function writeBackupPayload(backupRef, subcollectionName, rows) {
  const groups = chunkArray(rows, 420);
  for (const group of groups) {
    const batch = writeBatch(db);
    group.forEach(row => {
      const rowRef = doc(collection(backupRef, subcollectionName), row.id);
      batch.set(rowRef, row.data);
    });
    await batch.commit();
  }
}

async function replaceCollectionFromBackup(targetCollectionRef, payloadRows) {
  const existingSnap = await getDocs(targetCollectionRef);
  const existingIds = new Set(existingSnap.docs.map(docSnap => docSnap.id));
  const payloadIds = new Set(payloadRows.map(row => row.id));

  const deletionRows = [...existingIds]
    .filter(id => !payloadIds.has(id))
    .map(id => ({ id }));

  const deleteGroups = chunkArray(deletionRows, 420);
  for (const group of deleteGroups) {
    const batch = writeBatch(db);
    group.forEach(row => {
      batch.delete(doc(targetCollectionRef, row.id));
    });
    await batch.commit();
  }

  const upsertGroups = chunkArray(payloadRows, 420);
  for (const group of upsertGroups) {
    const batch = writeBatch(db);
    group.forEach(row => {
      batch.set(doc(targetCollectionRef, row.id), row.data);
    });
    await batch.commit();
  }
}

async function refreshBackupList() {
  if (TEST_MODE || currentRole !== "superadmin") {
    backupEntries = [];
    renderBackupList();
    return;
  }

  try {
    const snapshot = await getDocs(query(collection(db, "systemBackups"), orderBy("createdAtMs", "desc"), limit(MAX_BACKUP_LIST)));
    backupEntries = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
    renderBackupList();
  } catch (error) {
    console.error(error);
    setBackupStatus("Failed to load backups.");
    showToast("Failed to load backup list.", "warn");
  }
}

async function createSystemBackup() {
  if (currentRole !== "superadmin") {
    showToast("Only superadmins can create system backups.", "warn");
    return;
  }
  if (TEST_MODE) {
    showToast("Backups are disabled in local test mode.", "warn");
    return;
  }

  const label = String(dom.backupLabelInput.value || "").trim().slice(0, 80) || `Backup ${new Date().toLocaleString()}`;
  setBackupStatus("Creating backup...");

  const write = await withWrite(async () => {
    const scoresSnap = await getDoc(scoresDoc);
    const scoresData = scoresSnap.exists() ? scoresSnap.data() : {};

    const pendingSnap = await getDocs(collection(scoresDoc, "pendingProposals"));
    const userSnap = await getDocs(collection(db, "userProfiles"));
    const studentSnap = await getDocs(collection(db, "studentDirectory"));

    const backupRef = doc(collection(db, "systemBackups"));
    const createdAtMs = Date.now();
    await setDoc(backupRef, {
      label,
      createdAtMs,
      createdAt: serverTimestamp(),
      createdByEmail: currentUserEmail,
      createdByUid: currentUserUid,
      counts: {
        pendingProposals: pendingSnap.docs.length,
        userProfiles: userSnap.docs.length,
        studentDirectory: studentSnap.docs.length
      }
    });

    await writeBackupPayload(backupRef, "scores", [
      { id: "main", data: scoresData }
    ]);

    await writeBackupPayload(
      backupRef,
      "pendingProposals",
      pendingSnap.docs.map(docSnap => ({ id: docSnap.id, data: docSnap.data() }))
    );

    await writeBackupPayload(
      backupRef,
      "userProfiles",
      userSnap.docs.map(docSnap => ({ id: docSnap.id, data: docSnap.data() }))
    );

    await writeBackupPayload(
      backupRef,
      "studentDirectory",
      studentSnap.docs.map(docSnap => ({ id: docSnap.id, data: docSnap.data() }))
    );
  });

  if (write.ok) {
    dom.backupLabelInput.value = "";
    setBackupStatus("Backup created successfully.");
    showToast("System backup created.", "success");
    await refreshBackupList();
  } else {
    setBackupStatus("Backup creation failed.");
  }
}

async function restoreSystemBackup(backupId) {
  if (currentRole !== "superadmin") {
    showToast("Only superadmins can restore backups.", "warn");
    return;
  }
  if (TEST_MODE) {
    showToast("Backups are disabled in local test mode.", "warn");
    return;
  }
  if (!backupId) return;

  const backupRef = doc(db, "systemBackups", backupId);
  const backupSnap = await getDoc(backupRef);
  if (!backupSnap.exists()) {
    showToast("Backup no longer exists.", "warn");
    return;
  }

  const backupLabel = String(backupSnap.data()?.label || backupId);
  if (!window.confirm(`Restore backup "${backupLabel}"?\n\nThis replaces scores, users, student directory, and pending proposals.\nImmutable audit history is not replaced.`)) {
    return;
  }

  setBackupStatus("Restoring backup...");
  const write = await withWrite(async () => {
    const scoresPayloadSnap = await getDocs(collection(backupRef, "scores"));
    const pendingPayloadSnap = await getDocs(collection(backupRef, "pendingProposals"));
    const usersPayloadSnap = await getDocs(collection(backupRef, "userProfiles"));
    const studentsPayloadSnap = await getDocs(collection(backupRef, "studentDirectory"));

    const scoresData = scoresPayloadSnap.docs.find(docSnap => docSnap.id === "main")?.data() || {};

    await setDoc(scoresDoc, scoresData, { merge: false });
    await setDoc(scoresDoc, {
      lastAction: {
        type: "system_backup_restore",
        summary: `Restored system backup: ${backupLabel}`,
        actorEmail: currentUserEmail,
        actorUid: currentUserUid,
        createdAtMs: Date.now(),
        timestamp: serverTimestamp()
      }
    }, { merge: true });

    await replaceCollectionFromBackup(
      collection(scoresDoc, "pendingProposals"),
      pendingPayloadSnap.docs.map(docSnap => ({ id: docSnap.id, data: docSnap.data() }))
    );

    await replaceCollectionFromBackup(
      collection(db, "userProfiles"),
      usersPayloadSnap.docs.map(docSnap => ({ id: docSnap.id, data: docSnap.data() }))
    );

    await replaceCollectionFromBackup(
      collection(db, "studentDirectory"),
      studentsPayloadSnap.docs.map(docSnap => ({ id: docSnap.id, data: docSnap.data() }))
    );
  });

  if (write.ok) {
    setBackupStatus(`Backup restored: ${backupLabel}`);
    showToast("System backup restored.", "success");
    await refreshBackupList();
    await refreshUserList();
  } else {
    setBackupStatus("Backup restore failed.");
  }
}

async function renameSystemBackup(backupId) {
  if (currentRole !== "superadmin" || TEST_MODE) return;
  const existing = backupEntries.find(item => item.id === backupId);
  if (!existing) return;
  const nextLabel = String(window.prompt("Rename backup:", existing.label || "") || "").trim().slice(0, 80);
  if (!nextLabel) return;

  const write = await withWrite(() => setDoc(doc(db, "systemBackups", backupId), {
    label: nextLabel,
    renamedAtMs: Date.now(),
    renamedByEmail: currentUserEmail
  }, { merge: true }));

  if (write.ok) {
    showToast("Backup renamed.", "success");
    await refreshBackupList();
  }
}

async function deleteSystemBackup(backupId) {
  if (currentRole !== "superadmin") {
    showToast("Only superadmins can delete backups.", "warn");
    return;
  }
  if (!backupId || !window.confirm("Delete this backup permanently?")) return;

  const backupRef = doc(db, "systemBackups", backupId);
  const write = await withWrite(async () => {
    const subcollections = ["scores", "pendingProposals", "userProfiles", "studentDirectory"];
    for (const subcollectionName of subcollections) {
      const snap = await getDocs(collection(backupRef, subcollectionName));
      const groups = chunkArray(snap.docs, 420);
      for (const group of groups) {
        const batch = writeBatch(db);
        group.forEach(docSnap => batch.delete(docSnap.ref));
        await batch.commit();
      }
    }
    await deleteDoc(backupRef);
  });

  if (write.ok) {
    showToast("Backup deleted.", "success");
    await refreshBackupList();
  }
}

function clearStudentLookupResults(resetInput = false) {
  studentLookupResults = [];
  if (resetInput) dom.studentLookupInput.value = "";
  renderStudentLookupResults();
}

async function runStudentLookup() {
  if (!can("studentLookup")) {
    setStudentLookupStatus("Student lookup is blocked for this account.");
    clearStudentLookupResults();
    return;
  }

  if (TEST_MODE) {
    setStudentLookupStatus("Student lookup is disabled in local test mode.");
    clearStudentLookupResults();
    return;
  }

  const token = normalizeLookupToken(dom.studentLookupInput.value);
  const requestNonce = ++studentLookupNonce;

  if (token.length < 2) {
    setStudentLookupStatus("Type at least 2 characters to search.");
    clearStudentLookupResults();
    return;
  }

  setStudentLookupStatus("Searching student directory...");
  try {
    const studentsRef = collection(db, "studentDirectory");
    const snapshot = await getDocs(query(studentsRef, where("searchPrefixes", "array-contains", token), limit(15)));
    if (requestNonce !== studentLookupNonce) return;

    studentLookupResults = snapshot.docs
      .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
      .filter(item => item.active !== false)
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

    const count = studentLookupResults.length;
    if (!count) {
      setStudentLookupStatus("No matches found. Try a different spelling or student ID.");
    } else {
      setStudentLookupStatus(`Found ${count} student${count === 1 ? "" : "s"}.`);
    }
    renderStudentLookupResults();
  } catch (error) {
    console.error(error);
    setStudentLookupStatus("Lookup failed. Check permissions or directory sync.");
    clearStudentLookupResults();
  }
}

function queueStudentLookup() {
  if (studentLookupTimer) {
    clearTimeout(studentLookupTimer);
  }
  studentLookupTimer = setTimeout(() => {
    void runStudentLookup();
  }, 180);
}

function downloadBackup() {
  if (!can("downloadBackup")) {
    showToast("Your role cannot download backups.", "warn");
    return;
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    scores: currentScores,
    eventCatalog,
    activeContext,
    auditEntries,
    pendingProposals
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `house-points-backup-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function jumpToClosestEntry() {
  const targetMs = Date.parse(String(dom.jumpTime.value || ""));
  if (!Number.isFinite(targetMs)) {
    showToast("Pick a date and time first.", "warn");
    return;
  }

  const all = [...auditEntries];
  if (!all.length) {
    showToast("No activity entries available.", "warn");
    return;
  }

  let closest = all[0];
  let best = Math.abs(Number(closest.createdAtMs || 0) - targetMs);
  all.forEach(entry => {
    const distance = Math.abs(Number(entry.createdAtMs || 0) - targetMs);
    if (distance < best) {
      best = distance;
      closest = entry;
    }
  });

  highlightEntryId = closest.id;
  renderHistoryList();
  showToast(`Closest entry: ${closest.summary || mapActionTypeLabel(closest.type)}`, "info");
}

function setupEventListeners() {
  dom.loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    setAuthError("");

    const email = String(dom.emailInput.value || "").trim();
    const password = String(dom.passwordInput.value || "");
    if (!email || !password) {
      setAuthError("Enter your email and password.");
      return;
    }

    dom.signInButton.disabled = true;
    dom.signInButton.textContent = "Signing In...";

    if (TEST_MODE) {
      applySessionIdentity({ email, uid: "local-test-user", role: "superadmin" });
      dom.loginBox.style.display = "none";
      dom.mainPanel.style.display = "block";
      localState = localReadState();
      pendingProposals = localState.pendingProposals;
      auditEntries = localState.auditLog;
      updateFromScoresDoc({ ...localState.scores, eventCatalog: localState.eventCatalog, lastAction: localState.lastAction });
      refreshAllUi();
      dom.signInButton.disabled = false;
      dom.signInButton.textContent = "Sign In";
      return;
    }

    try {
      console.log("🔐 Attempting sign-in with:", email);
      await signInWithEmailAndPassword(auth, email, password);
      console.log("✅ Sign-in successful, waiting for onAuthStateChanged...");
    } catch (error) {
      console.error("❌ Sign-in error:", error);
      setAuthError(mapAuthError(error));
    } finally {
      dom.signInButton.disabled = false;
      dom.signInButton.textContent = "Sign In";
    }
  });

  dom.signOutBtn.addEventListener("click", () => {
    if (TEST_MODE) {
      dom.loginBox.style.display = "grid";
      dom.mainPanel.style.display = "none";
      resetSignedOutUi();
      return;
    }
    void signOut(auth);
  });

  dom.loginResetBtn?.addEventListener("click", () => {
    void sendLoginPasswordResetLink();
  });

  dom.helpBtn?.addEventListener("click", () => {
    if (dom.helpDialog?.hidden) {
      openHelpDialog();
      return;
    }
    closeHelpDialog();
  });
  dom.workspaceMenuBtn?.addEventListener("click", () => {
    if (dom.workspaceDialog?.hidden) {
      openWorkspaceDialog();
      return;
    }
    closeWorkspaceDialog();
  });
  dom.notificationsBtn?.addEventListener("click", () => {
    if (dom.notificationsPanel?.hidden) {
      openNotificationsPanel();
      return;
    }
    closeNotificationsPanel();
  });
  dom.closeNotificationsBtn?.addEventListener("click", closeNotificationsPanel);
  dom.clearNotificationsBtn?.addEventListener("click", () => {
    notificationsFeed = [];
    try { localStorage.removeItem(NOTIFICATIONS_STORAGE_KEY); } catch { /* ignore */ }
    renderNotifications();
  });
  dom.workspaceSwitchBtn?.addEventListener("click", () => {
    openWorkspaceDialog();
  });
  dom.closeWorkspaceBtn?.addEventListener("click", closeWorkspaceDialog);
  dom.accountBtn.addEventListener("click", openAccountDialog);
  dom.adminBtn.addEventListener("click", openAdminDialog);
  dom.closeHelpBtn?.addEventListener("click", closeHelpDialog);
  dom.closeAccountBtn.addEventListener("click", closeAccountDialog);
  dom.closeAdminBtn.addEventListener("click", closeAdminDialog);

  dom.helpDialog?.addEventListener("click", event => {
    if (event.target === dom.helpDialog) closeHelpDialog();
  });
  dom.accountDialog.addEventListener("click", event => {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("[data-close-drawer='account']")) {
      closeAccountDialog();
    }
  });
  dom.adminDialog.addEventListener("click", event => {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("[data-close-drawer='admin']")) {
      closeAdminDialog();
    }
  });
  dom.workspaceDialog?.addEventListener("click", event => {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("[data-close-drawer='workspace']")) {
      closeWorkspaceDialog();
    }
  });

  document.addEventListener("click", event => {
    if (!dom.notificationsPanel || dom.notificationsPanel.hidden) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest("#notificationsPanel") || target.closest("#notificationsBtn")) return;
    closeNotificationsPanel();
  });

  dom.workspaceNav?.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest("button[data-workspace-tab]");
    if (!button || button.disabled) return;
    activeWorkspace = String(button.dataset.workspaceTab || "scoring");
    renderWorkspace();
    closeWorkspaceDialog();
  });

  dom.categorySelect.addEventListener("change", renderCatalogSelects);
  dom.eventSelect.addEventListener("change", renderCatalogSelects);
  dom.subeventSelect.addEventListener("change", renderRecentReasonChips);
  dom.eventModeSelect.addEventListener("change", syncContextModeUi);
  dom.useReasonTemplateBtn.addEventListener("click", applyReasonTemplate);
  dom.applyUsedReasonBtn.addEventListener("click", applySelectedReason);
  dom.usedReasonSelect.addEventListener("change", () => {
    if (!dom.customReasonInput.value.trim() && dom.usedReasonSelect.value.trim()) {
      dom.reasonInput.value = dom.usedReasonSelect.value.trim();
    }
  });
  dom.reasonTemplateSelect.addEventListener("change", () => {
    if (!dom.reasonInput.value.trim() && String(dom.reasonTemplateSelect.value || "").trim()) {
      applyReasonTemplate();
    }
  });

  dom.reasonCommitBtn?.addEventListener("click", startContextFromInputs);
  dom.reasonClearBtn?.addEventListener("click", clearContext);
  dom.applyEventDraftBtn?.addEventListener("click", () => {
    void applyEventDraftChanges({ endAfterApply: false });
  });
  dom.endEventBtn?.addEventListener("click", () => {
    void applyEventDraftChanges({ endAfterApply: true });
  });
  dom.requestPathBtn.addEventListener("click", () => {
    void requestNewPath();
  });

  dom.autoFillBtn.addEventListener("click", autoFillPlacesByScore);
  dom.clearPlacesBtn.addEventListener("click", clearPlaceSelections);
  dom.applyPlacesBtn.addEventListener("click", () => {
    void applyPlaceAwards();
  });

  dom.resetBtn.addEventListener("click", () => {
    void resetScores();
  });

  dom.checkpointBtn.addEventListener("click", () => {
    void createSavepoint();
  });

  dom.resetPasswordBtn.addEventListener("click", () => {
    void sendPasswordResetLink();
  });

  dom.studentLookupInput.addEventListener("input", queueStudentLookup);

  dom.historyList.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const restoreButton = target.closest("button[data-restore-savepoint]");
    if (restoreButton) {
      const entryId = String(restoreButton.dataset.restoreSavepoint || "");
      void restoreFromSavepoint(entryId);
    }
  });

  dom.historySearch.addEventListener("input", renderHistoryList);
  dom.historyPreset.addEventListener("change", renderHistoryList);
  dom.historyStart.addEventListener("change", renderHistoryList);
  dom.historyEnd.addEventListener("change", renderHistoryList);
  dom.historySort.addEventListener("change", renderHistoryList);
  dom.historyType.addEventListener("change", renderHistoryList);
  dom.historyLimit.addEventListener("change", renderHistoryList);

  dom.jumpBtn.addEventListener("click", jumpToClosestEntry);
  dom.backupBtn.addEventListener("click", downloadBackup);

  dom.proposalList.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const approve = target.closest("button[data-proposal-approve]");
    if (approve) {
      const id = String(approve.dataset.proposalApprove || "");
      void handleProposalDecision(id, "approve");
      return;
    }

    const reject = target.closest("button[data-proposal-reject]");
    if (reject) {
      const id = String(reject.dataset.proposalReject || "");
      void handleProposalDecision(id, "reject");
    }
  });

  dom.createUserBtn.addEventListener("click", () => {
    void createOrUpdateUserFromPanel();
  });

  dom.syncPointsBtn.addEventListener("click", () => {
    void requestPointsSync();
  });

  document.getElementById("pointsCsvImport")?.addEventListener("change", handleCsvImportClick);
  document.getElementById("importPointsBtn")?.addEventListener("click", () => {
    void submitCsvImport();
  });
  document.getElementById("exportPointsCsvBtn")?.addEventListener("click", () => {
    showToast("CSV export coming soon!", "info");
  });

  dom.refreshUsersBtn.addEventListener("click", () => {
    void refreshUserList();
  });

  dom.refreshContactBtn?.addEventListener("click", () => {
    void refreshContactInbox();
  });

  dom.contactInboxList?.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const deleteBtn = target.closest("button[data-contact-delete]");
    if (!deleteBtn) return;
    const id = String(deleteBtn.dataset.contactDelete || "");
    void deleteContactMessage(id);
  });

  dom.applyDemoRoleBtn?.addEventListener("click", applyDemoRolePreview);
  dom.demoRoleSelect?.addEventListener("change", () => {
    if (!dom.demoRoleSelect?.value) clearDemoRolePreview({ quiet: true });
  });
  dom.clearDemoRoleBtn?.addEventListener("click", clearDemoRolePreview);
  dom.exitDemoRoleBtn?.addEventListener("click", clearDemoRolePreview);

  dom.createBackupBtn.addEventListener("click", () => {
    void createSystemBackup();
  });

  dom.refreshBackupsBtn.addEventListener("click", () => {
    void refreshBackupList();
  });

  dom.userSearch.addEventListener("input", renderUserList);

  dom.userList.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest("button[data-user-edit]");
    if (!button) return;
    const uid = String(button.dataset.userEdit || "");
    const profile = userProfiles.find(item => item.uid === uid || item.id === uid);
    if (!profile) return;
    dom.userNameInput.value = String(profile.name || "");
    dom.userEmailInput.value = String(profile.email || "");
    dom.userRoleSelect.value = normalizeRole(profile.role || "staff");
    dom.userPasswordInput.value = "";
    setUserAdminStatus(`Loaded ${profile.email || profile.uid} for editing.`);
  });

  dom.catalogAddPathBtn.addEventListener("click", () => {
    const categoryName = String(dom.catalogCategoryInput.value || "").trim();
    const eventName = String(dom.catalogEventInput.value || "").trim();
    const subeventName = String(dom.catalogSubeventInput.value || "").trim();
    if (!categoryName || !eventName || !subeventName) {
      showToast("Enter category, event, and subevent.", "warn");
      return;
    }
    void addCatalogPath(categoryName, eventName, subeventName);
  });

  dom.recentReasons?.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest("button[data-reason-chip]");
    if (!button) return;
    const reason = String(button.dataset.reasonChip || "").trim();
    if (!reason) return;
    dom.reasonInput.value = reason;
    const comboInput = document.getElementById("reasonComboInput");
    if (comboInput) comboInput.value = reason;
    showToast("Reason applied from recent history.", "info");
  });

  dom.backupList.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const renameBtn = target.closest("button[data-backup-rename]");
    if (renameBtn) {
      void renameSystemBackup(String(renameBtn.dataset.backupRename || ""));
      return;
    }
    const restoreBtn = target.closest("button[data-backup-restore]");
    if (restoreBtn) {
      void restoreSystemBackup(String(restoreBtn.dataset.backupRestore || ""));
      return;
    }
    const deleteBtn = target.closest("button[data-backup-delete]");
    if (deleteBtn) {
      void deleteSystemBackup(String(deleteBtn.dataset.backupDelete || ""));
    }
  });

  window.addEventListener("keydown", event => {
    if (event.key === "?" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const target = event.target;
      const typing = target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if (!typing) {
        event.preventDefault();
        if (dom.helpDialog?.hidden) openHelpDialog();
        else closeHelpDialog();
        return;
      }
    }
    if (event.key !== "Escape") return;
    if (dom.helpDialog && !dom.helpDialog.hidden) closeHelpDialog();
    if (!dom.accountDialog.hidden) closeAccountDialog();
    if (!dom.adminDialog.hidden) closeAdminDialog();
    if (dom.workspaceDialog && !dom.workspaceDialog.hidden) closeWorkspaceDialog();
    if (dom.notificationsPanel && !dom.notificationsPanel.hidden) closeNotificationsPanel();
    // Close email and tag modals on Escape
    const emailModal = document.getElementById("emailContactFormModal");
    const tagModal = document.getElementById("tagModalOverlay");
    if (emailModal && !emailModal.hidden) closeEmailContactForm();
    if (tagModal && !tagModal.hidden && tagModalController) tagModalController.close();
  });

  // Email contact form listeners
  document.getElementById("emailContactBtn")?.addEventListener("click", openEmailContactForm);
  document.getElementById("closeEmailFormBtn")?.addEventListener("click", closeEmailContactForm);
  document.getElementById("cancelEmailFormBtn")?.addEventListener("click", closeEmailContactForm);
  document.getElementById("sendEmailFormBtn")?.addEventListener("click", () => void sendEmailContactForm());

  const emailModal = document.getElementById("emailContactFormModal");
  emailModal?.querySelector(".email-modal-scrim")?.addEventListener("click", closeEmailContactForm);
}

function stopLiveListeners() {
  unsubScores?.();
  unsubAudit?.();
  unsubProposals?.();
  unsubScores = null;
  unsubAudit = null;
  unsubProposals = null;
}

function startLiveListeners() {
  if (TEST_MODE) return;
  stopLiveListeners();

  // Load event tags from Firestore
  void loadFirestoreTags();

  unsubScores = onSnapshot(scoresDoc, snapshot => {
    if (!snapshot.exists()) {
      setSyncStatus("No score document found.", "warn");
      return;
    }
    updateFromScoresDoc(snapshot.data());
    refreshAllUi();
  }, error => {
    console.error(error);
    setSyncStatus("Disconnected from live scores.", "warn");
  });

  unsubAudit = onSnapshot(
    query(collection(scoresDoc, "auditLog"), orderBy("createdAtMs", "desc"), limit(MAX_ACTIVITY_ENTRIES)),
    snapshot => {
      auditEntries = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      renderReasonTracker();
      renderHistoryList();
      renderActivityList();
      updateQuickStats();
    },
    error => {
      console.error(error);
      showToast("Failed to load activity log.", "warn");
    }
  );

  const proposalQuery = can("approveProposals")
    ? query(collection(scoresDoc, "pendingProposals"), orderBy("createdAtMs", "desc"), limit(200))
    : query(collection(scoresDoc, "pendingProposals"), where("createdByUid", "==", currentUserUid), orderBy("createdAtMs", "desc"), limit(200));

  unsubProposals = onSnapshot(proposalQuery, snapshot => {
    pendingProposals = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
    renderProposalList();
    renderHistoryStats();
  }, error => {
    console.error(error);
    showToast("Failed to load proposal queue.", "warn");
  });
}

// Simple HTML escaping utility
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text || "").replace(/[&<>"']/g, ch => map[ch]);
}

// ============================================================================
// Firestore Tag Loading (NEW)
// ============================================================================

async function loadFirestoreTags() {
  try {
    const tagsSnap = await getDocs(query(collection(db, "eventTags"), where("isActive", "!=", false)));
    const firestoreTags = tagsSnap.docs.map(doc => ({
      id: doc.id,
      name: doc.data().name || "",
      category: doc.data().category || "",
      usage: doc.data().usage || { count: 0 },
      normalized: doc.data().normalized || normalizeTag(doc.data().name || "")
    }));

    // Store in allEventTags for rendering
    allEventTags = firestoreTags.sort((a, b) => (b.usage.count || 0) - (a.usage.count || 0));
  } catch (err) {
    console.warn("Failed to load event tags from Firestore:", err);
    // Fall back to empty array - tags are optional
    allEventTags = [];
  }
}

// Update renderTagSuggestions to use Firestore tags
function renderFirestoreTagSuggestions(input) {
  const suggestionsDiv = dom.tagSuggestions;
  if (!suggestionsDiv) return;

  if (!input || input.length < 1) {
    suggestionsDiv.innerHTML = "";
    return;
  }

  // Find matching tags using fuzzy matching
  const normalized = normalizeTag(input);
  const scored = allEventTags.map(tag => ({
    ...tag,
    score: calculateTagSimilarity(input, tag.name),
    usageBoost: Math.min((tag.usage?.count || 0), 3)  // Max 3 point boost
  }))
  .filter(t => t.score >= 0.5 || t.score + t.usageBoost >= 0.6)
  .sort((a, b) => (b.score + b.usageBoost) - (a.score + a.usageBoost))
  .slice(0, 8);

  if (scored.length === 0 && input.length > 0) {
    // Show "create custom" option
    suggestionsDiv.innerHTML = `<div class="tag-suggestion-item" data-tag="custom:${input}">✚ Create: "${escapeHtml(input)}"</div>`;
    suggestionsDiv.querySelector(".tag-suggestion-item")?.addEventListener("click", () => {
      addTagChip(`[Custom] ${input}`);
      suggestionsDiv.innerHTML = "";
      if (dom.tagSearchInput) dom.tagSearchInput.value = "";
    });
    return;
  }

  suggestionsDiv.innerHTML = scored.map(tag => {
    const scoreStr = (tag.score * 100).toFixed(0);
    const category = tag.category ? `<span class="tag-suggestion-category">${escapeHtml(tag.category)}</span>` : "";
    const usage = tag.usage?.count ? `<span class="tag-suggestion-meta">${tag.usage.count}x</span>` : "";
    return `<div class="tag-suggestion-item" data-tag="${escapeHtml(tag.name)}">${escapeHtml(tag.name)} ${category}${usage}</div>`;
  }).join("");

  // Wire click handlers
  suggestionsDiv.querySelectorAll(".tag-suggestion-item").forEach(item => {
    item.addEventListener("click", () => {
      const tag = item.dataset.tag || "";
      if (tag.startsWith("custom:")) {
        addTagChip(tag.substring(7));
      } else {
        addTagChip(tag);
      }
      suggestionsDiv.innerHTML = "";
      if (dom.tagSearchInput) dom.tagSearchInput.value = "";
    });
  });
}

function bootAuth() {
  if (TEST_MODE) {
    dom.loginBox.style.display = "grid";
    dom.mainPanel.style.display = "none";
    return;
  }

  onAuthStateChanged(auth, async user => {
    console.log("🔄 Auth state changed. User:", user ? user.email : "null");
    if (!user) {
      console.log("📵 No user, showing login box");
      stopLiveListeners();
      dom.loginBox.style.display = "grid";
      dom.mainPanel.style.display = "none";
      dom.passwordInput.value = "";
      setLoginResetStatus("");
      resetSignedOutUi();
      return;
    }

    console.log("👤 User authenticated:", user.email);
    try {
      const token = await user.getIdTokenResult();
      console.log("✅ Got ID token");
      const role = await resolveAccessRole(user, token.claims || {});
      console.log("🔍 Resolved role:", role);
      if (!role) {
        console.error("❌ No role found for user");
        await signOut(auth);
        setAuthError("This account does not have control-panel access. Contact Noah Baker (admin).");
        return;
      }

      console.log("✅ Authentication successful, showing dashboard");
      setAuthError("");
      dom.loginBox.style.display = "none";
      dom.mainPanel.style.display = "block";
      applySessionIdentity({
        email: user.email || "",
        uid: user.uid,
        role
      });

      await refreshUserList();

      // Initialize tag library for tag-based scoring
      if (!tagLibrary) {
        tagLibrary = new TagLibrary();
        await tagLibrary.load();
      }
      if (!tagModalController) {
        tagModalController = new TagModalController(tagLibrary);
      }

      startLiveListeners();
    } catch (error) {
      console.error("❌ Error during authentication flow:", error);
      setAuthError(`Authentication error: ${error?.message || "Unknown error"}`);
      await signOut(auth);
    }
  });
}

// ============ PWA SERVICE WORKER ============
if ("serviceWorker" in navigator && ENABLE_PWA) {
  navigator.serviceWorker
    .register("./service-worker.js", { scope: "./" })
    .catch(error => {
      console.warn("Service worker registration failed:", error?.message || error);
    });
}

// ============ ANALYTICS DASHBOARD ============
const REJECTION_REASON_TEMPLATES = [
  "Duplicate submission",
  "Invalid scoring",
  "Missing documentation",
  "Out of scope",
  "Insufficient evidence",
  "Rule violation",
  "Other (please comment)"
];

let analyticsCharts = {};
let approvalComments = {};

function renderAnalyticsDashboard() {
  if (activeWorkspace !== "analytics") return;

  setTimeout(() => {
    const startDate = document.getElementById("analyticsStartDate")?.value || "";
    const endDate = document.getElementById("analyticsEndDate")?.value || "";

    const filtered = auditEntries.filter(entry => {
      const entryMs = Number(entry.createdAtMs || 0);
      const start = startDate ? new Date(startDate).getTime() : 0;
      const end = endDate ? new Date(endDate).getTime() + 86400000 : Infinity;
      return entryMs >= start && entryMs <= end;
    });

    // Render new analytics improvements
    renderAnalyticsSummaryCards();
    checkAnomalies();
    populateTagFilter();
    renderFairPlayAudit();

    // Render existing charts
    renderChartPointsByHouse(filtered);
    renderChartTopScorers(filtered);
    renderChartPointsByTag(filtered);
    renderChartHistoricalTrend(filtered);
  }, 100);
}

function renderChartPointsByHouse(entries) {
  const canvas = document.getElementById("chartPointsByHouse");
  if (!canvas) return;

  const data = { red: 0, white: 0, blue: 0, silver: 0 };
  entries.forEach(entry => {
    if (entry.type === "delta" && entry.changes) {
      data.red = (data.red || 0) + Number(entry.changes.red || 0);
      data.white = (data.white || 0) + Number(entry.changes.white || 0);
      data.blue = (data.blue || 0) + Number(entry.changes.blue || 0);
      data.silver = (data.silver || 0) + Number(entry.changes.silver || 0);
    }
  });

  if (analyticsCharts.pointsByHouse) analyticsCharts.pointsByHouse.destroy();

  const ctx = canvas.getContext("2d");
  analyticsCharts.pointsByHouse = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Red Panda", "Polar", "Grizzly", "Kodiak"],
      datasets: [{
        data: [data.red, data.white, data.blue, data.silver],
        backgroundColor: ["#ea0125", "#fffeff", "#005ab5", "#a7a7aa"],
        borderColor: "#fff",
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } }
    }
  });
}

function renderChartTopScorers(entries) {
  const canvas = document.getElementById("chartTopScorers");
  if (!canvas) return;

  const scorers = {};
  entries.forEach(entry => {
    if (entry.type === "delta" && entry.actorEmail) {
      const total = (Number(entry.changes?.red || 0) + Number(entry.changes?.white || 0) +
                    Number(entry.changes?.blue || 0) + Number(entry.changes?.silver || 0));
      if (total > 0) {
        scorers[entry.actorEmail] = (scorers[entry.actorEmail] || 0) + total;
      }
    }
  });

  const sorted = Object.entries(scorers)
    .map(([email, points]) => ({ email: email.split("@")[0], points }))
    .sort((a, b) => b.points - a.points)
    .slice(0, 10);

  if (analyticsCharts.topScorers) analyticsCharts.topScorers.destroy();

  const ctx = canvas.getContext("2d");
  analyticsCharts.topScorers = new Chart(ctx, {
    type: "bar",
    data: {
      labels: sorted.map(s => s.email),
      datasets: [{
        label: "Points Awarded",
        data: sorted.map(s => s.points),
        backgroundColor: "#406ac8",
        borderRadius: 6
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } }
    }
  });
}

function renderChartPointsByTag(entries) {
  const canvas = document.getElementById("chartPointsByTag");
  if (!canvas) return;

  const tags = {};
  entries.forEach(entry => {
    if (entry.tags && Array.isArray(entry.tags)) {
      const total = Number(entry.changes?.red || 0) + Number(entry.changes?.white || 0) +
                   Number(entry.changes?.blue || 0) + Number(entry.changes?.silver || 0);
      entry.tags.forEach(tag => {
        tags[tag] = (tags[tag] || 0) + total;
      });
    }
  });

  const sorted = Object.entries(tags)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  if (analyticsCharts.pointsByTag) analyticsCharts.pointsByTag.destroy();

  const ctx = canvas.getContext("2d");
  analyticsCharts.pointsByTag = new Chart(ctx, {
    type: "bar",
    data: {
      labels: sorted.map(s => s[0]),
      datasets: [{
        label: "Points",
        data: sorted.map(s => s[1]),
        backgroundColor: "#1d9f5f",
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } }
    }
  });
}

function renderChartHistoricalTrend(entries) {
  const canvas = document.getElementById("chartHistoricalTrend");
  if (!canvas) return;

  const byDate = {};
  entries.forEach(entry => {
    if (entry.type === "delta") {
      const date = new Date(Number(entry.createdAtMs || 0)).toLocaleDateString();
      const total = Number(entry.changes?.red || 0) + Number(entry.changes?.white || 0) +
                   Number(entry.changes?.blue || 0) + Number(entry.changes?.silver || 0);
      byDate[date] = (byDate[date] || 0) + total;
    }
  });

  const sorted = Object.entries(byDate)
    .sort((a, b) => new Date(a[0]) - new Date(b[0]))
    .slice(-30);

  if (analyticsCharts.trend) analyticsCharts.trend.destroy();

  const ctx = canvas.getContext("2d");
  analyticsCharts.trend = new Chart(ctx, {
    type: "line",
    data: {
      labels: sorted.map(s => s[0]),
      datasets: [{
        label: "Daily Points Awarded",
        data: sorted.map(s => s[1]),
        borderColor: "#406ac8",
        backgroundColor: "rgba(64, 106, 200, 0.1)",
        tension: 0.4,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: true } }
    }
  });
}

function exportAnalyticsCsv() {
  const filtered = auditEntries.filter(e => e.type === "delta");
  const rows = [
    ["Date", "Actor", "House", "Points", "Reason", "Notes"],
    ...filtered.map(e => [
      new Date(Number(e.createdAtMs || 0)).toLocaleString(),
      e.actorEmail || "",
      "All",
      Object.values(e.changes || {}).reduce((a, b) => a + Number(b), 0),
      e.summary || "",
      e.notes || ""
    ])
  ];

  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `analytics_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportAnalyticsPdf() {
  const text = "PDF export requires additional library. Please use CSV export instead.";
  showToast(text, "warn");
}

// ============ ANALYTICS IMPROVEMENTS ============

function renderAnalyticsSummaryCards() {
  const container = document.getElementById("analyticsSummaryCards");
  if (!container) return;

  // Calculate house performance metrics
  const scores = currentScores || { red: 0, white: 0, blue: 0, silver: 0 };
  const total = Object.values(scores).reduce((a, b) => a + b, 0);

  // Calculate trends (compare with last 7 days)
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const recentEntries = auditEntries.filter(e => e.createdAtMs > sevenDaysAgo);
  const recentByHouse = { red: 0, white: 0, blue: 0, silver: 0 };
  recentEntries.forEach(e => {
    const c = e.changes || {};
    recentByHouse.red += c.red || 0;
    recentByHouse.white += c.white || 0;
    recentByHouse.blue += c.blue || 0;
    recentByHouse.silver += c.silver || 0;
  });

  const cards = houses.map(house => {
    const current = scores[house.id] || 0;
    const previous = recentByHouse[house.id] || 0;
    const trend = previous > 0 ? ((current - previous) / previous * 100).toFixed(0) : 0;
    const trendIcon = trend > 0 ? "↑" : trend < 0 ? "↓" : "→";
    const trendClass = trend > 0 ? "analytics-trend-up" : trend < 0 ? "analytics-trend-down" : "analytics-trend-neutral";

    return `
      <div class="analytics-summary-card">
        <div class="analytics-summary-card-title">🏆 ${house.name}</div>
        <div class="analytics-summary-card-value">${current}</div>
        <div class="analytics-summary-card-meta">
          <span class="${trendClass}">${trendIcon} ${Math.abs(trend)}%</span>
          <span style="color: var(--muted);">vs 7d avg</span>
        </div>
      </div>
    `;
  }).join("");

  container.innerHTML = cards;
}

function checkAnomalies() {
  const alertContainer = document.getElementById("anomalyAlert");
  if (!alertContainer) return;

  // Check for unusual activity in last 2 hours
  const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
  const recent = auditEntries.filter(e => e.createdAtMs > twoHoursAgo);

  const totalRecentPoints = recent.reduce((sum, e) => {
    const c = e.changes || {};
    return sum + Math.abs((c.red || 0) + (c.white || 0) + (c.blue || 0) + (c.silver || 0));
  }, 0);

  // Anomaly threshold: 5x normal (20 pts/hr × 2hrs = 40pts normal, >200 is anomaly)
  const NORMAL_PER_HOUR = 20;
  const threshold = NORMAL_PER_HOUR * 2 * 5;

  if (totalRecentPoints > threshold && recent.length > 0) {
    const topHouse = recent.reduce((acc, e) => {
      const c = e.changes || {};
      const point = Math.abs((c.red || 0) + (c.white || 0) + (c.blue || 0) + (c.silver || 0));
      return point > acc.points ? { ...acc, points: point, entry: e } : acc;
    }, { points: 0 });

    const houseName = houses.find(h => h.id === Object.keys(topHouse.entry?.changes || {})[0])?.name || "Unknown";
    alertContainer.innerHTML = `
      <div class="analytics-anomaly-alert-text">
        ⚠️ <strong>${houseName}</strong> received +${totalRecentPoints} pts in 2 hours (avg: 40 pts/2hr)
      </div>
    `;
    alertContainer.hidden = false;
  } else {
    alertContainer.hidden = true;
  }
}

function populateTagFilter() {
  const select = document.getElementById("analyticsTagFilter");
  if (!select) return;

  // Get unique tags from audit entries
  const tags = new Set();
  auditEntries.forEach(e => {
    if (e.context?.reason) tags.add(e.context.reason);
  });

  const options = Array.from(tags)
    .sort()
    .map(tag => `<option value="${tag}">${tag}</option>`)
    .join("");

  select.innerHTML = '<option value="">All Tags</option>' + options;
}

function renderFairPlayAudit() {
  const section = document.getElementById("analyticsAuditSection");
  const table = document.getElementById("auditTrailTable");
  if (!section || !table || !can("approveProposals")) return;

  section.hidden = false;

  // Aggregate scoring by user/admin
  const adminMetrics = {};
  auditEntries.forEach(e => {
    const admin = e.createdByEmail || "unknown";
    if (!adminMetrics[admin]) {
      adminMetrics[admin] = { scores: 0, totalPoints: 0, reasons: {} };
    }
    adminMetrics[admin].scores += 1;
    const c = e.changes || {};
    const points = Math.abs((c.red || 0) + (c.white || 0) + (c.blue || 0) + (c.silver || 0));
    adminMetrics[admin].totalPoints += points;
    if (e.context?.reason) adminMetrics[admin].reasons[e.context.reason] = (adminMetrics[admin].reasons[e.context.reason] || 0) + 1;
  });

  const rows = Object.entries(adminMetrics)
    .sort((a, b) => b[1].totalPoints - a[1].totalPoints)
    .map(([admin, data]) => {
      const topReason = Object.entries(data.reasons).sort((a, b) => b[1] - a[1])[0];
      return `
        <div class="audit-trail-row">
          <div class="audit-admin-name">${admin}</div>
          <div style="color: var(--muted); font-size: 12px;">
            ${topReason ? `Top: ${topReason[0]} (${topReason[1]}x)` : "No reasons tracked"}
          </div>
          <div class="audit-metrics">
            <div class="audit-metric">
              <div class="audit-metric-label">Entries</div>
              <div class="audit-metric-value">${data.scores}</div>
            </div>
            <div class="audit-metric">
              <div class="audit-metric-label">Total Pts</div>
              <div class="audit-metric-value">${data.totalPoints}</div>
            </div>
            <div class="audit-metric">
              <div class="audit-metric-label">Avg/Entry</div>
              <div class="audit-metric-value">${(data.totalPoints / data.scores).toFixed(0)}</div>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  table.innerHTML = rows || '<div style="padding: 12px; color: var(--muted);">No audit data available</div>';
}



// ============ APPROVAL WORKFLOW ENHANCEMENTS ============

function renderProposalListEnhanced() {
  if (!dom.proposalList) return;
  const visible = can("approveProposals")
    ? pendingProposals.filter(proposal => proposal.status === "pending")
    : pendingProposals.filter(proposal => proposal.status === "pending" && proposal.createdByUid === currentUserUid);

  if (!visible.length) {
    dom.proposalList.innerHTML = '<li class="log-empty">No pending suggestions</li>';
    return;
  }

  dom.proposalList.innerHTML = visible.map(proposal => {
    const changes = proposal.changes || {};
    const pathText = proposal.actionType === "path_request"
      ? `${escapeHtml(proposal.pathRequest?.categoryName || "")} > ${escapeHtml(proposal.pathRequest?.eventName || "")} > ${escapeHtml(proposal.pathRequest?.subeventName || "")}`
      : (proposal.context?.pathLabel
        ? escapeHtml(String(proposal.context.pathLabel))
        : `${escapeHtml(String(proposal.context?.categoryName || ""))} > ${escapeHtml(String(proposal.context?.eventName || ""))} > ${escapeHtml(String(proposal.context?.subeventName || ""))}`);

    const meta = `${new Date(Number(proposal.createdAtMs || Date.now())).toLocaleString()} · ${escapeHtml(proposal.createdByEmail || "unknown")}`;
    const title = proposal.actionType === "path_request"
      ? `Path Request: ${pathText}`
      : escapeHtml(proposal.reason || "Score Suggestion");

    const chips = proposal.actionType === "path_request"
      ? ""
      : `<div class="history-delta-strip">
          <span class="history-delta-chip ${Number(changes.red || 0) > 0 ? "delta-pos" : (Number(changes.red || 0) < 0 ? "delta-neg" : "")}">R ${Number(changes.red || 0) > 0 ? "+" : ""}${Number(changes.red || 0)}</span>
          <span class="history-delta-chip ${Number(changes.white || 0) > 0 ? "delta-pos" : (Number(changes.white || 0) < 0 ? "delta-neg" : "")}">W ${Number(changes.white || 0) > 0 ? "+" : ""}${Number(changes.white || 0)}</span>
          <span class="history-delta-chip ${Number(changes.blue || 0) > 0 ? "delta-pos" : (Number(changes.blue || 0) < 0 ? "delta-neg" : "")}">B ${Number(changes.blue || 0) > 0 ? "+" : ""}${Number(changes.blue || 0)}</span>
          <span class="history-delta-chip ${Number(changes.silver || 0) > 0 ? "delta-pos" : (Number(changes.silver || 0) < 0 ? "delta-neg" : "")}">S ${Number(changes.silver || 0) > 0 ? "+" : ""}${Number(changes.silver || 0)}</span>
        </div>`;

    const status = proposal.rejectionReason
      ? `<span class="proposal-status-badge proposal-status-rejected">Rejected</span>`
      : `<span class="proposal-status-badge proposal-status-pending">Pending</span>`;

    const rejection = proposal.rejectionReason
      ? `<div class="proposal-rejection-reason">Rejected: ${escapeHtml(String(proposal.rejectionReason))}</div>`
      : "";

    const commentsHtml = approvalComments[proposal.id]?.length > 0
      ? `<div class="proposal-comments">${approvalComments[proposal.id].map(c =>
          `<div class="proposal-comment"><span class="proposal-comment-author">${escapeHtml(String(c.author || ""))}:</span> ${escapeHtml(String(c.text || ""))}<br><span class="proposal-comment-time">${new Date(c.timestamp).toLocaleString()}</span></div>`
        ).join("")}</div>`
      : "";

    return `
      <li class="proposal-item">
        <div>
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
            <strong>${title}</strong>
            ${status}
          </div>
          <div class="proposal-meta">${meta}</div>
          <div class="proposal-meta">${pathText}</div>
          ${chips}
          ${proposal.notes ? `<div class="proposal-meta">Notes: ${escapeHtml(String(proposal.notes))}</div>` : ""}
          ${commentsHtml}
          ${rejection}
        </div>
        <div class="proposal-actions">
          ${can("approveProposals") ? `<button class="btn btn-primary btn-mini" type="button" data-proposal-approve="${escapeHtml(proposal.id)}">Approve</button>` : ""}
          ${can("approveProposals") ? `<button class="btn btn-outline btn-mini" type="button" data-proposal-reject-show="${escapeHtml(proposal.id)}">Reject</button>` : ""}
        </div>
      </li>
    `;
  }).join("");
}

function updateApprovalBadge() {
  const count = pendingProposals.filter(p => p.status === "pending").length;
  const tab = document.querySelector("[data-workspace-tab='queue']");
  if (!tab) return;

  const existing = tab.querySelector(".approval-count-badge");
  if (existing) existing.remove();

  if (count > 0 && can("approveProposals")) {
    const badge = document.createElement("span");
    badge.className = "approval-count-badge";
    badge.textContent = String(count);
    tab.appendChild(badge);
  }
}

// Update event listeners section to include new functionality
if (document.getElementById("analyticsFilterBtn")) {
  document.getElementById("analyticsFilterBtn").addEventListener("click", renderAnalyticsDashboard);
  document.getElementById("analyticsStartDate").addEventListener("change", renderAnalyticsDashboard);
  document.getElementById("analyticsEndDate").addEventListener("change", renderAnalyticsDashboard);
  document.getElementById("analyticsExportCsvBtn").addEventListener("click", exportAnalyticsCsv);
  document.getElementById("analyticsExportPdfBtn").addEventListener("click", exportAnalyticsPdf);
}

if (document.getElementById("bulkApproveBtn")) {
  document.getElementById("bulkApproveBtn").addEventListener("click", () => {
    const pending = pendingProposals.filter(p => p.status === "pending");
    pending.forEach(p => handleProposalDecision(p.id, "approve"));
  });
  document.getElementById("bulkRejectBtn").addEventListener("click", () => {
    const pending = pendingProposals.filter(p => p.status === "pending");
    pending.forEach(p => handleProposalDecision(p.id, "reject"));
  });
}

if (document.getElementById("approvalStatusFilter")) {
  document.getElementById("approvalStatusFilter").addEventListener("change", renderProposalListEnhanced);
  document.getElementById("approvalHouseFilter").addEventListener("change", renderProposalListEnhanced);
}
