// STEP55_OFFICE_ID_ENZINE_CHIBA_20260623_V85：事業所IDをenzine_chibaへ統一し旧engine_chibaを互換扱い
// STEP54_CASE_DEADLINES_ON_CALENDAR_20260623_V84：アクティブなワークショップの案件締切をカレンダー表示
// STEP53_WORKSHOP_DETAIL_LINK_20260623_V83：アナウンスからワークショップ詳細へ遷移
// STEP51_WEEKLY_REPORT_NEW_USER_START_20260622_V81：新規登録者の週一報告は登録週の翌週から表示
// STEP50_SETTINGS_MENU_CLOSE_20260622_V80：設定メニューを外クリックとEscで閉じる
// STEP48_PUBLIC_BILLING_SAFETY_TEST_NOTICE_20260622_V78：利用者ページにも課金安全テスト中表示を追加
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
  doc,
  setDoc,
  updateDoc,
  getDoc,
  deleteField,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

import { auth, db } from "./firebase-config.js";
import { applyOfficeBrandName, enforceMaintenanceAccess, setWeeklyReportNavPendingCount, setupSettingsMenuClose } from "./ui-common.js?v=89";

// STEP7_WEEKLY_REPORT_STABILITY_20260620_V36：返信既読フィールドの互換対応
// STEP9_WEEKLY_REPORT_WEEKDAY_START_20260620_V38：週一報告は2026-06-15週の月〜金から開始
// STEP11_USER_CALENDAR_READABILITY_20260620_V40：未入力日と明示休み表示を分離
// STEP12_CALENDAR_STYLE_TUNE_20260620_V41：本日未入力表示とカレンダー配色を調整
// STEP18_WEEKLY_REPORT_STATUS_CACHE_20260620_V47：週一報告通知を集約doc優先で確認
// STEP20_USER_INPUT_ASSISTS_20260620_V49：前回の予定入力を再利用できる補助を追加
// STEP21_SAVE_AND_NEXT_WEEKDAY_20260620_V50：保存後に次の平日を続けて開く
// STEP22_CLEAR_USER_SCHEDULE_20260620_V51：利用者が予定を未入力に戻せる操作を追加

// ==============================
// 基本設定
// ==============================

// まだ users ドキュメントに officeId / groupId がない場合の仮設定。
// 将来、事業所が増えたら users 側に officeId / groupId を登録していく。
const DEFAULT_OFFICE_ID = "enzine_chiba";
const LEGACY_OFFICE_IDS = ["engine_chiba"];
const DEFAULT_GROUP_ID = "enzine";
const WEEKLY_REPORT_CHECK_WEEKS = 8;
const WEEKLY_REPORT_START_WEEK = "2026-06-15";
const WEEKLY_REPORT_FEEDBACK_CHECK_WEEKS = 12;
const WEEKLY_REPORT_STATUS_COLLECTION = "weeklyReportUserStatus";
const WEEKLY_REPORT_STATUS_SCHEMA_VERSION = 1;
const LAST_SCHEDULE_INPUT_STORAGE_KEY = "enzineLastScheduleInput";
const BILLING_SAFETY_DOC_ID = "billingSafety";
const WORKSHOP_RESOURCES_DOC_PREFIX = "workshopResources_";
const ANNOUNCEMENT_CATEGORY_ORDER = {
  workshop: 1,
  important: 2,
  notice: 3,
  deadline: 4,
  attendance: 5,
  task: 6
};


const userInfo = document.getElementById("userInfo");
const scheduleDate = document.getElementById("scheduleDate");
const scheduleStatus = document.getElementById("scheduleStatus");
const scheduleTimeSlot = document.getElementById("scheduleTimeSlot");
const timeSlotChoiceBox = document.getElementById("timeSlotChoiceBox");
const scheduleMemo = document.getElementById("scheduleMemo");
const applyLastScheduleButton = document.getElementById("applyLastScheduleButton");
const clearScheduleButton = document.getElementById("clearScheduleButton");

const modalAnnouncements = document.getElementById("modalAnnouncements");
const statusButtons = document.querySelectorAll("[data-status]");
const timeSlotButtons = document.querySelectorAll("[data-timeslot]");

const saveScheduleButton = document.getElementById("saveScheduleButton");
const saveAndNextScheduleButton = document.getElementById("saveAndNextScheduleButton");
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
const calendarFilterBox = document.getElementById("calendarFilterBox");
const calendarFilterTitle = document.getElementById("calendarFilterTitle");
const calendarDisplayFilterControls = document.getElementById("calendarDisplayFilterControls");
const calendarBulkControls = document.getElementById("calendarBulkControls");
const calendarBulkRegisterButton = document.getElementById("calendarBulkRegisterButton");
const calendarBulkCancelButton = document.getElementById("calendarBulkCancelButton");
const calendarBulkStatusCheckboxes = [
  document.getElementById("calendarBulkStatusComing"),
  document.getElementById("calendarBulkStatusHome")
].filter(Boolean);
const calendarBulkTimeCheckboxes = [
  document.getElementById("calendarBulkTimeAll"),
  document.getElementById("calendarBulkTimeMorning"),
  document.getElementById("calendarBulkTimeAfternoon")
].filter(Boolean);
const calendarBulkSelectedCount = document.getElementById("calendarBulkSelectedCount");
const calendarBulkAlert = document.getElementById("calendarBulkAlert");
const todayAnnouncements = document.getElementById("todayAnnouncements");
const todayScheduleBox = document.getElementById("todayScheduleBox");
const todayScheduleText = document.getElementById("todayScheduleText");
const weeklyReportReminderBox = document.getElementById("weeklyReportReminderBox");
const weeklyReportReminderCount = document.getElementById("weeklyReportReminderCount");
const weeklyReportReminderText = document.getElementById("weeklyReportReminderText");
const weeklyReportReminderList = document.getElementById("weeklyReportReminderList");
const weeklyReportHomeStatus = document.getElementById("weeklyReportHomeStatus");
const billingSafetyNotice = document.getElementById("billingSafetyNotice");

setupSettingsMenuClose();


const scheduleModal = document.getElementById("scheduleModal");
const closeModalButton = document.getElementById("closeModalButton");
const cancelModalButton = document.getElementById("cancelModalButton");
const modalTitle = document.getElementById("modalTitle");

let currentUser = null;
let currentUserData = null;
let selectedDateId = null;
let announcementsByDate = {};
let schedulesByDate = {};
let workshopResourcesCache = { schemaVersion: 2, workshops: [], cases: [], guides: [] };
let workshopResourcesLoadedOfficeId = "";

// Step 2：表示中の年月を保持する。
// month は JavaScript の仕様に合わせて 0〜11 で扱う。
const initialDate = new Date();
let currentYear = initialDate.getFullYear();
let currentMonth = initialDate.getMonth();

