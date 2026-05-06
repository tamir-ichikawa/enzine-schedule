import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

import { auth, db } from "./firebase-config.js";

const staffInfo = document.getElementById("staffInfo");
const targetDate = document.getElementById("targetDate");
const loadButton = document.getElementById("loadButton");
const logoutButton = document.getElementById("logoutButton");
const message = document.getElementById("message");

const comingList = document.getElementById("comingList");
const homeList = document.getElementById("homeList");
const offList = document.getElementById("offList");
const otherList = document.getElementById("otherList");

let currentUser = null;

// 今日の日付を yyyy-mm-dd で作る
function getTodayDateId() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// リストを空にする
function clearLists() {
  comingList.innerHTML = "";
  homeList.innerHTML = "";
  offList.innerHTML = "";
  otherList.innerHTML = "";
}

// リストに1人分追加する
function addUserToList(listElement, data) {
  const li = document.createElement("li");

  const name = data.userName || data.userEmail || "名前不明";
  const memo = data.memo || "";

  if (memo) {
    li.textContent = `${name}（${memo}）`;
  } else {
    li.textContent = name;
  }

  listElement.appendChild(li);
}

// 空のリストに「該当者なし」を入れる
function showEmptyTextIfNeeded() {
  if (comingList.children.length === 0) {
    comingList.innerHTML = "<li>該当者なし</li>";
  }

  if (homeList.children.length === 0) {
    homeList.innerHTML = "<li>該当者なし</li>";
  }

  if (offList.children.length === 0) {
    offList.innerHTML = "<li>該当者なし</li>";
  }

  if (otherList.children.length === 0) {
    otherList.innerHTML = "<li>該当者なし</li>";
  }
}

// 指定日の予定を読み込む
async function loadDailySchedules() {
  const date = targetDate.value;

  if (!date) {
    message.style.color = "red";
    message.textContent = "日付を選択してください。";
    return;
  }

  clearLists();

  message.style.color = "#333";
  message.textContent = "読み込み中...";

  try {
    const q = query(
      collection(db, "schedules"),
      where("date", "==", date)
    );

    const querySnapshot = await getDocs(q);

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();

      if (data.status === "通所") {
        addUserToList(comingList, data);
      } else if (data.status === "在宅") {
        addUserToList(homeList, data);
      } else if (data.status === "休み") {
        addUserToList(offList, data);
      } else {
        addUserToList(otherList, data);
      }
    });

    showEmptyTextIfNeeded();

    message.style.color = "green";
    message.textContent = `${date} の予定を表示しました。`;

  } catch (error) {
    console.error("支援員一覧の読み込みエラー:", error);

    message.style.color = "red";
    message.textContent = `読み込みに失敗しました：${error.code || error.message}`;
  }
}

// ログイン状態確認
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

    if (userData.active !== true) {
      alert("このアカウントは現在利用できません。");
      window.location.href = "index.html";
      return;
    }

    if (userData.role !== "staff") {
      alert("このページは支援員専用です。");
      window.location.href = "user.html";
      return;
    }

    staffInfo.textContent = `ログイン中：${userData.name}`;

    targetDate.value = getTodayDateId();
    loadDailySchedules();

  } else {
    window.location.href = "index.html";
  }
});

// 一覧表示ボタン
loadButton.addEventListener("click", () => {
  loadDailySchedules();
});

// ログアウト
logoutButton.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});