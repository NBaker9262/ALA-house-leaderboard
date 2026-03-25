import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getFirestore,
  doc,
  runTransaction,
  onSnapshot,
  getDoc,
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

const ROLE_PERMISSIONS = {
  superadmin: {
    scoreEdit: true,
    placeAwards: true,
    historyAccess: true,
    restoreHistory: true,
    checkpoint: true,
    downloadBackup: true,
    resetAll: true,
    notes: true,
    passwordReset: true,
    simpleToggle: true,
    manageUsers: true
  },
  admin: {
    scoreEdit: true,
    placeAwards: true,
    historyAccess: true,
    restoreHistory: true,
    checkpoint: true,
    downloadBackup: false,
    resetAll: false,
    notes: true,
    passwordReset: true,
    simpleToggle: true,
    manageUsers: false
  },
  staff: {
    scoreEdit: true,
    placeAwards: false,
    historyAccess: false,
    restoreHistory: false,
    checkpoint: false,
    downloadBackup: false,
    resetAll: false,
    notes: false,
    passwordReset: true,
    simpleToggle: false,
    manageUsers: false
  }
};

const PERMISSION_DEFINITIONS = [
  { key: "scoreEdit", label: "Edit Scores" },
  { key: "placeAwards", label: "Place Awards" },
  { key: "historyAccess", label: "History Access" },
  { key: "restoreHistory", label: "Restore" },
  { key: "checkpoint", label: "Checkpoint" },
  { key: "downloadBackup", label: "Download" },
  { key: "resetAll", label: "Reset" },
  { key: "notes", label: "Notes" },
  { key: "passwordReset", label: "Password Reset" },
  { key: "simpleToggle", label: "Simple View" },
  { key: "manageUsers", label: "Manage Users" }
];

const HOUSE_ORDER = ["red", "white", "blue", "silver"];

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const scoresDoc = doc(db, "leaderboard", "scores");

const dom = {
  loginShell: document.getElementById("loginShell"),
  loginForm: document.getElementById("loginForm"),
  email: document.getElementById("email"),
  password: document.getElementById("password"),
  authError: document.getElementById("authError"),
  signInBtn: document.getElementById("signInBtn"),
  app: document.getElementById("app"),
  whoEmail: document.getElementById("whoEmail"),
  whoRole: document.getElementById("whoRole"),
  signOutBtn: document.getElementById("signOutBtn"),
  scoreRed: document.getElementById("scoreRed"),
  scoreWhite: document.getElementById("scoreWhite"),
  scoreBlue: document.getElementById("scoreBlue"),
  scoreSilver: document.getElementById("scoreSilver"),
  permissionGrid: document.getElementById("permissionGrid"),
  eventName: document.getElementById("eventName"),
  startEventBtn: document.getElementById("startEventBtn"),
  closeEventBtn: document.getElementById("closeEventBtn"),
  deleteLastGameBtn: document.getElementById("deleteLastGameBtn"),
  activeEventCard: document.getElementById("activeEventCard"),
  gameName: document.getElementById("gameName"),
  deltaRed: document.getElementById("deltaRed"),
  deltaWhite: document.getElementById("deltaWhite"),
  deltaBlue: document.getElementById("deltaBlue"),
  deltaSilver: document.getElementById("deltaSilver"),
  saveGameBtn: document.getElementById("saveGameBtn"),
  clearGameBtn: document.getElementById("clearGameBtn"),
  quickHouse: document.getElementById("quickHouse"),
  quickButtons: Array.from(document.querySelectorAll("[data-quick]")),
  eventsList: document.getElementById("eventsList"),
  historyList: document.getElementById("historyList"),
  refreshBtn: document.getElementById("refreshBtn"),
  clearEventsBtn: document.getElementById("clearEventsBtn"),
  status: document.getElementById("status")
};

let currentUser = null;
let currentRole = "staff";
let currentPermissions = { ...ROLE_PERMISSIONS.staff };
let currentScores = { red: 0, white: 0, blue: 0, silver: 0 };
let currentState = defaultEventFlowState();
let unsubscribeScores = null;
let writeCount = 0;

function defaultEventFlowState() {
  return {
    activeEventId: "",
    nextEventId: 1,
    nextGameId: 1,
    events: [],
    history: []
  };
}

