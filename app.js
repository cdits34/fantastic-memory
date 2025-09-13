<script type="module">
  // Import the functions you need from the SDKs you need
  import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
  import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-analytics.js";
  // TODO: Add SDKs for Firebase products that you want to use
  // https://firebase.google.com/docs/web/setup#available-libraries

  // Your web app's Firebase configuration
  // For Firebase JS SDK v7.20.0 and later, measurementId is optional
  const firebaseConfig = {
    apiKey: "AIzaSyDixIrqTpcqN5qRLrhvxLBze-39YhfQLSM",
    authDomain: "biggens11.firebaseapp.com",
    projectId: "biggens11",
    storageBucket: "biggens11.firebasestorage.app",
    messagingSenderId: "722730526406",
    appId: "1:722730526406:web:55dbb505e260264e3019c7",
    measurementId: "G-YQ508C3CBT"
  };

const YOUTUBE_API_KEY = "AIzaSyBh-x2mtmrpESpVtper5iE0DGKXBcbDdPM";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM
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

const youtubeModal = document.getElementById("youtube-modal");
const closeModal = document.getElementById("close-modal");
const youtubeSearch = document.getElementById("youtube-search");
const youtubeSearchBtn = document.getElementById("youtube-search-btn");
const youtubeResults = document.getElementById("youtube-results");
const backPublicBtn = document.getElementById("back-public-btn");


let currentDMId = null;
let unsubscribeListener = null;
let mediaRecorder, audioChunks = [];

