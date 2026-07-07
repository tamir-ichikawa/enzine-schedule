const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const chatworkApiTokenEnzineChiba = defineSecret("CHATWORK_API_TOKEN_ENZINE_CHIBA");

const DEFAULT_OFFICE_ID = "enzine_chiba";
const LEGACY_OFFICE_IDS = ["engine_chiba"];
const DEFAULT_GROUP_ID = "enzine";
const CHATWORK_PROVIDER = "chatwork";
const CHATWORK_INTEGRATIONS_COLLECTION = "officeIntegrations";
const CHATWORK_LOGS_COLLECTION = "chatworkSendLogs";
const OFFICE_SETTINGS_COLLECTION = "officeSettings";
const WEEKLY_REPORT_STATUS_COLLECTION = "weeklyReportUserStatus";
const WEEKLY_REPORT_START_WEEK = "2026-06-15";
const VALID_CHATWORK_ROLES = new Set(["staff", "admin"]);
const MAX_MESSAGE_LENGTH = 5000;
const MAX_GROUPS = 30;
const MAX_ROOM_IDS_PER_SEND = 50;
const ROOM_ID_PATTERN = /^\d{1,20}$/;

function cleanText(value, fallback = "", maxLength = 120) {
  if (typeof value !== "string") {
    return fallback;
  }

  const text = value.trim();
  if (!text) {
    return fallback;
  }

  return text.slice(0, maxLength);
}

function normalizeOfficeId(officeId) {
  const value = cleanText(officeId, "", 80);
  if (!value || LEGACY_OFFICE_IDS.includes(value)) {
    return DEFAULT_OFFICE_ID;
  }
  return value;
}

function officeIdsMatch(a, b) {
  return normalizeOfficeId(a) === normalizeOfficeId(b);
}

function getCompatibleOfficeIds(officeId) {
  const currentOfficeId = normalizeOfficeId(officeId);
  return [currentOfficeId, ...LEGACY_OFFICE_IDS].filter((value, index, list) => {
    return value && list.indexOf(value) === index;
  });
}

function getChatworkIntegrationDocId(officeId) {
  return `${normalizeOfficeId(officeId)}_chatwork`;
}

function cleanRoomId(value) {
  const roomId = cleanText(value, "", 24).replace(/[^\d]/g, "");
  return ROOM_ID_PATTERN.test(roomId) ? roomId : "";
}

function cleanMessage(value) {
  const message = cleanText(value, "", MAX_MESSAGE_LENGTH);

  if (!message) {
    throw new HttpsError("invalid-argument", "Message body is required.");
  }

  return message;
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

function parseOptionalDateId(dateId) {
  if (typeof dateId !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateId)) {
    return null;
  }

  return parseDateId(dateId);
}

function addDays(date, days) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  next.setHours(0, 0, 0, 0);
  return next;
}

function getWeekStartDate(date) {
  const weekStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = weekStart.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  weekStart.setDate(weekStart.getDate() + diff);
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
}

