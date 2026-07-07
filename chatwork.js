import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-functions.js";

import { app, auth } from "./firebase-config.js";
import { setupSettingsMenuClose } from "./ui-common.js?v=80";

const FUNCTIONS_REGION = "asia-northeast1";
const functions = getFunctions(app, FUNCTIONS_REGION);
const getChatworkConsoleData = httpsCallable(functions, "getChatworkConsoleData");
const saveChatworkIntegrationConfig = httpsCallable(functions, "saveChatworkIntegrationConfig");
const sendChatworkMessage = httpsCallable(functions, "sendChatworkMessage");

const chatworkUserInfo = document.getElementById("chatworkUserInfo");
const openAdminPageButton = document.getElementById("openAdminPageButton");
const openStaffPageButton = document.getElementById("openStaffPageButton");
const logoutButton = document.getElementById("logoutButton");
const chatworkUnavailableBox = document.getElementById("chatworkUnavailableBox");
const chatworkStatusBox = document.getElementById("chatworkStatusBox");
const chatworkStatusGuide = document.getElementById("chatworkStatusGuide");
const chatworkStatusPanel = document.getElementById("chatworkStatusPanel");
const chatworkSendBox = document.getElementById("chatworkSendBox");
const chatworkSettingsBox = document.getElementById("chatworkSettingsBox");
const chatworkTargetType = document.getElementById("chatworkTargetType");
const chatworkUserTargetLabel = document.getElementById("chatworkUserTargetLabel");
const chatworkUserTarget = document.getElementById("chatworkUserTarget");
const chatworkGroupTargetLabel = document.getElementById("chatworkGroupTargetLabel");
const chatworkGroupTarget = document.getElementById("chatworkGroupTarget");
const chatworkDirectRoomLabel = document.getElementById("chatworkDirectRoomLabel");
const chatworkDirectRoomId = document.getElementById("chatworkDirectRoomId");
const chatworkMessageBody = document.getElementById("chatworkMessageBody");
const sendChatworkMessageButton = document.getElementById("sendChatworkMessageButton");
const reloadChatworkDataButton = document.getElementById("reloadChatworkDataButton");
const chatworkSendMessage = document.getElementById("chatworkSendMessage");
const chatworkAvailableToggle = document.getElementById("chatworkAvailableToggle");
const chatworkEnabledToggle = document.getElementById("chatworkEnabledToggle");
const chatworkUserRoomList = document.getElementById("chatworkUserRoomList");
const chatworkGroupList = document.getElementById("chatworkGroupList");
const addChatworkGroupButton = document.getElementById("addChatworkGroupButton");
const saveChatworkSettingsButton = document.getElementById("saveChatworkSettingsButton");
const chatworkSettingsMessage = document.getElementById("chatworkSettingsMessage");

let currentUser = null;
let consoleData = null;
let groupDrafts = [];

setupSettingsMenuClose();

function setMessage(element, text, color = "#555") {
  if (!element) {
    return;
  }

  element.style.color = color;
  element.textContent = text;
}

function setButtonLoading(button, isLoading, loadingText, defaultText) {
  if (!button) {
    return;
  }

  button.disabled = isLoading;
  button.textContent = isLoading ? loadingText : defaultText;
}

function formatErrorMessage(error) {
  const code = error?.code || "";
  const message = error?.message || "不明なエラー";
  const details = error?.details || {};

  if (code.includes("permission-denied")) {
    return "この事業所または権限ではChatwork連携を利用できません。";
  }

  if (code.includes("failed-precondition")) {
    return "Chatwork連携が未設定、または送信が無効です。設定を確認してください。";
  }

  if (code.includes("invalid-argument")) {
    return "入力内容を確認してください。";
  }

  if (details.failedCount) {
    return `送信に失敗しました。失敗 ${details.failedCount}件。`;
  }

  return message;
}

function clearElement(element) {
  if (element) {
    element.textContent = "";
  }
}

function getConfiguredUsers() {
  return (consoleData?.users || []).filter((user) => {
    return user.chatworkActive === true && user.chatworkRoomId;
  });
}

