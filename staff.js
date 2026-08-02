// STEP55_OFFICE_ID_ENZINE_CHIBA_20260623_V85：事業所IDをenzine_chibaへ統一し旧engine_chibaを互換扱い
// STEP57_WEEKLY_REPORT_NO_HOME_WORK_NO_REPLY_BOX_20260707_V87：在宅なしは返信欄を出さず詳細を簡潔化
// STEP56_WEEKLY_REPORT_NO_HOME_WORK_20260707_V86：在宅なしの週一報告を返信不要として表示
// STEP52_ANNOUNCEMENT_WORKSHOP_PICKER_20260623_V82：アナウンス作成時に登録済みワークショップを選択
// STEP51_WEEKLY_REPORT_NEW_USER_START_20260622_V81：新規登録者の週一報告は登録週の翌週から対象
// STEP50_SETTINGS_MENU_CLOSE_20260622_V80：設定メニューを外クリックとEscで閉じる
// STEP48_PUBLIC_BILLING_SAFETY_TEST_NOTICE_20260622_V78：支援員ページにも課金安全テスト中表示を追加
// STEP44_ADMIN_TOP_SWITCHER_20260622_V74：管理者用の常時表示ページ切り替えを支援員ページにも表示
// STEP42_ADMIN_ROLE_FILTER_AND_NAV_20260622_V72：管理者だけ支援員ページからAdminへ戻れる導線を表示
// STEP40_DAILY_LIST_REMOVE_EDIT_LABEL_20260621_V70：本日の一覧の編集チップを外して名前クリック案内へ
// STEP39_DAILY_TIME_SLOT_COLORS_20260621_V69：本日の一覧の時間帯チップを淡色で色分け
// STEP38_DAILY_TIME_SLOT_SORT_20260621_V68：日別予定一覧を午前・午後・終日の順で表示
// STEP34_WORKSHOP_FORM_TOGGLE_PREVIEW_GUIDE_20260621_V64：追加フォームをボタン開閉化・プレビュー案内色分け
// STEP33_WORKSHOP_PREVIEW_DELETE_FILTER_20260621_V63：通常プレビュー選択・削除・非表示一覧切替
// STEP32_WORKSHOP_CASE_COMPLETE_HIDE_20260621_V62：完了案件を支援員側から非表示にできるよう対応
// STEP31_WORKSHOP_EDIT_PREVIEW_20260621_V61：ワークショップ管理の編集・プレビュー分離
// STEP30_CASE_CARD_EDITOR_20260621_V60：支援員側の案件追加をカード型に変更
// STEP29_CASE_DRAFT_20260621_V59：案件情報貼り付け下書き対応
// STEP6_READABILITY_FIX_20260620_V35：週一報告の可読性修正
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-functions.js";

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

import { auth, db, functions } from "./firebase-config.js";
import { applyOfficeBrandName, enforceMaintenanceAccess, setupSettingsMenuClose } from "./ui-common.js?v=89";

// STEP7_WEEKLY_REPORT_STABILITY_20260620_V36：週一報告の既読互換と表示漏れ修正
// STEP9_WEEKLY_REPORT_WEEKDAY_START_20260620_V38：週一報告の対象期間を月〜金に調整
// STEP18_WEEKLY_REPORT_STATUS_CACHE_20260620_V47：支援員返信時に利用者通知用の集約docを更新
// STEP19_STAFF_HTML_ESCAPE_20260620_V48：運用チェックなどのHTML文字列出力を安全化
// STEP23_STAFF_WEEKLY_STATUS_INDEX_20260620_V52：週一報告一覧はステータスdoc優先で確認
// STEP24_STAFF_DASHBOARD_20260620_V53：支援員の今日の概況をボタン実行で集計
// STEP25_STAFF_DATE_PICKER_20260620_V54：日付入力欄全体のクリックでカレンダーを開く
// STEP26_DAILY_LIST_DIRECT_EDIT_20260620_V55：日別一覧から利用者予定編集へ直接移動

const DEFAULT_OFFICE_ID = "enzine_chiba";
const LEGACY_OFFICE_IDS = ["engine_chiba"];
const DEFAULT_GROUP_ID = "enzine";
const ACTIVE_USERS_DOC_ID = "activeUsers";
const BILLING_SAFETY_DOC_ID = "billingSafety";
const STAFF_OFFICE_SCOPE_PARAM = "officeId";
const STAFF_OFFICE_SCOPE_STORAGE_KEY = "enzineGlobalStaffOfficeId";
const WEEKLY_REPORT_START_WEEK = "2026-06-15";
const WEEKLY_REPORT_STATUS_COLLECTION = "weeklyReportUserStatus";
const WEEKLY_REPORT_STATUS_SCHEMA_VERSION = 1;
const NO_HOME_WORK_VALUE = "在宅していない";
const NO_HOME_WORK_REPORT_TYPE = "no_home_work";
const DAILY_TIME_SLOT_ORDER = {
  "午前": 1,
  "午後": 2,
  "終日": 3
};
const getChatworkConsoleData = httpsCallable(functions, "getChatworkConsoleData");
const getOrganizationManagementData = httpsCallable(functions, "getOrganizationManagementData");

function getActiveUsersDocId(officeId) {
  return `${ACTIVE_USERS_DOC_ID}_${String(officeId || "").trim()}`;
}

// STEP5_WEBUI_20260620_V33：支援員ページ タブ切り替え・現在位置表示
const STAFF_TAB_STORAGE_KEY = "enzineStaffActiveTab";
const staffTabButtons = document.querySelectorAll("[data-staff-tab]");
const staffTabPanels = document.querySelectorAll("[data-staff-panel]");
const staffCurrentSectionTitle = document.getElementById("staffCurrentSectionTitle");

const STAFF_TAB_LABELS = {
  daily: "日別予定",
  "user-schedule": "利用者別予定",
  announcements: "アナウンス",
  workshops: "ワークショップ・教材",
  "weekly-reports": "週一報告",
  operation: "運用チェック"
};

function setStaffActiveTab(tabName, options = {}) {
  const targetTab = tabName || "daily";

  if (staffCurrentSectionTitle) {
    staffCurrentSectionTitle.textContent = STAFF_TAB_LABELS[targetTab] || "日別予定";
  }

  staffTabButtons.forEach((button) => {
    const isActive = button.dataset.staffTab === targetTab;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  staffTabPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.staffPanel === targetTab);
  });

  if (!options.skipStorage) {
    try {
      localStorage.setItem(STAFF_TAB_STORAGE_KEY, targetTab);
    } catch (error) {
      console.warn("支援員タブ状態の保存に失敗しました。", error);
    }
  }
}

function initializeStaffTabs() {
  if (!staffTabButtons.length || !staffTabPanels.length) {
    return;
  }

  const availableTabs = Array.from(staffTabButtons).map((button) => button.dataset.staffTab);
  const params = new URLSearchParams(window.location.search);
  const urlTab = params.get("tab");
  let savedTab = "";

  try {
    savedTab = localStorage.getItem(STAFF_TAB_STORAGE_KEY) || "";
  } catch (error) {
    savedTab = "";
  }

  const initialTab = availableTabs.includes(urlTab)
    ? urlTab
    : availableTabs.includes(savedTab)
      ? savedTab
      : "daily";

  setStaffActiveTab(initialTab, { skipStorage: false });

  staffTabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setStaffActiveTab(button.dataset.staffTab);
    });
  });
}

const staffInfo = document.getElementById("staffInfo");
const targetDate = document.getElementById("targetDate");
const loadButton = document.getElementById("loadButton");
const logoutButton = document.getElementById("logoutButton");
const openAdminPageButton = document.getElementById("openAdminPageButton");
const openChatworkPageButton = document.getElementById("openChatworkPageButton");
const staffAdminTopNav = document.getElementById("staffAdminTopNav");
const staffChatworkTopNav = document.getElementById("staffChatworkTopNav");
const staffOfficeScopeBar = document.getElementById("staffOfficeScopeBar");
const staffOfficeScopeSelect = document.getElementById("staffOfficeScopeSelect");
const staffOfficeScopeStatus = document.getElementById("staffOfficeScopeStatus");
const message = document.getElementById("message");
const billingSafetyNotice = document.getElementById("billingSafetyNotice");
const loadStaffDashboardButton = document.getElementById("loadStaffDashboardButton");
const staffDashboardResult = document.getElementById("staffDashboardResult");

setupSettingsMenuClose();

const comingList = document.getElementById("comingList");
const homeList = document.getElementById("homeList");
const offList = document.getElementById("offList");
const otherList = document.getElementById("otherList");

function openNativeDatePicker(inputElement) {
  if (!inputElement) {
    return;
  }

  try {
    inputElement.focus({ preventScroll: true });
  } catch (error) {
    inputElement.focus();
  }

  if (typeof inputElement.showPicker !== "function") {
    return;
  }

  try {
    inputElement.showPicker();
  } catch (error) {
    // showPicker はブラウザや入力状態によって拒否されることがあるため、通常の入力動作に任せる。
  }
}

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
const userScheduleUserSearchInput = document.getElementById("userScheduleUserSearchInput");
const clearUserScheduleUserSearchButton = document.getElementById("clearUserScheduleUserSearchButton");
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
const showAnnouncementsUserScheduleCheckbox = document.getElementById("showAnnouncementsUserScheduleCheckbox");
const userScheduleFilterBox = document.getElementById("userScheduleFilterBox");
const userScheduleFilterTitle = document.getElementById("userScheduleFilterTitle");
const userScheduleDisplayFilterControls = document.getElementById("userScheduleDisplayFilterControls");
const userScheduleBulkControls = document.getElementById("userScheduleBulkControls");
const userScheduleBulkRegisterButton = document.getElementById("userScheduleBulkRegisterButton");
const userScheduleBulkCancelButton = document.getElementById("userScheduleBulkCancelButton");
const userScheduleBulkStatusCheckboxes = [
  document.getElementById("userScheduleBulkStatusComing"),
  document.getElementById("userScheduleBulkStatusHome")
].filter(Boolean);
const userScheduleBulkTimeCheckboxes = [
  document.getElementById("userScheduleBulkTimeAll"),
  document.getElementById("userScheduleBulkTimeMorning"),
  document.getElementById("userScheduleBulkTimeAfternoon")
].filter(Boolean);
const userScheduleBulkSelectedCount = document.getElementById("userScheduleBulkSelectedCount");
const userScheduleBulkAlert = document.getElementById("userScheduleBulkAlert");
const refreshActiveUsersButton = document.getElementById("refreshActiveUsersButton");


// 教材・リンク集管理
const WORKSHOP_RESOURCES_DOC_PREFIX = "workshopResources_";
const loadWorkshopResourcesButton = document.getElementById("loadWorkshopResourcesButton");
const workshopResourceAdminArea = document.getElementById("workshopResourceAdminArea");
const workshopResourceList = document.getElementById("workshopResourceList");
const workshopResourceMessage = document.getElementById("workshopResourceMessage");
const workshopEditModeButton = document.getElementById("workshopEditModeButton");
const workshopPreviewModeButton = document.getElementById("workshopPreviewModeButton");
const workshopEditPanel = document.getElementById("workshopEditPanel");
const workshopPreviewPanel = document.getElementById("workshopPreviewPanel");
const workshopPreviewArea = document.getElementById("workshopPreviewArea");
const showWorkshopFormButton = document.getElementById("showWorkshopFormButton");
const toggleHiddenWorkshopsButton = document.getElementById("toggleHiddenWorkshopsButton");
const workshopFormPanel = document.getElementById("workshopFormPanel");
const workshopResourceFormTitle = document.getElementById("workshopResourceFormTitle");
const editingWorkshopResourceId = document.getElementById("editingWorkshopResourceId");
const workshopResourceActive = document.getElementById("workshopResourceActive");
const workshopResourceTitle = document.getElementById("workshopResourceTitle");
const workshopResourceScheduleText = document.getElementById("workshopResourceScheduleText");
const workshopResourceDescription = document.getElementById("workshopResourceDescription");
const workshopResourceLinksText = document.getElementById("workshopResourceLinksText");
const workshopResourceDeadlinesText = document.getElementById("workshopResourceDeadlinesText");
const workshopResourceCasesText = document.getElementById("workshopResourceCasesText");
const workshopCaseCardList = document.getElementById("workshopCaseCardList");
const addWorkshopCaseCardButton = document.getElementById("addWorkshopCaseCardButton");
const workshopCaseRawText = document.getElementById("workshopCaseRawText");
const buildWorkshopCaseDraftButton = document.getElementById("buildWorkshopCaseDraftButton");
const workshopCaseDraftPreview = document.getElementById("workshopCaseDraftPreview");
const saveWorkshopResourceButton = document.getElementById("saveWorkshopResourceButton");
const resetWorkshopResourceFormButton = document.getElementById("resetWorkshopResourceFormButton");

// 運用チェック
const operationCheckMonth = document.getElementById("operationCheckMonth");
const runOperationCheckButton = document.getElementById("runOperationCheckButton");
const operationCheckResult = document.getElementById("operationCheckResult");

// 支援員：週一報告管理
const prevStaffWeeklyReportWeekButton = document.getElementById("prevStaffWeeklyReportWeekButton");
const nextStaffWeeklyReportWeekButton = document.getElementById("nextStaffWeeklyReportWeekButton");
const staffWeeklyReportWeekLabel = document.getElementById("staffWeeklyReportWeekLabel");
const loadStaffWeeklyReportsButton = document.getElementById("loadStaffWeeklyReportsButton");
const staffWeeklyReportMessage = document.getElementById("staffWeeklyReportMessage");
const staffWeeklyReportSummary = document.getElementById("staffWeeklyReportSummary");
const submittedWeeklyReportList = document.getElementById("submittedWeeklyReportList");
const missingWeeklyReportList = document.getElementById("missingWeeklyReportList");
const buildWeeklyReportsTextButton = document.getElementById("buildWeeklyReportsTextButton");
const copyWeeklyReportsTextButton = document.getElementById("copyWeeklyReportsTextButton");
const weeklyReportsTextOutput = document.getElementById("weeklyReportsTextOutput");
const weeklyReportDetailPanel = document.getElementById("weeklyReportDetailPanel");
const weeklyReportDetailTitle = document.getElementById("weeklyReportDetailTitle");
const weeklyReportDetailMeta = document.getElementById("weeklyReportDetailMeta");
const weeklyReportDetailBody = document.getElementById("weeklyReportDetailBody");
const weeklyReportFeedbackEditor = document.querySelector(".weekly-report-feedback-editor");
const weeklyReportFeedbackInput = document.getElementById("weeklyReportFeedbackInput");
const saveWeeklyReportFeedbackButton = document.getElementById("saveWeeklyReportFeedbackButton");
const weeklyReportFeedbackMessage = document.getElementById("weeklyReportFeedbackMessage");

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
const announcementWorkshopId = document.getElementById("announcementWorkshopId");
const announcementVisibility = document.getElementById("announcementVisibility");
const announcementCategory = document.getElementById("announcementCategory");
const announcementTitle = document.getElementById("announcementTitle");
const announcementStartTime = document.getElementById("announcementStartTime");
const announcementEndTime = document.getElementById("announcementEndTime");
const announcementBody = document.getElementById("announcementBody");
const announcementWorkshopPicker = document.getElementById("announcementWorkshopPicker");
const announcementWorkshopList = document.getElementById("announcementWorkshopList");
const refreshAnnouncementWorkshopsButton = document.getElementById("refreshAnnouncementWorkshopsButton");
const saveAnnouncementButton = document.getElementById("saveAnnouncementButton");
const resetAnnouncementFormButton = document.getElementById("resetAnnouncementFormButton");
const announcementFormTitle = document.getElementById("announcementFormTitle");

let currentStaffData = null;
let selectedStaffOfficeContext = null;
let selectedAnnouncementDate = null;
let announcementsByDate = {};
let currentEditingAnnouncementId = "";
let currentUser = null;
let workshopResourcesLoaded = false;
let workshopResourcesCache = { schemaVersion: 2, workshops: [], cases: [], guides: [] };
let showInactiveWorkshops = false;
let workshopFormOpen = false;

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
let userScheduleUserSearchQuery = "";
let selectedUserScheduleId = "";
let selectedUserScheduleData = null;
let individualUserMonthlyScheduleCache = {};
let currentUserScheduleViewMode = "calendar";
let displayedUserScheduleYear = new Date().getFullYear();
let displayedUserScheduleMonth = new Date().getMonth();
let displayedUserScheduleWeekStartDate = getDefaultWeekStartForMonth(displayedUserScheduleYear, displayedUserScheduleMonth);
let currentEditingUserMonthlySchedule = null;
let selectedUserScheduleEditDate = "";
let shouldRefreshDailySchedulesAfterEdit = false;
let isUserScheduleBulkRegistrationActive = false;
let userScheduleBulkSelectedDateIds = new Set();
let userScheduleFilterStateBeforeBulkRegistration = null;
let userScheduleBulkAlertTimer = null;

// STEP3_FIXED_20260620_V31：週一報告管理用の状態
let displayedStaffWeeklyReportWeekStartDate = null;
let loadedStaffWeeklyReports = [];
let loadedStaffWeeklyMissingUsers = [];
let loadedStaffWeeklyReportWeekStartId = "";
let selectedStaffWeeklyReportId = "";
let staffWeeklyReportCache = {};

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

function parseDateId(dateId) {
  const [yyyy, mm, dd] = dateId.split("-").map(Number);
  return new Date(yyyy, mm - 1, dd);
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

function parseOptionalDateId(dateId) {
  if (typeof dateId !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateId)) {
    return null;
  }

  return parseDateId(dateId);
}

function getWeeklyReportGlobalStartWeekId() {
  return formatDateId(getWeekStartDate(parseDateId(WEEKLY_REPORT_START_WEEK)));
}

