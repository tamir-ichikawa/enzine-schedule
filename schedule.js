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

// STEP7_WEEKLY_REPORT_STABILITY_20260620_V36：返信既読フィールドの互換対応
// STEP9_WEEKLY_REPORT_WEEKDAY_START_20260620_V38：週一報告は2026-06-15週の月〜金から開始

// ==============================
// 基本設定
// ==============================

// まだ users ドキュメントに officeId / groupId がない場合の仮設定。
// 将来、事業所が増えたら users 側に officeId / groupId を登録していく。
const DEFAULT_OFFICE_ID = "engine_chiba";
const DEFAULT_GROUP_ID = "enzine";
const WEEKLY_REPORT_CHECK_WEEKS = 8;
const WEEKLY_REPORT_START_WEEK = "2026-06-15";
const WEEKLY_REPORT_FEEDBACK_CHECK_WEEKS = 12;


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
const currentMonthLabel = document.getElementById("currentMonthLabel");
const prevMonthButton = document.getElementById("prevMonthButton");
const nextMonthButton = document.getElementById("nextMonthButton");
const calendarWeekHeader = document.getElementById("calendarWeekHeader");
const calendarViewButton = document.getElementById("calendarViewButton");
const listViewButton = document.getElementById("listViewButton");
const weekViewButton = document.getElementById("weekViewButton");
const weekNavigation = document.getElementById("weekNavigation");
const prevWeekButton = document.getElementById("prevWeekButton");
const nextWeekButton = document.getElementById("nextWeekButton");
const currentWeekLabel = document.getElementById("currentWeekLabel");
const showAllDaysCheckbox = document.getElementById("showAllDaysCheckbox");
const showUseDaysCheckbox = document.getElementById("showUseDaysCheckbox");
const showAnnouncementDaysCheckbox = document.getElementById("showAnnouncementDaysCheckbox");
const todayAnnouncements = document.getElementById("todayAnnouncements");
const todayScheduleBox = document.getElementById("todayScheduleBox");
const todayScheduleText = document.getElementById("todayScheduleText");
const weeklyReportReminderBox = document.getElementById("weeklyReportReminderBox");
const weeklyReportReminderCount = document.getElementById("weeklyReportReminderCount");
const weeklyReportReminderText = document.getElementById("weeklyReportReminderText");
const weeklyReportReminderList = document.getElementById("weeklyReportReminderList");
const weeklyReportHomeStatus = document.getElementById("weeklyReportHomeStatus");


const scheduleModal = document.getElementById("scheduleModal");
const closeModalButton = document.getElementById("closeModalButton");
const cancelModalButton = document.getElementById("cancelModalButton");
const modalTitle = document.getElementById("modalTitle");

let currentUser = null;
let currentUserData = null;
let selectedDateId = null;
let announcementsByDate = {};
let schedulesByDate = {};

// Step 2：表示中の年月を保持する。
// month は JavaScript の仕様に合わせて 0〜11 で扱う。
const initialDate = new Date();
let currentYear = initialDate.getFullYear();
let currentMonth = initialDate.getMonth();

// Step 3：表示モード。
// calendar = 7列カレンダー / list = 1日ごとの縦リスト
let currentViewMode = "calendar";
let currentWeekStartDate = getDefaultWeekStartForMonth(currentYear, currentMonth);

// Step 2：一度読んだ月はここに保存する。
// 同じ月に戻ったときは Firestore を再読み込みしない。
const monthlyScheduleCache = {};
const monthlyAnnouncementCache = {};

function formatDateId(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatMonthId(year, month) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}


function getWeekStartDate(date) {
  const weekStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = weekStart.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  weekStart.setDate(weekStart.getDate() + diff);
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
}

function addDays(date, days) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  next.setHours(0, 0, 0, 0);
  return next;
}

function getLastCompletedWeekStartDate() {
  const today = new Date();
  const thisWeekStart = getWeekStartDate(today);
  return addDays(thisWeekStart, -7);
}

function parseDateId(dateId) {
  const [yyyy, mm, dd] = dateId.split("-").map(Number);
  return new Date(yyyy, mm - 1, dd);
}

function weekIntersectsMonth(weekStartDate, year, month) {
  for (let i = 0; i < 5; i++) {
    const date = new Date(weekStartDate.getFullYear(), weekStartDate.getMonth(), weekStartDate.getDate() + i);
    if (date.getFullYear() === year && date.getMonth() === month) {
      return true;
    }
  }
  return false;
}

function getDefaultWeekStartForMonth(year, month) {
  const today = new Date();

  if (today.getFullYear() === year && today.getMonth() === month) {
    return getWeekStartDate(today);
  }

  return getWeekStartDate(new Date(year, month, 1));
}

function getWeekRangeLabel(weekStartDate) {
  const weekEndDate = new Date(weekStartDate.getFullYear(), weekStartDate.getMonth(), weekStartDate.getDate() + 4);
  return `${weekStartDate.getMonth() + 1}/${weekStartDate.getDate()}〜${weekEndDate.getMonth() + 1}/${weekEndDate.getDate()}`;
}

