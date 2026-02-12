import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getFirestore, doc, setDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

/* ---------------- FIREBASE ---------------- */

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

/* ---------------- GOOGLE SHEETS CONFIG ---------------- */

const GOOGLE_CLIENT_ID = "827317744881-2ql24ib0rkluaefh2sj0hbjncv6idgn1.apps.googleusercontent.com";
const SHEET_ID = "1ko1Hhpbv00xsarwFRMgpt9kT5K7c-6td2h34PqtNJGM";
const SHEET_RANGE = "Points!A:D";

let tokenClient;
let gapiReady = false;

/* Initialize Google API */
function initGapi() {
  gapi.load("client", async () => {
    await gapi.client.init({
      discoveryDocs: ["https://sheets.googleapis.com/$discovery/rest?version=v4"]
    });
    gapiReady = true;
  });
}

function initTokenClient() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    callback: (tokenResponse) => {
      gapi.client.setToken(tokenResponse);
    }
  });
}

initGapi();
initTokenClient();

/* ---------------- UI SETUP ---------------- */

const houses = [
  {id:'red',name:'Red House',bg:'#ea0125',text:'#fff'},
  {id:'white',name:'White House',bg:'#fffeff',text:'#000'},
  {id:'blue',name:'Blue House',bg:'#005ab5',text:'#fff'},
  {id:'silver',name:'Silver House',bg:'#a7a7aa',text:'#000'}
];

const container = document.getElementById("housesContainer");

houses.forEach(h=>{
  const card=document.createElement("div");
  card.className="card";
  card.innerHTML=`
    <div class="house-name" style="background:${h.bg};color:${h.text}">
      ${h.name}
    </div>
    <div class="points" id="pts-${h.id}">0</div>
    <div class="controls">
      <button class="sub" onclick="window.apply('${h.id}',-10)">-10</button>
      <button class="sub" onclick="window.apply('${h.id}',-20)">-20</button>
      <button class="sub" onclick="window.apply('${h.id}',-50)">-50</button>
      <button class="add" onclick="window.apply('${h.id}',10)">+10</button>
      <button class="add" onclick="window.apply('${h.id}',20)">+20</button>
      <button class="add" onclick="window.apply('${h.id}',50)">+50</button>
      <div class="custom">
        <input id="custom-${h.id}" type="number" placeholder="Custom">
        <button class="add" onclick="window.applyCustom('${h.id}',1)">Add</button>
        <button class="sub" onclick="window.applyCustom('${h.id}',-1)">Sub</button>
      </div>
    </div>
  `;
  container.appendChild(card);
});

/* ---------------- CORE LOGIC ---------------- */

async function applyChange(house, delta){

  tokenClient.requestAccessToken();

  const reasoning = "Assembly";

  // 1️⃣ Append row to sheet
  await gapi.client.sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: SHEET_RANGE,
    valueInputOption: "USER_ENTERED",
    resource: {
      values: [[house, delta, reasoning, new Date().toLocaleDateString()]]
    }
  });

  // 2️⃣ Read entire sheet
  const response = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: SHEET_RANGE
  });

  const rows = response.result.values || [];
  rows.shift(); // remove header

  const totals = { red:0, blue:0, white:0, silver:0 };

  rows.forEach(r=>{
    const h = r[0]?.toLowerCase();
    const p = Number(r[1]);
    if(totals[h] !== undefined){
      totals[h] += p;
    }
  });

  // 3️⃣ Overwrite Firestore
  await setDoc(scoresDoc,{
    ...totals
  });
}

window.apply = applyChange;

window.applyCustom = async (house,dir)=>{
  const input=document.getElementById("custom-"+house);
  const val=parseInt(input.value,10);
  if(isNaN(val)||val===0) return;
  await applyChange(house,val*dir);
  input.value="";
};

/* Disable undo/reset because sheet is source */
document.getElementById("undoBtn").style.display="none";
document.getElementById("resetBtn").style.display="none";

/* ---------------- AUTH ---------------- */

emailPassBtn.onclick=()=>{
  signInWithEmailAndPassword(auth,email.value,password.value);
};

signOutBtn.onclick=()=>signOut(auth);

/* Live Firestore display */
onSnapshot(scoresDoc,s=>{
  if(!s.exists()) return;
  houses.forEach(h=>{
    const el=document.getElementById("pts-"+h.id);
    if(el) el.textContent=s.data()[h.id]||0;
  });
});

/* Admin check */
onAuthStateChanged(auth,async u=>{
  if(!u){
    loginBox.style.display="flex";
    mainPanel.style.display="none";
    return;
  }
  const t=await u.getIdTokenResult();
  if(!t.claims.admin){
    await signOut(auth);
    return;
  }
  loginBox.style.display="none";
  mainPanel.style.display="block";
  loggedInAs.textContent=u.email;
});
