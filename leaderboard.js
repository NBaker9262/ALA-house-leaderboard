import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getFirestore, doc, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

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

let lastConfettiHouse = null;

function updateHeights(values) {
  const total = Object.values(values).reduce((sum, v) => sum + v, 0);
  const maxBarVh = 150;

  for (const k in bars) {
    const ratio = total === 0 ? 0 : values[k] / total;
    const h = ratio * maxBarVh;
    bars[k].style.height = h + "vh";
    icons[k].style.marginBottom = `calc(${h}vh * 0.05 + 10px)`;
  }
}

onSnapshot(scoresDoc, async snap => {
  if (!snap.exists()) return;
  const d = snap.data();

  const values = {
    red: d.red ?? 0,
    white: d.white ?? 0,
    blue: d.blue ?? 0,
    silver: d.silver ?? 0
  };

  for (const k in values) labels[k].textContent = values[k];
  updateHeights(values);

  const house = d._confetti?.house;
  if (!house || house === lastConfettiHouse) return;

  lastConfettiHouse = house;

  const colorMap = {
    red: "#ea0125",
    white: "#fffeff",
    blue: "#005ab5",
    silver: "#a7a7aa"
  };

  const color = colorMap[house];

  confetti({ particleCount: 120, spread: 60, origin: { y: 0.6 }, colors: [color] });
  confetti({ particleCount: 60, spread: 55, origin: { x: 0, y: 0.8 }, angle: 60, colors: [color] });
  confetti({ particleCount: 60, spread: 55, origin: { x: 1, y: 0.8 }, angle: 120, colors: [color] });

  await updateDoc(scoresDoc, { _confetti: null });
});
