import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

import { auth, db } from "./firebase-config.js";

const userInfo = document.getElementById("userInfo");
const scheduleDate = document.getElementById("scheduleDate");
const scheduleStatus = document.getElementById("scheduleStatus");
const scheduleTimeSlot = document.getElementById("scheduleTimeSlot");
const timeSlotChoiceBox = document.getElementById("timeSlotChoiceBox");
const scheduleMemo = document.getElementById("scheduleMemo");

const modalAnnouncements = document.getElementById("modalAnnouncements");
const statusButtons = document.querySelectorAll("[data-status]");
const timeSlotButtons = document.querySelectorAll("[data-timeslot]");

const saveScheduleButton = document.getElementById("saveScheduleButton");
const logoutButton = document.getElementById("logoutButton");
const message = document.getElementById("message");
const monthlyCalendar = document.getElementById("monthlyCalendar");
const calendarTitle = document.getElementById("calendarTitle");
const todayAnnouncements = document.getElementById("todayAnnouncements");

const scheduleModal = document.getElementById("scheduleModal");
const closeModalButton = document.getElementById("closeModalButton");
const cancelModalButton = document.getElementById("cancelModalButton");
const modalTitle = document.getElementById("modalTitle");

let currentUser = null;
let currentUserData = null;
let selectedDateId = null;
let announcementsByDate = {};

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