// Step 3：表示モード。
// calendar = 7列カレンダー / list = 1日ごとの縦リスト
let currentViewMode = "calendar";
let currentWeekStartDate = getDefaultWeekStartForMonth(currentYear, currentMonth);
let isCalendarBulkRegistrationActive = false;
let calendarBulkSelectedDateIds = new Set();
let calendarFilterStateBeforeBulkRegistration = null;
let calendarBulkAlertTimer = null;

// Step 2：一度読んだ月はここに保存する。
// 同じ月に戻ったときは Firestore を再読み込みしない。
const monthlyScheduleCache = {};
const monthlyAnnouncementCache = {};
const monthlyCaseDeadlineAnnouncementCache = {};

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

function parseOptionalDateId(dateId) {
  if (typeof dateId !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateId)) {
    return null;
  }

  return parseDateId(dateId);
}

function getWeeklyReportStartWeekDateForUser(userData) {
  const globalStartWeekDate = getWeekStartDate(parseDateId(WEEKLY_REPORT_START_WEEK));
  const explicitStartWeekDate = parseOptionalDateId(userData?.weeklyReportStartWeek);

  if (explicitStartWeekDate) {
    const normalizedExplicitStart = getWeekStartDate(explicitStartWeekDate);
    return normalizedExplicitStart > globalStartWeekDate
      ? normalizedExplicitStart
      : globalStartWeekDate;
  }

  return globalStartWeekDate;
}

function getNextWeekdayDateId(dateId) {
  let nextDate = addDays(parseDateId(dateId), 1);

  while (isWeekend(nextDate)) {
    nextDate = addDays(nextDate, 1);
  }

  return formatDateId(nextDate);
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
  const baseDate = today.getFullYear() === year && today.getMonth() === month
    ? today
    : new Date(year, month, 1);
  const weekStart = getWeekStartDate(baseDate);

  if (weekIntersectsMonth(weekStart, year, month)) {
    return weekStart;
  }

  return new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7);
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
  return normalizeOfficeId(currentUserData?.officeId);
}

function getCurrentGroupId() {
  return currentUserData?.groupId || DEFAULT_GROUP_ID;
}

function normalizeOfficeId(officeId) {
  const value = String(officeId || "").trim();
  if (!value || LEGACY_OFFICE_IDS.includes(value)) {
    return DEFAULT_OFFICE_ID;
  }
  return value;
}

function getCompatibleOfficeIds(officeId = getCurrentOfficeId()) {
  const currentOfficeId = normalizeOfficeId(officeId);

  if (currentOfficeId !== DEFAULT_OFFICE_ID) {
    return [currentOfficeId];
  }

  return [DEFAULT_OFFICE_ID, ...LEGACY_OFFICE_IDS].filter((value, index, list) => {
    return value && list.indexOf(value) === index;
  });
}

function getWorkshopResourcesDocId(officeId = getCurrentOfficeId()) {
  return `${WORKSHOP_RESOURCES_DOC_PREFIX}${officeId}`;
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
    return "WS";
  }

  if (category === "deadline") {
    return "⏰";
  }

  if (category === "important") {
    return "⚠️";
  }

  if (category === "attendance") {
    return "休";
  }

  if (category === "task") {
    return "タスク";
  }

  return "📢";
}

function normalizeAnnouncementStaffAssignments(rawAssignments = []) {
  if (!Array.isArray(rawAssignments)) {
    return [];
  }

  return rawAssignments
    .map((assignment) => ({
      staffName: String(assignment?.staffName || assignment?.name || "").trim(),
      note: String(assignment?.note || assignment?.extraInfo || "").trim()
    }))
    .filter((assignment) => assignment.staffName);
}

function getAnnouncementDisplayTitle(announcement = {}) {
  const category = announcement.category || "notice";
  const assignments = normalizeAnnouncementStaffAssignments(announcement.staffAssignments);

  if (category === "attendance" && assignments.length > 0) {
    const people = assignments
      .map((assignment) => `${assignment.staffName}${assignment.note ? `（${assignment.note}）` : ""}`)
      .join("、");
    const heading = announcement.title && announcement.title !== "勤怠" ? `${announcement.title}｜` : "";
    return `${heading}${people}`;
  }

  if (category === "task" && assignments.length > 0) {
    return `${announcement.title || "タスク"}｜${assignments.map((assignment) => assignment.staffName).join("・")}`;
  }

  return announcement.title || (category === "attendance" ? "勤怠" : "お知らせ");
}

function sortCalendarAnnouncements(list = []) {
  return [...list].sort((a, b) => {
    const categoryA = ANNOUNCEMENT_CATEGORY_ORDER[a.category || "notice"] || 99;
    const categoryB = ANNOUNCEMENT_CATEGORY_ORDER[b.category || "notice"] || 99;

    if (categoryA !== categoryB) {
      return categoryA - categoryB;
    }

    const timeA = a.startTime || "99:99";
    const timeB = b.startTime || "99:99";

    if (timeA !== timeB) {
      return timeA.localeCompare(timeB);
    }

    return getAnnouncementDisplayTitle(a).localeCompare(getAnnouncementDisplayTitle(b), "ja");
  });
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
  return announcementsByDate[dateId] || [];
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
  updateCalendarBulkRegistrationUi();
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

function normalizeReusableScheduleInput(rawData) {
  if (!rawData || typeof rawData !== "object") {
    return null;
  }

  const status = rawData.status || "";
  if (!["通所", "在宅", "休み"].includes(status)) {
    return null;
  }

  const timeSlot = status === "休み" ? "" : (rawData.timeSlot || "");
  if ((status === "通所" || status === "在宅") && !["終日", "午前", "午後"].includes(timeSlot)) {
    return null;
  }

  return {
    status,
    timeSlot,
    memo: rawData.memo || ""
  };
}

function getLastScheduleInput() {
  try {
    return normalizeReusableScheduleInput(
      JSON.parse(localStorage.getItem(LAST_SCHEDULE_INPUT_STORAGE_KEY) || "null")
    );
  } catch (_error) {
    return null;
  }
}

function saveLastScheduleInput(dayData) {
  const reusableData = normalizeReusableScheduleInput(dayData);
  if (!reusableData) {
    return;
  }

  try {
    localStorage.setItem(LAST_SCHEDULE_INPUT_STORAGE_KEY, JSON.stringify(reusableData));
  } catch (error) {
    console.warn("前回の予定入力の保存に失敗しました。", error);
  }
}

function applyScheduleInputToForm(dayData) {
  const reusableData = normalizeReusableScheduleInput(dayData);
  if (!reusableData) {
    return false;
  }

  scheduleStatus.value = reusableData.status;
  scheduleTimeSlot.value = reusableData.timeSlot;
  scheduleMemo.value = reusableData.memo;
  applyStatusButtonActive(reusableData.status);
  applyTimeSlotButtonActive(reusableData.timeSlot);
  updateTimeSlotVisibility();
  return true;
}

function updateLastScheduleButtonVisibility() {
  if (!applyLastScheduleButton) {
    return;
  }

  const hasReusableData = Boolean(getLastScheduleInput());
  applyLastScheduleButton.classList.toggle("hidden", !hasReusableData);
  applyLastScheduleButton.disabled = !hasReusableData;
}

function setScheduleSaving(isSaving) {
  if (saveScheduleButton) {
    saveScheduleButton.disabled = isSaving;
    saveScheduleButton.textContent = isSaving ? "保存中..." : "保存";
  }

  if (saveAndNextScheduleButton) {
    saveAndNextScheduleButton.disabled = isSaving;
    saveAndNextScheduleButton.textContent = isSaving ? "保存中..." : "保存して次の平日へ";
  }

  if (clearScheduleButton) {
    clearScheduleButton.disabled = isSaving;
  }
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
    title.textContent = `${getAnnouncementIcon(announcement.category || "notice")} ${getAnnouncementDisplayTitle(announcement)}`;

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

    appendAnnouncementWorkshopLink(card, announcement);

    modalAnnouncements.appendChild(card);
  });
}

