const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWrittenWithAuthContext } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

admin.initializeApp();

const chatworkFunctions = require("./chatwork");

const db = admin.firestore();
const auth = admin.auth();

const DEFAULT_OFFICE_ID = "enzine_chiba";
const LEGACY_OFFICE_IDS = ["engine_chiba"];
const DEFAULT_GROUP_ID = "enzine";
const ACTIVE_USERS_DOC_ID = "activeUsers";
const ADMIN_AUDIT_LOG_COLLECTION = "adminAuditLogs";
const WEEKLY_REPORT_START_WEEK = "2026-06-15";
const JST_OFFSET_MINUTES = 9 * 60;
const VALID_ROLES = new Set(["user", "staff", "admin"]);
const AUDITED_USER_FIELDS = [
  "name",
  "nameKana",
  "email",
  "role",
  "active",
  "accessScope",
  "organizationId",
  "groupId",
  "officeId",
  "weeklyReportStartWeek"
];
const AUDITED_BILLING_FIELDS = ["locked", "warning", "level", "reason"];

function getActiveUsersDocId(officeId) {
  return `${ACTIVE_USERS_DOC_ID}_${normalizeOfficeId(officeId)}`;
}

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
  return cleanText(value, "", 80).replace(/\s+/g, " ");
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

function cleanEmail(value) {
  const email = cleanText(value, "", 254).toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError("invalid-argument", "A valid email address is required.");
  }

  return email;
}

function cleanPassword(value) {
  if (typeof value !== "string" || value.length < 6) {
    throw new HttpsError("invalid-argument", "Password must be at least 6 characters.");
  }

  if (value.length > 128) {
    throw new HttpsError("invalid-argument", "Password is too long.");
  }

  return value;
}

function cleanRole(value) {
  const role = cleanText(value, "user", 20);

  if (!VALID_ROLES.has(role)) {
    throw new HttpsError("invalid-argument", "Role must be user, staff, or admin.");
  }

  return role;
}

function cleanEntityId(value, label) {
  const id = cleanText(value, "", 80).toLowerCase();

  if (!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(id)) {
    throw new HttpsError(
      "invalid-argument",
      `${label} must use 2-80 lowercase letters, numbers, hyphens, or underscores.`
    );
  }

  return id;
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

async function assertCallerHasActiveProfile(request) {
  const callerUid = request.auth?.uid;

  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Login is required.");
  }

  const callerSnap = await db.collection("users").doc(callerUid).get();

  if (!callerSnap.exists) {
    throw new HttpsError("permission-denied", "Caller profile was not found.");
  }

  const callerData = callerSnap.data() || {};

  if (callerData.active !== true || !VALID_ROLES.has(callerData.role)) {
    throw new HttpsError("permission-denied", "Only active users can use this function.");
  }

  const organizationId = cleanText(
    callerData.organizationId || callerData.groupId,
    DEFAULT_GROUP_ID,
    80
  );

  return {
    uid: callerUid,
    name: callerData.name || request.auth.token?.email || "",
    email: callerData.email || request.auth.token?.email || "",
    officeId: normalizeOfficeId(callerData.officeId || DEFAULT_OFFICE_ID),
    groupId: callerData.groupId || organizationId,
    organizationId,
    accessScope: callerData.accessScope === "global"
      ? "global"
      : callerData.role === "user" ? "self" : "office",
    role: callerData.role
  };
}

async function assertCallerIsAdmin(request) {
  const caller = await assertCallerHasActiveProfile(request);

  if (caller.role !== "admin") {
    throw new HttpsError("permission-denied", "Only active admins can use this function.");
  }

  return caller;
}

async function assertCallerIsGlobalAdmin(request) {
  const caller = await assertCallerIsAdmin(request);

  if (caller.accessScope !== "global") {
    throw new HttpsError("permission-denied", "Only global admins can manage organizations and offices.");
  }

  return caller;
}

function cleanAuditIdentifier(value, maxLength = 160) {
  const text = cleanText(value, "", maxLength);
  if (!text || /[\/\u0000-\u001f]/.test(text)) {
    return "";
  }
  return text;
}

function getAuditChangedFields(beforeData, afterData, allowedFields) {
  return allowedFields.filter((field) => {
    const beforeValue = beforeData && Object.prototype.hasOwnProperty.call(beforeData, field)
      ? beforeData[field]
      : null;
    const afterValue = afterData && Object.prototype.hasOwnProperty.call(afterData, field)
      ? afterData[field]
      : null;
    return JSON.stringify(beforeValue) !== JSON.stringify(afterValue);
  });
}