function getStatusClass(status) {
  if (status === "通所") {
    return "status-coming";
  }

  if (status === "在宅") {
    return "status-home";
  }

  if (status === "休み") {
    return "status-off";
  }

  return "";
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

function updateTimeSlotVisibility() {
  const status = scheduleStatus.value;

  if (status === "休み" || status === "") {
    scheduleTimeSlot.value = "";
    timeSlotChoiceBox.style.display = "none";
    clearTimeSlotButtonActive();
  } else {
    timeSlotChoiceBox.style.display = "block";
  }
}

function clearStatusButtonActive() {
  statusButtons.forEach((button) => {
    button.classList.remove("active");
    button.classList.remove("status-coming");
    button.classList.remove("status-home");
    button.classList.remove("status-off");
  });
}

function clearTimeSlotButtonActive() {
  timeSlotButtons.forEach((button) => {
    button.classList.remove("active");
  });
}

function applyStatusButtonActive(status) {
  clearStatusButtonActive();

  statusButtons.forEach((button) => {
    if (button.dataset.status === status) {
      button.classList.add("active");

      if (status === "通所") {
        button.classList.add("status-coming");
      } else if (status === "在宅") {
        button.classList.add("status-home");
      } else if (status === "休み") {
        button.classList.add("status-off");
      }
    }
  });
}

function applyTimeSlotButtonActive(timeSlot) {
  clearTimeSlotButtonActive();

  timeSlotButtons.forEach((button) => {
    if (button.dataset.timeslot === timeSlot) {
      button.classList.add("active");
    }
  });
}

function openModal() {
  scheduleModal.classList.remove("hidden");
}

function closeModal() {
  scheduleModal.classList.add("hidden");
}

function clearSelectedDayStyle() {
  const selectedCells = document.querySelectorAll(".selected-day");

  selectedCells.forEach((cell) => {
    cell.classList.remove("selected-day");
  });
}

function applySelectedDayStyle(dateId) {
  clearSelectedDayStyle();

  const targetCell = document.querySelector(`[data-date-id="${dateId}"]`);

  if (targetCell) {
    targetCell.classList.add("selected-day");
  }
}

function renderModalAnnouncements(dateId) {
  if (!modalAnnouncements) {
    return;
  }

  const announcements = announcementsByDate[dateId] || [];

  modalAnnouncements.innerHTML = "";

  if (announcements.length === 0) {
    const empty = document.createElement("div");
    empty.className = "modal-announcement-empty";
    empty.textContent = "この日の連絡・予定はありません。";
    modalAnnouncements.appendChild(empty);
    return;
  }

  announcements.forEach((announcement) => {
    const card = document.createElement("div");
    card.className = "modal-announcement-card";

    const title = document.createElement("div");
    title.className = "modal-announcement-title";
    title.textContent = `${getAnnouncementIcon(announcement.category || "notice")} ${announcement.title || "お知らせ"}`;

    const time = document.createElement("div");
    time.className = "modal-announcement-time";
    time.textContent = announcement.timeText || "";

    const body = document.createElement("div");
    body.className = "modal-announcement-body";
    body.textContent = announcement.body || "";

    card.appendChild(title);

    if (announcement.timeText) {
      card.appendChild(time);
    }

    if (announcement.body) {
      card.appendChild(body);
    }

    modalAnnouncements.appendChild(card);
  });
}

function renderTodayAnnouncements() {
  if (!todayAnnouncements) {
    return;
  }

  const todayId = formatDateId(new Date());
  const announcements = announcementsByDate[todayId] || [];

  todayAnnouncements.innerHTML = "";

  if (announcements.length === 0) {
    const empty = document.createElement("div");
    empty.className = "announcement-empty";
    empty.textContent = "本日のアナウンスはありません。";
    todayAnnouncements.appendChild(empty);
    return;
  }

  announcements.forEach((announcement) => {
    const card = document.createElement("div");
    card.className = "announcement-card";

    const title = document.createElement("div");
    title.className = "announcement-title";
    title.textContent = `📢 ${announcement.title || "無題のお知らせ"}`;

    const time = document.createElement("div");
    time.className = "announcement-time";
    time.textContent = announcement.timeText || "";

    const body = document.createElement("div");
    body.className = "announcement-body";
    body.textContent = announcement.body || "";

    card.appendChild(title);

    if (announcement.timeText) {
      card.appendChild(time);
    }

    if (announcement.body) {
      card.appendChild(body);
    }

    todayAnnouncements.appendChild(card);
  });
}

async function openScheduleModal(dateId) {
  if (!currentUser) {
    return;
  }

  selectedDateId = dateId;
  scheduleDate.value = dateId;
  scheduleStatus.value = "";
  scheduleTimeSlot.value = "";
  scheduleMemo.value = "";

  clearStatusButtonActive();
  clearTimeSlotButtonActive();
  renderModalAnnouncements(dateId);

  modalTitle.textContent = `${formatJapaneseDate(dateId)}の予定`;
  message.textContent = "";

  applySelectedDayStyle(dateId);

  try {
    const scheduleId = `${currentUser.uid}_${dateId}`;
    const docRef = doc(db, "schedules", scheduleId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();

      scheduleStatus.value = data.status || "";
      scheduleTimeSlot.value = data.timeSlot || "";
      scheduleMemo.value = data.memo || "";

      applyStatusButtonActive(scheduleStatus.value);
      applyTimeSlotButtonActive(scheduleTimeSlot.value);
    }

    updateTimeSlotVisibility();
    openModal();

  } catch (error) {
    console.error("予定読み込みエラー:", error);
    message.style.color = "red";
    message.textContent = `予定の読み込みに失敗しました：${error.code || error.message}`;
  }
}

//scheduleStatus.addEventListener("change", updateTimeSlotVisibility);
statusButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const status = button.dataset.status;

    scheduleStatus.value = status;
    applyStatusButtonActive(status);
    updateTimeSlotVisibility();
  });
});

timeSlotButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const timeSlot = button.dataset.timeslot;

    scheduleTimeSlot.value = timeSlot;
    applyTimeSlotButtonActive(timeSlot);
  });
});

closeModalButton.addEventListener("click", () => {
  closeModal();
});

cancelModalButton.addEventListener("click", () => {
  closeModal();
});

scheduleModal.addEventListener("click", (event) => {
  if (event.target === scheduleModal) {
    closeModal();
  }
});

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

    if (data.visibility === "staff") {
      return;
    }

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