function appendAnnouncementWorkshopLink(parent, announcement) {
  if (!announcement.sourceWorkshopId) {
    return;
  }

  const link = document.createElement("a");
  link.className = "announcement-workshop-detail-link";
  link.href = `workshops.html?workshopId=${encodeURIComponent(announcement.sourceWorkshopId)}`;
  link.textContent = announcement.sourceType === "caseDeadline"
    ? "関連ワークショップを見る"
    : "ワークショップ詳細を見る";
  parent.appendChild(link);
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

  return "today-schedule-unset";
}

function renderTodaySchedule() {
  if (!currentUser || !todayScheduleBox || !todayScheduleText) {
    return;
  }

  const todayId = formatDateId(new Date());
  const data = getDisplayScheduleData(todayId);
  const status = data.status || "無し";
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
    const card = document.createElement("details");
    card.className = "announcement-card today-announcement-card";

    const title = document.createElement("summary");
    title.className = "announcement-title";
    title.textContent = `${getAnnouncementIcon(announcement.category || "notice")} ${getAnnouncementDisplayTitle(announcement)}`;

    const details = document.createElement("div");
    details.className = "today-announcement-details";

    const time = document.createElement("div");
    time.className = "announcement-time";
    time.textContent = announcement.timeText || "";

    const body = document.createElement("div");
    body.className = "announcement-body";
    body.textContent = announcement.body || "";

    card.appendChild(title);

    if (announcement.timeText) {
      details.appendChild(time);
    }

    if (announcement.body) {
      details.appendChild(body);
    }

    appendAnnouncementWorkshopLink(details, announcement);

    if (details.childElementCount === 0) {
      const emptyDetails = document.createElement("div");
      emptyDetails.className = "announcement-empty";
      emptyDetails.textContent = "詳細はありません。";
      details.appendChild(emptyDetails);
    }

    card.appendChild(details);

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
    applyScheduleInputToForm(data);
  }

  updateTimeSlotVisibility();
  updateLastScheduleButtonVisibility();
  openModal();
}

async function openScheduleModalAfterSave(dateId) {
  const targetDate = parseDateId(dateId);
  const targetYear = targetDate.getFullYear();
  const targetMonth = targetDate.getMonth();
  const isDifferentMonth = targetYear !== currentYear || targetMonth !== currentMonth;

  closeModal();

  currentYear = targetYear;
  currentMonth = targetMonth;

  if (currentViewMode === "week" || isDifferentMonth) {
    currentWeekStartDate = getWeekStartDate(targetDate);
  }

  selectedDateId = null;

  if (isDifferentMonth) {
    await loadMonthlyCalendar();
  } else {
    renderCurrentCalendarView(currentYear, currentMonth);
  }

  openScheduleModal(dateId);
}

if (applyLastScheduleButton) {
  applyLastScheduleButton.addEventListener("click", () => {
    if (applyScheduleInputToForm(getLastScheduleInput())) {
      message.style.color = "green";
      message.textContent = "前回の入力を反映しました。保存するとこの日に登録されます。";
    }
  });
}

async function clearCurrentSchedule() {
  if (!currentUser) {
    message.style.color = "red";
    message.textContent = "ログイン情報が確認できません。再ログインしてください。";
    return;
  }

  const date = scheduleDate.value;

  if (!date) {
    message.style.color = "red";
    message.textContent = "日付を選択してください。";
    return;
  }

  try {
    setScheduleSaving(true);

    const monthId = getMonthIdFromDateId(date);
    const monthlyScheduleId = getMonthlyScheduleId(currentUser.uid, monthId);
    const existingData = getCachedScheduleForDate(date);

    if (existingData) {
      await updateDoc(doc(db, "monthlySchedules", monthlyScheduleId), {
        [`days.${date}`]: deleteField(),
        updatedAt: serverTimestamp()
      });
    }

    if (monthlyScheduleCache[monthId]) {
      delete monthlyScheduleCache[monthId][date];
    }

    const displayedMonthId = formatMonthId(currentYear, currentMonth);

    if (displayedMonthId === monthId) {
      schedulesByDate = monthlyScheduleCache[monthId] || {};
    }

    scheduleStatus.value = "";
    scheduleTimeSlot.value = "";
    scheduleMemo.value = "";
    clearStatusButtonActive();
    clearTimeSlotButtonActive();
    updateTimeSlotVisibility();

    closeModal();
    renderCurrentCalendarView(currentYear, currentMonth);
    renderTodaySchedule();

    message.style.color = "green";
    message.textContent = "予定を未入力に戻しました。";
  } catch (error) {
    console.error("予定未入力戻しエラー:", error);
    message.style.color = "red";
    message.textContent = `未入力に戻せませんでした：${error.code || error.message}`;
  } finally {
    setScheduleSaving(false);
  }
}