function getLastCompletedWeekStartDate() {
  return addDays(getWeekStartDate(new Date()), -7);
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

function getWeeklyReportId(userId, weekStartDateId) {
  return `${userId}_${weekStartDateId}`;
}

function hasOwnField(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function cleanId(value, fallback = "") {
  const id = cleanText(value, fallback, 80).replace(/[^a-zA-Z0-9_-]/g, "_");
  return id || fallback;
}

async function assertCallerCanUseChatwork(request) {
  const callerUid = request.auth?.uid;

  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Login is required.");
  }

  const callerSnap = await db.collection("users").doc(callerUid).get();

  if (!callerSnap.exists) {
    throw new HttpsError("permission-denied", "Caller profile was not found.");
  }

  const callerData = callerSnap.data() || {};
  const role = callerData.role || "user";

  if (callerData.active !== true || !VALID_CHATWORK_ROLES.has(role)) {
    throw new HttpsError("permission-denied", "Only active staff or admins can use Chatwork.");
  }

  return {
    uid: callerUid,
    name: callerData.name || request.auth.token?.email || "",
    email: callerData.email || request.auth.token?.email || "",
    role,
    officeId: normalizeOfficeId(callerData.officeId || DEFAULT_OFFICE_ID),
    groupId: callerData.groupId || DEFAULT_GROUP_ID,
    canManage: role === "admin"
  };
}

function normalizeRecipientMap(rawRecipients = {}) {
  const recipients = {};

  Object.entries(rawRecipients || {}).forEach(([uid, recipient]) => {
    const cleanUid = cleanId(uid, "", 128);
    const roomId = cleanRoomId(recipient?.roomId || "");

    if (!cleanUid || !roomId) {
      return;
    }

    recipients[cleanUid] = {
      roomId,
      active: recipient?.active !== false,
      updatedAt: recipient?.updatedAt || null
    };
  });

  return recipients;
}

function normalizeGroups(rawGroups = []) {
  if (!Array.isArray(rawGroups)) {
    return [];
  }

  return rawGroups.slice(0, MAX_GROUPS).map((group, index) => {
    const id = cleanId(group?.id, `group_${index + 1}`, 80);
    const name = cleanText(group?.name, `グループ${index + 1}`, 80);
    const memberUserIds = Array.isArray(group?.memberUserIds)
      ? group.memberUserIds
          .map((uid) => cleanId(uid, "", 128))
          .filter(Boolean)
          .filter((uid, itemIndex, list) => list.indexOf(uid) === itemIndex)
      : [];
    const roomIds = Array.isArray(group?.roomIds)
      ? group.roomIds
          .map(cleanRoomId)
          .filter(Boolean)
          .filter((roomId, itemIndex, list) => list.indexOf(roomId) === itemIndex)
      : [];

    return {
      id,
      name,
      active: group?.active !== false,
      memberUserIds,
      roomIds
    };
  });
}

async function loadOfficeSettings(officeId) {
  const snap = await db.collection(OFFICE_SETTINGS_COLLECTION).doc(officeId).get();
  return snap.exists ? snap.data() || {} : {};
}

function mergeIntegrationData(officeId, rawData = {}, officeSettings = {}) {
  const defaultAvailable = normalizeOfficeId(officeId) === DEFAULT_OFFICE_ID;
  const officeFeatureEnabled = officeSettings?.features?.chatwork === true;
  const attachable = rawData.available === true || officeFeatureEnabled || defaultAvailable;
  const available = rawData.available === false ? false : attachable;

  return {
    schemaVersion: 1,
    provider: CHATWORK_PROVIDER,
    officeId: normalizeOfficeId(rawData.officeId || officeId),
    attachable,
    available,
    enabled: available && rawData.enabled === true,
    recipients: normalizeRecipientMap(rawData.recipients || {}),
    groups: normalizeGroups(rawData.groups || []),
    updatedAt: rawData.updatedAt || null,
    updatedByUid: rawData.updatedByUid || "",
    updatedByName: rawData.updatedByName || ""
  };
}

async function loadChatworkIntegration(officeId) {
  const normalizedOfficeId = normalizeOfficeId(officeId);
  const [integrationSnap, officeSettings] = await Promise.all([
    db.collection(CHATWORK_INTEGRATIONS_COLLECTION).doc(getChatworkIntegrationDocId(normalizedOfficeId)).get(),
    loadOfficeSettings(normalizedOfficeId)
  ]);
  const rawData = integrationSnap.exists ? integrationSnap.data() || {} : {};

  return mergeIntegrationData(normalizedOfficeId, rawData, officeSettings);
}

async function loadActiveUsersForOffice(officeId) {
  const usersSnap = await db.collection("users").get();
  const users = [];

  usersSnap.forEach((docSnap) => {
    const data = docSnap.data() || {};

    if (data.active !== true || data.role !== "user") {
      return;
    }

    const userOfficeId = normalizeOfficeId(data.officeId || officeId);

    if (!officeIdsMatch(userOfficeId, officeId)) {
      return;
    }

    users.push({
      id: docSnap.id,
      uid: docSnap.id,
      name: data.name || data.email || "名前未設定",
      email: data.email || "",
      officeId: userOfficeId,
      groupId: data.groupId || DEFAULT_GROUP_ID,
      weeklyReportStartWeek: getWeeklyReportStartWeekIdFromUserRecord(data)
    });
  });

  users.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ja"));
  return users;
}

async function loadWeeklyReportStatusMapForOffice(users, officeId) {
  if (!users.length) {
    return {};
  }

  const targetUserIds = new Set(users.map((user) => user.uid));
  const statusMap = {};

  for (const candidateOfficeId of getCompatibleOfficeIds(officeId)) {
    const snapshot = await db.collection(WEEKLY_REPORT_STATUS_COLLECTION)
      .where("officeId", "==", candidateOfficeId)
      .get();

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

function isWeeklyReportUserEligible(user, weekStartId) {
  const startWeekId = user?.weeklyReportStartWeek || getWeeklyReportGlobalStartWeekId();
  return weekStartId >= startWeekId;
}

function normalizeWeeklyReportWeekStartId(value) {
  const requestedWeek = parseOptionalDateId(value);
  const weekStartDate = requestedWeek
    ? getWeekStartDate(requestedWeek)
    : getLastCompletedWeekStartDate();
  const lastCompletedWeekStart = getLastCompletedWeekStartDate();

  if (weekStartDate > lastCompletedWeekStart) {
    throw new HttpsError("failed-precondition", "Weekly report target week is not completed yet.");
  }

  return formatDateId(weekStartDate);
}

function formatWeeklyReportRangeLabel(weekStartId) {
  const weekStartDate = parseDateId(weekStartId);
  const weekEndDate = addDays(weekStartDate, 4);
  return `${weekStartDate.getFullYear()}年${weekStartDate.getMonth() + 1}月${weekStartDate.getDate()}日〜${weekEndDate.getMonth() + 1}月${weekEndDate.getDate()}日`;
}

async function buildWeeklyReportMissingUsersForOffice(officeId, weekStartId) {
  const allUsers = await loadActiveUsersForOffice(officeId);
  const users = allUsers.filter((user) => isWeeklyReportUserEligible(user, weekStartId));
  const excludedCount = allUsers.length - users.length;
  const statusMap = await loadWeeklyReportStatusMapForOffice(users, officeId);
  const submittedUsers = [];
  const missingUsers = [];
  let fallbackReportReads = 0;

  for (const user of users) {
    const statusData = statusMap[user.uid] || null;
    const submittedWeeks = statusData?.submittedWeeks || {};

    if (submittedWeeks[weekStartId] === true) {
      submittedUsers.push(user);
      continue;
    }

    if (hasOwnField(submittedWeeks, weekStartId)) {
      missingUsers.push(user);
      continue;
    }

    const reportSnap = await db.collection("weeklyReports")
      .doc(getWeeklyReportId(user.uid, weekStartId))
      .get();
    fallbackReportReads++;

    if (reportSnap.exists && reportSnap.data()?.submitted === true) {
      submittedUsers.push(user);
    } else {
      missingUsers.push(user);
    }
  }

  submittedUsers.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ja"));
  missingUsers.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ja"));

  return {
    users: allUsers,
    eligibleUsers: users,
    submittedUsers,
    missingUsers,
    excludedCount,
    fallbackReportReads
  };
}

function buildConfiguredUsers(users, recipients) {
  return users.map((user) => {
    const recipient = recipients[user.uid] || {};
    const roomId = cleanRoomId(recipient.roomId || "");

    return {
      ...user,
      chatworkRoomId: roomId,
      chatworkActive: Boolean(roomId) && recipient.active !== false
    };
  });
}

function buildPublicIntegrationState(integration, caller, options = {}) {
  const base = {
    officeId: integration.officeId,
    attachable: integration.attachable === true,
    available: integration.available === true,
    enabled: integration.enabled === true,
    canManage: caller.canManage === true,
    callerRole: caller.role
  };

  if (options.includeConfig === false) {
    return base;
  }

  return {
    ...base,
    recipients: integration.recipients,
    groups: integration.groups,
    updatedAt: integration.updatedAt,
    updatedByName: integration.updatedByName
  };
}

function assertIntegrationAvailable(integration) {
  if (integration.available !== true) {
    throw new HttpsError("permission-denied", "Chatwork integration is not available for this office.");
  }
}

function assertIntegrationEnabled(integration) {
  assertIntegrationAvailable(integration);

  if (integration.enabled !== true) {
    throw new HttpsError("failed-precondition", "Chatwork integration is disabled.");
  }
}

function getChatworkApiTokenSecretForOffice(officeId) {
  const normalizedOfficeId = normalizeOfficeId(officeId);

  if (normalizedOfficeId === DEFAULT_OFFICE_ID) {
    return chatworkApiTokenEnzineChiba;
  }

  throw new HttpsError("failed-precondition", "Chatwork API token is not configured for this office.");
}

function buildRecipientPayload(rawRecipients, activeUserIds) {
  const recipients = {};

  if (!Array.isArray(rawRecipients)) {
    return recipients;
  }

  rawRecipients.forEach((item) => {
    const uid = cleanId(item?.uid || item?.id, "", 128);
    const roomId = cleanRoomId(item?.roomId || "");

    if (!uid || !activeUserIds.has(uid) || !roomId) {
      return;
    }

    recipients[uid] = {
      roomId,
      active: item?.active !== false,
      updatedAt: new Date().toISOString()
    };
  });

  return recipients;
}

function buildGroupPayload(rawGroups, activeUserIds) {
  return normalizeGroups(rawGroups).map((group) => {
    return {
      ...group,
      memberUserIds: group.memberUserIds.filter((uid) => activeUserIds.has(uid))
    };
  }).filter((group) => {
    return group.name && (group.memberUserIds.length > 0 || group.roomIds.length > 0);
  });
}

function resolveRoomIdsForUser(targetUserId, integration, activeUsersById) {
  const uid = cleanId(targetUserId, "", 128);
  const user = activeUsersById.get(uid);
  const recipient = integration.recipients[uid];
  const roomId = cleanRoomId(recipient?.roomId || "");

  if (!user || !recipient || recipient.active === false || !roomId) {
    throw new HttpsError("failed-precondition", "Selected user does not have an active Chatwork room.");
  }

  return [{
    roomId,
    label: user.name || user.email || uid,
    userId: uid
  }];
}

function resolveRoomIdsForGroup(targetGroupId, integration, activeUsersById) {
  const groupId = cleanId(targetGroupId, "", 80);
  const group = integration.groups.find((item) => item.id === groupId);

  if (!group || group.active === false) {
    throw new HttpsError("failed-precondition", "Selected Chatwork group is not active.");
  }

  const targets = [];

  group.memberUserIds.forEach((uid) => {
    const user = activeUsersById.get(uid);
    const recipient = integration.recipients[uid];
    const roomId = cleanRoomId(recipient?.roomId || "");

    if (!user || !recipient || recipient.active === false || !roomId) {
      return;
    }

    targets.push({
      roomId,
      label: user.name || user.email || uid,
      userId: uid
    });
  });

  group.roomIds.forEach((roomId) => {
    targets.push({
      roomId,
      label: `${group.name} 追加ルーム`,
      userId: ""
    });
  });

  const uniqueTargets = [];
  const seenRoomIds = new Set();

  targets.forEach((target) => {
    if (seenRoomIds.has(target.roomId)) {
      return;
    }

    seenRoomIds.add(target.roomId);
    uniqueTargets.push(target);
  });

  if (!uniqueTargets.length) {
    throw new HttpsError("failed-precondition", "Selected group has no active Chatwork rooms.");
  }

  return uniqueTargets;
}

function resolveDirectRoomId(roomId, caller) {
  if (!caller.canManage) {
    throw new HttpsError("permission-denied", "Only admins can send to a direct room ID.");
  }

  const cleanDirectRoomId = cleanRoomId(roomId || "");

  if (!cleanDirectRoomId) {
    throw new HttpsError("invalid-argument", "A valid room ID is required.");
  }

  return [{
    roomId: cleanDirectRoomId,
    label: "直接指定ルーム",
    userId: ""
  }];
}

function resolveSendTargets(data, integration, caller, activeUsers) {
  const activeUsersById = new Map(activeUsers.map((user) => [user.uid, user]));
  const targetType = cleanText(data?.targetType, "", 20);
  let targets = [];
  let targetLabel = "";

  if (targetType === "user") {
    targets = resolveRoomIdsForUser(data?.targetId, integration, activeUsersById);
    targetLabel = targets[0]?.label || "利用者";
  } else if (targetType === "group") {
    const groupId = cleanId(data?.targetId, "", 80);
    const group = integration.groups.find((item) => item.id === groupId);
    targets = resolveRoomIdsForGroup(groupId, integration, activeUsersById);
    targetLabel = group?.name || "グループ";
  } else if (targetType === "room") {
    targets = resolveDirectRoomId(data?.roomId, caller);
    targetLabel = "直接指定ルーム";
  } else {
    throw new HttpsError("invalid-argument", "Target type must be user, group, or room.");
  }

  if (targets.length > MAX_ROOM_IDS_PER_SEND) {
    throw new HttpsError("failed-precondition", `Send target limit is ${MAX_ROOM_IDS_PER_SEND} rooms.`);
  }

  return {
    targetType,
    targetLabel,
    targets
  };
}

async function postChatworkMessage(roomId, message, token) {
  const response = await fetch(`https://api.chatwork.com/v2/rooms/${roomId}/messages`, {
    method: "POST",
    headers: {
      "X-ChatWorkToken": token,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      body: message,
      self_unread: "0"
    })
  });

  const responseText = await response.text().catch(() => "");

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: responseText.slice(0, 300)
    };
  }

  let responseJson = null;

  try {
    responseJson = responseText ? JSON.parse(responseText) : null;
  } catch (_error) {
    responseJson = null;
  }

  return {
    ok: true,
    status: response.status,
    messageId: responseJson?.message_id || ""
  };
}

