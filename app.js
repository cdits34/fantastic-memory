import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { 
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { 
  getFirestore, collection, addDoc, setDoc, doc, serverTimestamp, 
  query, orderBy, onSnapshot, getDocs, getDoc, deleteDoc 
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDixIrqTpcqN5qRLrhvxLBze-39YhfQLSM",
    authDomain: "biggens11.firebaseapp.com",
    projectId: "biggens11",
    storageBucket: "biggens11.firebasestorage.app",
    messagingSenderId: "722730526406",
    appId: "1:722730526406:web:55dbb505e260264e3019c7",
    measurementId: "G-YQ508C3CBT
};
const YOUTUBE_API_KEY = "AIzaSyBh-x2mtmrpESpVtper5iE0DGKXBcbDdPM";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM Elements
const loginBtn = document.getElementById("login");
const logoutBtn = document.getElementById("logout");
const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");
const fileInput = document.getElementById("file-input");
const fileBtn = document.getElementById("file-btn");
const youtubeBtn = document.getElementById("youtube-btn");
const micBtn = document.getElementById("mic-btn");
const messagesDiv = document.getElementById("messages");
const dmForm = document.getElementById("dm-form");
const dmEmailInput = document.getElementById("dm-email");
const userProfile = document.getElementById("user-profile");
const dmListReceived = document.getElementById("dm-list-received");
const dmListSent = document.getElementById("dm-list-sent");
const backPublicBtn = document.getElementById("back-public-btn");

const youtubeModal = document.getElementById("youtube-modal");
const closeModal = document.getElementById("close-modal");
const youtubeSearch = document.getElementById("youtube-search");
const youtubeSearchBtn = document.getElementById("youtube-search-btn");
const youtubeResults = document.getElementById("youtube-results");

const addPersonModal = document.getElementById("add-person-modal");
const addPersonSearch = document.getElementById("add-person-search");
const addPersonResults = document.getElementById("add-person-results");
const addPersonCancel = document.getElementById("add-person-cancel");
const addPersonBtn = document.getElementById("add-person-btn");

let currentDMId = null;
let unsubscribeListener = null;
let mediaRecorder, audioChunks = [];
let currentChatMeta = null;

// Login/Logout
loginBtn.onclick = async () => { await signInWithPopup(auth,new GoogleAuthProvider()); };
logoutBtn.onclick = async () => { await signOut(auth); };

// Format timestamp
function formatTimestamp(ts){
  if(!ts) return "";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = (Date.now() - date.getTime())/1000;
  if(diff<60) return "just now";
  if(diff<3600) return Math.floor(diff/60)+" min ago";
  if(diff<86400) return Math.floor(diff/3600)+" hr ago";
  return date.toLocaleString();
}

// Render message
function renderMessage(msg){
  let header = `
    <div class="msg-header">
      <img src='${msg.photoURL || ""}' width='32' class='avatar'>
      <strong>${msg.name || "Unknown"}</strong>
      <span class="meta">${formatTimestamp(msg.createdAt)}</span>
    </div>`;
  let body = "";
  if(msg.text) body += `<div class="msg-text">${msg.text}</div>`;
  if(msg.fileData && msg.fileType?.startsWith("audio/")) body += `<audio controls src='${msg.fileData}'></audio>`;
  else if(msg.fileData && msg.fileType?.startsWith("image/")) body += `<img src='${msg.fileData}' class='msg-img'>`;
  else if(msg.fileData && msg.fileType?.startsWith("video/")) body += `<video src='${msg.fileData}' width='240' controls></video>`;
  else if(msg.fileData) body += `<a href='${msg.fileData}' download>📎 Download File</a>`;
  if(msg.youtubeEmbed) body += `<iframe src="https://www.youtube.com/embed/${msg.youtubeEmbed}" width="240" height="180" frameborder="0" allowfullscreen></iframe>`;
  return `<div class='message'>${header}${body}</div>`;
}

// Load public messages
const publicMessagesRef = collection(db,"messages");
const publicQuery = query(publicMessagesRef, orderBy("createdAt","asc"));
function loadPublicMessages(){
  currentDMId=null;
  currentChatMeta = null;
  if(unsubscribeListener) unsubscribeListener();
  unsubscribeListener = onSnapshot(publicQuery,snapshot=>{
    messagesDiv.innerHTML="";
    snapshot.forEach(doc=>{ messagesDiv.innerHTML += renderMessage(doc.data()); });
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });
}

// Open a chat
async function openChatById(chatId){
  currentDMId = chatId;
  if(unsubscribeListener) unsubscribeListener();

  const chatDoc = await getDoc(doc(db,"privateMessages",chatId));
  currentChatMeta = chatDoc.exists() ? chatDoc.data() : null;

  const dmRef = collection(db,"privateMessages",chatId,"messages");
  const dmQuery = query(dmRef, orderBy("createdAt","asc"));
  unsubscribeListener = onSnapshot(dmQuery, snapshot=>{
    messagesDiv.innerHTML="";
    snapshot.forEach(doc=>{ messagesDiv.innerHTML += renderMessage(doc.data()); });
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });

  // Show add person button if current user is owner
  if(currentChatMeta?.members?.length>2){
    const owner = currentChatMeta.members[0]; // first member = owner
    addPersonBtn.style.display = (owner.uid===auth.currentUser.uid)?"inline-block":"none";
  } else addPersonBtn.style.display="none";
}

// DM / Group creation
dmForm.onsubmit = async e=>{
  e.preventDefault();
  const user = auth.currentUser;
  if(!user) return;
  const emails = dmEmailInput.value.split(",").map(s=>s.trim()).filter(Boolean);
  if(emails.length===0) return;

  const usersSnap = await getDocs(collection(db,"users"));
  const usersArr = [];
  usersSnap.forEach(docSnap => usersArr.push(docSnap.data()));

  const members = [{ uid:user.uid, displayName:user.displayName, email:user.email, photoURL:user.photoURL }];
  for(const email of emails){
    const found = usersArr.find(u=>u.email===email);
    if(found && !members.some(m=>m.uid===found.uid)) members.push({ uid:found.uid, displayName:found.displayName, email:found.email, photoURL:found.photoURL });
  }

  if(members.length<2) return alert("No valid users found for those emails.");
  if(members.length>4) return alert("Group chats limited to 4 members.");

  const memberUids = members.map(m=>m.uid).sort();
  let chatId = memberUids.join("_");

  // Name the group chat sequentially if >2 members
  if(members.length>2){
    const allGroupsSnap = await getDocs(collection(db,"privateMessages"));
    const existingGroups = allGroupsSnap.docs.filter(d=>d.data().isGroup);
    const groupNum = existingGroups.length + 1;
    const groupName = `Group Chat ${groupNum}`;
    await setDoc(doc(db,"privateMessages",chatId), {
      members, isGroup:true, name:groupName, updatedAt:serverTimestamp()
    }, { merge:true });
  } else {
    await setDoc(doc(db,"privateMessages",chatId), { members, isGroup:false, updatedAt:serverTimestamp() }, { merge:true });
  }

  await openChatById(chatId);
  dmEmailInput.value="";
  backPublicBtn.style.display="block";
  await updateDMLists();
};

// Send message
messageForm.onsubmit = async e=>{
  e.preventDefault();
  const user = auth.currentUser;
  if(!user) return alert("Login first!");
  let fileBase64=null, fileType=null;

  if(fileInput.files.length>0){
    const file=fileInput.files[0];
    fileType=file.type;
    fileBase64 = await new Promise((res,rej)=>{
      const reader=new FileReader();
      reader.onload=()=>res(reader.result);
      reader.onerror=rej;
      reader.readAsDataURL(file);
    });
  }

  const msgData = {
    uid:user.uid,name:user.displayName,photoURL:user.photoURL,
    text:messageInput.value||null,
    fileData:fileBase64,
    fileType:fileType,
    createdAt:serverTimestamp()
  };

  if(currentDMId){
    const dmRef = collection(db,"privateMessages",currentDMId,"messages");
    await addDoc(dmRef,msgData);
  } else {
    await addDoc(publicMessagesRef,msgData);
  }

  messageInput.value=""; fileInput.value="";
  updateDMLists();
};

// Mic recording
micBtn.onclick = async ()=>{
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return alert("Browser doesn't support audio recording.");
  if(!mediaRecorder || mediaRecorder.state==="inactive"){
    const stream = await navigator.mediaDevices.getUserMedia({audio:true});
    mediaRecorder = new MediaRecorder(stream);
    audioChunks=[];
    mediaRecorder.ondataavailable = e=>audioChunks.push(e.data);
    mediaRecorder.onstop = async ()=>{
      const blob=new Blob(audioChunks,{type:"audio/webm"});
      const reader=new FileReader();
      reader.onload=async ()=>{
        const user=auth.currentUser;
        if(!user) return alert("Login first!");
        const msgData={uid:user.uid,name:user.displayName,photoURL:user.photoURL,fileData:reader.result,fileType:"audio/webm",createdAt:serverTimestamp()};
        if(currentDMId){
          const dmRef = collection(db,"privateMessages",currentDMId,"messages");
          await addDoc(dmRef,msgData);
        } else await addDoc(publicMessagesRef,msgData);
      };
      reader.readAsDataURL(blob);
    };
    mediaRecorder.start();
    micBtn.textContent="⏹️";
  } else if(mediaRecorder.state==="recording"){
    mediaRecorder.stop();
    micBtn.textContent="🎤";
  }
};

// File & YouTube
fileBtn.onclick = ()=>fileInput.click();
youtubeBtn.onclick = ()=>{ youtubeModal.style.display="flex"; youtubeSearch.focus(); };
closeModal.onclick = ()=>{ youtubeModal.style.display="none"; youtubeResults.innerHTML=""; };

youtubeSearchBtn.onclick = async ()=>{
  const q=youtubeSearch.value.trim();
  if(!q) return;
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=5&q=${encodeURIComponent(q)}&key=${YOUTUBE_API_KEY}`);
  const data = await res.json();
  youtubeResults.innerHTML="";
  (data.items||[]).forEach(item=>{
    const div=document.createElement("div");
    div.className="youtube-item";
    div.innerHTML=`<img src="${item.snippet.thumbnails.default.url}"><span>${item.snippet.title}</span>`;
    div.onclick=async ()=>{
      const user=auth.currentUser;
      if(!user) return alert("Login first!");
      const msgData={uid:user.uid,name:user.displayName,photoURL:user.photoURL,youtubeEmbed:item.id.videoId,createdAt:serverTimestamp()};
      if(currentDMId){
        const dmRef = collection(db,"privateMessages",currentDMId,"messages");
        await addDoc(dmRef,msgData);
      } else await addDoc(publicMessagesRef,msgData);
      youtubeModal.style.display="none";
      youtubeResults.innerHTML="";
    };
    youtubeResults.appendChild(div);
  });
};

// Auth state
onAuthStateChanged(auth,user=>{
  if(user){
    loginBtn.style.display="none";
    logoutBtn.style.display="block";
    messageForm.style.display="flex";
    dmForm.style.display="flex";
    userProfile.innerHTML=`<img src='${user.photoURL}' width='40' style='border-radius:50%'> <span>${user.displayName}</span>`;
    setDoc(doc(db,"users",user.uid),{uid:user.uid,displayName:user.displayName,email:user.email,photoURL:user.photoURL},{merge:true});
    loadPublicMessages();
    updateDMLists();
  } else {
    loginBtn.style.display="block";
    logoutBtn.style.display="none";
    messageForm.style.display="none";
    dmForm.style.display="none";
    messagesDiv.innerHTML="<p>Login to see messages</p>";
    userProfile.innerHTML="";
    dmListReceived.innerHTML="";
    dmListSent.innerHTML="";
    addPersonBtn.style.display="none";
    if(unsubscribeListener) unsubscribeListener();
  }
});

// DM + Group list
async function updateDMLists(){
  const user=auth.currentUser;
  if(!user) return;
  dmListReceived.innerHTML=""; dmListSent.innerHTML="";
  const includedChatIds = new Set();

  const chatsSnap = await getDocs(collection(db,"privateMessages"));
  for(const chatDoc of chatsSnap.docs){
    const chatId = chatDoc.id;
    const meta = chatDoc.data();
    if(!meta?.members?.some(m=>m.uid===user.uid)) continue;
    includedChatIds.add(chatId);

    const dmRef = collection(db,"privateMessages",chatId,"messages");
    const dmQuerySnap = await getDocs(query(dmRef, orderBy("createdAt","asc")));
    let unread=0,lastMessage=null;
    dmQuerySnap.forEach(docSnap=>{
      const data=docSnap.data();
      lastMessage=data;
      if(data.uid!==user.uid && !data.readBy?.includes(user.uid)) unread++;
    });

    const item=document.createElement("div");
    item.className="dm-item";

    if(meta.isGroup){
      const names = meta.members.map(m=>(m.displayName||m.name||m.email||m.uid)).join(", ");
      const avatar = (meta.members[0]?.photoURL)||"";
      item.innerHTML=`<img src="${avatar}"><span class="name">${meta.name||names}</span>${unread>0?`<span class="unread">${unread}</span>`:""}`;
    } else {
      const other = meta.members.find(m=>m.uid!==user.uid) || {displayName:"Unknown", photoURL:""};
      item.innerHTML=`<img src="${other.photoURL || ""}"><span class="name">${other.displayName||other.name||other.email||other.uid}</span>${unread>0?`<span class="unread">${unread}</span>`:""}`;
    }

    item.onclick=async ()=>{
      await openChatById(chatId);
      backPublicBtn.style.display="block";

      const msgs = await getDocs(query(dmRef, orderBy("createdAt","asc")));
      for(const m of msgs.docs){
        const d = m.data();
        if(!d.readBy) d.readBy=[];
        if(!d.readBy.includes(user.uid)){
          d.readBy.push(user.uid);
          await setDoc(doc(db,"privateMessages",chatId,"messages",m.id),d,{merge:true});
        }
      }
      await updateDMLists();
    };

    if(lastMessage?.uid===user.uid) dmListSent.appendChild(item);
    else dmListReceived.appendChild(item);
  }

  // back button
  backPublicBtn.onclick=()=>{
    currentDMId=null;
    loadPublicMessages();
    backPublicBtn.style.display="none";
  };
}

// Add Person Modal
addPersonBtn.onclick=async ()=>{
  if(!currentChatMeta) return;
  addPersonModal.style.display="block";
  addPersonSearch.value="";
  addPersonResults.innerHTML="";
};
addPersonCancel.onclick=()=>{addPersonModal.style.display="none";};

// Search users in add person modal
addPersonSearch.oninput=async ()=>{
  const q=addPersonSearch.value.toLowerCase().trim();
  addPersonResults.innerHTML="";
  if(!q) return;
  const usersSnap = await getDocs(collection(db,"users"));
  const usersArr = [];
  usersSnap.forEach(d=>usersArr.push(d.data()));
  const filtered = usersArr.filter(u=>u.uid!==auth.currentUser.uid && u.displayName.toLowerCase().includes(q));
  filtered.forEach(u=>{
    const div=document.createElement("div");
    div.textContent=u.displayName;
    div.style.cursor="pointer";
    div.onclick=async ()=>{
      if(currentChatMeta.members.length>=4) return alert("Group chat max 4 members.");
      currentChatMeta.members.push({uid:u.uid, displayName:u.displayName,email:u.email,photoURL:u.photoURL});
      await setDoc(doc(db,"privateMessages",currentDMId),{members:currentChatMeta.members},{merge:true});
      addPersonModal.style.display="none";
      await updateDMLists();
    };
    addPersonResults.appendChild(div);
  });
};