function getAuditOperation(beforeExists, afterExists) {
  if (!beforeExists && afterExists) {
    return "create";
  }
  if (beforeExists && !afterExists) {
    return "delete";
  }
  return "update";
}

function buildAdminAuditLog({
  action,
  actor,
  targetType,
  targetId,
  operation,
  targetOrganizationId = "",
  targetOfficeId = "",
  targetRole = "",
  targetState = "",
  changedFields = [],
  source = "callable"
}) {
  return {
    schemaVersion: 1,
    action: cleanAuditIdentifier(action, 80),
    operation: cleanAuditIdentifier(operation, 20),
    source: cleanAuditIdentifier(source, 40),
    actorUid: cleanAuditIdentifier(actor?.uid, 128),
    actorRole: cleanAuditIdentifier(actor?.role, 20),
    actorAccessScope: cleanAuditIdentifier(actor?.accessScope, 20),
    actorOrganizationId: cleanAuditIdentifier(actor?.organizationId || actor?.groupId, 80),
    actorOfficeId: cleanAuditIdentifier(actor?.officeId, 80),
    targetType: cleanAuditIdentifier(targetType, 40),
    targetId: cleanAuditIdentifier(targetId, 160),
    targetOrganizationId: cleanAuditIdentifier(targetOrganizationId, 80),
    targetOfficeId: cleanAuditIdentifier(targetOfficeId, 80),
    targetRole: cleanAuditIdentifier(targetRole, 20),
    targetState: cleanAuditIdentifier(targetState, 40),
    changedFields: Array.isArray(changedFields)
      ? changedFields.map((field) => cleanAuditIdentifier(field, 60)).filter(Boolean).slice(0, 30)
      : [],
    outcome: "success",
    createdAt: FieldValue.serverTimestamp()
  };
}

function queueAdminAuditLog(batch, details) {
  const auditRef = db.collection(ADMIN_AUDIT_LOG_COLLECTION).doc();
  batch.create(auditRef, buildAdminAuditLog(details));
  return auditRef.id;
}

async function appendAdminAuditLog(details) {
  const auditRef = db.collection(ADMIN_AUDIT_LOG_COLLECTION).doc();
  await auditRef.create(buildAdminAuditLog(details));
  return auditRef.id;
}

function resolveAuditActorUid(event, beforeData, afterData) {
  const candidates = [
    afterData?.updatedByUid,
    afterData?.createdByUid,
    beforeData?.updatedByUid,
    beforeData?.createdByUid,
    event?.authId
  ];
  return candidates.map((value) => cleanAuditIdentifier(value, 128)).find(Boolean) || "";
}

async function getAuditActor(actorUid, beforeData = {}, afterData = {}) {
  if (!actorUid) {
    return null;
  }

  const actorSnap = await db.collection("users").doc(actorUid).get();
  const actorData = actorSnap.exists
    ? actorSnap.data() || {}
    : cleanAuditIdentifier(afterData?.uid || beforeData?.uid, 128) === actorUid
      ? afterData || beforeData || {}
      : {};

  if (actorData.role !== "admin" || actorData.active !== true) {
    return null;
  }

  const organizationId = cleanAuditIdentifier(
    actorData.organizationId || actorData.groupId,
    80
  );
  return {
    uid: actorUid,
    role: "admin",
    accessScope: actorData.accessScope === "global" ? "global" : "office",
    organizationId,
    groupId: organizationId,
    officeId: normalizeOfficeId(actorData.officeId || DEFAULT_OFFICE_ID)
  };
}