async function writeSendLog({ caller, integration, targetType, targetLabel, message, results }) {
  const sentCount = results.filter((result) => result.ok).length;
  const failedCount = results.length - sentCount;

  await db.collection(CHATWORK_LOGS_COLLECTION).add({
    provider: CHATWORK_PROVIDER,
    officeId: integration.officeId,
    targetType,
    targetLabel,
    targetCount: results.length,
    sentCount,
    failedCount,
    bodyPreview: message.slice(0, 120),
    createdAt: FieldValue.serverTimestamp(),
    createdByUid: caller.uid,
    createdByName: caller.name || caller.email || "",
    createdByRole: caller.role,
    results: results.map((result) => ({
      roomId: result.roomId,
      label: result.label,
      ok: result.ok,
      status: result.status,
      messageId: result.messageId || "",
      error: result.error || ""
    }))
  });
}

exports.getChatworkConsoleData = onCall({
  region: "asia-northeast1",
  invoker: "public",
  maxInstances: 4,
  timeoutSeconds: 30
}, async (request) => {
  const caller = await assertCallerCanUseChatwork(request);
  const data = request.data || {};
  const includeConfig = data.includeConfig !== false;
  const integration = await loadChatworkIntegration(caller.officeId);
  const response = buildPublicIntegrationState(integration, caller, { includeConfig });

  if (!includeConfig) {
    return response;
  }

  const activeUsers = await loadActiveUsersForOffice(caller.officeId);

  return {
    ...response,
    users: buildConfiguredUsers(activeUsers, integration.recipients)
  };
});