function getWeeklyReportStartWeekIdFromUserRecord(user) {
  const globalStartWeekId = getWeeklyReportGlobalStartWeekId();
  const explicitStartWeekDate = parseOptionalDateId(user?.weeklyReportStartWeek);

  if (explicitStartWeekDate) {
    const explicitStartWeekId = formatDateId(getWeekStartDate(explicitStartWeekDate));
    return explicitStartWeekId > globalStartWeekId ? explicitStartWeekId : globalStartWeekId;
  }

  return globalStartWeekId;
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

function shouldShowUserScheduleAnnouncements() {
  return showAnnouncementsUserScheduleCheckbox?.checked !== false;
}

function getUserScheduleAnnouncementsForDate(dateId) {
  if (!shouldShowUserScheduleAnnouncements()) {
    return [];
  }

  return sortAnnouncements(announcementsByDate[dateId] || [])
    .filter((announcement) => announcement.active !== false);
}

function appendUserScheduleAnnouncements(container, dateId, options = {}) {
  const dayAnnouncements = getUserScheduleAnnouncementsForDate(dateId);

  if (dayAnnouncements.length === 0) {
    return 0;
  }

  const listMode = options.listMode === true;
  const announcementArea = document.createElement("div");
  announcementArea.className = listMode
    ? "calendar-list-announcements staff-user-schedule-announcements"
    : "calendar-announcement-area staff-user-schedule-announcements";

  dayAnnouncements.forEach((announcement) => {
    const category = announcement.category || "notice";
    const title = announcement.title || "お知らせ";
    const item = document.createElement("div");
    item.className = `${listMode ? "calendar-list-announcement" : "calendar-announcement-title"} category-${category}`;
    item.textContent = `${getAnnouncementIcon(category)} ${listMode ? title : shortenText(title, options.maxLength || 8)}`;
    announcementArea.appendChild(item);
  });

  container.appendChild(announcementArea);
  return dayAnnouncements.length;
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
  updateUserScheduleBulkRegistrationUi();
}

function isUserScheduleUseOnlyMode() {
  return showOnlyUseDaysUserScheduleCheckbox?.checked === true;
}

function setUserScheduleBulkControlVisibility(element, isHidden) {
  if (!element) {
    return;
  }

  element.hidden = isHidden;
  element.classList.toggle("hidden", isHidden);
}

function hideUserScheduleBulkAlert() {
  if (userScheduleBulkAlertTimer) {
    window.clearTimeout(userScheduleBulkAlertTimer);
    userScheduleBulkAlertTimer = null;
  }

  if (!userScheduleBulkAlert) {
    return;
  }

  userScheduleBulkAlert.textContent = "";
  userScheduleBulkAlert.classList.remove("error", "success");
  setUserScheduleBulkControlVisibility(userScheduleBulkAlert, true);
}

function showUserScheduleBulkAlert(text, type = "error", autoHideMs = 0) {
  if (!userScheduleBulkAlert) {
    return;
  }

  if (userScheduleBulkAlertTimer) {
    window.clearTimeout(userScheduleBulkAlertTimer);
    userScheduleBulkAlertTimer = null;
  }

  userScheduleBulkAlert.textContent = text;
  userScheduleBulkAlert.classList.remove("error", "success");
  userScheduleBulkAlert.classList.add(type === "success" ? "success" : "error");
  setUserScheduleBulkControlVisibility(userScheduleBulkAlert, false);

  if (autoHideMs > 0) {
    userScheduleBulkAlertTimer = window.setTimeout(() => {
      hideUserScheduleBulkAlert();
    }, autoHideMs);
  }
}

function getCheckedUserScheduleBulkValue(checkboxes) {
  return checkboxes.find((checkbox) => checkbox.checked)?.value || "";
}

function clearUserScheduleBulkChoices() {
  [...userScheduleBulkStatusCheckboxes, ...userScheduleBulkTimeCheckboxes].forEach((checkbox) => {
    checkbox.checked = false;
  });
}

function updateUserScheduleBulkSelectedCount() {
  if (userScheduleBulkSelectedCount) {
    userScheduleBulkSelectedCount.textContent = `選択中：${userScheduleBulkSelectedDateIds.size}日`;
  }
}

function updateUserScheduleBulkRegistrationUi() {
  const canUseBulkRegistration = currentUserScheduleViewMode === "calendar" && Boolean(selectedUserScheduleId);

  if (userScheduleBulkRegisterButton) {
    setUserScheduleBulkControlVisibility(userScheduleBulkRegisterButton, !canUseBulkRegistration);
    userScheduleBulkRegisterButton.textContent = isUserScheduleBulkRegistrationActive ? "登録完了" : "一括登録";
  }

  if (userScheduleFilterTitle) {
    userScheduleFilterTitle.textContent = isUserScheduleBulkRegistrationActive
      ? "勤務する日を複数選択してください"
      : "表示する日";
  }

  setUserScheduleBulkControlVisibility(userScheduleDisplayFilterControls, isUserScheduleBulkRegistrationActive);
  setUserScheduleBulkControlVisibility(userScheduleBulkControls, !isUserScheduleBulkRegistrationActive);
  userScheduleFilterBox?.classList.toggle("bulk-registration-active", isUserScheduleBulkRegistrationActive);
  updateUserScheduleBulkSelectedCount();
}

async function startUserScheduleBulkRegistration() {
  if (currentUserScheduleViewMode !== "calendar" || !selectedUserScheduleId) {
    return;
  }

  userScheduleFilterStateBeforeBulkRegistration = {
    showOnlyUseDays: showOnlyUseDaysUserScheduleCheckbox?.checked === true,
    showAnnouncements: showAnnouncementsUserScheduleCheckbox?.checked !== false
  };

  if (showOnlyUseDaysUserScheduleCheckbox) {
    showOnlyUseDaysUserScheduleCheckbox.checked = false;
  }

  isUserScheduleBulkRegistrationActive = true;
  userScheduleBulkSelectedDateIds = new Set();
  clearUserScheduleBulkChoices();
  hideUserScheduleBulkAlert();
  updateUserScheduleBulkRegistrationUi();
  await loadUserMonthlyScheduleView();
}

function exitUserScheduleBulkRegistration(options = {}) {
  const restoreFilters = options.restoreFilters !== false;
  const hideAlert = options.hideAlert !== false;

  if (restoreFilters && userScheduleFilterStateBeforeBulkRegistration) {
    if (showOnlyUseDaysUserScheduleCheckbox) {
      showOnlyUseDaysUserScheduleCheckbox.checked = userScheduleFilterStateBeforeBulkRegistration.showOnlyUseDays;
    }
    if (showAnnouncementsUserScheduleCheckbox) {
      showAnnouncementsUserScheduleCheckbox.checked = userScheduleFilterStateBeforeBulkRegistration.showAnnouncements;
    }
  }

  isUserScheduleBulkRegistrationActive = false;
  userScheduleBulkSelectedDateIds = new Set();
  userScheduleFilterStateBeforeBulkRegistration = null;
  clearUserScheduleBulkChoices();
  if (hideAlert) {
    hideUserScheduleBulkAlert();
  }
  updateUserScheduleBulkRegistrationUi();
}

function toggleUserScheduleBulkDate(dateId, dayCell) {
  hideUserScheduleBulkAlert();

  if (userScheduleBulkSelectedDateIds.has(dateId)) {
    userScheduleBulkSelectedDateIds.delete(dateId);
    dayCell.classList.remove("bulk-registration-selected");
    dayCell.setAttribute("aria-pressed", "false");
  } else {
    userScheduleBulkSelectedDateIds.add(dateId);
    dayCell.classList.add("bulk-registration-selected");
    dayCell.setAttribute("aria-pressed", "true");
  }

  updateUserScheduleBulkSelectedCount();
}

function applyUserScheduleBulkDayState(dayCell, dateId) {
  if (!isUserScheduleBulkRegistrationActive) {
    return;
  }

  dayCell.classList.add("bulk-registration-selectable");
  dayCell.setAttribute("role", "button");
  dayCell.setAttribute("tabindex", "0");
  dayCell.setAttribute("aria-label", `${formatJapaneseDate(dateId)}を一括登録の対象にする`);
  dayCell.setAttribute("aria-pressed", userScheduleBulkSelectedDateIds.has(dateId) ? "true" : "false");
  dayCell.classList.toggle("bulk-registration-selected", userScheduleBulkSelectedDateIds.has(dateId));

  dayCell.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    toggleUserScheduleBulkDate(dateId, dayCell);
  });
}

function bindExclusiveUserScheduleBulkCheckboxes(checkboxes) {
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

      hideUserScheduleBulkAlert();

      if (userScheduleMessage) {
        userScheduleMessage.textContent = "";
      }
    });
  });
}

