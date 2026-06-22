// STEP46_BILLING_SAFETY_MANUAL_CONTROLS_20260622_V76：課金安全状態をAdmin画面から表示テストできるよう追加
// STEP45_BILLING_SAFETY_MONITOR_20260622_V75：課金安全状態をAdmin画面に表示
// STEP44_ADMIN_TOP_SWITCHER_20260622_V74：管理者用ページ切り替えをヘッダーに常時表示
// STEP43_ADMIN_TO_STAFF_NAV_20260622_V73：管理者画面から支援員ページへ移動できる導線を追加
// STEP42_ADMIN_ROLE_FILTER_AND_NAV_20260622_V72：登録ユーザーの権限フィルターと管理者導線整理
// STEP41_ADMIN_USER_MANAGEMENT_20260622_V71：無料枠向けの利用者管理Adminページ
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
  collection,
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
const BILLING_SAFETY_DOC_ID = "billingSafety";

const adminInfo = document.getElementById("adminInfo");
const logoutButton = document.getElementById("logoutButton");
const openStaffPageButton = document.getElementById("openStaffPageButton");
const billingSafetyStatus = document.getElementById("billingSafetyStatus");
const reloadBillingSafetyButton = document.getElementById("reloadBillingSafetyButton");
const resetBillingSafetyButton = document.getElementById("resetBillingSafetyButton");
const testBillingWarningButton = document.getElementById("testBillingWarningButton");
const testBillingLockedButton = document.getElementById("testBillingLockedButton");
const adminUserSummary = document.getElementById("adminUserSummary");
const adminUserList = document.getElementById("adminUserList");
const adminUserRoleFilterButtons = document.querySelectorAll("[data-admin-role-filter]");
const adminUserForm = document.getElementById("adminUserForm");
const adminUserFormTitle = document.getElementById("adminUserFormTitle");
const adminUserUid = document.getElementById("adminUserUid");
const adminUserName = document.getElementById("adminUserName");
const adminUserEmail = document.getElementById("adminUserEmail");
const adminUserRole = document.getElementById("adminUserRole");
const adminUserActive = document.getElementById("adminUserActive");
const adminUserOfficeId = document.getElementById("adminUserOfficeId");
const adminUserGroupId = document.getElementById("adminUserGroupId");
const saveAdminUserButton = document.getElementById("saveAdminUserButton");
const resetAdminUserFormButton = document.getElementById("resetAdminUserFormButton");
const adminUserMessage = document.getElementById("adminUserMessage");
const reloadAdminUsersButton = document.getElementById("reloadAdminUsersButton");
const rebuildActiveUsersButton = document.getElementById("rebuildActiveUsersButton");

let currentUser = null;
let currentAdminData = null;
let adminUsersCache = [];
let editingAdminUserId = "";
let adminUserRoleFilter = "all";

function getCurrentOfficeId() {
  return currentAdminData?.officeId || DEFAULT_OFFICE_ID;
}

function getCurrentGroupId() {
  return currentAdminData?.groupId || DEFAULT_GROUP_ID;
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

    return (a.name || a.email || a.id || "").localeCompare(b.name || b.email || b.id || "", "ja");
  });
}

function normalizeAdminUser(docId, data) {
  return {
    id: docId,
    uid: docId,
    name: data?.name || data?.displayName || "",
    email: data?.email || "",
    role: data?.role || "user",
    active: data?.active === true,
    officeId: data?.officeId || getCurrentOfficeId(),
    groupId: data?.groupId || getCurrentGroupId()
  };
}