function serializeAuditTimestamp(value) {
  if (!value || typeof value.toDate !== "function") {
    return "";
  }
  const date = value.toDate();
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function normalizeActiveUser(docSnap, currentOfficeId, defaultGroupId) {
  const data = docSnap.data() || {};

  if (data.active !== true || data.role !== "user") {
    return null;
  }

  const officeId = normalizeOfficeId(data.officeId || currentOfficeId);

  if (!officeIdsMatch(officeId, currentOfficeId)) {
    return null;
  }

  const nameKana = cleanNameKana(data.nameKana || data.kana || "");
  const fallbackName = data.name || data.displayName || data.email || docSnap.id;

  return {
    id: docSnap.id,
    uid: docSnap.id,
    name: data.name || data.email || "名前未設定",
    nameKana,
    sortName: data.sortName || buildUserSortName(nameKana, fallbackName),
    email: data.email || "",
    officeId,
    groupId: data.groupId || defaultGroupId,
    weeklyReportStartWeek: getWeeklyReportStartWeekIdFromUserRecord(data),
    active: true
  };
}

async function rebuildActiveUsers({ officeId, groupId, updatedByUid, updatedByName }) {
  const usersSnap = await db.collection("users").get();
  const users = [];

  usersSnap.forEach((docSnap) => {
    const user = normalizeActiveUser(docSnap, officeId, groupId);

    if (user) {
      users.push(user);
    }
  });

  users.sort(compareUsersBySortName);

  const cacheRef = db.collection("system").doc(ACTIVE_USERS_DOC_ID);
  const officeCacheRef = db.collection("system").doc(getActiveUsersDocId(officeId));

  await db.runTransaction(async (transaction) => {
    const cacheSnap = await transaction.get(cacheRef);
    const currentData = cacheSnap.exists ? cacheSnap.data() || {} : {};
    const currentOffices = currentData.offices && typeof currentData.offices === "object"
      ? currentData.offices
      : {};
    const updatedAt = FieldValue.serverTimestamp();

    transaction.set(cacheRef, {
      // 既存画面との互換用。事業所別画面は下の offices を優先して参照する。
      officeId,
      groupId,
      users,
      offices: {
        ...currentOffices,
        [officeId]: {
          officeId,
          organizationId: groupId,
          groupId,
          users,
          updatedAt,
          updatedByUid,
          updatedByName
        }
      },
      updatedAt,
      updatedByUid,
      updatedByName
    }, { merge: true });

    transaction.set(officeCacheRef, {
      schemaVersion: 1,
      organizationId: groupId,
      groupId,
      officeId,
      users,
      updatedAt,
      updatedByUid,
      updatedByName
    }, { merge: true });
  });

  return users.length;
}

async function updateOfficeIdForCollection(collectionName, oldOfficeId, newOfficeId) {
  const snapshot = await db.collection(collectionName).where("officeId", "==", oldOfficeId).get();
  let batch = db.batch();
  let pendingWrites = 0;
  let count = 0;

  for (const docSnap of snapshot.docs) {
    batch.set(docSnap.ref, {
      officeId: newOfficeId,
      migratedOfficeIdFrom: oldOfficeId,
      migratedOfficeIdAt: FieldValue.serverTimestamp()
    }, { merge: true });

    pendingWrites++;
    count++;

    if (pendingWrites >= 400) {
      await batch.commit();
      batch = db.batch();
      pendingWrites = 0;
    }
  }

  if (pendingWrites > 0) {
    await batch.commit();
  }

  return count;
}

async function copyMonthlyAnnouncementsToNewOffice(oldOfficeId, newOfficeId) {
  const snapshot = await db.collection("monthlyAnnouncements").where("officeId", "==", oldOfficeId).get();
  let batch = db.batch();
  let pendingWrites = 0;
  let count = 0;

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data() || {};
    const monthId = data.month || data.yearMonth || docSnap.id.replace(`${oldOfficeId}_`, "");
    const newDocRef = db.collection("monthlyAnnouncements").doc(`${newOfficeId}_${monthId}`);

    batch.set(newDocRef, {
      ...data,
      officeId: newOfficeId,
      migratedOfficeIdFrom: oldOfficeId,
      migratedOfficeIdAt: FieldValue.serverTimestamp()
    }, { merge: true });

    pendingWrites++;
    count++;

    if (pendingWrites >= 400) {
      await batch.commit();
      batch = db.batch();
      pendingWrites = 0;
    }
  }

  if (pendingWrites > 0) {
    await batch.commit();
  }

  return count;
}

function mergeResourceItems(primary = [], secondary = []) {
  const byId = new Map();
  const addItem = (item) => {
    if (!item) {
      return;
    }

    const id = item.id || item.uid || item.title || JSON.stringify(item);
    if (!byId.has(id)) {
      byId.set(id, item);
    }
  };

  primary.forEach(addItem);
  secondary.forEach(addItem);
  return Array.from(byId.values());
}