function getActiveGroups() {
  return (groupDrafts || []).filter((group) => {
    return group.active !== false && (
      (Array.isArray(group.memberUserIds) && group.memberUserIds.length > 0)
      || (Array.isArray(group.roomIds) && group.roomIds.length > 0)
    );
  });
}

function updateHeader() {
  if (!consoleData) {
    return;
  }

  if (chatworkUserInfo) {
    const roleLabel = consoleData.callerRole === "admin" ? "管理者" : "支援員";
    chatworkUserInfo.textContent = `${roleLabel}｜${consoleData.officeId}`;
  }

  if (openAdminPageButton) {
    openAdminPageButton.classList.toggle("hidden", consoleData.canManage !== true);
  }
}

function renderStatusPanel() {
  if (!chatworkStatusPanel || !consoleData) {
    return;
  }

  const isAvailable = consoleData.available === true;
  const isEnabled = consoleData.enabled === true;
  const isAttachable = consoleData.attachable === true;
  const toneClass = !isAttachable
    ? "disabled"
    : isEnabled
      ? "enabled"
      : "paused";
  const title = !isAttachable
    ? "未提供"
    : isEnabled
      ? "送信有効"
      : isAvailable
        ? "送信停止中"
        : "切り離し中";
  const body = !isAttachable
    ? "この事業所ではChatwork連携を提供していません。"
    : isEnabled
      ? "登録済みの利用者ルームとグループへ送信できます。"
      : isAvailable
        ? "設定は保持したまま、メッセージ送信だけ停止しています。"
        : "管理サイトから見えない状態です。管理者はこのページから再接続できます。";
  const configuredUserCount = getConfiguredUsers().length;
  const activeGroupCount = getActiveGroups().length;

  chatworkStatusPanel.className = `chatwork-status-panel ${toneClass}`;
  chatworkStatusPanel.innerHTML = "";

  const titleEl = document.createElement("div");
  titleEl.className = "chatwork-status-title";
  titleEl.textContent = title;

  const bodyEl = document.createElement("div");
  bodyEl.className = "chatwork-status-body";
  bodyEl.textContent = body;

  const metaEl = document.createElement("div");
  metaEl.className = "chatwork-status-meta";
  metaEl.textContent = `利用者ルーム ${configuredUserCount}件 / グループ ${activeGroupCount}件`;

  chatworkStatusPanel.appendChild(titleEl);
  chatworkStatusPanel.appendChild(bodyEl);
  chatworkStatusPanel.appendChild(metaEl);

  if (chatworkStatusGuide) {
    chatworkStatusGuide.textContent = `${consoleData.officeId} のChatwork連携`;
  }
}

function renderSendTargetOptions() {
  if (!chatworkUserTarget || !chatworkGroupTarget || !consoleData) {
    return;
  }

  clearElement(chatworkUserTarget);
  const configuredUsers = getConfiguredUsers();

  if (!configuredUsers.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "設定済みの利用者がいません";
    chatworkUserTarget.appendChild(option);
  } else {
    configuredUsers.forEach((user) => {
      const option = document.createElement("option");
      option.value = user.uid;
      option.textContent = user.name || user.email || user.uid;
      chatworkUserTarget.appendChild(option);
    });
  }

  clearElement(chatworkGroupTarget);
  const activeGroups = getActiveGroups();

  if (!activeGroups.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "設定済みのグループがありません";
    chatworkGroupTarget.appendChild(option);
  } else {
    activeGroups.forEach((group) => {
      const option = document.createElement("option");
      option.value = group.id;
      option.textContent = group.name;
      chatworkGroupTarget.appendChild(option);
    });
  }
}

function updateTargetTypeVisibility() {
  const targetType = chatworkTargetType?.value || "user";
  const isAdmin = consoleData?.canManage === true;

  if (chatworkUserTargetLabel) {
    chatworkUserTargetLabel.classList.toggle("hidden", targetType !== "user");
  }

  if (chatworkGroupTargetLabel) {
    chatworkGroupTargetLabel.classList.toggle("hidden", targetType !== "group");
  }

  if (chatworkDirectRoomLabel) {
    chatworkDirectRoomLabel.classList.toggle("hidden", targetType !== "room" || !isAdmin);
  }
}

