// STEP55_OFFICE_ID_ENZINE_CHIBA_20260623_V85：事業所IDをenzine_chibaへ統一し旧engine_chibaを互換扱い
// STEP51_WEEKLY_REPORT_NEW_USER_START_20260622_V81：新規登録者の週一報告開始週を登録・キャッシュ
// STEP50_ADMIN_CONFIRM_INACTIVE_FILTER_SETTINGS_20260622_V80：重要操作の再確認・停止者フィルター・設定メニュー外クリック対応
// STEP49_ADMIN_AUTH_CREATE_USER_20260622_V79：Admin画面からFirebase Authユーザーも作成できる登録モードを追加
// STEP47_BILLING_SAFETY_TEST_LABEL_20260622_V77：手動テスト中であることを明示
// STEP46_BILLING_SAFETY_MANUAL_CONTROLS_20260622_V76：課金安全状態をAdmin画面から表示テストできるよう追加
// STEP45_BILLING_SAFETY_MONITOR_20260622_V75：課金安全状態をAdmin画面に表示
// STEP44_ADMIN_TOP_SWITCHER_20260622_V74：管理者用ページ切り替えをヘッダーに常時表示
// STEP43_ADMIN_TO_STAFF_NAV_20260622_V73：管理者画面から支援員ページへ移動できる導線を追加
// STEP42_ADMIN_ROLE_FILTER_AND_NAV_20260622_V72：登録ユーザーの権限フィルターと管理者導線整理
// STEP41_ADMIN_USER_MANAGEMENT_20260622_V71：無料枠向けの利用者管理Adminページ
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
import { applyOfficeBrandName, enforceMaintenanceAccess, setupSettingsMenuClose } from "./ui-common.js?v=84";

const DEFAULT_OFFICE_ID = "enzine_chiba";
const LEGACY_OFFICE_IDS = ["engine_chiba"];
const DEFAULT_GROUP_ID = "enzine";
const ACTIVE_USERS_DOC_ID = "activeUsers";
const BILLING_SAFETY_DOC_ID = "billingSafety";
const MAINTENANCE_DOC_ID = "maintenanceMode";
const WEEKLY_REPORT_START_WEEK = "2026-06-15";
const JST_OFFSET_MINUTES = 9 * 60;
const ADMIN_USER_MANUAL_SAVE_TEXT = "保存";
const ADMIN_USER_AUTH_SAVE_TEXT = "新規ユーザーを登録";
const createAuthUserAndProfile = httpsCallable(functions, "createAuthUserAndProfile");
const getChatworkConsoleData = httpsCallable(functions, "getChatworkConsoleData");
const getOrganizationManagementData = httpsCallable(functions, "getOrganizationManagementData");
const upsertOrganization = httpsCallable(functions, "upsertOrganization");
const upsertOffice = httpsCallable(functions, "upsertOffice");
const createOfficeAdminAccount = httpsCallable(functions, "createOfficeAdminAccount");
const setMaintenanceMode = httpsCallable(functions, "setMaintenanceMode");
const getAdminAuditLogs = httpsCallable(functions, "getAdminAuditLogs");

function getActiveUsersDocId(officeId) {
  return `${ACTIVE_USERS_DOC_ID}_${normalizeOfficeId(officeId)}`;
}

const adminInfo = document.getElementById("adminInfo");
const logoutButton = document.getElementById("logoutButton");
const openStaffPageButton = document.getElementById("openStaffPageButton");
const openChatworkPageButton = document.getElementById("openChatworkPageButton");
const maintenanceControlSection = document.getElementById("maintenanceControlSection");
const maintenanceControlStatus = document.getElementById("maintenanceControlStatus");
const maintenanceMessageInput = document.getElementById("maintenanceMessageInput");
const startMaintenanceButton = document.getElementById("startMaintenanceButton");
const stopMaintenanceButton = document.getElementById("stopMaintenanceButton");
const maintenanceControlMessage = document.getElementById("maintenanceControlMessage");
const adminAuditLogSection = document.getElementById("adminAuditLogSection");
const reloadAdminAuditLogsButton = document.getElementById("reloadAdminAuditLogsButton");
const adminAuditLogList = document.getElementById("adminAuditLogList");
const adminAuditLogMessage = document.getElementById("adminAuditLogMessage");
const adminBillingSafetySection = document.getElementById("adminBillingSafetySection");
const billingSafetyStatus = document.getElementById("billingSafetyStatus");
const reloadBillingSafetyButton = document.getElementById("reloadBillingSafetyButton");
const resetBillingSafetyButton = document.getElementById("resetBillingSafetyButton");
const testBillingWarningButton = document.getElementById("testBillingWarningButton");
const testBillingLockedButton = document.getElementById("testBillingLockedButton");
const adminUserSummary = document.getElementById("adminUserSummary");
const adminUserList = document.getElementById("adminUserList");
const adminUserRoleFilterButtons = document.querySelectorAll("[data-admin-role-filter]");
const adminUserCreateModeButtons = document.querySelectorAll("[data-admin-create-mode]");
const adminUserFormGuide = document.getElementById("adminUserFormGuide");
const adminUserCreateModeToggle = document.getElementById("adminUserCreateModeToggle");
const adminUserCreateModeNote = document.getElementById("adminUserCreateModeNote");
const adminUserForm = document.getElementById("adminUserForm");
const adminUserFormTitle = document.getElementById("adminUserFormTitle");
const adminUserUidLabel = document.getElementById("adminUserUidLabel");
const adminUserUid = document.getElementById("adminUserUid");
const adminUserName = document.getElementById("adminUserName");
const adminUserNameKana = document.getElementById("adminUserNameKana");
const adminUserEmail = document.getElementById("adminUserEmail");
const adminUserPasswordLabel = document.getElementById("adminUserPasswordLabel");
const adminUserPassword = document.getElementById("adminUserPassword");
const adminUserRole = document.getElementById("adminUserRole");
const adminUserActive = document.getElementById("adminUserActive");
const adminUserOfficeId = document.getElementById("adminUserOfficeId");
const adminUserGroupId = document.getElementById("adminUserGroupId");
const saveAdminUserButton = document.getElementById("saveAdminUserButton");
const resetAdminUserFormButton = document.getElementById("resetAdminUserFormButton");
const adminUserMessage = document.getElementById("adminUserMessage");
const reloadAdminUsersButton = document.getElementById("reloadAdminUsersButton");
const rebuildActiveUsersButton = document.getElementById("rebuildActiveUsersButton");
const adminUserMembershipFilters = document.getElementById("adminUserMembershipFilters");
const adminUserOrganizationFilter = document.getElementById("adminUserOrganizationFilter");
const adminUserOfficeFilter = document.getElementById("adminUserOfficeFilter");
const organizationManagementSection = document.getElementById("organizationManagementSection");
const organizationForm = document.getElementById("organizationForm");
const organizationIdInput = document.getElementById("organizationIdInput");
const organizationNameInput = document.getElementById("organizationNameInput");
const organizationActiveInput = document.getElementById("organizationActiveInput");
const saveOrganizationButton = document.getElementById("saveOrganizationButton");
const resetOrganizationButton = document.getElementById("resetOrganizationButton");
const officeForm = document.getElementById("officeForm");
const officeOrganizationSelect = document.getElementById("officeOrganizationSelect");
const officeIdInput = document.getElementById("officeIdInput");
const officeNameInput = document.getElementById("officeNameInput");
const officeActiveInput = document.getElementById("officeActiveInput");
const saveOfficeButton = document.getElementById("saveOfficeButton");
const resetOfficeButton = document.getElementById("resetOfficeButton");
const officeAdminForm = document.getElementById("officeAdminForm");
const officeAdminOrganizationSelect = document.getElementById("officeAdminOrganizationSelect");
const officeAdminOfficeSelect = document.getElementById("officeAdminOfficeSelect");
const officeAdminNameInput = document.getElementById("officeAdminNameInput");
const officeAdminNameKanaInput = document.getElementById("officeAdminNameKanaInput");
const officeAdminEmailInput = document.getElementById("officeAdminEmailInput");
const officeAdminPasswordInput = document.getElementById("officeAdminPasswordInput");
const createOfficeAdminButton = document.getElementById("createOfficeAdminButton");
const organizationManagementMessage = document.getElementById("organizationManagementMessage");
const organizationList = document.getElementById("organizationList");
const officeList = document.getElementById("officeList");
const adminUserScopeNote = document.getElementById("adminUserScopeNote");

let currentUser = null;
let currentAdminData = null;
let adminUsersCache = [];
let editingAdminUserId = "";
let adminUserRoleFilter = "all";
let adminUserCreateMode = "auth";
let maintenanceControlState = { active: false, message: "", scheduledEndText: "" };
let organizationManagementState = {
  organizations: [],
  offices: [],
  officeAdmins: []
};

setupSettingsMenuClose();

function getCurrentOfficeId() {
  return normalizeOfficeId(currentAdminData?.officeId);
}

function getCurrentGroupId() {
  return currentAdminData?.groupId || DEFAULT_GROUP_ID;
}

function getCurrentOrganizationId() {
  return currentAdminData?.organizationId || getCurrentGroupId();
}

function isCurrentAdminGlobal() {
  return currentAdminData?.accessScope === "global";
}