async function copyWorkshopResourcesToNewOffice(oldOfficeId, newOfficeId) {
  const oldDocRef = db.collection("system").doc(`workshopResources_${oldOfficeId}`);
  const newDocRef = db.collection("system").doc(`workshopResources_${newOfficeId}`);
  const [oldSnap, newSnap] = await Promise.all([oldDocRef.get(), newDocRef.get()]);

  if (!oldSnap.exists) {
    return 0;
  }

  const oldData = oldSnap.data() || {};
  const newData = newSnap.exists ? newSnap.data() || {} : {};

  await newDocRef.set({
    ...oldData,
    ...newData,
    officeId: newOfficeId,
    workshops: mergeResourceItems(
      Array.isArray(newData.workshops) ? newData.workshops : [],
      Array.isArray(oldData.workshops) ? oldData.workshops : []
    ),
    cases: mergeResourceItems(
      Array.isArray(newData.cases) ? newData.cases : [],
      Array.isArray(oldData.cases) ? oldData.cases : []
    ),
    guides: mergeResourceItems(
      Array.isArray(newData.guides) ? newData.guides : [],
      Array.isArray(oldData.guides) ? oldData.guides : []
    ),
    migratedOfficeIdFrom: oldOfficeId,
    migratedOfficeIdAt: FieldValue.serverTimestamp()
  }, { merge: true });

  return 1;
}

exports.createAuthUserAndProfile = onCall({
  region: "asia-northeast1",
  invoker: "public",
  maxInstances: 2,
  timeoutSeconds: 30
}, async (request) => {
  const caller = await assertCallerIsAdmin(request);
  const data = request.data || {};
  const email = cleanEmail(data.email);
  const password = cleanPassword(data.password);
  const name = cleanText(data.name, "", 80);
  const nameKana = cleanNameKana(data.nameKana);
  const sortName = buildUserSortName(nameKana, name || email);
  const role = cleanRole(data.role);
  const active = data.active !== false;
  const callerIsGlobalAdmin = caller.accessScope === "global";

  if (!callerIsGlobalAdmin && role === "admin") {
    throw new HttpsError("permission-denied", "Office admins can create staff and users only.");
  }

  const officeId = callerIsGlobalAdmin
    ? normalizeOfficeId(data.officeId || caller.officeId)
    : caller.officeId;
  const organizationId = callerIsGlobalAdmin
    ? cleanText(data.organizationId || data.groupId, caller.organizationId, 80)
    : caller.organizationId;
  const groupId = callerIsGlobalAdmin
    ? cleanText(data.groupId, organizationId || caller.groupId, 80)
    : caller.groupId || organizationId;
  const accessScope = role === "admin" ? "office" : role === "user" ? "self" : "office";
  const updatedByName = caller.name || caller.email || "";
  const weeklyReportStartWeek = getWeeklyReportStartWeekIdForRegistrationDate(new Date());

  if (!name) {
    throw new HttpsError("invalid-argument", "Name is required.");
  }

  let userRecord = null;

  try {
    userRecord = await auth.createUser({
      email,
      password,
      displayName: name,
      disabled: active !== true,
      emailVerified: false
    });
  } catch (error) {
    if (error?.code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "This email address is already registered.");
    }

    logger.error("Auth user creation failed", error);
    throw new HttpsError("internal", "Failed to create Auth user.");
  }

  const userDocRef = db.collection("users").doc(userRecord.uid);

  try {
    await userDocRef.set({
      name,
      nameKana,
      sortName,
      email,
      role,
      active,
      accessScope,
      organizationId,
      officeId,
      groupId,
      weeklyReportStartWeek,
      authCreatedByAdmin: true,
      createdAt: FieldValue.serverTimestamp(),
      createdByUid: caller.uid,
      createdByName: updatedByName,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid: caller.uid,
      updatedByName
    });

    await rebuildActiveUsers({
      officeId,
      groupId,
      updatedByUid: caller.uid,
      updatedByName
    });
  } catch (error) {
    logger.error("Firestore user profile creation failed", {
      uid: userRecord.uid,
      error
    });

    try {
      await userDocRef.delete();
    } catch (deleteProfileError) {
      logger.error("Failed to roll back Firestore profile", {
        uid: userRecord.uid,
        error: deleteProfileError
      });
    }

    try {
      await auth.deleteUser(userRecord.uid);
    } catch (deleteAuthError) {
      logger.error("Failed to roll back Auth user", {
        uid: userRecord.uid,
        error: deleteAuthError
      });
    }

    throw new HttpsError("internal", "Auth user was created, but profile creation failed.");
  }

  return {
    uid: userRecord.uid,
    email,
    created: true
  };
});

