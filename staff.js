import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  serverTimestamp
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

const announcementCalendarTitle = document.getElementById("announcementCalendarTitle");
const announcementCalendar = document.getElementById("announcementCalendar");
const announcementModal = document.getElementById("announcementModal");
const closeAnnouncementModalButton = document.getElementById("closeAnnouncementModalButton");
const announcementModalTitle = document.getElementById("announcementModalTitle");
const announcementList = document.getElementById("announcementList");

const editingAnnouncementId = document.getElementById("editingAnnouncementId");
const announcementDate = document.getElementById("announcementDate");
const announcementVisibility = document.getElementById("announcementVisibility");
const announcementCategory = document.getElementById("announcementCategory");
const announcementTitle = document.getElementById("announcementTitle");
const announcementStartTime = document.getElementById("announcementStartTime");
const announcementEndTime = document.getElementById("announcementEndTime");
const announcementBody = document.getElementById("announcementBody");
const saveAnnouncementButton = document.getElementById("saveAnnouncementButton");
const resetAnnouncementFormButton = document.getElementById("resetAnnouncementFormButton");
const announcementFormTitle = document.getElementById("announcementFormTitle");

let currentStaffData = null;
let selectedAnnouncementDate = null;
let announcementsByDate = {};

let currentUser = null;

// 今日の日付を yyyy-mm-dd で作る
function getTodayDateId() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateId(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatJapaneseDate(dateId) {
  const parts = dateId.split("-");
  return `${Number(parts[1])}月${Number(parts[2])}日`;
}

function getAnnouncementIcon(category) {
  if (category === "workshop") {
    return "🎨";
  }

  if (category === "deadline") {
    return "⏰";
  }

  if (category === "important") {
    return "⚠️";
  }

  return "📢";
}

function shortenText(text, maxLength) {
  if (!text) {
    return "";
  }

  if (text.length <= maxLength) {
    return text;
  }

  return text.slice(0, maxLength) + "…";
}

function buildTimeText(startTime, endTime) {
  if (startTime && endTime) {
    return `${startTime}〜${endTime}`;
  }

  if (startTime && !endTime) {
    return `${startTime}〜`;
  }

  if (!startTime && endTime) {
    return `〜${endTime}`;
  }

  return "";
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

function openAnnouncementModal(dateId) {
  selectedAnnouncementDate = dateId;

  announcementDate.value = dateId;
  announcementModalTitle.textContent = `${formatJapaneseDate(dateId)}のアナウンス`;
  resetAnnouncementForm();

  renderAnnouncementList(dateId);

  announcementModal.classList.remove("hidden");
}

function closeAnnouncementModal() {
  announcementModal.classList.add("hidden");
}

function resetAnnouncementForm() {
  editingAnnouncementId.value = "";
  announcementFormTitle.textContent = "新規追加";
  announcementVisibility.value = "all";
  announcementCategory.value = "notice";
  announcementTitle.value = "";
  announcementStartTime.value = "";
  announcementEndTime.value = "";
  announcementBody.value = "";
}

function renderAnnouncementList(dateId) {
  const list = announcementsByDate[dateId] || [];

  announcementList.innerHTML = "";

  if (list.length === 0) {
    announcementList.innerHTML = `<div class="announcement-empty">この日のアナウンスはまだありません。</div>`;
    return;
  }

  list.forEach((announcement) => {
    const item = document.createElement("div");
    item.className = "announcement-edit-item";

    const title = document.createElement("div");
    title.className = "announcement-title";
    title.textContent = `${getAnnouncementIcon(announcement.category || "notice")} ${announcement.title || "無題"}`;

    if (announcement.visibility === "staff") {
      const badge = document.createElement("span");
      badge.className = "staff-only-badge";
      badge.textContent = "支援員のみ";
      title.appendChild(badge);
    }

    const time = document.createElement("div");
    time.className = "announcement-time";
    time.textContent = announcement.timeText || "";

    const body = document.createElement("div");
    body.className = "announcement-body";
    body.textContent = announcement.body || "";

    const buttons = document.createElement("div");
    buttons.className = "announcement-edit-buttons";

    const editButton = document.createElement("button");
    editButton.textContent = "編集";
    editButton.className = "small-button";
    editButton.addEventListener("click", () => {
      editingAnnouncementId.value = announcement.id;
      announcementFormTitle.textContent = "編集中";
      announcementVisibility.value = announcement.visibility || "all";
      announcementCategory.value = announcement.category || "notice";
      announcementTitle.value = announcement.title || "";
      announcementStartTime.value = announcement.startTime || "";
      announcementEndTime.value = announcement.endTime || "";
      announcementBody.value = announcement.body || "";
    });

    const hideButton = document.createElement("button");
    hideButton.textContent = "非表示";
    hideButton.className = "small-button danger-button";
    hideButton.addEventListener("click", async () => {
      const ok = confirm("このアナウンスを非表示にしますか？");

      if (!ok) {
        return;
      }

      await updateDoc(doc(db, "announcements", announcement.id), {
        active: false,
        updatedAt: serverTimestamp()
      });

      await loadAnnouncementCalendar();
      renderAnnouncementList(selectedAnnouncementDate);
    });

    buttons.appendChild(editButton);
    buttons.appendChild(hideButton);

    item.appendChild(title);

    if (announcement.timeText) {
      item.appendChild(time);
    }

    if (announcement.body) {
      item.appendChild(body);
    }

    item.appendChild(buttons);

    announcementList.appendChild(item);
  });
}

async function loadMonthlyAnnouncements(year, month) {
  announcementsByDate = {};

  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const monthEnd = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const announcementsQuery = query(
    collection(db, "announcements"),
    where("active", "==", true),
    where("date", ">=", monthStart),
    where("date", "<=", monthEnd)
  );

  const snapshot = await getDocs(announcementsQuery);

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const date = data.date;

    if (!announcementsByDate[date]) {
      announcementsByDate[date] = [];
    }

    announcementsByDate[date].push({
      id: docSnap.id,
      ...data
    });
  });
}