function normalizeRole(role) {
  if (role === "superadmin" || role === "admin" || role === "staff") return role;
  return "staff";
}

function normalizeRoleFromClaims(claims) {
  if (claims?.role === "superadmin") return "superadmin";
  if (claims?.role === "admin") return "admin";
  if (claims?.role === "staff") return "staff";
  if (claims?.superadmin) return "superadmin";
  if (claims?.admin) return "admin";
  return "staff";
}

function sanitizePermissionMap(raw) {
  const cleaned = {};
  PERMISSION_DEFINITIONS.forEach(({ key }) => {
    if (typeof raw?.[key] === "boolean") cleaned[key] = raw[key];
  });
  return cleaned;
}

function resolvePermissions(role, overrides = {}) {
  const base = ROLE_PERMISSIONS[normalizeRole(role)] || ROLE_PERMISSIONS.staff;
  return { ...base, ...sanitizePermissionMap(overrides) };
}

function calculatePermissionOverrides(role, absolutePermissions = {}) {
  const base = ROLE_PERMISSIONS[normalizeRole(role)] || ROLE_PERMISSIONS.staff;
  const clean = sanitizePermissionMap(absolutePermissions);
  const overrides = {};
  PERMISSION_DEFINITIONS.forEach(({ key }) => {
    if (typeof clean[key] === "boolean" && clean[key] !== base[key]) {
      overrides[key] = clean[key];
    }
  });
  return overrides;
}

function resolveAccessState(profileData, claims = {}) {
  const claimRole = normalizeRoleFromClaims(claims);
  const profileRole = normalizeRole(profileData?.role);
  const hasClaimRole = Boolean(claims?.role || claims?.superadmin || claims?.admin);
  const resolvedRole = profileData?.role ? profileRole : (hasClaimRole ? claimRole : "staff");

  const claimPermissions = sanitizePermissionMap(claims?.permissions);
  const profileOverrides = sanitizePermissionMap(profileData?.permissionOverrides);
  const profilePermissions = sanitizePermissionMap(profileData?.permissions);

  const resolvedOverrides = Object.keys(profileOverrides).length
    ? profileOverrides
    : Object.keys(profilePermissions).length
      ? calculatePermissionOverrides(resolvedRole, profilePermissions)
      : Object.keys(claimPermissions).length
        ? calculatePermissionOverrides(resolvedRole, claimPermissions)
        : {};

  return {
    role: resolvedRole,
    overrides: resolvedOverrides
  };
}

function can(permission) {
  return Boolean(currentPermissions?.[permission]);
}

function setStatus(text) {
  dom.status.textContent = text;
}

function setAuthError(text) {
  if (!text) {
    dom.authError.hidden = true;
    dom.authError.textContent = "";
    return;
  }
  dom.authError.hidden = false;
  dom.authError.textContent = text;
}

function roleDisplayLabel(role) {
  if (role === "superadmin") return "Super Admin";
  if (role === "admin") return "Admin";
  return "Staff";
}

function timestampLabel(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "-";
  return new Date(ms).toLocaleString();
}

function toInt(value) {
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : 0;
}

function normalizeScores(raw) {
  return {
    red: Math.max(0, toInt(raw?.red)),
    white: Math.max(0, toInt(raw?.white)),
    blue: Math.max(0, toInt(raw?.blue)),
    silver: Math.max(0, toInt(raw?.silver))
  };
}

function houseTotalsBlank() {
  return { red: 0, white: 0, blue: 0, silver: 0 };
}

function normalizeDeltas(raw) {
  return {
    red: toInt(raw?.red),
    white: toInt(raw?.white),
    blue: toInt(raw?.blue),
    silver: toInt(raw?.silver)
  };
}