function updateWeekNavigationVisibility() {
  if (weekNavigation) {
    weekNavigation.classList.toggle("hidden", currentViewMode !== "week");
  }

  if (currentWeekLabel) {
    currentWeekLabel.textContent = getWeekRangeLabel(currentWeekStartDate);
  }
}

function getMonthIdFromDateId(dateId) {
  return dateId.slice(0, 7);
}

function getMonthlyScheduleId(userId, monthId) {
  return `${userId}_${monthId}`;
}

function getMonthlyAnnouncementId(officeId, monthId) {
  return `${officeId}_${monthId}`;
}

function getCurrentOfficeId() {
  return currentUserData?.officeId || DEFAULT_OFFICE_ID;
}

function getCurrentGroupId() {
  return currentUserData?.groupId || DEFAULT_GROUP_ID;
}

function formatJapaneseDate(dateId) {
  const parts = dateId.split("-");
  return `${Number(parts[1])}月${Number(parts[2])}日`;
}

function getJapaneseWeekday(date) {
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  return weekdays[date.getDay()];
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

function getCachedScheduleForDate(dateId) {
  const monthId = getMonthIdFromDateId(dateId);
  const monthData = monthlyScheduleCache[monthId] || {};
  return monthData[dateId] || null;
}

function getCachedAnnouncementsForDate(dateId) {
  const monthId = getMonthIdFromDateId(dateId);
  const monthData = monthlyAnnouncementCache[monthId] || {};
  return monthData[dateId] || [];
}

function calculateWorkDayCount(year, month) {
  const lastDate = new Date(year, month + 1, 0).getDate();
  let workDayCount = 0;

  for (let day = 1; day <= lastDate; day++) {
    const dateId = formatDateId(new Date(year, month, day));
    const scheduleData = schedulesByDate[dateId] || null;
    const status = scheduleData?.status || "";

    if (status === "通所" || status === "在宅") {
      workDayCount++;
    }
  }

  return workDayCount;
}

function updateCalendarTitleAndMonthLabel(year, month, workDayCount) {
  calendarTitle.textContent = `${year}年${month + 1}月の予定　勤務日数＝${workDayCount}日`;

  if (currentMonthLabel) {
    currentMonthLabel.textContent = `${year}年${month + 1}月`;
  }
}

function updateViewModeButtons() {
  if (calendarViewButton) {
    calendarViewButton.classList.toggle("active", currentViewMode === "calendar");
  }

  if (weekViewButton) {
    weekViewButton.classList.toggle("active", currentViewMode === "week");
  }

  if (listViewButton) {
    listViewButton.classList.toggle("active", currentViewMode === "list");
  }

  updateWeekNavigationVisibility();
}

function renderCurrentCalendarView(year, month) {
  updateViewModeButtons();

  if (currentViewMode === "list") {
    renderMonthlyCalendarList(year, month);
  } else if (currentViewMode === "week") {
    renderWeeklyCalendarGrid(year, month);
  } else {
    renderMonthlyCalendarGrid(year, month);
  }
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

let pageScrollY = 0;

function lockPageScroll() {
  pageScrollY = window.scrollY;
  document.documentElement.classList.add("modal-open");
  document.body.classList.add("modal-open");
  document.body.style.top = `-${pageScrollY}px`;
}

function unlockPageScroll() {
  document.documentElement.classList.remove("modal-open");
  document.body.classList.remove("modal-open");
  document.body.style.top = "";
  window.scrollTo(0, pageScrollY);
}

function openModal() {
  lockPageScroll();
  scheduleModal.classList.remove("hidden");
}

function closeModal() {
  scheduleModal.classList.add("hidden");
  unlockPageScroll();
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

  const announcements = getCachedAnnouncementsForDate(dateId);

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

function getTodayScheduleClass(status) {
  if (status === "通所") {
    return "today-schedule-coming";
  }

  if (status === "在宅") {
    return "today-schedule-home";
  }

  if (status === "休み") {
    return "today-schedule-off";
  }

  return "";
}

function renderTodaySchedule() {
  if (!currentUser || !todayScheduleBox || !todayScheduleText) {
    return;
  }

  const todayId = formatDateId(new Date());
  const data = getDisplayScheduleData(todayId);
  const status = data.status || "休み";
  const timeSlot = data.timeSlot || "";
  const statusClass = getTodayScheduleClass(status);

  if (timeSlot) {
    todayScheduleText.innerHTML = `
      <span class="today-schedule-main ${statusClass}">${status}</span>
      <span class="today-schedule-sub">${timeSlot}</span>
    `;
  } else {
    todayScheduleText.innerHTML = `
      <span class="today-schedule-main ${statusClass}">${status}</span>
    `;
  }

  todayScheduleBox.classList.remove("hidden");
}

function renderTodayAnnouncements() {
  if (!todayAnnouncements) {
    return;
  }

  const todayId = formatDateId(new Date());
  const announcements = getCachedAnnouncementsForDate(todayId);

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
    title.textContent = `${getAnnouncementIcon(announcement.category || "notice")} ${announcement.title || "無題のお知らせ"}`;

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

function openScheduleModal(dateId) {
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

  // 月間データは初回にまとめて schedulesByDate へ読み込み済み。
  // ここではFirestoreを読まず、手元のデータだけでモーダルを開く。
  const data = getCachedScheduleForDate(dateId);

  if (data) {
    scheduleStatus.value = data.status || "";
    scheduleTimeSlot.value = data.timeSlot || "";
    scheduleMemo.value = data.memo || "";

    applyStatusButtonActive(scheduleStatus.value);
    applyTimeSlotButtonActive(scheduleTimeSlot.value);
  }

  updateTimeSlotVisibility();
  openModal();
}

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

// ==============================
// アナウンス：新方式 monthlyAnnouncements
// 事業所1つ・1か月で1ドキュメント
// ==============================
async function loadMonthlyAnnouncements(year, month) {
  const monthId = formatMonthId(year, month);
  const officeId = getCurrentOfficeId();
  const cacheKey = `${officeId}_${monthId}`;

  if (monthlyAnnouncementCache[cacheKey]) {
    announcementsByDate = monthlyAnnouncementCache[cacheKey];
    return;
  }

  const monthlyAnnouncementId = getMonthlyAnnouncementId(officeId, monthId);
  const docRef = doc(db, "monthlyAnnouncements", monthlyAnnouncementId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    monthlyAnnouncementCache[cacheKey] = {};
    announcementsByDate = monthlyAnnouncementCache[cacheKey];
    return;
  }

  const data = docSnap.data();
  const rawDays = data.days || {};
  const loadedAnnouncementsByDate = {};

  Object.keys(rawDays).forEach((dateId) => {
    const rawList = Array.isArray(rawDays[dateId]) ? rawDays[dateId] : [];

    const visibleList = rawList.filter((announcement) => {
      return announcement.visibility !== "staff" && announcement.active !== false;
    });

    if (visibleList.length > 0) {
      loadedAnnouncementsByDate[dateId] = visibleList;
    }
  });

  monthlyAnnouncementCache[cacheKey] = loadedAnnouncementsByDate;
  announcementsByDate = loadedAnnouncementsByDate;
}

// ==============================
// 予定：新方式 monthlySchedules
// 利用者1人・1か月で1ドキュメント
// ==============================
async function loadMonthlySchedule(year, month) {
  const monthId = formatMonthId(year, month);

  if (monthlyScheduleCache[monthId]) {
    schedulesByDate = monthlyScheduleCache[monthId];
    return;
  }

  const monthlyScheduleId = getMonthlyScheduleId(currentUser.uid, monthId);
  const docRef = doc(db, "monthlySchedules", monthlyScheduleId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    monthlyScheduleCache[monthId] = {};
    schedulesByDate = monthlyScheduleCache[monthId];
    return;
  }

  const data = docSnap.data();
  monthlyScheduleCache[monthId] = data.days || {};
  schedulesByDate = monthlyScheduleCache[monthId];
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function getWeekdayColumnIndex(date) {
  // 月曜=0、火曜=1、水曜=2、木曜=3、金曜=4
  return date.getDay() - 1;
}

function getDisplayScheduleData(dateId) {
  const scheduleData = schedulesByDate[dateId] || null;

  if (scheduleData && scheduleData.status) {
    return scheduleData;
  }

  return {
    status: "休み",
    timeSlot: "",
    memo: "",
    _implicitOff: true
  };
}

function isUseDaySchedule(scheduleData) {
  const status = scheduleData?.status || "";
  return status === "通所" || status === "在宅";
}

function isAllDaysMode() {
  return !showAllDaysCheckbox || showAllDaysCheckbox.checked;
}

function shouldShowDate(dateId, date) {
  if (isWeekend(date)) {
    return false;
  }

  if (isAllDaysMode()) {
    return true;
  }

  const scheduleData = schedulesByDate[dateId] || null;
  const announcements = announcementsByDate[dateId] || [];

  const useDayChecked = showUseDaysCheckbox?.checked === true;
  const announcementChecked = showAnnouncementDaysCheckbox?.checked === true;

  const matchesUseDay = useDayChecked && isUseDaySchedule(scheduleData);
  const matchesAnnouncement = announcementChecked && announcements.length > 0;

  return matchesUseDay || matchesAnnouncement;
}

function getUserDayToneClass(dateId) {
  const actualScheduleData = schedulesByDate[dateId] || null;
  const displayScheduleData = getDisplayScheduleData(dateId);
  const announcements = announcementsByDate[dateId] || [];
  const isUseDay = isUseDaySchedule(actualScheduleData);
  const hasAnnouncement = announcements.length > 0;

  if (isUseDay && hasAnnouncement) {
    return "day-use-with-announcement";
  }

  if (isUseDay) {
    return "day-use";
  }

  if (hasAnnouncement) {
    return "day-announcement-only";
  }

  if (displayScheduleData.status === "休み") {
    return "day-off";
  }

  return "";
}

function normalizeCalendarFilters(changedCheckbox) {
  if (!showAllDaysCheckbox || !showUseDaysCheckbox || !showAnnouncementDaysCheckbox) {
    return;
  }

  if (changedCheckbox === showAllDaysCheckbox && showAllDaysCheckbox.checked) {
    showUseDaysCheckbox.checked = false;
    showAnnouncementDaysCheckbox.checked = false;
    return;
  }

  if (changedCheckbox !== showAllDaysCheckbox) {
    if (showUseDaysCheckbox.checked || showAnnouncementDaysCheckbox.checked) {
      showAllDaysCheckbox.checked = false;
    } else {
      // 何も選ばれていない状態は分かりにくいので、全体表示に戻す
      showAllDaysCheckbox.checked = true;
    }
  }
}

function refreshCalendarByFilter(changedCheckbox) {
  normalizeCalendarFilters(changedCheckbox);
  selectedDateId = null;
  message.textContent = "";
  renderCurrentCalendarView(currentYear, currentMonth);
}

function renderMonthlyCalendarGrid(year, month) {
  monthlyCalendar.innerHTML = "";
  monthlyCalendar.classList.remove("monthly-calendar-list");
  monthlyCalendar.classList.remove("weekly-calendar");

  if (calendarWeekHeader) {
    calendarWeekHeader.classList.remove("hidden");
  }

  const today = new Date();
  const monthId = formatMonthId(year, month);
  const lastDay = new Date(year, month + 1, 0);
  const lastDate = lastDay.getDate();

  const workDayCount = calculateWorkDayCount(year, month);
  let hasRenderedDay = false;
  let addedLeadingEmptyCells = false;

  function appendEmptyCell(extraClass = "") {
    const emptyCell = document.createElement("div");
    emptyCell.className = `calendar-day empty ${extraClass}`.trim();
    monthlyCalendar.appendChild(emptyCell);
  }

  for (let day = 1; day <= lastDate; day++) {
    const targetDate = new Date(year, month, day);
    const dateId = formatDateId(targetDate);

    // カレンダー表示は月〜金の5列で固定する。
    // 土日は列自体を持たないのでスキップする。
    if (isWeekend(targetDate)) {
      continue;
    }

    // 月初が火〜金から始まる場合、曜日位置がずれないように空セルを入れる。
    if (!addedLeadingEmptyCells) {
      const leadingEmptyCount = getWeekdayColumnIndex(targetDate);

      for (let i = 0; i < leadingEmptyCount; i++) {
        appendEmptyCell("leading-empty");
      }

      addedLeadingEmptyCells = true;
    }

    // 「利用日」「アナウンス」などで絞り込んだ場合も、
    // 該当しない日は空セルとして残す。
    // これで月〜金の曜日位置がズレず、カレンダーの形を保てる。
    if (!shouldShowDate(dateId, targetDate)) {
      appendEmptyCell("filtered-empty");
      continue;
    }

    hasRenderedDay = true;

    const scheduleData = getDisplayScheduleData(dateId);
    const status = scheduleData.status || "休み";
    const timeSlot = scheduleData.timeSlot || "";
    const memo = scheduleData.memo || "";

    const dayCell = document.createElement("div");
    dayCell.className = `calendar-day ${getUserDayToneClass(dateId)}`.trim();
    dayCell.dataset.dateId = dateId;

    if (dateId === formatDateId(today)) {
      dayCell.classList.add("today");
    }

    if (dateId === selectedDateId) {
      dayCell.classList.add("selected-day");
    }

    const dateEl = document.createElement("div");
    dateEl.className = "calendar-date";
    dateEl.textContent = `${day}日（${getJapaneseWeekday(targetDate)}）`;

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

  if (!hasRenderedDay) {
    monthlyCalendar.innerHTML = "";
    const emptyMessage = document.createElement("div");
    emptyMessage.className = "calendar-filter-empty";
    emptyMessage.textContent = "表示条件に合う日がありません。";
    monthlyCalendar.appendChild(emptyMessage);
  }

  updateCalendarTitleAndMonthLabel(year, month, workDayCount);

  console.log(`[Read節約] ${monthId} をカレンダー表示しました。キャッシュ済み月:`, Object.keys(monthlyScheduleCache));
}

function renderWeeklyCalendarGrid(year, month) {
  monthlyCalendar.innerHTML = "";
  monthlyCalendar.classList.remove("monthly-calendar-list");
  monthlyCalendar.classList.add("weekly-calendar");

  if (calendarWeekHeader) {
    calendarWeekHeader.classList.remove("hidden");
  }

  if (!weekIntersectsMonth(currentWeekStartDate, year, month)) {
    currentWeekStartDate = getDefaultWeekStartForMonth(year, month);
  }

  const today = new Date();
  const monthId = formatMonthId(year, month);
  const workDayCount = calculateWorkDayCount(year, month);
  let hasRenderedDay = false;

  for (let i = 0; i < 5; i++) {
    const targetDate = new Date(currentWeekStartDate.getFullYear(), currentWeekStartDate.getMonth(), currentWeekStartDate.getDate() + i);
    const dateId = formatDateId(targetDate);

    if (targetDate.getFullYear() !== year || targetDate.getMonth() !== month) {
      const emptyCell = document.createElement("div");
      emptyCell.className = "calendar-day empty outside-month";
      monthlyCalendar.appendChild(emptyCell);
      continue;
    }

    if (!shouldShowDate(dateId, targetDate)) {
      const emptyCell = document.createElement("div");
      emptyCell.className = "calendar-day empty filtered-empty";
      monthlyCalendar.appendChild(emptyCell);
      continue;
    }

    hasRenderedDay = true;

    const scheduleData = getDisplayScheduleData(dateId);
    const status = scheduleData.status || "休み";
    const timeSlot = scheduleData.timeSlot || "";
    const memo = scheduleData.memo || "";
    const dayCell = document.createElement("div");
    dayCell.className = `calendar-day ${getUserDayToneClass(dateId)}`.trim();
    dayCell.dataset.dateId = dateId;

    if (dateId === formatDateId(today)) {
      dayCell.classList.add("today");
    }

    if (dateId === selectedDateId) {
      dayCell.classList.add("selected-day");
    }

    const dateEl = document.createElement("div");
    dateEl.className = "calendar-date";
    dateEl.textContent = `${targetDate.getMonth() + 1}/${targetDate.getDate()}（${getJapaneseWeekday(targetDate)}）`;

    const statusEl = document.createElement("div");
    statusEl.className = `calendar-status ${getStatusClass(status)}`;
    statusEl.textContent = status;

    dayCell.appendChild(dateEl);
    dayCell.appendChild(statusEl);

    if (timeSlot) {
      const timeSlotEl = document.createElement("div");
      timeSlotEl.className = "calendar-time-slot";
      timeSlotEl.textContent = timeSlot;
      dayCell.appendChild(timeSlotEl);
    }

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

  if (!hasRenderedDay) {
    const emptyMessage = document.createElement("div");
    emptyMessage.className = "calendar-filter-empty";
    emptyMessage.textContent = "表示条件に合う日がありません。";
    monthlyCalendar.appendChild(emptyMessage);
  }

  updateCalendarTitleAndMonthLabel(year, month, workDayCount);
  updateWeekNavigationVisibility();
  console.log(`[Read節約] ${monthId} を週間表示しました。月間データのキャッシュを使うため追加Readはありません。`);
}

function renderMonthlyCalendarList(year, month) {
  monthlyCalendar.innerHTML = "";
  monthlyCalendar.classList.remove("weekly-calendar");
  monthlyCalendar.classList.add("monthly-calendar-list");

  if (calendarWeekHeader) {
    calendarWeekHeader.classList.add("hidden");
  }

  const today = new Date();
  const monthId = formatMonthId(year, month);
  const lastDate = new Date(year, month + 1, 0).getDate();
  const workDayCount = calculateWorkDayCount(year, month);
  let hasRenderedDay = false;

  for (let day = 1; day <= lastDate; day++) {
    const targetDate = new Date(year, month, day);
    const dateId = formatDateId(targetDate);

    if (!shouldShowDate(dateId, targetDate)) {
      continue;
    }

    hasRenderedDay = true;

    const scheduleData = getDisplayScheduleData(dateId);
    const announcements = announcementsByDate[dateId] || [];

    const status = scheduleData.status || "休み";
    const timeSlot = scheduleData.timeSlot || "";
    const memo = scheduleData.memo || "";

    const dayItem = document.createElement("div");
    dayItem.className = `calendar-list-day ${getUserDayToneClass(dateId)}`.trim();
    dayItem.dataset.dateId = dateId;

    if (dateId === formatDateId(today)) {
      dayItem.classList.add("today");
    }

    if (dateId === selectedDateId) {
      dayItem.classList.add("selected-day");
    }

    const header = document.createElement("div");
    header.className = "calendar-list-header";

    const dateText = document.createElement("div");
    dateText.className = "calendar-list-date";
    dateText.textContent = `${month + 1}月${day}日（${getJapaneseWeekday(targetDate)}）`;

    const statusBadge = document.createElement("div");
    statusBadge.className = `calendar-list-status ${getStatusClass(status)}`;
    statusBadge.textContent = status;

    header.appendChild(dateText);
    header.appendChild(statusBadge);
    dayItem.appendChild(header);

    if (status !== "休み" || timeSlot || memo) {
      const scheduleArea = document.createElement("div");
      scheduleArea.className = "calendar-list-schedule";

      if (status !== "休み") {
        const scheduleMain = document.createElement("div");
        scheduleMain.className = "calendar-list-schedule-main";
        scheduleMain.textContent = timeSlot ? `予定：${status}　${timeSlot}` : `予定：${status}`;
        scheduleArea.appendChild(scheduleMain);
      }

      if (memo) {
        const memoText = document.createElement("div");
        memoText.className = "calendar-list-memo";
        memoText.textContent = `メモ：${memo}`;
        scheduleArea.appendChild(memoText);
      }

      dayItem.appendChild(scheduleArea);
    }

    // アナウンスがある日だけ、アナウンス欄を表示する。
    // 何もない日は「アナウンス」「なし」を出さず、その分コンパクトにする。
    if (announcements.length > 0) {
      const announcementArea = document.createElement("div");
      announcementArea.className = "calendar-list-announcements";

      announcements.forEach((announcement) => {
        const announcementCard = document.createElement("div");
        announcementCard.className = `calendar-list-announcement category-${announcement.category || "notice"}`;

        const announcementTitle = document.createElement("div");
        announcementTitle.className = "calendar-list-announcement-title";
        announcementTitle.textContent = `${getAnnouncementIcon(announcement.category || "notice")} ${announcement.title || "お知らせ"}`;
        announcementCard.appendChild(announcementTitle);

        if (announcement.timeText) {
          const announcementTime = document.createElement("div");
          announcementTime.className = "calendar-list-announcement-time";
          announcementTime.textContent = announcement.timeText;
          announcementCard.appendChild(announcementTime);
        }

        if (announcement.body) {
          const announcementBody = document.createElement("div");
          announcementBody.className = "calendar-list-announcement-body";
          announcementBody.textContent = announcement.body;
          announcementCard.appendChild(announcementBody);
        }

        announcementArea.appendChild(announcementCard);
      });

      dayItem.appendChild(announcementArea);
    }

    dayItem.addEventListener("click", () => {
      openScheduleModal(dateId);
    });

    monthlyCalendar.appendChild(dayItem);
  }

  if (!hasRenderedDay) {
    const emptyMessage = document.createElement("div");
    emptyMessage.className = "calendar-filter-empty";
    emptyMessage.textContent = "表示条件に合う日がありません。";
    monthlyCalendar.appendChild(emptyMessage);
  }

  updateCalendarTitleAndMonthLabel(year, month, workDayCount);

  console.log(`[Read節約] ${monthId} をリスト表示しました。表示切替による追加Readはありません。`);
}

async function loadMonthlyCalendar() {
  if (!currentUser) {
    return;
  }

  const monthId = formatMonthId(currentYear, currentMonth);
  monthlyCalendar.textContent = "読み込み中...";

  if (currentMonthLabel) {
    currentMonthLabel.textContent = `${currentYear}年${currentMonth + 1}月`;
  }

  try {
    calendarTitle.textContent = `${currentYear}年${currentMonth + 1}月の予定　読み込み中...`;

    await loadMonthlyAnnouncements(currentYear, currentMonth);
    await loadMonthlySchedule(currentYear, currentMonth);

    renderCurrentCalendarView(currentYear, currentMonth);

    // 本日の予定・本日のアナウンスは、今日を含む月データが読み込まれているときだけ更新する。
    // 別月に移動しても「本日の予定」表示が別月データで上書きされないようにする。
    const today = new Date();
    const todayMonthId = formatMonthId(today.getFullYear(), today.getMonth());

    if (monthId === todayMonthId) {
      renderTodayAnnouncements();
      renderTodaySchedule();
    }

  } catch (error) {
    console.error("月間カレンダー読み込みエラー:", error);
    monthlyCalendar.textContent = `カレンダーの読み込みに失敗しました：${error.code || error.message}`;
  }
}

async function changeDisplayedMonth(monthOffset) {
  if (!currentUser) {
    return;
  }

  const nextDate = new Date(currentYear, currentMonth + monthOffset, 1);
  currentYear = nextDate.getFullYear();
  currentMonth = nextDate.getMonth();
  currentWeekStartDate = getDefaultWeekStartForMonth(currentYear, currentMonth);
  selectedDateId = null;

  if (prevMonthButton) {
    prevMonthButton.disabled = true;
  }

  if (nextMonthButton) {
    nextMonthButton.disabled = true;
  }

  message.textContent = "";

  await loadMonthlyCalendar();

  if (prevMonthButton) {
    prevMonthButton.disabled = false;
  }

  if (nextMonthButton) {
    nextMonthButton.disabled = false;
  }
}

if (prevMonthButton) {
  prevMonthButton.addEventListener("click", () => {
    changeDisplayedMonth(-1);
  });
}

if (nextMonthButton) {
  nextMonthButton.addEventListener("click", () => {
    changeDisplayedMonth(1);
  });
}

if (calendarViewButton) {
  calendarViewButton.addEventListener("click", () => {
    currentViewMode = "calendar";
    selectedDateId = null;
    message.textContent = "";
    renderCurrentCalendarView(currentYear, currentMonth);
  });
}

if (listViewButton) {
  listViewButton.addEventListener("click", () => {
    currentViewMode = "list";
    selectedDateId = null;
    message.textContent = "";
    renderCurrentCalendarView(currentYear, currentMonth);
  });
}
if (weekViewButton) {
  weekViewButton.addEventListener("click", () => {
    currentViewMode = "week";
    selectedDateId = null;
    message.textContent = "";

    // 週間表示へ切り替えた最初の表示は、必ずその月の基準週に戻す。
    // 今月なら「今週」、別の月なら「その月の最初の平日を含む週」。
    // Firestoreは読み直さず、すでに読み込んだ月間データを表示だけ切り替える。
    currentWeekStartDate = getDefaultWeekStartForMonth(currentYear, currentMonth);

    renderCurrentCalendarView(currentYear, currentMonth);
  });
}

async function changeDisplayedWeek(weekOffset) {
  const nextWeekStart = new Date(currentWeekStartDate.getFullYear(), currentWeekStartDate.getMonth(), currentWeekStartDate.getDate() + weekOffset * 7);

  // Read節約のため、週移動は現在読み込んでいる月の範囲内だけで行う。
  if (!weekIntersectsMonth(nextWeekStart, currentYear, currentMonth)) {
    return;
  }

  currentWeekStartDate = nextWeekStart;
  selectedDateId = null;
  message.textContent = "";
  renderCurrentCalendarView(currentYear, currentMonth);
}

if (prevWeekButton) {
  prevWeekButton.addEventListener("click", () => {
    changeDisplayedWeek(-1);
  });
}

if (nextWeekButton) {
  nextWeekButton.addEventListener("click", () => {
    changeDisplayedWeek(1);
  });
}


if (showAllDaysCheckbox) {
  showAllDaysCheckbox.addEventListener("change", () => {
    refreshCalendarByFilter(showAllDaysCheckbox);
  });
}

if (showUseDaysCheckbox) {
  showUseDaysCheckbox.addEventListener("change", () => {
    refreshCalendarByFilter(showUseDaysCheckbox);
  });
}

if (showAnnouncementDaysCheckbox) {
  showAnnouncementDaysCheckbox.addEventListener("change", () => {
    refreshCalendarByFilter(showAnnouncementDaysCheckbox);
  });
}

// ==============================
// 週一報告：未記入チェック
// 直近8週のうち、運用開始週以降だけ直接 getDoc して確認する。
// 一覧クエリを使わず、利用者本人の週報ドキュメントだけを読む。
// ==============================
function getWeeklyReportId(userId, weekStartDateId) {
  return `${userId}_${weekStartDateId}`;
}

function formatWeeklyReportRangeText(weekStartDate) {
  const weekEndDate = addDays(weekStartDate, 4);
  return `${weekStartDate.getFullYear()}年${weekStartDate.getMonth() + 1}月${weekStartDate.getDate()}日〜${weekEndDate.getMonth() + 1}月${weekEndDate.getDate()}日`;
}

function setWeeklyReportHomeStatus(text, tone = "") {
  if (!weeklyReportHomeStatus) {
    return;
  }

  weeklyReportHomeStatus.textContent = text;
  weeklyReportHomeStatus.classList.remove("weekly-report-home-status-ok", "weekly-report-home-status-alert", "weekly-report-home-status-error");

  if (tone) {
    weeklyReportHomeStatus.classList.add(`weekly-report-home-status-${tone}`);
  }
}

function hideWeeklyReportReminder() {
  if (weeklyReportReminderBox) {
    weeklyReportReminderBox.classList.add("hidden");
  }
}

function isUnreadWeeklyReportFeedback(report) {
  if (!report || report.submitted !== true || !report.staffFeedbackText || !report.staffFeedbackVersion) {
    return false;
  }

  if (report.feedbackReadByUser === true) {
    return false;
  }

  return Boolean(
    report.staffFeedbackReadVersion !== report.staffFeedbackVersion
  );
}

function renderWeeklyReportReminder(pendingWeeks, unreadFeedbackReports = []) {
  if (!weeklyReportReminderBox || !weeklyReportReminderList) {
    setWeeklyReportHomeStatus("週一報告の確認欄が見つかりません。", "error");
    return;
  }

  weeklyReportReminderList.innerHTML = "";

  const totalCount = pendingWeeks.length + unreadFeedbackReports.length;

  if (!totalCount) {
    hideWeeklyReportReminder();
    setWeeklyReportHomeStatus("未記入の週一報告・未確認の返信はありません。", "ok");
    return;
  }

  weeklyReportReminderBox.classList.remove("hidden");
  setWeeklyReportHomeStatus(
    `未記入${pendingWeeks.length}件／返信あり${unreadFeedbackReports.length}件`,
    "alert"
  );

  if (weeklyReportReminderCount) {
    weeklyReportReminderCount.textContent = `${totalCount}件`;
  }

  if (weeklyReportReminderText) {
    if (pendingWeeks.length > 0 && unreadFeedbackReports.length > 0) {
      weeklyReportReminderText.textContent = "未記入の週一報告と、支援員からの返信があります。古い週から順番に確認できます。";
    } else if (pendingWeeks.length > 0) {
      weeklyReportReminderText.textContent = pendingWeeks.length === 1
        ? "未記入の週一報告があります。記入をお願いします。"
        : "未記入の週一報告が複数あります。古い週から順番に記入できます。";
    } else {
      weeklyReportReminderText.textContent = "支援員からの返信があります。確認すると、この表示は消えます。";
    }
  }

  pendingWeeks.forEach((week) => {
    const item = document.createElement("a");
    item.className = "weekly-report-reminder-item weekly-report-reminder-item-pending";
    item.href = `weekly-report.html?weekStart=${week.weekStartDate}`;

    const title = document.createElement("div");
    title.className = "weekly-report-reminder-item-title";
    title.textContent = `未記入：${week.label}`;

    const action = document.createElement("div");
    action.className = "weekly-report-reminder-item-action";
    action.textContent = "記入する";

    item.appendChild(title);
    item.appendChild(action);
    weeklyReportReminderList.appendChild(item);
  });

  unreadFeedbackReports.forEach((report) => {
    const item = document.createElement("a");
    item.className = "weekly-report-reminder-item weekly-report-reminder-item-feedback";
    item.href = `weekly-report.html?weekStart=${report.weekStartDate}`;

    const title = document.createElement("div");
    title.className = "weekly-report-reminder-item-title";
    title.textContent = `返信あり：${report.label}`;

    const action = document.createElement("div");
    action.className = "weekly-report-reminder-item-action";
    action.textContent = "確認する";

    item.appendChild(title);
    item.appendChild(action);
    weeklyReportReminderList.appendChild(item);
  });
}

async function loadWeeklyReportReminder() {
  if (!currentUser || !currentUserData) {
    return;
  }

  setWeeklyReportHomeStatus("週一報告の未記入・返信状況を確認中...");

  if (!weeklyReportReminderBox) {
    setWeeklyReportHomeStatus("週一報告の表示エリアが見つかりません。user.htmlを確認してください。", "error");
    return;
  }

  try {
    const latestWeekStart = getLastCompletedWeekStartDate();
    const startWeekDate = getWeekStartDate(parseDateId(WEEKLY_REPORT_START_WEEK));
    const pendingWeeks = [];
    const unreadFeedbackReports = [];
    const maxWeeks = Math.max(WEEKLY_REPORT_CHECK_WEEKS, WEEKLY_REPORT_FEEDBACK_CHECK_WEEKS);

    for (let i = maxWeeks - 1; i >= 0; i--) {
      const weekStartDate = addDays(latestWeekStart, -7 * i);

      if (weekStartDate < startWeekDate) {
        continue;
      }

      const weekStartDateId = formatDateId(weekStartDate);
      const reportId = getWeeklyReportId(currentUser.uid, weekStartDateId);
      const docSnap = await getDoc(doc(db, "weeklyReports", reportId));
      const label = formatWeeklyReportRangeText(weekStartDate);

      if (!docSnap.exists() || docSnap.data()?.submitted !== true) {
        if (i < WEEKLY_REPORT_CHECK_WEEKS) {
          pendingWeeks.push({
            weekStartDate: weekStartDateId,
            label: label
          });
        }
        continue;
      }

      const report = docSnap.data();
      if (isUnreadWeeklyReportFeedback(report)) {
        unreadFeedbackReports.push({
          weekStartDate: report.weekStartDate || weekStartDateId,
          label: label,
          staffFeedbackVersion: report.staffFeedbackVersion
        });
      }
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get("forceWeeklyReportReminder") === "1" && pendingWeeks.length === 0 && unreadFeedbackReports.length === 0) {
      pendingWeeks.push({
        weekStartDate: formatDateId(latestWeekStart),
        label: `${formatWeeklyReportRangeText(latestWeekStart)}（テスト表示）`
      });
    }

    renderWeeklyReportReminder(pendingWeeks, unreadFeedbackReports);
    console.log("週一報告未記入・返信チェック", {
      startWeek: WEEKLY_REPORT_START_WEEK,
      latestWeek: formatDateId(latestWeekStart),
      pendingWeeks: pendingWeeks.map((week) => week.weekStartDate),
      unreadFeedbackReports: unreadFeedbackReports.map((week) => week.weekStartDate)
    });
    console.log(`[Read節約] 週一報告チェック：直近${maxWeeks}週分を直接確認。未記入と未確認返信をまとめて確認します。`);
  } catch (error) {
    console.error("週一報告未記入・返信チェックエラー:", error);
    setWeeklyReportHomeStatus(`週一報告チェック失敗：${error.code || error.message}`, "error");

    if (weeklyReportReminderBox && weeklyReportReminderText && weeklyReportReminderList) {
      weeklyReportReminderBox.classList.remove("hidden");
      if (weeklyReportReminderCount) {
        weeklyReportReminderCount.textContent = "確認失敗";
      }
      weeklyReportReminderText.textContent = `週一報告の確認に失敗しました：${error.code || error.message}`;
      weeklyReportReminderList.innerHTML = `<a class="weekly-report-reminder-item" href="weekly-report.html"><div class="weekly-report-reminder-item-title">週一報告ページを開く</div><div class="weekly-report-reminder-item-action">確認する</div></a>`;
    }
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

    userInfo.textContent = `${userData.name}さん`;

    await loadWeeklyReportReminder();
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
    const monthId = getMonthIdFromDateId(date);
    const monthlyScheduleId = getMonthlyScheduleId(currentUser.uid, monthId);
    const dayData = {
      status: status,
      timeSlot: status === "休み" ? "" : timeSlot,
      memo: memo,
      updatedAt: new Date().toISOString()
    };

    await setDoc(doc(db, "monthlySchedules", monthlyScheduleId), {
      userId: currentUser.uid,
      userName: currentUserData?.name || currentUser.email,
      userEmail: currentUser.email,
      officeId: getCurrentOfficeId(),
      groupId: getCurrentGroupId(),
      month: monthId,
      days: {
        [date]: dayData
      },
      updatedAt: serverTimestamp()
    }, { merge: true });

    // 保存後はFirestoreを再読み込みせず、手元の月間データだけ更新する。
    if (!monthlyScheduleCache[monthId]) {
      monthlyScheduleCache[monthId] = {};
    }

    monthlyScheduleCache[monthId][date] = dayData;

    const displayedMonthId = formatMonthId(currentYear, currentMonth);

    if (displayedMonthId === monthId) {
      schedulesByDate = monthlyScheduleCache[monthId];
    }

    message.style.color = "green";
    message.textContent = "予定を保存しました。";

    closeModal();

    renderCurrentCalendarView(currentYear, currentMonth);
    renderTodaySchedule();

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