exports.getChatworkWeeklyReportMissingGroup = onCall({
  region: "asia-northeast1",
  invoker: "public",
  maxInstances: 2,
  timeoutSeconds: 60
}, async (request) => {
  const caller = await assertCallerCanUseChatwork(request);
  const integration = await loadChatworkIntegration(caller.officeId);
  assertIntegrationAvailable(integration);

  const data = request.data || {};
  const weekStartId = normalizeWeeklyReportWeekStartId(data.weekStartDate);
  const result = await buildWeeklyReportMissingUsersForOffice(caller.officeId, weekStartId);
  const configuredMissingUsers = buildConfiguredUsers(result.missingUsers, integration.recipients);
  const configuredUserIds = configuredMissingUsers
    .filter((user) => user.chatworkActive === true && user.chatworkRoomId)
    .map((user) => user.uid);

  logger.info("Chatwork weekly report missing group built", {
    officeId: caller.officeId,
    weekStartId,
    missingCount: result.missingUsers.length,
    configuredCount: configuredUserIds.length,
    fallbackReportReads: result.fallbackReportReads,
    uid: caller.uid
  });

  return {
    officeId: caller.officeId,
    weekStartDate: weekStartId,
    weekLabel: formatWeeklyReportRangeLabel(weekStartId),
    groupId: `weekly_report_missing_${weekStartId}`,
    groupName: `週一報告 未提出 ${weekStartId}`,
    memberUserIds: configuredUserIds,
    missingUsers: configuredMissingUsers,
    missingCount: result.missingUsers.length,
    configuredCount: configuredUserIds.length,
    submittedCount: result.submittedUsers.length,
    eligibleCount: result.eligibleUsers.length,
    excludedCount: result.excludedCount,
    fallbackReportReads: result.fallbackReportReads
  };
});