async function loadAnnouncementCalendar() {
  if (!currentUser) {
    return;
  }

  announcementCalendar.textContent = "読み込み中...";

  try {
    announcementCalendar.innerHTML = "";

    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();

    announcementCalendarTitle.textContent = `${year}年${month + 1}月のアナウンス管理`;

    await loadMonthlyAnnouncements(year, month);

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const firstWeekDay = firstDay.getDay();
    const lastDate = lastDay.getDate();

    for (let i = 0; i < firstWeekDay; i++) {
      const emptyCell = document.createElement("div");
      emptyCell.className = "calendar-day empty";
      announcementCalendar.appendChild(emptyCell);
    }

    for (let day = 1; day <= lastDate; day++) {
      const targetDate = new Date(year, month, day);
      const dateId = formatDateId(targetDate);
      const dayAnnouncements = announcementsByDate[dateId] || [];

      const dayCell = document.createElement("div");
      dayCell.className = "calendar-day";
      dayCell.dataset.dateId = dateId;

      if (dateId === formatDateId(today)) {
        dayCell.classList.add("today");
      }

      const dateEl = document.createElement("div");
      dateEl.className = "calendar-date";
      dateEl.textContent = `${day}日`;

      dayCell.appendChild(dateEl);

      if (dayAnnouncements.length > 0) {
        const announcementArea = document.createElement("div");
        announcementArea.className = "calendar-announcement-area";

        dayAnnouncements.forEach((announcement) => {
          const item = document.createElement("div");
          item.className = `calendar-announcement-title category-${announcement.category || "notice"}`;

          const icon = getAnnouncementIcon(announcement.category || "notice");
          const shortTitle = shortenText(announcement.title || "お知らせ", 8);

          item.textContent = `${icon} ${shortTitle}`;
          announcementArea.appendChild(item);
        });

        dayCell.appendChild(announcementArea);
      }

      dayCell.addEventListener("click", () => {
        openAnnouncementModal(dateId);
      });

      announcementCalendar.appendChild(dayCell);
    }

  } catch (error) {
    console.error("アナウンスカレンダー読み込みエラー:", error);
    announcementCalendar.textContent = `アナウンスの読み込みに失敗しました：${error.code || error.message}`;
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
    currentStaffData = userData;


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
    loadAnnouncementCalendar();

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

saveAnnouncementButton.addEventListener("click", async () => {
  const date = announcementDate.value;
  const visibility = announcementVisibility.value;
  const category = announcementCategory.value;
  const title = announcementTitle.value.trim();
  const startTime = announcementStartTime.value;
  const endTime = announcementEndTime.value;
  const timeText = buildTimeText(startTime, endTime);
  const body = announcementBody.value.trim();
  const id = editingAnnouncementId.value;

  if (!date) {
    alert("日付が選択されていません。");
    return;
  }

  if (!title) {
    alert("タイトルを入力してください。");
    return;
  }

  try {
    if (id) {
      await updateDoc(doc(db, "announcements", id), {
        visibility: visibility,
        category: category,
        title: title,
        startTime: startTime,
        endTime: endTime,
        timeText: timeText,
        body: body,
        updatedAt: serverTimestamp()
      });
    } else {
      await addDoc(collection(db, "announcements"), {
        date: date,
        visibility: visibility,
        category: category,
        title: title,
        startTime: startTime,
        endTime: endTime,
        timeText: timeText,
        body: body,
        active: true,
        createdByUid: currentUser.uid,
        createdByName: currentStaffData?.name || currentUser.email,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

    resetAnnouncementForm();
    await loadAnnouncementCalendar();
    renderAnnouncementList(selectedAnnouncementDate);

  } catch (error) {
    console.error("アナウンス保存エラー:", error);
    alert(`保存に失敗しました：${error.code || error.message}`);
  }
});

closeAnnouncementModalButton.addEventListener("click", () => {
  closeAnnouncementModal();
});

resetAnnouncementFormButton.addEventListener("click", () => {
  resetAnnouncementForm();
});

announcementModal.addEventListener("click", (event) => {
  if (event.target === announcementModal) {
    closeAnnouncementModal();
  }
});