function setGlobalOnlyElementVisibility(element, shouldShow) {
  if (!element) {
    return;
  }

  element.hidden = !shouldShow;
  element.classList.toggle("hidden", !shouldShow);
}

function normalizeOfficeId(officeId) {
  const value = String(officeId || "").trim();
  if (!value || LEGACY_OFFICE_IDS.includes(value)) {
    return DEFAULT_OFFICE_ID;
  }
  return value;
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
    || user?.name
    || user?.displayName
    || user?.email
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

  return (a?.name || a?.email || a?.id || "").localeCompare(b?.name || b?.email || b?.id || "", "ja");
}

function setAdminUserMessage(text, color = "#555") {
  if (!adminUserMessage) {
    return;
  }

  adminUserMessage.style.color = color;
  adminUserMessage.textContent = text;
}

function setButtonLoading(button, isLoading, loadingText, defaultText) {
  if (!button) {
    return;
  }

  button.disabled = isLoading;
  button.textContent = isLoading ? loadingText : defaultText;
}

function setOrganizationManagementMessage(text, color = "#555") {
  if (!organizationManagementMessage) {
    return;
  }

  organizationManagementMessage.style.color = color;
  organizationManagementMessage.textContent = text;
}

function resetOrganizationForm() {
  if (!organizationForm) {
    return;
  }

  organizationIdInput.readOnly = false;
  organizationIdInput.value = "";
  organizationNameInput.value = "";
  organizationActiveInput.checked = true;
}

function resetOfficeForm() {
  if (!officeForm) {
    return;
  }

  officeIdInput.readOnly = false;
  officeIdInput.value = "";
  officeNameInput.value = "";
  officeActiveInput.checked = true;
}

function replaceSelectOptions(select, items, placeholder, selectedValue = "") {
  if (!select) {
    return;
  }

  const previousValue = selectedValue || select.value;
  select.textContent = "";

  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.textContent = placeholder;
  select.appendChild(placeholderOption);

  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = `${item.name}（${item.id}）${item.active ? "" : "［停止中］"}`;
    select.appendChild(option);
  });

  if (items.some((item) => item.id === previousValue)) {
    select.value = previousValue;
  }
}

function replaceAdminUserFilterOptions(select, items, allLabel, selectedValue = "all") {
  if (!select) {
    return;
  }

  select.textContent = "";

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = allLabel;
  select.appendChild(allOption);

  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name && item.name !== item.id
      ? `${item.name}（${item.id}）`
      : item.id;
    select.appendChild(option);
  });

  select.value = items.some((item) => item.id === selectedValue)
    ? selectedValue
    : "all";
}

function getAdminUserOrganizationId(user) {
  return String(user?.organizationId || user?.groupId || "").trim();
}

function getAdminUserOfficeId(user) {
  return normalizeOfficeId(user?.officeId || "");
}

function getAdminUserFilterOrganizations() {
  const organizations = new Map();

  organizationManagementState.organizations.forEach((organization) => {
    organizations.set(organization.id, organization);
  });

  adminUsersCache.forEach((user) => {
    const organizationId = getAdminUserOrganizationId(user);

    if (organizationId && !organizations.has(organizationId)) {
      organizations.set(organizationId, {
        id: organizationId,
        name: organizationId,
        active: true
      });
    }
  });

  return [...organizations.values()].sort((a, b) =>
    (a.name || a.id).localeCompare(b.name || b.id, "ja")
  );
}

function getAdminUserFilterOffices(organizationId = "all") {
  const offices = new Map();

  organizationManagementState.offices.forEach((office) => {
    if (organizationId === "all" || office.organizationId === organizationId) {
      offices.set(office.id, office);
    }
  });

  adminUsersCache.forEach((user) => {
    const userOrganizationId = getAdminUserOrganizationId(user);
    const officeId = getAdminUserOfficeId(user);

    if (
      officeId
      && (organizationId === "all" || userOrganizationId === organizationId)
      && !offices.has(officeId)
    ) {
      offices.set(officeId, {
        id: officeId,
        name: officeId,
        organizationId: userOrganizationId,
        active: true
      });
    }
  });

  return [...offices.values()].sort((a, b) =>
    (a.name || a.id).localeCompare(b.name || b.id, "ja")
  );
}

function syncAdminUserMembershipFilters({ resetOffice = false } = {}) {
  const isGlobalAdmin = isCurrentAdminGlobal();
  setGlobalOnlyElementVisibility(adminUserMembershipFilters, isGlobalAdmin);

  if (!isGlobalAdmin || !adminUserOrganizationFilter || !adminUserOfficeFilter) {
    return;
  }

  const selectedOrganizationId = adminUserOrganizationFilter.value || "all";
  const selectedOfficeId = resetOffice ? "all" : adminUserOfficeFilter.value || "all";
  const organizations = getAdminUserFilterOrganizations();

  replaceAdminUserFilterOptions(
    adminUserOrganizationFilter,
    organizations,
    "すべての会社",
    selectedOrganizationId
  );

  const effectiveOrganizationId = adminUserOrganizationFilter.value || "all";
  replaceAdminUserFilterOptions(
    adminUserOfficeFilter,
    getAdminUserFilterOffices(effectiveOrganizationId),
    "すべての事業所",
    selectedOfficeId
  );
}

function syncOfficeAdminOfficeOptions(selectedOfficeId = "") {
  if (!officeAdminOfficeSelect) {
    return;
  }

  const organizationId = officeAdminOrganizationSelect?.value || "";
  const offices = organizationManagementState.offices.filter(
    (office) => office.organizationId === organizationId
  );
  replaceSelectOptions(officeAdminOfficeSelect, offices, "事業所を選択", selectedOfficeId);
}

function syncOrganizationManagementSelects() {
  const organizations = organizationManagementState.organizations;
  replaceSelectOptions(officeOrganizationSelect, organizations, "運営会社を選択");
  replaceSelectOptions(officeAdminOrganizationSelect, organizations, "運営会社を選択");
  syncOfficeAdminOfficeOptions();
}

function buildManagementItem({ title, meta, active, onEdit }) {
  const item = document.createElement("article");
  item.className = active ? "organization-management-item" : "organization-management-item inactive";

  const header = document.createElement("div");
  header.className = "organization-management-item-header";

  const titleElement = document.createElement("div");
  titleElement.className = "organization-management-item-title";
  titleElement.textContent = title;

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "small-button";
  editButton.textContent = "編集";
  editButton.addEventListener("click", onEdit);

  const metaElement = document.createElement("div");
  metaElement.className = "organization-management-item-meta";
  metaElement.textContent = meta;

  header.appendChild(titleElement);
  header.appendChild(editButton);
  item.appendChild(header);
  item.appendChild(metaElement);
  return item;
}

function renderOrganizationManagementLists() {
  if (!organizationList || !officeList) {
    return;
  }

  organizationList.textContent = "";
  officeList.textContent = "";

  if (!organizationManagementState.organizations.length) {
    organizationList.textContent = "運営会社が登録されていません。";
  }

  organizationManagementState.organizations.forEach((organization) => {
    organizationList.appendChild(buildManagementItem({
      title: organization.name,
      meta: `ID: ${organization.id} / ${organization.active ? "Active" : "停止中"}`,
      active: organization.active,
      onEdit: () => {
        organizationIdInput.readOnly = true;
        organizationIdInput.value = organization.id;
        organizationNameInput.value = organization.name;
        organizationActiveInput.checked = organization.active;
        organizationNameInput.focus();
      }
    }));
  });

  if (!organizationManagementState.offices.length) {
    officeList.textContent = "事業所が登録されていません。";
  }

  organizationManagementState.offices.forEach((office) => {
    const organization = organizationManagementState.organizations.find(
      (item) => item.id === office.organizationId
    );
    const admins = organizationManagementState.officeAdmins.filter(
      (adminUser) => adminUser.officeId === office.id
    );
    const adminText = admins.length
      ? admins.map((adminUser) => `${adminUser.name}${adminUser.active ? "" : "［停止中］"}`).join("、")
      : "未登録";

    officeList.appendChild(buildManagementItem({
      title: office.name,
      meta: `ID: ${office.id} / 会社: ${organization?.name || office.organizationId || "-"} / 管理者: ${adminText}`,
      active: office.active,
      onEdit: () => {
        officeIdInput.readOnly = true;
        officeIdInput.value = office.id;
        officeNameInput.value = office.name;
        officeActiveInput.checked = office.active;
        officeOrganizationSelect.value = office.organizationId;
        officeNameInput.focus();
      }
    }));
  });
}

async function loadOrganizationManagement(options = {}) {
  if (!isCurrentAdminGlobal()) {
    setGlobalOnlyElementVisibility(organizationManagementSection, false);
    return null;
  }

  setGlobalOnlyElementVisibility(organizationManagementSection, true);

  if (!options.silent) {
    organizationList.textContent = "読み込み中...";
    officeList.textContent = "読み込み中...";
  }

  const result = await getOrganizationManagementData({});
  organizationManagementState = {
    organizations: Array.isArray(result?.data?.organizations) ? result.data.organizations : [],
    offices: Array.isArray(result?.data?.offices) ? result.data.offices : [],
    officeAdmins: Array.isArray(result?.data?.officeAdmins) ? result.data.officeAdmins : []
  };
  syncOrganizationManagementSelects();
  syncAdminUserMembershipFilters();
  renderOrganizationManagementLists();
  renderFilteredAdminUserList();
  return organizationManagementState;
}