exports.saveChatworkIntegrationConfig = onCall({
  region: "asia-northeast1",
  invoker: "public",
  maxInstances: 2,
  timeoutSeconds: 30
}, async (request) => {
  const caller = await assertCallerCanUseChatwork(request);

  if (!caller.canManage) {
    throw new HttpsError("permission-denied", "Only admins can manage Chatwork settings.");
  }

  const currentIntegration = await loadChatworkIntegration(caller.officeId);

  if (currentIntegration.attachable !== true) {
    throw new HttpsError("permission-denied", "Chatwork integration is not attachable for this office.");
  }

  const data = request.data || {};
  const activeUsers = await loadActiveUsersForOffice(caller.officeId);
  const activeUserIds = new Set(activeUsers.map((user) => user.uid));
  const available = data.available === false ? false : data.available === true && currentIntegration.attachable === true;
  const enabled = available && data.enabled === true;
  const payload = {
    schemaVersion: 1,
    provider: CHATWORK_PROVIDER,
    officeId: caller.officeId,
    available,
    enabled,
    recipients: buildRecipientPayload(data.recipients || [], activeUserIds),
    groups: buildGroupPayload(data.groups || [], activeUserIds),
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUid: caller.uid,
    updatedByName: caller.name || caller.email || ""
  };

  await db.collection(CHATWORK_INTEGRATIONS_COLLECTION)
    .doc(getChatworkIntegrationDocId(caller.officeId))
    .set(payload);

  logger.info("Chatwork integration config saved", {
    officeId: caller.officeId,
    enabled,
    recipients: Object.keys(payload.recipients).length,
    groups: payload.groups.length,
    uid: caller.uid
  });

  return {
    saved: true,
    available,
    enabled,
    recipients: Object.keys(payload.recipients).length,
    groups: payload.groups.length
  };
});