function hasAnyDelta(deltas) {
  return HOUSE_ORDER.some(house => toInt(deltas[house]) !== 0);
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

function normalizeEventFlow(raw) {
  const base = defaultEventFlowState();
  if (!raw || typeof raw !== "object") return base;

  base.activeEventId = String(raw.activeEventId || "");
  base.nextEventId = Math.max(1, toInt(raw.nextEventId) || 1);
  base.nextGameId = Math.max(1, toInt(raw.nextGameId) || 1);

  const events = Array.isArray(raw.events) ? raw.events : [];
  base.events = events.map(event => ({
    id: String(event.id || ""),
    name: String(event.name || "Untitled Event"),
    status: event.status === "closed" ? "closed" : "open",
    createdAtMs: toInt(event.createdAtMs) || Date.now(),
    createdBy: String(event.createdBy || ""),
    closedAtMs: toInt(event.closedAtMs),
    closedBy: String(event.closedBy || ""),
    totals: normalizeDeltas(event.totals || houseTotalsBlank()),
    games: Array.isArray(event.games)
      ? event.games.map(game => ({
          id: String(game.id || ""),
          name: String(game.name || "Untitled Game"),
          createdAtMs: toInt(game.createdAtMs) || Date.now(),
          createdBy: String(game.createdBy || ""),
          deltas: normalizeDeltas(game.deltas || houseTotalsBlank())
        }))
      : []
  }));

  const history = Array.isArray(raw.history) ? raw.history : [];
  base.history = history
    .map(entry => ({
      id: String(entry.id || ""),
      atMs: toInt(entry.atMs) || Date.now(),
      type: String(entry.type || "event_flow"),
      summary: String(entry.summary || "Update"),
      by: String(entry.by || "")
    }))
    .slice(-500);

  const ids = new Set(base.events.map(event => event.id));
  if (!ids.has(base.activeEventId)) base.activeEventId = "";

  return base;
}

function activeEvent() {
  return currentState.events.find(event => event.id === currentState.activeEventId) || null;
}

function gameDeltaLine(deltas) {
  return `R ${deltas.red >= 0 ? "+" : ""}${deltas.red} | W ${deltas.white >= 0 ? "+" : ""}${deltas.white} | B ${deltas.blue >= 0 ? "+" : ""}${deltas.blue} | S ${deltas.silver >= 0 ? "+" : ""}${deltas.silver}`;
}

function renderScores() {
  dom.scoreRed.textContent = String(currentScores.red);
  dom.scoreWhite.textContent = String(currentScores.white);
  dom.scoreBlue.textContent = String(currentScores.blue);
  dom.scoreSilver.textContent = String(currentScores.silver);
}

function renderPermissionGrid() {
  dom.permissionGrid.innerHTML = PERMISSION_DEFINITIONS.map(({ key, label }) => {
    const allowed = can(key);
    return `
      <article class="perm-card">
        <strong>${label}</strong>
        <span class="${allowed ? "perm-yes" : "perm-no"}">${allowed ? "Allowed" : "Blocked"}</span>
      </article>
    `;
  }).join("");
}

function renderActiveEventCard() {
  const event = activeEvent();
  if (!event) {
    dom.activeEventCard.innerHTML = "<p>No active event.</p>";
    return;
  }

  dom.activeEventCard.innerHTML = `
    <span class="badge badge-open">Open</span>
    <h4>${event.name}</h4>
    <div class="active-meta">
      <span>Started: ${timestampLabel(event.createdAtMs)}</span>
      <span>By: ${event.createdBy || "Unknown"}</span>
    </div>
    <p class="mono">Event Totals: ${gameDeltaLine(event.totals)}</p>
    <p>${event.games.length} game${event.games.length === 1 ? "" : "s"} saved</p>
  `;
}

function renderEventsList() {
  if (!currentState.events.length) {
    dom.eventsList.innerHTML = "<li class=\"stack-item\"><p>No events yet.</p></li>";
    return;
  }

  const sorted = [...currentState.events].sort((a, b) => b.createdAtMs - a.createdAtMs);
  dom.eventsList.innerHTML = sorted.map(event => {
    const badgeClass = event.status === "closed" ? "badge-closed" : "badge-open";
    const games = [...event.games].sort((a, b) => b.createdAtMs - a.createdAtMs).slice(0, 5);
    const gameList = games.length
      ? games.map(game => `<p class="mono">${game.name} -> ${gameDeltaLine(game.deltas)}</p>`).join("")
      : "<p>No games saved yet.</p>";

    return `
      <li class="stack-item">
        <span class="badge ${badgeClass}">${event.status}</span>
        <h4>${event.name}</h4>
        <p>Started ${timestampLabel(event.createdAtMs)} by ${event.createdBy || "Unknown"}</p>
        <p class="mono">Totals: ${gameDeltaLine(event.totals)}</p>
        <p>${event.games.length} game${event.games.length === 1 ? "" : "s"}</p>
        ${gameList}
      </li>
    `;
  }).join("");
}

function renderHistory() {
  if (!currentState.history.length) {
    dom.historyList.innerHTML = "<li class=\"stack-item\"><p>No history yet.</p></li>";
    return;
  }

  const entries = [...currentState.history].sort((a, b) => b.atMs - a.atMs).slice(0, 100);
  dom.historyList.innerHTML = entries.map(entry => `
    <li class="stack-item">
      <h4>${entry.summary}</h4>
      <p>${timestampLabel(entry.atMs)} by ${entry.by || "Unknown"}</p>
      <p class="mono">Type: ${entry.type}</p>
    </li>
  `).join("");
}

function renderEverything() {
  renderScores();
  renderPermissionGrid();
  renderActiveEventCard();
  renderEventsList();
  renderHistory();
  updateControlState();
}

function updateControlState() {
  const canScore = can("scoreEdit");
  const canHistory = can("historyAccess");
  const canReset = can("resetAll");
  const hasEvent = Boolean(activeEvent());

  dom.startEventBtn.disabled = !canScore || hasEvent || writeCount > 0;
  dom.closeEventBtn.disabled = !canScore || !hasEvent || writeCount > 0;
  dom.saveGameBtn.disabled = !canScore || !hasEvent || writeCount > 0;
  dom.clearGameBtn.disabled = writeCount > 0;
  dom.deleteLastGameBtn.disabled = !canHistory || !hasEvent || writeCount > 0;
  dom.clearEventsBtn.disabled = !canReset || writeCount > 0;

  [dom.eventName, dom.gameName, dom.deltaRed, dom.deltaWhite, dom.deltaBlue, dom.deltaSilver].forEach(input => {
    if (!input) return;
    input.disabled = !canScore || writeCount > 0 || (input === dom.eventName && hasEvent);
  });

  dom.quickButtons.forEach(button => {
    button.disabled = !canScore || !hasEvent || writeCount > 0;
  });
  dom.quickHouse.disabled = !canScore || !hasEvent || writeCount > 0;
}

async function withWrite(task, successMessage) {
  writeCount += 1;
  updateControlState();
  try {
    await task();
    setStatus(successMessage);
  } catch (error) {
    console.error(error);
    setStatus(`Write failed: ${error?.message || "Unknown error"}`);
    alert(`Write failed: ${error?.message || "Unknown error"}`);
  } finally {
    writeCount -= 1;
    updateControlState();
  }
}

function pushHistoryEntry(state, type, summary) {
  state.history.push({
    id: `h-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    atMs: Date.now(),
    type,
    summary,
    by: currentUser?.email || ""
  });
  if (state.history.length > 500) {
    state.history = state.history.slice(-500);
  }
}

async function commitEventMutation(mutator, actionType) {
  return runTransaction(db, async transaction => {
    const snap = await transaction.get(scoresDoc);
    const data = snap.exists() ? snap.data() : {};
    const existingScores = normalizeScores(data);
    const existingFlow = normalizeEventFlow(data.eventFlow);

    const nextScores = { ...existingScores };
    const nextFlow = cloneState(existingFlow);

    const result = mutator({ scores: nextScores, eventFlow: nextFlow, raw: data });
    if (!result?.applied) return;

    const updates = {
      red: Math.max(0, toInt(nextScores.red)),
      white: Math.max(0, toInt(nextScores.white)),
      blue: Math.max(0, toInt(nextScores.blue)),
      silver: Math.max(0, toInt(nextScores.silver)),
      eventFlow: nextFlow,
      lastAction: {
        type: actionType,
        summary: result.summary || "Event flow update",
        authorEmail: currentUser?.email || "",
        timestamp: serverTimestamp()
      }
    };

    if (snap.exists()) {
      transaction.update(scoresDoc, updates);
    } else {
      transaction.set(scoresDoc, updates, { merge: true });
    }
  });
}

async function startEvent() {
  if (!can("scoreEdit")) return alert("Your role cannot start events.");
  const name = String(dom.eventName.value || "").trim();
  if (!name) return alert("Enter an event name first.");

  await withWrite(
    () => commitEventMutation(({ eventFlow }) => {
      if (eventFlow.activeEventId) throw new Error("An event is already active.");
      const id = `event-${eventFlow.nextEventId}`;
      const event = {
        id,
        name,
        status: "open",
        createdAtMs: Date.now(),
        createdBy: currentUser?.email || "",
        closedAtMs: 0,
        closedBy: "",
        totals: houseTotalsBlank(),
        games: []
      };

      eventFlow.nextEventId += 1;
      eventFlow.activeEventId = id;
      eventFlow.events.push(event);
      pushHistoryEntry(eventFlow, "start_event", `Started event: ${name}`);
      return { applied: true, summary: `Started event ${name}` };
    }, "start_event"),
    "Event started."
  );

  dom.eventName.value = "";
}

function readGameInput() {
  return {
    name: String(dom.gameName.value || "").trim(),
    deltas: {
      red: toInt(dom.deltaRed.value),
      white: toInt(dom.deltaWhite.value),
      blue: toInt(dom.deltaBlue.value),
      silver: toInt(dom.deltaSilver.value)
    }
  };
}

function clearGameInputs() {
  dom.gameName.value = "";
  dom.deltaRed.value = "0";
  dom.deltaWhite.value = "0";
  dom.deltaBlue.value = "0";
  dom.deltaSilver.value = "0";
}

async function saveGame() {
  if (!can("scoreEdit")) return alert("Your role cannot save games.");
  const payload = readGameInput();

  if (!payload.name) return alert("Enter a game name before saving.");
  if (!hasAnyDelta(payload.deltas)) return alert("Enter at least one point change before saving.");

  await withWrite(
    () => commitEventMutation(({ scores, eventFlow }) => {
      if (!eventFlow.activeEventId) throw new Error("Start an event before saving a game.");
      const event = eventFlow.events.find(item => item.id === eventFlow.activeEventId);
      if (!event) throw new Error("Active event not found.");
      if (event.status !== "open") throw new Error("Active event is closed.");

      const gameId = `game-${eventFlow.nextGameId}`;
      eventFlow.nextGameId += 1;

      event.games.push({
        id: gameId,
        name: payload.name,
        createdAtMs: Date.now(),
        createdBy: currentUser?.email || "",
        deltas: payload.deltas
      });

      HOUSE_ORDER.forEach(house => {
        const delta = toInt(payload.deltas[house]);
        event.totals[house] = toInt(event.totals[house]) + delta;
        scores[house] = Math.max(0, toInt(scores[house]) + delta);
      });

      pushHistoryEntry(eventFlow, "save_game", `Saved game ${payload.name} in ${event.name} (${gameDeltaLine(payload.deltas)})`);
      return { applied: true, summary: `Saved game ${payload.name}` };
    }, "save_game"),
    "Game saved."
  );

  clearGameInputs();
}

async function closeActiveEvent() {
  if (!can("scoreEdit")) return alert("Your role cannot close events.");

  await withWrite(
    () => commitEventMutation(({ eventFlow }) => {
      if (!eventFlow.activeEventId) throw new Error("No active event to close.");
      const event = eventFlow.events.find(item => item.id === eventFlow.activeEventId);
      if (!event) throw new Error("Active event not found.");
      if (event.status !== "open") throw new Error("Event already closed.");

      event.status = "closed";
      event.closedAtMs = Date.now();
      event.closedBy = currentUser?.email || "";
      eventFlow.activeEventId = "";
      pushHistoryEntry(eventFlow, "close_event", `Closed event: ${event.name}`);
      return { applied: true, summary: `Closed event ${event.name}` };
    }, "close_event"),
    "Active event closed."
  );
}

async function deleteLastGame() {
  if (!can("historyAccess")) return alert("Your role cannot delete games.");

  await withWrite(
    () => commitEventMutation(({ scores, eventFlow }) => {
      if (!eventFlow.activeEventId) throw new Error("No active event.");
      const event = eventFlow.events.find(item => item.id === eventFlow.activeEventId);
      if (!event || !event.games.length) throw new Error("No games to delete.");

      const removed = event.games.pop();
      HOUSE_ORDER.forEach(house => {
        const delta = toInt(removed.deltas[house]);
        event.totals[house] = toInt(event.totals[house]) - delta;
        scores[house] = Math.max(0, toInt(scores[house]) - delta);
      });

      pushHistoryEntry(eventFlow, "delete_game", `Deleted last game ${removed.name} from ${event.name}`);
      return { applied: true, summary: `Deleted game ${removed.name}` };
    }, "delete_game"),
    "Last game deleted."
  );
}

async function clearEventData() {
  if (!can("resetAll")) return alert("Your role cannot clear all event data.");
  const accepted = confirm("Clear all event data and history? Score totals will remain unchanged.");
  if (!accepted) return;

  await withWrite(
    () => commitEventMutation(({ eventFlow }) => {
      const next = defaultEventFlowState();
      next.history.push({
        id: `h-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        atMs: Date.now(),
        type: "clear_event_data",
        summary: "Cleared all event data",
        by: currentUser?.email || ""
      });
      Object.assign(eventFlow, next);
      return { applied: true, summary: "Cleared event data" };
    }, "clear_event_data"),
    "Event data cleared."
  );
}