function renderSendSection() {
  if (!chatworkSendBox || !consoleData) {
    return;
  }

  const showSendBox = consoleData.available === true;
  chatworkSendBox.classList.toggle("hidden", !showSendBox);

  if (!showSendBox) {
    return;
  }

  if (chatworkTargetType) {
    const directRoomOption = Array.from(chatworkTargetType.options).find((option) => option.value === "room");
    if (directRoomOption) {
      directRoomOption.hidden = consoleData.canManage !== true;
      if (directRoomOption.hidden && chatworkTargetType.value === "room") {
        chatworkTargetType.value = "user";
      }
    }
  }

  renderSendTargetOptions();
  updateTargetTypeVisibility();

  if (sendChatworkMessageButton) {
    sendChatworkMessageButton.disabled = consoleData.enabled !== true;
  }
}

function buildUserRoomRow(user) {
  const row = document.createElement("div");
  row.className = "chatwork-user-room-row";
  row.dataset.uid = user.uid;

  const nameBox = document.createElement("div");
  nameBox.className = "chatwork-user-room-name";

  const name = document.createElement("div");
  name.className = "chatwork-user-room-title";
  name.textContent = user.name || user.email || user.uid;

  const meta = document.createElement("div");
  meta.className = "chatwork-user-room-meta";
  meta.textContent = user.email || user.uid;

  nameBox.appendChild(name);
  nameBox.appendChild(meta);

  const roomLabel = document.createElement("label");
  roomLabel.className = "chatwork-room-input-label";
  roomLabel.textContent = "ルームID";

  const roomInput = document.createElement("input");
  roomInput.className = "chatwork-room-id-input";
  roomInput.type = "text";
  roomInput.inputMode = "numeric";
  roomInput.autocomplete = "off";
  roomInput.placeholder = "123456789";
  roomInput.value = user.chatworkRoomId || "";
  roomLabel.appendChild(roomInput);

  const activeLabel = document.createElement("label");
  activeLabel.className = "chatwork-inline-checkbox";

  const activeInput = document.createElement("input");
  activeInput.className = "chatwork-room-active-input";
  activeInput.type = "checkbox";
  activeInput.checked = user.chatworkActive !== false;

  activeLabel.appendChild(activeInput);
  activeLabel.append("有効");

  row.appendChild(nameBox);
  row.appendChild(roomLabel);
  row.appendChild(activeLabel);

  return row;
}

function renderUserRoomList() {
  if (!chatworkUserRoomList || !consoleData) {
    return;
  }

  clearElement(chatworkUserRoomList);

  const users = consoleData.users || [];

  if (!users.length) {
    const empty = document.createElement("div");
    empty.className = "calendar-filter-empty";
    empty.textContent = "Activeな利用者がいません。";
    chatworkUserRoomList.appendChild(empty);
    return;
  }

  users.forEach((user) => {
    chatworkUserRoomList.appendChild(buildUserRoomRow(user));
  });
}

function normalizeGroupDraft(group, index) {
  const id = group?.id || `group_${Date.now()}_${index}`;
  return {
    id,
    name: group?.name || `グループ${index + 1}`,
    active: group?.active !== false,
    memberUserIds: Array.isArray(group?.memberUserIds) ? [...group.memberUserIds] : [],
    roomIds: Array.isArray(group?.roomIds) ? [...group.roomIds] : []
  };
}

function syncGroupDraftsFromConfig() {
  groupDrafts = (consoleData?.groups || []).map(normalizeGroupDraft);
}

function getUserNameById(uid) {
  const user = (consoleData?.users || []).find((item) => item.uid === uid);
  return user?.name || user?.email || uid;
}