// Login/Logout
loginBtn.onclick = async ()=>{ await signInWithPopup(auth,new GoogleAuthProvider()); };
logoutBtn.onclick = async ()=>{ await signOut(auth); };

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
      <img src='${msg.photoURL}' width='32' class='avatar'>
      <strong>${msg.name}</strong>
      <span class="meta">${formatTimestamp(msg.createdAt)}</span>
    </div>`;
  let body = "";
  if(msg.text) body += `<div class="msg-text">${msg.text}</div>`;

  // File handling
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
  if(unsubscribeListener) unsubscribeListener();
  unsubscribeListener = onSnapshot(publicQuery,snapshot=>{
    messagesDiv.innerHTML="";
    snapshot.forEach(doc=>{ messagesDiv.innerHTML += renderMessage(doc.data()); });
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });
}

// DM form
dmForm.onsubmit = async e=>{
  e.preventDefault();
  const user = auth.currentUser;
  const email = dmEmailInput.value.trim();
  if(!email) return;

  const usersSnap = await getDocs(collection(db,"users"));
  let otherUser = null;
  usersSnap.forEach(doc=>{ if(doc.data().email===email) otherUser=doc.data(); });
  if(!otherUser) return alert("User not found!");

  const chatId = [user.uid, otherUser.uid].sort().join("_");
  currentDMId = chatId;
  const dmRef = collection(db,"privateMessages",chatId,"messages");
  const dmQuery = query(dmRef, orderBy("createdAt","asc"));

  if(unsubscribeListener) unsubscribeListener();
  unsubscribeListener = onSnapshot(dmQuery, snapshot=>{
    messagesDiv.innerHTML="";
    snapshot.forEach(doc=>{ messagesDiv.innerHTML+=renderMessage(doc.data()); });
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });

  updateDMLists();
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
      const reader = new FileReader();
      reader.onload = ()=>res(reader.result);
      reader.onerror = rej;
      reader.readAsDataURL(file);
    });
  }

  const msgData = {
    uid:user.uid, name:user.displayName, photoURL:user.photoURL,
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

// Mic button
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
        const msgData={
          uid:user.uid,name:user.displayName,photoURL:user.photoURL,
          fileData:reader.result,fileType:"audio/webm",createdAt:serverTimestamp()
        };
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

// File & YouTube buttons
fileBtn.onclick = ()=>fileInput.click();
youtubeBtn.onclick = ()=>{ youtubeModal.style.display="flex"; youtubeSearch.focus(); };
closeModal.onclick = ()=>{ youtubeModal.style.display="none"; youtubeResults.innerHTML=""; };

// YouTube search
youtubeSearchBtn.onclick = async ()=>{
  const q = youtubeSearch.value.trim();
  if(!q) return;
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=5&q=${encodeURIComponent(q)}&key=${YOUTUBE_API_KEY}`);
  const data = await res.json();
  youtubeResults.innerHTML="";
  data.items.forEach(item=>{
    const div=document.createElement("div");
    div.className="youtube-item";
    div.innerHTML=`<img src="${item.snippet.thumbnails.default.url}"><span>${item.snippet.title}</span>`;
    div.onclick=async ()=>{
      const user=auth.currentUser;
      if(!user) return alert("Login first!");
      const msgData={
        uid:user.uid,name:user.displayName,photoURL:user.photoURL,
        youtubeEmbed:item.id.videoId,
        createdAt:serverTimestamp()
      };
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

// Auth State
onAuthStateChanged(auth,user=>{
  if(user){
    loginBtn.style.display="none";
    logoutBtn.style.display="block";
    messageForm.style.display="flex";
    dmForm.style.display="flex";
    userProfile.innerHTML=`<img src='${user.photoURL}' width='40' style='border-radius:50%'> <span>${user.displayName}</span>`;
    setDoc(doc(db,"users",user.uid),{
      uid:user.uid,displayName:user.displayName,email:user.email,photoURL:user.photoURL
    },{merge:true});
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
  }
});

// DM list with unread
async function updateDMLists(){
  const user=auth.currentUser;
  if(!user) return;
  const usersSnap=await getDocs(collection(db,"users"));
  const usersArr=[];
  usersSnap.forEach(doc=>{ if(doc.id!==user.uid) usersArr.push(doc.data()); });

  dmListReceived.innerHTML="";
  dmListSent.innerHTML="";

  for(const otherUser of usersArr){
    const chatId = [user.uid, otherUser.uid].sort().join("_");
    const dmRef = collection(db,"privateMessages",chatId,"messages");
    const dmQuerySnap = await getDocs(query(dmRef,orderBy("createdAt","asc")));

    let unread=0, lastMessage=null;
    dmQuerySnap.forEach(doc=>{
      const data=doc.data();
      lastMessage=data;
      if(data.uid!==user.uid && !data.readBy?.includes(user.uid)) unread++;
    });

    const item=document.createElement("div");
    item.className="dm-item";
    item.innerHTML=`
      <img src="${otherUser.photoURL}" alt="pfp">
      <span class="name">${otherUser.displayName}</span>
      ${unread>0?`<span class="unread">${unread}</span>`:""}
    `;
    item.onclick = async ()=>{
  dmEmailInput.value = otherUser.email;

  // UNSUBSCRIBE previous listener if it exists
  if (unsubscribeListener) unsubscribeListener();

  // Trigger DM form submit to set currentDMId
  dmForm.dispatchEvent(new Event("submit"));

  // Show back button
  backPublicBtn.style.display = "block";

  // Mark messages as read
  dmQuerySnap.forEach(async docSnap=>{
    const data = docSnap.data();
    if(!data.readBy) data.readBy=[];
    if(!data.readBy.includes(user.uid)){
      data.readBy.push(user.uid);
      await setDoc(doc(db,"privateMessages",chatId,"messages",docSnap.id), data, {merge:true});
    }
  });

  updateDMLists(); // refresh DM sidebar
};
    backPublicBtn.onclick = ()=>{
  currentDMId = null;               // reset to public chat
  loadPublicMessages();              // reload public messages
  backPublicBtn.style.display = "none"; // hide button
};

    if(lastMessage?.uid===user.uid) dmListSent.appendChild(item);
    else dmListReceived.appendChild(item);
  }
}
export { auth, db };
