import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getDatabase,
  onValue,
  ref
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

// Maintenance switchboard: update these values at the top when rotating Sheets endpoints/tabs.
const SHEETS_SYNC = {
  endpointUrl: "https://script.google.com/macros/s/AKfycbwE2Eey0VCj_ariQGr2IMZAaoKusvmDj2OpzMexxJdCYMZIdE9NmNwMfkra4tpZRB9krw/exec", // Required: Google Apps Script web app URL
  secureApiKey: "asdfgvhjtnrtbvwegrhtyjnhgbfvdswdefrghyjhtgrfgrthbgrhtjyntgbfvdgr", // Required: shared secret/API key validated by Apps Script
  spreadsheetId: "1jsCXm5fHWCPkNejatduLjLb6XpvApBUVm6mLSs4ePcI",
  pointsTab: "Points",
  pollIntervalMs: 10000,
  timeoutMs: 15000
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

const chartArea = document.querySelector(".chart-area");
const grid = document.querySelector(".y-grid");
const app = initializeApp(firebaseConfig);
const realtimeDb = getDatabase(app);
const leaderboardScoresRef = ref(realtimeDb, "leaderboard/scores");

const bars = {
  red: document.getElementById("bar-red"),
  white: document.getElementById("bar-white"),
  blue: document.getElementById("bar-blue"),
  silver: document.getElementById("bar-silver")
};

const labels = {
  red: document.getElementById("score-red"),
  white: document.getElementById("score-white"),
  blue: document.getElementById("score-blue"),
  silver: document.getElementById("score-silver")
};

const icons = {
  red: document.getElementById("icon-red"),
  white: document.getElementById("icon-white"),
  blue: document.getElementById("icon-blue"),
  silver: document.getElementById("icon-silver")
};

const columns = Object.fromEntries(Object.keys(bars).map(key => [key, bars[key].closest(".bar")]));
const tracks = Object.values(columns).map(column => column?.querySelector(".bar-track")).filter(Boolean);

let lastConfettiHouse = null;
let lastValues = null;
let pollHandle = null;
let realtimeUnsubscribe = null;

const EFFECT_TIMING = { confettiDelayMs: 0 };
const GRID_STEP_POINTS = 100;

function getIconGapPx() {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--icon-gap");
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 10;
}

function measureHeights() {
  const trackHeights = tracks.map(track => track.clientHeight).filter(height => Number.isFinite(height) && height > 0);
  if (trackHeights.length === 0) return { usableBarHeight: 0 };

  const plotHeight = Math.min(...trackHeights);
  const iconHeights = Object.values(icons)
    .map(icon => icon.getBoundingClientRect().height || icon.clientHeight || 0)
    .filter(height => Number.isFinite(height));

  const maxIconHeight = iconHeights.length ? Math.max(...iconHeights) : 0;
  const iconGap = getIconGapPx();
  const topClearance = Math.max(6, Math.round(plotHeight * 0.015));
  const usableBarHeight = Math.max(0, plotHeight - maxIconHeight - iconGap - topClearance);
  return { usableBarHeight };
}

function updateLeaderStyles(values) {
  const max = Math.max(...Object.values(values));
  for (const key of Object.keys(columns)) {
    columns[key].classList.toggle("is-leading", max > 0 && values[key] === max);
  }
}

function getScaleTop(maxScore) {
  if (maxScore <= 0) return GRID_STEP_POINTS;
  return Math.ceil(maxScore / GRID_STEP_POINTS) * GRID_STEP_POINTS;
}

function renderGridLines(scaleTop) {
  if (!grid) return;
  const lineCount = Math.max(1, Math.floor(scaleTop / GRID_STEP_POINTS));

  const fragment = document.createDocumentFragment();
  for (let i = 0; i <= lineCount; i += 1) {
    const line = document.createElement("div");
    line.className = "grid-line";
    const position = 100 - (i / lineCount) * 100;
    line.style.top = `${position}%`;
    fragment.appendChild(line);
  }

  grid.replaceChildren(fragment);
}

function updateHeights(values) {
  const max = Math.max(...Object.values(values));
  const scaleTop = getScaleTop(max);
  const { usableBarHeight } = measureHeights();
  renderGridLines(scaleTop);

  for (const key of Object.keys(bars)) {
    const ratio = scaleTop === 0 ? 0 : values[key] / scaleTop;
    const height = ratio * usableBarHeight;
    bars[key].style.height = `${height}px`;
    columns[key].style.setProperty("--bar-height", `${height}px`);
    bars[key].classList.toggle("is-compact", height > 0 && height < 38);
  }

  updateLeaderStyles(values);
}

const resizeObserver = new ResizeObserver(() => {
  if (lastValues) updateHeights(lastValues);
});
if (chartArea) resizeObserver.observe(chartArea);

for (const icon of Object.values(icons)) {
  if (!icon.complete) {
    icon.addEventListener("load", () => {
      if (lastValues) updateHeights(lastValues);
    });
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

function aggregateScoresFromRealtime(value) {
  const source = value && typeof value === "object" && value.scores && typeof value.scores === "object"
    ? value.scores
    : value;

  if (!source || typeof source !== "object") return null;

  return {
    red: parsePointAmount(source.red),
    white: parsePointAmount(source.white),
    blue: parsePointAmount(source.blue),
    silver: parsePointAmount(source.silver)
  };
}

async function callSheetApi(payload, timeoutMs = SHEETS_SYNC.timeoutMs) {
  if (!SHEETS_SYNC.endpointUrl || !SHEETS_SYNC.secureApiKey) {
    throw new Error("Google Sheets sync is not configured in leaderboard.js");
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

async function fetchScoresFromSheets() {
  const result = await callSheetApi({
    action: "getPoints",
    spreadsheetId: SHEETS_SYNC.spreadsheetId,
    tab: SHEETS_SYNC.pointsTab
  });
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  return aggregateScoresFromRows(rows);
}

function maybeConfetti(values) {
  if (!lastValues) {
    lastValues = { ...values };
    return;
  }

  const deltas = Object.keys(values).map(house => ({ house, delta: values[house] - (lastValues[house] ?? 0) }));
  const biggestGain = deltas.reduce((best, current) => (!best || current.delta > best.delta ? current : best), null);
  lastValues = { ...values };

  if (!biggestGain || biggestGain.delta <= 0) return;
  if (biggestGain.house === lastConfettiHouse && biggestGain.delta < 1) return;

  lastConfettiHouse = biggestGain.house;
  const colorMap = { red: "#ea0125", white: "#fffeff", blue: "#005ab5", silver: "#a7a7aa" };
  const confettiColor = colorMap[biggestGain.house];
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  setTimeout(() => {
    confetti({ particleCount: 100, spread: 60, origin: { y: 0.62 }, colors: [confettiColor] });
    confetti({ particleCount: 55, spread: 50, origin: { x: 0, y: 0.82 }, angle: 60, colors: [confettiColor] });
    confetti({ particleCount: 55, spread: 50, origin: { x: 1, y: 0.82 }, angle: 120, colors: [confettiColor] });
  }, EFFECT_TIMING.confettiDelayMs);
}

async function refreshScores() {
  const values = await fetchScoresFromSheets();
  renderScores(values);
}

function renderScores(values) {
  for (const key of Object.keys(values)) labels[key].textContent = values[key];
  updateHeights(values);
  maybeConfetti(values);
}

function startRealtimeSync() {
  if (realtimeUnsubscribe) return;

  realtimeUnsubscribe = onValue(leaderboardScoresRef, snapshot => {
    if (!snapshot.exists()) return;
    const values = aggregateScoresFromRealtime(snapshot.val());
    if (!values) return;
    renderScores(values);
    if (pollHandle) {
      clearInterval(pollHandle);
      pollHandle = null;
    }
  }, error => {
    console.error("Leaderboard realtime sync failed", error);
  });
}

function startPolling() {
  if (pollHandle) clearInterval(pollHandle);
  pollHandle = setInterval(() => {
    void refreshScores().catch(error => console.error("Leaderboard Sheets sync failed", error));
  }, SHEETS_SYNC.pollIntervalMs);
}

void refreshScores().catch(error => console.error("Initial leaderboard sync failed", error));
startPolling();
startRealtimeSync();