if (clearScheduleButton) {
  clearScheduleButton.addEventListener("click", () => {
    clearCurrentSchedule();
  });
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

function getActiveItems(items = []) {
  return items.filter((item) => item && item.active !== false);
}

function isCompletedCaseStatus(status) {
  return /納品済|完了|終了/.test(String(status || ""));
}

function getActiveWorkshopsForCalendar() {
  return getActiveItems(workshopResourcesCache.workshops || []);
}

function getCasesForActiveWorkshop(workshop) {
  if (!workshop) {
    return [];
  }

  const byId = new Map();
  const addCase = (caseItem) => {
    if (!caseItem || caseItem.active === false) {
      return;
    }

    const id = caseItem.id || `${caseItem.caseNo || "case"}_${caseItem.title || "item"}`;
    byId.set(id, {
      ...caseItem,
      id,
      workshopId: caseItem.workshopId || workshop.id
    });
  };

  (workshopResourcesCache.cases || [])
    .filter((caseItem) => (caseItem.workshopId || "") === workshop.id)
    .forEach(addCase);

  // 旧形式で workshop.cases に入っているデータも、同じ条件で締切表示に使う。
  (workshop.cases || []).forEach(addCase);

  return Array.from(byId.values());
}

async function loadWorkshopResourcesForCalendar() {
  const officeId = getCurrentOfficeId();

  if (workshopResourcesLoadedOfficeId === officeId) {
    return;
  }

  try {
    let loadedData = null;

    for (const candidateOfficeId of getCompatibleOfficeIds(officeId)) {
      const docSnap = await getDoc(doc(db, "system", getWorkshopResourcesDocId(candidateOfficeId)));
      if (!docSnap.exists()) {
        continue;
      }

      const data = docSnap.data() || {};
      const workshops = Array.isArray(data.workshops) ? data.workshops : [];
      const cases = Array.isArray(data.cases) ? data.cases : [];
      const guides = Array.isArray(data.guides) ? data.guides : [];

      if (!loadedData || workshops.length || cases.length || guides.length) {
        loadedData = {
          schemaVersion: data.schemaVersion || 2,
          workshops,
          cases,
          guides
        };
      }

      if (workshops.length || cases.length || guides.length) {
        break;
      }
    }

    workshopResourcesCache = loadedData || { schemaVersion: 2, workshops: [], cases: [], guides: [] };
    workshopResourcesLoadedOfficeId = officeId;
  } catch (error) {
    console.warn("案件締切用のワークショップ情報を読み込めませんでした。", error);
    workshopResourcesCache = { schemaVersion: 2, workshops: [], cases: [], guides: [] };
    workshopResourcesLoadedOfficeId = officeId;
  }
}

function buildCaseDeadlineBody(workshop, caseItem) {
  const parts = [];

  if (workshop.title) {
    parts.push(`ワークショップ：${workshop.title}`);
  }

  if (caseItem.status) {
    parts.push(`状態：${caseItem.status}`);
  }

  if (caseItem.summary) {
    parts.push(caseItem.summary);
  }

  return parts.join(" / ") || "案件の締切日です。";
}

function buildCaseDeadlineAnnouncementsForMonth(year, month) {
  const monthId = formatMonthId(year, month);
  const byDate = {};

  getActiveWorkshopsForCalendar().forEach((workshop) => {
    getCasesForActiveWorkshop(workshop)
      .filter((caseItem) => {
        const dueDate = String(caseItem.dueDate || "");
        return dueDate
          && dueDate.startsWith(monthId)
          && !isCompletedCaseStatus(caseItem.status);
      })
      .forEach((caseItem) => {
        const dateId = String(caseItem.dueDate || "");
        const caseLabel = caseItem.caseNo ? `案件No.${caseItem.caseNo} ` : "";
        const title = `${caseLabel}${caseItem.title || "案件"} 締切`;

        if (!byDate[dateId]) {
          byDate[dateId] = [];
        }

        byDate[dateId].push({
          id: `case_deadline_${workshop.id}_${caseItem.id || caseItem.caseNo || caseItem.title || dateId}`,
          visibility: "all",
          category: "deadline",
          title,
          startTime: "",
          endTime: "",
          timeText: "",
          body: buildCaseDeadlineBody(workshop, caseItem),
          sourceType: "caseDeadline",
          sourceWorkshopId: workshop.id,
          sourceWorkshopTitle: workshop.title || "",
          active: true,
          createdAt: caseItem.createdAt || workshop.createdAt || "",
          updatedAt: caseItem.updatedAt || workshop.updatedAt || ""
        });
      });
  });

  return byDate;
}

function mergeAnnouncementsByDate(baseByDate = {}, extraByDate = {}) {
  const merged = {};
  const addList = (source) => {
    Object.keys(source || {}).forEach((dateId) => {
      if (!merged[dateId]) {
        merged[dateId] = [];
      }
      (Array.isArray(source[dateId]) ? source[dateId] : []).forEach((announcement) => {
        const id = announcement.id || `${announcement.category || "notice"}_${announcement.title || ""}_${announcement.sourceWorkshopId || ""}`;
        const exists = merged[dateId].some((item) => {
          const itemId = item.id || `${item.category || "notice"}_${item.title || ""}_${item.sourceWorkshopId || ""}`;
          return itemId === id;
        });

        if (!exists) {
          merged[dateId].push(announcement);
        }
      });
    });
  };

  addList(baseByDate);
  addList(extraByDate);

  Object.keys(merged).forEach((dateId) => {
    merged[dateId] = sortCalendarAnnouncements(merged[dateId]);
  });

  return merged;
}

// ==============================
// アナウンス：新方式 monthlyAnnouncements
// 事業所1つ・1か月で1ドキュメント
// ==============================
async function loadMonthlyAnnouncements(year, month) {
  const monthId = formatMonthId(year, month);
  const officeId = getCurrentOfficeId();
  const cacheKey = `${officeId}_${monthId}`;

  if (!monthlyAnnouncementCache[cacheKey]) {
    const loadedAnnouncementsByDate = {};

    for (const candidateOfficeId of getCompatibleOfficeIds(officeId)) {
      const monthlyAnnouncementId = getMonthlyAnnouncementId(candidateOfficeId, monthId);
      const docRef = doc(db, "monthlyAnnouncements", monthlyAnnouncementId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        continue;
      }

      const data = docSnap.data();
      const rawDays = data.days || {};

      Object.keys(rawDays).forEach((dateId) => {
        const rawList = Array.isArray(rawDays[dateId]) ? rawDays[dateId] : [];

        const visibleList = rawList.filter((announcement) => {
          return announcement.visibility !== "staff"
            && announcement.category !== "attendance"
            && announcement.category !== "task"
            && announcement.active !== false;
        });

        if (visibleList.length > 0) {
          loadedAnnouncementsByDate[dateId] = sortCalendarAnnouncements([
            ...(loadedAnnouncementsByDate[dateId] || []),
            ...visibleList
          ]);
        }
      });
    }

    monthlyAnnouncementCache[cacheKey] = loadedAnnouncementsByDate;
  }

  if (!monthlyCaseDeadlineAnnouncementCache[cacheKey]) {
    await loadWorkshopResourcesForCalendar();
    monthlyCaseDeadlineAnnouncementCache[cacheKey] = buildCaseDeadlineAnnouncementsForMonth(year, month);
  }

  announcementsByDate = mergeAnnouncementsByDate(
    monthlyAnnouncementCache[cacheKey],
    monthlyCaseDeadlineAnnouncementCache[cacheKey]
  );
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
    status: "",
    timeSlot: "",
    memo: "",
    _implicitEmpty: true
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

  if (actualScheduleData?.status === "休み") {
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

function setBulkControlVisibility(element, isHidden) {
  if (!element) {
    return;
  }

  element.hidden = isHidden;
  element.classList.toggle("hidden", isHidden);
}

function hideCalendarBulkAlert() {
  if (calendarBulkAlertTimer) {
    window.clearTimeout(calendarBulkAlertTimer);
    calendarBulkAlertTimer = null;
  }

  if (!calendarBulkAlert) {
    return;
  }

  calendarBulkAlert.textContent = "";
  calendarBulkAlert.classList.remove("error", "success");
  setBulkControlVisibility(calendarBulkAlert, true);
}

function showCalendarBulkAlert(text, type = "error", autoHideMs = 0) {
  if (!calendarBulkAlert) {
    return;
  }

  if (calendarBulkAlertTimer) {
    window.clearTimeout(calendarBulkAlertTimer);
    calendarBulkAlertTimer = null;
  }

  calendarBulkAlert.textContent = text;
  calendarBulkAlert.classList.remove("error", "success");
  calendarBulkAlert.classList.add(type === "success" ? "success" : "error");
  setBulkControlVisibility(calendarBulkAlert, false);

  if (autoHideMs > 0) {
    calendarBulkAlertTimer = window.setTimeout(() => {
      hideCalendarBulkAlert();
    }, autoHideMs);
  }
}

function getCheckedBulkValue(checkboxes) {
  return checkboxes.find((checkbox) => checkbox.checked)?.value || "";
}

function clearCalendarBulkChoices() {
  [...calendarBulkStatusCheckboxes, ...calendarBulkTimeCheckboxes].forEach((checkbox) => {
    checkbox.checked = false;
  });
}

function updateCalendarBulkSelectedCount() {
  if (calendarBulkSelectedCount) {
    calendarBulkSelectedCount.textContent = `選択中：${calendarBulkSelectedDateIds.size}日`;
  }
}

function updateCalendarBulkRegistrationUi() {
  const isMonthlyView = currentViewMode === "calendar";

  if (calendarBulkRegisterButton) {
    setBulkControlVisibility(calendarBulkRegisterButton, !isMonthlyView);
    calendarBulkRegisterButton.textContent = isCalendarBulkRegistrationActive ? "登録完了" : "一括登録";
  }

  if (calendarFilterTitle) {
    calendarFilterTitle.textContent = isCalendarBulkRegistrationActive
      ? "勤務する日を複数選択してください"
      : "表示する日";
  }

  setBulkControlVisibility(calendarDisplayFilterControls, isCalendarBulkRegistrationActive);
  setBulkControlVisibility(calendarBulkControls, !isCalendarBulkRegistrationActive);
  calendarFilterBox?.classList.toggle("bulk-registration-active", isCalendarBulkRegistrationActive);
  updateCalendarBulkSelectedCount();
}

function startCalendarBulkRegistration() {
  if (currentViewMode !== "calendar" || !currentUser) {
    return;
  }

  calendarFilterStateBeforeBulkRegistration = {
    showAll: showAllDaysCheckbox?.checked === true,
    showUse: showUseDaysCheckbox?.checked === true,
    showAnnouncements: showAnnouncementDaysCheckbox?.checked === true
  };

  if (showAllDaysCheckbox) {
    showAllDaysCheckbox.checked = true;
  }
  if (showUseDaysCheckbox) {
    showUseDaysCheckbox.checked = false;
  }
  if (showAnnouncementDaysCheckbox) {
    showAnnouncementDaysCheckbox.checked = false;
  }

  isCalendarBulkRegistrationActive = true;
  calendarBulkSelectedDateIds = new Set();
  clearCalendarBulkChoices();
  hideCalendarBulkAlert();
  selectedDateId = null;
  message.textContent = "";
  updateCalendarBulkRegistrationUi();
  renderCurrentCalendarView(currentYear, currentMonth);
}

function exitCalendarBulkRegistration(options = {}) {
  const restoreFilters = options.restoreFilters !== false;
  const rerender = options.rerender !== false;
  const hideAlert = options.hideAlert !== false;

  if (restoreFilters && calendarFilterStateBeforeBulkRegistration) {
    if (showAllDaysCheckbox) {
      showAllDaysCheckbox.checked = calendarFilterStateBeforeBulkRegistration.showAll;
    }
    if (showUseDaysCheckbox) {
      showUseDaysCheckbox.checked = calendarFilterStateBeforeBulkRegistration.showUse;
    }
    if (showAnnouncementDaysCheckbox) {
      showAnnouncementDaysCheckbox.checked = calendarFilterStateBeforeBulkRegistration.showAnnouncements;
    }
  }

  isCalendarBulkRegistrationActive = false;
  calendarBulkSelectedDateIds = new Set();
  calendarFilterStateBeforeBulkRegistration = null;
  clearCalendarBulkChoices();
  if (hideAlert) {
    hideCalendarBulkAlert();
  }
  updateCalendarBulkRegistrationUi();

  if (rerender) {
    renderCurrentCalendarView(currentYear, currentMonth);
  }
}

function toggleCalendarBulkDate(dateId, dayCell) {
  hideCalendarBulkAlert();

  if (calendarBulkSelectedDateIds.has(dateId)) {
    calendarBulkSelectedDateIds.delete(dateId);
    dayCell.classList.remove("bulk-registration-selected");
    dayCell.setAttribute("aria-pressed", "false");
  } else {
    calendarBulkSelectedDateIds.add(dateId);
    dayCell.classList.add("bulk-registration-selected");
    dayCell.setAttribute("aria-pressed", "true");
  }

  updateCalendarBulkSelectedCount();
}

function applyCalendarBulkDayState(dayCell, dateId) {
  if (!isCalendarBulkRegistrationActive) {
    return;
  }

  dayCell.classList.add("bulk-registration-selectable");
  dayCell.setAttribute("role", "button");
  dayCell.setAttribute("tabindex", "0");
  dayCell.setAttribute("aria-label", `${formatJapaneseDate(dateId)}を一括登録の対象にする`);
  dayCell.setAttribute("aria-pressed", calendarBulkSelectedDateIds.has(dateId) ? "true" : "false");
  dayCell.classList.toggle("bulk-registration-selected", calendarBulkSelectedDateIds.has(dateId));

  dayCell.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    toggleCalendarBulkDate(dateId, dayCell);
  });
}

async function saveCalendarBulkRegistration() {
  const status = getCheckedBulkValue(calendarBulkStatusCheckboxes);
  const timeSlot = getCheckedBulkValue(calendarBulkTimeCheckboxes);

  if (!status) {
    message.style.color = "red";
    message.textContent = "通所または在宅を選択してください。";
    showCalendarBulkAlert(message.textContent, "error");
    return;
  }

  if (!timeSlot) {
    message.style.color = "red";
    message.textContent = "終日・午前・午後のいずれかを選択してください。";
    showCalendarBulkAlert(message.textContent, "error");
    return;
  }

  if (calendarBulkSelectedDateIds.size === 0) {
    message.style.color = "red";
    message.textContent = "勤務する日を1日以上選択してください。";
    showCalendarBulkAlert(message.textContent, "error");
    return;
  }

  if (!currentUser) {
    message.style.color = "red";
    message.textContent = "ログイン情報が確認できません。再ログインしてください。";
    showCalendarBulkAlert(message.textContent, "error");
    return;
  }

  const monthId = formatMonthId(currentYear, currentMonth);
  const selectedDateIds = [...calendarBulkSelectedDateIds].sort();
  const currentMonthSchedules = monthlyScheduleCache[monthId] || {};
  const updatedAt = new Date().toISOString();
  const days = {};

  selectedDateIds.forEach((dateId) => {
    days[dateId] = {
      status: status,
      timeSlot: timeSlot,
      memo: currentMonthSchedules[dateId]?.memo || "",
      updatedAt: updatedAt
    };
  });

  try {
    calendarBulkRegisterButton.disabled = true;
    if (calendarBulkCancelButton) {
      calendarBulkCancelButton.disabled = true;
    }
    calendarBulkRegisterButton.textContent = "登録中...";

    await setDoc(doc(db, "monthlySchedules", getMonthlyScheduleId(currentUser.uid, monthId)), {
      userId: currentUser.uid,
      userName: currentUserData?.name || currentUser.email,
      userEmail: currentUser.email,
      officeId: getCurrentOfficeId(),
      groupId: getCurrentGroupId(),
      month: monthId,
      days: days,
      updatedAt: serverTimestamp()
    }, { merge: true });

    if (!monthlyScheduleCache[monthId]) {
      monthlyScheduleCache[monthId] = {};
    }

    Object.entries(days).forEach(([dateId, dayData]) => {
      monthlyScheduleCache[monthId][dateId] = dayData;
    });
    schedulesByDate = monthlyScheduleCache[monthId];

    exitCalendarBulkRegistration({ restoreFilters: true, rerender: false, hideAlert: false });
    renderCurrentCalendarView(currentYear, currentMonth);
    renderTodaySchedule();

    message.style.color = "green";
    message.textContent = `${selectedDateIds.length}日分の予定を一括登録しました。`;
    showCalendarBulkAlert(message.textContent, "success", 4500);
    console.log(`[Read節約] ${monthId} の予定を${selectedDateIds.length}日分、monthlySchedules 1 writeで一括登録しました。`);
  } catch (error) {
    console.error("予定の一括登録エラー:", error);
    message.style.color = "red";
    message.textContent = `一括登録に失敗しました：${error.code || error.message}`;
    showCalendarBulkAlert(message.textContent, "error");
  } finally {
    calendarBulkRegisterButton.disabled = false;
    if (calendarBulkCancelButton) {
      calendarBulkCancelButton.disabled = false;
    }
    updateCalendarBulkRegistrationUi();
  }
}

function bindExclusiveBulkCheckboxes(checkboxes) {
  checkboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      if (!checkbox.checked) {
        return;
      }

      checkboxes.forEach((otherCheckbox) => {
        if (otherCheckbox !== checkbox) {
          otherCheckbox.checked = false;
        }
      });
      hideCalendarBulkAlert();
      message.textContent = "";
    });
  });
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
    const status = scheduleData.status || "";
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
    statusEl.textContent = status;

    const timeSlotEl = document.createElement("div");
    timeSlotEl.className = "calendar-time-slot";
    timeSlotEl.textContent = timeSlot || "";

    dayCell.appendChild(dateEl);
    if (status) {
      dayCell.appendChild(statusEl);
    }
    if (timeSlot) {
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
        const shortTitle = shortenText(getAnnouncementDisplayTitle(announcement), 8);

        item.textContent = `${icon} ${shortTitle}`;
        announcementArea.appendChild(item);
      });

      dayCell.appendChild(announcementArea);
    }

    applyCalendarBulkDayState(dayCell, dateId);

    dayCell.addEventListener("click", () => {
      if (isCalendarBulkRegistrationActive) {
        toggleCalendarBulkDate(dateId, dayCell);
        return;
      }

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
    const status = scheduleData.status || "";
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
    if (status) {
      dayCell.appendChild(statusEl);
    }

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
        const shortTitle = shortenText(getAnnouncementDisplayTitle(announcement), 8);
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

    const status = scheduleData.status || "";
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
    const dateLabel = document.createElement("span");
    dateLabel.textContent = `${month + 1}月${day}日（${getJapaneseWeekday(targetDate)}）`;
    dateText.appendChild(dateLabel);

    if (timeSlot) {
      const timeSlotText = document.createElement("span");
      timeSlotText.className = "calendar-list-time-slot";
      timeSlotText.textContent = `時間帯：${timeSlot}`;
      dateText.appendChild(timeSlotText);
    }

    header.appendChild(dateText);
    if (status) {
      const statusBadge = document.createElement("div");
      statusBadge.className = `calendar-list-status ${getStatusClass(status)}`;
      statusBadge.textContent = status;
      header.appendChild(statusBadge);
    }
    dayItem.appendChild(header);

    if (memo) {
      const scheduleArea = document.createElement("div");
      scheduleArea.className = "calendar-list-schedule";

      const memoText = document.createElement("div");
      memoText.className = "calendar-list-memo";
      memoText.textContent = `メモ：${memo}`;
      scheduleArea.appendChild(memoText);

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
        announcementTitle.textContent = `${getAnnouncementIcon(announcement.category || "notice")} ${getAnnouncementDisplayTitle(announcement)}`;
        announcementCard.appendChild(announcementTitle);

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

  if (isCalendarBulkRegistrationActive) {
    exitCalendarBulkRegistration({ restoreFilters: true, rerender: false });
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
    if (isCalendarBulkRegistrationActive) {
      exitCalendarBulkRegistration({ restoreFilters: true, rerender: false });
    }
    currentViewMode = "list";
    selectedDateId = null;
    message.textContent = "";
    renderCurrentCalendarView(currentYear, currentMonth);
  });
}
if (weekViewButton) {
  weekViewButton.addEventListener("click", () => {
    if (isCalendarBulkRegistrationActive) {
      exitCalendarBulkRegistration({ restoreFilters: true, rerender: false });
    }
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
  if (!currentUser) {
    return;
  }

  const nextWeekStart = new Date(currentWeekStartDate.getFullYear(), currentWeekStartDate.getMonth(), currentWeekStartDate.getDate() + weekOffset * 7);

  currentWeekStartDate = nextWeekStart;
  selectedDateId = null;
  message.textContent = "";

  if (!weekIntersectsMonth(nextWeekStart, currentYear, currentMonth)) {
    currentYear = nextWeekStart.getFullYear();
    currentMonth = nextWeekStart.getMonth();
    await loadMonthlyCalendar();
    return;
  }

  renderCurrentCalendarView(currentYear, currentMonth);
}

if (prevWeekButton) {
  prevWeekButton.addEventListener("click", async () => {
    await changeDisplayedWeek(-1);
  });
}

if (nextWeekButton) {
  nextWeekButton.addEventListener("click", async () => {
    await changeDisplayedWeek(1);
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

bindExclusiveBulkCheckboxes(calendarBulkStatusCheckboxes);
bindExclusiveBulkCheckboxes(calendarBulkTimeCheckboxes);

if (calendarBulkRegisterButton) {
  calendarBulkRegisterButton.addEventListener("click", async () => {
    if (isCalendarBulkRegistrationActive) {
      await saveCalendarBulkRegistration();
    } else {
      startCalendarBulkRegistration();
    }
  });
}

if (calendarBulkCancelButton) {
  calendarBulkCancelButton.addEventListener("click", () => {
    if (!isCalendarBulkRegistrationActive) {
      return;
    }

    message.textContent = "";
    exitCalendarBulkRegistration({ restoreFilters: true });
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

function getWeeklyReportStatusDocRef(userId) {
  return doc(db, WEEKLY_REPORT_STATUS_COLLECTION, userId);
}

function formatWeeklyReportRangeText(weekStartDate) {
  const weekEndDate = addDays(weekStartDate, 4);
  return `${weekStartDate.getFullYear()}年${weekStartDate.getMonth() + 1}月${weekStartDate.getDate()}日〜${weekEndDate.getMonth() + 1}月${weekEndDate.getDate()}日`;
}

function buildWeeklyReportReminderWeekItems(latestWeekStart, startWeekDate) {
  const weekItems = [];
  const maxWeeks = Math.max(WEEKLY_REPORT_CHECK_WEEKS, WEEKLY_REPORT_FEEDBACK_CHECK_WEEKS);

  for (let i = maxWeeks - 1; i >= 0; i--) {
    const weekStartDate = addDays(latestWeekStart, -7 * i);

    if (weekStartDate < startWeekDate) {
      continue;
    }

    weekItems.push({
      weekStartDate,
      weekStartDateId: formatDateId(weekStartDate),
      label: formatWeeklyReportRangeText(weekStartDate),
      checkPending: i < WEEKLY_REPORT_CHECK_WEEKS
    });
  }

  return weekItems;
}

function isWeeklyReportStatusCacheReliable(statusData, firstWeekId, latestWeekId) {
  if (!statusData || statusData.schemaVersion !== WEEKLY_REPORT_STATUS_SCHEMA_VERSION) {
    return false;
  }

  if (!firstWeekId || statusData.reminderCheckedThroughWeek !== latestWeekId) {
    return false;
  }

  return Boolean(statusData.reminderCheckedFromWeek && statusData.reminderCheckedFromWeek <= firstWeekId);
}

function buildWeeklyReportReminderFromStatus(statusData, weekItems) {
  const submittedWeeks = statusData?.submittedWeeks || {};
  const feedbackVersions = statusData?.feedbackVersions || {};
  const feedbackReadVersions = statusData?.feedbackReadVersions || {};
  const pendingWeeks = [];
  const unreadFeedbackReports = [];

  weekItems.forEach((week) => {
    if (week.checkPending && submittedWeeks[week.weekStartDateId] !== true) {
      pendingWeeks.push({
        weekStartDate: week.weekStartDateId,
        label: week.label
      });
    }

    const feedbackVersion = feedbackVersions[week.weekStartDateId] || "";
    const readVersion = feedbackReadVersions[week.weekStartDateId] || "";

    if (feedbackVersion && readVersion !== feedbackVersion) {
      unreadFeedbackReports.push({
        weekStartDate: week.weekStartDateId,
        label: week.label,
        staffFeedbackVersion: feedbackVersion
      });
    }
  });

  return { pendingWeeks, unreadFeedbackReports };
}

function buildWeeklyReportStatusMaps(reportStates) {
  const submittedWeeks = {};
  const feedbackVersions = {};
  const feedbackReadVersions = {};

  reportStates.forEach((state) => {
    const report = state.report;
    const weekStartDateId = state.weekStartDateId;
    const feedbackVersion = report?.staffFeedbackVersion || "";

    submittedWeeks[weekStartDateId] = report?.submitted === true;

    if (feedbackVersion) {
      feedbackVersions[weekStartDateId] = feedbackVersion;

      if (report?.feedbackReadByUser === true || report?.staffFeedbackReadVersion === feedbackVersion) {
        feedbackReadVersions[weekStartDateId] = feedbackVersion;
      } else {
        feedbackReadVersions[weekStartDateId] = report?.staffFeedbackReadVersion || "";
      }
    }
  });

  return { submittedWeeks, feedbackVersions, feedbackReadVersions };
}

async function saveWeeklyReportStatusCache(reportStates, firstWeekId, latestWeekId) {
  if (!currentUser || !firstWeekId || !latestWeekId) {
    return;
  }

  const statusMaps = buildWeeklyReportStatusMaps(reportStates);

  await setDoc(getWeeklyReportStatusDocRef(currentUser.uid), {
    userId: currentUser.uid,
    userName: currentUserData?.name || currentUser.email || "",
    userEmail: currentUser.email || "",
    officeId: getCurrentOfficeId(),
    groupId: getCurrentGroupId(),
    weeklyReportStartWeek: formatDateId(getWeeklyReportStartWeekDateForUser(currentUserData)),
    schemaVersion: WEEKLY_REPORT_STATUS_SCHEMA_VERSION,
    ...statusMaps,
    reminderCheckedFromWeek: firstWeekId,
    reminderCheckedThroughWeek: latestWeekId,
    updatedAt: serverTimestamp()
  }, { merge: true });
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
  setWeeklyReportNavPendingCount(totalCount, currentUser?.uid);

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
    const startWeekDate = getWeeklyReportStartWeekDateForUser(currentUserData);
    const startWeekId = formatDateId(startWeekDate);
    const weekItems = buildWeeklyReportReminderWeekItems(latestWeekStart, startWeekDate);
    const latestWeekId = formatDateId(latestWeekStart);
    const firstWeekId = weekItems[0]?.weekStartDateId || "";
    const pendingWeeks = [];
    const unreadFeedbackReports = [];

    if (weekItems.length === 0) {
      setWeeklyReportNavPendingCount(0, currentUser.uid);
      hideWeeklyReportReminder();
      setWeeklyReportHomeStatus(
        startWeekDate > latestWeekStart
          ? "週一報告は登録した週が終わった翌週から表示されます。"
          : "未記入の週一報告・未確認の返信はありません。",
        "ok"
      );
      console.log("[Read節約] 週一報告チェック：対象開始週前のため確認対象週はありません。");
      return;
    }

    try {
      const statusSnap = await getDoc(getWeeklyReportStatusDocRef(currentUser.uid));

      if (statusSnap.exists() && isWeeklyReportStatusCacheReliable(statusSnap.data(), firstWeekId, latestWeekId)) {
        const cachedState = buildWeeklyReportReminderFromStatus(statusSnap.data(), weekItems);
        renderWeeklyReportReminder(cachedState.pendingWeeks, cachedState.unreadFeedbackReports);
        console.log("週一報告未記入・返信チェック（集約doc）", {
          startWeek: startWeekId,
          latestWeek: latestWeekId,
          pendingWeeks: cachedState.pendingWeeks.map((week) => week.weekStartDate),
          unreadFeedbackReports: cachedState.unreadFeedbackReports.map((week) => week.weekStartDate)
        });
        console.log("[Read節約] 週一報告チェック：weeklyReportUserStatus 1 readで確認しました。");
        return;
      }
    } catch (cacheError) {
      console.warn("週一報告ステータス集約docの読み込みに失敗したため、従来方式で確認します。", cacheError);
    }

    const reportStates = [];

    for (const week of weekItems) {
      const reportId = getWeeklyReportId(currentUser.uid, week.weekStartDateId);
      const docSnap = await getDoc(doc(db, "weeklyReports", reportId));
      const report = docSnap.exists() ? docSnap.data() : null;

      reportStates.push({
        weekStartDateId: week.weekStartDateId,
        report
      });

      if (!report || report.submitted !== true) {
        if (week.checkPending) {
          pendingWeeks.push({
            weekStartDate: week.weekStartDateId,
            label: week.label
          });
        }
        continue;
      }

      if (isUnreadWeeklyReportFeedback(report)) {
        unreadFeedbackReports.push({
          weekStartDate: report.weekStartDate || week.weekStartDateId,
          label: week.label,
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

    try {
      await saveWeeklyReportStatusCache(reportStates, firstWeekId, latestWeekId);
      console.log("[Read節約] 週一報告チェック：従来方式で確認した結果をweeklyReportUserStatusへ保存しました。次回以降は1 readで確認できます。");
    } catch (cacheSaveError) {
      console.warn("週一報告ステータス集約docの保存に失敗しました。通知表示は従来方式の結果で継続します。", cacheSaveError);
    }

    console.log("週一報告未記入・返信チェック", {
      startWeek: startWeekId,
      latestWeek: latestWeekId,
      pendingWeeks: pendingWeeks.map((week) => week.weekStartDate),
      unreadFeedbackReports: unreadFeedbackReports.map((week) => week.weekStartDate)
    });
    console.log(`[Read節約] 週一報告チェック：集約docが未整備または古い場合のみ、対象${weekItems.length}週分を直接確認します。`);
  } catch (error) {
    console.error("週一報告未記入・返信チェックエラー:", error);
    setWeeklyReportNavPendingCount(0, currentUser?.uid);
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

function isManualBillingSafetyTest(data) {
  const reason = data?.reason || data?.message || "";
  return reason.includes("manual_warning_test") || reason.includes("manual_locked_display_test");
}

function renderBillingSafetyNotice(data) {
  if (!billingSafetyNotice) {
    return;
  }

  const isLocked = data?.locked === true;
  const isWarning = data?.warning === true || data?.level === "warning";
  const isManualTest = isManualBillingSafetyTest(data);

  if (!isLocked && !isWarning && !isManualTest) {
    billingSafetyNotice.classList.add("hidden");
    billingSafetyNotice.textContent = "";
    return;
  }

  billingSafetyNotice.className = `billing-safety-public-notice ${isLocked ? "locked" : "warning"}`;
  billingSafetyNotice.innerHTML = "";

  const title = document.createElement("div");
  title.className = "billing-safety-public-title";
  title.textContent = isManualTest ? "課金安全チェック：テスト中" : "課金安全チェック中";

  if (isManualTest) {
    const badge = document.createElement("span");
    badge.className = "billing-safety-public-badge";
    badge.textContent = "テスト中";
    title.appendChild(badge);
  }

  const body = document.createElement("div");
  body.className = "billing-safety-public-body";
  body.textContent = isManualTest
    ? "管理者が安全表示をテストしています。通常通り利用できます。"
    : "安全確認中です。必要に応じて管理者から案内します。";

  billingSafetyNotice.appendChild(title);
  billingSafetyNotice.appendChild(body);
}

async function loadBillingSafetyNotice() {
  if (!billingSafetyNotice) {
    return;
  }

  try {
    const docSnap = await getDoc(doc(db, "system", BILLING_SAFETY_DOC_ID));

    if (!docSnap.exists()) {
      renderBillingSafetyNotice(null);
      return;
    }

    renderBillingSafetyNotice(docSnap.data() || {});
  } catch (error) {
    console.warn("課金安全表示の読み込みに失敗しました。", error);
    renderBillingSafetyNotice(null);
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

    if (!await enforceMaintenanceAccess(userData)) {
      return;
    }

    await applyOfficeBrandName(userData);
    userInfo.textContent = `${userData.name}さん`;

    loadBillingSafetyNotice();
    await loadWeeklyReportReminder();
    await loadMonthlyCalendar();

  } else {
    window.location.href = "index.html";
  }
});

// 予定を保存する
async function saveCurrentSchedule(options = {}) {
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
    setScheduleSaving(true);

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
    saveLastScheduleInput(dayData);

    const displayedMonthId = formatMonthId(currentYear, currentMonth);

    if (displayedMonthId === monthId) {
      schedulesByDate = monthlyScheduleCache[monthId];
    }

    message.style.color = "green";
    message.textContent = "予定を保存しました。";

    renderCurrentCalendarView(currentYear, currentMonth);
    renderTodaySchedule();

    if (options.openNext === true) {
      const nextDateId = getNextWeekdayDateId(date);
      await openScheduleModalAfterSave(nextDateId);
      message.style.color = "green";
      message.textContent = "保存しました。次の平日を開きました。";
    } else {
      closeModal();
    }

  } catch (error) {
    console.error("保存エラー:", error);

    message.style.color = "red";
    message.textContent = `保存に失敗しました：${error.code || error.message}`;
  } finally {
    setScheduleSaving(false);
  }
}

saveScheduleButton.addEventListener("click", () => {
  saveCurrentSchedule();
});

if (saveAndNextScheduleButton) {
  saveAndNextScheduleButton.addEventListener("click", () => {
    saveCurrentSchedule({ openNext: true });
  });
}

// ログアウト
logoutButton.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});