exports.getOrganizationManagementData = onCall({
  region: "asia-northeast1",
  invoker: "public",
  maxInstances: 2,
  timeoutSeconds: 30
}, async (request) => {
  await assertCallerIsGlobalAdmin(request);

  const [organizationSnap, officeSnap, userSnap] = await Promise.all([
    db.collection("organizations").get(),
    db.collection("offices").get(),
    db.collection("users").get()
  ]);
  const organizations = organizationSnap.docs.map((docSnap) => {
    const data = docSnap.data() || {};
    return {
      id: docSnap.id,
      name: data.name || docSnap.id,
      active: data.active === true,
      groupId: data.groupId || docSnap.id
    };
  }).sort((a, b) => a.name.localeCompare(b.name, "ja"));
  const offices = officeSnap.docs.map((docSnap) => {
    const data = docSnap.data() || {};
    return {
      id: docSnap.id,
      name: data.name || docSnap.id,
      active: data.active === true,
      organizationId: data.organizationId || data.groupId || "",
      groupId: data.groupId || data.organizationId || ""
    };
  }).sort((a, b) => a.name.localeCompare(b.name, "ja"));
  const officeAdmins = userSnap.docs
    .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) }))
    .filter((user) => user.role === "admin" && user.accessScope === "office")
    .map((user) => ({
      id: user.id,
      name: user.name || user.email || user.id,
      email: user.email || "",
      active: user.active === true,
      accessScope: "office",
      organizationId: user.organizationId || user.groupId || "",
      officeId: normalizeOfficeId(user.officeId || DEFAULT_OFFICE_ID)
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));

  return { organizations, offices, officeAdmins };
});

exports.getAdminAuditLogs = onCall({
  region: "asia-northeast1",
  invoker: "public",
  maxInstances: 2,
  timeoutSeconds: 30
}, async (request) => {
  await assertCallerIsGlobalAdmin(request);
  const requestedLimit = Number(request.data?.limit);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(100, Math.max(10, Math.trunc(requestedLimit)))
    : 50;
  const snapshot = await db.collection(ADMIN_AUDIT_LOG_COLLECTION)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  const logs = snapshot.docs.map((docSnap) => {
    const data = docSnap.data() || {};
    return {
      id: docSnap.id,
      action: cleanAuditIdentifier(data.action, 80),
      operation: cleanAuditIdentifier(data.operation, 20),
      source: cleanAuditIdentifier(data.source, 40),
      actorUid: cleanAuditIdentifier(data.actorUid, 128),
      actorRole: cleanAuditIdentifier(data.actorRole, 20),
      actorAccessScope: cleanAuditIdentifier(data.actorAccessScope, 20),
      actorOrganizationId: cleanAuditIdentifier(data.actorOrganizationId, 80),
      actorOfficeId: cleanAuditIdentifier(data.actorOfficeId, 80),
      targetType: cleanAuditIdentifier(data.targetType, 40),
      targetId: cleanAuditIdentifier(data.targetId, 160),
      targetOrganizationId: cleanAuditIdentifier(data.targetOrganizationId, 80),
      targetOfficeId: cleanAuditIdentifier(data.targetOfficeId, 80),
      targetRole: cleanAuditIdentifier(data.targetRole, 20),
      targetState: cleanAuditIdentifier(data.targetState, 40),
      changedFields: Array.isArray(data.changedFields)
        ? data.changedFields.map((field) => cleanAuditIdentifier(field, 60)).filter(Boolean).slice(0, 30)
        : [],
      outcome: data.outcome === "success" ? "success" : "unknown",
      createdAt: serializeAuditTimestamp(data.createdAt)
    };
  });
  return { logs, limit, hasMore: snapshot.size === limit };
});

exports.getCurrentOfficeBrand = onCall({
  region: "asia-northeast1",
  invoker: "public",
  maxInstances: 2,
  timeoutSeconds: 15
}, async (request) => {
  const caller = await assertCallerHasActiveProfile(request);
  const officeSnap = await db.collection("offices").doc(caller.officeId).get();

  if (!officeSnap.exists) {
    throw new HttpsError("not-found", "Office was not found.");
  }

  const officeData = officeSnap.data() || {};
  const officeOrganizationId = cleanText(
    officeData.organizationId || officeData.groupId,
    "",
    80
  );

  if (
    officeData.active !== true
    || !officeOrganizationId
    || officeOrganizationId !== caller.organizationId
    || !officeIdsMatch(officeData.officeId || officeSnap.id, caller.officeId)
  ) {
    throw new HttpsError("permission-denied", "Office membership does not match.");
  }

  return {
    officeId: caller.officeId,
    name: cleanText(officeData.name, "", 100)
  };
});

