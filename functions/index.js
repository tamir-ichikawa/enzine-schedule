const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();
const FieldValue = admin.firestore.FieldValue;

const DEFAULT_OFFICE_ID = "enzine_chiba";
const LEGACY_OFFICE_IDS = ["engine_chiba"];
const DEFAULT_GROUP_ID = "enzine";
const ACTIVE_USERS_DOC_ID = "activeUsers";
const WEEKLY_REPORT_START_WEEK = "2026-06-15";
const JST_OFFSET_MINUTES = 9 * 60;
const VALID_ROLES = new Set(["user", "staff", "admin"]);

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

async function assertCallerIsAdmin(request) {
  const callerUid = request.auth?.uid;

  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Login is required.");
  }

  const callerSnap = await db.collection("users").doc(callerUid).get();

  if (!callerSnap.exists) {
    throw new HttpsError("permission-denied", "Caller profile was not found.");
  }

  const callerData = callerSnap.data() || {};

  if (callerData.active !== true || callerData.role !== "admin") {
    throw new HttpsError("permission-denied", "Only active admins can create users.");
  }

  return {
    uid: callerUid,
    name: callerData.name || request.auth.token?.email || "",
    email: callerData.email || request.auth.token?.email || "",
    officeId: normalizeOfficeId(callerData.officeId || DEFAULT_OFFICE_ID),
    groupId: callerData.groupId || DEFAULT_GROUP_ID
  };
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

  return {
    id: docSnap.id,
    uid: docSnap.id,
    name: data.name || data.email || "名前未設定",
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

  users.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ja"));

  await db.collection("system").doc(ACTIVE_USERS_DOC_ID).set({
    officeId,
    groupId,
    users,
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUid,
    updatedByName
  }, { merge: true });

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
  const role = cleanRole(data.role);
  const active = data.active !== false;
  const officeId = normalizeOfficeId(data.officeId || caller.officeId);
  const groupId = cleanText(data.groupId, caller.groupId, 80);
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
      email,
      role,
      active,
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

exports.migrateLegacyOfficeIdToEnzineChiba = onCall({
  region: "asia-northeast1",
  invoker: "public",
  maxInstances: 1,
  timeoutSeconds: 120
}, async (request) => {
  const caller = await assertCallerIsAdmin(request);
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