function buildGroupCard(group, index) {
  const card = document.createElement("article");
  card.className = "chatwork-group-card";
  card.dataset.groupId = group.id;

  const header = document.createElement("div");
  header.className = "chatwork-group-card-header";

  const titleLabel = document.createElement("label");
  titleLabel.className = "chatwork-group-name-label";
  titleLabel.textContent = "グループ名";

  const titleInput = document.createElement("input");
  titleInput.className = "chatwork-group-name-input";
  titleInput.type = "text";
  titleInput.value = group.name || `グループ${index + 1}`;
  titleInput.placeholder = "例：午前連絡";
  titleInput.addEventListener("input", () => {
    group.name = titleInput.value.trim();
  });
  titleLabel.appendChild(titleInput);

  const actionBox = document.createElement("div");
  actionBox.className = "chatwork-group-card-actions";

  const activeLabel = document.createElement("label");
  activeLabel.className = "chatwork-inline-checkbox";

  const activeInput = document.createElement("input");
  activeInput.type = "checkbox";
  activeInput.checked = group.active !== false;
  activeInput.addEventListener("change", () => {
    group.active = activeInput.checked;
    renderSendSection();
  });

  activeLabel.appendChild(activeInput);
  activeLabel.append("有効");

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "small-button danger-button";
  deleteButton.textContent = "削除";
  deleteButton.addEventListener("click", () => {
    const ok = confirm(`${group.name || "このグループ"}を削除しますか？`);
    if (!ok) {
      return;
    }
    groupDrafts = groupDrafts.filter((item) => item.id !== group.id);
    renderGroupList();
    renderSendSection();
  });

  actionBox.appendChild(activeLabel);
  actionBox.appendChild(deleteButton);

  header.appendChild(titleLabel);
  header.appendChild(actionBox);

  const members = document.createElement("div");
  members.className = "chatwork-group-member-list";

  (consoleData?.users || []).forEach((user) => {
    const memberLabel = document.createElement("label");
    memberLabel.className = "chatwork-group-member";

    const memberInput = document.createElement("input");
    memberInput.type = "checkbox";
    memberInput.value = user.uid;
    memberInput.checked = group.memberUserIds.includes(user.uid);
    memberInput.addEventListener("change", () => {
      if (memberInput.checked && !group.memberUserIds.includes(user.uid)) {
        group.memberUserIds.push(user.uid);
      } else if (!memberInput.checked) {
        group.memberUserIds = group.memberUserIds.filter((uid) => uid !== user.uid);
      }
      renderSendSection();
    });

    const memberText = document.createElement("span");
    memberText.textContent = getUserNameById(user.uid);

    memberLabel.appendChild(memberInput);
    memberLabel.appendChild(memberText);
    members.appendChild(memberLabel);
  });

  const extraRoomLabel = document.createElement("label");
  extraRoomLabel.className = "chatwork-extra-room-label";
  extraRoomLabel.textContent = "追加ルームID";

  const extraRoomInput = document.createElement("textarea");
  extraRoomInput.className = "chatwork-extra-room-input";
  extraRoomInput.placeholder = "1行に1つ";
  extraRoomInput.value = (group.roomIds || []).join("\n");
  extraRoomInput.addEventListener("input", () => {
    group.roomIds = extraRoomInput.value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    renderSendSection();
  });

  extraRoomLabel.appendChild(extraRoomInput);

  card.appendChild(header);
  card.appendChild(members);
  card.appendChild(extraRoomLabel);

  return card;
}

function renderGroupList() {
  if (!chatworkGroupList) {
    return;
  }

  clearElement(chatworkGroupList);

  if (!groupDrafts.length) {
    const empty = document.createElement("div");
    empty.className = "calendar-filter-empty";
    empty.textContent = "グループがありません。";
    chatworkGroupList.appendChild(empty);
    return;
  }

  groupDrafts.forEach((group, index) => {
    chatworkGroupList.appendChild(buildGroupCard(group, index));
  });
}

function renderSettingsSection() {
  if (!chatworkSettingsBox || !consoleData) {
    return;
  }

  const showSettings = consoleData.canManage === true && consoleData.attachable === true;
  chatworkSettingsBox.classList.toggle("hidden", !showSettings);

  if (!showSettings) {
    return;
  }

  if (chatworkAvailableToggle) {
    chatworkAvailableToggle.checked = consoleData.available === true;
  }

  if (chatworkEnabledToggle) {
    chatworkEnabledToggle.checked = consoleData.enabled === true;
    chatworkEnabledToggle.disabled = consoleData.available !== true;
  }

  renderUserRoomList();
  renderGroupList();
}