exports.setMaintenanceMode = onCall({
  region: "asia-northeast1",
  invoker: "public",
  maxInstances: 1,
  timeoutSeconds: 30
}, async (request) => {
  const caller = await assertCallerIsGlobalAdmin(request);
  const data = request.data || {};

  if (typeof data.active !== "boolean") {
    throw new HttpsError("invalid-argument", "Maintenance active state must be a boolean.");
  }

  const active = data.active;
  const message = cleanText(
    data.message,
    "",
    400
  );
  const scheduledEndText = cleanText(data.scheduledEndText, "", 100);
  const payload = {
    schemaVersion: 1,
    active,
    message,
    scheduledEndText,
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUid: caller.uid,
    updatedByName: caller.name || caller.email || ""
  };

  const maintenanceRef = db.collection("system").doc("maintenanceMode");
  const batch = db.batch();
  batch.set(maintenanceRef, payload, { merge: true });
  queueAdminAuditLog(batch, {
    action: active ? "maintenance.started" : "maintenance.ended",
    actor: caller,
    targetType: "system",
    targetId: "maintenanceMode",
    operation: "update",
    targetState: active ? "active" : "inactive",
    changedFields: ["active", "message", "scheduledEndText"]
  });
  await batch.commit();

  return {
    active,
    message,
    scheduledEndText,
    updated: true
  };
});

exports.upsertOrganization = onCall({
  region: "asia-northeast1",
  invoker: "public",
  maxInstances: 2,
  timeoutSeconds: 30
}, async (request) => {
  const caller = await assertCallerIsGlobalAdmin(request);
  const data = request.data || {};
  const organizationId = cleanEntityId(data.organizationId, "Organization ID");
  const name = cleanText(data.name, "", 100);
  const active = data.active !== false;

  if (!name) {
    throw new HttpsError("invalid-argument", "Organization name is required.");
  }

  const organizationRef = db.collection("organizations").doc(organizationId);
  const organizationSnap = await organizationRef.get();
  const payload = {
    schemaVersion: 1,
    name,
    active,
    groupId: organizationId,
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUid: caller.uid,
    updatedByName: caller.name || caller.email || ""
  };

  if (!organizationSnap.exists) {
    payload.createdAt = FieldValue.serverTimestamp();
    payload.createdByUid = caller.uid;
    payload.createdByName = caller.name || caller.email || "";
  }

  const batch = db.batch();
  batch.set(organizationRef, payload, { merge: true });
  queueAdminAuditLog(batch, {
    action: organizationSnap.exists ? "organization.updated" : "organization.created",
    actor: caller,
    targetType: "organization",
    targetId: organizationId,
    operation: organizationSnap.exists ? "update" : "create",
    targetOrganizationId: organizationId,
    targetState: active ? "active" : "inactive",
    changedFields: ["name", "active"]
  });
  await batch.commit();

  return { id: organizationId, name, active, saved: true };
});

exports.upsertOffice = onCall({
  region: "asia-northeast1",
  invoker: "public",
  maxInstances: 2,
  timeoutSeconds: 30
}, async (request) => {
  const caller = await assertCallerIsGlobalAdmin(request);
  const data = request.data || {};
  const organizationId = cleanEntityId(data.organizationId, "Organization ID");
  const officeId = cleanEntityId(data.officeId, "Office ID");
  const name = cleanText(data.name, "", 100);
  const active = data.active !== false;

  if (!name) {
    throw new HttpsError("invalid-argument", "Office name is required.");
  }

  const organizationSnap = await db.collection("organizations").doc(organizationId).get();

  if (!organizationSnap.exists) {
    throw new HttpsError("failed-precondition", "Organization was not found.");
  }

  const officeRef = db.collection("offices").doc(officeId);
  const officeSnap = await officeRef.get();
  const currentOrganizationId = officeSnap.exists
    ? cleanText(officeSnap.data()?.organizationId || officeSnap.data()?.groupId, "", 80)
    : "";

  if (currentOrganizationId && currentOrganizationId !== organizationId) {
    throw new HttpsError("failed-precondition", "An existing office cannot be moved to another organization.");
  }

  const payload = {
    schemaVersion: 1,
    name,
    active,
    officeId,
    organizationId,
    groupId: organizationId,
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUid: caller.uid,
    updatedByName: caller.name || caller.email || ""
  };

  if (!officeSnap.exists) {
    payload.createdAt = FieldValue.serverTimestamp();
    payload.createdByUid = caller.uid;
    payload.createdByName = caller.name || caller.email || "";
  }

  const batch = db.batch();
  batch.set(officeRef, payload, { merge: true });
  queueAdminAuditLog(batch, {
    action: officeSnap.exists ? "office.updated" : "office.created",
    actor: caller,
    targetType: "office",
    targetId: officeId,
    operation: officeSnap.exists ? "update" : "create",
    targetOrganizationId: organizationId,
    targetOfficeId: officeId,
    targetState: active ? "active" : "inactive",
    changedFields: ["name", "active", "organizationId"]
  });
  await batch.commit();

  return { id: officeId, name, active, organizationId, saved: true };
});