async function saveOrganization(event) {
  event.preventDefault();
  const organizationId = organizationIdInput.value.trim().toLowerCase();
  const name = organizationNameInput.value.trim();
  const active = organizationActiveInput.checked;

  if (!organizationId || !name) {
    setOrganizationManagementMessage("運営会社IDと運営会社名を入力してください。", "red");
    return;
  }

  try {
    setButtonLoading(saveOrganizationButton, true, "保存中...", "会社を保存");
    await upsertOrganization({ organizationId, name, active });
    await loadOrganizationManagement({ silent: true });
    resetOrganizationForm();
    setOrganizationManagementMessage(`運営会社 ${name} を保存しました。`, "green");
  } catch (error) {
    console.error("運営会社保存エラー:", error);
    setOrganizationManagementMessage(`運営会社の保存に失敗しました：${getAdminUserErrorMessage(error)}`, "red");
  } finally {
    setButtonLoading(saveOrganizationButton, false, "保存中...", "会社を保存");
  }
}

async function saveOffice(event) {
  event.preventDefault();
  const organizationId = officeOrganizationSelect.value;
  const officeId = officeIdInput.value.trim().toLowerCase();
  const name = officeNameInput.value.trim();
  const active = officeActiveInput.checked;

  if (!organizationId || !officeId || !name) {
    setOrganizationManagementMessage("運営会社、事業所ID、事業所名を入力してください。", "red");
    return;
  }

  try {
    setButtonLoading(saveOfficeButton, true, "保存中...", "事業所を保存");
    await upsertOffice({ organizationId, officeId, name, active });
    await loadOrganizationManagement({ silent: true });
    resetOfficeForm();
    setOrganizationManagementMessage(`事業所 ${name} を保存しました。`, "green");
  } catch (error) {
    console.error("事業所保存エラー:", error);
    setOrganizationManagementMessage(`事業所の保存に失敗しました：${getAdminUserErrorMessage(error)}`, "red");
  } finally {
    setButtonLoading(saveOfficeButton, false, "保存中...", "事業所を保存");
  }
}

async function createOfficeAdmin(event) {
  event.preventDefault();
  const organizationId = officeAdminOrganizationSelect.value;
  const officeId = officeAdminOfficeSelect.value;
  const name = officeAdminNameInput.value.trim();
  const nameKana = cleanNameKana(officeAdminNameKanaInput.value);
  const email = officeAdminEmailInput.value.trim();
  const password = officeAdminPasswordInput.value;

  if (!organizationId || !officeId || !name || !email || password.length < 6) {
    setOrganizationManagementMessage("会社、事業所、名前、メール、6文字以上の初期パスワードを入力してください。", "red");
    return;
  }

  try {
    setButtonLoading(createOfficeAdminButton, true, "発行中...", "事業所管理者を発行");
    const result = await createOfficeAdminAccount({
      organizationId,
      officeId,
      name,
      nameKana,
      email,
      password
    });
    await loadOrganizationManagement({ silent: true });
    officeAdminNameInput.value = "";
    officeAdminNameKanaInput.value = "";
    officeAdminEmailInput.value = "";
    officeAdminPasswordInput.value = "";
    setOrganizationManagementMessage(
      `事業所管理者を発行しました。UID: ${result?.data?.uid || "確認中"}`,
      "green"
    );
  } catch (error) {
    console.error("事業所管理者発行エラー:", error);
    setOrganizationManagementMessage(`事業所管理者の発行に失敗しました：${getAdminUserErrorMessage(error)}`, "red");
  } finally {
    setButtonLoading(createOfficeAdminButton, false, "発行中...", "事業所管理者を発行");
  }
}

function applyAdminScopeToUserForm() {
  const isGlobalAdmin = isCurrentAdminGlobal();
  const adminRoleOption = adminUserRole?.querySelector('option[value="admin"]');

  setGlobalOnlyElementVisibility(organizationManagementSection, isGlobalAdmin);
  setGlobalOnlyElementVisibility(maintenanceControlSection, isGlobalAdmin);
  setGlobalOnlyElementVisibility(adminAuditLogSection, isGlobalAdmin);
  setGlobalOnlyElementVisibility(adminBillingSafetySection, isGlobalAdmin);
  setGlobalOnlyElementVisibility(adminUserCreateModeToggle, isGlobalAdmin);
  adminUserOfficeId.readOnly = !isGlobalAdmin;
  adminUserGroupId.readOnly = !isGlobalAdmin;

  if (!isGlobalAdmin) {
    adminUserOfficeId.value = getCurrentOfficeId();
    adminUserGroupId.value = getCurrentOrganizationId();
  }

  if (adminRoleOption) {
    adminRoleOption.disabled = !isGlobalAdmin && !editingAdminUserId;
  }

  if (adminUserScopeNote) {
    adminUserScopeNote.textContent = isGlobalAdmin
      ? "全体管理者として会社・事業所IDを指定できます。事業所管理者の発行は上の専用フォームを使ってください。"
      : `事業所管理者のため、運営会社ID ${getCurrentOrganizationId()}・事業所ID ${getCurrentOfficeId()} に固定されます。登録できる権限は支援員・利用者です。`;
  }

  if (adminUserFormGuide) {
    adminUserFormGuide.textContent = isGlobalAdmin
      ? "新規ユーザー登録を基本にし、移行・復旧時だけFirebase Authで作成済みのUIDを紐づけます。"
      : "支援員・利用者のログインアカウントを新規登録します。所属先は管理者の会社・事業所に固定されます。";
  }

  syncAdminUserMembershipFilters();
}

function getAdminUserSaveText() {
  if (editingAdminUserId || adminUserCreateMode !== "auth") {
    return ADMIN_USER_MANUAL_SAVE_TEXT;
  }

  return ADMIN_USER_AUTH_SAVE_TEXT;
}

function renderAdminUserCreateMode() {
  const isEditing = Boolean(editingAdminUserId);
  const effectiveMode = isEditing ? "uid" : adminUserCreateMode;
  const isAuthMode = effectiveMode === "auth";

  adminUserCreateModeButtons.forEach((button) => {
    const isActive = button.dataset.adminCreateMode === effectiveMode;
    button.classList.toggle("active", isActive);
    button.disabled = isEditing;
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });

  if (adminUserUidLabel) {
    adminUserUidLabel.classList.toggle("hidden", isAuthMode);
  }

  if (adminUserPasswordLabel) {
    adminUserPasswordLabel.classList.toggle("hidden", !isAuthMode);
  }

  if (!isAuthMode && adminUserPassword) {
    adminUserPassword.value = "";
  }

  if (adminUserCreateModeNote) {
    adminUserCreateModeNote.textContent = isEditing
      ? "編集中は新規登録ではなく、users の登録情報を更新します。"
      : isAuthMode
        ? "メールアドレスと初期パスワードでログインアカウントを作成し、利用者情報も同時に登録します。"
        : "Firebase Authで作成済みのUIDを、利用者情報として users に紐づけます。";
  }

  if (saveAdminUserButton) {
    saveAdminUserButton.textContent = getAdminUserSaveText();
  }
}

function setAdminUserCreateMode(mode) {
  adminUserCreateMode = mode === "uid" && isCurrentAdminGlobal() ? "uid" : "auth";
  renderAdminUserCreateMode();
}

function getAdminUserErrorMessage(error) {
  const code = error?.code || "";
  const message = error?.message || code || "不明なエラー";

  if (code.includes("already-exists")) {
    return "このメールアドレスはすでに登録されています。";
  }

  if (code.includes("invalid-argument")) {
    return "入力内容を確認してください。メールアドレス、名前、初期パスワードが必要です。";
  }

  if (code.includes("permission-denied")) {
    return "管理者権限を確認できませんでした。再ログインしてから試してください。";
  }

  if (code.includes("unauthenticated")) {
    return "ログイン状態を確認できませんでした。再ログインしてから試してください。";
  }

  return message;
}

function getActiveLabel(active) {
  return active ? "Active" : "停止中";
}

function getAdminUserDisplayName(user) {
  return user?.name || user?.email || user?.id || "名前未設定";
}

function formatImportantConfirm(title, lines) {
  const body = lines
    .filter((line) => line !== null && line !== undefined)
    .join("\n");

  return `${title}\n\n${body}\n\nこの操作を実行しますか？`;
}

function confirmImportantAction(title, lines) {
  return confirm(formatImportantConfirm(title, lines));
}

function buildUserConfirmLines({ uid, name, nameKana, email, role, active, officeId, groupId }) {
  return [
    uid ? `UID: ${uid}` : null,
    `名前: ${name || "未入力"}`,
    nameKana ? `ふりがな: ${nameKana}` : null,
    `メール: ${email || "未入力"}`,
    `権限: ${getRoleLabel(role)}`,
    `利用状態: ${getActiveLabel(active)}`,
    `事業所ID: ${officeId || "-"}`,
    `グループID: ${groupId || "-"}`
  ];
}

