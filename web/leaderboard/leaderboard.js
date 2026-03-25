import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getFirestore, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

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
const scoresDoc = doc(db, "leaderboard", "scores");
const chartArea = document.querySelector(".chart-area");
const grid = document.querySelector(".y-grid");

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

const columns = Object.fromEntries(
  Object.keys(bars).map(key => [key, bars[key].closest(".bar")])
);

const tracks = Object.values(columns)
  .map(column => column?.querySelector(".bar-track"))
  .filter(Boolean);

let lastConfettiHouse = null;
let lastValues = null;

const EFFECT_TIMING = {
  confettiDelayMs: 0
};
const GRID_STEP_POINTS = 100;

function getIconGapPx() {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--icon-gap");
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 10;
}

function measureHeights() {
  const trackHeights = tracks
    .map(track => track.clientHeight)
    .filter(height => Number.isFinite(height) && height > 0);

  if (trackHeights.length === 0) {
    return { usableBarHeight: 0 };
  }

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

if (chartArea) {
  resizeObserver.observe(chartArea);
}

for (const icon of Object.values(icons)) {
  if (!icon.complete) {
    icon.addEventListener("load", () => {
      if (lastValues) updateHeights(lastValues);
    });
  }
}

onSnapshot(scoresDoc, snap => {
  if (!snap.exists()) return;
  const data = snap.data();

  const values = {
    red: Math.max(0, Number(data.red) || 0),
    white: Math.max(0, Number(data.white) || 0),
    blue: Math.max(0, Number(data.blue) || 0),
    silver: Math.max(0, Number(data.silver) || 0)
  };

  for (const key of Object.keys(values)) {
    labels[key].textContent = values[key];
  }

  updateHeights(values);

  if (!lastValues) {
    lastValues = { ...values };
    return;
  }

  const deltas = Object.keys(values).map(house => ({
    house,
    delta: values[house] - (lastValues[house] ?? 0)
  }));

  const biggestGain = deltas.reduce((best, current) => {
    if (!best || current.delta > best.delta) return current;
    return best;
  }, null);

  lastValues = { ...values };

  if (!biggestGain || biggestGain.delta <= 0) return;
  if (biggestGain.house === lastConfettiHouse && biggestGain.delta < 1) return;

  lastConfettiHouse = biggestGain.house;

  const colorMap = {
    red: "#ea0125",
    white: "#fffeff",
    blue: "#005ab5",
    silver: "#a7a7aa"
  };

  const confettiColor = colorMap[biggestGain.house];
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion) return;

  setTimeout(() => {
    confetti({ particleCount: 100, spread: 60, origin: { y: 0.62 }, colors: [confettiColor] });
    confetti({ particleCount: 55, spread: 50, origin: { x: 0, y: 0.82 }, angle: 60, colors: [confettiColor] });
    confetti({ particleCount: 55, spread: 50, origin: { x: 1, y: 0.82 }, angle: 120, colors: [confettiColor] });
  }, EFFECT_TIMING.confettiDelayMs);
});