exports.sendChatworkMessage = onCall({
  region: "asia-northeast1",
  invoker: "public",
  secrets: [chatworkApiTokenEnzineChiba],
  maxInstances: 2,
  timeoutSeconds: 60
}, async (request) => {
  const caller = await assertCallerCanUseChatwork(request);
  const integration = await loadChatworkIntegration(caller.officeId);
  assertIntegrationEnabled(integration);

  const token = getChatworkApiTokenSecretForOffice(integration.officeId).value();

  if (!token) {
    throw new HttpsError("failed-precondition", "Chatwork API token is not configured.");
  }

  const data = request.data || {};
  const message = cleanMessage(data.message);
  const activeUsers = await loadActiveUsersForOffice(caller.officeId);
  const { targetType, targetLabel, targets } = resolveSendTargets(data, integration, caller, activeUsers);
  const results = [];

  for (const target of targets) {
    try {
      const result = await postChatworkMessage(target.roomId, message, token);
      results.push({
        ...target,
        ...result
      });
    } catch (error) {
      results.push({
        ...target,
        ok: false,
        status: 0,
        error: error?.message || "Network error"
      });
    }
  }

  await writeSendLog({
    caller,
    integration,
    targetType,
    targetLabel,
    message,
    results
  });

  const sentCount = results.filter((result) => result.ok).length;
  const failedCount = results.length - sentCount;

  logger.info("Chatwork message send completed", {
    officeId: caller.officeId,
    targetType,
    targetLabel,
    sentCount,
    failedCount,
    uid: caller.uid
  });

  if (sentCount === 0 && failedCount > 0) {
    throw new HttpsError("internal", "Chatwork message send failed.", {
      sentCount,
      failedCount,
      results
    });
  }

  return {
    sentCount,
    failedCount,
    targetCount: results.length,
    results
  };
});