function formatAdminTimestamp(value) {
  if (!value) {
    return "未記録";
  }

  if (typeof value.toDate === "function") {
    return value.toDate().toLocaleString("ja-JP");
  }

  if (typeof value === "string") {
    return value;
  }

  return "未記録";
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

function getWeekStartDate(date) {
  const weekStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = weekStart.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  weekStart.setDate(weekStart.getDate() + diff);
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
}

function getDateFromTimestampLike(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value.toDate === "function") {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value.seconds === "number") {
    return new Date(value.seconds * 1000);
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function formatJstDateIdFromDate(date) {
  const jstDate = new Date(date.getTime() + JST_OFFSET_MINUTES * 60 * 1000);
  const yyyy = jstDate.getUTCFullYear();
  const mm = String(jstDate.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(jstDate.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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

function getWeeklyReportStartWeekIdForRegistrationDate(value) {
  const globalStartWeekId = getWeeklyReportGlobalStartWeekId();
  const createdAtDate = getDateFromTimestampLike(value);

  if (!createdAtDate) {
    return globalStartWeekId;
  }

  const createdDateId = formatJstDateIdFromDate(createdAtDate);
  const createdWeekId = formatDateId(getWeekStartDate(parseDateId(createdDateId)));

  return createdWeekId > globalStartWeekId ? createdWeekId : globalStartWeekId;
}

function getRoleLabel(role) {
  if (role === "admin") {
    return "管理者";
  }

  if (role === "staff") {
    return "支援員";
  }

  return "利用者";
}

function getAdminUserRoleFilterLabel(roleFilter) {
  if (roleFilter === "admin") {
    return "管理者";
  }

  if (roleFilter === "staff") {
    return "支援員";
  }

  if (roleFilter === "user") {
    return "利用者";
  }

  if (roleFilter === "inactive") {
    return "停止中";
  }

  return "すべて";
}

function sortAdminUsers(users) {
  const roleOrder = {
    user: 1,
    staff: 2,
    admin: 3
  };

  return [...users].sort((a, b) => {
    const roleDiff = (roleOrder[a.role] || 9) - (roleOrder[b.role] || 9);

    if (roleDiff !== 0) {
      return roleDiff;
    }

    const activeDiff = Number(b.active === true) - Number(a.active === true);

    if (activeDiff !== 0) {
      return activeDiff;
    }

    return compareUsersBySortName(a, b);
  });
}

function normalizeAdminUser(docId, data) {
  const nameKana = cleanNameKana(data?.nameKana || data?.kana || "");
  const fallbackName = data?.name || data?.displayName || data?.email || docId;

  return {
    id: docId,
    uid: docId,
    name: data?.name || data?.displayName || "",
    nameKana,
    sortName: data?.sortName || buildUserSortName(nameKana, fallbackName),
    email: data?.email || "",
    role: data?.role || "user",
    accessScope: data?.accessScope || (data?.role === "admin" ? "office" : data?.role === "user" ? "self" : "office"),
    active: data?.active === true,
    organizationId: data?.organizationId || data?.groupId || getCurrentOrganizationId(),
    officeId: normalizeOfficeId(data?.officeId || getCurrentOfficeId()),
    groupId: data?.groupId || getCurrentGroupId(),
    createdAt: data?.createdAt || null,
    weeklyReportStartWeek: getWeeklyReportStartWeekIdFromUserRecord(data)
  };
}

function normalizeActiveUserRecord(user) {
  if (!user || user.role === "staff" || user.role === "admin" || user.active !== true) {
    return null;
  }

  const officeId = normalizeOfficeId(user.officeId || getCurrentOfficeId());
  const nameKana = cleanNameKana(user.nameKana || user.kana || "");
  const fallbackName = user.name || user.displayName || user.email || user.id;

  if (!officeIdsMatch(officeId, getCurrentOfficeId())) {
    return null;
  }

  return {
    id: user.id,
    uid: user.id,
    name: user.name || user.email || "名前未設定",
    nameKana,
    sortName: user.sortName || buildUserSortName(nameKana, fallbackName),
    email: user.email || "",
    officeId,
    groupId: user.groupId || getCurrentGroupId(),
    weeklyReportStartWeek: user.weeklyReportStartWeek || getWeeklyReportStartWeekIdFromUserRecord(user),
    active: true
  };
}

function clearElement(element) {
  if (element) {
    element.textContent = "";
  }
}

function appendSummaryCard(parent, label, value, detail, toneClass = "") {
  const card = document.createElement("div");
  card.className = `operation-check-card ${toneClass}`.trim();

  const labelEl = document.createElement("div");
  labelEl.className = "operation-check-card-label";
  labelEl.textContent = label;

  const valueEl = document.createElement("div");
  valueEl.className = "operation-check-card-value";
  valueEl.textContent = value;

  const detailEl = document.createElement("div");
  detailEl.className = "operation-check-card-sub";
  detailEl.textContent = detail;

  card.appendChild(labelEl);
  card.appendChild(valueEl);
  card.appendChild(detailEl);
  parent.appendChild(card);
}

function renderAdminUserSummary(users) {
  if (!adminUserSummary) {
    return;
  }

  clearElement(adminUserSummary);
  const grid = document.createElement("div");
  grid.className = "operation-check-grid admin-summary-grid";

  const activeUsers = users.filter((user) => user.role === "user" && user.active === true);
  const inactiveUsers = users.filter((user) => user.active !== true);
  const staffUsers = users.filter((user) => user.role === "staff" && user.active === true);
  const adminUsers = users.filter((user) => user.role === "admin" && user.active === true);

  appendSummaryCard(grid, "利用者", `${activeUsers.length}人`, "Activeな利用者");
  appendSummaryCard(grid, "停止中", `${inactiveUsers.length}人`, "active=false");
  appendSummaryCard(grid, "支援員", `${staffUsers.length}人`, "Activeな支援員");
  appendSummaryCard(grid, "管理者", `${adminUsers.length}人`, "Activeな管理者");

  adminUserSummary.appendChild(grid);
}

function setMaintenanceControlMessage(text, color = "#555") {
  if (!maintenanceControlMessage) {
    return;
  }

  maintenanceControlMessage.style.color = color;
  maintenanceControlMessage.textContent = text;
}

function setAdminAuditLogMessage(text, color = "#555") {
  if (!adminAuditLogMessage) {
    return;
  }
  adminAuditLogMessage.style.color = color;
  adminAuditLogMessage.textContent = text;
}

function getAdminAuditActionLabel(action) {
  const labels = {
    "maintenance.started": "メンテナンス開始",
    "maintenance.ended": "メンテナンス解除",
    "organization.created": "運営会社作成",
    "organization.updated": "運営会社更新",
    "office.created": "事業所作成",
    "office.updated": "事業所更新",
    "office_id.migrated": "事業所ID移行",
    "user.create": "ユーザー作成",
    "user.update": "ユーザー更新",
    "user.delete": "ユーザー削除",
    "billing_safety.create": "課金安全状態作成",
    "billing_safety.update": "課金安全状態更新",
    "billing_safety.delete": "課金安全状態削除"
  };
  return labels[action] || action || "管理操作";
}

function formatAdminAuditTimestamp(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? "時刻確認中" : date.toLocaleString("ja-JP");
}

function renderAdminAuditLogs(logs) {
  if (!adminAuditLogList) {
    return;
  }

  adminAuditLogList.textContent = "";
  if (!logs.length) {
    adminAuditLogList.textContent = "監査ログはまだありません。";
    return;
  }

  logs.forEach((log) => {
    const item = document.createElement("article");
    item.className = "admin-audit-log-item";

    const header = document.createElement("div");
    header.className = "admin-audit-log-item-header";

    const title = document.createElement("strong");
    title.textContent = getAdminAuditActionLabel(log.action);
    const timestamp = document.createElement("span");
    timestamp.textContent = formatAdminAuditTimestamp(log.createdAt);
    header.appendChild(title);
    header.appendChild(timestamp);

    const targetParts = [
      log.targetType ? `対象: ${log.targetType}` : "",
      log.targetId ? `ID: ${log.targetId}` : "",
      log.targetRole ? `権限: ${getRoleLabel(log.targetRole)}` : "",
      log.targetState ? `状態: ${log.targetState}` : ""
    ].filter(Boolean);
    const target = document.createElement("div");
    target.className = "admin-audit-log-item-meta";
    target.textContent = targetParts.join(" / ") || "対象情報なし";

    const actorScope = log.actorAccessScope === "global" ? "全体管理者" : "事業所管理者";
    const actor = document.createElement("div");
    actor.className = "admin-audit-log-item-meta";
    actor.textContent = `操作者: ${actorScope}${log.actorUid ? ` / UID: ${log.actorUid}` : ""}`;

    const changes = document.createElement("div");
    changes.className = "admin-audit-log-item-changes";
    changes.textContent = Array.isArray(log.changedFields) && log.changedFields.length
      ? `変更項目: ${log.changedFields.join("、")}`
      : "変更項目: 記録なし";

    item.appendChild(header);
    item.appendChild(target);
    item.appendChild(actor);
    item.appendChild(changes);
    adminAuditLogList.appendChild(item);
  });
}

async function loadAdminAuditLogs(options = {}) {
  if (!isCurrentAdminGlobal()) {
    setGlobalOnlyElementVisibility(adminAuditLogSection, false);
    return [];
  }

  setGlobalOnlyElementVisibility(adminAuditLogSection, true);
  if (!options.silent && adminAuditLogList) {
    adminAuditLogList.textContent = "読み込み中...";
  }
  setAdminAuditLogMessage("");

  try {
    const result = await getAdminAuditLogs({ limit: 50 });
    const logs = Array.isArray(result?.data?.logs) ? result.data.logs : [];
    renderAdminAuditLogs(logs);
    if (result?.data?.hasMore === true) {
      setAdminAuditLogMessage("直近50件を表示しています。", "#555");
    }
    return logs;
  } catch (error) {
    console.error("管理監査ログ読み込みエラー:", error);
    if (adminAuditLogList) {
      adminAuditLogList.textContent = "監査ログを読み込めませんでした。";
    }
    setAdminAuditLogMessage(`読み込みに失敗しました：${getAdminUserErrorMessage(error)}`, "red");
    return [];
  }
}

function renderMaintenanceControlStatus(data = {}) {
  if (!maintenanceControlStatus) {
    return;
  }

  const active = data.active === true;
  const updatedText = formatAdminTimestamp(data.updatedAt);
  const updatedBy = data.updatedByName ? ` / 操作: ${data.updatedByName}` : "";

  maintenanceControlStatus.className = `maintenance-control-status ${active ? "active" : "normal"}`;
  maintenanceControlStatus.textContent = active
    ? `メンテナンス中 / 更新: ${updatedText}${updatedBy}`
    : `通常公開中 / 更新: ${updatedText}${updatedBy}`;

  startMaintenanceButton.disabled = active;
  stopMaintenanceButton.disabled = !active;
}

async function loadMaintenanceControlStatus() {
  if (!isCurrentAdminGlobal()) {
    setGlobalOnlyElementVisibility(maintenanceControlSection, false);
    return null;
  }

  setGlobalOnlyElementVisibility(maintenanceControlSection, true);
  const maintenanceSnap = await getDoc(doc(db, "system", MAINTENANCE_DOC_ID));
  maintenanceControlState = maintenanceSnap.exists()
    ? maintenanceSnap.data() || {}
    : { active: false, message: "", scheduledEndText: "" };

  // 旧「終了予定」の入力値が残っている場合も、新しい自由文入力へ引き継ぐ。
  maintenanceMessageInput.value = maintenanceControlState.scheduledEndText
    || maintenanceControlState.message
    || "";
  renderMaintenanceControlStatus(maintenanceControlState);
  return maintenanceControlState;
}

async function updateMaintenanceMode(active) {
  const actionLabel = active ? "メンテナンスを開始" : "メンテナンスを解除";
  const confirmationLines = active
    ? [
        "支援員・利用者はメンテナンス画面へ移動し、業務データへアクセスできなくなります。",
        "全体管理者・事業所管理者はメンテナンス中もアクセスできます。",
        "作業完了後は必ずメンテナンスを解除してください。"
      ]
    : [
        "支援員・利用者のアクセスを再開します。",
        "本番作業と確認が完了していることを確認してください。"
      ];

  if (!confirmImportantAction(`${actionLabel}します`, confirmationLines)) {
    setMaintenanceControlMessage(`${actionLabel}をキャンセルしました。`);
    return;
  }

  const targetButton = active ? startMaintenanceButton : stopMaintenanceButton;

  try {
    setButtonLoading(targetButton, true, "更新中...", actionLabel);
    await setMaintenanceMode({
      active,
      message: maintenanceMessageInput.value.trim(),
      scheduledEndText: ""
    });
    await loadMaintenanceControlStatus();
    setMaintenanceControlMessage(
      active
        ? "メンテナンスを開始しました。管理者以外のアクセスは停止されています。"
        : "メンテナンスを解除し、通常公開へ戻しました。",
      "green"
    );
  } catch (error) {
    console.error("メンテナンス切り替えエラー:", error);
    setMaintenanceControlMessage(`切り替えに失敗しました：${getAdminUserErrorMessage(error)}`, "red");
  } finally {
    setButtonLoading(targetButton, false, "更新中...", actionLabel);
    renderMaintenanceControlStatus(maintenanceControlState);
  }
}

function renderBillingSafetyStatus(data, options = {}) {
  if (!billingSafetyStatus) {
    return;
  }

  const safetyData = data || {};
  const isLocked = safetyData.locked === true;
  const reason = safetyData.reason || safetyData.message || "";
  const isManualTest = reason.includes("manual_warning_test")
    || reason.includes("manual_locked_display_test");
  const level = isLocked
    ? "locked"
    : safetyData.warning === true || safetyData.level === "warning"
      ? "warning"
      : "normal";
  const title = isManualTest
    ? "課金安全チェック：テスト中"
    : isLocked
    ? "課金安全ロックが有効です"
    : level === "warning"
      ? "課金安全チェック：注意"
      : "課金安全チェック：通常";
  const body = isManualTest
    ? "管理者による表示テスト中です。現時点では既存機能は停止していません。実際の課金停止や利用制限ではありません。"
    : isLocked
    ? "将来の安全停止用フラグが locked=true です。現時点の実装では表示のみで、既存機能は停止していません。"
    : level === "warning"
      ? "注意状態が記録されています。BillingやFirestore使用量を確認してください。"
      : options.missing
        ? "system/billingSafety は未作成です。安全停止は未発動として扱っています。"
        : "安全停止は未発動です。";
  const updatedText = formatAdminTimestamp(safetyData.updatedAt || safetyData.lockedAt || safetyData.createdAt);

  billingSafetyStatus.className = `admin-billing-safety-status ${level}`;
  billingSafetyStatus.innerHTML = "";

  const titleEl = document.createElement("div");
  titleEl.className = "admin-billing-safety-title";
  titleEl.textContent = title;

  if (isManualTest) {
    const testBadge = document.createElement("span");
    testBadge.className = "admin-billing-safety-test-badge";
    testBadge.textContent = "テスト中";
    titleEl.appendChild(testBadge);
  }

  const bodyEl = document.createElement("div");
  bodyEl.className = "admin-billing-safety-body";
  bodyEl.textContent = body;

  const metaEl = document.createElement("div");
  metaEl.className = "admin-billing-safety-meta";
  metaEl.textContent = reason
    ? `理由: ${reason} / 更新: ${updatedText}`
    : `更新: ${updatedText}`;

  billingSafetyStatus.appendChild(titleEl);
  billingSafetyStatus.appendChild(bodyEl);
  billingSafetyStatus.appendChild(metaEl);
}

async function loadBillingSafetyStatus(options = {}) {
  if (billingSafetyStatus && !options.silent) {
    billingSafetyStatus.className = "admin-billing-safety-status normal";
    billingSafetyStatus.textContent = "課金安全状態を確認中...";
  }

  const docSnap = await getDoc(doc(db, "system", BILLING_SAFETY_DOC_ID));

  if (!docSnap.exists()) {
    renderBillingSafetyStatus(null, { missing: true });
    return null;
  }

  const data = docSnap.data() || {};
  renderBillingSafetyStatus(data);
  return data;
}

async function loadChatworkNavVisibility() {
  if (!openChatworkPageButton) {
    return;
  }

  openChatworkPageButton.classList.add("hidden");

  try {
    const result = await getChatworkConsoleData({ includeConfig: false });
    const data = result?.data || {};
    const shouldShow = data.available === true || (data.canManage === true && data.attachable === true);
    openChatworkPageButton.classList.toggle("hidden", !shouldShow);
  } catch (error) {
    console.warn("Chatwork連携ナビの確認に失敗しました。", error);
  }
}

function buildBillingSafetyUpdate({ locked, warning, level, reason }) {
  return {
    locked: locked === true,
    warning: warning === true,
    level: level || "normal",
    reason: reason || "",
    updatedAt: serverTimestamp(),
    updatedByUid: currentUser?.uid || "",
    updatedByName: currentAdminData?.name || currentUser?.email || ""
  };
}

async function updateBillingSafetyStatus(nextState, successMessage) {
  await setDoc(
    doc(db, "system", BILLING_SAFETY_DOC_ID),
    buildBillingSafetyUpdate(nextState),
    { merge: true }
  );
  await loadBillingSafetyStatus({ silent: true });
  setAdminUserMessage(successMessage, "green");
}

function buildRoleBadge(user) {
  const badge = document.createElement("span");
  badge.className = `admin-role-badge role-${user.role || "user"}`;
  badge.textContent = user.role === "admin"
    ? user.accessScope === "global" ? "全体管理者" : "事業所管理者"
    : getRoleLabel(user.role);
  return badge;
}

function buildActiveBadge(user) {
  const badge = document.createElement("span");
  badge.className = user.active ? "admin-active-badge active" : "admin-active-badge inactive";
  badge.textContent = user.active ? "Active" : "停止中";
  return badge;
}

async function saveAdminUserKana(user, input, button) {
  const nameKana = cleanNameKana(input?.value || "");
  const sortName = buildUserSortName(nameKana, user.name || user.email || user.id);

  try {
    setButtonLoading(button, true, "保存中...", "保存");
    await setDoc(doc(db, "users", user.id), {
      nameKana,
      sortName,
      updatedAt: serverTimestamp(),
      updatedByUid: currentUser?.uid || "",
      updatedByName: currentAdminData?.name || currentUser?.email || ""
    }, { merge: true });

    await loadAdminUsers({ silent: true });
    await rebuildActiveUsersFromUsersCollection({ silent: true });
    setAdminUserMessage(`${user.name || user.email || user.id} のふりがなを保存しました。`, "green");
  } catch (error) {
    console.error("ふりがな保存エラー:", error);
    setAdminUserMessage(`ふりがなの保存に失敗しました：${error.code || error.message}`, "red");
  } finally {
    setButtonLoading(button, false, "保存中...", "保存");
  }
}

function renderAdminUserCard(user) {
  const card = document.createElement("article");
  card.className = user.active ? "admin-user-card" : "admin-user-card inactive";

  const header = document.createElement("div");
  header.className = "admin-user-card-header";

  const titleBox = document.createElement("div");
  titleBox.className = "admin-user-card-title-box";

  const title = document.createElement("h3");
  title.className = "admin-user-card-title";
  title.textContent = user.name || user.email || "名前未設定";

  const meta = document.createElement("div");
  meta.className = "admin-user-card-meta";
  meta.textContent = user.nameKana
    ? `ふりがな: ${user.nameKana} / ${user.email || user.id}`
    : user.email || user.id;

  titleBox.appendChild(title);
  titleBox.appendChild(meta);

  const badges = document.createElement("div");
  badges.className = "admin-user-card-badges";
  badges.appendChild(buildRoleBadge(user));
  badges.appendChild(buildActiveBadge(user));

  header.appendChild(titleBox);
  header.appendChild(badges);

  const detail = document.createElement("div");
  detail.className = "admin-user-card-detail";
  detail.textContent = `UID: ${user.id} / 会社: ${user.organizationId || user.groupId || "-"} / 事業所: ${user.officeId || "-"}`;

  const kanaRow = document.createElement("div");
  kanaRow.className = "admin-user-kana-row";

  const kanaLabel = document.createElement("label");
  kanaLabel.className = "admin-user-kana-label";
  kanaLabel.textContent = "ふりがな";

  const kanaInput = document.createElement("input");
  kanaInput.className = "admin-user-kana-input";
  kanaInput.type = "text";
  kanaInput.autocomplete = "off";
  kanaInput.placeholder = "例：やまだ はなこ";
  kanaInput.value = user.nameKana || "";

  const kanaButton = document.createElement("button");
  kanaButton.type = "button";
  kanaButton.className = "small-button";
  kanaButton.textContent = "保存";
  kanaButton.addEventListener("click", () => {
    saveAdminUserKana(user, kanaInput, kanaButton);
  });
  kanaInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    saveAdminUserKana(user, kanaInput, kanaButton);
  });

  kanaLabel.appendChild(kanaInput);
  kanaRow.appendChild(kanaLabel);
  kanaRow.appendChild(kanaButton);

  const actions = document.createElement("div");
  actions.className = "admin-user-card-actions";

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "small-button";
  editButton.textContent = "編集";
  editButton.addEventListener("click", () => {
    setAdminUserForm(user);
  });

  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.className = user.active ? "small-button danger-button" : "small-button";
  toggleButton.textContent = user.active ? "停止" : "Activeにする";
  toggleButton.addEventListener("click", async () => {
    await toggleAdminUserActive(user);
  });

  actions.appendChild(editButton);
  actions.appendChild(toggleButton);

  card.appendChild(header);
  card.appendChild(detail);
  card.appendChild(kanaRow);
  card.appendChild(actions);

  return card;
}

function renderAdminUserList(users) {
  if (!adminUserList) {
    return;
  }

  clearElement(adminUserList);

  if (!users.length) {
    const empty = document.createElement("div");
    empty.className = "calendar-filter-empty";
    const hasMembershipFilter = isCurrentAdminGlobal() && (
      (adminUserOrganizationFilter?.value || "all") !== "all"
      || (adminUserOfficeFilter?.value || "all") !== "all"
    );
    empty.textContent = adminUserRoleFilter === "all" && !hasMembershipFilter
      ? "登録ユーザーがいません。"
      : "選択した条件に該当する登録ユーザーがいません。";
    adminUserList.appendChild(empty);
    return;
  }

  users.forEach((user) => {
    adminUserList.appendChild(renderAdminUserCard(user));
  });
}

function getFilteredAdminUsers() {
  let users = adminUsersCache;

  if (isCurrentAdminGlobal()) {
    const organizationId = adminUserOrganizationFilter?.value || "all";
    const officeId = adminUserOfficeFilter?.value || "all";

    if (organizationId !== "all") {
      users = users.filter((user) => getAdminUserOrganizationId(user) === organizationId);
    }

    if (officeId !== "all") {
      users = users.filter((user) => officeIdsMatch(getAdminUserOfficeId(user), officeId));
    }
  }

  if (adminUserRoleFilter === "all") {
    return users;
  }

  if (adminUserRoleFilter === "inactive") {
    return users.filter((user) => user.active !== true);
  }

  return users.filter((user) => user.role === adminUserRoleFilter);
}

function renderFilteredAdminUserList() {
  renderAdminUserList(getFilteredAdminUsers());
}

function setAdminUserRoleFilter(roleFilter) {
  adminUserRoleFilter = roleFilter || "all";

  adminUserRoleFilterButtons.forEach((button) => {
    const isActive = button.dataset.adminRoleFilter === adminUserRoleFilter;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });

  renderFilteredAdminUserList();
}

async function loadAdminUsers(options = {}) {
  if (!options.silent) {
    clearElement(adminUserList);
    adminUserList.textContent = "読み込み中...";
  }

  const usersSource = isCurrentAdminGlobal()
    ? collection(db, "users")
    : query(
        collection(db, "users"),
        where("groupId", "==", getCurrentOrganizationId()),
        where("officeId", "==", getCurrentOfficeId()),
        where("role", "in", ["staff", "user"])
      );
  const snapshot = await getDocs(usersSource);
  const users = [];

  snapshot.forEach((docSnap) => {
    const normalizedUser = normalizeAdminUser(docSnap.id, docSnap.data() || {});
    const sameOffice = officeIdsMatch(normalizedUser.officeId, getCurrentOfficeId());
    const sameOrganization = !normalizedUser.organizationId
      || normalizedUser.organizationId === getCurrentOrganizationId();
    const isOfficeManageableRole = normalizedUser.role === "staff" || normalizedUser.role === "user";

    if (isCurrentAdminGlobal() || (isOfficeManageableRole && sameOffice && sameOrganization)) {
      users.push(normalizedUser);
    }
  });

  adminUsersCache = sortAdminUsers(users);
  syncAdminUserMembershipFilters();
  renderAdminUserSummary(adminUsersCache);
  renderFilteredAdminUserList();

  return adminUsersCache;
}

function resetAdminUserForm() {
  editingAdminUserId = "";
  adminUserFormTitle.textContent = "利用者を追加";
  adminUserUid.readOnly = false;
  adminUserUid.value = "";
  adminUserPassword.value = "";
  adminUserName.value = "";
  adminUserNameKana.value = "";
  adminUserEmail.value = "";
  adminUserRole.value = "user";
  adminUserActive.checked = true;
  adminUserOfficeId.value = getCurrentOfficeId();
  adminUserGroupId.value = getCurrentOrganizationId();
  setAdminUserCreateMode("auth");
  applyAdminScopeToUserForm();
  setAdminUserMessage("");
}

function setAdminUserForm(user) {
  editingAdminUserId = user.id;
  adminUserFormTitle.textContent = "ユーザーを編集";
  adminUserUid.readOnly = true;
  adminUserUid.value = user.id;
  adminUserPassword.value = "";
  adminUserName.value = user.name || "";
  adminUserNameKana.value = user.nameKana || "";
  adminUserEmail.value = user.email || "";
  adminUserRole.value = user.role || "user";
  adminUserActive.checked = user.active === true;
  adminUserOfficeId.value = normalizeOfficeId(user.officeId || getCurrentOfficeId());
  adminUserGroupId.value = user.organizationId || user.groupId || getCurrentOrganizationId();
  setAdminUserCreateMode("uid");
  applyAdminScopeToUserForm();
  setAdminUserMessage("編集中です。保存すると users の情報を更新します。", "#555");
}

function preventSelfLockout(uid, role, active) {
  if (!currentUser || uid !== currentUser.uid) {
    return false;
  }

  if (role !== "admin" || active !== true) {
    setAdminUserMessage("自分自身の管理者権限やActive状態はこの画面では変更できません。", "red");
    return true;
  }

  return false;
}

async function rebuildActiveUsersFromUsersCollection(options = {}) {
  const users = adminUsersCache.length ? adminUsersCache : await loadAdminUsers({ silent: true });
  const activeUsers = users
    .map(normalizeActiveUserRecord)
    .filter(Boolean)
    .sort(compareUsersBySortName);

  const officeId = getCurrentOfficeId();
  const organizationId = getCurrentOrganizationId();
  const isGlobalAdmin = isCurrentAdminGlobal();
  const officeCachePayload = {
    schemaVersion: 1,
    officeId,
    organizationId,
    groupId: organizationId,
    users: activeUsers,
    updatedAt: serverTimestamp(),
    updatedByUid: currentUser?.uid || "",
    updatedByName: currentAdminData?.name || currentUser?.email || ""
  };

  await setDoc(doc(db, "system", getActiveUsersDocId(officeId)), officeCachePayload, { merge: true });

  if (isGlobalAdmin) {
    const cacheRef = doc(db, "system", ACTIVE_USERS_DOC_ID);
    const cacheSnap = await getDoc(cacheRef);
    const currentData = cacheSnap.exists() ? cacheSnap.data() || {} : {};
    const currentOffices = currentData.offices && typeof currentData.offices === "object"
      ? currentData.offices
      : {};
    const cachePayload = {
      // 既存画面との互換用。事業所別画面は下の offices を優先して参照する。
      officeId,
      groupId: organizationId,
      users: activeUsers,
      offices: {
        ...currentOffices,
        [officeId]: {
          officeId,
          organizationId,
          groupId: organizationId,
          users: activeUsers,
          updatedAt: serverTimestamp(),
          updatedByUid: currentUser?.uid || "",
          updatedByName: currentAdminData?.name || currentUser?.email || ""
        }
      },
      updatedAt: serverTimestamp(),
      updatedByUid: currentUser?.uid || "",
      updatedByName: currentAdminData?.name || currentUser?.email || ""
    };
    await setDoc(cacheRef, cachePayload, { merge: true });
  }

  if (!options.silent) {
    setAdminUserMessage(`利用者一覧キャッシュを更新しました。Activeな利用者 ${activeUsers.length}人。`, "green");
  }

  return activeUsers;
}

async function saveAdminUserWithAuth({ name, nameKana, sortName, email, role, active, officeId, groupId }) {
  const password = adminUserPassword.value;

  if (!name) {
    setAdminUserMessage("名前を入力してください。", "red");
    return;
  }

  if (!email) {
    setAdminUserMessage("メールアドレスを入力してください。", "red");
    return;
  }

  if (!password || password.length < 6) {
    setAdminUserMessage("初期パスワードは6文字以上で入力してください。", "red");
    return;
  }

  const weeklyReportStartWeek = getWeeklyReportStartWeekIdForRegistrationDate(new Date());

  const ok = confirmImportantAction("新規ユーザーを登録します", [
    ...buildUserConfirmLines({ name, nameKana, email, role, active, officeId, groupId }),
    "",
    "Firebase Authentication にログインアカウントを作成し、users に利用者情報も同時登録します。",
    "初期パスワードを本人へ安全な方法で伝えてください。"
  ]);

  if (!ok) {
    setAdminUserMessage("新規ユーザー登録をキャンセルしました。", "#555");
    return;
  }

  try {
    setButtonLoading(saveAdminUserButton, true, "作成中...", getAdminUserSaveText());

    const result = await createAuthUserAndProfile({
      name,
      nameKana,
      sortName,
      email,
      password,
      role,
      active,
      organizationId: groupId,
      officeId,
      groupId,
      weeklyReportStartWeek
    });

    const createdUid = result?.data?.uid || "";

    if (createdUid) {
      await setDoc(doc(db, "users", createdUid), {
        weeklyReportStartWeek,
        updatedAt: serverTimestamp(),
        updatedByUid: currentUser?.uid || "",
        updatedByName: currentAdminData?.name || currentUser?.email || ""
      }, { merge: true });
    }

    await loadAdminUsers({ silent: true });
    await rebuildActiveUsersFromUsersCollection({ silent: true });
    resetAdminUserForm();
    setAdminUserMessage(
      createdUid
        ? `新規ユーザーを登録しました。UID: ${createdUid}`
        : "新規ユーザーを登録しました。",
      "green"
    );
  } catch (error) {
    console.error("Admin新規ユーザー登録エラー:", error);
    setAdminUserMessage(`新規ユーザー登録に失敗しました：${getAdminUserErrorMessage(error)}`, "red");
  } finally {
    setButtonLoading(saveAdminUserButton, false, "作成中...", getAdminUserSaveText());
  }
}

async function saveAdminUser(event) {
  event.preventDefault();

  const uid = adminUserUid.value.trim();
  const name = adminUserName.value.trim();
  const nameKana = cleanNameKana(adminUserNameKana.value);
  const email = adminUserEmail.value.trim();
  const role = adminUserRole.value;
  const active = adminUserActive.checked;
  const officeId = isCurrentAdminGlobal()
    ? normalizeOfficeId(adminUserOfficeId.value || getCurrentOfficeId())
    : getCurrentOfficeId();
  const groupId = isCurrentAdminGlobal()
    ? adminUserGroupId.value.trim() || getCurrentOrganizationId()
    : getCurrentOrganizationId();
  const sortName = buildUserSortName(nameKana, name || email || uid);

  if (!isCurrentAdminGlobal() && role === "admin" && !editingAdminUserId) {
    setAdminUserMessage("事業所管理者が登録できる権限は支援員・利用者です。", "red");
    return;
  }

  if (!editingAdminUserId && adminUserCreateMode === "auth") {
    await saveAdminUserWithAuth({
      name,
      nameKana,
      sortName,
      email,
      role,
      active,
      officeId,
      groupId
    });
    return;
  }

  if (!uid) {
    setAdminUserMessage("UIDを入力してください。", "red");
    return;
  }

  if (!name) {
    setAdminUserMessage("名前を入力してください。", "red");
    return;
  }

  if (preventSelfLockout(uid, role, active)) {
    return;
  }

  const saveTitle = editingAdminUserId
    ? "ユーザー情報を更新します"
    : "既存UIDを利用者情報に紐づけます";
  const ok = confirmImportantAction(saveTitle, [
    ...buildUserConfirmLines({ uid, name, nameKana, email, role, active, officeId, groupId }),
    "",
    editingAdminUserId
      ? "保存すると users の登録情報と利用者一覧キャッシュを更新します。"
      : "Firebase Authで作成済みのUIDを users に紐づけ、利用者一覧キャッシュを更新します。"
  ]);

  if (!ok) {
    setAdminUserMessage("保存をキャンセルしました。", "#555");
    return;
  }

  try {
    setButtonLoading(saveAdminUserButton, true, "保存中...", getAdminUserSaveText());

    const userDocRef = doc(db, "users", uid);
    const userDocSnap = await getDoc(userDocRef);
    const nowFields = userDocSnap.exists()
      ? {}
      : {
          createdAt: serverTimestamp(),
          weeklyReportStartWeek: getWeeklyReportStartWeekIdForRegistrationDate(new Date()),
          createdByUid: currentUser?.uid || "",
          createdByName: currentAdminData?.name || currentUser?.email || ""
        };

    await setDoc(userDocRef, {
      ...nowFields,
      name: name,
      nameKana: nameKana,
      sortName: sortName,
      email: email,
      role: role,
      accessScope: role === "admin" ? "office" : role === "user" ? "self" : "office",
      active: active,
      organizationId: groupId,
      officeId: officeId,
      groupId: groupId,
      updatedAt: serverTimestamp(),
      updatedByUid: currentUser?.uid || "",
      updatedByName: currentAdminData?.name || currentUser?.email || ""
    }, { merge: true });

    await loadAdminUsers({ silent: true });
    await rebuildActiveUsersFromUsersCollection({ silent: true });
    resetAdminUserForm();
    setAdminUserMessage("ユーザー情報を保存し、利用者一覧キャッシュを更新しました。", "green");
  } catch (error) {
    console.error("Adminユーザー保存エラー:", error);
    setAdminUserMessage(`保存に失敗しました：${error.code || error.message}`, "red");
  } finally {
    setButtonLoading(saveAdminUserButton, false, "保存中...", getAdminUserSaveText());
  }
}

async function toggleAdminUserActive(user) {
  const nextActive = !user.active;

  if (preventSelfLockout(user.id, user.role, nextActive)) {
    return;
  }

  const ok = confirmImportantAction(
    nextActive ? "ユーザーをActiveに戻します" : "ユーザーを停止します",
    [
      ...buildUserConfirmLines({
        uid: user.id,
        name: user.name,
        nameKana: user.nameKana,
        email: user.email,
        role: user.role,
        active: nextActive,
        officeId: user.officeId,
        groupId: user.groupId
      }),
      "",
      nextActive
        ? "Activeにすると、対象ユーザーは再びログイン・一覧表示の対象になります。"
        : "停止すると、対象ユーザーはログインできなくなり、Activeな利用者一覧から外れます。"
    ]
  );

  if (!ok) {
    setAdminUserMessage(`${getAdminUserDisplayName(user)} の${nextActive ? "Active化" : "停止"}をキャンセルしました。`, "#555");
    return;
  }

  try {
    await setDoc(doc(db, "users", user.id), {
      active: nextActive,
      organizationId: user.organizationId || user.groupId || getCurrentOrganizationId(),
      officeId: normalizeOfficeId(user.officeId || getCurrentOfficeId()),
      updatedAt: serverTimestamp(),
      updatedByUid: currentUser?.uid || "",
      updatedByName: currentAdminData?.name || currentUser?.email || ""
    }, { merge: true });

    await loadAdminUsers({ silent: true });
    await rebuildActiveUsersFromUsersCollection({ silent: true });
    setAdminUserMessage(`${user.name || user.email || user.id} を${nextActive ? "Active" : "停止中"}にしました。`, "green");
  } catch (error) {
    console.error("AdminユーザーActive切替エラー:", error);
    setAdminUserMessage(`Active切替に失敗しました：${error.code || error.message}`, "red");
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUser = user;

  try {
    const userDocSnap = await getDoc(doc(db, "users", user.uid));

    if (!userDocSnap.exists()) {
      alert("ユーザー情報が登録されていません。");
      window.location.href = "index.html";
      return;
    }

    const userData = userDocSnap.data() || {};
    currentAdminData = userData;

    if (userData.active !== true) {
      alert("このアカウントは現在利用できません。");
      window.location.href = "index.html";
      return;
    }

    if (userData.role !== "admin") {
      alert("このページは管理者専用です。");
      window.location.href = userData.role === "staff" ? "staff.html" : "user.html";
      return;
    }

    if (!await enforceMaintenanceAccess(userData)) {
      return;
    }

    const adminScopeLabel = userData.accessScope === "global" ? "全体管理者" : "事業所管理者";
    adminInfo.textContent = userData.accessScope === "global"
      ? `${adminScopeLabel}｜${userData.name || user.email}`
      : adminScopeLabel;
    await applyOfficeBrandName(userData);
    resetAdminUserForm();
    await Promise.all([
      isCurrentAdminGlobal() ? loadMaintenanceControlStatus() : Promise.resolve(null),
      isCurrentAdminGlobal() ? loadBillingSafetyStatus() : Promise.resolve(null),
      loadAdminUsers(),
      loadChatworkNavVisibility(),
      isCurrentAdminGlobal() ? loadOrganizationManagement() : Promise.resolve(null),
      isCurrentAdminGlobal() ? loadAdminAuditLogs() : Promise.resolve(null)
    ]);
  } catch (error) {
    console.error("Admin初期化エラー:", error);
    alert(`管理者ページの読み込みに失敗しました：${error.code || error.message}`);
  }
});

adminUserForm.addEventListener("submit", saveAdminUser);

if (organizationForm) {
  organizationForm.addEventListener("submit", saveOrganization);
}

if (officeForm) {
  officeForm.addEventListener("submit", saveOffice);
}

if (officeAdminForm) {
  officeAdminForm.addEventListener("submit", createOfficeAdmin);
}

if (reloadAdminAuditLogsButton) {
  reloadAdminAuditLogsButton.addEventListener("click", async () => {
    setButtonLoading(reloadAdminAuditLogsButton, true, "読み込み中...", "監査ログを再読み込み");
    await loadAdminAuditLogs();
    setButtonLoading(reloadAdminAuditLogsButton, false, "読み込み中...", "監査ログを再読み込み");
  });
}

if (officeAdminOrganizationSelect) {
  officeAdminOrganizationSelect.addEventListener("change", () => {
    syncOfficeAdminOfficeOptions();
  });
}

if (resetOrganizationButton) {
  resetOrganizationButton.addEventListener("click", resetOrganizationForm);
}

if (resetOfficeButton) {
  resetOfficeButton.addEventListener("click", resetOfficeForm);
}

resetAdminUserFormButton.addEventListener("click", () => {
  resetAdminUserForm();
});

reloadAdminUsersButton.addEventListener("click", async () => {
  try {
    setButtonLoading(reloadAdminUsersButton, true, "読み込み中...", "再読み込み");
    await loadAdminUsers();
    setAdminUserMessage("登録ユーザーを再読み込みしました。", "green");
  } catch (error) {
    console.error("Adminユーザー再読み込みエラー:", error);
    setAdminUserMessage(`再読み込みに失敗しました：${error.code || error.message}`, "red");
  } finally {
    setButtonLoading(reloadAdminUsersButton, false, "読み込み中...", "再読み込み");
  }
});

if (reloadBillingSafetyButton) {
  reloadBillingSafetyButton.addEventListener("click", async () => {
    try {
      setButtonLoading(reloadBillingSafetyButton, true, "確認中...", "安全状態を再確認");
      await loadBillingSafetyStatus();
      setAdminUserMessage("課金安全状態を再確認しました。", "green");
    } catch (error) {
      console.error("課金安全状態確認エラー:", error);
      renderBillingSafetyStatus({
        warning: true,
        reason: error.code || error.message,
        updatedAt: new Date().toLocaleString("ja-JP")
      });
      setAdminUserMessage(`課金安全状態の確認に失敗しました：${error.code || error.message}`, "red");
    } finally {
      setButtonLoading(reloadBillingSafetyButton, false, "確認中...", "安全状態を再確認");
    }
  });
}

if (resetBillingSafetyButton) {
  resetBillingSafetyButton.addEventListener("click", async () => {
    const ok = confirmImportantAction("課金安全状態を通常に戻します", [
      "system/billingSafety を normal 状態に更新します。",
      "現時点では表示用の状態更新で、既存機能の停止・再開は行いません。"
    ]);

    if (!ok) {
      setAdminUserMessage("課金安全状態のリセットをキャンセルしました。", "#555");
      return;
    }

    try {
      setButtonLoading(resetBillingSafetyButton, true, "更新中...", "通常に戻す");
      await updateBillingSafetyStatus({
        locked: false,
        warning: false,
        level: "normal",
        reason: "manual_reset"
      }, "課金安全状態を通常に戻しました。");
    } catch (error) {
      console.error("課金安全状態リセットエラー:", error);
      setAdminUserMessage(`課金安全状態のリセットに失敗しました：${error.code || error.message}`, "red");
    } finally {
      setButtonLoading(resetBillingSafetyButton, false, "更新中...", "通常に戻す");
    }
  });
}

if (testBillingWarningButton) {
  testBillingWarningButton.addEventListener("click", async () => {
    const ok = confirmImportantAction("注意表示テストを実行します", [
      "system/billingSafety を warning 状態に更新します。",
      "利用者・支援員ページにテスト中の表示が出ます。",
      "現時点では既存機能は停止しません。"
    ]);

    if (!ok) {
      setAdminUserMessage("注意表示テストをキャンセルしました。", "#555");
      return;
    }

    try {
      setButtonLoading(testBillingWarningButton, true, "更新中...", "注意テスト");
      await updateBillingSafetyStatus({
        locked: false,
        warning: true,
        level: "warning",
        reason: "manual_warning_test"
      }, "注意表示テストを反映しました。");
    } catch (error) {
      console.error("課金安全注意テストエラー:", error);
      setAdminUserMessage(`注意テストに失敗しました：${error.code || error.message}`, "red");
    } finally {
      setButtonLoading(testBillingWarningButton, false, "更新中...", "注意テスト");
    }
  });
}

if (testBillingLockedButton) {
  testBillingLockedButton.addEventListener("click", async () => {
    const ok = confirmImportantAction("ロック表示テストを実行します", [
      "system/billingSafety を locked 表示状態に更新します。",
      "利用者・支援員ページに強めのテスト中表示が出ます。",
      "現時点では表示だけで既存機能は停止しません。"
    ]);

    if (!ok) {
      return;
    }

    try {
      setButtonLoading(testBillingLockedButton, true, "更新中...", "ロック表示テスト");
      await updateBillingSafetyStatus({
        locked: true,
        warning: true,
        level: "locked",
        reason: "manual_locked_display_test"
      }, "ロック表示テストを反映しました。現時点では既存機能は停止していません。");
    } catch (error) {
      console.error("課金安全ロック表示テストエラー:", error);
      setAdminUserMessage(`ロック表示テストに失敗しました：${error.code || error.message}`, "red");
    } finally {
      setButtonLoading(testBillingLockedButton, false, "更新中...", "ロック表示テスト");
    }
  });
}

rebuildActiveUsersButton.addEventListener("click", async () => {
  const ok = confirmImportantAction("利用者一覧キャッシュを更新します", [
    isCurrentAdminGlobal()
      ? "users のActiveな利用者をもとに全体・事業所別キャッシュを再作成します。"
      : `自分の事業所 ${getCurrentOfficeId()} の利用者一覧キャッシュだけを再作成します。`,
    "停止中の利用者はActiveな利用者一覧から外れます。"
  ]);

  if (!ok) {
    setAdminUserMessage("利用者一覧キャッシュ更新をキャンセルしました。", "#555");
    return;
  }

  try {
    setButtonLoading(rebuildActiveUsersButton, true, "更新中...", "利用者一覧キャッシュ更新");
    await rebuildActiveUsersFromUsersCollection();
  } catch (error) {
    console.error("ActiveUsers再構築エラー:", error);
    setAdminUserMessage(`利用者一覧キャッシュ更新に失敗しました：${error.code || error.message}`, "red");
  } finally {
    setButtonLoading(rebuildActiveUsersButton, false, "更新中...", "利用者一覧キャッシュ更新");
  }
});

adminUserRoleFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setAdminUserRoleFilter(button.dataset.adminRoleFilter || "all");
  });
});

adminUserCreateModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setAdminUserCreateMode(button.dataset.adminCreateMode || "uid");
  });
});

if (adminUserOrganizationFilter) {
  adminUserOrganizationFilter.addEventListener("change", () => {
    syncAdminUserMembershipFilters({ resetOffice: true });
    renderFilteredAdminUserList();
  });
}

if (startMaintenanceButton) {
  startMaintenanceButton.addEventListener("click", () => {
    updateMaintenanceMode(true);
  });
}

if (stopMaintenanceButton) {
  stopMaintenanceButton.addEventListener("click", () => {
    updateMaintenanceMode(false);
  });
}

if (adminUserOfficeFilter) {
  adminUserOfficeFilter.addEventListener("change", () => {
    renderFilteredAdminUserList();
  });
}

if (openStaffPageButton) {
  openStaffPageButton.addEventListener("click", () => {
    window.location.href = "staff.html";
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
