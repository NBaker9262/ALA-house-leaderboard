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
  {id:'red',name:'Red House',bg:'#ea0125',text:'#fff'},
  {id:'white',name:'White House',bg:'#fffeff',text:'#000'},
  {id:'blue',name:'Blue House',bg:'#005ab5',text:'#fff'},
  {id:'silver',name:'Silver House',bg:'#a7a7aa',text:'#000'}
];

const container = document.getElementById("housesContainer");

/* render UI */
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
      <button class="sub" onclick="window.apply('${h.id}',-15)">-15</button>
      <button class="sub" onclick="window.apply('${h.id}',-20)">-20</button>
      <button class="sub" onclick="window.apply('${h.id}',-30)">-30</button>
      <button class="sub" onclick="window.apply('${h.id}',-50)">-50</button>
      <button class="add" onclick="window.apply('${h.id}',10)">+10</button>
      <button class="add" onclick="window.apply('${h.id}',15)">+15</button>
      <button class="add" onclick="window.apply('${h.id}',20)">+20</button>
      <button class="add" onclick="window.apply('${h.id}',30)">+30</button>
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

/* fixed buttons */
async function applyChange(house,delta){
  await runTransaction(db,async t=>{
    const snap=await t.get(scoresDoc);
    const data=snap.data()||{};
    t.update(scoresDoc,{
      [house]:(data[house]||0)+delta,
      lastAction:{house,delta,timestamp:serverTimestamp()}
    });
  });
}
window.apply=applyChange;

/* custom input */
window.applyCustom = async (house,dir)=>{
  const input=document.getElementById("custom-"+house);
  const val=parseInt(input.value,10);
  if(isNaN(val) || val===0) return;
  await applyChange(house,val*dir);
  input.value="";
};

/* undo */
document.getElementById("undoBtn").onclick=async()=>{
  await runTransaction(db,async t=>{
    const snap=await t.get(scoresDoc);
    const la=snap.data()?.lastAction;
    if(!la) return;
    t.update(scoresDoc,{
      [la.house]:(snap.data()[la.house]||0)-la.delta,
      lastAction:null
    });
  });
};

/* reset */
document.getElementById("resetBtn").onclick=()=>{
  setDoc(scoresDoc,{red:0,white:0,blue:0,silver:0,lastAction:null});
};

/* auth */
emailPassBtn.onclick=()=>{
  signInWithEmailAndPassword(auth,email.value,password.value);
};
signOutBtn.onclick=()=>signOut(auth);

/* live updates */
onSnapshot(scoresDoc,s=>{
  if(!s.exists()) return;
  houses.forEach(h=>{
    const el=document.getElementById("pts-"+h.id);
    if(el) el.textContent=s.data()[h.id]||0;
  });
});

/* auth state */
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
