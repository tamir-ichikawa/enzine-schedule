import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

import { auth, db } from "./firebase-config.js";

const DEFAULT_OFFICE_ID = "engine_chiba";
const DEFAULT_GROUP_ID = "enzine";
const ACTIVE_USERS_DOC_ID = "activeUsers";

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
const announcementCalendarWeekHeader = document.getElementById("announcementCalendarWeekHeader");
const staffAnnouncementCalendarViewButton = document.getElementById("staffAnnouncementCalendarViewButton");
const staffAnnouncementListViewButton = document.getElementById("staffAnnouncementListViewButton");
const prevAnnouncementMonthButton = document.getElementById("prevAnnouncementMonthButton");
const nextAnnouncementMonthButton = document.getElementById("nextAnnouncementMonthButton");
const staffAnnouncementMonthLabel = document.getElementById("staffAnnouncementMonthLabel");
const showAllAnnouncementDaysCheckbox = document.getElementById("showAllAnnouncementDaysCheckbox");
const showPublicAnnouncementCheckbox = document.getElementById("showPublicAnnouncementCheckbox");
const showStaffAnnouncementCheckbox = document.getElementById("showStaffAnnouncementCheckbox");
const showNoticeAnnouncementCheckbox = document.getElementById("showNoticeAnnouncementCheckbox");
const showWorkshopAnnouncementCheckbox = document.getElementById("showWorkshopAnnouncementCheckbox");
const showDeadlineAnnouncementCheckbox = document.getElementById("showDeadlineAnnouncementCheckbox");
const showImportantAnnouncementCheckbox = document.getElementById("showImportantAnnouncementCheckbox");

// 利用者別 月間予定表示
const userScheduleTitle = document.getElementById("userScheduleTitle");
const prevUserScheduleMonthButton = document.getElementById("prevUserScheduleMonthButton");
const nextUserScheduleMonthButton = document.getElementById("nextUserScheduleMonthButton");
const userScheduleMonthLabel = document.getElementById("userScheduleMonthLabel");
const userScheduleSelect = document.getElementById("userScheduleSelect");
const userScheduleUserList = document.getElementById("userScheduleUserList");
const userScheduleCalendarViewButton = document.getElementById("userScheduleCalendarViewButton");
const userScheduleListViewButton = document.getElementById("userScheduleListViewButton");
const userScheduleWeekViewButton = document.getElementById("userScheduleWeekViewButton");
const userScheduleWeekNavigation = document.getElementById("userScheduleWeekNavigation");
const prevUserScheduleWeekButton = document.getElementById("prevUserScheduleWeekButton");
const nextUserScheduleWeekButton = document.getElementById("nextUserScheduleWeekButton");
const userScheduleWeekLabel = document.getElementById("userScheduleWeekLabel");
const userScheduleCalendarWeekHeader = document.getElementById("userScheduleCalendarWeekHeader");
const userScheduleCalendar = document.getElementById("userScheduleCalendar");
const userScheduleMessage = document.getElementById("userScheduleMessage");
const showOnlyUseDaysUserScheduleCheckbox = document.getElementById("showOnlyUseDaysUserScheduleCheckbox");
const refreshActiveUsersButton = document.getElementById("refreshActiveUsersButton");


// 教材・リンク集管理
const WORKSHOP_RESOURCES_DOC_PREFIX = "workshopResources_";
const loadWorkshopResourcesButton = document.getElementById("loadWorkshopResourcesButton");
const workshopResourceAdminArea = document.getElementById("workshopResourceAdminArea");
const workshopResourceList = document.getElementById("workshopResourceList");
const workshopResourceMessage = document.getElementById("workshopResourceMessage");
const workshopResourceFormTitle = document.getElementById("workshopResourceFormTitle");
const editingWorkshopResourceId = document.getElementById("editingWorkshopResourceId");
const workshopResourceActive = document.getElementById("workshopResourceActive");
const workshopResourceTitle = document.getElementById("workshopResourceTitle");
const workshopResourceScheduleText = document.getElementById("workshopResourceScheduleText");
const workshopResourceDescription = document.getElementById("workshopResourceDescription");
const workshopResourceLinksText = document.getElementById("workshopResourceLinksText");
const workshopResourceDeadlinesText = document.getElementById("workshopResourceDeadlinesText");
const saveWorkshopResourceButton = document.getElementById("saveWorkshopResourceButton");
const resetWorkshopResourceFormButton = document.getElementById("resetWorkshopResourceFormButton");

// 運用チェック
const operationCheckMonth = document.getElementById("operationCheckMonth");
const runOperationCheckButton = document.getElementById("runOperationCheckButton");
const operationCheckResult = document.getElementById("operationCheckResult");

// 支援員：利用者予定編集モーダル
const userScheduleEditModal = document.getElementById("userScheduleEditModal");
const closeUserScheduleEditModalButton = document.getElementById("closeUserScheduleEditModalButton");
const userScheduleEditModalTitle = document.getElementById("userScheduleEditModalTitle");
const staffEditScheduleDate = document.getElementById("staffEditScheduleDate");
const staffEditScheduleUserId = document.getElementById("staffEditScheduleUserId");
const staffEditScheduleStatus = document.getElementById("staffEditScheduleStatus");
const staffEditScheduleTimeSlot = document.getElementById("staffEditScheduleTimeSlot");
const staffEditScheduleMemo = document.getElementById("staffEditScheduleMemo");
const staffEditStatusButtonGroup = document.getElementById("staffEditStatusButtonGroup");
const staffEditTimeSlotChoiceBox = document.getElementById("staffEditTimeSlotChoiceBox");
const staffEditTimeSlotButtonGroup = document.getElementById("staffEditTimeSlotButtonGroup");
const saveUserScheduleEditButton = document.getElementById("saveUserScheduleEditButton");
const resetUserScheduleEditButton = document.getElementById("resetUserScheduleEditButton");
const cancelUserScheduleEditButton = document.getElementById("cancelUserScheduleEditButton");
const userScheduleEditMessage = document.getElementById("userScheduleEditMessage");

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
let currentEditingAnnouncementId = "";
let currentUser = null;
let workshopResourcesLoaded = false;
let workshopResourcesCache = { workshops: [] };

// 支援員ページ用キャッシュ
// 日別一覧：月ごとの全利用者 monthlySchedules を1回だけ取得し、同じ月の日付選択では再利用する。
let staffMonthlyScheduleCache = {};

// アナウンス管理：事業所1つ・1か月で1ドキュメント。
let staffMonthlyAnnouncementCache = {};
let currentAnnouncementViewMode = "calendar";
let displayedAnnouncementYear = new Date().getFullYear();
let displayedAnnouncementMonth = new Date().getMonth();

// 利用者別 月間予定表示
let activeUserListCache = null;
let selectedUserScheduleId = "";
let selectedUserScheduleData = null;
let individualUserMonthlyScheduleCache = {};
let currentUserScheduleViewMode = "calendar";
let displayedUserScheduleYear = new Date().getFullYear();
let displayedUserScheduleMonth = new Date().getMonth();
let displayedUserScheduleWeekStartDate = getDefaultWeekStartForMonth(displayedUserScheduleYear, displayedUserScheduleMonth);
let currentEditingUserMonthlySchedule = null;
let selectedUserScheduleEditDate = "";

function getTodayDateId() {
  const today = new Date();
  return formatDateId(today);
}