function normalizeActiveUserRecord(user) {
  if (!user || user.role === "staff" || user.role === "admin" || user.active !== true) {
    return null;
  }

  const officeId = user.officeId || getCurrentOfficeId();

  if (officeId !== getCurrentOfficeId()) {
    return null;
  }

  return {
    id: user.id,
    uid: user.id,
    name: user.name || user.email || "名前未設定",
    email: user.email || "",
    officeId: officeId,
    groupId: user.groupId || getCurrentGroupId(),
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

function renderBillingSafetyStatus(data, options = {}) {
  if (!billingSafetyStatus) {
    return;
  }

  const safetyData = data || {};
  const isLocked = safetyData.locked === true;
  const level = isLocked
    ? "locked"
    : safetyData.warning === true || safetyData.level === "warning"
      ? "warning"
      : "normal";
  const title = isLocked
    ? "課金安全ロックが有効です"
    : level === "warning"
      ? "課金安全チェック：注意"
      : "課金安全チェック：通常";
  const body = isLocked
    ? "将来の安全停止用フラグが locked=true です。現時点の実装では表示のみで、既存機能は停止していません。"
    : level === "warning"
      ? "注意状態が記録されています。BillingやFirestore使用量を確認してください。"
      : options.missing
        ? "system/billingSafety は未作成です。安全停止は未発動として扱っています。"
        : "安全停止は未発動です。";
  const updatedText = formatAdminTimestamp(safetyData.updatedAt || safetyData.lockedAt || safetyData.createdAt);
  const reason = safetyData.reason || safetyData.message || "";

  billingSafetyStatus.className = `admin-billing-safety-status ${level}`;
  billingSafetyStatus.innerHTML = "";

  const titleEl = document.createElement("div");
  titleEl.className = "admin-billing-safety-title";
  titleEl.textContent = title;

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
  badge.textContent = getRoleLabel(user.role);
  return badge;
}

function buildActiveBadge(user) {
  const badge = document.createElement("span");
  badge.className = user.active ? "admin-active-badge active" : "admin-active-badge inactive";
  badge.textContent = user.active ? "Active" : "停止中";
  return badge;
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
  meta.textContent = user.email || user.id;

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
  detail.textContent = `UID: ${user.id} / ${user.officeId || "-"} / ${user.groupId || "-"}`;

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
    empty.textContent = adminUserRoleFilter === "all"
      ? "登録ユーザーがいません。"
      : `${getAdminUserRoleFilterLabel(adminUserRoleFilter)}に該当する登録ユーザーがいません。`;
    adminUserList.appendChild(empty);
    return;
  }

  users.forEach((user) => {
    adminUserList.appendChild(renderAdminUserCard(user));
  });
}

function getFilteredAdminUsers() {
  if (adminUserRoleFilter === "all") {
    return adminUsersCache;
  }

  return adminUsersCache.filter((user) => user.role === adminUserRoleFilter);
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

  const snapshot = await getDocs(collection(db, "users"));
  const users = [];

  snapshot.forEach((docSnap) => {
    users.push(normalizeAdminUser(docSnap.id, docSnap.data() || {}));
  });

  adminUsersCache = sortAdminUsers(users);
  renderAdminUserSummary(adminUsersCache);
  renderFilteredAdminUserList();

  return adminUsersCache;
}

function resetAdminUserForm() {
  editingAdminUserId = "";
  adminUserFormTitle.textContent = "利用者を追加";
  adminUserUid.readOnly = false;
  adminUserUid.value = "";
  adminUserName.value = "";
  adminUserEmail.value = "";
  adminUserRole.value = "user";
  adminUserActive.checked = true;
  adminUserOfficeId.value = getCurrentOfficeId();
  adminUserGroupId.value = getCurrentGroupId();
  setAdminUserMessage("");
}

function setAdminUserForm(user) {
  editingAdminUserId = user.id;
  adminUserFormTitle.textContent = "ユーザーを編集";
  adminUserUid.readOnly = true;
  adminUserUid.value = user.id;
  adminUserName.value = user.name || "";
  adminUserEmail.value = user.email || "";
  adminUserRole.value = user.role || "user";
  adminUserActive.checked = user.active === true;
  adminUserOfficeId.value = user.officeId || getCurrentOfficeId();
  adminUserGroupId.value = user.groupId || getCurrentGroupId();
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
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "ja"));

  await setDoc(doc(db, "system", ACTIVE_USERS_DOC_ID), {
    officeId: getCurrentOfficeId(),
    groupId: getCurrentGroupId(),
    users: activeUsers,
    updatedAt: serverTimestamp(),
    updatedByUid: currentUser?.uid || "",
    updatedByName: currentAdminData?.name || currentUser?.email || ""
  }, { merge: true });

  if (!options.silent) {
    setAdminUserMessage(`利用者一覧キャッシュを更新しました。Activeな利用者 ${activeUsers.length}人。`, "green");
  }

  return activeUsers;
}

async function saveAdminUser(event) {
  event.preventDefault();

  const uid = adminUserUid.value.trim();
  const name = adminUserName.value.trim();
  const email = adminUserEmail.value.trim();
  const role = adminUserRole.value;
  const active = adminUserActive.checked;
  const officeId = adminUserOfficeId.value.trim() || getCurrentOfficeId();
  const groupId = adminUserGroupId.value.trim() || getCurrentGroupId();

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

  try {
    setButtonLoading(saveAdminUserButton, true, "保存中...", "保存");

    const userDocRef = doc(db, "users", uid);
    const userDocSnap = await getDoc(userDocRef);
    const nowFields = userDocSnap.exists()
      ? {}
      : {
          createdAt: serverTimestamp(),
          createdByUid: currentUser?.uid || "",
          createdByName: currentAdminData?.name || currentUser?.email || ""
        };

    await setDoc(userDocRef, {
      ...nowFields,
      name: name,
      email: email,
      role: role,
      active: active,
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
    setButtonLoading(saveAdminUserButton, false, "保存中...", "保存");
  }
}

async function toggleAdminUserActive(user) {
  const nextActive = !user.active;

  if (preventSelfLockout(user.id, user.role, nextActive)) {
    return;
  }

  try {
    await setDoc(doc(db, "users", user.id), {
      active: nextActive,
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

    adminInfo.textContent = `管理者｜${userData.name || user.email}`;
    resetAdminUserForm();
    await Promise.all([
      loadBillingSafetyStatus(),
      loadAdminUsers()
    ]);
  } catch (error) {
    console.error("Admin初期化エラー:", error);
    alert(`管理者ページの読み込みに失敗しました：${error.code || error.message}`);
  }
});

adminUserForm.addEventListener("submit", saveAdminUser);

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
    const ok = confirm("ロック表示テストを行います。現時点では表示だけで既存機能は止まりません。よろしいですか？");

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

if (openStaffPageButton) {
  openStaffPageButton.addEventListener("click", () => {
    window.location.href = "staff.html";
  });
}

logoutButton.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});