function renderPage() {
  if (!consoleData) {
    return;
  }

  updateHeader();
  syncGroupDraftsFromConfig();

  const showUnavailable = consoleData.attachable !== true && consoleData.available !== true;

  if (chatworkUnavailableBox) {
    chatworkUnavailableBox.classList.toggle("hidden", !showUnavailable);
  }

  if (chatworkStatusBox) {
    chatworkStatusBox.classList.toggle("hidden", showUnavailable && consoleData.canManage !== true);
  }

  renderStatusPanel();
  renderSettingsSection();
  renderSendSection();
}

async function loadChatworkConsole() {
  setMessage(chatworkSendMessage, "");
  setMessage(chatworkSettingsMessage, "");

  if (chatworkStatusPanel) {
    chatworkStatusPanel.className = "chatwork-status-panel";
    chatworkStatusPanel.textContent = "読み込み中...";
  }

  const result = await getChatworkConsoleData({ includeConfig: true });
  consoleData = result.data || {};
  renderPage();
}

function collectRecipientsFromForm() {
  return Array.from(document.querySelectorAll(".chatwork-user-room-row")).map((row) => {
    const uid = row.dataset.uid || "";
    const roomInput = row.querySelector(".chatwork-room-id-input");
    const activeInput = row.querySelector(".chatwork-room-active-input");

    return {
      uid,
      roomId: roomInput?.value.trim() || "",
      active: activeInput?.checked === true
    };
  }).filter((recipient) => recipient.uid && recipient.roomId);
}

function collectGroupsFromForm() {
  return groupDrafts.map((group) => {
    return {
      id: group.id,
      name: group.name || "",
      active: group.active !== false,
      memberUserIds: Array.isArray(group.memberUserIds) ? group.memberUserIds : [],
      roomIds: Array.isArray(group.roomIds) ? group.roomIds : []
    };
  }).filter((group) => group.name && (group.memberUserIds.length || group.roomIds.length));
}

async function saveSettings() {
  if (!consoleData?.canManage) {
    return;
  }

  const available = chatworkAvailableToggle?.checked === true;
  const enabled = available && chatworkEnabledToggle?.checked === true;

  const ok = confirm(
    available
      ? `Chatwork連携を${enabled ? "送信有効" : "送信停止"}で保存しますか？`
      : "Chatwork連携を管理サイトから切り離しますか？"
  );

  if (!ok) {
    setMessage(chatworkSettingsMessage, "保存をキャンセルしました。", "#555");
    return;
  }

  try {
    setButtonLoading(saveChatworkSettingsButton, true, "保存中...", "設定を保存");
    const result = await saveChatworkIntegrationConfig({
      available,
      enabled,
      recipients: collectRecipientsFromForm(),
      groups: collectGroupsFromForm()
    });

    setMessage(
      chatworkSettingsMessage,
      `保存しました。利用者ルーム ${result?.data?.recipients || 0}件 / グループ ${result?.data?.groups || 0}件。`,
      "green"
    );
    await loadChatworkConsole();
  } catch (error) {
    console.error("Chatwork設定保存エラー:", error);
    setMessage(chatworkSettingsMessage, `保存に失敗しました：${formatErrorMessage(error)}`, "red");
  } finally {
    setButtonLoading(saveChatworkSettingsButton, false, "保存中...", "設定を保存");
  }
}

function getSendPayload() {
  const targetType = chatworkTargetType?.value || "user";
  const message = chatworkMessageBody?.value.trim() || "";

  if (targetType === "user") {
    return {
      targetType,
      targetId: chatworkUserTarget?.value || "",
      message
    };
  }

  if (targetType === "group") {
    return {
      targetType,
      targetId: chatworkGroupTarget?.value || "",
      message
    };
  }

  return {
    targetType,
    roomId: chatworkDirectRoomId?.value.trim() || "",
    message
  };
}

function getSendConfirmText(payload) {
  if (payload.targetType === "group") {
    const group = groupDrafts.find((item) => item.id === payload.targetId);
    return `${group?.name || "選択中のグループ"}へ送信しますか？`;
  }

  if (payload.targetType === "room") {
    return "直接指定したルームへ送信しますか？";
  }

  const user = (consoleData?.users || []).find((item) => item.uid === payload.targetId);
  return `${user?.name || "選択中の利用者"}へ送信しますか？`;
}