async function saveUserScheduleBulkRegistration() {
  const status = getCheckedUserScheduleBulkValue(userScheduleBulkStatusCheckboxes);
  const timeSlot = getCheckedUserScheduleBulkValue(userScheduleBulkTimeCheckboxes);

  if (!status) {
    userScheduleMessage.textContent = "通所または在宅を選択してください。";
    showUserScheduleBulkAlert(userScheduleMessage.textContent, "error");
    return;
  }

  if (!timeSlot) {
    userScheduleMessage.textContent = "終日・午前・午後のいずれかを選択してください。";
    showUserScheduleBulkAlert(userScheduleMessage.textContent, "error");
    return;
  }

  if (userScheduleBulkSelectedDateIds.size === 0) {
    userScheduleMessage.textContent = "勤務する日を1日以上選択してください。";
    showUserScheduleBulkAlert(userScheduleMessage.textContent, "error");
    return;
  }

  if (!selectedUserScheduleId) {
    userScheduleMessage.textContent = "一括登録する利用者を選択してください。";
    showUserScheduleBulkAlert(userScheduleMessage.textContent, "error");
    return;
  }

  const monthId = formatMonthId(displayedUserScheduleYear, displayedUserScheduleMonth);
  const selectedDateIds = [...userScheduleBulkSelectedDateIds].sort();

  try {
    userScheduleBulkRegisterButton.disabled = true;
    if (userScheduleBulkCancelButton) {
      userScheduleBulkCancelButton.disabled = true;
    }
    userScheduleBulkRegisterButton.textContent = "登録中...";

    const monthlySchedule = await getSelectedUserMonthlySchedule(displayedUserScheduleYear, displayedUserScheduleMonth);

    if (!monthlySchedule) {
      throw new Error("保存対象の月間予定が見つかりません。");
    }

    const days = { ...(monthlySchedule.days || {}) };
    const updatedAt = new Date().toISOString();

    selectedDateIds.forEach((dateId) => {
      days[dateId] = {
        status: status,
        timeSlot: timeSlot,
        memo: days[dateId]?.memo || "",
        updatedAt: updatedAt
      };
    });

    const selectedUser = selectedUserScheduleData || {
      id: monthlySchedule.userId || selectedUserScheduleId,
      name: monthlySchedule.userName || "名前未設定",
      email: monthlySchedule.userEmail || "",
      officeId: normalizeOfficeId(monthlySchedule.officeId || getCurrentOfficeId()),
      groupId: monthlySchedule.groupId || getCurrentGroupId()
    };
    const updatedMonthlySchedule = {
      id: monthlySchedule.id || `${selectedUser.id}_${monthId}`,
      _missingDoc: false,
      userId: selectedUser.id,
      userName: selectedUser.name || monthlySchedule.userName || "名前未設定",
      userEmail: selectedUser.email || monthlySchedule.userEmail || "",
      officeId: normalizeOfficeId(selectedUser.officeId || monthlySchedule.officeId || getCurrentOfficeId()),
      groupId: selectedUser.groupId || monthlySchedule.groupId || getCurrentGroupId(),
      month: monthId,
      days: days,
      workDayCount: calculateWorkDayCountFromDays(days)
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

    exitUserScheduleBulkRegistration({ restoreFilters: true, hideAlert: false });
    await loadUserMonthlyScheduleView();
    userScheduleMessage.textContent = `${updatedMonthlySchedule.userName}さんの予定を${selectedDateIds.length}日分、一括登録しました。勤務日数：${updatedMonthlySchedule.workDayCount}日`;
    showUserScheduleBulkAlert(`${selectedDateIds.length}日分の予定を一括登録しました。`, "success", 4500);
    console.log(`[Read節約] ${updatedMonthlySchedule.id} の予定を${selectedDateIds.length}日分、monthlySchedules 1 writeで一括登録しました。`);
  } catch (error) {
    console.error("支援員による利用者予定の一括登録エラー:", error);
    userScheduleMessage.textContent = `一括登録に失敗しました：${error.code || error.message}`;
    showUserScheduleBulkAlert(userScheduleMessage.textContent, "error");
  } finally {
    userScheduleBulkRegisterButton.disabled = false;
    if (userScheduleBulkCancelButton) {
      userScheduleBulkCancelButton.disabled = false;
    }
    updateUserScheduleBulkRegistrationUi();
  }
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

function isCurrentStaffGlobalAdmin() {
  return currentStaffData?.role === "admin" && currentStaffData?.accessScope === "global";
}

function getCurrentOfficeId() {
  if (isCurrentStaffGlobalAdmin() && selectedStaffOfficeContext?.officeId) {
    return normalizeOfficeId(selectedStaffOfficeContext.officeId);
  }

  return normalizeOfficeId(currentStaffData?.officeId);
}

function getCurrentGroupId() {
  if (isCurrentStaffGlobalAdmin() && selectedStaffOfficeContext?.organizationId) {
    return selectedStaffOfficeContext.organizationId;
  }

  return currentStaffData?.organizationId || currentStaffData?.groupId || DEFAULT_GROUP_ID;
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

function getStoredStaffOfficeId() {
  try {
    return sessionStorage.getItem(STAFF_OFFICE_SCOPE_STORAGE_KEY) || "";
  } catch (error) {
    return "";
  }
}

function storeStaffOfficeId(officeId) {
  try {
    sessionStorage.setItem(STAFF_OFFICE_SCOPE_STORAGE_KEY, officeId);
  } catch (error) {
    console.warn("操作対象事業所をこのタブに保存できませんでした。", error);
  }
}

function setStaffOfficeScopeUrl(officeId, options = {}) {
  const url = new URL(window.location.href);
  url.searchParams.set(STAFF_OFFICE_SCOPE_PARAM, officeId);

  const activeTab = document.querySelector("[data-staff-tab].active")?.dataset.staffTab;
  if (activeTab) {
    url.searchParams.set("tab", activeTab);
  }

  if (options.reload) {
    window.location.assign(url.toString());
    return;
  }

  window.history.replaceState({}, "", url.toString());
}

function renderStaffOfficeScope(offices) {
  if (!staffOfficeScopeBar || !staffOfficeScopeSelect || !staffOfficeScopeStatus) {
    return;
  }

  staffOfficeScopeSelect.replaceChildren();

  offices.forEach((office) => {
    const option = document.createElement("option");
    option.value = office.officeId;
    option.textContent = office.name;
    option.selected = office.officeId === selectedStaffOfficeContext?.officeId;
    staffOfficeScopeSelect.appendChild(option);
  });

  staffOfficeScopeSelect.disabled = offices.length < 2;
  staffOfficeScopeStatus.textContent = selectedStaffOfficeContext
    ? `${selectedStaffOfficeContext.name} のデータを表示・保存します。`
    : "操作できる事業所がありません。";
  staffOfficeScopeBar.classList.remove("hidden");
}

async function initializeGlobalAdminOfficeScope() {
  if (!isCurrentStaffGlobalAdmin()) {
    selectedStaffOfficeContext = null;
    staffOfficeScopeBar?.classList.add("hidden");
    return;
  }

  const profileOfficeId = normalizeOfficeId(currentStaffData?.officeId);
  const profileOrganizationId = currentStaffData?.organizationId
    || currentStaffData?.groupId
    || DEFAULT_GROUP_ID;
  selectedStaffOfficeContext = {
    officeId: profileOfficeId,
    organizationId: profileOrganizationId,
    name: currentStaffData?.officeName || currentStaffData?.officeDisplayName || ""
  };

  try {
    const result = await getOrganizationManagementData({});
    const officeMap = new Map();

    (Array.isArray(result?.data?.offices) ? result.data.offices : [])
      .filter((office) => office?.active === true)
      .forEach((office) => {
        const officeId = normalizeOfficeId(office.id);
        officeMap.set(officeId, {
          officeId,
          organizationId: office.organizationId || office.groupId || DEFAULT_GROUP_ID,
          name: String(office.name || officeId).trim() || officeId
        });
      });

    const offices = Array.from(officeMap.values())
      .sort((a, b) => a.name.localeCompare(b.name, "ja"));

    if (!offices.length) {
      renderStaffOfficeScope([]);
      return;
    }

    const urlOfficeId = new URLSearchParams(window.location.search).get(STAFF_OFFICE_SCOPE_PARAM) || "";
    const requestedOfficeId = normalizeOfficeId(urlOfficeId || getStoredStaffOfficeId() || profileOfficeId);
    selectedStaffOfficeContext = offices.find((office) => office.officeId === requestedOfficeId)
      || offices.find((office) => office.officeId === profileOfficeId)
      || offices[0];

    storeStaffOfficeId(selectedStaffOfficeContext.officeId);
    setStaffOfficeScopeUrl(selectedStaffOfficeContext.officeId);
    renderStaffOfficeScope(offices);

    staffOfficeScopeSelect.onchange = () => {
      const selectedOffice = offices.find((office) => office.officeId === staffOfficeScopeSelect.value);
      if (!selectedOffice || selectedOffice.officeId === selectedStaffOfficeContext?.officeId) {
        return;
      }

      storeStaffOfficeId(selectedOffice.officeId);
      setStaffOfficeScopeUrl(selectedOffice.officeId, { reload: true });
    };
  } catch (error) {
    console.error("操作対象事業所の読み込みに失敗しました。", error);

    if (staffOfficeScopeBar && staffOfficeScopeSelect && staffOfficeScopeStatus) {
      const option = document.createElement("option");
      option.value = profileOfficeId;
      option.textContent = currentStaffData?.officeName || currentStaffData?.officeDisplayName || profileOfficeId;
      staffOfficeScopeSelect.replaceChildren(option);
      staffOfficeScopeSelect.disabled = true;
      staffOfficeScopeStatus.textContent = "事業所一覧を読み込めないため、現在の所属事業所を表示します。";
      staffOfficeScopeBar.classList.remove("hidden");
    }
  }
}

function officeIdsMatch(a, b) {
  return normalizeOfficeId(a) === normalizeOfficeId(b);
}

function normalizeSortText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[ァ-ン]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .toLowerCase();
}

function cleanNameKana(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/\s+/g, " ").slice(0, 80);
}

function buildUserSortName(nameKana, fallbackText) {
  return normalizeSortText(nameKana || fallbackText).slice(0, 120);
}

function getUserSortKey(user) {
  return normalizeSortText(
    user?.sortName
    || user?.nameKana
    || user?.kana
    || user?._user?.sortName
    || user?._user?.nameKana
    || user?.name
    || user?.userName
    || user?.displayName
    || user?.email
    || user?.userEmail
    || user?.id
    || user?.uid
    || ""
  );
}

function compareUsersBySortName(a, b) {
  const sortDiff = getUserSortKey(a).localeCompare(getUserSortKey(b), "ja");

  if (sortDiff !== 0) {
    return sortDiff;
  }

  return (a?.name || a?.userName || a?.email || a?.id || "")
    .localeCompare(b?.name || b?.userName || b?.email || b?.id || "", "ja");
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

async function loadChatworkNavVisibility() {
  if (!staffChatworkTopNav || !openChatworkPageButton) {
    return;
  }

  staffChatworkTopNav.classList.add("hidden");

  try {
    const result = await getChatworkConsoleData({ includeConfig: false });
    const data = result?.data || {};
    const shouldShow = data.available === true || (data.canManage === true && data.attachable === true);
    staffChatworkTopNav.classList.toggle("hidden", !shouldShow);
  } catch (error) {
    console.warn("Chatwork連携ナビの確認に失敗しました。", error);
  }
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

function clearLists() {
  comingList.innerHTML = "";
  homeList.innerHTML = "";
  offList.innerHTML = "";
  otherList.innerHTML = "";
}

function getDailyTimeSlotSortValue(timeSlot) {
  return Object.prototype.hasOwnProperty.call(DAILY_TIME_SLOT_ORDER, timeSlot)
    ? DAILY_TIME_SLOT_ORDER[timeSlot]
    : 99;
}

function compareDailyScheduleListData(a, b) {
  const timeSlotDiff = getDailyTimeSlotSortValue(a.timeSlot || "") - getDailyTimeSlotSortValue(b.timeSlot || "");

  if (timeSlotDiff !== 0) {
    return timeSlotDiff;
  }

  return (a.userSortIndex || 0) - (b.userSortIndex || 0);
}

function renderDailyUserList(listElement, listDataItems) {
  [...listDataItems]
    .sort(compareDailyScheduleListData)
    .forEach((listData) => {
      addUserToList(listElement, listData);
    });
}

function addUserToList(listElement, data) {
  const li = document.createElement("li");
  li.className = "daily-user-list-item";

  const name = data.userName || data.userEmail || "名前不明";
  const timeSlot = data.timeSlot || "";
  const memo = data.memo || "";

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "daily-user-edit-button";
  editButton.setAttribute("aria-label", `${name}さんの予定を編集`);

  const nameText = document.createElement("span");
  nameText.className = "daily-user-edit-name";
  nameText.textContent = name;
  editButton.appendChild(nameText);

  if (timeSlot) {
    const timeSlotText = document.createElement("span");
    timeSlotText.className = "daily-user-edit-time";
    timeSlotText.dataset.timeSlot = timeSlot;
    timeSlotText.textContent = timeSlot;
    editButton.appendChild(timeSlotText);
  }

  editButton.addEventListener("click", () => {
    openDailyScheduleEditFromList(data);
  });

  li.appendChild(editButton);

  if (memo) {
    const memoText = document.createElement("div");
    memoText.textContent = `（${memo}）`;
    memoText.className = "staff-user-memo";
    li.appendChild(memoText);
  }

  listElement.appendChild(li);
}

function buildDailyScheduleUserFromListData(data) {
  return {
    id: data.userId,
    uid: data.userId,
    name: data.userName || data.userEmail || "名前未設定",
    email: data.userEmail || "",
    officeId: normalizeOfficeId(data.officeId || getCurrentOfficeId()),
    groupId: data.groupId || getCurrentGroupId(),
    active: true
  };
}

function buildMissingDailyMonthlySchedule(user, monthId) {
  return {
    id: `${user.id}_${monthId}`,
    _missingDoc: true,
    userId: user.id,
    userName: user.name || "名前未設定",
    userEmail: user.email || "",
    officeId: normalizeOfficeId(user.officeId || getCurrentOfficeId()),
    groupId: user.groupId || getCurrentGroupId(),
    month: monthId,
    days: {},
    workDayCount: 0
  };
}

async function openDailyScheduleEditFromList(data) {
  const dateId = data.dateId || targetDate?.value || "";

  if (!dateId || !data.userId) {
    return;
  }

  const { year, month } = getYearAndMonthFromDateId(dateId);
  const monthId = formatMonthId(year, month);
  const user = buildDailyScheduleUserFromListData(data);
  const cacheKey = `${user.id}_${monthId}`;
  const monthlySchedule = data.monthlySchedule
    || individualUserMonthlyScheduleCache[cacheKey]
    || buildMissingDailyMonthlySchedule(user, monthId);

  selectedUserScheduleId = user.id;
  selectedUserScheduleData = user;
  individualUserMonthlyScheduleCache[cacheKey] = monthlySchedule;
  currentEditingUserMonthlySchedule = monthlySchedule;
  shouldRefreshDailySchedulesAfterEdit = true;

  await openUserScheduleEditModal(dateId);

  if (userScheduleEditModal?.classList.contains("hidden")) {
    shouldRefreshDailySchedulesAfterEdit = false;
  }
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
  announcementWorkshopId.value = "";
  announcementFormTitle.textContent = "新規追加";
  announcementVisibility.value = "all";
  announcementCategory.value = "notice";
  announcementTitle.value = "";
  announcementStartTime.value = "";
  announcementEndTime.value = "";
  announcementBody.value = "";
  renderAnnouncementWorkshopPicker(false);

  if (selectedAnnouncementDate) {
    renderAnnouncementList(selectedAnnouncementDate);
  }
}

function getAnnouncementWorkshops() {
  return [...(workshopResourcesCache.workshops || [])]
    .filter((workshop) => workshop.active !== false)
    .sort((a, b) => {
      const orderA = typeof a.order === "number" ? a.order : 9999;
      const orderB = typeof b.order === "number" ? b.order : 9999;

      if (orderA !== orderB) {
        return orderA - orderB;
      }

      return (a.title || "").localeCompare(b.title || "", "ja");
    });
}

function normalizeAnnouncementTime(value) {
  const match = String(value || "").match(/^(\d{1,2}):([0-5]\d)$/);

  if (!match) {
    return "";
  }

  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

function extractTimeRangeFromWorkshop(workshop) {
  const sourceText = `${workshop?.scheduleText || ""} ${workshop?.description || ""}`;
  const match = sourceText.match(/(\d{1,2}:[0-5]\d)\s*[〜~\-－ー]\s*(\d{1,2}:[0-5]\d)/);

  if (!match) {
    return { startTime: "", endTime: "" };
  }

  return {
    startTime: normalizeAnnouncementTime(match[1]),
    endTime: normalizeAnnouncementTime(match[2])
  };
}

function buildAnnouncementBodyFromWorkshop(workshop) {
  const lines = [];
  const scheduleText = String(workshop?.scheduleText || "").trim();
  const description = String(workshop?.description || workshop?.summary || "").trim();
  const cases = getActiveCasesForWorkshop(workshop?.id || "");
  const activeLinks = (workshop?.links || []).filter((link) => link.active !== false);
  const activeDeadlines = (workshop?.deadlines || []).filter((deadline) => deadline.active !== false);

  if (scheduleText) {
    lines.push(`予定：${scheduleText}`);
  }

  if (description) {
    lines.push(description);
  }

  if (cases.length > 0) {
    const caseNames = cases
      .slice(0, 5)
      .map((caseItem) => `${caseItem.caseNo ? `案件No.${caseItem.caseNo} ` : ""}${caseItem.title || "無題の案件"}`)
      .join("、");
    const hiddenCount = cases.length - 5;
    lines.push(`関連案件：${caseNames}${hiddenCount > 0 ? `、ほか${hiddenCount}件` : ""}`);
  }

  if (activeDeadlines.length > 0) {
    lines.push(`提出期限：${activeDeadlines.length}件`);
  }

  if (activeLinks.length > 0) {
    lines.push(`教材・リンク：${activeLinks.length}件`);
  }

  return lines.join("\n");
}

function applyWorkshopToAnnouncementForm(workshopId) {
  const workshop = (workshopResourcesCache.workshops || []).find((item) => item.id === workshopId);

  if (!workshop) {
    return;
  }

  announcementWorkshopId.value = workshop.id;
  announcementCategory.value = "workshop";
  announcementTitle.value = workshop.title || "";
  announcementBody.value = buildAnnouncementBodyFromWorkshop(workshop);

  const { startTime, endTime } = extractTimeRangeFromWorkshop(workshop);

  if (startTime && Array.from(announcementStartTime.options).some((option) => option.value === startTime)) {
    announcementStartTime.value = startTime;
  }

  if (endTime && Array.from(announcementEndTime.options).some((option) => option.value === endTime)) {
    announcementEndTime.value = endTime;
  }

  renderAnnouncementWorkshopList();
}

function renderAnnouncementWorkshopList() {
  if (!announcementWorkshopList) {
    return;
  }

  const workshops = getAnnouncementWorkshops();
  announcementWorkshopList.innerHTML = "";

  if (!workshops.length) {
    announcementWorkshopList.innerHTML = `<div class="calendar-filter-empty">登録済みのワークショップがありません。先にワークショップ・案件管理で作成してください。</div>`;
    return;
  }

  workshops.forEach((workshop) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "announcement-workshop-card";
    card.dataset.workshopId = workshop.id;

    if (announcementWorkshopId.value === workshop.id) {
      card.classList.add("selected");
    }

    const title = document.createElement("div");
    title.className = "announcement-workshop-card-title";
    title.textContent = workshop.title || "無題のワークショップ";

    const meta = document.createElement("div");
    meta.className = "announcement-workshop-card-meta";
    const caseCount = getActiveCasesForWorkshop(workshop.id).length;
    const linkCount = (workshop.links || []).filter((item) => item.active !== false).length;
    const deadlineCount = (workshop.deadlines || []).filter((item) => item.active !== false).length;
    meta.textContent = `案件${caseCount}件 ／ 教材${linkCount}件 ／ 期限${deadlineCount}件`;

    const body = document.createElement("div");
    body.className = "announcement-workshop-card-body";
    body.textContent = workshop.scheduleText || workshop.description || "説明なし";

    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(body);
    card.addEventListener("click", () => {
      applyWorkshopToAnnouncementForm(workshop.id);
    });

    announcementWorkshopList.appendChild(card);
  });
}

async function renderAnnouncementWorkshopPicker(shouldLoad = true) {
  if (!announcementWorkshopPicker) {
    return;
  }

  const isWorkshop = announcementCategory.value === "workshop";
  announcementWorkshopPicker.classList.toggle("hidden", !isWorkshop);

  if (!isWorkshop) {
    if (announcementWorkshopId) {
      announcementWorkshopId.value = "";
    }
    return;
  }

  if (!shouldLoad) {
    renderAnnouncementWorkshopList();
    return;
  }

  if (announcementWorkshopList) {
    announcementWorkshopList.textContent = "ワークショップ一覧を読み込み中...";
  }

  try {
    await loadWorkshopResourcesForStaff();
    renderAnnouncementWorkshopList();
  } catch (error) {
    console.error("アナウンス用ワークショップ一覧読み込みエラー:", error);
    if (announcementWorkshopList) {
      announcementWorkshopList.innerHTML = `<div class="calendar-filter-empty">ワークショップ一覧の読み込みに失敗しました：${escapeStaffWeeklyText(error.code || error.message)}</div>`;
    }
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

function mergeAnnouncementLists(...lists) {
  const merged = [];

  lists.flat().filter(Boolean).forEach((announcement) => {
    const id = announcement.id || `${announcement.category || "notice"}_${announcement.title || ""}_${announcement.sourceWorkshopId || ""}`;
    const exists = merged.some((item) => {
      const itemId = item.id || `${item.category || "notice"}_${item.title || ""}_${item.sourceWorkshopId || ""}`;
      return itemId === id;
    });

    if (!exists) {
      merged.push(announcement);
    }
  });

  return sortAnnouncements(merged);
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
      announcementWorkshopId.value = announcement.sourceWorkshopId || "";
      announcementTitle.value = announcement.title || "";
      announcementStartTime.value = announcement.startTime || "";
      announcementEndTime.value = announcement.endTime || "";
      announcementBody.value = announcement.body || "";
      renderAnnouncementWorkshopPicker();

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

  const monthlySchedules = [];

  for (const candidateOfficeId of getCompatibleOfficeIds(officeId)) {
    const schedulesQuery = query(
      collection(db, "monthlySchedules"),
      where("groupId", "==", getCurrentGroupId()),
      where("officeId", "==", candidateOfficeId),
      where("month", "==", monthId)
    );

    const snapshot = await getDocs(schedulesQuery);

    snapshot.forEach((docSnap) => {
      if (monthlySchedules.some((item) => item.id === docSnap.id)) {
        return;
      }

      monthlySchedules.push({
        id: docSnap.id,
        ...docSnap.data(),
        officeId: normalizeOfficeId(docSnap.data().officeId || candidateOfficeId)
      });
    });
  }

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
    const dailyLists = {
      coming: [],
      home: [],
      off: [],
      other: []
    };

    monthlySchedules.forEach((monthlySchedule) => {
      if (monthlySchedule.userId) {
        scheduleMap[monthlySchedule.userId] = monthlySchedule;
      }
    });

    users.forEach((user, userIndex) => {
      const monthlySchedule = scheduleMap[user.id] || null;
      const dayData = monthlySchedule?.days?.[date] || null;
      const status = dayData?.status || "休み";

      const listData = {
        ...(dayData || {}),
        status: status,
        timeSlot: dayData?.timeSlot || "",
        memo: dayData?.memo || "",
        dateId: date,
        monthlySchedule: monthlySchedule,
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        officeId: normalizeOfficeId(user.officeId || getCurrentOfficeId()),
        groupId: user.groupId,
        userSortIndex: userIndex
      };

      if (status === "通所") {
        dailyLists.coming.push(listData);
      } else if (status === "在宅") {
        dailyLists.home.push(listData);
      } else if (status === "休み") {
        dailyLists.off.push(listData);
      } else {
        dailyLists.other.push(listData);
      }
    });

    renderDailyUserList(comingList, dailyLists.coming);
    renderDailyUserList(homeList, dailyLists.home);
    renderDailyUserList(offList, dailyLists.off);
    renderDailyUserList(otherList, dailyLists.other);

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
// 支援員：今日の概況
// ボタンを押した時だけ、既存の月間予定キャッシュと週一報告ステータス集約docを読む。
// ==============================
function getStaffDashboardUserLabel(user) {
  return user.name || user.email || user.id || "名前未設定";
}

function buildStaffDashboardNamePreview(names) {
  if (!names.length) {
    return "なし";
  }

  const visibleNames = names.slice(0, 6).map((name) => escapeStaffWeeklyText(name)).join("、");
  const hiddenCount = names.length - 6;
  return hiddenCount > 0 ? `${visibleNames}、ほか${hiddenCount}人` : visibleNames;
}

function summarizeStaffDashboardDailySchedules(users, monthlySchedules, dateId) {
  const scheduleMap = {};
  const summary = {
    coming: [],
    home: [],
    explicitOff: [],
    unfilled: [],
    other: []
  };

  monthlySchedules.forEach((monthlySchedule) => {
    if (monthlySchedule.userId) {
      scheduleMap[monthlySchedule.userId] = monthlySchedule;
    }
  });

  users.forEach((user) => {
    const monthlySchedule = scheduleMap[user.id] || null;
    const dayData = monthlySchedule?.days?.[dateId] || null;
    const status = dayData?.status || "";
    const label = getStaffDashboardUserLabel(user);

    if (status === "通所") {
      summary.coming.push(label);
    } else if (status === "在宅") {
      summary.home.push(label);
    } else if (status === "休み") {
      summary.explicitOff.push(label);
    } else if (!status) {
      summary.unfilled.push(label);
    } else {
      summary.other.push(`${label}（${status}）`);
    }
  });

  return summary;
}

function summarizeStaffDashboardWeeklyStatus(users, statusMap, weekStartId) {
  const summary = {
    submitted: [],
    notSubmitted: [],
    statusMissing: []
  };

  users.forEach((user) => {
    const statusData = statusMap[user.id] || null;
    const submittedWeeks = statusData?.submittedWeeks || {};
    const label = getStaffDashboardUserLabel(user);

    if (submittedWeeks[weekStartId] === true) {
      summary.submitted.push(label);
      return;
    }

    if (hasOwnField(submittedWeeks, weekStartId)) {
      summary.notSubmitted.push(label);
      return;
    }

    summary.statusMissing.push(label);
  });

  return summary;
}

function renderStaffDashboard({ dateId, users, dailySummary, weeklySummary, weeklyTargetLabel, weeklyStatusError }) {
  if (!staffDashboardResult) {
    return;
  }

  const weeklySubmittedCount = weeklySummary?.submitted.length || 0;
  const weeklyNotConfirmedCount = weeklySummary
    ? weeklySummary.notSubmitted.length + weeklySummary.statusMissing.length
    : 0;
  const weeklyStatusMissingCount = weeklySummary?.statusMissing.length || 0;

  const weeklyCard = weeklyStatusError
    ? `
        <div class="operation-check-card staff-dashboard-warning">
          <div class="operation-check-card-label">週一報告</div>
          <div class="operation-check-card-value">確認不可</div>
          <div class="operation-check-card-sub">${escapeStaffWeeklyText(weeklyStatusError)}</div>
        </div>
      `
    : `
        <div class="operation-check-card">
          <div class="operation-check-card-label">週一報告 提出済み</div>
          <div class="operation-check-card-value">${weeklySubmittedCount}人</div>
          <div class="operation-check-card-sub">${escapeStaffWeeklyText(weeklyTargetLabel)}</div>
        </div>
        <div class="operation-check-card">
          <div class="operation-check-card-label">週一報告 未提出・未確認</div>
          <div class="operation-check-card-value">${weeklyNotConfirmedCount}人</div>
          <div class="operation-check-card-sub">ステータス未整備 ${weeklyStatusMissingCount}人</div>
        </div>
      `;

  staffDashboardResult.innerHTML = `
    <div class="operation-check-grid staff-dashboard-grid">
      <div class="operation-check-card">
        <div class="operation-check-card-label">対象日</div>
        <div class="operation-check-card-value staff-dashboard-date">${escapeStaffWeeklyText(dateId)}</div>
        <div class="operation-check-card-sub">利用者 ${users.length}人</div>
      </div>
      <div class="operation-check-card">
        <div class="operation-check-card-label">通所</div>
        <div class="operation-check-card-value">${dailySummary.coming.length}人</div>
      </div>
      <div class="operation-check-card">
        <div class="operation-check-card-label">在宅</div>
        <div class="operation-check-card-value">${dailySummary.home.length}人</div>
      </div>
      <div class="operation-check-card">
        <div class="operation-check-card-label">休み入力</div>
        <div class="operation-check-card-value">${dailySummary.explicitOff.length}人</div>
      </div>
      <div class="operation-check-card">
        <div class="operation-check-card-label">予定未入力</div>
        <div class="operation-check-card-value">${dailySummary.unfilled.length}人</div>
        <div class="operation-check-card-sub">${buildStaffDashboardNamePreview(dailySummary.unfilled)}</div>
      </div>
      <div class="operation-check-card">
        <div class="operation-check-card-label">その他</div>
        <div class="operation-check-card-value">${dailySummary.other.length}人</div>
        <div class="operation-check-card-sub">${buildStaffDashboardNamePreview(dailySummary.other)}</div>
      </div>
      ${weeklyCard}
    </div>
    <div class="staff-dashboard-note">
      週一報告は提出ステータス基準です。
    </div>
  `;
}

async function loadStaffDashboard() {
  if (!staffDashboardResult) {
    return;
  }

  const dateId = getTodayDateId();

  if (loadStaffDashboardButton) {
    loadStaffDashboardButton.disabled = true;
    loadStaffDashboardButton.textContent = "集計中...";
  }

  staffDashboardResult.innerHTML = `<div class="operation-check-loading">今日の概況を集計中...</div>`;

  try {
    const { year, month } = getYearAndMonthFromDateId(dateId);
    const users = await loadActiveUsersForStaff();
    const monthlySchedules = await loadMonthlySchedulesForStaff(year, month);
    const dailySummary = summarizeStaffDashboardDailySchedules(users, monthlySchedules, dateId);
    const weeklyStartDate = getStaffWeeklyLastCompletedWeekStartDate();
    const weeklyStartId = formatDateId(weeklyStartDate);
    const weeklyTargetLabel = getStaffWeeklyReportRangeLabel(weeklyStartDate);
    const weeklyUsers = filterStaffWeeklyReportEligibleUsers(users, weeklyStartId);
    let weeklySummary = null;
    let weeklyStatusError = "";

    try {
      const statusMap = await loadWeeklyReportStatusMapForStaff(weeklyUsers);
      weeklySummary = summarizeStaffDashboardWeeklyStatus(weeklyUsers, statusMap, weeklyStartId);
    } catch (error) {
      console.warn("支援員ダッシュボード：週一報告ステータスの読み込みに失敗しました。", error);
      weeklyStatusError = error.code || error.message || "ステータスを確認できませんでした。";
    }

    renderStaffDashboard({
      dateId,
      users,
      dailySummary,
      weeklySummary,
      weeklyTargetLabel,
      weeklyStatusError
    });

    console.log("[Read節約] 支援員ダッシュボード：ボタン実行時のみ activeUsers / monthlySchedules / weeklyReportUserStatus を確認。週一報告本文は読みません。");
  } catch (error) {
    console.error("支援員ダッシュボード読み込みエラー:", error);
    staffDashboardResult.innerHTML = `<div class="calendar-filter-empty">${escapeStaffWeeklyText(`概況の集計に失敗しました：${error.code || error.message}`)}</div>`;
  } finally {
    if (loadStaffDashboardButton) {
      loadStaffDashboardButton.disabled = false;
      loadStaffDashboardButton.textContent = "今日の概況を表示";
    }
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

  const officeId = normalizeOfficeId(rawUser.officeId || fallbackOfficeId);

  // 移行中は officeId 未設定の利用者と旧IDの利用者も現在の事業所扱いにする。
  if (rawUser.officeId && !officeIdsMatch(rawUser.officeId, fallbackOfficeId)) {
    return null;
  }

  const nameKana = cleanNameKana(rawUser.nameKana || rawUser.kana || "");
  const fallbackName = rawUser.name || rawUser.displayName || rawUser.email || id;

  return {
    id: id,
    uid: id,
    name: rawUser.name || rawUser.displayName || rawUser.email || "名前未設定",
    nameKana,
    sortName: rawUser.sortName || buildUserSortName(nameKana, fallbackName),
    email: rawUser.email || "",
    officeId,
    groupId: rawUser.groupId || fallbackGroupId,
    active: rawUser.active !== false,
    weeklyReportStartWeek: getWeeklyReportStartWeekIdFromUserRecord(rawUser)
  };
}

function sortActiveUsers(users) {
  return [...users].sort(compareUsersBySortName);
}

async function loadActiveUsersFromSystemDoc() {
  const officeId = getCurrentOfficeId();
  const groupId = getCurrentGroupId();
  const perOfficeUsers = [];

  for (const candidateOfficeId of getCompatibleOfficeIds(officeId)) {
    const officeDocSnap = await getDoc(doc(db, "system", getActiveUsersDocId(candidateOfficeId)));

    if (officeDocSnap.exists() && Array.isArray(officeDocSnap.data()?.users)) {
      perOfficeUsers.push(...officeDocSnap.data().users);
    }
  }

  if (perOfficeUsers.length > 0) {
    return sortActiveUsers(
      perOfficeUsers
        .map((rawUser) => normalizeActiveUserRecord(rawUser, officeId, groupId))
        .filter(Boolean)
    );
  }

  // 本番の既存データとの互換用。事業所別doc導入前のキャッシュを読む。
  const docRef = doc(db, "system", ACTIVE_USERS_DOC_ID);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    throw new Error("事業所別の利用者一覧キャッシュが未作成です。『利用者一覧を更新』を押して作成してください。");
  }

  const data = docSnap.data() || {};
  let rawUsers = [];

  // 将来、複数事業所を1ドキュメント内で分ける場合にも対応。
  const officeBuckets = getCompatibleOfficeIds(officeId)
    .map((candidateOfficeId) => data.offices?.[candidateOfficeId]?.users)
    .filter(Array.isArray);

  if (officeBuckets.length > 0) {
    rawUsers = officeBuckets.flat();
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
    where("groupId", "==", groupId),
    where("officeId", "==", officeId),
    where("role", "==", "user"),
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

  await setDoc(doc(db, "system", getActiveUsersDocId(officeId)), {
    schemaVersion: 1,
    officeId: officeId,
    organizationId: groupId,
    groupId: groupId,
    users: sortedUsers,
    updatedAt: serverTimestamp(),
    updatedByUid: currentUser?.uid || "",
    updatedByName: currentStaffData?.name || currentUser?.email || ""
  }, { merge: true });

  activeUserListCache = sortedUsers;
  console.log(`[Read節約] system/${getActiveUsersDocId(officeId)} を更新しました。次回から利用者一覧は1 readです。`);
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

  const normalizedQuery = String(userScheduleUserSearchQuery || "")
    .normalize("NFKC")
    .toLocaleLowerCase("ja")
    .replace(/\s+/g, "");
  const visibleUsers = normalizedQuery
    ? users.filter((user) => {
      const searchableName = `${user.name || ""}${user.nameKana || ""}`
        .normalize("NFKC")
        .toLocaleLowerCase("ja")
        .replace(/\s+/g, "");
      return searchableName.includes(normalizedQuery);
    })
    : users;

  if (visibleUsers.length === 0) {
    userScheduleUserList.innerHTML = `<div class="staff-user-button-empty">${users.length > 0 ? "検索に一致する利用者がいません。" : "表示できる利用者がいません。"}</div>`;
    return;
  }

  visibleUsers.forEach((user) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "staff-user-name-button";
    button.dataset.userId = user.id;
    button.textContent = user.name || user.email || "名前未設定";

    if (selectedUserScheduleId === user.id) {
      button.classList.add("active");
    }

    button.addEventListener("click", async () => {
      if (isUserScheduleBulkRegistrationActive) {
        exitUserScheduleBulkRegistration({ restoreFilters: true });
      }

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

function setUserScheduleUserSearchQuery(value) {
  userScheduleUserSearchQuery = String(value || "");
  const hasQuery = Boolean(userScheduleUserSearchQuery.trim());

  if (clearUserScheduleUserSearchButton) {
    clearUserScheduleUserSearchButton.hidden = !hasQuery;
    clearUserScheduleUserSearchButton.classList.toggle("hidden", !hasQuery);
  }

  renderUserScheduleUserList(activeUserListCache || []);
}

function renderUserSchedulePlaceholder(text = "利用者を選択すると、月間予定が表示されます。") {
  if (!userScheduleCalendar) {
    return;
  }

  if (isUserScheduleBulkRegistrationActive) {
    exitUserScheduleBulkRegistration({ restoreFilters: true });
  }

  updateUserScheduleViewButtons();
  userScheduleCalendar.classList.remove("staff-user-schedule-list-view");
  userScheduleCalendar.classList.add("weekday-calendar");

  if (userScheduleCalendarWeekHeader) {
    userScheduleCalendarWeekHeader.classList.remove("hidden");
  }

  userScheduleCalendar.innerHTML = `<div class="calendar-filter-empty">${escapeStaffWeeklyText(text)}</div>`;

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
      ...docSnap.data(),
      officeId: normalizeOfficeId(docSnap.data().officeId || user.officeId || getCurrentOfficeId())
    };
  } else {
    // 予定データがまだ作られていない利用者でも、エラーにせず「予定未入力」として表示する。
    monthlySchedule = {
      id: monthlyScheduleId,
      _missingDoc: true,
      userId: user.id,
      userName: user.name || "名前未設定",
      userEmail: user.email || "",
      officeId: normalizeOfficeId(user.officeId || getCurrentOfficeId()),
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
    const [monthlySchedule] = await Promise.all([
      getSelectedUserMonthlySchedule(displayedUserScheduleYear, displayedUserScheduleMonth),
      shouldShowUserScheduleAnnouncements()
        ? loadMonthlyAnnouncements(displayedUserScheduleYear, displayedUserScheduleMonth)
        : Promise.resolve(null)
    ]);

    if (currentUserScheduleViewMode === "list") {
      renderUserMonthlyScheduleList(monthlySchedule, displayedUserScheduleYear, displayedUserScheduleMonth);
    } else if (currentUserScheduleViewMode === "week") {
      renderUserMonthlyScheduleWeek(monthlySchedule, displayedUserScheduleYear, displayedUserScheduleMonth);
    } else {
      renderUserMonthlyScheduleCalendar(monthlySchedule, displayedUserScheduleYear, displayedUserScheduleMonth);
    }

  } catch (error) {
    console.error("利用者別月間予定の読み込みエラー:", error);
    userScheduleCalendar.innerHTML = `<div class="calendar-filter-empty">${escapeStaffWeeklyText(`月間予定の読み込みに失敗しました：${error.code || error.message}`)}</div>`;
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

    appendUserScheduleAnnouncements(dayCell, dateId, { maxLength: 8 });

    applyUserScheduleBulkDayState(dayCell, dateId);

    dayCell.addEventListener("click", () => {
      if (isUserScheduleBulkRegistrationActive) {
        toggleUserScheduleBulkDate(dateId, dayCell);
        return;
      }

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

    appendUserScheduleAnnouncements(dayCell, dateId, { maxLength: 12 });

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
    const dateLabel = document.createElement("span");
    dateLabel.textContent = `${month + 1}月${day}日（${getJapaneseWeekday(targetDateObj)}）`;
    dateText.appendChild(dateLabel);

    if (dayData?.timeSlot) {
      const timeSlotText = document.createElement("span");
      timeSlotText.className = "calendar-list-time-slot";
      timeSlotText.textContent = `時間帯：${dayData.timeSlot}`;
      dateText.appendChild(timeSlotText);
    }
    header.appendChild(dateText);

    const statusText = document.createElement("div");
    statusText.className = `staff-user-schedule-list-status ${toneClass}`.trim();
    statusText.textContent = dayData?.status || "休み";
    header.appendChild(statusText);

    dayItem.appendChild(header);

    if (dayData?.memo) {
      const detail = document.createElement("div");
      detail.className = "staff-user-schedule-list-detail";

      const memo = document.createElement("div");
      memo.className = "staff-user-schedule-list-memo";
      memo.textContent = `メモ：${dayData.memo}`;
      detail.appendChild(memo);

      dayItem.appendChild(detail);
    }

    appendUserScheduleAnnouncements(dayItem, dateId, { listMode: true });

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
// 支援員：週一報告 管理
// 週ごとにキャッシュし、戻った週は再読み込みしない。
// 提出済みの名前を押すと詳細表示・支援員返信ができる。
// ==============================
function parseStaffWeeklyDateId(dateId) {
  const [year, month, day] = dateId.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addStaffWeeklyDays(date, days) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  next.setHours(0, 0, 0, 0);
  return next;
}

function getStaffWeeklyWeekStartDate(date) {
  const weekStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = weekStart.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  weekStart.setDate(weekStart.getDate() + diff);
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
}

function getStaffWeeklyLastCompletedWeekStartDate() {
  const today = new Date();
  const thisWeekStart = getStaffWeeklyWeekStartDate(today);
  return addStaffWeeklyDays(thisWeekStart, -7);
}

function getStaffWeeklyReportId(userId, weekStartDateId) {
  return `${userId}_${weekStartDateId}`;
}

function getWeeklyReportStatusDocRef(userId) {
  return doc(db, WEEKLY_REPORT_STATUS_COLLECTION, userId);
}

function hasOwnField(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function isStaffWeeklyReportUserEligible(user, weekStartId) {
  const startWeekId = user?.weeklyReportStartWeek || getWeeklyReportGlobalStartWeekId();
  return weekStartId >= startWeekId;
}

function filterStaffWeeklyReportEligibleUsers(users, weekStartId) {
  return users.filter((user) => isStaffWeeklyReportUserEligible(user, weekStartId));
}

function hasStaffFeedbackForReport(report) {
  return Boolean(report?.staffFeedbackText || report?.staffFeedbackVersion);
}

function isNoHomeWorkReport(report) {
  return Boolean(
    report?.noHomeWork === true
    || report?.reportType === NO_HOME_WORK_REPORT_TYPE
    || report?.activityTime === NO_HOME_WORK_VALUE
  );
}

function isStaffReplyNotRequired(report) {
  return Boolean(isNoHomeWorkReport(report) || report?.staffReplyRequired === false);
}

async function loadWeeklyReportStatusMapForStaff(users) {
  if (!users.length) {
    return {};
  }

  const targetUserIds = new Set(users.map((user) => user.id));
  const statusMap = {};

  for (const candidateOfficeId of getCompatibleOfficeIds()) {
    const statusQuery = query(
      collection(db, WEEKLY_REPORT_STATUS_COLLECTION),
      where("groupId", "==", getCurrentGroupId()),
      where("officeId", "==", candidateOfficeId)
    );
    const snapshot = await getDocs(statusQuery);

    snapshot.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const userId = data.userId || docSnap.id;

      if (targetUserIds.has(userId)) {
        statusMap[userId] = {
          ...data,
          officeId: normalizeOfficeId(data.officeId || candidateOfficeId)
        };
      }
    });
  }

  return statusMap;
}

function buildStaffWeeklyReportStub(user, statusData, weekStartId, weekEndId) {
  const feedbackVersion = statusData?.feedbackVersions?.[weekStartId] || "";
  const feedbackReadVersion = statusData?.feedbackReadVersions?.[weekStartId] || "";
  const noHomeWork = statusData?.noHomeWorkWeeks?.[weekStartId] === true;
  const staffReplyRequired = noHomeWork
    ? false
    : statusData?.staffReplyRequiredWeeks?.[weekStartId] !== false;

  return {
    id: getStaffWeeklyReportId(user.id, weekStartId),
    userId: user.id,
    _user: user,
    _statusOnly: true,
    submitted: true,
    weekStartDate: weekStartId,
    weekEndDate: weekEndId,
    userName: user.name || user.email || "名前未設定",
    userEmail: user.email || "",
    noHomeWork,
    reportType: noHomeWork ? NO_HOME_WORK_REPORT_TYPE : "",
    staffReplyRequired,
    activityTime: noHomeWork ? NO_HOME_WORK_VALUE : "",
    workActivityText: noHomeWork ? NO_HOME_WORK_VALUE : "",
    staffFeedbackVersion: feedbackVersion,
    staffFeedbackReadVersion: feedbackReadVersion,
    feedbackReadByUser: Boolean(feedbackVersion && feedbackReadVersion === feedbackVersion)
  };
}

async function markWeeklyReportFeedbackInStatusCache(report, feedbackVersion) {
  const userId = report?.userId;
  const weekStartDate = report?.weekStartDate || loadedStaffWeeklyReportWeekStartId || "";

  if (!userId || !weekStartDate || !feedbackVersion) {
    return;
  }

  try {
    await setDoc(getWeeklyReportStatusDocRef(userId), {
      userId,
      userName: report.userName || report._user?.name || "",
      userEmail: report.userEmail || report._user?.email || "",
      officeId: normalizeOfficeId(report.officeId || getCurrentOfficeId()),
      groupId: report.groupId || getCurrentGroupId(),
      schemaVersion: WEEKLY_REPORT_STATUS_SCHEMA_VERSION,
      submittedWeeks: {
        [weekStartDate]: true
      },
      feedbackVersions: {
        [weekStartDate]: feedbackVersion
      },
      feedbackReadVersions: {
        [weekStartDate]: ""
      },
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.warn("週一報告ステータス集約docの更新に失敗しました。返信本文の保存は完了しています。", error);
  }
}

function formatStaffWeeklyJapaneseDate(dateId) {
  const date = parseStaffWeeklyDateId(dateId);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function getStaffWeeklyReportRangeLabel(weekStartDate) {
  const startId = formatDateId(weekStartDate);
  const endId = formatDateId(addStaffWeeklyDays(weekStartDate, 4));
  return `${formatStaffWeeklyJapaneseDate(startId)}〜${formatStaffWeeklyJapaneseDate(endId)}`;
}

function escapeStaffWeeklyText(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shortenStaffWeeklyText(text, maxLength = 80) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}…`;
}

function setStaffWeeklyReportMessage(text, color = "#333") {
  if (!staffWeeklyReportMessage) {
    return;
  }
  staffWeeklyReportMessage.style.color = color;
  staffWeeklyReportMessage.textContent = text;
}

function setWeeklyReportFeedbackMessage(text, color = "#333") {
  if (!weeklyReportFeedbackMessage) {
    return;
  }
  weeklyReportFeedbackMessage.style.color = color;
  weeklyReportFeedbackMessage.textContent = text;
}

function getStaffWeeklyCacheKey() {
  if (!displayedStaffWeeklyReportWeekStartDate) {
    displayedStaffWeeklyReportWeekStartDate = getStaffWeeklyLastCompletedWeekStartDate();
  }
  return formatDateId(displayedStaffWeeklyReportWeekStartDate);
}

function updateStaffWeeklyReportWeekHeader() {
  if (!displayedStaffWeeklyReportWeekStartDate) {
    displayedStaffWeeklyReportWeekStartDate = getStaffWeeklyLastCompletedWeekStartDate();
  }

  if (staffWeeklyReportWeekLabel) {
    staffWeeklyReportWeekLabel.textContent = getStaffWeeklyReportRangeLabel(displayedStaffWeeklyReportWeekStartDate);
  }

  if (nextStaffWeeklyReportWeekButton) {
    const lastWeekStart = getStaffWeeklyLastCompletedWeekStartDate();
    nextStaffWeeklyReportWeekButton.disabled = displayedStaffWeeklyReportWeekStartDate >= lastWeekStart;
  }
}

function hideStaffWeeklyReportDetail() {
  selectedStaffWeeklyReportId = "";
  if (weeklyReportDetailPanel) {
    weeklyReportDetailPanel.classList.add("hidden");
  }
  if (weeklyReportFeedbackEditor) {
    weeklyReportFeedbackEditor.classList.remove("weekly-report-feedback-editor-disabled");
    weeklyReportFeedbackEditor.classList.remove("hidden");
  }
  if (weeklyReportFeedbackInput) {
    weeklyReportFeedbackInput.value = "";
    weeklyReportFeedbackInput.disabled = false;
  }
  if (saveWeeklyReportFeedbackButton) {
    saveWeeklyReportFeedbackButton.disabled = false;
    saveWeeklyReportFeedbackButton.textContent = "返信を保存して利用者に表示";
  }
  setWeeklyReportFeedbackMessage("");
}

function resetStaffWeeklyReportDisplay(message = "『この週の提出状況を表示』を押すと、提出済み・未提出を確認できます。") {
  loadedStaffWeeklyReports = [];
  loadedStaffWeeklyMissingUsers = [];
  loadedStaffWeeklyReportWeekStartId = "";
  hideStaffWeeklyReportDetail();

  if (staffWeeklyReportSummary) {
    staffWeeklyReportSummary.textContent = message;
  }

  if (submittedWeeklyReportList) {
    submittedWeeklyReportList.innerHTML = "まだ読み込んでいません。";
  }

  if (missingWeeklyReportList) {
    missingWeeklyReportList.innerHTML = "まだ読み込んでいません。";
  }

  if (weeklyReportsTextOutput) {
    weeklyReportsTextOutput.value = "";
  }

  setStaffWeeklyReportMessage("");
}

function isStaffFeedbackUnreadByUser(report) {
  if (!report || !report.staffFeedbackVersion) {
    return false;
  }

  if (report.feedbackReadByUser === true) {
    return false;
  }

  return Boolean(
    report.staffFeedbackReadVersion !== report.staffFeedbackVersion
  );
}

function getFeedbackStatusText(report) {
  if (isStaffReplyNotRequired(report)) {
    return "返信不要";
  }
  if (!hasStaffFeedbackForReport(report)) {
    return "返信なし";
  }
  if (isStaffFeedbackUnreadByUser(report)) {
    return "返信未確認";
  }
  return "返信確認済み";
}

function getLoadedStaffWeeklyReportById(reportId) {
  return loadedStaffWeeklyReports.find((report) => report.id === reportId) || null;
}

function renderSubmittedWeeklyReports(reports) {
  if (!submittedWeeklyReportList) {
    return;
  }

  submittedWeeklyReportList.innerHTML = "";

  if (reports.length === 0) {
    submittedWeeklyReportList.innerHTML = `<div class="weekly-report-admin-empty">提出済みの週一報告はありません。</div>`;
    return;
  }

  reports.forEach((report) => {
    const noHomeWorkReport = isNoHomeWorkReport(report);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "weekly-report-admin-card submitted-weekly-report-card weekly-report-admin-name-button";
    button.dataset.reportId = report.id;

    if (selectedStaffWeeklyReportId === report.id) {
      button.classList.add("active");
    }

    const title = document.createElement("div");
    title.className = "weekly-report-admin-card-title";
    title.textContent = report.userName || report._user?.name || report.userEmail || "名前未設定";

    const meta = document.createElement("div");
    meta.className = "weekly-report-admin-meta";
    meta.textContent = noHomeWorkReport
      ? "報告内容：在宅していない"
      : report._statusOnly
        ? "詳細未読込 ／ 名前を押すと本文を読み込みます"
        : `自己採点：${report.selfScore || "未入力"} ／ 活動時間：${report.activityTime || "未入力"}`;

    const feedback = document.createElement("div");
    feedback.className = `weekly-report-feedback-status ${isStaffReplyNotRequired(report) ? "no-reply" : isStaffFeedbackUnreadByUser(report) ? "unread" : hasStaffFeedbackForReport(report) ? "read" : "none"}`;
    feedback.textContent = getFeedbackStatusText(report);

    const body = document.createElement("div");
    body.className = "weekly-report-admin-preview";
    body.textContent = noHomeWorkReport
      ? "先週は在宅していないため、詳細入力は省略されています。"
      : report._statusOnly
        ? "本文はまだ読み込んでいません。"
        : shortenStaffWeeklyText(report.workActivityText || "作業・活動内容の記入なし", 100);

    button.appendChild(title);
    button.appendChild(meta);
    button.appendChild(feedback);
    button.appendChild(body);
    button.addEventListener("click", () => {
      openStaffWeeklyReportDetail(report.id);
    });

    submittedWeeklyReportList.appendChild(button);
  });
}

function renderMissingWeeklyReports(users) {
  if (!missingWeeklyReportList) {
    return;
  }

  missingWeeklyReportList.innerHTML = "";

  if (users.length === 0) {
    missingWeeklyReportList.innerHTML = `<div class="weekly-report-admin-empty weekly-report-admin-ok">未提出の利用者はいません。</div>`;
    return;
  }

  users.forEach((user) => {
    const item = document.createElement("div");
    item.className = "weekly-report-missing-user-item";
    item.textContent = user.name || user.email || user.id || "名前未設定";
    missingWeeklyReportList.appendChild(item);
  });
}

function renderStaffWeeklyReportResult(fromCache = false) {
  const submittedCount = loadedStaffWeeklyReports.length;
  const missingCount = loadedStaffWeeklyMissingUsers.length;
  const targetLabel = displayedStaffWeeklyReportWeekStartDate
    ? getStaffWeeklyReportRangeLabel(displayedStaffWeeklyReportWeekStartDate)
    : "対象週未設定";
  const feedbackCount = loadedStaffWeeklyReports.filter(hasStaffFeedbackForReport).length;
  const unreadFeedbackCount = loadedStaffWeeklyReports.filter(isStaffFeedbackUnreadByUser).length;

  if (staffWeeklyReportSummary) {
    staffWeeklyReportSummary.innerHTML = `
      <div class="weekly-report-admin-summary-grid">
        <div class="operation-check-card">
          <div class="operation-check-card-label">対象週</div>
          <div class="operation-check-card-value weekly-report-summary-week">${escapeStaffWeeklyText(targetLabel)}</div>
        </div>
        <div class="operation-check-card">
          <div class="operation-check-card-label">提出済み</div>
          <div class="operation-check-card-value">${submittedCount}人</div>
        </div>
        <div class="operation-check-card">
          <div class="operation-check-card-label">未提出</div>
          <div class="operation-check-card-value">${missingCount}人</div>
        </div>
        <div class="operation-check-card">
          <div class="operation-check-card-label">返信</div>
          <div class="operation-check-card-value">${feedbackCount}件</div>
          <div class="operation-check-card-sub">未確認 ${unreadFeedbackCount}件 ${fromCache ? "／キャッシュ" : ""}</div>
        </div>
      </div>
    `;
  }

  renderSubmittedWeeklyReports(loadedStaffWeeklyReports);
  renderMissingWeeklyReports(loadedStaffWeeklyMissingUsers);

  if (selectedStaffWeeklyReportId) {
    const selected = getLoadedStaffWeeklyReportById(selectedStaffWeeklyReportId);
    if (selected) {
      renderStaffWeeklyReportDetail(selected);
    } else {
      hideStaffWeeklyReportDetail();
    }
  }
}

function applyStaffWeeklyReportCache(weekStartId) {
  const cache = staffWeeklyReportCache[weekStartId];
  if (!cache) {
    return false;
  }

  loadedStaffWeeklyReports = cache.submittedReports;
  loadedStaffWeeklyMissingUsers = cache.missingUsers;
  loadedStaffWeeklyReportWeekStartId = weekStartId;
  renderStaffWeeklyReportResult(true);
  setStaffWeeklyReportMessage("この週は読み込み済みのため、キャッシュから表示しました。", "green");
  console.log(`[Read節約] 週一報告管理：${weekStartId} はキャッシュから表示。追加readなし。`);
  return true;
}

async function loadStaffWeeklyReports() {
  if (!displayedStaffWeeklyReportWeekStartDate) {
    displayedStaffWeeklyReportWeekStartDate = getStaffWeeklyLastCompletedWeekStartDate();
  }

  const weekStartId = formatDateId(displayedStaffWeeklyReportWeekStartDate);
  const weekEndId = formatDateId(addStaffWeeklyDays(displayedStaffWeeklyReportWeekStartDate, 4));

  if (applyStaffWeeklyReportCache(weekStartId)) {
    return;
  }

  if (loadStaffWeeklyReportsButton) {
    loadStaffWeeklyReportsButton.disabled = true;
    loadStaffWeeklyReportsButton.textContent = "読み込み中...";
  }

  if (staffWeeklyReportSummary) {
    staffWeeklyReportSummary.textContent = "週一報告の提出状況を読み込み中...";
  }

  if (submittedWeeklyReportList) {
    submittedWeeklyReportList.textContent = "読み込み中...";
  }

  if (missingWeeklyReportList) {
    missingWeeklyReportList.textContent = "読み込み中...";
  }

  if (weeklyReportsTextOutput) {
    weeklyReportsTextOutput.value = "";
  }
  hideStaffWeeklyReportDetail();

  try {
    const allUsers = await loadActiveUsersForStaff();
    const users = filterStaffWeeklyReportEligibleUsers(allUsers, weekStartId);
    const excludedUserCount = allUsers.length - users.length;
    let statusMap = {};
    try {
      statusMap = await loadWeeklyReportStatusMapForStaff(users);
    } catch (statusError) {
      console.warn("週一報告ステータスdocの読み込みに失敗したため、従来方式で確認します。", statusError);
    }
    const submittedReports = [];
    const missingUsers = [];
    let fallbackReportReads = 0;

    for (const user of users) {
      const statusData = statusMap[user.id] || null;
      const submittedWeeks = statusData?.submittedWeeks || {};

      if (submittedWeeks[weekStartId] === true) {
        submittedReports.push(buildStaffWeeklyReportStub(user, statusData, weekStartId, weekEndId));
        continue;
      }

      if (hasOwnField(submittedWeeks, weekStartId)) {
        missingUsers.push(user);
        continue;
      }

      const reportId = getStaffWeeklyReportId(user.id, weekStartId);
      const reportRef = doc(db, "weeklyReports", reportId);
      const reportSnap = await getDoc(reportRef);
      fallbackReportReads++;

      if (reportSnap.exists() && reportSnap.data()?.submitted === true) {
        const data = reportSnap.data();
        submittedReports.push({
          id: reportSnap.id,
          _user: user,
          ...data,
          weekStartDate: data.weekStartDate || weekStartId,
          weekEndDate: data.weekEndDate || weekEndId,
          userName: data.userName || user.name || user.email || "名前未設定",
          userEmail: data.userEmail || user.email || ""
        });
      } else {
        missingUsers.push(user);
      }
    }

    submittedReports.sort(compareUsersBySortName);
    missingUsers.sort(compareUsersBySortName);

    loadedStaffWeeklyReports = submittedReports;
    loadedStaffWeeklyMissingUsers = missingUsers;
    loadedStaffWeeklyReportWeekStartId = weekStartId;
    staffWeeklyReportCache[weekStartId] = { submittedReports, missingUsers };

    renderStaffWeeklyReportResult(false);
    setStaffWeeklyReportMessage(
      `提出状況を表示しました。提出済み${submittedReports.length}人、未提出${missingUsers.length}人${excludedUserCount ? `、登録週前の対象外${excludedUserCount}人` : ""}。`,
      "green"
    );
    console.log(`[Read節約] 週一報告管理：weeklyReportUserStatusを優先して提出状況を確認。ステータス未整備の${fallbackReportReads}件だけweeklyReportsを確認しました。以後この週はキャッシュ表示。`);
  } catch (error) {
    console.error("週一報告管理 読み込みエラー:", error);
    if (staffWeeklyReportSummary) {
      staffWeeklyReportSummary.textContent = `週一報告の読み込みに失敗しました：${error.code || error.message}`;
    }
    if (submittedWeeklyReportList) {
      submittedWeeklyReportList.innerHTML = "";
    }
    if (missingWeeklyReportList) {
      missingWeeklyReportList.innerHTML = "";
    }
    setStaffWeeklyReportMessage(`読み込みに失敗しました：${error.code || error.message}`, "red");
  } finally {
    if (loadStaffWeeklyReportsButton) {
      loadStaffWeeklyReportsButton.disabled = false;
      loadStaffWeeklyReportsButton.textContent = "この週の提出状況を表示";
    }
  }
}

function hasMeaningfulNoActivityReason(report) {
  const reason = String(report?.noActivityReason || "").trim();
  return Boolean(reason && reason !== "1");
}

function buildReadableWeeklyReportItem(label, value, options = {}) {
  const text = String(value || "").trim();
  if (!text && options.hideIfEmpty) {
    return "";
  }

  const displayValue = text || "未入力";
  const inlineClass = options.inline ? " inline" : "";

  return `
    <div class="weekly-report-readable-item${inlineClass}">
      <div class="weekly-report-readable-label">・${escapeStaffWeeklyText(label)}</div>
      <div class="weekly-report-readable-value">${escapeStaffWeeklyText(displayValue)}</div>
    </div>
  `;
}

function buildWeeklyReportReadableHtml(report) {
  const items = [];

  if (isNoHomeWorkReport(report)) {
    items.push(buildReadableWeeklyReportItem("報告内容", NO_HOME_WORK_VALUE, { inline: true }));
    return `<div class="weekly-report-readable-card">${items.join("")}</div>`;
  }

  items.push(buildReadableWeeklyReportItem("作業・活動", report.workActivityText));
  items.push(buildReadableWeeklyReportItem("活動時間", report.activityTime, { inline: true }));

  if (hasMeaningfulNoActivityReason(report)) {
    items.push(buildReadableWeeklyReportItem("活動なし理由", report.noActivityReason));
  }

  items.push(buildReadableWeeklyReportItem("体調・生活リズム", report.healthStatus));
  items.push(buildReadableWeeklyReportItem("生活リズム詳細", report.lifeRhythm));
  items.push(buildReadableWeeklyReportItem("自己採点", report.selfScore ? `${report.selfScore}/5` : "", { inline: true }));
  items.push(buildReadableWeeklyReportItem("困ったこと・しんどかったこと", report.troubleText));
  items.push(buildReadableWeeklyReportItem("できたこと・がんばれたこと", report.goodText));
  items.push(buildReadableWeeklyReportItem("今週意識したいこと", report.nextWeekText));
  items.push(buildReadableWeeklyReportItem("その他", report.otherText, { hideIfEmpty: true }));

  return `<div class="weekly-report-readable-card">${items.join("")}</div>`;
}

function buildStaffWeeklyReportDetailHtml(report) {
  return buildWeeklyReportReadableHtml(report);
}

function replaceLoadedStaffWeeklyReport(updatedReport) {
  loadedStaffWeeklyReports = loadedStaffWeeklyReports.map((item) => item.id === updatedReport.id ? updatedReport : item);

  if (loadedStaffWeeklyReportWeekStartId && staffWeeklyReportCache[loadedStaffWeeklyReportWeekStartId]) {
    staffWeeklyReportCache[loadedStaffWeeklyReportWeekStartId].submittedReports = loadedStaffWeeklyReports;
  }
}

async function loadStaffWeeklyReportDetailById(reportId) {
  const existingReport = getLoadedStaffWeeklyReportById(reportId);

  if (!existingReport) {
    return null;
  }

  if (!existingReport._statusOnly) {
    return existingReport;
  }

  setStaffWeeklyReportMessage("週一報告本文を読み込み中...", "#333");

  const reportSnap = await getDoc(doc(db, "weeklyReports", reportId));

  if (!reportSnap.exists() || reportSnap.data()?.submitted !== true) {
    setStaffWeeklyReportMessage("提出済みステータスはありますが、週一報告本文が見つかりませんでした。", "red");
    return null;
  }

  const data = reportSnap.data();
  const detailedReport = {
    ...existingReport,
    ...data,
    id: reportSnap.id,
    _statusOnly: false,
    _user: existingReport._user,
    weekStartDate: data.weekStartDate || existingReport.weekStartDate,
    weekEndDate: data.weekEndDate || existingReport.weekEndDate,
    userName: data.userName || existingReport.userName || existingReport._user?.name || "名前未設定",
    userEmail: data.userEmail || existingReport.userEmail || existingReport._user?.email || ""
  };

  replaceLoadedStaffWeeklyReport(detailedReport);
  console.log(`[Read節約] 週一報告詳細：${reportId} は名前を押した時だけ1 readしました。`);
  return detailedReport;
}

function renderStaffWeeklyReportDetail(report) {
  if (!weeklyReportDetailPanel || !weeklyReportDetailBody) {
    return;
  }

  selectedStaffWeeklyReportId = report.id;
  weeklyReportDetailPanel.classList.remove("hidden");

  if (weeklyReportDetailTitle) {
    weeklyReportDetailTitle.textContent = `${report.userName || report.userEmail || "利用者"}さんの週一報告`;
  }

  if (weeklyReportDetailMeta) {
    weeklyReportDetailMeta.textContent = `対象週：${formatStaffWeeklyJapaneseDate(report.weekStartDate)}〜${formatStaffWeeklyJapaneseDate(report.weekEndDate)} ／ ${getFeedbackStatusText(report)}`;
  }

  weeklyReportDetailBody.innerHTML = buildStaffWeeklyReportDetailHtml(report);

  const replyNotRequired = isStaffReplyNotRequired(report);
  if (weeklyReportFeedbackEditor) {
    weeklyReportFeedbackEditor.classList.toggle("weekly-report-feedback-editor-disabled", replyNotRequired);
    weeklyReportFeedbackEditor.classList.toggle("hidden", replyNotRequired);
  }

  if (weeklyReportFeedbackInput) {
    weeklyReportFeedbackInput.value = report.staffFeedbackText || "";
    weeklyReportFeedbackInput.disabled = replyNotRequired;
    weeklyReportFeedbackInput.placeholder = replyNotRequired
      ? "この報告は返信不要です。"
      : "例：振り返りありがとうございます。できたことが具体的に書けています。次回は〇〇も意識してみましょう。";
  }

  if (saveWeeklyReportFeedbackButton) {
    saveWeeklyReportFeedbackButton.disabled = replyNotRequired;
    saveWeeklyReportFeedbackButton.textContent = replyNotRequired
      ? "返信不要"
      : "返信を保存して利用者に表示";
  }

  setWeeklyReportFeedbackMessage("");
  renderSubmittedWeeklyReports(loadedStaffWeeklyReports);
}

async function openStaffWeeklyReportDetail(reportId) {
  const report = await loadStaffWeeklyReportDetailById(reportId);
  if (!report) {
    setStaffWeeklyReportMessage("選択した週一報告が見つかりません。", "red");
    return;
  }
  renderStaffWeeklyReportDetail(report);
  setStaffWeeklyReportMessage("週一報告本文を表示しました。", "green");

  // 提出済み一覧の下に詳細欄が出るため、クリック後に自動で詳細までスクロールする。
  requestAnimationFrame(() => {
    weeklyReportDetailPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

async function saveWeeklyReportFeedback() {
  if (!selectedStaffWeeklyReportId) {
    setWeeklyReportFeedbackMessage("先に提出済み一覧から利用者名を選択してください。", "red");
    return;
  }

  const report = getLoadedStaffWeeklyReportById(selectedStaffWeeklyReportId);
  if (!report) {
    setWeeklyReportFeedbackMessage("選択中の週一報告が見つかりません。", "red");
    return;
  }

  if (isStaffReplyNotRequired(report)) {
    setWeeklyReportFeedbackMessage("この報告は返信不要です。", "#475569");
    return;
  }

  const feedbackText = weeklyReportFeedbackInput?.value.trim() || "";
  if (!feedbackText) {
    setWeeklyReportFeedbackMessage("返信・フィードバックを入力してください。", "red");
    return;
  }

  const feedbackVersion = `fb_${Date.now()}`;
  const feedbackByName = currentStaffData?.name || currentUser?.email || "支援員";

  try {
    if (saveWeeklyReportFeedbackButton) {
      saveWeeklyReportFeedbackButton.disabled = true;
      saveWeeklyReportFeedbackButton.textContent = "保存中...";
    }

    await setDoc(doc(db, "weeklyReports", report.id), {
      userId: report.userId,
      staffFeedbackText: feedbackText,
      staffFeedbackByUid: currentUser?.uid || "",
      staffFeedbackByName: feedbackByName,
      staffFeedbackAt: serverTimestamp(),
      staffFeedbackVersion: feedbackVersion,
      feedbackReadByUser: false,
      locked: true,
      updatedAt: serverTimestamp()
    }, { merge: true });
    await markWeeklyReportFeedbackInStatusCache(report, feedbackVersion);

    const updatedReport = {
      ...report,
      staffFeedbackText: feedbackText,
      staffFeedbackByUid: currentUser?.uid || "",
      staffFeedbackByName: feedbackByName,
      staffFeedbackAt: new Date().toISOString(),
      staffFeedbackVersion: feedbackVersion,
      feedbackReadByUser: false,
      staffFeedbackReadVersion: "",
      locked: true
    };

    loadedStaffWeeklyReports = loadedStaffWeeklyReports.map((item) => item.id === report.id ? updatedReport : item);
    if (loadedStaffWeeklyReportWeekStartId && staffWeeklyReportCache[loadedStaffWeeklyReportWeekStartId]) {
      staffWeeklyReportCache[loadedStaffWeeklyReportWeekStartId].submittedReports = loadedStaffWeeklyReports;
    }

    renderStaffWeeklyReportResult(true);
    renderStaffWeeklyReportDetail(updatedReport);
    setWeeklyReportFeedbackMessage("返信を保存しました。利用者ページ上部に通知され、この報告は修正不可になります。", "green");
  } catch (error) {
    console.error("週一報告フィードバック保存エラー:", error);
    setWeeklyReportFeedbackMessage(`保存に失敗しました：${error.code || error.message}`, "red");
  } finally {
    if (saveWeeklyReportFeedbackButton) {
      saveWeeklyReportFeedbackButton.disabled = false;
      saveWeeklyReportFeedbackButton.textContent = "返信を保存して利用者に表示";
    }
  }
}

function buildSingleWeeklyReportText(report) {
  const feedbackText = report.staffFeedbackText
    ? `\n\n支援員からの返信\n${report.staffFeedbackText}`
    : "";

  if (isNoHomeWorkReport(report)) {
    return [
      "--------------------",
      `氏名：${report.userName || report._user?.name || ""}`,
      `記入日：${report.reportDate ? formatStaffWeeklyJapaneseDate(report.reportDate) : ""}`,
      `対象週：${formatStaffWeeklyJapaneseDate(report.weekStartDate)}〜${formatStaffWeeklyJapaneseDate(report.weekEndDate)}`,
      "",
      "報告内容",
      NO_HOME_WORK_VALUE
    ].join("\n");
  }

  const noActivityReasonText = hasMeaningfulNoActivityReason(report)
    ? report.noActivityReason
    : "";

  return [
    "--------------------",
    `氏名：${report.userName || report._user?.name || ""}`,
    `記入日：${report.reportDate ? formatStaffWeeklyJapaneseDate(report.reportDate) : ""}`,
    `対象週：${formatStaffWeeklyJapaneseDate(report.weekStartDate)}〜${formatStaffWeeklyJapaneseDate(report.weekEndDate)}`,
    "",
    "先週、どんな作業や活動をしましたか？",
    report.workActivityText || "",
    "",
    "先週の作業・活動時間の目安",
    report.activityTime || "",
    "",
    "活動なしと答えた方へ",
    noActivityReasonText,
    "",
    "先週の体調や生活リズム",
    report.healthStatus || "",
    "",
    "生活リズムについて詳しく",
    report.lifeRhythm || "",
    "",
    "先週の自己採点",
    report.selfScore ? String(report.selfScore) : "",
    "",
    "困ったこと・しんどかったこと",
    report.troubleText || "",
    "",
    "できたこと・がんばれたこと",
    report.goodText || "",
    "",
    "今週意識したいこと、取り組みたいこと",
    report.nextWeekText || "",
    "",
    "その他伝えたいこと、質問など",
    report.otherText || "",
    feedbackText
  ].join("\n");
}

async function ensureAllLoadedStaffWeeklyReportDetails() {
  const statusOnlyReports = loadedStaffWeeklyReports.filter((report) => report._statusOnly);

  if (statusOnlyReports.length === 0) {
    return;
  }

  setStaffWeeklyReportMessage(`コピー用テキスト作成のため、本文${statusOnlyReports.length}件を読み込み中...`, "#333");

  for (const report of statusOnlyReports) {
    await loadStaffWeeklyReportDetailById(report.id);
  }

  renderSubmittedWeeklyReports(loadedStaffWeeklyReports);
}

async function buildAllWeeklyReportsText() {
  if (!weeklyReportsTextOutput) {
    return;
  }

  if (!loadedStaffWeeklyReportWeekStartId) {
    weeklyReportsTextOutput.value = "先に『この週の提出状況を表示』を押してください。";
    return;
  }

  if (buildWeeklyReportsTextButton) {
    buildWeeklyReportsTextButton.disabled = true;
    buildWeeklyReportsTextButton.textContent = "本文読み込み中...";
  }

  try {
    await ensureAllLoadedStaffWeeklyReportDetails();

    const targetLabel = getStaffWeeklyReportRangeLabel(parseStaffWeeklyDateId(loadedStaffWeeklyReportWeekStartId));
    const missingNames = loadedStaffWeeklyMissingUsers.map((user) => user.name || user.email || user.id || "名前未設定");

    const header = [
      "【週一報告まとめ】",
      `対象週：${targetLabel}`,
      `提出済み：${loadedStaffWeeklyReports.length}人`,
      `未提出：${loadedStaffWeeklyMissingUsers.length}人`,
      "",
      "【未提出】",
      missingNames.length ? missingNames.join("、") : "なし",
      ""
    ].join("\n");

    const body = loadedStaffWeeklyReports.length
      ? loadedStaffWeeklyReports.map(buildSingleWeeklyReportText).join("\n\n")
      : "提出済みの週一報告はありません。";

    weeklyReportsTextOutput.value = `${header}\n${body}`;
    setStaffWeeklyReportMessage("提出済みの週一報告をテキスト化しました。", "green");
  } catch (error) {
    console.error("週一報告テキスト化エラー:", error);
    setStaffWeeklyReportMessage(`テキスト化に失敗しました：${error.code || error.message}`, "red");
  } finally {
    if (buildWeeklyReportsTextButton) {
      buildWeeklyReportsTextButton.disabled = false;
      buildWeeklyReportsTextButton.textContent = "提出済みをテキスト化";
    }
  }
}

async function copyWeeklyReportsTextToClipboard() {
  if (!weeklyReportsTextOutput) {
    return;
  }

  const text = weeklyReportsTextOutput.value;
  if (!text) {
    setStaffWeeklyReportMessage("コピーするテキストがありません。先にテキスト化してください。", "red");
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    setStaffWeeklyReportMessage("コピーしました。", "green");
  } catch (error) {
    console.error("週一報告テキストコピーエラー:", error);
    weeklyReportsTextOutput.focus();
    weeklyReportsTextOutput.select();
    setStaffWeeklyReportMessage("自動コピーに失敗しました。テキスト欄を選択して手動でコピーしてください。", "red");
  }
}

function changeStaffWeeklyReportWeek(offsetWeeks) {
  if (!displayedStaffWeeklyReportWeekStartDate) {
    displayedStaffWeeklyReportWeekStartDate = getStaffWeeklyLastCompletedWeekStartDate();
  }

  const nextWeekStart = addStaffWeeklyDays(displayedStaffWeeklyReportWeekStartDate, offsetWeeks * 7);
  const lastWeekStart = getStaffWeeklyLastCompletedWeekStartDate();

  if (nextWeekStart > lastWeekStart) {
    return;
  }

  displayedStaffWeeklyReportWeekStartDate = nextWeekStart;
  updateStaffWeeklyReportWeekHeader();
  const weekStartId = getStaffWeeklyCacheKey();
  if (!applyStaffWeeklyReportCache(weekStartId)) {
    resetStaffWeeklyReportDisplay("対象週を変更しました。未読込みの週です。『この週の提出状況を表示』を押してください。");
  }
}

function initializeStaffWeeklyReportSection() {
  if (!staffWeeklyReportWeekLabel) {
    return;
  }

  displayedStaffWeeklyReportWeekStartDate = getStaffWeeklyLastCompletedWeekStartDate();
  updateStaffWeeklyReportWeekHeader();
  resetStaffWeeklyReportDisplay();
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

  const loadedByDate = {};

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
      const activeList = rawList.filter((announcement) => announcement.active !== false);

      if (activeList.length > 0) {
        loadedByDate[dateId] = mergeAnnouncementLists(
          ...(loadedByDate[dateId] || []),
          ...activeList
        );
      }
    });
  }

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
    return `<div class="operation-check-muted">${escapeStaffWeeklyText(emptyText)}</div>`;
  }

  return `<ul class="operation-check-name-list">${items.map((item) => `<li>${escapeStaffWeeklyText(item)}</li>`).join("")}</ul>`;
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
          <div class="operation-check-card-value">${escapeStaffWeeklyText(monthId)}</div>
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
    operationCheckResult.innerHTML = `<div class="calendar-filter-empty">${escapeStaffWeeklyText(`運用チェックに失敗しました：${error.code || error.message}`)}</div>`;
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
  shouldRefreshDailySchedulesAfterEdit = false;
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
  const officeId = normalizeOfficeId(monthlySchedule.officeId || getCurrentOfficeId());
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
      officeId: normalizeOfficeId(monthlySchedule.officeId || getCurrentOfficeId()),
      groupId: monthlySchedule.groupId || getCurrentGroupId()
    };

    const updatedMonthlySchedule = {
      id: monthlySchedule.id || `${selectedUser.id}_${monthId}`,
      _missingDoc: false,
      userId: selectedUser.id,
      userName: selectedUser.name || monthlySchedule.userName || "名前未設定",
      userEmail: selectedUser.email || monthlySchedule.userEmail || "",
      officeId: normalizeOfficeId(selectedUser.officeId || monthlySchedule.officeId || getCurrentOfficeId()),
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

    const refreshDailySchedulesAfterSave = shouldRefreshDailySchedulesAfterEdit;
    shouldRefreshDailySchedulesAfterEdit = false;

    closeUserScheduleEditModal();

    if (refreshDailySchedulesAfterSave) {
      if (targetDate) {
        targetDate.value = dateId;
      }
      await loadDailySchedules();
    } else {
      await loadUserMonthlyScheduleView();
    }

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

  const loadedByDate = {};

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
      const activeList = rawList.filter((announcement) => announcement.active !== false);

      if (activeList.length > 0) {
        loadedByDate[dateId] = mergeAnnouncementLists(
          ...(loadedByDate[dateId] || []),
          ...activeList
        );
      }
    });
  }

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

    const list = mergeAnnouncementLists(announcementsByDate[dateId] || [])
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
        sourceWorkshopId: announcement.sourceWorkshopId || "",
        sourceWorkshopTitle: announcement.sourceWorkshopTitle || "",
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
// 支援員：ワークショップ・教材・案件管理
// system/workshopResources_{officeId} を、開いた時だけ1 readする。
// schemaVersion 2：workshops / cases / guides を1ドキュメントにまとめる。
// ==============================
function getWorkshopResourcesDocId(officeId = getCurrentOfficeId()) {
  return `${WORKSHOP_RESOURCES_DOC_PREFIX}${officeId}`;
}

function normalizeWorkshopId(text) {
  const base = (text || "workshop")
    .trim()
    .toLowerCase()
    .replace(/[\s　]+/g, "_")
    .replace(/[^a-z0-9_\-]/g, "");

  return `${base || "workshop"}_${Date.now().toString(36)}`;
}

function normalizeCaseNo(caseNo) {
  return String(caseNo || "")
    .replace(/案件/g, "")
    .replace(/no\.?/ig, "")
    .replace(/[：:]/g, "")
    .trim();
}

function generateSmallId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function parsePipeLines(text, mapper) {
  return (text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split("|").map((part) => part.trim()))
    .map(mapper)
    .filter(Boolean);
}

function parseWorkshopLinks(text) {
  return parsePipeLines(text, (parts) => ({
    id: generateSmallId("link"),
    title: parts[0] || "リンク",
    url: parts[1] || "",
    note: parts[2] || "",
    active: true
  })).filter((item) => item.title || item.url);
}

function parseWorkshopDeadlines(text) {
  return parsePipeLines(text, (parts) => ({
    id: generateSmallId("deadline"),
    title: parts[0] || "提出物",
    dueDate: parts[1] || "",
    dueTime: parts[2] || "",
    note: parts[3] || "",
    active: true
  })).filter((item) => item.title || item.dueDate || item.note);
}

function parseWorkshopCases(text, workshopId) {
  return parsePipeLines(text, (parts) => {
    const caseNo = normalizeCaseNo(parts[0] || "");
    const title = parts[1] || parts[0] || "案件";
    const status = parts[2] || "";
    const dueDate = parts[3] || "";
    const summary = parts[4] || "";
    const type = parts[5] || "";
    const deliverableText = parts[6] || "";

    if (!caseNo && !title && !summary && !deliverableText) {
      return null;
    }

    return {
      id: generateSmallId("case"),
      workshopId: workshopId,
      caseNo: caseNo,
      title: title,
      status: status,
      dueDate: dueDate,
      summary: summary,
      type: type,
      deliverableText: deliverableText,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  });
}

function createBlankWorkshopCase() {
  return {
    id: "",
    caseNo: "",
    title: "",
    status: "制作中",
    dueDate: "",
    summary: "",
    type: "",
    deliverableText: "",
    active: true
  };
}

function createTextInput(value, placeholder, className = "") {
  const input = document.createElement("input");
  input.type = "text";
  input.value = value || "";
  input.placeholder = placeholder || "";
  if (className) {
    input.className = className;
  }
  return input;
}

function createDateInput(value, className = "") {
  const input = document.createElement("input");
  input.type = "date";
  input.value = value || "";
  if (className) {
    input.className = className;
  }

  input.addEventListener("click", () => {
    openNativeDatePicker(input);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    openNativeDatePicker(input);
  });

  return input;
}

function createTextArea(value, placeholder, className = "") {
  const textarea = document.createElement("textarea");
  textarea.value = value || "";
  textarea.placeholder = placeholder || "";
  if (className) {
    textarea.className = className;
  }
  return textarea;
}

function createCaseCardField(labelText, fieldElement) {
  const label = document.createElement("label");
  label.className = "workshop-case-card-field";

  const caption = document.createElement("span");
  caption.textContent = labelText;
  label.appendChild(caption);
  label.appendChild(fieldElement);

  return label;
}

function isCompletedCaseStatus(status) {
  return /納品済|完了|終了/.test(String(status || ""));
}

function normalizeCaseForCard(caseItem = {}) {
  return {
    id: caseItem.id || "",
    caseNo: normalizeCaseNo(caseItem.caseNo || ""),
    title: caseItem.title || "",
    status: caseItem.status || "制作中",
    dueDate: caseItem.dueDate || "",
    summary: caseItem.summary || caseItem.description || "",
    type: caseItem.type || "",
    deliverableText: caseItem.deliverableText || "",
    requirements: Array.isArray(caseItem.requirements) ? caseItem.requirements : [],
    checklist: Array.isArray(caseItem.checklist) ? caseItem.checklist : [],
    active: caseItem.active !== false,
    createdAt: caseItem.createdAt || ""
  };
}

function parseCaseCardDatasetList(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function buildWorkshopCaseCard(caseItem = {}) {
  const normalized = normalizeCaseForCard(caseItem);
  const card = document.createElement("article");
  card.className = "workshop-case-edit-card";
  card.dataset.caseId = normalized.id || generateSmallId("case_draft");
  card.dataset.createdAt = normalized.createdAt || "";
  card.dataset.requirements = JSON.stringify(normalized.requirements || []);
  card.dataset.checklist = JSON.stringify(normalized.checklist || []);

  const header = document.createElement("div");
  header.className = "workshop-case-edit-card-header";

  const title = document.createElement("h5");
  title.textContent = normalized.caseNo ? `案件No.${normalized.caseNo}` : "新しい案件";
  header.appendChild(title);

  const actionRow = document.createElement("div");
  actionRow.className = "workshop-case-edit-actions";

  const activeLabel = document.createElement("label");
  activeLabel.className = "workshop-case-active-toggle";

  const activeInput = document.createElement("input");
  activeInput.type = "checkbox";
  activeInput.className = "case-card-active";
  activeInput.checked = normalized.active;
  activeLabel.appendChild(activeInput);
  activeLabel.appendChild(document.createTextNode("利用者に表示する"));
  actionRow.appendChild(activeLabel);

  const completeButton = document.createElement("button");
  completeButton.type = "button";
  completeButton.className = "small-button";
  completeButton.textContent = "完了して非表示";
  actionRow.appendChild(completeButton);

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "small-button danger-button";
  removeButton.textContent = "削除";
  removeButton.addEventListener("click", () => {
    card.remove();
    syncWorkshopCaseTextareaFromCards();
    renderWorkshopCaseCardsEmptyState();
  });
  actionRow.appendChild(removeButton);
  header.appendChild(actionRow);

  const grid = document.createElement("div");
  grid.className = "workshop-case-card-grid";

  const caseNoInput = createTextInput(normalized.caseNo, "例：005", "case-card-case-no");
  const titleInput = createTextInput(normalized.title, "例：EPIC DAY ポスター", "case-card-title");
  const statusInput = createTextInput(normalized.status, "例：制作中 / 修正中 / 納品済み", "case-card-status");
  const dueDateInput = createDateInput(normalized.dueDate, "case-card-due-date");
  const typeInput = createTextInput(normalized.type, "例：ポスター / 名刺 / 動画", "case-card-type");
  const summaryInput = createTextArea(normalized.summary, "利用者に見せる案件概要。価格・原価・電話番号などの内部情報は入れない。", "case-card-summary");
  const deliverableInput = createTextArea(normalized.deliverableText, "例：A1サイズ / Illustrator形式 / PDF提出など", "case-card-deliverable");

  const syncInactiveStyle = () => {
    card.classList.toggle("inactive-case", !activeInput.checked);
  };

  grid.appendChild(createCaseCardField("案件No", caseNoInput));
  grid.appendChild(createCaseCardField("案件名", titleInput));
  grid.appendChild(createCaseCardField("状態", statusInput));
  grid.appendChild(createCaseCardField("納期", dueDateInput));
  grid.appendChild(createCaseCardField("種別", typeInput));

  const summaryField = createCaseCardField("概要", summaryInput);
  summaryField.classList.add("wide");
  grid.appendChild(summaryField);

  const deliverableField = createCaseCardField("制作物・納品形式", deliverableInput);
  deliverableField.classList.add("wide");
  grid.appendChild(deliverableField);

  completeButton.addEventListener("click", () => {
    statusInput.value = "納品済み";
    activeInput.checked = false;
    title.textContent = caseNoInput.value.trim() ? `案件No.${normalizeCaseNo(caseNoInput.value)}` : "新しい案件";
    syncInactiveStyle();
    syncWorkshopCaseTextareaFromCards();
  });

  activeInput.addEventListener("change", () => {
    syncInactiveStyle();
    syncWorkshopCaseTextareaFromCards();
  });

  [caseNoInput, titleInput, statusInput, dueDateInput, typeInput, summaryInput, deliverableInput].forEach((input) => {
    input.addEventListener("input", () => {
      title.textContent = caseNoInput.value.trim() ? `案件No.${normalizeCaseNo(caseNoInput.value)}` : "新しい案件";
      syncWorkshopCaseTextareaFromCards();
    });
  });

  card.appendChild(header);
  card.appendChild(grid);
  syncInactiveStyle();
  return card;
}

function renderWorkshopCaseCardsEmptyState() {
  if (!workshopCaseCardList) {
    return;
  }

  if (workshopCaseCardList.querySelector(".workshop-case-edit-card")) {
    return;
  }

  workshopCaseCardList.innerHTML = `<div class="workshop-case-card-empty">案件を追加すると、ここにカードで表示されます。</div>`;
}

function renderWorkshopCaseCards(cases = []) {
  if (!workshopCaseCardList) {
    return;
  }

  workshopCaseCardList.innerHTML = "";
  (cases || []).filter(Boolean).forEach((caseItem) => {
    workshopCaseCardList.appendChild(buildWorkshopCaseCard(caseItem));
  });

  renderWorkshopCaseCardsEmptyState();
  syncWorkshopCaseTextareaFromCards();
}

function collectWorkshopCaseCards(workshopId) {
  if (!workshopCaseCardList) {
    return workshopResourceCasesText ? parseWorkshopCases(workshopResourceCasesText.value, workshopId) : [];
  }

  return Array.from(workshopCaseCardList.querySelectorAll(".workshop-case-edit-card"))
    .map((card) => {
      const caseNo = normalizeCaseNo(card.querySelector(".case-card-case-no")?.value || "");
      const title = (card.querySelector(".case-card-title")?.value || "").trim();
      const status = (card.querySelector(".case-card-status")?.value || "").trim();
      const dueDate = (card.querySelector(".case-card-due-date")?.value || "").trim();
      const type = (card.querySelector(".case-card-type")?.value || "").trim();
      const summary = (card.querySelector(".case-card-summary")?.value || "").trim();
      const deliverableText = (card.querySelector(".case-card-deliverable")?.value || "").trim();
      const active = card.querySelector(".case-card-active")?.checked !== false;

      if (!caseNo && !title && !summary && !deliverableText) {
        return null;
      }

      return {
        id: card.dataset.caseId || generateSmallId("case"),
        workshopId,
        caseNo,
        title: title || (caseNo ? `案件No.${caseNo}` : "案件"),
        status,
        dueDate,
        summary,
        type,
        deliverableText,
        requirements: parseCaseCardDatasetList(card.dataset.requirements),
        checklist: parseCaseCardDatasetList(card.dataset.checklist),
        active,
        createdAt: card.dataset.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    })
    .filter(Boolean);
}

function syncWorkshopCaseTextareaFromCards() {
  if (!workshopResourceCasesText || !workshopCaseCardList) {
    return;
  }

  const cases = collectWorkshopCaseCards("");
  workshopResourceCasesText.value = cases
    .map((caseItem) => [
      caseItem.caseNo || "",
      caseItem.title || "",
      caseItem.status || "",
      caseItem.dueDate || "",
      caseItem.summary || "",
      caseItem.type || "",
      caseItem.deliverableText || ""
    ].join(" | ").trim())
    .join("\n");
}

function addWorkshopCaseCard(caseItem = {}) {
  if (!workshopCaseCardList) {
    return;
  }

  const empty = workshopCaseCardList.querySelector(".workshop-case-card-empty");
  if (empty) {
    empty.remove();
  }

  const card = buildWorkshopCaseCard({ ...createBlankWorkshopCase(), ...caseItem });
  workshopCaseCardList.appendChild(card);
  syncWorkshopCaseTextareaFromCards();
  card.querySelector(".case-card-case-no")?.focus();
}

function refreshWorkshopCaseCardsFromTextarea() {
  if (!workshopResourceCasesText || !workshopCaseCardList) {
    return;
  }

  renderWorkshopCaseCards(parseWorkshopCases(workshopResourceCasesText.value, ""));
}

function getWorkshopFormCasesForPreview() {
  return collectWorkshopCaseCards(editingWorkshopResourceId?.value || "preview_workshop");
}

function getWorkshopFormLinksForPreview() {
  return parseWorkshopLinks(workshopResourceLinksText?.value || "");
}

function buildWorkshopPreviewHtml(previewData) {
  const title = previewData.title || "ワークショップ名未入力";
  const scheduleText = previewData.scheduleText || "";
  const description = previewData.description || "";
  const cases = (previewData.cases || []).filter((caseItem) => caseItem.active !== false);
  const links = (previewData.links || []).filter((link) => link.active !== false && (link.title || link.url));
  const deadlines = (previewData.deadlines || []).filter((deadline) => {
    return deadline.active !== false && (deadline.title || deadline.dueDate || deadline.note);
  }).sort((a, b) => (a.dueDate || "9999-99-99").localeCompare(b.dueDate || "9999-99-99"));

  const caseCards = cases.length
    ? cases.map((caseItem) => `
        <article class="workshop-case-card">
          <h5 class="workshop-case-title">${escapeStaffWeeklyText(caseItem.caseNo ? `案件No.${caseItem.caseNo} ${caseItem.title || ""}` : caseItem.title || "無題の案件")}</h5>
          <div class="workshop-case-meta">
            ${caseItem.status ? `<span class="workshop-status-badge">${escapeStaffWeeklyText(caseItem.status)}</span>` : ""}
            ${caseItem.type ? `<span class="workshop-summary-chip">${escapeStaffWeeklyText(caseItem.type)}</span>` : ""}
            ${caseItem.dueDate ? `<span class="workshop-summary-chip">納期 ${escapeStaffWeeklyText(caseItem.dueDate)}</span>` : ""}
          </div>
          ${caseItem.summary ? `<div class="workshop-case-summary">${escapeStaffWeeklyText(caseItem.summary)}</div>` : ""}
          ${caseItem.deliverableText ? `<div class="workshop-case-summary">${escapeStaffWeeklyText(caseItem.deliverableText)}</div>` : ""}
        </article>
      `).join("")
    : `<div class="workshop-empty-section">登録されている案件はありません。</div>`;

  const linkItems = links.length
    ? links.map((link) => `
        <div class="workshop-resource-link-item">
          ${link.url
            ? `<a href="${escapeStaffWeeklyText(link.url)}" target="_blank" rel="noopener noreferrer">${escapeStaffWeeklyText(link.title || link.url)}</a>`
            : `<strong>${escapeStaffWeeklyText(link.title || "リンク")}</strong>`}
          ${link.note ? `<div class="workshop-resource-note">${escapeStaffWeeklyText(link.note)}</div>` : ""}
        </div>
      `).join("")
    : `<div class="workshop-empty-section">登録されている教材・リンクはありません。</div>`;

  const deadlineItems = deadlines.length
    ? deadlines.map((deadline) => `
        <div class="workshop-deadline-item">
          <div class="workshop-deadline-title">${escapeStaffWeeklyText(deadline.title || "提出物")}</div>
          <div class="workshop-deadline-date">${escapeStaffWeeklyText(`${deadline.dueDate || "日付未設定"}${deadline.dueTime ? ` ${deadline.dueTime}` : ""}`)}</div>
          ${deadline.note ? `<div class="workshop-resource-note">${escapeStaffWeeklyText(deadline.note)}</div>` : ""}
        </div>
      `).join("")
    : `<div class="workshop-empty-section">納期が設定された案件はありません。</div>`;

  return `
    <article class="workshop-resource-card workshop-detail-card">
      <div class="workshop-detail-header">
        <h3 class="workshop-resource-title">${escapeStaffWeeklyText(title)}</h3>
        <div class="workshop-summary-chip-row">
          <span class="workshop-summary-chip">案件 ${cases.length}件</span>
          <span class="workshop-summary-chip">教材 ${links.length}件</span>
          <span class="workshop-summary-chip">期限 ${deadlines.length}件</span>
        </div>
      </div>
      ${scheduleText ? `<div class="workshop-resource-schedule">${escapeStaffWeeklyText(scheduleText)}</div>` : ""}
      ${description ? `<div class="workshop-resource-description">${escapeStaffWeeklyText(description)}</div>` : ""}
      <section class="workshop-resource-section">
        <h4>進行中の案件</h4>
        ${caseCards}
      </section>
      <section class="workshop-resource-section workshop-deadline-section">
        <h4>提出期限一覧</h4>
        ${deadlineItems}
      </section>
      <section class="workshop-resource-section">
        <h4>教材・リンク</h4>
        ${linkItems}
      </section>
    </article>
  `;
}

function getCaseDeadlinePreviewItems(cases = []) {
  return cases
    .filter((caseItem) => caseItem.active !== false && caseItem.dueDate && !isCompletedCaseStatus(caseItem.status))
    .map((caseItem) => ({
      id: `case_deadline_${caseItem.id || caseItem.caseNo || caseItem.title || ""}`,
      title: `${caseItem.caseNo ? `案件No.${caseItem.caseNo} ` : ""}${caseItem.title || "無題の案件"}`,
      dueDate: caseItem.dueDate,
      dueTime: "",
      note: "",
      active: true
    }));
}

function getWorkshopFormPreviewData() {
  const cases = getWorkshopFormCasesForPreview().filter((caseItem) => caseItem.active !== false);

  return {
    title: (workshopResourceTitle?.value || "").trim() || "ワークショップ名未入力",
    scheduleText: (workshopResourceScheduleText?.value || "").trim(),
    description: (workshopResourceDescription?.value || "").trim(),
    cases,
    links: getWorkshopFormLinksForPreview(),
    deadlines: getCaseDeadlinePreviewItems(cases)
  };
}

function getStoredWorkshopPreviewData(workshop) {
  const cases = getActiveCasesForWorkshop(workshop.id);
  const activeDeadlines = (workshop.deadlines || []).filter((deadline) => deadline.active !== false);

  return {
    title: workshop.title || "無題のワークショップ",
    scheduleText: workshop.scheduleText || "",
    description: workshop.description || workshop.summary || "",
    cases,
    links: (workshop.links || []).filter((link) => link.active !== false),
    deadlines: [...getCaseDeadlinePreviewItems(cases), ...activeDeadlines]
  };
}

function hasWorkshopFormDraft() {
  if (editingWorkshopResourceId?.value) {
    return true;
  }

  return Boolean(
    (workshopResourceTitle?.value || "").trim() ||
    (workshopResourceScheduleText?.value || "").trim() ||
    (workshopResourceDescription?.value || "").trim() ||
    (workshopResourceLinksText?.value || "").trim() ||
    (workshopResourceCasesText?.value || "").trim()
  );
}

function renderWorkshopFormPreview() {
  if (!workshopPreviewArea) {
    return;
  }

  workshopPreviewArea.innerHTML = buildWorkshopPreviewHtml(getWorkshopFormPreviewData());
}

function renderStoredWorkshopPreview(workshopId) {
  if (!workshopPreviewArea) {
    return;
  }

  const workshop = (workshopResourcesCache.workshops || []).find((item) => item.id === workshopId);
  if (!workshop) {
    renderWorkshopPreviewPicker();
    return;
  }

  const backButton = document.createElement("button");
  backButton.type = "button";
  backButton.className = "sub-button workshop-back-button";
  backButton.textContent = "＜ プレビュー一覧へ戻る";
  backButton.addEventListener("click", renderWorkshopPreviewPicker);

  workshopPreviewArea.innerHTML = "";
  workshopPreviewArea.appendChild(backButton);
  workshopPreviewArea.insertAdjacentHTML("beforeend", buildWorkshopPreviewHtml(getStoredWorkshopPreviewData(workshop)));
}

function createWorkshopPreviewChoiceCard(workshop) {
  const card = document.createElement("article");
  card.className = "workshop-admin-card";

  const title = document.createElement("div");
  title.className = "workshop-admin-card-title";
  title.textContent = workshop.title || "無題のワークショップ";

  const cases = getActiveCasesForWorkshop(workshop.id);
  const links = (workshop.links || []).filter((item) => item.active !== false);
  const deadlines = [...getCaseDeadlinePreviewItems(cases), ...(workshop.deadlines || []).filter((item) => item.active !== false)];

  const meta = document.createElement("div");
  meta.className = "workshop-admin-card-meta";
  meta.textContent = `案件${cases.length}件 ／ リンク${links.length}件 ／ 提出期限${deadlines.length}件`;

  const body = document.createElement("div");
  body.className = "workshop-admin-card-body";
  body.textContent = workshop.scheduleText || workshop.description || "説明なし";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "small-button";
  button.textContent = "この内容をプレビュー";
  button.addEventListener("click", () => renderStoredWorkshopPreview(workshop.id));

  const buttons = document.createElement("div");
  buttons.className = "announcement-edit-buttons";
  buttons.appendChild(button);

  card.appendChild(title);
  card.appendChild(meta);
  card.appendChild(body);
  card.appendChild(buttons);
  return card;
}

function getSortedWorkshopsForAdmin() {
  return [...(workshopResourcesCache.workshops || [])]
    .filter((workshop) => showInactiveWorkshops || workshop.active !== false)
    .sort((a, b) => {
      const orderA = typeof a.order === "number" ? a.order : 9999;
      const orderB = typeof b.order === "number" ? b.order : 9999;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return (a.title || "").localeCompare(b.title || "", "ja");
    });
}

function renderWorkshopPreviewPicker() {
  if (!workshopPreviewArea) {
    return;
  }

  const hiddenCount = (workshopResourcesCache.workshops || []).filter((workshop) => workshop.active === false).length;
  if (hiddenCount === 0) {
    showInactiveWorkshops = false;
  }
  const workshops = getSortedWorkshopsForAdmin();
  workshopPreviewArea.innerHTML = "";

  if (hiddenCount > 0) {
    const tools = document.createElement("div");
    tools.className = "workshop-admin-list-tools";

    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.className = "sub-button";
    toggleButton.textContent = showInactiveWorkshops
      ? "非表示のワークショップを隠す"
      : `非表示のワークショップを表示（${hiddenCount}件）`;
    toggleButton.addEventListener("click", () => {
      showInactiveWorkshops = !showInactiveWorkshops;
      renderWorkshopResourceAdminList();
      renderWorkshopPreviewPicker();
    });

    tools.appendChild(toggleButton);
    workshopPreviewArea.appendChild(tools);
  }

  if (workshops.length === 0) {
    workshopPreviewArea.insertAdjacentHTML("beforeend", `<div class="calendar-filter-empty">プレビューできるワークショップがありません。</div>`);
    return;
  }

  const intro = document.createElement("div");
  intro.className = "workshop-preview-picker-guide";
  intro.textContent = "プレビューしたいワークショップを選んでください。";
  workshopPreviewArea.appendChild(intro);

  workshops.forEach((workshop) => {
    workshopPreviewArea.appendChild(createWorkshopPreviewChoiceCard(workshop));
  });
}

function renderWorkshopPreview() {
  if (hasWorkshopFormDraft()) {
    renderWorkshopFormPreview();
    return;
  }

  renderWorkshopPreviewPicker();
}

function updateWorkshopFormVisibility() {
  const isPreview = workshopPreviewPanel && !workshopPreviewPanel.classList.contains("hidden");

  if (workshopFormPanel) {
    workshopFormPanel.classList.toggle("hidden", Boolean(isPreview) || !workshopFormOpen);
  }

  if (showWorkshopFormButton) {
    showWorkshopFormButton.textContent = workshopFormOpen ? "追加フォームを閉じる" : "ワークショップを追加";
  }
}

function setWorkshopFormOpen(isOpen) {
  workshopFormOpen = Boolean(isOpen);
  updateWorkshopFormVisibility();
}

function setWorkshopAdminMode(mode) {
  const isPreview = mode === "preview";

  if (workshopEditModeButton) {
    workshopEditModeButton.classList.toggle("active", !isPreview);
  }

  if (workshopPreviewModeButton) {
    workshopPreviewModeButton.classList.toggle("active", isPreview);
  }

  if (workshopEditPanel) {
    workshopEditPanel.classList.toggle("hidden", isPreview);
  }

  if (workshopPreviewPanel) {
    workshopPreviewPanel.classList.toggle("hidden", !isPreview);
  }

  updateWorkshopFormVisibility();

  if (isPreview) {
    renderWorkshopPreview();
  }
}


// STEP29_CASE_DRAFT_20260621_V59：案件情報の貼り付けから、利用者向けの案件下書きを作成する。
// 価格・原価・電話番号などの内部情報は、下書きには反映しない。
function toHalfWidthText(text) {
  return String(text || "").replace(/[０-９Ａ-Ｚａ-ｚ]/g, (char) => {
    return String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
  });
}

function normalizeCaseDraftDate(rawDate) {
  const text = toHalfWidthText(rawDate || "").trim();
  const isoMatch = text.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/);

  if (isoMatch) {
    return `${isoMatch[1]}-${String(Number(isoMatch[2])).padStart(2, "0")}-${String(Number(isoMatch[3])).padStart(2, "0")}`;
  }

  const shortMatch = text.match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})\s*日?/);

  if (shortMatch) {
    const year = new Date().getFullYear();
    return `${year}-${String(Number(shortMatch[1])).padStart(2, "0")}-${String(Number(shortMatch[2])).padStart(2, "0")}`;
  }

  return "";
}

function extractLatestCaseDraftDate(block) {
  const normalized = toHalfWidthText(block || "");
  const candidates = [];
  const pattern = /(20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}|\d{1,2}\s*[\/月]\s*\d{1,2}\s*日?)/g;
  let match;

  while ((match = pattern.exec(normalized)) !== null) {
    const dateId = normalizeCaseDraftDate(match[1]);
    if (dateId) {
      candidates.push(dateId);
    }
  }

  candidates.sort();
  return candidates[candidates.length - 1] || "";
}

function extractCaseDraftType(block) {
  const text = String(block || "");

  if (/名刺/.test(text)) {
    return "名刺";
  }
  if (/ロゴ/.test(text)) {
    return "ロゴ";
  }
  if (/求人|チラシ|ちらし|折込|折り込み/.test(text)) {
    return "チラシ";
  }
  if (/ポスター/.test(text)) {
    return "ポスター";
  }
  if (/動画|映像/.test(text)) {
    return "動画";
  }

  return "デザイン";
}

function extractCaseDraftStatus(block) {
  const text = String(block || "");

  if (/納品済|完了|終了/.test(text)) {
    return "納品済み";
  }
  if (/修正依頼|再度|不採用|やり直し|修正/.test(text)) {
    return "修正中";
  }
  if (/フィードバック|確認/.test(text)) {
    return "確認中";
  }
  if (/募集/.test(text)) {
    return "募集中";
  }

  return "制作中";
}

function extractSectionBody(block, heading) {
  const text = String(block || "").replace(/\r\n/g, "\n");
  const pattern = new RegExp(`■\\s*${heading}\\s*\\n([\\s\\S]*?)(?=\\n■\\s*|$)`);
  const match = text.match(pattern);
  return match ? match[1].trim() : "";
}

function cleanupCaseDraftSummary(text) {
  return String(text || "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/価格[\s\S]*$/g, "")
    .replace(/デザイン制作費[\s\S]*$/g, "")
    .replace(/印刷代[\s\S]*$/g, "")
    .replace(/原価[\s\S]*$/g, "")
    .replace(/電話[:：]?.*/g, "")
    .replace(/[\t　]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function shortenCaseDraftSummary(text, maxLength = 90) {
  const normalized = cleanupCaseDraftSummary(text).replace(/\s+/g, " ");
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized;
}

function extractCaseDraftClientName(block) {
  const text = String(block || "");
  const shopName = text.match(/店名[：:]\s*([^\n\r]+)/);
  if (shopName) {
    return shopName[1].trim();
  }

  const companyName = text.match(/(株式会社[^\s\n、。]+|[A-Z0-9][A-Z0-9\s\-_.&]+|[\u30A0-\u30FF\u3040-\u309F\u4E00-\u9FFF]+フーズ)/);
  if (companyName) {
    return companyName[1].trim();
  }

  return "";
}

function extractCaseDraftTitle(block, caseNo) {
  const type = extractCaseDraftType(block);
  const text = String(block || "");
  const clientName = extractCaseDraftClientName(text);

  if (clientName) {
    return `${clientName} ${type}`.trim();
  }

  const sameLine = toHalfWidthText(text).match(new RegExp(`案件\\s*No\\.?\\s*${caseNo}\\s*([^\\n\\r]*)`, "i"));
  if (sameLine && sameLine[1].trim()) {
    return shortenCaseDraftSummary(sameLine[1], 28) || `案件No.${caseNo}`;
  }

  const firstMeaningfulLine = text
    .split(/\n/)
    .map((line) => line.trim())
    .find((line) => line && !/^案件\s*No/i.test(toHalfWidthText(line)) && !/^■/.test(line));

  if (firstMeaningfulLine) {
    return shortenCaseDraftSummary(firstMeaningfulLine, 28);
  }

  return `案件No.${caseNo}`;
}

function extractCaseDraftSummary(block) {
  const content = extractSectionBody(block, "内容");
  if (content) {
    return shortenCaseDraftSummary(content);
  }

  const request = extractSectionBody(block, "修正依頼");
  if (request) {
    return shortenCaseDraftSummary(request);
  }

  return shortenCaseDraftSummary(block);
}

function splitCaseDraftBlocks(rawText) {
  const normalized = String(rawText || "").replace(/\r\n/g, "\n");
  const caseHeaderPattern = /(案件\s*No\.?\s*[0-9０-９]+)/gi;
  const matches = [...normalized.matchAll(caseHeaderPattern)];

  if (matches.length === 0) {
    return normalized.trim() ? [{ caseNo: "", block: normalized.trim() }] : [];
  }

  return matches.map((match, index) => {
    const start = match.index;
    const end = index + 1 < matches.length ? matches[index + 1].index : normalized.length;
    const caseNo = normalizeCaseNo(match[1]);
    return {
      caseNo,
      block: normalized.slice(start, end).trim()
    };
  });
}

function buildCaseDraftLinesFromRawText(rawText) {
  const blocks = splitCaseDraftBlocks(rawText);
  const lines = [];

  blocks.forEach(({ caseNo, block }, index) => {
    const normalizedNo = normalizeCaseNo(caseNo) || String(index + 1).padStart(3, "0");
    const title = extractCaseDraftTitle(block, normalizedNo);
    const status = extractCaseDraftStatus(block);
    const dueDate = extractLatestCaseDraftDate(block);
    const summary = extractCaseDraftSummary(block);
    const type = extractCaseDraftType(block);

    if (!title && !summary) {
      return;
    }

    lines.push(`${normalizedNo} | ${title} | ${status} | ${dueDate} | ${summary} | ${type}`);
  });

  return lines;
}

function renderCaseDraftPreview(lines) {
  if (!workshopCaseDraftPreview) {
    return;
  }

  if (!lines.length) {
    workshopCaseDraftPreview.textContent = "案件Noを含む文章、または案件説明文を貼り付けてください。";
    workshopCaseDraftPreview.classList.add("empty");
    return;
  }

  workshopCaseDraftPreview.classList.remove("empty");
  workshopCaseDraftPreview.innerHTML = lines
    .map((line) => `<div class="workshop-case-draft-line">${escapeStaffWeeklyText(line)}</div>`)
    .join("");
}

function appendCaseDraftLinesToTextarea(lines) {
  if (!workshopResourceCasesText || !lines.length) {
    return;
  }

  const currentLines = workshopResourceCasesText.value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const existingLineSet = new Set(currentLines);
  const addLines = lines.filter((line) => !existingLineSet.has(line));

  if (addLines.length === 0) {
    return;
  }

  if (workshopCaseCardList) {
    parseWorkshopCases(addLines.join("\n"), editingWorkshopResourceId?.value || "")
      .forEach((caseItem) => addWorkshopCaseCard(caseItem));
    return;
  }

  workshopResourceCasesText.value = [...currentLines, ...addLines].join("\n");
  refreshWorkshopCaseCardsFromTextarea();
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

function formatWorkshopCasesForTextarea(cases) {
  return (cases || [])
    .filter((item) => item.active !== false)
    .map((item) => `${item.caseNo || ""} | ${item.title || ""} | ${item.status || ""} | ${item.dueDate || ""} | ${item.summary || ""} | ${item.type || ""} | ${item.deliverableText || ""}`.trim())
    .join("\n");
}

function getCasesForWorkshop(workshopId) {
  return (workshopResourcesCache.cases || [])
    .filter((caseItem) => caseItem && caseItem.workshopId === workshopId)
    .sort((a, b) => {
      const noA = String(a.caseNo || "9999").padStart(4, "0");
      const noB = String(b.caseNo || "9999").padStart(4, "0");
      if (noA !== noB) {
        return noA.localeCompare(noB, "ja");
      }
      return (a.dueDate || "9999-99-99").localeCompare(b.dueDate || "9999-99-99");
    });
}

function getActiveCasesForWorkshop(workshopId) {
  return getCasesForWorkshop(workshopId).filter((caseItem) => caseItem.active !== false);
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

  if (workshopResourceDeadlinesText) {
    workshopResourceDeadlinesText.value = "";
  }

  if (workshopResourceCasesText) {
    workshopResourceCasesText.value = "";
  }

  renderWorkshopCaseCards([]);
}

async function deleteWorkshopResource(workshop) {
  const title = workshop.title || "無題のワークショップ";
  const caseCount = getCasesForWorkshop(workshop.id).length;
  const ok = confirm(`「${title}」を削除します。\n\nこのワークショップ、教材リンク、提出期限、関連する案件${caseCount}件を管理データから削除します。\nこの操作は元に戻せません。削除してよろしいですか？`);
  if (!ok) {
    return;
  }

  workshopResourcesCache.workshops = (workshopResourcesCache.workshops || []).filter((item) => item.id !== workshop.id);
  workshopResourcesCache.cases = (workshopResourcesCache.cases || []).filter((caseItem) => caseItem.workshopId !== workshop.id);
  workshopResourcesCache.guides = (workshopResourcesCache.guides || []).filter((guide) => guide.workshopId !== workshop.id);

  if (editingWorkshopResourceId?.value === workshop.id) {
    resetWorkshopResourceForm();
    setWorkshopFormOpen(false);
  }

  await persistWorkshopResources();
  renderWorkshopResourceAdminList();

  if (workshopPreviewPanel && !workshopPreviewPanel.classList.contains("hidden")) {
    renderWorkshopPreview();
  }

  if (workshopResourceMessage) {
    workshopResourceMessage.style.color = "green";
    workshopResourceMessage.textContent = `「${title}」を削除しました。`;
  }
}

function renderWorkshopResourceAdminList() {
  if (!workshopResourceList) {
    return;
  }

  const hiddenCount = (workshopResourcesCache.workshops || []).filter((workshop) => workshop.active === false).length;
  if (hiddenCount === 0) {
    showInactiveWorkshops = false;
  }
  const workshops = getSortedWorkshopsForAdmin();

  if (toggleHiddenWorkshopsButton) {
    toggleHiddenWorkshopsButton.disabled = hiddenCount === 0;
    toggleHiddenWorkshopsButton.textContent = showInactiveWorkshops
      ? "非表示のワークショップを隠す"
      : `非表示のワークショップを表示${hiddenCount ? `（${hiddenCount}件）` : ""}`;
  }

  workshopResourceList.innerHTML = "";

  if (workshops.length === 0) {
    workshopResourceList.innerHTML = hiddenCount > 0
      ? `<div class="calendar-filter-empty">表示中のワークショップはありません。非表示のワークショップを表示すると確認できます。</div>`
      : `<div class="calendar-filter-empty">まだワークショップが登録されていません。</div>`;
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
    const caseCount = getActiveCasesForWorkshop(workshop.id).length;
    meta.textContent = `${workshop.active === false ? "非表示" : "表示中"} ／ 案件${caseCount}件 ／ リンク${linkCount}件 ／ 提出期限${deadlineCount}件`;

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
      setWorkshopAdminMode("edit");
      setWorkshopFormOpen(true);
      workshopResourceFormTitle.textContent = "編集中";
      editingWorkshopResourceId.value = workshop.id;
      workshopResourceActive.checked = workshop.active !== false;
      workshopResourceTitle.value = workshop.title || "";
      workshopResourceScheduleText.value = workshop.scheduleText || "";
      workshopResourceDescription.value = workshop.description || "";
      workshopResourceLinksText.value = formatWorkshopLinksForTextarea(workshop.links || []);

      if (workshopResourceDeadlinesText) {
        workshopResourceDeadlinesText.value = formatWorkshopDeadlinesForTextarea(workshop.deadlines || []);
      }

      if (workshopResourceCasesText) {
        const cases = getCasesForWorkshop(workshop.id);
        workshopResourceCasesText.value = formatWorkshopCasesForTextarea(cases);
        renderWorkshopCaseCards(cases);
      }

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
      if (workshopPreviewPanel && !workshopPreviewPanel.classList.contains("hidden")) {
        renderWorkshopPreview();
      }
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "small-button danger-button";
    deleteButton.textContent = "削除";
    deleteButton.addEventListener("click", async () => {
      await deleteWorkshopResource(workshop);
    });

    buttons.appendChild(editButton);
    buttons.appendChild(hideButton);
    buttons.appendChild(deleteButton);

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

  let docSnap = null;
  let loadedOfficeId = getCurrentOfficeId();

  for (const candidateOfficeId of getCompatibleOfficeIds()) {
    const candidateSnap = await getDoc(doc(db, "system", getWorkshopResourcesDocId(candidateOfficeId)));

    if (!candidateSnap.exists()) {
      continue;
    }

    docSnap = candidateSnap;
    loadedOfficeId = candidateOfficeId;

    const data = candidateSnap.data() || {};
    const hasContent = (Array.isArray(data.workshops) && data.workshops.length > 0)
      || (Array.isArray(data.cases) && data.cases.length > 0)
      || (Array.isArray(data.guides) && data.guides.length > 0);

    if (hasContent) {
      break;
    }
  }

  if (docSnap?.exists()) {
    const data = docSnap.data();
    workshopResourcesCache = {
      schemaVersion: data.schemaVersion || 2,
      officeId: normalizeOfficeId(data.officeId || loadedOfficeId || getCurrentOfficeId()),
      groupId: data.groupId || getCurrentGroupId(),
      workshops: Array.isArray(data.workshops) ? data.workshops : [],
      cases: Array.isArray(data.cases) ? data.cases : [],
      guides: Array.isArray(data.guides) ? data.guides : []
    };
  } else {
    workshopResourcesCache = {
      schemaVersion: 2,
      officeId: getCurrentOfficeId(),
      groupId: getCurrentGroupId(),
      workshops: [],
      cases: [],
      guides: []
    };
  }

  workshopResourcesLoaded = true;
  renderWorkshopResourceAdminList();
  console.log(`[Read節約] ワークショップ・教材管理：${getWorkshopResourcesDocId()} を開いた時だけ1 readしました。案件も同じドキュメント内で取得します。`);
}

function cleanWorkshop(workshop) {
  return {
    id: workshop.id,
    title: workshop.title || "",
    active: workshop.active !== false,
    description: workshop.description || "",
    summary: workshop.summary || "",
    scheduleText: workshop.scheduleText || "",
    order: typeof workshop.order === "number" ? workshop.order : 9999,
    links: Array.isArray(workshop.links) ? workshop.links : [],
    deadlines: Array.isArray(workshop.deadlines) ? workshop.deadlines : [],
    createdAt: workshop.createdAt || new Date().toISOString(),
    updatedAt: workshop.updatedAt || new Date().toISOString()
  };
}

function cleanCase(caseItem) {
  return {
    id: caseItem.id || generateSmallId("case"),
    workshopId: caseItem.workshopId || "",
    caseNo: normalizeCaseNo(caseItem.caseNo || ""),
    title: caseItem.title || "",
    type: caseItem.type || "",
    status: caseItem.status || "",
    dueDate: caseItem.dueDate || "",
    summary: caseItem.summary || caseItem.description || "",
    deliverableText: caseItem.deliverableText || "",
    requirements: Array.isArray(caseItem.requirements) ? caseItem.requirements : [],
    checklist: Array.isArray(caseItem.checklist) ? caseItem.checklist : [],
    active: caseItem.active !== false,
    createdAt: caseItem.createdAt || new Date().toISOString(),
    updatedAt: caseItem.updatedAt || new Date().toISOString()
  };
}

async function persistWorkshopResources() {
  const docRef = doc(db, "system", getWorkshopResourcesDocId());
  const cleanedWorkshops = (workshopResourcesCache.workshops || []).map(cleanWorkshop);
  const cleanedCases = (workshopResourcesCache.cases || []).map(cleanCase);
  const cleanedGuides = (workshopResourcesCache.guides || []).map((guide) => ({
    id: guide.id || generateSmallId("guide"),
    workshopId: guide.workshopId || "",
    title: guide.title || "",
    body: guide.body || guide.note || "",
    active: guide.active !== false,
    createdAt: guide.createdAt || new Date().toISOString(),
    updatedAt: guide.updatedAt || new Date().toISOString()
  }));

  await setDoc(docRef, {
    schemaVersion: 2,
    officeId: getCurrentOfficeId(),
    groupId: getCurrentGroupId(),
    workshops: cleanedWorkshops,
    cases: cleanedCases,
    guides: cleanedGuides,
    updatedAt: serverTimestamp()
  });

  workshopResourcesCache = {
    ...workshopResourcesCache,
    schemaVersion: 2,
    workshops: cleanedWorkshops,
    cases: cleanedCases,
    guides: cleanedGuides
  };
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
  const targetWorkshopId = editingId || normalizeWorkshopId(title);
  const existingWorkshop = (workshopResourcesCache.workshops || []).find((workshop) => workshop.id === editingId);
  const nextWorkshop = {
    id: targetWorkshopId,
    title: title,
    active: workshopResourceActive.checked,
    description: (workshopResourceDescription.value || "").trim(),
    summary: existingWorkshop?.summary || "",
    scheduleText: (workshopResourceScheduleText.value || "").trim(),
    order: typeof existingWorkshop?.order === "number" ? existingWorkshop.order : 9999,
    links: parseWorkshopLinks(workshopResourceLinksText.value),
    deadlines: workshopResourceDeadlinesText
      ? parseWorkshopDeadlines(workshopResourceDeadlinesText.value)
      : Array.isArray(existingWorkshop?.deadlines) ? existingWorkshop.deadlines : [],
    createdAt: existingWorkshop?.createdAt || now,
    updatedAt: now
  };

  if (editingId) {
    workshopResourcesCache.workshops = (workshopResourcesCache.workshops || []).map((workshop) => {
      if (workshop.id !== editingId) {
        return workshop;
      }
      return nextWorkshop;
    });
  } else {
    workshopResourcesCache.workshops = [...(workshopResourcesCache.workshops || []), nextWorkshop];
  }

  const otherCases = (workshopResourcesCache.cases || []).filter((caseItem) => caseItem.workshopId !== targetWorkshopId);
  const nextCases = workshopCaseCardList
    ? collectWorkshopCaseCards(targetWorkshopId)
    : workshopResourceCasesText
      ? parseWorkshopCases(workshopResourceCasesText.value, targetWorkshopId)
      : getCasesForWorkshop(targetWorkshopId);

  workshopResourcesCache.cases = [...otherCases, ...nextCases];

  await persistWorkshopResources();
  resetWorkshopResourceForm();
  setWorkshopFormOpen(false);
  renderWorkshopResourceAdminList();

  if (workshopResourceMessage) {
    workshopResourceMessage.style.color = "green";
    workshopResourceMessage.textContent = "ワークショップ・案件情報を保存しました。";
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

    if (!await enforceMaintenanceAccess(userData)) {
      return;
    }

    await initializeGlobalAdminOfficeScope();
    await applyOfficeBrandName({
      ...userData,
      officeId: getCurrentOfficeId(),
      organizationId: getCurrentGroupId(),
      groupId: getCurrentGroupId(),
      officeName: selectedStaffOfficeContext?.name || ""
    });

    if (isCurrentStaffGlobalAdmin()) {
      staffInfo.textContent = `全体管理者｜${userData.name || user.email}`;
    } else if (userData.role === "admin") {
      staffInfo.textContent = "事業所管理者";
    } else {
      staffInfo.textContent = `支援員｜${userData.name || user.email}`;
    }

    if (staffAdminTopNav && userData.role === "admin") {
      staffAdminTopNav.classList.remove("hidden");
    }

    loadChatworkNavVisibility();
    loadBillingSafetyNotice();

    targetDate.value = getTodayDateId();

    const todayForAnnouncement = new Date();
    setDisplayedAnnouncementMonth(todayForAnnouncement.getFullYear(), todayForAnnouncement.getMonth());
    setDisplayedUserScheduleMonth(todayForAnnouncement.getFullYear(), todayForAnnouncement.getMonth());

    showDailyScheduleNotLoadedText();
    initializeStaffWeeklyReportSection();
    initializeUserMonthlyScheduleSection();
    loadAnnouncementCalendar();

  } else {
    window.location.href = "index.html";
  }
});

loadButton.addEventListener("click", () => {
  loadDailySchedules();
});

if (targetDate) {
  targetDate.addEventListener("click", () => {
    openNativeDatePicker(targetDate);
  });

  targetDate.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    openNativeDatePicker(targetDate);
  });
}

if (loadStaffDashboardButton) {
  loadStaffDashboardButton.addEventListener("click", () => {
    loadStaffDashboard();
  });
}


if (prevStaffWeeklyReportWeekButton) {
  prevStaffWeeklyReportWeekButton.addEventListener("click", () => {
    changeStaffWeeklyReportWeek(-1);
  });
}

if (nextStaffWeeklyReportWeekButton) {
  nextStaffWeeklyReportWeekButton.addEventListener("click", () => {
    changeStaffWeeklyReportWeek(1);
  });
}

if (loadStaffWeeklyReportsButton) {
  loadStaffWeeklyReportsButton.addEventListener("click", () => {
    loadStaffWeeklyReports();
  });
}

if (buildWeeklyReportsTextButton) {
  buildWeeklyReportsTextButton.addEventListener("click", () => {
    buildAllWeeklyReportsText();
  });
}

if (copyWeeklyReportsTextButton) {
  copyWeeklyReportsTextButton.addEventListener("click", () => {
    copyWeeklyReportsTextToClipboard();
  });
}

if (saveWeeklyReportFeedbackButton) {
  saveWeeklyReportFeedbackButton.addEventListener("click", () => {
    saveWeeklyReportFeedback();
  });
}


if (loadWorkshopResourcesButton) {
  loadWorkshopResourcesButton.addEventListener("click", async () => {
    try {
      loadWorkshopResourcesButton.disabled = true;
      loadWorkshopResourcesButton.textContent = "読み込み中...";

      if (workshopResourceAdminArea) {
        workshopResourceAdminArea.classList.remove("hidden");
      }

      await loadWorkshopResourcesForStaff();
      renderWorkshopCaseCards([]);
      resetWorkshopResourceForm();
      setWorkshopFormOpen(false);
      setWorkshopAdminMode("edit");

      if (workshopResourceMessage) {
        workshopResourceMessage.style.color = "green";
        workshopResourceMessage.textContent = "ワークショップ・案件管理を読み込みました。";
      }
    } catch (error) {
      console.error("教材・リンク集読み込みエラー:", error);
      if (workshopResourceMessage) {
        workshopResourceMessage.style.color = "red";
        workshopResourceMessage.textContent = `読み込みに失敗しました：${error.code || error.message}`;
      }
    } finally {
      loadWorkshopResourcesButton.disabled = false;
      loadWorkshopResourcesButton.textContent = "ワークショップ・案件管理を開く";
    }
  });
}

if (workshopEditModeButton) {
  workshopEditModeButton.addEventListener("click", () => {
    setWorkshopAdminMode("edit");
  });
}

if (workshopPreviewModeButton) {
  workshopPreviewModeButton.addEventListener("click", () => {
    setWorkshopAdminMode("preview");
  });
}

if (showWorkshopFormButton) {
  showWorkshopFormButton.addEventListener("click", () => {
    if (workshopFormOpen) {
      resetWorkshopResourceForm();
      setWorkshopFormOpen(false);
      return;
    }

    resetWorkshopResourceForm();
    setWorkshopAdminMode("edit");
    setWorkshopFormOpen(true);
    workshopResourceTitle?.focus();
  });
}

if (toggleHiddenWorkshopsButton) {
  toggleHiddenWorkshopsButton.addEventListener("click", () => {
    showInactiveWorkshops = !showInactiveWorkshops;
    renderWorkshopResourceAdminList();
    if (workshopPreviewPanel && !workshopPreviewPanel.classList.contains("hidden") && !hasWorkshopFormDraft()) {
      renderWorkshopPreviewPicker();
    }
  });
}

if (buildWorkshopCaseDraftButton) {
  buildWorkshopCaseDraftButton.addEventListener("click", () => {
    const rawText = workshopCaseRawText?.value || "";
    const lines = buildCaseDraftLinesFromRawText(rawText);
    renderCaseDraftPreview(lines);

    if (!lines.length) {
      if (workshopResourceMessage) {
        workshopResourceMessage.style.color = "red";
        workshopResourceMessage.textContent = "案件情報の下書きを作成できませんでした。案件Noや内容を含む文章を貼り付けてください。";
      }
      return;
    }

    appendCaseDraftLinesToTextarea(lines);

    if (workshopResourceMessage) {
      workshopResourceMessage.style.color = "green";
      workshopResourceMessage.textContent = `案件情報の下書きを${lines.length}件作成しました。内容を確認してから保存してください。`;
    }
  });
}

if (addWorkshopCaseCardButton) {
  addWorkshopCaseCardButton.addEventListener("click", () => {
    addWorkshopCaseCard();
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
    setWorkshopFormOpen(true);
    setWorkshopAdminMode("edit");
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
    if (isUserScheduleBulkRegistrationActive) {
      exitUserScheduleBulkRegistration({ restoreFilters: true });
    }
    currentUserScheduleViewMode = "list";
    await loadUserMonthlyScheduleView();
  });
}
if (userScheduleWeekViewButton) {
  userScheduleWeekViewButton.addEventListener("click", async () => {
    if (isUserScheduleBulkRegistrationActive) {
      exitUserScheduleBulkRegistration({ restoreFilters: true });
    }
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

  if (!weekIntersectsMonth(nextWeekStart, displayedUserScheduleYear, displayedUserScheduleMonth)) {
    setDisplayedUserScheduleMonth(nextWeekStart.getFullYear(), nextWeekStart.getMonth());
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
    if (isUserScheduleBulkRegistrationActive) {
      exitUserScheduleBulkRegistration({ restoreFilters: true });
    }
    setDisplayedUserScheduleMonth(displayedUserScheduleYear, displayedUserScheduleMonth - 1);
    displayedUserScheduleWeekStartDate = getDefaultWeekStartForMonth(displayedUserScheduleYear, displayedUserScheduleMonth);
    await loadUserMonthlyScheduleView();
  });
}

if (nextUserScheduleMonthButton) {
  nextUserScheduleMonthButton.addEventListener("click", async () => {
    if (isUserScheduleBulkRegistrationActive) {
      exitUserScheduleBulkRegistration({ restoreFilters: true });
    }
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

if (showAnnouncementsUserScheduleCheckbox) {
  showAnnouncementsUserScheduleCheckbox.addEventListener("change", async () => {
    await loadUserMonthlyScheduleView();
  });
}

bindExclusiveUserScheduleBulkCheckboxes(userScheduleBulkStatusCheckboxes);
bindExclusiveUserScheduleBulkCheckboxes(userScheduleBulkTimeCheckboxes);

if (userScheduleBulkRegisterButton) {
  userScheduleBulkRegisterButton.addEventListener("click", async () => {
    if (isUserScheduleBulkRegistrationActive) {
      await saveUserScheduleBulkRegistration();
    } else {
      await startUserScheduleBulkRegistration();
    }
  });
}

if (userScheduleBulkCancelButton) {
  userScheduleBulkCancelButton.addEventListener("click", async () => {
    if (!isUserScheduleBulkRegistrationActive) {
      return;
    }

    if (userScheduleMessage) {
      userScheduleMessage.textContent = "";
    }
    exitUserScheduleBulkRegistration({ restoreFilters: true });
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

if (userScheduleUserSearchInput) {
  userScheduleUserSearchInput.addEventListener("input", () => {
    setUserScheduleUserSearchQuery(userScheduleUserSearchInput.value);
  });
}

if (clearUserScheduleUserSearchButton) {
  clearUserScheduleUserSearchButton.addEventListener("click", () => {
    if (userScheduleUserSearchInput) {
      userScheduleUserSearchInput.value = "";
      userScheduleUserSearchInput.focus();
    }
    setUserScheduleUserSearchQuery("");
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

if (openAdminPageButton) {
  openAdminPageButton.addEventListener("click", () => {
    window.location.href = "admin.html";
  });
}

if (openChatworkPageButton) {
  openChatworkPageButton.addEventListener("click", () => {
    window.location.href = "chatwork.html";
  });
}

logoutButton.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

if (announcementCategory) {
  announcementCategory.addEventListener("change", () => {
    renderAnnouncementWorkshopPicker();
  });
}

if (refreshAnnouncementWorkshopsButton) {
  refreshAnnouncementWorkshopsButton.addEventListener("click", async () => {
    workshopResourcesLoaded = false;
    await renderAnnouncementWorkshopPicker();
  });
}

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
  const selectedWorkshop = category === "workshop" && announcementWorkshopId.value
    ? (workshopResourcesCache.workshops || []).find((workshop) => workshop.id === announcementWorkshopId.value)
    : null;
  const sourceWorkshopId = category === "workshop" ? (selectedWorkshop?.id || announcementWorkshopId.value || "") : "";
  const sourceWorkshopTitle = category === "workshop" ? (selectedWorkshop?.title || (sourceWorkshopId ? title : "")) : "";

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
          sourceWorkshopId,
          sourceWorkshopTitle,
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
        sourceWorkshopId,
        sourceWorkshopTitle,
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


initializeStaffTabs();
