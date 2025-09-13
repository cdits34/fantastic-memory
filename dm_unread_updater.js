// dm_unread_updater.js
import { getDocs, collection, query, orderBy } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { auth, db } from "./app.js"; // assuming you export these from your main app.js

// Real-time DM unread updater
setInterval(async () => {
  const user = auth.currentUser;
  if(!user) return;

  const usersSnap = await getDocs(collection(db,"users"));
  usersSnap.forEach(async docSnap => {
    const other = docSnap.data();
    if(other.uid === user.uid) return;

    const chatId = [user.uid, other.uid].sort().join("_");
    const dmRef = collection(db,"privateMessages",chatId,"messages");
    const dmQuerySnap = await getDocs(query(dmRef, orderBy("createdAt","asc")));

    let unreadCount = 0;
    dmQuerySnap.forEach(m=>{
      const data = m.data();
      if(data.uid !== user.uid && !data.readBy?.includes(user.uid)) unreadCount++;
    });

    const allItems = [...document.querySelectorAll(".dm-item")];
    const item = allItems.find(i=>i.querySelector(".name").textContent.trim() === other.displayName);
    if(item){
      let dot = item.querySelector(".unread");
      if(unreadCount > 0){
        if(!dot){
          dot = document.createElement("span");
          dot.className = "unread";
          item.appendChild(dot);
        }
        dot.textContent = unreadCount;
      } else {
        if(dot) dot.remove();
      }
    }
  });
}, 2000); // check every 2 seconds
