import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getFirestore, doc, runTransaction,
  onSnapshot, serverTimestamp, setDoc
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword,
  onAuthStateChanged, signOut
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

const scoresDoc = doc(db,"leaderboard","scores");

const houses = [
  {id:'red',  name:'Red House',   bg:'#ea0125', text:'#fff'},
  {id:'white',name:'White House', bg:'#fffeff', text:'#000'},
  {id:'blue', name:'Blue House',  bg:'#005ab5', text:'#fff'},
  {id:'silver',name:'Silver House',bg:'#a7a7aa',text:'#000'}
];

const PLACE_POINTS = [50, 30, 15, 10];
const PLACE_MEDALS = ['🥇','🥈','🥉','🏅'];
const PLACE_NAMES  = ['1st','2nd','3rd','4th'];
const MAX_LOG_ENTRIES = 10;

/* set place hint dynamically from constants */
document.getElementById('placeHint').textContent =
  PLACE_NAMES.map((n, i) => `${n} = ${PLACE_POINTS[i]}`).join(' · ');

let currentScores = null;
let activityLog = [];
let lastLoggedActionKey = null;

const container = document.getElementById("housesContainer");

/* render house cards */
houses.forEach(h => {
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="house-name" style="background:${h.bg};color:${h.text}">
      ${h.name}
      <span class="rank-badge" id="rank-${h.id}"></span>
    </div>

    <div class="custom-row">
      <input id="custom-${h.id}" type="number" placeholder="Custom amount" min="1">
      <button class="add" onclick="window.applyCustom('${h.id}',1)">Add</button>
      <button class="sub" onclick="window.applyCustom('${h.id}',-1)">Sub</button>
    </div>

    <div class="points" id="pts-${h.id}">0</div>

    <div class="controls">
      <div class="button-row add-row">
        <button class="add" onclick="window.apply('${h.id}',10)">+10</button>
        <button class="add" onclick="window.apply('${h.id}',15)">+15</button>
        <button class="add" onclick="window.apply('${h.id}',20)">+20</button>
        <button class="add" onclick="window.apply('${h.id}',30)">+30</button>
        <button class="add" onclick="window.apply('${h.id}',50)">+50</button>
      </div>

      <div class="button-row sub-row">
        <button class="sub" onclick="window.apply('${h.id}',-10)">-10</button>
        <button class="sub" onclick="window.apply('${h.id}',-15)">-15</button>
        <button class="sub" onclick="window.apply('${h.id}',-20)">-20</button>
        <button class="sub" onclick="window.apply('${h.id}',-30)">-30</button>
        <button class="sub" onclick="window.apply('${h.id}',-50)">-50</button>
      </div>
    </div>
  `;
  container.appendChild(card);
});

/* build place award dropdowns */
const placeRows = document.getElementById("placeRows");
PLACE_POINTS.forEach((pts, i) => {
  const row = document.createElement("div");
  row.className = "place-row";
  const options = houses.map(h =>
    `<option value="${h.id}">${h.name}</option>`
  ).join('');
  row.innerHTML = `
    <span class="place-medal">${PLACE_MEDALS[i]}</span>
    <span class="place-name">${PLACE_NAMES[i]}</span>
    <span class="place-pts">+${pts} pts</span>
    <select id="place-${i+1}" class="place-select">
      <option value="">— Select House —</option>
      ${options}
    </select>
  `;
  placeRows.appendChild(row);
  row.querySelector('select').addEventListener('change', updatePlacePreview);
});

/* fixed point buttons */
async function applyChange(house, delta) {
  await runTransaction(db, async t => {
    const snap = await t.get(scoresDoc);
    const data = snap.data() || {};
    t.update(scoresDoc, {
      [house]: (data[house] || 0) + delta,
      lastAction: { house, delta, timestamp: serverTimestamp() }
    });
  });
}
window.apply = applyChange;

/* custom input */
window.applyCustom = async (house, dir) => {
  const input = document.getElementById("custom-" + house);
  const val = parseInt(input.value, 10);
  if (isNaN(val) || val === 0) return;
  await applyChange(house, val * dir);
  input.value = "";
};

/* place awards */
window.applyPlaceAwards = async () => {
  const placements = PLACE_POINTS.map((pts, i) => ({
    pts,
    house: document.getElementById(`place-${i + 1}`).value,
    place: PLACE_NAMES[i]
  })).filter(p => p.house);

  if (placements.length === 0) {
    showToast('⚠️ Select at least one house to award!', 'warn');
    return;
  }

  const selectedHouses = placements.map(p => p.house);
  if (new Set(selectedHouses).size !== selectedHouses.length) {
    showToast('⚠️ Each house can only be selected once!', 'warn');
    return;
  }

  await runTransaction(db, async t => {
    const snap = await t.get(scoresDoc);
    const data = snap.data() || {};
    const updates = {};
    const changes = placements.map(p => ({ house: p.house, delta: p.pts, place: p.place }));
    for (const p of placements) {
      updates[p.house] = (data[p.house] || 0) + p.pts;
    }
    updates.lastAction = { type: 'place_awards', changes, timestamp: serverTimestamp() };
    t.update(scoresDoc, updates);
  });

  const summary = placements.map(p => {
    const h = houses.find(h => h.id === p.house);
    return `${h?.name} +${p.pts}`;
  }).join(', ');
  showToast(`🏆 Awarded: ${summary}`, 'success');
  window.clearPlaces();
};

/* auto-fill places by current score */
window.autoFillPlaces = () => {
  if (!currentScores) {
    showToast('⚠️ No score data yet — try again shortly', 'warn');
    return;
  }
  const sorted = [...houses].sort((a, b) => (currentScores[b.id] || 0) - (currentScores[a.id] || 0));
  sorted.forEach((h, i) => {
    const sel = document.getElementById(`place-${i + 1}`);
    if (sel) sel.value = h.id;
  });
  updatePlacePreview();
  showToast('✅ Places auto-filled by current scores', 'info');
};

/* clear place selects */
window.clearPlaces = () => {
  for (let i = 1; i <= 4; i++) {
    const sel = document.getElementById(`place-${i}`);
    if (sel) sel.value = '';
  }
  updatePlacePreview();
};

/* live award preview */
function updatePlacePreview() {
  const preview = document.getElementById('placePreview');
  if (!preview) return;
  const selections = PLACE_POINTS.map((pts, i) => ({
    pts,
    medal: PLACE_MEDALS[i],
    house: document.getElementById(`place-${i + 1}`)?.value
  })).filter(p => p.house);

  if (selections.length === 0) {
    preview.innerHTML = '';
    return;
  }
  const chips = selections.map(p => {
    const h = houses.find(h => h.id === p.house);
    return `<span class="preview-chip" style="background:${h?.bg};color:${h?.text}">${p.medal} ${h?.name} <strong>+${p.pts}</strong></span>`;
  }).join('');
  preview.innerHTML = `<span class="preview-label">Will award:</span> ${chips}`;
}

/* undo */
document.getElementById("undoBtn").onclick = async () => {
  await runTransaction(db, async t => {
    const snap = await t.get(scoresDoc);
    const la = snap.data()?.lastAction;
    if (!la) return;
    const data = snap.data();
    const updates = { lastAction: null };
    if (la.type === 'place_awards' && Array.isArray(la.changes)) {
      for (const change of la.changes) {
        updates[change.house] = (data[change.house] || 0) - change.delta;
      }
    } else if (la.house) {
      updates[la.house] = (data[la.house] || 0) - la.delta;
    }
    t.update(scoresDoc, updates);
  });
  showToast('↩ Last action undone', 'info');
};

/* reset */
document.getElementById("resetBtn").onclick = () => {
  if (!confirm('Reset ALL scores to zero? This cannot be undone.')) return;
  setDoc(scoresDoc, { red: 0, white: 0, blue: 0, silver: 0, lastAction: null });
  showToast('🔄 All scores reset to zero', 'warn');
};

/* toast notification */
function showToast(msg, type = 'success') {
  const toastContainer = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  toastContainer.appendChild(toast);
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('show')));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

/* activity log */
function addLogEntry(entry) {
  activityLog.unshift(entry);
  if (activityLog.length > MAX_LOG_ENTRIES) activityLog.pop();
  renderActivityLog();
}

function renderActivityLog() {
  const list = document.getElementById('activityList');
  if (!list) return;
  if (activityLog.length === 0) {
    list.innerHTML = '<li class="log-empty">No activity yet this session</li>';
    return;
  }
  list.innerHTML = activityLog.map(e =>
    `<li class="log-entry"><span class="log-time">${e.time}</span><span class="log-desc">${e.desc}</span></li>`
  ).join('');
}

/* update rank badges on each card */
function updateRanks(values) {
  const sorted = [...houses].sort((a, b) => (values[b.id] || 0) - (values[a.id] || 0));
  sorted.forEach((h, i) => {
    const el = document.getElementById("rank-" + h.id);
    if (el) el.textContent = PLACE_MEDALS[i];
  });
}

/* auth */
emailPassBtn.onclick = () => {
  signInWithEmailAndPassword(auth, email.value, password.value);
};
signOutBtn.onclick = () => signOut(auth);

/* live updates */
onSnapshot(scoresDoc, s => {
  if (!s.exists()) return;
  const d = s.data();

  const values = {};
  houses.forEach(h => { values[h.id] = d[h.id] || 0; });

  houses.forEach(h => {
    const el = document.getElementById("pts-" + h.id);
    if (el) el.textContent = values[h.id];
  });

  updateRanks(values);

  /* log new actions */
  const la = d.lastAction;
  if (la && currentScores !== null) {
    let key;
    if (la.type === 'place_awards' && la.changes) {
      key = 'pa:' + la.changes.map(c => c.house + c.delta).join(',');
    } else if (la.house !== null && la.house !== undefined) {
      key = `${la.house}:${la.delta}`;
    }
    if (key && key !== lastLoggedActionKey) {
      lastLoggedActionKey = key;
      const time = new Date().toLocaleTimeString();
      let desc;
      if (la.type === 'place_awards' && la.changes) {
        desc = '🏆 ' + la.changes.map(c => {
          const h = houses.find(h => h.id === c.house);
          return `${h?.name || c.house} +${c.delta} (${c.place})`;
        }).join(' · ');
      } else {
        const h = houses.find(h => h.id === la.house);
        const sign = la.delta > 0 ? '+' : '';
        desc = `${h?.name || la.house} ${sign}${la.delta}`;
      }
      addLogEntry({ time, desc });
    }
  }

  currentScores = values;
});

/* auth state */
onAuthStateChanged(auth, async u => {
  if (!u) {
    loginBox.style.display = "flex";
    mainPanel.style.display = "none";
    return;
  }
  const t = await u.getIdTokenResult();
  if (!t.claims.admin) {
    await signOut(auth);
    return;
  }
  loginBox.style.display = "none";
  mainPanel.style.display = "block";
  loggedInAs.textContent = u.email;
});