async function loadMonthlyCalendar() {
  if (!currentUser) {
    return;
  }

  monthlyCalendar.textContent = "読み込み中...";

  try {
    monthlyCalendar.innerHTML = "";

    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();

    calendarTitle.textContent = `${year}年${month + 1}月の予定`;

    await loadMonthlyAnnouncements(year, month);
    renderTodayAnnouncements();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const firstWeekDay = firstDay.getDay();
    const lastDate = lastDay.getDate();

    for (let i = 0; i < firstWeekDay; i++) {
      const emptyCell = document.createElement("div");
      emptyCell.className = "calendar-day empty";
      monthlyCalendar.appendChild(emptyCell);
    }

    for (let day = 1; day <= lastDate; day++) {
      const targetDate = new Date(year, month, day);
      const dateId = formatDateId(targetDate);
      const scheduleId = `${currentUser.uid}_${dateId}`;

      const docRef = doc(db, "schedules", scheduleId);
      const docSnap = await getDoc(docRef);

      let status = "";
      let timeSlot = "";
      let memo = "";

      if (docSnap.exists()) {
        const data = docSnap.data();
        status = data.status || "";
        timeSlot = data.timeSlot || "";
        memo = data.memo || "";
      }

      const dayCell = document.createElement("div");
      dayCell.className = "calendar-day";
      dayCell.dataset.dateId = dateId;

      if (dateId === formatDateId(today)) {
        dayCell.classList.add("today");
      }

      if (dateId === selectedDateId) {
        dayCell.classList.add("selected-day");
      }

      const dateEl = document.createElement("div");
      dateEl.className = "calendar-date";
      dateEl.textContent = `${day}日`;

      const statusEl = document.createElement("div");
      statusEl.className = `calendar-status ${getStatusClass(status)}`;
      statusEl.textContent = status || "";

      const timeSlotEl = document.createElement("div");
      timeSlotEl.className = "calendar-time-slot";
      timeSlotEl.textContent = timeSlot || "";

      dayCell.appendChild(dateEl);
      dayCell.appendChild(statusEl);
      dayCell.appendChild(timeSlotEl);

      if (memo) {
        const memoDot = document.createElement("span");
        memoDot.className = "memo-dot";
        memoDot.title = memo;
        dayCell.appendChild(memoDot);
      }


      const dayAnnouncements = announcementsByDate[dateId] || [];

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
        openScheduleModal(dateId);
      });

      monthlyCalendar.appendChild(dayCell);
    }

  } catch (error) {
    console.error("月間カレンダー読み込みエラー:", error);
    monthlyCalendar.textContent = `カレンダーの読み込みに失敗しました：${error.code || error.message}`;
  }
}

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

    await loadMonthlyCalendar();

  } else {
    window.location.href = "index.html";
  }
});

// 予定を保存する
saveScheduleButton.addEventListener("click", async () => {
  if (!currentUser) {
    message.style.color = "red";
    message.textContent = "ログイン情報が確認できません。再ログインしてください。";
    return;
  }

  const date = scheduleDate.value;
  const status = scheduleStatus.value;
  const timeSlot = scheduleTimeSlot.value;
  const memo = scheduleMemo.value;

  if (!date) {
    message.style.color = "red";
    message.textContent = "日付を選択してください。";
    return;
  }

  if (!status) {
    message.style.color = "red";
    message.textContent = "予定を選択してください。";
    return;
  }

  if ((status === "通所" || status === "在宅") && !timeSlot) {
    message.style.color = "red";
    message.textContent = "通所または在宅の場合は、終日・午前・午後を選択してください。";
    return;
  }

  try {
    const scheduleId = `${currentUser.uid}_${date}`;

    await setDoc(doc(db, "schedules", scheduleId), {
      userId: currentUser.uid,
      userName: currentUserData?.name || currentUser.email,
      userEmail: currentUser.email,
      date: date,
      status: status,
      timeSlot: status === "休み" ? "" : timeSlot,
      memo: memo,
      updatedAt: serverTimestamp()
    });

    message.style.color = "green";
    message.textContent = "予定を保存しました。";

    closeModal();
    await loadMonthlyCalendar();

  } catch (error) {
    console.error("保存エラー:", error);

    message.style.color = "red";
    message.textContent = `保存に失敗しました：${error.code || error.message}`;
  }
});

// ログアウト
logoutButton.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});