function applyQuickDelta(amount) {
  const house = dom.quickHouse.value;
  const mapping = {
    red: dom.deltaRed,
    white: dom.deltaWhite,
    blue: dom.deltaBlue,
    silver: dom.deltaSilver
  };
  const input = mapping[house];
  if (!input) return;
  input.value = String(toInt(input.value) + amount);
}

function connectScoresSubscription() {
  disconnectScoresSubscription();
  unsubscribeScores = onSnapshot(
    scoresDoc,
    snap => {
      const data = snap.exists() ? snap.data() : {};
      currentScores = normalizeScores(data);
      currentState = normalizeEventFlow(data.eventFlow);
      renderEverything();
      setStatus(`Live • Updated ${new Date().toLocaleTimeString()}`);
    },
    error => {
      console.error(error);
      setStatus("Live connection failed.");
    }
  );
}

function disconnectScoresSubscription() {
  if (typeof unsubscribeScores === "function") unsubscribeScores();
  unsubscribeScores = null;
}

async function resolveUserRole(user) {
  let claims = {};
  try {
    const token = await user.getIdTokenResult(true);
    claims = token?.claims || {};
  } catch (error) {
    console.error(error);
  }

  let profileData = null;
  try {
    const profileSnap = await getDoc(doc(db, "userProfiles", user.uid));
    if (profileSnap.exists()) profileData = profileSnap.data();
  } catch (error) {
    console.error(error);
  }

  const resolved = resolveAccessState(profileData, claims);
  currentRole = resolved.role;
  currentPermissions = resolvePermissions(currentRole, resolved.overrides);
}