function formatDateId(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatMonthId(year, month) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function setDisplayedAnnouncementMonth(year, month) {
  const normalized = new Date(year, month, 1);
  displayedAnnouncementYear = normalized.getFullYear();
  displayedAnnouncementMonth = normalized.getMonth();
}

function updateAnnouncementMonthHeader(year, month) {
  const label = `${year}年${month + 1}月`;

  announcementCalendarTitle.textContent = `${label}のアナウンス管理`;

  if (staffAnnouncementMonthLabel) {
    staffAnnouncementMonthLabel.textContent = label;
  }
}

function setDisplayedUserScheduleMonth(year, month) {
  const normalized = new Date(year, month, 1);
  displayedUserScheduleYear = normalized.getFullYear();
  displayedUserScheduleMonth = normalized.getMonth();
}

function updateUserScheduleMonthHeader(year, month) {
  const label = `${year}年${month + 1}月`;

  if (userScheduleTitle) {
    userScheduleTitle.textContent = `${label}の利用者別予定`;
  }

  if (userScheduleMonthLabel) {
    userScheduleMonthLabel.textContent = label;
  }
}

function isWeekday(date) {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}


function getWeekStartDate(date) {
  const weekStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = weekStart.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  weekStart.setDate(weekStart.getDate() + diff);
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
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

function updateUserScheduleWeekNavigationVisibility() {
  if (userScheduleWeekNavigation) {
    userScheduleWeekNavigation.classList.toggle("hidden", currentUserScheduleViewMode !== "week");
  }

  if (userScheduleWeekLabel) {
    userScheduleWeekLabel.textContent = getWeekRangeLabel(displayedUserScheduleWeekStartDate);
  }
}

function getJapaneseWeekday(date) {
  return ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
}

function getScheduleToneClass(dayData) {
  if (!dayData || !dayData.status) {
    return "schedule-off";
  }

  if (dayData.status === "通所") {
    return "schedule-coming";
  }

  if (dayData.status === "在宅") {
    return "schedule-home";
  }

  if (dayData.status === "休み") {
    return "schedule-off";
  }

  return "schedule-other";
}

function isUseDay(dayData) {
  return dayData?.status === "通所" || dayData?.status === "在宅";
}

function calculateWorkDayCountFromDays(days = {}) {
  return Object.values(days).filter((dayData) => isUseDay(dayData)).length;
}

function updateUserScheduleViewButtons() {
  if (userScheduleCalendarViewButton) {
    userScheduleCalendarViewButton.classList.toggle("active", currentUserScheduleViewMode === "calendar");
  }

  if (userScheduleWeekViewButton) {
    userScheduleWeekViewButton.classList.toggle("active", currentUserScheduleViewMode === "week");
  }

  if (userScheduleListViewButton) {
    userScheduleListViewButton.classList.toggle("active", currentUserScheduleViewMode === "list");
  }

  updateUserScheduleWeekNavigationVisibility();
}

function isUserScheduleUseOnlyMode() {
  return showOnlyUseDaysUserScheduleCheckbox?.checked === true;
}


function getMonthIdFromDateId(dateId) {
  return dateId.slice(0, 7);
}

function getYearAndMonthFromDateId(dateId) {
  const parts = dateId.split("-");
  return {
    year: Number(parts[0]),
    month: Number(parts[1]) - 1
  };
}

function formatJapaneseDate(dateId) {
  const parts = dateId.split("-");
  return `${Number(parts[1])}月${Number(parts[2])}日`;
}

function getCurrentOfficeId() {
  return currentStaffData?.officeId || DEFAULT_OFFICE_ID;
}

function getCurrentGroupId() {
  return currentStaffData?.groupId || DEFAULT_GROUP_ID;
}

function getMonthlyAnnouncementId(officeId, monthId) {
  return `${officeId}_${monthId}`;
}

function generateAnnouncementId() {
  return `ann_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

function clearLists() {
  comingList.innerHTML = "";
  homeList.innerHTML = "";
  offList.innerHTML = "";
  otherList.innerHTML = "";
}

function addUserToList(listElement, data) {
  const li = document.createElement("li");

  const name = data.userName || data.userEmail || "名前不明";
  const timeSlot = data.timeSlot || "";
  const memo = data.memo || "";

  const mainText = document.createElement("div");

  if (timeSlot) {
    mainText.textContent = `${name}　${timeSlot}`;
  } else {
    mainText.textContent = name;
  }

  li.appendChild(mainText);

  if (memo) {
    const memoText = document.createElement("div");
    memoText.textContent = `（${memo}）`;
    memoText.className = "staff-user-memo";
    li.appendChild(memoText);
  }

  listElement.appendChild(li);
}

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


function showDailyScheduleNotLoadedText() {
  clearLists();
  comingList.innerHTML = "<li>一覧を表示すると読み込みます</li>";
  homeList.innerHTML = "<li>一覧を表示すると読み込みます</li>";
  offList.innerHTML = "<li>一覧を表示すると読み込みます</li>";
  otherList.innerHTML = "<li>一覧を表示すると読み込みます</li>";

  if (message) {
    message.style.color = "#555";
    message.textContent = "日付を選んで「一覧を表示」を押すと、予定を読み込みます。";
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

function openAnnouncementModal(dateId) {
  selectedAnnouncementDate = dateId;

  announcementDate.value = dateId;
  announcementModalTitle.textContent = `${formatJapaneseDate(dateId)}のアナウンス`;
  resetAnnouncementForm();
  renderAnnouncementList(dateId);

  lockPageScroll();
  announcementModal.classList.remove("hidden");
}

function closeAnnouncementModal() {
  announcementModal.classList.add("hidden");
  unlockPageScroll();
}

function resetAnnouncementForm() {
  currentEditingAnnouncementId = "";

  editingAnnouncementId.value = "";
  announcementFormTitle.textContent = "新規追加";
  announcementVisibility.value = "all";
  announcementCategory.value = "notice";
  announcementTitle.value = "";
  announcementStartTime.value = "";
  announcementEndTime.value = "";
  announcementBody.value = "";

  if (selectedAnnouncementDate) {
    renderAnnouncementList(selectedAnnouncementDate);
  }
}

function sortAnnouncements(list) {
  return [...list].sort((a, b) => {
    const timeA = a.startTime || "99:99";
    const timeB = b.startTime || "99:99";

    if (timeA !== timeB) {
      return timeA.localeCompare(timeB);
    }

    return (a.title || "").localeCompare(b.title || "");
  });
}

function updateStaffAnnouncementViewButtons() {
  if (staffAnnouncementCalendarViewButton) {
    staffAnnouncementCalendarViewButton.classList.toggle("active", currentAnnouncementViewMode === "calendar");
  }

  if (staffAnnouncementListViewButton) {
    staffAnnouncementListViewButton.classList.toggle("active", currentAnnouncementViewMode === "list");
  }
}

function getStaffAnnouncementFilterCheckboxes() {
  return [
    showPublicAnnouncementCheckbox,
    showStaffAnnouncementCheckbox,
    showNoticeAnnouncementCheckbox,
    showWorkshopAnnouncementCheckbox,
    showDeadlineAnnouncementCheckbox,
    showImportantAnnouncementCheckbox
  ].filter(Boolean);
}

function isAllAnnouncementDaysMode() {
  if (!showAllAnnouncementDaysCheckbox) {
    return true;
  }

  return showAllAnnouncementDaysCheckbox.checked === true;
}

function announcementMatchesStaffFilters(announcement) {
  if (isAllAnnouncementDaysMode()) {
    return true;
  }

  const selectedFilters = getStaffAnnouncementFilterCheckboxes().filter((checkbox) => checkbox.checked);

  if (selectedFilters.length === 0) {
    return true;
  }

  const visibility = announcement.visibility || "all";
  const category = announcement.category || "notice";

  if (showPublicAnnouncementCheckbox?.checked && visibility !== "staff") {
    return true;
  }

  if (showStaffAnnouncementCheckbox?.checked && visibility === "staff") {
    return true;
  }

  if (showNoticeAnnouncementCheckbox?.checked && category === "notice") {
    return true;
  }

  if (showWorkshopAnnouncementCheckbox?.checked && category === "workshop") {
    return true;
  }

  if (showDeadlineAnnouncementCheckbox?.checked && category === "deadline") {
    return true;
  }

  if (showImportantAnnouncementCheckbox?.checked && category === "important") {
    return true;
  }

  return false;
}

function getFilteredStaffAnnouncements(dateId) {
  const allAnnouncements = sortAnnouncements(announcementsByDate[dateId] || [])
    .filter((announcement) => announcement.active !== false);

  if (isAllAnnouncementDaysMode()) {
    return allAnnouncements;
  }

  return allAnnouncements.filter(announcementMatchesStaffFilters);
}

function normalizeStaffAnnouncementFilters(changedCheckbox) {
  if (!showAllAnnouncementDaysCheckbox) {
    return;
  }

  const filterCheckboxes = getStaffAnnouncementFilterCheckboxes();

  if (changedCheckbox === showAllAnnouncementDaysCheckbox && showAllAnnouncementDaysCheckbox.checked) {
    filterCheckboxes.forEach((checkbox) => {
      checkbox.checked = false;
    });
    return;
  }

  if (changedCheckbox !== showAllAnnouncementDaysCheckbox) {
    const hasSpecificFilter = filterCheckboxes.some((checkbox) => checkbox.checked);

    if (hasSpecificFilter) {
      showAllAnnouncementDaysCheckbox.checked = false;
    } else {
      showAllAnnouncementDaysCheckbox.checked = true;
    }
  }
}

function refreshStaffAnnouncementCalendarByFilter(changedCheckbox) {
  normalizeStaffAnnouncementFilters(changedCheckbox);
  renderAnnouncementCalendarFromCache(displayedAnnouncementYear, displayedAnnouncementMonth);
}


function getAnnouncementVisibilityToneClass(dayAnnouncements) {
  const activeAnnouncements = dayAnnouncements.filter((announcement) => announcement.active !== false);
  const hasPublic = activeAnnouncements.some((announcement) => (announcement.visibility || "all") !== "staff");
  const hasStaffOnly = activeAnnouncements.some((announcement) => announcement.visibility === "staff");

  if (hasPublic && hasStaffOnly) {
    return "day-mixed-announcement";
  }

  if (hasStaffOnly) {
    return "day-staff-announcement";
  }

  if (hasPublic) {
    return "day-public-announcement";
  }

  return "";
}

function renderAnnouncementList(dateId) {
  const list = sortAnnouncements(announcementsByDate[dateId] || []);

  announcementList.innerHTML = "";

  if (list.length === 0) {
    announcementList.innerHTML = `<div class="announcement-empty">この日のアナウンスはまだありません。</div>`;
    return;
  }

  list.forEach((announcement) => {
    const item = document.createElement("div");
    item.className = "announcement-edit-item";

    if (announcement.id === currentEditingAnnouncementId) {
      item.classList.add("editing-item");
    }

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

    if (announcement.id === currentEditingAnnouncementId) {
      editButton.textContent = "編集中";
      editButton.className = "small-button editing-button";
      editButton.disabled = true;
    } else {
      editButton.textContent = "編集";
      editButton.className = "small-button";
    }

    editButton.addEventListener("click", () => {
      currentEditingAnnouncementId = announcement.id;
      editingAnnouncementId.value = announcement.id;
      announcementFormTitle.textContent = "編集中";
      announcementVisibility.value = announcement.visibility || "all";
      announcementCategory.value = announcement.category || "notice";
      announcementTitle.value = announcement.title || "";
      announcementStartTime.value = announcement.startTime || "";
      announcementEndTime.value = announcement.endTime || "";
      announcementBody.value = announcement.body || "";

      renderAnnouncementList(selectedAnnouncementDate);
    });

    const hideButton = document.createElement("button");
    hideButton.textContent = "非表示";
    hideButton.className = "small-button danger-button";
    hideButton.addEventListener("click", async () => {
      const ok = confirm("このアナウンスを非表示にしますか？");

      if (!ok) {
        return;
      }

      try {
        const targetList = announcementsByDate[dateId] || [];
        announcementsByDate[dateId] = targetList.filter((item) => item.id !== announcement.id);

        if (currentEditingAnnouncementId === announcement.id) {
          resetAnnouncementForm();
        }

        const { year, month } = getYearAndMonthFromDateId(dateId);
        await persistMonthlyAnnouncements(year, month);
        setDisplayedAnnouncementMonth(year, month);
        renderAnnouncementCalendarFromCache(year, month);
        renderAnnouncementList(dateId);

      } catch (error) {
        console.error("アナウンス非表示エラー:", error);
        alert(`非表示に失敗しました：${error.code || error.message}`);
      }
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

// ==============================
// 支援員：日別予定一覧
// 新方式 monthlySchedules を月単位で取得して、選択日の予定だけ表示する。
// ==============================
async function loadMonthlySchedulesForStaff(year, month) {
  const officeId = getCurrentOfficeId();
  const monthId = formatMonthId(year, month);
  const cacheKey = `${officeId}_${monthId}`;

  if (staffMonthlyScheduleCache[cacheKey]) {
    return staffMonthlyScheduleCache[cacheKey];
  }

  const schedulesQuery = query(
    collection(db, "monthlySchedules"),
    where("officeId", "==", officeId),
    where("month", "==", monthId)
  );

  const snapshot = await getDocs(schedulesQuery);
  const monthlySchedules = [];

  snapshot.forEach((docSnap) => {
    monthlySchedules.push({
      id: docSnap.id,
      ...docSnap.data()
    });
  });

  staffMonthlyScheduleCache[cacheKey] = monthlySchedules;
  return monthlySchedules;
}

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
    const { year, month } = getYearAndMonthFromDateId(date);
    const users = await loadActiveUsersForStaff();
    const monthlySchedules = await loadMonthlySchedulesForStaff(year, month);
    const scheduleMap = {};

    monthlySchedules.forEach((monthlySchedule) => {
      if (monthlySchedule.userId) {
        scheduleMap[monthlySchedule.userId] = monthlySchedule;
      }
    });

    users.forEach((user) => {
      const monthlySchedule = scheduleMap[user.id] || null;
      const dayData = monthlySchedule?.days?.[date] || null;
      const status = dayData?.status || "休み";

      const listData = {
        ...(dayData || {}),
        status: status,
        timeSlot: dayData?.timeSlot || "",
        memo: dayData?.memo || "",
        userId: user.id,
        userName: user.name,
        userEmail: user.email
      };

      if (status === "通所") {
        addUserToList(comingList, listData);
      } else if (status === "在宅") {
        addUserToList(homeList, listData);
      } else if (status === "休み") {
        addUserToList(offList, listData);
      } else {
        addUserToList(otherList, listData);
      }
    });

    showEmptyTextIfNeeded();

    const monthId = getMonthIdFromDateId(date);
    const officeId = getCurrentOfficeId();
    const cacheKey = `${officeId}_${monthId}`;

    message.style.color = "green";
    message.textContent = `${date} の予定を表示しました。未入力の利用者は休みとして表示しています。`;
    console.log(`[Read節約] 支援員日別一覧：${cacheKey} は初回のみ月間予定を取得。利用者一覧はsystem/activeUsersキャッシュを使用。`);

  } catch (error) {
    console.error("支援員一覧の読み込みエラー:", error);

    message.style.color = "red";
    message.textContent = `読み込みに失敗しました：${error.code || error.message}`;
  }
}


// ==============================
// 支援員：利用者別 月間予定表示
// users は一度だけ取得し、予定は利用者名を押した時だけ個別ドキュメントで読む。
// ==============================
function normalizeActiveUserRecord(rawUser, fallbackOfficeId, fallbackGroupId) {
  if (!rawUser) {
    return null;
  }

  const id = rawUser.uid || rawUser.id || rawUser.userId;

  if (!id) {
    return null;
  }

  const role = rawUser.role || "user";

  if (role === "staff" || role === "admin") {
    return null;
  }

  if (rawUser.active === false) {
    return null;
  }

  // 移行中は officeId 未設定の利用者も現在の事業所扱いにする。
  if (rawUser.officeId && rawUser.officeId !== fallbackOfficeId) {
    return null;
  }

  return {
    id: id,
    uid: id,
    name: rawUser.name || rawUser.displayName || rawUser.email || "名前未設定",
    email: rawUser.email || "",
    officeId: rawUser.officeId || fallbackOfficeId,
    groupId: rawUser.groupId || fallbackGroupId,
    active: rawUser.active !== false
  };
}

function sortActiveUsers(users) {
  return [...users].sort((a, b) => (a.name || "").localeCompare(b.name || "", "ja"));
}

async function loadActiveUsersFromSystemDoc() {
  const officeId = getCurrentOfficeId();
  const groupId = getCurrentGroupId();
  const docRef = doc(db, "system", ACTIVE_USERS_DOC_ID);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    throw new Error("system/activeUsers が未作成です。『利用者一覧を更新』を押して作成してください。");
  }

  const data = docSnap.data() || {};
  let rawUsers = [];

  // 将来、複数事業所を1ドキュメント内で分ける場合にも対応。
  if (data.offices?.[officeId]?.users && Array.isArray(data.offices[officeId].users)) {
    rawUsers = data.offices[officeId].users;
  } else if (Array.isArray(data.users)) {
    rawUsers = data.users;
  }

  const users = sortActiveUsers(
    rawUsers
      .map((rawUser) => normalizeActiveUserRecord(rawUser, officeId, groupId))
      .filter(Boolean)
  );

  console.log(`[Read節約] 利用者一覧：system/${ACTIVE_USERS_DOC_ID} 1ドキュメントから取得。usersコレクションは読みません。`);
  return users;
}

async function rebuildActiveUsersFromUsersCollection() {
  const officeId = getCurrentOfficeId();
  const groupId = getCurrentGroupId();

  const usersQuery = query(
    collection(db, "users"),
    where("active", "==", true)
  );

  const snapshot = await getDocs(usersQuery);
  const users = [];

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const normalized = normalizeActiveUserRecord(
      {
        ...data,
        uid: docSnap.id,
        id: docSnap.id
      },
      officeId,
      groupId
    );

    if (normalized) {
      users.push(normalized);
    }
  });

  const sortedUsers = sortActiveUsers(users);

  await setDoc(doc(db, "system", ACTIVE_USERS_DOC_ID), {
    officeId: officeId,
    groupId: groupId,
    users: sortedUsers,
    updatedAt: serverTimestamp(),
    updatedByUid: currentUser?.uid || "",
    updatedByName: currentStaffData?.name || currentUser?.email || ""
  }, { merge: true });

  activeUserListCache = sortedUsers;
  console.log(`[Read節約] system/${ACTIVE_USERS_DOC_ID} を更新しました。次回から利用者一覧は1 readです。`);
  return sortedUsers;
}

async function loadActiveUsersForStaff() {
  if (activeUserListCache) {
    return activeUserListCache;
  }

  activeUserListCache = await loadActiveUsersFromSystemDoc();
  return activeUserListCache;
}

function renderUserScheduleUserList(users) {
  if (!userScheduleUserList) {
    return;
  }

  userScheduleUserList.innerHTML = "";

  if (users.length === 0) {
    userScheduleUserList.innerHTML = `<div class="staff-user-button-empty">表示できる利用者がいません。</div>`;
    return;
  }

  users.forEach((user) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "staff-user-name-button";
    button.dataset.userId = user.id;
    button.textContent = user.name || user.email || "名前未設定";

    if (selectedUserScheduleId === user.id) {
      button.classList.add("active");
    }

    button.addEventListener("click", async () => {
      selectedUserScheduleId = user.id;
      selectedUserScheduleData = user;

      // 週間表示中に別の利用者を選んだ場合も、最初は今週から表示する。
      if (currentUserScheduleViewMode === "week") {
        displayedUserScheduleWeekStartDate = getDefaultWeekStartForMonth(displayedUserScheduleYear, displayedUserScheduleMonth);
      }

      renderUserScheduleUserList(users);
      await loadUserMonthlyScheduleView();
    });

    userScheduleUserList.appendChild(button);
  });
}

function renderUserSchedulePlaceholder(text = "利用者を選択すると、月間予定が表示されます。") {
  if (!userScheduleCalendar) {
    return;
  }

  updateUserScheduleViewButtons();
  userScheduleCalendar.classList.remove("staff-user-schedule-list-view");
  userScheduleCalendar.classList.add("weekday-calendar");

  if (userScheduleCalendarWeekHeader) {
    userScheduleCalendarWeekHeader.classList.remove("hidden");
  }

  userScheduleCalendar.innerHTML = `<div class="calendar-filter-empty">${text}</div>`;

  if (userScheduleMessage) {
    userScheduleMessage.textContent = "";
  }
}

async function initializeUserMonthlyScheduleSection() {
  if (!userScheduleCalendar) {
    return;
  }

  const today = new Date();
  setDisplayedUserScheduleMonth(today.getFullYear(), today.getMonth());
  displayedUserScheduleWeekStartDate = getDefaultWeekStartForMonth(displayedUserScheduleYear, displayedUserScheduleMonth);
  updateUserScheduleMonthHeader(displayedUserScheduleYear, displayedUserScheduleMonth);

  try {
    const users = await loadActiveUsersForStaff();
    renderUserScheduleUserList(users);

    if (users.length === 0) {
      renderUserSchedulePlaceholder("表示できる利用者がいません。");
      return;
    }

    renderUserSchedulePlaceholder("利用者名を押すと、その人の月間予定を読み込みます。");
    console.log(`[Read節約] 利用者一覧は system/${ACTIVE_USERS_DOC_ID} から1 readで取得。利用者別の月間予定は、名前を押すまで読み込みません。`);
  } catch (error) {
    console.error("利用者一覧の読み込みエラー:", error);
    renderUserScheduleUserList([]);
    renderUserSchedulePlaceholder(`利用者一覧の読み込みに失敗しました：${error.code || error.message}`);
  }
}

async function loadMonthlyScheduleForSingleUser(user, year, month) {
  const monthId = formatMonthId(year, month);
  const cacheKey = `${user.id}_${monthId}`;

  if (Object.prototype.hasOwnProperty.call(individualUserMonthlyScheduleCache, cacheKey)) {
    return individualUserMonthlyScheduleCache[cacheKey];
  }

  const monthlyScheduleId = `${user.id}_${monthId}`;
  const docRef = doc(db, "monthlySchedules", monthlyScheduleId);
  const docSnap = await getDoc(docRef);

  let monthlySchedule;

  if (docSnap.exists()) {
    monthlySchedule = {
      id: docSnap.id,
      _missingDoc: false,
      ...docSnap.data()
    };
  } else {
    // 予定データがまだ作られていない利用者でも、エラーにせず「予定未入力」として表示する。
    monthlySchedule = {
      id: monthlyScheduleId,
      _missingDoc: true,
      userId: user.id,
      userName: user.name || "名前未設定",
      userEmail: user.email || "",
      officeId: user.officeId || getCurrentOfficeId(),
      groupId: user.groupId || getCurrentGroupId(),
      month: monthId,
      days: {},
      workDayCount: 0
    };
  }

  individualUserMonthlyScheduleCache[cacheKey] = monthlySchedule;
  console.log(`[Read節約] 利用者別予定：${user.name || user.email || user.id} / ${monthId} を個別ドキュメントで取得。再表示はキャッシュ使用。`);
  return monthlySchedule;
}

async function getSelectedUserMonthlySchedule(year, month) {
  const selectedUserId = selectedUserScheduleId;

  if (!selectedUserId) {
    return null;
  }

  const users = await loadActiveUsersForStaff();
  const selectedUser = selectedUserScheduleData || users.find((user) => user.id === selectedUserId);

  if (!selectedUser) {
    return null;
  }

  return await loadMonthlyScheduleForSingleUser(selectedUser, year, month);
}

async function loadUserMonthlyScheduleView() {
  if (!userScheduleCalendar) {
    return;
  }

  const selectedUserId = selectedUserScheduleId;
  updateUserScheduleMonthHeader(displayedUserScheduleYear, displayedUserScheduleMonth);
  updateUserScheduleViewButtons();

  if (!selectedUserId) {
    renderUserSchedulePlaceholder();
    return;
  }

  userScheduleCalendar.textContent = "読み込み中...";

  try {
    const monthlySchedule = await getSelectedUserMonthlySchedule(displayedUserScheduleYear, displayedUserScheduleMonth);

    if (currentUserScheduleViewMode === "list") {
      renderUserMonthlyScheduleList(monthlySchedule, displayedUserScheduleYear, displayedUserScheduleMonth);
    } else if (currentUserScheduleViewMode === "week") {
      renderUserMonthlyScheduleWeek(monthlySchedule, displayedUserScheduleYear, displayedUserScheduleMonth);
    } else {
      renderUserMonthlyScheduleCalendar(monthlySchedule, displayedUserScheduleYear, displayedUserScheduleMonth);
    }

  } catch (error) {
    console.error("利用者別月間予定の読み込みエラー:", error);
    userScheduleCalendar.innerHTML = `<div class="calendar-filter-empty">月間予定の読み込みに失敗しました：${error.code || error.message}</div>`;
  }
}

function renderUserScheduleSummary(monthlySchedule, year, month) {
  const days = monthlySchedule?.days || {};
  const workDayCount = typeof monthlySchedule?.workDayCount === "number"
    ? monthlySchedule.workDayCount
    : calculateWorkDayCountFromDays(days);
  const name = monthlySchedule?.userName || monthlySchedule?.userEmail || "利用者";
  if (userScheduleMessage) {
    userScheduleMessage.textContent = `${name}さんの${year}年${month + 1}月の勤務日数：${workDayCount}日`;
  }
}

function renderUserMonthlyScheduleCalendar(monthlySchedule, year, month) {
  userScheduleCalendar.innerHTML = "";
  userScheduleCalendar.classList.remove("staff-user-schedule-list-view");
  userScheduleCalendar.classList.add("weekday-calendar");

  if (userScheduleCalendarWeekHeader) {
    userScheduleCalendarWeekHeader.classList.remove("hidden");
  }

  renderUserScheduleSummary(monthlySchedule, year, month);

  const today = new Date();
  const lastDate = new Date(year, month + 1, 0).getDate();
  let leadingEmptyAdded = false;

  for (let day = 1; day <= lastDate; day++) {
    const targetDateObj = new Date(year, month, day);

    if (!isWeekday(targetDateObj)) {
      continue;
    }

    if (!leadingEmptyAdded) {
      const weekdayOffset = targetDateObj.getDay() - 1;

      for (let i = 0; i < weekdayOffset; i++) {
        const emptyCell = document.createElement("div");
        emptyCell.className = "calendar-day empty";
        userScheduleCalendar.appendChild(emptyCell);
      }

      leadingEmptyAdded = true;
    }

    const dateId = formatDateId(targetDateObj);
    const dayData = monthlySchedule?.days?.[dateId] || null;

    // 「利用日だけ表示」ONのときは、曜日位置を崩さないように空セルで残す。
    if (isUserScheduleUseOnlyMode() && !isUseDay(dayData)) {
      const emptyCell = document.createElement("div");
      emptyCell.className = "calendar-day empty filtered-empty";
      userScheduleCalendar.appendChild(emptyCell);
      continue;
    }

    const toneClass = getScheduleToneClass(dayData);

    const dayCell = document.createElement("div");
    dayCell.className = `calendar-day staff-user-schedule-day ${toneClass}`.trim();
    dayCell.dataset.dateId = dateId;

    if (dateId === formatDateId(today)) {
      dayCell.classList.add("today");
    }

    const dateEl = document.createElement("div");
    dateEl.className = "calendar-date";
    dateEl.textContent = `${day}日`;
    dayCell.appendChild(dateEl);

    const displayStatus = dayData?.status || "休み";
    const statusEl = document.createElement("div");
    statusEl.className = `calendar-status ${displayStatus === "通所" ? "status-coming" : displayStatus === "在宅" ? "status-home" : displayStatus === "休み" ? "status-off" : ""}`.trim();
    statusEl.textContent = displayStatus;
    dayCell.appendChild(statusEl);

    if (dayData?.timeSlot) {
      const timeSlotEl = document.createElement("div");
      timeSlotEl.className = "calendar-time-slot";
      timeSlotEl.textContent = dayData.timeSlot;
      dayCell.appendChild(timeSlotEl);
    }

    if (dayData?.memo) {
      const memoEl = document.createElement("div");
      memoEl.className = "staff-user-schedule-memo-short";
      memoEl.textContent = shortenText(dayData.memo, 12);
      dayCell.appendChild(memoEl);
    }

    dayCell.addEventListener("click", () => {
      openUserScheduleEditModal(dateId);
    });

    userScheduleCalendar.appendChild(dayCell);
  }
}

function renderUserMonthlyScheduleWeek(monthlySchedule, year, month) {
  userScheduleCalendar.innerHTML = "";
  userScheduleCalendar.classList.remove("staff-user-schedule-list-view");
  userScheduleCalendar.classList.add("weekday-calendar");

  if (userScheduleCalendarWeekHeader) {
    userScheduleCalendarWeekHeader.classList.remove("hidden");
  }

  if (!weekIntersectsMonth(displayedUserScheduleWeekStartDate, year, month)) {
    displayedUserScheduleWeekStartDate = getDefaultWeekStartForMonth(year, month);
  }

  renderUserScheduleSummary(monthlySchedule, year, month);
  updateUserScheduleWeekNavigationVisibility();

  const today = new Date();
  let visibleDayCount = 0;

  for (let i = 0; i < 5; i++) {
    const targetDateObj = new Date(displayedUserScheduleWeekStartDate.getFullYear(), displayedUserScheduleWeekStartDate.getMonth(), displayedUserScheduleWeekStartDate.getDate() + i);

    if (targetDateObj.getFullYear() !== year || targetDateObj.getMonth() !== month) {
      const emptyCell = document.createElement("div");
      emptyCell.className = "calendar-day empty outside-month";
      userScheduleCalendar.appendChild(emptyCell);
      continue;
    }

    const dateId = formatDateId(targetDateObj);
    const dayData = monthlySchedule?.days?.[dateId] || null;

    if (isUserScheduleUseOnlyMode() && !isUseDay(dayData)) {
      const emptyCell = document.createElement("div");
      emptyCell.className = "calendar-day empty filtered-empty";
      userScheduleCalendar.appendChild(emptyCell);
      continue;
    }

    const toneClass = getScheduleToneClass(dayData);
    const displayStatus = dayData?.status || "休み";
    const dayCell = document.createElement("div");
    dayCell.className = `calendar-day staff-user-schedule-day ${toneClass}`.trim();
    dayCell.dataset.dateId = dateId;

    if (dateId === formatDateId(today)) {
      dayCell.classList.add("today");
    }

    const dateEl = document.createElement("div");
    dateEl.className = "calendar-date";
    dateEl.textContent = `${targetDateObj.getMonth() + 1}/${targetDateObj.getDate()}（${getJapaneseWeekday(targetDateObj)}）`;
    dayCell.appendChild(dateEl);

    const statusEl = document.createElement("div");
    statusEl.className = `calendar-status ${displayStatus === "通所" ? "status-coming" : displayStatus === "在宅" ? "status-home" : displayStatus === "休み" ? "status-off" : ""}`.trim();
    statusEl.textContent = displayStatus;
    dayCell.appendChild(statusEl);

    if (dayData?.timeSlot) {
      const timeSlotEl = document.createElement("div");
      timeSlotEl.className = "calendar-time-slot";
      timeSlotEl.textContent = dayData.timeSlot;
      dayCell.appendChild(timeSlotEl);
    }

    if (dayData?.memo) {
      const memoEl = document.createElement("div");
      memoEl.className = "staff-user-schedule-memo-short";
      memoEl.textContent = shortenText(dayData.memo, 12);
      dayCell.appendChild(memoEl);
    }

    dayCell.addEventListener("click", () => {
      openUserScheduleEditModal(dateId);
    });

    userScheduleCalendar.appendChild(dayCell);
    visibleDayCount++;
  }

  if (visibleDayCount === 0) {
    const emptyMessage = document.createElement("div");
    emptyMessage.className = "calendar-filter-empty";
    emptyMessage.textContent = isUserScheduleUseOnlyMode()
      ? "この週の利用日はありません。"
      : "表示できる予定はありません。";
    userScheduleCalendar.appendChild(emptyMessage);
  }
}

function renderUserMonthlyScheduleList(monthlySchedule, year, month) {
  userScheduleCalendar.innerHTML = "";
  userScheduleCalendar.classList.remove("weekday-calendar");
  userScheduleCalendar.classList.add("staff-user-schedule-list-view");

  if (userScheduleCalendarWeekHeader) {
    userScheduleCalendarWeekHeader.classList.add("hidden");
  }

  renderUserScheduleSummary(monthlySchedule, year, month);

  const today = new Date();
  const lastDate = new Date(year, month + 1, 0).getDate();
  let visibleDayCount = 0;

  for (let day = 1; day <= lastDate; day++) {
    const targetDateObj = new Date(year, month, day);

    if (!isWeekday(targetDateObj)) {
      continue;
    }

    const dateId = formatDateId(targetDateObj);
    const dayData = monthlySchedule?.days?.[dateId] || null;

    if (isUserScheduleUseOnlyMode() && !isUseDay(dayData)) {
      continue;
    }

    const toneClass = getScheduleToneClass(dayData);

    const dayItem = document.createElement("div");
    dayItem.className = `staff-user-schedule-list-day ${toneClass}`.trim();
    dayItem.dataset.dateId = dateId;

    if (dateId === formatDateId(today)) {
      dayItem.classList.add("today");
    }

    const header = document.createElement("div");
    header.className = "staff-user-schedule-list-header";

    const dateText = document.createElement("div");
    dateText.className = "staff-user-schedule-list-date";
    dateText.textContent = `${month + 1}月${day}日（${getJapaneseWeekday(targetDateObj)}）`;
    header.appendChild(dateText);

    const statusText = document.createElement("div");
    statusText.className = `staff-user-schedule-list-status ${toneClass}`.trim();
    statusText.textContent = dayData?.status || "休み";
    header.appendChild(statusText);

    dayItem.appendChild(header);

    if (dayData?.timeSlot || dayData?.memo) {
      const detail = document.createElement("div");
      detail.className = "staff-user-schedule-list-detail";

      if (dayData.timeSlot) {
        const time = document.createElement("div");
        time.textContent = `時間帯：${dayData.timeSlot}`;
        detail.appendChild(time);
      }

      if (dayData.memo) {
        const memo = document.createElement("div");
        memo.className = "staff-user-schedule-list-memo";
        memo.textContent = `メモ：${dayData.memo}`;
        detail.appendChild(memo);
      }

      dayItem.appendChild(detail);
    }

    dayItem.addEventListener("click", () => {
      openUserScheduleEditModal(dateId);
    });

    userScheduleCalendar.appendChild(dayItem);
    visibleDayCount++;
  }

  if (visibleDayCount === 0) {
    const emptyMessage = document.createElement("div");
    emptyMessage.className = "calendar-filter-empty";
    emptyMessage.textContent = isUserScheduleUseOnlyMode()
      ? "この月の利用日はありません。"
      : "表示できる予定はありません。";
    userScheduleCalendar.appendChild(emptyMessage);
  }
}



// ==============================
// 支援員：運用チェック
// ボタンを押した時だけ、選択月の利用者予定とアナウンス件数を確認する。
// ==============================
function setDefaultOperationCheckMonth() {
  if (!operationCheckMonth) {
    return;
  }

  const today = new Date();
  operationCheckMonth.value = formatMonthId(today.getFullYear(), today.getMonth());
}

function parseOperationCheckMonth() {
  const value = operationCheckMonth?.value || formatMonthId(new Date().getFullYear(), new Date().getMonth());
  const [yearText, monthText] = value.split("-");

  return {
    year: Number(yearText),
    month: Number(monthText) - 1,
    monthId: value
  };
}

async function getMonthlyAnnouncementsForOperationCheck(year, month) {
  const officeId = getCurrentOfficeId();
  const monthId = formatMonthId(year, month);
  const cacheKey = `${officeId}_${monthId}`;

  if (staffMonthlyAnnouncementCache[cacheKey]) {
    return staffMonthlyAnnouncementCache[cacheKey];
  }

  const monthlyAnnouncementId = getMonthlyAnnouncementId(officeId, monthId);
  const docRef = doc(db, "monthlyAnnouncements", monthlyAnnouncementId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    staffMonthlyAnnouncementCache[cacheKey] = {};
    return staffMonthlyAnnouncementCache[cacheKey];
  }

  const data = docSnap.data();
  const rawDays = data.days || {};
  const loadedByDate = {};

  Object.keys(rawDays).forEach((dateId) => {
    const rawList = Array.isArray(rawDays[dateId]) ? rawDays[dateId] : [];
    const activeList = rawList.filter((announcement) => announcement.active !== false);

    if (activeList.length > 0) {
      loadedByDate[dateId] = sortAnnouncements(activeList);
    }
  });

  staffMonthlyAnnouncementCache[cacheKey] = loadedByDate;
  return loadedByDate;
}

function countWeekdaysInMonth(year, month) {
  const lastDate = new Date(year, month + 1, 0).getDate();
  let count = 0;

  for (let day = 1; day <= lastDate; day++) {
    if (isWeekday(new Date(year, month, day))) {
      count++;
    }
  }

  return count;
}

function countUnfilledWeekdays(monthlySchedule, year, month) {
  const lastDate = new Date(year, month + 1, 0).getDate();
  const days = monthlySchedule?.days || {};
  let count = 0;

  for (let day = 1; day <= lastDate; day++) {
    const dateObj = new Date(year, month, day);

    if (!isWeekday(dateObj)) {
      continue;
    }

    const dateId = formatDateId(dateObj);
    const dayData = days[dateId];

    if (!dayData || !dayData.status) {
      count++;
    }
  }

  return count;
}

function renderNameList(items, emptyText) {
  if (!items.length) {
    return `<div class="operation-check-muted">${emptyText}</div>`;
  }

  return `<ul class="operation-check-name-list">${items.map((item) => `<li>${item}</li>`).join("")}</ul>`;
}

async function runOperationCheck() {
  if (!operationCheckResult) {
    return;
  }

  const { year, month, monthId } = parseOperationCheckMonth();

  operationCheckResult.innerHTML = `<div class="operation-check-loading">チェック中...</div>`;

  try {
    const users = await loadActiveUsersForStaff();
    const weekdayCount = countWeekdaysInMonth(year, month);
    const missingMonthlyDocUsers = [];
    const zeroWorkDayUsers = [];
    const unfilledUsers = [];
    let totalWorkDays = 0;

    for (const user of users) {
      const monthlySchedule = await loadMonthlyScheduleForSingleUser(user, year, month);
      const days = monthlySchedule?.days || {};
      const workDayCount = typeof monthlySchedule?.workDayCount === "number"
        ? monthlySchedule.workDayCount
        : calculateWorkDayCountFromDays(days);
      const unfilledCount = countUnfilledWeekdays(monthlySchedule, year, month);
      const userLabel = user.name || user.email || user.id;

      totalWorkDays += workDayCount;

      if (monthlySchedule?._missingDoc) {
        missingMonthlyDocUsers.push(userLabel);
      }

      if (workDayCount === 0) {
        zeroWorkDayUsers.push(userLabel);
      }

      if (unfilledCount > 0) {
        unfilledUsers.push(`${userLabel}（休み扱い ${unfilledCount}/${weekdayCount}日）`);
      }
    }

    const monthlyAnnouncements = await getMonthlyAnnouncementsForOperationCheck(year, month);
    const announcementDays = Object.keys(monthlyAnnouncements);
    const announcementCount = announcementDays.reduce((sum, dateId) => {
      return sum + (monthlyAnnouncements[dateId] || []).filter((announcement) => announcement.active !== false).length;
    }, 0);
    const staffOnlyCount = announcementDays.reduce((sum, dateId) => {
      return sum + (monthlyAnnouncements[dateId] || []).filter((announcement) => announcement.visibility === "staff" && announcement.active !== false).length;
    }, 0);

    operationCheckResult.innerHTML = `
      <div class="operation-check-grid">
        <div class="operation-check-card">
          <div class="operation-check-card-label">対象月</div>
          <div class="operation-check-card-value">${monthId}</div>
        </div>
        <div class="operation-check-card">
          <div class="operation-check-card-label">利用者数</div>
          <div class="operation-check-card-value">${users.length}人</div>
        </div>
        <div class="operation-check-card">
          <div class="operation-check-card-label">月間勤務日数合計</div>
          <div class="operation-check-card-value">${totalWorkDays}日</div>
        </div>
        <div class="operation-check-card">
          <div class="operation-check-card-label">アナウンス</div>
          <div class="operation-check-card-value">${announcementCount}件</div>
          <div class="operation-check-card-sub">支援員用 ${staffOnlyCount}件 / 表示日 ${announcementDays.length}日</div>
        </div>
      </div>

      <div class="operation-check-detail">
        <h3>月間予定ドキュメント未作成</h3>
        ${renderNameList(missingMonthlyDocUsers, "未作成の利用者はいません。")}
      </div>

      <div class="operation-check-detail">
        <h3>勤務日数0日の利用者</h3>
        ${renderNameList(zeroWorkDayUsers, "勤務日数0日の利用者はいません。")}
      </div>

      <div class="operation-check-detail">
        <h3>平日に休み扱いの日がある利用者</h3>
        ${renderNameList(unfilledUsers, "休み扱いの日はありません。")}
      </div>

      <div class="operation-check-note">
        このチェックはボタンを押した時だけ実行されます。同じ月・同じ利用者の予定はキャッシュされるため、2回目以降は追加Readを抑えます。
      </div>
    `;

    console.log(`[Read節約] 運用チェック：${monthId} はボタン実行時のみ利用者別monthlySchedulesを確認。キャッシュ済み分は追加Readなし。`);
  } catch (error) {
    console.error("運用チェックエラー:", error);
    operationCheckResult.innerHTML = `<div class="calendar-filter-empty">運用チェックに失敗しました：${error.code || error.message}</div>`;
  }
}

// ==============================
// 支援員：利用者予定の編集
// 利用者別カレンダー上の日付を押して、支援員が予定を登録・修正できる。
// ==============================
function setStaffEditStatus(status) {
  if (staffEditScheduleStatus) {
    staffEditScheduleStatus.value = status || "";
  }

  if (staffEditStatusButtonGroup) {
    staffEditStatusButtonGroup.querySelectorAll(".choice-button").forEach((button) => {
      button.classList.toggle("active", (button.dataset.status || "") === (status || ""));
    });
  }

  const needsTimeSlot = status === "通所" || status === "在宅";

  if (staffEditTimeSlotChoiceBox) {
    staffEditTimeSlotChoiceBox.classList.toggle("hidden", !needsTimeSlot);
  }

  if (!needsTimeSlot) {
    setStaffEditTimeSlot("");
  } else if (!staffEditScheduleTimeSlot?.value) {
    setStaffEditTimeSlot("終日");
  }
}

function setStaffEditTimeSlot(timeSlot) {
  if (staffEditScheduleTimeSlot) {
    staffEditScheduleTimeSlot.value = timeSlot || "";
  }

  if (staffEditTimeSlotButtonGroup) {
    staffEditTimeSlotButtonGroup.querySelectorAll(".choice-button").forEach((button) => {
      button.classList.toggle("active", (button.dataset.timeslot || "") === (timeSlot || ""));
    });
  }
}

function closeUserScheduleEditModal() {
  if (!userScheduleEditModal) {
    return;
  }

  userScheduleEditModal.classList.add("hidden");
  unlockPageScroll();
}

async function openUserScheduleEditModal(dateId) {
  if (!userScheduleEditModal || !selectedUserScheduleId) {
    return;
  }

  try {
    const { year, month } = getYearAndMonthFromDateId(dateId);
    const monthlySchedule = await getSelectedUserMonthlySchedule(year, month);

    if (!monthlySchedule) {
      alert("利用者が選択されていません。");
      return;
    }

    currentEditingUserMonthlySchedule = monthlySchedule;
    selectedUserScheduleEditDate = dateId;

    const dayData = monthlySchedule.days?.[dateId] || {};
    const name = monthlySchedule.userName || monthlySchedule.userEmail || "利用者";

    if (userScheduleEditModalTitle) {
      userScheduleEditModalTitle.textContent = `${name}さん / ${formatJapaneseDate(dateId)}の予定`;
    }

    if (staffEditScheduleDate) {
      staffEditScheduleDate.value = dateId;
    }

    if (staffEditScheduleUserId) {
      staffEditScheduleUserId.value = monthlySchedule.userId || selectedUserScheduleId;
    }

    if (staffEditScheduleMemo) {
      staffEditScheduleMemo.value = dayData.memo || "";
    }

    if (userScheduleEditMessage) {
      userScheduleEditMessage.textContent = monthlySchedule._missingDoc
        ? "この利用者の月間予定はまだ未作成です。保存すると自動で作成されます。"
        : "";
    }

    setStaffEditStatus(dayData.status || "");
    setStaffEditTimeSlot(dayData.timeSlot || (dayData.status === "通所" || dayData.status === "在宅" ? "終日" : ""));

    lockPageScroll();
    userScheduleEditModal.classList.remove("hidden");
  } catch (error) {
    console.error("利用者予定編集モーダル表示エラー:", error);
    alert(`予定編集画面の表示に失敗しました：${error.code || error.message}`);
  }
}

function syncSingleMonthlyScheduleIntoStaffMonthlyCache(monthlySchedule) {
  const officeId = monthlySchedule.officeId || getCurrentOfficeId();
  const monthId = monthlySchedule.month;
  const cacheKey = `${officeId}_${monthId}`;

  if (!staffMonthlyScheduleCache[cacheKey]) {
    return;
  }

  const existingIndex = staffMonthlyScheduleCache[cacheKey].findIndex((item) => {
    return item.userId === monthlySchedule.userId || item.id === monthlySchedule.id;
  });

  if (existingIndex >= 0) {
    staffMonthlyScheduleCache[cacheKey][existingIndex] = monthlySchedule;
  } else {
    staffMonthlyScheduleCache[cacheKey].push(monthlySchedule);
  }
}

async function saveUserScheduleFromStaffModal() {
  const dateId = staffEditScheduleDate?.value || selectedUserScheduleEditDate;
  const status = staffEditScheduleStatus?.value || "";
  const memo = staffEditScheduleMemo?.value?.trim() || "";

  if (!dateId || !selectedUserScheduleId) {
    alert("保存対象の利用者または日付が見つかりません。");
    return;
  }

  try {
    const { year, month } = getYearAndMonthFromDateId(dateId);
    const monthId = formatMonthId(year, month);
    const monthlySchedule = currentEditingUserMonthlySchedule || await getSelectedUserMonthlySchedule(year, month);

    if (!monthlySchedule) {
      alert("保存対象の月間予定が見つかりません。");
      return;
    }

    const days = { ...(monthlySchedule.days || {}) };

    if (!status) {
      delete days[dateId];
    } else {
      const timeSlot = (status === "通所" || status === "在宅")
        ? (staffEditScheduleTimeSlot?.value || "終日")
        : "";

      days[dateId] = {
        status: status,
        timeSlot: timeSlot,
        memo: memo
      };
    }

    const workDayCount = calculateWorkDayCountFromDays(days);
    const selectedUser = selectedUserScheduleData || {
      id: monthlySchedule.userId || selectedUserScheduleId,
      name: monthlySchedule.userName || "名前未設定",
      email: monthlySchedule.userEmail || "",
      officeId: monthlySchedule.officeId || getCurrentOfficeId(),
      groupId: monthlySchedule.groupId || getCurrentGroupId()
    };

    const updatedMonthlySchedule = {
      id: monthlySchedule.id || `${selectedUser.id}_${monthId}`,
      _missingDoc: false,
      userId: selectedUser.id,
      userName: selectedUser.name || monthlySchedule.userName || "名前未設定",
      userEmail: selectedUser.email || monthlySchedule.userEmail || "",
      officeId: selectedUser.officeId || monthlySchedule.officeId || getCurrentOfficeId(),
      groupId: selectedUser.groupId || monthlySchedule.groupId || getCurrentGroupId(),
      month: monthId,
      days: days,
      workDayCount: workDayCount
    };

    await setDoc(doc(db, "monthlySchedules", updatedMonthlySchedule.id), {
      userId: updatedMonthlySchedule.userId,
      userName: updatedMonthlySchedule.userName,
      userEmail: updatedMonthlySchedule.userEmail,
      officeId: updatedMonthlySchedule.officeId,
      groupId: updatedMonthlySchedule.groupId,
      month: updatedMonthlySchedule.month,
      days: updatedMonthlySchedule.days,
      workDayCount: updatedMonthlySchedule.workDayCount,
      updatedAt: serverTimestamp(),
      updatedByUid: currentUser?.uid || "",
      updatedByName: currentStaffData?.name || currentUser?.email || ""
    });

    const cacheKey = `${updatedMonthlySchedule.userId}_${monthId}`;
    individualUserMonthlyScheduleCache[cacheKey] = updatedMonthlySchedule;
    currentEditingUserMonthlySchedule = updatedMonthlySchedule;
    syncSingleMonthlyScheduleIntoStaffMonthlyCache(updatedMonthlySchedule);

    closeUserScheduleEditModal();
    await loadUserMonthlyScheduleView();

    console.log(`[Read節約] 支援員が利用者予定を保存：追加Readなし、monthlySchedules 1 write。${updatedMonthlySchedule.id}`);
  } catch (error) {
    console.error("支援員による利用者予定保存エラー:", error);
    alert(`予定の保存に失敗しました：${error.code || error.message}`);
  }
}

// ==============================
// 支援員：アナウンス管理
// 新方式 monthlyAnnouncements を1か月1ドキュメントで管理する。
// ==============================
async function loadMonthlyAnnouncements(year, month) {
  const officeId = getCurrentOfficeId();
  const monthId = formatMonthId(year, month);
  const cacheKey = `${officeId}_${monthId}`;

  if (staffMonthlyAnnouncementCache[cacheKey]) {
    announcementsByDate = staffMonthlyAnnouncementCache[cacheKey];
    return announcementsByDate;
  }

  const monthlyAnnouncementId = getMonthlyAnnouncementId(officeId, monthId);
  const docRef = doc(db, "monthlyAnnouncements", monthlyAnnouncementId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    staffMonthlyAnnouncementCache[cacheKey] = {};
    announcementsByDate = staffMonthlyAnnouncementCache[cacheKey];
    return announcementsByDate;
  }

  const data = docSnap.data();
  const rawDays = data.days || {};
  const loadedByDate = {};

  Object.keys(rawDays).forEach((dateId) => {
    const rawList = Array.isArray(rawDays[dateId]) ? rawDays[dateId] : [];
    const activeList = rawList.filter((announcement) => announcement.active !== false);

    if (activeList.length > 0) {
      loadedByDate[dateId] = sortAnnouncements(activeList);
    }
  });

  staffMonthlyAnnouncementCache[cacheKey] = loadedByDate;
  announcementsByDate = loadedByDate;
  return announcementsByDate;
}

async function persistMonthlyAnnouncements(year, month) {
  const officeId = getCurrentOfficeId();
  const groupId = getCurrentGroupId();
  const monthId = formatMonthId(year, month);
  const cacheKey = `${officeId}_${monthId}`;
  const monthlyAnnouncementId = getMonthlyAnnouncementId(officeId, monthId);

  const cleanedDays = {};

  Object.keys(announcementsByDate).forEach((dateId) => {
    if (getMonthIdFromDateId(dateId) !== monthId) {
      return;
    }

    const list = sortAnnouncements(announcementsByDate[dateId] || [])
      .filter((announcement) => announcement.active !== false)
      .map((announcement) => ({
        id: announcement.id,
        visibility: announcement.visibility || "all",
        category: announcement.category || "notice",
        title: announcement.title || "",
        startTime: announcement.startTime || "",
        endTime: announcement.endTime || "",
        timeText: announcement.timeText || "",
        body: announcement.body || "",
        active: true,
        createdByUid: announcement.createdByUid || currentUser.uid,
        createdByName: announcement.createdByName || currentStaffData?.name || currentUser.email,
        createdAt: announcement.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }));

    if (list.length > 0) {
      cleanedDays[dateId] = list;
    }
  });

  await setDoc(doc(db, "monthlyAnnouncements", monthlyAnnouncementId), {
    officeId: officeId,
    groupId: groupId,
    month: monthId,
    yearMonth: monthId,
    days: cleanedDays,
    updatedAt: serverTimestamp()
  });

  staffMonthlyAnnouncementCache[cacheKey] = cleanedDays;
  announcementsByDate = cleanedDays;
}

function renderAnnouncementCalendarFromCache(year, month) {
  updateStaffAnnouncementViewButtons();

  if (currentAnnouncementViewMode === "list") {
    renderAnnouncementListViewFromCache(year, month);
    return;
  }

  announcementCalendar.innerHTML = "";
  announcementCalendar.classList.remove("staff-announcement-list-view");

  if (announcementCalendarWeekHeader) {
    announcementCalendarWeekHeader.classList.remove("hidden");
  }

  const today = new Date();
  const monthId = formatMonthId(year, month);

  updateAnnouncementMonthHeader(year, month);

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
    const dayAnnouncements = getFilteredStaffAnnouncements(dateId);
    const shouldShowDay = isAllAnnouncementDaysMode() || dayAnnouncements.length > 0;

    if (!shouldShowDay) {
      const emptyCell = document.createElement("div");
      emptyCell.className = "calendar-day empty filtered-empty";
      announcementCalendar.appendChild(emptyCell);
      continue;
    }

    const dayCell = document.createElement("div");
    dayCell.className = `calendar-day ${getAnnouncementVisibilityToneClass(dayAnnouncements)}`.trim();
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

  console.log(`[Read節約] アナウンス管理：${monthId} は monthlyAnnouncements 1ドキュメント方式で表示。保存後の再描画は追加Readなし。`);
}

function renderAnnouncementListViewFromCache(year, month) {
  announcementCalendar.innerHTML = "";
  announcementCalendar.classList.add("staff-announcement-list-view");

  if (announcementCalendarWeekHeader) {
    announcementCalendarWeekHeader.classList.add("hidden");
  }

  const today = new Date();
  const monthId = formatMonthId(year, month);
  const lastDate = new Date(year, month + 1, 0).getDate();

  updateAnnouncementMonthHeader(year, month);

  let visibleDayCount = 0;

  for (let day = 1; day <= lastDate; day++) {
    const targetDate = new Date(year, month, day);
    const dateId = formatDateId(targetDate);
    const dayAnnouncements = getFilteredStaffAnnouncements(dateId);

    if (!isAllAnnouncementDaysMode() && dayAnnouncements.length === 0) {
      continue;
    }

    const dayItem = document.createElement("div");
    dayItem.className = `staff-announcement-list-day ${getAnnouncementVisibilityToneClass(dayAnnouncements)}`.trim();
    dayItem.dataset.dateId = dateId;

    if (dateId === formatDateId(today)) {
      dayItem.classList.add("today");
    }

    const header = document.createElement("div");
    header.className = "staff-announcement-list-header";

    const dateText = document.createElement("div");
    dateText.className = "staff-announcement-list-date";
    dateText.textContent = `${month + 1}月${day}日（${["日", "月", "火", "水", "木", "金", "土"][targetDate.getDay()]}）`;
    header.appendChild(dateText);

    const summary = document.createElement("div");
    summary.className = "staff-announcement-list-summary";

    const hasPublic = dayAnnouncements.some((announcement) => (announcement.visibility || "all") !== "staff");
    const hasStaffOnly = dayAnnouncements.some((announcement) => announcement.visibility === "staff");

    if (hasPublic && hasStaffOnly) {
      summary.textContent = "全体用・支援員用あり";
    } else if (hasStaffOnly) {
      summary.textContent = "支援員用あり";
    } else if (hasPublic) {
      summary.textContent = "全体用あり";
    } else {
      summary.textContent = "クリックして追加";
      summary.classList.add("muted");
    }

    header.appendChild(summary);
    dayItem.appendChild(header);

    if (dayAnnouncements.length > 0) {
      const announcementArea = document.createElement("div");
      announcementArea.className = "staff-announcement-list-items";

      dayAnnouncements.forEach((announcement) => {
        const card = document.createElement("div");
        card.className = `staff-announcement-list-card category-${announcement.category || "notice"}`;

        const title = document.createElement("div");
        title.className = "staff-announcement-list-card-title";
        title.textContent = `${getAnnouncementIcon(announcement.category || "notice")} ${announcement.title || "お知らせ"}`;

        if (announcement.visibility === "staff") {
          const badge = document.createElement("span");
          badge.className = "staff-only-badge";
          badge.textContent = "支援員のみ";
          title.appendChild(badge);
        }

        card.appendChild(title);

        if (announcement.timeText) {
          const time = document.createElement("div");
          time.className = "staff-announcement-list-card-time";
          time.textContent = announcement.timeText;
          card.appendChild(time);
        }

        if (announcement.body) {
          const body = document.createElement("div");
          body.className = "staff-announcement-list-card-body";
          body.textContent = announcement.body;
          card.appendChild(body);
        }

        announcementArea.appendChild(card);
      });

      dayItem.appendChild(announcementArea);
    }

    dayItem.addEventListener("click", () => {
      openAnnouncementModal(dateId);
    });

    announcementCalendar.appendChild(dayItem);
    visibleDayCount++;
  }

  if (visibleDayCount === 0) {
    const emptyMessage = document.createElement("div");
    emptyMessage.className = "calendar-filter-empty";
    emptyMessage.textContent = "条件に合うアナウンスはありません。";
    announcementCalendar.appendChild(emptyMessage);
  }

  console.log(`[Read節約] アナウンス管理：${monthId} をリスト表示しました。表示切替による追加Readはありません。`);
}

async function loadAnnouncementCalendar() {
  if (!currentUser) {
    return;
  }

  announcementCalendar.textContent = "読み込み中...";

  try {
    const year = displayedAnnouncementYear;
    const month = displayedAnnouncementMonth;

    updateAnnouncementMonthHeader(year, month);
    await loadMonthlyAnnouncements(year, month);
    renderAnnouncementCalendarFromCache(year, month);

  } catch (error) {
    console.error("アナウンスカレンダー読み込みエラー:", error);
    announcementCalendar.textContent = `アナウンスの読み込みに失敗しました：${error.code || error.message}`;
  }
}

// ==============================
// 支援員：教材・リンク集管理
// system/workshopResources_{officeId} を、開いた時だけ1 readする。
// ==============================
function getWorkshopResourcesDocId() {
  return `${WORKSHOP_RESOURCES_DOC_PREFIX}${getCurrentOfficeId()}`;
}

function normalizeWorkshopId(text) {
  const base = (text || "workshop")
    .trim()
    .toLowerCase()
    .replace(/[\s　]+/g, "_")
    .replace(/[^a-z0-9_\-]/g, "");

  return `${base || "workshop"}_${Date.now().toString(36)}`;
}

function generateSmallId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function parseWorkshopLinks(text) {
  return (text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("|").map((part) => part.trim());
      return {
        id: generateSmallId("link"),
        title: parts[0] || "リンク",
        url: parts[1] || "",
        note: parts[2] || "",
        active: true
      };
    })
    .filter((item) => item.title || item.url);
}

function parseWorkshopDeadlines(text) {
  return (text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("|").map((part) => part.trim());
      return {
        id: generateSmallId("deadline"),
        title: parts[0] || "提出物",
        dueDate: parts[1] || "",
        dueTime: parts[2] || "",
        note: parts[3] || "",
        active: true
      };
    })
    .filter((item) => item.title || item.dueDate || item.note);
}

function formatWorkshopLinksForTextarea(links) {
  return (links || [])
    .filter((item) => item.active !== false)
    .map((item) => `${item.title || ""} | ${item.url || ""} | ${item.note || ""}`.trim())
    .join("\n");
}

function formatWorkshopDeadlinesForTextarea(deadlines) {
  return (deadlines || [])
    .filter((item) => item.active !== false)
    .map((item) => `${item.title || ""} | ${item.dueDate || ""} | ${item.dueTime || ""} | ${item.note || ""}`.trim())
    .join("\n");
}

function resetWorkshopResourceForm() {
  if (!workshopResourceFormTitle) {
    return;
  }

  workshopResourceFormTitle.textContent = "ワークショップを追加";
  editingWorkshopResourceId.value = "";
  workshopResourceActive.checked = true;
  workshopResourceTitle.value = "";
  workshopResourceScheduleText.value = "";
  workshopResourceDescription.value = "";
  workshopResourceLinksText.value = "";
  workshopResourceDeadlinesText.value = "";
}

function renderWorkshopResourceAdminList() {
  if (!workshopResourceList) {
    return;
  }

  const workshops = [...(workshopResourcesCache.workshops || [])];
  workshopResourceList.innerHTML = "";

  if (workshops.length === 0) {
    workshopResourceList.innerHTML = `<div class="calendar-filter-empty">まだワークショップが登録されていません。</div>`;
    return;
  }

  workshops.forEach((workshop) => {
    const card = document.createElement("div");
    card.className = "workshop-admin-card";
    if (workshop.active === false) {
      card.classList.add("inactive-workshop");
    }

    const title = document.createElement("div");
    title.className = "workshop-admin-card-title";
    title.textContent = workshop.title || "無題のワークショップ";

    const meta = document.createElement("div");
    meta.className = "workshop-admin-card-meta";
    const linkCount = (workshop.links || []).filter((item) => item.active !== false).length;
    const deadlineCount = (workshop.deadlines || []).filter((item) => item.active !== false).length;
    meta.textContent = `${workshop.active === false ? "非表示" : "表示中"} ／ リンク${linkCount}件 ／ 提出期限${deadlineCount}件`;

    const body = document.createElement("div");
    body.className = "workshop-admin-card-body";
    body.textContent = workshop.scheduleText || workshop.description || "説明なし";

    const buttons = document.createElement("div");
    buttons.className = "announcement-edit-buttons";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "small-button";
    editButton.textContent = "編集";
    editButton.addEventListener("click", () => {
      workshopResourceFormTitle.textContent = "編集中";
      editingWorkshopResourceId.value = workshop.id;
      workshopResourceActive.checked = workshop.active !== false;
      workshopResourceTitle.value = workshop.title || "";
      workshopResourceScheduleText.value = workshop.scheduleText || "";
      workshopResourceDescription.value = workshop.description || "";
      workshopResourceLinksText.value = formatWorkshopLinksForTextarea(workshop.links || []);
      workshopResourceDeadlinesText.value = formatWorkshopDeadlinesForTextarea(workshop.deadlines || []);
      workshopResourceTitle.focus();
    });

    const hideButton = document.createElement("button");
    hideButton.type = "button";
    hideButton.className = "small-button danger-button";
    hideButton.textContent = workshop.active === false ? "再表示" : "非表示";
    hideButton.addEventListener("click", async () => {
      const nextActive = workshop.active === false;
      const ok = confirm(nextActive ? "このワークショップを再表示しますか？" : "このワークショップを利用者ページで非表示にしますか？");
      if (!ok) {
        return;
      }

      workshopResourcesCache.workshops = (workshopResourcesCache.workshops || []).map((item) => {
        if (item.id !== workshop.id) {
          return item;
        }
        return { ...item, active: nextActive, updatedAt: new Date().toISOString() };
      });

      await persistWorkshopResources();
      renderWorkshopResourceAdminList();
    });

    buttons.appendChild(editButton);
    buttons.appendChild(hideButton);

    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(body);
    card.appendChild(buttons);
    workshopResourceList.appendChild(card);
  });
}

async function loadWorkshopResourcesForStaff() {
  if (workshopResourcesLoaded) {
    renderWorkshopResourceAdminList();
    return;
  }

  const docRef = doc(db, "system", getWorkshopResourcesDocId());
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    const data = docSnap.data();
    workshopResourcesCache = {
      officeId: data.officeId || getCurrentOfficeId(),
      groupId: data.groupId || getCurrentGroupId(),
      workshops: Array.isArray(data.workshops) ? data.workshops : []
    };
  } else {
    workshopResourcesCache = {
      officeId: getCurrentOfficeId(),
      groupId: getCurrentGroupId(),
      workshops: []
    };
  }

  workshopResourcesLoaded = true;
  renderWorkshopResourceAdminList();
  console.log(`[Read節約] 教材・リンク集管理：${getWorkshopResourcesDocId()} を開いた時だけ1 readしました。`);
}

async function persistWorkshopResources() {
  const docRef = doc(db, "system", getWorkshopResourcesDocId());
  const cleanedWorkshops = (workshopResourcesCache.workshops || []).map((workshop) => ({
    id: workshop.id,
    title: workshop.title || "",
    active: workshop.active !== false,
    description: workshop.description || "",
    scheduleText: workshop.scheduleText || "",
    links: Array.isArray(workshop.links) ? workshop.links : [],
    deadlines: Array.isArray(workshop.deadlines) ? workshop.deadlines : [],
    createdAt: workshop.createdAt || new Date().toISOString(),
    updatedAt: workshop.updatedAt || new Date().toISOString()
  }));

  await setDoc(docRef, {
    officeId: getCurrentOfficeId(),
    groupId: getCurrentGroupId(),
    workshops: cleanedWorkshops,
    updatedAt: serverTimestamp()
  });

  workshopResourcesCache.workshops = cleanedWorkshops;
}

async function saveWorkshopResourceFromForm() {
  const title = (workshopResourceTitle?.value || "").trim();

  if (!title) {
    alert("ワークショップ名を入力してください。");
    return;
  }

  if (!workshopResourcesLoaded) {
    await loadWorkshopResourcesForStaff();
  }

  const now = new Date().toISOString();
  const editingId = editingWorkshopResourceId.value;
  const nextWorkshop = {
    id: editingId || normalizeWorkshopId(title),
    title: title,
    active: workshopResourceActive.checked,
    description: (workshopResourceDescription.value || "").trim(),
    scheduleText: (workshopResourceScheduleText.value || "").trim(),
    links: parseWorkshopLinks(workshopResourceLinksText.value),
    deadlines: parseWorkshopDeadlines(workshopResourceDeadlinesText.value),
    createdAt: now,
    updatedAt: now
  };

  if (editingId) {
    workshopResourcesCache.workshops = (workshopResourcesCache.workshops || []).map((workshop) => {
      if (workshop.id !== editingId) {
        return workshop;
      }
      return {
        ...nextWorkshop,
        createdAt: workshop.createdAt || now
      };
    });
  } else {
    workshopResourcesCache.workshops = [...(workshopResourcesCache.workshops || []), nextWorkshop];
  }

  await persistWorkshopResources();
  resetWorkshopResourceForm();
  renderWorkshopResourceAdminList();

  if (workshopResourceMessage) {
    workshopResourceMessage.style.color = "green";
    workshopResourceMessage.textContent = "教材・リンク集を保存しました。";
  }
}


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

    if (userData.role !== "staff" && userData.role !== "admin") {
      alert("このページは支援員専用です。");
      window.location.href = "user.html";
      return;
    }

    staffInfo.textContent = `支援員｜${userData.name}`;

    targetDate.value = getTodayDateId();

    const todayForAnnouncement = new Date();
    setDisplayedAnnouncementMonth(todayForAnnouncement.getFullYear(), todayForAnnouncement.getMonth());
    setDisplayedUserScheduleMonth(todayForAnnouncement.getFullYear(), todayForAnnouncement.getMonth());

    showDailyScheduleNotLoadedText();
    initializeUserMonthlyScheduleSection();
    loadAnnouncementCalendar();

  } else {
    window.location.href = "index.html";
  }
});

loadButton.addEventListener("click", () => {
  loadDailySchedules();
});


if (loadWorkshopResourcesButton) {
  loadWorkshopResourcesButton.addEventListener("click", async () => {
    try {
      loadWorkshopResourcesButton.disabled = true;
      loadWorkshopResourcesButton.textContent = "読み込み中...";

      if (workshopResourceAdminArea) {
        workshopResourceAdminArea.classList.remove("hidden");
      }

      await loadWorkshopResourcesForStaff();

      if (workshopResourceMessage) {
        workshopResourceMessage.style.color = "green";
        workshopResourceMessage.textContent = "教材・リンク集を読み込みました。";
      }
    } catch (error) {
      console.error("教材・リンク集読み込みエラー:", error);
      if (workshopResourceMessage) {
        workshopResourceMessage.style.color = "red";
        workshopResourceMessage.textContent = `読み込みに失敗しました：${error.code || error.message}`;
      }
    } finally {
      loadWorkshopResourcesButton.disabled = false;
      loadWorkshopResourcesButton.textContent = "教材・リンク管理を開く";
    }
  });
}

if (saveWorkshopResourceButton) {
  saveWorkshopResourceButton.addEventListener("click", async () => {
    try {
      saveWorkshopResourceButton.disabled = true;
      saveWorkshopResourceButton.textContent = "保存中...";
      await saveWorkshopResourceFromForm();
    } catch (error) {
      console.error("教材・リンク集保存エラー:", error);
      alert(`保存に失敗しました：${error.code || error.message}`);
    } finally {
      saveWorkshopResourceButton.disabled = false;
      saveWorkshopResourceButton.textContent = "保存";
    }
  });
}

if (resetWorkshopResourceFormButton) {
  resetWorkshopResourceFormButton.addEventListener("click", () => {
    resetWorkshopResourceForm();
  });
}


if (userScheduleCalendarViewButton) {
  userScheduleCalendarViewButton.addEventListener("click", async () => {
    currentUserScheduleViewMode = "calendar";
    await loadUserMonthlyScheduleView();
  });
}

if (userScheduleListViewButton) {
  userScheduleListViewButton.addEventListener("click", async () => {
    currentUserScheduleViewMode = "list";
    await loadUserMonthlyScheduleView();
  });
}
if (userScheduleWeekViewButton) {
  userScheduleWeekViewButton.addEventListener("click", async () => {
    currentUserScheduleViewMode = "week";

    // 週間表示へ切り替えた最初の表示は、必ずその月の基準週に戻す。
    // 今月なら「今週」、別の月なら「その月の最初の平日を含む週」。
    // Firestoreは読み直さず、すでに読み込んだ月間データを表示だけ切り替える。
    displayedUserScheduleWeekStartDate = getDefaultWeekStartForMonth(displayedUserScheduleYear, displayedUserScheduleMonth);

    await loadUserMonthlyScheduleView();
  });
}

async function changeDisplayedUserScheduleWeek(weekOffset) {
  const nextWeekStart = new Date(
    displayedUserScheduleWeekStartDate.getFullYear(),
    displayedUserScheduleWeekStartDate.getMonth(),
    displayedUserScheduleWeekStartDate.getDate() + weekOffset * 7
  );

  // Read節約のため、週移動は現在読み込んでいる月の範囲内だけで行う。
  if (!weekIntersectsMonth(nextWeekStart, displayedUserScheduleYear, displayedUserScheduleMonth)) {
    return;
  }

  displayedUserScheduleWeekStartDate = nextWeekStart;
  await loadUserMonthlyScheduleView();
}

if (prevUserScheduleWeekButton) {
  prevUserScheduleWeekButton.addEventListener("click", async () => {
    await changeDisplayedUserScheduleWeek(-1);
  });
}

if (nextUserScheduleWeekButton) {
  nextUserScheduleWeekButton.addEventListener("click", async () => {
    await changeDisplayedUserScheduleWeek(1);
  });
}


if (prevUserScheduleMonthButton) {
  prevUserScheduleMonthButton.addEventListener("click", async () => {
    setDisplayedUserScheduleMonth(displayedUserScheduleYear, displayedUserScheduleMonth - 1);
    displayedUserScheduleWeekStartDate = getDefaultWeekStartForMonth(displayedUserScheduleYear, displayedUserScheduleMonth);
    await loadUserMonthlyScheduleView();
  });
}

if (nextUserScheduleMonthButton) {
  nextUserScheduleMonthButton.addEventListener("click", async () => {
    setDisplayedUserScheduleMonth(displayedUserScheduleYear, displayedUserScheduleMonth + 1);
    displayedUserScheduleWeekStartDate = getDefaultWeekStartForMonth(displayedUserScheduleYear, displayedUserScheduleMonth);
    await loadUserMonthlyScheduleView();
  });
}

if (showOnlyUseDaysUserScheduleCheckbox) {
  showOnlyUseDaysUserScheduleCheckbox.addEventListener("change", async () => {
    await loadUserMonthlyScheduleView();
  });
}

if (runOperationCheckButton) {
  runOperationCheckButton.addEventListener("click", async () => {
    await runOperationCheck();
  });
}

if (refreshActiveUsersButton) {
  refreshActiveUsersButton.addEventListener("click", async () => {
    const ok = confirm("usersコレクションから利用者一覧を再作成します。新しい利用者を追加・非表示にした後だけ実行してください。よろしいですか？");

    if (!ok) {
      return;
    }

    try {
      refreshActiveUsersButton.disabled = true;
      refreshActiveUsersButton.textContent = "更新中...";

      const users = await rebuildActiveUsersFromUsersCollection();
      renderUserScheduleUserList(users);

      if (selectedUserScheduleId && !users.some((user) => user.id === selectedUserScheduleId)) {
        selectedUserScheduleId = "";
        selectedUserScheduleData = null;
        renderUserSchedulePlaceholder("選択中の利用者が一覧から外れました。利用者名を選び直してください。");
      } else if (!selectedUserScheduleId) {
        renderUserSchedulePlaceholder("利用者名を押すと、その人の月間予定を読み込みます。");
      }

      alert("利用者一覧を更新しました。次回から system/activeUsers の1 readで読み込みます。");
    } catch (error) {
      console.error("利用者一覧更新エラー:", error);
      alert(`利用者一覧の更新に失敗しました：${error.code || error.message}`);
    } finally {
      refreshActiveUsersButton.disabled = false;
      refreshActiveUsersButton.textContent = "利用者一覧を更新";
    }
  });
}

if (staffEditStatusButtonGroup) {
  staffEditStatusButtonGroup.querySelectorAll(".choice-button").forEach((button) => {
    button.addEventListener("click", () => {
      setStaffEditStatus(button.dataset.status || "");
    });
  });
}

if (staffEditTimeSlotButtonGroup) {
  staffEditTimeSlotButtonGroup.querySelectorAll(".choice-button").forEach((button) => {
    button.addEventListener("click", () => {
      setStaffEditTimeSlot(button.dataset.timeslot || "");
    });
  });
}

if (saveUserScheduleEditButton) {
  saveUserScheduleEditButton.addEventListener("click", async () => {
    await saveUserScheduleFromStaffModal();
  });
}

if (resetUserScheduleEditButton) {
  resetUserScheduleEditButton.addEventListener("click", () => {
    setStaffEditStatus("");
    setStaffEditTimeSlot("");
    if (staffEditScheduleMemo) {
      staffEditScheduleMemo.value = "";
    }
  });
}

if (cancelUserScheduleEditButton) {
  cancelUserScheduleEditButton.addEventListener("click", () => {
    closeUserScheduleEditModal();
  });
}

if (closeUserScheduleEditModalButton) {
  closeUserScheduleEditModalButton.addEventListener("click", () => {
    closeUserScheduleEditModal();
  });
}

if (userScheduleEditModal) {
  userScheduleEditModal.addEventListener("click", (event) => {
    if (event.target === userScheduleEditModal) {
      closeUserScheduleEditModal();
    }
  });
}

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
    const { year, month } = getYearAndMonthFromDateId(date);
    const list = announcementsByDate[date] || [];

    if (id) {
      announcementsByDate[date] = list.map((announcement) => {
        if (announcement.id !== id) {
          return announcement;
        }

        return {
          ...announcement,
          visibility: visibility,
          category: category,
          title: title,
          startTime: startTime,
          endTime: endTime,
          timeText: timeText,
          body: body,
          active: true,
          updatedAt: new Date().toISOString()
        };
      });
    } else {
      const newAnnouncement = {
        id: generateAnnouncementId(),
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      announcementsByDate[date] = [...list, newAnnouncement];
    }

    await persistMonthlyAnnouncements(year, month);

    setDisplayedAnnouncementMonth(year, month);
    resetAnnouncementForm();
    renderAnnouncementCalendarFromCache(year, month);
    renderAnnouncementList(selectedAnnouncementDate);

  } catch (error) {
    console.error("アナウンス保存エラー:", error);
    alert(`保存に失敗しました：${error.code || error.message}`);
  }
});

if (staffAnnouncementCalendarViewButton) {
  staffAnnouncementCalendarViewButton.addEventListener("click", () => {
    currentAnnouncementViewMode = "calendar";
    renderAnnouncementCalendarFromCache(displayedAnnouncementYear, displayedAnnouncementMonth);
  });
}

if (staffAnnouncementListViewButton) {
  staffAnnouncementListViewButton.addEventListener("click", () => {
    currentAnnouncementViewMode = "list";
    renderAnnouncementCalendarFromCache(displayedAnnouncementYear, displayedAnnouncementMonth);
  });
}

if (prevAnnouncementMonthButton) {
  prevAnnouncementMonthButton.addEventListener("click", async () => {
    setDisplayedAnnouncementMonth(displayedAnnouncementYear, displayedAnnouncementMonth - 1);
    await loadAnnouncementCalendar();
  });
}

if (nextAnnouncementMonthButton) {
  nextAnnouncementMonthButton.addEventListener("click", async () => {
    setDisplayedAnnouncementMonth(displayedAnnouncementYear, displayedAnnouncementMonth + 1);
    await loadAnnouncementCalendar();
  });
}

if (showAllAnnouncementDaysCheckbox) {
  showAllAnnouncementDaysCheckbox.addEventListener("change", () => {
    refreshStaffAnnouncementCalendarByFilter(showAllAnnouncementDaysCheckbox);
  });
}

getStaffAnnouncementFilterCheckboxes().forEach((checkbox) => {
  checkbox.addEventListener("change", () => {
    refreshStaffAnnouncementCalendarByFilter(checkbox);
  });
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