async function sendMessage() {
  if (consoleData?.enabled !== true) {
    setMessage(chatworkSendMessage, "Chatwork送信が無効です。", "red");
    return;
  }

  const payload = getSendPayload();

  if (!payload.message) {
    setMessage(chatworkSendMessage, "本文を入力してください。", "red");
    return;
  }

  const ok = confirm(getSendConfirmText(payload));

  if (!ok) {
    setMessage(chatworkSendMessage, "送信をキャンセルしました。", "#555");
    return;
  }

  try {
    setButtonLoading(sendChatworkMessageButton, true, "送信中...", "送信");
    const result = await sendChatworkMessage(payload);
    const sentCount = result?.data?.sentCount || 0;
    const failedCount = result?.data?.failedCount || 0;

    if (failedCount > 0) {
      setMessage(chatworkSendMessage, `送信しました。成功 ${sentCount}件 / 失敗 ${failedCount}件。`, "#9a5b16");
    } else {
      setMessage(chatworkSendMessage, `送信しました。成功 ${sentCount}件。`, "green");
      if (chatworkMessageBody) {
        chatworkMessageBody.value = "";
      }
    }
  } catch (error) {
    console.error("Chatwork送信エラー:", error);
    const details = error?.details || {};
    const sentCount = details.sentCount || 0;
    const failedCount = details.failedCount || 0;
    const suffix = failedCount ? ` 成功 ${sentCount}件 / 失敗 ${failedCount}件。` : "";
    setMessage(chatworkSendMessage, `送信に失敗しました：${formatErrorMessage(error)}${suffix}`, "red");
  } finally {
    setButtonLoading(sendChatworkMessageButton, false, "送信中...", "送信");
  }
}

if (openAdminPageButton) {
  openAdminPageButton.addEventListener("click", () => {
    window.location.href = "admin.html";
  });
}

if (openStaffPageButton) {
  openStaffPageButton.addEventListener("click", () => {
    window.location.href = "staff.html";
  });
}

if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "index.html";
  });
}

if (chatworkTargetType) {
  chatworkTargetType.addEventListener("change", () => {
    updateTargetTypeVisibility();
  });
}

if (chatworkAvailableToggle) {
  chatworkAvailableToggle.addEventListener("change", () => {
    if (chatworkEnabledToggle) {
      chatworkEnabledToggle.disabled = chatworkAvailableToggle.checked !== true;
      if (!chatworkAvailableToggle.checked) {
        chatworkEnabledToggle.checked = false;
      }
    }
  });
}

if (addChatworkGroupButton) {
  addChatworkGroupButton.addEventListener("click", () => {
    groupDrafts.push(normalizeGroupDraft({
      id: `group_${Date.now()}`,
      name: "",
      active: true,
      memberUserIds: [],
      roomIds: []
    }, groupDrafts.length));
    renderGroupList();
  });
}

if (saveChatworkSettingsButton) {
  saveChatworkSettingsButton.addEventListener("click", () => {
    saveSettings();
  });
}

if (sendChatworkMessageButton) {
  sendChatworkMessageButton.addEventListener("click", () => {
    sendMessage();
  });
}

if (reloadChatworkDataButton) {
  reloadChatworkDataButton.addEventListener("click", async () => {
    try {
      setButtonLoading(reloadChatworkDataButton, true, "読み込み中...", "再読み込み");
      await loadChatworkConsole();
      setMessage(chatworkSendMessage, "再読み込みしました。", "green");
    } catch (error) {
      console.error("Chatwork再読み込みエラー:", error);
      setMessage(chatworkSendMessage, `再読み込みに失敗しました：${formatErrorMessage(error)}`, "red");
    } finally {
      setButtonLoading(reloadChatworkDataButton, false, "読み込み中...", "再読み込み");
    }
  });
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUser = user;

  try {
    if (chatworkUserInfo) {
      chatworkUserInfo.textContent = `${currentUser.email || ""}｜確認中...`;
    }

    await loadChatworkConsole();
  } catch (error) {
    console.error("Chatworkページ初期化エラー:", error);
    alert(`Chatwork連携ページを開けません：${formatErrorMessage(error)}`);
    window.location.href = "staff.html";
  }
});