dom.loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  const email = String(dom.email.value || "").trim();
  const password = String(dom.password.value || "");

  if (!email || !password) {
    setAuthError("Enter your email and password.");
    return;
  }

  dom.signInBtn.disabled = true;
  setAuthError("");

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    console.error(error);
    setAuthError(error?.message || "Sign in failed.");
  } finally {
    dom.signInBtn.disabled = false;
  }
});

dom.signOutBtn.addEventListener("click", async () => {
  await signOut(auth);
});

dom.startEventBtn.addEventListener("click", startEvent);
dom.closeEventBtn.addEventListener("click", closeActiveEvent);
dom.saveGameBtn.addEventListener("click", saveGame);
dom.clearGameBtn.addEventListener("click", clearGameInputs);
dom.deleteLastGameBtn.addEventListener("click", deleteLastGame);
dom.clearEventsBtn.addEventListener("click", clearEventData);
dom.refreshBtn.addEventListener("click", renderEverything);

dom.quickButtons.forEach(button => {
  button.addEventListener("click", () => applyQuickDelta(toInt(button.dataset.quick)));
});

onAuthStateChanged(auth, async user => {
  if (!user) {
    currentUser = null;
    currentRole = "staff";
    currentPermissions = { ...ROLE_PERMISSIONS.staff };
    currentScores = { red: 0, white: 0, blue: 0, silver: 0 };
    currentState = defaultEventFlowState();
    disconnectScoresSubscription();

    dom.loginShell.hidden = false;
    dom.app.hidden = true;
    dom.password.value = "";
    dom.whoEmail.textContent = "-";
    dom.whoRole.textContent = "Staff";
    setStatus("Signed out.");
    return;
  }

  currentUser = user;
  await resolveUserRole(user);

  dom.loginShell.hidden = true;
  dom.app.hidden = false;
  dom.whoEmail.textContent = user.email || user.uid;
  dom.whoRole.textContent = roleDisplayLabel(currentRole);

  connectScoresSubscription();
  renderEverything();
});