exports.createOfficeAdminAccount = onCall({
  region: "asia-northeast1",
  invoker: "public",
  maxInstances: 2,
  timeoutSeconds: 30
}, async (request) => {
  const caller = await assertCallerIsGlobalAdmin(request);
  const data = request.data || {};
  const organizationId = cleanEntityId(data.organizationId, "Organization ID");
  const officeId = cleanEntityId(data.officeId, "Office ID");
  const email = cleanEmail(data.email);
  const password = cleanPassword(data.password);
  const name = cleanText(data.name, "", 80);
  const nameKana = cleanNameKana(data.nameKana);

  if (!name) {
    throw new HttpsError("invalid-argument", "Name is required.");
  }

  const [organizationSnap, officeSnap] = await Promise.all([
    db.collection("organizations").doc(organizationId).get(),
    db.collection("offices").doc(officeId).get()
  ]);

  if (!organizationSnap.exists || !officeSnap.exists) {
    throw new HttpsError("failed-precondition", "Organization or office was not found.");
  }

  const officeData = officeSnap.data() || {};
  const officeOrganizationId = officeData.organizationId || officeData.groupId || "";

  if (officeOrganizationId !== organizationId) {
    throw new HttpsError("failed-precondition", "Office does not belong to the selected organization.");
  }

  let userRecord = null;

  try {
    userRecord = await auth.createUser({
      email,
      password,
      displayName: name,
      disabled: false,
      emailVerified: false
    });
  } catch (error) {
    if (error?.code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "This email address is already registered.");
    }

    logger.error("Office admin Auth creation failed", error);
    throw new HttpsError("internal", "Failed to create office admin Auth user.");
  }

  const userRef = db.collection("users").doc(userRecord.uid);
  const updatedByName = caller.name || caller.email || "";

  try {
    await userRef.set({
      name,
      nameKana,
      sortName: buildUserSortName(nameKana, name || email),
      email,
      role: "admin",
      accessScope: "office",
      active: true,
      organizationId,
      officeId,
      groupId: organizationId,
      weeklyReportStartWeek: getWeeklyReportStartWeekIdForRegistrationDate(new Date()),
      authCreatedByAdmin: true,
      createdAt: FieldValue.serverTimestamp(),
      createdByUid: caller.uid,
      createdByName: updatedByName,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid: caller.uid,
      updatedByName
    });
  } catch (error) {
    logger.error("Office admin profile creation failed", { uid: userRecord.uid, error });

    try {
      await userRef.delete();
      await auth.deleteUser(userRecord.uid);
    } catch (rollbackError) {
      logger.error("Office admin rollback failed", { uid: userRecord.uid, error: rollbackError });
    }

    throw new HttpsError("internal", "Auth user was created, but office admin profile creation failed.");
  }

  return {
    uid: userRecord.uid,
    email,
    organizationId,
    officeId,
    accessScope: "office",
    created: true
  };
});

exports.migrateLegacyOfficeIdToEnzineChiba = onCall({
  region: "asia-northeast1",
  invoker: "public",
  maxInstances: 1,
  timeoutSeconds: 120
}, async (request) => {
  const caller = await assertCallerIsGlobalAdmin(request);
  const oldOfficeId = "engine_chiba";
  const newOfficeId = DEFAULT_OFFICE_ID;
  const updatedByName = caller.name || caller.email || "";

  if (oldOfficeId === newOfficeId) {
    throw new HttpsError("failed-precondition", "Old and new office IDs are the same.");
  }

  const counts = {
    users: await updateOfficeIdForCollection("users", oldOfficeId, newOfficeId),
    monthlySchedules: await updateOfficeIdForCollection("monthlySchedules", oldOfficeId, newOfficeId),
    weeklyReports: await updateOfficeIdForCollection("weeklyReports", oldOfficeId, newOfficeId),
    weeklyReportStatus: await updateOfficeIdForCollection("weeklyReportUserStatus", oldOfficeId, newOfficeId),
    monthlyAnnouncements: await copyMonthlyAnnouncementsToNewOffice(oldOfficeId, newOfficeId),
    workshopResources: await copyWorkshopResourcesToNewOffice(oldOfficeId, newOfficeId)
  };

  counts.activeUsers = await rebuildActiveUsers({
    officeId: newOfficeId,
    groupId: caller.groupId || DEFAULT_GROUP_ID,
    updatedByUid: caller.uid,
    updatedByName
  });

  await db.collection("system").doc("officeIdMigration_engine_to_enzine_chiba").set({
    from: oldOfficeId,
    to: newOfficeId,
    counts,
    executedAt: FieldValue.serverTimestamp(),
    executedByUid: caller.uid,
    executedByName: updatedByName
  }, { merge: true });

  await appendAdminAuditLog({
    action: "office_id.migrated",
    actor: caller,
    targetType: "office",
    targetId: newOfficeId,
    operation: "migrate",
    targetOrganizationId: caller.organizationId,
    targetOfficeId: newOfficeId,
    changedFields: ["officeId"]
  });

  logger.info("Office ID migration completed", {
    from: oldOfficeId,
    to: newOfficeId,
    counts,
    uid: caller.uid
  });

  return {
    from: oldOfficeId,
    to: newOfficeId,
    counts
  };
});

