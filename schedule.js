import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

const userInfo = document.getElementById("userInfo");
const scheduleDate = document.getElementById("scheduleDate");
const scheduleStatus = document.getElementById("scheduleStatus");
const scheduleMemo = document.getElementById("scheduleMemo");
const saveScheduleButton = document.getElementById("saveScheduleButton");
const logoutButton = document.getElementById("logoutButton");
const message = document.getElementById("message");
const weeklyScheduleList = document.getElementById("weeklyScheduleList");

let currentUser = null;
let currentUserData = null;

const weekDays = ["日", "月", "火", "水", "木", "金", "土"];

function formatDateWithDay(date) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekDay = weekDays[date.getDay()];
  return `${month}/${day}（${weekDay}）`;
}

function formatDateId(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// 今日の日付を input に自動セットする
const today = new Date();
const yyyy = today.getFullYear();
const mm = String(today.getMonth() + 1).padStart(2, "0");
const dd = String(today.getDate()).padStart(2, "0");
scheduleDate.value = `${yyyy}-${mm}-${dd}`;

// ログイン状態を確認する
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;

    const userDocRef = doc(db, "users", user.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (!userDocSnap.exists()) {
      alert("ユーザー情報が登録されていません。");
      window.location.href = "index.html";
      return;
    }

    const userData = userDocSnap.data();
    currentUserData = userData;

    if (userData.active !== true) {
      alert("このアカウントは現在利用できません。");
      window.location.href = "index.html";
      return;
    }

    if (userData.role !== "user") {
      window.location.href = "staff.html";
      return;
    }

    userInfo.textContent = `ログイン中：${userData.name}`;

    loadWeeklySchedule();

  } else {
    window.location.href = "index.html";
  }
});

async function loadWeeklySchedule() {
  if (!currentUser) {
    return;
  }

  weeklyScheduleList.textContent = "読み込み中...";

  try {
    weeklyScheduleList.innerHTML = "";

    const today = new Date();

    for (let i = 0; i < 7; i++) {
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + i);

      const dateId = formatDateId(targetDate);
      const scheduleId = `${currentUser.uid}_${dateId}`;

      const docRef = doc(db, "schedules", scheduleId);
      const docSnap = await getDoc(docRef);

      let statusText = "未入力";
      let memoText = "";

      if (docSnap.exists()) {
        const data = docSnap.data();
        statusText = data.status || "未入力";
        memoText = data.memo || "";
      }

      const item = document.createElement("div");
      item.className = "schedule-item";

      const left = document.createElement("div");
      left.innerHTML = `
        <div class="schedule-date">${formatDateWithDay(targetDate)}</div>
        <div>${memoText}</div>
      `;

      const right = document.createElement("div");
      right.className = "schedule-status";
      right.textContent = statusText;

      item.appendChild(left);
      item.appendChild(right);

      weeklyScheduleList.appendChild(item);
    }

  } catch (error) {
    console.error("週間予定の読み込みエラー:", error);
    weeklyScheduleList.textContent = "予定の読み込みに失敗しました。";
  }
}

// 予定を保存する
saveScheduleButton.addEventListener("click", async () => {
  if (!currentUser) {
    message.textContent = "ログイン情報が確認できません。再ログインしてください。";
    return;
  }

  const date = scheduleDate.value;
  const status = scheduleStatus.value;
  const memo = scheduleMemo.value;

  if (!date) {
    message.textContent = "日付を選択してください。";
    return;
  }

  if (!status) {
    message.textContent = "予定を選択してください。";
    return;
  }

  try {
    // 同じユーザー・同じ日付なら同じIDにする
    // 例：abc123_2026-05-06
    const scheduleId = `${currentUser.uid}_${date}`;

    await setDoc(doc(db, "schedules", scheduleId), {
      userId: currentUser.uid,
      userName: currentUserData?.name || currentUser.email,
      userEmail: currentUser.email,
      date: date,
      status: status,
      memo: memo,
      updatedAt: serverTimestamp()
    });

    message.style.color = "green";
    message.textContent = "予定を保存しました。";

    loadWeeklySchedule();

  } catch (error) {
    console.error(error);
    message.style.color = "red";
    message.textContent = "保存に失敗しました。";
  }
});

// ログアウト
logoutButton.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});