exports.auditManagedUserWrite = onDocumentWrittenWithAuthContext({
  region: "asia-northeast1",
  document: "users/{userId}",
  maxInstances: 2,
  retry: false
}, async (event) => {
  const change = event.data;
  if (!change) {
    return;
  }

  const beforeExists = change.before.exists;
  const afterExists = change.after.exists;
  const beforeData = beforeExists ? change.before.data() || {} : {};
  const afterData = afterExists ? change.after.data() || {} : {};
  const actorUid = resolveAuditActorUid(event, beforeData, afterData);
  const actor = await getAuditActor(actorUid, beforeData, afterData);

  if (!actor) {
    logger.info("Managed user audit skipped because no active admin actor was resolved", {
      authType: event.authType || "unknown",
      operation: getAuditOperation(beforeExists, afterExists)
    });
    return;
  }

  const targetData = afterExists ? afterData : beforeData;
  const operation = getAuditOperation(beforeExists, afterExists);
  await appendAdminAuditLog({
    action: `user.${operation}`,
    actor,
    targetType: "user",
    targetId: event.params.userId,
    operation,
    targetOrganizationId: targetData.organizationId || targetData.groupId || "",
    targetOfficeId: targetData.officeId || "",
    targetRole: targetData.role || "",
    targetState: targetData.active === true ? "active" : "inactive",
    changedFields: getAuditChangedFields(beforeData, afterData, AUDITED_USER_FIELDS),
    source: event.authType || "unknown"
  });
});

exports.auditBillingSafetyWrite = onDocumentWrittenWithAuthContext({
  region: "asia-northeast1",
  document: "system/billingSafety",
  maxInstances: 1,
  retry: false
}, async (event) => {
  const change = event.data;
  if (!change) {
    return;
  }

  const beforeExists = change.before.exists;
  const afterExists = change.after.exists;
  const beforeData = beforeExists ? change.before.data() || {} : {};
  const afterData = afterExists ? change.after.data() || {} : {};
  const actorUid = resolveAuditActorUid(event, beforeData, afterData);
  const actor = await getAuditActor(actorUid, beforeData, afterData);

  if (!actor || actor.accessScope !== "global") {
    logger.info("Billing safety audit skipped because no active global admin actor was resolved", {
      authType: event.authType || "unknown",
      operation: getAuditOperation(beforeExists, afterExists)
    });
    return;
  }

  const targetData = afterExists ? afterData : beforeData;
  const operation = getAuditOperation(beforeExists, afterExists);
  const targetState = targetData.locked === true
    ? "locked"
    : targetData.warning === true || targetData.level === "warning"
      ? "warning"
      : operation === "delete" ? "deleted" : "normal";
  await appendAdminAuditLog({
    action: `billing_safety.${operation}`,
    actor,
    targetType: "system",
    targetId: "billingSafety",
    operation,
    targetState,
    changedFields: getAuditChangedFields(beforeData, afterData, AUDITED_BILLING_FIELDS),
    source: event.authType || "unknown"
  });
});

exports.getChatworkConsoleData = chatworkFunctions.getChatworkConsoleData;
exports.getChatworkWeeklyReportMissingGroup = chatworkFunctions.getChatworkWeeklyReportMissingGroup;
exports.saveChatworkIntegrationConfig = chatworkFunctions.saveChatworkIntegrationConfig;
exports.sendChatworkMessage = chatworkFunctions.sendChatworkMessage;
